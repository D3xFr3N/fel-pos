' FEL POS - lanzador silencioso
' Fija TEMP/TMP antes de arrancar el EXE (PyInstaller necesita una carpeta writable).
Option Explicit

Dim shell, fso, appDir, tmpRoot, tmpDir, exePath, bindHost

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = appDir & "\FELPOS.exe"
tmpRoot = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\FEL POS"
tmpDir = tmpRoot & "\tmp"

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

' Limpia extracciones _MEI viejas/corruptas.
On Error Resume Next
Dim folder, subFolder
If fso.FolderExists(tmpDir) Then
  Set folder = fso.GetFolder(tmpDir)
  For Each subFolder In folder.SubFolders
    If Left(UCase(subFolder.Name), 4) = "_MEI" Then
      fso.DeleteFolder subFolder.Path, True
    End If
  Next
End If
On Error GoTo 0

If Not fso.FileExists(exePath) Then
  MsgBox "No se encontro FELPOS.exe." & vbCrLf & vbCrLf & _
         "Ejecuta Reparar_instalacion.bat o reinstala con FELPOS_Setup.exe", _
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
