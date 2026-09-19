"""Time-series analysis: trends, growth, moving averages, seasonality.

Every function here refuses to produce a result it cannot justify. A trend over
two points is not a trend; a seasonality estimate from three weeks of data is
noise. When there is not enough history, we return a
:class:`~app.analytics.types.DataSufficiency` explaining what is missing and
what would be required — which the UI shows to the user verbatim.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd

from app.analytics.context import DatasetContext, pct_change, to_float
from app.analytics.profiling import MIN_PERIODS_FOR_SEASONALITY, MIN_PERIODS_FOR_TREND
from app.analytics.types import DataSufficiency, Grain, Unit, jsonable


@dataclass(slots=True)
class SeriesPoint:
    period: str
    value: float
    row_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {"period": self.period, "value": self.value, "rows": self.row_count}


@dataclass(slots=True)
class TimeSeries:
    metric_key: str
    metric_label: str
    grain: Grain
    unit: Unit
    points: list[SeriesPoint]
    moving_average: list[float | None] = field(default_factory=list)
    sufficiency: DataSufficiency = field(default_factory=lambda: DataSufficiency(True))
    summary: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return jsonable(
            {
                "metric_key": self.metric_key,
                "metric_label": self.metric_label,
                "grain": self.grain.value,
                "unit": self.unit.value,
                "points": [p.to_dict() for p in self.points],
                "moving_average": self.moving_average,
                "sufficiency": self.sufficiency.to_dict(),
                "summary": self.summary,
            }
        )

    @property
    def values(self) -> list[float]:
        return [p.value for p in self.points]


def period_label(timestamp: pd.Timestamp, grain: Grain) -> str:
    """A label a non-technical user can read at a glance."""
    if grain is Grain.DAY:
        return timestamp.strftime("%Y-%m-%d")
    if grain is Grain.WEEK:
        return f"Week of {timestamp.strftime('%d %b %Y')}"
    if grain is Grain.MONTH:
        return timestamp.strftime("%b %Y")
    return f"Q{((timestamp.month - 1) // 3) + 1} {timestamp.year}"


def resample_metric(
    ctx: DatasetContext,
    metric_key: str,
    grain: Grain | None = None,
    frame: pd.DataFrame | None = None,
) -> TimeSeries:
    """Aggregate a metric over time at the requested grain.

    Gaps are filled with explicit zeros for summed measures, because a day with
    no orders genuinely is a day with zero revenue — and leaving it out would
    make the chart lie about the shape of the trend.
    """
    grain = grain or ctx.grain
    df = ctx.dated() if frame is None else frame
    date_col = ctx.date_col

    label, unit, aggregator = _metric_spec(ctx, metric_key)

    if not date_col:
        return TimeSeries(
            metric_key=metric_key, metric_label=label, grain=grain, unit=unit, points=[],
            sufficiency=DataSufficiency(
                False,
                "No date column was detected in this dataset, so trends cannot be calculated.",
                "A column containing order or transaction dates.",
            ),
        )
    if aggregator is None:
        return TimeSeries(
            metric_key=metric_key, metric_label=label, grain=grain, unit=unit, points=[],
            sufficiency=DataSufficiency(
                False,
                f"This dataset does not contain the data needed to calculate {label.lower()}.",
                f"A column representing {label.lower()}.",
            ),
        )
    if df.empty:
        return TimeSeries(
            metric_key=metric_key, metric_label=label, grain=grain, unit=unit, points=[],
            sufficiency=DataSufficiency(False, "No rows have a usable date.", "Valid dates."),
        )

    working = df[df[date_col].notna()].copy()
    if working.empty:
        return TimeSeries(
            metric_key=metric_key, metric_label=label, grain=grain, unit=unit, points=[],
            sufficiency=DataSufficiency(
                False, "No rows have a usable date.", "Valid dates in the date column."
            ),
        )

    working["__period"] = working[date_col].dt.to_period(_period_alias(grain)).dt.start_time
    grouped = working.groupby("__period")
    aggregated = aggregator(grouped).sort_index()
    row_counts = grouped.size().sort_index()

    # Fill calendar gaps so the trend line is honest about quiet periods.
    if len(aggregated) > 1:
        full_index = _period_index(aggregated.index.min(), aggregated.index.max(), grain)
        aggregated = aggregated.reindex(full_index, fill_value=0.0)
        row_counts = row_counts.reindex(full_index, fill_value=0)

    points = [
        SeriesPoint(
            period=period_label(pd.Timestamp(index), grain),
            value=float(value) if np.isfinite(value) else 0.0,
            row_count=int(row_counts.get(index, 0)),
        )
        for index, value in aggregated.items()
    ]

    sufficiency = DataSufficiency(True)
    if len(points) < MIN_PERIODS_FOR_TREND:
        sufficiency = DataSufficiency(
            False,
            f"This dataset covers only {len(points)} {grain.label[:-2] if grain.label.endswith('ly') else grain.label} "
            f"period(s). At least {MIN_PERIODS_FOR_TREND} are needed to describe a trend.",
            f"At least {MIN_PERIODS_FOR_TREND} periods of history.",
        )

    series = TimeSeries(
        metric_key=metric_key,
        metric_label=label,
        grain=grain,
        unit=unit,
        points=points,
        sufficiency=sufficiency,
    )
    series.moving_average = moving_average(series.values, window=_ma_window(grain, len(points)))
    series.summary = summarize_series(series)
    return series


def _period_alias(grain: Grain) -> str:
    return {Grain.DAY: "D", Grain.WEEK: "W-MON", Grain.MONTH: "M", Grain.QUARTER: "Q"}[grain]


def _period_index(start: pd.Timestamp, end: pd.Timestamp, grain: Grain) -> pd.DatetimeIndex:
    """The complete run of period-start timestamps between two bucket keys.

    Built with the same ``Period`` machinery that produced the bucket keys
    themselves, and that is the whole point. Generating it with
    ``pd.date_range(freq=...)`` instead looks equivalent and is not: pandas
    anchors a weekly frequency to the *end* of the week, while
    ``to_period("W-MON").start_time`` yields the *start*. The two index sets
    then share no members at all, so reindexing replaced every weekly figure
    with the fill value — a chart of flat zero revenue, reported as a genuine
    finding, for any dataset viewed at weekly grain. Daily, monthly, and
    quarterly happened to line up, so the bug was invisible everywhere else.
    """
    return pd.period_range(
        start=start, end=end, freq=_period_alias(grain)
    ).to_timestamp(how="start")


def _ma_window(grain: Grain, point_count: int) -> int:
    """A moving-average window that matches the natural cycle of the grain."""
    base = {Grain.DAY: 7, Grain.WEEK: 4, Grain.MONTH: 3, Grain.QUARTER: 2}[grain]
    return max(2, min(base, point_count // 2)) if point_count >= 4 else 0


def _metric_spec(ctx: DatasetContext, metric_key: str):
    """Resolve a metric key to (label, unit, aggregation over a GroupBy)."""
    revenue_col, profit_col = ctx.revenue_col, ctx.profit_col
    cost_col, quantity_col = ctx.cost_col, ctx.quantity_col
    order_col, customer_col = ctx.order_col, ctx.customer_col

    def sum_of(column: str | None):
        if not column:
            return None
        return lambda grouped: grouped[column].sum(min_count=1).fillna(0.0)

    specs: dict[str, tuple[str, Unit, Any]] = {
        "revenue": ("Revenue", Unit.CURRENCY, sum_of(revenue_col)),
        "profit": ("Profit", Unit.CURRENCY, sum_of(profit_col)),
        "cost": ("Cost", Unit.CURRENCY, sum_of(cost_col)),
        "units_sold": ("Units sold", Unit.COUNT, sum_of(quantity_col)),
        "orders": (
            "Orders",
            Unit.COUNT,
            (lambda grouped: grouped[order_col].nunique().astype(float))
            if order_col
            else (lambda grouped: grouped.size().astype(float)),
        ),
        "customers": (
            "Customers",
            Unit.COUNT,
            (lambda grouped: grouped[customer_col].nunique().astype(float))
            if customer_col
            else None,
        ),
    }

    if metric_key == "avg_order_value":
        if not revenue_col:
            return "Average order value", Unit.CURRENCY, None

        def aov(grouped):
            revenue = grouped[revenue_col].sum(min_count=1)
            orders = (
                grouped[order_col].nunique()
                if order_col
                else grouped.size()
            ).astype(float)
            return (revenue / orders.replace(0, np.nan)).fillna(0.0)

        return "Average order value", Unit.CURRENCY, aov

    return specs.get(metric_key, (metric_key.replace("_", " ").title(), Unit.NUMBER, None))


def moving_average(values: list[float], window: int) -> list[float | None]:
    """Trailing moving average. Positions with insufficient history are ``None``."""
    if window < 2 or len(values) < window:
        return [None] * len(values)
    series = pd.Series(values, dtype="float64")
    rolled = series.rolling(window=window, min_periods=window).mean()
    return [None if pd.isna(v) else round(float(v), 4) for v in rolled]


def summarize_series(series: TimeSeries) -> dict[str, Any]:
    """Describe a series in the terms a business owner cares about."""
    values = series.values
    if not values:
        return {}

    summary: dict[str, Any] = {
        "periods": len(values),
        "total": float(np.sum(values)),
        "average": float(np.mean(values)),
        "minimum": float(np.min(values)),
        "maximum": float(np.max(values)),
        "first_period": series.points[0].period,
        "last_period": series.points[-1].period,
        "first_value": values[0],
        "last_value": values[-1],
    }

    peak_index = int(np.argmax(values))
    trough_index = int(np.argmin(values))
    summary["peak_period"] = series.points[peak_index].period
    summary["trough_period"] = series.points[trough_index].period

    if len(values) >= 2:
        summary["change_pct"] = pct_change(values[-1], values[-2])
        summary["overall_change_pct"] = pct_change(values[-1], values[0])

    if len(values) >= MIN_PERIODS_FOR_TREND:
        direction, slope, strength = trend_direction(values)
        summary["trend"] = direction
        summary["trend_slope_per_period"] = slope
        summary["trend_strength"] = strength
        summary["trend_description"] = _describe_trend(direction, strength, series.grain)
        summary["volatility_pct"] = volatility(values)

    return jsonable(summary)


def trend_direction(values: list[float]) -> tuple[str, float, float]:
    """Ordinary least squares slope over the period index.

    Returns (direction, slope per period, R²). R² is reported as "consistency"
    in the UI rather than as a statistical term, and a weak fit downgrades the
    direction to "mixed" so we never describe noise as a trend.
    """
    n = len(values)
    if n < 2:
        return "flat", 0.0, 0.0

    x = np.arange(n, dtype="float64")
    y = np.asarray(values, dtype="float64")
    if not np.isfinite(y).all() or np.allclose(y, y[0]):
        return "flat", 0.0, 1.0

    slope, intercept = np.polyfit(x, y, 1)
    predicted = slope * x + intercept
    ss_res = float(np.sum((y - predicted) ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r_squared = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
    r_squared = max(0.0, min(1.0, r_squared))

    mean_abs = float(np.mean(np.abs(y))) or 1.0
    relative_slope = abs(slope) / mean_abs

    if relative_slope < 0.005 or r_squared < 0.1:
        direction = "flat" if relative_slope < 0.005 else "mixed"
    else:
        direction = "rising" if slope > 0 else "falling"
    return direction, round(float(slope), 4), round(r_squared, 3)


def _describe_trend(direction: str, strength: float, grain: Grain) -> str:
    consistency = "consistently" if strength >= 0.6 else "gradually" if strength >= 0.3 else ""
    period = grain.label
    if direction == "rising":
        return f"{period.capitalize()} values have been {consistency} increasing.".replace("  ", " ")
    if direction == "falling":
        return f"{period.capitalize()} values have been {consistency} decreasing.".replace("  ", " ")
    if direction == "mixed":
        return f"{period.capitalize()} values have moved up and down without a clear direction."
    return f"{period.capitalize()} values have stayed broadly flat."


def volatility(values: list[float]) -> float | None:
    """Coefficient of variation as a percentage — how bumpy the series is."""
    array = np.asarray(values, dtype="float64")
    mean = float(np.mean(array))
    if mean == 0 or not np.isfinite(mean):
        return None
    return round(float(np.std(array) / abs(mean) * 100), 2)


def growth_table(series: TimeSeries) -> list[dict[str, Any]]:
    """Period-over-period growth, ready to render as a table."""
    rows: list[dict[str, Any]] = []
    for index, point in enumerate(series.points):
        previous = series.points[index - 1].value if index > 0 else None
        rows.append(
            {
                "period": point.period,
                "value": point.value,
                "previous_value": previous,
                "change": (point.value - previous) if previous is not None else None,
                "change_pct": pct_change(point.value, previous) if previous is not None else None,
                "rows": point.row_count,
            }
        )
    return jsonable(rows)


def detect_seasonality(series: TimeSeries) -> dict[str, Any]:
    """Look for a repeating weekly or monthly pattern.

    This is intentionally modest: we report the average level of each day of the
    week (or month of the year) relative to the overall mean, and only when
    there is enough history for the comparison to mean anything.
    """
    if len(series.points) < MIN_PERIODS_FOR_SEASONALITY:
        return {
            "available": False,
            "reason": (
                f"Seasonality needs at least {MIN_PERIODS_FOR_SEASONALITY} periods of "
                f"history; this dataset has {len(series.points)}."
            ),
        }

    if series.grain is Grain.DAY:
        cycle, cycle_label = 7, "day of week"
        names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        try:
            starts = [datetime.strptime(p.period, "%Y-%m-%d") for p in series.points]
        except ValueError:
            return {"available": False, "reason": "Period labels could not be parsed."}
        buckets = [start.weekday() for start in starts]
    elif series.grain is Grain.MONTH:
        cycle, cycle_label = 12, "month"
        names = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        ]
        try:
            starts = [datetime.strptime(p.period, "%b %Y") for p in series.points]
        except ValueError:
            return {"available": False, "reason": "Period labels could not be parsed."}
        buckets = [start.month - 1 for start in starts]
    else:
        return {
            "available": False,
            "reason": f"Seasonality is only calculated for daily and monthly data, not {series.grain.label}.",
        }

    values = np.asarray(series.values, dtype="float64")
    overall_mean = float(values.mean())
    if overall_mean == 0:
        return {"available": False, "reason": "All values are zero."}

    pattern: list[dict[str, Any]] = []
    for position in range(cycle):
        mask = [index for index, bucket in enumerate(buckets) if bucket == position]
        if len(mask) < 2:
            continue
        bucket_mean = float(values[mask].mean())
        pattern.append(
            {
                "label": names[position],
                "average": round(bucket_mean, 2),
                "index": round(bucket_mean / overall_mean * 100, 1),
                "observations": len(mask),
            }
        )

    if len(pattern) < cycle * 0.6:
        return {"available": False, "reason": "Not every part of the cycle is represented yet."}

    indices = [entry["index"] for entry in pattern]
    spread = max(indices) - min(indices)
    strongest = max(pattern, key=lambda entry: entry["index"])
    weakest = min(pattern, key=lambda entry: entry["index"])

    return jsonable(
        {
            "available": True,
            "cycle": cycle_label,
            "pattern": pattern,
            "spread_pct": round(spread, 1),
            # Below ~20 points of spread the "pattern" is indistinguishable from
            # ordinary variation, and calling it seasonality would overstate it.
            "is_meaningful": bool(spread >= 20),
            "strongest": strongest["label"],
            "weakest": weakest["label"],
            "description": (
                f"{strongest['label']} averages {strongest['index']:.0f}% of the typical "
                f"{cycle_label}, while {weakest['label']} averages {weakest['index']:.0f}%."
                if spread >= 20
                else f"No strong {cycle_label} pattern: every part of the cycle is within "
                     f"{spread:.0f} percentage points of the average."
            ),
        }
    )


def slice_period(
    ctx: DatasetContext, start: pd.Timestamp | None, end: pd.Timestamp | None
) -> pd.DataFrame:
    """Rows falling inside ``[start, end]`` (inclusive of both bounds)."""
    date_col = ctx.date_col
    frame = ctx.dated()
    if not date_col or frame.empty:
        return frame
    mask = pd.Series(True, index=frame.index)
    if start is not None:
        mask &= frame[date_col] >= start
    if end is not None:
        mask &= frame[date_col] <= end
    return frame[mask]


def last_two_periods(
    ctx: DatasetContext, grain: Grain
) -> tuple[pd.DataFrame, pd.DataFrame, str, str]:
    """The most recent complete-ish period and the one before it.

    Used by every "compared with last month" figure. Returns empty frames when
    there is not enough history, which callers treat as "no comparison
    available" rather than as zero.
    """
    date_col = ctx.date_col
    frame = ctx.dated()
    if not date_col or frame.empty:
        empty = frame.iloc[0:0]
        return empty, empty, "", ""

    periods = frame[date_col].dt.to_period(_period_alias(grain))
    unique = sorted(periods.unique())
    if len(unique) < 2:
        empty = frame.iloc[0:0]
        label = period_label(pd.Timestamp(unique[0].start_time), grain) if unique else ""
        return frame, empty, label, ""

    current_period, previous_period = unique[-1], unique[-2]
    current = frame[periods == current_period]
    previous = frame[periods == previous_period]
    return (
        current,
        previous,
        period_label(pd.Timestamp(current_period.start_time), grain),
        period_label(pd.Timestamp(previous_period.start_time), grain),
    )
