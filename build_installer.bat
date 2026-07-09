@echo off
setlocal
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\build_installer.ps1"
set "RC=%ERRORLEVEL%"
if %RC%==0 (
  echo.
  echo Instalador listo: dist\FELPOS_Setup.exe
) else if %RC%==2 (
  echo.
  echo Inno Setup no encontrado. Revisa el mensaje anterior.
) else (
  echo.
  echo ERROR al generar instalador.
)
pause
exit /b %RC%
