from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models import AuthorizedDevice, User
from app.services import device_auth_service
from app.services.audit_service import log_action

router = APIRouter(prefix="/api/devices", tags=["devices"])


class AuthorizedDeviceOut(BaseModel):
    id: int
    fingerprint: str
    hostname: str
    label: str
    last_ip: str
    last_seen_at: datetime | None = None
    status: str
    is_server: int
    created_at: datetime
    approved_at: datetime | None = None
    notes: str | None = None
    branch_id: int | None = None

    model_config = {"from_attributes": True}


class DeviceLabelUpdate(BaseModel):
    label: str = Field(default="", max_length=120)
    branch_id: int | None = None


def _to_out(device) -> AuthorizedDeviceOut:
    return AuthorizedDeviceOut.model_validate(device)


@router.get("/me", response_model=AuthorizedDeviceOut | None)
def get_my_device(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "user")),
):
    fp = device_auth_service.read_device_fingerprint(request)
    if not fp:
        return None
    device = db.query(AuthorizedDevice).filter(AuthorizedDevice.fingerprint == fp).one_or_none()
    return _to_out(device) if device else None


@router.get("", response_model=list[AuthorizedDeviceOut])
def list_authorized_devices(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    device_auth_service.ensure_server_device(db)
    return [_to_out(item) for item in device_auth_service.list_devices(db)]


@router.post("/{device_id}/approve", response_model=AuthorizedDeviceOut)
def approve_authorized_device(
    device_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    device = device_auth_service.approve_device(db, device_id)
    log_action(
        db,
        user_id=user.id,
        action="device_approved",
        entity_type="authorized_device",
        entity_id=device.id,
        details=f"{device.hostname or device.fingerprint} autorizado",
    )
    db.commit()
    return _to_out(device)


@router.post("/{device_id}/block", response_model=AuthorizedDeviceOut)
def block_authorized_device(
    device_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    device = device_auth_service.block_device(db, device_id)
    log_action(
        db,
        user_id=user.id,
        action="device_blocked",
        entity_type="authorized_device",
        entity_id=device.id,
        details=f"{device.hostname or device.fingerprint} bloqueado",
    )
    db.commit()
    return _to_out(device)


@router.delete("/{device_id}")
def delete_authorized_device(
    device_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    from app.models import AuthorizedDevice

    existing = db.get(AuthorizedDevice, device_id)
    label = ""
    if existing:
        label = existing.hostname or existing.fingerprint
    device_auth_service.delete_device(db, device_id)
    log_action(
        db,
        user_id=user.id,
        action="device_removed",
        entity_type="authorized_device",
        entity_id=device_id,
        details=f"{label} eliminado",
    )
    db.commit()
    return {"ok": True, "message": "Equipo eliminado."}


@router.patch("/{device_id}", response_model=AuthorizedDeviceOut)
def update_authorized_device(
    device_id: int,
    payload: DeviceLabelUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    from app.models import AuthorizedDevice, Branch

    device = device_auth_service.update_device_label(db, device_id, payload.label)
    updates = payload.model_dump(exclude_unset=True)
    if "branch_id" in updates:
        branch_id = updates.get("branch_id")
        if branch_id is not None:
            branch = db.get(Branch, branch_id)
            if not branch or not int(getattr(branch, "active", 1)):
                raise HTTPException(status_code=400, detail="Sucursal invalida.")
        device.branch_id = branch_id
    log_action(
        db,
        user_id=user.id,
        action="device_label_updated",
        entity_type="authorized_device",
        entity_id=device.id,
        details=f"Etiqueta: {device.label or '-'} · sucursal: {device.branch_id or '-'}",
    )
    db.commit()
    return _to_out(device)
