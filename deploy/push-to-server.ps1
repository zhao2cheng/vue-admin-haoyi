# ============================================================
# 上传部署包到腾讯云服务器并一键部署（无需网页终端）
# 前置：deploy\out\vue-admin-server.tar.gz 已存在（没有就先双击 pack-server.cmd）
# 流程：输入服务器IP → scp 上传 → ssh 远程执行 setup.sh
# ============================================================
$ErrorActionPreference = "Stop"
$env:NODE_OPTIONS = $null

$root = Split-Path -Parent $PSScriptRoot
$tar  = Join-Path $PSScriptRoot "out\vue-admin-server.tar.gz"

# ssh/scp 统一用 Windows 自带的（避免走 Git 的老版本）
$sshExe = "C:\Windows\System32\OpenSSH\ssh.exe"
$scpExe = "C:\Windows\System32\OpenSSH\scp.exe"
if (-not (Test-Path $sshExe)) { $sshExe = "ssh"; $scpExe = "scp" }

Write-Host ""
Write-Host "===== vue-admin 服务器一键部署 =====" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $tar)) {
    Write-Host "!! 找不到部署包：$tar" -ForegroundColor Red
    Write-Host "   请先双击 deploy\pack-server.cmd 生成部署包，再运行本脚本" -ForegroundColor Yellow
    exit 1
}
$size = "{0:N1} MB" -f ((Get-Item $tar).Length / 1MB)

# ---------- 收集信息 ----------
$ip = Read-Host "请输入服务器公网 IP（实例列表页「公网IP」一列）"
if ([string]::IsNullOrWhiteSpace($ip)) { Write-Host "未输入 IP，退出" -ForegroundColor Red; exit 1 }
$user = Read-Host "登录用户（直接回车默认 root）"
if ([string]::IsNullOrWhiteSpace($user)) { $user = "root" }

Write-Host ""
Write-Host ">> [1/2] 上传部署包（$size）到 $user@$ip" -ForegroundColor Cyan
Write-Host "   会提示输入密码（输入时屏幕不显示，输完直接回车）" -ForegroundColor DarkGray
& $scpExe -o StrictHostKeyChecking=accept-new $tar "${user}@${ip}:~/"
if ($LASTEXITCODE -ne 0) { throw "上传失败（检查 IP 是否正确、密码是否输对）" }

Write-Host ""
Write-Host ">> [2/2] 远程执行部署（会再要一次密码）" -ForegroundColor Cyan
Write-Host ""
& $sshExe -o StrictHostKeyChecking=accept-new "${user}@${ip}" "cd ~ && tar xzf vue-admin-server.tar.gz && bash vue-admin-server/setup.sh"
$code = $LASTEXITCODE

Write-Host ""
if ($code -eq 0) {
    Write-Host "===== 部署命令已执行完，看上面打印的「访问地址」 =====" -ForegroundColor Green
    Write-Host "  浏览器打开 http://$ip 验证；打不开就去控制台安全组放行 TCP:80" -ForegroundColor Yellow
} else {
    Write-Host "!! 远程执行返回码 $code，把上面红字/报错截图发给助手排查" -ForegroundColor Red
}
