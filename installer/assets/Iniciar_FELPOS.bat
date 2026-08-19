@echo off
setlocal EnableExtensions EnableDelayedExpansion
pushd "%~dp0"

set "APP_DIR=%CD%"
call "%~dp0_resolve_runtime_tmp.cmd"

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
if !EXE_SIZE! LSS 500000 goto exe_bad
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
