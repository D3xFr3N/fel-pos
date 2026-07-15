@echo off
setlocal EnableExtensions
pushd "%~dp0" 2>nul
if errorlevel 1 (
  echo ERROR: No se puede acceder a la carpeta de instalacion.
  echo.
  echo Si la ruta es de red ^(\\\\servidor\\carpeta^), conecta la red
  echo o reinstala FEL POS en el disco local:
  echo   C:\FELPOS
  echo.
  echo Copia despues la carpeta data\ y el archivo .env de la instalacion anterior.
  pause
  exit /b 1
)

echo ========================================
echo   FEL POS - Reparar instalacion
echo ========================================
echo Carpeta: %CD%
echo.

if exist "FELPOS.exe" (
  echo [OK] FELPOS.exe encontrado.
  if exist "FELPOS.exe.pending" (
    echo Limpiando actualizacion pendiente obsoleta...
    del /F /Q "FELPOS.exe.pending" >nul 2>&1
    del /F /Q "FELPOS.exe.old" >nul 2>&1
    del /F /Q "VERSION.pending" >nul 2>&1
    del /F /Q "BUILD_DATE.pending" >nul 2>&1
    del /F /Q "pending_update.json" >nul 2>&1
    del /F /Q "apply_pending_update.bat" >nul 2>&1
  )
  echo Limpiando archivos temporales de arranque...
  for /d %%D in ("%~dp0_MEI*") do rmdir /S /Q "%%D" >nul 2>&1
  goto launch
)

if exist "FELPOS.exe.pending" (
  echo Aplicando actualizacion pendiente...
  if exist "FELPOS.exe.old" del /F /Q "FELPOS.exe.old" >nul 2>&1
  ren "FELPOS.exe.pending" "FELPOS.exe"
  if errorlevel 1 goto restore_old
  if exist "VERSION.pending" move /Y "VERSION.pending" "VERSION" >nul
  if exist "BUILD_DATE.pending" move /Y "BUILD_DATE.pending" "BUILD_DATE" >nul
  if exist "pending_update.json" del /F /Q "pending_update.json" >nul
  if exist "apply_pending_update.bat" del /F /Q "apply_pending_update.bat" >nul
  goto check_exe
)

:restore_old
if exist "FELPOS.exe.old" (
  echo Restaurando copia anterior FELPOS.exe.old ...
  ren "FELPOS.exe.old" "FELPOS.exe"
)

:check_exe
if not exist "FELPOS.exe" (
  echo.
  echo ERROR: No hay FELPOS.exe en esta carpeta.
  echo Reinstala en C:\FELPOS con FELPOS_Setup.exe
  echo.
  popd
  pause
  exit /b 1
)

:launch
echo Iniciando FEL POS...
start "" "%~dp0FELPOS.exe"
echo.
popd
pause
