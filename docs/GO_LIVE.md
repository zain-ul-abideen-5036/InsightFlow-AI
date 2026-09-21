# Go live — deploying InsightFlow AI, step by step

This is the click-by-click version: every account you need, every value you
copy, in the order you need them. Follow it top to bottom and you will have a
working public URL.

It takes about **30 minutes**, most of it waiting for builds, and costs
**nothing**. No credit card is required at any point.

If you want the reasoning behind these choices rather than the steps —
why the backend is not on Vercel, why the direct database URL, why the timeout
numbers are what they are — that is [DEPLOYMENT.md](DEPLOYMENT.md). This file
assumes you just want it live.

---

## What you end up with

```
Browser  ──►  Vercel (Next.js)  ──►  Render (FastAPI)  ──►  Neon (PostgreSQL)
              your public URL        your API             your data
                                          │
                                          └──►  Groq (AI wording) — optional
```

Only the Vercel URL is public. The browser never talks to Render or Neon
directly, which is why there is no API key in the browser and no CORS to fight.

---

## The four accounts

| # | Service | What it holds | Cost | Card needed | Sign up |
| --- | --- | --- | --- | --- | --- |
| 1 | **Neon** | PostgreSQL database | Free | No | [neon.tech](https://neon.tech) |
| 2 | **Render** | The FastAPI backend | Free | No | [render.com](https://render.com) |
| 3 | **Vercel** | The Next.js frontend | Free (Hobby) | No | [vercel.com](https://vercel.com) |
| 4 | **Groq** | AI wording — **optional** | Free | No | [console.groq.com](https://console.groq.com) |

Sign up for all of them with **"Continue with GitHub"**. It saves you connecting
the repository later, and Render and Vercel both need that connection anyway.

**Step 4 is genuinely optional.** Every number InsightFlow shows is computed in
pandas, not by a model. Without a Groq key you lose the conversational wording
and keep the entire product. You can add it later without redeploying anything.

---

## Before you start

- [ ] Your code is pushed to GitHub (`git status` shows nothing to commit).
- [ ] You can run `python` in a terminal — you need it for two commands.
- [ ] Open a scratch text file to paste values into as you go. You will collect
      five values, and two of them are shown only once.

> **Never put these values in the repository.** They go in the hosting
> dashboards only. The `.env` files are already in `.gitignore`, and CI has a
> secret-scanning job that will fail the build if a key is ever committed.

---

## Step 1 — Database (Neon)

1. Go to [neon.tech](https://neon.tech) → **Sign up** → continue with GitHub.
2. Create a project. Name it `insightflow`. Any region is fine — pick the one
   closest to you.
3. Neon shows you a **connection string**. You need the **direct** one.

   On the connection dialog there is a toggle or dropdown for
   **Connection pooling**. Turn it **off**, or pick the "Direct connection"
   option. Then check the string you copy:

   ```
   ✅ postgresql://user:pass@ep-cool-mode-123456.us-east-2.aws.neon.tech/neondb
   ❌ postgresql://user:pass@ep-cool-mode-123456-pooler.us-east-2.aws.neon.tech/neondb
                                                  ^^^^^^^ not this one
   ```

   If the host has `-pooler` in it, you have the wrong one. The backend is a
   single long-lived process that manages its own connection pool, and it runs
   database migrations as it boots — both want the direct endpoint.

4. **Paste it into your scratch file** as `DATABASE_URL`.

You do not need to create any tables. The backend runs its migrations
automatically the first time it starts.

---

## Step 2 — Generate one secret

Run this in a terminal:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Paste the output into your scratch file as `PROXY_SHARED_SECRET`.

You will enter this **same value in two places** — Render and Vercel. It has to
match exactly, character for character. It is what lets the backend trust the
visitor's IP address that Vercel forwards; without it every visitor on your site
shares one rate-limit budget and one busy user locks out everyone else.

> There is a second secret, `SECRET_KEY`, which signs login sessions. You do
> **not** need to generate it — Render creates it for you and never shows it to
> anyone, which is better than you having a copy.

---

## Step 3 — AI key (optional, free — or skip to Step 4)

1. Go to [console.groq.com/keys](https://console.groq.com/keys) → sign in with
   GitHub → **Create API Key**.
2. Copy it immediately — it starts with `gsk_` and is shown **once**.
3. Paste it into your scratch file as `OPENAI_API_KEY`.

Yes, the variable is called `OPENAI_API_KEY` and you are pasting a Groq key into
it. That is correct. The backend speaks the OpenAI *protocol*, which Groq (and
Together, OpenRouter, vLLM, LM Studio…) also speak. The variable names the
protocol, not the company. Nothing is sent to OpenAI.

**The free tier, precisely:** 30 requests per minute, 1,000 per day, 8,000
tokens per minute. No credit card, no trial clock. If you exceed it, users see
a plainly-worded "try again shortly" and every number on the page is still
there — the analysis never goes near the model.

---

## Step 4 — Backend (Render)

1. Go to [render.com](https://render.com) → sign in with GitHub.
2. **New +** → **Blueprint**.
3. Select your `InsightFlow-AI` repository. Render finds `render.yaml` in the
   repository root and reads your whole backend configuration from it — you do
   not configure the service by hand.
4. Render then asks you for the values it is not allowed to guess:

   | Field | What to paste |
   | --- | --- |
   | `DATABASE_URL` | the Neon string from Step 1 |
   | `PROXY_SHARED_SECRET` | the secret from Step 2 |
   | `CORS_ORIGINS` | `https://example.com` — a placeholder, fixed in Step 6 |
   | `OPENAI_API_KEY` | the Groq key from Step 3, or leave **blank** if skipping |

   `CORS_ORIGINS` is a placeholder because Vercel has not given you a URL yet.
   That is the one circular dependency in this process and Step 6 closes it.

5. Click **Apply** and wait. The first build takes **5–10 minutes** — it is
   compiling pandas, numpy and scipy into a Docker image. Later deploys are
   much faster.

6. When it goes green, copy your API URL from the top of the page. It looks
   like `https://insightflow-api.onrender.com`. **Paste it into your scratch
   file** as `BACKEND_API_URL`.

7. Check it is really working:

   ```bash
   curl https://insightflow-api.onrender.com/api/v1/health
   ```

   You want to see `"status": "ok"` and `"database": true`.

   `"database": true` is the important one — it means the container reached
   Neon and the migrations ran. If `ai` reports unavailable, that is expected
   and fine; you turn AI on in Step 8.

> **On Windows**, use `curl.exe` rather than `curl` in PowerShell. Plain `curl`
> there is an alias for a different command and will confuse you. Or just paste
> the URL into your browser.

---

## Step 5 — Frontend (Vercel)

1. Go to [vercel.com](https://vercel.com) → sign in with GitHub.
2. **Add New…** → **Project** → import your `InsightFlow-AI` repository.
3. **This is the step people get wrong:** set **Root Directory** to `frontend`.

   Click **Edit** next to Root Directory and choose the `frontend` folder. The
   repository holds both halves, and without this Vercel tries to build the
   whole thing and fails. Leave the framework preset as **Next.js** — it is
   detected correctly.

4. Expand **Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `BACKEND_API_URL` | your Render URL from Step 4 — no trailing slash |
   | `PROXY_SHARED_SECRET` | the same secret from Step 2, exactly |
   | `NEXT_PUBLIC_SITE_URL` | leave for now, or guess your Vercel URL |

5. **Deploy.** This takes about 2 minutes.

6. Vercel gives you your public URL, something like
   `https://insightflow-ai.vercel.app`. **Paste it into your scratch file.**

7. Now set `NEXT_PUBLIC_SITE_URL` properly: **Settings** → **Environment
   Variables** → set it to that exact URL → then **Deployments** → the latest
   one → **⋯** → **Redeploy**.

   This variable only affects link previews and social cards, so the site works
   without it. It is worth two minutes for a portfolio project.

---

## Step 6 — Close the loop

Back in Render: **Environment** → edit `CORS_ORIGINS` → replace the placeholder
with your real Vercel URL:

```
https://insightflow-ai.vercel.app
```

No trailing slash. Save; the service restarts itself in under a minute.

---

## Step 7 — Prove it actually works

**The quick check.** Open your Vercel URL, click **See how it works**, and watch
an analysis run. If you see charts and insights, you are live.

**The thorough check.** This runs 75 assertions against your real deployment —
signup, upload, analysis, insights, anomalies, investigation, and that one
tenant cannot see another's data:

```bash
cd backend
python scripts/acceptance_check.py --frontend https://insightflow-ai.vercel.app
```

`75 passed, 0 failed` means it is genuinely working, tested rather than assumed.

> The very first request after the backend has been idle takes **up to a
> minute** — see the next section. Let it finish rather than assuming it hung.

---

## Step 8 — Turn AI on (optional, any time later)

Skip this if you skipped Step 3. Otherwise, in Render → **Environment**:

| Variable | Change to |
| --- | --- |
| `AI_ENABLED` | `true` |
| `AI_PROVIDER` | `openai` |
| `OPENAI_API_KEY` | your `gsk_…` key, if you did not paste it in Step 4 |

Save. The service restarts. `OPENAI_BASE_URL` and `OPENAI_MODEL` are already
set correctly for Groq in `render.yaml` — leave them alone.

Confirm it took — `/health` reports the model publicly, no login needed:

```bash
curl https://insightflow-api.onrender.com/api/v1/health
```

Look at the `ai` block in the response. You want `"enabled": true` and
`"available": true`. If `available` is false, `detail` says why in plain words.

Turning this off again is one variable. Nothing else in the product depends on
it.

---

## What the free tier will actually do

Not a disclaimer — these are things you will notice, and they are normal.

**The backend sleeps after 15 minutes of no traffic.** The next request takes
about 50 seconds while the container wakes. Nothing is lost, it just waits. If
you are showing the app to someone, load it a minute beforehand.

**Neon suspends after 5 minutes of no queries** and wakes in a second or two.
This one you will rarely notice, and it cannot be disabled on the free plan.

**Uploaded files do not survive a restart.** Render does not offer a persistent
disk on free instances at any price. Everything computed from your file —
analyses, metrics, insights, anomalies — lives in Neon and survives fine. The
original file does not, so after a restart **Ask** and a fresh **Investigate**
will tell the user to upload the dataset again. That is a real limitation,
reported honestly in the UI rather than failing. A $7/month Render instance with
a $0.25/GB disk removes it; `render.yaml` has the `disk:` block ready to
uncomment.

**Neon's free plan gives 0.5 GB of storage and 100 compute-hours per project
per month.** For a portfolio project this is not a constraint you will reach.

**Vercel's Hobby plan is for non-commercial use only.** That is Vercel's rule,
not mine, and it matters for you specifically: a portfolio project and a demo
are fine, but the day InsightFlow takes money you need the Pro plan at $20/mo.
Worth knowing now rather than in a policy email.

---

## If something goes wrong

| What you see | What it means | Fix |
| --- | --- | --- |
| Render build fails on `pip install` | Ran out of memory compiling | Retry the deploy; it usually passes on the second run |
| `"database": false` on `/health` | Backend cannot reach Neon | Check `DATABASE_URL` — most often the `-pooler` string, or a `<password>` placeholder never replaced |
| Backend won't boot, logs say `SECRET_KEY must be set` | Blueprint did not generate it | Render → Environment → add `SECRET_KEY`, click **Generate** |
| Backend won't boot, logs say `DATABASE_URL must point at a PostgreSQL instance` | It is empty or not a Postgres URL | Paste the Neon string again |
| Backend won't boot, logs say `OPENAI_API_KEY is required` | `AI_PROVIDER=openai` with no key | Either paste the key, or set `AI_PROVIDER=none` and `AI_ENABLED=false` |
| Site loads but login says something went wrong | `BACKEND_API_URL` wrong, or backend asleep | Retry once — cold start. Then check the URL has no trailing slash |
| Everything works but rate limits hit fast | `PROXY_SHARED_SECRET` does not match | Compare both sides character for character; re-paste both |
| AI says unavailable with a key set | Model retired, or limit hit | `curl …/api/v1/health` and read the `ai` block. On "model not found", update `OPENAI_MODEL` from [Groq's list](https://console.groq.com/docs/rate-limits) |
| First request after a quiet hour takes ~50s | The instance was asleep | Normal. Not a bug |

Render's **Logs** tab is the first place to look for anything backend-side. The
app logs one JSON object per event, and the boot errors above say exactly what
is wrong in plain English.

---

## Every value, in one place

**Render** (backend) — `render.yaml` sets everything else automatically:

| Variable | Value | Where it came from |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://…neon.tech/neondb` | Step 1 — the direct, non-pooler string |
| `PROXY_SHARED_SECRET` | random string | Step 2 — must match Vercel |
| `CORS_ORIGINS` | `https://your-app.vercel.app` | Step 6 |
| `OPENAI_API_KEY` | `gsk_…` | Step 3 — optional |
| `AI_ENABLED` / `AI_PROVIDER` | `true` / `openai` | Step 8 — optional |
| `SECRET_KEY` | *generated by Render* | never type this yourself |

**Vercel** (frontend):

| Variable | Value | Where it came from |
| --- | --- | --- |
| `BACKEND_API_URL` | `https://your-api.onrender.com` | Step 4 |
| `PROXY_SHARED_SECRET` | random string | Step 2 — must match Render |
| `NEXT_PUBLIC_SITE_URL` | `https://your-app.vercel.app` | Step 5 |

Only `NEXT_PUBLIC_*` variables reach the browser, which is why no key is ever
named that way. If you are ever tempted to prefix a secret with `NEXT_PUBLIC_`
to make an error go away, that is the error telling you something true.

---

## Afterwards

Pushing to `main` redeploys both halves automatically. Nothing else to do.

To point a custom domain at it: Vercel → **Settings** → **Domains**, then update
`NEXT_PUBLIC_SITE_URL` on Vercel and `CORS_ORIGINS` on Render to the new origin.

For anything deeper — the architecture, the security model, scaling past the
free tier — see [DEPLOYMENT.md](DEPLOYMENT.md), [ARCHITECTURE.md](ARCHITECTURE.md)
and [SECURITY.md](SECURITY.md).
