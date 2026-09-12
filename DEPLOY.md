# 部署 Runbook（对外访问 + 微信小程序）

> 形态：**Linux + nginx + pm2**（已按此产出全部配置在 `deploy/`）。  
> 当前状态：**代码侧已就绪，待你买服务器 + 域名备案 + 小程序注册后照本 runbook 执行**。



---

## 0. 前置资源（长周期，先启动）

| 资源          | 说明                                          | 周期    |
| ----------- | ------------------------------------------- | ----- |
| 云服务器        | 2C2G 起（阿里云/腾讯云），装 **Node 22 + nginx + pm2** | 当天    |
| 域名 + ICP 备案 | 国内强制备案，小程序也要求「已备案 HTTPS 域名」                 | 数天~数周 |
| 微信小程序       | mp.weixin.qq.com 注册拿 AppID（建议企业/个体工商户资质）    | 1~数天  |

> ⚠️ **小程序不认 IP / 自签证书**，必须真域名 + 备案 + HTTPS，故小程序联调要等备案下来。  
> 网页端管理后台可先用服务器公网 IP + 自签证书测试。

---

## 1. 已完成的代码改动（无需你再改）

- ✅ `backend/server.js` 上传地址由写死 `http://` 改为：优先 `PUBLIC_BASE_URL`（env），否则按 nginx 透传的 `X-Forwarded-Proto` 推导 **https**。→ 不修则小程序图片全挂，已修。
- ✅ 前端 `axios` 的 `baseURL` 已是相对 `/api`，**网页端无需改代码**，构建即部署。
- ✅ 前端已构建出 `dist/`（vite build 通过）。

---

## 2. 已产出的配置文件（`deploy/` 目录，域名均用 `your.domain.com` 占位）

| 文件                            | 用途                                                                       |
| ----------------------------- | ------------------------------------------------------------------------ |
| `deploy/.env.example`         | env 变量样例（复制为 `.env` 填真实值）                                                |
| `deploy/nginx.conf`           | 443 TLS + 静态托管 dist/ + 反代 `/api` `/api/open` `/uploads` → 127.0.0.1:4000 |
| `deploy/ecosystem.config.cjs` | pm2 守护后端（单实例，SQLite 单写）                                                  |
| `deploy/deploy.sh`            | 本地 → 服务器一键同步 + 构建 + 重载                                                   |

> 全局替换 `your.domain.com` 为你的真实域名即可。

---

## 3. 服务器初始化（一次性）

```bash
# 以 Ubuntu/Debian 为例
sudo apt update && sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
sudo mkdir -p /var/www/vue-admin /var/www/certbot
```

---

## 4. 部署（拿代码上服务器）

**方式 A — 一键脚本（推荐）**

1. 改 `deploy/deploy.sh` 顶部两行：`SERVER="user@你的服务器IP"`、`REMOTE_DIR="/var/www/vue-admin"`
2. 本地执行：`bash deploy/deploy.sh`
3. 脚本会同步源码、远端 `npm install` + 构建前端 + `pm2 start`（首次）或 `reload`

**方式 B — 手动**

```bash
# 本地把代码传上去（排除 node_modules/dist*/uploads/数据库）
rsync -az --delete --exclude node_modules --exclude dist --exclude 'dist_*' \
  --exclude uploads --exclude data/*.db* ./ user@服务器IP:/var/www/vue-admin/

# 服务器上
cd /var/www/vue-admin && npm install && npm run build
cd /var/www/vue-admin/backend && npm install --production
cd /var/www/vue-admin && pm2 start deploy/ecosystem.config.cjs && pm2 save
```

---

## 5. nginx + HTTPS 证书

```bash
# 放配置
sudo cp deploy/nginx.conf /etc/nginx/sites-available/vue-admin
sudo ln -s /etc/nginx/sites-available/vue-admin /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 申请免费证书（certbot，把 your.domain.com 换成你真实的，且已解析到本机）
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your.domain.com
# 成功后 certbot 自动改写 nginx.conf 补全 ssl_certificate 路径，再次：
sudo nginx -t && sudo systemctl reload nginx

# 自动续期（cron 已默认装好，可验证）
sudo certbot renew --dry-run
```

> ⚠️ 申请证书前必须：①域名已解析到服务器 IP；②nginx 已加载（80 端口可访问）。

---

## 6. 验证上线

```bash
# 后端进程
pm2 status            # 应见 vue-admin-backend online
pm2 logs vue-admin-backend

# 链路（应返回 401=鉴权生效=通）
curl -k https://your.domain.com/api/rows/products

# 网页端：浏览器打开 https://your.domain.com ，登录后台
```

---

## 7. 小程序联调（等备案后）

- 微信公众平台 → 开发设置 → 服务器域名：`request` / `uploadFile` / `downloadFile` 全填 `https://your.domain.com`
- 小程序代码（不在本仓库，在别处）`baseURL` 改为 `https://your.domain.com`，重新上传体验版
- 联调期可勾「不校验合法域名」先用真域名测
- 重点验证：小程序提交回收单 → 后台收到 → **图片在小程序内正常加载**（确认步骤 1 的 https 修复生效）

---

## 8. 运维

- 守护 + 开机自启：`pm2 startup`（按提示执行）已含 `pm2 save`
- 备份数据库：定期 `cp /var/www/vue-admin/backend/data/*.db /备份目录/`（SQLite 单文件）
- 更新上线：改完代码本地再跑 `bash deploy/deploy.sh`
- 日志：`pm2 logs` / `sudo tail -f /var/nginx/error.log`
- 容量：SQLite 单写，并发上来再考虑换 Postgres

---

## 9. 已知优化项（非阻塞）

- 前端主 chunk 1.2MB（gzip 404KB），对管理后台可接受；后续可用 `manualChunks` 拆分。
- CORS 当前为 `*`，上线后建议在 `server.js` 收紧到你的域名。
- 根目录有 `dist_chk_*` 等 44 个构建检查残留目录（被 safe-delete 拦截未删），已被 `.gitignore` 忽略、且 `deploy.sh` 已排除，不影响部署。
