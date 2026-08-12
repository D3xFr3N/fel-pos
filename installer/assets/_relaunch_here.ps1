$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot
$exe = Join-Path $dir "FELPOS.exe"
$tmp = "C:\Users\Public\FELPOS\runtime-tmp"
New-Item -ItemType Directory -Force -Path "C:\Users\Public\FELPOS" | Out-Null
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$env:TEMP = $tmp
$env:TMP = $tmp
$env:FELPOS_RUNTIME_TMP = $tmp
if (-not (Test-Path -LiteralPath $exe)) {
  throw "No se encontro FELPOS.exe en $dir"
}
Start-Process -LiteralPath $exe -WorkingDirectory $dir
