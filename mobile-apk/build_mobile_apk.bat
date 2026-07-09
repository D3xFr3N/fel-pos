@echo off
setlocal
cd /d "%~dp0"

echo == FEL POS Mobile APK build ==
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm no esta instalado. Instala Node.js LTS.
  exit /b 1
)

where npx >nul 2>nul
if errorlevel 1 (
  echo ERROR: npx no esta disponible. Reinstala Node.js LTS.
  exit /b 1
)

echo [1/4] Instalando dependencias...
call npm install
if errorlevel 1 goto :fail

echo [2/4] Verificando proyecto Android...
if not exist "android" (
  call npx cap add android
  if errorlevel 1 goto :fail
)

echo [3/4] Sincronizando Capacitor...
call npx cap sync android
if errorlevel 1 goto :fail

echo [4/4] Generando APK debug...
pushd "android"
call gradlew.bat assembleDebug
if errorlevel 1 (
  popd
  goto :fail
)
popd

set "APK_PATH=%~dp0android\app\build\outputs\apk\debug\app-debug.apk"
if exist "%APK_PATH%" (
  echo.
  echo APK generado en:
  echo %APK_PATH%
  exit /b 0
)

echo ERROR: No se encontro el APK esperado.
echo Ruta esperada: %APK_PATH%
exit /b 1

:fail
echo.
echo Fallo la compilacion del APK.
exit /b 1
