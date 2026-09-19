"""Dataset profiling.

Turns a raw frame into everything the product needs to describe the upload back
to the user before any analysis runs: column roles, quality issues, the detected
time grain and date range, and — critically — *which analyses are possible*.

That last part matters. Most datasets cannot support every metric. Rather than
producing a zero or a blank card, we record the capability and the reason it is
unavailable, so the UI can explain itself.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from app.analytics.schema_inference import ColumnInference, coerce_numeric, infer_schema
from app.analytics.types import ROLE_LABELS, Grain, SemanticRole, jsonable

# How many rows a grain needs before trend analysis on it is meaningful.
MIN_PERIODS_FOR_TREND = 3
MIN_PERIODS_FOR_SEASONALITY = 24
MIN_POINTS_FOR_ANOMALY = 14


@dataclass(slots=True)
class DatasetProfile:
    row_count: int
    column_count: int
    duplicate_rows: int
    missing_cells: int
    missing_ratio: float
    columns: list[ColumnInference]
    role_map: dict[str, str]
    date_column: str | None
    date_min: str | None
    date_max: str | None
    span_days: int
    suggested_grain: str | None
    available_grains: list[str]
    capabilities: dict[str, dict[str, Any]]
    quality_issues: list[dict[str, Any]]
    entities: dict[str, str | None]
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return jsonable(
            {
                "row_count": self.row_count,
                "column_count": self.column_count,
                "duplicate_rows": self.duplicate_rows,
                "missing_cells": self.missing_cells,
                "missing_ratio": self.missing_ratio,
                "role_map": self.role_map,
                "date_column": self.date_column,
                "date_min": self.date_min,
                "date_max": self.date_max,
                "span_days": self.span_days,
                "suggested_grain": self.suggested_grain,
                "available_grains": self.available_grains,
                "capabilities": self.capabilities,
                "quality_issues": self.quality_issues,
                "entities": self.entities,
                "warnings": self.warnings,
            }
        )


def build_role_map(columns: list[ColumnInference]) -> dict[str, str]:
    return {col.name: col.role.value for col in columns}


def find_column(role_map: dict[str, str], *roles: SemanticRole) -> str | None:
    """First column carrying any of the given roles, in priority order."""
    for role in roles:
        for name, value in role_map.items():
            if value == role.value:
                return name
    return None


def find_columns(role_map: dict[str, str], *roles: SemanticRole) -> list[str]:
    wanted = {role.value for role in roles}
    return [name for name, value in role_map.items() if value in wanted]


def suggest_grain(span_days: int, distinct_days: int) -> tuple[str | None, list[str]]:
    """Pick a default time grain and list the grains with enough data.

    The rule is simply that a grain must yield at least three periods to be
    worth plotting — anything less is a pair of points, not a trend.
    """
    available: list[str] = []
    if distinct_days >= MIN_PERIODS_FOR_TREND:
        available.append(Grain.DAY.value)
    if span_days >= 7 * MIN_PERIODS_FOR_TREND:
        available.append(Grain.WEEK.value)
    if span_days >= 28 * MIN_PERIODS_FOR_TREND:
        available.append(Grain.MONTH.value)
    if span_days >= 90 * MIN_PERIODS_FOR_TREND:
        available.append(Grain.QUARTER.value)

    if span_days >= 400:
        suggested = Grain.MONTH.value
    elif span_days >= 90:
        suggested = Grain.WEEK.value if Grain.WEEK.value in available else Grain.DAY.value
    elif available:
        suggested = Grain.DAY.value
    else:
        suggested = None

    if suggested and suggested not in available:
        suggested = available[-1] if available else None
    return suggested, available


def _capability(ok: bool, reason: str = "", required: str = "") -> dict[str, Any]:
    return {"available": ok, "reason": reason, "required": required}


def assess_capabilities(
    role_map: dict[str, str], row_count: int, span_days: int, distinct_periods: int
) -> dict[str, dict[str, Any]]:
    """Decide which analyses this dataset can actually support, and why not."""
    has = lambda *roles: find_column(role_map, *roles) is not None  # noqa: E731

    revenue = has(SemanticRole.REVENUE)
    cost = has(SemanticRole.COST)
    profit = has(SemanticRole.PROFIT)
    quantity = has(SemanticRole.QUANTITY)
    price = has(SemanticRole.UNIT_PRICE)
    date = has(SemanticRole.ORDER_DATE, SemanticRole.DATE)
    order_id = has(SemanticRole.ORDER_ID)
    customer = has(SemanticRole.CUSTOMER_ID, SemanticRole.CUSTOMER)
    product = has(SemanticRole.PRODUCT, SemanticRole.PRODUCT_ID)
    region = has(SemanticRole.REGION, SemanticRole.COUNTRY, SemanticRole.CITY)

    capabilities: dict[str, dict[str, Any]] = {}

    # Revenue may be read directly or derived from quantity x unit price; both
    # count as "available", and every downstream capability that needs revenue
    # must respect the derived form too.
    has_revenue = revenue or (quantity and price)
    has_profit = profit or (has_revenue and cost)

    capabilities["revenue"] = _capability(
        has_revenue,
        "" if has_revenue else "No revenue or sales amount column was detected.",
        "A revenue column, or both a quantity and a unit price column.",
    )
    capabilities["profit"] = _capability(
        has_profit,
        "" if has_profit else
        "Profit needs either a profit column, or revenue (or quantity and unit "
        "price) together with a cost column.",
        "A profit column, or revenue plus cost.",
    )
    capabilities["orders"] = _capability(
        order_id or row_count > 0,
        "",
        "An order identifier column (otherwise each row counts as one order).",
    )
    capabilities["customers"] = _capability(
        customer,
        "" if customer else "No customer identifier column was detected.",
        "A customer ID or customer name column.",
    )
    capabilities["products"] = _capability(
        product,
        "" if product else "No product column was detected.",
        "A product name, SKU, or product ID column.",
    )
    capabilities["geography"] = _capability(
        region,
        "" if region else "No location column was detected.",
        "A region, country, or city column.",
    )
    capabilities["time_series"] = _capability(
        date and distinct_periods >= MIN_PERIODS_FOR_TREND,
        ""
        if (date and distinct_periods >= MIN_PERIODS_FOR_TREND)
        else (
            "No date column was detected."
            if not date
            else f"Only {distinct_periods} distinct time period(s) were found; "
                 f"at least {MIN_PERIODS_FOR_TREND} are needed for a trend."
        ),
        "A date column covering at least three periods.",
    )
    capabilities["anomaly_detection"] = _capability(
        date and distinct_periods >= MIN_POINTS_FOR_ANOMALY,
        ""
        if (date and distinct_periods >= MIN_POINTS_FOR_ANOMALY)
        else (
            "No date column was detected."
            if not date
            else f"Anomaly detection needs at least {MIN_POINTS_FOR_ANOMALY} time "
                 f"periods to establish a normal range; this dataset has {distinct_periods}."
        ),
        f"At least {MIN_POINTS_FOR_ANOMALY} time periods.",
    )
    capabilities["seasonality"] = _capability(
        date and distinct_periods >= MIN_PERIODS_FOR_SEASONALITY,
        ""
        if (date and distinct_periods >= MIN_PERIODS_FOR_SEASONALITY)
        else f"Seasonality needs at least {MIN_PERIODS_FOR_SEASONALITY} time periods; "
             f"this dataset has {distinct_periods}.",
        f"At least {MIN_PERIODS_FOR_SEASONALITY} time periods.",
    )
    capabilities["year_over_year"] = _capability(
        date and span_days >= 400,
        "" if (date and span_days >= 400) else
        f"Year-on-year comparison needs more than a year of history; this dataset "
        f"covers {span_days} day(s).",
        "More than 400 days of history.",
    )
    capabilities["forecast"] = _capability(
        date and distinct_periods >= 30,
        "" if (date and distinct_periods >= 30) else
        f"A forecast needs at least 30 historical periods; this dataset has "
        f"{distinct_periods}.",
        "At least 30 time periods.",
    )
    return capabilities


def detect_quality_issues(
    df: pd.DataFrame, columns: list[ColumnInference], duplicate_rows: int
) -> list[dict[str, Any]]:
    """Surface data problems that would otherwise silently distort results."""
    issues: list[dict[str, Any]] = []
    total = len(df)
    if total == 0:
        return issues

    if duplicate_rows:
        issues.append(
            {
                "kind": "duplicate_rows",
                "severity": "medium" if duplicate_rows > total * 0.01 else "low",
                "title": f"{duplicate_rows:,} duplicate row(s)",
                "detail": (
                    f"{duplicate_rows:,} rows ({duplicate_rows / total:.1%}) are exact "
                    "copies of another row. These are included in totals, which may "
                    "overstate them."
                ),
                "column": None,
            }
        )

    for col in columns:
        null_ratio = col.null_count / total if total else 0.0
        if null_ratio >= 0.5:
            issues.append(
                {
                    "kind": "high_missing",
                    "severity": "high" if null_ratio >= 0.9 else "medium",
                    "title": f"'{col.name}' is {null_ratio:.0%} empty",
                    "detail": (
                        f"{col.null_count:,} of {total:,} rows have no value for "
                        f"'{col.name}'. Metrics based on this column cover only the "
                        "rows that do have a value."
                    ),
                    "column": col.name,
                }
            )
        elif null_ratio >= 0.1:
            issues.append(
                {
                    "kind": "missing_values",
                    "severity": "low",
                    "title": f"'{col.name}' has missing values",
                    "detail": f"{col.null_count:,} rows ({null_ratio:.1%}) are missing a value.",
                    "column": col.name,
                }
            )

        if col.role.is_monetary and col.stats.get("negative_count", 0) > 0:
            negatives = col.stats["negative_count"]
            issues.append(
                {
                    "kind": "negative_values",
                    "severity": "low",
                    "title": f"'{col.name}' contains negative values",
                    "detail": (
                        f"{negatives:,} rows have a negative {col.name}. These are often "
                        "refunds or credits, and they reduce totals."
                    ),
                    "column": col.name,
                }
            )

        if col.role == SemanticRole.UNKNOWN:
            issues.append(
                {
                    "kind": "unrecognised_column",
                    "severity": "low",
                    "title": f"'{col.name}' was not recognised",
                    "detail": (
                        "We could not tell what this column represents, so it is not used "
                        "in the analysis. You can assign it a meaning in Review fields."
                    ),
                    "column": col.name,
                }
            )

    return issues


def build_preview(df: pd.DataFrame, limit: int = 25) -> list[dict[str, Any]]:
    """A JSON-safe sample of the first rows, for the upload preview table."""
    head = df.head(limit)
    records: list[dict[str, Any]] = []
    for _, row in head.iterrows():
        record: dict[str, Any] = {}
        for column in df.columns:
            value = row[column]
            if pd.isna(value):
                record[str(column)] = None
            elif isinstance(value, (np.integer,)):
                record[str(column)] = int(value)
            elif isinstance(value, (np.floating,)):
                record[str(column)] = float(value)
            elif isinstance(value, (pd.Timestamp,)):
                record[str(column)] = value.isoformat()
            else:
                text = str(value)
                record[str(column)] = text if len(text) <= 200 else text[:197] + "…"
        records.append(record)
    return records


def profile_dataset(df: pd.DataFrame, warnings: list[str] | None = None) -> DatasetProfile:
    """Produce the full profile for an uploaded dataset."""
    columns = infer_schema(df)
    role_map = build_role_map(columns)

    total_rows = len(df)
    duplicate_rows = int(df.duplicated().sum())
    missing_cells = int(df.isna().sum().sum())
    total_cells = total_rows * max(len(df.columns), 1)

    date_column = find_column(role_map, SemanticRole.ORDER_DATE, SemanticRole.DATE)
    date_min = date_max = None
    span_days = 0
    distinct_days = 0

    if date_column:
        parsed = pd.to_datetime(df[date_column], errors="coerce", format="mixed")
        valid = parsed.dropna()
        if not valid.empty:
            date_min = valid.min().isoformat()
            date_max = valid.max().isoformat()
            span_days = int((valid.max() - valid.min()).days)
            distinct_days = int(valid.dt.normalize().nunique())

    suggested, available = suggest_grain(span_days, distinct_days)

    # Capability checks are judged against the grain we would actually use.
    if suggested == Grain.MONTH.value:
        distinct_periods = max(1, span_days // 30)
    elif suggested == Grain.WEEK.value:
        distinct_periods = max(1, span_days // 7)
    else:
        distinct_periods = distinct_days

    capabilities = assess_capabilities(role_map, total_rows, span_days, distinct_periods)
    issues = detect_quality_issues(df, columns, duplicate_rows)

    entities = {
        "date": date_column,
        "revenue": find_column(role_map, SemanticRole.REVENUE),
        "cost": find_column(role_map, SemanticRole.COST),
        "profit": find_column(role_map, SemanticRole.PROFIT),
        "quantity": find_column(role_map, SemanticRole.QUANTITY),
        "unit_price": find_column(role_map, SemanticRole.UNIT_PRICE),
        "discount": find_column(role_map, SemanticRole.DISCOUNT),
        "order_id": find_column(role_map, SemanticRole.ORDER_ID),
        "customer": find_column(role_map, SemanticRole.CUSTOMER_ID, SemanticRole.CUSTOMER),
        "product": find_column(role_map, SemanticRole.PRODUCT, SemanticRole.PRODUCT_ID),
        "category": find_column(role_map, SemanticRole.CATEGORY),
        "region": find_column(role_map, SemanticRole.REGION, SemanticRole.COUNTRY, SemanticRole.CITY),
        "channel": find_column(role_map, SemanticRole.CHANNEL),
        "status": find_column(role_map, SemanticRole.STATUS),
        "inventory": find_column(role_map, SemanticRole.INVENTORY),
    }

    return DatasetProfile(
        row_count=total_rows,
        column_count=len(df.columns),
        duplicate_rows=duplicate_rows,
        missing_cells=missing_cells,
        missing_ratio=round(missing_cells / total_cells, 4) if total_cells else 0.0,
        columns=columns,
        role_map=role_map,
        date_column=date_column,
        date_min=date_min,
        date_max=date_max,
        span_days=span_days,
        suggested_grain=suggested,
        available_grains=available,
        capabilities=capabilities,
        quality_issues=issues,
        entities=entities,
        warnings=list(warnings or []),
    )


def column_summary(col: ColumnInference) -> dict[str, Any]:
    """Serialise a column inference for the 'Review detected fields' screen."""
    return jsonable(
        {
            "name": col.name,
            "position": col.position,
            "data_type": col.data_type,
            "semantic_role": col.role.value,
            "role_label": ROLE_LABELS.get(col.role.value, col.role.value),
            "confidence": col.confidence,
            "null_count": col.null_count,
            "unique_count": col.unique_count,
            "stats": col.stats,
            "candidates": [
                {**c, "label": ROLE_LABELS.get(c["role"], c["role"])} for c in col.candidates
            ],
        }
    )


def prepare_frame(df: pd.DataFrame, role_map: dict[str, str]) -> pd.DataFrame:
    """Coerce columns to their analytical types once, up front.

    Every downstream calculation assumes dates are datetimes and measures are
    floats. Doing this conversion in one place means a malformed value produces
    one NaN here rather than a different failure in each analysis module.
    """
    out = df.copy()
    for name, role_value in role_map.items():
        if name not in out.columns:
            continue
        role = SemanticRole(role_value)
        if role.is_temporal:
            out[name] = pd.to_datetime(out[name], errors="coerce", format="mixed")
        elif role.is_measure:
            parsed, _, _ = coerce_numeric(out[name])
            out[name] = parsed
        elif role.is_dimension:
            out[name] = out[name].astype("object").where(out[name].notna(), None)
    return out
