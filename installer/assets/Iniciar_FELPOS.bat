@echo off
setlocal EnableExtensions EnableDelayedExpansion
pushd "%~dp0"

set "APP_DIR=%CD%"

REM PyInstaller desempaqueta a %%TEMP%%\_MEI* ANTES de ejecutar Python.
REM Debe ser una carpeta del usuario, no Program Files ni Temp del sistema.
set "FELPOS_RUNTIME_TMP=%LOCALAPPDATA%\FEL POS\tmp"
if not exist "%LOCALAPPDATA%\FEL POS" mkdir "%LOCALAPPDATA%\FEL POS" >nul 2>&1
if not exist "!FELPOS_RUNTIME_TMP!" mkdir "!FELPOS_RUNTIME_TMP!" >nul 2>&1
if exist "!FELPOS_RUNTIME_TMP!" set "TEMP=!FELPOS_RUNTIME_TMP!"
if exist "!FELPOS_RUNTIME_TMP!" set "TMP=!FELPOS_RUNTIME_TMP!"

for /d %%D in ("!FELPOS_RUNTIME_TMP!\_MEI*") do rmdir /S /Q "%%D" >nul 2>&1

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
set "EXE_SIZE=0"
for %%I in ("FELPOS.exe") do set "EXE_SIZE=%%~zI"
if !EXE_SIZE! LSS 5000000 goto exe_bad
goto exe_ok

:exe_bad
echo ERROR: FELPOS.exe parece danado ^(!EXE_SIZE! bytes^).
if not exist "FELPOS.exe.old" goto exe_dead
echo Restaurando FELPOS.exe.old ...
del /F /Q "FELPOS.exe" >nul 2>&1
ren "FELPOS.exe.old" "FELPOS.exe"
goto launch

:exe_dead
echo Reinstala con FELPOS_Setup.exe
popd
pause
exit /b 1

:exe_ok
if not defined FELPOS_BIND_HOST set "FELPOS_BIND_HOST=0.0.0.0"
start "" "!APP_DIR!\FELPOS.exe"
popd
exit /b 0
