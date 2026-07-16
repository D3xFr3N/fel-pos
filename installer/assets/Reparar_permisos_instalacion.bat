@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "SCRIPT_PATH=%~f0"
set "INSTALL_DIR=%~dp0"
pushd "!INSTALL_DIR!"

echo.
echo   FEL POS - Reparar permisos de instalacion
echo   ========================================
echo.
echo Esta carpeta necesita permiso de escritura para actualizarse
echo cuando esta en Program Files.
echo.
echo Se solicitara confirmacion de administrador (UAC).
echo.

net session >nul 2>&1
if errorlevel 1 goto need_admin
goto do_repair

:need_admin
echo Solicitando permisos de administrador...
powershell -NoProfile -Command "Start-Process -FilePath '!SCRIPT_PATH!' -Verb RunAs"
exit /b 0

:do_repair
echo Otorgando permiso de modificacion a Usuarios en:
echo   %CD%
echo.
icacls "%CD%" /grant *S-1-5-32-545:(OI)(CI)M /T
if errorlevel 1 goto repair_fail

echo.
echo [OK] Permisos aplicados. Ya puedes buscar actualizaciones desde FEL POS.
echo.
popd
pause
exit /b 0

:repair_fail
echo.
echo ERROR: No se pudieron aplicar los permisos.
popd
pause
exit /b 1
