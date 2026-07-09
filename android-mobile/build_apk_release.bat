@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo == FEL POS Mobile APK Release ==
echo Compilando APK release firmada...
echo.

where java >nul 2>nul
if errorlevel 1 (
  if exist "C:\Program Files\Android\Android Studio\jbr" (
    set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
    set "PATH=%JAVA_HOME%\bin;%PATH%"
    echo JAVA_HOME no estaba configurado. Usando JDK de Android Studio:
    echo %JAVA_HOME%
    echo.
  )
)

where java >nul 2>nul
if errorlevel 1 (
  echo ERROR: No se encontro Java en PATH.
  exit /b 1
)

if not exist "%~dp0release-signing.properties" (
  echo ERROR: Falta release-signing.properties
  echo Ejecuta primero:
  echo create_release_keystore.bat
  exit /b 1
)

call gradlew.bat assembleRelease
if errorlevel 1 (
  echo.
  echo ERROR: Fallo la compilacion release.
  exit /b 1
)

set "APK_SIGNED=%~dp0app\build\outputs\apk\release\app-release.apk"
set "APK_UNSIGNED=%~dp0app\build\outputs\apk\release\app-release-unsigned.apk"

if exist "%APK_SIGNED%" (
  set "APK_PATH=%APK_SIGNED%"
) else (
  if exist "%APK_UNSIGNED%" (
    echo ERROR: Se genero APK unsigned. Revisa release-signing.properties
    echo Archivo generado: %APK_UNSIGNED%
    exit /b 1
  )
  echo ERROR: No se encontro APK release.
  exit /b 1
)

echo.
echo APK release firmado:
echo %APK_PATH%

set "DESKTOP_APK=%USERPROFILE%\Desktop\FELPOS-Mobile-release.apk"
copy /y "%APK_PATH%" "%DESKTOP_APK%" >nul 2>nul
if exist "%DESKTOP_APK%" (
  echo Copia en escritorio:
  echo %DESKTOP_APK%
)

echo.
echo Listo para instalar/distribuir.
exit /b 0
