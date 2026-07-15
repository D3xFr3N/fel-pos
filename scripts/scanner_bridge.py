"""Ejecuta el puente scanner como proceso independiente."""

from app.config import settings
from app.services.scanner_bridge_service import start_scanner_bridge


def main() -> None:
    settings.scanner_bridge_enabled = True
    start_scanner_bridge()
    print(
        f"Puente scanner escuchando en {settings.scanner_bridge_host}:"
        f"{settings.scanner_bridge_port}"
    )
    if settings.scanner_bridge_com_port:
        print(f"Puerto serial Bluetooth/COM: {settings.scanner_bridge_com_port}")
    print("Presiona Ctrl+C para salir.")
    try:
        import time

        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("Puente detenido.")


if __name__ == "__main__":
    main()
