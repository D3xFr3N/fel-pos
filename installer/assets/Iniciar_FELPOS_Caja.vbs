' FEL POS - caja en red (cliente)
Option Explicit

Dim shell, fso, appDir, tmpRoot, tmpDir, exePath

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = appDir & "\FELPOS.exe"
tmpRoot = ResolveSpaceFreeRuntimeRoot()
tmpDir = tmpRoot & "\runtime-tmp"

EnsureFolder tmpRoot
EnsureFolder tmpDir
If Not fso.FolderExists(tmpDir) Then
  MsgBox "No se pudo crear carpeta temporal:" & vbCrLf & tmpDir, vbCritical, "FEL POS Caja"
  WScript.Quit 1
End If

On Error Resume Next
Call CleanMeiFolders(tmpDir)
Call CleanMeiFolders(shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\FELPOS\runtime-tmp")
On Error GoTo 0

If Not fso.FileExists(exePath) Then
  MsgBox "No se encontro FELPOS.exe.", vbCritical, "FEL POS Caja"
  WScript.Quit 1
End If

shell.CurrentDirectory = appDir
shell.Environment("PROCESS")("TEMP") = tmpDir
shell.Environment("PROCESS")("TMP") = tmpDir
shell.Environment("PROCESS")("FELPOS_RUNTIME_TMP") = tmpDir
shell.Environment("PROCESS")("FELPOS_MODE") = "client"
If Trim(shell.Environment("PROCESS")("FELPOS_PORT")) = "" Then
  shell.Environment("PROCESS")("FELPOS_PORT") = "8000"
End If

Dim app
Set app = CreateObject("Shell.Application")
app.ShellExecute exePath, "", appDir, "open", 1
WScript.Quit 0

Function ResolveSpaceFreeRuntimeRoot()
  Dim publicDir, programData, shortLocal
  publicDir = "C:\Users\Public"
  If fso.FolderExists(publicDir) Then
    ResolveSpaceFreeRuntimeRoot = publicDir & "\FELPOS"
    Exit Function
  End If
  programData = Trim(shell.ExpandEnvironmentStrings("%ProgramData%"))
  If programData <> "" And InStr(programData, " ") = 0 Then
    ResolveSpaceFreeRuntimeRoot = programData & "\FELPOS"
    Exit Function
  End If
  On Error Resume Next
  shortLocal = fso.GetFolder(shell.ExpandEnvironmentStrings("%LOCALAPPDATA%")).ShortPath
  If Err.Number = 0 And InStr(shortLocal, " ") = 0 And Trim(shortLocal) <> "" Then
    ResolveSpaceFreeRuntimeRoot = shortLocal & "\FELPOS"
    On Error GoTo 0
    Exit Function
  End If
  Err.Clear
  On Error GoTo 0
  ResolveSpaceFreeRuntimeRoot = "C:\FELPOS"
End Function

Sub EnsureFolder(path)
  Dim parent
  If Trim(path) = "" Then Exit Sub
  If fso.FolderExists(path) Then Exit Sub
  On Error Resume Next
  parent = fso.GetParentFolderName(path)
  If Trim(parent) <> "" And Not fso.FolderExists(parent) Then
    fso.CreateFolder parent
  End If
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
