# Deployment guide

This guide assumes no prior knowledge of the project. Follow it top to bottom
and you will have InsightFlow AI running locally, then deployed.

**Contents**

0. [What runs where, and why](#0-what-runs-where-and-why)
1. [Prerequisites](#1-prerequisites)
2. [Local setup](#2-local-setup)
3. [PostgreSQL setup](#3-postgresql-setup)
4. [Environment variables](#4-environment-variables)
5. [Running the backend](#5-running-the-backend)
6. [Running the frontend](#6-running-the-frontend)
7. [Running Ollama](#7-running-ollama)
8. [Database migrations](#8-database-migrations)
9. [Running the tests](#9-running-the-tests)
10. [Production builds](#10-production-builds)
11. [Deploying the frontend to Vercel](#11-deploying-the-frontend-to-vercel)
12. [Deploying the backend](#12-deploying-the-backend)
13. [Production environment variables](#13-production-environment-variables)
14. [The whole deploy, in order](#14-the-whole-deploy-in-order)
15. [Troubleshooting](#15-troubleshooting)

---

## 0. What runs where, and why

The single most confusing thing about this architecture, stated once, plainly.

**InsightFlow deploys as two halves.** They are separate because they have
genuinely different runtime requirements, not because of a preference.

```
                     ┌──────────────────────────────────────┐
   browser  ────────▶│  VERCEL                              │
   (only ever        │  Next.js 15 — pages, session cookie, │
    talks here)      │  authenticating reverse proxy        │
                     └───────────────┬──────────────────────┘
                                     │  HTTPS · Bearer token
                                     │  + X-Real-Client-IP
                                     ▼
                     ┌──────────────────────────────────────┐
                     │  A CONTAINER HOST (Render, Fly,      │
                     │  Railway, a VPS)                     │
                     │  FastAPI — pandas analytics engine,  │
                     │  background analysis jobs,           │
                     │  uploaded-file storage               │
                     └──────┬─────────────────┬─────────────┘
                            │                 │
                            ▼                 ▼
                   ┌────────────────┐  ┌──────────────────┐
                   │  PostgreSQL    │  │  AI provider     │
                   │  (Neon,        │  │  (optional:      │
                   │   Supabase,    │  │   OpenAI-compat  │
                   │   Render)      │  │   or none)       │
                   └────────────────┘  └──────────────────┘
```

### On Vercel

The entire Next.js application: the landing page, the authentication screens,
the product UI, the session-cookie route handlers, and `/api/backend/[...path]`,
which forwards browser requests to the API with a bearer token attached
server-side.

This is a completely standard Next.js deployment. Nothing about it is unusual
and nothing needs special configuration.

### Not on Vercel

The FastAPI service, and this is deliberate. **Do not try to host it as Vercel
functions.** Three reasons, each sufficient on its own:

1. **Analysis is a multi-second pandas workload** on a background thread pool
   that reports progress as it goes. Serverless functions are request-scoped;
   the function returns and the work dies with it.
2. **Uploaded files are written to a persistent volume** and read again by later
   analyses. Serverless filesystems are ephemeral.
3. **The job runner keeps state in-process.** It is restarted deliberately; see
   [ARCHITECTURE.md](ARCHITECTURE.md) for why that is the right trade at this
   scale.

The backend therefore runs as a long-lived container. `backend/Dockerfile` is
production-ready: multi-stage, non-root, with a health check, and it applies
migrations on start-up.

### How the two connect

| | |
| --- | --- |
| Direction | Vercel → backend only. The browser never contacts the backend |
| Transport | HTTPS, `Authorization: Bearer <token>` attached by the Next.js proxy |
| Config | `BACKEND_API_URL` on Vercel points at the backend's public URL |
| CORS | **None needed.** The browser only ever talks to its own origin |
| Client identity | Vercel forwards the real visitor address in `X-Real-Client-IP`, authenticated with `PROXY_SHARED_SECRET`, so the backend can rate-limit per visitor rather than per server |

### Why the session works this way

The Next.js layer owns the cookie; the backend stays a stateless bearer-token
API. That buys three things at once: the cookie is first-party to the origin the
user actually visits (so Safari's third-party blocking never sees it), access
tokens never enter JavaScript's reach (so an XSS bug cannot steal one), and
there is no CORS to configure in production.

### Deploy order

1. Database first — you need its connection string.
2. Backend second — you need its URL.
3. Frontend last, pointed at the backend.
4. Then set `CORS_ORIGINS` on the backend to the Vercel URL (belt and braces;
   the browser does not use it) and confirm `PROXY_SHARED_SECRET` matches on
   both halves.

Sections [11](#11-deploying-the-frontend-to-vercel) and
[12](#12-deploying-the-backend) explain each half;
[section 14](#14-the-whole-deploy-in-order) is the same sequence as a single
walkthrough, with the free-tier services named.

---

## 1. Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| Python | 3.11 or 3.12 | Backend |
| Node.js | 20 or newer | Frontend |
| Git | any recent | Everything |
| Docker | optional | PostgreSQL, container deploys |
| Ollama | optional | Local AI explanations |

Check what you have:

```bash
python --version
node --version
```

Everything else installs in the steps below.

---

## 2. Local setup

The fastest path to a running product. **No database server and no AI provider
are required** — the backend falls back to a local SQLite file and to
deterministic explanations.

```bash
git clone <your-repository-url>
cd "InsightFlow AI"
```

### Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
```

### Frontend

```bash
cd ../frontend
npm install
cp .env.example .env.local
```

You are ready. Jump to [section 5](#5-running-the-backend) to start both
servers, or continue for PostgreSQL.

---

## 3. PostgreSQL setup

SQLite is the default and is fine for development. Use PostgreSQL when you want
to match production, or when several people share the instance.

### Option A — Docker (recommended)

```bash
# From the repository root
docker compose up -d postgres
```

This starts PostgreSQL 16 on port 5432 with user/password/database all set to
`insightflow`. Then in `backend/.env`:

```bash
DATABASE_URL=postgresql+psycopg://insightflow:insightflow@localhost:5432/insightflow
```

### Option B — a managed provider

[Neon](https://neon.tech), [Supabase](https://supabase.com), and Render all have
free tiers. Copy the connection string they give you into `DATABASE_URL`.

Both `postgres://` and `postgresql://` prefixes are accepted — the application
rewrites them to the `psycopg` driver it ships.

#### Neon: which of the two connection strings to use

Neon hands you two, and picking the wrong one produces failures that look like
bugs in the application. Use the **direct** string — the host *without*
`-pooler` in it — for `DATABASE_URL`.

Neon's pooled endpoint exists for serverless functions that open a connection
per request and would otherwise exhaust the server's connection slots. This
backend is the opposite shape: one long-lived process that keeps its own
SQLAlchemy pool (10 connections, 20 overflow, recycled every 30 minutes), so
pooling is already handled a layer up and the pooler adds a PgBouncer hop that
buys nothing.

It also costs something. The pooler runs in transaction mode, where a session
does not stay on one physical connection, and Neon's own guidance is to use a
direct connection for schema migrations for exactly that reason. Migrations run
at container start-up here, so the pooled string would put the riskiest
operation on the least suitable connection.

```bash
# Use this — the direct endpoint
DATABASE_URL=postgresql://user:password@ep-xxx-123456.us-east-2.aws.neon.tech/neondb?sslmode=require

# Not this — the pooled endpoint
# DATABASE_URL=postgresql://user:password@ep-xxx-123456-pooler.us-east-2.aws.neon.tech/neondb
```

Keep `?sslmode=require`; Neon requires TLS and psycopg honours the parameter.

If you later run several backend replicas, revisit this: many processes each
holding a pool is the case the pooler is for.

### Option C — a local install

Install PostgreSQL, then:

```sql
CREATE DATABASE insightflow;
CREATE USER insightflow WITH PASSWORD 'insightflow';
GRANT ALL PRIVILEGES ON DATABASE insightflow TO insightflow;
```

After changing `DATABASE_URL`, run the migrations
([section 8](#8-database-migrations)).

---

## 4. Environment variables

Every variable is documented in `backend/.env.example` and
`frontend/.env.example`. These are the ones that matter most.

### Backend (`backend/.env`)

| Variable | Default | What it does |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `production` enforces secret validation and hides API docs |
| `DATABASE_URL` | *(empty)* | Blank uses SQLite at `backend/storage/insightflow.db` |
| `SECRET_KEY` | dev placeholder | Signs session tokens. **Must be changed in production** |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated origins allowed to call the API directly |
| `MAX_UPLOAD_SIZE_MB` | `50` | Largest file accepted |
| `AI_PROVIDER` | `ollama` | `ollama`, `openai`, or `none` |
| `AI_ENABLED` | `true` | `false` turns off written explanations entirely |
| `OLLAMA_MODEL` | `qwen2.5:3b-instruct` | Local model to use |
| `OPENAI_API_KEY` | *(empty)* | Required when `AI_PROVIDER=openai` |
| `ANALYSIS_WORKERS` | `2` | Concurrent analysis jobs |
| `RATE_LIMIT_ENABLED` | `true` | Per-IP request limiting |

Generate a production secret:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### Frontend (`frontend/.env.local`)

| Variable | Default | What it does |
| --- | --- | --- |
| `BACKEND_API_URL` | `http://localhost:8000` | Where the Next.js **server** reaches the API |
| `PROXY_SHARED_SECRET` | *(empty)* | Must match the backend's. Lets the API rate-limit per visitor rather than per server |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Used in page metadata |
| `NEXT_PUBLIC_DEMO_ENABLED` | `true` | Shows the "Use sample data" button |
| `COOKIE_SECURE` | *(auto)* | Forces the `Secure` cookie flag on or off |

`BACKEND_API_URL` is **not** `NEXT_PUBLIC_`, and that is deliberate: the browser
never talks to the backend directly. Every request is proxied through
`/api/backend/...` so the session cookie stays first-party.

---

## 5. Running the backend

```bash
cd backend
# activate the virtualenv first (see section 2)
uvicorn app.main:app --reload --port 8000
```

You should see:

```
INFO  starting InsightFlow AI  environment='development' ai_provider='ollama'
INFO  database ready  dialect='sqlite'
```

Check it:

- API docs: <http://localhost:8000/docs>
- Health: <http://localhost:8000/api/v1/health>

Tables are created automatically in development. For PostgreSQL, run the
migrations first ([section 8](#8-database-migrations)).

---

## 6. Running the frontend

In a second terminal:

```bash
cd frontend
npm run dev
```

Open <http://localhost:3000>.

Create an account, and on the onboarding screen choose **Use sample data** to
load the NovaMart dataset — 14,000 orders with a real story in them. The whole
flow takes under a minute.

---

## 7. Running Ollama

Optional. Without it, InsightFlow writes its answers from the computed analysis
instead of having a model phrase them. Every figure, insight, and anomaly is
identical either way.

```bash
# Install from https://ollama.com, then:
ollama serve
ollama pull qwen2.5:3b-instruct
```

Confirm the backend can see it: Settings → AI & data should show
**Connected to Ollama**, or <http://localhost:8000/api/v1/health>.

### Choosing a model

| Model | Size | Notes |
| --- | --- | --- |
| `qwen2.5:3b-instruct` | 1.9 GB | Default. Good structured-output reliability for its size |
| `llama3.2:3b` | 2.0 GB | Comparable |
| `mistral` | 4.4 GB | Better prose, noticeably slower on CPU |
| `llama3.2:1b` | 1.3 GB | Fastest, weakest at following the JSON schema |

**On CPU, expect 60–120 seconds for a written answer**, and occasionally two to
three minutes on a loaded machine. The backend warms the model at start-up so
the first question does not also pay the load cost.

`AI_TIMEOUT_SECONDS` defaults to 120, and with `AI_MAX_RETRIES=1` that caps a
call at 240 seconds. The cap matters: the whole request has to return within
300 seconds or Node gives up waiting for headers and the user is told the
service is unreachable when it is not. Read the ceiling note in
[ENVIRONMENT.md](ENVIRONMENT.md) before changing either value.

For fast responses, use a GPU or point `AI_PROVIDER=openai` at a hosted
endpoint — answers then come back in seconds and none of this applies.

---

## 8. Database migrations

Development on SQLite creates tables automatically. **Any PostgreSQL deployment
should use migrations.**

```bash
cd backend

# Apply all migrations
alembic upgrade head

# After changing a model, generate a new migration
alembic revision --autogenerate -m "describe the change"

# Inspect history
alembic history
alembic current

# Roll back one step
alembic downgrade -1
```

Always read a generated migration before applying it. Autogenerate detects
column and index changes reliably; renames it sees as a drop plus an add, which
loses data.

---

## 9. Running the tests

### Backend

```bash
cd backend
pytest                      # all 266 tests, ~3 minutes
pytest -q tests/test_analytics_math.py   # just the analytical correctness tests
pytest --cov=app --cov-report=term-missing
```

The suite runs with AI disabled, so it also proves the product works end to end
without a model.

### Frontend

```bash
cd frontend
npm run typecheck
npm run lint
npm test
npm run check       # all three
```

### Full-stack acceptance check

With both servers running:

```bash
cd backend
python scripts/acceptance_check.py
```

This drives the complete user journey — signup, upload, field review, analysis,
dashboard, investigation, a question, a report, logout, tenant isolation, and
invalid-input handling — through the Next.js layer with a real session cookie.
It exits non-zero on any failure, so it can gate a deploy.

---

## 10. Production builds

### Backend

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

**Use one worker.** The analysis job runner keeps state in-process; scale with
replicas, not workers.

### Frontend

```bash
cd frontend
npm ci
npm run build
npm start
```

---

## 11. Deploying the frontend to Vercel

Vercel is the natural host: the frontend is a standard Next.js app with no
special requirements.

1. Push the repository to GitHub.
2. In Vercel, **Add New → Project** and import it.
3. Set **Root Directory** to `frontend`. Everything else is detected.
4. Add the environment variables:

   | Name | Value | Required |
   | --- | --- | --- |
   | `BACKEND_API_URL` | Your deployed backend URL, e.g. `https://insightflow-api.onrender.com` | yes |
   | `NEXT_PUBLIC_SITE_URL` | Your production URL, e.g. `https://insightflow.vercel.app` | yes |
   | `PROXY_SHARED_SECRET` | The same value you set on the backend | strongly recommended |
   | `NEXT_PUBLIC_DEMO_ENABLED` | `true`, or `false` to hide the sample-data button | no |
   | `NEXT_PUBLIC_SOURCE_URL` | Your repository URL, shown in the footer | no |

   Without `PROXY_SHARED_SECRET` the backend sees every request as coming from
   Vercel's servers, so the authentication rate limit — 10 requests per 5
   minutes — becomes one budget shared by every user of the product.

5. Deploy.

### What Vercel needs, exactly

| Setting | Value |
| --- | --- |
| Framework preset | Next.js (auto-detected) |
| Root directory | `frontend` |
| Build command | `npm run build` (default) |
| Install command | `npm ci` (default) |
| Output directory | default |
| Node version | 20 or newer |

`frontend/vercel.json` sets only what Vercel cannot infer: `no-store` on
`/api/*` responses, the build and install commands, and the region.

The proxy route's time limit is set in the route file itself
(`app/api/backend/[...path]/route.ts`), as `export const maxDuration = 300`,
because the number is meaningless without the reasoning next to it:

```
AI_REQUEST_BUDGET_SECONDS (240)  <  maxDuration (300)  ==  Node's header timeout
```

The ordering is the point. The backend has to be the thing that gives up first,
because when it does it returns its deterministic answer — a designed and tested
path that tells the truth. If the platform kills the request first, the user is
told the service is unreachable while it was in fact answering them, and the
result that was seconds away is thrown out. 300 is both the default and the
ceiling for Hobby (and the default on every plan), so nothing needs raising; it
is stated explicitly so that lowering it later is a visible decision.

### Preview deployments

Every branch gets one automatically. Give the preview environment the same
`BACKEND_API_URL` as production unless you run a separate backend for it, and
remember that `NEXT_PUBLIC_*` values are inlined at build time — changing one
requires a redeploy, not a restart.

### Verifying the deployment

```bash
# The page renders
curl -sI https://your-app.vercel.app | head -1

# Security headers are present
curl -sI https://your-app.vercel.app | grep -iE "content-security-policy|strict-transport|x-frame"

# Metadata generated for the right host
curl -s https://your-app.vercel.app/robots.txt
curl -s https://your-app.vercel.app/sitemap.xml

# The proxy can reach the backend (401 is correct here — it means the
# request arrived and was rejected for lack of a session, not that the
# backend is unreachable, which would be 503)
curl -s -o /dev/null -w "%{http_code}
" https://your-app.vercel.app/api/backend/auth/session

# The whole journey, against the deployed stack
cd backend && python scripts/acceptance_check.py --frontend https://your-app.vercel.app
```

**Do not try to host the Python backend on Vercel.** See
[section 0](#0-what-runs-where-and-why) for the three reasons.

---

## 12. Deploying the backend

Any host that runs a container works. The `backend/Dockerfile` is
production-ready: multi-stage, non-root, with a health check, and it applies
migrations on start-up.

### Render (simplest free option)

`render.yaml` in the repository root is a Blueprint: it declares the service,
its health check, and every environment variable, so the dashboard asks only
for the secrets.

1. **New → Blueprint**, connect the repository, pick `render.yaml`.
2. Fill in the three values it asks for: `DATABASE_URL` (your Neon direct
   string), `CORS_ORIGINS` (your Vercel origin), and `PROXY_SHARED_SECRET`.
3. Deploy. Migrations run at start-up, so there is no separate migration step.

To do it by hand instead: **New → Web Service**, root directory `backend`,
runtime Docker, then set the variables from
[section 13](#13-production-environment-variables).

#### What the free plan gives you, and what it does not

Worth reading before you rely on it, because one of these has a visible effect
on the product.

| | Free | Consequence |
| --- | --- | --- |
| RAM | 512 MB | Enough. Measured: ~130 MB with the whole app imported, ~137 MB with a 200k-row frame loaded. `render.yaml` lowers `MAX_ANALYSIS_ROWS` to 150,000 to keep a large upload from pushing a 512 MB instance over the edge |
| Sleep | After 15 minutes idle | ~50 second cold start on the next request. Nothing is lost |
| Persistent disk | **Not available at all** | See below |

**Render does not offer persistent disks on free instances.** Not as an add-on,
not for a fee — a disk requires a paid instance type. The consequence is
specific and worth being precise about, because it is not "you lose your data":

* Everything in PostgreSQL survives: accounts, workspaces, datasets, analyses,
  metrics, insights, anomalies, reports and cached investigations. That is
  almost the entire product.
* The **uploaded file itself** does not survive a restart or redeploy. Two
  features recompute from it rather than from stored results — `Ask
  InsightFlow` and re-running an `Investigate` that was not already cached — so
  after a restart those answer "the file behind this dataset is no longer
  available; upload it again" instead of working.

That message is deliberate. Both paths check for the file and say so plainly
rather than returning a 500, so the failure is honest and self-explanatory.

To remove the limitation, move to a paid instance ($7/month) and uncomment the
`disk:` block in `render.yaml`, which mounts 1 GB at `/app/storage`
($0.25/GB/month). Nothing else changes: `STORAGE_DIR` already points there.

### Fly.io

```bash
cd backend
fly launch --no-deploy
fly volumes create insightflow_storage --size 1
fly secrets set SECRET_KEY=... DATABASE_URL=... CORS_ORIGINS=https://your-app.vercel.app
fly deploy
```

Mount the volume at `/app/storage` in `fly.toml`.

### Railway

Connect the repository, set the root directory to `backend`, add the PostgreSQL
plugin, and set the same variables. Add a volume at `/app/storage`.

### A VPS

```bash
docker build -t insightflow-api ./backend
docker run -d --name insightflow-api \
  -p 8000:8000 \
  -v insightflow-storage:/app/storage \
  --env-file backend/.env.production \
  insightflow-api
```

Put nginx or Caddy in front for TLS.

### Estimated cost

| Component | Free option | What the free tier costs you | Paid from |
| --- | --- | --- | --- |
| Frontend | Vercel Hobby | Nothing relevant here | $20/month (Pro) |
| Backend | Render free instance | Sleeps after 15 min idle (~50s cold start); no persistent disk | $7/month |
| Database | Neon free tier | Storage and compute-hour caps; fine for a demo | ~$5/month |
| AI | Groq free tier, or `AI_ENABLED=false` | Rate limited per minute; no card required | Groq pay-as-you-go |

The whole product does run at **$0**, and the two things it costs you are the
cold start and the uploaded files not surviving a restart. Both are stated
above in full. Paying $7 for a Render instance with a disk removes both.

---

## 13. Production environment variables

### Backend

```bash
ENVIRONMENT=production
SECRET_KEY=<48+ random characters>
DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
CORS_ORIGINS=https://your-app.vercel.app
PROXY_SHARED_SECRET=<the same value as the frontend>
TRUSTED_PROXY_COUNT=1
STORAGE_DIR=/app/storage
LOG_JSON=true
RATE_LIMIT_ENABLED=true
```

#### The AI half

There are three configurations and all three are supported. Pick one.

**A hosted model on a free tier — the right default for a deployed demo.**

```bash
AI_ENABLED=true
AI_PROVIDER=openai
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_API_KEY=gsk_...
OPENAI_MODEL=openai/gpt-oss-120b
```

`openai` names the wire protocol, not the vendor. The provider class speaks
`POST /chat/completions`, which is what Groq, Together, OpenRouter, vLLM and LM
Studio all serve, so switching between them is a change of two environment
variables and no code.

[Groq](https://console.groq.com/keys) is the recommendation because it is
genuinely free — a developer tier with no credit card, rate limited per minute
rather than metered — and because it is fast. That second property matters more
than it sounds: a local CPU model takes 60–180 seconds per answer, which is why
`AI_REQUEST_BUDGET_SECONDS` and the proxy's `maxDuration` have to be reasoned
about at all. A hosted model answers in seconds and the whole timeout question
stops being load-bearing. Hitting the rate limit returns "the AI provider is
rate limiting requests, try again shortly"; the deterministic analysis is
untouched, because it never goes near the model.

**No model at all.** Fully supported, and what CI runs against, which is how we
know the product is complete without it:

```bash
AI_ENABLED=false
AI_PROVIDER=none
```

Every number in the product — metrics, trends, segment movements, anomalies,
investigations — is computed in pandas and stays computed. What you lose is the
written explanation over the top of it; the evidence itself is unchanged, and
the interface says the model is unavailable rather than pretending otherwise.

**A local model (Ollama).** Development only. It needs a host with the model
resident in memory, which neither Vercel nor a 512 MB free instance is.

**Paid OpenAI or Anthropic** work too — set `OPENAI_BASE_URL` back to
`https://api.openai.com/v1` — but nothing in this deployment requires them.

With `ENVIRONMENT=production` the application **refuses to start** if
`SECRET_KEY` is still the development placeholder, if it is shorter than 32
characters, if `DATABASE_URL` is empty, or if `AI_PROVIDER=openai` without an
API key. This is deliberate: a misconfigured deployment should fail loudly at
boot rather than quietly issue forgeable sessions.

### Frontend

```bash
BACKEND_API_URL=https://your-api-host.com
PROXY_SHARED_SECRET=<the same value as the backend>
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app
NEXT_PUBLIC_DEMO_ENABLED=true
```

### Deployment checklist

- [ ] `SECRET_KEY` is new and random; `PROXY_SHARED_SECRET` is identical on both halves
- [ ] `CORS_ORIGINS` lists only your real frontend origin
- [ ] `DATABASE_URL` points at PostgreSQL, not SQLite, and at Neon's **direct**
      endpoint (no `-pooler` in the host)
- [ ] `alembic upgrade head` has run
- [ ] `STORAGE_DIR` is on a persistent volume
- [ ] No `.env` file is committed (`git check-ignore backend/.env`)
- [ ] `/api/v1/health` returns `"status": "ok"`
- [ ] `python scripts/acceptance_check.py --frontend https://your-app.vercel.app` passes

---

## 14. The whole deploy, in order

> Following this for the first time? [GO_LIVE.md](GO_LIVE.md) is the same
> sequence written click by click — which button, which field, what each free
> tier actually does, and what to do when a step fails. This section is the
> condensed version for someone who has deployed before.

Sections 11–13 explain each half. This is the sequence, start to finish, on the
free tier. It takes about twenty minutes, most of it waiting for builds.

The order is not arbitrary: each step produces a value the next one needs.

### 1. Database — Neon

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the connection string, and take the **direct** one — the host without
   `-pooler` in it. [Section 3](#3-postgresql-setup) explains why that is the
   right one for this backend.

Nothing to migrate by hand: the container runs `alembic upgrade head` before
uvicorn starts, so the schema is created on the backend's first boot.

### 2. Two secrets

Generate them now; both halves need them and they must match where noted.

```bash
# SECRET_KEY — backend only. Signs session tokens.
python -c "import secrets; print(secrets.token_urlsafe(48))"

# PROXY_SHARED_SECRET — the SAME value on the backend and on Vercel.
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

If you deploy the backend from `render.yaml`, Render generates `SECRET_KEY`
itself and you never see it, which is better. You still need
`PROXY_SHARED_SECRET` by hand, because it has to be identical in two places.

### 3. AI — optional, free, and skippable

Skip this entirely if you want. The product is complete without it: every
number is computed in pandas, and CI proves the whole suite passes with
`AI_ENABLED=false`. You can add a key later without redeploying anything else.

To enable it: get a key at [console.groq.com/keys](https://console.groq.com/keys)
(free, no credit card), then set `AI_ENABLED=true`, `AI_PROVIDER=openai`, and
`OPENAI_API_KEY` on the backend. The base URL and model are already set for
Groq in `render.yaml`.

### 4. Backend — Render

**New → Blueprint**, pick this repository. Render reads `render.yaml` and asks
for `DATABASE_URL`, `CORS_ORIGINS` and `PROXY_SHARED_SECRET`.

`CORS_ORIGINS` is the one value you do not have yet — Vercel has not given you
a URL. Put a placeholder in, and come back to it in step 6.

When the build finishes, check it:

```bash
curl -s https://your-api.onrender.com/api/v1/health
```

`"status": "ok"` and `"database": true` means the container is up and the
migrations ran against Neon. `"ai"` reporting unavailable is expected and fine.

Read [section 12](#12-deploying-the-backend) on what the free instance does and
does not give you before you rely on it — particularly the absence of a
persistent disk.

### 5. Frontend — Vercel

**Add New → Project**, import the repository, set **Root Directory** to
`frontend`, and add:

| Name | Value |
| --- | --- |
| `BACKEND_API_URL` | the Render URL from step 4 |
| `PROXY_SHARED_SECRET` | the value from step 2, byte for byte |
| `NEXT_PUBLIC_SITE_URL` | your Vercel URL (you can fill this in after the first deploy and redeploy) |

Deploy.

### 6. Close the loop

Go back to Render and set `CORS_ORIGINS` to the real Vercel origin, e.g.
`https://insightflow-ai.vercel.app`. The service restarts itself.

This is belt and braces — the browser only ever talks to Vercel, so CORS is not
on the request path — but a correct value costs nothing and a wildcard would be
a real mistake.

### 7. Prove it works

```bash
# The proxy reaches the backend. 401 is the correct answer: it means the
# request arrived and was rejected for lack of a session. 503 would mean
# BACKEND_API_URL is wrong.
curl -s -o /dev/null -w "%{http_code}
" https://your-app.vercel.app/api/backend/auth/session

# The full journey — signup, upload, analysis, insights, anomalies,
# investigation, isolation between tenants — against the deployed stack.
cd backend && python scripts/acceptance_check.py --frontend https://your-app.vercel.app
```

75 checks. If they pass, the deployment is real, and you have tested it rather
than assumed it.

---

## 15. Troubleshooting

### "We could not reach the analysis service."

The frontend cannot reach the backend.

- Is the backend running? `curl http://localhost:8000/api/v1/health`
- Does `BACKEND_API_URL` match where it is actually listening?
- In production, is the URL `https://` and publicly reachable?

### Signing in appears to do nothing, and every page bounces to login

The session cookie is being set but not sent back. This is almost always the
`Secure` flag: a `Secure` cookie is never returned over plain HTTP.

The app detects this from `x-forwarded-proto` and the host. If your proxy does
not set that header, force it:

```bash
COOKIE_SECURE=false   # serving over plain HTTP
COOKIE_SECURE=true    # behind TLS your proxy does not advertise
```

### The application will not start in production

Read the error — the settings validator states exactly which variable is wrong.
The usual cause is `SECRET_KEY` left at its development value.

### "We couldn't analyze this dataset because no date column was detected"

Working as intended. Open the dataset, go to **Detected fields**, and set your
date column's meaning to *Order date*, then re-run the analysis.

### The analysis never finishes

- Check the backend log for a traceback.
- Jobs stuck in `running` after `ANALYSIS_STALE_MINUTES` (default 30) are failed
  at the next start-up.
- Very large files are down-sampled to `MAX_ANALYSIS_ROWS` with a notice.

### AI answers are very slow

Expected on CPU: 60–120 seconds for a 3B model. Options:

- Use a smaller model: `OLLAMA_MODEL=llama3.2:1b`
- Point at a hosted endpoint: `AI_PROVIDER=openai`
- Turn it off: `AI_ENABLED=false` — the product still answers every question,
  just in plainer prose

### "Ollama is running but the model is not installed"

```bash
ollama pull qwen2.5:3b-instruct
```

### Answers say "Written from the computed analysis"

The AI layer was unavailable, or its response was rejected by the guardrails for
citing a figure that did not come from your data. Both are the system working
correctly. Settings → AI & data shows the provider status.

### Uploads fail with "file is larger than the limit"

Raise `MAX_UPLOAD_SIZE_MB`. If you are behind nginx, raise its limit too:

```nginx
client_max_body_size 50M;
```

### Port already in use

```bash
# macOS / Linux
lsof -ti:8000 | xargs kill -9

# Windows
netstat -ano | findstr :8000
taskkill /PID <pid> /F
```

### Tests fail after pulling changes

```bash
cd backend && pip install -r requirements.txt
cd ../frontend && npm install
```

Then re-run. If a test in `test_analytics_math.py` fails, that is a real
regression in the analytics engine — those assertions are hand-verified figures,
not snapshots.
