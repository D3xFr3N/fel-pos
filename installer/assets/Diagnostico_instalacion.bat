@echo off
setlocal EnableExtensions

echo ========================================
echo   FEL POS - Diagnostico de instalacion
echo ========================================
echo.

set "INSTALL_DIR=%~dp0"
echo Carpeta del script:
echo %INSTALL_DIR%
echo.

pushd "%INSTALL_DIR%" 2>nul
if errorlevel 1 (
  echo [ERROR] No se puede abrir la carpeta de instalacion.
  echo Esto suele pasar si instalaste en una carpeta de red desconectada.
  echo Solucion: reinstala en una ruta local, por ejemplo C:\FELPOS
  goto end
)

echo Contenido relevante:
if exist "FELPOS.exe" (echo [OK] FELPOS.exe) else (echo [FALTA] FELPOS.exe)
if exist "FELPOS.exe.pending" (echo [AVISO] FELPOS.exe.pending ^(puede bloquear el inicio^)) else (echo [OK] sin FELPOS.exe.pending)
if exist "FELPOS.exe.old" (echo [AVISO] FELPOS.exe.old) else (echo [OK] sin FELPOS.exe.old)
if exist "VERSION" (echo [OK] VERSION & type "VERSION") else (echo [FALTA] VERSION)
if exist ".env" (echo [OK] .env) else (echo [AVISO] .env)
if exist "data\fel_pos.db" (echo [OK] data\fel_pos.db) else (echo [AVISO] data\fel_pos.db)
if exist "felpos-error.log" (
  echo.
  echo --- felpos-error.log ---
  type "felpos-error.log"
)
if exist "felpos-update.log" (
  echo.
  echo --- felpos-update.log (ultimas lineas) ---
  powershell -NoProfile -Command "Get-Content -Path 'felpos-update.log' -Tail 20"
)

echo.
echo Si aparece "Failed to load Python DLL":
echo 1. Ejecuta Reparar_instalacion.bat
echo 2. Instala Microsoft Visual C++ 2015-2022 Redistributable x64
echo 3. Actualiza a la ultima version desde Configuracion

echo.
echo Prueba de inicio directo:
if exist "FELPOS.exe" (
  echo Ejecutando FELPOS.exe ...
  start "" "%INSTALL_DIR%FELPOS.exe"
) else (
  echo No se puede iniciar porque falta FELPOS.exe
)

popd

:end
echo.
pause
