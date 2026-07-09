@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "TASK_NAME=FELPOS_Server_Autostart"
set "FIREWALL_RULE=FELPOS Server 8000"

net session >nul 2>&1
if errorlevel 1 (
  echo ERROR: Ejecuta este archivo como Administrador.
  exit /b 1
)

echo Eliminando tarea programada "%TASK_NAME%"...
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

echo Eliminando regla de firewall "%FIREWALL_RULE%"...
netsh advfirewall firewall delete rule name="%FIREWALL_RULE%" >nul 2>&1

echo.
echo OK: Autoarranque del servidor desinstalado.
endlocal
