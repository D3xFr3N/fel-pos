from __future__ import annotations

import re
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote

from app.config import settings

_AUTO_BACKUP_LOCK = threading.Lock()


def _resolve_sqlite_db_path() -> Path:
    database_url = (settings.database_url or "").strip()
    if not database_url.startswith("sqlite:"):
        raise ValueError("Respaldo automatico solo disponible para SQLite.")
    if database_url.endswith(":memory:"):
        raise ValueError("Respaldo no disponible para base de datos en memoria.")

    if database_url.startswith("sqlite:///"):
        raw_path = database_url.replace("sqlite:///", "", 1)
    elif database_url.startswith("sqlite://"):
        raw_path = database_url.replace("sqlite://", "", 1)
    else:
        raise ValueError("Formato DATABASE_URL SQLite no soportado.")

    normalized = unquote(raw_path).strip()
    db_path = Path(normalized)
    if not db_path.is_absolute():
        db_path = (Path.cwd() / db_path).resolve()
    return db_path


def _backup_dir() -> Path:
    configured = (settings.backup_dir or "./backups").strip()
    folder = Path(configured)
    if not folder.is_absolute():
        folder = (Path.cwd() / folder).resolve()
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _safe_label(label: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "-", (label or "").strip().lower()).strip("-")
    return cleaned or "backup"


def _build_backup_name(label: str) -> str:
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return f"felpos_{_safe_label(label)}_{timestamp}.db"


def _metadata(file_path: Path) -> dict:
    stats = file_path.stat()
    created_at = datetime.fromtimestamp(stats.st_mtime, tz=timezone.utc)
    size_bytes = int(stats.st_size)
    return {
        "name": file_path.name,
        "created_at": created_at,
        "size_bytes": size_bytes,
        "size_mb": round(size_bytes / (1024 * 1024), 3),
    }


def _copy_sqlite_backup(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(source, timeout=30) as source_conn, sqlite3.connect(target, timeout=30) as target_conn:
        source_conn.backup(target_conn)


def _is_sqlite_healthy(db_path: Path) -> bool:
    try:
        with sqlite3.connect(db_path, timeout=15) as connection:
            result = connection.execute("PRAGMA integrity_check;").fetchone()
            return bool(result and str(result[0]).lower() == "ok")
    except Exception:
        return False


def _has_application_tables(db_path: Path) -> bool:
    try:
        with sqlite3.connect(db_path, timeout=15) as connection:
            rows = connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
            ).fetchall()
            return bool(rows)
    except Exception:
        return False


def _latest_backup_path() -> Path | None:
    files = sorted(
        _backup_dir().glob("felpos_*.db"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    return files[0] if files else None


def _cleanup_old_backups() -> None:
    retention_days = int(settings.backup_retention_days or 0)
    if retention_days <= 0:
        return
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=retention_days)
    for backup_file in _backup_dir().glob("felpos_*.db"):
        modified = datetime.fromtimestamp(backup_file.stat().st_mtime, tz=timezone.utc)
        if modified < cutoff:
            backup_file.unlink(missing_ok=True)


def list_backups(limit: int = 50) -> list[dict]:
    _cleanup_old_backups()
    files = sorted(
        _backup_dir().glob("felpos_*.db"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    return [_metadata(path) for path in files[: max(int(limit or 1), 1)]]


def create_backup(label: str = "manual") -> dict:
    db_path = _resolve_sqlite_db_path()
    if not db_path.exists():
        raise FileNotFoundError(f"No se encontro base de datos en {db_path}.")

    _cleanup_old_backups()
    target_path = _backup_dir() / _build_backup_name(label)
    _copy_sqlite_backup(db_path, target_path)
    return _metadata(target_path)


def restore_backup(backup_name: str) -> tuple[dict, dict]:
    safe_name = Path(backup_name or "").name
    if not safe_name or safe_name != backup_name:
        raise ValueError("Nombre de respaldo invalido.")

    backup_path = (_backup_dir() / safe_name).resolve()
    backup_root = _backup_dir().resolve()
    if backup_root not in backup_path.parents or not backup_path.exists():
        raise FileNotFoundError("Respaldo no encontrado.")

    db_path = _resolve_sqlite_db_path()
    if not db_path.exists():
        raise FileNotFoundError(f"No se encontro base de datos en {db_path}.")

    safety_backup = create_backup("pre_restore")
    with sqlite3.connect(backup_path, timeout=30) as source_conn, sqlite3.connect(db_path, timeout=30) as target_conn:
        source_conn.backup(target_conn)
    restored_backup = _metadata(backup_path)
    return restored_backup, safety_backup


def ensure_daily_auto_backup() -> dict | None:
    if not bool(settings.backup_auto_daily):
        return None
    today_utc = datetime.utcnow().strftime("%Y%m%d")
    existing_today = [
        item
        for item in list_backups(limit=365)
        if item["name"].startswith("felpos_auto_") and today_utc in item["name"]
    ]
    if existing_today:
        return None
    return create_backup("auto")


def create_auto_backup_if_due(label: str = "autosave", min_interval_seconds: int = 60) -> dict | None:
    if not bool(settings.backup_auto_on_commit):
        return None

    safe_label = _safe_label(label)
    if min_interval_seconds > 0:
        latest_same_label = sorted(
            _backup_dir().glob(f"felpos_{safe_label}_*.db"),
            key=lambda item: item.stat().st_mtime,
            reverse=True,
        )
        if latest_same_label:
            latest_mtime = datetime.fromtimestamp(latest_same_label[0].stat().st_mtime, tz=timezone.utc)
            elapsed = (datetime.now(tz=timezone.utc) - latest_mtime).total_seconds()
            if elapsed < max(int(min_interval_seconds), 1):
                return None

    with _AUTO_BACKUP_LOCK:
        return create_backup(safe_label)


def ensure_recoverable_database_on_startup() -> dict | None:
    db_path = _resolve_sqlite_db_path()
    if db_path.exists() and _is_sqlite_healthy(db_path) and _has_application_tables(db_path):
        return None

    latest_backup = _latest_backup_path()
    if not latest_backup:
        return None

    action = "restaurada desde respaldo"
    if db_path.exists():
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        previous_copy = db_path.with_name(f"{db_path.stem}.previous_{timestamp}{db_path.suffix}")
        try:
            db_path.replace(previous_copy)
            action = f"restaurada desde respaldo (copia previa: {previous_copy.name})"
        except Exception:
            db_path.unlink(missing_ok=True)

    _copy_sqlite_backup(latest_backup, db_path)
    return {
        "message": action,
        "restored_backup": _metadata(latest_backup),
    }
