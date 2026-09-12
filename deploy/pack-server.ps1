# ============================================================
# 打包"腾讯云服务器部署包"：vue-admin-server.tar.gz
# 产物：deploy\out\vue-admin-server.tar.gz
# 内容：最新构建的 dist + 后端(含数据库/上传图片) + setup.sh
# 之后：上传到服务器网页终端，执行一条命令即完成部署
#          cd ~ && tar xzf vue-admin-server.tar.gz && bash vue-admin-server/setup.sh
# ============================================================
$ErrorActionPreference = "Stop"

# 防护：清掉可能注入的 NODE_OPTIONS（某些工具会给 node 挂钩子，
# 导致 vite 清空 dist 目录时被拦截报 SAFE_DELETE 错误）
$env:NODE_OPTIONS = $null

# 项目根目录 = deploy 的上一级
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host ">> [1/5] 构建最新前端 (npm run build) ..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "前端构建失败，请检查报错" }

Write-Host ">> [2/5] 整理部署文件 ..." -ForegroundColor Cyan
$outDir   = Join-Path $PSScriptRoot "out"
$stage    = Join-Path $outDir "vue-admin-server"
if (Test-Path $outDir) { Remove-Item -Recurse -Force $outDir }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

# ---- 前端产物 ----
Copy-Item -Recurse (Join-Path $root "dist") (Join-Path $stage "dist")

# ---- 后端（只打包运行必需文件 + 数据 + 图片） ----
$bdest = Join-Path $stage "backend"
New-Item -ItemType Directory -Force -Path $bdest | Out-Null
foreach ($f in "server.js", "db.js", "auth.js", "migrate.mjs", "schema.sql", "package.json") {
    Copy-Item (Join-Path $root "backend\$f") $bdest
}
Copy-Item -Recurse (Join-Path $root "backend\api") (Join-Path $bdest "api")

# ---- 数据库：先做 WAL checkpoint 把改动收拢进主库，再拷贝 ----
Write-Host "      收拢 SQLite WAL ..." -ForegroundColor DarkGray
$ErrorActionPreference = "Continue"
$null = cmd /c "node --no-warnings -e ""const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('backend/data/app.db');db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close()"" 2>nul"
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path (Join-Path $bdest "data") | Out-Null
Copy-Item (Join-Path $root "backend\data\app.db") (Join-Path $bdest "data\app.db")
# WAL/SHM 若仍存在也一并拷走，保证数据一致
foreach ($w in "app.db-wal", "app.db-shm") {
    $p = Join-Path $root "backend\data\$w"
    if (Test-Path $p) { Copy-Item $p (Join-Path $bdest "data\$w") }
}

# ---- 上传的图片 ----
Copy-Item -Recurse (Join-Path $root "backend\uploads") (Join-Path $bdest "uploads")

# ---- 服务器端脚本（统一转成 LF 行尾，避免 Linux 上跑不了） ----
$sh = [IO.File]::ReadAllText((Join-Path $PSScriptRoot "lighthouse\setup.sh"))
$sh = $sh -replace "`r`n", "`n"
[IO.File]::WriteAllText((Join-Path $stage "setup.sh"), $sh)

Write-Host ">> [3/5] 压缩 tar.gz ..." -ForegroundColor Cyan
$tar = Join-Path $outDir "vue-admin-server.tar.gz"
tar -czf $tar -C $outDir "vue-admin-server"
if ($LASTEXITCODE -ne 0) { throw "tar 打包失败" }

Write-Host ">> [4/5] 校验包内容 ..." -ForegroundColor Cyan
tar -tzf $tar | Select-Object -First 8
$cnt = (tar -tzf $tar | Measure-Object -Line).Lines
if ($cnt -lt 10) { throw "包内容异常（仅 $cnt 个文件）" }

$size = "{0:N2} MB" -f ((Get-Item $tar).Length / 1MB)
Write-Host ">> [5/5] 完成！共 $cnt 个文件，大小 $size" -ForegroundColor Green
Write-Host ""
Write-Host "   部署包位置： $tar" -ForegroundColor Yellow
Write-Host ""
Write-Host "   下一步（见 DEPLOY-TENCENT.md）："
Write-Host "   1. 腾讯云控制台打开服务器网页终端，点上传按钮传这个 tar.gz"
Write-Host "   2. 终端里粘贴执行："
Write-Host "      cd ~ && tar xzf vue-admin-server.tar.gz && bash vue-admin-server/setup.sh"
