$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$python = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
  throw "No se encontro .venv\Scripts\python.exe. Crea el entorno virtual primero."
}

Write-Host "Instalando/actualizando PyInstaller..."
& $python -m pip install pyinstaller | Out-Host
Write-Host "Instalando dependencias del proyecto..."
& $python -m pip install -r ".\requirements.txt" | Out-Host

Get-Process FELPOS -ErrorAction SilentlyContinue | Stop-Process -Force

if (Test-Path ".\build") {
  Remove-Item ".\build" -Recurse -Force
}
foreach ($name in @("FELPOS.exe", "FELPOS", "helper")) {
  $target = Join-Path ".\dist" $name
  if (Test-Path $target) {
    Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue
  }
}
if (-not (Test-Path ".\dist")) {
  New-Item -ItemType Directory -Path ".\dist" | Out-Null
}

$pyd = Get-ChildItem (Join-Path $root ".venv\Lib\site-packages\pydantic_core\_pydantic_core*.pyd") -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pyd) {
  throw "No se encontro _pydantic_core*.pyd en el venv."
}
Write-Host "pydantic_core nativo: $($pyd.Name)"

Write-Host "Generando carpeta onedir con FELPOS.spec..."
& $python -m PyInstaller --noconfirm --clean ".\FELPOS.spec"
if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller fallo con codigo $LASTEXITCODE"
}

$appDir = Join-Path $root "dist\FELPOS"
$exePath = Join-Path $appDir "FELPOS.exe"
if (-not (Test-Path $exePath)) {
  throw "No se genero dist\FELPOS\FELPOS.exe"
}
$internal = Join-Path $appDir "_internal"
if (-not (Test-Path $internal)) {
  throw "No se genero dist\FELPOS\_internal (onedir incompleto)."
}
$pyDll = Get-ChildItem $internal -Filter "python312.dll" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pyDll) {
  throw "No se encontro python312.dll dentro de _internal."
}

# NUNCA copiar FELPOS.exe suelto a dist\: el onedir exige
# dist\FELPOS\FELPOS.exe junto a dist\FELPOS\_internal\.
# Un EXE en dist\ busca dist\_internal\ y falla con python312.dll.
$orphanExe = Join-Path $root "dist\FELPOS.exe"
if (Test-Path $orphanExe) {
  Remove-Item $orphanExe -Force -ErrorAction SilentlyContinue
}
$launcherCmd = Join-Path $root "dist\Abrir_FELPOS.cmd"
@(
  "@echo off"
  "setlocal"
  "cd /d ""%~dp0FELPOS"""
  "if not exist ""FELPOS.exe"" ("
  "  echo No se encontro dist\FELPOS\FELPOS.exe"
  "  pause"
  "  exit /b 1"
  ")"
  "if not exist ""_internal\python312.dll"" ("
  "  echo Falta _internal. Compila de nuevo con build_exe.ps1 / build_installer.ps1"
  "  pause"
  "  exit /b 1"
  ")"
  "start """" ""FELPOS.exe"""
) | Set-Content -Path $launcherCmd -Encoding ASCII

$versionFile = Join-Path $root "VERSION"
if (Test-Path $versionFile) {
  $version = (Get-Content $versionFile -Raw).Trim()
  $buildDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Set-Content (Join-Path $appDir "VERSION") $version
  Set-Content (Join-Path $appDir "BUILD_DATE") $buildDate
  Set-Content (Join-Path $root "dist\VERSION") $version
  Set-Content (Join-Path $root "dist\BUILD_DATE") $buildDate
  Write-Host "Version empaquetada: $version ($buildDate)"
}

Write-Host "Probando arranque de FELPOS.exe (onedir)..."
$errLog = Join-Path $appDir "felpos-error.log"
if (Test-Path $errLog) { Remove-Item $errLog -Force }
$stdout = Join-Path $root "dist\_smoke_out.txt"
$stderr = Join-Path $root "dist\_smoke_err.txt"
$proc = Start-Process -FilePath $exePath -WorkingDirectory $appDir -PassThru `
  -RedirectStandardOutput $stdout -RedirectStandardError $stderr
Start-Sleep -Seconds 8
if (-not $proc.HasExited) {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Write-Host "[OK] EXE arranco sin caer en 8s"
} else {
  $errText = ""
  if (Test-Path $errLog) { $errText += Get-Content $errLog -Raw }
  if (Test-Path $stderr) { $errText += Get-Content $stderr -Raw }
  if ($errText -match "Failed to load Python DLL|ModuleNotFoundError|Traceback") {
    Write-Host $errText
    throw "Smoke fallido: el EXE corto con error de arranque"
  }
  Write-Host "[AVISO] EXE salio pronto (code=$($proc.ExitCode)); revisa logs si no abre la UI"
}

Write-Host ""
Write-Host "Listo. App onedir en: $appDir"
Write-Host "  EXE: $exePath"
