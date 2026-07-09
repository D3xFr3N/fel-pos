@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "REPORT=%cd%\apk_build_report.txt"
set "APK_PATH=%~dp0android\app\build\outputs\apk\debug\app-debug.apk"
set "DESKTOP_REPORT=%USERPROFILE%\Desktop\apk_build_report.txt"

type nul > "%REPORT%"

(
  echo ===== FEL POS APK ERROR REPORT =====
  echo Fecha: %date% %time%
  echo Carpeta: %cd%
  echo.

  echo ---- Sistema ----
  ver
  echo.

  echo ---- Variables de entorno ----
  echo JAVA_HOME=%JAVA_HOME%
  echo ANDROID_HOME=%ANDROID_HOME%
  echo ANDROID_SDK_ROOT=%ANDROID_SDK_ROOT%
  echo.

  echo ---- Herramientas ----
  where node
  echo EXIT_CODE_WHERE_NODE=!errorlevel!
  where npm
  echo EXIT_CODE_WHERE_NPM=!errorlevel!
  where npx
  echo EXIT_CODE_WHERE_NPX=!errorlevel!
  where java
  echo EXIT_CODE_WHERE_JAVA=!errorlevel!
  echo.

  echo ---- Versiones ----
  call node -v
  echo EXIT_CODE_NODE_VERSION=!errorlevel!
  call npm -v
  echo EXIT_CODE_NPM_VERSION=!errorlevel!
  call npx cap --version
  echo EXIT_CODE_CAP_VERSION=!errorlevel!
  call java -version
  echo EXIT_CODE_JAVA_VERSION=!errorlevel!
  echo.

  echo ---- Build APK (build_mobile_apk.bat) ----
  call "%~dp0build_mobile_apk.bat"
  set "BUILD_EXIT=!errorlevel!"
  echo BUILD_EXIT_CODE=!BUILD_EXIT!
  echo.

  echo ---- Resultado APK ----
  if exist "%APK_PATH%" (
    echo APK_GENERADO=SI
    echo APK_PATH=%APK_PATH%
  ) else (
    echo APK_GENERADO=NO
    echo APK_PATH_ESPERADO=%APK_PATH%
  )
  echo.
  echo ===== FIN DEL REPORTE =====
) > "%REPORT%" 2>&1

if exist "%REPORT%" (
  copy /y "%REPORT%" "%DESKTOP_REPORT%" >nul 2>nul
  echo.
  echo Reporte generado en:
  echo %REPORT%
  if exist "%DESKTOP_REPORT%" (
    echo Copia adicional en escritorio:
    echo %DESKTOP_REPORT%
  )
  echo.
  echo Abriendo reporte...
  start "" notepad "%REPORT%"
  echo Comparte el contenido de ese archivo para ayudarte.
) else (
  echo.
  echo No se pudo crear el reporte automatico.
  echo Ejecuta este comando en CMD y comparte salida:
  echo cd /d "%~dp0" ^&^& where node ^& where npm ^& where npx ^& where java ^& node -v ^& npm -v ^& npx cap --version ^& java -version
)
endlocal
