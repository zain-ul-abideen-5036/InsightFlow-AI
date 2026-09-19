"""Model warm-up.

Local inference has a large one-off cost: the first request after start-up (or
after the model is evicted from memory) pays for loading several gigabytes of
weights before it generates a single token. Measured on CPU with a 3B model that
turned a ~60 second request into a ~190 second one, because the first attempt
exceeded the request timeout and was retried.

Warming the model in a background thread at start-up moves that cost off the
user's first question. It is strictly best-effort: if it fails, nothing breaks —
the first real request simply pays the load cost as it otherwise would.
"""

from __future__ import annotations

import threading

from app.ai.providers import get_provider
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_warmed = threading.Event()


def is_warm() -> bool:
    return _warmed.is_set()


def _warm() -> None:
    provider = get_provider()
    if provider.name == "none":
        return
    try:
        health = provider.health()
        if not health.available:
            logger.info(
                "ai warm-up skipped: provider unavailable",
                extra={"provider": provider.name, "detail": health.detail},
            )
            return

        # A minimal generation is enough to force the weights into memory.
        provider.complete_text(
            system="Reply with the single word: ready",
            user="ready",
            max_tokens=5,
        )
        _warmed.set()
        logger.info(
            "ai model warmed", extra={"provider": provider.name, "model": provider.model}
        )
    except Exception as exc:  # noqa: BLE001 - warm-up must never break start-up
        logger.info(
            "ai warm-up did not complete",
            extra={"provider": provider.name, "reason": str(exc)[:200]},
        )


def warm_up_async() -> None:
    """Kick off warm-up without blocking application start-up."""
    if not settings.ai_enabled or settings.ai_provider == "none":
        return
    thread = threading.Thread(target=_warm, name="ai-warmup", daemon=True)
    thread.start()
