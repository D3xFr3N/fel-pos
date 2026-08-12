@echo off
setlocal EnableExtensions EnableDelayedExpansion
pushd "%~dp0"

REM Arranque seguro post-update (TEMP sin espacios). No depende de VBS viejos.
set "FELPOS_RUNTIME_TMP=C:\Users\Public\FELPOS\runtime-tmp"
if not exist "C:\Users\Public\FELPOS" mkdir "C:\Users\Public\FELPOS" >nul 2>&1
if not exist "!FELPOS_RUNTIME_TMP!" mkdir "!FELPOS_RUNTIME_TMP!" >nul 2>&1
if exist "!FELPOS_RUNTIME_TMP!" goto tmp_ok

for %%I in ("%LOCALAPPDATA%") do set "SHORT_LOCAL=%%~sI"
if defined SHORT_LOCAL if not "!SHORT_LOCAL!"=="!SHORT_LOCAL: =!" set "SHORT_LOCAL="
if defined SHORT_LOCAL (
  set "FELPOS_RUNTIME_TMP=!SHORT_LOCAL!\FELPOS\runtime-tmp"
  if not exist "!SHORT_LOCAL!\FELPOS" mkdir "!SHORT_LOCAL!\FELPOS" >nul 2>&1
  if not exist "!FELPOS_RUNTIME_TMP!" mkdir "!FELPOS_RUNTIME_TMP!" >nul 2>&1
)
if exist "!FELPOS_RUNTIME_TMP!" goto tmp_ok

set "FELPOS_RUNTIME_TMP=C:\FELPOS\runtime-tmp"
if not exist "C:\FELPOS" mkdir "C:\FELPOS" >nul 2>&1
if not exist "!FELPOS_RUNTIME_TMP!" mkdir "!FELPOS_RUNTIME_TMP!" >nul 2>&1

:tmp_ok
if not exist "!FELPOS_RUNTIME_TMP!" (
  echo ERROR: no se pudo crear carpeta temporal segura.
  pause
  popd
  exit /b 1
)
set "TEMP=!FELPOS_RUNTIME_TMP!"
set "TMP=!FELPOS_RUNTIME_TMP!"
for /d %%D in ("!FELPOS_RUNTIME_TMP!\_MEI*") do rmdir /S /Q "%%D" >nul 2>&1
for /d %%D in ("%LOCALAPPDATA%\FELPOS\runtime-tmp\_MEI*") do rmdir /S /Q "%%D" >nul 2>&1

if not exist "FELPOS.exe" (
  echo ERROR: No se encontro FELPOS.exe
  popd
  pause
  exit /b 1
)

start "" "%CD%\FELPOS.exe"
popd
exit /b 0
