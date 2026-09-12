@echo off
REM ============================================
REM   vue-admin 临时部署隧道启动器（带日志诊断版）
REM   双击后所有输出都会写到 deploy\logs\run.log
REM   同时 cmd 窗口里也会显示，方便看进度
REM ============================================
setlocal
chcp 65001 >nul
title vue-admin tunnel (diag)

if not exist "deploy\logs" mkdir "deploy\logs" 2>nul
set "LOG=%~dp0logs\run.log"
echo. > "%LOG%"
echo [run] start at %date% %time% >> "%LOG%"

cd /d "%~dp0.."
set "ROOT=%CD%"
echo ============================================ >> "%LOG%"
echo   ROOT = %ROOT% >> "%LOG%"
echo ============================================ >> "%LOG%"

echo ============================================
echo   vue-admin 临时部署隧道启动器
echo   ROOT = %ROOT%
echo ============================================
echo   [日志]  %LOG%
echo ============================================
echo.

REM 1. node/npm
where node >nul 2>&1
if errorlevel 1 (
  echo [FAIL] 找不到 node.exe >> "%LOG%"
  echo [FAIL] 找不到 node.exe，请先安装 Node.js
  goto :end
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [FAIL] 找不到 npm >> "%LOG%"
  echo [FAIL] 找不到 npm，请先安装 Node.js
  goto :end
)
echo [OK] node/npm 已安装 >> "%LOG%"
echo [OK] node/npm 已安装

REM 2. dist/
if not exist "dist\index.html" (
  echo [INFO] dist/ 不存在，先构建 >> "%LOG%"
  echo [INFO] dist/ 不存在，先构建（首次约 1 分钟）...
  call npm run build >> "%LOG%" 2>&1
  if errorlevel 1 (
    echo [FAIL] npm run build 失败 >> "%LOG%"
    echo [FAIL] npm run build 失败
    goto :end
  )
)
echo [OK] 前端静态已就绪 >> "%LOG%"
echo [OK] 前端静态已就绪

REM 3. 端口清理
for %%P in (4000 8080) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr ":[%%P] " ^| findstr "LISTENING"') do (
    echo [INFO] 端口 %%P 被 PID %%I 占用，停掉 >> "%LOG%"
    taskkill /F /PID %%I >nul 2>&1
  )
)
ping -n 2 127.0.0.1 >nul

REM 4. 后端
echo [INFO] 启动后端 :4000 ... >> "%LOG%"
echo [INFO] 启动后端 :4000 ...
start "backend" /min cmd /c "node backend\server.js > deploy\logs\backend.log 2>&1"
ping -n 3 127.0.0.1 >nul

node -e "var r=require('http').get('http://127.0.0.1:4000/',function(){process.exit(0)}); r.setTimeout(5000,function(){r.destroy();process.exit(1)}); r.on('error',function(){process.exit(1)})" >nul 2>&1
if errorlevel 1 (
  echo [FAIL] 后端启动失败 >> "%LOG%"
  echo [FAIL] 后端启动失败，看 deploy\logs\backend.log
  type "%ROOT%\deploy\logs\backend.log" 2>nul
  goto :end
)
echo [OK] 后端就绪 >> "%LOG%"
echo [OK] 后端就绪

REM 5. 代理
echo [INFO] 启动反向代理 :8080 ... >> "%LOG%"
echo [INFO] 启动反向代理 :8080 ...
start "proxy" /min cmd /c "node deploy\proxy.js > deploy\logs\proxy.log 2>&1"
ping -n 2 127.0.0.1 >nul
echo [OK] 代理就绪 >> "%LOG%"
echo [OK] 代理就绪

REM 6. cloudflared
set "CF="
if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe"        set "CF=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not defined CF if exist "%ProgramFiles%\cloudflared\cloudflared.exe"         set "CF=%ProgramFiles%\cloudflared\cloudflared.exe"
if not defined CF if exist "%LOCALAPPDATA%\Programs\cloudflared\cloudflared.exe" set "CF=%LOCALAPPDATA%\Programs\cloudflared\cloudflared.exe"
if not defined CF if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\cloudflared.exe" set "CF=%LOCALAPPDATA%\Microsoft\WindowsApps\cloudflared.exe"
if not defined CF for /f "delims=" %%I in ('where cloudflared 2^>nul') do if not defined CF set "CF=%%I"

echo. >> "%LOG%"
if defined CF (
  echo [OK] cloudflared: %CF% >> "%LOG%"
  echo [OK] cloudflared: %CF%
  echo ============================================
  echo   启动 Cloudflare Quick Tunnel
  echo   把下面出现的 https://*.trycloudflare.com 发给同事
  echo   按 Ctrl+C 关闭隧道
  echo ============================================
  "%CF%" tunnel --no-autoupdate --url http://127.0.0.1:8080
) else (
  echo [WARN] 没找到 cloudflared  >> "%LOG%"
  echo [WARN] 没找到 cloudflared → 用 serveo SSH 备胎
  echo ============================================
  echo   首次会问 host key 信任 + 认证，照提示回车/yes
  echo   把下面出现的 https://*.serveo.net 发给同事
  echo   按 Ctrl+C 关闭隧道
  echo ============================================
  ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -R 0:localhost:8080 serveo.net
)

:end
echo.
echo ============================================
echo   进程已退出。
echo   完整日志：%LOG%
echo   复制这窗口的所有内容发我，方便诊断。
echo ============================================
echo [run] end at %time% >> "%LOG%"
pause
endlocal