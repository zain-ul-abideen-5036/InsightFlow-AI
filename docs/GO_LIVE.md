# Going live

A step-by-step guide to putting InsightFlow AI on the internet, written for
someone doing it for the first time. No prior deployment experience assumed.

Everything in the repository is already configured. Your job is the part only
you can do: creating accounts, copying credentials, and pasting them into a
dashboard. Nothing here requires editing code.

**Time:** about 25 minutes, most of it waiting for builds.
**Cost:** nothing. No credit card at any step.

---

## 1. Accounts you need

| # | Account | What it runs | Cost | Card required? |
|---|---------|--------------|------|----------------|
| 1 | **GitHub** | Holds the code Vercel deploys from | Free | No |
| 2 | **Vercel** | The whole application — website *and* API | Free (Hobby) | No |
| 3 | **Neon** | The PostgreSQL database | Free | No |
| 4 | **Groq** *(optional)* | The AI that writes explanations | Free tier | No |

You almost certainly have GitHub already. The other two take a minute each and
both sign in with your GitHub account.

**Step 4 is genuinely optional.** InsightFlow computes every number itself, in
Python, from your data. The AI only ever puts already-computed figures into
sentences. Skip it and the product works: dashboards, insights, anomalies,
reports, and `Ask InsightFlow` all still answer, in plainer prose. Nothing is
missing and no figure changes. See [AI_GUARDRAILS.md](AI_GUARDRAILS.md).

### What the free tiers actually give you

Stated plainly, because "free" usually has an asterisk. All figures verified
against the providers' own documentation in September 2026.

| | Limit | What it means here |
|---|---|---|
| **Vercel** function memory | 2 GB | Comfortable. Analysis of a 150k-row file peaks well under this. |
| **Vercel** function timeout | 300s, and that is also the maximum | One analysis, or one AI answer, must finish inside 5 minutes. |
| **Vercel** request body | **4.5 MB** | **The upload size limit.** See [§8](#8-where-uploaded-files-live). |
| **Vercel** Python bundle | 500 MB | The dependencies measure ~330 MB. Fits. |
| **Neon** storage | 0.5 GB per project | Holds the analysis results *and* the uploaded files. Hundreds of typical spreadsheets. |
| **Neon** compute | 100 CU-hours/month | Plenty. The database sleeps after 5 minutes idle and wakes on the next request. |
| **Groq** | Rate-limited free tier | Hitting it produces a plainly-worded "try again shortly". Analysis is unaffected — it never goes near the model. |

Exceeding a Vercel free limit **pauses** the service until the month resets. You
are never charged without adding a card.

---

## 2. What has already been done for you

You do not need to understand any of this to deploy. It is here so you know what
you are agreeing to, and so the settings in §4 make sense.

| File | What it does |
|------|--------------|
| `vercel.json` | Declares both halves of the app as one Vercel project: the Next.js frontend and the FastAPI backend. Also runs database migrations on every deploy. |
| `.vercelignore` | Keeps tests, docs and local data out of the deployment. |
| `backend/.python-version` | Pins Python 3.12, which is what Vercel runs. |
| `backend/requirements.txt` | The Python dependencies. Trimmed — `scipy` was declared and never imported, and removing it saved 134 MB. |
| `backend/requirements-dev.txt` | Test-only dependencies, kept out of the deployed code. |
| `backend/app/core/storage.py` | Lets uploaded files live in PostgreSQL instead of on a disk, because Vercel has no durable disk. |
| `backend/alembic/versions/` | The database schema, as migrations. Applied automatically. |

Three behavioural changes were needed to make the existing application work on
Vercel. Each is switched on by an environment variable in §5, and each leaves
the product identical from the outside:

1. **Uploaded files go into the database** (`STORAGE_BACKEND=database`). A
   serverless function's filesystem is private to one instance and wiped
   without warning, and InsightFlow re-reads your original file every time you
   use `Ask` or `Investigate`.
2. **Analyses run inside a request** (`ANALYSIS_EXECUTION=request`). Vercel may
   stop executing a function the instant it has replied, so work started
   "behind" a response may never run. The browser now asks for the analysis
   explicitly and polls it exactly as before — you will see the same staged
   progress screen.
3. **Start-up housekeeping is off** (`STARTUP_TASKS_ENABLED=false`). It would
   otherwise re-run on every cold start. Everything it did still happens, just
   triggered by the request that needs it.

The deterministic analytics engine was **not** touched. Every metric, trend,
segment, anomaly, and evidence bundle is computed by the same code, and the test
suite asserts the same known answers on both deployment shapes.

---

## 3. Create the database (Neon)

1. Go to **[neon.com](https://neon.com)** and sign in with GitHub.
2. Click **Create project**. Name it `insightflow`. Leave every other setting
   alone — the defaults are correct.
3. When it finishes, Neon shows a **connection string**. It looks like this:

   ```
   postgresql://neondb_owner:npg_XXXXXXXX@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

4. **Check it contains `-pooler`.** Neon offers two strings and the difference
   matters here:

   - **Pooled** (hostname contains `-pooler`) — ✅ **use this one.**
   - Direct (no `-pooler`) — do not use.

   Why: each running copy of the backend keeps its own set of database
   connections, and Vercel starts copies as traffic demands. Without the
   pooler, a modest burst exhausts the free plan's connection limit and requests
   start failing for no visible reason. If the string you copied has no
   `-pooler`, look for a **Connection pooling** toggle on the Neon dashboard and
   turn it on.

5. **Copy the whole string, including `?sslmode=require`.** Paste it somewhere
   temporary — you need it in the next step. Treat it like a password: it grants
   full access to your data.

> **Do I have to create tables?** No. `vercel.json` runs
> `alembic upgrade head` as part of every deployment, so the schema is created
> on your first deploy and updated on later ones. See [§6](#6-database-migrations).

---

## 4. Deploy to Vercel

### 4a. Generate two secrets

You need two random strings. Run these in a terminal and keep the output:

```bash
# SECRET_KEY — signs session tokens
python -c "import secrets; print(secrets.token_urlsafe(48))"

# PROXY_SHARED_SECRET — lets the backend trust the frontend about who is calling
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

No Python? Use `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
or any password generator set to 60+ characters.

Keep these private. Never commit them. If either leaks, generate a new one and
update it in Vercel.

### 4b. Import the repository

1. Go to **[vercel.com](https://vercel.com)** and sign in with GitHub.
2. **Add New… → Project**, then pick your `InsightFlow-AI` repository.
3. Configure it as follows — these three are the settings people get wrong:

   | Setting | Value | Why |
   |---------|-------|-----|
   | **Root Directory** | `./` — the repository root, **not** `frontend` | `vercel.json` at the root defines both services. Pointing at `frontend` deploys the website with no API behind it. |
   | **Framework Preset** | `Other` (or whatever it auto-detects — `vercel.json` overrides it) | Each service declares its own framework. |
   | **Build / Install commands** | Leave **empty** | `vercel.json` sets them per service. |

4. Expand **Environment Variables** and add every row from
   [§5](#5-environment-variables) marked *required*. Set them for **Production**
   (and for **Preview** too, if you want preview deployments to work — see the
   note in §6).
5. Click **Deploy**.

The first build takes 3–6 minutes: it installs the Node dependencies, builds
Next.js, installs the Python dependencies, and runs the migrations.

### 4c. If the build fails

Read the log and jump to [§10](#10-troubleshooting). The two common first-deploy
failures are a missing `DATABASE_URL` (migrations cannot run) and a Root
Directory pointing at `frontend`.

### 4d. Set your site URL

The deployment now has a real address, something like
`https://insightflow-ai.vercel.app`.

Go to **Settings → Environment Variables**, set `NEXT_PUBLIC_SITE_URL` to that
exact URL with no trailing slash, and **redeploy** (Deployments → ⋯ →
Redeploy). This variable is baked into the build, so it only takes effect on the
next one. It affects social preview cards and `sitemap.xml`, not whether the app
works.

---

## 5. Environment variables

Set all of these in **Vercel → Settings → Environment Variables**. Everything is
server-side unless the name starts with `NEXT_PUBLIC_`.

| Variable | Where | Required? | Purpose |
|----------|-------|-----------|---------|
| `DATABASE_URL` | Server (secret) | **Yes** | Neon pooled connection string from §3. Also used by the build to run migrations. |
| `SECRET_KEY` | Server (secret) | **Yes** | Signs session tokens. The app refuses to start in production without a strong one. |
| `ENVIRONMENT` | Server | **Yes** | `production`. Enables secret validation, disables the API docs pages, and stops tables being created from the models. |
| `STORAGE_BACKEND` | Server | **Yes** | `database`. Uploads go to PostgreSQL because Vercel has no durable disk. |
| `ANALYSIS_EXECUTION` | Server | **Yes** | `request`. Analyses run inside a request rather than a background thread. |
| `STARTUP_TASKS_ENABLED` | Server | **Yes** | `false`. Skips per-cold-start housekeeping. |
| `PROXY_SHARED_SECRET` | Server (secret) | **Yes** | The second secret from §4a. Lets the backend trust the visitor's IP address as reported by the frontend, so rate limits apply per visitor instead of one shared budget. |
| `MAX_UPLOAD_SIZE_MB` | Server | **Yes** | `4`. Vercel rejects request bodies over 4.5 MB itself. |
| `NEXT_PUBLIC_MAX_UPLOAD_MB` | **Browser** | **Yes** | `4`. Makes the upload form show and enforce the same limit, so users get our message rather than a platform error. |
| `DB_POOL_SIZE` | Server | Recommended | `5`. Each instance keeps its own pool, and they multiply as Vercel starts instances. Neon's pooler absorbs that; the direct endpoint would not. |
| `DB_MAX_OVERFLOW` | Server | Recommended | `5`. Headroom for bursts, without letting one instance open an unbounded number. |
| `TRUSTED_PROXY_COUNT` | Server | Recommended | `0`. The `X-Forwarded-For` header is not trusted; `PROXY_SHARED_SECRET` is the mechanism instead. |
| `CORS_ORIGINS` | Server | Recommended | Empty. The browser never calls the API directly, so no origin needs allowing. |
| `LOG_JSON` | Server | Recommended | `true`. One-line JSON per event, which is what Vercel's log search expects. |
| `MAX_ANALYSIS_ROWS` | Server | Recommended | `150000`. Larger files are down-sampled with a visible notice, so one analysis stays inside the 300s function timeout. |
| `NEXT_PUBLIC_SITE_URL` | **Browser** | Recommended | Your deployment URL, no trailing slash. Social preview cards and `sitemap.xml`. Set it after the first deploy (§4d). |
| `DEMO_DATA_ENABLED` | Server | Optional | `true` keeps the public "try it without signing up" demo. `false` removes the endpoint. |
| `AI_ENABLED` | Server | Optional | `false` unless you did §7. |
| `AI_PROVIDER` | Server | Optional | `none` unless you did §7. |
| `OPENAI_API_KEY` | Server (secret) | Optional | Only if you did §7. |
| `OPENAI_BASE_URL` | Server | Optional | Only if you did §7. |
| `OPENAI_MODEL` | Server | Optional | Only if you did §7. |

**Do not set `BACKEND_API_URL`.** Vercel generates it: `vercel.json` declares a
service binding, and the value it injects is deployment-aware, so a preview
deployment's frontend reaches that same preview's backend. A hand-typed value
would be a fixed hostname and would break previews.

### Never put these in a `NEXT_PUBLIC_` variable

Anything prefixed `NEXT_PUBLIC_` is compiled into the JavaScript sent to every
visitor's browser. It is public, permanently, to everyone.

- ❌ `DATABASE_URL`
- ❌ `SECRET_KEY`
- ❌ `PROXY_SHARED_SECRET`
- ❌ `OPENAI_API_KEY`

The two `NEXT_PUBLIC_` variables above are a URL and a file-size limit. Neither
is a secret: the app already reveals both to anyone who looks at it.

---

## 6. Database migrations

**They run automatically.** `vercel.json` sets the backend service's build
command to `alembic upgrade head`, so every deployment applies any pending
migrations before the new code goes live.

This is deliberate rather than convenient:

- It runs **once per deployment**, not once per request, so there is no
  start-up cost and no chance of two instances migrating at the same time.
- A migration that fails **fails the deployment**. The currently-live version
  keeps serving. Code that needs a column that does not exist is never
  reachable.

You never run a command by hand, and you never create a table in the Neon
console.

> **A note on preview deployments.** Every deployment runs migrations against
> whatever `DATABASE_URL` is set for its environment. If you set the same value
> for Production and Preview — the simplest setup, and fine for a personal
> project — then previews share the production database and a migration in a
> pull request is applied to it. To keep them separate, create a
> [Neon branch](https://neon.com/docs/guides/branching-intro) and use its
> connection string for the Preview environment. If you leave `DATABASE_URL`
> unset for Preview, preview builds will fail at the migration step; that is
> expected, and production is unaffected.

To inspect the schema yourself, Neon's dashboard has an SQL editor. To see the
migration history: `SELECT * FROM alembic_version;`

---

## 7. AI (optional)

Skip this entirely if you want. The application is complete without it.

With AI switched off, every screen still works and every number is still
computed. What you lose is the written prose: explanations read as plainer,
more mechanical sentences assembled from the evidence rather than fluent
paragraphs. No figure, trend, anomaly, or ranking changes — those never come
from the model in the first place.

### Setting it up with Groq

Groq serves open-weights models on an OpenAI-compatible endpoint with a free
developer tier that needs no credit card. It is the right choice here for a
reason beyond price: answers come back in seconds rather than the 60–180s a
local CPU model takes, which keeps every request comfortably inside Vercel's
300-second function timeout.

1. Go to **[console.groq.com/keys](https://console.groq.com/keys)** and sign in.
2. **Create API Key**. Copy it — it begins `gsk_` and is shown once.
3. In **Vercel → Settings → Environment Variables**, set:

   | Variable | Value |
   |----------|-------|
   | `AI_ENABLED` | `true` |
   | `AI_PROVIDER` | `openai` |
   | `OPENAI_BASE_URL` | `https://api.groq.com/openai/v1` |
   | `OPENAI_MODEL` | `openai/gpt-oss-120b` |
   | `OPENAI_API_KEY` | your `gsk_…` key |

4. **Redeploy.**

Two things that look like mistakes and are not:

- `AI_PROVIDER=openai` names the **protocol**, not the company. Any server
  speaking `POST /chat/completions` works, which is why switching providers
  needs no code change.
- The `openai/` prefix in `openai/gpt-oss-120b` is part of the model's ID on
  Groq. It is an open-weights model Groq hosts. Both lines are correct together.

**Model names get retired.** Groq removes them on a published schedule —
`llama-3.3-70b-versatile`, which this project recommended earlier, left the free
tier in August 2026. If AI requests start failing with "model not found", the
fix is this one variable. The current free-tier list is at
[console.groq.com/docs/rate-limits](https://console.groq.com/docs/rate-limits):
a model has a free tier if and only if it appears in that table.

### Verifying it

Sign in, open **Settings**. The AI panel names the provider and model, says
whether it is reachable, and lists exactly what data is sent — aggregated
figures, segment names, period labels, and your question. Individual rows of
your file are never sent.

If the model is unreachable or rate-limited, every screen keeps working and the
answer says it is the deterministic one. That is a designed path, not a
degradation to apologise for.

---

## 8. Where uploaded files live

**In your Neon database**, in a table called `stored_files`, alongside the
analysis results computed from them.

This is not the obvious choice, so here is the reasoning. InsightFlow does not
treat your upload as a one-time input: `Ask InsightFlow` executes a query plan
against your actual rows, and `Investigate` slices the dataset to explain an
anomaly. Both re-read the original file, possibly weeks later. A Vercel
function's filesystem is private to one instance and erased without notice, so a
file written there is invisible to the next request. Keeping files in the
database is what makes those two features work at all.

### What this costs you, honestly

| | |
|---|---|
| **Maximum upload size** | **4 MB.** A Vercel function accepts at most 4.5 MB of request body, and answers anything larger with its own error before our code runs. The upload form enforces 4 MB in the browser so you get a clear message instead. |
| **Total storage** | Shares Neon's 0.5 GB free allowance with everything else. A typical business CSV is 1–3 MB, so expect room for well over a hundred datasets. Deleting a dataset frees its space immediately. |
| **What survives a deploy** | Everything. This is the point. |

4 MB is a real reduction from the 50 MB a self-hosted deployment allows, and it
is the one genuine capability limit of running on Vercel. It is also a large
improvement on where this project was before: the previous free-tier deployment
target had **no** persistent disk at any price, so uploaded files were wiped on
every restart and `Ask` and `Investigate` broke on datasets that were still
listed in the UI. Files now persist properly; they are just smaller.

**If you need larger uploads:** run the backend on a host with a real disk (the
repository still contains a `Dockerfile` and `docker-compose.yml`) and set
`STORAGE_BACKEND=local`, `MAX_UPLOAD_SIZE_MB=50`. Nothing else changes — the
storage layer is one interface with two implementations.

### Usage guidance

A 4 MB CSV holds roughly 40,000–80,000 rows of typical order data. Files larger
than `MAX_ANALYSIS_ROWS` (set to 150,000 above) are down-sampled with a notice
shown in the UI, never silently truncated.

---

## 9. Testing your live deployment

Work down the list. Each step depends on the ones above it, so stop at the first
failure and go to [§10](#10-troubleshooting).

Replace `YOUR-APP` with your real subdomain throughout.

### Automated checks

```bash
# 1. The site is up.
curl -sI https://YOUR-APP.vercel.app | head -1
# Expect: HTTP/2 200

# 2. The API is alive and the database is reachable.
curl -s https://YOUR-APP.vercel.app/api/backend/health
# Expect JSON with "status":"ok" and "database":true.
# "status":"degraded" means the database is not reachable — check DATABASE_URL.

# 3. Security headers are being sent.
curl -sI https://YOUR-APP.vercel.app | grep -i "content-security-policy\|strict-transport"
# Expect both.
```

> The API is reachable only through `/api/backend/...` on your own domain. That
> is by design: the backend is an internal service with no public address of its
> own, so there is no second URL to test and no CORS to configure.

### The whole journey, automatically

This is the strongest check available, and the one worth running once your
deployment is up. It creates a real account on your live site, loads the sample
dataset, runs an analysis, asks a question, generates a report, and verifies
that another account cannot read any of it — driving everything through the
website exactly as a browser does.

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
python scripts/acceptance_check.py --frontend https://YOUR-APP.vercel.app
```

76 checks, each printed as it passes. It exits non-zero on the first real
failure, so it is safe to trust the last line. It leaves one test account and
one workspace behind on your deployment; delete them from **Settings** if you
would rather they were not there.

### By hand, in a browser

| # | Check | What you should see |
|---|-------|---------------------|
| 1 | **Homepage** — open the root URL | The landing page, styled, no console errors |
| 2 | **Authentication** — sign up with a real email and a strong password | You land on onboarding, then the dashboard |
| 3 | **Sign out and back in** | Session persists; refreshing keeps you signed in |
| 4 | **Dataset upload** — upload a CSV under 4 MB with a date column and an amount column | Preview table, then the "Review detected fields" screen |
| 5 | **Analysis** — confirm the fields | The staged progress screen advances and completes |
| 6 | **Dashboard** — open Overview | KPI cards with real figures; revenue first; trend chart drawn |
| 7 | **Ask InsightFlow** — ask "why did revenue change last month?" | An answer with a **View evidence** panel listing each figure and how it was computed |
| 8 | **Insights** | Cards ranked by importance, each with evidence |
| 9 | **Anomalies** | A list; open one and click **Investigate** for a breakdown |
| 10 | **Reports** — generate one | A report renders and opens |
| 11 | **AI** *(only if you did §7)* | Settings names the provider and reports it available; answers read as fluent prose |

### The one-click check

If you left `DEMO_DATA_ENABLED=true`, the fastest end-to-end test is the
**"Try the demo"** button on the homepage. It creates a throwaway workspace,
loads the NovaMart sample dataset, runs a full analysis, and signs you in — so
steps 2, 4, 5 and 6 all happen in one click. Expect it to take 10–20 seconds on
a cold start.

---

## 10. Troubleshooting

### Build and deploy

| Symptom | Cause | Fix |
|---------|-------|-----|
| Build fails: `alembic ... could not connect` / `DATABASE_URL` errors | `DATABASE_URL` missing, or set for the wrong environment | Add it under Settings → Environment Variables for **Production**. Confirm you copied the whole string including `?sslmode=require`. |
| Build fails: `SECRET_KEY must be set to a strong unique value` | `ENVIRONMENT=production` with no `SECRET_KEY` | Add `SECRET_KEY` (§4a). This check is deliberate — it refuses to deploy with a development default. |
| Site deploys but every `/api/backend/...` call 404s | Root Directory is `frontend` | Settings → General → Root Directory → `./`, then redeploy. `vercel.json` at the root defines both services. |
| Vercel does not recognise `services` in `vercel.json` | Vercel Services is a beta feature | Confirm it is enabled for your account. If not, deploy the two halves as two Vercel projects instead — both on Vercel — and set `BACKEND_API_URL` in the frontend project to the backend project's URL. |
| Build fails: Python bundle exceeds the size limit | An added dependency pushed it over 500 MB | `backend/requirements.txt` marks `scikit-learn` and `pyarrow` as optional and explains what dropping each one costs. Remove one. |
| Preview deployments fail at the migration step | `DATABASE_URL` is not set for Preview | Expected. Either set it for Preview too, or ignore it — see the note in §6. |

### Running

| Symptom | Cause | Fix |
|---------|-------|-----|
| First request after a quiet period takes 5–15s | Cold start, plus Neon waking from sleep | Normal on free tiers. Subsequent requests are fast. |
| `/api/backend/health` says `"database":false` | Wrong connection string, or Neon project deleted | Re-copy the pooled string from Neon and redeploy. |
| Intermittent `too many connections` / `remaining connection slots` | Using Neon's **direct** string instead of the pooled one | Switch `DATABASE_URL` to the `-pooler` hostname (§3, step 4). Set `DB_POOL_SIZE=2`. |
| Upload fails with a Vercel error page mentioning `FUNCTION_PAYLOAD_TOO_LARGE` | File over 4.5 MB, and `NEXT_PUBLIC_MAX_UPLOAD_MB` is not set | Set `NEXT_PUBLIC_MAX_UPLOAD_MB=4` and redeploy, so the browser catches it first with a clear message. |
| Analysis sits at "queued" and never starts | `ANALYSIS_EXECUTION` is not `request` | Set it and redeploy. Without it the backend expects a background thread that Vercel will not run. |
| Analysis fails with "this analysis was interrupted" | It exceeded the 300s function timeout | Lower `MAX_ANALYSIS_ROWS` (try `50000`) and run it again. |
| `Ask` or `Investigate` says "the file behind this dataset is no longer available" | `STORAGE_BACKEND` is not `database`, so the file went to a disk that no longer exists | Set `STORAGE_BACKEND=database` and redeploy. Datasets uploaded before the fix must be uploaded again. |
| Everyone shares one rate limit; one busy user locks out others | `PROXY_SHARED_SECRET` missing or different between services | It is one variable read by both services in one project, so just confirm it is set. |
| Signed in, then immediately signed out again | Cookies not being kept | Confirm you are on `https://`. If you terminate TLS somewhere unusual, set `COOKIE_SECURE=true`. |
| AI answers fail with "model not found" | The model was retired from Groq's free tier | Change `OPENAI_MODEL` to one listed at [console.groq.com/docs/rate-limits](https://console.groq.com/docs/rate-limits). |
| AI answers stop, everything else fine | Groq rate limit reached | Wait. This is the designed fallback: deterministic answers continue. |

### Where to look

- **Vercel → your project → Logs** — every request, with the request id that
  also appears in error responses shown to users. Search by that id to find the
  exact failure a user saw.
- **Vercel → Deployments → (a deployment) → Building** — build and migration
  output.
- **Neon → Monitoring** — connection counts and storage used.

---

## 11. The final architecture

```
                        ┌──────────────────┐
                        │     Browser      │
                        └────────┬─────────┘
                                 │ HTTPS
                                 ▼
  ╔══════════════════════════════════════════════════════════════╗
  ║  ONE VERCEL PROJECT                                          ║
  ║  https://your-app.vercel.app                                 ║
  ║                                                              ║
  ║   ┌────────────────────────────────────────────────────┐     ║
  ║   │  "web" service — Next.js 15                        │     ║
  ║   │                                                    │     ║
  ║   │  • Pages, dashboards, charts                       │     ║
  ║   │  • Owns the session: tokens live in httpOnly       │     ║
  ║   │    cookies, never in JavaScript                    │     ║
  ║   │  • Proxies /api/backend/* to the API, attaching    │     ║
  ║   │    the bearer token server-side                    │     ║
  ║   └───────────────────────┬────────────────────────────┘     ║
  ║                           │                                  ║
  ║                           │ service binding                  ║
  ║                           │ (internal; never leaves Vercel)  ║
  ║                           ▼                                  ║
  ║   ┌────────────────────────────────────────────────────┐     ║
  ║   │  "api" service — FastAPI on Python 3.12            │     ║
  ║   │  No public address of its own.                     │     ║
  ║   │                                                    │     ║
  ║   │  DETERMINISTIC ENGINE — computes every number      │     ║
  ║   │    schema detection → validation → metrics →       │     ║
  ║   │    trends → segments → anomalies → evidence        │     ║
  ║   │                                                    │     ║
  ║   │  QUESTION PIPELINE                                 │     ║
  ║   │    question → plan → execute → evidence            │     ║
  ║   └───────────────────────┬────────────────────────────┘     ║
  ╚═══════════════════════════╪══════════════════════════════════╝
                              │
                ┌─────────────┴──────────────┐
                ▼                            ▼
   ┌────────────────────────┐   ┌──────────────────────────┐
   │  Neon PostgreSQL       │   │  AI provider  (OPTIONAL) │
   │                        │   │  Groq / any OpenAI-      │
   │  • users, workspaces   │   │  compatible endpoint     │
   │  • datasets, analyses  │   │                          │
   │  • metrics, insights,  │   │  Receives only computed  │
   │    anomalies, evidence │   │  figures and labels.     │
   │  • uploaded files      │   │  Phrases them. Invents   │
   │    (stored_files)      │   │  no number, ever.        │
   └────────────────────────┘   └──────────────────────────┘
```

### Two properties worth naming

**Only one thing is public.** The `web` service is the sole public entry point.
The `api` service has no address on the internet; the frontend reaches it over
an internal binding. So there is no CORS to configure, no second URL to secure,
and no way for a browser to talk to the API except through the proxy that holds
the session cookie.

**The model never does arithmetic.** Every figure on every screen is computed in
Python from your rows and carries an evidence trail you can open. The AI layer
receives already-computed numbers and turns them into sentences, and it is
constrained to keep four kinds of statement apart: observed fact, statistical
finding, possible explanation, and recommended next step. Switch it off and the
facts are unchanged — only the prose gets plainer. This is enforced in code and
tested; see [AI_GUARDRAILS.md](AI_GUARDRAILS.md).

---

## Related documents

| Document | For |
|----------|-----|
| [ENVIRONMENT.md](ENVIRONMENT.md) | Every environment variable, in full |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Other hosting options, and the reasoning behind this one |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the application is built |
| [AI_GUARDRAILS.md](AI_GUARDRAILS.md) | What the AI may and may not say |
| [SECURITY.md](SECURITY.md) | The security model |
| [TESTING.md](TESTING.md) | Running the test suites |
