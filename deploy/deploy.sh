#!/usr/bin/env bash
# 一键部署脚本：本地 → 服务器
# 前置：本地已 ssh 免密能登服务器；服务器已装 Node 22 + nginx + pm2
# 用法：  bash deploy/deploy.sh
set -euo pipefail

# ===== 按你的真实环境修改这两行 =====
SERVER="user@your.server.ip"        # 服务器 SSH 地址（如 root@1.2.3.4）
REMOTE_DIR="/var/www/vue-admin"     # 服务器上的项目根目录
# ===================================

LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SSH="ssh $SERVER"

echo ">> [1/3] 同步源码到 $SERVER:$REMOTE_DIR"
# 排除：依赖、构建产物、本地构建检查残留、上传目录、数据库、日志
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'dist_check' \
  --exclude 'dist_check_qd' \
  --exclude 'dist_chk_*' \
  --exclude 'uploads' \
  --exclude '.git' \
  --exclude '*.log' \
  --exclude 'data/*.db*' \
  "$LOCAL_DIR/" "$SERVER:$REMOTE_DIR/"

echo ">> [2/3] 远端：安装依赖 + 构建前端 + 启动/重载后端"
$SSH bash -s <<REMOTE
set -e
cd $REMOTE_DIR

# 前端：安装 + 构建
npm install
npm run build

# 后端：安装依赖 + pm2 守护（首次 start，之后 reload）
cd $REMOTE_DIR/backend
npm install --production
pm2 reload vue-admin-backend 2>/dev/null || pm2 start $REMOTE_DIR/deploy/ecosystem.config.cjs
pm2 save
echo "remote done"
REMOTE

echo ">> [3/3] 完成。浏览器访问 https://your.domain.com"
echo "   若首页空白：检查 nginx（sudo nginx -t / sudo systemctl status nginx）"
echo "   若接口 502：检查 pm2（pm2 logs vue-admin-backend）"
