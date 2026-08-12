@echo off
setlocal
cd /d "%~dp0"
if not exist ".\.venv\Scripts\python.exe" (
  echo ERROR: falta .venv
  exit /b 1
)
set "FELPOS_MODE=client"
set "FELPOS_PORT=8000"
echo Iniciando FEL POS en modo CAJA (busca servidor en la red)...
".\.venv\Scripts\python.exe" ".\fel_pos_launcher.py"
endlocal
