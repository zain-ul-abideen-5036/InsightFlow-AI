# Development

How to work on this repository: getting it running, where things live, and the
conventions that are load-bearing rather than cosmetic.

For deploying it, see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 1. Getting it running

Requires **Python 3.11+** and **Node 20+**. Nothing else — no database server,
no AI provider.

```bash
git clone https://github.com/zain-ul-abideen-5036/InsightFlow-AI.git
cd "InsightFlow AI"
```

**Backend**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

**Frontend**, in a second terminal:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000> and click **Explore the live demo**. You will be
looking at a full analysis of 14,000 orders within a few seconds.

SQLite is created automatically at `backend/storage/insightflow.db`. Tables are
created from the models in development; PostgreSQL deployments use migrations.

**Optional: a local model.** Without one, explanations are written by the
analytics engine instead. Every figure is identical either way.

```bash
ollama serve
ollama pull qwen2.5:3b-instruct
```

---

## 2. Layout

```
backend/
  app/
    analytics/   the deterministic engine — the source of every number
      ingestion.py          read a hostile file safely
      profiling.py          column statistics and previews
      schema_inference.py   what each column means
      context.py            the resolved dataset: which column is revenue, etc.
      metrics.py            totals, margins, averages
      timeseries.py         resampling, trends, seasonality
      segmentation.py       breakdowns, contribution, movers
      anomalies.py          rolling z-score, IQR, isolation forest
      investigation.py      attribution and hedged explanations
      planner.py            a question -> a typed analysis plan
      executor.py           a plan -> results + evidence
      pipeline.py           the full analysis run
      types.py              Evidence, Grain, SemanticRole, DataSufficiency
    ai/
      base.py        provider interface, JSON extraction, repair
      providers.py   Ollama, OpenAI-compatible, null
      prompts.py     system and user prompts
      schemas.py     structured response shapes
      guardrails.py  numeric and causal validation
      service.py     orchestration and deterministic fallbacks
    api/v1/        REST endpoints
    api/deps.py    where multi-tenancy is enforced
    core/          config, security, logging, middleware, errors, client identity
    db/            models and session management
    jobs/runner.py in-process analysis runner
    seed/          the NovaMart generator and the demo builder
  tests/
  scripts/acceptance_check.py

frontend/
  app/
    (marketing)/   landing page, demo launcher
    (auth)/        login, signup, password reset
    (app)/         the product, behind a session
    api/           session cookie handlers and the backend proxy
  components/      design system, charts, state components
  features/        domain modules
  lib/             API client, session, backend proxy, formatting
  tests/           unit tests
  e2e/             Playwright
```

---

## 3. The rules that matter

Four conventions here are not stylistic. Breaking one breaks a product promise.

### Numbers come from Python, never from the model

Anything numeric is computed in `app/analytics/` and recorded as `Evidence`. The
model receives computed findings and phrases them. If you find yourself asking a
model to calculate, compare, or rank, the logic belongs in the analytics layer.

### Every figure you write must be a figure you recorded

If a narrative string quotes a number, that number must exist in the evidence
bundle as an `Evidence.value` — not inside `Evidence.detail`, which
`evidence_values()` does not read.

This has bitten three times. It has two consequences, and the second is the one
people miss: the evidence bundle is also the list of figures the *model* is
allowed to mention, so a number in your prose but not in the bundle means a
correct AI answer quoting it is discarded as a fabrication.

`tests/test_ai_adversarial.py::TestEvidenceCompleteness` sweeps 27 questions
across four grains and will catch it.

### Coincidence is not cause

The analytics layer establishes co-occurrence. Explanations are `Finding`s with
`kind="possible_explanation"` and hedged language. `check_causal_language`
rejects unhedged causal claims per sentence, including from the engine's own
prose.

### Tenancy is enforced in the query

Every workspace-scoped resource loads through `app/api/deps.py::_scoped`, which
filters on `workspace_id`. Never load by id and check ownership afterwards —
that is the same code with a gap in it. Cross-tenant access returns **404**, not
403.

---

## 4. Common tasks

### Add an API endpoint

1. Add the route to the right router in `app/api/v1/`.
2. Take `CurrentWorkspace` and load nested resources through a `Scoped*`
   dependency — never `db.get(Model, id)`.
3. Add request and response models to `app/schemas/api.py`.
4. Call `record_audit` for anything state-changing.
5. Add the client method to `frontend/lib/api-client.ts` and its types to
   `frontend/types/api.ts`.
6. Add a test, including a cross-tenant probe in `test_authorization.py`.

### Add a metric

1. Add the computation to `app/analytics/metrics.py`.
2. Return a `DataSufficiency` failure when the columns are missing. **Never
   return zero** — a metric your data cannot support is not a measurement of
   nothing, and the reason must be stated.
3. Emit `Evidence` for every figure, including derived percentages and shares.
4. Add a known-answer test to `test_analytics_math.py`.

### Change the database schema

```bash
cd backend
# edit app/db/models.py, then
alembic revision --autogenerate -m "describe the change"
# READ the generated file before applying it
alembic upgrade head
```

Autogenerate detects columns and indexes reliably. A **rename** it sees as a
drop plus an add, which loses data — write those by hand.

New non-nullable columns need a `server_default`, or the `ALTER` fails on any
table that already has rows. Use `sa.false()` rather than a literal `0` for
booleans, so it renders correctly on PostgreSQL as well as SQLite.

CI fails if the models and the migrations disagree.

### Change the AI prompts

Edit `app/ai/prompts.py`. The response schema is in `app/ai/schemas.py` and is
`extra="forbid"`, so a model returning an unexpected field is rejected rather
than silently ignored.

Run `pytest tests/test_ai_safety.py tests/test_ai_adversarial.py` afterwards.

### Add a frontend route

Under `app/(app)/`. Fetch on the server with `lib/backend.ts`, hand the result to
a client component in `features/` as `initialData`, and use TanStack Query there
for polling and invalidation.

Every view needs five states: loading, success, **empty**, error, and retry. The
empty state must explain what the section is, why it matters, and what to do —
`components/states/empty-state.tsx`.

---

## 5. Running the checks

```bash
cd backend && pytest                      # 266 tests, ~3 min
cd backend && pytest -q tests/test_analytics_math.py -x

cd frontend && npm run check              # typecheck + lint + tests
cd frontend && npm run build              # production build

# With both servers running:
cd backend && python scripts/acceptance_check.py
cd frontend && npx playwright test --project=chromium
```

See [TESTING.md](TESTING.md) for what each suite covers and how to add to it.

---

## 6. PostgreSQL locally

Optional; SQLite is fine for development. Use PostgreSQL when you want to match
production or share an instance.

```bash
docker compose up -d postgres
```

Then in `backend/.env`:

```bash
DATABASE_URL=postgresql+psycopg://insightflow:insightflow@localhost:5432/insightflow
```

and run `alembic upgrade head`.

---

## 7. Notes that save time

**`npm run lint` runs ESLint directly, not `next lint`.** The config is
`eslint.config.mjs` (flat, ESLint 9). `next lint` forces the legacy config path
and hangs indefinitely on Windows, which in CI means sitting at the job timeout
rather than failing.

**`BACKEND_API_URL` is deliberately not `NEXT_PUBLIC_`.** The browser never
contacts the backend; everything is proxied through `/api/backend/...`. Making
it public would inline it into the client bundle and defeat the session design.

**`NEXT_PUBLIC_` variables are baked in at build time.** Changing one needs a
rebuild, not a restart.

**The analysis runner is in-process and keeps state there.** Run uvicorn with
`--workers 1` and scale by replica. This is deliberate; see
[ARCHITECTURE.md](ARCHITECTURE.md).

**Set `PROXY_SHARED_SECRET` on both halves in production.** Without it the
backend rate-limits on the frontend's address, so every user shares one budget.

**Signed in but every page bounces to login?** The `Secure` cookie flag. It is
derived from `x-forwarded-proto`; if your proxy does not set that header, set
`COOKIE_SECURE=false` for plain HTTP.

**Analysis stuck in "running"?** Check the backend log. Jobs still running after
`ANALYSIS_STALE_MINUTES` are failed at the next start-up.

**A `test_analytics_math.py` failure is a real regression**, not a stale
snapshot. Those assertions are hand-verified figures.

---

## 8. Commit conventions

Conventional-style prefixes: `feat`, `fix`, `security`, `perf`, `test`, `docs`,
`chore`, `refactor`.

Frontend and backend changes are separated where they are logically separate.
Security fixes, analytics fixes, and UX work get their own commits so the
history is readable as a record of what changed and why.

Never commit `.env`, `.env.local`, credentials, or the contents of
`backend/storage/`.
