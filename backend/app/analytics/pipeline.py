"""Full analysis pipeline.

Runs every applicable analysis over a confirmed dataset and returns sections,
metrics, insights, and anomalies ready to be persisted.

The pipeline reports progress through a callback after each stage, which is what
drives the honest progress display in the UI. The stages listed here are the
stages that actually run — nothing is shown to the user that is not real work.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from app.analytics.anomalies import AnomalyPoint, detect_anomalies, summarize_anomalies
from app.analytics.context import DatasetContext
from app.analytics.insights import (
    InsightCard,
    from_anomalies,
    from_concentration,
    from_contribution,
    from_customers,
    from_data_quality,
    from_metric_comparison,
    from_trend,
    rank_and_trim,
)
from app.analytics.metrics import (
    MetricResult,
    compare_periods,
    compute_metrics,
    customer_breakdown,
)
from app.analytics.segmentation import (
    breakdown,
    contribution_analysis,
    cross_segment,
    is_degenerate,
    margin_by_segment,
    top_and_bottom,
)
from app.analytics.timeseries import (
    TimeSeries,
    detect_seasonality,
    growth_table,
    last_two_periods,
    resample_metric,
)
from app.analytics.types import Grain, jsonable

ProgressCallback = Callable[[str, str, int], None]

# Ordered stages, surfaced verbatim in the analysis progress panel.
STAGES: list[tuple[str, str]] = [
    ("profiling", "Profiling columns"),
    ("metrics", "Calculating metrics"),
    ("trends", "Detecting trends"),
    ("segments", "Comparing segments"),
    ("anomalies", "Investigating anomalies"),
    ("insights", "Generating insights"),
]

METRIC_SERIES_KEYS = ("revenue", "profit", "orders", "customers", "units_sold", "avg_order_value")


@dataclass(slots=True)
class AnalysisOutput:
    sections: dict[str, Any] = field(default_factory=dict)
    metrics: dict[str, MetricResult] = field(default_factory=dict)
    insights: list[InsightCard] = field(default_factory=list)
    anomalies: list[AnomalyPoint] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return jsonable(
            {
                "sections": self.sections,
                "metrics": {k: m.to_dict() for k, m in self.metrics.items()},
                "insights": [i.to_dict() for i in self.insights],
                "anomalies": [a.to_dict() for a in self.anomalies],
                "summary": self.summary,
                "notes": self.notes,
            }
        )


def _noop(_stage: str, _label: str, _progress: int) -> None:
    return None


def run_analysis(
    ctx: DatasetContext,
    *,
    profile: dict[str, Any] | None = None,
    on_progress: ProgressCallback | None = None,
) -> AnalysisOutput:
    """Execute the full analysis. Each stage is independent and failure-isolated."""
    progress = on_progress or _noop
    output = AnalysisOutput()
    output.notes.extend(ctx.notes)
    profile = profile or {}

    total_stages = len(STAGES)

    def advance(index: int) -> None:
        key, label = STAGES[index]
        progress(key, label, int(index / total_stages * 100))

    # ------------------------------------------------------ 1. profiling
    advance(0)
    output.sections["dataset"] = {
        "row_count": ctx.row_count,
        "dataset_name": ctx.dataset_name,
        "currency": ctx.currency,
        "grain": ctx.grain.value,
        "derivations": ctx.derivations,
        "capabilities": profile.get("capabilities", {}),
        "quality_issues": profile.get("quality_issues", []),
        "date_min": profile.get("date_min"),
        "date_max": profile.get("date_max"),
        "span_days": profile.get("span_days"),
        "dimensions": list(ctx.dimensions().keys()),
        "measures": list(ctx.measures().keys()),
    }

    # -------------------------------------------------------- 2. metrics
    advance(1)
    overall = compute_metrics(ctx)
    output.sections["overview"] = {"metrics": {k: m.to_dict() for k, m in overall.items()}}

    current, previous, current_label, previous_label = last_two_periods(ctx, ctx.grain)
    comparison_available = not previous.empty

    if comparison_available:
        compared = compare_periods(
            ctx, current, previous,
            current_label=current_label, previous_label=previous_label,
        )
        output.metrics = compared
        output.sections["comparison"] = {
            "available": True,
            "current_period": current_label,
            "previous_period": previous_label,
            "grain": ctx.grain.value,
            "current_rows": len(current),
            "previous_rows": len(previous),
            "metrics": {k: m.to_dict() for k, m in compared.items()},
        }
    else:
        output.metrics = overall
        output.sections["comparison"] = {
            "available": False,
            "reason": (
                f"This dataset covers only one {ctx.grain.label[:-2]} period, so there is "
                "nothing to compare it with yet."
            ),
        }

    # --------------------------------------------------------- 3. trends
    advance(2)
    series_map: dict[str, TimeSeries] = {}
    series_payload: dict[str, Any] = {}
    for key in METRIC_SERIES_KEYS:
        series = resample_metric(ctx, key, ctx.grain)
        if not series.points and not series.sufficiency.ok:
            continue
        series_map[key] = series
        series_payload[key] = series.to_dict()

    output.sections["trends"] = {
        "grain": ctx.grain.value,
        "series": series_payload,
        "growth": {
            key: growth_table(series)
            for key, series in series_map.items()
            if key in {"revenue", "profit", "orders"} and series.sufficiency.ok
        },
        "seasonality": (
            detect_seasonality(series_map["revenue"]) if "revenue" in series_map else {}
        ),
    }

    # ------------------------------------------------------- 4. segments
    advance(3)
    dimensions = ctx.dimensions()
    breakdowns: dict[str, Any] = {}
    contributions: dict[str, Any] = {}
    movers: dict[str, Any] = {}
    margins: dict[str, Any] = {}
    breakdown_objects = []

    primary_metric = "revenue" if ctx.revenue_col else ("profit" if ctx.profit_col else "orders")

    degenerate: set[str] = set()
    for dimension in dimensions:
        result = breakdown(ctx, dimension, primary_metric)
        if result is None:
            continue
        breakdowns[dimension] = result.to_dict()
        breakdown_objects.append(result)

        if is_degenerate(result):
            # Still shown as a breakdown (users do want to see the split), but
            # excluded from change attribution and insights, where it would only
            # restate the definition of the metric.
            degenerate.add(dimension)
            continue

        if comparison_available:
            contribution = contribution_analysis(
                ctx, dimension, current, previous, primary_metric
            )
            if contribution is not None:
                contributions[dimension] = contribution.to_dict()
            mover = top_and_bottom(ctx, dimension, current, previous, primary_metric)
            if mover:
                movers[dimension] = mover

        margin = margin_by_segment(ctx, dimension)
        if margin:
            margins[dimension] = margin

    output.sections["segments"] = {
        "primary_metric": primary_metric,
        "breakdowns": breakdowns,
        "contributions": contributions,
        "movers": movers,
        "margins": margins,
        "uninformative_dimensions": sorted(degenerate),
        "matrix": (
            cross_segment(ctx, "product", "region", primary_metric)
            if {"product", "region"} <= set(dimensions)
            else None
        ),
    }

    customers = customer_breakdown(ctx)
    output.sections["customers"] = customers

    # ------------------------------------------------------ 5. anomalies
    advance(4)
    scan_grain = _anomaly_grain(ctx)
    anomaly_series = {
        key: resample_metric(ctx, key, scan_grain)
        for key in ("revenue", "orders", "customers", "units_sold", "avg_order_value")
    }
    anomaly_series = {k: v for k, v in anomaly_series.items() if v.sufficiency.ok and v.points}

    if anomaly_series:
        output.anomalies = detect_anomalies(ctx, anomaly_series)
        output.sections["anomalies"] = {
            "available": True,
            "grain": scan_grain.value,
            "items": [a.to_dict() for a in output.anomalies],
            "summary": summarize_anomalies(output.anomalies),
        }
    else:
        capability = profile.get("capabilities", {}).get("anomaly_detection", {})
        output.sections["anomalies"] = {
            "available": False,
            "items": [],
            "reason": capability.get(
                "reason",
                "There is not enough time-series history to establish what is normal.",
            ),
        }

    # ------------------------------------------------------- 6. insights
    advance(5)
    cards: list[InsightCard] = []

    if comparison_available:
        cards.extend(
            from_metric_comparison(ctx, output.metrics, current_label, previous_label)
        )
        for dimension in contributions:
            contribution = contribution_analysis(
                ctx, dimension, current, previous, primary_metric
            )
            if contribution is not None:
                cards.extend(
                    from_contribution(ctx, contribution, current_label, previous_label)
                )

    for key in ("revenue", "profit", "orders"):
        if key in series_map:
            cards.extend(from_trend(ctx, series_map[key]))

    for result in breakdown_objects:
        if result.dimension in degenerate:
            continue
        cards.extend(from_concentration(ctx, result))

    cards.extend(from_anomalies(ctx, output.anomalies))
    cards.extend(from_customers(ctx, customers))
    cards.extend(from_data_quality(ctx, profile.get("quality_issues", [])))

    output.insights = rank_and_trim(cards)
    output.sections["insights"] = [card.to_dict() for card in output.insights]

    # ---------------------------------------------------------- summary
    output.summary = _build_summary(
        ctx, output, current_label, previous_label, comparison_available, primary_metric
    )
    progress("complete", "Analysis complete", 100)
    return output


def _anomaly_grain(ctx: DatasetContext) -> Grain:
    """The finest grain with enough periods to learn a normal range."""
    for candidate in (Grain.DAY, Grain.WEEK, Grain.MONTH):
        probe = resample_metric(ctx, "orders", candidate)
        if len(probe.points) >= 20:
            return candidate
    return ctx.grain


def _build_summary(
    ctx: DatasetContext,
    output: AnalysisOutput,
    current_label: str,
    previous_label: str,
    comparison_available: bool,
    primary_metric: str,
) -> dict[str, Any]:
    """A compact, deterministic headline for the dashboard and report."""
    summary: dict[str, Any] = {
        "headline": "",
        "current_period": current_label,
        "previous_period": previous_label,
        "grain": ctx.grain.value,
        "insight_count": len(output.insights),
        "anomaly_count": len(output.anomalies),
        "critical_count": sum(
            1 for card in output.insights if card.severity in {"critical", "high"}
        ),
        "row_count": ctx.row_count,
    }

    metric = output.metrics.get(primary_metric)
    if metric is not None:
        summary["primary_metric"] = metric.to_dict()
        if comparison_available and metric.change_pct is not None:
            direction = "fell" if metric.change_pct < 0 else "rose"
            summary["headline"] = (
                f"{metric.label} {direction} {abs(metric.change_pct):.1f}% in "
                f"{current_label} compared with {previous_label}."
            )
        else:
            summary["headline"] = (
                f"{metric.label} across this dataset totals {metric.value:,.2f}."
            )
    elif output.insights:
        summary["headline"] = output.insights[0].title

    if output.anomalies:
        summary["top_anomaly"] = output.anomalies[0].to_dict()

    return summary
