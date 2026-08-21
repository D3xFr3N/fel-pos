' FEL POS - arranque silencioso post-update / acceso seguro
' Evita CMD y maneja bien rutas con espacios y "Program Files (x86)".
Option Explicit

Dim shell, fso, appDir, exePath, tmpRoot, tmpDir

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
If Right(appDir, 1) <> "\" Then appDir = appDir & "\"
exePath = appDir & "FELPOS.exe"

tmpRoot = "C:\Users\Public\FELPOS"
tmpDir = tmpRoot & "\runtime-tmp"
EnsureFolder "C:\Users\Public"
EnsureFolder tmpRoot
EnsureFolder tmpDir

On Error Resume Next
Call CleanMeiFolders(tmpDir)
Call CleanMeiFolders(shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\FELPOS\runtime-tmp")
On Error GoTo 0

If Not fso.FileExists(exePath) Then
  MsgBox "No se encontro FELPOS.exe en:" & vbCrLf & appDir, vbCritical, "FEL POS"
  WScript.Quit 1
End If

If fso.GetFile(exePath).Size < 500000 Then
  MsgBox "FELPOS.exe parece incompleto o danado. Ejecuta Reparar_instalacion.bat", vbCritical, "FEL POS"
  WScript.Quit 1
End If

shell.CurrentDirectory = Left(appDir, Len(appDir) - 1)
shell.Environment("PROCESS")("TEMP") = tmpDir
shell.Environment("PROCESS")("TMP") = tmpDir
shell.Environment("PROCESS")("FELPOS_RUNTIME_TMP") = tmpDir

' ShellExecute: no rompe rutas con Program Files (x86).
Dim app
Set app = CreateObject("Shell.Application")
app.ShellExecute exePath, "", Left(appDir, Len(appDir) - 1), "open", 1
WScript.Quit 0

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
      On Error Resume Next
      fso.DeleteFolder child.Path, True
      On Error GoTo 0
    End If
  Next
End Sub
