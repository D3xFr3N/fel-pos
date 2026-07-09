@echo off
setlocal
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\build_exe.ps1"
if errorlevel 1 (
  echo.
  echo ERROR: no se pudo generar el EXE.
  pause
  exit /b 1
)
echo.
echo EXE generado correctamente en .\dist\FELPOS.exe
pause
