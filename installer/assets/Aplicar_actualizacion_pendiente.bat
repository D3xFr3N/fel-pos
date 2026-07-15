@echo off

setlocal EnableExtensions

pushd "%~dp0"



echo ========================================

echo   FEL POS - Aplicar actualizacion

echo ========================================

echo.



if not exist "FELPOS.exe.pending" (

  echo No hay actualizacion pendiente en esta carpeta.

  echo.

  echo Opciones:

  echo   1. Abre FEL POS como admin y ve a Configuracion ^> Actualizar ahora

  echo   2. Ejecuta FELPOS_Setup.exe sobre esta instalacion

  echo   3. Ejecuta Reparar_instalacion.bat si no abre el programa

  echo.

  popd

  pause

  exit /b 1

)



echo Hay archivos pendientes. Cerrando FEL POS si sigue abierto...

set /a tries=0

:wait

set /a tries+=1

tasklist /FI "IMAGENAME eq FELPOS.exe" 2>nul | find /I "FELPOS.exe" >nul

if not errorlevel 1 (

  if %tries% GEQ 60 (

    taskkill /F /IM FELPOS.exe /T >nul 2>&1

    timeout /t 2 >nul

    goto apply

  )

  timeout /t 1 >nul

  goto wait

)



:apply

echo Aplicando actualizacion...

if exist "FELPOS.exe.pending" (

  if exist "FELPOS.exe.old" del /F /Q "FELPOS.exe.old" >nul 2>&1

  if exist "FELPOS.exe" ren "FELPOS.exe" "FELPOS.exe.old"

  ren "FELPOS.exe.pending" "FELPOS.exe"

  if errorlevel 1 (

    echo ERROR al reemplazar FELPOS.exe. Restaurando copia anterior...

    if exist "FELPOS.exe.old" ren "FELPOS.exe.old" "FELPOS.exe"

    popd

    pause

    exit /b 1

  )

  if exist "FELPOS.exe.old" del /F /Q "FELPOS.exe.old" >nul 2>&1

)

if exist "VERSION.pending" move /Y "VERSION.pending" "VERSION" >nul

if exist "BUILD_DATE.pending" move /Y "BUILD_DATE.pending" "BUILD_DATE" >nul

if exist "pending_update.json" del /F /Q "pending_update.json" >nul

if exist "apply_pending_update.bat" del /F /Q "apply_pending_update.bat" >nul



if not exist "FELPOS.exe" (

  echo ERROR: FELPOS.exe no existe despues de aplicar la actualizacion.

  popd

  pause

  exit /b 1

)



echo Listo. Reiniciando FEL POS...

start "" "%~dp0FELPOS.exe"

echo.

popd

pause

