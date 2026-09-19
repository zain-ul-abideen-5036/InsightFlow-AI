"""The investigation engine.

When a metric moves unexpectedly, this module works out *where* the movement
came from, assembles the supporting evidence, and proposes explanations that are
explicitly labelled as hypotheses.

The discipline it enforces is the product's core promise:

* Every figure it produces is computed here, deterministically.
* Coincidence is reported as coincidence. If product sales fell on the same days
  that inventory read zero, we say the two events *coincide* and note that this
  is consistent with the decline — we never say one caused the other.
* Confidence is derived from how much of the movement the evidence actually
  accounts for, not from how confident the prose sounds.

The AI layer later rewrites this into flowing text. It receives the output of
this module and is forbidden from adding to it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd

from app.analytics.anomalies import AnomalyPoint
from app.analytics.context import DatasetContext, pct_change, safe_ratio
from app.analytics.segmentation import contribution_analysis
from app.analytics.types import Evidence, EvidenceKind, Grain, Unit, jsonable

# Metrics denominated in money. Everything else is a count, a rate, or a ratio.
_CURRENCY_METRICS = {
    "revenue",
    "profit",
    "cost",
    "avg_order_value",
    "revenue_per_customer",
    "total_discount",
}
_PERCENT_METRICS = {"profit_margin", "avg_discount"}


def _metric_unit(ctx: DatasetContext, metric_key: str) -> Unit:
    """The unit a metric key is expressed in."""
    if metric_key in _CURRENCY_METRICS:
        return Unit.CURRENCY
    if metric_key in _PERCENT_METRICS:
        return Unit.PERCENT
    return Unit.COUNT


def money(value: float, unit: Unit, currency: str) -> str:
    """Render a figure with its currency, when it has one.

    "Revenue was 193,032.93" is ambiguous in a product people upload data to
    from any country, and it reads as unfinished next to a dashboard that says
    "$193K". Non-currency measures — order counts, percentages — are left bare,
    because "USD 980 orders" is worse than the ambiguity.
    """
    if unit is Unit.CURRENCY:
        return f"{currency} {value:,.2f}"
    if unit is Unit.PERCENT:
        return f"{value:,.2f}%"
    if unit in (Unit.COUNT, Unit.DAYS) and float(value).is_integer():
        return f"{int(value):,}"
    return f"{value:,.2f}"


# A segment must explain at least this share of a movement to be called a
# "largest contributor" rather than noise.
MATERIAL_CONTRIBUTION_PCT = 15.0
# Combined contribution above which we consider the movement well-explained.
WELL_EXPLAINED_PCT = 60.0


@dataclass(slots=True)
class Finding:
    """One typed statement, with the epistemic status made explicit."""

    kind: str          # observation | statistical | correlation | possible_explanation
    statement: str
    evidence: list[Evidence] = field(default_factory=list)
    weight: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "statement": self.statement,
            "evidence": [e.to_dict() for e in self.evidence],
            "weight": self.weight,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Finding":
        return cls(
            kind=str(data.get("kind", "observation")),
            statement=str(data.get("statement", "")),
            evidence=[Evidence.from_dict(e) for e in data.get("evidence") or []],
            weight=float(data.get("weight") or 0.0),
        )


@dataclass(slots=True)
class Investigation:
    headline: str
    what_happened: list[Finding] = field(default_factory=list)
    where_it_happened: list[Finding] = field(default_factory=list)
    supporting_evidence: list[Finding] = field(default_factory=list)
    possible_explanations: list[Finding] = field(default_factory=list)
    recommended_checks: list[str] = field(default_factory=list)
    confidence: str = "low"
    confidence_reason: str = ""
    explained_pct: float | None = None
    charts: dict[str, Any] = field(default_factory=dict)
    caveats: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return jsonable(
            {
                "headline": self.headline,
                "what_happened": [f.to_dict() for f in self.what_happened],
                "where_it_happened": [f.to_dict() for f in self.where_it_happened],
                "supporting_evidence": [f.to_dict() for f in self.supporting_evidence],
                "possible_explanations": [f.to_dict() for f in self.possible_explanations],
                "recommended_checks": self.recommended_checks,
                "confidence": self.confidence,
                "confidence_reason": self.confidence_reason,
                "explained_pct": self.explained_pct,
                "charts": self.charts,
                "caveats": self.caveats,
            }
        )

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Investigation":
        """Rebuild a persisted investigation.

        Used when the deterministic result was cached on a previous request and
        only the narrative still has to be produced. Rehydrating costs a JSON
        walk; recomputing would mean reloading the dataset and re-running the
        whole attribution, which is the expensive half.
        """
        findings = lambda key: [  # noqa: E731
            Finding.from_dict(f) for f in data.get(key) or []
        ]
        return cls(
            headline=str(data.get("headline", "")),
            what_happened=findings("what_happened"),
            where_it_happened=findings("where_it_happened"),
            supporting_evidence=findings("supporting_evidence"),
            possible_explanations=findings("possible_explanations"),
            recommended_checks=list(data.get("recommended_checks") or []),
            confidence=str(data.get("confidence") or "low"),
            confidence_reason=str(data.get("confidence_reason") or ""),
            explained_pct=data.get("explained_pct"),
            charts=data.get("charts") or {},
            caveats=list(data.get("caveats") or []),
        )

    def all_evidence(self) -> list[Evidence]:
        out: list[Evidence] = []
        for group in (
            self.what_happened,
            self.where_it_happened,
            self.supporting_evidence,
            self.possible_explanations,
        ):
            for finding in group:
                out.extend(finding.evidence)
        return out


def as_frame_timestamp(value: Any) -> pd.Timestamp:
    """A timestamp comparable with the dataset's own date column.

    Dates parsed out of a spreadsheet carry no timezone, so every date column in
    this engine is naive and is treated as UTC. A timestamp that has been
    through the database *is* timezone-aware, and pandas refuses to compare the
    two — ``TypeError: Invalid comparison between dtype=datetime64[ns] and
    Timestamp`` — rather than silently getting it wrong, which is the better of
    the two behaviours but still has to be handled somewhere.

    Here. Converted to UTC first, so the instant is preserved, then made naive
    to match the frame.
    """
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is not None:
        timestamp = timestamp.tz_convert("UTC").tz_localize(None)
    return timestamp


def _window_for(anomaly: AnomalyPoint, ctx: DatasetContext) -> tuple[pd.Timestamp, pd.Timestamp]:
    """The date range the anomalous period covers."""
    start = as_frame_timestamp(anomaly.occurred_at)
    grain = Grain(anomaly.grain)
    if grain is Grain.DAY:
        end = start + timedelta(days=1) - timedelta(seconds=1)
    elif grain is Grain.WEEK:
        end = start + timedelta(days=7) - timedelta(seconds=1)
    elif grain is Grain.MONTH:
        end = (start + pd.offsets.MonthBegin(1)) - timedelta(seconds=1)
    else:
        end = (start + pd.offsets.QuarterBegin(1)) - timedelta(seconds=1)
    return start, end


def _baseline_window(
    anomaly: AnomalyPoint, start: pd.Timestamp
) -> tuple[pd.Timestamp, pd.Timestamp]:
    """A comparable stretch immediately before the anomaly."""
    grain = Grain(anomaly.grain)
    span = {
        Grain.DAY: timedelta(days=14),
        Grain.WEEK: timedelta(days=56),
        Grain.MONTH: timedelta(days=90),
        Grain.QUARTER: timedelta(days=365),
    }[grain]
    return start - span, start - timedelta(seconds=1)


def investigate_anomaly(ctx: DatasetContext, anomaly: AnomalyPoint) -> Investigation:
    """Build a full evidence-backed investigation of a single anomalous period."""
    date_col = ctx.date_col
    investigation = Investigation(headline=anomaly.headline)

    if not date_col:
        investigation.caveats.append(
            "This dataset has no date column, so the period could not be isolated."
        )
        return investigation

    period_start, period_end = _window_for(anomaly, ctx)
    baseline_start, baseline_end = _baseline_window(anomaly, period_start)

    frame = ctx.dated()
    period_rows = frame[(frame[date_col] >= period_start) & (frame[date_col] <= period_end)]
    baseline_rows = frame[(frame[date_col] >= baseline_start) & (frame[date_col] <= baseline_end)]

    if period_rows.empty:
        investigation.caveats.append("No rows were found for this period.")
        return investigation

    # ---------------------------------------------------------------- what
    movement = "below" if anomaly.direction == "down" else "above"
    investigation.what_happened.append(
        Finding(
            kind=EvidenceKind.OBSERVATION.value,
            statement=(
                f"{anomaly.metric_label} on {anomaly.period} was "
                f"{money(anomaly.observed, _metric_unit(ctx, anomaly.metric_key), ctx.currency)}, "
                f"compared with an expected "
                f"{money(anomaly.expected, _metric_unit(ctx, anomaly.metric_key), ctx.currency)} "
                f"— {abs(anomaly.deviation_pct):.1f}% {movement} the expected range."
            ),
            evidence=[
                Evidence(
                    label=f"{anomaly.metric_label} on {anomaly.period}",
                    value=round(anomaly.observed, 2),
                    unit=Unit.CURRENCY if anomaly.metric_key in {"revenue", "profit", "cost", "avg_order_value"} else Unit.COUNT,
                    kind=EvidenceKind.OBSERVATION,
                    calculation=f"{anomaly.metric_key} aggregated over {anomaly.period}",
                    period=anomaly.period,
                    row_count=len(period_rows),
                ),
                Evidence(
                    label="Expected value",
                    value=round(anomaly.expected, 2),
                    unit=Unit.CURRENCY if anomaly.metric_key in {"revenue", "profit", "cost", "avg_order_value"} else Unit.COUNT,
                    kind=EvidenceKind.STATISTICAL,
                    calculation=anomaly.context.get("explanation", anomaly.method),
                    period=anomaly.period,
                ),
                Evidence(
                    label="Deviation",
                    value=round(anomaly.deviation_pct, 2),
                    unit=Unit.PERCENT,
                    kind=EvidenceKind.STATISTICAL,
                    calculation="(observed - expected) / |expected| x 100",
                    period=anomaly.period,
                ),
            ],
            weight=1.0,
        )
    )

    # ------------------------------------------------- supporting metrics
    movements: dict[str, float] = {}
    investigation.supporting_evidence.extend(
        _metric_movements(ctx, period_rows, baseline_rows, anomaly, movements)
    )

    # ---------------------------------------------------------------- where
    contributions, explained = _dimension_contributions(
        ctx, period_rows, baseline_rows, anomaly
    )
    investigation.where_it_happened.extend(contributions)
    investigation.explained_pct = explained

    # ------------------------------------------------ operational signals
    investigation.supporting_evidence.extend(
        _operational_signals(ctx, period_rows, baseline_rows, anomaly)
    )

    # ------------------------------------------------------- explanations
    explanations, checks = _build_hypotheses(
        ctx, investigation, anomaly, period_rows, baseline_rows, movements
    )
    investigation.possible_explanations.extend(explanations)
    investigation.recommended_checks.extend(checks)

    # --------------------------------------------------------- confidence
    investigation.confidence, investigation.confidence_reason = _assess_confidence(
        investigation, anomaly, len(period_rows), len(baseline_rows)
    )

    investigation.charts = {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "baseline_start": baseline_start.isoformat(),
        "baseline_end": baseline_end.isoformat(),
        "metric_key": anomaly.metric_key,
        "grain": anomaly.grain,
    }

    if len(baseline_rows) < 20:
        investigation.caveats.append(
            f"The comparison period contains only {len(baseline_rows)} rows, so these "
            "comparisons are based on a small sample."
        )
    if ctx.derivations:
        for metric, formula in ctx.derivations.items():
            investigation.caveats.append(
                f"{metric.capitalize()} is not a column in your file — it was calculated as {formula}."
            )

    return investigation


def _metric_movements(
    ctx: DatasetContext,
    period: pd.DataFrame,
    baseline: pd.DataFrame,
    anomaly: AnomalyPoint,
    movements: dict[str, float] | None = None,
) -> list[Finding]:
    """Compare every available metric between the period and its baseline.

    Baseline figures are scaled to the period's length so that a one-day
    anomaly is not compared against a fourteen-day total.
    """
    from app.analytics.metrics import compute_metrics

    findings: list[Finding] = []
    if baseline.empty:
        return findings

    period_days = max(1, _distinct_days(ctx, period))
    baseline_days = max(1, _distinct_days(ctx, baseline))
    scale = period_days / baseline_days

    period_metrics = compute_metrics(ctx, period)
    baseline_metrics = compute_metrics(ctx, baseline)

    for key, metric in period_metrics.items():
        prior = baseline_metrics.get(key)
        if prior is None:
            continue
        if key == anomaly.metric_key:
            # Already stated in "what happened"; repeating it as supporting
            # evidence makes the investigation look padded.
            continue
        # Rates and averages are already normalised; totals are not.
        is_rate = metric.unit in {Unit.PERCENT, Unit.RATIO} or key in {
            "avg_order_value", "profit_margin", "revenue_per_customer", "avg_discount",
        }
        expected = prior.value if is_rate else prior.value * scale
        change = pct_change(metric.value, expected)
        if change is None:
            continue
        if movements is not None:
            # Record every movement, including small ones: "orders barely moved"
            # is itself a finding the hypothesis layer needs.
            movements[key] = change
        if abs(change) < 5:
            continue

        findings.append(
            Finding(
                kind=EvidenceKind.COMPARISON.value,
                statement=(
                    f"{metric.label} was {money(metric.value, metric.unit, ctx.currency)} "
                    f"during this period, against a comparable "
                    f"{money(expected, metric.unit, ctx.currency)} in the preceding "
                    f"{baseline_days} days ({change:+.1f}%)."
                ),
                evidence=[
                    Evidence(
                        label=f"{metric.label} in period",
                        value=round(metric.value, 2),
                        unit=metric.unit,
                        kind=EvidenceKind.OBSERVATION,
                        calculation=metric.provenance.get("calculation", ""),
                        column=metric.provenance.get("column"),
                        period=anomaly.period,
                        row_count=len(period),
                    ),
                    Evidence(
                        label=f"{metric.label} baseline (scaled to period length)",
                        value=round(expected, 2),
                        unit=metric.unit,
                        kind=EvidenceKind.COMPARISON,
                        calculation=(
                            f"{metric.label} over the preceding {baseline_days} days"
                            + ("" if is_rate else f", scaled by {scale:.3f}")
                        ),
                        row_count=len(baseline),
                    ),
                ],
                weight=abs(change) / 100.0,
            )
        )

    findings.sort(key=lambda f: f.weight, reverse=True)
    return findings[:6]


def _distinct_days(ctx: DatasetContext, frame: pd.DataFrame) -> int:
    date_col = ctx.date_col
    if not date_col or frame.empty:
        return 0
    return int(frame[date_col].dt.normalize().nunique())


def _dimension_contributions(
    ctx: DatasetContext,
    period: pd.DataFrame,
    baseline: pd.DataFrame,
    anomaly: AnomalyPoint,
) -> tuple[list[Finding], float | None]:
    """Attribute the movement across each available dimension."""
    findings: list[Finding] = []
    best_explained: float | None = None
    ranked_dimensions: list[tuple[float, float]] = []

    period_days = max(1, _distinct_days(ctx, period))
    baseline_days = max(1, _distinct_days(ctx, baseline))
    scale = period_days / baseline_days

    for dimension in ctx.dimensions():
        result = contribution_analysis(
            ctx, dimension, period, baseline, anomaly.metric_key, limit=1000
        )
        if result is None or not result.rows:
            continue

        # Skip dimensions that cannot discriminate. When one segment holds
        # essentially the whole metric in both periods -- as order status does
        # for revenue, since only completed orders carry any -- attributing the
        # movement to it is a tautology, not a finding, and it would otherwise
        # dominate the "explained" figure and inflate confidence.
        if result.total:
            top_share = max(abs(row.value) for row in result.rows) / abs(result.total)
            if top_share >= 0.9:
                continue

        # Rescale the baseline so contributions describe the anomaly rather
        # than the difference in window length.
        scaled_rows = []
        for row in result.rows:
            prior = (row.previous_value or 0.0) * scale
            change = row.value - prior
            scaled_rows.append((row, prior, change))

        total_change = sum(change for _, _, change in scaled_rows)
        if abs(total_change) < 1e-9:
            continue

        scaled_rows.sort(key=lambda item: abs(item[2]), reverse=True)
        top = [
            (row, prior, change, change / total_change * 100)
            for row, prior, change in scaled_rows[:3]
            if abs(change / total_change * 100) >= MATERIAL_CONTRIBUTION_PCT
        ]
        if not top:
            continue

        combined = sum(share for _, _, _, share in top)
        leader, leader_prior, leader_change, leader_share = top[0]

        # How much of the movement a segment explains is only interesting
        # relative to how big that segment already was. A channel carrying 46%
        # of revenue that absorbs 42% of a decline simply moved with the
        # business and explains nothing. A product carrying 19% of revenue that
        # absorbs 62% of the decline is the story. That gap -- excess
        # contribution -- is what we rank dimensions by.
        baseline_total = sum(prior for _, prior, _ in scaled_rows)
        leader_prior_share = (
            abs(leader_prior) / abs(baseline_total) * 100 if baseline_total else 0.0
        )
        excess = abs(leader_share) - leader_prior_share
        unit = Unit.CURRENCY if anomaly.metric_key in {"revenue", "profit", "cost"} else Unit.COUNT

        segment_names = ", ".join(f"{row.name}" for row, _, _, _ in top)
        findings.append(
            Finding(
                kind=EvidenceKind.OBSERVATION.value,
                statement=(
                    f"By {result.dimension}, the largest movement came from {segment_names}. "
                    f"{leader.name} alone accounts for {abs(leader_share):.1f}% of the change "
                    # ASCII '-', not a typographic minus: the guardrail's number
                    # regex only recognises '-' as a sign, and U+2212 would make a
                    # negative figure read as its positive twin.
                    f"({'+' if leader_change >= 0 else '-'}"
                    f"{money(abs(leader_change), unit, ctx.currency)})."
                ),
                evidence=[
                    Evidence(
                        label=f"{row.name} — change in {result.metric_label.lower()}",
                        value=round(change, 2),
                        unit=unit,
                        kind=EvidenceKind.OBSERVATION,
                        calculation=(
                            f"{result.metric_label} in period minus baseline "
                            f"(scaled by {scale:.3f}), grouped by {result.dimension_column}"
                        ),
                        column=result.dimension_column,
                        period=anomaly.period,
                        row_count=row.row_count,
                        detail={
                            "segment": row.name,
                            "period_value": round(row.value, 2),
                            "baseline_value": round(prior, 2),
                            "change_pct": pct_change(row.value, prior),
                            "contribution_pct": round(share, 2),
                        },
                    )
                    for row, prior, change, share in top
                ],
                weight=max(excess, 0.0) / 100.0,
            )
        )
        ranked_dimensions.append((excess, abs(leader_share)))

    findings.sort(key=lambda f: f.weight, reverse=True)
    if ranked_dimensions:
        # Report the leader share of the most *informative* dimension, not the
        # highest number available across all of them.
        ranked_dimensions.sort(key=lambda item: item[0], reverse=True)
        best_explained = ranked_dimensions[0][1]
    return findings[:4], round(best_explained, 2) if best_explained is not None else None


def _operational_signals(
    ctx: DatasetContext,
    period: pd.DataFrame,
    baseline: pd.DataFrame,
    anomaly: AnomalyPoint,
) -> list[Finding]:
    """Look for inventory, status, and discount signals inside the period.

    These are the facts that turn "revenue fell" into something actionable. Each
    is reported as a coincidence in time, never as a cause.
    """
    findings: list[Finding] = []
    date_col = ctx.date_col

    # -- Inventory: zero stock recorded during the period ------------------
    inventory_col = ctx.inventory_col
    product_col = ctx.product_col
    if inventory_col and inventory_col in period.columns:
        stock = pd.to_numeric(period[inventory_col], errors="coerce")
        zero_stock = period[stock.fillna(1) <= 0]
        if not zero_stock.empty:
            if product_col and product_col in zero_stock.columns:
                affected = zero_stock[product_col].value_counts()
                names = ", ".join(str(n) for n in affected.head(3).index)
                days = (
                    int(zero_stock[date_col].dt.normalize().nunique())
                    if date_col else 0
                )
                findings.append(
                    Finding(
                        kind=EvidenceKind.OBSERVATION.value,
                        statement=(
                            f"Inventory records show zero available units on {days} "
                            f"day(s) in this period, affecting {names}."
                        ),
                        evidence=[
                            Evidence(
                                label=f"Days with zero recorded stock — {name}",
                                value=int(
                                    zero_stock[zero_stock[product_col] == name][date_col]
                                    .dt.normalize().nunique()
                                ),
                                unit=Unit.DAYS,
                                kind=EvidenceKind.OBSERVATION,
                                calculation=f"distinct dates where {inventory_col} <= 0",
                                column=inventory_col,
                                period=anomaly.period,
                                row_count=int(affected[name]),
                                detail={"product": str(name)},
                            )
                            for name in affected.head(3).index
                        ],
                        weight=0.9,
                    )
                )

    # -- Order status mix --------------------------------------------------
    status_col = ctx.status_col
    if status_col and status_col in period.columns and not baseline.empty:
        period_mix = period[status_col].value_counts(normalize=True)
        baseline_mix = baseline[status_col].value_counts(normalize=True)
        for status in period_mix.index:
            now = float(period_mix.get(status, 0.0)) * 100
            before = float(baseline_mix.get(status, 0.0)) * 100
            if before < 0.5 and now < 2:
                continue
            change = pct_change(now, before)
            # Only surface a meaningful shift in a non-trivial share.
            if change is None or abs(change) < 40 or max(now, before) < 3:
                continue
            findings.append(
                Finding(
                    kind=EvidenceKind.OBSERVATION.value,
                    statement=(
                        f"Orders with status '{status}' made up {now:.1f}% of this period, "
                        f"against {before:.1f}% in the comparison period."
                    ),
                    evidence=[
                        Evidence(
                            label=f"Share of '{status}' orders in period",
                            value=round(now, 2),
                            unit=Unit.PERCENT,
                            kind=EvidenceKind.OBSERVATION,
                            calculation=f"share of rows where {status_col} = '{status}'",
                            column=status_col,
                            period=anomaly.period,
                            row_count=int((period[status_col] == status).sum()),
                        ),
                        Evidence(
                            label=f"Share of '{status}' orders in comparison period",
                            value=round(before, 2),
                            unit=Unit.PERCENT,
                            kind=EvidenceKind.COMPARISON,
                            calculation=f"share of rows where {status_col} = '{status}'",
                            column=status_col,
                            row_count=int((baseline[status_col] == status).sum()),
                        ),
                    ],
                    weight=min(abs(change) / 100.0, 1.0),
                )
            )

    # -- Discounting -------------------------------------------------------
    discount_col = ctx.discount_col
    if discount_col and discount_col in period.columns and not baseline.empty:
        now = pd.to_numeric(period[discount_col], errors="coerce").mean()
        before = pd.to_numeric(baseline[discount_col], errors="coerce").mean()
        change = pct_change(float(now), float(before)) if pd.notna(now) and pd.notna(before) else None
        if change is not None and abs(change) >= 25:
            findings.append(
                Finding(
                    kind=EvidenceKind.OBSERVATION.value,
                    statement=(
                        f"Average discount was {now:,.2f} in this period against "
                        f"{before:,.2f} in the comparison period ({change:+.1f}%)."
                    ),
                    evidence=[
                        Evidence(
                            label="Average discount in period",
                            value=round(float(now), 2),
                            unit=Unit.NUMBER,
                            kind=EvidenceKind.OBSERVATION,
                            calculation=f"mean({discount_col})",
                            column=discount_col,
                            period=anomaly.period,
                            row_count=len(period),
                        )
                    ],
                    weight=min(abs(change) / 100.0, 1.0),
                )
            )

    findings.sort(key=lambda f: f.weight, reverse=True)
    return findings[:5]


def _build_hypotheses(
    ctx: DatasetContext,
    investigation: Investigation,
    anomaly: AnomalyPoint,
    period: pd.DataFrame,
    baseline: pd.DataFrame,
    movements: dict[str, float] | None = None,
) -> tuple[list[Finding], list[str]]:
    """Propose explanations, each explicitly framed as a hypothesis.

    The language here is load-bearing. "Coincide with" and "is consistent with"
    are used deliberately in place of "caused", because the data supports
    co-occurrence and nothing stronger.
    """
    hypotheses: list[Finding] = []
    checks: list[str] = []
    movements = movements or {}

    statements = " ".join(
        f.statement for f in investigation.supporting_evidence + investigation.where_it_happened
    ).lower()

    def moved(key: str, threshold: float = 6.0) -> bool:
        return abs(movements.get(key, 0.0)) >= threshold

    # -- Inventory coincidence --------------------------------------------
    stock_findings = [
        f for f in investigation.supporting_evidence if "zero available units" in f.statement
    ]
    if stock_findings and anomaly.direction == "down":
        affected = {
            str(e.detail.get("product"))
            for f in stock_findings
            for e in f.evidence
            if e.detail.get("product")
        }
        names = ", ".join(sorted(affected)) or "one or more products"
        hypotheses.append(
            Finding(
                kind="possible_explanation",
                statement=(
                    f"The period of zero recorded inventory for {names} coincides with the "
                    f"fall in {anomaly.metric_label.lower()}. An inventory shortage is "
                    "consistent with what the data shows, though the data alone cannot "
                    "confirm it as the cause."
                ),
                evidence=[e for f in stock_findings for e in f.evidence],
                weight=0.9,
            )
        )
        checks.append(
            f"Confirm whether {names} was actually unavailable to customers on those dates."
        )
        checks.append("Check whether a supplier delivery was late or a purchase order was missed.")

    # -- Demand vs basket size --------------------------------------------
    # Decided from the measured changes, not from the wording of generated
    # prose, which would be brittle and could silently invert the conclusion.
    orders_moved = moved("orders")
    aov_moved = moved("avg_order_value")
    if anomaly.metric_key == "revenue" and orders_moved and not aov_moved:
        hypotheses.append(
            Finding(
                kind="possible_explanation",
                statement=(
                    "Order volume moved while the average order value held steady, which "
                    "points to a change in the number of customers buying rather than in "
                    "what each customer spent."
                ),
                weight=0.6,
            )
        )
        checks.append("Review traffic, marketing spend, and campaign timing for this period.")
    elif anomaly.metric_key == "revenue" and aov_moved and not orders_moved:
        hypotheses.append(
            Finding(
                kind="possible_explanation",
                statement=(
                    "The number of orders was broadly unchanged while the average order "
                    "value moved, which points to a change in pricing, discounting, or "
                    "product mix rather than in demand."
                ),
                weight=0.6,
            )
        )
        checks.append("Review pricing and discount rules that were active in this period.")

    # -- Cancellations -----------------------------------------------------
    if "status '" in statements and ("cancel" in statements or "return" in statements
                                     or "pending" in statements):
        hypotheses.append(
            Finding(
                kind="possible_explanation",
                statement=(
                    "The mix of order statuses shifted in this period. If cancelled or "
                    "returned orders are excluded from revenue, that shift is consistent "
                    "with the movement observed."
                ),
                weight=0.7,
            )
        )
        checks.append("Check for payment, fulfilment, or delivery failures during this period.")

    # -- Discounting -------------------------------------------------------
    if "average discount" in statements or moved("avg_discount", 20.0) or moved("total_discount", 20.0):
        hypotheses.append(
            Finding(
                kind="possible_explanation",
                statement=(
                    "Discounting differed materially from the comparison period, which "
                    "affects revenue directly even when unit volumes are unchanged."
                ),
                weight=0.6,
            )
        )
        checks.append("Confirm which promotions ran during this period and their planned depth.")

    # -- Concentration -----------------------------------------------------
    if investigation.explained_pct and investigation.explained_pct >= WELL_EXPLAINED_PCT:
        top = investigation.where_it_happened[0] if investigation.where_it_happened else None
        if top:
            top_name = (
                str(top.evidence[0].detail.get("segment", "one segment"))
                if top.evidence else "one segment"
            )
            hypotheses.append(
                Finding(
                    kind="possible_explanation",
                    statement=(
                        f"The movement is concentrated rather than broad: {top_name} "
                        f"alone accounts for {investigation.explained_pct:.0f}% of it, "
                        "which is far more than its share of the business. The "
                        "explanation is more likely to be specific to it than to the "
                        "business as a whole."
                    ),
                    weight=0.8,
                )
            )
    elif investigation.explained_pct is not None and investigation.explained_pct < 40:
        hypotheses.append(
            Finding(
                kind="possible_explanation",
                statement=(
                    "The movement is spread broadly across segments rather than concentrated "
                    "in a few, which is more consistent with a general factor — seasonality, "
                    "traffic, or a site-wide issue — than with a product-specific one."
                ),
                weight=0.5,
            )
        )
        checks.append("Compare this period with the same period last year, if you have the data.")

    if not hypotheses:
        hypotheses.append(
            Finding(
                kind="possible_explanation",
                statement=(
                    "The data does not contain a clear signal explaining this movement. "
                    "The columns available do not cover inventory, order status, or "
                    "marketing activity, which are the usual places to look next."
                ),
                weight=0.2,
            )
        )
        checks.append(
            "Upload data covering inventory levels, traffic, or marketing spend to investigate further."
        )

    checks.append(f"Verify the underlying records for {anomaly.period} are complete and correct.")

    hypotheses.sort(key=lambda h: h.weight, reverse=True)
    # De-duplicate checks while preserving order.
    seen: set[str] = set()
    unique_checks = [c for c in checks if not (c in seen or seen.add(c))]
    return hypotheses[:4], unique_checks[:5]


def _assess_confidence(
    investigation: Investigation,
    anomaly: AnomalyPoint,
    period_rows: int,
    baseline_rows: int,
) -> tuple[str, str]:
    """Derive confidence from the evidence, not from the tone of the writing.

    Three things raise it: a large and statistically clear deviation, a movement
    that is well attributed to identifiable segments, and corroborating
    operational signals. Thin data lowers it regardless of the other two.
    """
    score = 0.0
    reasons: list[str] = []

    magnitude = abs(anomaly.deviation_pct)
    if magnitude >= 40:
        score += 0.30
        reasons.append("the deviation is large")
    elif magnitude >= 20:
        score += 0.20
        reasons.append("the deviation is clear")
    else:
        score += 0.08

    explained = investigation.explained_pct or 0.0
    if explained >= WELL_EXPLAINED_PCT:
        score += 0.35
        reasons.append(
            f"a single segment accounts for {explained:.0f}% of the movement"
        )
    elif explained >= 35:
        score += 0.20
        reasons.append("a substantial part of the movement traces to one segment")
    else:
        reasons.append("the movement is spread broadly rather than concentrated")

    corroborating = len(
        [
            f
            for f in investigation.supporting_evidence
            if "zero available units" in f.statement or "status" in f.statement
        ]
    )
    if corroborating >= 2:
        score += 0.25
        reasons.append("several independent signals point the same way")
    elif corroborating == 1:
        score += 0.15
        reasons.append("one supporting operational signal was found")

    if period_rows < 10 or baseline_rows < 30:
        score -= 0.20
        reasons.append("the number of records involved is small")

    if score >= 0.65:
        level = "high"
    elif score >= 0.38:
        level = "moderate"
    else:
        level = "low"

    return level, f"Confidence is {level} because " + ", and ".join(reasons) + "."


def investigate_metric_change(
    ctx: DatasetContext,
    metric_key: str,
    current: pd.DataFrame,
    previous: pd.DataFrame,
    current_label: str,
    previous_label: str,
) -> Investigation:
    """Investigate a period-over-period change (rather than a point anomaly).

    This backs the "Why did revenue decline last month?" question, reusing the
    same machinery as anomaly investigation so both paths produce identical
    evidence structures.
    """
    from app.analytics.metrics import compute_metrics

    current_metrics = compute_metrics(ctx, current)
    previous_metrics = compute_metrics(ctx, previous)

    metric = current_metrics.get(metric_key)
    prior = previous_metrics.get(metric_key)

    if metric is None or prior is None:
        investigation = Investigation(
            headline=f"{metric_key.replace('_', ' ').title()} could not be compared."
        )
        investigation.caveats.append(
            "This dataset does not contain the columns needed to calculate this metric "
            "for both periods."
        )
        return investigation

    change_pct = pct_change(metric.value, prior.value)
    direction = "down" if metric.value < prior.value else "up"
    change_text = f"{abs(change_pct):.1f}%" if change_pct is not None else "an unmeasurable amount"

    synthetic = AnomalyPoint(
        period=current_label,
        occurred_at=datetime(1970, 1, 1),
        metric_key=metric_key,
        metric_label=metric.label,
        observed=metric.value,
        expected=prior.value,
        lower_bound=None,
        upper_bound=None,
        deviation_pct=change_pct or 0.0,
        z_score=None,
        direction=direction,
        severity="medium",
        method="period_comparison",
        score=0.5,
        grain=ctx.grain.value,
        context={"explanation": f"Compared with {previous_label}."},
    )

    investigation = Investigation(
        headline=(
            f"{metric.label} {'fell' if direction == 'down' else 'rose'} {change_text} "
            f"in {current_label} compared with {previous_label}."
        )
    )

    unit = metric.unit
    investigation.what_happened.append(
        Finding(
            kind=EvidenceKind.COMPARISON.value,
            statement=(
                f"{metric.label} was {money(metric.value, unit, ctx.currency)} in "
                f"{current_label}, against {money(prior.value, unit, ctx.currency)} in "
                f"{previous_label} "
                f"({change_text} {'lower' if direction == 'down' else 'higher'})."
            ),
            evidence=[
                Evidence(
                    label=f"{metric.label} — {current_label}",
                    value=round(metric.value, 2),
                    unit=unit,
                    kind=EvidenceKind.OBSERVATION,
                    calculation=metric.provenance.get("calculation", ""),
                    column=metric.provenance.get("column"),
                    period=current_label,
                    row_count=len(current),
                ),
                Evidence(
                    label=f"{metric.label} — {previous_label}",
                    value=round(prior.value, 2),
                    unit=unit,
                    kind=EvidenceKind.OBSERVATION,
                    calculation=prior.provenance.get("calculation", ""),
                    column=prior.provenance.get("column"),
                    period=previous_label,
                    row_count=len(previous),
                ),
                Evidence(
                    label="Change",
                    value=round(metric.value - prior.value, 2),
                    unit=unit,
                    kind=EvidenceKind.COMPARISON,
                    calculation=f"{current_label} minus {previous_label}",
                ),
                Evidence(
                    label="Change (percent)",
                    value=round(change_pct, 2) if change_pct is not None else None,
                    unit=Unit.PERCENT,
                    kind=EvidenceKind.COMPARISON,
                    calculation="(current - previous) / |previous| x 100",
                ),
            ],
            weight=1.0,
        )
    )

    movements: dict[str, float] = {}
    investigation.supporting_evidence.extend(
        _metric_movements(ctx, current, previous, synthetic, movements)
    )
    contributions, explained = _dimension_contributions(ctx, current, previous, synthetic)
    investigation.where_it_happened.extend(contributions)
    investigation.explained_pct = explained
    investigation.supporting_evidence.extend(
        _operational_signals(ctx, current, previous, synthetic)
    )

    explanations, checks = _build_hypotheses(
        ctx, investigation, synthetic, current, previous, movements
    )
    investigation.possible_explanations.extend(explanations)
    investigation.recommended_checks.extend(checks)
    investigation.confidence, investigation.confidence_reason = _assess_confidence(
        investigation, synthetic, len(current), len(previous)
    )
    investigation.charts = {
        "metric_key": metric_key,
        "current_period": current_label,
        "previous_period": previous_label,
        "grain": ctx.grain.value,
    }

    for metric_name, formula in ctx.derivations.items():
        investigation.caveats.append(
            f"{metric_name.capitalize()} is not a column in your file — it was calculated as {formula}."
        )

    return investigation
