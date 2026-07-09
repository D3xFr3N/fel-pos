@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================
echo  FEL POS - Respaldo antes de actualizar
echo ============================================
echo.

if not exist ".\.venv\Scripts\python.exe" (
  echo Copiando datos protegidos manualmente...
  goto :manual_copy
)

set "FELPOS_PRE_UPDATE_BACKUP=1"
echo Creando respaldo de base de datos...
".\.venv\Scripts\python.exe" -c "from app.data_paths import ensure_persistent_layout; from app.services.backup_service import create_backup; ensure_persistent_layout(); backup=create_backup('pre_update'); print('[OK] Respaldo:', backup.get('name', '-'))"
if errorlevel 1 (
  echo [WARN] No se pudo crear respaldo por API interna. Se intenta copia manual.
  goto :manual_copy
)
goto :manual_done

:manual_copy
set "STAMP=%DATE:~6,4%%DATE:~3,2%%DATE:~0,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%"
set "STAMP=%STAMP: =0%"
set "TARGET=.\update_backups\manual_%STAMP%"
mkdir "%TARGET%" 2>nul

if exist ".\data" (
  echo Copiando carpeta data...
  robocopy ".\data" "%TARGET%\data" /E /NFL /NDL /NJH /NJS /nc /ns /np >nul
)
if exist ".\fel_pos.db" copy /Y ".\fel_pos.db" "%TARGET%\" >nul
if exist ".\fel_pos.db-wal" copy /Y ".\fel_pos.db-wal" "%TARGET%\" >nul
if exist ".\fel_pos.db-shm" copy /Y ".\fel_pos.db-shm" "%TARGET%\" >nul
if exist ".\backups" (
  echo Copiando carpeta backups...
  robocopy ".\backups" "%TARGET%\backups" /E /NFL /NDL /NJH /NJS /nc /ns /np >nul
)
if exist ".\.env" copy /Y ".\.env" "%TARGET%\" >nul
echo [OK] Copia manual en: %TARGET%

:manual_done
echo.
echo Datos protegidos que NO debes borrar al actualizar:
echo   - data\
echo   - .env
echo   - fel_pos.db (si existe en raiz)
echo   - backups\ (si existe en raiz)
echo.
if /I not "%~1"=="silent" pause
endlocal
