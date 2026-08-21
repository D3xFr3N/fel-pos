@echo off
REM Rutas con "Program Files (x86)" rompen bloques if (...). Usar GOTO.
setlocal EnableExtensions
set "PUBLIC_RELAUNCH=C:\Users\Public\FELPOS\relaunch.vbs"
set "LOCAL_PS1=%~dp0_relaunch_here.ps1"
set "LOCAL_VBS=%~dp0Boot_FELPOS.vbs"

if exist "%PUBLIC_RELAUNCH%" goto use_public
if exist "%LOCAL_PS1%" goto use_ps1
if exist "%LOCAL_VBS%" goto use_vbs
echo ERROR: no hay lanzador seguro.
pause
exit /b 1

:use_public
wscript //nologo "%PUBLIC_RELAUNCH%"
exit /b 0

:use_ps1
powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%LOCAL_PS1%"
exit /b 0

:use_vbs
wscript //nologo "%LOCAL_VBS%"
exit /b 0
