@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================
echo  FEL POS - Respaldo antes de actualizar
echo ============================================
echo.

set "STAMP=%DATE:~6,4%%DATE:~3,2%%DATE:~0,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%"
set "STAMP=%STAMP: =0%"
set "TARGET=%CD%\update_backups\manual_%STAMP%"
mkdir "%TARGET%" 2>nul

if not exist "data" goto after_data
echo Copiando carpeta data...
robocopy "data" "%TARGET%\data" /E /NFL /NDL /NJH /NJS /nc /ns /np >nul
:after_data

if exist "fel_pos.db" copy /Y "fel_pos.db" "%TARGET%\" >nul

if not exist "backups" goto after_backups
echo Copiando carpeta backups...
robocopy "backups" "%TARGET%\backups" /E /NFL /NDL /NJH /NJS /nc /ns /np >nul
:after_backups

if exist ".env" copy /Y ".env" "%TARGET%\" >nul

echo [OK] Respaldo guardado en:
echo %TARGET%
echo.
if /I "%~1"=="silent" goto end
pause
:end
endlocal
