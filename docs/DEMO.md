# The demo

Two ways to see the product working, and the fictional business behind both.

---

## 1. The public demo

From the landing page: **Explore the live demo**, or go straight to `/demo`.

No account, no password, no file. The endpoint creates a throwaway workspace
with the sample data already loading and signs you into it. Typical time from
click to dashboard: under ten seconds, plus however long the analysis takes.

### What happens

```
POST /api/auth/demo            (Next.js)
  └─▶ POST /api/v1/auth/demo   (FastAPI)
        ├─ create a user, marked is_demo, random password, onboarding complete
        ├─ create a workspace, marked is_demo
        ├─ generate the NovaMart CSV and load it through the normal
        │  ingestion path — read, profile, infer, store
        ├─ accept the inferred schema
        └─ queue the analysis
  ◀── tokens, written to httpOnly cookies
redirect to /overview
```

The dataset goes through the **same ingestion code an uploaded file does**. It
is not a database fixture. A demo that bypassed ingestion would stop exercising
the part most likely to break.

### Why this is safe

| Property | How |
| --- | --- |
| Isolated | Each visitor gets their own workspace, enforced by the same `workspace_id` filter as every real tenant. `tests/test_demo.py` asserts one demo cannot read another's |
| No credential exists | The account is created with a random password that is never displayed, never returned, never documented. There is no shared demo login in this repository |
| No real data | NovaMart is generated from a seeded RNG |
| Rate limited | The endpoint is under `/auth/`, so it inherits the strict authentication budget (10 per 5 minutes per client) |
| Expires | Demo workspaces and their files are deleted after `DEMO_SESSION_HOURS`, default 24 |
| Switchable | `DEMO_DATA_ENABLED=false` removes the endpoint |

### Clean-up

`purge_expired_demo_sessions` runs at start-up and again whenever a demo is
created, so no scheduler is needed.

Deleting files can fail for reasons unrelated to the deletion being right — an
analysis still reading a cached parquet holds the file open on Windows, a
network volume hiccups. The rows are already gone at that point, so a directory
that cannot be removed is **renamed** with a `.deleted` suffix and collected by
the next sweep.

The sweep only ever touches directories carrying that suffix. Inferring
deletability by comparing the disk against the database would mean a
`DATABASE_URL` pointed at an empty database made every real customer's files
look orphaned.

### Not indexed

`/demo` is `Disallow`ed in `robots.txt` and carries `robots: noindex`. Every
visit creates a workspace; a crawler would create thousands.

---

## 2. Sample data in your own account

Sign up normally, then choose **Use sample data** in onboarding, or on the
**New dataset** screen. This loads NovaMart into your existing workspace
alongside anything else you have. Governed by the same `DEMO_DATA_ENABLED`
setting.

Use this when you want the sample and your own data side by side.

---

## 3. NovaMart

A fictional online retailer with 15 months of order history. Generated, but not
random: the generator is seeded, so the data is byte-identical on every machine,
and the analytical tests assert exact figures against it.

### Shape

| | |
| --- | --- |
| Rows | ~14,000 orders |
| Period | 15 months, ending in the most recent complete month |
| Products | 10, across 4 categories |
| Customers | ~3,200, with new and returning behaviour |
| Regions | Several, with differing trajectories |
| Columns | order id, date, customer id and segment, product, category, region, channel, quantity, unit price, cost, discount, revenue, profit, status, inventory on hand |

### The story planted in it

The demo exists to show the product finding something real, so the data encodes
specific events rather than noise.

| Event | What it looks like |
| --- | --- |
| **A stockout** | One product has 13 days of zero available inventory in the final August, driving a ~14% revenue decline. Zero-inventory rows are present as corroborating evidence |
| **A region eroding** | One region loses share steadily across the period, as a competitor would cause |
| **A category growing** | One category grows materially faster than the rest |
| **A flash sale** | One day with roughly triple the normal order volume |
| **A cancellation spike** | One week at about 3× the normal cancellation rate |
| **Seasonality** | A weekly cycle and a mild annual one, strong enough to detect and not so strong it drowns the events above |

### What the product should find

If these are not in the output, something has regressed:

- Revenue down ~13.9% in the final month against the previous one
- The stockout product identified as the largest contributor, around 61% of the
  change
- The zero-inventory days surfaced as **coincident** evidence, framed as a
  possible explanation and never as a proven cause
- The declining region flagged as a trend, not as an anomaly
- The flash sale and the cancellation week detected as anomalies
- The growing category surfaced as an opportunity insight

`tests/test_e2e_flow.py` asserts several of these directly, so the narrative
cannot quietly disappear.

### Regenerating it

```bash
cd backend
python -c "from app.seed.novamart import write_csv; print(write_csv('novamart.csv'))"
```

The generator is `backend/app/seed/novamart.py`. Changing it changes the figures
the analytical tests assert, so update both together.

---

## 4. Deploying with the demo on or off

**On** (default) is right for a public deployment you want people to try. Bound
your exposure with:

```bash
DEMO_DATA_ENABLED=true
DEMO_SESSION_HOURS=6          # shorter lifetime, less disk
AUTH_RATE_LIMIT_REQUESTS=5    # fewer demo creations per client per window
```

Each demo workspace costs roughly 2–3 MB of storage until it expires.

**Off** is right for a private or internal deployment:

```bash
DEMO_DATA_ENABLED=false
```

The endpoint returns 404, and the "Use sample data" affordance is hidden by
setting `NEXT_PUBLIC_DEMO_ENABLED=false` on the frontend.

---

## 5. Honesty

Everything shown in the product's marketing — the example answer on the landing
page, the dashboard preview, the figures in this repository's documentation —
comes from this dataset. Nothing is a mockup of numbers that no run would
produce.

There are no invented customers, testimonials, logos, partnerships, user counts,
or awards anywhere in the product. A visitor who loads the demo sees the same
figures the landing page quotes, because they are the same data.
