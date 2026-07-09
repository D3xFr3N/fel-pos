@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo == FEL POS Mobile APK ==
echo Compilando APK debug...
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
  echo Instala Android Studio o JDK 17 y vuelve a intentar.
  echo Sugerencia rapida:
  echo set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
  echo set "PATH=%%JAVA_HOME%%\bin;%%PATH%%"
  exit /b 1
)

call gradlew.bat assembleDebug
if errorlevel 1 (
  echo.
  echo ERROR: Fallo la compilacion del APK.
  exit /b 1
)

set "APK_PATH=%~dp0app\build\outputs\apk\debug\app-debug.apk"
if not exist "%APK_PATH%" (
  echo.
  echo ERROR: No se encontro el APK esperado.
  echo Ruta esperada: %APK_PATH%
  exit /b 1
)

echo.
echo APK generado:
echo %APK_PATH%

set "DESKTOP_APK=%USERPROFILE%\Desktop\FELPOS-Mobile-debug.apk"
copy /y "%APK_PATH%" "%DESKTOP_APK%" >nul 2>nul
if exist "%DESKTOP_APK%" (
  echo Copia en escritorio:
  echo %DESKTOP_APK%
)

echo.
echo Listo para instalar en Android.
exit /b 0
