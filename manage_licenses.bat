@echo off
setlocal EnableExtensions
pushd "%~dp0"
title FEL POS - Licencias

if "%~1"=="" goto help

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0manage_licenses.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%

:help
echo.
echo FEL POS - Gestion de licencias (linea de comandos)
echo.
echo IMPORTANTE:
echo   - Se genera un archivo .felpos-lic (NO el .txt)
echo   - Debes indicar -Fingerprint (ID del equipo)
echo   - Asi la licencia NO sirve en otra PC
echo.
echo Ejemplos:
echo   manage_licenses.bat -Action New -StoreLabel "Tienda Centro" -Fingerprint "XXXXXXXXXXXXXXXX"
echo   manage_licenses.bat -Action Reissue -StoreId CENTRO -Fingerprint "XXXXXXXXXXXXXXXX"
echo   manage_licenses.bat -Action List
echo   manage_licenses.bat -Action Revoke -StoreId CENTRO
echo.
echo Menu interactivo:
echo   activar_tienda.bat
echo.
echo Archivos en:
echo   licenses\activaciones\
echo.
pause
popd
exit /b 0
