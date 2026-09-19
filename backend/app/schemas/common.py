"""Shared API schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ErrorPayload(BaseModel):
    """The shape every error response takes.

    ``message`` is always safe to display; ``hint`` tells the user what to do.
    """

    code: str
    message: str
    hint: str | None = None
    details: dict[str, Any] | None = None
    request_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorPayload


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int

    @property
    def has_more(self) -> bool:
        return self.offset + len(self.items) < self.total


class PaginationParams(BaseModel):
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)


class MessageResponse(BaseModel):
    message: str


class IdResponse(BaseModel):
    id: uuid.UUID


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    database: bool
    ai: dict[str, Any]
    timestamp: datetime


class ReadyResponse(BaseModel):
    """Readiness, as an orchestrator means it: may this instance take traffic?

    Deliberately narrower than :class:`HealthResponse`. It reports no version,
    no environment, and no provider detail, because an unauthenticated endpoint
    polled by infrastructure should describe the service's state and nothing
    about its configuration.
    """

    ready: bool
    checks: dict[str, bool]
