"""Structured output schemas for the AI layer.

Model output is never trusted as prose. It must parse into one of these
pydantic models, and every field is constrained: lengths are bounded, lists are
capped, and enumerations are closed. A response that does not fit is rejected
and either repaired or discarded in favour of deterministic text.

The schemas are deliberately narrow. The model is asked to *phrase* findings the
analytics engine already produced — it is never given a field in which it could
introduce a new figure without that figure being checkable.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ConfidenceLevel = Literal["low", "moderate", "high"]

MAX_SENTENCE = 400
MAX_LIST = 6


class _Strict(BaseModel):
    """Reject unknown keys: a model inventing fields is a signal, not a nuisance."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Observation(_Strict):
    """A single stated fact, tied back to the evidence that supports it."""

    statement: str = Field(min_length=3, max_length=MAX_SENTENCE)
    evidence_labels: list[str] = Field(default_factory=list, max_length=MAX_LIST)


class AnswerResponse(_Strict):
    """The response to a business question in 'Ask InsightFlow'."""

    headline: str = Field(min_length=3, max_length=160)
    summary: str = Field(min_length=10, max_length=900)
    observations: list[Observation] = Field(default_factory=list, max_length=MAX_LIST)
    possible_explanations: list[str] = Field(default_factory=list, max_length=MAX_LIST)
    recommended_actions: list[str] = Field(default_factory=list, max_length=MAX_LIST)
    confidence: ConfidenceLevel = "moderate"

    @field_validator("possible_explanations", "recommended_actions", mode="before")
    @classmethod
    def _coerce_str_list(cls, value: object) -> object:
        # Small models often return a single string where a list was requested.
        if isinstance(value, str):
            return [value] if value.strip() else []
        return value

    @field_validator("possible_explanations", "recommended_actions")
    @classmethod
    def _bound_items(cls, value: list[str]) -> list[str]:
        return [item[:MAX_SENTENCE] for item in value if item and item.strip()]


class InvestigationNarrative(_Strict):
    """The written form of an anomaly or period-change investigation."""

    headline: str = Field(min_length=3, max_length=160)
    what_happened: str = Field(min_length=10, max_length=700)
    where_it_happened: str = Field(default="", max_length=700)
    possible_explanations: list[str] = Field(default_factory=list, max_length=MAX_LIST)
    recommended_checks: list[str] = Field(default_factory=list, max_length=MAX_LIST)
    confidence: ConfidenceLevel = "moderate"

    @field_validator("possible_explanations", "recommended_checks", mode="before")
    @classmethod
    def _coerce_str_list(cls, value: object) -> object:
        if isinstance(value, str):
            return [value] if value.strip() else []
        return value


class InsightNarrative(_Strict):
    """A one-paragraph rewrite of a single insight card."""

    narrative: str = Field(min_length=10, max_length=600)


class ReportNarrative(_Strict):
    """The executive summary of a business performance report."""

    executive_summary: str = Field(min_length=20, max_length=1600)
    key_points: list[str] = Field(default_factory=list, max_length=8)
    recommended_focus: list[str] = Field(default_factory=list, max_length=6)

    @field_validator("key_points", "recommended_focus", mode="before")
    @classmethod
    def _coerce_str_list(cls, value: object) -> object:
        if isinstance(value, str):
            return [value] if value.strip() else []
        return value


class ProviderHealth(BaseModel):
    """Whether the configured AI provider is usable right now."""

    available: bool
    provider: str
    model: str = ""
    detail: str = ""
    latency_ms: int | None = None
