# APK Android — Lector de inventario con camara

App nativa para escanear codigos de barras con la camara del telefono y registrar conteos en FEL POS.

## Modos de conexion

| Modo | Cuando usarlo | Como funciona |
|------|---------------|---------------|
| **WiFi (recomendado)** | PC y celular en la misma red | La app llama directo al API del servidor (`/api/stock-count/.../scan`) |
| **Bluetooth (respaldo)** | Sin WiFi o conexion inestable | La app envia escaneos al **puente scanner** del PC por Bluetooth o TCP `:18765` |

## Compilar APK

### Android Studio

1. Abre la carpeta `android-mobile` en Android Studio.
2. Espera `Gradle Sync`.
3. `Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`.

APK debug:

- `android-mobile\app\build\outputs\apk\debug\app-debug.apk`

### CMD (un click)

```cmd
cd /d C:\Users\D3xFr3N\source\fel-pos\android-mobile
build_apk_android.bat
```

## Configurar el PC (servidor FEL POS)

### WiFi

1. El servidor debe escuchar en la red local:

```cmd
set FELPOS_BIND_HOST=0.0.0.0
```

2. Crea una **orden de conteo** en el sistema principal (Inventario → Conteo fisico).
3. Anota la IP del PC, por ejemplo `http://192.168.1.20:8000`.

### Puente scanner (Bluetooth / respaldo TCP)

Puedes activarlo desde el **desktop de FEL POS**:

**Configuracion → App movil — Puente scanner → Activar puente**

Tambien puedes definirlo en `.env`:

```env
FELPOS_SCANNER_BRIDGE_ENABLED=true
FELPOS_SCANNER_BRIDGE_PORT=18765
FELPOS_SCANNER_BRIDGE_USERNAME=admin
FELPOS_SCANNER_BRIDGE_PASSWORD=tu_clave
```

Opcional — puerto COM de Bluetooth en Windows:

```env
FELPOS_SCANNER_BRIDGE_COM_PORT=COM5
```

Reinicia FEL POS. Veras en consola:

```text
[INFO] Puente scanner activo en 0.0.0.0:18765
```

Tambien puedes ejecutarlo aparte:

```cmd
cd /d C:\Users\D3xFr3N\source\fel-pos
python scripts/scanner_bridge.py
```

**Protocolo del puente** (linea UTF-8):

```text
SCAN|FEL000123|1
→ OK|Nombre producto|5|4
→ ERR|mensaje de error
```

### Emparejar Bluetooth (modo respaldo)

1. En Windows: Configuracion → Bluetooth → empareja el celular.
2. Copia la **MAC Bluetooth de la PC** (formato `AA:BB:CC:DD:EE:FF`).
3. Si la conexion SPP directa no funciona, el puente TCP en `:18765` actua como respaldo en la misma red.

## Uso en el telefono

1. Instala la APK (`FEL POS Movil` v1.1.0).
2. Configura:
   - URL del servidor (`http://192.168.X.X:8000`)
   - Usuario y clave (admin o cajero)
   - Modo: **WiFi** o **Bluetooth**
   - MAC Bluetooth de la PC (solo modo Bluetooth)
3. Pulsa **Lector con camara**.
4. Apunta al codigo de barras — cada escaneo se registra en la orden activa del PC.
5. Ajusta **Cantidad por escaneo** si cuentas por cajas/unidades multiples.

La app web movil (`App web movil`) sigue disponible para consulta de precios sin camara.

## Requisitos

- Android 7+ (API 24+)
- Camara trasera
- Bluetooth (solo modo respaldo)
- Misma red WiFi (modo WiFi) o puente activo en el PC (modo Bluetooth)

## Seguridad

- Usa usuarios con clave propia; no compartas la cuenta admin en bodega.
- El puente scanner solo debe estar activo en la red local de la tienda.
