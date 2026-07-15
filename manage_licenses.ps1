param(

    [Parameter(Mandatory = $true)]

    [ValidateSet("New", "Revoke", "List", "Reissue")]

    [string]$Action,



    [string]$StoreId = "",



    [string]$StoreLabel = "",



    [string]$LicenseKey = "",



    [string]$Notes = ""



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

        $id = if ($StoreId.Trim()) { Normalize-StoreId $StoreId } else { Normalize-StoreId $StoreLabel }

        $result = New-StoreActivation -StoreId $id -StoreLabel $StoreLabel -Notes $Notes -Fingerprint $Fingerprint

        Write-Host ""

        Write-Host "Licencia creada para: $($result.entry.store_id) - $($result.entry.store_label)"

        Write-Host "Clave:"

        Write-Host "  $($result.entry.license_key)"

        Write-Host ""

        Write-Host "Carta: $($result.letter_path)"

    }

    "Reissue" {

        if (-not $StoreId.Trim()) {

            throw "Indica -StoreId para reemitir una licencia firmada."

        }

        $result = Reissue-StoreLicense -StoreId $StoreId -Notes $Notes -Fingerprint $Fingerprint

        Write-Host ""

        Write-Host "Licencia reemitida para: $($result.entry.store_id) - $($result.entry.store_label)"

        Write-Host "Clave nueva:"

        Write-Host "  $($result.entry.license_key)"

        Write-Host ""

        Write-Host "Carta: $($result.letter_path)"

    }

    "Revoke" {

        if ($StoreId.Trim()) {

            $entry = Revoke-StoreActivation -StoreId $StoreId -Notes $Notes

            Write-Host "Tienda revocada en registro local: $($entry.store_id) ($($entry.store_label))"

            Write-Host "Emite una licencia nueva a la tienda legitima con -Action Reissue."

        } elseif ($LicenseKey.Trim()) {

            $entry = Revoke-StoreActivation -LicenseKey $LicenseKey -Notes $Notes

            Write-Host "Licencia revocada en registro local: $($entry.license_key)"

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

        foreach ($item in $entries) {

            $id = if ($item.store_id) { $item.store_id } else { "-" }

            $keyPreview = if ($item.license_key.Length -gt 40) { $item.license_key.Substring(0, 40) + "..." } else { $item.license_key }

            Write-Host ("{0} | {1} | {2} | {3}" -f $id, $item.store_label, $keyPreview, $item.status)

        }

    }

}

