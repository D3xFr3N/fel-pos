@echo off
setlocal EnableExtensions
pushd "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0activar_tienda.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
