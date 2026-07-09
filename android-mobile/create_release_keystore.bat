@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo == FEL POS Release Keystore ==
echo.

where java >nul 2>nul
if errorlevel 1 (
  if exist "C:\Program Files\Android\Android Studio\jbr" (
    set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
    set "PATH=%JAVA_HOME%\bin;%PATH%"
  )
)

where java >nul 2>nul
if errorlevel 1 (
  echo ERROR: No se encontro Java.
  echo Instala Android Studio o JDK 17.
  exit /b 1
)

set "KEYSTORE_DIR=%~dp0keystore"
set "KEYSTORE_PATH=%KEYSTORE_DIR%\felpos-release.jks"
set "ALIAS=felpos"

if not exist "%KEYSTORE_DIR%" mkdir "%KEYSTORE_DIR%"

if exist "%KEYSTORE_PATH%" (
  set /p OVERWRITE=Ya existe keystore. Escribe si para sobrescribir: 
  if /I not "%OVERWRITE%"=="si" (
    echo Operacion cancelada.
    exit /b 1
  )
  del /f /q "%KEYSTORE_PATH%" >nul 2>nul
)

set /p STORE_PASS=Ingresa clave del keystore (min 6):
if "%STORE_PASS%"=="" (
  echo ERROR: clave vacia.
  exit /b 1
)
set /p KEY_PASS=Ingresa clave de la llave (Enter para usar la misma):
if "%KEY_PASS%"=="" set "KEY_PASS=%STORE_PASS%"

echo.
echo Creando keystore...
call keytool -genkeypair -v ^
  -keystore "%KEYSTORE_PATH%" ^
  -storepass "%STORE_PASS%" ^
  -keypass "%KEY_PASS%" ^
  -alias "%ALIAS%" ^
  -keyalg RSA ^
  -keysize 2048 ^
  -validity 3650 ^
  -dname "CN=FEL POS, OU=POS, O=FEL POS, L=Guatemala, ST=Guatemala, C=GT"
if errorlevel 1 (
  echo ERROR: No se pudo crear keystore.
  exit /b 1
)

set "SIGNING_FILE=%~dp0release-signing.properties"
(
  echo storeFile=keystore/felpos-release.jks
  echo storePassword=%STORE_PASS%
  echo keyAlias=%ALIAS%
  echo keyPassword=%KEY_PASS%
) > "%SIGNING_FILE%"

echo.
echo Keystore y firma listos.
echo Archivo: %SIGNING_FILE%
exit /b 0
