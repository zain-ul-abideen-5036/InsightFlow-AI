# Environment variables

Every variable the application reads, what it does, and what happens if you get
it wrong.

The authoritative definitions are `backend/app/core/config.py` and
`frontend/lib/`. `backend/.env.example` and `frontend/.env.example` are kept in
step with both.

**Nothing here has a production default that is safe to leave alone.** Where a
default exists it is for development convenience, and §5 lists the ones
production start-up refuses to accept.

---

## 1. Backend

Read from `backend/.env`, or from the process environment, which wins.

### Application

| Variable | Default | Purpose |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | One of `development`, `test`, `production`. `production` enforces the checks in §5 and disables `/docs`, `/redoc`, and `/openapi.json` |
| `LOG_LEVEL` | `INFO` | Standard Python level name |
| `LOG_JSON` | `false` | `true` emits one-line JSON per record. Use in production |

### Database

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | *(empty)* | Empty uses a SQLite file at `backend/storage/insightflow.db`. **Required in production.** `postgres://` and `postgresql://` are both accepted and rewritten to the `psycopg` driver that ships. On a serverless host use Neon's **pooled** string (hostname contains `-pooler`) |
| `DB_POOL_SIZE` | `10` | Connections held per process. Use `5` on serverless: every warm instance keeps its own pool and they multiply as the platform adds instances. Pair it with Neon's pooled endpoint, which exists to absorb exactly that |
| `DB_MAX_OVERFLOW` | `20` | Additional connections above the pool size. Use `5` on serverless |
| `AUTO_CREATE_TABLES` | `true`, and `false` when `ENVIRONMENT=production` | Creates missing tables from the models at start-up. A convenience for development; Alembic owns the schema in production, where creating tables from the models would hide a migration that was never written |

### Security

| Variable | Default | Purpose |
| --- | --- | --- |
| `SECRET_KEY` | dev placeholder | Signs access, refresh, and password-reset tokens. **Required in production**, minimum 32 characters |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` | Refresh token lifetime |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated origins allowed to call the API **directly**. In the standard deployment the browser never does, so this can be empty |

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### Identifying the caller

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRUSTED_PROXY_COUNT` | `0` | How many reverse proxies sit in front. `0` ignores `X-Forwarded-For` entirely |
| `PROXY_SHARED_SECRET` | *(empty)* | Shared with the frontend. Lets the API believe the client address the frontend forwards |
| `PROXY_AUTH_HEADER` | `x-insightflow-proxy` | Header carrying that secret |
| `CLIENT_IP_HEADER` | `x-real-client-ip` | Header carrying the forwarded address |

**Set `PROXY_SHARED_SECRET` in production.** Without it the backend rate-limits
on the address it can see, which behind the Next.js proxy is the frontend's
servers — one budget shared by every user of the product. Use the same value on
both halves. See [SECURITY.md §4](SECURITY.md#4-identifying-the-caller).

### Rate limiting

| Variable | Default | Purpose |
| --- | --- | --- |
| `RATE_LIMIT_ENABLED` | `true` | Master switch |
| `RATE_LIMIT_REQUESTS` | `300` | General budget per client per window |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | General window |
| `AUTH_RATE_LIMIT_REQUESTS` | `10` | Budget for login, signup, password reset, demo |
| `AUTH_RATE_LIMIT_WINDOW_SECONDS` | `300` | Authentication window |

### Uploads

| Variable | Default | Purpose |
| --- | --- | --- |
| `STORAGE_BACKEND` | `local` | `local` keeps uploads on disk; `database` keeps them as rows in PostgreSQL. Use `database` on any host whose filesystem is private to one instance or erased without notice — every serverless platform. See the note below |
| `STORAGE_DIR` | `./storage` | Where uploads and the SQLite file live, under `STORAGE_BACKEND=local`. **Must be a persistent volume in production** |
| `MAX_UPLOAD_SIZE_MB` | `50` | Largest accepted file. Raise your reverse proxy's limit to match. **Use `4` on Vercel**, which rejects request bodies over 4.5 MB itself |
| `ALLOWED_UPLOAD_EXTENSIONS` | `.csv,.xlsx,.xls,.tsv` | Extension allowlist, checked alongside magic bytes |
| `PROFILE_SAMPLE_ROWS` | `50000` | Rows scanned for type inference. `0` scans everything |
| `MAX_ANALYSIS_ROWS` | `500000` | Ceiling on rows analysed; larger files are down-sampled with a stated notice. Lower it where one analysis must fit inside a function timeout |

**Why `STORAGE_BACKEND=database` exists.** InsightFlow re-reads the original
file long after the upload: `Ask` executes a query plan against the rows, and
`Investigate` slices the dataset to explain an anomaly. That makes the file
durable state, not a temporary input. With `local` on a host that has no durable
disk, a dataset stays listed and visible while those two features report that
its file is gone. The cost of `database` is that uploads consume the same
database quota as the analysis results — bounded by `MAX_UPLOAD_SIZE_MB`.

### Analysis jobs

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANALYSIS_EXECUTION` | `thread` | `thread` runs analyses on an in-process pool behind the response. `request` runs them inside an explicit `POST /analyses/{id}/run`, which is required on platforms that may freeze an instance once it has replied. Identical from the user's point of view |
| `ANALYSIS_WORKERS` | `2` | Concurrent analyses in the in-process pool. Ignored under `ANALYSIS_EXECUTION=request` |
| `ANALYSIS_TIMEOUT_SECONDS` | `600` | Per-analysis ceiling |
| `ANALYSIS_STALE_MINUTES` | `30` | A job still `running` after this is treated as orphaned — at next start-up, and whenever its status is polled |

### Start-up

| Variable | Default | Purpose |
| --- | --- | --- |
| `STARTUP_TASKS_ENABLED` | `true` | Runs the start-up housekeeping: reconcile interrupted analyses, purge expired demo workspaces, warm a local model. Set `false` where every cold start is a new process. Each task has another trigger, so nothing is lost but the head start |

### AI

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_PROVIDER` | `ollama` | `ollama`, `openai`, or `none` |
| `AI_ENABLED` | `true` | `false` disables written explanations entirely. The product remains fully functional |
| `AI_TIMEOUT_SECONDS` | `120` | Per-call ceiling |
| `AI_MAX_RETRIES` | `1` | Retries on a transport failure |
| `AI_REQUEST_BUDGET_SECONDS` | `240` | Ceiling for a whole request. See the note below before raising it |
| `AI_MAX_SAMPLE_ROWS` | `25` | Hard ceiling on raw rows that may ever be sent. Nothing currently sends any |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama endpoint |
| `OLLAMA_MODEL` | `qwen2.5:3b-instruct` | Model name |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint. `.env.example` ships Groq's, whose free tier needs no card |
| `OPENAI_API_KEY` | *(empty)* | **Required when `AI_PROVIDER=openai`** |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model name, as the chosen endpoint spells it (e.g. `openai/gpt-oss-120b` on Groq) |

> **The AI budget has a hard ceiling of 300 seconds.**
>
> A request has to finish inside 300 seconds. That is when Node stops waiting
> for response headers, and a Next.js route handler cannot raise it. Go over it
> and the browser is told *"we could not reach the analysis service"* for a
> backend that is working perfectly — and the answer it was about to return is
> thrown away.
>
> `AI_TIMEOUT_SECONDS` cannot enforce this on its own. One logical call is up
> to four round trips: the first attempt, one retry, then the same again to
> repair malformed JSON. That was measured at 425 seconds for a single
> question. `AI_REQUEST_BUDGET_SECONDS` is the bound that actually holds, and
> it covers retries and repair together.
>
> So: raise `AI_REQUEST_BUDGET_SECONDS` only while it stays clearly under 300,
> and keep `AI_TIMEOUT_SECONDS` at or below it. A test asserts both.
>
> Under the ceiling a slow model is handled properly: the AI layer runs out of
> time first and the deterministic answer is returned, marked as a fallback.

### Demo

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEMO_DATA_ENABLED` | `true` | Enables `POST /auth/demo` and the "Use sample data" button. `false` removes the public demo endpoint |
| `DEMO_SESSION_HOURS` | `24` | How long a demo workspace lives before it and its files are deleted |

---

## 2. Frontend

Read from `frontend/.env.local`, or from the process environment.

| Variable | Default | Purpose |
| --- | --- | --- |
| `BACKEND_API_URL` | `http://localhost:8000` | Where the Next.js **server** reaches the API. On Vercel it is injected by the service binding declared in `vercel.json` — do not set it by hand there |
| `PROXY_SHARED_SECRET` | *(empty)* | Must match the backend's |
| `COOKIE_SECURE` | *(derived)* | Forces the `Secure` cookie flag. Leave unset unless your proxy does not set `x-forwarded-proto` |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Canonical public origin, used for metadata, sitemap, and social previews |
| `NEXT_PUBLIC_DEMO_ENABLED` | `true` | Shows the "Use sample data" affordance in onboarding |
| `NEXT_PUBLIC_SOURCE_URL` | the upstream repository | Footer "Source code" link |
| `NEXT_PUBLIC_MAX_UPLOAD_MB` | `50` | The limit the upload form shows and enforces before sending. **Set `4` on Vercel**, which rejects request bodies over 4.5 MB with its own error before this application runs. Keep it at or below the backend's `MAX_UPLOAD_SIZE_MB` |

### Why `BACKEND_API_URL` is not `NEXT_PUBLIC_`

Deliberate. The browser never contacts the backend. Every request goes to
`/api/backend/...` on this origin and is proxied server-side, which keeps the
session cookie first-party, keeps tokens out of JavaScript's reach, and removes
CORS from the deployment entirely. A `NEXT_PUBLIC_` variable would be inlined
into the client bundle and would defeat all three.

### Why `BACKEND_API_URL` must not be set on Vercel

`vercel.json` declares a service binding from the `web` service to the `api`
service, and Vercel generates the value. It is deployment-aware: a preview
deployment's frontend reaches that same preview's backend. A hand-typed value
would be a fixed hostname, so every preview would talk to production.

### Which variables may be `NEXT_PUBLIC_`

Only two are, and neither is a secret: a public URL, and a file-size limit the
upload form already reveals by rejecting anything larger. Anything prefixed
`NEXT_PUBLIC_` is compiled into the JavaScript every visitor downloads, so
`DATABASE_URL`, `SECRET_KEY`, `PROXY_SHARED_SECRET` and `OPENAI_API_KEY` must
never carry it.

### `NEXT_PUBLIC_` variables are baked in at build time

Changing one requires a rebuild, not a restart. On Vercel, change it and
redeploy.

### There is no `AUTH_SECRET`

Earlier documentation listed one. Nothing read it. The session cookie carries a
JWT the backend already signed and verifies on every request; a second signature
over a signature would detect no tampering the backend does not already reject.
Remove it from any environment where it is still set — it has no effect.

---

## 3. Minimum viable configurations

### Local development

Copy both `.env.example` files and change nothing:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

SQLite, no AI required, demo enabled.

### Vercel, no model

One Vercel project, one Neon database. This is what [GO_LIVE.md](GO_LIVE.md)
walks through, and every variable goes in the same place — the project's
environment settings — because both services share it.

```bash
ENVIRONMENT=production
SECRET_KEY=<48 random characters>
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require
PROXY_SHARED_SECRET=<32 random characters>

# Serverless: no durable disk, and no work runs behind a response.
STORAGE_BACKEND=database
ANALYSIS_EXECUTION=request
STARTUP_TASKS_ENABLED=false

# A Vercel Function rejects request bodies over 4.5 MB itself.
MAX_UPLOAD_SIZE_MB=4
NEXT_PUBLIC_MAX_UPLOAD_MB=4

# One analysis must fit inside the 300s function timeout.
MAX_ANALYSIS_ROWS=150000

# Many instances, each with its own pool, against a free-tier database.
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=5

# The browser never calls the API directly; it has no public address.
CORS_ORIGINS=
TRUSTED_PROXY_COUNT=0
LOG_JSON=true

AI_ENABLED=false
AI_PROVIDER=none

NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app
```

`BACKEND_API_URL` is deliberately absent: Vercel injects it from the service
binding in `vercel.json`.

### A server you run yourself, no model

The product is fully functional this way, and the whole test suite runs in it.
Note what is *not* here: with a real disk and a process that stays running, the
three serverless settings above are all left at their defaults.

```bash
# Backend
ENVIRONMENT=production
SECRET_KEY=<48 random characters>
DATABASE_URL=postgresql+psycopg://user:pass@host:5432/insightflow
STORAGE_DIR=/app/storage
CORS_ORIGINS=https://your-app.example.com
PROXY_SHARED_SECRET=<32 random characters>
LOG_JSON=true
AI_ENABLED=false
AI_PROVIDER=none

# Frontend
BACKEND_API_URL=https://your-api-host.com
NEXT_PUBLIC_SITE_URL=https://your-app.example.com
PROXY_SHARED_SECRET=<the same 32 characters>
```

### Production, hosted model

Replace the AI block. `AI_PROVIDER=openai` selects the *protocol* — anything
serving `POST /chat/completions` — not the vendor.

```bash
AI_ENABLED=true
AI_PROVIDER=openai
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_API_KEY=gsk_<your key>
OPENAI_MODEL=openai/gpt-oss-120b
AI_TIMEOUT_SECONDS=45
```

A hosted endpoint answers in seconds rather than minutes, so the generous local
timeout can come down — and the 300-second ceiling above stops being something
you have to think about at all.

[Groq](https://console.groq.com/keys) is the default in `.env.example` because
its developer tier is free without a credit card. Point `OPENAI_BASE_URL` at
`https://api.openai.com/v1`, Together, OpenRouter, vLLM or LM Studio instead
and nothing else changes; the free tier is a recommendation, not a dependency.

Free-tier rate limits are per-minute request and token budgets. Exceeding one
returns a plainly-worded "try again shortly" and leaves the deterministic
analysis untouched, because no computed number ever passes through the model.

---

## 4. Generating secrets

```bash
# Backend SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(48))"

# PROXY_SHARED_SECRET — the same value on both halves
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Never commit them. Never reuse one across environments. Rotating `SECRET_KEY`
signs every user out, which is the correct behaviour if it was exposed.

---

## 5. What production refuses to start with

`Settings._validate_production_secrets` raises at import time, so the process
exits before it can serve a request:

| Condition | Why |
| --- | --- |
| `SECRET_KEY` is the development placeholder | Sessions would be forgeable by anyone who has read this repository |
| `SECRET_KEY` shorter than 32 characters | Not enough entropy for HS256 |
| `DATABASE_URL` empty | SQLite on an ephemeral container filesystem loses every account on restart |
| `AI_PROVIDER=openai` with no `OPENAI_API_KEY` | Every explanation would silently fall back, for a reason nothing surfaces |

A misconfigured deployment should fail loudly at boot rather than quietly do the
wrong thing.

---

## 6. Where they are set

| Environment | Backend | Frontend |
| --- | --- | --- |
| Local | `backend/.env` | `frontend/.env.local` |
| Docker Compose | `docker-compose.yml` `environment:` | run with `npm run dev` |
| **Vercel** | Project → Settings → Environment Variables | the same place |
| A server you run yourself | the service's environment settings | the same |
| CI | `.github/workflows/ci.yml` `env:` | same |

On Vercel both halves are services in one project, so there is one list of
environment variables and each service reads what it needs from it. There is no
second dashboard to keep in sync — which is also why `PROXY_SHARED_SECRET`
cannot drift between them.
