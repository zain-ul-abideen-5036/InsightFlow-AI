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

**InsightFlow is two applications: a Next.js frontend and a FastAPI backend.**
They are separate because they have genuinely different runtime requirements —
one renders pages, the other runs a pandas analytics engine — not because they
must live on different hosts.

The default deployment puts both on **one Vercel project**, as two Vercel
*services*, with **one Neon database** behind them. [GO_LIVE.md](GO_LIVE.md) is
the step-by-step walkthrough; this section explains the shape.

```
                     ┌──────────────────────────────────────┐
   browser  ────────▶│  VERCEL — one project                │
   (only ever        │                                      │
    talks here)      │  service "web": Next.js 15           │
                     │    pages, session cookie, and        │
                     │    /api/backend/[...path] — an       │
                     │    authenticating reverse proxy      │
                     │              │                       │
                     │              │ service binding       │
                     │              │ (internal only)       │
                     │              ▼                       │
                     │  service "api": FastAPI, Python 3.12 │
                     │    deterministic analytics engine,   │
                     │    question planner and executor.    │
                     │    No public address of its own.     │
                     └──────┬─────────────────┬─────────────┘
                            │                 │
                            ▼                 ▼
                   ┌────────────────┐  ┌──────────────────┐
                   │  Neon          │  │  AI provider     │
                   │  PostgreSQL    │  │  (optional:      │
                   │  rows AND      │  │   OpenAI-compat  │
                   │  uploaded files│  │   or none)       │
                   └────────────────┘  └──────────────────┘
```

### What running the backend on Vercel required

Serverless is a real constraint, and this project's earlier documentation said
the backend could not run there at all. Three specific problems stood behind
that claim. Each turned out to be addressable with a setting rather than a
rewrite, and the analytics engine was not touched.

| Constraint | What breaks | The setting |
| --- | --- | --- |
| The filesystem is private to one instance and erased without notice | `Ask` and `Investigate` re-read the original upload, possibly weeks later, so a dataset stays listed while its file is gone | `STORAGE_BACKEND=database` — files become rows next to the analysis computed from them |
| An instance may stop executing the moment it has replied | The thread pool started an analysis behind the response that might never be scheduled, leaving the row `queued` forever with no error | `ANALYSIS_EXECUTION=request` — the browser asks for the run explicitly and polls it exactly as before |
| Every cold start is a new process | Start-up housekeeping became a tax on unpredictable requests | `STARTUP_TASKS_ENABLED=false` — each task keeps a second trigger, so nothing is lost but the head start |

What is genuinely given up is upload size: a Vercel Function accepts at most
4.5 MB of request body, so `MAX_UPLOAD_SIZE_MB` is `4` there against `50` on a
server you run yourself. That is the one capability limit, and
[GO_LIVE.md §8](GO_LIVE.md#8-where-uploaded-files-live) states it plainly.

What is *gained* is that uploaded files persist at all. The previous free-tier
target offered no disk at any price, so files were wiped on every restart.

### When not to use Vercel

Run the backend as a container instead if you need uploads larger than 4 MB, or
an analysis that runs longer than the 300-second function ceiling.
`backend/Dockerfile` is production-ready — multi-stage, non-root, health-checked,
and it applies migrations on start-up — and `docker-compose.yml` brings up the
whole stack locally. With a real disk and a long-lived process, every setting in
the table above stays at its default. Section 12 covers this.

### How the two services connect

| | |
| --- | --- |
| Direction | web → api only. The browser never contacts the api service |
| Reachability | The api service has no public route. Vercel grants the web service internal access through a *binding* declared in `vercel.json` |
| Transport | `Authorization: Bearer <token>`, attached by the Next.js proxy server-side |
| Config | `BACKEND_API_URL` — generated by Vercel from the binding, never set by hand. It is deployment-aware, so a preview's frontend reaches that preview's backend |
| CORS | **None needed.** The browser only ever talks to its own origin |
| Client identity | The proxy forwards the real visitor address in `X-Real-Client-IP`, authenticated with `PROXY_SHARED_SECRET`, so the backend rate-limits per visitor rather than per server |

A binding grants reachability, not authorisation. Every request still carries a
bearer token the backend verifies, exactly as it would over the public internet.

### Why the session works this way

The Next.js layer owns the cookie; the backend stays a stateless bearer-token
API. That buys three things at once: the cookie is first-party to the origin the
user actually visits (so Safari's third-party blocking never sees it), access
tokens never enter JavaScript's reach (so an XSS bug cannot steal one), and
there is no CORS to configure in production.

### Deploy order

On Vercel there are only two steps, because both services deploy together:

1. **Neon first** — you need its connection string.
2. **Vercel second** — import the repository, paste the variables, deploy.
   Migrations run as part of the build.

[Section 14](#14-the-whole-deploy-in-order) is that sequence in full, and
[GO_LIVE.md](GO_LIVE.md) is the same thing written for a first-timer.

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

pip install -r requirements.txt -r requirements-dev.txt
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

[Neon](https://neon.com) and [Supabase](https://supabase.com) both have free
tiers. Copy the connection string they give you into `DATABASE_URL`. Neon is
what the default deployment uses — see [GO_LIVE.md](GO_LIVE.md).

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
pip install -r requirements.txt          # runtime only; no test runner
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

**Use one worker.** The analysis job runner keeps state in-process; scale with
replicas, not workers.

`requirements-dev.txt` is deliberately absent here. It exists so that what gets
deployed is only what runs.

### Frontend

```bash
cd frontend
npm ci
npm run build
npm start
```

---

## 11. Deploying to Vercel

Both services, one project. The repository is already configured; what follows
is what each file does and why. For click-by-click instructions, use
[GO_LIVE.md](GO_LIVE.md).

### What `vercel.json` declares

```json
{
  "services": {
    "web": {
      "root": "frontend/",
      "framework": "nextjs",
      "installCommand": "npm ci",
      "buildCommand": "npm run build",
      "bindings": [
        { "type": "service", "service": "api", "format": "url", "env": "BACKEND_API_URL" }
      ]
    },
    "api": {
      "root": "backend/",
      "framework": "fastapi",
      "entrypoint": "app.main:app",
      "buildCommand": "alembic upgrade head"
    }
  },
  "rewrites": [{ "source": "/(.*)", "destination": { "service": "web" } }]
}
```

Four things are load-bearing:

- **One rewrite, to `web` only.** A service is unreachable from the internet
  unless a top-level rewrite exposes it, so `api` has no public address at all.
  This is stronger than hiding it: there is no URL to find.
- **The binding injects `BACKEND_API_URL`.** Vercel generates the value, and it
  is deployment-aware. Setting it by hand would pin every preview deployment to
  production's backend.
- **`entrypoint: "app.main:app"`** is the existing FastAPI application object.
  Nothing was added to make it deployable.
- **`buildCommand: "alembic upgrade head"`** applies migrations once per
  deployment. A failure fails the deploy, so code is never live against a schema
  it does not match.

### Project settings

| Setting | Value | Why |
| --- | --- | --- |
| Root Directory | `./` | `vercel.json` at the repository root defines both services. Pointing at `frontend/` deploys the website with no API behind it — the single most common mistake |
| Framework Preset | `Other` | Each service declares its own |
| Build / Install commands | empty | Set per service in `vercel.json` |
| Node version | 20+ | `frontend/package.json` `engines` |
| Python version | 3.12 | `backend/.python-version`. Vercel supports 3.12–3.14; 3.11 is not available |

### Keeping the Python bundle under the limit

Vercel allows a Python function bundle of **500 MB uncompressed**, and there is
no tree-shaking — everything reachable at build time is included.

- `backend/requirements.txt` measures roughly **330 MB** installed.
- `scipy` was declared there and imported nowhere. Removing it saved 134 MB.
- `pytest` moved to `requirements-dev.txt`. A test runner has no business in a
  deployed function.
- `.vercelignore` excludes tests, docs, local databases and the development
  storage directory.

If a future dependency pushes it over, `requirements.txt` marks `scikit-learn`
and `pyarrow` as optional and states exactly what dropping each one costs: one
anomaly detector goes quiet, or the Parquet cache stops being written and CSVs
are re-parsed instead. Both have tested fallbacks.

### Preview deployments

Every branch and pull request gets a full deployment — frontend *and* backend,
wired together by the binding. Two things to know:

- The build runs `alembic upgrade head` against whatever `DATABASE_URL` is set
  for the Preview environment. Leave it unset and preview builds fail at that
  step, which is harmless. Set it to the production value and previews share the
  production database. Set it to a
  [Neon branch](https://neon.com/docs/guides/branching-intro) to keep them apart.
- `NEXT_PUBLIC_SITE_URL` is baked in at build time, so preview builds carry the
  production URL in their metadata. Cosmetic.

### Verifying a deployment

```bash
# The site
curl -sI https://your-app.vercel.app | head -1

# The API, through the proxy — there is no other address
curl -s https://your-app.vercel.app/api/backend/health

# Security headers
curl -sI https://your-app.vercel.app | grep -i "content-security-policy"
```

Then the full acceptance run:

```bash
cd backend && python scripts/acceptance_check.py --frontend https://your-app.vercel.app
```

---

## 12. Deploying as containers instead

Use this when you need uploads over 4 MB, analyses longer than 300 seconds, or
simply want to run the thing yourself. The application is the same; only the
settings differ, and they differ by being left alone.

`backend/Dockerfile` is multi-stage, runs as a non-root user, declares a health
check, and applies migrations before starting uvicorn. `docker-compose.yml`
brings up PostgreSQL, the backend and the frontend together.

```bash
docker compose up --build
```

For a single host, behind a reverse proxy that terminates TLS:

```bash
# Backend — note that none of the serverless settings appear here.
ENVIRONMENT=production
SECRET_KEY=<48 random characters>
DATABASE_URL=postgresql+psycopg://user:pass@host:5432/insightflow
STORAGE_DIR=/app/storage        # a real volume, backed up
MAX_UPLOAD_SIZE_MB=50
PROXY_SHARED_SECRET=<32 random characters>
TRUSTED_PROXY_COUNT=1           # however many proxies you actually run
CORS_ORIGINS=https://your-app.example.com
LOG_JSON=true
```

**Use one worker** (`uvicorn --workers 1`). The analysis job runner keeps state
in-process; scale with replicas, not workers.

Two things to get right, because both are silent when wrong:

- **`STORAGE_DIR` must be a persistent volume.** If it is container-local,
  uploads vanish on every restart and `Ask` and `Investigate` start reporting
  missing files on datasets that are still listed.
- **`TRUSTED_PROXY_COUNT` must match reality.** It is how many proxies you
  control in front of the service. Too high and a client can forge its own
  address; too low and every visitor shares one rate-limit budget.

### Cost, honestly

| | Vercel + Neon | A container host |
| --- | --- | --- |
| Money | $0 | Typically $5–7/month plus a disk |
| Upload ceiling | 4 MB | 50 MB, or whatever you set |
| Analysis ceiling | 300s | Whatever you allow |
| Cold start | A few seconds, plus Neon waking | None, if it never sleeps |
| Operations | None | Yours |

---

## 13. Production environment variables

The full reference is [ENVIRONMENT.md](ENVIRONMENT.md), including a
copy-pasteable block for each target. The rules that matter wherever you deploy:

- **`SECRET_KEY` and `DATABASE_URL` are required in production.** The
  application refuses to start without them, and refuses a `SECRET_KEY` that is
  short or is still the development placeholder. That check is deliberate: a
  deployment that boots with a known signing key is worse than one that does not
  boot.
- **`PROXY_SHARED_SECRET` must be identical on both halves.** On Vercel that is
  automatic — one project, one set of variables. Without it every visitor shares
  one rate-limit budget, because every request reaches the backend from the same
  place.
- **Only two variables may be `NEXT_PUBLIC_`**: `NEXT_PUBLIC_SITE_URL` and
  `NEXT_PUBLIC_MAX_UPLOAD_MB`. Anything with that prefix is compiled into the
  JavaScript every visitor downloads. `DATABASE_URL`, `SECRET_KEY`,
  `PROXY_SHARED_SECRET` and `OPENAI_API_KEY` must never carry it.
- **`BACKEND_API_URL` is set by hand only outside Vercel.** On Vercel the
  service binding generates it.

### Deployment checklist

- [ ] `SECRET_KEY` generated fresh, never reused from another environment
- [ ] `DATABASE_URL` points at PostgreSQL, pooled if the host is serverless
- [ ] `PROXY_SHARED_SECRET` set
- [ ] `STORAGE_BACKEND` matches whether the host has a durable disk
- [ ] `ANALYSIS_EXECUTION` matches whether the host runs work behind a response
- [ ] Upload limits agree: `MAX_UPLOAD_SIZE_MB` and `NEXT_PUBLIC_MAX_UPLOAD_MB`
- [ ] `NEXT_PUBLIC_SITE_URL` is the real public origin, no trailing slash
- [ ] Migrations applied (`alembic upgrade head`, or the Vercel build)
- [ ] `/health` returns `"database": true`
- [ ] A real upload, analysis, question and report completed against the live URL

---

## 14. The whole deploy, in order

The short version of [GO_LIVE.md](GO_LIVE.md), for someone who has done this
before.

### 1. Database — Neon

Create a project at [neon.com](https://neon.com). Copy the **pooled** connection
string — the hostname contains `-pooler`. The direct string exhausts the free
plan's connection limit once more than a couple of function instances are warm.

### 2. Two secrets

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"   # SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(32))"   # PROXY_SHARED_SECRET
```

### 3. AI — optional, free, and skippable

Skip and the product works; every number is computed deterministically either
way, and only the prose gets plainer. To enable it, get a key at
[console.groq.com/keys](https://console.groq.com/keys) and set `AI_ENABLED=true`,
`AI_PROVIDER=openai`, `OPENAI_BASE_URL=https://api.groq.com/openai/v1`,
`OPENAI_MODEL=openai/gpt-oss-120b`, `OPENAI_API_KEY=gsk_...`.

`AI_PROVIDER=openai` names the protocol, not the vendor. Model names get retired
from free tiers on a schedule; the current list is at
[console.groq.com/docs/rate-limits](https://console.groq.com/docs/rate-limits).

### 4. Vercel

**Add New -> Project**, pick the repository, set **Root Directory to `./`**, paste
the environment variables from [GO_LIVE.md §5](GO_LIVE.md#5-environment-variables),
deploy. The build installs both services and runs the migrations.

### 5. Close the loop

Set `NEXT_PUBLIC_SITE_URL` to the deployment URL and redeploy — it is baked in at
build time, so it needs one.

### 6. Prove it works

```bash
curl -s https://your-app.vercel.app/api/backend/health
cd backend && python scripts/acceptance_check.py --frontend https://your-app.vercel.app
```

76 checks. If they pass, the deployment is real, and you have tested it rather
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
cd backend && pip install -r requirements.txt -r requirements-dev.txt
cd ../frontend && npm install
```

Then re-run. If a test in `test_analytics_math.py` fails, that is a real
regression in the analytics engine — those assertions are hand-verified figures,
not snapshots.
