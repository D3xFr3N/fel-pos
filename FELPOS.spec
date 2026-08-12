# -*- mode: python ; coding: utf-8 -*-
"""FEL POS - PyInstaller spec con nativos forzados como BINARY."""

from __future__ import annotations

import sys
from pathlib import Path

from PyInstaller.building.api import EXE, PYZ
from PyInstaller.building.build_main import Analysis
from PyInstaller.utils.hooks import collect_all, collect_submodules

ROOT = Path(SPECPATH).resolve()
VENV_SITE = ROOT / ".venv" / "Lib" / "site-packages"

datas: list = [("static", "static")]
binaries: list = []
hiddenimports: list = [
    "app.main",
    "webview.platforms.edgechromium",
    "win32print",
    "pywintypes",
    "win32timezone",
    "win32api",
    "pythoncom",
    "sqlite3",
    "_sqlite3",
    "pydantic_core",
    "pydantic_core._pydantic_core",
    "pydantic_core.core_schema",
    "pydantic_settings",
    "cryptography.hazmat.bindings._rust",
    "sqlalchemy.cyextension.collections",
    "sqlalchemy.cyextension.immutabledict",
    "sqlalchemy.cyextension.processors",
    "sqlalchemy.cyextension.resultproxy",
    "sqlalchemy.cyextension.util",
    "markupsafe._speedups",
    "_cffi_backend",
    "et_xmlfile",
    "bottle",
    "proxy_tools",
    "sniffio",
    "h11",
    "click",
    "annotated_types",
    "typing_extensions",
]
hiddenimports += collect_submodules("app")

license_pem = ROOT / "app" / "license_public.pem"
if license_pem.exists():
    datas.append((str(license_pem), "app"))

env_file = ROOT / ".env"
if env_file.exists():
    datas.append((str(env_file), "."))

COLLECT_PACKAGES = (
    "webview",
    "fastapi",
    "starlette",
    "pydantic",
    "pydantic_core",
    "pydantic_settings",
    "sqlalchemy",
    "tzdata",
    "httpx",
    "idna",
    "anyio",
    "httpcore",
    "certifi",
    "h11",
    "sniffio",
    "uvicorn",
    "jinja2",
    "markupsafe",
    "openpyxl",
    "et_xmlfile",
    "cryptography",
    "cffi",
    "serial",
    "multipart",
    "dotenv",
    "greenlet",
    "bottle",
    "proxy_tools",
    "clr_loader",
    "pythonnet",
    "click",
    "annotated_types",
    "typing_extensions",
    "httptools",
    "watchfiles",
    "websockets",
    "yaml",
)

for package in COLLECT_PACKAGES:
    pkg_path = VENV_SITE / package
    # sniffio puede no estar instalado; collect_all fallaria.
    if package == "sniffio" and not pkg_path.exists() and not (VENV_SITE / f"{package}.py").exists():
        continue
    try:
        pkg_datas, pkg_binaries, pkg_hidden = collect_all(package)
    except Exception as exc:
        raise SystemExit(f"collect_all({package}) fallo: {exc}") from exc
    # collect_all a veces mete .pyd/.dll en datas; eso rompe el import.
    for item in pkg_datas:
        dest = str(item[0]).replace("\\", "/").lower()
        if dest.endswith((".pyd", ".dll", ".so")):
            binaries.append(item)
        else:
            datas.append(item)
    binaries += list(pkg_binaries)
    hiddenimports += list(pkg_hidden)

# Asegura el arbol zoneinfo (archivos sin extension).
tzdata_zoneinfo = VENV_SITE / "tzdata" / "zoneinfo"
guatemala_zi = tzdata_zoneinfo / "America" / "Guatemala"
if not guatemala_zi.is_file():
    raise SystemExit(f"Falta tzdata zoneinfo: {guatemala_zi}")
datas.append((str(tzdata_zoneinfo), "tzdata/zoneinfo"))
hiddenimports += ["tzdata", "tzdata.zoneinfo", "zoneinfo"]

# Fuerza extension modules con la ruta que Python espera.
pyd_matches = sorted((VENV_SITE / "pydantic_core").glob("_pydantic_core*.pyd"))
if not pyd_matches:
    raise SystemExit("No se encontro _pydantic_core*.pyd en el venv")
binaries.append((str(pyd_matches[0]), "pydantic_core"))

rust_pyd = VENV_SITE / "cryptography" / "hazmat" / "bindings" / "_rust.pyd"
if not rust_pyd.is_file():
    raise SystemExit(f"Falta cryptography binding: {rust_pyd}")
binaries.append((str(rust_pyd), str(Path("cryptography") / "hazmat" / "bindings")))

# Resto de nativos de dependencias (evita GAP en onefile).
NATIVE_PKG_DIRS = (
    "cryptography",
    "pydantic_core",
    "greenlet",
    "sqlalchemy",
    "markupsafe",
    "httptools",
    "watchfiles",
    "websockets",
    "yaml",
    "clr_loader",
    "pythonnet",
)
for pkg in NATIVE_PKG_DIRS:
    root = VENV_SITE / pkg
    if not root.is_dir():
        continue
    for pyd in root.rglob("*.pyd"):
        if "tests" in pyd.parts or "test" in pyd.name.lower():
            continue
        dest_dir = str(pyd.parent.relative_to(VENV_SITE))
        binaries.append((str(pyd), dest_dir))

for pyd in VENV_SITE.glob("_cffi_backend*.pyd"):
    binaries.append((str(pyd), "."))

# Extensiones nativas de CPython + DLLs de soporte.
py_dlls = Path(sys.base_prefix) / "DLLs"
if not py_dlls.exists():
    raise SystemExit(f"No se encontro carpeta DLLs: {py_dlls}")

skip_pyd_prefixes = ("_test", "_ctypes_test")
for pyd in sorted(py_dlls.glob("*.pyd")):
    if pyd.name.startswith(skip_pyd_prefixes):
        continue
    binaries.append((str(pyd), "."))
    mod_name = pyd.stem
    if mod_name not in hiddenimports:
        hiddenimports.append(mod_name)

for dll_name in ("sqlite3.dll", "libcrypto-3.dll", "libssl-3.dll", "libffi-8.dll", "zlib1.dll"):
    dll_path = py_dlls / dll_name
    if dll_path.exists():
        binaries.append((str(dll_path), "."))


def _dest_norm(item) -> str:
    return str(item[0]).replace("\\", "/").lower()


def _strip_pyd_shadow_datas(data_items: list, binary_items: list) -> list:
    """Quita datas en carpetas stub que ensombrecen un .pyd hermano (caso _rust)."""
    prefixes: list[str] = []
    for item in binary_items:
        name = _dest_norm(item)
        if name.endswith(".pyd"):
            prefixes.append(name[: -len(".pyd")] + "/")
    kept = []
    for item in data_items:
        name = _dest_norm(item)
        if name.endswith(".pyd"):
            continue
        if name.endswith(".pyi"):
            continue
        if any(name.startswith(prefix) or name == prefix[:-1] for prefix in prefixes):
            continue
        kept.append(item)
    return kept


# Evita pyd duplicados en datas antes de Analysis.
datas = _strip_pyd_shadow_datas(datas, binaries)
datas = [
    item
    for item in datas
    if not (_dest_norm(item).endswith(".pyd") and "pydantic_core" in _dest_norm(item))
]

icon_path = ROOT / "installer" / "assets" / "felpos.ico"
exe_kwargs = {
    "name": "FELPOS",
    "debug": False,
    "bootloader_ignore_signals": False,
    "strip": False,
    "upx": False,
    "upx_exclude": [],
    # Fijo en build: el bootloader IGNORA TEMP/TMP del sistema.
    # Evita fallo LoadLibrary cuando el usuario Windows tiene espacios
    # (ej. C:\Users\COMPU SAN JUAN\...).
    "runtime_tmpdir": r"C:\Users\Public\FELPOS\runtime-tmp",
    "console": False,
    "disable_windowed_traceback": False,
    "argv_emulation": False,
    "target_arch": None,
    "codesign_identity": None,
    "entitlements_file": None,
}
if icon_path.exists():
    exe_kwargs["icon"] = str(icon_path)

a = Analysis(
    [str(ROOT / "fel_pos_launcher.py")],
    pathex=[str(ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

# Segunda pasada post-Analysis.
moved = [item for item in a.datas if _dest_norm(item).endswith(".pyd")]
a.binaries = list(a.binaries) + moved
a.datas = _strip_pyd_shadow_datas(
    [item for item in a.datas if not _dest_norm(item).endswith(".pyd")],
    a.binaries,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    **exe_kwargs,
)
