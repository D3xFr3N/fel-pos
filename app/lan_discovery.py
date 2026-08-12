"""Descubrimiento LAN de FEL POS (UDP) sin depender de la base de datos."""

from __future__ import annotations

import json
import os
import socket
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

DISCOVERY_PORT = int(os.getenv("FELPOS_DISCOVERY_PORT", "38477"))
APP_NAME = "FELPOS"
CACHE_NAME = "last_server.json"


@dataclass
class DiscoveredServer:
    host: str
    port: int

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"


def _cache_path() -> Path:
    local = os.environ.get("LOCALAPPDATA") or os.environ.get("HOME") or "."
    folder = Path(local) / "FELPOS"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / CACHE_NAME


def load_cached_server() -> DiscoveredServer | None:
    path = _cache_path()
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        host = str(data.get("host") or "").strip()
        port = int(data.get("port") or 0)
        if host and 1 <= port <= 65535:
            return DiscoveredServer(host=host, port=port)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return None
    return None


def save_cached_server(server: DiscoveredServer) -> None:
    path = _cache_path()
    path.write_text(
        json.dumps({"host": server.host, "port": server.port, "saved_at": time.time()}, indent=2),
        encoding="utf-8",
    )


def probe_felpos(host: str, port: int, timeout: float = 0.8) -> bool:
    url = f"http://{host}:{port}/api/system/version"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status >= 400:
                return False
            raw = resp.read(4000)
        payload = json.loads(raw.decode("utf-8", errors="replace"))
        version = str(payload.get("version") or "")
        app_name = str(payload.get("app_name") or payload.get("name") or "")
        return bool(version) or "FEL" in app_name.upper() or "POS" in app_name.upper()
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError):
        return False


def _local_ipv4() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            ip = sock.getsockname()[0]
            if ip and not ip.startswith("127."):
                return ip
    except OSError:
        pass
    return None


def _encode(payload: dict) -> bytes:
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def _decode(raw: bytes) -> dict | None:
    try:
        data = json.loads(raw.decode("utf-8", errors="replace"))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    if data.get("app") != APP_NAME:
        return None
    return data


def build_here_payload(*, port: int, host: str | None = None) -> dict:
    payload = {"cmd": "here", "app": APP_NAME, "port": int(port)}
    if host:
        payload["host"] = host
    return payload


def start_lan_announcer(*, http_port: int, bind_host: str) -> threading.Thread | None:
    """Anuncia el servidor en LAN. No arranca si solo escucha localhost."""
    if bind_host.strip() in {"127.0.0.1", "localhost"}:
        return None

    stop = threading.Event()

    def _loop() -> None:
        local_ip = _local_ipv4()
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            sock.bind(("0.0.0.0", DISCOVERY_PORT))
            sock.settimeout(1.0)
        except OSError:
            return

        payload = _encode(build_here_payload(port=http_port, host=local_ip))
        last_broadcast = 0.0
        try:
            while not stop.is_set():
                now = time.time()
                if now - last_broadcast >= 2.0:
                    try:
                        sock.sendto(payload, ("255.255.255.255", DISCOVERY_PORT))
                        if local_ip:
                            parts = local_ip.split(".")
                            if len(parts) == 4:
                                bcast = f"{parts[0]}.{parts[1]}.{parts[2]}.255"
                                sock.sendto(payload, (bcast, DISCOVERY_PORT))
                    except OSError:
                        pass
                    last_broadcast = now
                try:
                    raw, addr = sock.recvfrom(2048)
                except TimeoutError:
                    continue
                except OSError:
                    break
                data = _decode(raw)
                if not data or data.get("cmd") != "who":
                    continue
                reply_host = local_ip or addr[0]
                reply = _encode(build_here_payload(port=http_port, host=reply_host))
                try:
                    sock.sendto(reply, addr)
                except OSError:
                    pass
        finally:
            try:
                sock.close()
            except OSError:
                pass

    thread = threading.Thread(target=_loop, name="felpos-lan-announce", daemon=True)
    thread.start()
    # Guarda stop en el hilo para posibles extensiones futuras.
    thread._felpos_stop = stop  # type: ignore[attr-defined]
    return thread


def _udp_discover(timeout: float = 2.5) -> list[DiscoveredServer]:
    found: dict[tuple[str, int], DiscoveredServer] = {}
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", 0))
        sock.settimeout(0.4)
    except OSError:
        return []

    who = _encode({"cmd": "who", "app": APP_NAME})
    targets = [("255.255.255.255", DISCOVERY_PORT)]
    local_ip = _local_ipv4()
    if local_ip:
        parts = local_ip.split(".")
        if len(parts) == 4:
            targets.append((f"{parts[0]}.{parts[1]}.{parts[2]}.255", DISCOVERY_PORT))

    deadline = time.time() + timeout
    try:
        while time.time() < deadline:
            for target in targets:
                try:
                    sock.sendto(who, target)
                except OSError:
                    pass
            try:
                raw, addr = sock.recvfrom(2048)
            except TimeoutError:
                continue
            except OSError:
                break
            data = _decode(raw)
            if not data or data.get("cmd") != "here":
                continue
            try:
                port = int(data.get("port") or 0)
            except (TypeError, ValueError):
                continue
            host = str(data.get("host") or addr[0]).strip()
            if not host or not (1 <= port <= 65535):
                continue
            found[(host, port)] = DiscoveredServer(host=host, port=port)
    finally:
        try:
            sock.close()
        except OSError:
            pass
    return list(found.values())


def _subnet_scan(http_port: int, timeout: float = 4.0) -> list[DiscoveredServer]:
    local_ip = _local_ipv4()
    if not local_ip:
        return []
    parts = local_ip.split(".")
    if len(parts) != 4:
        return []
    prefix = f"{parts[0]}.{parts[1]}.{parts[2]}"
    candidates = [f"{prefix}.{i}" for i in range(1, 255) if f"{prefix}.{i}" != local_ip]
    found: list[DiscoveredServer] = []
    deadline = time.time() + timeout

    def check(host: str) -> DiscoveredServer | None:
        if time.time() > deadline:
            return None
        if probe_felpos(host, http_port, timeout=0.35):
            return DiscoveredServer(host=host, port=http_port)
        return None

    with ThreadPoolExecutor(max_workers=48) as pool:
        futures = [pool.submit(check, host) for host in candidates]
        for fut in as_completed(futures):
            try:
                item = fut.result()
            except Exception:
                continue
            if item:
                found.append(item)
                break
    return found


def discover_server(
    *,
    preferred_port: int = 8000,
    timeout: float = 3.0,
) -> DiscoveredServer | None:
    """Encuentra un servidor FEL POS en la LAN sin pedir IP al usuario."""
    cached = load_cached_server()
    if cached and probe_felpos(cached.host, cached.port, timeout=0.7):
        return cached

    explicit = (os.getenv("FELPOS_SERVER_URL") or "").strip()
    if explicit:
        # Permite override manual si hace falta, sin UI.
        raw = explicit.rstrip("/")
        if raw.startswith("http://"):
            raw = raw[len("http://") :]
        elif raw.startswith("https://"):
            raw = raw[len("https://") :]
        host_port = raw.split("/")[0]
        if ":" in host_port:
            host, port_s = host_port.rsplit(":", 1)
            port = int(port_s)
        else:
            host, port = host_port, preferred_port
        if probe_felpos(host, port, timeout=1.0):
            server = DiscoveredServer(host=host, port=port)
            save_cached_server(server)
            return server

    for candidate in _udp_discover(timeout=timeout):
        if probe_felpos(candidate.host, candidate.port, timeout=0.7):
            save_cached_server(candidate)
            return candidate

    for candidate in _subnet_scan(preferred_port, timeout=max(3.0, timeout)):
        save_cached_server(candidate)
        return candidate

    return None
