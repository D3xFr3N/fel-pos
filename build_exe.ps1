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
if (Test-Path ".\dist") {
  Remove-Item ".\dist" -Recurse -Force
}

Write-Host "Generando EXE..."
$args = @(
  "-m", "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onefile",
  "--noconsole",
  "--name", "FELPOS",
  "--add-data", "static;static",
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
