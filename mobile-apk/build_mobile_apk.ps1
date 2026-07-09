$ErrorActionPreference = "Stop"

Write-Host "== FEL POS Mobile APK build ==" -ForegroundColor Cyan

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm no esta instalado. Instala Node.js LTS."
}

Write-Host "1) Instalando dependencias..." -ForegroundColor Yellow
npm install

Write-Host "2) Verificando proyecto Android..." -ForegroundColor Yellow
if (-not (Test-Path ".\android")) {
  npx cap add android
}

Write-Host "3) Sincronizando Capacitor..." -ForegroundColor Yellow
npx cap sync android

Write-Host "4) Generando APK debug..." -ForegroundColor Yellow
Push-Location ".\android"
try {
  .\gradlew.bat assembleDebug
} finally {
  Pop-Location
}

$apkPath = Join-Path $PSScriptRoot "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apkPath) {
  Write-Host "APK generado en: $apkPath" -ForegroundColor Green
} else {
  Write-Host "No se encontro APK esperado en $apkPath" -ForegroundColor Red
  exit 1
}
