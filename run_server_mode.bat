@echo off
setlocal
cd /d "%~dp0"

if not exist ".\.venv\Scripts\python.exe" (
  echo ERROR: No se encontro ".venv\Scripts\python.exe".
  echo Crea el entorno con: python -m venv .venv
  exit /b 1
)

set "FELPOS_MODE=server"
set "FELPOS_BIND_HOST=0.0.0.0"
set "FELPOS_PORT=8000"

for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":8000 .*LISTENING"') do (
  set "EXISTING_PID=%%p"
  goto :already_running
)

echo Iniciando FEL POS en modo SERVIDOR...
echo URL local: http://127.0.0.1:8000
echo URL LAN:   http://IP-DE-TU-PC:8000
".\.venv\Scripts\python.exe" ".\fel_pos_launcher.py"
goto :end

:already_running
echo Servidor ya activo en puerto 8000 (PID %EXISTING_PID%).
echo URL local: http://127.0.0.1:8000
echo URL LAN:   http://IP-DE-TU-PC:8000
echo Si necesitas reiniciarlo, primero cierra el proceso que usa el puerto 8000.

:end
endlocal
