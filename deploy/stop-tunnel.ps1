# ============================================================
# stop-tunnel.ps1 - vue-admin 一键停止
# 双击 deploy\stop.cmd 调起
# ============================================================

Write-Host "正在停止所有 vue-admin 相关进程..."

Get-NetTCPConnection -LocalPort 4000,8080,7843 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object {
        try {
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
            Write-Host "  已停端口 $_.LocalPort (PID=$($_.OwningProcess))"
        } catch {}
    }

Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process ssh -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*serveo*' } |
    ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host "已停所有进程"
Read-Host "按 Enter 关闭"