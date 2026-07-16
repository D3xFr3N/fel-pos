@echo off
setlocal EnableExtensions EnableDelayedExpansion
pushd "%~dp0"

set "APP_DIR=%CD%"

REM Carpeta temporal writable del usuario (necesario en Program Files).
set "FELPOS_RUNTIME_TMP=%LOCALAPPDATA%\FEL POS\tmp"
if not exist "!FELPOS_RUNTIME_TMP!" mkdir "!FELPOS_RUNTIME_TMP!" >nul 2>&1
if exist "!FELPOS_RUNTIME_TMP!" set "TEMP=!FELPOS_RUNTIME_TMP!"
if exist "!FELPOS_RUNTIME_TMP!" set "TMP=!FELPOS_RUNTIME_TMP!"

if exist "FELPOS.exe" goto launch
if exist "FELPOS.exe.pending" goto apply_pending
if exist "FELPOS.exe.old" ren "FELPOS.exe.old" "FELPOS.exe"
if exist "FELPOS.exe" goto launch
goto missing

:apply_pending
call "%~dp0Aplicar_actualizacion_pendiente.bat"
exit /b %ERRORLEVEL%

:missing
echo ERROR: No se encontro FELPOS.exe en:
echo !APP_DIR!
echo.
echo Ejecuta Reparar_instalacion.bat o reinstala con FELPOS_Setup.exe
popd
pause
exit /b 1

:launch
REM Permite que la APK/celular lleguen al POS en la red local.
if not defined FELPOS_BIND_HOST set "FELPOS_BIND_HOST=0.0.0.0"
start "" "!APP_DIR!\FELPOS.exe"
popd
exit /b 0
