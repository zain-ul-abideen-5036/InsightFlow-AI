"""The AI budget: one request, one bounded amount of model time.

A per-call timeout does not bound a request. `complete_json` retries once and
may then spend the same allowance again repairing malformed output, so a single
question could occupy the model for four times `AI_TIMEOUT_SECONDS`. Measured
at 425 seconds against a local model, which is past the 300 seconds Node waits
for response headers — so the browser was told the service was unreachable
while the backend was busy answering.

These tests pin the bound rather than the arithmetic behind it.
"""

from __future__ import annotations

import time

import pytest

from app.ai.base import (
    AIProvider,
    ProviderHealth,
    remaining_budget,
    request_budget,
)
from app.core.config import settings
from app.core.errors import AIProviderError


class RecordingProvider(AIProvider):
    """A provider that records the timeout it was handed, and can stall."""

    name = "recording"

    def __init__(self, *, sleep: float = 0.0, fail: bool = False) -> None:
        self.timeouts: list[float] = []
        self.calls = 0
        self._sleep = sleep
        self._fail = fail

    @property
    def model(self) -> str:
        return "recording-model"

    def health(self) -> ProviderHealth:
        return ProviderHealth(available=True, detail="fine")

    def _generate(self, system: str, user: str, *, json_mode: bool, max_tokens: int) -> str:
        self.calls += 1
        self.timeouts.append(self.call_timeout())
        if self._sleep:
            time.sleep(self._sleep)
        if self._fail:
            raise AIProviderError("simulated provider failure")
        return '{"ok": true}'


def test_no_budget_means_the_per_call_setting_applies() -> None:
    """Outside a request — a warm-up, a script — nothing changes."""
    provider = RecordingProvider()
    assert remaining_budget() is None
    provider.complete_text(system="s", user="u")
    assert provider.timeouts == [pytest.approx(settings.ai_timeout_seconds)]


def test_a_call_never_gets_longer_than_the_budget_has_left() -> None:
    provider = RecordingProvider()
    with request_budget(5.0):
        provider.complete_text(system="s", user="u")
    assert provider.timeouts[0] <= 5.0


def test_the_budget_does_not_inflate_a_shorter_per_call_timeout() -> None:
    """A generous budget must not override the per-call ceiling."""
    provider = RecordingProvider()
    with request_budget(10_000.0):
        provider.complete_text(system="s", user="u")
    assert provider.timeouts[0] == pytest.approx(settings.ai_timeout_seconds)


def test_an_exhausted_budget_stops_the_retry_rather_than_starting_it() -> None:
    """The point of the bound: no fresh full-length wait nobody will see."""
    provider = RecordingProvider(sleep=0.05, fail=True)
    with pytest.raises(AIProviderError):
        with request_budget(0.02):
            provider.complete_text(system="s", user="u")
    # One attempt, then the budget stops the retry that would otherwise follow.
    assert provider.calls == 1


def test_a_request_that_starts_with_no_time_left_fails_immediately() -> None:
    provider = RecordingProvider()
    with pytest.raises(AIProviderError):
        with request_budget(-1.0):
            provider.complete_text(system="s", user="u")
    assert provider.calls == 0


def test_the_budget_is_released_when_the_block_ends() -> None:
    with request_budget(5.0):
        assert remaining_budget() is not None
    assert remaining_budget() is None


def test_the_budget_is_released_even_when_the_call_raises() -> None:
    provider = RecordingProvider(fail=True)
    with pytest.raises(AIProviderError):
        with request_budget(5.0):
            provider.complete_text(system="s", user="u")
    assert remaining_budget() is None


def test_nested_budgets_restore_the_outer_one() -> None:
    with request_budget(100.0):
        outer = remaining_budget()
        assert outer is not None
        with request_budget(1.0):
            assert (remaining_budget() or 0) <= 1.0
        restored = remaining_budget()
        assert restored is not None and restored > 1.0


def test_one_request_budget_does_not_leak_into_another_thread() -> None:
    """Providers are shared and analysis runs on a thread pool."""
    import threading

    seen: list[float | None] = []

    def observe() -> None:
        seen.append(remaining_budget())

    with request_budget(30.0):
        worker = threading.Thread(target=observe)
        worker.start()
        worker.join()

    assert seen == [None]


def test_the_configured_budget_fits_under_the_proxy_ceiling() -> None:
    """The reason any of this exists.

    Node stops waiting for response headers at 300 seconds and a Next.js route
    handler cannot raise that. If this assertion ever fails, the product will
    start reporting slow-but-working answers as outages.
    """
    assert settings.ai_request_budget_seconds < 300


def test_the_per_call_timeout_is_not_larger_than_the_request_budget() -> None:
    assert settings.ai_timeout_seconds <= settings.ai_request_budget_seconds
