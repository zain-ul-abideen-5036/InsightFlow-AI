"""Headline business metrics.

Each metric is returned as a :class:`MetricResult` carrying not just a number
but its provenance — which column produced it, how many rows contributed, and
what calculation was applied. Nothing in this product displays a figure it
cannot explain.

A metric is only produced when the data genuinely supports it. Absence is
represented by simply not returning the metric, never by returning zero: a
business with no revenue column and a business with zero revenue are entirely
different situations and must not look the same on a dashboard.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from app.analytics.context import DatasetContext, pct_change, safe_ratio, to_float
from app.analytics.types import Unit, jsonable


@dataclass(slots=True)
class MetricResult:
    key: str
    label: str
    value: float
    unit: Unit
    description: str = ""
    previous_value: float | None = None
    change_pct: float | None = None
    direction: str | None = None
    period_start: str | None = None
    period_end: str | None = None
    provenance: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return jsonable(
            {
                "key": self.key,
                "label": self.label,
                "value": self.value,
                "unit": self.unit.value,
                "description": self.description,
                "previous_value": self.previous_value,
                "change_pct": self.change_pct,
                "direction": self.direction,
                "period_start": self.period_start,
                "period_end": self.period_end,
                "provenance": self.provenance,
            }
        )


def _direction(change_pct: float | None, *, higher_is_better: bool = True) -> str | None:
    """Movement of the metric itself — never a value judgement.

    ``higher_is_better`` is deliberately unused for the direction, which always
    describes the arithmetic. Interpretation happens in the insight layer, where
    context about the metric is available.
    """
    if change_pct is None:
        return None
    if abs(change_pct) < 0.5:
        return "flat"
    return "up" if change_pct > 0 else "down"


def _sum(series: pd.Series) -> tuple[float, int]:
    """Sum of a measure, with the count of rows that actually contributed."""
    numeric = pd.to_numeric(series, errors="coerce")
    valid = numeric.dropna()
    return float(valid.sum()), int(len(valid))


def compute_metrics(
    ctx: DatasetContext, frame: pd.DataFrame | None = None
) -> dict[str, MetricResult]:
    """Compute every KPI the dataset supports over ``frame`` (default: all rows)."""
    df = ctx.df if frame is None else frame
    metrics: dict[str, MetricResult] = {}
    if df.empty:
        return metrics

    row_count = len(df)

    # -- Revenue -----------------------------------------------------------
    revenue_col = ctx.revenue_col
    revenue_total: float | None = None
    if revenue_col and revenue_col in df.columns:
        revenue_total, contributing = _sum(df[revenue_col])
        metrics["revenue"] = MetricResult(
            key="revenue",
            label="Revenue",
            value=revenue_total,
            unit=Unit.CURRENCY,
            description="Total revenue across all rows in the selected period.",
            provenance={
                "column": ctx.label_for(revenue_col),
                "calculation": ctx.derivations.get("revenue", f"sum({ctx.label_for(revenue_col)})"),
                "rows_used": contributing,
                "rows_total": row_count,
            },
        )

    # -- Cost --------------------------------------------------------------
    cost_col = ctx.cost_col
    cost_total: float | None = None
    if cost_col and cost_col in df.columns:
        cost_total, contributing = _sum(df[cost_col])
        metrics["cost"] = MetricResult(
            key="cost",
            label="Cost",
            value=cost_total,
            unit=Unit.CURRENCY,
            description="Total cost of goods across all rows in the selected period.",
            provenance={
                "column": cost_col,
                "calculation": f"sum({cost_col})",
                "rows_used": contributing,
                "rows_total": row_count,
            },
        )

    # -- Profit ------------------------------------------------------------
    profit_col = ctx.profit_col
    profit_total: float | None = None
    if profit_col and profit_col in df.columns:
        profit_total, contributing = _sum(df[profit_col])
        metrics["profit"] = MetricResult(
            key="profit",
            label="Profit",
            value=profit_total,
            unit=Unit.CURRENCY,
            description="Total profit across all rows in the selected period.",
            provenance={
                "column": ctx.label_for(profit_col),
                "calculation": ctx.derivations.get("profit", f"sum({ctx.label_for(profit_col)})"),
                "rows_used": contributing,
                "rows_total": row_count,
            },
        )

    # -- Margin ------------------------------------------------------------
    if profit_total is not None and revenue_total:
        margin = safe_ratio(profit_total, revenue_total)
        if margin is not None:
            metrics["profit_margin"] = MetricResult(
                key="profit_margin",
                label="Profit margin",
                value=margin * 100.0,
                unit=Unit.PERCENT,
                description="Profit as a share of revenue.",
                provenance={
                    "calculation": "profit ÷ revenue × 100",
                    "rows_used": row_count,
                    "rows_total": row_count,
                },
            )

    # -- Orders ------------------------------------------------------------
    order_col = ctx.order_col
    if order_col and order_col in df.columns:
        order_count = int(df[order_col].nunique(dropna=True))
        calculation = f"count of distinct {order_col}"
        provenance_column: str | None = order_col
    else:
        order_count = row_count
        calculation = "count of rows (no order identifier column was detected)"
        provenance_column = None

    metrics["orders"] = MetricResult(
        key="orders",
        label="Orders",
        value=float(order_count),
        unit=Unit.COUNT,
        description="Number of orders in the selected period.",
        provenance={
            "column": provenance_column,
            "calculation": calculation,
            "rows_used": row_count,
            "rows_total": row_count,
        },
    )

    # -- Customers ---------------------------------------------------------
    customer_col = ctx.customer_col
    if customer_col and customer_col in df.columns:
        customer_count = int(df[customer_col].nunique(dropna=True))
        metrics["customers"] = MetricResult(
            key="customers",
            label="Customers",
            value=float(customer_count),
            unit=Unit.COUNT,
            description="Distinct customers who placed an order in the selected period.",
            provenance={
                "column": customer_col,
                "calculation": f"count of distinct {customer_col}",
                "rows_used": int(df[customer_col].notna().sum()),
                "rows_total": row_count,
            },
        )

    # -- Units sold --------------------------------------------------------
    quantity_col = ctx.quantity_col
    if quantity_col and quantity_col in df.columns:
        units, contributing = _sum(df[quantity_col])
        metrics["units_sold"] = MetricResult(
            key="units_sold",
            label="Units sold",
            value=units,
            unit=Unit.COUNT,
            description="Total quantity sold in the selected period.",
            provenance={
                "column": quantity_col,
                "calculation": f"sum({quantity_col})",
                "rows_used": contributing,
                "rows_total": row_count,
            },
        )

    # -- Average order value ----------------------------------------------
    if revenue_total is not None and order_count > 0:
        aov = safe_ratio(revenue_total, order_count)
        if aov is not None:
            metrics["avg_order_value"] = MetricResult(
                key="avg_order_value",
                label="Average order value",
                value=aov,
                unit=Unit.CURRENCY,
                description="Revenue divided by the number of orders.",
                provenance={
                    "calculation": "revenue ÷ orders",
                    "rows_used": row_count,
                    "rows_total": row_count,
                },
            )

    # -- Revenue per customer ---------------------------------------------
    if revenue_total is not None and "customers" in metrics and metrics["customers"].value > 0:
        per_customer = safe_ratio(revenue_total, metrics["customers"].value)
        if per_customer is not None:
            metrics["revenue_per_customer"] = MetricResult(
                key="revenue_per_customer",
                label="Revenue per customer",
                value=per_customer,
                unit=Unit.CURRENCY,
                description="Revenue divided by the number of distinct customers.",
                provenance={
                    "calculation": "revenue ÷ customers",
                    "rows_used": row_count,
                    "rows_total": row_count,
                },
            )

    # -- Discount ----------------------------------------------------------
    discount_col = ctx.discount_col
    if discount_col and discount_col in df.columns and revenue_total:
        discount_values = pd.to_numeric(df[discount_col], errors="coerce").dropna()
        if not discount_values.empty:
            is_rate = bool(discount_values.between(0, 1).mean() > 0.95)
            if is_rate:
                metrics["avg_discount"] = MetricResult(
                    key="avg_discount",
                    label="Average discount",
                    value=float(discount_values.mean() * 100.0),
                    unit=Unit.PERCENT,
                    description="Mean discount rate applied across orders.",
                    provenance={
                        "column": discount_col,
                        "calculation": f"mean({discount_col}) × 100",
                        "rows_used": int(len(discount_values)),
                        "rows_total": row_count,
                    },
                )
            else:
                total_discount = float(discount_values.sum())
                metrics["total_discount"] = MetricResult(
                    key="total_discount",
                    label="Total discount",
                    value=total_discount,
                    unit=Unit.CURRENCY,
                    description="Total value of discounts applied.",
                    provenance={
                        "column": discount_col,
                        "calculation": f"sum({discount_col})",
                        "rows_used": int(len(discount_values)),
                        "rows_total": row_count,
                    },
                )

    return metrics


def compare_periods(
    ctx: DatasetContext,
    current: pd.DataFrame,
    previous: pd.DataFrame,
    *,
    current_label: str = "",
    previous_label: str = "",
) -> dict[str, MetricResult]:
    """Compute metrics for ``current`` and attach the change against ``previous``.

    This is the single function behind every "compared with last month" figure in
    the product, which is why the comparison lives with the metric rather than
    being recomputed by each caller.
    """
    current_metrics = compute_metrics(ctx, current)
    previous_metrics = compute_metrics(ctx, previous)

    for key, metric in current_metrics.items():
        prior = previous_metrics.get(key)
        if prior is None:
            continue
        metric.previous_value = prior.value
        metric.change_pct = pct_change(metric.value, prior.value)
        metric.direction = _direction(metric.change_pct)
        metric.period_start = current_label or None
        metric.period_end = previous_label or None
        metric.provenance = {
            **metric.provenance,
            "comparison": {
                "current_period": current_label,
                "previous_period": previous_label,
                "current_rows": len(current),
                "previous_rows": len(previous),
                "absolute_change": metric.value - prior.value,
            },
        }
    return current_metrics


def metric_dict(metrics: dict[str, MetricResult]) -> dict[str, Any]:
    return {key: metric.to_dict() for key, metric in metrics.items()}


def customer_breakdown(ctx: DatasetContext, frame: pd.DataFrame | None = None) -> dict[str, Any]:
    """Repeat vs one-time customers and revenue concentration."""
    df = ctx.df if frame is None else frame
    customer_col = ctx.customer_col
    if not customer_col or customer_col not in df.columns or df.empty:
        return {}

    order_col = ctx.order_col
    if order_col and order_col in df.columns:
        orders_per_customer = df.groupby(customer_col)[order_col].nunique()
    else:
        orders_per_customer = df.groupby(customer_col).size()

    total_customers = int(len(orders_per_customer))
    if total_customers == 0:
        return {}

    repeat = int((orders_per_customer > 1).sum())
    one_time = total_customers - repeat

    result: dict[str, Any] = {
        "total_customers": total_customers,
        "repeat_customers": repeat,
        "one_time_customers": one_time,
        "repeat_rate_pct": round(repeat / total_customers * 100, 2),
        "avg_orders_per_customer": round(float(orders_per_customer.mean()), 2),
        "customer_column": customer_col,
    }

    revenue_col = ctx.revenue_col
    if revenue_col and revenue_col in df.columns:
        revenue_per_customer = (
            df.groupby(customer_col)[revenue_col].sum().sort_values(ascending=False)
        )
        total_revenue = float(revenue_per_customer.sum())
        if total_revenue > 0:
            top_n = max(1, int(np.ceil(total_customers * 0.1)))
            top_share = float(revenue_per_customer.head(top_n).sum() / total_revenue * 100)
            result["top_10pct_revenue_share"] = round(top_share, 2)
            result["concentration_note"] = (
                f"The top {top_n:,} customers ({top_n / total_customers:.0%}) account for "
                f"{top_share:.1f}% of revenue."
            )
            result["top_customers"] = [
                {
                    "name": str(name),
                    "revenue": to_float(value),
                    "share_pct": round(float(value / total_revenue * 100), 2),
                    "orders": int(orders_per_customer.get(name, 0)),
                }
                for name, value in revenue_per_customer.head(10).items()
            ]
    return jsonable(result)
