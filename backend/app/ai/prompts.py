"""Prompt construction for the AI layer.

Two principles shape every prompt here.

**The model receives evidence, not data.** Input is always a compact list of
already-computed figures with their labels, units, periods, and the calculation
that produced them. Raw rows are never sent.

**The rules are stated as prohibitions, not preferences.** Small local models
follow "never do X" far more reliably than "try to avoid X", so the constraints
are written as hard rules with a worked example of the distinction that matters
most: observation versus cause.
"""

from __future__ import annotations

import json
from typing import Any

from app.analytics.types import Evidence

# The one rule that defines the product, stated first in every system prompt.
_CORE_RULES = """You are the writing layer of a business analytics system called InsightFlow.

All analysis has already been performed. Your only job is to express the supplied
findings in clear, plain business English.

HARD RULES - these are not preferences:
1. Never state a number that does not appear in the EVIDENCE section. You may
   round a supplied number, and you may state the difference between two supplied
   numbers, but you must never introduce a new figure.
2. Never claim that one thing caused another. The analysis establishes that events
   occurred together, never that one produced the other.
   - Not allowed: "Revenue fell because Product B was out of stock."
   - Allowed:     "Product B was out of stock during the same period in which
                   revenue fell. The two coincide."
3. Never invent context that is not in the evidence: no competitors, no market
   conditions, no seasons, no customer motivations, no events.
4. If the evidence does not support an answer, say so plainly. An honest
   "the data does not show this" is a correct answer.
5. Write for a business owner with no analytics training. Avoid p-values,
   z-scores, standard deviations, and statistical jargon.
6. Be concise. Short sentences. No filler, no preamble, no sign-off.

Reply with a single valid JSON object and nothing else."""


def _format_evidence(evidence: list[Evidence], limit: int = 40) -> str:
    """Render the evidence bundle as a compact numbered list.

    A flat numbered list markedly outperforms nested JSON for small models:
    there is less structure to get lost in and each fact reads as one line.
    """
    if not evidence:
        return "(no figures were computed)"

    lines: list[str] = []
    for index, item in enumerate(evidence[:limit], start=1):
        value = item.value
        if isinstance(value, float):
            rendered = f"{value:,.2f}".rstrip("0").rstrip(".")
        elif isinstance(value, int):
            rendered = f"{value:,}"
        else:
            rendered = str(value)

        unit_suffix = {
            "percent": "%", "currency": " (currency)", "count": " (count)",
            "days": " days",
        }.get(item.unit.value, "")

        detail = f"{index}. {item.label}: {rendered}{unit_suffix}"
        if item.period:
            detail += f" | period: {item.period}"
        if item.calculation:
            detail += f" | how: {item.calculation}"
        if item.row_count:
            detail += f" | rows: {item.row_count:,}"
        lines.append(detail)

    if len(evidence) > limit:
        lines.append(f"... and {len(evidence) - limit} further figures.")
    return "\n".join(lines)


def _schema_block(fields: dict[str, str]) -> str:
    rendered = json.dumps(fields, indent=2)
    return f"Return exactly this JSON shape:\n{rendered}"


# --------------------------------------------------------------------------- #
# Question answering
# --------------------------------------------------------------------------- #

ANSWER_SYSTEM = _CORE_RULES + "\n\n" + _schema_block(
    {
        "headline": "<one sentence stating the direct answer>",
        "summary": "<2-4 sentences expanding on it>",
        "observations": [
            {
                "statement": "<one supporting fact>",
                "evidence_labels": ["<label of the evidence item used>"],
            }
        ],
        "possible_explanations": ["<hypothesis, clearly hedged>"],
        "recommended_actions": ["<something the owner can check or do>"],
        "confidence": "low | moderate | high",
    }
)


def build_answer_prompt(
    question: str,
    evidence: list[Evidence],
    *,
    deterministic_answer: str = "",
    dataset_name: str = "",
    currency: str = "USD",
    notes: list[str] | None = None,
    insufficient: list[str] | None = None,
    findings: dict[str, Any] | None = None,
) -> str:
    sections = [f"QUESTION:\n{question}"]

    if dataset_name:
        sections.append(f"DATASET: {dataset_name} (amounts are in {currency})")

    if deterministic_answer:
        # Anchoring the model to the computed answer is the single most
        # effective defence against a fluent-but-wrong summary.
        sections.append(
            "VERIFIED ANSWER (computed by the analytics engine - your summary must "
            f"agree with this):\n{deterministic_answer}"
        )

    if findings:
        # The engine already established where the movement came from and what
        # might explain it. Supplying those findings is what stops the model
        # from inventing its own attribution to fill the gap — which it did,
        # blaming customer count, when given only a flat list of figures.
        def _statements(key: str) -> str:
            items = findings.get(key) or []
            return "\n".join(f"- {item['statement']}" for item in items)

        where = _statements("where_it_happened")
        supporting = _statements("supporting_evidence")
        hypotheses = _statements("possible_explanations")

        if where:
            sections.append(f"WHERE THE MOVEMENT CAME FROM (established):\n{where}")
        if supporting:
            sections.append(f"OTHER MEASURED CHANGES:\n{supporting}")
        if hypotheses:
            sections.append(
                "PERMITTED EXPLANATIONS — your possible_explanations must be drawn "
                "from this list only. Do not propose any explanation of your own:\n"
                + hypotheses
            )
        checks = findings.get("recommended_checks") or []
        if checks:
            sections.append(
                "PERMITTED RECOMMENDATIONS — draw recommended_actions from these:\n"
                + "\n".join(f"- {c}" for c in checks)
            )

    sections.append(
        f"EVIDENCE (the only figures you may cite):\n{_format_evidence(evidence, limit=25)}"
    )

    if notes:
        sections.append("NOTES ABOUT THIS DATASET:\n" + "\n".join(f"- {n}" for n in notes))

    if insufficient:
        sections.append(
            "THE ANALYSIS COULD NOT COMPLETE THESE PARTS - say so if relevant:\n"
            + "\n".join(f"- {n}" for n in insufficient)
        )

    sections.append("Write the JSON response now.")
    return "\n\n".join(sections)


# --------------------------------------------------------------------------- #
# Investigation
# --------------------------------------------------------------------------- #

INVESTIGATION_SYSTEM = _CORE_RULES + "\n\n" + _schema_block(
    {
        "headline": "<one sentence naming what moved and by how much>",
        "what_happened": "<2-3 sentences of measured fact>",
        "where_it_happened": "<2-3 sentences naming the segments involved>",
        "possible_explanations": ["<hypothesis, clearly hedged>"],
        "recommended_checks": ["<a specific thing to verify>"],
        "confidence": "low | moderate | high",
    }
)


def build_investigation_prompt(
    investigation: dict[str, Any],
    evidence: list[Evidence],
    *,
    dataset_name: str = "",
    currency: str = "USD",
) -> str:
    def statements(key: str) -> str:
        items = investigation.get(key) or []
        return "\n".join(f"- {item['statement']}" for item in items) or "(none)"

    sections = [
        f"FINDING: {investigation.get('headline', '')}",
    ]
    if dataset_name:
        sections.append(f"DATASET: {dataset_name} (amounts are in {currency})")

    sections.extend(
        [
            f"WHAT THE ANALYSIS MEASURED:\n{statements('what_happened')}",
            f"WHERE THE MOVEMENT OCCURRED:\n{statements('where_it_happened')}",
            f"SUPPORTING SIGNALS:\n{statements('supporting_evidence')}",
            "HYPOTHESES THE ENGINE PROPOSED (keep these hedged; add none of your own):\n"
            + statements("possible_explanations"),
            "SUGGESTED CHECKS:\n"
            + ("\n".join(f"- {c}" for c in investigation.get("recommended_checks", [])) or "(none)"),
            f"CONFIDENCE ASSESSED BY THE ENGINE: {investigation.get('confidence', 'low')} "
            f"- {investigation.get('confidence_reason', '')}",
            f"EVIDENCE (the only figures you may cite):\n{_format_evidence(evidence)}",
        ]
    )

    caveats = investigation.get("caveats") or []
    if caveats:
        sections.append("CAVEATS TO PRESERVE:\n" + "\n".join(f"- {c}" for c in caveats))

    sections.append(
        "Rewrite this as clear business English. Use the engine's confidence value "
        "exactly. Write the JSON response now."
    )
    return "\n\n".join(sections)


# --------------------------------------------------------------------------- #
# Insight narrative
# --------------------------------------------------------------------------- #

INSIGHT_SYSTEM = _CORE_RULES + "\n\n" + _schema_block(
    {"narrative": "<2-3 sentences explaining why this matters to the business>"}
)


def build_insight_prompt(card: dict[str, Any], currency: str = "USD") -> str:
    evidence_lines = "\n".join(
        f"- {e['label']}: {e['value']} ({e['unit']})" for e in card.get("evidence", [])
    ) or "(none)"
    return (
        f"INSIGHT: {card.get('title', '')}\n"
        f"COMPUTED SUMMARY: {card.get('summary', '')}\n"
        f"SEVERITY: {card.get('severity', 'info')}\n"
        f"CURRENCY: {currency}\n\n"
        f"EVIDENCE (the only figures you may cite):\n{evidence_lines}\n\n"
        "Explain in 2-3 sentences why this matters to the business owner and what "
        "it would be sensible to look at next. Do not repeat the summary verbatim. "
        "Write the JSON response now."
    )


# --------------------------------------------------------------------------- #
# Report
# --------------------------------------------------------------------------- #

REPORT_SYSTEM = _CORE_RULES + "\n\n" + _schema_block(
    {
        "executive_summary": "<3-5 sentences a manager could read aloud in a meeting>",
        "key_points": ["<one short factual bullet>"],
        "recommended_focus": ["<where attention would be best spent next>"],
    }
)


def build_report_prompt(
    business_name: str,
    period_label: str,
    summary: dict[str, Any],
    insights: list[dict[str, Any]],
    evidence: list[Evidence],
    currency: str = "USD",
) -> str:
    insight_lines = "\n".join(
        f"- [{card.get('severity', 'info')}] {card.get('title', '')}: {card.get('summary', '')}"
        for card in insights[:10]
    ) or "(none)"

    return (
        f"BUSINESS: {business_name}\n"
        f"PERIOD: {period_label}\n"
        f"CURRENCY: {currency}\n"
        f"HEADLINE COMPUTED BY THE ENGINE: {summary.get('headline', '')}\n\n"
        f"FINDINGS:\n{insight_lines}\n\n"
        f"EVIDENCE (the only figures you may cite):\n{_format_evidence(evidence, limit=30)}\n\n"
        "Write an executive summary for the business owner. State what happened and "
        "what deserves attention. Do not speculate about causes. "
        "Write the JSON response now."
    )
