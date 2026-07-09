param(
    [string]$GitHubOwner = "D3xFr3N",
    [string]$GitHubRepo = "fel-pos",
    [switch]$SkipPublish
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Require-Command {
    param([string]$Name, [string]$InstallHint)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "No se encontro '$Name'. $InstallHint"
    }
}

Require-Command git "Instala Git for Windows: https://git-scm.com/download/win y reinicia la terminal."
Require-Command gh "Instala GitHub CLI: https://cli.github.com/ y ejecuta: gh auth login"

if (-not (git config user.name 2>$null)) {
    git config user.name $GitHubOwner | Out-Null
}
if (-not (git config user.email 2>$null)) {
    git config user.email "$GitHubOwner@users.noreply.github.com" | Out-Null
}

if (Test-Path (Join-Path $root ".env")) {
    Write-Host "AVISO: .env existe localmente y NO se subira (esta en .gitignore)."
}

if (-not (Test-Path (Join-Path $root ".git"))) {
    Write-Host "Inicializando repositorio git..."
    git init | Out-Host
    git branch -M main | Out-Host
}

$status = git status --porcelain
if ($status) {
    Write-Host "Creando commit inicial..."
    git add -A
    git commit -m "FEL POS Guatemala v0.3.5" | Out-Host
} else {
    Write-Host "No hay cambios pendientes para commit."
}

$repoExists = $false
try {
    gh repo view "$GitHubOwner/$GitHubRepo" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $repoExists = $true }
} catch {
    $repoExists = $false
}

if (-not $repoExists) {
    Write-Host "Creando repo publico $GitHubOwner/$GitHubRepo en GitHub..."
    gh repo create $GitHubRepo --public --source . --remote origin --push --description "FEL POS Guatemala - punto de venta con facturacion electronica"
} else {
    Write-Host "El repo $GitHubOwner/$GitHubRepo ya existe."
    $hasOrigin = git remote get-url origin 2>$null
    if (-not $hasOrigin) {
        git remote add origin "https://github.com/$GitHubOwner/$GitHubRepo.git" | Out-Host
    }
    git push -u origin main | Out-Host
}

Write-Host ""
Write-Host "Repo listo: https://github.com/$GitHubOwner/$GitHubRepo"
Write-Host ""

if (-not $SkipPublish) {
    & (Join-Path $root "publish_github_updates.ps1") -GitHubOwner $GitHubOwner -GitHubRepo $GitHubRepo -SkipBuild
}

Write-Host ""
Write-Host "Configura en cada tienda:"
Write-Host "  UPDATE_MANIFEST_URL=https://$GitHubOwner.github.io/$GitHubRepo/latest.json"
Write-Host ""
Write-Host "Activa GitHub Pages si aun no lo hiciste:"
Write-Host "  https://github.com/$GitHubOwner/$GitHubRepo/settings/pages"
Write-Host "  Branch: gh-pages / (root)"
Write-Host ""
