$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "licenses\license_tools.ps1")

function Show-Header {
    Clear-Host
    Write-Host "========================================"
    Write-Host "   FEL POS - Activador de licencias"
    Write-Host "========================================"
    Write-Host "Las licencias van en archivo .felpos-lic"
    Write-Host "y quedan vinculadas al ID del equipo."
    Write-Host "No se pueden compartir entre PCs."
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

function Read-Fingerprint {
    Write-Host ""
    Write-Host "ID DE EQUIPO (PC de la tienda) - obligatorio" -ForegroundColor Cyan
    Write-Host "  No es el ID de tienda de arriba."
    Write-Host "  Lo copia la tienda en el instalador o en Config -> Licencia -> Copiar ID"
    Write-Host "  Ejemplo: 70B9AF9AB516C03B"
    Write-Host ""
    while ($true) {
        $fp = (Read-Required "Pega el ID de equipo de la PC").ToUpper() -replace "\s+", ""
        if ($fp.Length -ge 8) {
            return $fp
        }
        Write-Host "El ID parece muy corto. Copia el completo (16 caracteres)." -ForegroundColor Yellow
    }
}

function Pause-Continue {
    Write-Host ""
    Read-Host "Presiona Enter para continuar" | Out-Null
}

function Show-ActivationResult {
    param($Result)
    Write-Host ""
    Write-Host "Listo." -ForegroundColor Green
    Write-Host "Tienda:   $($Result.entry.store_id) - $($Result.entry.store_label)"
    Write-Host "Equipo:   $($Result.entry.fingerprint)"
    Write-Host "Codigo:   $($Result.entry.activation_code)"
    Write-Host ""
    Write-Host "ENVIA ESTE ARCHIVO A LA TIENDA (.felpos-lic):" -ForegroundColor Cyan
    Write-Host "  $($Result.license_file)"
    Write-Host "Carta (solo instrucciones, NO es la llave):"
    Write-Host "  $($Result.letter_path)"
    Write-Host ""
    Write-Host "En la tienda: Importar llave / Config -> elegir el .felpos-lic"
    if (Copy-TextToClipboard -Text $Result.license_file) {
        Write-Host "Ruta del .felpos-lic copiada al portapapeles." -ForegroundColor Green
    }
}

function Invoke-ActivateNewStore {
    Show-Header
    Write-Host "1) Activar nueva tienda"
    Write-Host "----------------------"
    Write-Host "Te pedira DOS datos distintos:"
    Write-Host "  A) Codigo/nombre de tienda (lo inventas tu, ej. CENTRO)"
    Write-Host "  B) ID de equipo (lo da la PC de la tienda)"
    Write-Host ""

    $storeId = Read-Required "A) Codigo de tienda (ej. T001 o CENTRO)"
    $storeLabel = Read-Required "Nombre comercial de la tienda"
    $fingerprint = Read-Fingerprint
    $contact = Read-Host "Contacto (telefono/correo, opcional)"
    $notes = Read-Host "Notas internas (opcional)"

    try {
        $result = New-StoreActivation `
            -StoreId $storeId `
            -StoreLabel $storeLabel `
            -Contact $contact `
            -Notes $notes `
            -Fingerprint $fingerprint
    } catch {
        Write-Host ""
        Write-Host $_.Exception.Message -ForegroundColor Red
        Pause-Continue
        return
    }

    Show-ActivationResult -Result $result
    Pause-Continue
}

function Invoke-ListStores {
    Show-Header
    Write-Host "2) Tiendas registradas"
    Write-Host "---------------------"
    $registry = Read-PrivateRegistry
    $entries = Get-RegistryEntries $registry
    if (-not $entries.Count) {
        Write-Host "No hay tiendas activadas."
        Pause-Continue
        return
    }

    foreach ($item in $entries) {
        $status = if ($item.status) { $item.status } else { "active" }
        $code = if ($item.activation_code) { $item.activation_code } else { "-" }
        $fp = if ($item.fingerprint) { $item.fingerprint } else { "(sin vincular - reemitir)" }
        Write-Host ""
        Write-Host "ID:      $($item.store_id)"
        Write-Host "Nombre:  $($item.store_label)"
        Write-Host "Estado:  $status"
        Write-Host "Codigo:  $code"
        Write-Host "Equipo:  $fp"
        Write-Host "Fecha:   $($item.issued_at)"
        if ($item.contact) { Write-Host "Contacto: $($item.contact)" }
        if ($item.notes) { Write-Host "Notas:   $($item.notes)" }
    }
    Pause-Continue
}

function Invoke-ResendLetter {
    Show-Header
    Write-Host "3) Reenviar archivo de activacion"
    Write-Host "---------------------------------"
    $storeId = Read-Required "ID de tienda"
    $registry = Read-PrivateRegistry
    $entry = Find-StoreEntry -Registry $registry -StoreId (Normalize-StoreId $storeId)
    if (-not $entry) {
        Write-Host "No se encontro la tienda $storeId" -ForegroundColor Red
        Pause-Continue
        return
    }
    if ([string]$entry.status -eq "revoked") {
        Write-Host "Esta tienda esta revocada. Reemite con otro flujo o crea otra." -ForegroundColor Yellow
        Pause-Continue
        return
    }
    if (-not [string]$entry.fingerprint) {
        Write-Host "Esta licencia NO tiene ID de equipo. Debes reemitirla (opcion 5)." -ForegroundColor Yellow
        Pause-Continue
        return
    }

    $paths = Write-ActivationLetter -Entry $entry
    Write-Host ""
    Write-Host "ENVIA ESTE ARCHIVO (.felpos-lic):" -ForegroundColor Cyan
    Write-Host "  $($paths.license_file)"
    Write-Host "Carta (instrucciones): $($paths.letter_path)"
    if (Copy-TextToClipboard -Text $paths.license_file) {
        Write-Host "Ruta del .felpos-lic copiada al portapapeles." -ForegroundColor Green
    }
    Pause-Continue
}

function Invoke-RevokeStore {
    Show-Header
    Write-Host "4) Revocar tienda"
    Write-Host "----------------"
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
    Write-Host "Tienda $($entry.store_id) marcada como revocada en registro local." -ForegroundColor Yellow
    Write-Host "Si es la tienda legitima, reemite (opcion 5) con el ID de su PC."
    Pause-Continue
}

function Invoke-ReissueStore {
    Show-Header
    Write-Host "5) Reemitir licencia (cambio de PC o copia)"
    Write-Host "-------------------------------------------"
    Write-Host "Invalida el archivo anterior al generar uno nuevo."
    Write-Host "Necesitas el ID DE EQUIPO de la PC autorizada (no el codigo de tienda)."
    Write-Host ""

    $storeId = Read-Required "Codigo de tienda (ej. CENTRO)"
    $fingerprint = Read-Fingerprint
    $notes = Read-Host "Motivo (opcional)"

    try {
        $result = Reissue-StoreLicense -StoreId $storeId -Notes $notes -Fingerprint $fingerprint
    } catch {
        Write-Host $_.Exception.Message -ForegroundColor Red
        Pause-Continue
        return
    }

    Show-ActivationResult -Result $result
    Pause-Continue
}

function Invoke-OpenActivationsFolder {
    Show-Header
    Write-Host "6) Abrir carpeta de activaciones"
    Write-Host "--------------------------------"
    $dir = Join-Path $PSScriptRoot "licenses\activaciones"
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
    Write-Host $dir
    Start-Process explorer.exe $dir
    Pause-Continue
}

while ($true) {
    Show-Header
    Write-Host "1. Activar nueva tienda (.felpos-lic + ID equipo)"
    Write-Host "2. Ver tiendas registradas"
    Write-Host "3. Reenviar archivo .felpos-lic"
    Write-Host "4. Revocar tienda (registro local)"
    Write-Host "5. Reemitir licencia (nuevo PC / anti-copia)"
    Write-Host "6. Abrir carpeta licenses\activaciones"
    Write-Host "7. Salir"
    Write-Host ""
    $choice = Read-Host "Elige una opcion (1-7)"

    switch ($choice) {
        "1" { Invoke-ActivateNewStore }
        "2" { Invoke-ListStores }
        "3" { Invoke-ResendLetter }
        "4" { Invoke-RevokeStore }
        "5" { Invoke-ReissueStore }
        "6" { Invoke-OpenActivationsFolder }
        "7" { exit 0 }
        default {
            Write-Host "Opcion invalida." -ForegroundColor Yellow
            Start-Sleep -Seconds 1
        }
    }
}
