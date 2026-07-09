from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session as OrmSession, sessionmaker

from app.config import settings
from app.services.backup_service import create_auto_backup_if_due

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False, "timeout": 30},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record):  # noqa: ANN001
    if not str(settings.database_url or "").startswith("sqlite:"):
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA synchronous=FULL;")
    cursor.execute("PRAGMA wal_autocheckpoint=1000;")
    cursor.execute("PRAGMA busy_timeout=5000;")
    cursor.execute("PRAGMA foreign_keys=ON;")
    cursor.close()


@event.listens_for(OrmSession, "after_flush")
def _mark_session_had_write(session, flush_context):  # noqa: ANN001
    session.info["felpos_had_write"] = True


@event.listens_for(OrmSession, "after_commit")
def _autosave_after_commit(session):  # noqa: ANN001
    had_write = bool(session.info.pop("felpos_had_write", False))
    if not had_write:
        return
    try:
        create_auto_backup_if_due(
            label="autosave",
            min_interval_seconds=int(settings.backup_auto_min_interval_seconds or 60),
        )
    except Exception as exc:
        print(f"[WARN] No se pudo crear auto-respaldo por movimiento: {exc}")


@event.listens_for(OrmSession, "after_rollback")
def _clear_write_marker_after_rollback(session):  # noqa: ANN001
    session.info.pop("felpos_had_write", None)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
