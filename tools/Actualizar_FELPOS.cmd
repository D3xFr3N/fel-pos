@echo off
setlocal
title FEL POS - Actualizar
echo.
echo  FEL POS - Actualizador independiente
echo  =====================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Actualizar_FELPOS.ps1"
set ERR=%ERRORLEVEL%
echo.
if not "%ERR%"=="0" (
  echo ERROR %ERR%. Revisa C:\Users\Public\FELPOS\felpos-update.log
  pause
  exit /b %ERR%
)
echo Listo.
timeout /t 4 >nul
exit /b 0
