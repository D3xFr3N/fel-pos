@echo off
setlocal EnableExtensions EnableDelayedExpansion
pushd "%~dp0"

set "APP_DIR=%CD%"
call "%~dp0_resolve_runtime_tmp.cmd"

if not exist "FELPOS.exe" (
  echo ERROR: No se encontro FELPOS.exe
  popd
  pause
  exit /b 1
)

REM Caja en red: ventana escritorio + inventario del servidor (sin pedir IP).
set "FELPOS_MODE=client"
if not defined FELPOS_PORT set "FELPOS_PORT=8000"

start "" "!APP_DIR!\FELPOS.exe"
popd
exit /b 0
