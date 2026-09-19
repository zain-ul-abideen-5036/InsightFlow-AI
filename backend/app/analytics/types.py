"""Shared vocabulary for the analytics engine.

Two ideas carry most of the weight here:

``SemanticRole``
    What a column *means* in business terms, as opposed to what dtype pandas
    inferred. The whole engine is written against roles, never against column
    names, which is why it works on an arbitrary user upload.

``Evidence``
    A single computed figure together with everything needed to verify it: the
    calculation that produced it, the column it came from, the period it covers,
    and how many rows contributed. Nothing reaches the AI layer that is not
    expressible as evidence.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Any


class SemanticRole(str, Enum):
    """Business meaning of a column."""

    # Identity
    ORDER_ID = "order_id"
    CUSTOMER_ID = "customer_id"
    PRODUCT_ID = "product_id"
    IDENTIFIER = "identifier"

    # Time
    DATE = "date"
    ORDER_DATE = "order_date"

    # Money
    REVENUE = "revenue"
    COST = "cost"
    PROFIT = "profit"
    UNIT_PRICE = "unit_price"
    DISCOUNT = "discount"
    EXPENSE = "expense"
    CURRENCY = "currency"

    # Quantities
    QUANTITY = "quantity"
    INVENTORY = "inventory"
    NUMERIC = "numeric"
    PERCENTAGE = "percentage"

    # Dimensions
    PRODUCT = "product"
    CATEGORY = "category"
    REGION = "region"
    COUNTRY = "country"
    CITY = "city"
    CHANNEL = "channel"
    CUSTOMER = "customer"
    SEGMENT = "segment"
    STATUS = "status"
    PAYMENT_METHOD = "payment_method"
    CATEGORICAL = "categorical"

    # Other
    BOOLEAN = "boolean"
    TEXT = "text"
    EMAIL = "email"
    PHONE = "phone"
    UNKNOWN = "unknown"

    @property
    def is_monetary(self) -> bool:
        return self in _MONETARY_ROLES

    @property
    def is_dimension(self) -> bool:
        return self in _DIMENSION_ROLES

    @property
    def is_measure(self) -> bool:
        return self in _MEASURE_ROLES

    @property
    def is_temporal(self) -> bool:
        return self in {SemanticRole.DATE, SemanticRole.ORDER_DATE}


_MONETARY_ROLES = {
    SemanticRole.REVENUE,
    SemanticRole.COST,
    SemanticRole.PROFIT,
    SemanticRole.UNIT_PRICE,
    SemanticRole.DISCOUNT,
    SemanticRole.EXPENSE,
}

_MEASURE_ROLES = _MONETARY_ROLES | {
    SemanticRole.QUANTITY,
    SemanticRole.INVENTORY,
    SemanticRole.NUMERIC,
    SemanticRole.PERCENTAGE,
}

_DIMENSION_ROLES = {
    SemanticRole.PRODUCT,
    SemanticRole.CATEGORY,
    SemanticRole.REGION,
    SemanticRole.COUNTRY,
    SemanticRole.CITY,
    SemanticRole.CHANNEL,
    SemanticRole.CUSTOMER,
    SemanticRole.SEGMENT,
    SemanticRole.STATUS,
    SemanticRole.PAYMENT_METHOD,
    SemanticRole.CATEGORICAL,
}


# Human-facing labels. Used by the "Review detected fields" step, so they must
# read naturally to someone with no analytics background.
ROLE_LABELS: dict[str, str] = {
    SemanticRole.ORDER_ID.value: "Order ID",
    SemanticRole.CUSTOMER_ID.value: "Customer ID",
    SemanticRole.PRODUCT_ID.value: "Product ID",
    SemanticRole.IDENTIFIER.value: "Identifier",
    SemanticRole.DATE.value: "Date",
    SemanticRole.ORDER_DATE.value: "Order date",
    SemanticRole.REVENUE.value: "Revenue",
    SemanticRole.COST.value: "Cost",
    SemanticRole.PROFIT.value: "Profit",
    SemanticRole.UNIT_PRICE.value: "Unit price",
    SemanticRole.DISCOUNT.value: "Discount",
    SemanticRole.EXPENSE.value: "Expense",
    SemanticRole.CURRENCY.value: "Currency",
    SemanticRole.QUANTITY.value: "Quantity",
    SemanticRole.INVENTORY.value: "Inventory / stock",
    SemanticRole.NUMERIC.value: "Number",
    SemanticRole.PERCENTAGE.value: "Percentage",
    SemanticRole.PRODUCT.value: "Product",
    SemanticRole.CATEGORY.value: "Category",
    SemanticRole.REGION.value: "Region",
    SemanticRole.COUNTRY.value: "Country",
    SemanticRole.CITY.value: "City",
    SemanticRole.CHANNEL.value: "Sales channel",
    SemanticRole.CUSTOMER.value: "Customer name",
    SemanticRole.SEGMENT.value: "Segment",
    SemanticRole.STATUS.value: "Status",
    SemanticRole.PAYMENT_METHOD.value: "Payment method",
    SemanticRole.CATEGORICAL.value: "Category (generic)",
    SemanticRole.BOOLEAN.value: "Yes / no",
    SemanticRole.TEXT.value: "Text",
    SemanticRole.EMAIL.value: "Email",
    SemanticRole.PHONE.value: "Phone",
    SemanticRole.UNKNOWN.value: "Not detected",
}


class Grain(str, Enum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"
    QUARTER = "quarter"

    @property
    def pandas_freq(self) -> str:
        return {
            Grain.DAY: "D",
            Grain.WEEK: "W-MON",
            Grain.MONTH: "MS",
            Grain.QUARTER: "QS",
        }[self]

    @property
    def label(self) -> str:
        return {
            Grain.DAY: "daily",
            Grain.WEEK: "weekly",
            Grain.MONTH: "monthly",
            Grain.QUARTER: "quarterly",
        }[self]


class EvidenceKind(str, Enum):
    """Epistemic status of a finding. The UI renders each differently."""

    OBSERVATION = "observation"
    STATISTICAL = "statistical"
    CORRELATION = "correlation"
    COMPARISON = "comparison"
    DATA_QUALITY = "data_quality"


class Unit(str, Enum):
    CURRENCY = "currency"
    NUMBER = "number"
    PERCENT = "percent"
    COUNT = "count"
    RATIO = "ratio"
    DAYS = "days"


@dataclass(slots=True)
class Evidence:
    """One verifiable figure.

    Every number the AI is allowed to mention must appear in an ``Evidence``
    instance first. ``calculation`` names the deterministic function that
    produced it, so the UI can show the user exactly how it was derived.
    """

    label: str
    value: float | int | str | None
    unit: Unit = Unit.NUMBER
    kind: EvidenceKind = EvidenceKind.OBSERVATION
    calculation: str = ""
    column: str | None = None
    period: str | None = None
    row_count: int | None = None
    detail: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "value": _clean_number(self.value),
            "unit": self.unit.value,
            "kind": self.kind.value,
            "calculation": self.calculation,
            "column": self.column,
            "period": self.period,
            "row_count": self.row_count,
            "detail": self.detail,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Evidence":
        """Rebuild from the stored form.

        The inverse of :meth:`to_dict`, so an investigation persisted as JSON
        can be rehydrated and narrated later without recomputing it. Unknown
        unit or kind values fall back to the defaults rather than raising: a row
        written by an older version of the analytics engine must still load.
        """

        def _enum(enum_cls, raw, default):  # type: ignore[no-untyped-def]
            try:
                return enum_cls(raw)
            except ValueError:
                return default

        return cls(
            label=str(data.get("label", "")),
            value=data.get("value"),
            unit=_enum(Unit, data.get("unit"), Unit.NUMBER),
            kind=_enum(EvidenceKind, data.get("kind"), EvidenceKind.OBSERVATION),
            calculation=str(data.get("calculation") or ""),
            column=data.get("column"),
            period=data.get("period"),
            row_count=data.get("row_count"),
            detail=data.get("detail") or {},
        )


@dataclass(slots=True)
class DataSufficiency:
    """Whether an analysis is possible, and if not, why — in plain English."""

    ok: bool
    reason: str = ""
    required: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "reason": self.reason, "required": self.required}


def _clean_number(value: Any) -> Any:
    """JSON has no NaN or Infinity. Convert them to ``None`` at the boundary."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def jsonable(value: Any) -> Any:
    """Recursively make a structure safe for JSON serialisation."""
    import numpy as np
    import pandas as pd

    if value is None:
        return None
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(v) for v in value]
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        f = float(value)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, pd.Timestamp):
        return None if pd.isna(value) else value.isoformat()
    if value is pd.NaT:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Evidence):
        return value.to_dict()
    if isinstance(value, float):
        return None if (math.isnan(value) or math.isinf(value)) else value
    return value
