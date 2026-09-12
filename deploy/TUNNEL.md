# 临时部署（Cloudflare Quick Tunnel + serveo SSH 备胎）— 这个月没域名时用

> 适合"现在就要让同事访问、但域名/备案还没下来"的场景。**不替代** `DEPLOY.md` 里的正式方案——下个月域名下来后请切回 nginx + VPS。

## 一句话总结

跑一个脚本，启动后端 + 前端反向代理，再开一个公网隧道，**给你一个 HTTPS 公开 URL**，发给同事就能访问。同一个 URL 既给浏览器，也给小程序 `/api/open/*` 用。

**全程零成本**：无服务器、无域名、无备案、无客户端。**唯一要求**：你的电脑要一直开着。

---

## 方案 A：Cloudflare Quick Tunnel（推荐）

需要先装一个 20MB 的 `cloudflared` 客户端。Windows 最快装法：

```powershell
winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements --silent
```

或浏览器下载：<https://github.com/cloudflare/cloudflared/releases/latest> → 选 `cloudflared-windows-amd64.exe`，放任意目录加入 PATH。

验证：

```powershell
cloudflared --version
```

### 启动

任选一种：

```powershell
# PowerShell（先 cd 到项目根目录）
cd E:\claude\vue-admin
.\deploy\start-tunnel.ps1
```

```batch
# cmd / 双击（不受 PowerShell PATH 限制，最稳）
.\deploy\start-tunnel.bat
```

```powershell
# 或直接绝对路径
& "E:\claude\vue-admin\deploy\start-tunnel.ps1"
```

脚本会：
1. 清理端口 4000 / 8080 占用
2. 构建前端（缺 `dist/` 时自动跑 `npm run build`）
3. 后台启动 `node backend/server.js`（日志 → `deploy/logs/backend.log`）
4. 后台启动 `node deploy/proxy.js`（日志 → `deploy/logs/proxy.log`）
5. 前台启动 cloudflared，**输出 `https://xxx.trycloudflare.com` URL**

把 URL 发给同事 = 登录页。

> 小程序联调：`utils/config.js` 的 `API_BASE` 改成那个 URL，体验版扫码即可。

### 停止

任选一种：

```powershell
.\deploy\stop-tunnel.ps1   # PowerShell
.\deploy\stop-tunnel.bat   # cmd / 双击
```

---

## 方案 B：serveo.net SSH 隧道（零安装备胎）

如果 cloudflared 装不上（公司网络拦截 winget/GitHub），Windows 自带 OpenSSH：

```powershell
# 启动后端 + 代理（和方案 A 一样的两步）
node backend/server.js                # 终端 A
node deploy/proxy.js                  # 终端 B

# 终端 C：开隧道（首次会让你确认 host key + 选密码/免密）
ssh -o StrictHostKeyChecking=accept-new -R 0:localhost:8080 serveo.net
```

或者直接跑 `start-tunnel.bat` / `start-tunnel.ps1`，脚本会自动探测并切换。

serveo 会输出 `https://xxxx.serveo.net`，发给同事即可。

缺点：URL 每次启动变；偶尔因 serveo 限速连不上要重试几次。

---

## 架构

```
[同事浏览器 / 小程序]
        │
        ▼  https://xxx.trycloudflare.com（或 .serveo.net）
[Cloudflare Edge / serveo.net]（自动 HTTPS）
        │
        ▼  隧道长连接
[你的电脑]
  ├─ :8080 反向代理 (deploy/proxy.js)
  │    ├─ /         → dist/index.html（SPA 静态）
  │    ├─ /assets/* → dist/assets/*
  │    └─ /api/*  /uploads/* → :4000 后端
  └─ :4000 Node 后端（Express + SQLite）
```

## 日志与排错

- `deploy/logs/backend.log` / `backend.log.err` — 后端输出
- `deploy/logs/proxy.log` / `proxy.log.err` — 代理输出
- cloudflared / serveo 的连接状态在终端前台实时显示

| 现象 | 处理 |
|---|---|
| URL 打不开 | 看终端隧道是否还在连；防火墙放行 `cloudflared.exe` / 允许 SSH 出站 |
| 接口 502 | 后端没起，看 `backend.log.err`；或端口 4000 被占 |
| 小程序报"不在 request 合法域名" | 微信开发者工具勾选"不校验合法域名"；或等下个月域名备案后正式联调 |
| 想换成 HTTPS 真域名 | 见 `DEPLOY.md`（nginx + certbot） |

## 持久化 URL（可选，避免每次变）

Quick Tunnel 和 serveo 的 URL 每次启动都变。需要稳定 URL，30 秒升级到 Cloudflare Named Tunnel：

```powershell
cloudflared tunnel login                  # 浏览器登录 Cloudflare 账号（不需要自有域名）
cloudflared tunnel create vue-admin
cloudflared tunnel route dns vue-admin <子域>.trycloudflare.com
cloudflared tunnel run vue-admin
```

## 下月切正式方案时

1. 买服务器、域名、备案（`DEPLOY.md §0`）
2. 把 `nginx.conf` + `deploy.sh` 上服务器跑一遍
3. 把同事访问地址换成 `https://你的域名`
4. 这个临时方案所有文件保留——出差路上临时分享也好用