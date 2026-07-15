@echo off
setlocal EnableExtensions
pushd "%~dp0" 2>nul
if errorlevel 1 (
  echo ERROR: No se puede acceder a la carpeta de instalacion.
  echo Si instalaste en una carpeta de red, conecta la red o reinstala en C:\FELPOS
  echo Ruta intentada: %~dp0
  pause
  exit /b 1
)

echo ========================================
echo   FEL POS - Limpiar actualizacion
echo ========================================
echo Carpeta: %CD%
echo.

if not exist "FELPOS.exe" (
  echo ERROR: No hay FELPOS.exe en esta carpeta.
  goto done
)

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
