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
    if mode == "server":
        return "0.0.0.0"
    return "127.0.0.1"


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
        from app.services.update_service import apply_pending_update_at_startup

        result = apply_pending_update_at_startup(runtime_root)
        if result and result.get("applied_files"):
            target = result.get("target_version") or "nueva"
            print(f"[INFO] Actualizacion aplicada al iniciar: v{target}")
    except Exception as exc:
        log_path = runtime_root / "felpos-error.log"
        log_path.write_text(
            f"No se pudo aplicar actualizacion pendiente:\n{exc}\n",
            encoding="utf-8",
        )
        print(f"[WARN] No se pudo aplicar actualizacion pendiente. Revisa: {log_path}")


def main() -> None:
    runtime_root = _runtime_root()
    os.chdir(runtime_root)
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
        window = webview.create_window(
            "FEL POS",
            f"http://{WINDOW_HOST}:{port}",
            width=1360,
            height=860,
            min_size=(1024, 700),
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

    window = webview.create_window(
        "FEL POS",
        f"http://{WINDOW_HOST}:{port}",
        width=1360,
        height=860,
        min_size=(1024, 700),
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
