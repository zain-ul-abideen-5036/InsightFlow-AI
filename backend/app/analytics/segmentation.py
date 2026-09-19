"""Segmentation and contribution analysis.

This module answers "where did it happen?". When revenue falls 18%, the useful
question is not *that* it fell but which products, regions, or channels account
for the fall — and whether the change is concentrated in a few segments or
spread evenly across all of them.

**Contribution** is the key concept. A segment's contribution to a total change
is its own absolute change divided by the total absolute change. It is signed:
a segment that grew while the total shrank has a negative contribution, which is
exactly the information a business owner needs ("everything fell except A").
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from app.analytics.context import DatasetContext, pct_change, safe_ratio, to_float
from app.analytics.types import Unit, jsonable

# Segments below this share of the total are grouped into "Other" so a
# breakdown stays readable rather than listing 400 SKUs.
MIN_SEGMENT_SHARE = 0.005


@dataclass(slots=True)
class SegmentRow:
    name: str
    value: float
    share_pct: float
    previous_value: float | None = None
    change: float | None = None
    change_pct: float | None = None
    contribution_pct: float | None = None
    row_count: int = 0
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return jsonable(
            {
                "name": self.name,
                "value": self.value,
                "share_pct": self.share_pct,
                "previous_value": self.previous_value,
                "change": self.change,
                "change_pct": self.change_pct,
                "contribution_pct": self.contribution_pct,
                "rows": self.row_count,
                **self.extra,
            }
        )


@dataclass(slots=True)
class Breakdown:
    dimension: str
    dimension_column: str
    metric_key: str
    metric_label: str
    unit: Unit
    rows: list[SegmentRow]
    total: float
    previous_total: float | None = None
    concentration: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return jsonable(
            {
                "dimension": self.dimension,
                "dimension_column": self.dimension_column,
                "metric_key": self.metric_key,
                "metric_label": self.metric_label,
                "unit": self.unit.value,
                "total": self.total,
                "previous_total": self.previous_total,
                "rows": [row.to_dict() for row in self.rows],
                "concentration": self.concentration,
            }
        )


def _aggregate(
    frame: pd.DataFrame, dimension_column: str, ctx: DatasetContext, metric_key: str
) -> tuple[pd.Series, pd.Series]:
    """Aggregate ``metric_key`` by ``dimension_column``; returns (values, row counts)."""
    grouped = frame.groupby(dimension_column, dropna=True)

    if metric_key == "orders":
        order_col = ctx.order_col
        values = (
            grouped[order_col].nunique().astype(float)
            if order_col and order_col in frame.columns
            else grouped.size().astype(float)
        )
    elif metric_key == "customers":
        customer_col = ctx.customer_col
        if not customer_col or customer_col not in frame.columns:
            return pd.Series(dtype="float64"), pd.Series(dtype="int64")
        values = grouped[customer_col].nunique().astype(float)
    elif metric_key == "avg_order_value":
        revenue_col, order_col = ctx.revenue_col, ctx.order_col
        if not revenue_col:
            return pd.Series(dtype="float64"), pd.Series(dtype="int64")
        revenue = grouped[revenue_col].sum(min_count=1)
        orders = (
            grouped[order_col].nunique() if order_col and order_col in frame.columns
            else grouped.size()
        ).astype(float)
        values = (revenue / orders.replace(0, np.nan)).fillna(0.0)
    else:
        column = {
            "revenue": ctx.revenue_col,
            "profit": ctx.profit_col,
            "cost": ctx.cost_col,
            "units_sold": ctx.quantity_col,
        }.get(metric_key)
        if not column or column not in frame.columns:
            return pd.Series(dtype="float64"), pd.Series(dtype="int64")
        values = grouped[column].sum(min_count=1).fillna(0.0)

    return values.astype(float), grouped.size()


def _metric_label(ctx: DatasetContext, metric_key: str) -> tuple[str, Unit]:
    labels = {
        "revenue": ("Revenue", Unit.CURRENCY),
        "profit": ("Profit", Unit.CURRENCY),
        "cost": ("Cost", Unit.CURRENCY),
        "units_sold": ("Units sold", Unit.COUNT),
        "orders": ("Orders", Unit.COUNT),
        "customers": ("Customers", Unit.COUNT),
        "avg_order_value": ("Average order value", Unit.CURRENCY),
    }
    return labels.get(metric_key, (metric_key.replace("_", " ").title(), Unit.NUMBER))


def breakdown(
    ctx: DatasetContext,
    dimension: str,
    metric_key: str = "revenue",
    *,
    frame: pd.DataFrame | None = None,
    limit: int = 15,
) -> Breakdown | None:
    """Break a metric down by one dimension, largest first."""
    dimensions = ctx.dimensions()
    dimension_column = dimensions.get(dimension) or (
        dimension if dimension in ctx.df.columns else None
    )
    if not dimension_column:
        return None

    df = ctx.df if frame is None else frame
    if df.empty or dimension_column not in df.columns:
        return None

    values, counts = _aggregate(df, dimension_column, ctx, metric_key)
    if values.empty:
        return None

    values = values.sort_values(ascending=False)
    total = float(values.sum())
    label, unit = _metric_label(ctx, metric_key)

    rows: list[SegmentRow] = []
    other_value, other_rows, other_count = 0.0, 0, 0
    for index, (name, value) in enumerate(values.items()):
        share = (value / total * 100) if total else 0.0
        if index >= limit or (total and abs(value / total) < MIN_SEGMENT_SHARE and index >= 5):
            other_value += float(value)
            other_rows += int(counts.get(name, 0))
            other_count += 1
            continue
        rows.append(
            SegmentRow(
                name=str(name),
                value=float(value),
                share_pct=round(share, 2),
                row_count=int(counts.get(name, 0)),
            )
        )

    if other_count:
        rows.append(
            SegmentRow(
                name=f"Other ({other_count} more)",
                value=other_value,
                share_pct=round(other_value / total * 100, 2) if total else 0.0,
                row_count=other_rows,
                extra={"is_other": True, "segment_count": other_count},
            )
        )

    return Breakdown(
        dimension=dimension,
        dimension_column=dimension_column,
        metric_key=metric_key,
        metric_label=label,
        unit=unit,
        rows=rows,
        total=total,
        concentration=concentration_stats(values, total),
    )


def concentration_stats(values: pd.Series, total: float) -> dict[str, Any]:
    """How concentrated is this metric across segments?

    Reported as a plain-English sentence plus the underlying shares. We avoid
    naming the Herfindahl index in the UI — "the top 3 products make 68% of
    revenue" is the same information in a form the user can act on.
    """
    if values.empty or total <= 0:
        return {}

    positive = values[values > 0].sort_values(ascending=False)
    if positive.empty:
        return {}

    shares = positive / positive.sum()
    segment_count = int(len(positive))
    top1 = float(shares.iloc[0] * 100)
    top3 = float(shares.head(3).sum() * 100)
    top5 = float(shares.head(5).sum() * 100)
    hhi = float((shares**2).sum())

    # Raw HHI cannot be compared across breakdowns with different segment
    # counts: four equal segments score 0.25 and twenty equal segments score
    # 0.05, yet both are perfectly even. Normalising against the minimum
    # achievable value (1/n) puts every breakdown on a 0-1 scale where 0 means
    # "perfectly even" and 1 means "one segment is everything".
    if segment_count > 1:
        normalized = (hhi - 1.0 / segment_count) / (1.0 - 1.0 / segment_count)
    else:
        normalized = 1.0
    normalized = max(0.0, min(1.0, normalized))

    if normalized >= 0.4:
        level = "high"
        note = "The total depends heavily on a small number of segments."
    elif normalized >= 0.2:
        level = "moderate"
        note = "The total is somewhat concentrated in the leading segments."
    else:
        level = "low"
        note = "The total is spread fairly evenly across segments."

    shown = min(3, segment_count)
    return jsonable(
        {
            "segment_count": segment_count,
            "top_1_share_pct": round(top1, 2),
            "top_3_share_pct": round(top3, 2),
            "top_5_share_pct": round(top5, 2),
            "hhi": round(hhi, 4),
            "normalized_hhi": round(normalized, 4),
            "level": level,
            "note": note,
            "description": (
                f"The top {shown} of {segment_count} segments account for "
                f"{top3:.1f}% of the total. {note}"
            ),
        }
    )


def is_degenerate(result: "Breakdown", threshold: float = 0.9) -> bool:
    """Does one segment hold essentially the whole metric?

    Order status is the canonical example: when only completed orders carry
    revenue, "revenue by status" is 100% completed. Attributing a movement to
    it is a restatement, not a finding, so such dimensions are excluded from
    contribution analysis and from insight generation.
    """
    if not result.rows or not result.total:
        return False
    return max(abs(row.value) for row in result.rows) / abs(result.total) >= threshold


def contribution_analysis(
    ctx: DatasetContext,
    dimension: str,
    current: pd.DataFrame,
    previous: pd.DataFrame,
    metric_key: str = "revenue",
    *,
    limit: int = 10,
) -> Breakdown | None:
    """Decompose a change in a metric into per-segment contributions.

    The contribution percentages answer "how much of the overall change does
    this segment explain?" — the single most useful number when a KPI moves and
    nobody knows why.
    """
    dimensions = ctx.dimensions()
    dimension_column = dimensions.get(dimension) or (
        dimension if dimension in ctx.df.columns else None
    )
    if not dimension_column:
        return None
    if current.empty and previous.empty:
        return None

    current_values, current_counts = _aggregate(current, dimension_column, ctx, metric_key)
    previous_values, _ = _aggregate(previous, dimension_column, ctx, metric_key)
    if current_values.empty and previous_values.empty:
        return None

    all_segments = sorted(set(current_values.index) | set(previous_values.index), key=str)
    current_total = float(current_values.sum())
    previous_total = float(previous_values.sum())
    total_change = current_total - previous_total

    rows: list[SegmentRow] = []
    for segment in all_segments:
        now = float(current_values.get(segment, 0.0))
        before = float(previous_values.get(segment, 0.0))
        change = now - before
        # Contribution is measured against the magnitude of the total change, so
        # a segment can explain more than 100% of a decline if others grew.
        contribution = (change / total_change * 100) if total_change else None
        rows.append(
            SegmentRow(
                name=str(segment),
                value=now,
                share_pct=round(now / current_total * 100, 2) if current_total else 0.0,
                previous_value=before,
                change=change,
                change_pct=pct_change(now, before),
                contribution_pct=round(contribution, 2) if contribution is not None else None,
                row_count=int(current_counts.get(segment, 0)),
                extra={
                    "is_new": before == 0 and now > 0,
                    "is_lost": now == 0 and before > 0,
                },
            )
        )

    # Rank by the size of the movement, not by the size of the segment: a large
    # stable segment explains nothing about a change.
    rows.sort(key=lambda row: abs(row.change or 0.0), reverse=True)
    label, unit = _metric_label(ctx, metric_key)

    return Breakdown(
        dimension=dimension,
        dimension_column=dimension_column,
        metric_key=metric_key,
        metric_label=label,
        unit=unit,
        rows=rows[:limit],
        total=current_total,
        previous_total=previous_total,
        concentration={
            "total_change": total_change,
            "total_change_pct": pct_change(current_total, previous_total),
            "segments_up": sum(1 for row in rows if (row.change or 0) > 0),
            "segments_down": sum(1 for row in rows if (row.change or 0) < 0),
            "segments_new": sum(1 for row in rows if row.extra.get("is_new")),
            "segments_lost": sum(1 for row in rows if row.extra.get("is_lost")),
        },
    )


def top_and_bottom(
    ctx: DatasetContext,
    dimension: str,
    current: pd.DataFrame,
    previous: pd.DataFrame,
    metric_key: str = "revenue",
    *,
    limit: int = 5,
    min_baseline: float = 0.0,
) -> dict[str, Any]:
    """Fastest-growing and fastest-declining segments by percentage change.

    ``min_baseline`` guards against the classic reporting failure where a segment
    that sold one unit last month and three this month is reported as "+200%
    growth" above genuinely material movements.
    """
    result = contribution_analysis(
        ctx, dimension, current, previous, metric_key, limit=10_000
    )
    if result is None:
        return {}

    if min_baseline <= 0 and result.previous_total:
        # Ignore segments smaller than 1% of the prior total.
        min_baseline = abs(result.previous_total) * 0.01

    eligible = [
        row
        for row in result.rows
        if row.change_pct is not None
        and row.previous_value is not None
        and abs(row.previous_value) >= min_baseline
    ]

    growing = sorted(
        (r for r in eligible if (r.change_pct or 0) > 0),
        key=lambda r: r.change_pct or 0,
        reverse=True,
    )[:limit]
    declining = sorted(
        (r for r in eligible if (r.change_pct or 0) < 0), key=lambda r: r.change_pct or 0
    )[:limit]
    new_segments = [r for r in result.rows if r.extra.get("is_new")][:limit]
    lost_segments = [r for r in result.rows if r.extra.get("is_lost")][:limit]

    return jsonable(
        {
            "dimension": dimension,
            "dimension_column": result.dimension_column,
            "metric_key": metric_key,
            "metric_label": result.metric_label,
            "unit": result.unit.value,
            "min_baseline": min_baseline,
            "growing": [row.to_dict() for row in growing],
            "declining": [row.to_dict() for row in declining],
            "new": [row.to_dict() for row in new_segments],
            "lost": [row.to_dict() for row in lost_segments],
        }
    )


def margin_by_segment(
    ctx: DatasetContext, dimension: str, frame: pd.DataFrame | None = None, limit: int = 15
) -> dict[str, Any] | None:
    """Revenue, cost, profit, and margin per segment.

    Only produced when both revenue and profit are available; a "margin" without
    cost data would be a fabrication.
    """
    revenue_col, profit_col = ctx.revenue_col, ctx.profit_col
    if not revenue_col or not profit_col:
        return None

    dimensions = ctx.dimensions()
    dimension_column = dimensions.get(dimension)
    if not dimension_column:
        return None

    df = ctx.df if frame is None else frame
    if df.empty:
        return None

    grouped = df.groupby(dimension_column, dropna=True)
    revenue = grouped[revenue_col].sum(min_count=1).fillna(0.0)
    profit = grouped[profit_col].sum(min_count=1).fillna(0.0)
    counts = grouped.size()

    rows: list[dict[str, Any]] = []
    for segment in revenue.sort_values(ascending=False).head(limit).index:
        segment_revenue = float(revenue.get(segment, 0.0))
        segment_profit = float(profit.get(segment, 0.0))
        margin = safe_ratio(segment_profit, segment_revenue)
        rows.append(
            {
                "name": str(segment),
                "revenue": segment_revenue,
                "profit": segment_profit,
                "margin_pct": round(margin * 100, 2) if margin is not None else None,
                "rows": int(counts.get(segment, 0)),
            }
        )

    with_margin = [row for row in rows if row["margin_pct"] is not None]
    overall = safe_ratio(float(profit.sum()), float(revenue.sum()))

    return jsonable(
        {
            "dimension": dimension,
            "dimension_column": dimension_column,
            "overall_margin_pct": round(overall * 100, 2) if overall is not None else None,
            "rows": rows,
            "highest_margin": max(with_margin, key=lambda r: r["margin_pct"], default=None),
            "lowest_margin": min(with_margin, key=lambda r: r["margin_pct"], default=None),
        }
    )


def cross_segment(
    ctx: DatasetContext,
    row_dimension: str,
    column_dimension: str,
    metric_key: str = "revenue",
    *,
    frame: pd.DataFrame | None = None,
    limit: int = 8,
) -> dict[str, Any] | None:
    """A two-dimensional matrix, e.g. revenue by product and region."""
    dimensions = ctx.dimensions()
    row_col = dimensions.get(row_dimension)
    col_col = dimensions.get(column_dimension)
    if not row_col or not col_col or row_col == col_col:
        return None

    df = ctx.df if frame is None else frame
    measure = {
        "revenue": ctx.revenue_col,
        "profit": ctx.profit_col,
        "units_sold": ctx.quantity_col,
    }.get(metric_key)
    if df.empty or not measure or measure not in df.columns:
        return None

    pivot = pd.pivot_table(
        df, values=measure, index=row_col, columns=col_col, aggfunc="sum", fill_value=0.0
    )
    if pivot.empty:
        return None

    top_rows = pivot.sum(axis=1).sort_values(ascending=False).head(limit).index
    top_cols = pivot.sum(axis=0).sort_values(ascending=False).head(limit).index
    pivot = pivot.loc[top_rows, top_cols]

    return jsonable(
        {
            "row_dimension": row_dimension,
            "column_dimension": column_dimension,
            "metric_key": metric_key,
            "columns": [str(c) for c in pivot.columns],
            "rows": [
                {"name": str(index), "values": [to_float(v) for v in row]}
                for index, row in pivot.iterrows()
            ],
        }
    )
