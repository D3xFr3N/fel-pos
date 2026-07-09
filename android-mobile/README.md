# APK Android directo (sin scripts)

Esta carpeta contiene una app Android nativa (`WebView`) para abrir `http://TU_IP:8000/mobile` y usar:

- Conteo fisico
- Verificacion de precios

## Compilar APK desde Android Studio (sin comandos)

1. Abre Android Studio.
2. Click en `Open` y selecciona la carpeta:
   - `C:\Users\D3xFr3N\source\fel-pos\android-mobile`
3. Espera a que termine `Gradle Sync`.
4. Ve a menu:
   - `Build` -> `Build Bundle(s) / APK(s)` -> `Build APK(s)`
5. Al terminar, Android Studio mostrara un link `locate`.

Ruta esperada del APK:

- `android-mobile\app\build\outputs\apk\debug\app-debug.apk`

## Compilar APK con un click (CMD)

Puedes usar:

- `android-mobile\build_apk_android.bat`

Tambien por linea de comando:

```cmd
cd /d C:\Users\D3xFr3N\source\fel-pos\android-mobile
build_apk_android.bat
```

## APK release firmada (recomendada para distribuir)

1) Crear keystore y archivo de firma:

```cmd
cd /d C:\Users\D3xFr3N\source\fel-pos\android-mobile
create_release_keystore.bat
```

2) Compilar release firmada:

```cmd
cd /d C:\Users\D3xFr3N\source\fel-pos\android-mobile
build_apk_release.bat
```

APK release esperada:

- `android-mobile\app\build\outputs\apk\release\app-release.apk`

El script tambien copia una version al escritorio como:

- `FELPOS-Mobile-release.apk`

## Uso en el telefono

1. Instala la APK en Android.
2. Abre la app `FEL POS Movil`.
3. Escribe la URL base de tu servidor:
   - `http://192.168.X.X:8000`
4. Pulsa `Abrir app movil`.

## Importante

- Tu servidor principal debe estar corriendo en LAN:
  - `FELPOS_BIND_HOST=0.0.0.0`
- Celular y PC deben estar en la misma red WiFi.
- Si aparece `JAVA_HOME is not set`, ejecuta en CMD:

```cmd
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "PATH=%JAVA_HOME%\bin;%PATH%"
build_apk_android.bat
```

## Seguridad

- `release-signing.properties` y `keystore/` son archivos sensibles y quedan en local.
- Guarda una copia de tu keystore en un lugar seguro; si la pierdes, no podras actualizar la app firmada existente.
