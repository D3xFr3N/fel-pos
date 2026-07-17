from __future__ import annotations

import os
import socket
import sys
import threading
import time
import traceback
from importlib import import_module
from pathlib import Path

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
    if mode not in {"local", "server"}:
        return "local"
    return mode


def _resolve_bind_host(mode: str) -> str:
    explicit = (os.getenv("FELPOS_BIND_HOST") or "").strip()
    if explicit:
        return explicit
    # Por defecto escucha en toda la red local para que la APK/celular puedan conectar.
    # Usa FELPOS_BIND_HOST=127.0.0.1 si quieres solo este equipo.
    return "0.0.0.0"


def _run_server_mode(*, fastapi_app, bind_host: str, port: int) -> None:
    print("[INFO] FEL POS ejecutando en modo servidor.")
    print(f"[INFO] URL local: http://127.0.0.1:{port}")
    if bind_host == "0.0.0.0":
        print(f"[INFO] URL LAN: http://<IP-DE-TU-PC>:{port}")
    print("[INFO] Presiona Ctrl+C para detener el servidor.")

    config = uvicorn.Config(
        fastapi_app,
        host=bind_host,
        port=port,
        reload=False,
        log_level="warning",
    )
    server = uvicorn.Server(config)
    server.run()


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

    # Carpeta temporal writable (Program Files no sirve para unpack de PyInstaller).
    runtime_tmp = Path(os.environ.get("LOCALAPPDATA") or "") / "FEL POS" / "tmp"
    try:
        runtime_tmp.mkdir(parents=True, exist_ok=True)
        os.environ["TEMP"] = str(runtime_tmp)
        os.environ["TMP"] = str(runtime_tmp)
    except OSError:
        pass

    _apply_pending_update_if_needed(runtime_root)
    mode = _resolve_mode()
    bind_host = _resolve_bind_host(mode)
    port = DEFAULT_PORT

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
