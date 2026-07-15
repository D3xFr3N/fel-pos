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
        [string]$Status = "active"
    )
    Ensure-LicenseKeypair
    $python = Get-PythonExe
    $issuedAt = Get-Date -Format "yyyy-MM-dd"
    $license = & $python $script:SigningScript sign `
        --store-id $StoreId `
        --store-label $StoreLabel `
        --issued-at $issuedAt `
        --status $Status
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
        [string]$Notes = ""
    )

    $registry = Read-PrivateRegistry
    $normalizedId = Normalize-StoreId $StoreId
    if (Find-StoreEntry -Registry $registry -StoreId $normalizedId) {
        throw "Ya existe una tienda con ID $normalizedId. Usa otro ID o reemite la licencia."
    }

    $license = New-SignedLicenseKey -StoreId $normalizedId -StoreLabel $StoreLabel.Trim()
    $entry = [ordered]@{
        store_id = $normalizedId
        store_label = $StoreLabel.Trim()
        license_key = $license
        status = "active"
        issued_at = (Get-Date -Format "yyyy-MM-dd")
        contact = $Contact.Trim()
        notes = $Notes.Trim()
    }
    $registry.entries += $entry
    Save-PrivateRegistry $registry

    $letterPath = Write-ActivationLetter -Entry $entry
    return [ordered]@{
        entry = $entry
        letter_path = $letterPath
        message = (Build-ActivationMessage -Entry $entry)
    }
}

function Reissue-StoreLicense {
    param(
        [Parameter(Mandatory = $true)][string]$StoreId,
        [string]$Notes = ""
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

    $entry.license_key = New-SignedLicenseKey -StoreId $normalizedId -StoreLabel ([string]$entry.store_label)
    $entry.issued_at = (Get-Date -Format "yyyy-MM-dd")
    $entry | Add-Member -NotePropertyName reissued_at -NotePropertyValue (Get-Date -Format "yyyy-MM-dd HH:mm:ss") -Force
    if ($Notes.Trim()) {
        $entry.notes = $Notes.Trim()
    }
    Save-PrivateRegistry $registry
    $letterPath = Write-ActivationLetter -Entry $entry
    return [ordered]@{
        entry = $entry
        letter_path = $letterPath
        message = (Build-ActivationMessage -Entry $entry)
    }
}

function Build-ActivationMessage {
    param($Entry)
    $contactBlock = ""
    if ($Entry.contact) {
        $contactBlock = "`nContacto registrado: $($Entry.contact)"
    }
    return @"
FEL POS - Activacion de tienda
==============================
ID tienda: $($Entry.store_id)
Nombre: $($Entry.store_label)
Fecha: $($Entry.issued_at)$contactBlock

Clave de licencia (solo para esta tienda):
$($Entry.license_key)

Pasos en la tienda:
1. Abrir FEL POS como administrador
2. Ir a Configuracion -> Licencia de tienda
3. Pegar la clave y pulsar Guardar licencia
4. En Actualizaciones automaticas, pulsar Buscar actualizaciones

Tambien puedes agregar en el archivo .env de la carpeta de instalacion:
STORE_LICENSE_KEY=$($Entry.license_key)
UPDATE_MANIFEST_URL=$($script:ManifestUrl)
LICENSE_REQUIRED_FOR_UPDATES=true

La licencia se valida localmente (firmada). No se publica ningun registro en GitHub.
No compartas esta clave con otras tiendas.
Si cambias de PC, solicita reactivacion con el mismo ID de tienda.
"@
}

function Write-ActivationLetter {
    param($Entry)
    if (-not (Test-Path $script:ActivationsDir)) {
        New-Item -ItemType Directory -Path $script:ActivationsDir | Out-Null
    }
    $fileName = "{0}_{1}_activacion.txt" -f $Entry.store_id, (Get-Date -Format "yyyyMMdd")
    $path = Join-Path $script:ActivationsDir $fileName
    (Build-ActivationMessage -Entry $Entry) | Set-Content $path -Encoding UTF8
    return $path
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
    $entry.revoked_at = (Get-Date -Format "yyyy-MM-dd")
    if ($Notes.Trim()) {
        $entry.notes = $Notes.Trim()
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
