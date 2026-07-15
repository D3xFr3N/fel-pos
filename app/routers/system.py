from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import require_roles
from app.models import User
from app.schemas import (
    AppVersionOut,
    BackupCreateOut,
    BackupFileOut,
    BackupRestoreOut,
    UpdateApplyOut,
    UpdateCheckOut,
)
from app.services.backup_service import create_backup, list_backups, restore_backup
from app.services.update_service import check_for_updates, prepare_update_apply
from app.services.version_service import get_version_info

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/version", response_model=AppVersionOut)
def read_app_version():
    return get_version_info()


@router.get("/update/check", response_model=UpdateCheckOut)
def read_update_check(user: User = Depends(require_roles("admin"))):
    return check_for_updates()


@router.post("/update/apply", response_model=UpdateApplyOut)
def apply_system_update(user: User = Depends(require_roles("admin"))):
    try:
        result = prepare_update_apply()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo preparar la actualizacion: {exc}") from exc
    return UpdateApplyOut(**result)


@router.post("/update/restart")
def restart_after_update(user: User = Depends(require_roles("admin"))):
    from app.services.update_service import launch_pending_update_restart

    launch_pending_update_restart()
    return {"ok": True}


@router.get("/backups", response_model=list[BackupFileOut])
def get_backups(
    user: User = Depends(require_roles("admin")),
):
    return list_backups(limit=3)


@router.post("/backups", response_model=BackupCreateOut, status_code=201)
def create_manual_backup(
    user: User = Depends(require_roles("admin")),
):
    try:
        backup = create_backup("manual")
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo crear respaldo: {exc}") from exc
    return BackupCreateOut(message="Respaldo creado correctamente.", backup=BackupFileOut(**backup))


@router.post("/backups/{backup_name}/restore", response_model=BackupRestoreOut)
def restore_from_backup(
    backup_name: str,
    user: User = Depends(require_roles("admin")),
):
    try:
        restored_backup, safety_backup = restore_backup(backup_name)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo restaurar respaldo: {exc}") from exc
    return BackupRestoreOut(
        message="Base de datos restaurada correctamente.",
        restored_backup=BackupFileOut(**restored_backup),
        safety_backup=BackupFileOut(**safety_backup),
    )
