"""Where uploaded files live.

The product re-reads the original file long after the upload finished: `Ask`
plans a query and executes it against the rows, and `Investigate` slices the
dataset to explain an anomaly. So the file is not a transient input — it is
durable state the application depends on, and where it is kept is a deployment
decision rather than an implementation detail.

Two backends, one interface:

* ``local`` writes to a directory, which is what a laptop, a container with a
  volume, or a VM should use. It is the default, so nothing about local
  development or a self-hosted deployment changes.
* ``database`` stores the bytes in PostgreSQL alongside the rows that describe
  them. This exists because serverless platforms — Vercel among them — give a
  function a ``/tmp`` that is private to one instance and erased without notice.
  A file written there is invisible to the next request and gone after a deploy,
  which would make `Ask` and `Investigate` fail on a dataset the user can see
  listed.

Keys are relative POSIX paths (``uploads/<workspace>/<dataset>/orders.csv``) in
both backends, so ``Dataset.storage_path`` means the same thing either way and
no migration of existing rows is needed when a deployment moves.

The trade-off in the database backend is honest and bounded: PostgreSQL is not
object storage, and a row per file consumes the same quota as the analysis
results. It is the right answer here only because the upload ceiling is small
(see ``MAX_UPLOAD_SIZE_MB``) and because it adds no third-party account,
credential, or SDK to a deployment whose whole point is to be reproducible from
two free-tier services.
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class StorageError(RuntimeError):
    """A file could not be read or written. Never raised for "not found"."""


class FileStorage(Protocol):
    """The whole surface the application needs. Deliberately tiny."""

    def write(self, key: str, data: bytes, db: Session | None = None) -> None:
        """Store bytes under a key, replacing anything already there.

        Every method takes an optional session so a file can be read or written
        inside the transaction that owns the row pointing at it. That is not
        only tidier: on a serverless host each instance keeps its own small
        connection pool, and a read that opens a second connection while the
        request still holds its first one halves how many requests an instance
        can serve at once.
        """
        ...

    def read(self, key: str, db: Session | None = None) -> bytes:
        """Return the stored bytes, or raise ``FileNotFoundError``."""
        ...

    def exists(self, key: str, db: Session | None = None) -> bool: ...

    def delete_prefix(self, prefix: str, db: Session | None = None) -> int:
        """Remove everything under a key prefix. Returns how many were removed."""
        ...

    def healthy(self) -> bool:
        """Whether this backend can currently accept a write."""
        ...


# --------------------------------------------------------------------------- #
# Local filesystem
# --------------------------------------------------------------------------- #


class LocalFileStorage:
    """Files under ``STORAGE_DIR``. The original behaviour, unchanged."""

    def _path(self, key: str) -> Path:
        # Keys are built by this application, never by a request, but a
        # traversal here would escape the storage root entirely, so it is
        # rejected rather than trusted.
        candidate = (settings.storage_path / key).resolve()
        root = settings.storage_path.resolve()
        if root not in candidate.parents and candidate != root:
            raise StorageError("Refusing to access a path outside the storage root.")
        return candidate

    def write(self, key: str, data: bytes, db: Session | None = None) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def read(self, key: str, db: Session | None = None) -> bytes:
        path = self._path(key)
        if not path.exists():
            raise FileNotFoundError(key)
        return path.read_bytes()

    def exists(self, key: str, db: Session | None = None) -> bool:
        return self._path(key).exists()

    def delete_prefix(self, prefix: str, db: Session | None = None) -> int:
        directory = self._path(prefix)
        if not directory.exists():
            return 0
        removed = 0
        for path in sorted(directory.rglob("*"), reverse=True):
            try:
                if path.is_file():
                    path.unlink()
                    removed += 1
                else:
                    path.rmdir()
            except OSError:
                # One locked file must not abandon the rest of the tree.
                continue
        try:
            directory.rmdir()
        except OSError:
            pass
        return removed

    def healthy(self) -> bool:
        try:
            path = settings.uploads_path
            path.mkdir(parents=True, exist_ok=True)
            probe = path / ".readiness"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
            return True
        except Exception:  # noqa: BLE001
            return False


# --------------------------------------------------------------------------- #
# PostgreSQL
# --------------------------------------------------------------------------- #


class DatabaseFileStorage:
    """Files as rows, for deployments with no durable filesystem.

    Every method accepts an optional session so a file can be written inside the
    same transaction as the ``Dataset`` row that points at it. When one is not
    supplied the write gets its own transaction, which matches what the local
    backend does and keeps the call sites that have no session simple.
    """

    def _model(self):
        from app.db.models import StoredFile

        return StoredFile

    def write(self, key: str, data: bytes, db: Session | None = None) -> None:
        StoredFile = self._model()

        def _do(session: Session) -> None:
            # Re-uploading the same key replaces it, which is what writing to a
            # path does. Without this a retried upload would fail on the unique
            # index rather than overwrite.
            session.execute(delete(StoredFile).where(StoredFile.key == key))
            session.add(StoredFile(key=key, size_bytes=len(data), content=data))

        if db is not None:
            _do(db)
            db.flush()
            return

        from app.db.session import session_scope

        with session_scope() as session:
            _do(session)

    def read(self, key: str, db: Session | None = None) -> bytes:
        StoredFile = self._model()

        def _do(session: Session):
            return session.scalar(select(StoredFile.content).where(StoredFile.key == key))

        if db is not None:
            content = _do(db)
        else:
            from app.db.session import session_scope

            with session_scope() as session:
                content = _do(session)

        if content is None:
            raise FileNotFoundError(key)
        return bytes(content)

    def exists(self, key: str, db: Session | None = None) -> bool:
        StoredFile = self._model()

        def _do(session: Session) -> bool:
            return session.scalar(select(StoredFile.id).where(StoredFile.key == key)) is not None

        if db is not None:
            return _do(db)

        from app.db.session import session_scope

        with session_scope() as session:
            return _do(session)

    def delete_prefix(self, prefix: str, db: Session | None = None) -> int:
        StoredFile = self._model()
        # A literal prefix match. `_` and `%` are wildcards in LIKE, and keys
        # contain neither (they are UUIDs and a filename), but escaping is
        # cheap insurance against a filename that one day does.
        pattern = prefix.rstrip("/").replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

        def _do(session: Session) -> int:
            result = session.execute(
                delete(StoredFile).where(StoredFile.key.like(f"{pattern}/%", escape="\\"))
            )
            return int(result.rowcount or 0)

        if db is not None:
            return _do(db)

        from app.db.session import session_scope

        with session_scope() as session:
            return _do(session)

    def healthy(self) -> bool:
        from app.db.session import session_scope

        StoredFile = self._model()
        try:
            with session_scope() as session:
                session.scalar(select(func.count(StoredFile.id)))
            return True
        except Exception:  # noqa: BLE001
            return False


# --------------------------------------------------------------------------- #
# Selection
# --------------------------------------------------------------------------- #


def _build() -> FileStorage:
    if settings.storage_backend == "database":
        logger.info("file storage: database")
        return DatabaseFileStorage()
    logger.info("file storage: local", extra={"path": str(settings.storage_path)})
    return LocalFileStorage()


_storage: FileStorage | None = None


def get_storage() -> FileStorage:
    """The configured backend. Resolved once, on first use."""
    global _storage
    if _storage is None:
        _storage = _build()
    return _storage


def reset_storage() -> None:
    """Forget the cached backend. For tests that change the setting."""
    global _storage
    _storage = None


def storage_key(*parts: str) -> str:
    """Build a key. Always POSIX, so a key written on Windows reads on Linux."""
    return "/".join(str(part).strip("/") for part in parts if str(part).strip("/"))
