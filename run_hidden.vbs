Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd.exe /c .venv\Scripts\python.exe -X utf8 main.py", 0, false
