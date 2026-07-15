@echo off
setlocal EnableExtensions
pushd "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0manage_licenses.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
