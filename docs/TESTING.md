# Testing

## Running everything

```bash
# Backend — 266 tests, ~3 minutes
cd backend && pytest

# Frontend — 46 tests, typecheck, lint
cd frontend && npm run check

# Full-stack acceptance — 75 checks, needs both servers running
cd backend && python scripts/acceptance_check.py

# Browser end to end — 10 tests, needs both servers running
cd frontend && npx playwright test --project=chromium
```

CI runs all four on every push and pull request, plus a migration check, a
model/migration drift check, and a secret scan.

---

## What the suite is weighted towards

The bugs worth catching in this product are the ones that are **silently
wrong** rather than loudly broken. A crash gets reported. A revenue figure that
is 8% too low does not, and neither does one business seeing another's data.

So the suite spends most of its effort on four things:

1. **Analytical correctness** — known datasets with hand-verified answers
2. **Tenant isolation** — probed with real cross-tenant ids, not random ones
3. **AI trustworthiness** — fabrication, causal overreach, and evidence
   completeness
4. **Hostile input** — files that lie about what they are

---

## Backend

`cd backend && pytest`

| File | Tests | What it holds |
| --- | --- | --- |
| `test_ai_adversarial.py` | 55 | Attacks on the AI guardrails |
| `test_analytics_math.py` | 45 | Hand-verified arithmetic |
| `test_ai_safety.py` | 41 | Guardrail mechanisms and graceful degradation |
| `test_datasets.py` | 33 | Ingestion, hostile files, schema inference |
| `test_e2e_flow.py` | 26 | The full journey through the API |
| `test_auth.py` | 25 | Passwords, tokens, session lifecycle |
| `test_authorization.py` | 17 | Multi-tenancy |
| `test_demo.py` | 12 | Demo isolation, expiry, file clean-up |
| `test_client_identity.py` | 12 | The rate-limit trust boundary |
| **Total** | **266** | |

**The whole suite runs with `AI_ENABLED=false`**, which means it also proves
continuously that the product is fully functional without a model.

### Analytical correctness

`test_analytics_math.py` uses fixtures with answers worked out by hand, not
snapshots of whatever the code happened to produce.

```
January revenue 1000 → February revenue 1200 → growth must be exactly 20%
```

Covered: zero denominators, negative values, missing and sparse periods,
duplicate dates, incomplete months and weeks, outliers, very large and very
small values, and — since it caught a real bug — that **every grain preserves
the total**. Resampling redistributes a sum; it must never change it.

That last one exists because weekly resampling silently returned all zeros:
buckets were keyed by period *start* while the gap-filling reindex was generated
at week *end*, so the two index sets had no members in common and every real
figure was replaced by the fill value. Daily, monthly and quarterly aligned by
coincidence — which is exactly why a test covering one grain would not have
found it.

### Tenant isolation

`test_authorization.py` probes every workspace-scoped resource with a **valid id
belonging to a different tenant**. Testing with a random UUID passes trivially
against a broken implementation; a real id from another workspace is the shape
the bug actually takes.

Cross-tenant access must return **404, not 403** — a 403 confirms the resource
exists.

### AI safety and adversarial testing

`test_ai_safety.py` proves the mechanisms work. `test_ai_adversarial.py` attacks
them:

- **Unanswerable questions** — a period outside the data ("revenue in 2018" on a
  2025 dataset), a metric with no supporting column ("how many customers" with
  no customer identifier, which must say so and never report zero), incoherent
  and empty questions
- **Fabricated figures** — invented totals, counts, percentages, dates, and
  column names; figures nested inside lists; upward rescaling as a fabrication
  vector
- **Causal overreach** — eight unhedged causal phrasings rejected, five hedged
  ones accepted, a hedge in a neighbouring sentence not accepted as an excuse,
  and a leading question ("prove the Nova Air Purifier caused the decline")
- **Malformed output** — seven shapes of broken model response, each degrading
  to the deterministic answer
- **A control** — a well-formed, fully supported response that must be
  **accepted**. Without it, every other test would pass on an implementation
  that discarded all model output

#### The evidence-completeness invariant

The strongest assertion in the suite: **every figure the engine writes must be a
figure the engine recorded**, swept across 27 questions and all four grains.

This is not only about the reader being able to open a number. The evidence
bundle is also the list of figures the *model* is allowed to mention, so a
number in the prose but not in the bundle means a correct AI answer quoting it
gets discarded as a fabrication — an incomplete bundle silently degrades every
answer while reporting the opposite of what happened.

It found three real defects: segment shares, contribution percentages, and the
smallest-segment row were all quoted in prose while carried only inside
`Evidence.detail`, where `evidence_values()` never looked.

### Ingestion

`test_datasets.py` covers what real business exports actually look like: title
rows above the headers, duplicate column names, empty columns, currency symbols
and accounting negatives, percentages, mixed date formats, BOMs, non-UTF-8
encodings, unusual delimiters, NaN and infinity, very long strings, Unicode,
column names with spaces and punctuation.

And what hostile uploads look like: a `.csv` containing a zip archive, an
extension that lies about the content, an empty file, a header-only file, a file
over the size limit, a filename containing path traversal.

Every rejection is asserted to carry a message the uploader can act on.

---

## Frontend

`cd frontend && npm run check` — typecheck, lint, unit tests.

| File | Tests | Covers |
| --- | --- | --- |
| `tests/format.test.ts` | 32 | Currency, percentage, compact-number, date, and duration formatting |
| `tests/components.test.tsx` | 14 | KPI cards, evidence panels, empty and error states, accessibility attributes |

Formatting gets disproportionate attention because it is where a correct
calculation becomes a wrong statement: a percentage rounded the wrong way, a
negative rendered as a positive, a currency shown without its code.

---

## Full-stack acceptance

```bash
# With both servers running
cd backend && python scripts/acceptance_check.py
python scripts/acceptance_check.py --frontend https://your-app.vercel.app
```

75 checks driving the complete journey **through the Next.js layer with a real
session cookie**, not against the API directly — so it exercises the proxy, the
cookie handling, the middleware redirects, and server-side rendering as well as
the API.

1. Landing page renders and makes no unverified compliance claims
2. Signup, then login
3. Onboarding and workspace creation
4. Upload NovaMart, preview it, review detected fields, confirm the schema
5. Run the analysis and poll to completion
6. Dashboard: KPIs, revenue trend, product performance
7. Open an insight, open its evidence
8. Open an anomaly, investigate it, read the evidence
9. Ask a business question, validate the answer's shape and its plan
10. Generate a report, check every section is materialised
11. Navigate every application route
12. Log out, confirm the session is cleared and protected routes redirect
13. Log in again, confirm the data is still there
14. **Tenant isolation** — a second account cannot read the first's workspace or
    dataset
15. **Invalid input** — unsupported file type, empty file, header-only file,
    binary content, each with a readable rejection

It exits non-zero on any failure, so it can gate a deploy.

---

## Browser end to end

```bash
cd frontend && npx playwright test --project=chromium
```

Ten tests, one worker (they create accounts against a shared backend, and the
auth rate limiter is per client). Both servers must already be running —
Playwright should not be managing a Python environment.

Covers the landing page, the absence of fabricated compliance claims, that the
first tab stop is a skip link, wrong-credential handling, redirect-with-
destination for signed-out users, and the full signup → analysis → insights →
investigation → question → report journey.

Timeouts are generous where a model is in the loop, because local CPU inference
genuinely takes 60–180 seconds and a tighter bound would make the suite flaky
rather than strict.

---

## Migrations

CI does two things a normal test run does not.

**Migrations apply to a genuinely empty database**, then roll all the way back:

```bash
cd backend
DATABASE_URL=sqlite:///./check.db alembic upgrade head
DATABASE_URL=sqlite:///./check.db alembic downgrade base
```

**The models and the migrations agree.** Autogenerating against a fully migrated
schema must produce an empty migration:

```bash
DATABASE_URL=sqlite:///./drift.db alembic upgrade head
DATABASE_URL=sqlite:///./drift.db alembic revision --autogenerate -m drift-check
# the generated file must contain no op.* calls
```

A model changed without a migration is invisible in development, where tables
are created from the models directly, and fails only on the first deploy to a
real database.

---

## Secret scanning

CI runs `gitleaks` over the full history on every push and pull request.

The only credential-shaped strings in the repository are the throwaway passwords
the acceptance script and browser tests use to create accounts during a run.
They are not credentials to anything.

---

## Writing a test here

**Assert the answer, not the output.** `assert growth == 20.0` with the figure
worked out by hand, not `assert growth == snapshot`.

**Use the shape the real bug takes.** For tenancy, a valid id from another
tenant. For rate limiting, a rotating header. For the AI, a well-formed response
with one wrong number.

**Include the control.** If every test in a class asserts something is
*rejected*, one of them must assert that a correct input is *accepted* —
otherwise they all pass on an implementation that rejects everything.

**Say why in the docstring.** Several tests here exist because of a specific
bug; the docstring records what it was, so a future reader knows what breaks if
the test is loosened.

---

## Current counts

| Suite | Count |
| --- | --- |
| Backend | 266 passed |
| Frontend | 46 passed |
| Playwright | 10 passed |
| Acceptance | 75/75 |
