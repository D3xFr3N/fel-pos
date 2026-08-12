@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "INSTALL_DIR=%~dp0"
pushd "!INSTALL_DIR!" 2>nul
if errorlevel 1 goto push_fail
goto push_ok

:push_fail
echo ERROR: No se puede acceder a la carpeta de instalacion.
echo.
echo Si la ruta es de red, conecta la red o reinstala FEL POS en el disco local:
echo   C:\FELPOS
echo.
echo Copia despues la carpeta data\ y el archivo .env de la instalacion anterior.
pause
exit /b 1

:push_ok
echo ========================================
echo   FEL POS - Reparar instalacion
echo ========================================
echo Carpeta: %CD%
echo.

call "%~dp0_resolve_runtime_tmp.cmd"

echo Limpiando carpetas temporales de arranque...
for /d %%D in ("%~dp0_MEI*") do rmdir /S /Q "%%D" >nul 2>&1
for /d %%D in ("%LOCALAPPDATA%\Temp\_MEI*") do rmdir /S /Q "%%D" >nul 2>&1
for /d %%D in ("%LOCALAPPDATA%\FELPOS\runtime-tmp\_MEI*") do rmdir /S /Q "%%D" >nul 2>&1
for /d %%D in ("%LOCALAPPDATA%\FEL POS\tmp\_MEI*") do rmdir /S /Q "%%D" >nul 2>&1
for /d %%D in ("%ProgramData%\FELPOS\runtime-tmp\_MEI*") do rmdir /S /Q "%%D" >nul 2>&1

if not exist "FELPOS.exe.pending" goto after_pending_size
set "PENDING_SIZE=0"
for %%I in ("FELPOS.exe.pending") do set "PENDING_SIZE=%%~zI"
if !PENDING_SIZE! LSS 15000000 goto drop_pending
goto after_pending_size

:drop_pending
echo Eliminando actualizacion pendiente incompleta...
del /F /Q "FELPOS.exe.pending" >nul 2>&1

:after_pending_size
if not exist "FELPOS.exe" goto try_pending_or_old
set "EXE_SIZE=0"
for %%I in ("FELPOS.exe") do set "EXE_SIZE=%%~zI"
if !EXE_SIZE! LSS 15000000 goto exe_damaged
echo [OK] FELPOS.exe encontrado.
if exist "FELPOS.exe.pending" goto clear_stale_pending
goto launch

:clear_stale_pending
echo Limpiando actualizacion pendiente obsoleta...
del /F /Q "FELPOS.exe.pending" >nul 2>&1
del /F /Q "VERSION.pending" >nul 2>&1
del /F /Q "BUILD_DATE.pending" >nul 2>&1
del /F /Q "pending_update.json" >nul 2>&1
del /F /Q "apply_pending_update.bat" >nul 2>&1
del /F /Q "apply_pending_update.ps1" >nul 2>&1
goto launch

:exe_damaged
echo FELPOS.exe parece danado ^(!EXE_SIZE! bytes^).
if not exist "FELPOS.exe.old" goto need_setup
echo Restaurando FELPOS.exe.old ...
del /F /Q "FELPOS.exe" >nul 2>&1
ren "FELPOS.exe.old" "FELPOS.exe"
goto launch

:need_setup
echo No hay FELPOS.exe.old. Debes reinstalar con FELPOS_Setup.exe
popd
pause
exit /b 1

:try_pending_or_old
if not exist "FELPOS.exe.pending" goto restore_old
echo Aplicando actualizacion pendiente...
if exist "FELPOS.exe.old" del /F /Q "FELPOS.exe.old" >nul 2>&1
ren "FELPOS.exe.pending" "FELPOS.exe"
if errorlevel 1 goto restore_old
if exist "VERSION.pending" move /Y "VERSION.pending" "VERSION" >nul
if exist "BUILD_DATE.pending" move /Y "BUILD_DATE.pending" "BUILD_DATE" >nul
if exist "pending_update.json" del /F /Q "pending_update.json" >nul
if exist "apply_pending_update.bat" del /F /Q "apply_pending_update.bat" >nul
if exist "apply_pending_update.ps1" del /F /Q "apply_pending_update.ps1" >nul
goto check_exe

:restore_old
if not exist "FELPOS.exe.old" goto check_exe
echo Restaurando copia anterior FELPOS.exe.old ...
ren "FELPOS.exe.old" "FELPOS.exe"

:check_exe
if exist "FELPOS.exe" goto launch
echo.
echo ERROR: No hay FELPOS.exe en esta carpeta.
echo Reinstala con FELPOS_Setup.exe desde:
echo   https://github.com/D3xFr3N/fel-pos/releases
echo.
popd
pause
exit /b 1

:launch
echo.
echo Iniciando FEL POS con arranque seguro...
if exist "C:\Users\Public\FELPOS\relaunch.vbs" (
  wscript //nologo "C:\Users\Public\FELPOS\relaunch.vbs"
  goto done
)
if exist "%~dp0_relaunch_here.ps1" (
  powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0_relaunch_here.ps1"
  goto done
)
if exist "Boot_FELPOS.vbs" (
  wscript //nologo "%~dp0Boot_FELPOS.vbs"
  goto done
)
if exist "Iniciar_FELPOS.vbs" (
  wscript //nologo "%~dp0Iniciar_FELPOS.vbs"
  goto done
)
powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0_relaunch_here.ps1"
goto done

:done
popd
echo.
echo Si vuelve a fallar, reinstala con FELPOS_Setup.exe -conserva data- y
echo abre FEL POS desde el acceso directo del menu Inicio -no abras FELPOS.exe directo-.
pause
endlocal
exit /b 0
