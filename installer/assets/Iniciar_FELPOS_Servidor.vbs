' FEL POS - modo servidor (sin ventana de escritorio)
' TEMP sin espacios (usuarios Windows con espacios rompen PyInstaller).
Option Explicit

Dim shell, fso, appDir, tmpRoot, tmpDir, exePath

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = appDir & "\FELPOS.exe"
tmpRoot = ResolveRuntimeRoot()
tmpDir = tmpRoot & "\runtime-tmp"

EnsureFolder tmpRoot
EnsureFolder tmpDir

On Error Resume Next
Call CleanMeiFolders(tmpDir)
Call CleanMeiFolders(shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\FELPOS\runtime-tmp")
On Error GoTo 0

If Not fso.FileExists(exePath) Then
  MsgBox "No se encontro FELPOS.exe.", vbCritical, "FEL POS Servidor"
  WScript.Quit 1
End If

shell.CurrentDirectory = appDir
shell.Environment("PROCESS")("TEMP") = tmpDir
shell.Environment("PROCESS")("TMP") = tmpDir
shell.Environment("PROCESS")("FELPOS_RUNTIME_TMP") = tmpDir
shell.Environment("PROCESS")("FELPOS_MODE") = "server"
If Trim(shell.Environment("PROCESS")("FELPOS_BIND_HOST")) = "" Then
  shell.Environment("PROCESS")("FELPOS_BIND_HOST") = "0.0.0.0"
End If
If Trim(shell.Environment("PROCESS")("FELPOS_PORT")) = "" Then
  shell.Environment("PROCESS")("FELPOS_PORT") = "8000"
End If

shell.Run """" & exePath & """", 1, False
WScript.Quit 0

Function ResolveRuntimeRoot()
  Dim programData
  programData = Trim(shell.ExpandEnvironmentStrings("%ProgramData%"))
  If programData <> "" And InStr(programData, " ") = 0 Then
    ResolveRuntimeRoot = programData & "\FELPOS"
    Exit Function
  End If
  ResolveRuntimeRoot = "C:\FELPOS"
End Function

Sub EnsureFolder(path)
  If Trim(path) = "" Then Exit Sub
  If fso.FolderExists(path) Then Exit Sub
  On Error Resume Next
  fso.CreateFolder path
  On Error GoTo 0
End Sub

Sub CleanMeiFolders(basePath)
  Dim baseFolder, child
  If Trim(basePath) = "" Then Exit Sub
  If Not fso.FolderExists(basePath) Then Exit Sub
  Set baseFolder = fso.GetFolder(basePath)
  For Each child In baseFolder.SubFolders
    If Left(UCase(child.Name), 4) = "_MEI" Then
      fso.DeleteFolder child.Path, True
    End If
  Next
End Sub
