# Cloudflare Quick Tunnel 启动脚本（Windows / PowerShell）
# 用法：双击运行，或在 PowerShell 中执行 .\deploy\start-tunnel.ps1
# 停止：在另一个终端跑 .\deploy\stop-tunnel.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$logDir = Join-Path $root 'deploy\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# 找 cloudflared
$cf = $null
foreach ($p in @(
  'E:\claude\binaries\cloudflared.exe',
  "$env:LOCALAPPDATA\Microsoft\WindowsApps\cloudflared.exe",
  "$env:ProgramFiles\cloudflared\cloudflared.exe",
  'cloudflared'
)) { if ($p -eq 'cloudflared') { $g = Get-Command cloudflared -ErrorAction SilentlyContinue; if ($g) { $cf = $g.Source; break } } elseif (Test-Path $p) { $cf = $p; break } }

# 确保 dist/ 已构建
if (-not (Test-Path 'dist\index.html')) {
  Write-Host '📦 dist/ 不存在，先构建前端...' -ForegroundColor Yellow
  & npm run build
  if ($LASTEXITCODE -ne 0) { Write-Host '❌ 构建失败' -ForegroundColor Red; exit 1 }
}

# 检查端口
foreach ($port in 4000, 8080) {
  $used = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($used) {
    $pid = $used[0].OwningProcess
    Write-Host "⚠️  端口 $port 被 PID $pid 占用，先停掉旧实例..." -ForegroundColor Yellow
    try { Stop-Process -Id $pid -Force -ErrorAction Stop } catch { Write-Host "   停不掉，请手动处理" -ForegroundColor Red; exit 1 }
  }
}

# 启动后端
Write-Host '🚀 启动后端 (:4000)...' -ForegroundColor Cyan
$backendLog = Join-Path $logDir 'backend.log'
Start-Process -FilePath 'node' -ArgumentList 'backend/server.js' `
  -RedirectStandardOutput $backendLog -RedirectStandardError "$backendLog.err" `
  -WorkingDirectory $root -WindowStyle Hidden
Start-Sleep -Seconds 2

# 启动代理
Write-Host '🚀 启动反向代理 (:8080)...' -ForegroundColor Cyan
$proxyLog = Join-Path $logDir 'proxy.log'
Start-Process -FilePath 'node' -ArgumentList 'deploy/proxy.js' `
  -RedirectStandardOutput $proxyLog -RedirectStandardError "$proxyLog.err" `
  -WorkingDirectory $root -WindowStyle Hidden
Start-Sleep -Seconds 2

# 验证后端可达
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:4000/api/auth/login' -Method Post -Body '{}' -ContentType 'application/json' -UseBasicParsing -TimeoutSec 5
  Write-Host "✅ 后端已就绪 (HTTP $($r.StatusCode))" -ForegroundColor Green
} catch {
  Write-Host "❌ 后端启动失败，看日志: $backendLog.err" -ForegroundColor Red
  exit 1
}

if ($cf) {
  Write-Host "✅ cloudflared: $cf" -ForegroundColor Green
  Write-Host '🌐 启动 Cloudflare Quick Tunnel...' -ForegroundColor Cyan
  Write-Host '   把下面出现的 https://*.trycloudflare.com 网址发给同事即可访问' -ForegroundColor Yellow
  Write-Host ''
  & $cf tunnel --no-autoupdate --url http://127.0.0.1:8080
} else {
  Write-Host '⚠️  未找到 cloudflared — 改用 serveo SSH 备胎方案' -ForegroundColor Yellow
  Write-Host '   （Windows 自带 OpenSSH，免安装）' -ForegroundColor Yellow
  Write-Host '   首次运行会问 host key 信任 + 用户认证，照提示回车/yes 即可' -ForegroundColor Yellow
  Write-Host '   把下面出现的 https://*.serveo.net 网址发给同事即可访问' -ForegroundColor Yellow
  Write-Host ''
  ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -R 0:localhost:8080 serveo.net
}