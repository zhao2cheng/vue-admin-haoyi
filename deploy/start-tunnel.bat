@echo off
chcp 65001 >nul
title vue-admin tunnel

REM 双击或 ./deploy/start-tunnel.bat 调用都强制把工作目录切到项目根
cd /d "%~dp0.."
set "ROOT=%CD%"
echo ============================================
echo   vue-admin 临时部署隧道启动器
echo   ROOT = %ROOT%
echo ============================================
echo.

REM 1. 检查环境
where node >nul 2>&1 || (
  echo [FAIL] 找不到 node.exe，请先安装 Node.js
  goto :end
)
where npm >nul 2>&1 || (
  echo [FAIL] 找不到 npm，请先安装 Node.js
  goto :end
)
echo [OK] node/npm 已安装

REM 2. 确保 dist/ 已构建
if not exist "dist\index.html" (
  echo [INFO] dist/ 不存在，先构建（首次约 1 分钟）...
  call npm run build
  if errorlevel 1 (
    echo [FAIL] npm run build 失败
    goto :end
  )
)
echo [OK] 前端静态已就绪

REM 3. 端口冲突先清掉
for %%P in (4000 8080) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr ":[%%P] " ^| findstr "LISTENING"') do (
    echo [INFO] 端口 %%P 被 PID %%I 占用，停掉
    taskkill /F /PID %%I >nul 2>&1
  )
)
ping -n 2 127.0.0.1 >nul

if not exist "deploy\logs" mkdir "deploy\logs"

REM 4. 启后端
echo [INFO] 启动后端 :4000 ...
start "backend" /min cmd /c "node backend\server.js > deploy\logs\backend.log 2>&1"
ping -n 3 127.0.0.1 >nul

REM 验后端（用 Node 一行，避开 PowerShell 内联的大括号 cmd 兼容问题）
node -e "var r=require('http').get('http://127.0.0.1:4000/',function(){process.exit(0)}); r.setTimeout(5000,function(){r.destroy();process.exit(1)}); r.on('error',function(){process.exit(1)})" >nul 2>&1
if errorlevel 1 (
  echo [FAIL] 后端启动失败，看日志: %ROOT%\deploy\logs\backend.log
  type "%ROOT%\deploy\logs\backend.log" 2>nul
  goto :end
)
echo [OK] 后端就绪

REM 5. 启反向代理
echo [INFO] 启动反向代理 :8080 ...
start "proxy" /min cmd /c "node deploy\proxy.js > deploy\logs\proxy.log 2>&1"
ping -n 2 127.0.0.1 >nul
echo [OK] 代理就绪

REM 6. 找 cloudflared（按常见安装位置顺序探测，覆盖 winget / scoop / choco / 手动）
set "CF="
if exist "E:\claude\binaries\cloudflared.exe"                              set "CF=E:\claude\binaries\cloudflared.exe"
if not defined CF if exist "%LOCALAPPDATA%\Programs\cloudflared\cloudflared.exe" set "CF=%LOCALAPPDATA%\Programs\cloudflared\cloudflared.exe"
if not defined CF if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\cloudflared.exe" set "CF=%LOCALAPPDATA%\Microsoft\WindowsApps\cloudflared.exe"
if not defined CF if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe"      set "CF=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not defined CF if exist "%ProgramFiles%\cloudflared\cloudflared.exe"           set "CF=%ProgramFiles%\cloudflared\cloudflared.exe"
if not defined CF if exist "C:\ProgramData\chocolatey\bin\cloudflared.exe"        set "CF=C:\ProgramData\chocolatey\bin\cloudflared.exe"
if not defined CF for /f "delims=" %%I in ('where cloudflared 2^>nul') do if not defined CF set "CF=%%I"

echo.
if defined CF (
  echo [OK] cloudflared: %CF%
  echo ============================================
  echo   启动 Cloudflare Quick Tunnel
  echo   把下面出现的 https://*.trycloudflare.com 发给同事
  echo   按 Ctrl+C 关闭隧道
  echo ============================================
  "%CF%" tunnel --no-autoupdate --url http://127.0.0.1:8080
) else (
  echo [WARN] 没找到 cloudflared → 用 serveo SSH 备胎（Windows 自带 OpenSSH）
  echo ============================================
  echo   首次会问 host key 信任 + 认证，照提示回车/yes
  echo   把下面出现的 https://*.serveo.net 发给同事
  echo   按 Ctrl+C 关闭隧道
  echo ============================================
  ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -R 0:localhost:8080 serveo.net
)

REM 7. 隧道关了之后
echo.
echo [INFO] 隧道已关闭，问是否停掉后端 + 代理
pause

:end
echo.
echo ——窗口关了所有后台进程会一起关——
pause
