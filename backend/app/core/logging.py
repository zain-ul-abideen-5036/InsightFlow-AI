"""Structured application logging.

Two formats are supported: a readable console format for development and
one-line JSON for production log aggregation. A request-scoped correlation id
is attached to every record via a :class:`contextvars.ContextVar`, so any log
line emitted while handling a request can be traced back to it.

Dataset *contents* are never logged — only shapes, column names, and timings.
"""

from __future__ import annotations

import json
import logging
import sys
import uuid
from contextvars import ContextVar
from typing import Any

from app.core.config import settings

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)

# Attributes present on every LogRecord; anything else was supplied by the
# caller via `extra=` and should be surfaced as structured context.
_RESERVED = set(
    vars(logging.LogRecord("", 0, "", 0, "", (), None)).keys()
) | {"message", "asctime", "taskName"}


def set_request_id(value: str | None = None) -> str:
    """Bind a correlation id to the current context and return it."""
    rid = value or uuid.uuid4().hex[:16]
    _request_id.set(rid)
    return rid


def get_request_id() -> str | None:
    return _request_id.get()


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        rid = get_request_id()
        if rid:
            payload["request_id"] = rid
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


class _ConsoleFormatter(logging.Formatter):
    _COLORS = {
        "DEBUG": "\033[38;5;245m",
        "INFO": "\033[38;5;39m",
        "WARNING": "\033[38;5;214m",
        "ERROR": "\033[38;5;203m",
        "CRITICAL": "\033[48;5;203;38;5;231m",
    }
    _RESET = "\033[0m"

    def __init__(self) -> None:
        super().__init__("%(message)s")
        self._use_color = sys.stderr.isatty()

    def format(self, record: logging.LogRecord) -> str:
        level = record.levelname
        colour = self._COLORS.get(level, "") if self._use_color else ""
        reset = self._RESET if self._use_color else ""
        rid = get_request_id()
        prefix = f"{colour}{level:<8}{reset} {record.name}"
        if rid:
            prefix += f" [{rid}]"
        extras = {
            key: value
            for key, value in record.__dict__.items()
            if key not in _RESERVED and not key.startswith("_")
        }
        line = f"{prefix}  {record.getMessage()}"
        if extras:
            line += "  " + " ".join(f"{k}={v!r}" for k, v in extras.items())
        if record.exc_info:
            line += "\n" + self.formatException(record.exc_info)
        return line


def configure_logging() -> None:
    """Install handlers. Safe to call more than once."""
    root = logging.getLogger()
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(_JsonFormatter() if settings.log_json else _ConsoleFormatter())
    root.addHandler(handler)
    root.setLevel(settings.log_level)

    # uvicorn duplicates access logs through its own handlers; route everything
    # through ours so format and request ids stay consistent.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.propagate = True

    # These are noisy at DEBUG and never carry useful product signal.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("multipart").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
