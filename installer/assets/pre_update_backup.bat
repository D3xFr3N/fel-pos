@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================
echo  FEL POS - Respaldo antes de actualizar
echo ============================================
echo.

set "STAMP=%DATE:~6,4%%DATE:~3,2%%DATE:~0,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%"
set "STAMP=%STAMP: =0%"
set "TARGET=%~dp0update_backups\manual_%STAMP%"
mkdir "%TARGET%" 2>nul

if exist "%~dp0data" (
  echo Copiando carpeta data...
  robocopy "%~dp0data" "%TARGET%\data" /E /NFL /NDL /NJH /NJS /nc /ns /np >nul
)
if exist "%~dp0fel_pos.db" copy /Y "%~dp0fel_pos.db" "%TARGET%\" >nul
if exist "%~dp0backups" (
  echo Copiando carpeta backups...
  robocopy "%~dp0backups" "%TARGET%\backups" /E /NFL /NDL /NJH /NJS /nc /ns /np >nul
)
if exist "%~dp0.env" copy /Y "%~dp0.env" "%TARGET%\" >nul

echo [OK] Respaldo guardado en:
echo %TARGET%
echo.
if /I not "%~1"=="silent" pause
endlocal
