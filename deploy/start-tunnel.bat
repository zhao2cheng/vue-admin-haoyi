@echo off
REM 同 deploy\start-tunnel.ps1 的纯 batch 版本，避免 PowerShell 路径加载问题
REM 双击运行，或在 cmd/PowerShell 中执行 .\deploy\start-tunnel.bat
chcp 65001 >nul
cd /d "%~dp0.."
set "ROOT=%CD%"
echo Root: %ROOT%

REM 确保 dist 已构建
if not exist "dist\index.html" (
  echo [INFO] dist/ 不存在，先构建...
  call npm run build
  if errorlevel 1 goto :fail
)

REM 端口冲突处理
for %%P in (4000 8080) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr ":[%%P] " ^| findstr "LISTENING"') do (
    echo [WARN] 端口 %%P 被 PID %%I 占用，停掉...
    taskkill /F /PID %%I >nul 2>&1
  )
)

REM 启动日志目录
if not exist "deploy\logs" mkdir "deploy\logs"

REM 启后端
echo [INFO] 启动后端 (:4000) ...
start /b "" node "backend\server.js" > "deploy\logs\backend.log" 2> "deploy\logs\backend.log.err"

REM 启反向代理
echo [INFO] 启动反向代理 (:8080) ...
start /b "" node "deploy\proxy.js" > "deploy\logs\proxy.log" 2> "deploy\logs\proxy.log.err"

REM 等后端就绪
ping -n 3 127.0.0.1 >nul

REM 找 cloudflared
set "CF="
if exist "E:\claude\binaries\cloudflared.exe"        set "CF=E:\claude\binaries\cloudflared.exe"
if not defined CF if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\cloudflared.exe" set "CF=%LOCALAPPDATA%\Microsoft\WindowsApps\cloudflared.exe"
if not defined CF if exist "%ProgramFiles%\cloudflared\cloudflared.exe"          set "CF=%ProgramFiles%\cloudflared\cloudflared.exe"
if not defined CF where cloudflared >nul 2>&1 && for /f "delims=" %%I in ('where cloudflared') do set "CF=%%I"

if defined CF (
  echo [INFO] cloudflared: %CF%
  echo [INFO] 启动 Cloudflare Quick Tunnel ...
  echo [INFO] 把下面 https://*.trycloudflare.com 的网址发给同事
  ""%CF%" tunnel --no-autoupdate --url http://127.0.0.1:8080
  goto :eof
)

REM 备胎方案: serveo SSH
echo [WARN] 未找到 cloudflared，改用 serveo SSH 备胎（Windows 自带 OpenSSH）
echo [INFO] 首次运行会问 host key 信任 + 用户认证，照提示回车/yes
echo [INFO] 把下面 https://*.serveo.net 的网址发给同事
ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -R 0:localhost:8080 serveo.net
goto :eof

:fail
echo [FAIL] 构建失败，请检查 node/npm
exit /b 1
