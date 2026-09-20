# Production audit

**Audited:** 2026-09-20 · **Version at audit:** 1.0.0 · **Branch:** `master` (no commits)

This document records the state of InsightFlow AI as found at the start of the
productionisation pass, before any changes were made. It is deliberately
unflattering: the point is to name what is missing, not to congratulate what is
present.

Every claim below was verified by running the thing, not by reading a README.

---

## 1. Baseline verification

Run against the repository exactly as found, with both servers already up
(backend on `:8000`, frontend on `:3000`, Ollama reachable with
`qwen2.5:3b-instruct`).

| Check | Command | Result |
| --- | --- | --- |
| Backend tests | `pytest -q` | **180 passed** in 130 s |
| Frontend unit tests | `vitest run` | **46 passed** (2 files) |
| Type check | `tsc --noEmit` | **clean** |
| Lint | `npm run lint` | **hangs — never terminates** |
| Lint (direct ESLint) | `eslint . --ext .ts,.tsx` | **7 errors, 3 warnings** |
| Full-stack acceptance | `scripts/acceptance_check.py` | **75/75 passed** |
| Browser E2E | `playwright test --project=chromium` | **9 passed, 1 failed** |

Two headline claims do not hold: lint is not clean and does not even terminate
(B-1, B-2), and the browser suite does not pass (B-3).

---

## 2. Current architecture

```
Browser
   │  same-origin fetch · httpOnly cookie (if_session / if_refresh)
   ▼
Next.js 15 App Router          <- Vercel
   │  /api/auth/*        owns the session cookie, talks to FastAPI
   │  /api/backend/[..]  authenticating reverse proxy, adds Bearer token
   ▼  Authorization: Bearer <access token>
FastAPI (Python 3.11)          <- container host, NOT Vercel
   ├─ analytics/   deterministic engine: ingestion, profiling, schema
   │               inference, metrics, timeseries, segmentation, anomalies,
   │               investigation, planner, executor  (~5,400 lines)
   ├─ ai/          provider abstraction + prompts + structured schemas +
   │               guardrails  (~1,400 lines)
   ├─ jobs/        in-process ThreadPoolExecutor analysis runner
   └─ api/v1/      46 REST routes across 8 routers
   ▼
PostgreSQL (SQLite in dev)  ·  filesystem storage for uploads
```

**Code size (measured):** backend 17,123 lines of Python across 54 modules;
frontend 11,240 lines of TypeScript/TSX across 95 files. 46 backend routes,
25 frontend routes.

**The split that matters.** Numbers are computed in pandas and are the source of
truth. The language model receives an *evidence bundle* — aggregated metrics,
segment labels, period labels, the question — and is asked only to phrase it.
Its output is then re-validated against that bundle before it is shown
(`app/ai/guardrails.py`). With `AI_ENABLED=false` the product is fully
functional; the entire test suite runs that way.

---

## 3. Strengths (verified, not assumed)

1. **Deterministic-first is real, not marketing.** `test_analytics_math.py`
   asserts hand-verified figures (January 1000 → February 1200 = exactly 20%),
   and the AI layer is provably optional.
2. **Guardrails are substantive.** `check_numbers` extracts every numeric token
   from generated prose and matches it against the evidence, with a documented
   rounding tolerance and — importantly — *asymmetric* rescaling, so an evidence
   value of 100 cannot license the text "100,000". `check_causal_language`
   evaluates per sentence, so a hedge in an earlier paragraph does not excuse an
   unqualified causal claim here.
3. **Tenant isolation is enforced in the right layer.** Every workspace-scoped
   resource loads through `_scoped()` in `app/api/deps.py`, filtering on
   `workspace_id`. Cross-tenant access returns 404, not 403, so existence is not
   leaked. `test_authorization.py` probes with *valid ids belonging to another
   tenant*, which is the shape the real bug takes.
4. **Upload validation is adversarial.** Extension, size, and magic bytes are
   checked before pandas sees the content; a `.csv` containing a zip is
   rejected; formula-injection prefixes are neutralised on export.
5. **Error handling never leaks internals.** A catch-all handler converts any
   unhandled exception into a generic message plus a request id, with the trace
   logged server-side only.
6. **Production start-up refuses misconfiguration.** `Settings._validate_production_secrets`
   raises on a placeholder `SECRET_KEY`, a key under 32 characters, a missing
   `DATABASE_URL`, or `AI_PROVIDER=openai` without a key.
7. **Honest marketing copy.** The landing page explicitly declines to invent
   customer logos or testimonials, and states the absence of SOC 2 / ISO 27001 /
   HIPAA / GDPR certification. This is unusually rare and worth preserving.
8. **The session architecture is correct for Vercel.** Tokens live in httpOnly
   cookies owned by the Next.js origin and are attached server-side by the
   proxy, so an XSS bug cannot exfiltrate a token, there is no `SameSite=None`
   for Safari to block, and production needs no CORS at all.

---

## 4. Findings

Severity: **P0** blocks launch · **P1** should be fixed before launch ·
**P2** worth doing · **P3** note only.

### A. Deployment blockers

| # | Severity | Finding |
| --- | --- | --- |
| A-1 | **P0** | **The repository has no commits.** `git log` fails: "your current branch 'master' does not have any commits yet". There is no history, no remote, and nothing pushed. The entire codebase is untracked working-tree state. |
| A-2 | **P0** | **Default branch is `master`, CI expects `main`.** The workflow triggers on `push: branches: [main]`, so as configured CI would never run. |
| A-3 | **P1** | **`frontend-server.log` sits in the repository root.** Ignored by `.gitignore`, but it is process residue that should not be in the working tree. |
| A-4 | **P1** | **No `/ready` endpoint.** `/api/v1/health` exists and is correct (it reports `degraded` rather than raising when the database is unreachable), but liveness and readiness are conflated. A container orchestrator needs to distinguish "restart me" from "do not send me traffic yet". |

### B. Quality-gate blockers

| # | Severity | Finding |
| --- | --- | --- |
| B-1 | **P0** | **`npm run lint` hangs indefinitely.** ESLint 9.39.5 is installed but the config is the legacy `.eslintrc.json` format. `next lint` forces `ESLINT_USE_FLAT_CONFIG=false` and, on this platform, never terminates. CI would hang until the job timeout. |
| B-2 | **P0** | **Lint is not clean.** Running ESLint directly in legacy mode reports **7 errors and 3 warnings**: unused imports in `analysis-progress.tsx` (`Button`), `anomalies-view.tsx` (`DIRECTIONS`), `answer-card.tsx` (`FileText`, `cn`), `overview-dashboard.tsx` (`Badge`), `dataset-workflow.tsx` (`router`), a forbidden `require()` in `tailwind.config.ts`, and three `react-hooks/exhaustive-deps` warnings in `anomalies-view.tsx` and `insights-view.tsx`. |
| B-3 | **P0** | **The browser suite does not pass.** The full-journey test times out after 90 seconds waiting for an investigation to render. The endpoint runs the deterministic investigation *and* a synchronous model call before returning anything, and local CPU inference takes 60-180 seconds — so the page holds a spinner while the evidence it needs has already been computed. The test is the symptom; the product behaviour is the finding. |

### G. Correctness (found by the adversarial pass, not present in the original suite)

These were not visible in the baseline run. All four were found by asserting a
property the existing tests did not state: *every figure the engine writes must
be a figure the engine recorded*, swept across every question and every grain.

| # | Severity | Finding |
| --- | --- | --- |
| G-1 | **P0** | **Weekly resampling returns all zeros.** `resample_metric` groups by `to_period("W-MON").start_time` — week *start* timestamps — then gap-fills with `pd.date_range(freq="W-MON")`, which pandas anchors to week *end*. The two index sets share no members, so `reindex(fill_value=0.0)` replaces **every** weekly figure with zero. Any dataset viewed at weekly grain shows a flat zero revenue line, reported as a genuine finding. Daily (`D`/`D`), monthly (`M`/`MS`), and quarterly (`Q`/`QS`) align by coincidence, which is why nothing caught it: `test_monthly_resampling` and `test_calendar_gaps_are_filled_with_zeros` both test grains where the mapping happens to work. |
| G-2 | **P0** | **Dates are read as fabricated figures.** The guardrail's number regex extracts `2026`, `-03`, and `-14` from `2026-03-14`. The year is exempt; `-3` and `-14` are not, so they are reported as numbers the model invented. Every anomaly, period comparison, and investigation names a date, so in practice the guardrail rejected almost any AI response that said *when* something happened — silently falling back to deterministic prose while logging that the model had fabricated figures it never wrote. The same applies to the engine's own labels (`Week of 24 Aug 2026`). |
| G-3 | **P1** | **Segment shares are quoted but never recorded as evidence.** The answer to "which product performed best?" reads "…is the largest product by revenue, at 21.5% of the total". `share_pct` was carried only inside `Evidence.detail`, so it never reached `evidence_values()`. The reader could not open the most prominent number in the sentence, and a model repeating it was rejected for citing a figure the product had computed itself. |
| G-4 | **P1** | **Contribution percentages have the same defect.** "Nova Air Purifier alone accounts for 61.8% of the change" is the sentence the investigation engine exists to produce, and `contribution_pct` lived only in `detail`. |
| G-5 | **P2** | **Evidence covered only the top six segments.** "Which product performed worst?" is answered from the *last* row of the breakdown, whose figures were therefore never recorded. |

### C. Security

| # | Severity | Finding |
| --- | --- | --- |
| C-1 | **P0** | **Rate limiting is bypassable, and simultaneously broken in production.** `RateLimitMiddleware._client_key` trusts a client-supplied `X-Forwarded-For` header unconditionally. Two consequences: (a) an attacker rotating that header defeats the auth rate limit entirely; (b) behind the Next.js proxy on Vercel the backend sees only Vercel's egress addresses, so the strict auth budget (10 requests / 5 minutes) becomes a *global* limit shared by every user. The same unconditional trust exists in `client_info()`, which writes the spoofable value into the audit log. |
| C-2 | **P1** | **No Content-Security-Policy on the frontend.** `next.config.ts` sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`, but no CSP. The app renders user-supplied strings (dataset names, column names, segment labels) and is precisely the kind of thing a CSP is for. |
| C-3 | **P1** | **No HSTS from the frontend.** The backend sets `Strict-Transport-Security` in production; the Next.js layer — the origin a browser actually visits — does not. |
| C-4 | **P2** | The rate limiter's success refund (`remaining.pop()`) removes the deque's last entry, which under concurrency may not be this request's entry. Harmless in practice at this scale, but it is not the intended semantics. |
| C-5 | **P2** | No automated secret scan exists in the repository or CI. `backend/.env` is present on disk and correctly ignored, but nothing enforces that. |

### D. Product / UX

| # | Severity | Finding |
| --- | --- | --- |
| D-1 | **P0** | **The landing page's "View demo" button is dead.** It links to `/login?demo=1`, and nothing anywhere reads a `demo` query parameter — verified by grep across the whole frontend. A visitor who clicks the product's primary exploratory CTA lands on a login form with no explanation. The requirement that a visitor can explore without uploading a CSV is **not met**. |
| D-2 | **P1** | **The footer "Source" link points at `https://github.com`.** A bare placeholder. |
| D-3 | **P1** | **The README screenshot section is a table of file paths that do not exist.** `docs/screenshots/` contains only a README describing what to capture. The README ships an explicit "Replace these placeholders" HTML comment. |
| D-4 | **P1** | **Landing page is missing four of the required sections:** an explicit *Problem* statement, *Use cases*, an *FAQ*, and a footer substantial enough to carry real links. "Built for" is a five-icon row, not a use-case section. |
| D-5 | **P2** | **No `sitemap.xml`.** `middleware.ts` excludes `sitemap.xml` from its matcher and `robots.txt` does not reference one, because no route generates it. |
| D-6 | **P2** | **`robots.txt` is static.** It cannot reference the deployment's real host, so it will be wrong on every deployment that is not the one it was written for. |
| D-7 | **P2** | **No social preview image.** `openGraph` and `twitter` metadata declare `summary_large_image` but no image is ever produced, so every share renders as a bare text card. |
| D-8 | **P2** | **No `favicon.ico` or Apple touch icon.** Only `app/icon.svg`; `metadata.icons.apple` points at the same SVG, which iOS does not accept. |

### E. Documentation

| # | Severity | Finding |
| --- | --- | --- |
| E-1 | **P1** | Only `ARCHITECTURE.md` and `DEPLOYMENT.md` exist. Missing: `PRODUCTION_AUDIT.md` (this file), `SECURITY.md`, `AI_GUARDRAILS.md`, `TESTING.md`, `DEVELOPMENT.md`, `ENVIRONMENT.md`, `DEMO.md`, `FINAL_LAUNCH_REPORT.md`. |
| E-2 | **P2** | `DEPLOYMENT.md` is genuinely good (559 lines, exact commands, a real troubleshooting section) but does not state plainly, in one place, *what runs on Vercel, what does not, and why*. That distinction is the single most confusing thing about this architecture for a newcomer. |
| E-3 | **P1** | **`AUTH_SECRET` is documented everywhere and read by nothing.** It appears in `frontend/.env.example`, the README variable table, `DEPLOYMENT.md` four times (including a checklist item asserting it must differ from `SECRET_KEY`), `ARCHITECTURE.md`, and twice in the CI workflow — but a grep across the entire frontend finds no code that reads it. The deployment checklist therefore instructs operators to generate and rotate a secret that has no effect, which is worse than no documentation: it spends attention on a control that does not exist. |

### F. Technical debt (accepted, documented, not fixed)

| # | Finding |
| --- | --- |
| F-1 | **Rate limiting is per-process.** Behind more than one backend replica the budget multiplies. Redis would fix it and is not yet earned at this scale. Documented rather than solved. |
| F-2 | **The job runner is in-process.** A `ThreadPoolExecutor` plus the `analyses` table as the job record. This is a deliberate and, on review, *correct* choice for single-replica deployment: progress is committed after every stage so it is durable and pollable, and `reconcile_stale_jobs()` fails orphaned rows at start-up. The constraint it imposes — `--workers 1`, scale by replica — is already documented and enforced in the Dockerfile. **No change recommended.** Introducing Celery and Redis here would add two failure modes to fix zero observed problems. |
| F-3 | **No email provider.** Password reset issues a valid token and logs it in development; there is no transactional email. The flow is complete except for delivery. |
| F-4 | **Team workspaces are schema-only.** `WorkspaceMember` and `WorkspaceRole` exist and are enforced; there is no invitation flow. Already listed in the README roadmap. |
| F-5 | **`.xls` (OLE2) is rejected rather than parsed.** A deliberate trade: `xlrd` for legacy `.xls` is a meaningful attack surface for a format almost nobody exports any more. The rejection message tells the user to re-save as `.xlsx`. |

---

## 5. What was checked and found already correct

Recorded so that later passes do not "fix" things that are not broken.

- **Analytics correctness.** `test_analytics_math.py` covers zero denominators,
  negative values, sparse and duplicate dates, incomplete periods, and outliers.
  Known-answer fixtures, not snapshots.
- **Ingestion hardening.** Encoding detection via `charset-normalizer`, BOM
  handling, delimiter sniffing, title-row skipping, duplicate-header recovery,
  a 19-entry NA vocabulary, currency/accounting number parsing, magic-byte
  validation, path-traversal defeat on the client-supplied filename.
- **Schema inference with user correction.** Roles are inferred from name
  patterns *and* value evidence, surfaced with confidence, and editable before
  anything is analysed (`/datasets/{id}/fields` → `/datasets/{id}/confirm`).
- **Anomaly detection method selection.** Rolling z-score, IQR, and Isolation
  Forest, each applied where it fits. One business event yields one anomaly with
  corroborating metrics attached, rather than one anomaly per metric.
- **Metric availability honesty.** A metric absent from the data produces a
  stated reason, never a zero.
- **Password handling.** bcrypt cost 12, explicit length validation rather than
  silent truncation at bcrypt's 72-byte limit, `token_version` bumped on change
  to retire every existing session, dummy verify on unknown email to avoid a
  timing oracle.
- **Password reset does not enumerate accounts.** Always reports success.
- **Cookie `Secure` flag derived from the actual request protocol**
  (`x-forwarded-proto`, then host), not from `NODE_ENV` — the subtle bug that
  breaks self-hosted HTTP deployments.
- **Error responses are uniform and human.** `{ error: { code, message, hint,
  request_id } }` everywhere, written for a business user.
- **Request correlation.** `X-Request-Id` accepted or generated, attached to
  every log line and every error payload.
- **Dockerfile is production-grade.** Multi-stage, non-root uid 1001,
  healthcheck, migrations on start-up, `--workers 1` with the reason in a
  comment.
- **CI covers the right things**, including a migration check that runs
  `alembic upgrade head` then `downgrade base` against a genuinely empty
  database.

---

## 6. Recommended plan

In dependency order.

1. **Fix the quality gates** (B-1, B-2, B-3) — nothing else can be trusted until
   `npm run lint` terminates and passes.
2. **Fix the rate-limit trust boundary** (C-1). This is the only P0 security
   finding and it is also a production *correctness* bug.
3. **Add the remaining security headers** (C-2, C-3).
4. **Build the public demo** (D-1) — a one-click path from the landing page into
   a seeded, fully analysed workspace.
5. **Complete the landing page** (D-4) and fix the dead link (D-2).
6. **SEO and assets** (D-5 … D-8): sitemap, dynamic robots, OG image, favicons.
7. **Add `/ready`** (A-4).
8. **Capture real screenshots** from the running application (D-3).
9. **Write the missing documentation** (E-1, E-2).
10. **Audit dependencies**, scan for secrets, and verify a clean-room setup.
11. **Create a meaningful commit history** and push (A-1, A-2).
12. **Re-run every gate** and write the final launch report.

Explicitly **not** doing: replacing the job runner, adding Redis, adding a
message broker, adding billing, adding SSO, or adding connectors. See F-2.

---

## 7. Resolution

Every finding above is tracked to completion in
[FINAL_LAUNCH_REPORT.md](FINAL_LAUNCH_REPORT.md), which records the state at the
end of the pass rather than the beginning.
