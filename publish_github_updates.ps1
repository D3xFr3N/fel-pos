param(
    [Parameter(Mandatory = $true)]
    [string]$GitHubOwner,

    [string]$GitHubRepo = "fel-pos",

    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "No se encontro '$Name' en PATH. Instala Git for Windows y GitHub CLI (gh), reinicia la terminal e intenta de nuevo."
    }
}

Require-Command git
Require-Command gh

if (-not $SkipBuild) {
    & (Join-Path $root "build_update_release.ps1") -GitHubOwner $GitHubOwner -GitHubRepo $GitHubRepo
}

$releaseDir = Join-Path $root "dist\release"
if (-not (Test-Path (Join-Path $releaseDir "latest.json"))) {
    throw "No existe dist\release\latest.json. Ejecuta build_update_release.ps1 primero."
}

$manifestUrl = "https://$GitHubOwner.github.io/$GitHubRepo/latest.json"
$pagesWorktree = Join-Path $root ".gh-pages-worktree"

Write-Host ""
Write-Host "Publicando actualizacion en GitHub Pages..."
Write-Host "  Repo: $GitHubOwner/$GitHubRepo"
Write-Host "  Manifiesto: $manifestUrl"
Write-Host ""

$hasGhPages = $false
$branches = git branch -a 2>$null
if ($branches -match "gh-pages") {
    $hasGhPages = $true
}

if (Test-Path $pagesWorktree) {
    Remove-Item $pagesWorktree -Recurse -Force
}

if ($hasGhPages) {
    git fetch origin gh-pages | Out-Host
    git worktree add $pagesWorktree gh-pages | Out-Host
} else {
    git worktree add --detach $pagesWorktree | Out-Host
    Set-Location $pagesWorktree
    git checkout --orphan gh-pages | Out-Host
    git rm -rf . 2>$null | Out-Null
    Set-Location $root
}

Get-ChildItem $pagesWorktree -Force | Where-Object { $_.Name -ne ".git" } | ForEach-Object {
    if ($_.Name -eq "latest.json") {
        Remove-Item $_.FullName -Force
    }
}

$version = (Get-Content (Join-Path $root "VERSION") -Raw).Trim()
$versionSourceDir = Join-Path $releaseDir $version
if (-not (Test-Path $versionSourceDir)) {
    throw "No existe dist\release\$version. Ejecuta build_update_release.ps1 primero."
}

Copy-Item (Join-Path $releaseDir "latest.json") $pagesWorktree -Force
$legacyRegistry = Join-Path $pagesWorktree "license-registry.json"
if (Test-Path $legacyRegistry) {
    Remove-Item $legacyRegistry -Force
    Write-Host "  Registro publico de licencias eliminado (ahora privado)."
}
$targetVersionDir = Join-Path $pagesWorktree $version
if (Test-Path $targetVersionDir) {
    Remove-Item $targetVersionDir -Recurse -Force
}
Copy-Item $versionSourceDir $targetVersionDir -Recurse -Force

Set-Location $pagesWorktree
git add -A
$status = git status --porcelain
if (-not $status) {
    Write-Host "No hay cambios nuevos para publicar."
} else {
    git commit -m "Publicar actualizacion FEL POS v$version" | Out-Host
    git push -u origin gh-pages | Out-Host
    Write-Host ""
    Write-Host "Publicado en gh-pages."
}

Set-Location $root
if (Test-Path $pagesWorktree) {
    git worktree remove $pagesWorktree --force 2>$null
    if ($LASTEXITCODE -ne 0) {
        Remove-Item $pagesWorktree -Recurse -Force
    }
}

Write-Host ""
Write-Host "Configura en cada tienda (.env o Configuracion):"
Write-Host "  UPDATE_MANIFEST_URL=$manifestUrl"
Write-Host "  STORE_LICENSE_KEY=<clave entregada por tienda>"
Write-Host ""
Write-Host "Gestion de licencias (solo desarrollador):"
Write-Host "  .\manage_licenses.ps1 -Action New -StoreLabel `"Tienda Centro`""
Write-Host "  .\manage_licenses.ps1 -Action Revoke -LicenseKey FELPOS-XXXX-XXXX-XXXX-XXXX"
Write-Host "  .\manage_licenses.ps1 -Action Publish"
Write-Host ""
Write-Host "Si es la primera vez, activa GitHub Pages en el repo:"
Write-Host "  Settings -> Pages -> Branch: gh-pages / (root)"
Write-Host "  URL final: https://$GitHubOwner.github.io/$GitHubRepo/"
Write-Host ""
