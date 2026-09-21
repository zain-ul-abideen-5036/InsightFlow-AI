"""AI provider abstraction.

The rest of the application depends on :class:`AIProvider` and nothing else.
Swapping a local Ollama model for a hosted OpenAI-compatible endpoint is an
environment-variable change, not a code change.

All the hard parts of talking to a language model live in the base class rather
than in each implementation:

* a budget for the whole operation, not just for each call
* bounded timeouts and a single bounded retry
* extracting JSON from output wrapped in prose or code fences
* pydantic validation, with one "repair" round trip when the first attempt is
  malformed
* typed, human-readable failures — an AI outage surfaces as a clear message and
  a deterministic fallback, never as a 500

Small local models (3B parameters and under) frequently emit *almost* valid
JSON. The extraction and repair logic here is what makes them usable in a
product rather than a demo.
"""

from __future__ import annotations

import json
import re
import time
from abc import ABC, abstractmethod
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from app.ai.schemas import ProviderHealth
from app.core.config import settings
from app.core.errors import AIProviderError, AIResponseError
from app.core.logging import get_logger

logger = get_logger(__name__)

SchemaT = TypeVar("SchemaT", bound=BaseModel)

# Matches ```json ... ``` and bare ``` ... ``` fences.
_FENCE_RE = re.compile(r"```(?:json|JSON)?\s*(.*?)\s*```", re.DOTALL)
# Trailing commas before a closing brace/bracket: the single most common
# JSON error from small models.
_TRAILING_COMMA_RE = re.compile(r",\s*([}\]])")


@dataclass(slots=True)
class JSONResult:
    data: BaseModel
    raw: str
    latency_ms: int
    model: str
    provider: str
    repaired: bool = False


@dataclass(slots=True)
class TextResult:
    text: str
    latency_ms: int
    model: str
    provider: str


def extract_json(text: str) -> str:
    """Pull a JSON object out of a model response.

    Handles fenced blocks, leading commentary ("Here is the JSON:"), trailing
    explanations, and trailing commas. Returns the best candidate substring; the
    caller is still responsible for parsing it.
    """
    if not text:
        raise AIResponseError("The AI provider returned an empty response.")

    candidate = text.strip()

    fenced = _FENCE_RE.search(candidate)
    if fenced:
        candidate = fenced.group(1).strip()

    # Take the outermost balanced object, ignoring braces inside strings.
    start = candidate.find("{")
    if start == -1:
        raise AIResponseError("The AI response did not contain any JSON.")

    depth = 0
    in_string = False
    escaped = False
    end = -1
    for index in range(start, len(candidate)):
        char = candidate[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = index + 1
                break

    if end == -1:
        raise AIResponseError("The AI response contained an incomplete JSON object.")

    return _TRAILING_COMMA_RE.sub(r"\1", candidate[start:end])


def parse_into(text: str, schema: type[SchemaT]) -> SchemaT:
    """Parse model output into ``schema`` or raise :class:`AIResponseError`."""
    payload = extract_json(text)
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise AIResponseError(
            "The AI response was not valid JSON.",
            details={"reason": str(exc)[:200]},
        ) from exc

    if not isinstance(data, dict):
        raise AIResponseError("The AI response was not a JSON object.")

    try:
        return schema.model_validate(data)
    except ValidationError as exc:
        raise AIResponseError(
            "The AI response did not match the expected structure.",
            details={"errors": exc.errors()[:5]},
        ) from exc


# --------------------------------------------------------------------------- #
# Request budget
# --------------------------------------------------------------------------- #

_deadline: ContextVar[float | None] = ContextVar("ai_deadline", default=None)


@contextmanager
def request_budget(seconds: float) -> Iterator[None]:
    """Bound everything done inside this block to ``seconds`` in total.

    A per-call timeout does not bound a request, because one logical operation
    is several calls: ``complete_json`` retries once and may then spend the
    same allowance again repairing malformed output, so four calls of
    ``AI_TIMEOUT_SECONDS`` is a reachable worst case rather than a pathological
    one. Measured here at 425 seconds for a single question.

    That matters because the caller is a browser behind a Next.js proxy, and
    Node stops waiting for response headers at 300 seconds. Overrun it and the
    user is told the service is unreachable while it is busy answering them.

    The deadline lives in a :class:`~contextvars.ContextVar` because providers
    are shared and analysis runs on a thread pool: a value set here belongs to
    this request and is invisible to every other one.
    """
    token = _deadline.set(time.monotonic() + seconds)
    try:
        yield
    finally:
        _deadline.reset(token)


def remaining_budget() -> float | None:
    """Seconds left in the current budget, or ``None`` when none is set."""
    deadline = _deadline.get()
    return None if deadline is None else deadline - time.monotonic()


class AIProvider(ABC):
    """Every provider implements exactly these three operations."""

    name: str = "base"

    @property
    @abstractmethod
    def model(self) -> str:
        """The model identifier currently configured."""

    @abstractmethod
    def health(self) -> ProviderHealth:
        """Check reachability. Must never raise."""

    @abstractmethod
    def _generate(self, system: str, user: str, *, json_mode: bool, max_tokens: int) -> str:
        """Single completion call. May raise :class:`AIProviderError`."""

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def complete_text(self, *, system: str, user: str, max_tokens: int = 700) -> TextResult:
        started = time.perf_counter()
        text = self._with_retry(system, user, json_mode=False, max_tokens=max_tokens)
        return TextResult(
            text=text.strip(),
            latency_ms=int((time.perf_counter() - started) * 1000),
            model=self.model,
            provider=self.name,
        )

    def complete_json(
        self,
        *,
        system: str,
        user: str,
        schema: type[SchemaT],
        max_tokens: int = 900,
    ) -> JSONResult:
        """Generate JSON matching ``schema``, repairing one malformed attempt."""
        started = time.perf_counter()
        raw = self._with_retry(system, user, json_mode=True, max_tokens=max_tokens)

        try:
            data = parse_into(raw, schema)
            repaired = False
        except AIResponseError as first_error:
            logger.warning(
                "ai response invalid, attempting repair",
                extra={"provider": self.name, "model": self.model, "reason": str(first_error)},
            )
            repair_prompt = _repair_prompt(raw, schema, str(first_error))
            repaired_raw = self._with_retry(
                _REPAIR_SYSTEM, repair_prompt, json_mode=True, max_tokens=max_tokens
            )
            # If the repair also fails, the original error is the honest one to
            # report, so we let this call's exception propagate with context.
            data = parse_into(repaired_raw, schema)
            raw = repaired_raw
            repaired = True

        return JSONResult(
            data=data,
            raw=raw,
            latency_ms=int((time.perf_counter() - started) * 1000),
            model=self.model,
            provider=self.name,
            repaired=repaired,
        )

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #

    def call_timeout(self) -> float:
        """How long this individual call may take.

        The lower of the per-call setting and whatever is left of the request
        budget, so a retry late in a request cannot start a fresh full-length
        wait that the caller will never see the result of.
        """
        per_call = float(settings.ai_timeout_seconds)
        remaining = remaining_budget()
        if remaining is None:
            return per_call
        if remaining <= 0:
            raise AIProviderError(
                "The AI model ran out of time for this request.",
                hint="Try a shorter question, a smaller model, or a hosted provider.",
            )
        return min(per_call, remaining)

    def _with_retry(self, system: str, user: str, *, json_mode: bool, max_tokens: int) -> str:
        attempts = max(1, settings.ai_max_retries + 1)
        last_error: Exception | None = None

        for attempt in range(attempts):
            # Checked before each attempt as well as inside the call: there is
            # no point starting a retry the caller has already stopped waiting
            # for, and failing now lets the deterministic fallback answer while
            # someone is still there to read it.
            remaining = remaining_budget()
            if remaining is not None and remaining <= 0:
                raise last_error or AIProviderError(
                    "The AI model ran out of time for this request.",
                    hint="Try a shorter question, a smaller model, or a hosted provider.",
                )
            try:
                return self._generate(
                    system, user, json_mode=json_mode, max_tokens=max_tokens
                )
            except AIProviderError as exc:
                last_error = exc
                logger.warning(
                    "ai call failed",
                    extra={
                        "provider": self.name,
                        "attempt": attempt + 1,
                        "attempts": attempts,
                        "reason": str(exc),
                    },
                )

        raise last_error or AIProviderError("The AI provider could not be reached.")


_REPAIR_SYSTEM = (
    "You convert malformed JSON into valid JSON. "
    "Reply with the corrected JSON object and nothing else. "
    "Never invent values: keep every value exactly as given, only fix the structure. "
    "If a required field is missing, use an empty string or an empty list."
)


def _repair_prompt(raw: str, schema: type[BaseModel], error: str) -> str:
    fields = ", ".join(schema.model_fields.keys())
    return (
        f"The following text should have been a JSON object with these fields: {fields}.\n"
        f"It failed validation with: {error}\n\n"
        f"Text:\n{raw[:4000]}\n\n"
        "Return only the corrected JSON object."
    )


class NullProvider(AIProvider):
    """Used when AI is disabled or unconfigured.

    It fails immediately and predictably rather than hanging on a connection
    attempt, so callers fall straight through to their deterministic output.
    """

    name = "none"

    @property
    def model(self) -> str:
        return ""

    def health(self) -> ProviderHealth:
        return ProviderHealth(
            available=False,
            provider=self.name,
            detail="AI features are turned off in this deployment.",
        )

    def _generate(self, system: str, user: str, *, json_mode: bool, max_tokens: int) -> str:
        raise AIProviderError(
            "AI features are turned off.",
            hint="Set AI_ENABLED=true and configure AI_PROVIDER to enable written explanations.",
        )
