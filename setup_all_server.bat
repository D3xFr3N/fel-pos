@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "TASK_NAME=FELPOS_Server_Autostart"
set "PYTHON_CMD=python"

net session >nul 2>&1
if errorlevel 1 (
  echo ERROR: Ejecuta este archivo como Administrador.
  echo Tip: clic derecho ^> "Ejecutar como administrador".
  exit /b 1
)

echo.
echo [1/5] Verificando entorno virtual...
if not exist ".\.venv\Scripts\python.exe" (
  echo Creando entorno virtual .venv...
  %PYTHON_CMD% -m venv .venv
  if errorlevel 1 (
    echo ERROR: No se pudo crear .venv. Verifica que Python este instalado.
    exit /b 1
  )
)

echo.
echo [2/5] Actualizando pip...
".\.venv\Scripts\python.exe" -m pip install --upgrade pip >nul

echo.
echo [3/5] Instalando dependencias...
".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  echo ERROR: Fallo instalacion de dependencias.
  exit /b 1
)

echo.
echo [4/5] Instalando autoarranque servidor...
call ".\install_server_autostart.bat"
if errorlevel 1 (
  echo ERROR: No se pudo instalar autoarranque.
  exit /b 1
)

echo.
echo [5/5] Validando tarea...
schtasks /Query /TN "%TASK_NAME%" >nul 2>&1
if errorlevel 1 (
  echo ERROR: La tarea no existe despues de instalar.
  exit /b 1
)

echo.
echo ===========================================
echo FEL POS SERVIDOR: TODO CONFIGURADO
echo ===========================================
echo Tarea: %TASK_NAME%
echo URL local: http://127.0.0.1:8000
echo URL LAN:   http://IP-DE-TU-PC:8000
echo Log:       %~dp0server-autostart.log
echo.
echo Para revisar estado rapido ejecuta: server_status.bat
echo Para desinstalar autoarranque: remove_server_autostart.bat
echo.
endlocal
