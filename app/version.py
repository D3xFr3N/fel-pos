from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path

APP_NAME = "FEL POS Guatemala"
VERSION_FILE = "VERSION"
BUILD_DATE_FILE = "BUILD_DATE"
DEFAULT_VERSION = "0.0.0"


def get_install_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path.cwd().resolve()


def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _read_version_from_disk() -> str:
    candidates = (
        get_install_dir() / VERSION_FILE,
        get_project_root() / VERSION_FILE,
    )
    for path in candidates:
        if path.exists():
            value = path.read_text(encoding="utf-8").strip()
            if value:
                return value
    return DEFAULT_VERSION


APP_VERSION = _read_version_from_disk()


@lru_cache(maxsize=1)
def get_app_version() -> str:
    return _read_version_from_disk()


def refresh_app_version_cache() -> str:
    get_app_version.cache_clear()
    get_build_date.cache_clear()
    return get_app_version()


@lru_cache(maxsize=1)
def get_build_date() -> str | None:
    candidates = (
        get_install_dir() / BUILD_DATE_FILE,
        get_project_root() / BUILD_DATE_FILE,
    )
    for path in candidates:
        if path.exists():
            value = path.read_text(encoding="utf-8").strip()
            if value:
                return value
    return None
