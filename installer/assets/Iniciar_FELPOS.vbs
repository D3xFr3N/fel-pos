' FEL POS - lanzador silencioso
' TEMP/TMP SIN espacios: PyInstaller falla LoadLibrary si el usuario Windows tiene espacios
' (ej. "COMPU SAN JUAN" -> LOCALAPPDATA con espacios).
Option Explicit

Dim shell, fso, appDir, tmpRoot, tmpDir, exePath, bindHost

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = appDir & "\FELPOS.exe"
tmpRoot = ResolveRuntimeRoot()
tmpDir = tmpRoot & "\runtime-tmp"

EnsureFolder tmpRoot
EnsureFolder tmpDir

' Limpia extracciones _MEI viejas/corruptas.
On Error Resume Next
Call CleanMeiFolders(tmpDir)
Call CleanMeiFolders(shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\FELPOS\runtime-tmp")
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
