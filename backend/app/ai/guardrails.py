"""Guardrails on AI-generated text.

This module exists because of one product promise: **the AI may explain the
evidence, but it may not add to it.** A language model asked to summarise
financial findings will occasionally produce a figure that appears nowhere in
its input, or promote a coincidence to a cause. Both are unacceptable in a
product a business owner uses to make decisions.

Two checks run on every generated response:

``check_numbers``
    Extracts every numeric token from the text and matches it against the
    evidence bundle. Anything unmatched is a fabrication.

``check_causal_language``
    Flags unhedged causal claims ("caused", "because of", "due to") that the
    analytics layer never asserted, since it only ever establishes co-occurrence.

A response that fails is rejected. The caller then falls back to the
deterministic summary, which is always correct if less fluent. We would rather
show plainer prose than a plausible falsehood.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# Numbers as they appear in prose: 1,234.56 · 18.4% · -12 · 0.5
_NUMBER_RE = re.compile(r"-?\d[\d,]*(?:\.\d+)?")

# Dates, removed before any number is extracted.
#
# Without this, "2026-03-14" is read as three figures — 2026, -3 and -14. The
# year is exempt as a year, but -3 and -14 are not, so they are reported as
# fabricated. The effect is severe and completely silent: every anomaly, every
# period comparison, and every investigation carries an ISO date, so the
# guardrail rejected essentially any response that named *when* something
# happened, and the product fell back to deterministic prose while reporting
# that the model had invented figures it never mentioned.
#
# Ordering matters: the longest forms match first so a timestamp is not
# half-consumed by the date pattern inside it.
_MONTHS = (
    "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"
    "|January|February|March|April|June|July|August|September|October"
    "|November|December"
)

_DATE_RE = re.compile(
    rf"""
    \d{{4}}-\d{{2}}-\d{{2}}(?:[T ]\d{{2}}:\d{{2}}(?::\d{{2}})?(?:\.\d+)?(?:Z|[+-]\d{{2}}:?\d{{2}})?)?
  | \d{{4}}-\d{{2}}(?!\d)
  | \d{{1,2}}[/-]\d{{1,2}}[/-]\d{{2,4}}
  | \d{{2}}:\d{{2}}(?::\d{{2}})?
    # The labels the engine itself writes: "24 Aug 2026", "Aug 2026",
    # "Q3 2026". These appear in every period comparison, so leaving them to be
    # read as quantities would flag the product's own output.
  | \b\d{{1,2}}\s+(?:{_MONTHS})\.?\s+\d{{4}}\b
  | \b(?:{_MONTHS})\.?\s+\d{{1,2}},\s*\d{{4}}\b
  | \b(?:{_MONTHS})\.?\s+\d{{4}}\b
  | \bQ[1-4]\s+\d{{4}}\b
  | \b\d{{1,2}}\s+(?:{_MONTHS})\b
    """,
    re.VERBOSE | re.IGNORECASE,
)

# Figures a model may legitimately use without them being in the evidence:
# ordinals, small counts in phrases like "the top 3", dates, and percentages of
# 100 used rhetorically.
_ALLOWED_BARE = {0, 1, 2, 3, 4, 5, 10, 100}

# Tolerance when matching a quoted figure to the evidence. Models round, and
# "18.4%" against a computed 18.42% is correct reporting, not invention.
RELATIVE_TOLERANCE = 0.02
ABSOLUTE_TOLERANCE = 0.51

CAUSAL_PATTERNS = [
    r"\bcaused by\b",
    r"\bwas caused\b",
    r"\bcaused the\b",
    r"\bbecause of\b",
    r"\bdue to\b",
    r"\bresulted from\b",
    r"\bresulted in\b",
    r"\bled to\b",
    r"\bdrove the\b",
    r"\bis the reason\b",
    r"\bresponsible for\b",
    r"\bas a result of\b",
]

# Hedges that make a causal-sounding sentence acceptable, because they frame the
# claim as a hypothesis rather than a finding.
HEDGE_PATTERNS = [
    r"\bmay\b", r"\bmight\b", r"\bcould\b", r"\bpossibl", r"\bpotential",
    r"\blikely\b", r"\bappears\b", r"\bsuggests?\b", r"\bconsistent with\b",
    r"\bcoincide", r"\bassociated with\b", r"\bseems\b", r"\bprobabl",
    r"\bindicat", r"\bcannot confirm\b", r"\bnot confirm",
]

_CAUSAL_RE = re.compile("|".join(CAUSAL_PATTERNS), re.IGNORECASE)
_HEDGE_RE = re.compile("|".join(HEDGE_PATTERNS), re.IGNORECASE)
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


@dataclass(slots=True)
class GuardrailResult:
    passed: bool
    unsupported_numbers: list[float] = field(default_factory=list)
    causal_sentences: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "unsupported_numbers": self.unsupported_numbers,
            "causal_sentences": self.causal_sentences,
            "notes": self.notes,
        }

    @property
    def reason(self) -> str:
        parts: list[str] = []
        if self.unsupported_numbers:
            figures = ", ".join(f"{n:,g}" for n in self.unsupported_numbers[:4])
            parts.append(f"cited figures not present in the analysis ({figures})")
        if self.causal_sentences:
            parts.append("stated a cause the data does not establish")
        return "; ".join(parts) or "failed validation"


def strip_dates(text: str) -> str:
    """Blank out date and time literals, preserving length.

    Replacing with spaces rather than deleting keeps every other token at its
    original offset, so anything reported against this text still points at the
    right place in the original.
    """
    return _DATE_RE.sub(lambda m: " " * len(m.group(0)), text or "")


def extract_numbers(text: str) -> list[float]:
    """Every numeric token in the text, as floats.

    Dates are removed first: they are not claims about quantity, and reading
    their components as figures produces fabrications the model never wrote.
    """
    values: list[float] = []
    for match in _NUMBER_RE.finditer(strip_dates(text)):
        token = match.group(0).replace(",", "")
        try:
            values.append(float(token))
        except ValueError:
            continue
    return values


def _matches_any(value: float, allowed: list[float]) -> bool:
    """Does ``value`` correspond to a computed figure, allowing for rounding?"""
    for candidate in allowed:
        if candidate == value:
            return True
        diff = abs(candidate - value)
        if diff <= ABSOLUTE_TOLERANCE:
            return True
        scale = max(abs(candidate), abs(value))
        if scale and diff / scale <= RELATIVE_TOLERANCE:
            return True
        # Models legitimately restate a value at reduced precision: "USD 43,142"
        # may be written as "43.1 thousand" or "0.04 million".
        #
        # Only *downward* rescaling is permitted. Allowing the reverse would
        # mean an evidence value of 100 licenses the text "100,000" — and
        # because the tolerance is relative to the rescaled figure, it would
        # open a window thousands of units wide. That is precisely the
        # fabrication this check exists to catch.
        for factor in (1_000.0, 1_000_000.0):
            scaled = candidate / factor
            if abs(scaled - value) <= max(0.05, abs(scaled) * RELATIVE_TOLERANCE):
                return True
    return False


def check_numbers(text: str, allowed_values: list[float]) -> tuple[bool, list[float]]:
    """Verify every figure in the text traces to the evidence bundle."""
    unsupported: list[float] = []
    # Derived-but-legitimate figures: the absolute difference between any two
    # evidence values, and each value's magnitude. A model saying "a fall of
    # 19,193" when evidence holds 43,142 and 23,949 is reporting correctly.
    extended = list(allowed_values)
    for index, first in enumerate(allowed_values):
        extended.append(abs(first))
        for second in allowed_values[index + 1 :]:
            extended.append(abs(first - second))

    for value in extract_numbers(text):
        if value in _ALLOWED_BARE or abs(value) < 0.01:
            continue
        # Four-digit integers in a plausible range are almost always years.
        if float(value).is_integer() and 1900 <= value <= 2200:
            continue
        if not _matches_any(value, extended):
            unsupported.append(value)

    return (not unsupported), unsupported


def check_causal_language(text: str) -> tuple[bool, list[str]]:
    """Flag causal claims that are not hedged.

    Evaluated per sentence: a hedge two paragraphs away does not soften an
    unqualified assertion here.
    """
    offending: list[str] = []
    for sentence in _SENTENCE_SPLIT.split(text or ""):
        stripped = sentence.strip()
        if not stripped or not _CAUSAL_RE.search(stripped):
            continue
        if _HEDGE_RE.search(stripped):
            continue
        offending.append(stripped[:220])
    return (not offending), offending


def validate_response(
    text: str,
    allowed_values: list[float],
    *,
    allow_causal: bool = False,
) -> GuardrailResult:
    """Run both checks over a block of generated prose."""
    numbers_ok, unsupported = check_numbers(text, allowed_values)
    causal_ok, causal = (True, []) if allow_causal else check_causal_language(text)

    result = GuardrailResult(
        passed=numbers_ok and causal_ok,
        unsupported_numbers=unsupported,
        causal_sentences=causal,
    )
    if unsupported:
        result.notes.append(
            "The response referenced figures that were not produced by the analysis."
        )
    if causal:
        result.notes.append(
            "The response asserted a cause that the data only shows as a coincidence."
        )
    return result


def collect_text(payload: Any) -> str:
    """Flatten every string in a structured AI response into one block.

    Guardrails must see *all* generated prose, including items nested inside
    lists of explanations and recommendations.
    """
    parts: list[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, str):
            parts.append(node)
        elif isinstance(node, dict):
            for value in node.values():
                walk(value)
        elif isinstance(node, (list, tuple)):
            for value in node:
                walk(value)

    if hasattr(payload, "model_dump"):
        walk(payload.model_dump())
    else:
        walk(payload)
    return "\n".join(parts)
