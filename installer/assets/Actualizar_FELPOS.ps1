# Actualizar_FELPOS.ps1
# Actualizador independiente: descarga la ultima version y reemplaza FELPOS.exe.
# Doble clic en Actualizar_FELPOS.cmd o:
#   powershell -NoProfile -ExecutionPolicy Bypass -File Actualizar_FELPOS.ps1

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
    Show-Msg "Se necesita permiso de administrador para actualizar FEL POS.`n$($_.Exception.Message)" "Error"
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
          if ($_.InstallDir) { [void]$candidates.Add([string]$_.InstallDir) }
          if ($_.DisplayIcon) {
            $icon = [string]$_.DisplayIcon
            if ($icon -match '^(.*FELPOS\.exe)') {
              [void]$candidates.Add([System.IO.Path]::GetDirectoryName($Matches[1].Trim('"')))
            }
          }
        }
    } catch {}
  }

  foreach ($dir in @(
      "${env:ProgramFiles(x86)}\FEL POS",
      "$env:ProgramFiles\FEL POS",
      "C:\FELPOS",
      "C:\Program Files (x86)\FEL POS",
      "C:\Program Files\FEL POS"
    )) {
    if ($dir) { [void]$candidates.Add($dir) }
  }

  foreach ($dir in $candidates) {
    $clean = ($dir -as [string]).Trim().TrimEnd('\')
    if ([string]::IsNullOrWhiteSpace($clean)) { continue }
    $exe = Join-Path $clean "FELPOS.exe"
    if (Test-Path -LiteralPath $exe) {
      return (Resolve-Path -LiteralPath $clean).Path
    }
  }
  return $null
}

Ensure-Admin
New-Item -ItemType Directory -Force -Path $PublicDir | Out-Null
Write-Log "Actualizador independiente iniciado (admin)"
Write-Log "Manifest=$ManifestUrl"

try {
  $installDir = Find-InstallDir
  if (-not $installDir) {
    throw "No se encontro FELPOS.exe. Instala primero con FELPOS_Setup.exe."
  }
  Write-Log "InstallDir=$installDir"

  Write-Log "Consultando manifiesto..."
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

  if ($currentVersion -eq $version) {
    Show-Msg "FEL POS ya esta en la version $version."
    exit 0
  }

  # Cerrar app
  Get-Process -Name "FELPOS" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2

  $tempRoot = Join-Path $env:TEMP ("felpos-update-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  try {
    $zipPath = Join-Path $tempRoot "felpos-update.zip"
    Write-Log "Descargando $downloadUrl"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -TimeoutSec 600

    if ($sha256) {
      $actual = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLower()
      if ($actual -ne $sha256.ToLower()) {
        throw "Hash SHA256 no coincide"
      }
    }

    $extractDir = Join-Path $tempRoot "extracted"
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force
    $exeSource = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter "FELPOS.exe" | Select-Object -First 1
    if (-not $exeSource) { throw "El paquete no contiene FELPOS.exe" }
    if ($exeSource.Length -lt 15000000) {
      throw "FELPOS.exe incompleto ($($exeSource.Length) bytes)"
    }

    $exe = Join-Path $installDir "FELPOS.exe"
    $old = Join-Path $installDir "FELPOS.exe.old"
    $pending = Join-Path $installDir "FELPOS.exe.pending"

    Copy-Item -LiteralPath $exeSource.FullName -Destination $pending -Force
    if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Force }
    if (Test-Path -LiteralPath $exe) { Rename-Item -LiteralPath $exe -NewName "FELPOS.exe.old" }
    Rename-Item -LiteralPath $pending -NewName "FELPOS.exe"
    Write-Log "FELPOS.exe reemplazado"

    foreach ($name in @("VERSION", "BUILD_DATE")) {
      $src = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter $name -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($src) {
        Copy-Item -LiteralPath $src.FullName -Destination (Join-Path $installDir $name) -Force
      }
    }

    # Copiar helpers utiles
    foreach ($name in @("Actualizar_FELPOS.ps1", "Reparar_instalacion.bat", "Aplicar_actualizacion_pendiente.bat")) {
      $src = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter $name -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($src) {
        try { Copy-Item -LiteralPath $src.FullName -Destination (Join-Path $installDir $name) -Force } catch {}
      }
    }
  } finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }

  $runtimeTmp = Join-Path $PublicDir "runtime-tmp"
  New-Item -ItemType Directory -Force -Path $runtimeTmp | Out-Null
  $relaunchVbs = Join-Path $PublicDir "relaunch.vbs"
  $exePath = Join-Path $installDir "FELPOS.exe"
  @"
Option Explicit
Dim app, fso, exePath, workDir, tmpDir, shell
Set shell = CreateObject("WScript.Shell")
Set app = CreateObject("Shell.Application")
Set fso = CreateObject("Scripting.FileSystemObject")
exePath = "$($exePath.Replace('"','""'))"
workDir = "$($installDir.Replace('"','""'))"
tmpDir = "$runtimeTmp"
If Not fso.FolderExists(tmpDir) Then fso.CreateFolder tmpDir
shell.CurrentDirectory = workDir
shell.Environment("PROCESS")("TEMP") = tmpDir
shell.Environment("PROCESS")("TMP") = tmpDir
app.ShellExecute exePath, "", workDir, "open", 1
"@ | Set-Content -LiteralPath $relaunchVbs -Encoding ASCII

  Start-Sleep -Seconds 1
  Start-Process -FilePath "wscript.exe" -ArgumentList @("//nologo", $relaunchVbs) | Out-Null
  Write-Log "OK actualizado a v$version"
  Show-Msg "Actualizacion aplicada: v$version`nFEL POS se esta abriendo."
  exit 0
}
catch {
  Write-Log ("ERROR: " + $_.Exception.Message)
  Show-Msg ("No se pudo actualizar:`n" + $_.Exception.Message + "`n`nRevisa:`n$LogPath") "Error"
  exit 1
}
