param(
    [string]$BaseUrl = "",
    [string]$GitHubOwner = "",
    [string]$GitHubRepo = "fel-pos"
)

if ($GitHubOwner -and -not $BaseUrl) {
    $BaseUrl = "https://$GitHubOwner.github.io/$GitHubRepo"
}

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Get-ProjectVersion {
    return (Get-Content (Join-Path $root "VERSION") -Raw).Trim()
}

$exePath = Join-Path $root "dist\FELPOS.exe"
Write-Host "Generando FELPOS.exe..."
& (Join-Path $root "build_exe.ps1")

$version = Get-ProjectVersion
$buildDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$releaseDir = Join-Path $root "dist\release"
$versionDir = Join-Path $releaseDir $version
$zipName = "felpos-update-$version.zip"
$zipPath = Join-Path $versionDir $zipName

if (Test-Path $versionDir) {
    Remove-Item $versionDir -Recurse -Force
}
New-Item -ItemType Directory -Path $versionDir | Out-Null

$stagingDir = Join-Path $versionDir "package"
New-Item -ItemType Directory -Path $stagingDir | Out-Null
Copy-Item $exePath (Join-Path $stagingDir "FELPOS.exe") -Force
Set-Content (Join-Path $stagingDir "VERSION") $version
Set-Content (Join-Path $stagingDir "BUILD_DATE") $buildDate
$assetsDir = Join-Path $root "installer\assets"
foreach ($assetName in @(
    "Aplicar_actualizacion_pendiente.bat",
    "Reparar_instalacion.bat",
    "Iniciar_FELPOS.bat",
    "Limpiar_actualizacion_pendiente.bat",
    "Diagnostico_instalacion.bat"
)) {
    $assetPath = Join-Path $assetsDir $assetName
    if (Test-Path $assetPath) {
        Copy-Item $assetPath (Join-Path $stagingDir $assetName) -Force
    }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($stagingDir, $zipPath)
Remove-Item $stagingDir -Recurse -Force

$hash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLower()
if ($BaseUrl) {
    $downloadUrl = "$($BaseUrl.TrimEnd('/'))/$version/$zipName"
    $manifestUrl = "$($BaseUrl.TrimEnd('/'))/latest.json"
} else {
    $downloadUrl = "https://TU-SERVIDOR.com/fel-pos/$version/$zipName"
    $manifestUrl = "https://TU-SERVIDOR.com/fel-pos/latest.json"
}

$manifest = [ordered]@{
    version = $version
    build_date = $buildDate
    download_url = $downloadUrl
    sha256 = $hash
    release_notes = "Actualizacion FEL POS v$version"
}
$manifestJson = ($manifest | ConvertTo-Json -Depth 4)
Set-Content (Join-Path $versionDir "latest.json") $manifestJson
Set-Content (Join-Path $releaseDir "latest.json") $manifestJson

Write-Host ""
Write-Host "Paquete de actualizacion listo:"
Write-Host "  $zipPath"
Write-Host "  $(Join-Path $releaseDir 'latest.json')"
Write-Host ""
Write-Host "Sube dist\release\ a tu servidor web y configura en .env de cada tienda:"
Write-Host "  UPDATE_MANIFEST_URL=$manifestUrl"
Write-Host ""
Write-Host "GitHub Pages (recomendado):"
if ($GitHubOwner) {
    Write-Host "  .\publish_github_updates.ps1 -GitHubOwner $GitHubOwner -GitHubRepo $GitHubRepo"
} else {
    Write-Host "  .\publish_github_updates.ps1 -GitHubOwner TU_USUARIO -GitHubRepo fel-pos"
}
Write-Host "  Manifiesto: $manifestUrl"
Write-Host ""
Write-Host "SHA256: $hash"
