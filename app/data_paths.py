from __future__ import annotations

import os
import re
import shutil
from pathlib import Path

LEGACY_DB_NAME = "fel_pos.db"
DATA_DIR_NAME = "data"
BACKUPS_DIR_NAME = "backups"
ENV_FILE_NAME = ".env"

PROTECTED_ROOT_FILES = (
    LEGACY_DB_NAME,
    f"{LEGACY_DB_NAME}-wal",
    f"{LEGACY_DB_NAME}-shm",
    ENV_FILE_NAME,
    "server-autostart.log",
    "felpos-error.log",
)

PROTECTED_ROOT_DIRS = (
    DATA_DIR_NAME,
    BACKUPS_DIR_NAME,
    "update_backups",
)


def get_runtime_root() -> Path:
    return Path.cwd().resolve()


def get_data_dir() -> Path:
    explicit = (os.getenv("FELPOS_DATA_DIR") or "").strip()
    if explicit:
        target = Path(explicit)
        if not target.is_absolute():
            target = get_runtime_root() / target
    else:
        target = get_runtime_root() / DATA_DIR_NAME
    target.mkdir(parents=True, exist_ok=True)
    return target.resolve()


def get_default_database_url() -> str:
    return f"sqlite:///./{DATA_DIR_NAME}/{LEGACY_DB_NAME}"


def get_default_backup_dir() -> str:
    return f"./{DATA_DIR_NAME}/{BACKUPS_DIR_NAME}"


def _move_if_exists(source: Path, target: Path) -> bool:
    if not source.exists() or target.exists():
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), str(target))
    return True


def _sync_env_database_paths(root: Path) -> bool:
    env_path = root / ENV_FILE_NAME
    if not env_path.exists():
        return False

    content = env_path.read_text(encoding="utf-8")
    updated = content
    replacements = {
        r"(?m)^DATABASE_URL=sqlite:///\./fel_pos\.db\s*$": (
            f"DATABASE_URL=sqlite:///./{DATA_DIR_NAME}/{LEGACY_DB_NAME}"
        ),
        r"(?m)^BACKUP_DIR=\./backups\s*$": f"BACKUP_DIR=./{DATA_DIR_NAME}/{BACKUPS_DIR_NAME}",
    }
    changed = False
    for pattern, replacement in replacements.items():
        new_content, count = re.subn(pattern, replacement, updated)
        if count:
            updated = new_content
            changed = True

    if changed:
        env_path.write_text(updated, encoding="utf-8")
    return changed


def ensure_persistent_layout() -> dict:
    """
    Organiza datos persistentes en ./data y migra archivos legacy desde la raiz.
    Se ejecuta al iniciar para que actualizaciones de codigo no afecten datos.
    """
    root = get_runtime_root()
    data_dir = get_data_dir()
    moved: list[str] = []

    db_target = data_dir / LEGACY_DB_NAME
    if _move_if_exists(root / LEGACY_DB_NAME, db_target):
        moved.append(f"{LEGACY_DB_NAME} -> {DATA_DIR_NAME}/")
        for suffix in ("-wal", "-shm"):
            _move_if_exists(root / f"{LEGACY_DB_NAME}{suffix}", data_dir / f"{LEGACY_DB_NAME}{suffix}")

    backups_target = data_dir / BACKUPS_DIR_NAME
    if _move_if_exists(root / BACKUPS_DIR_NAME, backups_target):
        moved.append(f"{BACKUPS_DIR_NAME}/ -> {DATA_DIR_NAME}/{BACKUPS_DIR_NAME}/")

    env_synced = _sync_env_database_paths(root)

    return {
        "data_dir": str(data_dir),
        "moved": moved,
        "env_synced": env_synced,
    }
