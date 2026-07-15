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

if (Test-Path ".\build") {
  Remove-Item ".\build" -Recurse -Force
}
# Limpia solo el EXE/artefactos PyInstaller; conserva instalador y paquetes de release
foreach ($name in @("FELPOS.exe", "FELPOS", "helper")) {
  $target = Join-Path ".\dist" $name
  if (Test-Path $target) {
    Remove-Item $target -Recurse -Force
  }
}
if (-not (Test-Path ".\dist")) {
  New-Item -ItemType Directory -Path ".\dist" | Out-Null
}

Write-Host "Generando EXE..."
$iconPath = Join-Path $root "installer\assets\felpos.ico"
$args = @(
  "-m", "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onefile",
  "--noconsole",
  "--noupx",
  "--runtime-tmpdir", ".",
  "--name", "FELPOS",
  "--add-data", "static;static"
)
if (Test-Path $iconPath) {
  $args += @("--icon", $iconPath)
}
if (Test-Path ".\app\license_public.pem") {
  $args += @("--add-data", "app\license_public.pem;app")
}
$args += @(
  "--collect-submodules", "app",
  "--hidden-import", "app.main",
  "--hidden-import", "webview.platforms.edgechromium",
  "--hidden-import", "win32print",
  "--hidden-import", "pywintypes",
  "--hidden-import", "win32timezone",
  "--collect-all", "webview",
  "--collect-all", "fastapi",
  "--collect-all", "pydantic",
  "--collect-all", "sqlalchemy",
  "--collect-all", "tzdata",
  ".\fel_pos_launcher.py"
)

if (Test-Path ".\.env") {
  $args += @("--add-data", ".env;.env")
}

& $python @args

$versionFile = Join-Path $root "VERSION"
if (Test-Path $versionFile) {
  $version = (Get-Content $versionFile -Raw).Trim()
  $buildDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Set-Content (Join-Path $root "dist\VERSION") $version
  Set-Content (Join-Path $root "dist\BUILD_DATE") $buildDate
  Write-Host "Version empaquetada: $version ($buildDate)"
}

Write-Host ""
Write-Host "Listo. EXE generado en: $root\dist\FELPOS.exe"
