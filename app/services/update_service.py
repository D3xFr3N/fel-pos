from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from app.config import settings
from app.services.license_service import assert_license_allows_updates, validate_license
from app.services.backup_service import create_backup
from app.version import get_app_version, get_install_dir

PENDING_UPDATE_SCRIPT = "apply_pending_update.bat"
PENDING_UPDATE_META = "pending_update.json"
PENDING_UPDATE_LOG = "felpos-update.log"
UPDATE_FILES = ("FELPOS.exe", "VERSION", "BUILD_DATE")
UPDATE_SUPPORT_FILES = (
    "Aplicar_actualizacion_pendiente.bat",
    "Reparar_instalacion.bat",
    "Iniciar_FELPOS.bat",
    "Limpiar_actualizacion_pendiente.bat",
    "Diagnostico_instalacion.bat",
    "Reparar_permisos_instalacion.bat",
)
HTTP_TIMEOUT_SECONDS = 45


@dataclass
class UpdateManifest:
    version: str
    download_url: str
    build_date: str | None = None
    sha256: str | None = None
    release_notes: str | None = None


def _version_key(value: str) -> tuple:
    parts: list[Any] = []
    for chunk in re.split(r"[.\-]", (value or "").strip()):
        if not chunk:
            continue
        if chunk.isdigit():
            parts.append(int(chunk))
        else:
            parts.append(chunk)
    return tuple(parts) if parts else (0,)


def is_newer_version(remote_version: str, current_version: str | None = None) -> bool:
    current = current_version or get_app_version()
    return _version_key(remote_version) > _version_key(current)


def get_update_manifest_url() -> str:
    return (settings.update_manifest_url or "").strip()


def _fetch_manifest(url: str) -> UpdateManifest:
    with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS, follow_redirects=True) as client:
        response = client.get(url)
        response.raise_for_status()
        payload = response.json()
    version = str(payload.get("version") or "").strip()
    download_url = str(payload.get("download_url") or "").strip()
    if not version or not download_url:
        raise ValueError("El manifiesto de actualizacion no tiene version o download_url.")
    return UpdateManifest(
        version=version,
        download_url=download_url,
        build_date=(str(payload.get("build_date")).strip() if payload.get("build_date") else None),
        sha256=(str(payload.get("sha256")).strip().lower() if payload.get("sha256") else None),
        release_notes=(str(payload.get("release_notes")).strip() if payload.get("release_notes") else None),
    )


def check_for_updates() -> dict:
    manifest_url = get_update_manifest_url()
    current_version = get_app_version()
    license_info = validate_license()
    license_payload = {
        "license_required": license_info.required,
        "license_valid": license_info.valid,
        "license_status": license_info.status,
        "license_store_label": license_info.store_label,
        "license_store_id": license_info.store_id,
        "license_message": license_info.message,
        "license_cached": license_info.cached,
    }
    if not manifest_url:
        return {
            "enabled": False,
            "current_version": current_version,
            "update_available": False,
            "message": "Actualizaciones automaticas no configuradas.",
            **license_payload,
        }

    if license_info.required and not license_info.valid:
        return {
            "enabled": True,
            "current_version": current_version,
            "update_available": False,
            "manifest_url": manifest_url,
            "message": license_info.message or "Licencia no valida para actualizaciones.",
            **license_payload,
        }

    try:
        manifest = _fetch_manifest(manifest_url)
    except Exception as exc:
        return {
            "enabled": True,
            "current_version": current_version,
            "update_available": False,
            "manifest_url": manifest_url,
            "error": str(exc),
            "message": f"No se pudo consultar actualizaciones: {exc}",
            **license_payload,
        }

    available = is_newer_version(manifest.version, current_version)
    return {
        "enabled": True,
        "current_version": current_version,
        "latest_version": manifest.version,
        "build_date": manifest.build_date,
        "download_url": manifest.download_url,
        "release_notes": manifest.release_notes,
        "update_available": available,
        "manifest_url": manifest_url,
        "message": (
            f"Nueva version disponible: {manifest.version}"
            if available
            else "El sistema ya esta en la ultima version publicada."
        ),
        **license_payload,
    }


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _download_file(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS, follow_redirects=True) as client:
        with client.stream("GET", url) as response:
            response.raise_for_status()
            with target.open("wb") as handle:
                for chunk in response.iter_bytes():
                    handle.write(chunk)


def _extract_update_zip(zip_path: Path, extract_dir: Path) -> dict[str, Path]:
    extract_dir.mkdir(parents=True, exist_ok=True)
    found: dict[str, Path] = {}
    with zipfile.ZipFile(zip_path, "r") as archive:
        archive.extractall(extract_dir)
    for name in UPDATE_FILES:
        direct = extract_dir / name
        if direct.exists():
            found[name] = direct
            continue
        matches = list(extract_dir.rglob(name))
        if matches:
            found[name] = matches[0]
    if "FELPOS.exe" not in found:
        raise ValueError("El paquete de actualizacion no contiene FELPOS.exe.")
    return found


def _stage_support_files(install_dir: Path, extract_dir: Path) -> list[str]:
    assets_dir = Path(__file__).resolve().parent.parent.parent / "installer" / "assets"
    staged: list[str] = []
    for file_name in UPDATE_SUPPORT_FILES:
        source_candidates = [extract_dir / file_name, assets_dir / file_name]
        source_candidates.extend(extract_dir.rglob(file_name))
        source_path = next((path for path in source_candidates if path.exists()), None)
        if not source_path:
            continue
        target_path = install_dir / file_name
        try:
            shutil.copy2(source_path, target_path)
            staged.append(file_name)
        except OSError:
            # En Program Files sin permiso se omiten; el EXE/VERSION bastan para actualizar.
            continue
    return staged


def _append_update_log(install_dir: Path, message: str) -> None:
    try:
        log_path = install_dir / PENDING_UPDATE_LOG
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(f"[{timestamp}] {message}\n")
    except OSError:
        try:
            fallback = _user_updates_dir() / PENDING_UPDATE_LOG
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            with fallback.open("a", encoding="utf-8") as handle:
                handle.write(f"[{timestamp}] {message}\n")
        except OSError:
            pass


def _install_dir() -> Path:
    return get_install_dir()


def _user_updates_dir() -> Path:
    local_app = (os.getenv("LOCALAPPDATA") or "").strip()
    if local_app:
        target = Path(local_app) / "FEL POS" / "updates"
    else:
        target = Path.home() / "FEL POS" / "updates"
    target.mkdir(parents=True, exist_ok=True)
    return target.resolve()


def _dir_is_writable(path: Path) -> bool:
    path.mkdir(parents=True, exist_ok=True)
    probe = path / f".felpos_write_test_{os.getpid()}"
    try:
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return True
    except OSError:
        return False


def _permission_denied_help(install_dir: Path) -> str:
    repair_bat = install_dir / "Reparar_permisos_instalacion.bat"
    hint = (
        f"No hay permiso para escribir en la carpeta de instalacion:\n{install_dir}\n\n"
        "Solucion rapida:\n"
        "1) Ejecuta 'Reparar permisos (actualizaciones)' desde el menu Inicio de FEL POS, o\n"
        "2) Abre FEL POS como administrador una vez y vuelve a actualizar, o\n"
        "3) Reinstala con el instalador nuevo desde GitHub (conserva tus datos)."
    )
    if repair_bat.exists():
        hint += f"\n\nScript: {repair_bat}"
    return hint


def clear_pending_update_artifacts(install_dir: Path | None = None) -> list[str]:
    root = (install_dir or _install_dir()).resolve()
    removed: list[str] = []
    for name in (
        "FELPOS.exe.pending",
        "FELPOS.exe.old",
        "VERSION.pending",
        "BUILD_DATE.pending",
        PENDING_UPDATE_META,
        PENDING_UPDATE_SCRIPT,
    ):
        path = root / name
        if not path.exists():
            continue
        try:
            path.unlink()
            removed.append(name)
        except OSError:
            pass
    if removed:
        _append_update_log(root, f"Archivos de actualizacion limpiados: {', '.join(removed)}")
    return removed


def cleanup_stale_pending_update(install_dir: Path | None = None) -> list[str]:
    """
    Elimina restos de una actualizacion interrumpida cuando FELPOS.exe ya funciona.
    """
    root = (install_dir or _install_dir()).resolve()
    pending_exe = root / "FELPOS.exe.pending"
    current_exe = root / "FELPOS.exe"
    if not pending_exe.exists() or not current_exe.exists():
        return []

    meta_path = root / PENDING_UPDATE_META
    target_version: str | None = None
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            target_version = str(meta.get("target_version") or "").strip() or None
        except (json.JSONDecodeError, OSError):
            target_version = None

    current_version = get_app_version()
    if target_version and not is_newer_version(target_version, current_version):
        return clear_pending_update_artifacts(root)

    try:
        if pending_exe.stat().st_mtime <= current_exe.stat().st_mtime:
            return clear_pending_update_artifacts(root)
    except OSError:
        pass

    return []


def has_pending_executable_update(install_dir: Path | None = None) -> bool:
    root = (install_dir or _install_dir()).resolve()
    cleanup_stale_pending_update(root)
    pending_exe = root / "FELPOS.exe.pending"
    current_exe = root / "FELPOS.exe"
    if not pending_exe.exists():
        return False
    if not current_exe.exists():
        return True
    try:
        return pending_exe.stat().st_mtime > current_exe.stat().st_mtime
    except OSError:
        return True


def apply_pending_update_at_startup(install_dir: Path | None = None) -> dict | None:
    """
    Solo aplica archivos que no son el ejecutable principal.
    FELPOS.exe debe reemplazarse cuando el proceso ya no esta en ejecucion.
    """
    root = (install_dir or _install_dir()).resolve()
    if has_pending_executable_update(root):
        return None

    pending_files = [
        name for name in UPDATE_FILES if name != "FELPOS.exe" and (root / f"{name}.pending").exists()
    ]
    if not pending_files:
        return None

    applied: list[str] = []
    errors: list[str] = []
    for file_name in pending_files:
        pending_path = root / f"{file_name}.pending"
        target_path = root / file_name
        try:
            os.replace(pending_path, target_path)
            applied.append(file_name)
        except OSError as exc:
            errors.append(f"{file_name}: {exc}")

    meta_path = root / PENDING_UPDATE_META
    meta: dict[str, Any] = {}
    if meta_path.exists() and not has_pending_executable_update(root):
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            meta = {}
        meta_path.unlink(missing_ok=True)

    script_path = root / PENDING_UPDATE_SCRIPT
    if script_path.exists() and not has_pending_executable_update(root):
        script_path.unlink(missing_ok=True)

    if errors and not applied:
        raise RuntimeError("No se pudo aplicar la actualizacion pendiente: " + "; ".join(errors))

    if applied:
        _append_update_log(root, f"Archivos aplicados al iniciar: {', '.join(applied)}")

    return {
        "applied_files": applied,
        "target_version": meta.get("target_version"),
        "previous_version": meta.get("previous_version"),
        "errors": errors,
    }


def _write_restart_script(
    install_dir: Path,
    *,
    stage_dir: Path | None = None,
    require_elevation: bool = False,
) -> Path:
    if require_elevation and stage_dir is not None:
        script_path = stage_dir / PENDING_UPDATE_SCRIPT
    else:
        script_path = install_dir / PENDING_UPDATE_SCRIPT

    log_name = PENDING_UPDATE_LOG
    install_quoted = str(install_dir)
    stage_quoted = str(stage_dir) if stage_dir else ""

    lines = [
        "@echo off",
        "setlocal EnableExtensions",
        f'set "INSTALL_DIR={install_quoted}"',
        f'set "STAGE_DIR={stage_quoted}"',
        'pushd "%INSTALL_DIR%"',
        f'echo [%date% %time%] Iniciando actualizacion >> "{log_name}"',
        "set /a tries=0",
        ":wait",
        "set /a tries+=1",
        'tasklist /FI "IMAGENAME eq FELPOS.exe" 2>nul | find /I "FELPOS.exe" >nul',
        "if not errorlevel 1 (",
        "  if %tries% GEQ 60 (",
        f'    echo [%date% %time%] Forzando cierre de FELPOS.exe >> "{log_name}"',
        "    taskkill /F /IM FELPOS.exe /T >nul 2>&1",
        "    timeout /t 2 >nul",
        "    goto apply",
        "  )",
        "  timeout /t 1 >nul",
        "  goto wait",
        ")",
        ":apply",
    ]

    if stage_dir is not None:
        for file_name in UPDATE_FILES:
            pending_name = f"{file_name}.pending"
            lines.extend(
                [
                    f'if exist "%STAGE_DIR%\\{pending_name}" (',
                    f'  copy /Y "%STAGE_DIR%\\{pending_name}" "{pending_name}" >nul',
                    ")",
                ]
            )
        for file_name in UPDATE_SUPPORT_FILES:
            pending_name = f"{file_name}.pending"
            lines.extend(
                [
                    f'if exist "%STAGE_DIR%\\{pending_name}" (',
                    f'  copy /Y "%STAGE_DIR%\\{pending_name}" "{file_name}" >nul',
                    ")",
                ]
            )

    for file_name in UPDATE_FILES:
        pending_name = f"{file_name}.pending"
        backup_name = f"{file_name}.old"
        if file_name == "FELPOS.exe":
            lines.extend(
                [
                    f'if exist "{pending_name}" (',
                    f'  echo [%date% %time%] Reemplazando {file_name} >> "{log_name}"',
                    f'  if exist "{backup_name}" del /F /Q "{backup_name}" >nul 2>&1',
                    f'  if exist "{file_name}" ren "{file_name}" "{backup_name}"',
                    f'  ren "{pending_name}" "{file_name}"',
                    "  if errorlevel 1 (",
                    f'    echo [%date% %time%] ERROR al reemplazar {file_name} >> "{log_name}"',
                    f'    if exist "{backup_name}" ren "{backup_name}" "{file_name}"',
                    "  ) else (",
                    f'    if exist "{backup_name}" del /F /Q "{backup_name}" >nul 2>&1',
                    f'    echo [%date% %time%] {file_name} actualizado >> "{log_name}"',
                    "  )",
                    ")",
                ]
            )
        else:
            lines.extend(
                [
                    f'if exist "{pending_name}" (',
                    f'  move /Y "{pending_name}" "{file_name}" >nul',
                    f'  echo [%date% %time%] {file_name} actualizado >> "{log_name}"',
                    ")",
                ]
            )

    lines.extend(
        [
            f'if exist "{PENDING_UPDATE_META}" del /F /Q "{PENDING_UPDATE_META}" >nul',
            f'echo [%date% %time%] Reiniciando FEL POS >> "{log_name}"',
            'if not exist "FELPOS.exe" (',
            f'  echo [%date% %time%] ERROR: FELPOS.exe no existe despues de actualizar >> "{log_name}"',
            "  popd",
            "  endlocal",
            "  exit /b 1",
            ")",
            'start "" "%INSTALL_DIR%\\FELPOS.exe"',
            "popd",
            'del /F /Q "%~f0" >nul 2>&1',
            "endlocal",
        ]
    )
    script_path.write_text("\r\n".join(lines) + "\r\n", encoding="utf-8")
    return script_path


def _launch_updater_script(script_path: Path, install_dir: Path, *, elevate: bool = False) -> None:
    import subprocess

    _append_update_log(install_dir, f"Ejecutando actualizador: {script_path.name} (elevate={elevate})")
    if elevate and sys.platform.startswith("win"):
        import ctypes

        # ShellExecuteW returns >32 on success.
        result = ctypes.windll.shell32.ShellExecuteW(
            None,
            "runas",
            "cmd.exe",
            f'/c ""{script_path}""',
            str(script_path.parent),
            1,
        )
        if int(result) <= 32:
            raise PermissionError(_permission_denied_help(install_dir))
        return

    creationflags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
    subprocess.Popen(
        ["cmd.exe", "/c", str(script_path)],
        cwd=str(install_dir),
        creationflags=creationflags,
        close_fds=True,
    )


def delegate_pending_executable_update(install_dir: Path | None = None) -> bool:
    root = (install_dir or _install_dir()).resolve()
    if not has_pending_executable_update(root):
        # Tambien revisar staging del usuario.
        stage_dir = _user_updates_dir() / "pending"
        stage_pending = stage_dir / "FELPOS.exe.pending"
        if not stage_pending.exists():
            return False
        script_path = stage_dir / PENDING_UPDATE_SCRIPT
        if not script_path.exists():
            script_path = _write_restart_script(root, stage_dir=stage_dir, require_elevation=True)
        _launch_updater_script(script_path, root, elevate=True)
        time.sleep(0.3)
        os._exit(0)

    script_path = root / PENDING_UPDATE_SCRIPT
    elevate = not _dir_is_writable(root)
    if not script_path.exists():
        script_path = _write_restart_script(root)
    _launch_updater_script(script_path, root, elevate=elevate)
    time.sleep(0.3)
    os._exit(0)


def prepare_update_apply() -> dict:
    if not sys.platform.startswith("win"):
        raise ValueError("Las actualizaciones automaticas solo estan disponibles en Windows.")

    assert_license_allows_updates()

    check = check_for_updates()
    if not check.get("enabled"):
        raise ValueError("Configura UPDATE_MANIFEST_URL para habilitar actualizaciones automaticas.")
    if not check.get("update_available"):
        raise ValueError(check.get("message") or "No hay actualizaciones disponibles.")

    manifest = _fetch_manifest(check["manifest_url"])
    install_dir = _install_dir()
    os.environ["FELPOS_PRE_UPDATE_BACKUP"] = "1"
    backup = create_backup("pre_update")

    can_write_install = _dir_is_writable(install_dir)
    stage_dir = install_dir if can_write_install else (_user_updates_dir() / "pending")
    if not can_write_install:
        if stage_dir.exists():
            shutil.rmtree(stage_dir, ignore_errors=True)
        stage_dir.mkdir(parents=True, exist_ok=True)

    temp_dir = Path(tempfile.mkdtemp(prefix="felpos-update-"))
    zip_path = temp_dir / "felpos-update.zip"
    extract_dir = temp_dir / "extracted"
    try:
        _download_file(manifest.download_url, zip_path)
        if manifest.sha256:
            actual = _sha256_file(zip_path)
            if actual.lower() != manifest.sha256.lower():
                raise ValueError("La actualizacion descargada no coincide con el hash de seguridad.")

        extracted = _extract_update_zip(zip_path, extract_dir)
        staged_files: list[str] = []
        try:
            for file_name, source_path in extracted.items():
                pending_target = stage_dir / f"{file_name}.pending"
                shutil.copy2(source_path, pending_target)
                staged_files.append(file_name)
            if can_write_install:
                staged_files.extend(_stage_support_files(install_dir, extract_dir))
            else:
                # Copia support bats al staging; el script elevado los pondra en install.
                for file_name in UPDATE_SUPPORT_FILES:
                    assets_dir = Path(__file__).resolve().parent.parent.parent / "installer" / "assets"
                    source = extract_dir / file_name
                    if not source.exists():
                        source = assets_dir / file_name
                    if source.exists():
                        shutil.copy2(source, stage_dir / f"{file_name}.pending")
                        staged_files.append(file_name)
        except OSError as exc:
            raise PermissionError(_permission_denied_help(install_dir)) from exc

        meta_payload = {
            "target_version": manifest.version,
            "previous_version": get_app_version(),
            "staged_files": staged_files,
            "backup_name": backup.get("name"),
            "stage_dir": str(stage_dir),
            "requires_elevation": not can_write_install,
        }
        meta_path = (install_dir if can_write_install else stage_dir) / PENDING_UPDATE_META
        try:
            meta_path.write_text(json.dumps(meta_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError as exc:
            raise PermissionError(_permission_denied_help(install_dir)) from exc

        script_path = _write_restart_script(
            install_dir,
            stage_dir=None if can_write_install else stage_dir,
            require_elevation=not can_write_install,
        )
        _append_update_log(
            install_dir,
            f"Actualizacion {manifest.version} descargada. Archivos pendientes: {', '.join(staged_files)}",
        )
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    return {
        "message": (
            f"Actualizacion {manifest.version} lista. "
            + (
                "Se pedira permiso de administrador para aplicarla."
                if not can_write_install
                else "El sistema se reiniciara para aplicarla."
            )
        ),
        "target_version": manifest.version,
        "previous_version": get_app_version(),
        "backup_name": backup.get("name"),
        "restart_script": str(script_path),
        "restart_required": True,
        "requires_elevation": not can_write_install,
    }


def launch_pending_update_restart() -> bool:
    install_dir = _install_dir()
    script_path = install_dir / PENDING_UPDATE_SCRIPT
    elevate = False
    if not script_path.exists():
        stage_script = _user_updates_dir() / "pending" / PENDING_UPDATE_SCRIPT
        if stage_script.exists():
            script_path = stage_script
            elevate = True
        else:
            return False
    else:
        elevate = not _dir_is_writable(install_dir)

    _append_update_log(install_dir, "Reinicio solicitado para aplicar actualizacion.")
    _launch_updater_script(script_path, install_dir, elevate=elevate)
    time.sleep(0.5)
    os._exit(0)
