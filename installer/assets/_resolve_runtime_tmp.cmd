@echo off
REM Resuelve TEMP sin espacios para PyInstaller.
REM Uso: call "%~dp0_resolve_runtime_tmp.cmd"
set "FELPOS_RUNTIME_TMP=C:\Users\Public\FELPOS\runtime-tmp"
if not exist "C:\Users\Public\FELPOS" mkdir "C:\Users\Public\FELPOS" >nul 2>&1
if not exist "!FELPOS_RUNTIME_TMP!" mkdir "!FELPOS_RUNTIME_TMP!" >nul 2>&1
if exist "!FELPOS_RUNTIME_TMP!" goto runtime_tmp_ok

for %%I in ("%LOCALAPPDATA%") do set "SHORT_LOCAL=%%~sI"
if defined SHORT_LOCAL if not "!SHORT_LOCAL!"=="!SHORT_LOCAL: =!" set "SHORT_LOCAL="
if defined SHORT_LOCAL (
  set "FELPOS_RUNTIME_TMP=!SHORT_LOCAL!\FELPOS\runtime-tmp"
  if not exist "!SHORT_LOCAL!\FELPOS" mkdir "!SHORT_LOCAL!\FELPOS" >nul 2>&1
  if not exist "!FELPOS_RUNTIME_TMP!" mkdir "!FELPOS_RUNTIME_TMP!" >nul 2>&1
)
if exist "!FELPOS_RUNTIME_TMP!" goto runtime_tmp_ok

set "FELPOS_RUNTIME_TMP=C:\FELPOS\runtime-tmp"
if not exist "C:\FELPOS" mkdir "C:\FELPOS" >nul 2>&1
if not exist "!FELPOS_RUNTIME_TMP!" mkdir "!FELPOS_RUNTIME_TMP!" >nul 2>&1

:runtime_tmp_ok
if exist "!FELPOS_RUNTIME_TMP!" set "TEMP=!FELPOS_RUNTIME_TMP!"
if exist "!FELPOS_RUNTIME_TMP!" set "TMP=!FELPOS_RUNTIME_TMP!"
for /d %%D in ("!FELPOS_RUNTIME_TMP!\_MEI*") do rmdir /S /Q "%%D" >nul 2>&1
for /d %%D in ("%LOCALAPPDATA%\FELPOS\runtime-tmp\_MEI*") do rmdir /S /Q "%%D" >nul 2>&1
for /d %%D in ("%LOCALAPPDATA%\Temp\_MEI*") do rmdir /S /Q "%%D" >nul 2>&1
for /d %%D in ("%ProgramData%\FELPOS\runtime-tmp\_MEI*") do rmdir /S /Q "%%D" >nul 2>&1
for /d %%D in ("%LOCALAPPDATA%\FEL POS\tmp\_MEI*") do rmdir /S /Q "%%D" >nul 2>&1
