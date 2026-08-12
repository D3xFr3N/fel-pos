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

REM Servidor de red: sin ventana, inventario en este PC, otras cajas se conectan.
set "FELPOS_MODE=server"
if not defined FELPOS_BIND_HOST set "FELPOS_BIND_HOST=0.0.0.0"
if not defined FELPOS_PORT set "FELPOS_PORT=8000"

start "" "!APP_DIR!\FELPOS.exe"
popd
exit /b 0
