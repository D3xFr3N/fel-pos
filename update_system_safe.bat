@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "SOURCE_DIR=%~1"
if "%SOURCE_DIR%"=="" (
  echo Uso:
  echo   update_system_safe.bat "C:\ruta\fel-pos-nuevo"
  echo.
  echo Este script actualiza el sistema sin borrar datos importantes.
  pause
  exit /b 1
)

if not exist "%SOURCE_DIR%" (
  echo ERROR: No existe la carpeta origen: %SOURCE_DIR%
  pause
  exit /b 1
)

echo ============================================
echo  FEL POS - Actualizacion segura
echo ============================================
echo Origen : %SOURCE_DIR%
echo Destino: %CD%
echo.

set "OLD_VERSION=desconocida"
if exist "%~dp0VERSION" (
  set /p OLD_VERSION=<"%~dp0VERSION"
)

set "NEW_VERSION=desconocida"
if exist "%SOURCE_DIR%\VERSION" (
  set /p NEW_VERSION=<"%SOURCE_DIR%\VERSION"
)
echo Version actual : %OLD_VERSION%
echo Version nueva  : %NEW_VERSION%
echo.

call "%~dp0pre_update_backup.bat" silent
if errorlevel 1 (
  echo ERROR: No se pudo crear respaldo previo.
  pause
  exit /b 1
)

echo.
echo Deteniendo servidor en puerto 8000 si esta activo...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":8000 .*LISTENING"') do (
  echo Cerrando PID %%p...
  taskkill /PID %%p /F >nul 2>&1
)

echo.
echo Copiando archivos nuevos (protegiendo datos)...
robocopy "%SOURCE_DIR%" "%CD%" /E /XD data backups update_backups .venv dist build android-mobile mobile-apk __pycache__ .git /XF fel_pos.db fel_pos.db-wal fel_pos.db-shm .env /NFL /NDL /NJH /NJS /nc /ns /np
set "RC=%ERRORLEVEL%"
if %RC% GEQ 8 (
  echo ERROR: Fallo robocopy (codigo %RC%).
  pause
  exit /b %RC%
)

if exist ".\.venv\Scripts\python.exe" (
  echo.
  echo Actualizando dependencias...
  ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
)

echo.
echo Verificando datos persistentes...
if exist ".\data\fel_pos.db" (
  echo [OK] Base de datos protegida: .\data\fel_pos.db
) else if exist ".\fel_pos.db" (
  echo [OK] Base de datos protegida (legacy): .\fel_pos.db
) else (
  echo [WARN] No se detecto base de datos. Revisa respaldo en update_backups.
)

if exist ".\.env" (
  echo [OK] Configuracion protegida: .env
) else (
  echo [WARN] No se detecto .env
)

echo.
echo ============================================
echo  Actualizacion completada
echo ============================================
if exist ".\VERSION" (
  set /p INSTALLED_VERSION=<".\VERSION"
  echo Version instalada: !INSTALLED_VERSION!
)
echo Datos NO borrados:
echo   - data\
echo   - .env
echo   - fel_pos.db / backups (si existian)
echo.
echo Siguiente paso: ejecuta run_server_mode.bat o run_local_mode.bat
echo.
pause
endlocal
