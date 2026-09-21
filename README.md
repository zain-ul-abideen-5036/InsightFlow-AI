<div align="center">

# InsightFlow AI

**Understand your business. Act on the data.**

An AI business operations analyst. Upload a spreadsheet of your orders and find
out what changed, where it came from, what may explain it, and what to check
next — with the evidence behind every figure.

[Quick start](#quick-start) · [Architecture](docs/ARCHITECTURE.md) · [Deployment](docs/DEPLOYMENT.md) · [Security](docs/SECURITY.md) · [AI guardrails](docs/AI_GUARDRAILS.md)

</div>

---

## What this is

Most "AI for your data" tools paste a CSV into a language model and ask it for
insights. That fails in three ways that matter to a business owner: models
cannot reliably do arithmetic over thousands of rows, there is no calculation to
inspect, and the whole file leaves the machine.

InsightFlow splits the problem in two.

- A **deterministic analytics engine** computes every number — totals, growth
  rates, contributions, anomaly bounds, segment breakdowns — in pandas, and is
  tested against known-answer fixtures.
- An **AI layer** turns those computed findings into readable business English.
  It receives a compact evidence bundle, never the rows, and everything it
  writes is checked against that bundle before you see it.

The practical result: **turn the AI off and the product still works.** The whole
test suite runs that way.

```
DATA  →  ANALYSIS  →  INSIGHT  →  EXPLANATION  →  ACTION
```

---

## What it actually does

Given a sales export, InsightFlow works out what your columns mean, computes
what it can, and reports what it found:

> **Revenue fell 13.9% in Aug 2026 compared with Jul 2026.**
>
> By product, the largest movement came from Nova Air Purifier. It alone
> accounts for 61.8% of the change (−$19,193).
>
> Inventory records show zero available units on 7 days in this period.
>
> *Possible explanation:* the period of zero recorded inventory for Nova Air
> Purifier coincides with the fall in revenue. An inventory shortage is
> consistent with what the data shows, though the data alone cannot confirm it
> as the cause.
>
> **Confidence:** moderate · [View evidence]

That is real output from the included sample dataset. Note what it does *not*
say: it never claims the stockout caused the decline, because co-occurrence is
all the data establishes.

---

## Features

**Dataset intelligence** — CSV, TSV, and Excel upload with encoding and
delimiter detection, title-row skipping, duplicate-header recovery, and
currency/accounting number parsing. Columns are classified into semantic roles
by combining name patterns with value evidence, and you review and correct the
result before anything is analysed.

**Automated analytics** — revenue, cost, profit, margin, orders, customers,
units, average order value, revenue per customer, and discounting. Each metric
is produced **only** when the data supports it; a missing column yields a stated
reason, never a zero.

**Time series** — daily, weekly, monthly, and quarterly trends with trailing
moving averages, growth tables, least-squares trend detection, and weekly or
monthly seasonality when there is enough history to justify the claim.

**Anomaly detection** — rolling z-score, interquartile range, and Isolation
Forest, each applied where it fits rather than uniformly. One business event
produces one anomaly, with the other metrics it moved listed as corroboration.

**Investigation** — attributes a movement across every dimension, ranks them by
*excess* contribution (how much a segment moved relative to its size), finds
operational signals like stockouts and status shifts, and proposes explicitly
hedged explanations with a confidence level derived from the evidence.

**Ask InsightFlow** — a question is parsed into a typed analysis plan, executed
deterministically, and only then handed to the model to phrase. Every answer
carries its plan and its evidence.

**Reports** — a shareable, printable performance report. Sections are
materialised at generation time, so a report never silently changes its own
figures.

---

## Screenshots

Real captures from the running application with the included sample dataset.
Every figure in them is one the product produced — nothing here is a mockup.

### The landing page

What it is, who it is for, and the argument that separates it from a chatbot
with a spreadsheet attached.

![Landing page: the claim, the product shot, and the trust argument](docs/screenshots/landing.png)

### The dashboard

A greeting, the four figures that matter with their shape behind them, the
trend, then **what changed** and **what needs attention** — kept separate,
because a movement and an anomaly are different questions.

![Overview: KPIs with sparklines, the revenue trend, ranked findings](docs/screenshots/overview.png)

### Ask InsightFlow

A business question, answered from computed evidence. The conclusion, the
figures behind it, and — visually set apart, because the distinction is the
product — what might explain it, with follow-ups this dataset can answer.

![Ask InsightFlow: an evidence-backed answer](docs/screenshots/ask.png)

### Investigation

What happened, where it happened, what coincided with it, and what might
explain it.

![Investigation: findings, evidence, and hedged explanations](docs/screenshots/investigation.png)

<details>
<summary>More: sign in, upload, insights, anomalies, report, settings, dark theme, mobile</summary>

| | |
| --- | --- |
| [Sign in](docs/screenshots/login.png) | The front door, with the evidence proposition beside it |
| [Upload](docs/screenshots/upload.png) | Step one of the guided flow, and what we look for in a file |
| [Insights](docs/screenshots/insights.png) | Findings banded by severity, top one given prominence |
| [Anomalies](docs/screenshots/anomalies.png) | Deviation bars, so which is furthest out is visible at a glance |
| [Detected fields](docs/screenshots/fields.png) | What each column was inferred to mean — editable before anything runs |
| [Report](docs/screenshots/report.png) | The printable business performance report |
| [Settings](docs/screenshots/settings.png) | The active AI provider, and exactly what is sent to it |
| [Dark theme](docs/screenshots/overview-dark.png) | Tuned separately, not derived by inversion |
| [Mobile dashboard](docs/screenshots/mobile-overview.png) | Laid out for a phone rather than compressed |
| [Mobile Ask](docs/screenshots/mobile-ask.png) | The signature screen at 390px |

</details>

---

## Architecture

```
Browser
   │  same-origin fetch, httpOnly cookie
   ▼
Next.js 15 (App Router)
   │  /api/auth/*       — owns the session cookie
   │  /api/backend/[..] — authenticating reverse proxy
   ▼  Authorization: Bearer
FastAPI
   ├─▶ analytics/   deterministic engine (pandas · numpy · scipy · scikit-learn)
   ├─▶ ai/          provider-agnostic explanation layer + guardrails
   └─▶ jobs/        in-process async analysis runner
   ▼
PostgreSQL (SQLite in development)  ·  filesystem storage
```

The browser never contacts the API directly. Requests are proxied through
Next.js so the session cookie stays first-party, access tokens never reach
JavaScript, and there is no CORS to configure in production.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the reasoning, including
the deliberate non-goals.

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js 15, React 19, TypeScript (strict) | Server components remove a whole class of loading states |
| Styling | Tailwind CSS, Radix UI primitives | Accessible behaviour without inheriting someone else's visual identity |
| Charts | Recharts | Wrapped so every chart ships a text summary and a data table |
| Server state | TanStack Query | Polling, cache invalidation, and retry policy in one place |
| Backend | FastAPI, Python 3.11 | The product is mostly data analysis; this is where those libraries live |
| Analytics | pandas, numpy, scipy, scikit-learn | Correct, fast, and inspectable |
| Database | PostgreSQL via SQLAlchemy 2.0 + Alembic | SQLite in development for zero setup |
| AI | Ollama or any OpenAI-compatible endpoint | Selected by one environment variable |

---

## Quick start

Requires Python 3.11+ and Node 20+. Nothing else — no database server, no AI
provider.

```bash
git clone <your-repository-url>
cd "InsightFlow AI"

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# Frontend, in a second terminal
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000> and click **Explore the live demo**. No account, no
password, no file — you will be looking at a full analysis of 14,000 orders
within a few seconds.

For PostgreSQL, Ollama, and production deploys, see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## The sample dataset

`NovaMart` is a fictional online retailer with 15 months of order history. It is
generated, but it is not random — it encodes a specific narrative, so a
first-time user sees the product find something real:

- A **13-day stockout** of one product in August 2026 that drives a ~14% revenue
  decline, with zero-inventory rows as corroborating evidence
- A **region eroding** steadily as a competitor takes share
- A **category growing** materially faster than the rest
- A **flash sale** that triples order volume for one day
- A **cancellation spike** at roughly 3× the normal rate for one week

The generator is seeded, so the data is identical on every machine, and the
analytical tests assert exact figures against it.

---

## Environment variables

Both `backend/.env.example` and `frontend/.env.example` document every variable.
The ones you are most likely to change:

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | backend | *(SQLite)* | PostgreSQL connection string |
| `SECRET_KEY` | backend | dev placeholder | Signs tokens — **must** change in production |
| `AI_PROVIDER` | backend | `ollama` | `ollama`, `openai`, or `none`. `openai` means the protocol, not the vendor |
| `AI_ENABLED` | backend | `true` | `false` disables written explanations entirely |
| `OPENAI_BASE_URL` | backend | Groq's endpoint | Any OpenAI-compatible server. Groq's free developer tier needs no credit card |
| `MAX_UPLOAD_SIZE_MB` | backend | `50` | Upload ceiling |
| `BACKEND_API_URL` | frontend | `http://localhost:8000` | Where the Next.js server reaches the API |
| `PROXY_SHARED_SECRET` | both | *(empty)* | Lets the API trust the client address the frontend forwards |

---

## Testing

```bash
# Backend — 278 tests
cd backend && pytest

# Frontend — 80 tests
cd frontend && npm run check      # typecheck + lint + tests

# Full-stack acceptance — 75 checks, with both servers running
cd backend && python scripts/acceptance_check.py

# Browser end to end — 11 tests, with both servers running
cd frontend && npx playwright test --project=chromium
```

The test suite is weighted towards the things that would be silently wrong
rather than loudly broken:

- **Analytical correctness** (`test_analytics_math.py`) — known datasets with
  hand-verified answers. January 1000 → February 1200 must return exactly 20%.
- **Tenant isolation** (`test_authorization.py`) — every workspace-scoped
  resource is probed with a *valid* id belonging to another tenant, which is the
  shape the real bug takes.
- **AI safety** (`test_ai_safety.py`) — invented figures, unhedged causal claims,
  malformed JSON, and a dead provider all have to degrade correctly.
- **AI adversarial** (`test_ai_adversarial.py`) — questions the data cannot
  answer, leading questions pushing for a cause, fabricated dates and columns,
  and the invariant that *every figure the engine writes must be one it
  recorded*, swept over 27 questions at four grains.
- **End to end** (`test_e2e_flow.py`) — the full journey, plus assertions that
  pin the sample dataset's planted narrative.

The acceptance script drives the product through the Next.js layer with a real
session cookie: 75 checks covering signup through report generation, tenant
isolation, and invalid-input handling.

---

## Security

- bcrypt password hashing (cost 12), with length validation rather than silent
  truncation at bcrypt's 72-byte limit
- Short-lived JWT access tokens plus refresh tokens; a password change bumps a
  token version that retires every existing session
- Tokens live in httpOnly cookies owned by the Next.js layer and never reach
  JavaScript
- Authorization is enforced in the backend on every request. Cross-tenant access
  returns 404, not 403, so existence is not leaked
- Upload validation by extension, size, magic bytes, and content — a `.csv`
  containing a zip archive is rejected
- Formula-injection neutralisation on exported cells
- Rate limiting, stricter on authentication endpoints; successful sign-ins are
  refunded so shared IPs are not locked out by legitimate use
- Audit logging of security-relevant events, never of dataset contents
- Production start-up refuses placeholder secrets, short keys, a missing
  database URL, or `AI_PROVIDER=openai` with no key

**Not claimed:** InsightFlow AI holds no SOC 2, ISO 27001, HIPAA, or GDPR
certification. The controls above are the ones that exist.

### Data handling

The AI layer receives aggregated metrics, segment names, period labels, and your
question — never the rows of your file. With the default local Ollama provider,
nothing leaves your machine at all. Settings → AI & data shows the active
provider and exactly what is transmitted.

---

## Project layout

```
backend/
  app/
    analytics/   the deterministic engine — profiling, metrics, trends,
                 segmentation, anomalies, investigation, planner, executor
    ai/          provider abstraction, prompts, structured schemas, guardrails
    api/v1/      REST endpoints
    db/          SQLAlchemy models and session management
    jobs/        async analysis runner
    seed/        the NovaMart generator
  tests/         278 tests
  scripts/       acceptance_check.py

frontend/
  app/           routes (marketing · auth · app · API handlers)
  components/    design system, charts, state components
  features/      domain modules — datasets, analysis, insights, anomalies,
                 chat, reports, settings, onboarding
  lib/           API client, session handling, formatting
  tests/         80 tests

docs/            ARCHITECTURE.md · DEPLOYMENT.md · SECURITY.md
                 AI_GUARDRAILS.md · TESTING.md · DEVELOPMENT.md
                 ENVIRONMENT.md · DEMO.md · PRODUCTION_AUDIT.md
                 FINAL_LAUNCH_REPORT.md · DESIGN_SYSTEM.md
                 UI_UX_AUDIT.md · screenshots/
```

---

## The demo

Two ways in, and no shared credential in either.

**Public demo** — `/demo` from the landing page. Creates a throwaway workspace
with the sample data already loading, isolated from every other visitor,
deleted automatically after `DEMO_SESSION_HOURS`. No account, no password, no
file. `DEMO_DATA_ENABLED=false` removes the endpoint entirely.

**Sample data in your own account** — sign up, then **Use sample data** in
onboarding, to have NovaMart alongside your own.

See [docs/DEMO.md](docs/DEMO.md) for what is in the dataset and what the product
should find in it.

---

## Documentation

| | |
| --- | --- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it is put together, and the deliberate non-goals |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Getting it running, the layout, the conventions that are load-bearing |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Local setup through production, with exact commands |
| [ENVIRONMENT.md](docs/ENVIRONMENT.md) | Every variable, what it does, what breaks without it |
| [SECURITY.md](docs/SECURITY.md) | The controls that exist, and the ones not claimed |
| [AI_GUARDRAILS.md](docs/AI_GUARDRAILS.md) | How the AI is prevented from inventing things |
| [TESTING.md](docs/TESTING.md) | What is tested, why, and how to add to it |
| [DEMO.md](docs/DEMO.md) | The sample dataset and the demo modes |
| [PRODUCTION_AUDIT.md](docs/PRODUCTION_AUDIT.md) | What was wrong before the productionisation pass |
| [FINAL_LAUNCH_REPORT.md](docs/FINAL_LAUNCH_REPORT.md) | Where it stands now, including what is not built |
| [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | The tokens, components and rules the interface is built from |
| [UI_UX_AUDIT.md](docs/UI_UX_AUDIT.md) | What was wrong with the interface before the redesign |

---

## Roadmap

Honest about what is not built yet.

- **PDF export** — reports currently print to PDF via the browser
- **Scheduled analysis** — re-run on upload or on a schedule, with alerting
- **Forecasting** — the data-sufficiency checks exist; the model does not
- **Team workspaces** — the schema supports multiple members and roles; the
  invitation flow is not built
- **Incremental uploads** — appending to a dataset rather than replacing it
- **More connectors** — Shopify, Stripe, and QuickBooks rather than file upload

---

## Licence

MIT. See [LICENSE](LICENSE).
