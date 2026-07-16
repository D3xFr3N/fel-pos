@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "INSTALL_DIR=%~dp0"
pushd "!INSTALL_DIR!" 2>nul
if errorlevel 1 goto push_fail
goto push_ok

:push_fail
echo ERROR: No se puede acceder a la carpeta de instalacion.
echo Si instalaste en una carpeta de red, conecta la red o reinstala en C:\FELPOS
echo Ruta intentada:
echo !INSTALL_DIR!
pause
exit /b 1

:push_ok
echo ========================================
echo   FEL POS - Limpiar actualizacion
echo ========================================
echo Carpeta: %CD%
echo.

if not exist "FELPOS.exe" goto no_exe
goto clean

:no_exe
echo ERROR: No hay FELPOS.exe en esta carpeta.
goto done

:clean
echo Limpiando archivos pendientes de actualizacion...
if exist "FELPOS.exe.pending" del /F /Q "FELPOS.exe.pending"
if exist "FELPOS.exe.old" del /F /Q "FELPOS.exe.old"
if exist "VERSION.pending" del /F /Q "VERSION.pending"
if exist "BUILD_DATE.pending" del /F /Q "BUILD_DATE.pending"
if exist "pending_update.json" del /F /Q "pending_update.json"
if exist "apply_pending_update.bat" del /F /Q "apply_pending_update.bat"

echo [OK] Limpieza completada.
echo Ahora intenta abrir FELPOS.exe directamente.

:done
popd
pause
endlocal
