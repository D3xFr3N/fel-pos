# Actualizar_FELPOS.ps1
# Actualizador independiente de FEL POS (no depende de la version instalada).
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File Actualizar_FELPOS.ps1
# O desde GitHub Pages:
#   irm https://D3xFr3N.github.io/fel-pos/tools/Actualizar_FELPOS.ps1 | iex

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

function Find-InstallDir {
  $candidates = @(
    "${env:ProgramFiles(x86)}\FEL POS",
    "$env:ProgramFiles\FEL POS",
    "C:\FELPOS",
    "C:\Program Files (x86)\FEL POS",
    "C:\Program Files\FEL POS"
  )
  foreach ($dir in $candidates) {
    if ([string]::IsNullOrWhiteSpace($dir)) { continue }
    $exe = Join-Path $dir "FELPOS.exe"
    if (Test-Path -LiteralPath $exe) {
      return (Resolve-Path -LiteralPath $dir).Path
    }
  }
  return $null
}

function Test-DirWritable([string]$Path) {
  try {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
    $probe = Join-Path $Path (".felpos_write_test_" + $PID)
    Set-Content -LiteralPath $probe -Value "ok" -ErrorAction Stop
    Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
    return $true
  } catch {
    return $false
  }
}

New-Item -ItemType Directory -Force -Path $PublicDir | Out-Null
Write-Log "Actualizador independiente iniciado"
Write-Log "Manifest=$ManifestUrl"

$installDir = Find-InstallDir
if (-not $installDir) {
  Write-Log "ERROR: no se encontro FELPOS.exe instalado"
  Write-Error "No se encontro FEL POS instalado. Reinstala con FELPOS_Setup.exe."
  exit 1
}
Write-Log "InstallDir=$installDir"

Write-Log "Consultando manifiesto..."
$manifest = Invoke-RestMethod -Uri $ManifestUrl -TimeoutSec 60
$version = [string]$manifest.version
$downloadUrl = [string]$manifest.download_url
$sha256 = [string]$manifest.sha256
if ([string]::IsNullOrWhiteSpace($version) -or [string]::IsNullOrWhiteSpace($downloadUrl)) {
  throw "Manifiesto invalido: falta version o download_url"
}

$currentVersion = ""
$versionFile = Join-Path $installDir "VERSION"
if (Test-Path -LiteralPath $versionFile) {
  $currentVersion = (Get-Content -LiteralPath $versionFile -Raw).Trim()
}
Write-Log "Actual=$currentVersion  Publicada=$version"

$needElevate = -not (Test-DirWritable $installDir)
$stageDir = if ($needElevate) {
  $d = Join-Path $env:LOCALAPPDATA "FELPOS\updates\pending"
  New-Item -ItemType Directory -Force -Path $d | Out-Null
  $d
} else {
  $installDir
}

$tempRoot = Join-Path $env:TEMP ("felpos-update-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
try {
  $zipPath = Join-Path $tempRoot "felpos-update.zip"
  Write-Log "Descargando $downloadUrl"
  Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -TimeoutSec 600
  if ($sha256) {
    $actual = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLower()
    if ($actual -ne $sha256.ToLower()) {
      throw "Hash SHA256 no coincide ($actual)"
    }
  }

  $extractDir = Join-Path $tempRoot "extracted"
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force
  $exeSource = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter "FELPOS.exe" | Select-Object -First 1
  if (-not $exeSource) { throw "El paquete no contiene FELPOS.exe" }
  if ($exeSource.Length -lt 15000000) {
    throw "FELPOS.exe del paquete parece incompleto ($($exeSource.Length) bytes)"
  }

  foreach ($name in @("FELPOS.exe", "VERSION", "BUILD_DATE")) {
    $src = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($src) {
      Copy-Item -LiteralPath $src.FullName -Destination (Join-Path $stageDir ($name + ".pending")) -Force
    }
  }
  Write-Log "Pendientes preparados en $stageDir"
} finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

# Cerrar FEL POS
for ($i = 1; $i -le 40; $i++) {
  $procs = @(Get-Process -Name "FELPOS" -ErrorAction SilentlyContinue)
  if ($procs.Count -eq 0) { break }
  if ($i -ge 35) {
    $procs | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    break
  }
  Start-Sleep -Seconds 1
}

$applyScript = Join-Path $PublicDir "apply_pending_update.ps1"
$relaunchVbs = Join-Path $PublicDir "relaunch.vbs"
$runtimeTmp = Join-Path $PublicDir "runtime-tmp"
New-Item -ItemType Directory -Force -Path $runtimeTmp | Out-Null

# relaunch.vbs
@"
Option Explicit
Dim shell, app, fso, exePath, workDir, tmpDir
Set shell = CreateObject("WScript.Shell")
Set app = CreateObject("Shell.Application")
Set fso = CreateObject("Scripting.FileSystemObject")
exePath = "$($installDir.Replace('"','""'))\FELPOS.exe"
workDir = "$($installDir.Replace('"','""'))"
tmpDir = "$runtimeTmp"
If Not fso.FolderExists(tmpDir) Then fso.CreateFolder tmpDir
If Not fso.FileExists(exePath) Then
  MsgBox "No se encontro FELPOS.exe", vbCritical, "FEL POS"
  WScript.Quit 1
End If
shell.CurrentDirectory = workDir
shell.Environment("PROCESS")("TEMP") = tmpDir
shell.Environment("PROCESS")("TMP") = tmpDir
app.ShellExecute exePath, "", workDir, "open", 1
"@ | Set-Content -LiteralPath $relaunchVbs -Encoding ASCII

$stageLiteral = if ($needElevate) { $stageDir } else { "" }
$applyBody = @"
`$ErrorActionPreference = 'Stop'
`$InstallDir = '$($installDir.Replace("'","''"))'
`$StageDir = '$($stageLiteral.Replace("'","''"))'
`$PublicLogPath = '$LogPath'
`$RelaunchVbs = '$relaunchVbs'
`$RuntimeTmp = '$runtimeTmp'
`$MinExeBytes = 15000000
function Write-UpdateLog([string]`$Message) {
  `$line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), `$Message
  Add-Content -LiteralPath `$PublicLogPath -Value `$line -ErrorAction SilentlyContinue
}
`$env:TEMP = `$RuntimeTmp; `$env:TMP = `$RuntimeTmp
Write-UpdateLog 'Apply independiente: inicio'
if (`$StageDir) {
  foreach (`$name in @('FELPOS.exe','VERSION','BUILD_DATE')) {
    `$src = Join-Path `$StageDir (`$name + '.pending')
    if (Test-Path -LiteralPath `$src) {
      Copy-Item -LiteralPath `$src -Destination (Join-Path `$InstallDir (`$name + '.pending')) -Force
    }
  }
}
`$pending = Join-Path `$InstallDir 'FELPOS.exe.pending'
if (-not (Test-Path -LiteralPath `$pending)) { throw 'Falta FELPOS.exe.pending' }
`$size = [int64](Get-Item -LiteralPath `$pending).Length
if (`$size -lt `$MinExeBytes) { throw "Pending incompleto (`$size)" }
`$exe = Join-Path `$InstallDir 'FELPOS.exe'
`$old = Join-Path `$InstallDir 'FELPOS.exe.old'
if (Test-Path -LiteralPath `$old) { Remove-Item -LiteralPath `$old -Force }
if (Test-Path -LiteralPath `$exe) { Rename-Item -LiteralPath `$exe -NewName 'FELPOS.exe.old' }
Rename-Item -LiteralPath `$pending -NewName 'FELPOS.exe'
foreach (`$name in @('VERSION','BUILD_DATE')) {
  `$src = Join-Path `$InstallDir (`$name + '.pending')
  if (Test-Path -LiteralPath `$src) {
    Move-Item -LiteralPath `$src -Destination (Join-Path `$InstallDir `$name) -Force
  }
}
Write-UpdateLog 'EXE actualizado; relanzando'
Start-Sleep -Seconds 2
Start-Process -FilePath 'wscript.exe' -ArgumentList @('//nologo', `$RelaunchVbs) -WindowStyle Hidden | Out-Null
Write-UpdateLog 'OK v$version'
"@
Set-Content -LiteralPath $applyScript -Value $applyBody -Encoding UTF8

Write-Log "Aplicando actualizacion (elevate=$needElevate)..."
if ($needElevate) {
  $elevateVbs = Join-Path $PublicDir "apply_update_elevated.vbs"
  @"
Option Explicit
Dim app
Set app = CreateObject("Shell.Application")
app.ShellExecute "powershell.exe", "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $applyScript", "$PublicDir", "runas", 1
"@ | Set-Content -LiteralPath $elevateVbs -Encoding ASCII
  Start-Process -FilePath "wscript.exe" -ArgumentList @("//nologo", $elevateVbs) | Out-Null
  Write-Log "Se solicito permiso de administrador. Acepta el UAC si aparece."
} else {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $applyScript
}

Write-Log "Actualizador independiente termino el lanzamiento"
exit 0
