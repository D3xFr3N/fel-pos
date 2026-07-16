@echo off
setlocal EnableExtensions
pushd "%~dp0"

REM Carpeta temporal writable del usuario (necesario en Program Files).
set "FELPOS_RUNTIME_TMP=%LOCALAPPDATA%\FEL POS\tmp"
if not exist "%FELPOS_RUNTIME_TMP%" mkdir "%FELPOS_RUNTIME_TMP%" >nul 2>&1
if exist "%FELPOS_RUNTIME_TMP%" (
  set "TEMP=%FELPOS_RUNTIME_TMP%"
  set "TMP=%FELPOS_RUNTIME_TMP%"
)

if not exist "FELPOS.exe" (
  if exist "FELPOS.exe.pending" (
    call "%~dp0Aplicar_actualizacion_pendiente.bat"
    exit /b %ERRORLEVEL%
  )
  if exist "FELPOS.exe.old" (
    ren "FELPOS.exe.old" "FELPOS.exe"
  )
)

if not exist "FELPOS.exe" (
  echo ERROR: No se encontro FELPOS.exe en:
  echo %CD%
  echo.
  echo Ejecuta Reparar_instalacion.bat o reinstala con FELPOS_Setup.exe
  popd
  pause
  exit /b 1
)

start "" "%~dp0FELPOS.exe"
popd
