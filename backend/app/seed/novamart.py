"""NovaMart — the demo dataset.

A fictional online retailer with ~15 months of order history. The data is
generated, but it is not random: it encodes a specific business narrative, so
that a first-time user sees the product find something real rather than noise.

What is deliberately built into the data
----------------------------------------

* **Underlying growth** of roughly 3% a month, decelerating in the final quarter.
* **Weekly seasonality** — weekends run ~25% below weekdays.
* **Holiday peak** in late November and December.
* **The August stockout.** ``Nova Air Purifier``, normally about 14% of revenue,
  goes out of stock for thirteen days in August 2026. Its sales collapse, August
  revenue falls sharply against July, and the inventory column records zero
  units available on exactly those dates. This is the story the investigation
  engine is meant to reconstruct from evidence — the causal link is *implied by
  coincidence in the data*, never stated in it.
* **A declining region** — Lahore erodes steadily through 2026 as a competitor
  takes share.
* **A growing category** — Audio grows roughly 45% over the period.
* **A flash sale** on 2026-03-14: order volume roughly triples for one day at a
  much deeper discount.
* **A cancellation spike** in the week of 2026-05-11, when a payment processor
  issue pushed cancellations to about 3x their normal rate.

Everything is driven by a seeded RNG, so the dataset is byte-identical on every
machine and the analytical tests can assert exact figures against it.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np

SEED = 20260401
DEFAULT_START = date(2025, 6, 1)
DEFAULT_END = date(2026, 8, 31)

# The stockout that drives the headline investigation.
STOCKOUT_PRODUCT = "Nova Air Purifier"
STOCKOUT_START = date(2026, 8, 9)
STOCKOUT_END = date(2026, 8, 20)  # inclusive -> 13 days

FLASH_SALE_DAY = date(2026, 3, 14)
CANCELLATION_SPIKE_START = date(2026, 5, 11)
CANCELLATION_SPIKE_END = date(2026, 5, 17)

DECLINING_REGION = "Lahore"
GROWING_CATEGORY = "Audio"


@dataclass(frozen=True, slots=True)
class Product:
    name: str
    category: str
    price: float
    unit_cost: float
    popularity: float          # relative share of order lines
    trend_per_month: float     # multiplicative drift, e.g. 0.03 = +3%/month


PRODUCTS: tuple[Product, ...] = (
    Product("Nova Air Purifier",      "Home",        249.00, 141.00, 0.135,  0.010),
    Product("Aurora Desk Lamp",       "Lighting",     79.00,  33.00, 0.115,  0.022),
    Product("Basalt Ceramic Mug",     "Kitchen",      24.00,   8.50, 0.130, -0.004),
    Product("Cirrus Office Chair",    "Furniture",   329.00, 201.00, 0.095,  0.006),
    Product("Delta Wool Rug",         "Home",        189.00, 104.00, 0.065, -0.021),
    Product("Echo Wireless Earbuds",  "Audio",       129.00,  61.00, 0.115,  0.038),
    Product("Fjord Bluetooth Speaker","Audio",       199.00,  96.00, 0.070,  0.031),
    Product("Gale Standing Fan",      "Home",         89.00,  44.00, 0.060, -0.012),
    Product("Helio Solar Charger",    "Electronics",  59.00,  24.00, 0.085,  0.026),
    Product("Ion Steel Kettle",       "Kitchen",      64.00,  27.50, 0.075,  0.004),
    Product("Juno Linen Cushion",     "Home",         39.00,  15.00, 0.050, -0.008),
    Product("Kelvin Smart Scale",     "Electronics",  74.00,  32.00, 0.030,  0.018),
)

REGIONS: tuple[tuple[str, float, str], ...] = (
    # (region, base share, country)
    ("Karachi",  0.255, "Pakistan"),
    ("Lahore",   0.215, "Pakistan"),
    ("Islamabad",0.145, "Pakistan"),
    ("Dubai",    0.155, "UAE"),
    ("Riyadh",   0.115, "Saudi Arabia"),
    ("Doha",     0.115, "Qatar"),
)

CHANNELS: tuple[tuple[str, float], ...] = (
    ("Website", 0.46), ("Mobile App", 0.30), ("Marketplace", 0.17), ("Phone", 0.07),
)

PAYMENT_METHODS: tuple[tuple[str, float], ...] = (
    ("Credit Card", 0.42), ("Cash on Delivery", 0.24),
    ("Bank Transfer", 0.18), ("PayPal", 0.16),
)

SEGMENTS: tuple[tuple[str, float], ...] = (
    ("Consumer", 0.62), ("Small Business", 0.26), ("Enterprise", 0.12),
)

COLUMNS = [
    "order_id", "order_date", "customer_id", "customer_segment", "product",
    "category", "region", "country", "channel", "quantity", "unit_price",
    "discount", "revenue", "unit_cost", "cost", "profit", "payment_method",
    "status", "units_in_stock",
]


def _month_index(day: date, start: date) -> float:
    return (day.year - start.year) * 12 + (day.month - start.month) + (day.day - 1) / 30.0


def _seasonal_multiplier(day: date, months_elapsed: float) -> float:
    """Combine growth, weekly rhythm, and holiday effects into one factor."""
    # Underlying growth, decelerating after month 12.
    growth = 1.0 + 0.030 * min(months_elapsed, 12.0) + 0.008 * max(months_elapsed - 12.0, 0.0)

    # Weekends are quieter for this retailer.
    weekday = day.weekday()
    weekly = {0: 1.10, 1: 1.12, 2: 1.08, 3: 1.05, 4: 1.00, 5: 0.78, 6: 0.74}[weekday]

    # Holiday season and the post-holiday lull.
    holiday = 1.0
    if day.month == 11 and day.day >= 20:
        holiday = 1.55
    elif day.month == 12:
        holiday = 1.70 if day.day <= 22 else 0.85
    elif day.month == 1 and day.day <= 15:
        holiday = 0.72
    elif day.month in (6, 7, 8):
        # The summer lull must cover August too. Applying it only to June and
        # July would give August an artificial tailwind against its comparison
        # month, masking any real change.
        holiday = 0.92

    return growth * weekly * holiday


def _is_stocked_out(product_name: str, day: date) -> bool:
    return (
        product_name == STOCKOUT_PRODUCT
        and STOCKOUT_START <= day <= STOCKOUT_END
    )


def _stock_level(rng: np.random.Generator, product: Product, day: date) -> int:
    """Units recorded as available. Zero for the stocked-out product and dates.

    The run-up is also modelled: stock declines for several days before hitting
    zero, which is what a real inventory feed would show and gives the
    investigation engine a genuine leading signal to find.
    """
    if _is_stocked_out(product.name, day):
        return 0
    if product.name == STOCKOUT_PRODUCT:
        days_before = (STOCKOUT_START - day).days
        if 0 < days_before <= 4:
            return int(max(2, 18 - days_before * 4))
        days_after = (day - STOCKOUT_END).days
        if 0 < days_after <= 3:
            return int(40 + days_after * 35)
    return int(rng.integers(35, 420))


def _region_weights(day: date, months_elapsed: float) -> np.ndarray:
    """Region mix, with Lahore eroding over the period."""
    weights = np.array([share for _, share, _ in REGIONS], dtype="float64")
    for index, (name, _, _) in enumerate(REGIONS):
        if name == DECLINING_REGION:
            # Loses roughly a third of its share across 15 months.
            weights[index] *= max(0.62, 1.0 - 0.026 * months_elapsed)
    return weights / weights.sum()


def _product_weights(day: date, months_elapsed: float) -> np.ndarray:
    weights = np.empty(len(PRODUCTS), dtype="float64")
    for index, product in enumerate(PRODUCTS):
        weight = product.popularity * (1.0 + product.trend_per_month * months_elapsed)
        if product.category == GROWING_CATEGORY:
            weight *= 1.0 + 0.030 * months_elapsed
        if _is_stocked_out(product.name, day):
            # Not zero: backorders still trickle through, which is both more
            # realistic than a clean cliff and necessary for the inventory
            # evidence to exist in the data at all.
            weight *= 0.40
        weights[index] = max(weight, 1e-6)
    return weights / weights.sum()


def _daily_order_count(rng: np.random.Generator, day: date, months_elapsed: float) -> int:
    base = 26.0
    count = base * _seasonal_multiplier(day, months_elapsed)
    if day == FLASH_SALE_DAY:
        count *= 3.1
    return max(1, int(rng.poisson(count)))


def _status(rng: np.random.Generator, day: date) -> str:
    spike = CANCELLATION_SPIKE_START <= day <= CANCELLATION_SPIKE_END
    cancel_rate = 0.096 if spike else 0.030
    roll = rng.random()
    if roll < cancel_rate:
        return "cancelled"
    if roll < cancel_rate + 0.022:
        return "returned"
    if roll < cancel_rate + 0.052:
        return "pending"
    if roll < cancel_rate + 0.140:
        return "shipped"
    return "completed"


def _discount_rate(rng: np.random.Generator, day: date, segment: str) -> float:
    if day == FLASH_SALE_DAY:
        return float(np.round(rng.uniform(0.25, 0.45), 2))
    if day.month == 11 and day.day >= 24:
        return float(np.round(rng.uniform(0.10, 0.30), 2))
    base = {"Consumer": (0.0, 0.12), "Small Business": (0.02, 0.16), "Enterprise": (0.05, 0.22)}[segment]
    if rng.random() < 0.42:
        return 0.0
    return float(np.round(rng.uniform(*base), 2))


def _build_customers(rng: np.random.Generator, count: int = 3200) -> list[tuple[str, str]]:
    segments = [name for name, _ in SEGMENTS]
    weights = np.array([weight for _, weight in SEGMENTS], dtype="float64")
    return [
        (f"CUST-{index:05d}", str(rng.choice(segments, p=weights)))
        for index in range(1, count + 1)
    ]


def generate_rows(
    start: date = DEFAULT_START, end: date = DEFAULT_END, seed: int = SEED
) -> list[dict[str, Any]]:
    """Generate the NovaMart order rows. Deterministic for a given seed."""
    rng = np.random.default_rng(seed)
    customers = _build_customers(rng)
    customer_ids = np.array([cid for cid, _ in customers])
    customer_segments = {cid: segment for cid, segment in customers}

    # A realistic retailer has a loyal core: a minority of customers place a
    # large share of the orders. A uniform draw would make every customer a
    # one-time buyer and the repeat-rate metric meaningless.
    loyalty = rng.pareto(1.6, size=len(customers)) + 1.0
    loyalty_weights = loyalty / loyalty.sum()

    region_names = [name for name, _, _ in REGIONS]
    region_countries = {name: country for name, _, country in REGIONS}
    channel_names = [name for name, _ in CHANNELS]
    channel_weights = np.array([weight for _, weight in CHANNELS], dtype="float64")
    payment_names = [name for name, _ in PAYMENT_METHODS]
    payment_weights = np.array([weight for _, weight in PAYMENT_METHODS], dtype="float64")

    rows: list[dict[str, Any]] = []
    order_number = 100_000
    day = start

    while day <= end:
        months_elapsed = _month_index(day, start)
        order_count = _daily_order_count(rng, day, months_elapsed)
        product_weights = _product_weights(day, months_elapsed)
        region_weights = _region_weights(day, months_elapsed)

        # One stock reading per product per day, shared by that day's rows, so
        # the inventory column is internally consistent.
        stock_today = {p.name: _stock_level(rng, p, day) for p in PRODUCTS}

        for _ in range(order_count):
            order_number += 1
            customer_id = str(rng.choice(customer_ids, p=loyalty_weights))
            segment = customer_segments[customer_id]
            product = PRODUCTS[int(rng.choice(len(PRODUCTS), p=product_weights))]
            region = str(rng.choice(region_names, p=region_weights))
            channel = str(rng.choice(channel_names, p=channel_weights))
            payment = str(rng.choice(payment_names, p=payment_weights))
            status = _status(rng, day)
            if _is_stocked_out(product.name, day) and rng.random() < 0.85:
                # Orders placed against out-of-stock inventory sit as backorders.
                status = "pending"

            quantity = int(rng.choice([1, 1, 1, 2, 2, 3, 4], p=[.34, .17, .13, .16, .09, .07, .04]))
            if segment == "Enterprise":
                quantity += int(rng.integers(0, 4))

            # Small price dispersion (promotions, regional pricing).
            unit_price = float(np.round(product.price * rng.normal(1.0, 0.035), 2))
            unit_price = max(unit_price, round(product.unit_cost * 1.05, 2))
            unit_cost = float(np.round(product.unit_cost * rng.normal(1.0, 0.02), 2))

            discount_rate = _discount_rate(rng, day, segment)
            gross = unit_price * quantity
            discount_amount = float(np.round(gross * discount_rate, 2))
            revenue = float(np.round(gross - discount_amount, 2))
            cost = float(np.round(unit_cost * quantity, 2))
            profit = float(np.round(revenue - cost, 2))

            # Revenue is recognised on fulfilment. Cancelled, returned, and
            # still-pending orders bring no money in. Recording them at full
            # value is the most common way a real sales export overstates
            # revenue, so the demo data models it honestly.
            if status in {"cancelled", "returned", "pending"}:
                revenue, cost, profit = 0.0, 0.0, 0.0

            order_time = datetime(
                day.year, day.month, day.day,
                int(rng.integers(7, 23)), int(rng.integers(0, 60)), int(rng.integers(0, 60)),
            )

            rows.append(
                {
                    "order_id": f"NM-{order_number}",
                    "order_date": order_time.strftime("%Y-%m-%d %H:%M:%S"),
                    "customer_id": customer_id,
                    "customer_segment": segment,
                    "product": product.name,
                    "category": product.category,
                    "region": region,
                    "country": region_countries[region],
                    "channel": channel,
                    "quantity": quantity,
                    "unit_price": f"{unit_price:.2f}",
                    "discount": f"{discount_amount:.2f}",
                    "revenue": f"{revenue:.2f}",
                    "unit_cost": f"{unit_cost:.2f}",
                    "cost": f"{cost:.2f}",
                    "profit": f"{profit:.2f}",
                    "payment_method": payment,
                    "status": status,
                    "units_in_stock": stock_today[product.name],
                }
            )
        day += timedelta(days=1)

    return rows


def write_csv(path: Path, rows: list[dict[str, Any]] | None = None) -> Path:
    """Write the demo dataset to ``path`` and return it."""
    rows = rows if rows is not None else generate_rows()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return path


def generate_csv_bytes() -> bytes:
    """The demo dataset as CSV bytes, for seeding through the normal upload path."""
    import io

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(generate_rows())
    return buffer.getvalue().encode("utf-8")


NARRATIVE = {
    "business": "NovaMart",
    "description": (
        "A fictional online retailer selling home, kitchen, audio, and "
        "electronics products across Pakistan and the Gulf."
    ),
    "period": f"{DEFAULT_START.isoformat()} to {DEFAULT_END.isoformat()}",
    "planted_events": [
        {
            "key": "stockout",
            "title": f"{STOCKOUT_PRODUCT} stockout",
            "detail": (
                f"Zero units recorded from {STOCKOUT_START.isoformat()} to "
                f"{STOCKOUT_END.isoformat()} (13 days), coinciding with a sharp "
                "fall in that product's sales and in total August revenue."
            ),
        },
        {
            "key": "declining_region",
            "title": f"{DECLINING_REGION} decline",
            "detail": "Share of revenue erodes steadily across the period.",
        },
        {
            "key": "growing_category",
            "title": f"{GROWING_CATEGORY} growth",
            "detail": "Grows materially faster than every other category.",
        },
        {
            "key": "flash_sale",
            "title": "Flash sale",
            "detail": f"Order volume roughly triples on {FLASH_SALE_DAY.isoformat()} at deep discounts.",
        },
        {
            "key": "cancellations",
            "title": "Cancellation spike",
            "detail": (
                f"Cancellations run about 3x normal between "
                f"{CANCELLATION_SPIKE_START.isoformat()} and {CANCELLATION_SPIKE_END.isoformat()}."
            ),
        },
    ],
}


if __name__ == "__main__":  # pragma: no cover
    import sys

    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("novamart_orders.csv")
    generated = generate_rows()
    write_csv(target, generated)
    print(f"Wrote {len(generated):,} rows to {target}")
