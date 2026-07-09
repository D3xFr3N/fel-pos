@echo off
setlocal
cd /d "%~dp0"

if not exist ".\.venv\Scripts\python.exe" (
  echo ERROR: No se encontro ".venv\Scripts\python.exe".
  echo Crea el entorno con: python -m venv .venv
  exit /b 1
)

set "FELPOS_MODE=local"
set "FELPOS_BIND_HOST=127.0.0.1"

echo Iniciando FEL POS en modo LOCAL (escritorio)...
".\.venv\Scripts\python.exe" ".\fel_pos_launcher.py"

endlocal
