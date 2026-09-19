"""Health, version, and AI provider status."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app.api.deps import CurrentUser
from app.core.config import settings
from app.core.logging import get_logger
from app.db.session import engine
from app.schemas.api import AIStatusResponse
from app.schemas.common import HealthResponse, ReadyResponse

logger = get_logger(__name__)
router = APIRouter(tags=["system"])

VERSION = "1.0.0"


def _database_reachable() -> bool:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001
        return False


def _storage_writable() -> bool:
    """Uploads land on disk, so a read-only volume means requests will fail.

    Worth probing separately: a container whose persistent volume failed to
    mount starts cleanly, answers /health, and then rejects every upload.
    """
    try:
        path = settings.uploads_path
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".readiness"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return True
    except Exception:  # noqa: BLE001
        return False


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness and dependency check. Public, and must never raise."""
    from app.ai.service import provider_health

    database_ok = _database_reachable()
    ai = provider_health()
    return HealthResponse(
        status="ok" if database_ok else "degraded",
        version=VERSION,
        environment=settings.environment,
        database=database_ok,
        ai={
            "enabled": settings.ai_enabled,
            "provider": ai.provider,
            "model": ai.model,
            "available": ai.available,
            "detail": ai.detail,
        },
        timestamp=datetime.now(timezone.utc),
    )


@router.get("/ready", response_model=ReadyResponse)
def ready(response: Response) -> ReadyResponse:
    """Readiness probe: is this instance able to serve requests?

    Distinct from ``/health`` on purpose. ``/health`` answers "is this process
    alive", and an orchestrator that restarts on its failure is doing the right
    thing. Readiness answers "should traffic be routed here", and the correct
    response to a transient database outage is to stop sending requests, not to
    kill a process that will recover on its own.

    Returns 503 when not ready, because load balancers read the status code,
    not the body.

    The AI provider is deliberately **not** checked. Written explanations are an
    enhancement over a product that is fully functional without them, so an
    unreachable model must never take the service out of rotation.
    """
    checks = {
        "database": _database_reachable(),
        "storage": _storage_writable(),
    }
    is_ready = all(checks.values())
    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        logger.warning("readiness check failed", extra={"checks": checks})
    return ReadyResponse(ready=is_ready, checks=checks)


@router.get("/ai/status", response_model=AIStatusResponse)
def ai_status(user: CurrentUser) -> AIStatusResponse:
    """What the AI layer is, and exactly what data it receives.

    Shown verbatim in Settings. A business uploading its sales data is entitled
    to a precise answer to "what leaves my machine?", not a privacy paragraph.
    """
    from app.ai.service import provider_health

    ai = provider_health()
    local = settings.ai_provider == "ollama"

    return AIStatusResponse(
        enabled=settings.ai_enabled,
        provider=ai.provider,
        model=ai.model,
        available=ai.available,
        detail=ai.detail,
        latency_ms=ai.latency_ms,
        data_sent=(
            [
                "Aggregated metrics (totals, averages, percentage changes)",
                "Segment names such as product, region, and channel names",
                "Period labels and the calculation used for each figure",
                "Your question text",
            ]
            + (
                ["Nothing leaves this machine: the model runs locally via Ollama."]
                if local
                else [
                    f"This data is sent to an external provider at {settings.openai_base_url}.",
                    "Individual rows of your file are never sent.",
                ]
            )
        ),
        max_sample_rows=settings.ai_max_sample_rows,
    )
