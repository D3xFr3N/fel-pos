@echo off
setlocal EnableExtensions EnableDelayedExpansion
pushd "%~dp0"

echo ========================================
echo   FEL POS - Aplicar actualizacion
echo ========================================
echo.

set "APP_DIR=%CD%"
set "FELPOS_RUNTIME_TMP=%LOCALAPPDATA%\FEL POS\tmp"
if not exist "!FELPOS_RUNTIME_TMP!" mkdir "!FELPOS_RUNTIME_TMP!" >nul 2>&1
if exist "!FELPOS_RUNTIME_TMP!" set "TEMP=!FELPOS_RUNTIME_TMP!"
if exist "!FELPOS_RUNTIME_TMP!" set "TMP=!FELPOS_RUNTIME_TMP!"

if exist "FELPOS.exe.pending" goto has_pending
echo No hay actualizacion pendiente en esta carpeta.
echo.
echo Opciones:
echo   1. Abre FEL POS como admin y ve a Configuracion ^> Actualizar ahora
echo   2. Ejecuta FELPOS_Setup.exe sobre esta instalacion
echo   3. Ejecuta Reparar_instalacion.bat si no abre el programa
echo.
popd
pause
exit /b 1

:has_pending
set "PENDING_SIZE=0"
for %%I in ("FELPOS.exe.pending") do set "PENDING_SIZE=%%~zI"
if !PENDING_SIZE! LSS 5000000 goto pending_bad
goto pending_ok

:pending_bad
echo ERROR: FELPOS.exe.pending parece incompleto ^(!PENDING_SIZE! bytes^).
echo Se elimina el pendiente para no romper la instalacion.
del /F /Q "FELPOS.exe.pending" >nul 2>&1
popd
pause
exit /b 1

:pending_ok
echo Hay archivos pendientes. Cerrando FEL POS si sigue abierto...
set /a tries=0
:wait
set /a tries+=1
tasklist /FI "IMAGENAME eq FELPOS.exe" 2>nul | find /I "FELPOS.exe" >nul
if errorlevel 1 goto apply
if !tries! GEQ 60 (
  taskkill /F /IM FELPOS.exe /T >nul 2>&1
  timeout /t 2 >nul
  goto apply
)
timeout /t 1 >nul
goto wait

:apply
echo Aplicando actualizacion ^(!PENDING_SIZE! bytes^)...
if exist "FELPOS.exe.old" del /F /Q "FELPOS.exe.old" >nul 2>&1
if exist "FELPOS.exe" ren "FELPOS.exe" "FELPOS.exe.old"
ren "FELPOS.exe.pending" "FELPOS.exe"
if errorlevel 1 goto apply_fail
goto apply_ok

:apply_fail
echo ERROR al reemplazar FELPOS.exe. Restaurando copia anterior...
if exist "FELPOS.exe.old" ren "FELPOS.exe.old" "FELPOS.exe"
popd
pause
exit /b 1

:apply_ok
if exist "VERSION.pending" move /Y "VERSION.pending" "VERSION" >nul
if exist "BUILD_DATE.pending" move /Y "BUILD_DATE.pending" "BUILD_DATE" >nul
if exist "pending_update.json" del /F /Q "pending_update.json" >nul
if exist "apply_pending_update.bat" del /F /Q "apply_pending_update.bat" >nul

if exist "FELPOS.exe" goto exe_ok
echo ERROR: FELPOS.exe no existe despues de aplicar la actualizacion.
if exist "FELPOS.exe.old" ren "FELPOS.exe.old" "FELPOS.exe"
popd
pause
exit /b 1

:exe_ok
echo Listo. La copia anterior queda en FELPOS.exe.old hasta el primer arranque OK.
echo Reiniciando FELPOS...
timeout /t 1 >nul
if exist "Iniciar_FELPOS.bat" goto start_bat
start "" "!APP_DIR!\FELPOS.exe"
goto end_ok

:start_bat
start "" "!APP_DIR!\Iniciar_FELPOS.bat"

:end_ok
echo.
popd
pause
exit /b 0
