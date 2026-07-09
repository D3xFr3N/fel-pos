# FEL POS Guatemala

Punto de venta estilo **Eleventa** con facturacion electronica **FEL** para SAT Guatemala.

## Que incluye

- Punto de venta (buscar productos, carrito, cobro)
- Punto de venta con filtro por departamento y botones rapidos por categoria (ej. Lacteos, Bebidas, etc.)
- Inventario de productos
- Departamentos de productos (creables por admin y asignables por producto)
- Clientes por NIT (CF o NIT registrado)
- Autocompletado de cliente por NIT en primera compra (opcional por API)
- Configuracion de mayoreo por producto (cantidad minima + descuento)
- Ingreso de inventario por usuarios autorizados y consulta de inventario bajo
- Dashboard de inventario con semaforo (critico, alerta, OK) y prioridad de reposicion
- Conteo fisico de inventario por sesion (escaneo SKU, cantidades, diferencia y perdida estimada)
- Ordenes de compra por proveedor (se separan y envian automaticamente al crearlas)
- Emision FEL al completar venta
- Devoluciones parciales o totales desde venta, con Nota de Credito FEL
- Historial de ventas y descarga de XML
- Roles de usuario (admin y cajero) con login
- Control de caja (apertura, movimientos, cierre y cuadre)
- Respaldo y restauracion de base de datos SQLite desde Configuracion (admin)
- Sistema de ordenes con envio por WhatsApp y Gmail
- Impresion de ticket al cobrar y apertura de gaveta de dinero
- Generador de codigo de barras por producto y impresion de etiquetas (todas las tiendas/perfiles)
- Modo **demo** sin certificador (para probar)
- Adaptador preparado para certificador **Infile** en produccion
- Perfil de tienda configurable: **abarrotes**, **farmacia** o **libreria** (libreria orientada a utiles escolares; adapta textos y flujo visual)
- En perfil **libreria**, productos incluyen campos escolares: categoria, grado, marca y variante/modelo

## Requisitos

- Python 3.11+
- Credenciales de certificador FEL (Infile, Digifact, etc.) para produccion

## Instalacion

```powershell
cd C:\Users\D3xFr3N\source\fel-pos
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edita `.env` con los datos reales de tu empresa y certificador.

Si quieres autocompletar datos cuando un NIT aparece por primera vez, configura:

- `NIT_LOOKUP_URL`
- `NIT_LOOKUP_TOKEN` (si tu proveedor lo requiere)

Regla de validacion al facturar:

- Si NIT viene vacio, el sistema usa `CF`.
- Si NIT no cumple formato valido (incluye validacion de digito verificador), bloquea la venta hasta corregirlo.

Configuracion de impresion de ticket:

- `RECEIPT_PRINTER_NAME` (vacio usa impresora por defecto de Windows)
- `RECEIPT_PRINT_ON_CHECKOUT=true`
- `RECEIPT_OPEN_DRAWER_ON_CHECKOUT=true`
- `RECEIPT_CHARS_PER_LINE=48` (recomendado para impresora 80mm)
- `RECEIPT_ENCODING=cp850`

Configuracion de impresion de etiquetas (codigo de barras):

- `LABEL_PRINTER_NAME` (vacio usa `RECEIPT_PRINTER_NAME` o impresora predeterminada)
- `LABEL_DEFAULT_WIDTH_MM=50`
- `LABEL_DEFAULT_HEIGHT_MM=30`
- `LABEL_ENCODING=cp850`

Configuracion de tipo de tienda:

- `BUSINESS_PROFILE=abarrotes` (opciones: `abarrotes`, `farmacia`, `libreria`)
- El perfil ajusta etiquetas de pestañas, nombres de botones y textos de trabajo para que el sistema se adapte al giro.

Configuracion de respaldo automatico:

- `BACKUP_DIR=./data/backups`
- `BACKUP_AUTO_DAILY=true`
- `BACKUP_RETENTION_DAYS=30`
- `BACKUP_AUTO_ON_COMMIT=true`
- `BACKUP_AUTO_MIN_INTERVAL_SECONDS=60`

Datos persistentes (protegidos en actualizaciones):

- Base de datos: `./data/fel_pos.db`
- Respaldos: `./data/backups/`
- Configuracion: `.env`
- Al iniciar, si detecta archivos viejos en la raiz (`fel_pos.db`, `backups/`), los migra automaticamente a `data/`.

Actualizar sistema sin perder datos:

1. Ejecuta respaldo previo:

```bat
pre_update_backup.bat
```

2. Actualiza desde carpeta nueva (recomendado):

```bat
update_system_safe.bat "C:\ruta\fel-pos-nuevo"
```

Este proceso protege `data/`, `.env`, `fel_pos.db` y `backups/` y solo reemplaza codigo del sistema.

Durabilidad ante corte de energia:

- SQLite trabaja en modo seguro (WAL + synchronous FULL) para proteger el ultimo movimiento confirmado.
- Cada commit de datos dispara auto-respaldo por movimiento (respetando intervalo minimo configurado).
- Al iniciar, si la base principal falta o esta corrupta, el sistema intenta recuperar automaticamente el respaldo mas reciente.

Mayoreo (configurable por admin):

- En productos puedes definir:
  - `wholesale_enabled` (activar mayoreo)
  - `wholesale_min_qty` (cantidad minima)
  - `wholesale_discount_pct` (descuento en porcentaje)
- Al vender, si la cantidad alcanza el minimo, el sistema aplica el descuento automaticamente.
- En historial de ventas se muestra la columna `Ahorro mayoreo`.

Roles:

- `admin`: acceso completo a configuraciones, proveedores, productos, compras, ventas, caja y ordenes.
- `admin`: tambien puede crear/editar departamentos para clasificar productos (ej. Lacteos, Bebidas, etc.).
- `user` (cajero): vender, cobrar (incluyendo mayoreo), registrar ingreso de inventario y consultar productos con inventario bajo.
- La caja queda amarrada al cajero que abrio el fondo: solo ese usuario puede vender, devolver y registrar movimientos de caja.
- En POS se muestra un indicador visual de caja asignada para evitar cobros en usuario equivocado.
- En Configuracion (admin) puedes crear usuarios cajero para que cada persona inicie sesion con su propia cuenta.
- En Configuracion (admin) hay filtros de usuarios por busqueda, rol y estado (incluye vista rapida de cajeros activos).
- En Configuracion (admin) puedes crear respaldo manual y restaurar un respaldo con un clic (la restauracion crea un respaldo de seguridad previo).
- El reporte de inventario bajo muestra `bajo desde` y `horas en bajo`.
- Dashboard muestra orden de reposicion y permite ingreso directo por producto.
- En Productos (admin) puedes usar `Generar CB faltantes`, `Generar CB` por producto y `Etiquetas` para imprimir codigos (navegador o impresora termica directa).
- En Productos (admin) puedes usar `Importar inventario` para cargar catalogo e inventario desde un archivo .xlsx o .csv.
- Cada producto puede tener **descripcion** para identificarlo al asignar codigo de barras; la descripcion tambien puede imprimirse en la etiqueta.
- El codigo generado automaticamente usa formato interno `FEL000123` (Code39) y se puede escanear en ventas, conteo y app movil.
- Desde el detalle de venta puedes registrar devolucion por linea (parcial o total), con control de cantidad disponible.
- La devolucion se captura en formulario visual por producto (cantidad, disponible y motivo), sin prompts.
- Al registrar devolucion, el sistema repone inventario, registra movimiento en caja y emite Nota de Credito FEL.
- Tanto `admin` como `user` pueden realizar conteo fisico; al aplicar, el sistema ajusta stock y deja trazabilidad en movimientos.
- El conteo fisico ahora se realiza por **orden de conteo**: debes crear codigo de orden + departamento; sin orden abierta no se permite escanear.
- Solo **admin** puede generar orden de conteo.
- Desde Conteo fisico puedes imprimir la orden de conteo por departamento (codigo, detalle y formato para conteo manual).
- La impresion de orden de conteo incluye campos de auditoria para firma de quien conto y firma de quien reviso.
- Puedes elegir tamano de impresion de orden de conteo: **Carta**, **Oficio** o **Legal**.
- Cada escaneo en conteo se guarda automaticamente; el cierre con ajuste y el reconteo son acciones exclusivas de **admin**.
- Al aplicar el conteo, el ajuste usa la **diferencia capturada al momento de escanear** cada linea para que ventas/compras posteriores no distorsionen el resultado final.
- En la pantalla de conteo se actualiza en tiempo real el **reporte de diferencias** y puedes imprimirlo en cualquier momento.
- En el area de conteo se muestra bitacora por orden: quien escaneo, que producto y a que hora.

Compras por proveedor:

- Cada producto debe tener un proveedor asignado.
- Si un producto no tiene proveedor, no podra incluirse en orden de compra.
- Al crear una orden de compra, el sistema agrupa automaticamente por proveedor.
- Se envia un mensaje al proveedor con solo los productos solicitados en su orden.
- La gestion de proveedores y ordenes de compra esta disponible para rol `admin`.
- Desde Dashboard inventario puedes usar `Generar compra automatica` con opcion de incluir alerta y ajustar cantidad por producto antes de crear las ordenes.
- En Compras puedes imprimir una orden detallada por proveedor (productos, cantidades, costos, subtotal y total).
- En Compras puedes reenviar una orden por `WhatsApp` o `Gmail` desde la misma tabla.

## Usuarios de prueba

- Admin: `admin` / `admin123`
- Cajero: `cajero` / `cajero123`

Al iniciar sesion recibes un token Bearer para consumir la API.

## Ejecutar

```powershell
python .\fel_pos_launcher.py
```

Por defecto inicia en modo **local/escritorio** (WebView).

### Modos de instalacion / ejecucion

Puedes usar FEL POS en dos modos:

- **Local (escritorio):** una sola PC, abre ventana embebida.
- **Servidor:** no abre ventana, publica API/UI para varias PCs en red.

Lanzadores rapidos incluidos:

```bat
run_local_mode.bat
run_server_mode.bat
```

### Autoarranque servidor (Windows recomendado para tienda)

Configuracion completa (recomendado, todo en uno):

1. Ejecuta como **Administrador**:

```bat
setup_all_server.bat
```

Esto deja listo:

- entorno `.venv`
- dependencias instaladas
- tarea de autoarranque al encender Windows
- regla de firewall para puerto `8000`

Para que el servidor quede siempre activo al encender la PC:

1. Ejecuta como **Administrador**:

```bat
install_server_autostart.bat
```

2. Esto crea una tarea programada `FELPOS_Server_Autostart` y abre el puerto `8000` en firewall local.
3. Log de servicio:
   - `server-autostart.log`

Para quitar el autoarranque:

```bat
remove_server_autostart.bat
```

Diagnostico rapido de estado:

```bat
server_status.bat
```

Tambien puedes usar variable de entorno:

```powershell
$env:FELPOS_MODE="local"   # o "server"
python .\fel_pos_launcher.py
```

## App movil (conteo y precios)

- Ruta movil: [`/mobile`](http://127.0.0.1:8000/mobile)
- Funciones:
  - escaneo para conteo (sincronizado en tiempo real con la orden activa)
  - verificacion de precio y stock por SKU
- Para usar desde telefono en la misma red WiFi, inicia en modo servidor
  (o define `FELPOS_BIND_HOST=0.0.0.0`).

- Luego abre en el telefono: `http://IP-DE-TU-PC:8000/mobile`
- En la app principal puedes usar el boton `QR app cel` para generar y escanear el enlace movil.
- El dialogo QR incluye `Detectar mi IP` para autocompletar host cuando sea posible.
- Al abrir el dialogo QR intenta detectar IP automaticamente; si no puede, usa `Detectar mi IP` o ingresala manualmente.
- El modo por defecto sigue siendo local (`127.0.0.1`) para escritorio.
- Si necesitas APK Android, usa el subproyecto `mobile-apk` (wrapper de conteo + precios) y su script `build_mobile_apk.ps1`.

## Modo escritorio (sin navegador)

- El sistema esta configurado para modo escritorio (sin fallback a navegador).
- El ejecutable `FELPOS.exe` abre una ventana embebida (WebView).
- Requiere Windows con WebView2 Runtime (normalmente ya viene instalado en Windows 10/11).

## Smoke test rapido

- API automatica:
  ```powershell
  python smoke_test_api.py
  ```
- API rol cajero (permisos + venta + caja):
  ```powershell
  python smoke_test_cajero.py
  ```
- Conteo fisico inventario (sesion + escaneo + ajuste):
  ```powershell
  python smoke_test_inventory_count.py
  ```
- UI manual:
  - Revisa `SMOKE_TEST_UI.md`

## Migrar inventario desde archivo

### 1. Exportar desde tu sistema actual

Exporta tu catalogo a Excel o CSV con columnas como: codigo, descripcion, costo, precio, departamento, existencias.

Si usas Eleventa: **F3 Productos → Catalogo → Exportar**.

### 2. Importar en FEL POS

1. Inicia sesion como **admin**.
2. Ve a la pestaña **Productos**.
3. Clic en **Importar inventario**.
4. Selecciona el archivo exportado.
5. Revisa opciones:
   - **Actualizar productos existentes**: si el codigo ya existe en FEL POS, actualiza datos.
   - **Importar existencias**: trae las cantidades de inventario.
6. Clic en **Importar**.

### Que se importa automaticamente

| Origen (archivo) | FEL POS |
|----------|---------|
| Codigo | SKU |
| Descripcion | Nombre |
| Costo | Costo |
| Precio de venta | Precio |
| Codigo de barras | Codigo de barras |
| Departamento | Departamento (se crea si no existe) |
| Proveedor | Proveedor (se crea si no existe) |
| Cantidad en inventario | Stock |
| Minimo | Stock minimo |

Si el archivo no trae proveedor, se usa **Importado inventario** (puedes cambiar ese nombre en el formulario).

### Recomendaciones

- Haz un **respaldo** antes de importar (Configuracion → Respaldos).
- Revisa precios despues de importar (Eleventa puede tener precios con IVA incluido).
- Si el archivo es `.xls` antiguo, abrelo en Excel y guardalo como `.xlsx` o `.csv`.
- Despues de importar puedes usar **Generar CB faltantes** para productos sin codigo de barras.

## Versiones y actualizaciones

La version oficial del sistema vive en el archivo `VERSION` en la raiz del proyecto.

Antes de generar un instalador o EXE:

1. Edita `VERSION` (ejemplo: `0.2.0`, `0.2.1`, `0.3.0`).
2. Ejecuta `.\build_installer.bat`.

Que hace el sistema:

- Muestra la version en la barra superior (`v0.2.0`).
- En **Configuracion** (admin) muestra version actual, anterior, fecha de compilacion e historial.
- Guarda historial en `data/app_version.json` al detectar una version nueva al iniciar.
- El instalador y `update_system_safe.bat` muestran version anterior y nueva al actualizar.

### Publicar actualizaciones en GitHub (sin reenviar instalador)

1. Crea un repositorio publico en GitHub (ejemplo: `fel-pos`).
2. Sube el codigo del proyecto.
3. Activa GitHub Pages: **Settings -> Pages -> Branch: `gh-pages` / (root)** (la primera publicacion crea la rama).
4. En tu PC (con [Git](https://git-scm.com/) y [GitHub CLI](https://cli.github.com/) instalados):

```powershell
# Genera zip + latest.json con URLs de GitHub
.\build_update_release.ps1 -GitHubOwner D3xFr3N -GitHubRepo fel-pos

# Publica en la rama gh-pages
.\publish_github_updates.ps1 -GitHubOwner D3xFr3N -GitHubRepo fel-pos
```

5. En cada tienda instala, configura en `.env` o en **Configuracion**:

```env
UPDATE_MANIFEST_URL=https://D3xFr3N.github.io/fel-pos/latest.json
```

6. Cuando publiques una version nueva, incrementa `VERSION`, vuelve a ejecutar `publish_github_updates.ps1` y las tiendas veran **Actualizar ahora**.

**Automatico con GitHub Actions:** al crear un tag `v0.3.6` o ejecutar el workflow **Publish FEL POS update** manualmente, se compila el EXE y se publica en GitHub Pages.

## Generar EXE (Windows)

Desde la raiz del proyecto:

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
.\build_exe.ps1
```

Tambien puedes ejecutar:

```powershell
.\build_exe.bat
```

El ejecutable se genera en:

- `dist/FELPOS.exe`

Si al abrir `FELPOS.exe` falla, revisa el archivo:

- `felpos-error.log`

## Generar instalador Setup.exe (Windows)

Requisito adicional: [Inno Setup 6](https://jrsoftware.org/isdl.php)

Desde la raiz del proyecto:

```powershell
.\build_installer.ps1
```

O con doble clic:

```powershell
.\build_installer.bat
```

El script:

1. Genera `dist/FELPOS.exe` si aun no existe.
2. Prepara `installer/staging/` con ejecutable, `.env.example` y scripts de respaldo.
3. Compila el instalador con Inno Setup.

Resultado:

- `dist/FELPOS_Setup.exe`

El instalador:

- Copia la app a `Program Files\FEL POS`
- Crea `data\` y `data\backups\` para conservar la base de datos
- Crea `.env` solo si no existe (no sobrescribe en actualizaciones)
- Agrega accesos directos en menu inicio y opcionalmente escritorio
- Incluye herramientas de respaldo y actualizacion segura

## Flujo FEL

1. Inicias sesion como admin o cajero.
2. Cajero: abre caja con monto inicial. Admin: el fondo es opcional.
3. Registras productos e inventario.
4. Vendes desde el POS.
5. Al cobrar, el sistema genera XML FEL y lo certifica.
6. En modo demo recibes UUID/serie simulados.
7. En produccion conectas tu certificador SAT.

## Proximos pasos sugeridos

- Integracion completa Infile/Digifact
- Notas de credito (NCRE)
- Factura cambiaria (FCAM)
- Impresion PDF con QR SAT
- Reportes contables
