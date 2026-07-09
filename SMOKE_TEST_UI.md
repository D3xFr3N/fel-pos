# Smoke Test UI (3-5 min)

## Pre-check

1. Inicia backend:
   - `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
2. Abre `http://127.0.0.1:8000`
3. Login:
   - Admin: `admin / admin123`

## Flujo rapido

1. **Caja**
   - Ir a pestana `Caja`.
   - Abrir caja con monto inicial `100`.
   - Verifica que aparece "Caja abierta".

2. **Inventario**
   - Ir a `Productos`.
   - Crear un producto (si no hay).
   - Verifica que aparece en tabla y en catalogo de `Vender`.

3. **Venta + FEL**
   - Ir a `Vender`.
   - Agregar 1 producto al ticket.
   - Cobrar.
   - Verifica:
     - venta creada en historial,
     - serie/numero FEL visible,
     - descarga de XML disponible.

4. **Ordenes**
   - Ir a `Ordenes`.
   - Crear una orden con WhatsApp y Gmail.
   - Enviar por ambos canales.
   - Verifica estado `queued` (si no hay credenciales reales) o `sent` (si hay credenciales).

5. **Cierre de caja**
   - Regresa a `Caja`.
   - Cierra con conteo fisico igual al esperado.
   - Verifica diferencia `0.0`.

## Resultado esperado

- Login y permisos activos.
- Caja abierta/cerrada correctamente.
- Venta con FEL emitida.
- Orden registrada y envio trazable.
- Cuadre de caja sin diferencia.
