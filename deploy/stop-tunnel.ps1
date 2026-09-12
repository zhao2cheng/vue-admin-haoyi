# 停掉 start-tunnel.ps1 启动的所有进程（后端 + 代理 + cloudflared）
$ErrorActionPreference = 'SilentlyContinue'
Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name ssh -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq '' -or $_.Path -match 'ssh\.exe' } | ForEach-Object {
  try { $_.Kill() } catch {}
}
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
  $_.CommandLine -match 'backend/server\.js|deploy/proxy\.js'
} | ForEach-Object {
  Write-Host "停 node PID $($_.ProcessId)" -ForegroundColor Yellow
  Stop-Process -Id $_.ProcessId -Force
}
# 兜底：按端口杀进程
foreach ($port in 4000, 8080) {
  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($c) { Stop-Process -Id $c[0].OwningProcess -Force; Write-Host "端口 $port 已停" -ForegroundColor Yellow }
}
Write-Host '✅ 已清理' -ForegroundColor Green