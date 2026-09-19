"""Natural-language question -> deterministic analysis plan.

This is the component that keeps "Ask InsightFlow" honest. A question never
reaches a language model as "here is a spreadsheet, answer this". Instead it is
parsed into a typed :class:`AnalysisPlan` of named steps, each of which maps to
a function in the analytics engine. The engine runs the plan and produces an
evidence bundle; only then does the model get involved, and only to write prose
over figures that already exist.

The parser is rule-based rather than model-driven, deliberately. Intent
classification over a closed set of eight analytical shapes is a problem where
regular expressions are more predictable, instantly testable, free to run, and
impossible to prompt-inject. An LLM adds latency and a failure mode here without
adding capability.

When a question cannot be understood, we say so and offer the questions this
dataset *can* answer, rather than guessing and producing a confident wrong
answer.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from app.analytics.context import DatasetContext
from app.analytics.types import Grain, jsonable


class Intent(str, Enum):
    OVERVIEW = "overview"                 # "how is my business doing?"
    TREND = "trend"                       # "how has revenue changed over time?"
    COMPARE_PERIODS = "compare_periods"   # "this month vs last month"
    EXPLAIN_CHANGE = "explain_change"     # "why did revenue decline?"
    TOP_SEGMENTS = "top_segments"         # "what are my best products?"
    BOTTOM_SEGMENTS = "bottom_segments"   # "which products are declining?"
    ANOMALIES = "anomalies"               # "show me unusual activity"
    BREAKDOWN = "breakdown"               # "revenue by region"
    CUSTOMERS = "customers"               # "how many repeat customers?"
    FORECAST = "forecast"                 # "what will next month look like?"
    UNKNOWN = "unknown"


@dataclass(slots=True)
class PlanStep:
    """One deterministic operation, named after the function that runs it."""

    operation: str
    params: dict[str, Any] = field(default_factory=dict)
    description: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "operation": self.operation,
            "params": self.params,
            "description": self.description,
        }


@dataclass(slots=True)
class AnalysisPlan:
    question: str
    intent: Intent
    metric: str
    dimension: str | None
    grain: Grain
    steps: list[PlanStep] = field(default_factory=list)
    # "size"   -> rank segments by how big they are ("best products")
    # "change" -> rank by how much they moved ("fastest growing region")
    ranking_basis: str = "size"
    confidence: float = 0.0
    unsupported_reason: str = ""
    suggestions: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return jsonable(
            {
                "question": self.question,
                "intent": self.intent.value,
                "metric": self.metric,
                "dimension": self.dimension,
                "grain": self.grain.value,
                "ranking_basis": self.ranking_basis,
                "steps": [step.to_dict() for step in self.steps],
                "confidence": self.confidence,
                "unsupported_reason": self.unsupported_reason,
                "suggestions": self.suggestions,
            }
        )


# --------------------------------------------------------------------------- #
# Vocabulary
# --------------------------------------------------------------------------- #

METRIC_PATTERNS: list[tuple[str, str]] = [
    (r"\b(average order value|aov|basket size|order value|spend per order)\b", "avg_order_value"),
    (r"\b(profit margin|margin|profitability)\b", "profit_margin"),
    (r"\b(revenue|sales|turnover|income|takings|money|earning)\w*\b", "revenue"),
    (r"\b(profit|earnings|bottom line)\w*\b", "profit"),
    (r"\b(cost|cogs|expense|spend)\w*\b", "cost"),
    (r"\b(order|transaction|purchase|sale)s?\b", "orders"),
    (r"\b(customer|client|buyer|shopper)s?\b", "customers"),
    (r"\b(unit|quantity|qty|volume|item)s?\s*(sold)?\b", "units_sold"),
    (r"\b(discount)\w*\b", "total_discount"),
]

DIMENSION_PATTERNS: list[tuple[str, str]] = [
    (r"\b(product|item|sku)s?\b", "product"),
    (r"\b(categor|department|product type)\w*\b", "category"),
    (r"\b(region|area|location|city|country|territory|market|geograph)\w*\b", "region"),
    (r"\b(channel|platform|marketplace|source)s?\b", "channel"),
    (r"\b(customer segment|segment|tier|cohort)s?\b", "segment"),
    (r"\b(status|state)\w*\b", "status"),
    (r"\b(payment|tender)\w*\b", "payment_method"),
    (r"\b(customer|client|buyer)s?\b", "customer"),
]

GRAIN_PATTERNS: list[tuple[str, Grain]] = [
    (r"\b(dai?ly|per day|by day|each day|day[- ]over[- ]day)\b", Grain.DAY),
    (r"\b(week(ly)?|per week|by week|wow|week[- ]over[- ]week)\b", Grain.WEEK),
    (r"\b(month(ly)?|per month|by month|mom|month[- ]over[- ]month)\b", Grain.MONTH),
    (r"\b(quarter(ly)?|per quarter|by quarter|q[1-4])\b", Grain.QUARTER),
    (r"\b(year(ly)?|annual|yoy|year[- ]over[- ]year)\b", Grain.QUARTER),
]

# Ordered by specificity: "why did revenue decline" must not match TREND first.
INTENT_PATTERNS: list[tuple[str, Intent, float]] = [
    (r"\b(why|what caused|what drove|reason for|explain|how come|what happened)\b", Intent.EXPLAIN_CHANGE, 0.9),
    (r"\b(unusual|anomal|strange|odd|spike|outlier|irregular|unexpected|weird)\w*\b", Intent.ANOMALIES, 0.9),
    (r"\b(compare|versus|vs\.?|against|compared with|difference between)\b", Intent.COMPARE_PERIODS, 0.85),
    (r"\b(forecast|predict|projection|next month|next week|will be|expect)\w*\b", Intent.FORECAST, 0.85),
    (r"\b(declin|drop|fall|worst|lowest|underperform|losing|shrink|bottom|weak)\w*\b", Intent.BOTTOM_SEGMENTS, 0.8),
    (r"\b(best|top|highest|most|leading|strongest|fastest[- ]growing|growing|winner)\w*\b", Intent.TOP_SEGMENTS, 0.8),
    (r"\b(trend|over time|history|historical|growth rate|trajectory|progress)\w*\b", Intent.TREND, 0.8),
    (r"\b(repeat customer|retention|churn|loyal|new customer|returning)\w*\b", Intent.CUSTOMERS, 0.85),
    (r"\bby\s+(product|category|region|channel|city|country|segment|status|payment)\w*\b", Intent.BREAKDOWN, 0.8),
    (r"\b(break\s?down|split|distribution|share|mix)\b", Intent.BREAKDOWN, 0.75),
    (r"\b(how (is|are)|overview|summary|health|doing|performance|going)\b", Intent.OVERVIEW, 0.7),
]

# Phrases that imply a period comparison even without the word "compare".
_COMPARISON_HINT = re.compile(
    r"\b(last|previous|prior|this) (month|week|quarter|year)\b|\bmom\b|\bwow\b|\byoy\b",
    re.IGNORECASE,
)


# "Best products" asks which are largest. "Fastest-growing products" asks which
# moved most. Both land on the same intent, but answering one with the other is
# a true statement and a wrong answer, so the basis is resolved explicitly.
_CHANGE_BASIS = re.compile(
    r"\b(grow|growth|fastest|declin|drop|fall|rising|rise|improv|"
    r"worsen|shrink|surg|slow|accelerat|trend|momentum)\w*",
    re.IGNORECASE,
)


def detect_ranking_basis(question: str) -> str:
    """Whether a ranking question is about size or about movement."""
    return "change" if _CHANGE_BASIS.search(question) else "size"


def _match_first(text: str, patterns: list[tuple[str, Any]]) -> Any | None:
    for pattern, value in patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return value
    return None


def detect_intent(question: str) -> tuple[Intent, float]:
    text = question.lower().strip()
    for pattern, intent, confidence in INTENT_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return intent, confidence
    if _COMPARISON_HINT.search(text):
        return Intent.COMPARE_PERIODS, 0.6
    return Intent.UNKNOWN, 0.0


def detect_metric(question: str, ctx: DatasetContext) -> str:
    """Resolve the metric asked about, falling back to what the data supports."""
    matched = _match_first(question, METRIC_PATTERNS)
    available = set(ctx.measures().keys()) | {"orders"}
    if ctx.customer_col:
        available.add("customers")
    if ctx.revenue_col:
        available.update({"avg_order_value", "revenue"})
    if ctx.quantity_col:
        available.add("units_sold")

    if matched:
        if matched in {"avg_order_value", "profit_margin", "total_discount"}:
            return matched
        if matched == "units_sold" and ctx.quantity_col:
            return matched
        if matched in available:
            return matched
    # Revenue is the metric a business owner means when they do not say.
    if ctx.revenue_col:
        return "revenue"
    if ctx.profit_col:
        return "profit"
    return "orders"


def detect_dimension(question: str, ctx: DatasetContext) -> str | None:
    matched = _match_first(question, DIMENSION_PATTERNS)
    dimensions = ctx.dimensions()
    if matched and matched in dimensions:
        return matched
    if matched == "segment" and "segment" in dimensions:
        return "segment"
    return None


def detect_grain(question: str, ctx: DatasetContext) -> Grain:
    matched = _match_first(question, GRAIN_PATTERNS)
    return matched or ctx.grain


def default_dimension(ctx: DatasetContext) -> str | None:
    """The dimension most likely to be useful when none was named."""
    dimensions = ctx.dimensions()
    for preference in ("product", "category", "region", "channel", "segment"):
        if preference in dimensions:
            return preference
    return next(iter(dimensions), None)


def suggested_questions(ctx: DatasetContext) -> list[str]:
    """Questions this specific dataset can actually answer.

    Generated from the resolved schema, so we never invite a user to ask about
    regions when their file has no location column.
    """
    out: list[str] = []
    dimensions = ctx.dimensions()
    has_dates = ctx.date_col is not None

    if ctx.revenue_col and has_dates:
        out.append("How is my business doing?")
        out.append("Why did revenue change last month?")
    if "product" in dimensions:
        out.append("What are my best-selling products?")
        out.append("Which products are declining?")
    if "region" in dimensions:
        out.append("Which region is growing fastest?")
    if "category" in dimensions:
        out.append("Show me revenue by category.")
    if has_dates:
        out.append("Show me unusual activity.")
        out.append("Compare this month with last month.")
    if ctx.customer_col:
        out.append("How many repeat customers do I have?")
    if ctx.profit_col and "product" in dimensions:
        out.append("Which products have the best margins?")
    return out[:8]


def build_plan(question: str, ctx: DatasetContext) -> AnalysisPlan:
    """Parse a question into an executable plan."""
    intent, confidence = detect_intent(question)
    metric = detect_metric(question, ctx)
    dimension = detect_dimension(question, ctx)
    grain = detect_grain(question, ctx)

    plan = AnalysisPlan(
        question=question.strip(),
        intent=intent,
        metric=metric,
        dimension=dimension,
        grain=grain,
        ranking_basis=detect_ranking_basis(question),
        confidence=confidence,
        suggestions=suggested_questions(ctx),
    )

    if intent is Intent.UNKNOWN:
        plan.unsupported_reason = (
            "We could not tell which analysis this question is asking for."
        )
        return plan

    if not ctx.date_col and intent in {
        Intent.TREND, Intent.COMPARE_PERIODS, Intent.EXPLAIN_CHANGE,
        Intent.ANOMALIES, Intent.FORECAST,
    }:
        plan.unsupported_reason = (
            "This question needs a date column, and none was detected in this dataset. "
            "You can assign one in Review fields and ask again."
        )
        return plan

    plan.steps = _steps_for(intent, metric, dimension, grain, ctx)
    if not plan.steps:
        plan.unsupported_reason = (
            "This dataset does not contain the columns needed to answer this question."
        )
    return plan


def _steps_for(
    intent: Intent, metric: str, dimension: str | None, grain: Grain, ctx: DatasetContext
) -> list[PlanStep]:
    """Translate an intent into ordered, named engine operations."""
    resolved_dimension = dimension or default_dimension(ctx)
    steps: list[PlanStep] = []

    if intent is Intent.OVERVIEW:
        steps.append(PlanStep("compute_metrics", {}, "Calculate headline metrics for the whole dataset."))
        if ctx.date_col:
            steps.append(PlanStep(
                "compare_periods", {"grain": grain.value},
                f"Compare the latest {grain.label[:-2]} period with the one before it.",
            ))
            steps.append(PlanStep(
                "resample_metric", {"metric": metric, "grain": grain.value},
                f"Build the {grain.label} {metric.replace('_', ' ')} trend.",
            ))
        if resolved_dimension:
            steps.append(PlanStep(
                "breakdown", {"dimension": resolved_dimension, "metric": metric},
                f"Break {metric.replace('_', ' ')} down by {resolved_dimension}.",
            ))
        if ctx.customer_col:
            steps.append(PlanStep("customer_breakdown", {}, "Summarise customer behaviour."))

    elif intent is Intent.TREND:
        steps.append(PlanStep(
            "resample_metric", {"metric": metric, "grain": grain.value},
            f"Aggregate {metric.replace('_', ' ')} by {grain.label[:-2]}.",
        ))
        steps.append(PlanStep(
            "growth_table", {"metric": metric, "grain": grain.value},
            "Calculate period-over-period growth.",
        ))
        steps.append(PlanStep(
            "detect_seasonality", {"metric": metric, "grain": grain.value},
            "Check for a repeating seasonal pattern.",
        ))

    elif intent is Intent.COMPARE_PERIODS:
        steps.append(PlanStep(
            "compare_periods", {"grain": grain.value},
            "Compare the two most recent periods across every metric.",
        ))
        if resolved_dimension:
            steps.append(PlanStep(
                "contribution_analysis",
                {"dimension": resolved_dimension, "metric": metric, "grain": grain.value},
                f"Attribute the change to individual {resolved_dimension}s.",
            ))

    elif intent is Intent.EXPLAIN_CHANGE:
        steps.append(PlanStep(
            "compare_periods", {"grain": grain.value},
            "Measure the change across every available metric.",
        ))
        steps.append(PlanStep(
            "investigate_change", {"metric": metric, "grain": grain.value},
            f"Investigate what drove the change in {metric.replace('_', ' ')}.",
        ))
        for candidate in ("product", "region", "category", "channel"):
            if candidate in ctx.dimensions():
                steps.append(PlanStep(
                    "contribution_analysis",
                    {"dimension": candidate, "metric": metric, "grain": grain.value},
                    f"Break the change down by {candidate}.",
                ))
        steps.append(PlanStep(
            "resample_metric", {"metric": metric, "grain": grain.value},
            "Chart the metric over time for context.",
        ))

    elif intent in {Intent.TOP_SEGMENTS, Intent.BOTTOM_SEGMENTS}:
        if not resolved_dimension:
            return []
        steps.append(PlanStep(
            "breakdown", {"dimension": resolved_dimension, "metric": metric},
            f"Rank {resolved_dimension}s by {metric.replace('_', ' ')}.",
        ))
        if ctx.date_col:
            steps.append(PlanStep(
                "top_and_bottom",
                {"dimension": resolved_dimension, "metric": metric, "grain": grain.value},
                "Identify the fastest-growing and fastest-declining segments.",
            ))
        if metric in {"revenue", "profit"} and ctx.profit_col:
            steps.append(PlanStep(
                "margin_by_segment", {"dimension": resolved_dimension},
                f"Compare margins across {resolved_dimension}s.",
            ))

    elif intent is Intent.BREAKDOWN:
        if not resolved_dimension:
            return []
        steps.append(PlanStep(
            "breakdown", {"dimension": resolved_dimension, "metric": metric},
            f"Break {metric.replace('_', ' ')} down by {resolved_dimension}.",
        ))
        if ctx.date_col:
            steps.append(PlanStep(
                "contribution_analysis",
                {"dimension": resolved_dimension, "metric": metric, "grain": grain.value},
                "Show how each segment changed against the previous period.",
            ))

    elif intent is Intent.ANOMALIES:
        steps.append(PlanStep(
            "detect_anomalies", {"grain": grain.value},
            "Scan every metric for periods outside the expected range.",
        ))

    elif intent is Intent.CUSTOMERS:
        if not ctx.customer_col:
            return []
        steps.append(PlanStep("customer_breakdown", {}, "Analyse repeat and one-time customers."))
        steps.append(PlanStep("compute_metrics", {}, "Calculate customer-related metrics."))

    elif intent is Intent.FORECAST:
        steps.append(PlanStep(
            "check_forecast_viability", {"grain": grain.value},
            "Check whether there is enough history to forecast.",
        ))
        steps.append(PlanStep(
            "resample_metric", {"metric": metric, "grain": grain.value},
            "Build the historical series.",
        ))

    return steps
