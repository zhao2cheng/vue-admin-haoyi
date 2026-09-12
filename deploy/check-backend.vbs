' ============================================
'   vue-admin 状态检查
'   双击查看后端/代理/端口状态
' ============================================
Set shell = CreateObject("WScript.Shell")
shell.Run "cmd.exe /c ""E:\claude\vue-admin\deploy\check-backend.bat""", 1, False
WScript.Quit 0