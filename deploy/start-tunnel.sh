#!/usr/bin/env bash
# Cloudflare Quick Tunnel 启动脚本（Linux / macOS）
# 用法：bash deploy/start-tunnel.sh
# 停止：bash deploy/stop-tunnel.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/deploy/logs"
mkdir -p "$LOG_DIR"

# 找 cloudflared
CF="$(command -v cloudflared || true)"
if [ -z "$CF" ] && [ -x "$HOME/bin/cloudflared" ]; then CF="$HOME/bin/cloudflared"; fi
if [ -z "$CF" ]; then
  echo "⚠️  未找到 cloudflared — 改用 serveo SSH 备胎方案" >&2
  echo "   （系统自带 OpenSSH，免安装）" >&2
  echo "   把下面出现的 https://*.serveo.net 网址发给同事访问" >&2
  exec ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -R 0:localhost:8080 serveo.net
fi
echo "✅ cloudflared: $CF"

# 确保 dist/ 已构建
[ -f dist/index.html ] || { echo '📦 构建前端...' >&2; npm run build; }

# 杀占用端口
for p in 4000 8080; do
  pid="$(lsof -ti :$p 2>/dev/null || true)"
  [ -n "$pid" ] && { echo "⚠️  停旧进程 $pid (port $p)" >&2; kill -9 $pid || true; }
done

# 后端
echo '🚀 启动后端 (:4000)...' >&2
nohup node backend/server.js >"$LOG_DIR/backend.log" 2>&1 &
sleep 2

# 代理
echo '🚀 启动反向代理 (:8080)...' >&2
nohup node deploy/proxy.js >"$LOG_DIR/proxy.log" 2>&1 &
sleep 2

# 探活
code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/api/auth/login -X POST -H 'content-type: application/json' -d '{}')"
echo "✅ 后端就绪 (HTTP $code)"

echo '🌐 启动 Cloudflare Quick Tunnel...' >&2
echo '   把下面的 https://*.trycloudflare.com 网址发给同事访问' >&2
exec "$CF" tunnel --no-autoupdate --url http://127.0.0.1:8080