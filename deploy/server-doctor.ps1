# ============================================================
# 服务器体检 + 自动修复（vue-admin 部署后 502 排查用）
# 作用：ssh 连上服务器，检查后端进程/nginx/node，自动尝试拉起后端
# ============================================================
$ErrorActionPreference = "Continue"
$env:NODE_OPTIONS = $null

$sshExe = "C:\Windows\System32\OpenSSH\ssh.exe"
if (-not (Test-Path $sshExe)) { $sshExe = "ssh" }

Write-Host ""
Write-Host "===== vue-admin 服务器体检 =====" -ForegroundColor Cyan
$ip = Read-Host "请输入服务器公网 IP"
if ([string]::IsNullOrWhiteSpace($ip)) { Write-Host "未输入 IP，退出" -ForegroundColor Red; exit 1 }
$user = Read-Host "登录用户（直接回车默认 root）"
if ([string]::IsNullOrWhiteSpace($user)) { $user = "root" }

# 远程诊断脚本（只读检查 + 自动修复）
$remote = @'
echo "===== 1. Node 版本 ====="
node -v 2>/dev/null || echo "!! node 未安装"
echo ""
echo "===== 2. pm2 进程状态 ====="
pm2 status 2>/dev/null || echo "!! pm2 未安装或没起来"
echo ""
echo "===== 3. 后端端口 4000 探测 ====="
curl -s -o /dev/null -w "本机访问后端: HTTP %{http_code}\n" --max-time 5 http://127.0.0.1:4000/api/health || echo "!! 后端端口不通（这就是 502 的原因）"
echo ""
echo "===== 4. nginx 状态 ====="
systemctl is-active nginx 2>/dev/null || echo "!! nginx 未运行"
echo ""
echo "===== 5. 后端最近日志（最后 25 行）====="
tail -n 25 /root/.pm2/logs/vue-admin-backend-out.log 2>/dev/null
tail -n 25 /root/.pm2/logs/vue-admin-backend-error.log 2>/dev/null
echo ""
echo "===== 6. 尝试自动修复 ====="
cd /var/www/vue-admin/backend 2>/dev/null && {
  pm2 delete vue-admin-backend >/dev/null 2>&1
  PORT=4000 NODE_ENV=production pm2 start server.js --name vue-admin-backend --time >/dev/null 2>&1
  pm2 save >/dev/null 2>&1
  sleep 3
  curl -s -o /dev/null -w "修复后再次探测后端: HTTP %{http_code}  (200/401 = 成功)\n" --max-time 5 http://127.0.0.1:4000/api/health
} || echo "!! /var/www/vue-admin 不存在，说明部署没完成"
'@

Write-Host ""
Write-Host ">> 连接 $user@$ip 执行体检（输入密码时屏幕不显示）..." -ForegroundColor Cyan
Write-Host ""
& $sshExe -o StrictHostKeyChecking=accept-new "${user}@${ip}" "bash -s" $remote
$code = $LASTEXITCODE
Write-Host ""
if ($code -eq 0) {
    Write-Host "===== 体检完成，把上面全部输出截图发给助手 =====" -ForegroundColor Green
} else {
    Write-Host "!! 连接失败（返回码 $code）：检查 IP 是否正确、密码是否输对" -ForegroundColor Red
}
