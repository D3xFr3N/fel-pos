' FEL POS - caja en red (cliente)
' Busca automaticamente el servidor en la misma WiFi/LAN. No pide IP.
Option Explicit

Dim shell, fso, appDir, tmpRoot, tmpDir, exePath

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

shell.Run """" & exePath & """", 1, False
WScript.Quit 0
