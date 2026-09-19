"""Semantic schema inference.

Given an arbitrary spreadsheet, decide what each column *means* in business
terms. Two independent signals are combined:

1. **Name evidence** — normalised column-name patterns (``order_date``,
   ``total_revenue``, ``customer id``, ``qty``…).
2. **Value evidence** — dtype, cardinality, parseability as a date, numeric
   distribution, currency symbols, and value vocabulary (``shipped``,
   ``cancelled``, ``credit card``…).

Neither alone is trustworthy: a column called ``value`` could be anything, and a
numeric column with 4-digit values could be a year or a price. Requiring the two
signals to agree is what makes the result good enough to show the user — and the
user can always override it, because we never silently assume a schema.

The output is intentionally conservative: when confidence is low we return a
generic role (``numeric``, ``categorical``) rather than guessing something
specific and wrong.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from app.analytics.types import SemanticRole

# --------------------------------------------------------------------------- #
# Name patterns
# --------------------------------------------------------------------------- #

# Ordered most-specific first: the first match wins, so `unit_price` must be
# tested before the generic `price`, and `order_date` before `date`.
NAME_PATTERNS: list[tuple[str, SemanticRole, float]] = [
    # Identifiers
    (r"^(order|invoice|transaction|txn|sale|receipt)[_\s-]*(id|no|num|number|ref|code)$", SemanticRole.ORDER_ID, 0.95),
    (r"^(customer|client|buyer|user|account)[_\s-]*(id|no|num|number|code|key)$", SemanticRole.CUSTOMER_ID, 0.95),
    (r"^(product|item|sku|article)[_\s-]*(id|no|num|number|code|key)$", SemanticRole.PRODUCT_ID, 0.95),
    (r"^sku$", SemanticRole.PRODUCT_ID, 0.9),
    # Dates
    (r"^(order|purchase|sale|transaction|invoice|booking)[_\s-]*(date|datetime|time|at|on|ts)$", SemanticRole.ORDER_DATE, 0.95),
    (r"^(date|datetime|timestamp|day|period|month)$", SemanticRole.DATE, 0.85),
    (r"(date|datetime|_at$|timestamp)", SemanticRole.DATE, 0.7),
    # Money
    (r"^(unit[_\s-]*price|price[_\s-]*per[_\s-]*unit|rate|list[_\s-]*price|msrp)$", SemanticRole.UNIT_PRICE, 0.9),
    (r"^(revenue|sales|turnover|gross[_\s-]*sales|net[_\s-]*sales|total[_\s-]*sales|amount|total|gmv|line[_\s-]*total|order[_\s-]*value|sales[_\s-]*amount|total[_\s-]*amount|net[_\s-]*revenue|gross[_\s-]*revenue)$", SemanticRole.REVENUE, 0.92),
    (r"(revenue|turnover|gmv)", SemanticRole.REVENUE, 0.8),
    (r"^(cost|cogs|cost[_\s-]*of[_\s-]*goods|unit[_\s-]*cost|total[_\s-]*cost|purchase[_\s-]*cost|landed[_\s-]*cost)$", SemanticRole.COST, 0.92),
    (r"(^|_)(cogs)($|_)", SemanticRole.COST, 0.9),
    (r"^(profit|margin|gross[_\s-]*profit|net[_\s-]*profit|earnings|contribution)$", SemanticRole.PROFIT, 0.92),
    (r"^(discount|discount[_\s-]*amount|discount[_\s-]*value|promo|markdown|rebate)$", SemanticRole.DISCOUNT, 0.9),
    (r"^(expense|expenses|spend|spending|outgoing|cost[_\s-]*centre)$", SemanticRole.EXPENSE, 0.9),
    (r"^(currency|currency[_\s-]*code|ccy)$", SemanticRole.CURRENCY, 0.9),
    (r"(price|amount|value|subtotal|total)", SemanticRole.REVENUE, 0.55),
    # Quantities
    (r"^(quantity|qty|units|unit[_\s-]*sold|units[_\s-]*sold|item[_\s-]*count|volume|count)$", SemanticRole.QUANTITY, 0.92),
    (r"^(stock|inventory|on[_\s-]*hand|available|stock[_\s-]*level|units[_\s-]*available|inventory[_\s-]*level|in[_\s-]*stock)$", SemanticRole.INVENTORY, 0.92),
    (r"(stock|inventory)", SemanticRole.INVENTORY, 0.75),
    # Dimensions
    (r"^(product|product[_\s-]*name|item|item[_\s-]*name|title|article[_\s-]*name)$", SemanticRole.PRODUCT, 0.92),
    (r"^(category|product[_\s-]*category|type|product[_\s-]*type|department|class|group|family)$", SemanticRole.CATEGORY, 0.88),
    (r"^(region|area|territory|zone|state|province|market)$", SemanticRole.REGION, 0.92),
    (r"^(country|nation|country[_\s-]*code)$", SemanticRole.COUNTRY, 0.92),
    (r"^(city|town|location|locality)$", SemanticRole.CITY, 0.88),
    (r"^(channel|sales[_\s-]*channel|source|medium|platform|marketplace|store)$", SemanticRole.CHANNEL, 0.88),
    (r"^(customer|customer[_\s-]*name|client[_\s-]*name|buyer|account[_\s-]*name)$", SemanticRole.CUSTOMER, 0.9),
    (r"^(segment|tier|cohort|customer[_\s-]*type|customer[_\s-]*segment|plan)$", SemanticRole.SEGMENT, 0.88),
    (r"^(status|order[_\s-]*status|state|fulfilment[_\s-]*status|fulfillment[_\s-]*status|payment[_\s-]*status)$", SemanticRole.STATUS, 0.9),
    (r"^(payment|payment[_\s-]*method|payment[_\s-]*type|pay[_\s-]*method|tender)$", SemanticRole.PAYMENT_METHOD, 0.9),
    # Contact
    (r"(email|e[_\s-]*mail)", SemanticRole.EMAIL, 0.9),
    (r"^(phone|mobile|telephone|contact[_\s-]*number)$", SemanticRole.PHONE, 0.88),
    # Generic identifier catch-all — deliberately last.
    (r"(^|_)(id|uuid|guid|key|code|ref)($|_)", SemanticRole.IDENTIFIER, 0.6),
]

# Value vocabularies: strong evidence independent of the column name.
STATUS_VALUES = {
    "completed", "complete", "pending", "cancelled", "canceled", "shipped",
    "delivered", "returned", "refunded", "processing", "failed", "paid",
    "unpaid", "open", "closed", "active", "inactive", "fulfilled",
    "unfulfilled", "on hold", "draft", "confirmed", "dispatched",
}
PAYMENT_VALUES = {
    "credit card", "debit card", "card", "paypal", "cash", "cash on delivery",
    "cod", "bank transfer", "transfer", "stripe", "apple pay", "google pay",
    "wallet", "upi", "crypto", "cheque", "check", "klarna", "afterpay",
}
BOOLEAN_VALUES = {"true", "false", "yes", "no", "y", "n", "t", "f", "0", "1"}
CURRENCY_CODES = {
    "usd", "eur", "gbp", "pkr", "inr", "aed", "cad", "aud", "jpy", "cny",
    "sar", "try", "zar", "brl", "mxn", "sgd", "chf", "sek", "nok", "nzd",
}
CURRENCY_SYMBOLS = "$€£¥₹₨₪₺₦₱฿₩"

_CURRENCY_RE = re.compile(rf"^\s*[-+(]?\s*[{re.escape(CURRENCY_SYMBOLS)}]\s*[\d,.\s]+\)?\s*$")
_PERCENT_RE = re.compile(r"^\s*-?[\d.,]+\s*%\s*$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", re.I)

# Formats tried explicitly before falling back to pandas' general parser, which
# is both slower and more willing to accept nonsense.
DATE_FORMATS = [
    "%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%m-%d-%Y",
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M",
    "%d/%m/%Y %H:%M", "%m/%d/%Y %H:%M:%S", "%d %b %Y", "%d %B %Y",
    "%b %d, %Y", "%B %d, %Y", "%Y-%m", "%m/%Y",
]


@dataclass(slots=True)
class ColumnInference:
    name: str
    position: int
    data_type: str
    role: SemanticRole
    confidence: float
    null_count: int
    unique_count: int
    stats: dict[str, Any]
    candidates: list[dict[str, Any]]


def normalize_name(name: str) -> str:
    """``"Order Date (UTC)"`` -> ``"order_date_utc"``."""
    text = str(name).strip().lower()
    text = re.sub(r"[^\w\s]+", " ", text)
    text = re.sub(r"[\s_]+", "_", text).strip("_")
    return text


def _name_candidates(column_name: str) -> list[tuple[SemanticRole, float]]:
    normalized = normalize_name(column_name)
    if not normalized:
        return []
    out: list[tuple[SemanticRole, float]] = []
    seen: set[SemanticRole] = set()
    for pattern, role, score in NAME_PATTERNS:
        if role in seen:
            continue
        if re.search(pattern, normalized):
            out.append((role, score))
            seen.add(role)
    return out


def _try_parse_dates(series: pd.Series) -> tuple[pd.Series | None, float, str | None]:
    """Attempt date parsing; return (parsed, success_ratio, format_used)."""
    sample = series.dropna().astype(str).str.strip()
    sample = sample[sample != ""]
    if sample.empty:
        return None, 0.0, None

    probe = sample.head(400)

    # Pure integers are almost never dates, but they *are* often years or IDs.
    # Only accept them as epoch timestamps when the magnitude is unambiguous.
    if probe.str.fullmatch(r"-?\d+").all():
        numeric = pd.to_numeric(probe, errors="coerce")
        if numeric.between(1_000_000_000, 4_000_000_000).mean() > 0.95:
            parsed = pd.to_datetime(pd.to_numeric(series, errors="coerce"), unit="s", errors="coerce")
            return parsed, float(parsed.notna().mean()), "epoch_seconds"
        return None, 0.0, None

    for fmt in DATE_FORMATS:
        try:
            probe_parsed = pd.to_datetime(probe, format=fmt, errors="coerce")
        except (ValueError, TypeError):
            continue
        if probe_parsed.notna().mean() >= 0.9:
            full = pd.to_datetime(series, format=fmt, errors="coerce")
            return full, float(full.notna().mean()), fmt

    # General fallback. `format="mixed"` avoids pandas silently applying one
    # inferred format to rows that do not match it.
    try:
        probe_parsed = pd.to_datetime(probe, errors="coerce", format="mixed", dayfirst=False)
    except (ValueError, TypeError):
        return None, 0.0, None
    if probe_parsed.notna().mean() >= 0.85:
        full = pd.to_datetime(series, errors="coerce", format="mixed", dayfirst=False)
        return full, float(full.notna().mean()), "mixed"
    return None, 0.0, None


def coerce_numeric(series: pd.Series) -> tuple[pd.Series, float, dict[str, Any]]:
    """Parse a possibly-formatted numeric column.

    Handles thousands separators, currency symbols, percentages, and accounting
    negatives (``(1,200)``). Returns the parsed series, the success ratio, and
    flags describing what formatting was observed.
    """
    flags = {"currency_symbol": False, "percent": False, "accounting_negative": False}

    if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series):
        return series.astype("float64"), float(series.notna().mean()), flags

    text = series.dropna().astype(str).str.strip()
    text = text[text != ""]
    if text.empty:
        return pd.Series(dtype="float64", index=series.index), 0.0, flags

    probe = text.head(400)
    if probe.str.contains(f"[{re.escape(CURRENCY_SYMBOLS)}]").mean() > 0.3:
        flags["currency_symbol"] = True
    if probe.str.contains("%").mean() > 0.5:
        flags["percent"] = True
    if probe.str.match(r"^\(.*\)$").mean() > 0.05:
        flags["accounting_negative"] = True

    cleaned = series.astype(str).str.strip()
    cleaned = cleaned.str.replace(rf"[{re.escape(CURRENCY_SYMBOLS)}]", "", regex=True)
    cleaned = cleaned.str.replace(r"[,\s ]", "", regex=True)
    cleaned = cleaned.str.replace("%", "", regex=False)
    # (1,200) means -1200 in accounting exports.
    cleaned = cleaned.str.replace(r"^\((.*)\)$", r"-\1", regex=True)
    cleaned = cleaned.replace({"": None, "nan": None, "None": None, "-": None, "N/A": None, "NA": None})

    parsed = pd.to_numeric(cleaned, errors="coerce")
    non_empty = series.notna() & (series.astype(str).str.strip() != "")
    denominator = int(non_empty.sum())
    ratio = float(parsed.notna().sum() / denominator) if denominator else 0.0

    if flags["percent"]:
        parsed = parsed / 100.0
    return parsed, ratio, flags


def _value_candidates(
    series: pd.Series, non_null: pd.Series, unique_ratio: float
) -> tuple[list[tuple[SemanticRole, float]], str, dict[str, Any]]:
    """Infer role candidates from the data itself, ignoring the column name."""
    candidates: list[tuple[SemanticRole, float]] = []
    stats: dict[str, Any] = {}

    if non_null.empty:
        return candidates, "empty", stats

    if pd.api.types.is_bool_dtype(series):
        return [(SemanticRole.BOOLEAN, 0.95)], "boolean", stats

    if pd.api.types.is_datetime64_any_dtype(series):
        candidates.append((SemanticRole.DATE, 0.95))
        stats["min"] = str(non_null.min())
        stats["max"] = str(non_null.max())
        return candidates, "datetime", stats

    # --- date? ---------------------------------------------------------
    parsed_dates, date_ratio, date_format = _try_parse_dates(non_null)
    if parsed_dates is not None and date_ratio >= 0.85:
        valid = parsed_dates.dropna()
        span_days = int((valid.max() - valid.min()).days) if len(valid) > 1 else 0
        # A "date" column where every value is the same instant, or that spans
        # 150 years, is far more likely to be an id or a data error.
        if span_days == 0 and valid.nunique() <= 1:
            pass
        elif span_days > 365 * 60:
            pass
        else:
            stats.update(
                {
                    "date_format": date_format,
                    "min": valid.min().isoformat(),
                    "max": valid.max().isoformat(),
                    "span_days": span_days,
                }
            )
            candidates.append((SemanticRole.DATE, 0.75 + 0.2 * date_ratio))
            return candidates, "date", stats

    # --- numeric? ------------------------------------------------------
    parsed_numeric, numeric_ratio, numeric_flags = coerce_numeric(non_null)
    if numeric_ratio >= 0.9:
        values = parsed_numeric.dropna()
        stats.update(
            {
                "min": float(values.min()),
                "max": float(values.max()),
                "mean": float(values.mean()),
                "median": float(values.median()),
                "std": float(values.std()) if len(values) > 1 else 0.0,
                "sum": float(values.sum()),
                "zero_count": int((values == 0).sum()),
                "negative_count": int((values < 0).sum()),
            }
        )
        stats.update({k: v for k, v in numeric_flags.items() if v})

        is_integral = bool(np.allclose(values % 1, 0, atol=1e-9))
        stats["is_integer"] = is_integral

        if numeric_flags["percent"] or (0 <= stats["min"] and stats["max"] <= 1 and not is_integral):
            candidates.append((SemanticRole.PERCENTAGE, 0.6 if not numeric_flags["percent"] else 0.9))
        if numeric_flags["currency_symbol"]:
            candidates.append((SemanticRole.REVENUE, 0.75))
        if is_integral and unique_ratio > 0.9 and stats["min"] >= 0:
            # Monotonic-ish unique integers look like surrogate keys.
            candidates.append((SemanticRole.IDENTIFIER, 0.5))
        if is_integral and 0 <= stats["min"] and stats["max"] <= 100_000:
            candidates.append((SemanticRole.QUANTITY, 0.35))
        candidates.append((SemanticRole.NUMERIC, 0.5))
        return candidates, "integer" if is_integral else "float", stats

    # --- categorical / text --------------------------------------------
    text = non_null.astype(str).str.strip()
    lowered = set(text.str.lower().head(2000).unique())
    stats["sample_values"] = text.head(5).tolist()

    if lowered and lowered <= BOOLEAN_VALUES and len(lowered) <= 3:
        return [(SemanticRole.BOOLEAN, 0.85)], "boolean", stats

    if text.head(500).str.match(_EMAIL_RE).mean() > 0.8:
        return [(SemanticRole.EMAIL, 0.95)], "string", stats

    overlap = lambda vocab: len(lowered & vocab) / max(len(lowered), 1)  # noqa: E731
    if lowered and overlap(STATUS_VALUES) >= 0.6:
        candidates.append((SemanticRole.STATUS, 0.85))
    if lowered and overlap(PAYMENT_VALUES) >= 0.6:
        candidates.append((SemanticRole.PAYMENT_METHOD, 0.85))
    if lowered and lowered <= CURRENCY_CODES:
        candidates.append((SemanticRole.CURRENCY, 0.9))

    n = len(non_null)
    if unique_ratio > 0.95 and n > 20:
        candidates.append((SemanticRole.IDENTIFIER, 0.55))
        kind = "string"
    elif non_null.nunique() <= max(50, n * 0.05):
        candidates.append((SemanticRole.CATEGORICAL, 0.6))
        counts = text.value_counts().head(15)
        stats["top_values"] = [
            {"value": str(k), "count": int(v)} for k, v in counts.items()
        ]
        kind = "category"
    else:
        candidates.append((SemanticRole.TEXT, 0.5))
        kind = "string"
    return candidates, kind, stats


def infer_column(series: pd.Series, name: str, position: int) -> ColumnInference:
    """Infer the semantic role of a single column."""
    total = len(series)
    non_null = series.dropna()
    if non_null.dtype == object:
        non_null = non_null[non_null.astype(str).str.strip() != ""]

    null_count = total - len(non_null)
    unique_count = int(non_null.nunique()) if len(non_null) else 0
    unique_ratio = unique_count / len(non_null) if len(non_null) else 0.0

    value_cands, data_type, stats = _value_candidates(series, non_null, unique_ratio)
    name_cands = _name_candidates(name)

    value_scores = dict(value_cands)
    name_scores = dict(name_cands)

    # Combine. A role supported by both name and values is far more reliable
    # than one supported by either alone, so agreement is rewarded explicitly.
    combined: dict[SemanticRole, float] = {}
    for role, score in name_scores.items():
        compatible = _is_compatible(role, data_type, stats)
        if not compatible:
            continue
        agreement = 0.0
        for vrole, vscore in value_scores.items():
            if vrole == role or _same_family(vrole, role):
                agreement = max(agreement, vscore)
        combined[role] = min(0.99, score * (0.75 + 0.25 * (agreement > 0)) + 0.15 * agreement)

    for role, score in value_scores.items():
        # Value-only evidence is weaker unless it is intrinsically decisive
        # (emails, booleans, currency codes are not guesses).
        decisive = role in {SemanticRole.EMAIL, SemanticRole.BOOLEAN, SemanticRole.CURRENCY}
        combined[role] = max(combined.get(role, 0.0), score if decisive else score * 0.7)

    if not combined:
        return ColumnInference(
            name=name, position=position, data_type=data_type,
            role=SemanticRole.UNKNOWN, confidence=0.0, null_count=null_count,
            unique_count=unique_count, stats=stats, candidates=[],
        )

    ranked = sorted(combined.items(), key=lambda kv: kv[1], reverse=True)
    best_role, best_score = ranked[0]

    # An "identifier"-looking numeric column named like a measure is a measure.
    if best_role == SemanticRole.IDENTIFIER and name_scores:
        top_named = max(name_scores.items(), key=lambda kv: kv[1])
        if top_named[0].is_measure and top_named[1] >= 0.8:
            best_role, best_score = top_named[0], top_named[1] * 0.9

    stats["null_ratio"] = round(null_count / total, 4) if total else 0.0
    stats["unique_ratio"] = round(unique_ratio, 4)

    return ColumnInference(
        name=name,
        position=position,
        data_type=data_type,
        role=best_role,
        confidence=round(float(best_score), 3),
        null_count=null_count,
        unique_count=unique_count,
        stats=stats,
        candidates=[
            {"role": r.value, "confidence": round(float(s), 3)} for r, s in ranked[:4]
        ],
    )


def _same_family(a: SemanticRole, b: SemanticRole) -> bool:
    """Do two roles describe the same *kind* of thing?"""
    families = [
        {
            SemanticRole.REVENUE, SemanticRole.COST, SemanticRole.PROFIT,
            SemanticRole.UNIT_PRICE, SemanticRole.DISCOUNT, SemanticRole.EXPENSE,
            SemanticRole.QUANTITY, SemanticRole.INVENTORY, SemanticRole.NUMERIC,
            SemanticRole.PERCENTAGE,
        },
        {SemanticRole.DATE, SemanticRole.ORDER_DATE},
        {
            SemanticRole.PRODUCT, SemanticRole.CATEGORY, SemanticRole.REGION,
            SemanticRole.COUNTRY, SemanticRole.CITY, SemanticRole.CHANNEL,
            SemanticRole.CUSTOMER, SemanticRole.SEGMENT, SemanticRole.STATUS,
            SemanticRole.PAYMENT_METHOD, SemanticRole.CATEGORICAL,
        },
        {
            SemanticRole.ORDER_ID, SemanticRole.CUSTOMER_ID,
            SemanticRole.PRODUCT_ID, SemanticRole.IDENTIFIER,
        },
    ]
    return any(a in family and b in family for family in families)


def _is_compatible(role: SemanticRole, data_type: str, stats: dict[str, Any]) -> bool:
    """Veto name-based guesses that the data flatly contradicts.

    A column named ``revenue`` holding the strings "high"/"low" is not revenue,
    and treating it as such would poison every downstream calculation.
    """
    numeric_types = {"integer", "float"}
    if role.is_measure and role != SemanticRole.NUMERIC:
        return data_type in numeric_types
    if role.is_temporal:
        return data_type in {"date", "datetime"}
    if role in {SemanticRole.PRODUCT, SemanticRole.CUSTOMER, SemanticRole.EMAIL}:
        return data_type not in {"date", "datetime"}
    if role in {SemanticRole.CATEGORY, SemanticRole.REGION, SemanticRole.STATUS,
                SemanticRole.PAYMENT_METHOD, SemanticRole.CHANNEL, SemanticRole.SEGMENT}:
        # Numeric codes are acceptable dimensions, but dates are not.
        return data_type not in {"date", "datetime"}
    return True


def reconcile_roles(inferences: list[ColumnInference]) -> list[ColumnInference]:
    """Resolve conflicts across the dataset as a whole.

    Column-level inference is local and can produce impossible combinations —
    three ``revenue`` columns, or two ``order_date`` columns. This pass applies
    dataset-level rules so the resulting schema is internally consistent.
    """
    by_role: dict[SemanticRole, list[ColumnInference]] = {}
    for inf in inferences:
        by_role.setdefault(inf.role, []).append(inf)

    # -- One primary date --------------------------------------------------
    date_cols = by_role.get(SemanticRole.DATE, []) + by_role.get(SemanticRole.ORDER_DATE, [])
    if date_cols:
        def date_rank(inf: ColumnInference) -> tuple[int, float, int]:
            normalized = normalize_name(inf.name)
            prefers_order = any(
                token in normalized for token in ("order", "purchase", "sale", "transaction", "invoice")
            )
            return (1 if prefers_order else 0, inf.confidence, -inf.position)

        primary = max(date_cols, key=date_rank)
        for inf in date_cols:
            inf.role = SemanticRole.ORDER_DATE if inf is primary else SemanticRole.DATE

    # -- Exactly one revenue column ---------------------------------------
    revenue_cols = by_role.get(SemanticRole.REVENUE, [])
    if len(revenue_cols) > 1:
        def revenue_rank(inf: ColumnInference) -> tuple[int, float, float]:
            normalized = normalize_name(inf.name)
            explicit = any(
                token in normalized for token in ("revenue", "sales", "turnover", "gmv")
            )
            # Between two candidates, the one with the larger total is the line
            # total rather than the unit price.
            return (1 if explicit else 0, inf.confidence, float(inf.stats.get("sum") or 0.0))

        winner = max(revenue_cols, key=revenue_rank)
        for inf in revenue_cols:
            if inf is winner:
                continue
            normalized = normalize_name(inf.name)
            if "price" in normalized or "rate" in normalized:
                inf.role = SemanticRole.UNIT_PRICE
            elif "cost" in normalized:
                inf.role = SemanticRole.COST
            else:
                inf.role = SemanticRole.NUMERIC
                inf.confidence = min(inf.confidence, 0.5)

    # -- One identifier per entity ----------------------------------------
    for role in (SemanticRole.ORDER_ID, SemanticRole.CUSTOMER_ID, SemanticRole.PRODUCT_ID):
        cols = by_role.get(role, [])
        if len(cols) > 1:
            winner = max(cols, key=lambda i: (i.confidence, i.unique_count))
            for inf in cols:
                if inf is not winner:
                    inf.role = SemanticRole.IDENTIFIER

    # -- Discounts expressed as a fraction are percentages -----------------
    for inf in by_role.get(SemanticRole.DISCOUNT, []):
        max_value = inf.stats.get("max")
        if isinstance(max_value, (int, float)) and 0 <= max_value <= 1 and not inf.stats.get("is_integer"):
            inf.stats["discount_is_rate"] = True

    return inferences


def infer_schema(df: pd.DataFrame) -> list[ColumnInference]:
    """Infer and reconcile semantic roles for every column in a frame."""
    inferences = [
        infer_column(df[col], str(col), position)
        for position, col in enumerate(df.columns)
    ]
    return reconcile_roles(inferences)
