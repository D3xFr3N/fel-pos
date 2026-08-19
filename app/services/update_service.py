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

PENDING_UPDATE_SCRIPT = "apply_pending_update.ps1"
LEGACY_PENDING_UPDATE_SCRIPT = "apply_pending_update.bat"
PENDING_UPDATE_META = "pending_update.json"
PENDING_UPDATE_LOG = "felpos-update.log"
SAFE_PUBLIC_DIR = r"C:\Users\Public\FELPOS"
SAFE_RELAUNCH_VBS = r"C:\Users\Public\FELPOS\relaunch.vbs"
SAFE_APPLY_RUNNER_VBS = r"C:\Users\Public\FELPOS\apply_update.vbs"
SAFE_APPLY_PS1 = r"C:\Users\Public\FELPOS\apply_pending_update.ps1"
SAFE_UPDATE_LOG = r"C:\Users\Public\FELPOS\felpos-update.log"
UPDATE_FILES = ("FELPOS.exe", "VERSION", "BUILD_DATE")
UPDATE_SUPPORT_FILES = (
    "Aplicar_actualizacion_pendiente.bat",
    "Reparar_instalacion.bat",
    "Iniciar_FELPOS.bat",
    "Iniciar_FELPOS.vbs",
    "Iniciar_FELPOS_Caja.bat",
    "Iniciar_FELPOS_Caja.vbs",
    "Iniciar_FELPOS_Servidor.bat",
    "Iniciar_FELPOS_Servidor.vbs",
    "Boot_FELPOS.cmd",
    "Boot_FELPOS.vbs",
    "_relaunch_here.ps1",
    "_resolve_runtime_tmp.cmd",
    "Limpiar_actualizacion_pendiente.bat",
    "Diagnostico_instalacion.bat",
    "Reparar_permisos_instalacion.bat",
)
HTTP_TIMEOUT_SECONDS = 180
MIN_EXE_BYTES = 15 * 1024 * 1024


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
            expected_header = response.headers.get("content-length")
            expected = int(expected_header) if expected_header and expected_header.isdigit() else None
            written = 0
            with target.open("wb") as handle:
                for chunk in response.iter_bytes():
                    if not chunk:
                        continue
                    handle.write(chunk)
                    written += len(chunk)
            if written <= 0:
                raise ValueError("La descarga de la actualizacion quedo vacia.")
            if expected is not None and written != expected:
                raise ValueError(
                    f"Descarga incompleta de actualizacion ({written} / {expected} bytes)."
                )


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


def _safe_public_felpos_dir() -> Path:
    """Ruta sin espacios ni parentesis; segura para invocar desde CMD/VBS."""
    target = Path(SAFE_PUBLIC_DIR)
    target.mkdir(parents=True, exist_ok=True)
    return target


def _write_safe_relaunch_vbs(install_dir: Path) -> Path:
    """
    Escribe un VBS fuera de Program Files para relanzar FELPOS.exe.
    Usa ShellExecute (no CMD) para rutas con '(x86)' y espacios.
    """
    public = _safe_public_felpos_dir()
    runtime_tmp = public / "runtime-tmp"
    runtime_tmp.mkdir(parents=True, exist_ok=True)
    exe_path = (Path(install_dir) / "FELPOS.exe").resolve()
    work_dir = Path(install_dir).resolve()

    def _vbs_escape(value: str) -> str:
        return value.replace('"', '""')

    exe_s = _vbs_escape(str(exe_path))
    work_s = _vbs_escape(str(work_dir))
    tmp_s = _vbs_escape(str(runtime_tmp))
    content = "\r\n".join(
        [
            "' Auto-generado por FEL POS - no editar",
            "Option Explicit",
            "Dim shell, app, fso, exePath, workDir, tmpDir",
            'Set shell = CreateObject("WScript.Shell")',
            'Set app = CreateObject("Shell.Application")',
            'Set fso = CreateObject("Scripting.FileSystemObject")',
            f'exePath = "{exe_s}"',
            f'workDir = "{work_s}"',
            f'tmpDir = "{tmp_s}"',
            "If Not fso.FolderExists(tmpDir) Then",
            "  On Error Resume Next",
            "  fso.CreateFolder tmpDir",
            "  On Error GoTo 0",
            "End If",
            "If Not fso.FileExists(exePath) Then",
            '  MsgBox "No se encontro FELPOS.exe:" & vbCrLf & exePath, vbCritical, "FEL POS"',
            "  WScript.Quit 1",
            "End If",
            "shell.CurrentDirectory = workDir",
            'shell.Environment("PROCESS")("TEMP") = tmpDir',
            'shell.Environment("PROCESS")("TMP") = tmpDir',
            'shell.Environment("PROCESS")("FELPOS_RUNTIME_TMP") = tmpDir',
            # ShellExecute no parte rutas con (x86) como hace CMD/start.
            'app.ShellExecute exePath, "", workDir, "open", 1',
            "WScript.Quit 0",
            "",
        ]
    )
    target = public / "relaunch.vbs"
    target.write_text(content, encoding="utf-8")
    return target


def _write_apply_runner_vbs(ps1_path: Path | None = None) -> Path:
    """
    Runner fijo en Public (sin espacios/parentesis).
    Siempre apunta a C:\\Users\\Public\\FELPOS\\apply_pending_update.ps1
    """
    public = _safe_public_felpos_dir()
    target = public / "apply_update.vbs"
    # Preferir ruta fija sin espacios; ignorar ps1_path con LocalAppData.
    ps1 = SAFE_APPLY_PS1
    if ps1_path is not None:
        resolved = str(Path(ps1_path).resolve())
        if resolved.lower().startswith(SAFE_PUBLIC_DIR.lower()):
            ps1 = resolved
    ps1_escaped = ps1.replace('"', '""')
    content = "\r\n".join(
        [
            "' Auto-generado por FEL POS - no editar",
            "Option Explicit",
            "Dim shell, fso, ps1Path",
            'Set shell = CreateObject("WScript.Shell")',
            'Set fso = CreateObject("Scripting.FileSystemObject")',
            f'ps1Path = "{ps1_escaped}"',
            "If Not fso.FileExists(ps1Path) Then",
            '  MsgBox "No se encontro el script de actualizacion:" & vbCrLf & ps1Path, vbCritical, "FEL POS"',
            "  WScript.Quit 1",
            "End If",
            # Ruta Public sin espacios: no hace falta entrecomillar -File.
            'shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & ps1Path, 0, False',
            "WScript.Quit 0",
            "",
        ]
    )
    target.write_text(content, encoding="utf-8")
    return target


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
        "VERSION.pending",
        "BUILD_DATE.pending",
        PENDING_UPDATE_META,
        PENDING_UPDATE_SCRIPT,
        LEGACY_PENDING_UPDATE_SCRIPT,
    ):
        path = root / name
        if not path.exists():
            continue
        try:
            path.unlink()
            removed.append(name)
        except OSError:
            pass
    updates_dir = _user_updates_dir()
    for name in (PENDING_UPDATE_SCRIPT, LEGACY_PENDING_UPDATE_SCRIPT):
        path = updates_dir / name
        if not path.exists():
            continue
        try:
            path.unlink()
            removed.append(f"updates/{name}")
        except OSError:
            pass
    if removed:
        _append_update_log(root, f"Archivos de actualizacion limpiados: {', '.join(removed)}")
    return removed


def cleanup_previous_exe_backup(install_dir: Path | None = None) -> bool:
    """Elimina FELPOS.exe.old solo despues de un arranque exitoso."""
    root = (install_dir or _install_dir()).resolve()
    old_exe = root / "FELPOS.exe.old"
    if not old_exe.exists():
        return False
    try:
        old_exe.unlink()
        _append_update_log(root, "Copia anterior FELPOS.exe.old eliminada tras arranque OK.")
        return True
    except OSError:
        return False


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

    for script_name in (PENDING_UPDATE_SCRIPT, LEGACY_PENDING_UPDATE_SCRIPT):
        script_path = root / script_name
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


def _ps_single_quote(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _write_restart_script(
    install_dir: Path,
    *,
    stage_dir: Path | None = None,
    require_elevation: bool = False,
    expected_exe_bytes: int | None = None,
) -> Path:
    """
    Escribe apply_pending_update.ps1 en C:\\Users\\Public\\FELPOS
    (sin espacios ni parentesis). PowerShell usa -LiteralPath.
    """
    del require_elevation  # reservado; la elevacion la decide _launch_updater_script
    public = _safe_public_felpos_dir()
    script_path = Path(SAFE_APPLY_PS1)
    updates_dir = _user_updates_dir()
    updates_dir.mkdir(parents=True, exist_ok=True)
    _write_safe_relaunch_vbs(install_dir)
    _write_apply_runner_vbs(script_path)

    # Limpiar scripts viejos en LocalAppData / bat legado (rutas con espacios).
    for legacy in (
        updates_dir / PENDING_UPDATE_SCRIPT,
        updates_dir / LEGACY_PENDING_UPDATE_SCRIPT,
        Path(install_dir) / PENDING_UPDATE_SCRIPT,
        Path(install_dir) / LEGACY_PENDING_UPDATE_SCRIPT,
    ):
        if legacy.exists():
            try:
                legacy.unlink()
            except OSError:
                pass

    install_q = _ps_single_quote(str(Path(install_dir).resolve()))
    stage_q = _ps_single_quote(str(Path(stage_dir).resolve()) if stage_dir else "")
    log_q = _ps_single_quote(PENDING_UPDATE_LOG)
    public_log_q = _ps_single_quote(SAFE_UPDATE_LOG)
    relaunch_q = _ps_single_quote(SAFE_RELAUNCH_VBS)
    runtime_q = _ps_single_quote(r"C:\Users\Public\FELPOS\runtime-tmp")
    meta_q = _ps_single_quote(PENDING_UPDATE_META)
    min_exe_bytes = max(MIN_EXE_BYTES, int(expected_exe_bytes or 0) // 2)

    support_names = ", ".join(_ps_single_quote(name) for name in UPDATE_SUPPORT_FILES)
    update_names = ", ".join(_ps_single_quote(name) for name in UPDATE_FILES)

    lines = [
        "# Auto-generado por FEL POS - no editar",
        "$ErrorActionPreference = 'Stop'",
        f"$InstallDir = {install_q}",
        f"$StageDir = {stage_q}",
        f"$LogName = {log_q}",
        f"$PublicLogPath = {public_log_q}",
        f"$RelaunchVbs = {relaunch_q}",
        f"$RuntimeTmp = {runtime_q}",
        f"$MetaName = {meta_q}",
        f"$MinExeBytes = {min_exe_bytes}",
        f"$UpdateFiles = @({update_names})",
        f"$SupportFiles = @({support_names})",
        "$ScriptSelf = $MyInvocation.MyCommand.Path",
        "$LogPath = Join-Path $InstallDir $LogName",
        "",
        "function Write-UpdateLog([string]$Message) {",
        "  try {",
        "    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message",
        "    Add-Content -LiteralPath $LogPath -Value $line -ErrorAction SilentlyContinue",
        "    Add-Content -LiteralPath $PublicLogPath -Value $line -ErrorAction SilentlyContinue",
        "  } catch {}",
        "}",
        "",
        "function Ensure-Dir([string]$Path) {",
        "  if (-not [string]::IsNullOrWhiteSpace($Path) -and -not (Test-Path -LiteralPath $Path)) {",
        "    New-Item -ItemType Directory -Path $Path -Force | Out-Null",
        "  }",
        "}",
        "",
        "function Clear-MeiTemps([string]$Root) {",
        "  if ([string]::IsNullOrWhiteSpace($Root) -or -not (Test-Path -LiteralPath $Root)) { return }",
        "  Get-ChildItem -LiteralPath $Root -Directory -Filter '_MEI*' -ErrorAction SilentlyContinue |",
        "    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue",
        "}",
        "",
        "function Restore-Exe {",
        "  $exe = Join-Path $InstallDir 'FELPOS.exe'",
        "  $old = Join-Path $InstallDir 'FELPOS.exe.old'",
        "  if (-not (Test-Path -LiteralPath $exe) -and (Test-Path -LiteralPath $old)) {",
        "    Rename-Item -LiteralPath $old -NewName 'FELPOS.exe' -ErrorAction SilentlyContinue",
        "  }",
        "}",
        "",
        "function Start-Relaunch {",
        "  if (Test-Path -LiteralPath $RelaunchVbs) {",
        "    Write-UpdateLog \"Relanzando via $RelaunchVbs\"",
        "    Start-Process -FilePath 'wscript.exe' -ArgumentList @('//nologo', $RelaunchVbs) -WindowStyle Hidden | Out-Null",
        "    return",
        "  }",
        "  $exe = Join-Path $InstallDir 'FELPOS.exe'",
        "  if (Test-Path -LiteralPath $exe) {",
        "    Write-UpdateLog 'Relanzando via Start-Process -LiteralPath'",
        "    Start-Process -FilePath $exe -WorkingDirectory $InstallDir | Out-Null",
        "  } else {",
        "    Write-UpdateLog 'ERROR: no se pudo relanzar; falta FELPOS.exe y relaunch.vbs'",
        "  }",
        "}",
        "",
        "Ensure-Dir (Split-Path -Parent $RuntimeTmp)",
        "Ensure-Dir $RuntimeTmp",
        "$env:TEMP = $RuntimeTmp",
        "$env:TMP = $RuntimeTmp",
        "$env:FELPOS_RUNTIME_TMP = $RuntimeTmp",
        "Clear-MeiTemps $RuntimeTmp",
        "Clear-MeiTemps (Join-Path $env:LOCALAPPDATA 'FELPOS\\runtime-tmp')",
        "Clear-MeiTemps (Join-Path $env:LOCALAPPDATA 'Temp')",
        "Clear-MeiTemps (Join-Path $env:ProgramData 'FELPOS\\runtime-tmp')",
        "Clear-MeiTemps (Join-Path $env:LOCALAPPDATA 'FEL POS\\tmp')",
        "",
        "$script:UpdateExitCode = 1",
        "Write-UpdateLog 'Iniciando actualizacion (PowerShell)'",
        "Write-UpdateLog \"TEMP=$RuntimeTmp\"",
        "Write-UpdateLog \"InstallDir=$InstallDir\"",
        "",
        "for ($i = 1; $i -le 60; $i++) {",
        "  $procs = @(Get-Process -Name 'FELPOS' -ErrorAction SilentlyContinue)",
        "  if ($procs.Count -eq 0) { break }",
        "  if ($i -ge 60) {",
        "    Write-UpdateLog 'Forzando cierre de FELPOS.exe'",
        "    $procs | Stop-Process -Force -ErrorAction SilentlyContinue",
        "    Start-Sleep -Seconds 2",
        "    break",
        "  }",
        "  Start-Sleep -Seconds 1",
        "}",
        "",
        "try {",
    ]

    if stage_dir is not None:
        lines.extend(
            [
                "  if (-not [string]::IsNullOrWhiteSpace($StageDir)) {",
                "    foreach ($name in $UpdateFiles) {",
                "      $src = Join-Path $StageDir ($name + '.pending')",
                "      if (Test-Path -LiteralPath $src) {",
                "        $dst = Join-Path $InstallDir ($name + '.pending')",
                "        Copy-Item -LiteralPath $src -Destination $dst -Force",
                "      }",
                "    }",
                "    foreach ($name in $SupportFiles) {",
                "      $src = Join-Path $StageDir ($name + '.pending')",
                "      if (Test-Path -LiteralPath $src) {",
                "        $dst = Join-Path $InstallDir $name",
                "        try {",
                "          Copy-Item -LiteralPath $src -Destination $dst -Force",
                "        } catch {",
                "          Write-UpdateLog (\"AVISO: no se pudo copiar $name\")",
                "        }",
                "      }",
                "    }",
                "  }",
            ]
        )

    lines.extend(
        [
            "  $pending = Join-Path $InstallDir 'FELPOS.exe.pending'",
            "  if (-not (Test-Path -LiteralPath $pending)) {",
            "    throw 'ERROR: falta FELPOS.exe.pending'",
            "  }",
            "  $pendingSize = [int64](Get-Item -LiteralPath $pending).Length",
            "  if ($pendingSize -lt $MinExeBytes) {",
            "    Remove-Item -LiteralPath $pending -Force -ErrorAction SilentlyContinue",
            "    throw (\"ERROR: FELPOS.exe.pending incompleto ($pendingSize bytes)\")",
            "  }",
            "",
            "  Write-UpdateLog \"Reemplazando FELPOS.exe ($pendingSize bytes)\"",
            "  $exe = Join-Path $InstallDir 'FELPOS.exe'",
            "  $old = Join-Path $InstallDir 'FELPOS.exe.old'",
            "  if (Test-Path -LiteralPath $old) {",
            "    Remove-Item -LiteralPath $old -Force",
            "  }",
            "  if (Test-Path -LiteralPath $exe) {",
            "    Rename-Item -LiteralPath $exe -NewName 'FELPOS.exe.old'",
            "  }",
            "  Rename-Item -LiteralPath $pending -NewName 'FELPOS.exe'",
            "  Write-UpdateLog 'FELPOS.exe actualizado'",
            "",
            "  foreach ($name in $UpdateFiles) {",
            "    if ($name -eq 'FELPOS.exe') { continue }",
            "    $src = Join-Path $InstallDir ($name + '.pending')",
            "    if (Test-Path -LiteralPath $src) {",
            "      Move-Item -LiteralPath $src -Destination (Join-Path $InstallDir $name) -Force",
            "      Write-UpdateLog \"$name actualizado\"",
            "    }",
            "  }",
            "",
            "  foreach ($metaCandidate in @(",
            "    (Join-Path $InstallDir $MetaName),",
            "    $(if ($StageDir) { Join-Path $StageDir $MetaName } else { $null })",
            "  )) {",
            "    if ($metaCandidate -and (Test-Path -LiteralPath $metaCandidate)) {",
            "      Remove-Item -LiteralPath $metaCandidate -Force -ErrorAction SilentlyContinue",
            "    }",
            "  }",
            "",
            "  if (-not (Test-Path -LiteralPath $exe)) {",
            "    throw 'ERROR: FELPOS.exe no existe despues de actualizar'",
            "  }",
            "",
            "  Write-UpdateLog 'Reiniciando FELPOS'",
            "  Start-Sleep -Seconds 2",
            "  Clear-MeiTemps $RuntimeTmp",
            "  Start-Relaunch",
            "  Write-UpdateLog 'Actualizacion aplicada OK'",
            "  $script:UpdateExitCode = 0",
            "}",
            "catch {",
            "  Write-UpdateLog (\"Actualizacion abortada: \" + $_.Exception.Message)",
            "  Restore-Exe",
            "  if (Test-Path -LiteralPath (Join-Path $InstallDir 'FELPOS.exe')) {",
            "    Start-Relaunch",
            "  } else {",
            "    try {",
            "      Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue",
            "      [System.Windows.MessageBox]::Show(",
            "        ('No se pudo aplicar la actualizacion: ' + $_.Exception.Message + [Environment]::NewLine + 'Revisa C:\\Users\\Public\\FELPOS\\felpos-update.log o reinstala FELPOS_Setup.exe'),",
            "        'FEL POS',",
            "        'OK',",
            "        'Error'",
            "      ) | Out-Null",
            "    } catch {}",
            "  }",
            "  $script:UpdateExitCode = 1",
            "}",
            "finally {",
            "  if ($ScriptSelf -and (Test-Path -LiteralPath $ScriptSelf)) {",
            "    Remove-Item -LiteralPath $ScriptSelf -Force -ErrorAction SilentlyContinue",
            "  }",
            "}",
            "exit ([int]$script:UpdateExitCode)",
            "",
        ]
    )
    script_path.write_text("\r\n".join(lines) + "\r\n", encoding="utf-8")
    return script_path


def _launch_updater_script(script_path: Path, install_dir: Path, *, elevate: bool = False) -> None:
    import subprocess

    resolved = Path(script_path).resolve()
    # Si solo queda el .bat legado, regenerar .ps1 cuando haya pendiente usable.
    if resolved.suffix.lower() == ".bat":
        stage_dir = _user_updates_dir() / "pending"
        stage_pending = stage_dir / "FELPOS.exe.pending"
        install_pending = Path(install_dir) / "FELPOS.exe.pending"
        if stage_pending.exists():
            resolved = _write_restart_script(install_dir, stage_dir=stage_dir, require_elevation=elevate)
        elif install_pending.exists():
            resolved = _write_restart_script(install_dir, require_elevation=elevate)
        else:
            raise RuntimeError(
                "Solo hay un actualizador .bat antiguo y no hay FELPOS.exe.pending. "
                "Usa Reparar_instalacion.bat o reinstala con FELPOS_Setup.exe."
            )

    # Siempre preferir el script fijo en Public (sin espacios).
    public_script = Path(SAFE_APPLY_PS1)
    if not resolved.exists() or resolved != public_script.resolve():
        if public_script.exists():
            resolved = public_script.resolve()
        elif resolved.suffix.lower() != ".ps1":
            raise RuntimeError(f"Script de actualizacion no soportado: {resolved}")

    if resolved.suffix.lower() != ".ps1":
        raise RuntimeError(f"Script de actualizacion no soportado: {resolved}")

    _write_safe_relaunch_vbs(install_dir)
    runner = _write_apply_runner_vbs(resolved)
    _append_update_log(
        install_dir,
        f"Ejecutando actualizador: {resolved} via {runner.name} (elevate={elevate})",
    )
    script_str = str(resolved)
    public_dir = str(_safe_public_felpos_dir())

    if elevate and sys.platform.startswith("win"):
        import ctypes

        # PowerShell directo con runas; ruta Public sin espacios.
        result = ctypes.windll.shell32.ShellExecuteW(
            None,
            "runas",
            "powershell.exe",
            f"-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File {script_str}",
            public_dir,
            0,
        )
        if int(result) <= 32:
            raise PermissionError(_permission_denied_help(install_dir))
        return

    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0) or getattr(
        subprocess, "DETACHED_PROCESS", 0
    )
    subprocess.Popen(
        ["wscript.exe", "//nologo", str(runner)],
        cwd=public_dir,
        creationflags=creationflags,
        close_fds=True,
        shell=False,
    )

def delegate_pending_executable_update(install_dir: Path | None = None) -> bool:
    root = (install_dir or _install_dir()).resolve()
    stage_dir = _user_updates_dir() / "pending"
    stage_pending = stage_dir / "FELPOS.exe.pending"
    install_pending = root / "FELPOS.exe.pending"

    if not install_pending.exists() and not stage_pending.exists():
        return False

    if stage_pending.exists() and not install_pending.exists():
        script_path = _write_restart_script(root, stage_dir=stage_dir, require_elevation=True)
        _launch_updater_script(script_path, root, elevate=True)
        time.sleep(0.3)
        os._exit(0)

    elevate = not _dir_is_writable(root)
    script_path = _write_restart_script(
        root,
        stage_dir=stage_dir if stage_pending.exists() else None,
        require_elevation=elevate,
    )
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
        exe_source = extracted["FELPOS.exe"]
        exe_size = exe_source.stat().st_size
        if exe_size < MIN_EXE_BYTES:
            raise ValueError(
                f"El FELPOS.exe del paquete parece incompleto ({exe_size} bytes)."
            )
        staged_files: list[str] = []
        try:
            for file_name, source_path in extracted.items():
                pending_target = stage_dir / f"{file_name}.pending"
                shutil.copy2(source_path, pending_target)
                if file_name == "FELPOS.exe" and pending_target.stat().st_size != exe_size:
                    raise ValueError("No se pudo copiar FELPOS.exe completo a la carpeta temporal.")
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
            "expected_exe_bytes": exe_size,
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
            expected_exe_bytes=exe_size,
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
    updates_dir = _user_updates_dir()
    stage_dir = updates_dir / "pending"
    stage_pending = stage_dir / "FELPOS.exe.pending"
    install_pending = Path(install_dir) / "FELPOS.exe.pending"
    elevate = not _dir_is_writable(install_dir)

    # Siempre regenerar el script en Public con la ruta/stage actuales.
    if stage_pending.exists():
        script_path = _write_restart_script(
            install_dir, stage_dir=stage_dir, require_elevation=True
        )
        elevate = True
    elif install_pending.exists():
        script_path = _write_restart_script(install_dir)
    elif Path(SAFE_APPLY_PS1).exists():
        script_path = Path(SAFE_APPLY_PS1)
    else:
        return False

    _append_update_log(install_dir, "Reinicio solicitado para aplicar actualizacion.")
    _launch_updater_script(script_path, install_dir, elevate=elevate)
    time.sleep(0.5)
    os._exit(0)
