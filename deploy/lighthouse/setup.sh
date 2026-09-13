#!/usr/bin/env bash
# ============================================================
# 腾讯云轻量应用服务器 一键部署脚本（Ubuntu 20.04 / 22.04 / 24.04）
# 用途：部署 vue-admin（前端静态 + Node 后端 + SQLite）
# 用法：tar 包上传解压后执行：  bash vue-admin-server/setup.sh
# 特性：幂等可重复执行（重新部署/更新时再跑一遍即可）
# ============================================================
set -euo pipefail

# ---------- 非 root 自动提权（网页终端默认用户也能跑） ----------
if [ "$(id -u)" != "0" ]; then
  exec sudo bash "$0" "$@"
fi

SRC="$(cd "$(dirname "$0")" && pwd)"   # tar 包解压目录（含 dist/ backend/）
APP="/var/www/vue-admin"               # 服务器上的部署目录

log() { echo -e "\e[36m==>\e[0m $*"; }

# ---------- [1/7] 基础软件 ----------
log "[1/7] 安装基础软件（nginx / curl / tar）"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx curl tar xz-utils ca-certificates

# ---------- [2/7] Node.js 22（npmmirror 国内镜像，快） ----------
log "[2/7] 安装 Node.js 22"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  CUR_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$CUR_MAJOR" -ge 22 ]; then
    NEED_NODE=0
    echo "    已有 Node $(node -v)，跳过安装"
  fi
fi
if [ "$NEED_NODE" = "1" ]; then
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) NARCH="linux-x64" ;;
    aarch64) NARCH="linux-arm64" ;;
    *) echo "!! 不支持的 CPU 架构：$ARCH"; exit 1 ;;
  esac
  FNAME="$(curl -fsSL 'https://registry.npmmirror.com/-/binary/node/latest-v22.x/' \
           | grep -o "node-v22[0-9.]*-${NARCH}\.tar\.xz" | head -1)"
  if [ -z "$FNAME" ]; then
    echo "!! 无法获取 Node 22 下载地址，请手动安装 Node 22 后重试"
    exit 1
  fi
  cd /tmp
  curl -fsSL -o node22.tar.xz "https://registry.npmmirror.com/-/binary/node/latest-v22.x/${FNAME}"
  tar -xJf node22.tar.xz
  cp -r "${FNAME%.tar.xz}/bin"  /usr/local/
  cp -r "${FNAME%.tar.xz}/lib"  /usr/local/
  cp -r "${FNAME%.tar.xz}/include" /usr/local/ 2>/dev/null || true
  cp -r "${FNAME%.tar.xz}/share" /usr/local/ 2>/dev/null || true
  hash -r
  echo "    Node 安装完成：$(node -v)"
  cd "$SRC"
fi

# ---------- [3/7] pm2 ----------
log "[3/7] 安装 pm2（进程守护）"
command -v pm2 >/dev/null 2>&1 || \
  npm install -g pm2 --registry=https://registry.npmmirror.com --no-fund --no-audit \
  || npm install -g pm2 --no-fund --no-audit

# ---------- [4/7] 部署文件 ----------
log "[4/7] 复制文件到 $APP"
mkdir -p "$APP"
# 数据保全：更新部署时保留服务器上已有的数据库与上传图片（以服务器为准）
DATA_BAK=""
if [ -f "$APP/backend/data/app.db" ] || [ -d "$APP/backend/uploads" ]; then
  DATA_BAK="$(mktemp -d /tmp/vue-admin-data.XXXXXX)"
  [ -d "$APP/backend/data" ]    && cp -r "$APP/backend/data"    "$DATA_BAK/"
  [ -d "$APP/backend/uploads" ] && cp -r "$APP/backend/uploads" "$DATA_BAK/"
  log "检测到服务器现有数据，已备份（更新不会丢账号/图片）"
fi
rm -rf "$APP/dist" "$APP/backend"
cp -r "$SRC/dist"    "$APP/dist"
cp -r "$SRC/backend" "$APP/backend"
mkdir -p "$APP/backend/logs"
if [ -n "$DATA_BAK" ]; then
  rm -rf "$APP/backend/data" "$APP/backend/uploads"
  cp -r "$DATA_BAK/data"    "$APP/backend/data"    2>/dev/null || true
  cp -r "$DATA_BAK/uploads" "$APP/backend/uploads" 2>/dev/null || true
  rm -rf "$DATA_BAK"
  log "已恢复服务器数据（本次只更新代码与前端页面）"
fi

# ---------- [5/7] 后端（pm2 守护，开机自启） ----------
log "[5/7] 启动后端（端口 4000，pm2 守护）"

# 生产密钥：首次生成随机 JWT_SECRET 并持久化（重启后登录态不失效）
ENVF="/etc/vue-admin.env"
if [ ! -f "$ENVF" ]; then
  JWT="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | md5sum | cut -d' ' -f1)"
  printf 'JWT_SECRET=%s\n' "$JWT" > "$ENVF"
  chmod 600 "$ENVF"
fi
set -a; . "$ENVF"; set +a

cd "$APP/backend"
pm2 delete vue-admin-backend >/dev/null 2>&1 || true
PORT=4000 NODE_ENV=production pm2 start server.js --name vue-admin-backend --time
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

# ---------- [6/7] nginx（80 端口对外） ----------
log "[6/7] 配置 nginx（80 端口）"
cat > /etc/nginx/sites-available/vue-admin <<'EOF'
server {
    listen 80 default_server;
    server_name _;

    # 前端静态产物（vite build 输出）
    root /var/www/vue-admin/dist;
    index index.html;
    client_max_body_size 10m;

    # SPA 路由回退：刷新子路由不 404
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端 API（含小程序开放接口 /api/open/*）
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
    }

    # 上传的图片（由后端 node 提供）
    location /uploads/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/vue-admin /etc/nginx/sites-enabled/vue-admin
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

# 系统防火墙（轻量服务器默认未启用 ufw，以防万一）
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp
fi

# ---------- [7/7] 验证 ----------
log "[7/7] 验证服务"
sleep 2
PUBIP="$(curl -fsS --max-time 3 http://metadata.tencentyun.com/latest/meta-data/public-ipv4 2>/dev/null \
         || hostname -I | awk '{print $1}')"
HOME_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1/ || true)"
API_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1/api/health || true)"

echo ""
echo "=============================================================="
echo "  部署完成！"
echo ""
echo "  访问地址：http://${PUBIP}"
echo "  首页探测：HTTP ${HOME_CODE}    /api/health：HTTP ${API_CODE:-无此接口(不影响)}"
echo ""
echo "  ※ 浏览器打不开时：去腾讯云控制台 → 轻量应用服务器 →"
echo "    「防火墙」页签，确认已放行 TCP:80 端口"
echo ""
echo "  常用命令："
echo "    pm2 logs vue-admin-backend      查看后端日志"
echo "    pm2 restart vue-admin-backend   重启后端"
echo "    更新版本：本地重新打包上传，再跑一遍本脚本即可"
echo "=============================================================="
