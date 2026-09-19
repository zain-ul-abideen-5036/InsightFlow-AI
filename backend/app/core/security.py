"""Password hashing and JWT issuance/verification.

The backend is a stateless bearer-token API. The browser session cookie is owned
by the Next.js layer, which exchanges credentials here and attaches the access
token to proxied requests. Keeping cookie handling out of the API makes the
backend trivially testable and avoids cross-site cookie problems in production.
"""

from __future__ import annotations

import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any, Literal

import bcrypt
import jwt

from app.core.config import settings

TokenType = Literal["access", "refresh", "password_reset"]

# bcrypt operates on at most 72 bytes and silently truncates beyond that, which
# would make two different long passwords interchangeable. We reject instead.
MAX_PASSWORD_BYTES = 72
MIN_PASSWORD_LENGTH = 8


class InvalidTokenError(Exception):
    """Raised when a token is malformed, expired, or of the wrong type."""


# --------------------------------------------------------------------------- #
# Passwords
# --------------------------------------------------------------------------- #


def password_problems(password: str) -> list[str]:
    """Return human-readable reasons a password is unacceptable (empty = fine)."""
    problems: list[str] = []
    if len(password) < MIN_PASSWORD_LENGTH:
        problems.append(f"Use at least {MIN_PASSWORD_LENGTH} characters.")
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        problems.append("Password is too long (maximum 72 bytes).")
    if password.isdigit():
        problems.append("Use more than digits alone.")
    if password.lower() in {"password", "12345678", "insightflow", "qwertyui"}:
        problems.append("This password is too common.")
    return problems


def hash_password(password: str) -> str:
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError("Password exceeds the maximum supported length of 72 bytes.")
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Constant-time-ish verification that never raises on malformed hashes."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


@lru_cache(maxsize=1)
def _decoy_hash() -> bytes:
    """A real bcrypt hash at the same cost factor, computed once per process."""
    return bcrypt.hashpw(b"timing-equalisation", bcrypt.gensalt(rounds=12))


def dummy_password_verify() -> None:
    """Burn comparable CPU when a user does not exist.

    Without this, "no such account" returns measurably faster than "wrong
    password", which lets an attacker enumerate registered email addresses.
    """
    bcrypt.checkpw(b"timing-equalisation-probe", _decoy_hash())


# --------------------------------------------------------------------------- #
# Tokens
# --------------------------------------------------------------------------- #


def _create_token(
    subject: str,
    token_type: TokenType,
    expires_delta: timedelta,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_access_token(subject: str, **extra: Any) -> str:
    return _create_token(
        subject, "access", timedelta(minutes=settings.access_token_expire_minutes), extra
    )


def create_refresh_token(subject: str) -> str:
    return _create_token(subject, "refresh", timedelta(days=settings.refresh_token_expire_days))


def create_password_reset_token(subject: str) -> str:
    return _create_token(subject, "password_reset", timedelta(hours=1))


def decode_token(token: str, expected_type: TokenType) -> dict[str, Any]:
    """Decode and validate a token, or raise :class:`InvalidTokenError`."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise InvalidTokenError("This link or session has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise InvalidTokenError("This token is not valid.") from exc

    if payload.get("type") != expected_type:
        # A refresh token must never be usable as an access token.
        raise InvalidTokenError("This token cannot be used for this operation.")
    if not payload.get("sub"):
        raise InvalidTokenError("This token is missing a subject.")
    return payload


def token_expiry_seconds() -> int:
    return settings.access_token_expire_minutes * 60


# --------------------------------------------------------------------------- #
# Misc
# --------------------------------------------------------------------------- #


def generate_api_secret(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def constant_time_equals(left: str, right: str) -> bool:
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))
