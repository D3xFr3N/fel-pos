from __future__ import annotations

import os
import platform
from datetime import datetime

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from app.models import AuthorizedDevice
from app.services.license_service import get_install_fingerprint

DEVICE_ID_HEADER = "X-FELPOS-Device-Id"
DEVICE_HOSTNAME_HEADER = "X-FELPOS-Hostname"

STATUS_PENDING = "pending"
STATUS_APPROVED = "approved"
STATUS_BLOCKED = "blocked"


def is_device_auth_enabled() -> bool:
    raw = (os.getenv("FELPOS_DEVICE_AUTH") or "true").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def client_ip(request: Request) -> str:
    """IP del cliente. X-Forwarded-For solo si FELPOS_TRUST_PROXY esta activo."""
    direct = ""
    if request.client and request.client.host:
        direct = request.client.host.strip()
    trust_proxy = (os.getenv("FELPOS_TRUST_PROXY") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if trust_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # Con proxy confiable usamos el primer hop del cliente original.
            return forwarded.split(",")[0].strip()
    return direct


def is_loopback_ip(ip: str) -> bool:
    value = (ip or "").strip().lower()
    return value in {"127.0.0.1", "::1", "localhost"} or value.startswith("127.")


def normalize_fingerprint(value: str | None) -> str:
    text = (value or "").strip().upper()
    if not text or text == "-":
        return ""
    return text[:64]


def read_device_fingerprint(request: Request, token_fingerprint: str | None = None) -> str:
    header_fp = normalize_fingerprint(request.headers.get(DEVICE_ID_HEADER))
    token_fp = normalize_fingerprint(token_fingerprint)
    if token_fp and header_fp and token_fp != header_fp:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La sesion no corresponde a este equipo. Vuelve a iniciar sesion en este equipo.",
        )
    if token_fp:
        return token_fp
    return header_fp


def read_device_hostname(request: Request) -> str:
    header = (request.headers.get(DEVICE_HOSTNAME_HEADER) or "").strip()
    if header:
        return header[:120]
    return ""


def ensure_server_device(db: Session) -> AuthorizedDevice:
    fingerprint = get_install_fingerprint()
    hostname = (platform.node() or "servidor").strip()[:120] or "servidor"
    device = (
        db.query(AuthorizedDevice)
        .filter(AuthorizedDevice.fingerprint == fingerprint)
        .first()
    )
    now = datetime.utcnow()
    if device is None:
        device = AuthorizedDevice(
            fingerprint=fingerprint,
            hostname=hostname,
            label="PC servidor",
            last_ip="127.0.0.1",
            last_seen_at=now,
            status=STATUS_APPROVED,
            is_server=1,
            created_at=now,
            approved_at=now,
        )
        db.add(device)
        db.commit()
        db.refresh(device)
        return device

    changed = False
    if device.status != STATUS_APPROVED:
        device.status = STATUS_APPROVED
        device.approved_at = now
        changed = True
    if not device.is_server:
        device.is_server = 1
        changed = True
    if hostname and device.hostname != hostname:
        device.hostname = hostname
        changed = True
    if not device.label:
        device.label = "PC servidor"
        changed = True
    device.last_seen_at = now
    if changed:
        db.commit()
        db.refresh(device)
    else:
        db.commit()
    return device


def get_device_by_fingerprint(db: Session, fingerprint: str) -> AuthorizedDevice | None:
    fp = normalize_fingerprint(fingerprint)
    if not fp:
        return None
    return db.query(AuthorizedDevice).filter(AuthorizedDevice.fingerprint == fp).first()


def upsert_device(
    db: Session,
    *,
    fingerprint: str,
    hostname: str = "",
    ip: str = "",
    auto_approve: bool = False,
) -> AuthorizedDevice:
    fp = normalize_fingerprint(fingerprint)
    if not fp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Falta identificacion del equipo.",
        )

    device = get_device_by_fingerprint(db, fp)
    now = datetime.utcnow()
    host = (hostname or "").strip()[:120]
    if device is None:
        device = AuthorizedDevice(
            fingerprint=fp,
            hostname=host or "Equipo",
            label="",
            last_ip=(ip or "")[:64],
            last_seen_at=now,
            status=STATUS_APPROVED if auto_approve else STATUS_PENDING,
            is_server=0,
            created_at=now,
            approved_at=now if auto_approve else None,
        )
        db.add(device)
        db.commit()
        db.refresh(device)
        return device

    if host:
        device.hostname = host
    if ip:
        device.last_ip = ip[:64]
    device.last_seen_at = now
    db.commit()
    db.refresh(device)
    return device


def assert_device_allowed(
    db: Session,
    request: Request,
    *,
    token_fingerprint: str | None = None,
    register_if_missing: bool = True,
) -> AuthorizedDevice | None:
    """Valida el equipo remoto. Localhost siempre permitido."""
    if not is_device_auth_enabled():
        return None

    ip = client_ip(request)
    if is_loopback_ip(ip):
        return ensure_server_device(db)

    fingerprint = read_device_fingerprint(request, token_fingerprint)
    hostname = read_device_hostname(request)
    token_fp = normalize_fingerprint(token_fingerprint)
    header_fp = normalize_fingerprint(request.headers.get(DEVICE_ID_HEADER))
    # Sesion con huella: el header del equipo debe estar presente y coincidir.
    if token_fp and not header_fp:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Este equipo no envio identificacion. "
                "Usa FEL POS Caja (escritorio) actualizado, o pide al admin autorizarlo."
            ),
        )
    if not fingerprint:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Este equipo no envio identificacion. "
                "Usa FEL POS Caja (escritorio) actualizado, o pide al admin autorizarlo."
            ),
        )

    device = get_device_by_fingerprint(db, fingerprint)
    if device is None:
        if not register_if_missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Este equipo no esta autorizado.",
            )
        device = upsert_device(
            db,
            fingerprint=fingerprint,
            hostname=hostname,
            ip=ip,
            auto_approve=False,
        )
    else:
        if hostname:
            device.hostname = hostname
        device.last_ip = (ip or device.last_ip or "")[:64]
        device.last_seen_at = datetime.utcnow()
        db.commit()
        db.refresh(device)

    if device.is_server:
        return device

    if device.status == STATUS_BLOCKED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este equipo fue bloqueado por el administrador del servidor.",
        )
    if device.status != STATUS_APPROVED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Este equipo aun no esta autorizado. "
                "Pide al administrador que lo apruebe en Configuracion > Equipos autorizados."
            ),
        )
    return device


def list_devices(db: Session) -> list[AuthorizedDevice]:
    return (
        db.query(AuthorizedDevice)
        .order_by(
            AuthorizedDevice.is_server.desc(),
            AuthorizedDevice.status.asc(),
            AuthorizedDevice.last_seen_at.desc(),
        )
        .all()
    )


def approve_device(db: Session, device_id: int) -> AuthorizedDevice:
    device = db.get(AuthorizedDevice, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Equipo no encontrado.")
    device.status = STATUS_APPROVED
    device.approved_at = datetime.utcnow()
    db.commit()
    db.refresh(device)
    return device


def block_device(db: Session, device_id: int) -> AuthorizedDevice:
    device = db.get(AuthorizedDevice, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Equipo no encontrado.")
    if device.is_server:
        raise HTTPException(
            status_code=400,
            detail="No puedes bloquear la PC servidor.",
        )
    device.status = STATUS_BLOCKED
    db.commit()
    db.refresh(device)
    return device


def delete_device(db: Session, device_id: int) -> None:
    device = db.get(AuthorizedDevice, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Equipo no encontrado.")
    if device.is_server:
        raise HTTPException(
            status_code=400,
            detail="No puedes eliminar la PC servidor.",
        )
    db.delete(device)
    db.commit()


def update_device_label(db: Session, device_id: int, label: str) -> AuthorizedDevice:
    device = db.get(AuthorizedDevice, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Equipo no encontrado.")
    device.label = (label or "").strip()[:120]
    db.commit()
    db.refresh(device)
    return device
