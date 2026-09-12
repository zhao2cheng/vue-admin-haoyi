#!/usr/bin/env bash
set +e
pkill -f 'backend/server.js'
pkill -f 'deploy/proxy.js'
pkill -f 'cloudflared tunnel'
echo '✅ 已清理'