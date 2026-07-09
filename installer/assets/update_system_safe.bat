@echo off

setlocal EnableExtensions

cd /d "%~dp0"



set "SOURCE_DIR=%~1"

if "%SOURCE_DIR%"=="" (

  echo Uso:

  echo   update_system_safe.bat "C:\ruta\carpeta-nueva"

  echo.

  echo Actualiza FEL POS sin borrar data\ ni .env

  pause

  exit /b 1

)



if not exist "%SOURCE_DIR%\FELPOS.exe" (

  echo ERROR: No se encontro FELPOS.exe en:

  echo %SOURCE_DIR%

  pause

  exit /b 1

)



set "OLD_VERSION=desconocida"

if exist "%~dp0VERSION" (

  set /p OLD_VERSION=<"%~dp0VERSION"

)



set "NEW_VERSION=desconocida"

if exist "%SOURCE_DIR%\VERSION" (

  set /p NEW_VERSION=<"%SOURCE_DIR%\VERSION"

)



echo ============================================

echo  FEL POS - Actualizacion segura

echo ============================================

echo Version actual : %OLD_VERSION%

echo Version nueva  : %NEW_VERSION%

echo.

call "%~dp0pre_update_backup.bat" silent



echo.

echo Actualizando ejecutable y archivos de soporte...

copy /Y "%SOURCE_DIR%\FELPOS.exe" "%~dp0FELPOS.exe" >nul

if exist "%SOURCE_DIR%\VERSION" copy /Y "%SOURCE_DIR%\VERSION" "%~dp0VERSION" >nul

if exist "%SOURCE_DIR%\BUILD_DATE" copy /Y "%SOURCE_DIR%\BUILD_DATE" "%~dp0BUILD_DATE" >nul

if exist "%SOURCE_DIR%\.env.example" copy /Y "%SOURCE_DIR%\.env.example" "%~dp0.env.example" >nul

if exist "%SOURCE_DIR%\LEEME_INSTALACION.txt" copy /Y "%SOURCE_DIR%\LEEME_INSTALACION.txt" "%~dp0LEEME_INSTALACION.txt" >nul

if exist "%SOURCE_DIR%\update_system_safe.bat" copy /Y "%SOURCE_DIR%\update_system_safe.bat" "%~dp0update_system_safe.bat" >nul

if exist "%SOURCE_DIR%\pre_update_backup.bat" copy /Y "%SOURCE_DIR%\pre_update_backup.bat" "%~dp0pre_update_backup.bat" >nul



echo [OK] Actualizacion completada.

echo Version instalada: %NEW_VERSION%

echo Datos protegidos: data\ y .env

echo Historial de versiones: data\app_version.json

echo.

pause

endlocal

