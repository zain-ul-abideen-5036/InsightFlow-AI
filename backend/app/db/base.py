"""SQLAlchemy declarative base, portable column types, and shared mixins.

The application targets PostgreSQL in production but must run with zero setup in
local development. Rather than maintaining two schemas, we use small type
decorators that adapt to whichever dialect is connected:

* :class:`GUID`  — native ``UUID`` on PostgreSQL, ``CHAR(36)`` elsewhere.
* :class:`JSONB` — native ``JSONB`` on PostgreSQL, ``JSON`` elsewhere.
* :class:`UTCDateTime` — a timestamp that survives SQLite still knowing it is UTC.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import JSON, TypeDecorator


class Base(DeclarativeBase):
    """Declarative base for every ORM model."""


class GUID(TypeDecorator):
    """Platform-independent UUID type."""

    impl = String(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):  # type: ignore[no-untyped-def]
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(String(36))

    def process_bind_param(self, value, dialect):  # type: ignore[no-untyped-def]
        if value is None:
            return None
        if not isinstance(value, uuid.UUID):
            value = uuid.UUID(str(value))
        return value if dialect.name == "postgresql" else str(value)

    def process_result_value(self, value, dialect):  # type: ignore[no-untyped-def]
        if value is None:
            return None
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


class JSONB(TypeDecorator):
    """``JSONB`` on PostgreSQL, plain ``JSON`` elsewhere."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):  # type: ignore[no-untyped-def]
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_JSONB())
        return dialect.type_descriptor(JSON())


class UTCDateTime(TypeDecorator):
    """A timestamp that is still timezone-aware after a round trip.

    SQLite has no timestamp type, so ``DateTime(timezone=True)`` stores what it
    is given and hands back a *naive* ``datetime``. The application writes
    ``datetime.now(timezone.utc)``, so the value is correct and the label saying
    so is gone — and everything downstream then has to guess.

    The guess is usually wrong in the worst possible way. Serialised to JSON, a
    naive datetime has no ``Z``, and ``new Date("2026-09-19T21:21:40")`` in a
    browser reads it as *local* time. A user five hours from UTC sees an
    analysis that finished a moment ago dated five hours out — and there is
    nothing on screen to suggest the figure is anything other than correct.

    So the timezone is re-attached on the way out. Values are always stored and
    returned as UTC; presenting them in the viewer's zone is the interface's
    job.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            # A naive value reaching the database is a bug upstream, but storing
            # it as something other than UTC would compound it silently.
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def process_result_value(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


def utcnow() -> datetime:
    """Timezone-aware current time (never use naive datetimes in this codebase)."""
    return datetime.now(timezone.utc)


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=new_uuid)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), nullable=False, default=utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
    )


def as_dict(instance: Any) -> dict[str, Any]:
    """Shallow column dump — handy in tests and debugging."""
    return {c.name: getattr(instance, c.name) for c in instance.__table__.columns}
