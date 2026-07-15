@echo off
setlocal EnableExtensions
pushd "%~dp0"

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
