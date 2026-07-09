# FEL POS APK Movil (Conteo + Precios)

Este subproyecto genera una APK Android que abre la app movil de FEL POS (`/mobile`) para conteo y verificacion de precios.

## Requisitos en tu PC

- Node.js LTS (incluye npm)
- Java JDK 17
- Android Studio (SDK + Build Tools)
- Variables Android configuradas (`ANDROID_HOME`/`ANDROID_SDK_ROOT`)

## Generar APK debug

Desde esta carpeta:

```cmd
cd C:\Users\D3xFr3N\source\fel-pos\mobile-apk
build_mobile_apk.bat
```

O con doble clic:

- `build_mobile_apk.bat`
- (`build_mobile_apk.bat` ya no usa PowerShell)

APK resultante:

- `mobile-apk\android\app\build\outputs\apk\debug\app-debug.apk`

## Como usar la app en el telefono

1. Instala la APK.
2. Abre la app y configura URL del servidor FEL POS:
   - Ejemplo: `http://192.168.1.20:8000`
3. Pulsa `Abrir conteo y precios`.
4. Inicia sesion con usuario creado en el sistema principal.

## Importante

- El servidor FEL POS debe estar encendido y accesible en red local.
- Si te sale `npm no esta instalado`, instala Node.js LTS y vuelve a correr el script.
- Ejecuta tu backend en LAN, por ejemplo:

```powershell
$env:FELPOS_BIND_HOST="0.0.0.0"
python .\fel_pos_launcher.py
```

## Reporte de error para soporte

Si falla la compilacion, ejecuta:

```cmd
cd /d C:\Users\D3xFr3N\source\fel-pos\mobile-apk
generar_reporte_error_apk.bat
```

Luego comparte el archivo:

- `mobile-apk\apk_build_report.txt`
