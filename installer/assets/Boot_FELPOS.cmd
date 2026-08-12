@echo off
REM No uses rutas de Program Files (x86) con start/wscript: CMD rompe los parentesis.
REM 1) Preferir relaunch.vbs en Public (sin espacios/parentesis)
REM 2) Si no, PowerShell con $PSScriptRoot

if exist "C:\Users\Public\FELPOS\relaunch.vbs" (
  wscript //nologo "C:\Users\Public\FELPOS\relaunch.vbs"
  exit /b 0
)

if exist "%~dp0_relaunch_here.ps1" (
  powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0_relaunch_here.ps1"
  exit /b 0
)

REM Ultimo recurso: VBS local (puede fallar si se invoca mal desde start)
if exist "%~dp0Boot_FELPOS.vbs" (
  wscript //nologo "%~dp0Boot_FELPOS.vbs"
  exit /b 0
)

echo ERROR: no hay lanzador seguro.
pause
exit /b 1
