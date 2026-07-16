@echo off
setlocal EnableExtensions
pushd "%~dp0"

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
if errorlevel 1 (
  echo Solicitando permisos de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

echo Otorgando permiso de modificacion a Usuarios en:
echo   %CD%
echo.
icacls "%CD%" /grant *S-1-5-32-545:(OI)(CI)M /T
if errorlevel 1 (
  echo.
  echo ERROR: No se pudieron aplicar los permisos.
  popd
  pause
  exit /b 1
)

echo.
echo [OK] Permisos aplicados. Ya puedes buscar actualizaciones desde FEL POS.
echo.
popd
pause
exit /b 0
