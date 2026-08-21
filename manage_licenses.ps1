param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("New", "Revoke", "List", "Reissue")]
    [string]$Action,

    [string]$StoreId = "",
    [string]$StoreLabel = "",
    [string]$LicenseKey = "",
    [string]$Notes = "",
    [string]$Fingerprint = ""
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "licenses\license_tools.ps1")

$registry = Read-PrivateRegistry

switch ($Action) {
    "New" {
        if (-not $StoreLabel.Trim()) {
            throw "Indica -StoreLabel para crear una licencia."
        }
        if (-not $Fingerprint.Trim()) {
            throw @"
Debes vincular la licencia a un equipo (-Fingerprint).
Sin eso, el .felpos-lic se puede copiar a otra PC.

1. En la tienda, instala FEL POS o abre el instalador y copia el "ID de esta computadora".
2. Crea la licencia asi:
   .\manage_licenses.ps1 -Action New -StoreLabel `"Nombre Tienda`" -Fingerprint `"XXXXXXXXXXXXXXXX`"
"@
        }
        $id = if ($StoreId.Trim()) { Normalize-StoreId $StoreId } else { Normalize-StoreId $StoreLabel }
        $result = New-StoreActivation -StoreId $id -StoreLabel $StoreLabel -Notes $Notes -Fingerprint $Fingerprint
        Write-Host ""
        Write-Host "Licencia creada para: $($result.entry.store_id) - $($result.entry.store_label)"
        Write-Host "Vinculada al equipo: $($result.entry.fingerprint)"
        Write-Host "Codigo de referencia: $($result.entry.activation_code)"
        Write-Host "Archivo para la tienda (enviar este):"
        Write-Host "  $($result.license_file)"
        Write-Host "Carta: $($result.letter_path)"
        if (Copy-TextToClipboard -Text $result.license_file) {
            Write-Host "Ruta del archivo copiada al portapapeles."
        }
    }
    "Reissue" {
        if (-not $StoreId.Trim()) {
            throw "Indica -StoreId para reemitir una licencia firmada."
        }
        if (-not $Fingerprint.Trim()) {
            throw @"
Para reemitir debes indicar -Fingerprint del equipo autorizado.
Asi la licencia no sirve en otra PC.

Ejemplo:
  .\manage_licenses.ps1 -Action Reissue -StoreId TIENDA -Fingerprint `"XXXXXXXXXXXXXXXX`"
"@
        }
        $result = Reissue-StoreLicense -StoreId $StoreId -Notes $Notes -Fingerprint $Fingerprint
        Write-Host ""
        Write-Host "Licencia reemitida para: $($result.entry.store_id) - $($result.entry.store_label)"
        Write-Host "Vinculada al equipo: $($result.entry.fingerprint)"
        Write-Host "Codigo de referencia: $($result.entry.activation_code)"
        Write-Host "Archivo para la tienda (enviar este):"
        Write-Host "  $($result.license_file)"
        Write-Host "Carta: $($result.letter_path)"
        if (Copy-TextToClipboard -Text $result.license_file) {
            Write-Host "Ruta del archivo copiada al portapapeles."
        }
    }
    "Revoke" {
        if ($StoreId.Trim()) {
            $entry = Revoke-StoreActivation -StoreId $StoreId -Notes $Notes
            Write-Host "Tienda revocada en registro local: $($entry.store_id) ($($entry.store_label))"
            Write-Host "Emite una licencia nueva a la tienda legitima con -Action Reissue."
        } elseif ($LicenseKey.Trim()) {
            $entry = Revoke-StoreActivation -LicenseKey $LicenseKey -Notes $Notes
            Write-Host "Licencia revocada en registro local: $($entry.store_id)"
        } else {
            throw "Indica -StoreId o -LicenseKey para revocar."
        }
    }
    "List" {
        $entries = Get-RegistryEntries $registry
        if (-not $entries.Count) {
            Write-Host "No hay licencias registradas."
            break
        }
        Write-Host "ID | Nombre | Codigo | Equipo | Estado"
        Write-Host "----------------------------------------"
        foreach ($item in $entries) {
            $id = if ($item.store_id) { $item.store_id } else { "-" }
            $code = if ($item.activation_code) { $item.activation_code } else { "-" }
            $fp = if ($item.fingerprint) { $item.fingerprint } else { "SIN-VINCULAR" }
            $status = if ($item.status) { $item.status } else { "active" }
            Write-Host ("{0} | {1} | {2} | {3} | {4}" -f $id, $item.store_label, $code, $fp, $status)
        }
    }
}
