@echo off
setlocal EnableExtensions
pushd "%~dp0"
title FEL POS - Activador de licencias
echo.
echo Abriendo activador de licencias FEL POS...
echo  - Genera archivo .felpos-lic vinculado al ID del equipo
echo  - No compartible entre PCs
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0activar_tienda.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
