# Actualizar_FELPOS.ps1
# Actualizador independiente (onedir): reemplaza FELPOS.exe + _internal sin tocar data\.
# Doble clic en Actualizar_FELPOS.cmd o ejecutar como administrador.

$ErrorActionPreference = "Stop"
$ManifestUrl = if ($env:FELPOS_UPDATE_MANIFEST_URL) {
  $env:FELPOS_UPDATE_MANIFEST_URL
} else {
  "https://D3xFr3N.github.io/fel-pos/latest.json"
}
$PublicDir = "C:\Users\Public\FELPOS"
$LogPath = Join-Path $PublicDir "felpos-update.log"

function Write-Log([string]$Message) {
  try {
    New-Item -ItemType Directory -Force -Path $PublicDir | Out-Null
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -LiteralPath $LogPath -Value $line -ErrorAction SilentlyContinue
    Write-Host $line
  } catch {}
}

function Show-Msg([string]$Text, [string]$Icon = "Information") {
  try {
    Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
    [System.Windows.MessageBox]::Show($Text, "FEL POS - Actualizar", "OK", $Icon) | Out-Null
  } catch {
    Write-Host $Text
  }
}

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Ensure-Admin {
  if (Test-IsAdmin) { return }
  Write-Log "Relanzando como administrador..."
  $self = if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Path }
  $args = "-NoProfile -ExecutionPolicy Bypass -File `"$self`""
  try {
    Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $args -Wait
  } catch {
    Show-Msg "Se necesita permiso de administrador.`n$($_.Exception.Message)" "Error"
    exit 1
  }
  exit 0
}

function Find-InstallDir {
  $candidates = New-Object System.Collections.Generic.List[string]
  foreach ($rootKey in @(
      "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
      "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )) {
    try {
      Get-ItemProperty $rootKey -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like "*FEL POS*" -or $_.DisplayName -like "*FELPOS*" } |
        ForEach-Object {
          if ($_.InstallLocation) { [void]$candidates.Add([string]$_.InstallLocation) }
        }
    } catch {}
  }
  foreach ($dir in @(
      "C:\FELPOS",
      "${env:ProgramFiles(x86)}\FEL POS",
      "$env:ProgramFiles\FEL POS"
    )) {
    if ($dir) { [void]$candidates.Add($dir) }
  }
  foreach ($dir in $candidates) {
    $clean = ($dir -as [string]).Trim().TrimEnd('\')
    if ([string]::IsNullOrWhiteSpace($clean)) { continue }
    if (Test-Path -LiteralPath (Join-Path $clean "FELPOS.exe")) {
      return (Resolve-Path -LiteralPath $clean).Path
    }
  }
  return $null
}

Ensure-Admin
New-Item -ItemType Directory -Force -Path $PublicDir | Out-Null
Write-Log "Actualizador independiente iniciado (onedir)"

try {
  $installDir = Find-InstallDir
  if (-not $installDir) {
    throw "No se encontro FELPOS.exe. Instala primero con FELPOS_Setup.exe."
  }
  Write-Log "InstallDir=$installDir"

  $manifest = Invoke-RestMethod -Uri $ManifestUrl -TimeoutSec 60
  $version = [string]$manifest.version
  $downloadUrl = [string]$manifest.download_url
  $sha256 = [string]$manifest.sha256
  if ([string]::IsNullOrWhiteSpace($version) -or [string]::IsNullOrWhiteSpace($downloadUrl)) {
    throw "Manifiesto invalido"
  }

  $currentVersion = ""
  $versionFile = Join-Path $installDir "VERSION"
  if (Test-Path -LiteralPath $versionFile) {
    $currentVersion = (Get-Content -LiteralPath $versionFile -Raw).Trim()
  }
  Write-Log "Actual=$currentVersion  Publicada=$version"
  if ($currentVersion -eq $version -and (Test-Path -LiteralPath (Join-Path $installDir "_internal"))) {
    Show-Msg "FEL POS ya esta en la version $version (onedir)."
    exit 0
  }

  Get-Process -Name "FELPOS" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2

  $tempRoot = Join-Path $env:TEMP ("felpos-update-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  try {
    $zipPath = Join-Path $tempRoot "felpos-update.zip"
    Write-Log "Descargando $downloadUrl"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -TimeoutSec 900
    if ($sha256) {
      $actual = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLower()
      if ($actual -ne $sha256.ToLower()) { throw "Hash SHA256 no coincide" }
    }

    $extractDir = Join-Path $tempRoot "extracted"
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force
    $exeSource = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter "FELPOS.exe" | Select-Object -First 1
    if (-not $exeSource) { throw "El paquete no contiene FELPOS.exe" }
    $payloadRoot = $exeSource.Directory.FullName
    $internal = Join-Path $payloadRoot "_internal"
    if (-not (Test-Path -LiteralPath $internal)) {
      throw "Paquete incompleto: falta carpeta _internal. Usa FELPOS_Setup.exe v0.6.23+."
    }

    Write-Log "Sincronizando archivos a $installDir (conserva data y .env)"
    $excludeDirs = @("data", "update_backups", "runtime-tmp")
    $excludeFiles = @(".env", "felpos-error.log", "felpos-update.log", "pending_update.json")
    Get-ChildItem -LiteralPath $payloadRoot -Force | ForEach-Object {
      $name = $_.Name
      if ($excludeDirs -contains $name.ToLower()) { return }
      if ($excludeFiles -contains $name.ToLower()) { return }
      $dest = Join-Path $installDir $name
      if ($_.PSIsContainer) {
        if (Test-Path -LiteralPath $dest) {
          Remove-Item -LiteralPath $dest -Recurse -Force -ErrorAction SilentlyContinue
        }
        Copy-Item -LiteralPath $_.FullName -Destination $dest -Recurse -Force
      } else {
        if ($name -eq "FELPOS.exe") {
          $old = Join-Path $installDir "FELPOS.exe.old"
          if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Force -ErrorAction SilentlyContinue }
          if (Test-Path -LiteralPath $dest) {
            Rename-Item -LiteralPath $dest -NewName "FELPOS.exe.old" -ErrorAction SilentlyContinue
          }
        }
        Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
      }
    }

    # Limpia extracciones _MEI viejas (ya no se usan en onedir).
    $meiRoot = Join-Path $PublicDir "runtime-tmp"
    if (Test-Path -LiteralPath $meiRoot) {
      Get-ChildItem -LiteralPath $meiRoot -Directory -Filter "_MEI*" -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }
  } finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }

  if (-not (Test-Path -LiteralPath (Join-Path $installDir "_internal"))) {
    throw "Tras actualizar falta _internal. Reinstala con FELPOS_Setup.exe."
  }

  $runtimeTmp = Join-Path $PublicDir "runtime-tmp"
  New-Item -ItemType Directory -Force -Path $runtimeTmp | Out-Null
  $relaunchVbs = Join-Path $PublicDir "relaunch.vbs"
  $exePath = Join-Path $installDir "FELPOS.exe"
  @"
Option Explicit
Dim app, fso, exePath, workDir
Set app = CreateObject("Shell.Application")
Set fso = CreateObject("Scripting.FileSystemObject")
exePath = "$($exePath.Replace('"','""'))"
workDir = "$($installDir.Replace('"','""'))"
If Not fso.FileExists(exePath) Then
  MsgBox "No se encontro FELPOS.exe", vbCritical, "FEL POS"
  WScript.Quit 1
End If
app.ShellExecute exePath, "", workDir, "open", 1
"@ | Set-Content -LiteralPath $relaunchVbs -Encoding ASCII

  Start-Process -FilePath "wscript.exe" -ArgumentList @("//nologo", $relaunchVbs) | Out-Null
  Write-Log "OK actualizado a v$version (onedir)"
  Show-Msg "Actualizacion aplicada: v$version`nFEL POS se esta abriendo."
  exit 0
}
catch {
  Write-Log ("ERROR: " + $_.Exception.Message)
  Show-Msg ("No se pudo actualizar:`n" + $_.Exception.Message + "`n`nLog: $LogPath") "Error"
  exit 1
}
