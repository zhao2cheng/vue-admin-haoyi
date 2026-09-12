@echo off
chcp 65001 >nul
title vue-admin tunnel status

REM 任何时候想看后端/代理在不在、谁占了端口，跑这个就行
REM 用 PowerShell 一行（零花括号 / 零转义），不用 for /f

set "ROOT=%~dp0.."
cd /d "%ROOT%" >nul 2>&1

echo ============================================
 echo   状态检查
echo   现在时间: %date% %time%
echo ============================================
echo.

echo [1/3] 后端 :4000
powershell -NoProfile -Command "$c=try{(Invoke-WebRequest 'http://127.0.0.1:4000/' -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop).StatusCode}catch{0}; if($c -eq 200){Write-Host '    OK 后端在跑（HTTP 200）'}else{Write-Host '    [DOWN] 后端不在跑'}"
echo.

echo [2/3] 代理 :8080
powershell -NoProfile -Command "$c=try{(Invoke-WebRequest 'http://127.0.0.1:8080/' -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop).StatusCode}catch{0}; if($c -eq 200){Write-Host '    OK 代理在跑（HTTP 200）'}else{Write-Host '    [DOWN] 代理不在跑'}"
echo.

echo [3/3] 端口占用（4000 / 8080）
node -e "var net=require('net');var ports=[4000,8080];ports.forEach(function(p){var s=net.createConnection(p,'127.0.0.1',function(){console.log('    端口 '+p+' : 占用中');s.end()});s.on('error',function(){console.log('    端口 '+p+' : 空闲'});s.setTimeout(2000,function(){console.log('    端口 '+p+' : 超时（不确定）');s.destroy()})})"
echo.

echo ============================================
echo   上面 [DOWN] 的项，对应跑：
echo     deploy\start-tunnel.bat   （一键启动）
echo     deploy\stop-tunnel.bat    （一键停止）
echo ============================================
pause
