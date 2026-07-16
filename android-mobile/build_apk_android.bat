@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo == FEL POS Mobile APK ==
echo Compilando APK debug...
echo.

where java >nul 2>nul
if errorlevel 1 goto try_android_studio_jdk
goto java_ok

:try_android_studio_jdk
if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" goto use_as_jbr
if exist "%LOCALAPPDATA%\Programs\Android\Android Studio\jbr\bin\java.exe" goto use_local_as_jbr
goto java_missing

:use_as_jbr
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
goto java_home_set

:use_local_as_jbr
set "JAVA_HOME=%LOCALAPPDATA%\Programs\Android\Android Studio\jbr"
goto java_home_set

:java_home_set
set "PATH=!JAVA_HOME!\bin;!PATH!"
echo JAVA_HOME no estaba configurado. Usando JDK de Android Studio:
echo !JAVA_HOME!
echo.
where java >nul 2>nul
if errorlevel 1 goto java_missing
goto java_ok

:java_missing
echo ERROR: No se encontro Java en PATH.
echo Instala Android Studio o JDK 17 y vuelve a intentar.
echo Sugerencia rapida:
echo set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
echo set "PATH=%%JAVA_HOME%%\bin;%%PATH%%"
exit /b 1

:java_ok
call gradlew.bat assembleDebug
if errorlevel 1 goto build_fail

set "APK_PATH=%~dp0app\build\outputs\apk\debug\app-debug.apk"
if not exist "!APK_PATH!" goto apk_missing

echo.
echo [OK] APK generado:
echo !APK_PATH!
explorer /select,"!APK_PATH!"
exit /b 0

:build_fail
echo.
echo ERROR: Fallo la compilacion del APK.
exit /b 1

:apk_missing
echo.
echo ERROR: No se encontro el APK esperado.
echo Buscado en: !APK_PATH!
exit /b 1
