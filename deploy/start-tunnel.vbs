' ============================================
'   vue-admin 一键启动 (VBS 版本)
'   双击这个 .vbs 文件就能启动后端+代理+Cloudflare Tunnel
'   请不要把本文件内容复制粘贴到 cmd 窗口里！
' ============================================

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' 切到 .bat 所在目录的上一级（项目根）
batPath = "E:\claude\vue-admin\deploy\start-tunnel-diag.bat"
workDir = "E:\claude\vue-admin"

If Not fso.FileExists(batPath) Then
    MsgBox "找不到 .bat 文件: " & batPath, vbCritical, "启动失败"
    WScript.Quit 1
End If

' 用 cmd /k 启动 .bat（窗口不自动关，方便看输出）
shell.Run "cmd.exe /c """ & batPath & """", 1, False

WScript.Quit 0