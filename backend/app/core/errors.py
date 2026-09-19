"""Application error taxonomy.

Users of this product are business owners, not engineers. Every error that can
reach them carries a plain-English ``message`` and, wherever we can offer one, a
concrete ``hint`` describing what to do next. Stack traces and driver messages
never cross the API boundary.
"""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base class for all errors that are safe to show a user."""

    status_code: int = 400
    code: str = "error"

    def __init__(
        self,
        message: str,
        *,
        hint: str | None = None,
        details: dict[str, Any] | None = None,
        status_code: int | None = None,
        code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.hint = hint
        self.details = details or {}
        if status_code is not None:
            self.status_code = status_code
        if code is not None:
            self.code = code

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.hint:
            payload["hint"] = self.hint
        if self.details:
            payload["details"] = self.details
        return payload


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"


class AuthenticationError(AppError):
    status_code = 401
    code = "authentication_error"


class PermissionDeniedError(AppError):
    status_code = 403
    code = "permission_denied"


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class RateLimitedError(AppError):
    status_code = 429
    code = "rate_limited"


class FileValidationError(ValidationError):
    code = "file_invalid"


class DatasetError(AppError):
    code = "dataset_error"


class AnalysisError(AppError):
    code = "analysis_error"


class InsufficientDataError(AppError):
    """Raised when an analysis is mathematically impossible on this dataset.

    This is not a failure of the product — it is a finding, and the message is
    written to be read by the user as an explanation.
    """

    status_code = 422
    code = "insufficient_data"


class AIProviderError(AppError):
    """The AI layer failed. Never fatal: callers fall back to deterministic output."""

    status_code = 503
    code = "ai_unavailable"


class AIResponseError(AIProviderError):
    """The model replied, but not in a shape we are willing to trust."""

    code = "ai_invalid_response"
