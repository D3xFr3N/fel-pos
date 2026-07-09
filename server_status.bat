@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "TASK_NAME=FELPOS_Server_Autostart"

echo ===========================================
echo ESTADO SERVIDOR FEL POS
echo ===========================================
echo.

echo [1/4] Tarea programada:
schtasks /Query /TN "%TASK_NAME%" /FO LIST 2>nul | findstr /i /c:"TaskName:" /c:"Status:" /c:"Last Run Time:" /c:"Last Result:"
if errorlevel 1 (
  echo No existe tarea "%TASK_NAME%".
)

echo.
echo [2/4] Puerto 8000:
netstat -ano | findstr ":8000"
if errorlevel 1 (
  echo No hay proceso escuchando en puerto 8000.
)

echo.
echo [3/4] URL prueba local:
echo http://127.0.0.1:8000

echo.
echo [4/4] Ultimas lineas del log:
if exist ".\server-autostart.log" (
  powershell -NoProfile -Command "Get-Content -Path '.\server-autostart.log' -Tail 25"
) else (
  echo No existe server-autostart.log aun.
)

echo.
echo Fin de diagnostico.
endlocal
