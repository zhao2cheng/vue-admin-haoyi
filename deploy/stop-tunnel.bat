@echo off
REM 停掉 start-tunnel.* 启动的所有进程（后端 + 代理 + cloudflared）
chcp 65001 >nul

REM 杀 node 子进程（后端/代理）
for /f "tokens=2 delims=," %%I in (
  'tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH'
) do (
  wmic process where "ProcessId=%%I and CommandLine like '%%backend\server.js%%'" delete >nul 2>&1
  wmic process where "ProcessId=%%I and CommandLine like '%%deploy\proxy.js%%'" delete >nul 2>&1
)

REM 杀 cloudflared
taskkill /F /IM cloudflared.exe >nul 2>&1

REM 兜底：按端口杀
for %%P in (4000 8080) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr ":[%%P] " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%I >nul 2>&1
  )
)

echo [OK] 已清理
