@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

if not exist ".\.venv\Scripts\python.exe" (
  echo [%date% %time%] ERROR: No se encontro ".venv\Scripts\python.exe".>> ".\server-autostart.log"
  exit /b 1
)

set "FELPOS_MODE=server"
set "FELPOS_BIND_HOST=0.0.0.0"
set "FELPOS_PORT=8000"

:restart_loop
echo [%date% %time%] Iniciando FEL POS servidor...>> ".\server-autostart.log"
".\.venv\Scripts\python.exe" ".\fel_pos_launcher.py" >> ".\server-autostart.log" 2>&1
set "EXIT_CODE=!errorlevel!"
echo [%date% %time%] Proceso finalizado con codigo !EXIT_CODE!. Reinicia en 5s...>> ".\server-autostart.log"
timeout /t 5 /nobreak >nul
goto restart_loop
