"""FastAPI application entry point."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1 import analyses, auth, chat, datasets, insights, reports, system, workspaces
from app.core.config import settings
from app.core.errors import AppError
from app.core.logging import configure_logging, get_logger, get_request_id
from app.core.middleware import (
    RateLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
)
from app.db.session import init_db

configure_logging()
logger = get_logger(__name__)


def _purge_demo_sessions() -> None:
    """Best effort. A failure here must never stop the application booting."""
    try:
        from app.db.session import session_scope
        from app.seed.demo import purge_expired_demo_sessions

        with session_scope() as db:
            purge_expired_demo_sessions(db)
    except Exception:  # noqa: BLE001
        logger.warning("could not purge expired demo sessions", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
    from app.ai.warmup import warm_up_async
    from app.jobs.runner import reconcile_stale_jobs, shutdown_executor

    logger.info(
        "starting InsightFlow AI",
        extra={
            "environment": settings.environment,
            "ai_provider": settings.ai_provider if settings.ai_enabled else "disabled",
        },
    )

    init_db()
    if settings.storage_backend == "local":
        settings.uploads_path.mkdir(parents=True, exist_ok=True)

    # Everything below runs once per process. On a server that is once per
    # deploy and costs nothing; where each cold start is a new process it would
    # be a tax on unpredictable requests, and the warm-up thread would be
    # pointless there for the same reason the job pool is. Each task has
    # another trigger — stale jobs are failed when one is polled, demo sessions
    # are purged whenever a demo is created — so switching this off loses
    # nothing but the head start.
    if settings.startup_tasks_enabled:
        # A process that died mid-analysis leaves rows marked "running" that
        # would otherwise spin in the UI forever.
        reconcile_stale_jobs()

        # Expired demo workspaces and their files. Done here rather than on a
        # scheduler so the product needs no second process to stay tidy; a demo
        # created moments before a restart simply lives out its full lifetime.
        _purge_demo_sessions()

        # Load the model in the background so the first question does not pay
        # the cold-start cost. Best effort; failure is logged and ignored.
        warm_up_async()

    yield

    shutdown_executor(wait=False)
    logger.info("shutting down")


app = FastAPI(
    title=settings.app_name,
    description=(
        "An AI business operations analyst. Uploads business data, computes "
        "metrics, trends, and anomalies deterministically, and uses a language "
        "model only to explain the computed evidence."
    ),
    version=system.VERSION,
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

# Order matters: the outermost middleware is added last.
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-Id"],
    expose_headers=["X-Request-Id"],
    max_age=600,
)


# --------------------------------------------------------------------------- #
# Error handling
#
# Every error leaves this application in the same shape, with a message written
# for a business user rather than an engineer. Internal detail is logged, never
# returned.
# --------------------------------------------------------------------------- #


def _error_response(status_code: int, payload: dict) -> JSONResponse:
    payload.setdefault("request_id", get_request_id())
    return JSONResponse(status_code=status_code, content={"error": payload})


@app.exception_handler(AppError)
async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
    if exc.status_code >= 500:
        logger.error("application error", extra={"code": exc.code, "message": exc.message})
    return _error_response(exc.status_code, exc.to_payload())


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Translate pydantic errors into something a person can act on."""
    fields: list[str] = []
    messages: list[str] = []
    for error in exc.errors():
        location = [str(part) for part in error.get("loc", []) if part not in ("body", "query")]
        field = ".".join(location) or "request"
        fields.append(field)
        message = error.get("msg", "is invalid")
        message = message.removeprefix("Value error, ")
        messages.append(f"{field}: {message}")

    return _error_response(
        422,
        {
            "code": "validation_error",
            "message": "Some of the information provided is not valid.",
            "hint": messages[0] if messages else None,
            "details": {"fields": fields, "errors": messages[:6]},
        },
    )


@app.exception_handler(StarletteHTTPException)
async def handle_http_exception(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    friendly = {
        404: "We could not find what you were looking for.",
        405: "That action is not allowed here.",
        413: "That upload is too large.",
    }
    return _error_response(
        exc.status_code,
        {
            "code": f"http_{exc.status_code}",
            "message": friendly.get(exc.status_code, str(exc.detail)),
        },
    )


@app.exception_handler(Exception)
async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
    """The last line of defence.

    A stack trace or driver message must never reach the client: it can expose
    schema details, file paths, or credentials.
    """
    logger.exception("unhandled error", extra={"path": request.url.path})
    return _error_response(
        500,
        {
            "code": "internal_error",
            "message": "Something went wrong on our side.",
            "hint": "Try again in a moment. If it keeps happening, contact support.",
        },
    )


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #

prefix = settings.api_v1_prefix
app.include_router(system.router, prefix=prefix)
app.include_router(auth.router, prefix=prefix)
app.include_router(workspaces.router, prefix=prefix)
app.include_router(datasets.router, prefix=prefix)
app.include_router(analyses.router, prefix=prefix)
app.include_router(insights.router, prefix=prefix)
app.include_router(chat.router, prefix=prefix)
app.include_router(reports.router, prefix=prefix)


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {
        "name": settings.app_name,
        "version": system.VERSION,
        "docs": None if settings.is_production else "/docs",
        "health": f"{prefix}/health",
    }
