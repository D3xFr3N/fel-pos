"""Puente TCP/serial para recibir escaneos desde la APK (modo Bluetooth/respaldo).

Protocolo de linea (UTF-8, terminada en \\n):
  SCAN|<sku>|<cantidad>
Respuesta:
  OK|<nombre>|<contado>|<sistema>
  ERR|<mensaje>
"""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_bridge_thread: threading.Thread | None = None
_token: str | None = None
_stop_event = threading.Event()
_tcp_server: asyncio.AbstractServer | None = None


def _api_base() -> str:
    base = (settings.scanner_bridge_api_base or "http://127.0.0.1:8000").rstrip("/")
    return base


def _login_sync() -> str:
    username = (settings.scanner_bridge_username or "admin").strip()
    password = settings.scanner_bridge_password or ""
    with httpx.Client(timeout=10.0) as client:
        response = client.post(
            f"{_api_base()}/api/auth/login",
            json={"username": username, "password": password},
        )
        response.raise_for_status()
        payload = response.json()
        token = payload.get("access_token")
        if not token:
            raise RuntimeError("Login del puente sin token.")
        return token


def _auth_headers() -> dict[str, str]:
    global _token
    if not _token:
        _token = _login_sync()
    return {"Authorization": f"Bearer {_token}", "Content-Type": "application/json"}


def _request_with_auth(method: str, path: str, **kwargs: Any) -> httpx.Response:
    global _token
    headers = _auth_headers()
    with httpx.Client(timeout=15.0) as client:
        response = client.request(method, f"{_api_base()}{path}", headers=headers, **kwargs)
        if response.status_code == 401:
            _token = _login_sync()
            headers = _auth_headers()
            response = client.request(method, f"{_api_base()}{path}", headers=headers, **kwargs)
        return response


def process_scan_line(raw_line: str) -> str:
    line = (raw_line or "").strip()
    if not line:
        return "ERR|Linea vacia"

    parts = line.split("|")
    if len(parts) < 2 or parts[0].upper() != "SCAN":
        return "ERR|Formato invalido. Usa SCAN|SKU|CANTIDAD"

    sku = (parts[1] or "").strip().upper()
    if not sku:
        return "ERR|SKU requerido"

    try:
        qty = float(parts[2]) if len(parts) > 2 else 1.0
    except ValueError:
        return "ERR|Cantidad invalida"
    if qty <= 0:
        return "ERR|Cantidad debe ser mayor a cero"

    try:
        current = _request_with_auth("GET", "/api/stock-count/sessions/current")
        if current.status_code == 403:
            return "ERR|Usuario del puente sin permisos de conteo"
        if current.status_code >= 400:
            return f"ERR|No se pudo leer orden activa ({current.status_code})"
        session = current.json()
        if not session:
            return "ERR|No hay orden de conteo abierta en el PC"

        session_id = session.get("id")
        scan = _request_with_auth(
            "POST",
            f"/api/stock-count/sessions/{session_id}/scan",
            json={"sku": sku, "counted_quantity": qty, "replace_quantity": False},
        )
        if scan.status_code == 404:
            return f"ERR|Producto no encontrado: {sku}"
        if scan.status_code >= 400:
            detail = scan.json().get("detail", scan.text) if scan.headers.get("content-type", "").startswith("application/json") else scan.text
            return f"ERR|{detail}"

        data = scan.json()
        matched = next((item for item in data.get("items", []) if (item.get("sku") or "").upper() == sku), None)
        if not matched:
            matched = data.get("items", [{}])[-1] if data.get("items") else {}
        name = matched.get("name") or sku
        counted = matched.get("counted_quantity", qty)
        system = matched.get("system_quantity", 0)
        return f"OK|{name}|{counted}|{system}"
    except httpx.HTTPError as exc:
        logger.warning("Puente scanner HTTP error: %s", exc)
        return f"ERR|Sin conexion al servidor FEL POS ({exc})"
    except Exception as exc:
        logger.exception("Puente scanner error")
        return f"ERR|{exc}"


async def _handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    peer = writer.get_extra_info("peername")
    logger.info("Puente scanner: cliente conectado %s", peer)
    try:
        while True:
            data = await reader.readline()
            if not data:
                break
            line = data.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            if line.upper() == "PING":
                writer.write(b"PONG\n")
            else:
                result = await asyncio.to_thread(process_scan_line, line)
                writer.write((result + "\n").encode("utf-8"))
            await writer.drain()
    except ConnectionResetError:
        pass
    finally:
        writer.close()
        await writer.wait_closed()
        logger.info("Puente scanner: cliente desconectado %s", peer)


async def _run_tcp_server() -> None:
    global _tcp_server
    host = settings.scanner_bridge_host or "0.0.0.0"
    port = int(settings.scanner_bridge_port or 18765)
    _tcp_server = await asyncio.start_server(_handle_client, host, port)
    logger.info("Puente scanner TCP escuchando en %s:%s", host, port)
    async with _tcp_server:
        await _stop_event.wait()
    _tcp_server.close()
    await _tcp_server.wait_closed()
    _tcp_server = None


def _serial_loop() -> None:
    com_port = (settings.scanner_bridge_com_port or "").strip()
    if not com_port:
        return
    try:
        import serial  # type: ignore[import-untyped]
    except ImportError:
        logger.warning("pyserial no instalado; puente COM %s omitido.", com_port)
        return

    logger.info("Puente scanner serial escuchando en %s", com_port)
    while not _stop_event.is_set():
        try:
            with serial.Serial(com_port, baudrate=9600, timeout=1) as ser:
                buffer = ""
                while not _stop_event.is_set():
                    chunk = ser.read(256)
                    if not chunk:
                        continue
                    buffer += chunk.decode("utf-8", errors="replace")
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        line = line.strip()
                        if not line:
                            continue
                        result = process_scan_line(line)
                        ser.write((result + "\n").encode("utf-8"))
        except Exception as exc:
            if _stop_event.is_set():
                break
            logger.warning("Puente serial reiniciando (%s): %s", com_port, exc)
            _stop_event.wait(3)


def _bridge_main() -> None:
    if settings.scanner_bridge_com_port:
        serial_thread = threading.Thread(target=_serial_loop, daemon=True, name="felpos-bt-serial")
        serial_thread.start()
    try:
        asyncio.run(_run_tcp_server())
    except Exception as exc:
        logger.error("Puente scanner TCP detenido: %s", exc)


def is_scanner_bridge_running() -> bool:
    return _bridge_thread is not None and _bridge_thread.is_alive()


def stop_scanner_bridge() -> None:
    global _bridge_thread, _token
    if not is_scanner_bridge_running():
        _bridge_thread = None
        _token = None
        return
    _stop_event.set()
    if _bridge_thread:
        _bridge_thread.join(timeout=5)
    _bridge_thread = None
    _token = None
    logger.info("Puente scanner detenido.")


def start_scanner_bridge() -> None:
    global _bridge_thread
    if is_scanner_bridge_running():
        return
    _stop_event.clear()
    _bridge_thread = threading.Thread(target=_bridge_main, daemon=True, name="felpos-scanner-bridge")
    _bridge_thread.start()
    logger.info("Puente scanner iniciado.")


def restart_scanner_bridge() -> None:
    stop_scanner_bridge()
    if settings.scanner_bridge_enabled:
        start_scanner_bridge()
