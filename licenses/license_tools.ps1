$script:LicenseRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ProjectRoot = Split-Path -Parent $script:LicenseRoot
$script:PrivateRegistryPath = Join-Path $script:LicenseRoot "private-registry.json"
$script:ActivationsDir = Join-Path $script:LicenseRoot "activaciones"
$script:ManifestUrl = "https://D3xFr3N.github.io/fel-pos/latest.json"
$script:SigningScript = Join-Path $script:ProjectRoot "scripts\license_signing.py"

function Get-PythonExe {
    $venvPython = Join-Path $script:ProjectRoot ".venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        return $venvPython
    }
    return "python"
}

function Ensure-LicenseKeypair {
    $python = Get-PythonExe
    & $python $script:SigningScript ensure-keypair | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo preparar el par de claves de licencia."
    }
}

function New-SignedLicenseKey {
    param(
        [Parameter(Mandatory = $true)][string]$StoreId,
        [Parameter(Mandatory = $true)][string]$StoreLabel,
        [string]$Status = "active",
        [Parameter(Mandatory = $true)][string]$Fingerprint
    )
    $boundFp = $Fingerprint.Trim().ToUpper()
    if (-not $boundFp -or $boundFp.Length -lt 8) {
        throw "Fingerprint de equipo obligatorio para firmar (evita compartir entre PCs)."
    }
    Ensure-LicenseKeypair
    $python = Get-PythonExe
    $issuedAt = Get-Date -Format "yyyy-MM-dd"
    $args = @(
        $script:SigningScript, "sign",
        "--store-id", $StoreId,
        "--store-label", $StoreLabel,
        "--issued-at", $issuedAt,
        "--status", $Status,
        "--fingerprint", $boundFp
    )
    $license = & $python @args
    if ($LASTEXITCODE -ne 0 -or -not $license) {
        throw "No se pudo firmar la licencia."
    }
    return $license.Trim()
}

function Normalize-StoreId {
    param([string]$Value)
    $clean = ($Value.Trim().ToUpper() -replace "\s+", "-" -replace "[^A-Z0-9\-]", "")
    if (-not $clean) {
        throw "ID de tienda invalido. Usa letras, numeros o guiones (ej. T001, ZONA10)."
    }
    return $clean
}

function Read-PrivateRegistry {
    if (-not (Test-Path $script:PrivateRegistryPath)) {
        return [ordered]@{
            version = 3
            entries = @()
        }
    }
    $raw = Get-Content $script:PrivateRegistryPath -Raw | ConvertFrom-Json
    if (-not $raw.entries) {
        $raw | Add-Member -NotePropertyName entries -NotePropertyValue @() -Force
    }
    return $raw
}

function Save-PrivateRegistry {
    param($Registry)
    if (-not (Test-Path $script:LicenseRoot)) {
        New-Item -ItemType Directory -Path $script:LicenseRoot | Out-Null
    }
    ($Registry | ConvertTo-Json -Depth 8) | Set-Content $script:PrivateRegistryPath -Encoding UTF8
}

function Get-RegistryEntries {
    param($Registry)
    $list = @()
    foreach ($item in $Registry.entries) {
        $list += $item
    }
    return $list
}

function Find-StoreEntry {
    param(
        $Registry,
        [string]$StoreId = "",
        [string]$LicenseKey = ""
    )
    foreach ($item in $Registry.entries) {
        if ($StoreId -and ([string]$item.store_id).ToUpper() -eq $StoreId.ToUpper()) {
            return $item
        }
        if ($LicenseKey -and ([string]$item.license_key).Trim() -eq $LicenseKey.Trim()) {
            return $item
        }
    }
    return $null
}

function New-StoreActivation {
    param(
        [Parameter(Mandatory = $true)][string]$StoreId,
        [Parameter(Mandatory = $true)][string]$StoreLabel,
        [string]$Contact = "",
        [string]$Notes = "",
        [Parameter(Mandatory = $true)][string]$Fingerprint
    )

    $boundFp = $Fingerprint.Trim().ToUpper()
    if (-not $boundFp -or $boundFp.Length -lt 8) {
        throw "Fingerprint de equipo obligatorio (minimo 8 caracteres). Sin el, la licencia se puede copiar a otra PC."
    }

    $registry = Read-PrivateRegistry
    $normalizedId = Normalize-StoreId $StoreId
    if (Find-StoreEntry -Registry $registry -StoreId $normalizedId) {
        throw "Ya existe una tienda con ID $normalizedId. Usa otro ID o reemite la licencia."
    }

    $license = New-SignedLicenseKey -StoreId $normalizedId -StoreLabel $StoreLabel.Trim() -Fingerprint $boundFp
    $activationCode = New-ActivationCode -StoreId $normalizedId
    $entry = [ordered]@{
        store_id = $normalizedId
        store_label = $StoreLabel.Trim()
        license_key = $license
        activation_code = $activationCode
        fingerprint = $boundFp
        status = "active"
        issued_at = (Get-Date -Format "yyyy-MM-dd")
        contact = $Contact.Trim()
        notes = $Notes.Trim()
    }
    $registry.entries += $entry
    Save-PrivateRegistry $registry

    $paths = Write-ActivationLetter -Entry $entry
    return [ordered]@{
        entry = $entry
        letter_path = $paths.letter_path
        license_file = $paths.license_file
        message = (Build-ActivationMessage -Entry $entry)
    }
}

function Reissue-StoreLicense {
    param(
        [Parameter(Mandatory = $true)][string]$StoreId,
        [string]$Notes = "",
        [Parameter(Mandatory = $true)][string]$Fingerprint
    )

    $registry = Read-PrivateRegistry
    $normalizedId = Normalize-StoreId $StoreId
    $entry = Find-StoreEntry -Registry $registry -StoreId $normalizedId
    if (-not $entry) {
        throw "No se encontro la tienda $normalizedId."
    }
    if ([string]$entry.status -eq "revoked") {
        throw "La tienda esta revocada. Crea una activacion nueva con otro ID."
    }

    $boundFingerprint = $Fingerprint.Trim().ToUpper()
    if (-not $boundFingerprint -or $boundFingerprint.Length -lt 8) {
        throw "Fingerprint de equipo obligatorio al reemitir."
    }
    $entry.license_key = New-SignedLicenseKey -StoreId $normalizedId -StoreLabel ([string]$entry.store_label) -Fingerprint $boundFingerprint
    $entry.activation_code = New-ActivationCode -StoreId $normalizedId
    $entry.fingerprint = $boundFingerprint
    $entry.issued_at = (Get-Date -Format "yyyy-MM-dd")
    $entry | Add-Member -NotePropertyName reissued_at -NotePropertyValue (Get-Date -Format "yyyy-MM-dd HH:mm:ss") -Force
    if ($Notes.Trim()) {
        $entry.notes = $Notes.Trim()
    }
    Save-PrivateRegistry $registry
    $paths = Write-ActivationLetter -Entry $entry
    return [ordered]@{
        entry = $entry
        letter_path = $paths.letter_path
        license_file = $paths.license_file
        message = (Build-ActivationMessage -Entry $entry)
    }
}

function New-ActivationCode {
    param([string]$StoreId = "")
    $alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    $chars = New-Object char[] 8
    for ($i = 0; $i -lt 8; $i++) {
        $chars[$i] = $alphabet[(Get-Random -Maximum $alphabet.Length)]
    }
    $raw = -join $chars
    $clean = ($StoreId.ToUpper() -replace "[^A-Z0-9]", "")
    if ($clean.Length -ge 3) {
        $prefix = $clean.Substring(0, 3)
    } elseif ($clean) {
        $prefix = $clean
    } else {
        $prefix = "FEL"
    }
    return ("{0}-{1}-{2}" -f $prefix, $raw.Substring(0, 4), $raw.Substring(4, 4)).ToUpper()
}

function Write-LicenseFile {
    param($Entry)
    if (-not (Test-Path $script:ActivationsDir)) {
        New-Item -ItemType Directory -Path $script:ActivationsDir | Out-Null
    }
    $code = [string]$Entry.activation_code
    if (-not $code) {
        $code = New-ActivationCode -StoreId ([string]$Entry.store_id)
        $Entry | Add-Member -NotePropertyName activation_code -NotePropertyValue $code -Force
    }
    $payload = [ordered]@{
        format = "felpos-lic-1"
        activation_code = $code
        store_id = [string]$Entry.store_id
        store_label = [string]$Entry.store_label
        issued_at = [string]$Entry.issued_at
        license_key = [string]$Entry.license_key
    }
    $fileName = "{0}_{1}.felpos-lic" -f $Entry.store_id, (Get-Date -Format "yyyyMMdd")
    $path = Join-Path $script:ActivationsDir $fileName
    ($payload | ConvertTo-Json -Depth 4) | Set-Content -Path $path -Encoding UTF8
    return $path
}

function Build-ActivationMessage {
    param($Entry)
    $contactBlock = ""
    if ($Entry.contact) {
        $contactBlock = "`nContacto registrado: $($Entry.contact)"
    }
    $fingerprintBlock = ""
    if ($Entry.fingerprint) {
        $fingerprintBlock = "`nID equipo vinculado: $($Entry.fingerprint)"
    }
    $code = [string]$Entry.activation_code
    if (-not $code) {
        $code = "(ver archivo .felpos-lic)"
    }
    return @"
FEL POS - Activacion de tienda
==============================
ID tienda: $($Entry.store_id)
Nombre: $($Entry.store_label)
Fecha: $($Entry.issued_at)$contactBlock$fingerprintBlock

Codigo de referencia: $code

*** ESTE ARCHIVO .TXT NO ES LA LICENCIA ***
*** NO SIRVE PARA ACTIVAR FEL POS ***

Envia a la tienda el archivo .felpos-lic (misma carpeta).
Ese es el unico archivo de activacion.
Esta licencia esta VINCULADA al ID de equipo; no sirve en otra PC.

Pasos en la tienda:
1. Abrir FEL POS como administrador
2. Ir a Configuracion -> Licencia de tienda
   (o en el instalador: Importar llave)
3. Elegir el archivo .felpos-lic y Guardar
4. En Actualizaciones, pulsar Buscar actualizaciones

La licencia se valida localmente (firmada Ed25519).
No compartas el .felpos-lic con otras tiendas.
Si cambias de PC, solicita reactivacion con el nuevo ID de equipo.
"@
}

function Write-ActivationLetter {
    param($Entry)
    if (-not (Test-Path $script:ActivationsDir)) {
        New-Item -ItemType Directory -Path $script:ActivationsDir | Out-Null
    }
    $licPath = Write-LicenseFile -Entry $Entry
    $fileName = "{0}_{1}_activacion.txt" -f $Entry.store_id, (Get-Date -Format "yyyyMMdd")
    $path = Join-Path $script:ActivationsDir $fileName
    (Build-ActivationMessage -Entry $Entry) | Set-Content $path -Encoding UTF8
    return [ordered]@{
        letter_path = $path
        license_file = $licPath
    }
}

function Revoke-StoreActivation {
    param(
        [string]$StoreId = "",
        [string]$LicenseKey = "",
        [string]$Notes = ""
    )

    $registry = Read-PrivateRegistry
    $entry = $null
    if ($StoreId) {
        $entry = Find-StoreEntry -Registry $registry -StoreId (Normalize-StoreId $StoreId)
    } elseif ($LicenseKey) {
        $entry = Find-StoreEntry -Registry $registry -LicenseKey $LicenseKey
    }
    if (-not $entry) {
        throw "No se encontro la tienda o licencia indicada."
    }

    $entry.status = "revoked"
    $entry | Add-Member -NotePropertyName revoked_at -NotePropertyValue (Get-Date -Format "yyyy-MM-dd") -Force
    if ($Notes.Trim()) {
        $entry | Add-Member -NotePropertyName notes -NotePropertyValue $Notes.Trim() -Force
    }
    Save-PrivateRegistry $registry
    return $entry
}

function Copy-TextToClipboard {
    param([string]$Text)
    try {
        Set-Clipboard -Value $Text
        return $true
    } catch {
        return $false
    }
}
