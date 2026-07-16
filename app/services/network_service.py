from __future__ import annotations

import socket


def _is_private_ipv4(ip: str) -> bool:
    parts = ip.split(".")
    if len(parts) != 4:
        return False
    try:
        a, b, c, d = (int(p) for p in parts)
    except ValueError:
        return False
    if not all(0 <= x <= 255 for x in (a, b, c, d)):
        return False
    if a == 10:
        return True
    if a == 192 and b == 168:
        return True
    if a == 172 and 16 <= b <= 31:
        return True
    return False


def _is_usable_lan_ip(ip: str | None) -> bool:
    if not ip or ip.startswith("127.") or ip.startswith("169.254."):
        return False
    return True


def detect_lan_ip() -> str | None:
    """Best-effort LAN IPv4 for the default outbound route (Wi-Fi/Ethernet)."""
    candidates: list[str] = []

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.settimeout(1.0)
            sock.connect(("8.8.8.8", 80))
            ip = sock.getsockname()[0]
            if _is_usable_lan_ip(ip):
                candidates.append(ip)
    except OSError:
        pass

    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET, socket.SOCK_STREAM):
            ip = info[4][0]
            if _is_usable_lan_ip(ip) and ip not in candidates:
                candidates.append(ip)
    except OSError:
        pass

    if not candidates:
        return None

    private = [ip for ip in candidates if _is_private_ipv4(ip)]
    return private[0] if private else candidates[0]
