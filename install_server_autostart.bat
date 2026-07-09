@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "TASK_NAME=FELPOS_Server_Autostart"
set "LAUNCHER=%~dp0run_server_autostart.bat"
set "FIREWALL_RULE=FELPOS Server 8000"

net session >nul 2>&1
if errorlevel 1 (
  echo ERROR: Ejecuta este archivo como Administrador.
  exit /b 1
)

if not exist "%LAUNCHER%" (
  echo ERROR: No se encontro "%LAUNCHER%".
  exit /b 1
)

echo Creando tarea programada "%TASK_NAME%"...
schtasks /Create /TN "%TASK_NAME%" /SC ONSTART /RL HIGHEST /RU SYSTEM /TR "\"%LAUNCHER%\"" /F >nul
if errorlevel 1 (
  echo ERROR: No se pudo crear la tarea programada.
  exit /b 1
)

echo Configurando regla de firewall para puerto 8000...
netsh advfirewall firewall add rule name="%FIREWALL_RULE%" dir=in action=allow protocol=TCP localport=8000 profile=private,domain >nul 2>&1

echo Iniciando tarea ahora...
schtasks /Run /TN "%TASK_NAME%" >nul 2>&1

echo.
echo OK: Autoarranque del servidor instalado.
echo - Tarea: %TASK_NAME%
echo - Log:   %~dp0server-autostart.log
echo - URL local: http://127.0.0.1:8000
echo - URL LAN:   http://IP-DE-TU-PC:8000
echo.
echo Si deseas desinstalarlo usa: remove_server_autostart.bat
endlocal
