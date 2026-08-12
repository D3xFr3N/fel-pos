' FEL POS - lanzador silencioso
' Fija TEMP/TMP sin espacios antes de arrancar el EXE (PyInstaller).
Option Explicit

Dim shell, fso, appDir, tmpRoot, tmpDir, exePath, bindHost, folder, subFolder

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = appDir & "\FELPOS.exe"
tmpRoot = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\FELPOS"
tmpDir = tmpRoot & "\runtime-tmp"

If Not fso.FolderExists(tmpRoot) Then
  On Error Resume Next
  fso.CreateFolder tmpRoot
  On Error GoTo 0
End If
If Not fso.FolderExists(tmpDir) Then
  On Error Resume Next
  fso.CreateFolder tmpDir
  On Error GoTo 0
End If

' Limpia extracciones _MEI viejas/corruptas (runtime + Temp del sistema + ruta antigua).
On Error Resume Next
Call CleanMeiFolders(tmpDir)
Call CleanMeiFolders(shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Temp")
Call CleanMeiFolders(shell.ExpandEnvironmentStrings("%TEMP%"))
Call CleanMeiFolders(shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\FEL POS\tmp")
On Error GoTo 0

If Not fso.FileExists(exePath) Then
  MsgBox "No se encontro FELPOS.exe." & vbCrLf & vbCrLf & _
         "Ejecuta Reparar_instalacion.bat o reinstala con FELPOS_Setup.exe", _
         vbCritical, "FEL POS"
  WScript.Quit 1
End If

If fso.GetFile(exePath).Size < 15000000 Then
  MsgBox "FELPOS.exe parece danado o incompleto." & vbCrLf & vbCrLf & _
         "Ejecuta Reparar_instalacion.bat", _
         vbCritical, "FEL POS"
  WScript.Quit 1
End If

shell.CurrentDirectory = appDir
shell.Environment("PROCESS")("TEMP") = tmpDir
shell.Environment("PROCESS")("TMP") = tmpDir
shell.Environment("PROCESS")("FELPOS_RUNTIME_TMP") = tmpDir

bindHost = shell.Environment("PROCESS")("FELPOS_BIND_HOST")
If Trim(bindHost) = "" Then
  shell.Environment("PROCESS")("FELPOS_BIND_HOST") = "0.0.0.0"
End If

shell.Run """" & exePath & """", 1, False
WScript.Quit 0

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
