# ============================================================
# start-tunnel.ps1 - vue-admin 一键启动（PowerShell 版）
# 双击 deploy\start.cmd 调起，cmd 看不到本文件内容
# ============================================================

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

function Log($msg) { Write-Host $msg }
function LogFile($msg) {
    $logDir = Join-Path $root 'deploy\logs'
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    Add-Content -LiteralPath (Join-Path $logDir 'run.log') -Encoding UTF8 -Value ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg)
}

Clear-Host
Log "============================================"
Log "  vue-admin 一键启动 (Cloudflare Tunnel)"
Log "============================================"
Log ""
Log "工作目录: $root"
Log "日志文件: $root\deploy\logs\run.log"
Log ""

# ===== 1. 检查环境 =====
Log "[1/5] 检查 Node.js..."
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Log "[FAIL] 未找到 node.exe，请先安装 Node.js"
    LogFile "FAIL: node 未安装"
    Read-Host "按 Enter 退出"; exit 1
}
Log "  node: $($node.Source)"

if (-not (Test-Path "$root\dist\index.html")) {
    Log "[FAIL] 未找到 dist\index.html，请先 npm run build"
    LogFile "FAIL: dist 缺失"
    Read-Host "按 Enter 退出"; exit 1
}
Log "  dist: $root\dist\index.html 已就绪"
Log ""

# ===== 2. 清理旧进程 =====
Log "[2/5] 清理旧进程..."
$portProcs = Get-NetTCPConnection -LocalPort 4000, 8080 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $portProcs) {
    try { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } catch {}
}
$nodeProcs = Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*vue-admin*' -or $_.CommandLine -like '*vue-admin*' }
foreach ($p in $nodeProcs) {
    try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
}
Log "  完成"
Log ""

# ===== 3. 启动后端 =====
Log "[3/5] 启动后端 :4000 ..."
$backendLog = Join-Path $root 'deploy\logs\backend.log'
$backend = Start-Process -FilePath 'node' -ArgumentList 'backend\server.js' `
    -WorkingDirectory $root -RedirectStandardOutput $backendLog `
    -RedirectStandardError "$backendLog.err" -WindowStyle Hidden -PassThru
Log "  PID=$($backend.Id)，等待就绪..."
$ok = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:4000/' -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch {}
}
if (-not $ok) {
    Log "[FAIL] 后端 20 秒内未就绪，看 deploy\logs\backend.log"
    LogFile "FAIL: 后端未启动"
    Read-Host "按 Enter 退出"; exit 1
}
Log "  后端就绪"
Log ""

# ===== 4. 启动代理 =====
Log "[4/5] 启动反向代理 :8080 ..."
$proxyLog = Join-Path $root 'deploy\logs\proxy.log'
$proxy = Start-Process -FilePath 'node' -ArgumentList 'deploy\proxy.js' `
    -WorkingDirectory $root -RedirectStandardOutput $proxyLog `
    -RedirectStandardError "$proxyLog.err" -WindowStyle Hidden -PassThru
Log "  PID=$($proxy.Id)，等待就绪..."
$ok = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/' -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch {}
}
if (-not $ok) {
    Log "[FAIL] 代理 7.5 秒内未就绪，看 deploy\logs\proxy.log"
    LogFile "FAIL: 代理未启动"
    Read-Host "按 Enter 退出"; exit 1
}
Log "  代理就绪"
Log ""

# ===== 5. 启动 tunnel =====
Log "[5/5] 启动 Cloudflare Tunnel..."
$cfPaths = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\cloudflared\cloudflared.exe'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\cloudflared.exe'),
    "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe",
    "$env:ProgramFiles\cloudflared\cloudflared.exe",
    'C:\ProgramData\chocolatey\bin\cloudflared.exe'
)
$cf = $null
foreach ($p in $cfPaths) { if (Test-Path $p) { $cf = $p; break } }
if (-not $cf) {
    $w = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($w) { $cf = $w.Source }
}

$cfLog = Join-Path $root 'deploy\logs\cf.log'

if ($cf) {
    Log "  cloudflared: $cf"
    Log "  等待公网 URL 出现（最多 30 秒）..."
    $cfProc = Start-Process -FilePath $cf -ArgumentList @('tunnel','--url','http://127.0.0.1:8080','--no-autoupdate') `
        -RedirectStandardOutput $cfLog -RedirectStandardError "$cfLog.err" -WindowStyle Hidden -PassThru
    $url = $null
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 500
        if ((Test-Path $cfLog) -and (Select-String -Path $cfLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -Quiet)) {
            $m = Select-String -Path $cfLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
            $url = $m.Matches.Value
            break
        }
    }
    if ($url) {
        Log ""
        Log "============================================"
        Log "  部署成功！同事访问地址："
        Log "  $url"
        Log "============================================"
        Log ""
        Log "按 Ctrl+C 结束所有进程，或关掉本窗口"
        LogFile "OK: tunnel=$url"
        try { [Console]::Beep(800, 200) } catch {}
    } else {
        Log "[FAIL] 30 秒内未拿到 trycloudflare URL，看 deploy\logs\cf.log"
        LogFile "FAIL: tunnel 未拿到 URL"
    }
} else {
    Log "  未找到 cloudflared → 启用 serveo SSH 备胎"
    $sshLog = Join-Path $root 'deploy\logs\serveo.log'
    $sshArgs = @('-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3','-R','0:localhost:8080','-oStrictHostKeyChecking=no','serveo.net')
    $sshProc = Start-Process -FilePath 'ssh' -ArgumentList $sshArgs `
        -RedirectStandardOutput $sshLog -RedirectStandardError "$sshLog.err" -WindowStyle Hidden -PassThru
    Log "  PID=$($sshProc.Id)，等待 URL..."
    $url = $null
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 500
        if ((Test-Path $sshLog) -and (Select-String -Path $sshLog -Pattern 'https://[a-z0-9-]+\.serveo\.net' -Quiet)) {
            $m = Select-String -Path $sshLog -Pattern 'https://[a-z0-9-]+\.serveo\.net' | Select-Object -First 1
            $url = $m.Matches.Value
            break
        }
    }
    if ($url) {
        Log ""
        Log "============================================"
        Log "  部署成功（serveo 备胎）！同事访问："
        Log "  $url"
        Log "============================================"
        LogFile "OK: serveo=$url"
    } else {
        Log "[WARN] 没拿到 serveo URL，看 deploy\logs\serveo.log"
    }
}

Log ""
Log "日志: $root\deploy\logs\"
Log ""
Read-Host "按 Enter 结束（会关闭所有后台进程）"

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 7843 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
}
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process ssh -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*serveo*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Log "已清理所有后台进程"