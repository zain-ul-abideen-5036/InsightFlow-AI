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
14. [Troubleshooting](#14-troubleshooting)

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
[12](#12-deploying-the-backend) have the exact steps.

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

**On CPU, expect 60–120 seconds for a written answer.** The backend warms the
model at start-up so the first question does not also pay the load cost, and
`AI_TIMEOUT_SECONDS` defaults to 180 to allow for it. For fast responses, use a
GPU or point `AI_PROVIDER=openai` at a hosted endpoint.

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
pytest                      # all 180 tests, ~90 seconds
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

`frontend/vercel.json` sets only what Vercel cannot infer: `no-store` on `/api/*`
responses, and a 60-second `maxDuration` for the proxy route, because an upload
of a large spreadsheet legitimately takes longer than the default.

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

1. **New → Web Service**, connect the repository.
2. Root directory: `backend`. Runtime: Docker.
3. Add a **PostgreSQL** instance and copy its internal connection string.
4. Set the environment variables from [section 13](#13-production-environment-variables).
5. Add a persistent disk mounted at `/app/storage` so uploads survive restarts.

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

| Component | Free option | Paid from |
| --- | --- | --- |
| Frontend | Vercel Hobby | $0 |
| Backend | Render free tier (sleeps when idle) | ~$7/month |
| Database | Neon / Supabase free tier | ~$5/month |
| AI | Local Ollama, or `AI_ENABLED=false` | $0 |

The whole product runs at **$0** on free tiers. The trade-off is a cold start of
about 50 seconds on Render's free tier after inactivity.

---

## 13. Production environment variables

### Backend

```bash
ENVIRONMENT=production
SECRET_KEY=<48+ random characters>
DATABASE_URL=postgresql+psycopg://user:pass@host:5432/insightflow
CORS_ORIGINS=https://your-app.vercel.app
STORAGE_DIR=/app/storage
LOG_JSON=true
RATE_LIMIT_ENABLED=true

# Either a hosted model...
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# ...or no model at all. The product works fully either way.
# AI_ENABLED=false
```

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
- [ ] `DATABASE_URL` points at PostgreSQL, not SQLite
- [ ] `alembic upgrade head` has run
- [ ] `STORAGE_DIR` is on a persistent volume
- [ ] No `.env` file is committed (`git check-ignore backend/.env`)
- [ ] `/api/v1/health` returns `"status": "ok"`
- [ ] `python scripts/acceptance_check.py --frontend https://your-app.vercel.app` passes

---

## 14. Troubleshooting

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
