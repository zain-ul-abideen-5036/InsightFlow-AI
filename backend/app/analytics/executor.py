"""Plan execution and evidence-bundle assembly.

Runs an :class:`~app.analytics.planner.AnalysisPlan` step by step against the
dataset, producing two things:

``results``
    The full structured output of each step, used to render charts and tables
    and to back the "View evidence" panel.

``evidence``
    A compact, flattened list of every figure that was computed. This is the
    *only* numeric material the AI layer is allowed to see, and the guardrail
    pass later checks the model's prose against exactly this list.

Keeping those two separate matters: the UI wants rich nested structures, while
the model needs a short flat list it cannot misread. Deriving both from the same
execution guarantees they never disagree.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from app.analytics.anomalies import detect_anomalies, summarize_anomalies
from app.analytics.context import DatasetContext, pct_change
from app.analytics.investigation import Investigation, investigate_metric_change
from app.analytics.metrics import compare_periods, compute_metrics, customer_breakdown
from app.analytics.planner import AnalysisPlan, Intent, PlanStep
from app.analytics.profiling import MIN_PERIODS_FOR_TREND
from app.analytics.segmentation import (
    breakdown,
    contribution_analysis,
    margin_by_segment,
    top_and_bottom,
)
from app.analytics.timeseries import (
    detect_seasonality,
    growth_table,
    last_two_periods,
    resample_metric,
)
from app.analytics.types import Evidence, EvidenceKind, Grain, Unit, jsonable

MIN_PERIODS_FOR_FORECAST = 30


@dataclass(slots=True)
class ExecutionResult:
    plan: AnalysisPlan
    results: dict[str, Any] = field(default_factory=dict)
    evidence: list[Evidence] = field(default_factory=list)
    narrative_hint: str = ""
    investigation: Investigation | None = None
    insufficient: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return jsonable(
            {
                "plan": self.plan.to_dict(),
                "results": self.results,
                "evidence": [e.to_dict() for e in self.evidence],
                "narrative_hint": self.narrative_hint,
                "investigation": self.investigation.to_dict() if self.investigation else None,
                "insufficient": self.insufficient,
            }
        )

    def evidence_values(self) -> list[float]:
        """Every numeric figure that was computed. Used by the AI guardrails."""
        values: list[float] = []
        for item in self.evidence:
            if isinstance(item.value, (int, float)) and not isinstance(item.value, bool):
                values.append(float(item.value))
        return values


def _unit_for(ctx: DatasetContext, metric: str) -> Unit:
    if metric in {"revenue", "profit", "cost", "avg_order_value", "revenue_per_customer", "total_discount"}:
        return Unit.CURRENCY
    if metric in {"profit_margin", "avg_discount"}:
        return Unit.PERCENT
    return Unit.COUNT


def execute_plan(plan: AnalysisPlan, ctx: DatasetContext) -> ExecutionResult:
    """Run every step in the plan, collecting results and evidence."""
    result = ExecutionResult(plan=plan)
    if plan.unsupported_reason:
        result.insufficient.append(plan.unsupported_reason)
        return result

    for step in plan.steps:
        try:
            _run_step(step, plan, ctx, result)
        except Exception as exc:  # noqa: BLE001
            # One failing step must not lose the answer: record it and continue,
            # so the user still receives whatever the other steps produced.
            result.insufficient.append(
                f"The step '{step.description or step.operation}' could not be completed."
            )
            result.results.setdefault("errors", []).append(
                {"operation": step.operation, "reason": str(exc)[:300]}
            )

    result.narrative_hint = _narrative_hint(plan, result)
    return result


def _run_step(
    step: PlanStep, plan: AnalysisPlan, ctx: DatasetContext, result: ExecutionResult
) -> None:
    operation = step.operation
    grain = Grain(step.params.get("grain", plan.grain.value))
    metric = step.params.get("metric", plan.metric)

    # ---------------------------------------------------------- metrics
    if operation == "compute_metrics":
        metrics = compute_metrics(ctx)
        result.results["metrics"] = {k: m.to_dict() for k, m in metrics.items()}
        for key, m in metrics.items():
            result.evidence.append(
                Evidence(
                    label=m.label,
                    value=round(m.value, 2),
                    unit=m.unit,
                    kind=EvidenceKind.OBSERVATION,
                    calculation=m.provenance.get("calculation", ""),
                    column=m.provenance.get("column"),
                    period="entire dataset",
                    row_count=m.provenance.get("rows_used"),
                )
            )

    elif operation == "compare_periods":
        current, previous, current_label, previous_label = last_two_periods(ctx, grain)
        if previous.empty:
            result.insufficient.append(
                f"There is only one {grain.label[:-2]} period of data, so no comparison "
                "with a previous period is possible."
            )
            return
        metrics = compare_periods(
            ctx, current, previous,
            current_label=current_label, previous_label=previous_label,
        )
        result.results["comparison"] = {
            "current_period": current_label,
            "previous_period": previous_label,
            "grain": grain.value,
            "current_rows": len(current),
            "previous_rows": len(previous),
            "metrics": {k: m.to_dict() for k, m in metrics.items()},
        }
        for key, m in metrics.items():
            result.evidence.append(
                Evidence(
                    label=f"{m.label} in {current_label}",
                    value=round(m.value, 2),
                    unit=m.unit,
                    kind=EvidenceKind.OBSERVATION,
                    calculation=m.provenance.get("calculation", ""),
                    period=current_label,
                    row_count=len(current),
                )
            )
            if m.previous_value is not None:
                result.evidence.append(
                    Evidence(
                        label=f"{m.label} in {previous_label}",
                        value=round(m.previous_value, 2),
                        unit=m.unit,
                        kind=EvidenceKind.COMPARISON,
                        calculation=m.provenance.get("calculation", ""),
                        period=previous_label,
                        row_count=len(previous),
                    )
                )
            if m.change_pct is not None:
                result.evidence.append(
                    Evidence(
                        label=f"{m.label} change",
                        value=round(m.change_pct, 2),
                        unit=Unit.PERCENT,
                        kind=EvidenceKind.COMPARISON,
                        calculation=f"({current_label} - {previous_label}) / |{previous_label}| x 100",
                        period=f"{previous_label} to {current_label}",
                    )
                )

    # ------------------------------------------------------- time series
    elif operation == "resample_metric":
        series = resample_metric(ctx, metric, grain)
        result.results.setdefault("series", {})[metric] = series.to_dict()
        if not series.sufficiency.ok:
            result.insufficient.append(series.sufficiency.reason)
            return
        summary = series.summary
        unit = _unit_for(ctx, metric)
        for label, key in (
            ("Total", "total"), ("Average per period", "average"),
            ("Highest period value", "maximum"), ("Lowest period value", "minimum"),
        ):
            if summary.get(key) is not None:
                result.evidence.append(
                    Evidence(
                        label=f"{series.metric_label} — {label.lower()}",
                        value=round(float(summary[key]), 2),
                        unit=unit,
                        kind=EvidenceKind.OBSERVATION,
                        calculation=f"{key} of {grain.label} {series.metric_label.lower()}",
                        period=f"{summary.get('first_period')} to {summary.get('last_period')}",
                        row_count=summary.get("periods"),
                    )
                )
        if summary.get("overall_change_pct") is not None:
            result.evidence.append(
                Evidence(
                    label=f"{series.metric_label} change across the whole period",
                    value=round(float(summary["overall_change_pct"]), 2),
                    unit=Unit.PERCENT,
                    kind=EvidenceKind.COMPARISON,
                    calculation="last period versus first period",
                    period=f"{summary.get('first_period')} to {summary.get('last_period')}",
                )
            )
        if summary.get("peak_period"):
            result.evidence.append(
                Evidence(
                    label=f"{series.metric_label} peaked in",
                    value=str(summary["peak_period"]),
                    unit=Unit.NUMBER,
                    kind=EvidenceKind.OBSERVATION,
                    calculation="period with the highest value",
                )
            )

    elif operation == "growth_table":
        series = resample_metric(ctx, metric, grain)
        if not series.sufficiency.ok:
            result.insufficient.append(series.sufficiency.reason)
            return
        result.results.setdefault("growth", {})[metric] = growth_table(series)

    elif operation == "detect_seasonality":
        series = resample_metric(ctx, metric, grain)
        seasonality = detect_seasonality(series)
        result.results["seasonality"] = seasonality
        if seasonality.get("available") and seasonality.get("is_meaningful"):
            result.evidence.append(
                Evidence(
                    label=f"Strongest {seasonality['cycle']}",
                    value=str(seasonality["strongest"]),
                    unit=Unit.NUMBER,
                    kind=EvidenceKind.STATISTICAL,
                    calculation=f"average {metric} grouped by {seasonality['cycle']}",
                )
            )

    # ------------------------------------------------------ segmentation
    elif operation == "breakdown":
        dimension = step.params.get("dimension") or plan.dimension
        if not dimension:
            return
        result_breakdown = breakdown(ctx, dimension, metric)
        if result_breakdown is None:
            result.insufficient.append(
                f"This dataset has no usable '{dimension}' column to break the data down by."
            )
            return
        result.results.setdefault("breakdowns", {})[dimension] = result_breakdown.to_dict()
        unit = _unit_for(ctx, metric)

        # The largest segments, plus the smallest.
        #
        # "Which product performed worst?" is answered with the *last* row, so
        # covering only the head left that answer's figures untraceable. Ordered
        # and de-duplicated so a short breakdown does not emit the same segment
        # twice.
        ranked = result_breakdown.rows
        selected = ranked[:6] + ranked[-1:]
        seen: set[str] = set()
        for row in selected:
            if row.name in seen:
                continue
            seen.add(row.name)
            result.evidence.append(
                Evidence(
                    label=f"{result_breakdown.metric_label} — {row.name}",
                    value=round(row.value, 2),
                    unit=unit,
                    kind=EvidenceKind.OBSERVATION,
                    calculation=f"{metric} summed by {result_breakdown.dimension_column}",
                    column=result_breakdown.dimension_column,
                    row_count=row.row_count,
                    detail={"share_pct": row.share_pct, "segment": row.name},
                )
            )
            # The share is a computed figure in its own right, and the written
            # answer quotes it directly ("the largest product, at 21.5% of the
            # total"). Carrying it only inside `detail` meant it never reached
            # `evidence_values()`, with two consequences: the reader could not
            # trace the most prominent number in the sentence, and the numeric
            # guardrail rejected any model response that repeated it — throwing
            # away correct answers for citing a figure we had computed
            # ourselves.
            if row.share_pct is not None:
                result.evidence.append(
                    Evidence(
                        label=f"{row.name} — share of {result_breakdown.metric_label.lower()}",
                        value=round(float(row.share_pct), 2),
                        unit=Unit.PERCENT,
                        kind=EvidenceKind.STATISTICAL,
                        calculation=(
                            f"{row.name} {metric} / total {metric} x 100"
                        ),
                        column=result_breakdown.dimension_column,
                        row_count=row.row_count,
                        detail={"segment": row.name},
                    )
                )
        if result_breakdown.concentration.get("top_3_share_pct") is not None:
            result.evidence.append(
                Evidence(
                    label=f"Share of {result_breakdown.metric_label.lower()} from the top 3 {dimension}s",
                    value=result_breakdown.concentration["top_3_share_pct"],
                    unit=Unit.PERCENT,
                    kind=EvidenceKind.STATISTICAL,
                    calculation="combined share of the three largest segments",
                    column=result_breakdown.dimension_column,
                )
            )

    elif operation == "contribution_analysis":
        dimension = step.params.get("dimension") or plan.dimension
        if not dimension:
            return
        current, previous, current_label, previous_label = last_two_periods(ctx, grain)
        if previous.empty:
            return
        analysis = contribution_analysis(ctx, dimension, current, previous, metric)
        if analysis is None:
            return
        result.results.setdefault("contributions", {})[dimension] = analysis.to_dict()
        unit = _unit_for(ctx, metric)
        for row in analysis.rows[:5]:
            if row.change is None:
                continue
            result.evidence.append(
                Evidence(
                    label=f"{row.name} — change in {analysis.metric_label.lower()}",
                    value=round(row.change, 2),
                    unit=unit,
                    kind=EvidenceKind.COMPARISON,
                    calculation=(
                        f"{analysis.metric_label} in {current_label} minus {previous_label}, "
                        f"grouped by {analysis.dimension_column}"
                    ),
                    column=analysis.dimension_column,
                    period=f"{previous_label} to {current_label}",
                    row_count=row.row_count,
                    detail={
                        "segment": row.name,
                        "contribution_pct": row.contribution_pct,
                        "change_pct": row.change_pct,
                    },
                )
            )
            # "Nova Air Purifier alone accounts for 61.8% of the change" is the
            # sentence this whole analysis exists to produce, and its figure has
            # to be openable and verifiable like every other. Carried only in
            # `detail`, it was neither.
            if row.contribution_pct is not None:
                result.evidence.append(
                    Evidence(
                        label=f"{row.name} — share of the total change",
                        value=round(float(row.contribution_pct), 2),
                        unit=Unit.PERCENT,
                        kind=EvidenceKind.STATISTICAL,
                        calculation=(
                            f"{row.name} change / total change in "
                            f"{analysis.metric_label.lower()} x 100"
                        ),
                        column=analysis.dimension_column,
                        period=f"{previous_label} to {current_label}",
                        row_count=row.row_count,
                        detail={"segment": row.name},
                    )
                )

    elif operation == "top_and_bottom":
        dimension = step.params.get("dimension") or plan.dimension
        if not dimension:
            return
        current, previous, current_label, previous_label = last_two_periods(ctx, grain)
        if previous.empty:
            return
        movers = top_and_bottom(ctx, dimension, current, previous, metric)
        if not movers:
            return
        result.results.setdefault("movers", {})[dimension] = movers
        unit = _unit_for(ctx, metric)
        for bucket in ("growing", "declining"):
            for row in movers.get(bucket, [])[:3]:
                if row.get("change_pct") is None:
                    continue
                result.evidence.append(
                    Evidence(
                        label=f"{row['name']} — {analysis_label(bucket)} in {movers['metric_label'].lower()}",
                        value=round(float(row["change_pct"]), 2),
                        unit=Unit.PERCENT,
                        kind=EvidenceKind.COMPARISON,
                        calculation=f"percentage change from {previous_label} to {current_label}",
                        column=movers.get("dimension_column"),
                        period=f"{previous_label} to {current_label}",
                        detail={"segment": row["name"], "value": row.get("value")},
                    )
                )

    elif operation == "margin_by_segment":
        dimension = step.params.get("dimension") or plan.dimension
        if not dimension:
            return
        margins = margin_by_segment(ctx, dimension)
        if not margins:
            return
        result.results.setdefault("margins", {})[dimension] = margins
        if margins.get("overall_margin_pct") is not None:
            result.evidence.append(
                Evidence(
                    label="Overall profit margin",
                    value=margins["overall_margin_pct"],
                    unit=Unit.PERCENT,
                    kind=EvidenceKind.OBSERVATION,
                    calculation="total profit / total revenue x 100",
                )
            )
        for key in ("highest_margin", "lowest_margin"):
            entry = margins.get(key)
            if entry and entry.get("margin_pct") is not None:
                result.evidence.append(
                    Evidence(
                        label=f"{'Highest' if key.startswith('highest') else 'Lowest'} margin {dimension} — {entry['name']}",
                        value=entry["margin_pct"],
                        unit=Unit.PERCENT,
                        kind=EvidenceKind.OBSERVATION,
                        calculation=f"profit / revenue within {dimension}",
                        detail={"segment": entry["name"]},
                    )
                )

    # ----------------------------------------------------- investigation
    elif operation == "investigate_change":
        current, previous, current_label, previous_label = last_two_periods(ctx, grain)
        if previous.empty:
            result.insufficient.append(
                "There is only one period of data, so a change cannot be explained."
            )
            return
        investigation = investigate_metric_change(
            ctx, metric, current, previous, current_label, previous_label
        )
        result.investigation = investigation
        result.results["investigation"] = investigation.to_dict()
        result.evidence.extend(investigation.all_evidence())

    # --------------------------------------------------------- anomalies
    elif operation == "detect_anomalies":
        # Anomaly detection needs many points to learn what "normal" looks like.
        # The plan's comparison grain is usually monthly, which on a year of
        # data gives twelve points -- far too few. Step down to the finest grain
        # the dataset actually supports.
        scan_grain = grain
        for candidate in (Grain.DAY, Grain.WEEK, Grain.MONTH):
            probe = resample_metric(ctx, "orders", candidate)
            if len(probe.points) >= 20:
                scan_grain = candidate
                break
        series_map = {
            key: resample_metric(ctx, key, scan_grain)
            for key in ("revenue", "orders", "customers", "units_sold", "avg_order_value")
        }
        series_map = {k: v for k, v in series_map.items() if v.sufficiency.ok and v.points}
        if not series_map:
            result.insufficient.append(
                "There is not enough time-series data to detect unusual periods."
            )
            return
        found = detect_anomalies(ctx, series_map)
        anomaly_summary = summarize_anomalies(found)
        result.results["anomalies"] = {
            "items": [a.to_dict() for a in found],
            "summary": anomaly_summary,
            "grain": scan_grain.value,
        }

        # The headline sentence is "25 unusual periods detected: 6 below the
        # expected range and 19 above it." Those three counts are computed here
        # and must therefore be traceable like any other figure — both so the
        # reader can open them, and so a model repeating them is not accused of
        # inventing them.
        for label, value, description in (
            ("Unusual periods detected", anomaly_summary.get("count"),
             "count of periods outside the expected range"),
            ("Periods below the expected range", anomaly_summary.get("drops"),
             "count of anomalies with a downward direction"),
            ("Periods above the expected range", anomaly_summary.get("spikes"),
             "count of anomalies with an upward direction"),
        ):
            if value is None:
                continue
            result.evidence.append(
                Evidence(
                    label=label,
                    value=int(value),
                    unit=Unit.COUNT,
                    kind=EvidenceKind.STATISTICAL,
                    calculation=description,
                    detail={"grain": scan_grain.value},
                )
            )

        for anomaly in found[:6]:
            result.evidence.append(
                Evidence(
                    label=f"{anomaly.metric_label} on {anomaly.period}",
                    value=round(anomaly.observed, 2),
                    unit=_unit_for(ctx, anomaly.metric_key),
                    kind=EvidenceKind.STATISTICAL,
                    calculation=anomaly.context.get("explanation", anomaly.method),
                    period=anomaly.period,
                    detail={
                        "expected": round(anomaly.expected, 2),
                        "deviation_pct": anomaly.deviation_pct,
                        "severity": anomaly.severity,
                    },
                )
            )

    # --------------------------------------------------------- customers
    elif operation == "customer_breakdown":
        summary = customer_breakdown(ctx)
        if not summary:
            result.insufficient.append(
                "No customer identifier column was detected, so customer analysis is unavailable."
            )
            return
        result.results["customers"] = summary
        for label, key, unit in (
            ("Total customers", "total_customers", Unit.COUNT),
            ("Repeat customers", "repeat_customers", Unit.COUNT),
            ("Repeat purchase rate", "repeat_rate_pct", Unit.PERCENT),
            ("Average orders per customer", "avg_orders_per_customer", Unit.NUMBER),
            ("Share of revenue from the top 10% of customers", "top_10pct_revenue_share", Unit.PERCENT),
        ):
            if summary.get(key) is not None:
                result.evidence.append(
                    Evidence(
                        label=label,
                        value=summary[key],
                        unit=unit,
                        kind=EvidenceKind.OBSERVATION,
                        calculation=f"derived from distinct values of {summary.get('customer_column')}",
                        column=summary.get("customer_column"),
                    )
                )

    # ---------------------------------------------------------- forecast
    elif operation == "check_forecast_viability":
        series = resample_metric(ctx, metric, grain)
        periods = len(series.points)
        viable = periods >= MIN_PERIODS_FOR_FORECAST
        result.results["forecast"] = {
            "available": viable,
            "periods_available": periods,
            "periods_required": MIN_PERIODS_FOR_FORECAST,
            "reason": (
                ""
                if viable
                else (
                    f"A forecast is not available because this dataset contains only "
                    f"{periods} {grain.label[:-2]} period(s) of history. At least "
                    f"{MIN_PERIODS_FOR_FORECAST} are needed to project forward with any "
                    "reliability."
                )
            ),
        }
        if not viable:
            result.insufficient.append(result.results["forecast"]["reason"])


def analysis_label(bucket: str) -> str:
    return "growth" if bucket == "growing" else "decline"


def _narrative_hint(plan: AnalysisPlan, result: ExecutionResult) -> str:
    """A deterministic one-line answer.

    Shown when the AI layer is unavailable, and used as a sanity anchor when it
    is available: if the model's summary contradicts this, something is wrong.
    """
    comparison = result.results.get("comparison")
    metric_key = plan.metric

    if plan.intent in {Intent.EXPLAIN_CHANGE, Intent.COMPARE_PERIODS} and comparison:
        metric = comparison["metrics"].get(metric_key)
        if metric and metric.get("change_pct") is not None:
            direction = "fell" if metric["change_pct"] < 0 else "rose"
            return (
                f"{metric['label']} {direction} {abs(metric['change_pct']):.1f}% in "
                f"{comparison['current_period']} compared with {comparison['previous_period']}."
            )

    if plan.intent is Intent.ANOMALIES:
        anomalies = result.results.get("anomalies", {}).get("summary", {})
        if anomalies:
            return anomalies.get("description", "")

    # A question about growth or decline is asking which segments *moved*, not
    # which are biggest. Answering with the largest segment would technically be
    # a true statement about the data and a wrong answer to the question.
    if plan.intent in {Intent.TOP_SEGMENTS, Intent.BOTTOM_SEGMENTS}:
        movers = result.results.get("movers", {}) if plan.ranking_basis == "change" else {}
        if movers:
            dimension, data = next(iter(movers.items()))
            bucket = "declining" if plan.intent is Intent.BOTTOM_SEGMENTS else "growing"
            rows = data.get(bucket) or []
            if rows:
                leader = rows[0]
                verb = "fell" if bucket == "declining" else "grew"
                return (
                    f"{leader['name']} {verb} the most of any {dimension}, at "
                    f"{abs(float(leader['change_pct'])):.1f}% against the previous period."
                )
            return (
                f"No {dimension} {'declined' if bucket == 'declining' else 'grew'} "
                f"materially against the previous period."
            )

        # Ranked by size: answer with the leader, or the weakest for a
        # "worst/lowest" question.
        breakdowns = result.results.get("breakdowns", {})
        if breakdowns:
            dimension, data = next(iter(breakdowns.items()))
            rows = [r for r in data.get("rows", []) if not r.get("is_other")]
            if rows:
                pick = rows[0] if plan.intent is Intent.TOP_SEGMENTS else rows[-1]
                rank = "largest" if plan.intent is Intent.TOP_SEGMENTS else "smallest"
                return (
                    f"{pick['name']} is the {rank} {dimension} by "
                    f"{data['metric_label'].lower()}, at {pick['share_pct']:.1f}% "
                    "of the total."
                )

    series = result.results.get("series", {}).get(metric_key)
    if series and series.get("summary", {}).get("trend_description"):
        return series["summary"]["trend_description"]

    breakdowns = result.results.get("breakdowns", {})
    if breakdowns:
        dimension, data = next(iter(breakdowns.items()))
        if data.get("rows"):
            leader = data["rows"][0]
            return (
                f"{leader['name']} is the largest {dimension} by "
                f"{data['metric_label'].lower()}, at {leader['share_pct']:.1f}% of the total."
            )

    metrics = result.results.get("metrics", {})
    if metrics and metric_key in metrics:
        m = metrics[metric_key]
        return f"{m['label']} across this dataset is {m['value']:,.2f}."

    return ""


def answer_question(question: str, ctx: DatasetContext) -> ExecutionResult:
    """Convenience entry point: plan a question and execute it."""
    from app.analytics.planner import build_plan

    plan = build_plan(question, ctx)
    return execute_plan(plan, ctx)
