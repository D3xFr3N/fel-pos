$ErrorActionPreference = "Stop"



. (Join-Path $PSScriptRoot "licenses\license_tools.ps1")



function Show-Header {

    Clear-Host

    Write-Host "========================================"

    Write-Host "   FEL POS - Asistente de activacion"

    Write-Host "========================================"

    Write-Host ""

}



function Read-Required {

    param([string]$Prompt)

    while ($true) {

        $value = Read-Host $Prompt

        if ($value.Trim()) {

            return $value.Trim()

        }

        Write-Host "Este campo es obligatorio." -ForegroundColor Yellow

    }

}



function Pause-Continue {

    Write-Host ""

    Read-Host "Presiona Enter para continuar" | Out-Null

}



function Invoke-ActivateNewStore {

    Show-Header

    Write-Host "Activar nueva tienda"

    Write-Host "--------------------"

    Write-Host "El ID identifica la tienda (ej. T001, CENTRO, ZONA10)."

    Write-Host ""



    $storeId = Read-Required "ID de tienda"

    $storeLabel = Read-Required "Nombre de la tienda"

    $contact = Read-Host "Contacto (telefono/correo, opcional)"

    $notes = Read-Host "Notas internas (opcional)"



    try {

        $result = New-StoreActivation `

            -StoreId $storeId `

            -StoreLabel $storeLabel `

            -Contact $contact `

            -Notes $notes

    } catch {

        Write-Host ""

        Write-Host $_.Exception.Message -ForegroundColor Red

        Pause-Continue

        return

    }



    Write-Host ""

    Write-Host "Tienda activada correctamente." -ForegroundColor Green

    Write-Host ""

    Write-Host $result.message

    Write-Host ""

    Write-Host "Carta guardada en:" -ForegroundColor Cyan

    Write-Host "  $($result.letter_path)"



    if (Copy-TextToClipboard -Text $result.message) {

        Write-Host ""

        Write-Host "Mensaje copiado al portapapeles (listo para WhatsApp/correo)." -ForegroundColor Green

    }



    Pause-Continue

}



function Invoke-ListStores {

    Show-Header

    Write-Host "Tiendas registradas"

    Write-Host "-------------------"

    $registry = Read-PrivateRegistry

    $entries = Get-RegistryEntries $registry

    if (-not $entries.Count) {

        Write-Host "No hay tiendas activadas."

        Pause-Continue

        return

    }



    foreach ($item in $entries) {

        $status = if ($item.status) { $item.status } else { "active" }

        Write-Host ""

        Write-Host "ID:      $($item.store_id)"

        Write-Host "Nombre:  $($item.store_label)"

        Write-Host "Estado:  $status"

        Write-Host "Clave:   $($item.license_key)"

        Write-Host "Fecha:   $($item.issued_at)"

        if ($item.contact) { Write-Host "Contacto: $($item.contact)" }

        if ($item.notes) { Write-Host "Notas:   $($item.notes)" }

    }

    Pause-Continue

}



function Invoke-ResendLetter {

    Show-Header

    Write-Host "Reenviar carta de activacion"

    Write-Host "----------------------------"

    $storeId = Read-Required "ID de tienda"

    $registry = Read-PrivateRegistry

    $entry = Find-StoreEntry -Registry $registry -StoreId (Normalize-StoreId $storeId)

    if (-not $entry) {

        Write-Host "No se encontro la tienda $storeId" -ForegroundColor Red

        Pause-Continue

        return

    }

    if ([string]$entry.status -eq "revoked") {

        Write-Host "Esta tienda esta revocada. Crea una nueva activacion con otro ID o clave." -ForegroundColor Yellow

        Pause-Continue

        return

    }



    $message = Build-ActivationMessage -Entry $entry

    $path = Write-ActivationLetter -Entry $entry

    Write-Host ""

    Write-Host $message

    Write-Host ""

    Write-Host "Carta guardada en: $path" -ForegroundColor Cyan

    if (Copy-TextToClipboard -Text $message) {

        Write-Host "Mensaje copiado al portapapeles." -ForegroundColor Green

    }

    Pause-Continue

}



function Invoke-RevokeStore {

    Show-Header

    Write-Host "Revocar tienda"

    Write-Host "--------------"

    $storeId = Read-Required "ID de tienda a revocar"

    $notes = Read-Host "Motivo (opcional)"



    try {

        $entry = Revoke-StoreActivation -StoreId $storeId -Notes $notes

    } catch {

        Write-Host $_.Exception.Message -ForegroundColor Red

        Pause-Continue

        return

    }



    Write-Host ""

    Write-Host "Tienda $($entry.store_id) marcada como revocada en tu registro local." -ForegroundColor Yellow

    Write-Host "Reemite una licencia nueva a la tienda legitima (opcion 5)."

    Pause-Continue

}



function Invoke-ReissueStore {

    Show-Header

    Write-Host "Reemitir licencia firmada"

    Write-Host "-------------------------"

    Write-Host "Genera una clave nueva para una tienda existente (licencias antiguas o copia robada)."

    Write-Host ""

    $storeId = Read-Required "ID de tienda"

    $notes = Read-Host "Motivo (opcional)"



    try {

        $result = Reissue-StoreLicense -StoreId $storeId -Notes $notes

    } catch {

        Write-Host $_.Exception.Message -ForegroundColor Red

        Pause-Continue

        return

    }



    Write-Host ""

    Write-Host "Licencia reemitida." -ForegroundColor Green

    Write-Host ""

    Write-Host $result.message

    Write-Host ""

    Write-Host "Carta: $($result.letter_path)" -ForegroundColor Cyan

    if (Copy-TextToClipboard -Text $result.message) {

        Write-Host "Mensaje copiado al portapapeles." -ForegroundColor Green

    }

    Pause-Continue

}



while ($true) {

    Show-Header

    Write-Host "1. Activar nueva tienda"

    Write-Host "2. Ver tiendas registradas"

    Write-Host "3. Reenviar carta de activacion"

    Write-Host "4. Revocar tienda (registro local)"

    Write-Host "5. Reemitir licencia firmada"

    Write-Host "6. Salir"

    Write-Host ""

    $choice = Read-Host "Elige una opcion (1-6)"



    switch ($choice) {

        "1" { Invoke-ActivateNewStore }

        "2" { Invoke-ListStores }

        "3" { Invoke-ResendLetter }

        "4" { Invoke-RevokeStore }

        "5" { Invoke-ReissueStore }

        "6" { exit 0 }

        default {

            Write-Host "Opcion invalida." -ForegroundColor Yellow

            Start-Sleep -Seconds 1

        }

    }

}

