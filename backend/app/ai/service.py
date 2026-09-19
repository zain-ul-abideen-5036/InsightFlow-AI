"""The AI service: the only entry point the rest of the application uses.

Every function here follows the same contract:

    deterministic result in -> written result out, or the deterministic result
    unchanged if the AI layer could not be trusted

Failure is never propagated to the caller as an exception. If the provider is
down, slow, malformed, or produces text that violates the guardrails, the
function returns an :class:`AIOutcome` marked ``is_fallback`` with a clear
reason, and the product continues working with its computed answer.

That property is what lets the whole application run with AI switched off.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.ai.base import AIProvider
from app.ai.guardrails import GuardrailResult, collect_text, validate_response
from app.ai.prompts import (
    ANSWER_SYSTEM,
    INSIGHT_SYSTEM,
    INVESTIGATION_SYSTEM,
    REPORT_SYSTEM,
    build_answer_prompt,
    build_insight_prompt,
    build_investigation_prompt,
    build_report_prompt,
)
from app.ai.providers import get_provider
from app.ai.schemas import (
    AnswerResponse,
    InsightNarrative,
    InvestigationNarrative,
    ProviderHealth,
    ReportNarrative,
)
from app.analytics.executor import ExecutionResult
from app.analytics.investigation import Investigation
from app.analytics.types import Evidence
from app.core.errors import AIProviderError
from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass(slots=True)
class AIOutcome:
    """The result of an AI call, successful or not."""

    structured: dict[str, Any]
    is_fallback: bool
    provider: str = ""
    model: str = ""
    latency_ms: int | None = None
    error: str | None = None
    guardrail: dict[str, Any] | None = field(default=None)
    repaired: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "structured": self.structured,
            "is_fallback": self.is_fallback,
            "provider": self.provider,
            "model": self.model,
            "latency_ms": self.latency_ms,
            "error": self.error,
            "guardrail": self.guardrail,
            "repaired": self.repaired,
        }


def provider_health() -> ProviderHealth:
    """Never raises: a health check that throws is not a health check."""
    try:
        return get_provider().health()
    except Exception as exc:  # noqa: BLE001
        logger.warning("provider health check failed", extra={"reason": str(exc)})
        return ProviderHealth(
            available=False,
            provider="unknown",
            detail="The AI provider could not be checked.",
        )


def _run(
    *,
    system: str,
    user: str,
    schema: type,
    allowed_values: list[float],
    fallback: dict[str, Any],
    max_tokens: int = 900,
    provider: AIProvider | None = None,
) -> AIOutcome:
    """Generate, validate, guard, and fall back. The shared path for every call."""
    active = provider or get_provider()

    try:
        result = active.complete_json(
            system=system, user=user, schema=schema, max_tokens=max_tokens
        )
    except AIProviderError as exc:
        logger.info(
            "ai unavailable, using deterministic output",
            extra={"provider": active.name, "reason": str(exc)},
        )
        return AIOutcome(
            structured=fallback, is_fallback=True,
            provider=active.name, model=active.model, error=str(exc),
        )
    except Exception as exc:  # noqa: BLE001 - the AI layer must never break a request
        logger.exception("unexpected AI failure", extra={"provider": active.name})
        return AIOutcome(
            structured=fallback, is_fallback=True,
            provider=active.name, model=active.model,
            error="The AI layer failed unexpectedly.",
        )

    payload = result.data.model_dump()
    guard: GuardrailResult = validate_response(collect_text(result.data), allowed_values)

    if not guard.passed:
        logger.warning(
            "ai response rejected by guardrails",
            extra={
                "provider": active.name,
                "model": active.model,
                "unsupported_numbers": guard.unsupported_numbers[:5],
                "causal_sentences": len(guard.causal_sentences),
            },
        )
        return AIOutcome(
            structured=fallback,
            is_fallback=True,
            provider=active.name,
            model=active.model,
            latency_ms=result.latency_ms,
            error=f"The written explanation was rejected because it {guard.reason}.",
            guardrail=guard.to_dict(),
            repaired=result.repaired,
        )

    return AIOutcome(
        structured=payload,
        is_fallback=False,
        provider=active.name,
        model=active.model,
        latency_ms=result.latency_ms,
        guardrail=guard.to_dict(),
        repaired=result.repaired,
    )


# --------------------------------------------------------------------------- #
# Question answering
# --------------------------------------------------------------------------- #


def deterministic_answer(execution: ExecutionResult) -> dict[str, Any]:
    """A complete, correct answer written without any model involvement.

    This is not a degraded placeholder — it is the answer, assembled from the
    computed findings. The AI layer only ever makes it read better.
    """
    plan = execution.plan
    investigation = execution.investigation

    headline = execution.narrative_hint or "Here is what the data shows."
    observations: list[dict[str, Any]] = []

    if investigation is not None:
        for finding in (investigation.what_happened + investigation.where_it_happened)[:4]:
            observations.append(
                {
                    "statement": finding.statement,
                    "evidence_labels": [e.label for e in finding.evidence[:3]],
                }
            )
        for finding in investigation.supporting_evidence[:3]:
            observations.append(
                {
                    "statement": finding.statement,
                    "evidence_labels": [e.label for e in finding.evidence[:2]],
                }
            )
        explanations = [f.statement for f in investigation.possible_explanations[:4]]
        actions = list(investigation.recommended_checks[:4])
        confidence = investigation.confidence
    else:
        for item in execution.evidence[:5]:
            value = item.value
            rendered = f"{value:,.2f}" if isinstance(value, float) else str(value)
            observations.append(
                {
                    "statement": f"{item.label}: {rendered}"
                    + (f" ({item.period})" if item.period else ""),
                    "evidence_labels": [item.label],
                }
            )
        explanations = []
        actions = []
        confidence = "moderate" if execution.evidence else "low"

    summary_parts = [headline]
    if execution.insufficient:
        summary_parts.append(execution.insufficient[0])
    if not execution.evidence:
        summary_parts.append(
            "This dataset does not contain the information needed to answer that."
        )

    return {
        "headline": headline[:160] or "No answer available.",
        "summary": " ".join(part for part in summary_parts if part)[:900],
        "observations": observations[:6],
        "possible_explanations": explanations,
        "recommended_actions": actions or plan.suggestions[:3],
        "confidence": confidence,
    }


def explain_answer(
    execution: ExecutionResult,
    *,
    dataset_name: str = "",
    currency: str = "USD",
    notes: list[str] | None = None,
) -> AIOutcome:
    """Write a business-English answer over an executed plan."""
    fallback = deterministic_answer(execution)

    if not execution.evidence:
        # Nothing was computed, so there is nothing for the model to phrase.
        return AIOutcome(structured=fallback, is_fallback=True, error=None)

    prompt = build_answer_prompt(
        execution.plan.question,
        execution.evidence,
        deterministic_answer=execution.narrative_hint,
        dataset_name=dataset_name,
        currency=currency,
        notes=notes,
        insufficient=execution.insufficient,
        findings=execution.investigation.to_dict() if execution.investigation else None,
    )
    outcome = _run(
        system=ANSWER_SYSTEM,
        user=prompt,
        schema=AnswerResponse,
        allowed_values=execution.evidence_values(),
        fallback=fallback,
        max_tokens=700,
    )
    if not outcome.is_fallback:
        _resolve_evidence_labels(outcome.structured, execution.evidence)
        if execution.investigation is not None:
            # Confidence is an analytical judgement made by the engine.
            outcome.structured["confidence"] = execution.investigation.confidence
    return outcome


def _resolve_evidence_labels(payload: dict[str, Any], evidence: list[Evidence]) -> None:
    """Turn the list positions models often return back into real labels.

    Prompted for the label of an evidence item, a small model will frequently
    answer with its number in the list. Mapping those back keeps the citations
    usable instead of discarding an otherwise valid response.
    """
    labels = [item.label for item in evidence]
    for observation in payload.get("observations") or []:
        resolved: list[str] = []
        for raw in observation.get("evidence_labels") or []:
            text = str(raw).strip()
            if text.isdigit():
                index = int(text) - 1
                if 0 <= index < len(labels):
                    resolved.append(labels[index])
                    continue
            if text:
                resolved.append(text)
        observation["evidence_labels"] = resolved[:4]


# --------------------------------------------------------------------------- #
# Investigation
# --------------------------------------------------------------------------- #


def deterministic_investigation(investigation: Investigation) -> dict[str, Any]:
    return {
        "headline": investigation.headline[:160],
        "what_happened": " ".join(f.statement for f in investigation.what_happened)[:700]
        or "The analysis did not produce a description of this change.",
        "where_it_happened": " ".join(
            f.statement for f in investigation.where_it_happened
        )[:700],
        "possible_explanations": [
            f.statement for f in investigation.possible_explanations[:5]
        ],
        "recommended_checks": list(investigation.recommended_checks[:5]),
        "confidence": investigation.confidence,
    }


def narrate_investigation(
    investigation: Investigation, *, dataset_name: str = "", currency: str = "USD"
) -> AIOutcome:
    fallback = deterministic_investigation(investigation)
    evidence = investigation.all_evidence()
    if not evidence:
        return AIOutcome(structured=fallback, is_fallback=True)

    prompt = build_investigation_prompt(
        investigation.to_dict(), evidence, dataset_name=dataset_name, currency=currency
    )
    outcome = _run(
        system=INVESTIGATION_SYSTEM,
        user=prompt,
        schema=InvestigationNarrative,
        allowed_values=_values(evidence),
        fallback=fallback,
    )
    # Confidence is an analytical judgement, not a writing decision. Whatever the
    # model returns, the engine's assessment is authoritative.
    if not outcome.is_fallback:
        outcome.structured["confidence"] = investigation.confidence
    return outcome


# --------------------------------------------------------------------------- #
# Insight narratives
# --------------------------------------------------------------------------- #


def narrate_insight(card: dict[str, Any], *, currency: str = "USD") -> AIOutcome:
    fallback = {"narrative": card.get("summary", "")}
    evidence_values = [
        float(e["value"])
        for e in card.get("evidence", [])
        if isinstance(e.get("value"), (int, float)) and not isinstance(e.get("value"), bool)
    ]
    if not evidence_values:
        return AIOutcome(structured=fallback, is_fallback=True)

    return _run(
        system=INSIGHT_SYSTEM,
        user=build_insight_prompt(card, currency),
        schema=InsightNarrative,
        allowed_values=evidence_values,
        fallback=fallback,
        max_tokens=350,
    )


# --------------------------------------------------------------------------- #
# Reports
# --------------------------------------------------------------------------- #


def deterministic_report(
    summary: dict[str, Any], insights: list[dict[str, Any]]
) -> dict[str, Any]:
    headline = summary.get("headline", "")
    critical = [c for c in insights if c.get("severity") in {"critical", "high"}]

    sentences = [headline] if headline else []
    if critical:
        sentences.append(
            f"{len(critical)} finding(s) were graded high or critical and are listed below."
        )
    if summary.get("anomaly_count"):
        sentences.append(
            f"{summary['anomaly_count']} unusual period(s) were detected in this dataset."
        )
    sentences.append(
        f"The analysis covered {summary.get('row_count', 0):,} records."
    )

    return {
        "executive_summary": " ".join(sentences)[:1600],
        "key_points": [card.get("title", "") for card in insights[:6] if card.get("title")],
        "recommended_focus": [
            card.get("title", "") for card in critical[:4] if card.get("title")
        ],
    }


def narrate_report(
    business_name: str,
    period_label: str,
    summary: dict[str, Any],
    insights: list[dict[str, Any]],
    evidence: list[Evidence],
    *,
    currency: str = "USD",
) -> AIOutcome:
    fallback = deterministic_report(summary, insights)
    if not evidence:
        return AIOutcome(structured=fallback, is_fallback=True)

    return _run(
        system=REPORT_SYSTEM,
        user=build_report_prompt(
            business_name, period_label, summary, insights, evidence, currency
        ),
        schema=ReportNarrative,
        allowed_values=_values(evidence),
        fallback=fallback,
        max_tokens=1100,
    )


def _values(evidence: list[Evidence]) -> list[float]:
    return [
        float(e.value)
        for e in evidence
        if isinstance(e.value, (int, float)) and not isinstance(e.value, bool)
    ]
