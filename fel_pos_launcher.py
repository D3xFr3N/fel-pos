from __future__ import annotations

import os
import shutil
import socket
import sys
import threading
import time
import traceback
from importlib import import_module
from pathlib import Path

# Fuerza inclusion del extension module en el analisis de PyInstaller.
try:  # pragma: no cover
    import pydantic_core  # noqa: F401
    import pydantic_core._pydantic_core  # noqa: F401
    import pydantic_settings  # noqa: F401
    import sqlite3  # noqa: F401
    import _sqlite3  # noqa: F401
    import unicodedata  # noqa: F401
    import httpx  # noqa: F401
    import tzdata  # noqa: F401
    import cryptography  # noqa: F401
    import cryptography.hazmat.bindings._rust  # noqa: F401
    import openpyxl  # noqa: F401
    import serial  # noqa: F401
    import jinja2  # noqa: F401
    import greenlet  # noqa: F401
    import _cffi_backend  # noqa: F401
except Exception:
    pass

import uvicorn


WINDOW_HOST = "127.0.0.1"
DEFAULT_PORT = int(os.getenv("FELPOS_PORT", "8000"))


class DesktopApi:
    def close_app(self) -> bool:
        # Immediate process exit requested by user action.
        os._exit(0)

    def restart_after_update(self) -> bool:
        from app.services.update_service import launch_pending_update_restart

        launch_pending_update_restart()
        return True

    def get_device_info(self) -> dict:
        """Identidad estable de este PC para autorizacion en el servidor."""
        import platform

        from app.services.license_service import get_install_fingerprint

        return {
            "fingerprint": get_install_fingerprint(),
            "hostname": (platform.node() or "").strip() or "PC",
        }


def _is_port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.3)
        return sock.connect_ex((host, port)) == 0


def _runtime_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _write_runtime_error(exc: Exception, runtime_root: Path) -> Path:
    log_path = runtime_root / "felpos-error.log"
    log_path.write_text(traceback.format_exc(), encoding="utf-8")
    return log_path


def _wait_for_port(host: str, port: int, timeout_seconds: float = 20.0) -> bool:
    started = time.time()
    while time.time() - started < timeout_seconds:
        if _is_port_in_use(host, port):
            return True
        time.sleep(0.15)
    return False


def _load_webview():
    try:
        return import_module("webview")
    except Exception:
        return None


def _resolve_mode() -> str:
    mode = os.getenv("FELPOS_MODE", "local").strip().lower()
    if mode not in {"local", "server", "client"}:
        return "local"
    return mode


def _resolve_bind_host(mode: str) -> str:
    explicit = (os.getenv("FELPOS_BIND_HOST") or "").strip()
    if explicit:
        return explicit
    if mode == "client":
        return "127.0.0.1"
    # Por defecto escucha en toda la red local para que otras cajas/celular puedan conectar.
    # Usa FELPOS_BIND_HOST=127.0.0.1 si quieres solo este equipo.
    return "0.0.0.0"


def _show_user_error(message: str) -> None:
    print(message)
    if sys.platform.startswith("win"):
        try:
            import ctypes

            ctypes.windll.user32.MessageBoxW(0, message, "FEL POS", 0x10)
        except Exception:
            pass


def _start_lan_announcer_safe(*, http_port: int, bind_host: str) -> None:
    try:
        from app.lan_discovery import start_lan_announcer

        start_lan_announcer(http_port=http_port, bind_host=bind_host)
        print(f"[INFO] Anuncio LAN activo (otras PCs pueden encontrar este servidor).")
    except Exception as exc:
        print(f"[WARN] No se pudo iniciar anuncio LAN: {exc}")


def _run_server_mode(*, fastapi_app, bind_host: str, port: int) -> None:
    print("[INFO] FEL POS ejecutando en modo servidor.")
    print(f"[INFO] URL local: http://127.0.0.1:{port}")
    if bind_host == "0.0.0.0":
        print(f"[INFO] URL LAN: http://<IP-DE-TU-PC>:{port}")
    print("[INFO] Presiona Ctrl+C para detener el servidor.")
    _start_lan_announcer_safe(http_port=port, bind_host=bind_host)

    config = uvicorn.Config(
        fastapi_app,
        host=bind_host,
        port=port,
        reload=False,
        log_level="warning",
    )
    server = uvicorn.Server(config)
    server.run()


def _prompt_server_url() -> str | None:
    """Pide URL del servidor cuando el discovery LAN falla."""
    try:
        import tkinter as tk
        from tkinter import simpledialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        url = simpledialog.askstring(
            "Servidor FEL POS",
            "No se encontro el servidor automaticamente.\n"
            "Escribe la URL (ej. http://192.168.1.10:8000):",
        )
        root.destroy()
        cleaned = (url or "").strip()
        if cleaned and not cleaned.startswith("http://") and not cleaned.startswith("https://"):
            cleaned = f"http://{cleaned}"
        return cleaned or None
    except Exception:
        return None


def _run_client_mode(*, port: int) -> None:
    """Escritorio sin base local: busca el servidor FEL POS en la misma red WiFi/LAN."""
    from app.lan_discovery import discover_server

    print("[INFO] Modo caja (cliente): buscando servidor FEL POS en la red...")
    server = discover_server(preferred_port=port, timeout=3.0)
    runtime_root = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path.cwd()
    cache_path = runtime_root / "data" / "last_server_url.txt"
    url = None
    if server:
        url = server.base_url
        try:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(url.strip() + "\n", encoding="utf-8")
        except OSError:
            pass
    elif cache_path.exists():
        try:
            cached = cache_path.read_text(encoding="utf-8").strip()
            if cached.startswith("http://") or cached.startswith("https://"):
                print(f"[INFO] Discovery fallo; reintentando ultimo servidor: {cached}")
                url = cached
        except OSError:
            url = None
    if not url:
        url = _prompt_server_url()
        if url:
            try:
                cache_path.parent.mkdir(parents=True, exist_ok=True)
                cache_path.write_text(url.strip() + "\n", encoding="utf-8")
            except OSError:
                pass
    if not url:
        _show_user_error(
            "No se encontro un servidor FEL POS en la red.\n\n"
            "En la PC principal abre FEL POS (modo normal/servidor) y deja esa PC encendida.\n"
            "Las cajas deben estar en la misma WiFi/red.\n"
            "Tambien puedes escribir la URL manualmente (ej. http://192.168.1.10:8000).\n"
            "Luego inicia de nuevo esta caja."
        )
        raise RuntimeError("No se encontro servidor FEL POS en la red local.")

    print(f"[INFO] Servidor encontrado: {url}")
    webview = _load_webview()
    if not webview:
        raise RuntimeError(
            "No se encontro pywebview para modo escritorio cliente. "
            "Instala dependencias o abre el navegador en: " + url
        )
    window = _create_desktop_window(webview, url=url, js_api=DesktopApi())
    webview.start(gui="edgechromium")
    _ = window


def _apply_pending_update_if_needed(runtime_root: Path) -> None:
    try:
        from app.services.update_service import (
            apply_pending_update_at_startup,
            cleanup_stale_pending_update,
            delegate_pending_executable_update,
            has_pending_executable_update,
        )

        cleanup_stale_pending_update(runtime_root)

        if has_pending_executable_update(runtime_root):
            delegate_pending_executable_update(runtime_root)

        result = apply_pending_update_at_startup(runtime_root)
        if result and result.get("applied_files"):
            target = result.get("target_version") or "nueva"
            print(f"[INFO] Actualizacion aplicada al iniciar: v{target}")
    except SystemExit:
        raise
    except Exception as exc:
        log_path = runtime_root / "felpos-error.log"
        log_path.write_text(
            f"No se pudo aplicar actualizacion pendiente:\n{exc}\n",
            encoding="utf-8",
        )
        print(f"[WARN] No se pudo aplicar actualizacion pendiente. Revisa: {log_path}")


def _load_env_file(runtime_root: Path) -> None:
    env_path = runtime_root / ".env"
    if not env_path.exists():
        return
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except OSError:
        pass


def _screen_size(webview_module) -> tuple[int, int]:
    """Best-effort primary screen size for initial window dimensions."""
    try:
        screens = getattr(webview_module, "screens", None)
        if screens:
            primary = screens[0]
            width = int(getattr(primary, "width", 0) or 0)
            height = int(getattr(primary, "height", 0) or 0)
            if width >= 800 and height >= 600:
                return width, height
    except Exception:
        pass

    if sys.platform.startswith("win"):
        try:
            import ctypes

            user32 = ctypes.windll.user32
            width = int(user32.GetSystemMetrics(0) or 0)
            height = int(user32.GetSystemMetrics(1) or 0)
            if width >= 800 and height >= 600:
                return width, height
        except Exception:
            pass
    return 1360, 860


def _maximize_window(window) -> None:
    """Maximize after the native window exists (compatible with older pywebview)."""
    try:
        maximize = getattr(window, "maximize", None)
        if callable(maximize):
            maximize()
            return
    except Exception:
        pass

    if sys.platform.startswith("win"):
        try:
            import ctypes

            hwnd = None
            native = getattr(window, "native", None)
            if native is not None:
                hwnd = getattr(native, "Handle", None) or getattr(native, "handle", None)
            if not hwnd:
                hwnd = ctypes.windll.user32.GetForegroundWindow()
            if hwnd:
                ctypes.windll.user32.ShowWindow(int(hwnd), 3)  # SW_MAXIMIZE
        except Exception:
            pass


def _create_desktop_window(webview_module, *, url: str, js_api: DesktopApi):
    screen_width, screen_height = _screen_size(webview_module)
    # Leave a little margin so Windows taskbar / DPI quirks don't clip the frame
    # before maximize; maximize fills the usable work area afterwards.
    initial_width = max(1024, min(screen_width, screen_width - 16))
    initial_height = max(700, min(screen_height, screen_height - 48))

    create_kwargs = {
        "title": "FEL POS",
        "url": url,
        "width": initial_width,
        "height": initial_height,
        "min_size": (1024, 700),
        "resizable": True,
        "js_api": js_api,
    }

    window = None
    try:
        window = webview_module.create_window(**create_kwargs, maximized=True)
    except TypeError:
        # Older pywebview without maximized= support.
        window = webview_module.create_window(**create_kwargs)

    def _on_shown() -> None:
        _maximize_window(window)

    try:
        if hasattr(window.events, "shown"):
            window.events.shown += _on_shown
        elif hasattr(window.events, "loaded"):
            window.events.loaded += _on_shown
        else:
            threading.Timer(0.35, _on_shown).start()
    except Exception:
        threading.Timer(0.35, _on_shown).start()

    return window


def main() -> None:
    runtime_root = _runtime_root()
    os.chdir(runtime_root)
    _load_env_file(runtime_root)

    # Carpeta temporal writable SIN espacios.
    # LOCALAPPDATA falla si el usuario Windows tiene espacios (PyInstaller LoadLibrary).
    public_root = Path(r"C:\Users\Public")
    if public_root.exists():
        runtime_tmp = public_root / "FELPOS" / "runtime-tmp"
    else:
        program_data = Path(os.environ.get("PROGRAMDATA") or r"C:\ProgramData")
        if " " in str(program_data):
            program_data = Path(r"C:\ProgramData")
        runtime_tmp = program_data / "FELPOS" / "runtime-tmp"
    local_app = Path(os.environ.get("LOCALAPPDATA") or "")
    try:
        runtime_tmp.mkdir(parents=True, exist_ok=True)
        os.environ["TEMP"] = str(runtime_tmp)
        os.environ["TMP"] = str(runtime_tmp)
        os.environ["FELPOS_RUNTIME_TMP"] = str(runtime_tmp)
    except OSError:
        pass

    # Mantener relaunch.vbs en Public (ruta segura para post-update / Boot.cmd).
    try:
        from app.services.update_service import _write_safe_relaunch_vbs

        _write_safe_relaunch_vbs(runtime_root)
    except Exception:
        pass

    # Limpia extracciones _MEI viejas. NUNCA borrar sys._MEIPASS (extraccion actual).
    current_mei: Path | None = None
    mei = getattr(sys, "_MEIPASS", None)
    if mei:
        try:
            current_mei = Path(mei).resolve()
        except OSError:
            current_mei = Path(mei)

    for base in (
        runtime_tmp,
        local_app / "FELPOS" / "runtime-tmp",
        Path(os.environ.get("PROGRAMDATA") or r"C:\ProgramData") / "FELPOS" / "runtime-tmp",
        local_app / "Temp",
        local_app / "FEL POS" / "tmp",
        Path(os.environ.get("TEMP") or ""),
    ):
        if not base or not base.exists():
            continue
        try:
            for child in base.iterdir():
                if not (child.is_dir() and child.name.upper().startswith("_MEI")):
                    continue
                try:
                    child_resolved = child.resolve()
                except OSError:
                    child_resolved = child
                if current_mei and child_resolved == current_mei:
                    continue
                shutil.rmtree(child, ignore_errors=True)
        except OSError:
            pass

    _apply_pending_update_if_needed(runtime_root)
    mode = _resolve_mode()
    bind_host = _resolve_bind_host(mode)
    port = DEFAULT_PORT

    if mode == "client":
        try:
            _run_client_mode(port=port)
        except Exception as exc:
            log_path = _write_runtime_error(exc, runtime_root)
            print(f"ERROR al iniciar FEL POS (cliente). Revisa: {log_path}")
            if getattr(sys, "frozen", False):
                try:
                    os.startfile(str(log_path))  # type: ignore[attr-defined]
                except Exception:
                    pass
            raise
        return

    server: uvicorn.Server | None = None
    desktop_api = DesktopApi()

    try:
        # Import directly so PyInstaller bundles the app package.
        from app.main import app as fastapi_app
    except Exception as exc:
        log_path = _write_runtime_error(exc, runtime_root)
        print(f"ERROR al iniciar FEL POS. Revisa: {log_path}")
        if getattr(sys, "frozen", False):
            try:
                os.startfile(str(log_path))  # type: ignore[attr-defined]
            except Exception:
                pass
        raise

    # Arranque OK: ya se puede descartar la copia anterior del EXE.
    try:
        from app.services.update_service import cleanup_previous_exe_backup

        cleanup_previous_exe_backup(runtime_root)
    except Exception:
        pass

    if mode == "server":
        _run_server_mode(fastapi_app=fastapi_app, bind_host=bind_host, port=port)
        return

    webview = _load_webview()
    if not webview:
        raise RuntimeError(
            "No se encontro pywebview. Este sistema esta en modo local/escritorio. "
            "Instala dependencias con: .\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt "
            "o usa FELPOS_MODE=server para ejecutar solo como servidor."
        )

    if _is_port_in_use(WINDOW_HOST, port):
        from app.services.update_service import has_pending_executable_update

        if has_pending_executable_update(runtime_root):
            raise RuntimeError(
                "Hay una actualizacion pendiente y otra copia de FEL POS sigue activa. "
                "Cierra todas las ventanas de FEL POS e intenta de nuevo."
            )
        # Otro proceso ya sirve la app; igual anunciamos si este bind es LAN.
        _start_lan_announcer_safe(http_port=port, bind_host=bind_host)
        window = _create_desktop_window(
            webview,
            url=f"http://{WINDOW_HOST}:{port}",
            js_api=desktop_api,
        )
        webview.start(gui="edgechromium")
        return

    config = uvicorn.Config(
        fastapi_app,
        host=bind_host,
        port=port,
        reload=False,
        log_level="warning",
    )
    server = uvicorn.Server(config)
    server_thread = threading.Thread(target=server.run, daemon=True)
    server_thread.start()

    if not _wait_for_port(WINDOW_HOST, port):
        raise RuntimeError("No se pudo iniciar el servidor local en FEL POS.")

    _start_lan_announcer_safe(http_port=port, bind_host=bind_host)

    window = _create_desktop_window(
        webview,
        url=f"http://{WINDOW_HOST}:{port}",
        js_api=desktop_api,
    )

    def _on_window_closed() -> None:
        if server:
            server.should_exit = True

    window.events.closed += _on_window_closed
    webview.start(gui="edgechromium")
    if server:
        server.should_exit = True
    server_thread.join(timeout=5)


if __name__ == "__main__":
    main()
