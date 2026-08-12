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

Write-Host "Generando EXE con FELPOS.spec..."
& $python -m PyInstaller --noconfirm --clean ".\FELPOS.spec"
if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller fallo con codigo $LASTEXITCODE"
}

$exePath = Join-Path $root "dist\FELPOS.exe"
if (-not (Test-Path $exePath)) {
  throw "No se genero dist\FELPOS.exe"
}

$toc = Join-Path $root "build\FELPOS\EXE-00.toc"
if (Test-Path $toc) {
  $tocText = Get-Content $toc -Raw
  if ($tocText -notmatch "_pydantic_core") {
    throw "El EXE no incluye _pydantic_core."
  }
  if ($tocText -notmatch "_sqlite3") {
    throw "El EXE no incluye _sqlite3."
  }
  if ($tocText -notmatch "unicodedata") {
    throw "El EXE no incluye unicodedata."
  }
  Write-Host "[OK] TOC incluye _pydantic_core, _sqlite3 y unicodedata"
}

$versionFile = Join-Path $root "VERSION"
if (Test-Path $versionFile) {
  $version = (Get-Content $versionFile -Raw).Trim()
  $buildDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Set-Content (Join-Path $root "dist\VERSION") $version
  Set-Content (Join-Path $root "dist\BUILD_DATE") $buildDate
  Write-Host "Version empaquetada: $version ($buildDate)"
}

# Smoke: arranca el EXE unos segundos y busca el ModuleNotFoundError tipico.
Write-Host "Probando arranque de FELPOS.exe..."
$tmp = Join-Path $env:LOCALAPPDATA "FELPOS\runtime-tmp"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$errLog = Join-Path $root "dist\felpos-error.log"
if (Test-Path $errLog) { Remove-Item $errLog -Force }
$stdout = Join-Path $root "dist\_smoke_out.txt"
$stderr = Join-Path $root "dist\_smoke_err.txt"
$env:TEMP = $tmp
$env:TMP = $tmp
$env:FELPOS_RUNTIME_TMP = $tmp
$proc = Start-Process -FilePath $exePath -WorkingDirectory (Join-Path $root "dist") -PassThru `
  -RedirectStandardOutput $stdout -RedirectStandardError $stderr
Start-Sleep -Seconds 6
if (-not $proc.HasExited) {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Write-Host "[OK] EXE arranco sin caer en 6s"
} else {
  $errText = ""
  if (Test-Path $errLog) { $errText += Get-Content $errLog -Raw }
  if (Test-Path $stderr) { $errText += Get-Content $stderr -Raw }
  if ($errText -match "pydantic_core\._pydantic_core|_sqlite3|unicodedata|cryptography\.hazmat\.bindings\._rust") {
    throw "Smoke fallido: sigue faltando modulo nativo"
  }
  if ($errText -match "ModuleNotFoundError|Traceback") {
    Write-Host $errText
    throw "Smoke fallido: el EXE corto con error de import"
  }
  Write-Host "[AVISO] EXE salio pronto (code=$($proc.ExitCode)); revisa logs si no abre la UI"
}

Write-Host ""
Write-Host "Listo. EXE generado en: $root\dist\FELPOS.exe"
