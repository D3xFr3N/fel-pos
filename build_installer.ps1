$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Get-ProjectVersion {
    $versionFile = Join-Path $root "VERSION"
    if (-not (Test-Path $versionFile)) {
        throw "No se encontro el archivo VERSION en la raiz del proyecto."
    }
    return (Get-Content $versionFile -Raw).Trim()
}

function Write-VersionArtifacts {
    param(
        [Parameter(Mandatory = $true)]
        [string]$TargetDir
    )
    $version = Get-ProjectVersion
    $buildDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Set-Content (Join-Path $TargetDir "VERSION") $version
    Set-Content (Join-Path $TargetDir "BUILD_DATE") $buildDate
    return @{
        Version = $version
        BuildDate = $buildDate
    }
}

function Find-InnoSetupCompiler {
    $candidates = @(
        ${env:INNO_SETUP_ISCC},
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    ) | Where-Object { $_ -and (Test-Path $_) }
    return $candidates | Select-Object -First 1
}

function Prepare-Staging {
    $staging = Join-Path $root "installer\staging"
    $assets = Join-Path $root "installer\assets"
    $exePath = Join-Path $root "dist\FELPOS.exe"

    if (-not (Test-Path $exePath)) {
        throw "No se encontro dist\FELPOS.exe. Ejecuta primero build_exe.ps1"
    }

    if (Test-Path $staging) {
        Remove-Item $staging -Recurse -Force
    }
    New-Item -ItemType Directory -Path $staging | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $staging "data\backups") -Force | Out-Null

    Copy-Item $exePath (Join-Path $staging "FELPOS.exe") -Force
    Copy-Item (Join-Path $root ".env.example") (Join-Path $staging ".env.example") -Force
    Copy-Item (Join-Path $assets "*") $staging -Force
    $versionInfo = Write-VersionArtifacts -TargetDir $staging
    Write-Host "[OK] Carpeta staging lista: $staging"
    Write-Host "[OK] Version instalador: $($versionInfo.Version)"
    return $versionInfo
}

Write-Host "=== FEL POS - Generador de instalador ==="
Write-Host ""

$exePath = Join-Path $root "dist\FELPOS.exe"
if (-not (Test-Path $exePath)) {
    Write-Host "Generando FELPOS.exe (PyInstaller)..."
    & (Join-Path $root "build_exe.ps1")
}

$versionInfo = Prepare-Staging

$iscc = Find-InnoSetupCompiler
if ($iscc) {
    Write-Host "Compilando instalador con Inno Setup..."
    & $iscc "/DMyAppVersion=$($versionInfo.Version)" (Join-Path $root "installer\FELPOS_installer.iss")
    $setupPath = Join-Path $root "dist\FELPOS_Setup.exe"
    if (Test-Path $setupPath) {
        Write-Host ""
        Write-Host "Listo. Instalador generado en:"
        Write-Host "  $setupPath"
        Write-Host "  Version: $($versionInfo.Version)"
        exit 0
    }
    throw "Inno Setup termino pero no se encontro dist\FELPOS_Setup.exe"
}

Write-Host ""
Write-Host "[AVISO] Inno Setup no esta instalado."
Write-Host "Instala Inno Setup 6 desde:"
Write-Host "  https://jrsoftware.org/isdl.php"
Write-Host ""
Write-Host "Luego vuelve a ejecutar:"
Write-Host "  .\build_installer.ps1"
Write-Host ""
Write-Host "Mientras tanto, puedes distribuir manualmente la carpeta:"
Write-Host "  installer\staging"
Write-Host "  (incluye FELPOS.exe y archivos de instalacion)"
exit 2
