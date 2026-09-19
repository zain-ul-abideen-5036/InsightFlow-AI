"""The analysis context.

Every analytics function takes a :class:`DatasetContext` rather than a bare
DataFrame. The context carries the resolved semantic mapping, so no downstream
module ever has to guess which column holds revenue — and no module needs to be
rewritten when the user corrects a field in the review step.

It also owns two derivations that would otherwise be duplicated everywhere:

* **Derived revenue** — when a dataset has ``quantity`` and ``unit_price`` but no
  revenue column, revenue is computed as their product (less discount, when the
  discount column is an amount).
* **Derived profit** — revenue minus cost when no profit column exists.

Both are recorded in :attr:`DatasetContext.derivations`, so the UI can tell the
user that a figure was calculated rather than read from their file.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from app.analytics.profiling import find_column, prepare_frame
from app.analytics.types import Grain, SemanticRole

DERIVED_REVENUE = "__derived_revenue"
DERIVED_PROFIT = "__derived_profit"


@dataclass(slots=True)
class DatasetContext:
    """A frame plus the meaning of its columns."""

    df: pd.DataFrame
    role_map: dict[str, str]
    currency: str = "USD"
    dataset_name: str = ""
    dataset_id: str | None = None
    grain: Grain = Grain.DAY
    derivations: dict[str, str] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    # -- Column accessors --------------------------------------------------

    @property
    def date_col(self) -> str | None:
        return find_column(self.role_map, SemanticRole.ORDER_DATE, SemanticRole.DATE)

    @property
    def revenue_col(self) -> str | None:
        explicit = find_column(self.role_map, SemanticRole.REVENUE)
        if explicit:
            return explicit
        return DERIVED_REVENUE if DERIVED_REVENUE in self.df.columns else None

    @property
    def cost_col(self) -> str | None:
        return find_column(self.role_map, SemanticRole.COST)

    @property
    def profit_col(self) -> str | None:
        explicit = find_column(self.role_map, SemanticRole.PROFIT)
        if explicit:
            return explicit
        return DERIVED_PROFIT if DERIVED_PROFIT in self.df.columns else None

    @property
    def quantity_col(self) -> str | None:
        return find_column(self.role_map, SemanticRole.QUANTITY)

    @property
    def unit_price_col(self) -> str | None:
        return find_column(self.role_map, SemanticRole.UNIT_PRICE)

    @property
    def discount_col(self) -> str | None:
        return find_column(self.role_map, SemanticRole.DISCOUNT)

    @property
    def order_col(self) -> str | None:
        return find_column(self.role_map, SemanticRole.ORDER_ID)

    @property
    def customer_col(self) -> str | None:
        return find_column(self.role_map, SemanticRole.CUSTOMER_ID, SemanticRole.CUSTOMER)

    @property
    def product_col(self) -> str | None:
        return find_column(self.role_map, SemanticRole.PRODUCT, SemanticRole.PRODUCT_ID)

    @property
    def category_col(self) -> str | None:
        return find_column(self.role_map, SemanticRole.CATEGORY)

    @property
    def region_col(self) -> str | None:
        return find_column(
            self.role_map, SemanticRole.REGION, SemanticRole.COUNTRY, SemanticRole.CITY
        )

    @property
    def channel_col(self) -> str | None:
        return find_column(self.role_map, SemanticRole.CHANNEL)

    @property
    def status_col(self) -> str | None:
        return find_column(self.role_map, SemanticRole.STATUS)

    @property
    def inventory_col(self) -> str | None:
        return find_column(self.role_map, SemanticRole.INVENTORY)

    @property
    def row_count(self) -> int:
        return len(self.df)

    def dimensions(self) -> dict[str, str]:
        """Dimension columns available for breakdowns, keyed by a stable name."""
        candidates = {
            "product": self.product_col,
            "category": self.category_col,
            "region": self.region_col,
            "channel": self.channel_col,
            "status": self.status_col,
            "customer": self.customer_col,
        }
        out: dict[str, str] = {}
        for key, column in candidates.items():
            if not column or column not in self.df.columns:
                continue
            # A dimension with one value explains nothing; one with thousands of
            # values (a customer id, typically) makes an unreadable breakdown.
            distinct = int(self.df[column].nunique(dropna=True))
            if 2 <= distinct <= 2000:
                out[key] = column
        return out

    def measures(self) -> dict[str, str]:
        out: dict[str, str] = {}
        for key, column in (
            ("revenue", self.revenue_col),
            ("profit", self.profit_col),
            ("cost", self.cost_col),
            ("quantity", self.quantity_col),
        ):
            if column and column in self.df.columns:
                out[key] = column
        return out

    def label_for(self, column: str) -> str:
        """A human label for a column, including derived ones."""
        if column == DERIVED_REVENUE:
            return "Revenue (calculated)"
        if column == DERIVED_PROFIT:
            return "Profit (calculated)"
        return column

    def dated(self) -> pd.DataFrame:
        """Rows with a usable date, indexed by it. Empty frame when undated."""
        date_col = self.date_col
        if not date_col or date_col not in self.df.columns:
            return self.df.iloc[0:0]
        frame = self.df[self.df[date_col].notna()]
        return frame

    def date_range(self) -> tuple[pd.Timestamp | None, pd.Timestamp | None]:
        frame = self.dated()
        date_col = self.date_col
        if frame.empty or not date_col:
            return None, None
        return frame[date_col].min(), frame[date_col].max()


def build_context(
    df: pd.DataFrame,
    role_map: dict[str, str],
    *,
    currency: str = "USD",
    dataset_name: str = "",
    dataset_id: str | None = None,
    grain: Grain = Grain.DAY,
) -> DatasetContext:
    """Prepare a frame for analysis and attach its semantic mapping."""
    prepared = prepare_frame(df, role_map)
    derivations: dict[str, str] = {}
    notes: list[str] = []

    revenue_col = find_column(role_map, SemanticRole.REVENUE)
    quantity_col = find_column(role_map, SemanticRole.QUANTITY)
    price_col = find_column(role_map, SemanticRole.UNIT_PRICE)
    discount_col = find_column(role_map, SemanticRole.DISCOUNT)
    cost_col = find_column(role_map, SemanticRole.COST)
    profit_col = find_column(role_map, SemanticRole.PROFIT)

    # -- Derive revenue ----------------------------------------------------
    if not revenue_col and quantity_col and price_col:
        gross = prepared[quantity_col].astype("float64") * prepared[price_col].astype("float64")
        formula = f"{quantity_col} × {price_col}"
        if discount_col and discount_col in prepared.columns:
            discount = prepared[discount_col].astype("float64").fillna(0.0)
            finite = discount[np.isfinite(discount)]
            # A discount column is either a rate (0.15) or an amount (12.50).
            # Treating one as the other is the single easiest way to produce a
            # wrong revenue figure, so we decide explicitly.
            looks_like_rate = bool(len(finite) and finite.between(0, 1).mean() > 0.95)
            if looks_like_rate:
                gross = gross * (1 - discount.clip(0, 1))
                formula += f" × (1 - {discount_col})"
            else:
                gross = gross - discount
                formula += f" - {discount_col}"
        prepared[DERIVED_REVENUE] = gross
        derivations["revenue"] = formula
        notes.append(
            f"Revenue was calculated as {formula} because no revenue column was found."
        )

    # -- Derive profit -----------------------------------------------------
    effective_revenue = revenue_col or (DERIVED_REVENUE if DERIVED_REVENUE in prepared else None)
    if not profit_col and effective_revenue and cost_col:
        prepared[DERIVED_PROFIT] = (
            prepared[effective_revenue].astype("float64") - prepared[cost_col].astype("float64")
        )
        label = "Revenue" if revenue_col is None else revenue_col
        derivations["profit"] = f"{label} - {cost_col}"
        notes.append(
            f"Profit was calculated as {derivations['profit']} because no profit column was found."
        )

    return DatasetContext(
        df=prepared,
        role_map=role_map,
        currency=currency,
        dataset_name=dataset_name,
        dataset_id=dataset_id,
        grain=grain,
        derivations=derivations,
        notes=notes,
    )


def safe_ratio(numerator: float, denominator: float) -> float | None:
    """Division that returns ``None`` instead of an infinity or a NaN."""
    if denominator in (0, None) or (isinstance(denominator, float) and not np.isfinite(denominator)):
        return None
    result = numerator / denominator
    return float(result) if np.isfinite(result) else None


def pct_change(current: float, previous: float) -> float | None:
    """Percentage change, expressed as a percentage (not a fraction).

    Returns ``None`` when the baseline is zero: "infinite growth" is not a
    number a business person can act on, and rendering it would be misleading.
    """
    if previous is None or current is None:
        return None
    if previous == 0:
        return None
    change = (current - previous) / abs(previous) * 100.0
    # Rounded at source: 4 decimal places is far beyond display precision but
    # removes float noise like 19.876472838463854 from every downstream payload.
    return round(float(change), 4) if np.isfinite(change) else None


def to_float(value: Any) -> float | None:
    """Coerce anything to a finite float, or ``None``."""
    if value is None:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if np.isfinite(result) else None
