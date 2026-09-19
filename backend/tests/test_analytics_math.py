"""Analytical correctness: known datasets with known answers.

These are the most important tests in the project. UI tests confirm that
something renders; these confirm that the number rendered is *right*. Every
assertion here is a figure that can be verified by hand from the fixture.

If a refactor breaks one of these, the product is lying to its users.
"""

from __future__ import annotations

import pandas as pd
import pytest

from app.analytics.context import build_context, pct_change, safe_ratio
from app.analytics.metrics import compare_periods, compute_metrics, customer_breakdown
from app.analytics.profiling import profile_dataset
from app.analytics.segmentation import (
    breakdown,
    concentration_stats,
    contribution_analysis,
)
from app.analytics.timeseries import (
    last_two_periods,
    moving_average,
    resample_metric,
    trend_direction,
)
from app.analytics.types import Grain


@pytest.fixture
def ctx(known_answer_frame):
    profile = profile_dataset(known_answer_frame)
    return build_context(known_answer_frame, profile.role_map, grain=Grain.MONTH)


# --------------------------------------------------------------------------- #
# Percentage change — the single most reused calculation in the product
# --------------------------------------------------------------------------- #


class TestPercentChange:
    def test_the_canonical_case(self):
        # January 1000 -> February 1200 must be exactly 20%.
        assert pct_change(1200, 1000) == 20.0

    def test_decline(self):
        assert pct_change(800, 1000) == -20.0

    def test_no_change(self):
        assert pct_change(1000, 1000) == 0.0

    def test_zero_baseline_is_undefined_not_infinite(self):
        # "Infinite growth" is not a number a business owner can act on, and
        # rendering it would be misleading.
        assert pct_change(100, 0) is None

    def test_negative_baseline_uses_magnitude(self):
        # From -100 to -50 is an improvement of 50% of the original magnitude.
        assert pct_change(-50, -100) == 50.0

    def test_halving(self):
        assert pct_change(50, 100) == -50.0

    def test_doubling(self):
        assert pct_change(200, 100) == 100.0

    def test_safe_ratio_rejects_zero_denominator(self):
        assert safe_ratio(10, 0) is None
        assert safe_ratio(10, 4) == 2.5


# --------------------------------------------------------------------------- #
# Metrics
# --------------------------------------------------------------------------- #


class TestMetrics:
    def test_totals_match_the_fixture_exactly(self, ctx):
        metrics = compute_metrics(ctx)
        # 400 + 600 + 500 + 700
        assert metrics["revenue"].value == pytest.approx(2200.00)
        # 250 + 350 + 300 + 400
        assert metrics["cost"].value == pytest.approx(1300.00)
        # 150 + 250 + 200 + 300
        assert metrics["profit"].value == pytest.approx(900.00)

    def test_order_count_is_distinct_orders(self, ctx):
        assert compute_metrics(ctx)["orders"].value == 4

    def test_customer_count_is_distinct_customers(self, ctx):
        # C1 appears twice; there are three distinct customers.
        assert compute_metrics(ctx)["customers"].value == 3

    def test_units_sold(self, ctx):
        # 2 + 3 + 2 + 2
        assert compute_metrics(ctx)["units_sold"].value == 9

    def test_average_order_value(self, ctx):
        # 2200 / 4
        assert compute_metrics(ctx)["avg_order_value"].value == pytest.approx(550.00)

    def test_profit_margin(self, ctx):
        # 900 / 2200 = 40.909...%
        assert compute_metrics(ctx)["profit_margin"].value == pytest.approx(40.9091, abs=1e-3)

    def test_every_metric_carries_its_provenance(self, ctx):
        for key, metric in compute_metrics(ctx).items():
            assert metric.provenance.get("calculation"), f"{key} has no calculation recorded"

    def test_absent_metrics_are_omitted_not_zeroed(self):
        """A business with no cost column must not be shown a cost of zero."""
        frame = pd.DataFrame(
            {
                "order_date": ["2025-01-01", "2025-01-02"],
                "revenue": [100.0, 200.0],
            }
        )
        profile = profile_dataset(frame)
        metrics = compute_metrics(build_context(frame, profile.role_map))
        assert "cost" not in metrics
        assert "profit" not in metrics
        assert metrics["revenue"].value == pytest.approx(300.0)


# --------------------------------------------------------------------------- #
# Period comparison
# --------------------------------------------------------------------------- #


class TestPeriodComparison:
    def test_month_over_month_growth_is_exactly_twenty_percent(self, ctx):
        current, previous, current_label, previous_label = last_two_periods(ctx, Grain.MONTH)
        assert current_label == "Feb 2025"
        assert previous_label == "Jan 2025"

        metrics = compare_periods(
            ctx, current, previous,
            current_label=current_label, previous_label=previous_label,
        )
        revenue = metrics["revenue"]
        assert revenue.value == pytest.approx(1200.00)
        assert revenue.previous_value == pytest.approx(1000.00)
        assert revenue.change_pct == pytest.approx(20.0)
        assert revenue.direction == "up"

    def test_profit_comparison(self, ctx):
        current, previous, cl, pl = last_two_periods(ctx, Grain.MONTH)
        metrics = compare_periods(ctx, current, previous, current_label=cl, previous_label=pl)
        # Jan 400 -> Feb 500 = +25%
        assert metrics["profit"].value == pytest.approx(500.0)
        assert metrics["profit"].previous_value == pytest.approx(400.0)
        assert metrics["profit"].change_pct == pytest.approx(25.0)

    def test_customer_count_comparison(self, ctx):
        current, previous, cl, pl = last_two_periods(ctx, Grain.MONTH)
        metrics = compare_periods(ctx, current, previous, current_label=cl, previous_label=pl)
        # Jan had C1 and C2; Feb had C1 and C3. Two each.
        assert metrics["customers"].value == 2
        assert metrics["customers"].previous_value == 2
        assert metrics["customers"].change_pct == pytest.approx(0.0)


# --------------------------------------------------------------------------- #
# Time series
# --------------------------------------------------------------------------- #


class TestTimeSeries:
    def test_monthly_resampling(self, ctx):
        series = resample_metric(ctx, "revenue", Grain.MONTH)
        assert [p.period for p in series.points] == ["Jan 2025", "Feb 2025"]
        assert series.values == pytest.approx([1000.0, 1200.0])

    def test_series_totals_match_the_overall_total(self, ctx):
        series = resample_metric(ctx, "revenue", Grain.MONTH)
        assert sum(series.values) == pytest.approx(compute_metrics(ctx)["revenue"].value)

    def test_short_series_refuses_to_claim_a_trend(self, ctx):
        series = resample_metric(ctx, "revenue", Grain.MONTH)
        assert not series.sufficiency.ok
        assert "3" in series.sufficiency.reason or "three" in series.sufficiency.reason.lower()

    def test_calendar_gaps_are_filled_with_zeros(self):
        """A day with no orders is a day with zero revenue, not a missing point."""
        frame = pd.DataFrame(
            {
                "order_date": ["2025-01-01", "2025-01-05"],
                "revenue": [100.0, 200.0],
            }
        )
        profile = profile_dataset(frame)
        series = resample_metric(
            build_context(frame, profile.role_map), "revenue", Grain.DAY
        )
        assert len(series.points) == 5
        assert series.values == pytest.approx([100.0, 0.0, 0.0, 0.0, 200.0])

    @pytest.mark.parametrize(
        "grain, expected_periods",
        [(Grain.DAY, 15), (Grain.WEEK, 3), (Grain.MONTH, 1), (Grain.QUARTER, 1)],
    )
    def test_every_grain_preserves_the_total(self, grain, expected_periods):
        """Resampling redistributes a total. It must never change it.

        This exists because weekly resampling silently returned all zeros:
        buckets were keyed by period *start* while the gap-filling reindex was
        generated at week *end*, so the two index sets had no members in common
        and every real figure was replaced by the fill value. Daily, monthly,
        and quarterly aligned by coincidence, which is exactly why a test that
        checks only one grain would not have caught it.

        Fifteen consecutive days, 100 each: 1,500 at every grain.
        """
        frame = pd.DataFrame(
            {
                "order_date": pd.date_range("2025-01-01", periods=15, freq="D"),
                "revenue": [100.0] * 15,
            }
        )
        profile = profile_dataset(frame)
        series = resample_metric(
            build_context(frame, profile.role_map, grain=grain), "revenue", grain
        )

        assert sum(series.values) == pytest.approx(1500.0), (
            f"{grain.value} resampling lost or invented revenue: {series.values}"
        )
        assert len(series.points) == expected_periods
        assert all(value > 0 for value in series.values), (
            f"{grain.value} produced empty buckets for a period with data"
        )

    def test_weekly_buckets_carry_the_right_days(self):
        """Not just the right total — the right value in the right bucket."""
        frame = pd.DataFrame(
            {
                # Two full Tue-Mon weeks: 7 days at 10, then 7 days at 20.
                "order_date": pd.date_range("2025-01-07", periods=14, freq="D"),
                "revenue": [10.0] * 7 + [20.0] * 7,
            }
        )
        profile = profile_dataset(frame)
        series = resample_metric(
            build_context(frame, profile.role_map, grain=Grain.WEEK), "revenue", Grain.WEEK
        )
        assert series.values == pytest.approx([70.0, 140.0])

    def test_rising_trend_detected(self):
        direction, slope, strength = trend_direction([10, 20, 30, 40, 50])
        assert direction == "rising"
        assert slope == pytest.approx(10.0)
        assert strength == pytest.approx(1.0)

    def test_falling_trend_detected(self):
        direction, slope, _ = trend_direction([50, 40, 30, 20, 10])
        assert direction == "falling"
        assert slope == pytest.approx(-10.0)

    def test_flat_series_is_flat(self):
        direction, slope, _ = trend_direction([100, 100, 100, 100])
        assert direction == "flat"
        assert slope == pytest.approx(0.0)

    def test_noise_is_not_reported_as_a_trend(self):
        direction, _, strength = trend_direction([100, 5, 180, 12, 160, 8, 150])
        assert direction in {"mixed", "flat"}
        assert strength < 0.5

    def test_moving_average(self):
        assert moving_average([1, 2, 3, 4, 5], window=3) == [None, None, 2.0, 3.0, 4.0]

    def test_moving_average_needs_enough_points(self):
        assert moving_average([1, 2], window=3) == [None, None]


# --------------------------------------------------------------------------- #
# Segmentation and contribution
# --------------------------------------------------------------------------- #


class TestSegmentation:
    def test_breakdown_by_product(self, ctx):
        result = breakdown(ctx, "product", "revenue")
        values = {row.name: row.value for row in result.rows}
        # Widget: 400 + 500; Gadget: 600 + 700
        assert values["Widget"] == pytest.approx(900.0)
        assert values["Gadget"] == pytest.approx(1300.0)
        assert result.total == pytest.approx(2200.0)

    def test_shares_sum_to_one_hundred(self, ctx):
        result = breakdown(ctx, "product", "revenue")
        assert sum(row.share_pct for row in result.rows) == pytest.approx(100.0, abs=0.01)

    def test_contribution_percentages_explain_the_total_change(self, ctx):
        current, previous, _, _ = last_two_periods(ctx, Grain.MONTH)
        result = contribution_analysis(ctx, "product", current, previous, "revenue")

        # Widget 400 -> 500 (+100); Gadget 600 -> 700 (+100); total +200.
        by_name = {row.name: row for row in result.rows}
        assert by_name["Widget"].change == pytest.approx(100.0)
        assert by_name["Gadget"].change == pytest.approx(100.0)
        assert by_name["Widget"].contribution_pct == pytest.approx(50.0)
        assert by_name["Gadget"].contribution_pct == pytest.approx(50.0)

    def test_contributions_sum_to_one_hundred_percent(self, ctx):
        current, previous, _, _ = last_two_periods(ctx, Grain.MONTH)
        result = contribution_analysis(ctx, "region", current, previous, "revenue")
        total = sum(row.contribution_pct or 0 for row in result.rows)
        assert total == pytest.approx(100.0, abs=0.01)

    def test_evenly_split_segments_are_not_called_concentrated(self):
        """Four equal segments is perfect evenness, whatever the raw index says."""
        values = pd.Series([250.0, 250.0, 250.0, 250.0])
        stats = concentration_stats(values, 1000.0)
        assert stats["hhi"] == pytest.approx(0.25)
        assert stats["normalized_hhi"] == pytest.approx(0.0, abs=1e-9)
        assert stats["level"] == "low"

    def test_dominant_segment_is_called_concentrated(self):
        values = pd.Series([900.0, 40.0, 30.0, 30.0])
        stats = concentration_stats(values, 1000.0)
        assert stats["level"] == "high"
        assert stats["top_1_share_pct"] == pytest.approx(90.0)


# --------------------------------------------------------------------------- #
# Customers
# --------------------------------------------------------------------------- #


class TestCustomers:
    def test_repeat_customer_identification(self, ctx):
        summary = customer_breakdown(ctx)
        assert summary["total_customers"] == 3
        # Only C1 ordered twice.
        assert summary["repeat_customers"] == 1
        assert summary["one_time_customers"] == 2
        assert summary["repeat_rate_pct"] == pytest.approx(33.33, abs=0.01)


# --------------------------------------------------------------------------- #
# Derived measures
# --------------------------------------------------------------------------- #


class TestDerivedMeasures:
    def test_revenue_derived_from_quantity_and_price(self):
        frame = pd.DataFrame(
            {
                "order_date": ["2025-01-01", "2025-01-02"],
                "quantity": [2, 3],
                "unit_price": [10.0, 20.0],
            }
        )
        profile = profile_dataset(frame)
        ctx = build_context(frame, profile.role_map)
        # 2*10 + 3*20 = 80
        assert compute_metrics(ctx)["revenue"].value == pytest.approx(80.0)
        assert "revenue" in ctx.derivations

    def test_discount_as_a_rate_is_applied_multiplicatively(self):
        frame = pd.DataFrame(
            {
                "order_date": ["2025-01-01"],
                "quantity": [2],
                "unit_price": [100.0],
                "discount": [0.25],
            }
        )
        profile = profile_dataset(frame)
        ctx = build_context(frame, profile.role_map)
        # 2 * 100 * (1 - 0.25) = 150
        assert compute_metrics(ctx)["revenue"].value == pytest.approx(150.0)

    def test_discount_as_an_amount_is_subtracted(self):
        frame = pd.DataFrame(
            {
                "order_date": ["2025-01-01", "2025-01-02"],
                "quantity": [2, 2],
                "unit_price": [100.0, 100.0],
                "discount": [25.0, 35.0],
            }
        )
        profile = profile_dataset(frame)
        ctx = build_context(frame, profile.role_map)
        # (200 - 25) + (200 - 35) = 340
        assert compute_metrics(ctx)["revenue"].value == pytest.approx(340.0)

    def test_profit_derived_from_revenue_minus_cost(self):
        frame = pd.DataFrame(
            {
                "order_date": ["2025-01-01"],
                "revenue": [500.0],
                "cost": [300.0],
            }
        )
        profile = profile_dataset(frame)
        ctx = build_context(frame, profile.role_map)
        assert compute_metrics(ctx)["profit"].value == pytest.approx(200.0)
        assert "profit" in ctx.derivations
