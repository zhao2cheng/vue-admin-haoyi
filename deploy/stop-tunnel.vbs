' ============================================
'   vue-admin 一键停止
'   双击停止后端+代理+tunnel
' ============================================
Set shell = CreateObject("WScript.Shell")
shell.Run "cmd.exe /c ""E:\claude\vue-admin\deploy\stop-tunnel.bat""", 1, False
WScript.Quit 0