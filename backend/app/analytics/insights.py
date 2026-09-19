"""Insight generation.

Turns the output of a full analysis into ranked, self-contained insight cards.

Two rules govern everything here:

1. **Every card carries its evidence.** A card without a traceable figure is not
   generated at all. This is what makes "View evidence" possible on every card
   rather than on some of them.
2. **Only material findings become cards.** A dashboard that lists forty
   observations is as useless as one that lists none. Each candidate is scored
   on magnitude, reliability, and actionability, and only the strongest survive.

The ``summary`` text on every card is written by deterministic templates, so an
insight is complete and correct before any language model is involved. The AI
layer may later add a ``narrative``; it never replaces the summary.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from app.analytics.anomalies import AnomalyPoint
from app.analytics.context import DatasetContext, pct_change
from app.analytics.metrics import MetricResult
from app.analytics.segmentation import Breakdown
from app.analytics.timeseries import TimeSeries
from app.analytics.types import Evidence, EvidenceKind, Grain, Unit, jsonable

# A change smaller than this is noise in most businesses and should not be a card.
MATERIAL_CHANGE_PCT = 8.0
# Maximum cards shown for one analysis.
MAX_INSIGHTS = 14


@dataclass(slots=True)
class InsightCard:
    kind: str
    severity: str
    title: str
    summary: str
    metric_key: str | None = None
    # What the card is *about*: a KPI name, or a specific segment. Two cards can
    # share a metric and a direction and still be different insights.
    subject: str = ""
    metric_value: float | None = None
    comparison_value: float | None = None
    change_pct: float | None = None
    direction: str | None = None
    unit: str = "number"
    evidence: list[Evidence] = field(default_factory=list)
    evidence_refs: dict[str, Any] = field(default_factory=dict)
    score: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return jsonable(
            {
                "kind": self.kind,
                "severity": self.severity,
                "title": self.title,
                "summary": self.summary,
                "metric_key": self.metric_key,
                "subject": self.subject,
                "metric_value": self.metric_value,
                "comparison_value": self.comparison_value,
                "change_pct": self.change_pct,
                "direction": self.direction,
                "unit": self.unit,
                "evidence": [e.to_dict() for e in self.evidence],
                "evidence_refs": self.evidence_refs,
                "score": self.score,
            }
        )


def _severity_for_change(change_pct: float, *, favourable: bool) -> str:
    """Grade a movement, taking into account whether it is good or bad news.

    An unfavourable move is graded harder than a favourable one of the same
    size: a 25% revenue fall demands attention in a way a 25% rise does not.
    """
    magnitude = abs(change_pct)
    if favourable:
        if magnitude >= 30:
            return "medium"
        return "info" if magnitude < 15 else "low"
    if magnitude >= 40:
        return "critical"
    if magnitude >= 25:
        return "high"
    if magnitude >= 12:
        return "medium"
    return "low"


def _is_favourable(metric_key: str, change_pct: float) -> bool:
    """Is this movement good news? Cost and discount invert the usual reading."""
    lower_is_better = {"cost", "total_discount", "avg_discount"}
    if metric_key in lower_is_better:
        return change_pct < 0
    return change_pct > 0


def _score(change_pct: float, severity: str, reliability: float = 1.0) -> float:
    weights = {"critical": 1.0, "high": 0.8, "medium": 0.6, "low": 0.35, "info": 0.2}
    magnitude = min(abs(change_pct) / 60.0, 1.0)
    return round((0.55 * magnitude + 0.45 * weights.get(severity, 0.3)) * reliability, 4)


def _fmt(value: float, unit: Unit | str, currency: str = "USD") -> str:
    """Format a figure the way a business owner reads it."""
    unit_value = unit.value if isinstance(unit, Unit) else unit
    if unit_value == "percent":
        return f"{value:,.1f}%"
    if unit_value == "currency":
        return f"{currency} {value:,.2f}" if abs(value) < 1000 else f"{currency} {value:,.0f}"
    if unit_value in {"count", "days"}:
        return f"{value:,.0f}"
    return f"{value:,.2f}"


# --------------------------------------------------------------------------- #
# Generators
# --------------------------------------------------------------------------- #


def from_metric_comparison(
    ctx: DatasetContext,
    metrics: dict[str, MetricResult],
    current_label: str,
    previous_label: str,
) -> list[InsightCard]:
    """Cards for headline KPIs that moved materially against the prior period."""
    cards: list[InsightCard] = []
    headline_order = [
        "revenue", "profit", "profit_margin", "orders",
        "customers", "avg_order_value", "units_sold", "cost",
    ]

    for key in headline_order:
        metric = metrics.get(key)
        if metric is None or metric.change_pct is None or metric.previous_value is None:
            continue
        change = metric.change_pct
        if abs(change) < MATERIAL_CHANGE_PCT:
            continue

        favourable = _is_favourable(key, change)
        severity = _severity_for_change(change, favourable=favourable)
        verb = "increased" if change > 0 else "decreased"
        kind = "trend" if favourable else "risk"

        cards.append(
            InsightCard(
                kind=kind,
                severity=severity,
                title=f"{metric.label} {verb} {abs(change):.1f}%",
                summary=(
                    f"{metric.label} was {_fmt(metric.value, metric.unit, ctx.currency)} in "
                    f"{current_label}, compared with "
                    f"{_fmt(metric.previous_value, metric.unit, ctx.currency)} in "
                    f"{previous_label} — a change of {change:+.1f}%."
                ),
                metric_key=key,
                subject=f"kpi:{key}",
                metric_value=metric.value,
                comparison_value=metric.previous_value,
                change_pct=change,
                direction=metric.direction,
                unit=metric.unit.value,
                evidence=[
                    Evidence(
                        label=f"{metric.label} — {current_label}",
                        value=round(metric.value, 2),
                        unit=metric.unit,
                        kind=EvidenceKind.OBSERVATION,
                        calculation=metric.provenance.get("calculation", ""),
                        column=metric.provenance.get("column"),
                        period=current_label,
                        row_count=metric.provenance.get("rows_used"),
                    ),
                    Evidence(
                        label=f"{metric.label} — {previous_label}",
                        value=round(metric.previous_value, 2),
                        unit=metric.unit,
                        kind=EvidenceKind.COMPARISON,
                        calculation=metric.provenance.get("calculation", ""),
                        period=previous_label,
                    ),
                ],
                evidence_refs={
                    "metric_key": key,
                    "current_period": current_label,
                    "previous_period": previous_label,
                    "chart": "comparison",
                },
                # Headline KPIs answer "how is my business doing?" and must stay
                # visible even when an individual segment moved by more.
                score=_score(change, severity)
                + (0.30 if key in {"revenue", "profit"} else 0.0),
            )
        )
    return cards


def from_trend(ctx: DatasetContext, series: TimeSeries) -> list[InsightCard]:
    """A card describing the direction of the whole series, when one is clear."""
    summary = series.summary
    if not series.sufficiency.ok or not summary.get("trend"):
        return []

    trend = summary["trend"]
    strength = summary.get("trend_strength", 0.0)
    overall = summary.get("overall_change_pct")

    # A weak fit means the line wanders; calling that a trend would overstate it.
    if trend in {"flat", "mixed"} or overall is None or strength < 0.25:
        return []
    if abs(overall) < MATERIAL_CHANGE_PCT:
        return []

    favourable = _is_favourable(series.metric_key, overall)
    severity = _severity_for_change(overall, favourable=favourable)
    direction_word = "rising" if trend == "rising" else "falling"

    return [
        InsightCard(
            kind="trend",
            severity=severity,
            title=f"{series.metric_label} is {direction_word} over time",
            summary=(
                f"Across {summary['periods']} {series.grain.label} periods from "
                f"{summary['first_period']} to {summary['last_period']}, "
                f"{series.metric_label.lower()} moved from "
                f"{_fmt(summary['first_value'], series.unit, ctx.currency)} to "
                f"{_fmt(summary['last_value'], series.unit, ctx.currency)} "
                f"({overall:+.1f}%). {summary.get('trend_description', '')}"
            ),
            metric_key=series.metric_key,
            subject=f"trend:{series.metric_key}",
            metric_value=summary["last_value"],
            comparison_value=summary["first_value"],
            change_pct=overall,
            direction="up" if trend == "rising" else "down",
            unit=series.unit.value,
            evidence=[
                Evidence(
                    label=f"{series.metric_label} — {summary['first_period']}",
                    value=round(summary["first_value"], 2),
                    unit=series.unit,
                    kind=EvidenceKind.OBSERVATION,
                    calculation=f"{series.grain.label} aggregation",
                    period=summary["first_period"],
                ),
                Evidence(
                    label=f"{series.metric_label} — {summary['last_period']}",
                    value=round(summary["last_value"], 2),
                    unit=series.unit,
                    kind=EvidenceKind.OBSERVATION,
                    calculation=f"{series.grain.label} aggregation",
                    period=summary["last_period"],
                ),
                Evidence(
                    label="Trend consistency",
                    value=round(strength * 100, 1),
                    unit=Unit.PERCENT,
                    kind=EvidenceKind.STATISTICAL,
                    calculation=(
                        "how closely the periods follow a straight line "
                        "(100% = perfectly consistent)"
                    ),
                ),
            ],
            evidence_refs={
                "metric_key": series.metric_key,
                "grain": series.grain.value,
                "chart": "series",
            },
            score=_score(overall, severity, reliability=0.6 + 0.4 * strength),
        )
    ]


def from_contribution(
    ctx: DatasetContext, breakdown_result: Breakdown, current_label: str, previous_label: str
) -> list[InsightCard]:
    """Cards for segments that moved disproportionately against their size."""
    cards: list[InsightCard] = []
    if not breakdown_result.rows or breakdown_result.previous_total is None:
        return cards

    total_change = breakdown_result.total - breakdown_result.previous_total
    if abs(total_change) < 1e-9:
        return cards

    for row in breakdown_result.rows[:4]:
        if row.change is None or row.change_pct is None or row.contribution_pct is None:
            continue
        if abs(row.change_pct) < MATERIAL_CHANGE_PCT or abs(row.contribution_pct) < 15:
            continue
        # Ignore segments too small to matter regardless of percentage change.
        if breakdown_result.total and abs(row.value) < abs(breakdown_result.total) * 0.02:
            continue

        favourable = row.change > 0
        severity = _severity_for_change(row.change_pct, favourable=favourable)
        if favourable:
            kind = "opportunity"
        elif breakdown_result.dimension == "product":
            kind = "product"
        elif breakdown_result.dimension in {"region", "country", "city"}:
            kind = "geography"
        else:
            kind = "risk"
        verb = "grew" if favourable else "fell"

        cards.append(
            InsightCard(
                kind=kind,
                severity=severity,
                title=f"{row.name} {verb} {abs(row.change_pct):.1f}%",
                summary=(
                    f"{breakdown_result.metric_label} for {row.name} moved from "
                    f"{_fmt(row.previous_value or 0.0, breakdown_result.unit, ctx.currency)} in "
                    f"{previous_label} to {_fmt(row.value, breakdown_result.unit, ctx.currency)} in "
                    f"{current_label}. That accounts for {abs(row.contribution_pct):.0f}% of the "
                    f"overall change in {breakdown_result.metric_label.lower()}."
                ),
                metric_key=breakdown_result.metric_key,
                subject=f"segment:{breakdown_result.dimension}:{row.name}",
                metric_value=row.value,
                comparison_value=row.previous_value,
                change_pct=row.change_pct,
                direction="up" if favourable else "down",
                unit=breakdown_result.unit.value,
                evidence=[
                    Evidence(
                        label=f"{row.name} — {current_label}",
                        value=round(row.value, 2),
                        unit=breakdown_result.unit,
                        kind=EvidenceKind.OBSERVATION,
                        calculation=(
                            f"{breakdown_result.metric_label} grouped by "
                            f"{breakdown_result.dimension_column}"
                        ),
                        column=breakdown_result.dimension_column,
                        period=current_label,
                        row_count=row.row_count,
                        detail={"segment": row.name},
                    ),
                    Evidence(
                        label=f"{row.name} — {previous_label}",
                        value=round(row.previous_value or 0.0, 2),
                        unit=breakdown_result.unit,
                        kind=EvidenceKind.COMPARISON,
                        calculation=(
                            f"{breakdown_result.metric_label} grouped by "
                            f"{breakdown_result.dimension_column}"
                        ),
                        column=breakdown_result.dimension_column,
                        period=previous_label,
                    ),
                    Evidence(
                        label="Share of the overall change",
                        value=round(row.contribution_pct, 2),
                        unit=Unit.PERCENT,
                        kind=EvidenceKind.STATISTICAL,
                        calculation="segment change / total change x 100",
                    ),
                ],
                evidence_refs={
                    "dimension": breakdown_result.dimension,
                    "segment": row.name,
                    "metric_key": breakdown_result.metric_key,
                    "current_period": current_label,
                    "previous_period": previous_label,
                    "chart": "contribution",
                },
                score=_score(
                    row.change_pct, severity,
                    reliability=min(1.0, abs(row.contribution_pct) / 50.0),
                ),
            )
        )
    return cards


def from_concentration(ctx: DatasetContext, breakdown_result: Breakdown) -> list[InsightCard]:
    """A card when revenue depends on very few segments — a genuine business risk."""
    concentration = breakdown_result.concentration
    if not concentration or concentration.get("level") != "high":
        return []
    if concentration.get("segment_count", 0) < 3:
        return []

    top3 = concentration["top_3_share_pct"]
    return [
        InsightCard(
            kind="concentration",
            severity="medium",
            title=f"{breakdown_result.metric_label} is concentrated in a few {breakdown_result.dimension}s",
            summary=(
                f"The top 3 of {concentration['segment_count']} "
                f"{breakdown_result.dimension}s account for {top3:.1f}% of "
                f"{breakdown_result.metric_label.lower()}. Losing any one of them would have "
                "an outsized effect on the business."
            ),
            metric_key=breakdown_result.metric_key,
            subject=f"concentration:{breakdown_result.dimension}",
            metric_value=top3,
            unit="percent",
            evidence=[
                Evidence(
                    label=f"Share held by the top 3 {breakdown_result.dimension}s",
                    value=top3,
                    unit=Unit.PERCENT,
                    kind=EvidenceKind.STATISTICAL,
                    calculation="combined share of the three largest segments",
                    column=breakdown_result.dimension_column,
                ),
                Evidence(
                    label=f"Largest single {breakdown_result.dimension}",
                    value=concentration["top_1_share_pct"],
                    unit=Unit.PERCENT,
                    kind=EvidenceKind.STATISTICAL,
                    calculation="share of the largest segment",
                    column=breakdown_result.dimension_column,
                ),
            ],
            evidence_refs={
                "dimension": breakdown_result.dimension,
                "metric_key": breakdown_result.metric_key,
                "chart": "breakdown",
            },
            score=_score(top3 - 50, "medium"),
        )
    ]


def from_anomalies(ctx: DatasetContext, anomalies: list[AnomalyPoint]) -> list[InsightCard]:
    """Cards for the most severe unusual periods."""
    cards: list[InsightCard] = []
    for anomaly in anomalies[:3]:
        if anomaly.severity in {"low", "info"}:
            continue
        also = anomaly.context.get("also_affected") or []
        corroboration = (
            f" {', '.join(x['metric_label'] for x in also)} moved at the same time."
            if also else ""
        )
        cards.append(
            InsightCard(
                kind="anomaly",
                severity=anomaly.severity,
                title=f"Unusual {anomaly.metric_label.lower()} on {anomaly.period}",
                summary=(
                    f"{anomaly.metric_label} was "
                    f"{_fmt(anomaly.observed, Unit.CURRENCY if anomaly.metric_key in {'revenue', 'profit', 'cost'} else Unit.COUNT, ctx.currency)}, "
                    f"{abs(anomaly.deviation_pct):.1f}% "
                    f"{'above' if anomaly.direction == 'up' else 'below'} the expected "
                    f"{_fmt(anomaly.expected, Unit.CURRENCY if anomaly.metric_key in {'revenue', 'profit', 'cost'} else Unit.COUNT, ctx.currency)}."
                    f"{corroboration}"
                ),
                metric_key=anomaly.metric_key,
                subject=f"anomaly:{anomaly.metric_key}:{anomaly.period}",
                metric_value=anomaly.observed,
                comparison_value=anomaly.expected,
                change_pct=anomaly.deviation_pct,
                direction=anomaly.direction,
                unit="currency" if anomaly.metric_key in {"revenue", "profit", "cost"} else "count",
                evidence=[
                    Evidence(
                        label=f"Observed {anomaly.metric_label.lower()}",
                        value=round(anomaly.observed, 2),
                        unit=Unit.CURRENCY if anomaly.metric_key in {"revenue", "profit", "cost"} else Unit.COUNT,
                        kind=EvidenceKind.OBSERVATION,
                        calculation=f"{anomaly.metric_key} for {anomaly.period}",
                        period=anomaly.period,
                    ),
                    Evidence(
                        label="Expected range midpoint",
                        value=round(anomaly.expected, 2),
                        unit=Unit.CURRENCY if anomaly.metric_key in {"revenue", "profit", "cost"} else Unit.COUNT,
                        kind=EvidenceKind.STATISTICAL,
                        calculation=anomaly.context.get("explanation", anomaly.method),
                        period=anomaly.period,
                    ),
                ],
                evidence_refs={
                    "metric_key": anomaly.metric_key,
                    "period": anomaly.period,
                    "grain": anomaly.grain,
                    "chart": "anomaly",
                },
                score=anomaly.score,
            )
        )
    return cards


def from_customers(ctx: DatasetContext, summary: dict[str, Any]) -> list[InsightCard]:
    """Cards about customer concentration and repeat behaviour."""
    cards: list[InsightCard] = []
    if not summary:
        return cards

    top_share = summary.get("top_10pct_revenue_share")
    if top_share is not None and top_share >= 50:
        cards.append(
            InsightCard(
                kind="customer",
                severity="medium" if top_share < 70 else "high",
                title=f"Top 10% of customers drive {top_share:.0f}% of revenue",
                summary=(
                    f"{summary.get('concentration_note', '')} A small group of customers "
                    "carries a large share of the business, so losing any of them would "
                    "have an outsized effect."
                ),
                metric_key="customer_concentration",
                metric_value=top_share,
                unit="percent",
                evidence=[
                    Evidence(
                        label="Revenue share held by the top 10% of customers",
                        value=top_share,
                        unit=Unit.PERCENT,
                        kind=EvidenceKind.STATISTICAL,
                        calculation="revenue of the top decile / total revenue x 100",
                        column=summary.get("customer_column"),
                    )
                ],
                evidence_refs={"chart": "customers"},
                score=_score(top_share - 40, "medium"),
            )
        )

    repeat_rate = summary.get("repeat_rate_pct")
    if repeat_rate is not None and summary.get("total_customers", 0) >= 20:
        if repeat_rate < 20:
            cards.append(
                InsightCard(
                    kind="customer",
                    severity="medium",
                    title=f"Only {repeat_rate:.0f}% of customers buy more than once",
                    summary=(
                        f"{summary['repeat_customers']:,} of {summary['total_customers']:,} "
                        "customers placed more than one order. Most revenue therefore "
                        "depends on finding new customers rather than on repeat business."
                    ),
                    metric_key="repeat_rate",
                    metric_value=repeat_rate,
                    unit="percent",
                    evidence=[
                        Evidence(
                            label="Repeat purchase rate",
                            value=repeat_rate,
                            unit=Unit.PERCENT,
                            kind=EvidenceKind.OBSERVATION,
                            calculation="customers with more than one order / total customers x 100",
                            column=summary.get("customer_column"),
                        )
                    ],
                    evidence_refs={"chart": "customers"},
                    score=_score(40 - repeat_rate, "medium"),
                )
            )
        elif repeat_rate >= 55:
            cards.append(
                InsightCard(
                    kind="customer",
                    severity="info",
                    title=f"{repeat_rate:.0f}% of customers buy more than once",
                    summary=(
                        f"{summary['repeat_customers']:,} of {summary['total_customers']:,} "
                        "customers placed more than one order, averaging "
                        f"{summary.get('avg_orders_per_customer', 0):.1f} orders each."
                    ),
                    metric_key="repeat_rate",
                    metric_value=repeat_rate,
                    unit="percent",
                    evidence=[
                        Evidence(
                            label="Repeat purchase rate",
                            value=repeat_rate,
                            unit=Unit.PERCENT,
                            kind=EvidenceKind.OBSERVATION,
                            calculation="customers with more than one order / total customers x 100",
                            column=summary.get("customer_column"),
                        )
                    ],
                    evidence_refs={"chart": "customers"},
                    score=_score(repeat_rate - 40, "info"),
                )
            )
    return cards


def from_data_quality(ctx: DatasetContext, issues: list[dict[str, Any]]) -> list[InsightCard]:
    """Cards for data problems serious enough to distort the analysis itself."""
    cards: list[InsightCard] = []
    for issue in issues:
        if issue.get("severity") not in {"high", "medium"}:
            continue
        cards.append(
            InsightCard(
                kind="data_quality",
                severity=issue["severity"],
                title=issue["title"],
                summary=issue["detail"],
                evidence=[
                    Evidence(
                        label=issue["title"],
                        value=issue.get("kind", "data quality"),
                        unit=Unit.NUMBER,
                        kind=EvidenceKind.DATA_QUALITY,
                        calculation="detected during dataset profiling",
                        column=issue.get("column"),
                    )
                ],
                evidence_refs={"chart": "dataset", "column": issue.get("column")},
                score=0.45 if issue["severity"] == "high" else 0.3,
            )
        )
    return cards[:2]


def rank_and_trim(cards: list[InsightCard], limit: int = MAX_INSIGHTS) -> list[InsightCard]:
    """Order by importance and remove near-duplicates.

    Without de-duplication, a single revenue decline can produce a KPI card, a
    trend card, and a contribution card that all say the same thing.
    """
    ordered = sorted(cards, key=lambda c: c.score, reverse=True)
    kept: list[InsightCard] = []
    seen: set[tuple[str, str]] = set()

    for card in ordered:
        signature = (card.kind, card.subject or card.title.lower())
        if signature in seen:
            continue
        # Same metric, same direction, same subject is genuinely one insight --
        # but a segment card and a headline KPI card have different subjects and
        # must both survive.
        near_duplicate = any(
            other.metric_key == card.metric_key
            and other.metric_key is not None
            and other.direction == card.direction
            and other.kind == card.kind
            and other.subject == card.subject
            for other in kept
        )
        if near_duplicate:
            continue
        seen.add(signature)
        kept.append(card)
        if len(kept) >= limit:
            break
    return kept
