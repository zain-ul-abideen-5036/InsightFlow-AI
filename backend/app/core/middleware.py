"""HTTP middleware: request correlation, security headers, and rate limiting."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.core.client import client_address
from app.core.config import settings
from app.core.logging import get_logger, set_request_id

logger = get_logger(__name__)

# Probed continuously by load balancers and container platforms. Logging every
# hit would bury the real traffic, and rate-limiting them would take a healthy
# instance out of rotation for being checked too often.
PROBE_PATHS = {"/api/v1/health", "/api/v1/ready", "/health", "/ready"}


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attach a correlation id to every request and log its outcome."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = set_request_id(request.headers.get("x-request-id"))
        request.state.request_id = request_id
        started = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = int((time.perf_counter() - started) * 1000)
            logger.exception(
                "request failed",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": duration_ms,
                },
            )
            raise

        duration_ms = int((time.perf_counter() - started) * 1000)
        response.headers["x-request-id"] = request_id

        # Health checks are polled constantly and would drown the log.
        if request.url.path not in PROBE_PATHS:
            logger.info(
                "request",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": duration_ms,
                },
            )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Defensive response headers.

    The API serves JSON only, so a restrictive CSP costs nothing here and
    protects the documentation pages.
    """

    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Permissions-Policy", "geolocation=(), microphone=(), camera=()"
        )
        if settings.is_production:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Fixed-window rate limiting, in process.

    Sufficient for a single-instance deployment, which is this product's scope.
    Behind multiple instances this becomes per-instance, which is documented
    rather than solved with Redis — the extra dependency is not yet earned.

    Authentication endpoints get a much stricter budget, because those are the
    ones worth brute-forcing.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def _client_key(self, request: Request) -> str:
        # Deliberately not the left-most X-Forwarded-For entry: that value is
        # supplied by the caller, so keying on it lets anyone reset their own
        # budget by changing a header. See app/core/client.py.
        return client_address(request)

    def _budget(self, path: str) -> tuple[int, int]:
        if "/auth/" in path and not path.endswith("/session"):
            return settings.auth_rate_limit_requests, settings.auth_rate_limit_window_seconds
        return settings.rate_limit_requests, settings.rate_limit_window_seconds

    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        if not settings.rate_limit_enabled or request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        if path in PROBE_PATHS:
            return await call_next(request)

        limit, window = self._budget(path)
        bucket = "auth" if "/auth/" in path else "api"
        key = f"{bucket}:{self._client_key(request)}"
        now = time.monotonic()

        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > window:
                hits.popleft()
            if len(hits) >= limit:
                retry_after = int(window - (now - hits[0])) + 1
                logger.warning("rate limited", extra={"key": key, "path": path})
                return JSONResponse(
                    status_code=429,
                    headers={"Retry-After": str(retry_after)},
                    content={
                        "error": {
                            "code": "rate_limited",
                            "message": "Too many requests. Please slow down.",
                            "hint": f"Try again in about {retry_after} seconds.",
                        }
                    },
                )
            hits.append(now)

            # Without periodic pruning this dictionary grows once per distinct
            # client address and never shrinks.
            if len(self._hits) > 5000:
                stale = [k for k, v in self._hits.items() if not v or now - v[-1] > window * 2]
                for k in stale:
                    del self._hits[k]

        response = await call_next(request)

        # Refund a successful authentication against the strict budget.
        #
        # That budget exists to stop credential guessing, which by definition
        # produces failures. Charging successes too punishes exactly the wrong
        # people: a shared office IP, a household behind NAT, or anyone who
        # legitimately signs in on several devices would be locked out after
        # ten *correct* sign-ins. Failures still accumulate normally, so
        # brute-force protection is unchanged.
        if bucket == "auth" and response.status_code < 400:
            with self._lock:
                remaining = self._hits.get(key)
                if remaining:
                    remaining.pop()

        return response
