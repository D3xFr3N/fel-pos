@echo off
setlocal EnableExtensions EnableDelayedExpansion
pushd "%~dp0"

set "APP_DIR=%CD%"
set "FELPOS_RUNTIME_TMP=%LOCALAPPDATA%\FELPOS\runtime-tmp"
if not exist "%LOCALAPPDATA%\FELPOS" mkdir "%LOCALAPPDATA%\FELPOS" >nul 2>&1
if not exist "!FELPOS_RUNTIME_TMP!" mkdir "!FELPOS_RUNTIME_TMP!" >nul 2>&1
if exist "!FELPOS_RUNTIME_TMP!" set "TEMP=!FELPOS_RUNTIME_TMP!"
if exist "!FELPOS_RUNTIME_TMP!" set "TMP=!FELPOS_RUNTIME_TMP!"

for /d %%D in ("!FELPOS_RUNTIME_TMP!\_MEI*") do rmdir /S /Q "%%D" >nul 2>&1
for /d %%D in ("%LOCALAPPDATA%\Temp\_MEI*") do rmdir /S /Q "%%D" >nul 2>&1

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
