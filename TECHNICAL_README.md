# InsightFlow AI — Technical Documentation

The engineering reference: how to run it, how it is put together, and what the
test suites prove. For what the product does and why, start with the
[README](README.md).

- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Architecture](#architecture)
- [The evidence guarantee](#the-evidence-guarantee)
- [Technology stack](#technology-stack)
- [The sample dataset](#the-sample-dataset)
- [The demo](#the-demo)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Project structure](#project-structure)
- [Roadmap](#roadmap)
- [Licence](#licence)

---

## Getting started

**Requirements:** Python 3.11+ and Node.js 20+. Nothing else — no database
server and no AI provider. Development uses SQLite, and without a model the
engine writes every explanation itself.

```bash
git clone https://github.com/zain-ul-abideen-5036/InsightFlow-AI.git
cd InsightFlow-AI

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
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

To get written explanations, point the backend at a model. Either run
[Ollama](https://ollama.com) locally (`AI_PROVIDER=ollama`, and nothing leaves
the machine) or use any OpenAI-compatible endpoint (`AI_PROVIDER=openai`) —
Groq's free developer tier needs no credit card.

More on the layout and the conventions that are load-bearing:
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

---

## Environment variables

`backend/.env.example` and `frontend/.env.example` document every variable, and
[docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) says what breaks without each one.
The ones you are most likely to change:

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | backend | *(SQLite)* | PostgreSQL connection string |
| `SECRET_KEY` | backend | dev placeholder | Signs tokens — **must** change in production |
| `AI_PROVIDER` | backend | `ollama` | `ollama`, `openai`, or `none`. `openai` means the protocol, not the vendor |
| `AI_ENABLED` | backend | `true` | `false` disables written explanations entirely |
| `OPENAI_BASE_URL` | backend | Groq's endpoint | Any OpenAI-compatible server |
| `MAX_UPLOAD_SIZE_MB` | backend | `50` | Upload ceiling |
| `STORAGE_BACKEND` | backend | `local` | `database` on serverless, where `/tmp` is per-instance |
| `ANALYSIS_EXECUTION` | backend | `thread` | `request` on serverless, where work after the response may never run |
| `BACKEND_API_URL` | frontend | `http://localhost:8000` | Where the Next.js server reaches the API. Injected by a service binding on Vercel — never set by hand there |
| `NEXT_PUBLIC_MAX_UPLOAD_MB` | frontend | `50` | The ceiling the browser enforces. `4` on Vercel |
| `PROXY_SHARED_SECRET` | both | *(empty)* | Lets the API trust the client address the frontend forwards |

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
   ├─▶ analytics/   deterministic engine (pandas · numpy · scikit-learn)
   ├─▶ ai/          provider-agnostic explanation layer + guardrails
   └─▶ jobs/        analysis runner
   ▼
PostgreSQL (SQLite in development)  ·  local or database file storage
```

The browser never contacts the API directly. Requests are proxied through
Next.js so the session cookie stays first-party, access tokens never reach
JavaScript, and there is no CORS to configure in production.

The analysis runs as a pipeline of stages — ingestion, profiling, schema
inference, metrics, time series, segmentation, anomalies, insights — each
committed as it completes, so progress is durable and the browser can poll it.

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the reasoning, including the
deliberate non-goals.

---

## The evidence guarantee

> **The AI may explain the evidence. It may not add to it.**

```
your data
    ▼
deterministic analytics engine          ← every number is produced here
    ▼
evidence bundle                          ← aggregates, labels, periods, calculations
    ▼
language model                           ← phrases it, produces no figures of its own
    ▼
validation against the bundle            ← anything unsupported is discarded
    ▼
what you see
```

Two validators run over every model response, in
[`backend/app/ai/guardrails.py`](backend/app/ai/guardrails.py):

- **Numeric.** Every number in the generated text must match the evidence
  bundle — exactly, within rounding, as the difference of two evidence values,
  or rescaled downwards (42,100 as "42.1 thousand"). Dates are stripped before
  extraction so `2026-03-14` is not read as the figures `-03` and `-14`.
- **Causal.** Unhedged causal language — `caused by`, `due to`, `led to`,
  `drove the` — is rejected unless the *same sentence* hedges it. The data only
  ever establishes co-occurrence, so the product may never claim more.

Any failure — a dead provider, a timeout, malformed JSON, an invented figure, an
unhedged cause — falls back to the answer the engine wrote itself. The user
never sees an error, and the interface says which of the two they are reading.

The model receives aggregated metrics, segment names, period labels and the
question. **Never the rows of your file.**

The full account, including what the guardrails deliberately do not cover:
[docs/AI_GUARDRAILS.md](docs/AI_GUARDRAILS.md).

---

## Technology stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js 15.5, React 19, TypeScript (strict) | Server components remove a whole class of loading states |
| Styling | Tailwind CSS 3.4, Radix UI primitives | Accessible behaviour without inheriting someone else's visual identity |
| Charts | Recharts 2.15 | Wrapped so every chart ships a text summary and a data table |
| Server state | TanStack Query 5 | Polling, cache invalidation, and retry policy in one place |
| Forms | React Hook Form, Zod | One schema for validation and types |
| Backend | FastAPI 0.115, Python 3.12, Pydantic 2 | The product is mostly data analysis; this is where those libraries live |
| Analytics | pandas 2.2, numpy 2.2, scikit-learn 1.6 | Correct, fast, and inspectable. scikit-learn is optional — only Isolation Forest needs it |
| File parsing | openpyxl, charset-normalizer, pyarrow | Excel, encoding detection, and an optional Parquet cache |
| Database | PostgreSQL via SQLAlchemy 2.0 + Alembic | SQLite in development for zero setup; Neon in production |
| Auth | bcrypt, PyJWT | Short-lived access tokens, refresh tokens, versioned sessions |
| AI | Ollama or any OpenAI-compatible endpoint | Selected by one environment variable; Groq on the live instance |
| Testing | pytest, Vitest 4, Testing Library, Playwright | Engine, components, and the full browser journey |
| Delivery | Vercel Services, GitHub Actions, gitleaks | One project for both services; CI with secret scanning |

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

The generator ([`backend/app/seed/novamart.py`](backend/app/seed/novamart.py))
is seeded, so the data is identical on every machine, and the analytical tests
assert exact figures against it.

---

## The demo

Two ways in, and no shared credential in either.

**Public demo** — `/demo` from the landing page. Creates a throwaway workspace
with the sample data already loading, isolated from every other visitor,
deleted automatically after `DEMO_SESSION_HOURS`. `DEMO_DATA_ENABLED=false`
removes the endpoint entirely.

**Sample data in your own account** — sign up, then **Use sample data** in
onboarding, to have NovaMart alongside your own.

[docs/DEMO.md](docs/DEMO.md) lists what is in the dataset and what the product
should find in it.

---

## Testing

```bash
# Backend — 299 tests
cd backend && pytest

# Frontend — 80 tests
cd frontend && npm run check      # typecheck + lint + tests

# Full-stack acceptance, with both servers running
cd backend && python scripts/acceptance_check.py

# Browser end to end — 11 tests, with both servers running
cd frontend && npx playwright test --project=chromium
```

The suite is weighted towards the things that would be silently wrong rather
than loudly broken:

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
- **AI budget** (`test_ai_budget.py`) — one request gets one bounded amount of
  model time, so retries and repairs cannot outlast the proxy waiting for it.
- **Deployment modes** (`test_deployment_modes.py`) — database file storage and
  request-scoped analysis behave exactly like their local counterparts.
- **End to end** (`test_e2e_flow.py`) — the full journey, plus assertions that
  pin the sample dataset's planted narrative.

The acceptance script drives the product through the Next.js layer with a real
session cookie, covering signup through report generation, tenant isolation, and
invalid-input handling. More in [docs/TESTING.md](docs/TESTING.md).

---

## Deployment

The live instance runs on **one Vercel project and one Neon database**, free,
with no credit card. [`vercel.json`](vercel.json) declares two Vercel Services:

- `web` — the Next.js frontend, the only service with a public route
- `api` — the FastAPI backend, reachable only through a service binding that
  injects `BACKEND_API_URL`, so it has no public address of its own

Migrations run as the `api` service's build command (`alembic upgrade head`), so
a failed migration fails the deploy.

Serverless needs three settings, none of which touch the engine:

| Setting | Why |
| --- | --- |
| `STORAGE_BACKEND=database` | `/tmp` is per-instance and wiped, and Ask and Investigate re-read the original upload |
| `ANALYSIS_EXECUTION=request` | An instance may stop once it has replied, so the browser triggers the run and polls it |
| `STARTUP_TASKS_ENABLED=false` | Every cold start is a new process; stale jobs are failed when polled instead |

The one real cost is the upload ceiling: a Vercel Function rejects request
bodies over 4.5 MB before the application runs, so uploads are limited to 4 MB
there and the browser says so in the product's own words.

Step by step, every account and every value in order:
[docs/GO_LIVE.md](docs/GO_LIVE.md). Docker, self-hosting and the reasoning behind
the choices: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

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
- gitleaks runs in CI against every push

**Not claimed:** InsightFlow AI holds no SOC 2, ISO 27001, HIPAA, or GDPR
certification. The controls above are the ones that exist. Full detail in
[docs/SECURITY.md](docs/SECURITY.md).

---

## Project structure

```
backend/
  app/
    analytics/   the deterministic engine — ingestion, profiling, schema
                 inference, metrics, time series, segmentation, anomalies,
                 investigation, planner, executor
    ai/          provider abstraction, prompts, structured schemas, guardrails
    api/v1/      REST endpoints
    core/        config, security, storage, middleware
    db/          SQLAlchemy models and session management
    jobs/        analysis runner
    seed/        the NovaMart generator
  alembic/       migrations
  tests/         299 tests
  scripts/       acceptance_check.py

frontend/
  app/           routes (marketing · auth · app · API handlers)
  components/    design system, charts, state components
  features/      domain modules — datasets, analysis, insights, anomalies,
                 chat, reports, settings, onboarding
  lib/           API client, session handling, formatting
  tests/         Vitest suites
  e2e/           Playwright journey

docs/            ARCHITECTURE · GO_LIVE · DEPLOYMENT · DEVELOPMENT · ENVIRONMENT
                 SECURITY · AI_GUARDRAILS · TESTING · DEMO · DESIGN_SYSTEM
                 PRODUCTION_AUDIT · FINAL_LAUNCH_REPORT · UI_UX_AUDIT
                 screenshots/
```

---

## Roadmap

Honest about what is not built yet.

- **Transactional email** — password reset issues a valid token, but nothing
  delivers it in production
- **PDF export** — reports currently print to PDF via the browser
- **Scheduled analysis** — re-run on upload or on a schedule, with alerting
- **Forecasting** — the data-sufficiency checks exist; the model does not
- **Team workspaces** — the schema supports members and roles; the invitation
  flow is not built
- **Incremental uploads** — appending to a dataset rather than replacing it
- **More connectors** — Shopify, Stripe, and QuickBooks rather than file upload

---

## Licence

MIT. See [LICENSE](LICENSE).
