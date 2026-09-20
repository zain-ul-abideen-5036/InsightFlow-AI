# InsightFlow AI — Architecture

> **Understand your business. Act on the data.**

This document describes how InsightFlow AI is put together, and — just as importantly —
*why* it is put together that way. The single most important architectural constraint in
this product is stated in one sentence:

> **The AI explains evidence computed from the user's actual data. It never computes the
> evidence itself.**

Every other decision below follows from that constraint.

---

## 1. System overview

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                  │
│  Next.js 15 (App Router, TypeScript strict, Tailwind, shadcn-style UI)    │
└───────────────┬───────────────────────────────────────────────────────────┘
                │  same-origin fetch, httpOnly cookie
                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  Next.js server (Route Handlers)                                          │
│  • /api/auth/*        — owns the session cookie                           │
│  • /api/backend/[..]  — authenticating reverse proxy → FastAPI            │
└───────────────┬───────────────────────────────────────────────────────────┘
                │  Authorization: Bearer <access token>
                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  FastAPI (Python 3.11)                                                    │
│                                                                           │
│  api/v1  ─ auth · workspaces · datasets · analyses · insights ·           │
│            anomalies · chat · reports · metrics                           │
│     │                                                                     │
│     ├──▶ analytics/   DETERMINISTIC ENGINE (pandas / numpy / scikit)      │
│     │      profiling · schema inference · metrics · time series ·         │
│     │      segmentation · anomaly detection · investigation · planner     │
│     │                                                                     │
│     ├──▶ ai/          EXPLANATION LAYER (provider-agnostic)               │
│     │      AIProvider ⇢ OllamaProvider | OpenAICompatibleProvider         │
│     │      structured JSON schemas · validation · numeric guardrails      │
│     │                                                                     │
│     └──▶ jobs/        in-process async job runner (thread pool + DB)      │
└───────────────┬───────────────────────────────┬───────────────────────────┘
                │                               │
                ▼                               ▼
        ┌───────────────┐             ┌─────────────────────┐
        │  PostgreSQL   │             │  Object storage     │
        │  (SQLite in   │             │  (local filesystem) │
        │   local dev)  │             │  raw upload +       │
        └───────────────┘             │  normalised Parquet │
                                      └─────────────────────┘
```

---

## 2. The central design decision: deterministic analytics, AI explanation

A naive version of this product would paste a CSV into an LLM prompt and ask for insights.
That approach fails on three axes that matter to a business user: it is **wrong** (LLMs
cannot reliably do arithmetic over thousands of rows), it is **unverifiable** (there is no
calculation to inspect), and it is **unsafe with private data** (the whole dataset leaves
the machine).

InsightFlow instead splits the problem in two:

| Layer | Responsibility | Technology | Determinism |
| --- | --- | --- | --- |
| **Analytics engine** | Produce every number: totals, growth rates, contributions, anomaly bounds, segment breakdowns. | pandas / numpy / scipy / scikit-learn | Fully deterministic, unit-tested against known-answer fixtures |
| **AI layer** | Turn a structured analytical result into readable business language; propose *possible* explanations and next investigations. | Local or hosted LLM behind an interface | Non-deterministic, constrained by JSON schema + numeric guardrails |

The AI receives a compact JSON **evidence bundle** — never raw rows (except a small,
explicitly-bounded sample when a question genuinely needs one). It is instructed that it
may not introduce new figures, and its output is then mechanically checked: every numeric
token in the generated text is matched against the evidence bundle, and unmatched figures
cause the response to be rejected and regenerated or downgraded. See
`backend/app/ai/guardrails.py`.

### Epistemic labelling

Findings are typed, not blended together:

- `observation` — a measured fact ("Revenue fell 18.2% month over month").
- `statistical` — the output of a statistical procedure ("17 Aug is outside the expected band").
- `correlation` — two series moved together.
- `possible_explanation` — a hypothesis, always labelled as such.
- `recommendation` — an action or an investigation to run.

The UI renders these differently and never promotes a correlation to a cause.

---

## 3. Request lifecycle: "Why did revenue decline?"

This is the flow that defines the product.

```
1. User question (natural language)
        │
2. Intent + entity extraction ........ analytics/planner.py
        │                              (rule-based classifier; resolves metric,
        │                               dimensions, time grain, comparison window)
        │
3. Analysis plan (typed, JSON) ....... AnalysisPlan{ steps[] }
        │                              e.g. [compare_periods(revenue, MoM),
        │                                    contribution(by=product),
        │                                    contribution(by=region),
        │                                    compare_periods(order_count),
        │                                    compare_periods(avg_order_value)]
        │
4. Deterministic execution ........... analytics/executor.py over the dataset frame
        │
5. Evidence bundle (JSON) ............ every figure carries: value, unit, period,
        │                              column, row count, calculation name
        │
6. LLM explanation ................... ai/provider.py + ai/prompts.py
        │                              structured output, schema-validated
        │
7. Guardrail pass .................... ai/guardrails.py
        │                              reject invented numbers / causal overclaims
        │
8. Answer + "View evidence" .......... the user can open the exact metric,
                                       date range, calculation, and chart
```

If the LLM is unavailable, steps 6–7 are skipped and the UI renders the evidence bundle
with a deterministic template. **The product degrades to "still useful", never to "broken".**

---

## 4. Data model

PostgreSQL (SQLite for zero-setup local development — the ORM layer is dialect-agnostic
and a portable `GUID` type adapts UUIDs to both).

```
users ──< workspace_members >── workspaces
                                    │
        ┌───────────────────────────┼──────────────────────────────┐
        │                           │                              │
     datasets                   analyses                        reports
        │                           │                              │
  dataset_columns          analysis_results                 chat_sessions
  dataset_versions          │        │                            │
                        insights  anomalies                 chat_messages
                                    │
                             business_metrics

  notifications · audit_logs  (workspace-scoped)
```

Key rules:

- **Every** workspace-owned table carries `workspace_id` with an index and FK.
- Primary keys are UUIDs (`GUID` type decorator: native `UUID` on Postgres, `CHAR(36)` on SQLite).
- `created_at` / `updated_at` on every table.
- Deletes cascade from workspace → datasets → columns/analyses → insights/anomalies.

### Multi-tenancy

Authorization is enforced **in the backend**, in a single place. Every workspace-scoped
route depends on `require_workspace(workspace_id, current_user)`, which raises `404`
(not `403` — we do not leak existence) when the caller is not a member. Nested resources
are additionally re-checked: loading dataset `X` under workspace `W` filters on
`Dataset.workspace_id == W.id`, so a valid dataset id from another tenant simply does not
resolve. Frontend route protection is a UX convenience only.

---

## 5. Asynchronous analysis

Analysis of a 20k-row dataset takes seconds, not milliseconds, and must not block an HTTP
worker. We deliberately did **not** introduce Celery, Redis, or a message broker — the
requirement is "a simple reliable job mechanism", and extra infrastructure would be the
single biggest obstacle to a student deploying this.

The chosen mechanism:

- `analyses` rows act as the job table (`status`, `stage`, `progress`, `error`, timestamps).
- A bounded `ThreadPoolExecutor` runs the pandas workload off the event loop.
- Each stage transition is committed, so progress is durable and pollable.
- `GET /analyses/{id}` returns status + stage list; the frontend polls every 1.5s while running.
- Orphaned `running` jobs older than `ANALYSIS_STALE_MINUTES` are failed at startup.

This scales to a single backend instance, which is the correct scope for the MVP, and the
job interface (`jobs/runner.py`) is narrow enough to swap for a broker later without
touching call sites.

---

## 6. AI provider abstraction

```python
class AIProvider(ABC):
    name: str
    async def health(self) -> ProviderHealth: ...
    async def complete_json(self, *, system, user, schema, ...) -> JSONResult: ...
    async def complete_text(self, *, system, user, ...) -> TextResult: ...
```

Implementations: `OllamaProvider` (development default) and `OpenAICompatibleProvider`
(OpenAI, Together, vLLM, LM Studio, OpenRouter — anything speaking the `/chat/completions`
shape). Selection is by `AI_PROVIDER` env var alone; no call site knows which is active.

Robustness is built into the base class, not the implementations:

- bounded timeout and one bounded retry
- JSON extraction from fenced or preambled output
- pydantic validation, with a single "repair" round-trip on failure
- `NullProvider` fallback so the product keeps working when AI is down
- every failure mode surfaces as a typed, human-readable error — never a 500

---

## 7. Privacy posture

- Uploaded files stay on the deployment's own storage.
- The AI layer receives **aggregated metrics and structured analytical results**. Raw rows
  are sent only when a question requires row-level context, capped by
  `AI_MAX_SAMPLE_ROWS`, and the UI states when this happens.
- The default development configuration uses a **local** model via Ollama, so no business
  data leaves the machine at all.
- Settings → AI shows the active provider and exactly what is transmitted.
- No unverified compliance claims are made anywhere in the product or marketing copy.

---

## 8. Frontend architecture

```
frontend/
  app/                 routes only — thin, mostly server components
    (marketing)/       landing page
    (auth)/            login · signup · reset
    (app)/             authenticated shell: overview · datasets · insights ·
                       anomalies · reports · ask · settings
    api/               auth route handlers + backend proxy
  components/ui/       design-system primitives (button, card, dialog, table …)
  components/          shared app-level components (charts, states, shell)
  features/            domain modules: datasets, analysis, insights, anomalies,
                       chat, reports — each owns its components + hooks + api
  lib/                 api client, auth, formatting, utils
  types/               hand-maintained mirrors of backend schemas
```

- **TanStack Query** owns all server state (polling, cache invalidation, optimistic UI).
- Charts are **Recharts**, wrapped so every chart ships an accessible text summary and a
  data table fallback.
- No page component exceeds a screenful of layout; logic lives in `features/`.

---

## 9. Deployment topology

| Component | Target | Notes |
| --- | --- | --- |
| Frontend | Vercel | Native Next.js; needs `BACKEND_API_URL` |
| Backend | Any container host (Render, Fly.io, Railway, a VPS) | Vercel functions cannot host a long-running pandas workload |
| Database | Managed Postgres (Neon / Supabase / Render) | `DATABASE_URL` |
| AI | Ollama locally; any OpenAI-compatible endpoint in production | `AI_PROVIDER` |

The frontend never talks to the database. It holds two values that matter:
`BACKEND_API_URL`, and `PROXY_SHARED_SECRET` — which is not a signing key but the
credential that lets the backend believe the client address this layer forwards.

There is deliberately no frontend signing key. The session cookie carries a JWT
the backend already signed and verifies on every request; a second signature
over a signature would detect no tampering the backend does not already reject.

Health and readiness are separate endpoints answering separate questions.
`/health` asks whether the process is alive, and an orchestrator that restarts
on its failure is doing the right thing. `/ready` asks whether traffic should be
routed here, and returns 503 when it should not — the correct response to a
transient database outage is to stop sending requests, not to kill a process
that will recover. The AI provider is deliberately not part of readiness:
written explanations are an enhancement over a product that works without them,
so an unreachable model must never take the service out of rotation.

See [DEPLOYMENT.md](./DEPLOYMENT.md), which opens by stating what runs on Vercel
and what does not.

---

## 10. Deliberate non-goals for the MVP

Recorded so they are understood as choices rather than omissions:

- No Kubernetes, Kafka, microservices, or event bus.
- No vector database — the product answers questions with SQL-style aggregation, not
  semantic search over documents.
- No agent framework; the planner is a small typed rule-based component that is far more
  predictable, testable, and cheaper than a tool-calling loop.
- No real-time push (WebSockets); polling is sufficient for job progress at this scale.
- Reports render on the web first; PDF export is a documented roadmap item.
- No Redis. Rate limiting is per process, which means the budget multiplies
  behind multiple replicas. That is documented rather than solved, because the
  dependency is not yet earned at this scale.
- No broker for analysis jobs. A thread pool plus the `analyses` table as the
  job record. Progress is committed after every stage so it is durable and
  pollable, and orphaned jobs are reconciled at start-up. The constraint this
  imposes — `--workers 1`, scale by replica — is enforced in the Dockerfile.
  Celery and Redis would add two failure modes to fix zero observed problems.
