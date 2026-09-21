"""Database engine and session management.

A single synchronous engine serves both the API (FastAPI runs ``def`` endpoints
in a worker thread) and the analysis job pool. This keeps one connection pool,
one session factory, and one set of semantics — a deliberate simplification over
mixing sync and async stacks.
"""

from __future__ import annotations

from collections.abc import Generator, Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def _build_engine() -> Engine:
    url = settings.sqlalchemy_url
    is_sqlite = url.startswith("sqlite")

    if is_sqlite and ":memory:" in url:
        # Tests: every connection must see the same in-memory database.
        engine = create_engine(
            url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
    elif is_sqlite:
        engine = create_engine(
            url,
            connect_args={"check_same_thread": False, "timeout": 30},
            pool_pre_ping=True,
            future=True,
        )
    else:
        engine = create_engine(
            url,
            # A pooled connection can be closed from the far end between uses —
            # by a proxy's idle timeout, or by a serverless database that
            # suspended while nobody was asking it anything. Pre-ping turns the
            # stale connection that results into a reconnect rather than an
            # error on a request that did nothing wrong.
            pool_pre_ping=True,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_recycle=1800,
            future=True,
        )

    if is_sqlite:

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_connection, _record):  # type: ignore[no-untyped-def]
            cursor = dbapi_connection.cursor()
            # SQLite disables FK enforcement by default; our tenancy guarantees
            # rely on cascades, so it must be on.
            cursor.execute("PRAGMA foreign_keys=ON")
            # WAL lets the analysis worker write while the API reads.
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=30000")
            cursor.close()

    return engine


engine: Engine = _build_engine()

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope for background jobs, scripts, and seeding."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    """Create tables that do not yet exist.

    Alembic owns schema migrations for production; this path exists so that
    local development and the test suite are usable without a migration step.
    ``AUTO_CREATE_TABLES`` turns it off, and a production deployment turns it
    off by default — see ``Settings._validate_production_secrets``.
    """
    if not settings.auto_create_tables:
        logger.info(
            "skipping table creation; the schema is owned by Alembic",
            extra={"dialect": engine.dialect.name},
        )
        return

    from app.db import models  # noqa: F401  (register mappers)
    from app.db.base import Base

    Base.metadata.create_all(bind=engine)
    logger.info("database ready", extra={"dialect": engine.dialect.name})
