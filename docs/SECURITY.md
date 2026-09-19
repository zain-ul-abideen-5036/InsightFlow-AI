# Security

What is implemented, how it is verified, and — as importantly — what is not
claimed.

**No compliance certification is held.** InsightFlow AI has no SOC 2, ISO 27001,
HIPAA, or GDPR certification and makes no such claim anywhere in the product or
this repository. What follows is a description of controls that exist in the
code, each of which you can read and test.

---

## 1. Authentication

| Control | Implementation |
| --- | --- |
| Password hashing | bcrypt, cost 12 (`app/core/security.py`) |
| bcrypt's 72-byte limit | Validated explicitly, never silently truncated — otherwise two different long passwords would be interchangeable |
| Password policy | Length and composition checks, with every failure reported at once rather than one at a time |
| Access tokens | JWT, HS256, 30-minute expiry |
| Refresh tokens | JWT, separate token type, 30-day expiry |
| Session invalidation | A password change increments `User.token_version`, which every previously issued token fails against |
| Account enumeration | Login returns one message for unknown address and wrong password, and spends comparable CPU on an unknown address so response timing does not distinguish them |
| Password reset | Always reports success, whether or not the address is registered |

**No email provider is configured.** Password reset issues a valid token and, in
development only, logs it so the flow is testable end to end. In production the
token is issued and nothing delivers it. This is stated rather than hidden.

---

## 2. Sessions and token handling

The browser never holds a token.

```
Browser ──cookie──▶ Next.js ──Bearer──▶ FastAPI
        httpOnly            attached
        first-party         server-side
```

- Tokens live in `httpOnly` cookies owned by the Next.js origin. JavaScript
  cannot read them, so an XSS bug cannot exfiltrate a session.
- The Next.js proxy attaches the bearer token server-side. The token never
  enters a response body.
- Because the cookie is first-party to the origin the user actually visits, it
  needs no `SameSite=None` — which Safari's tracking prevention blocks — and
  production needs no CORS at all.
- `SameSite=Lax` on every session cookie.
- The `Secure` flag is derived from the protocol the request **actually arrived
  on** (`x-forwarded-proto`, then the host), not from `NODE_ENV`. Keying it off
  the build mode looks equivalent and is not: a production build served over
  plain HTTP would set `Secure` cookies that no compliant client ever returns,
  so every request appears unauthenticated with nothing anywhere to explain why.
  `COOKIE_SECURE` overrides for proxies whose forwarded headers do not describe
  the real protocol.

**There is deliberately no frontend signing key.** The cookie carries a JWT the
backend already signed and verifies on every request. A second signature over a
signature would detect no tampering the backend does not already reject, and
would be one more secret to rotate.

---

## 3. Authorization and tenant isolation

This is the control most worth scrutinising, because tenancy bugs are silent:
nothing fails, nothing logs an error, one business simply sees another's
revenue.

Every workspace-scoped resource loads through one helper
(`app/api/deps.py::_scoped`), which filters on `workspace_id` in the query
itself. A resource id belonging to another tenant does not resolve, regardless
of how the request reached the application.

```python
instance = db.scalar(
    select(model).where(model.id == resource_id, model.workspace_id == workspace.id)
)
if instance is None:
    raise NotFoundError(...)
```

**Cross-tenant access returns 404, not 403.** A 403 would confirm that the
resource exists, which is itself a leak across tenants.

### How it is tested

`tests/test_authorization.py` probes every workspace-scoped resource with a
*valid id belonging to a different tenant* — datasets, analyses, insights,
anomalies, reports, chat sessions, notifications. Testing with a random UUID
would pass trivially against a broken implementation; testing with a real id
from another workspace is the exact shape the bug takes.

The full-stack acceptance script repeats the check end to end through the
Next.js layer with a real session cookie.

---

## 4. Identifying the caller

Rate limiting and audit logging both need to know who is calling, and that
answer must not be one the caller can choose.

`app/core/client.py` consults three sources, in descending order of
trustworthiness:

1. **`X-Real-Client-IP`**, but only when the request also carries the shared
   secret the Next.js proxy is configured with (`PROXY_SHARED_SECRET`, compared
   with `hmac.compare_digest`). The proxy is the only component that both knows
   the browser's address and can prove it is the proxy.
2. **`X-Forwarded-For`, counted from the right**, when `TRUSTED_PROXY_COUNT`
   declares how many reverse proxies sit in front. The right-hand end of that
   header is written by infrastructure; the left-hand end is written by the
   caller.
3. **The socket peer address**, which nobody can forge.

The shipped default — no shared secret, no declared proxies — uses only (3).
Believing a header takes an explicit deployment decision.

### Why this matters twice

Reading the **left-most** `X-Forwarded-For` entry is the obvious implementation
and is wrong in two directions at once:

- **It is bypassable.** An attacker rotating that header gets a fresh
  rate-limit bucket on every request, so the authentication budget protects
  nothing.
- **It is broken in production anyway.** Behind the Next.js proxy the backend
  sees only the frontend's egress addresses, so the strict auth budget
  (10 requests / 5 minutes) becomes one budget shared by every user of the
  product.

Setting `PROXY_SHARED_SECRET` to the same value on both halves fixes both.
`tests/test_client_identity.py` pins the behaviour, including an end-to-end
check that rotating `X-Forwarded-For` still exhausts the login budget.

---

## 5. Rate limiting

`app/core/middleware.py::RateLimitMiddleware` — fixed window, in process.

| Scope | Default |
| --- | --- |
| General API | 300 requests / 60 s per client |
| Authentication endpoints | 10 requests / 300 s per client |

Authentication covers login, signup, password reset, reset confirmation, and the
public demo. Health and readiness probes are exempt, because taking a healthy
instance out of rotation for being checked too often is the opposite of useful.

**Successful sign-ins are refunded.** The strict budget exists to stop
credential guessing, which by definition produces failures. Charging successes
too would lock out exactly the wrong people: a shared office IP, a household
behind NAT, or anyone who legitimately signs in on several devices would be
blocked after ten *correct* sign-ins. Failures still accumulate normally.

**Known limitation:** the counter is per process. Behind more than one backend
replica the effective budget multiplies by the replica count. Redis would fix
it; at this product's scale the dependency is not yet earned, so the limitation
is documented rather than papered over.

---

## 6. File upload

Uploads arrive from the public internet, so `app/analytics/ingestion.py` treats
every file as hostile until proven otherwise.

| Check | Detail |
| --- | --- |
| Extension | Allowlist: `.csv`, `.tsv`, `.xlsx`, `.xls` |
| Size | `MAX_UPLOAD_SIZE_MB`, default 50, checked before anything is written |
| Magic bytes | XLSX must begin `PK\x03\x04`. A `.csv` containing a zip archive is rejected |
| Legacy `.xls` | Rejected rather than parsed — `xlrd` on OLE2 is meaningful attack surface for a format almost nobody exports. The message tells the user to re-save as `.xlsx` |
| Path traversal | The client-supplied filename is reduced to its basename before use |
| Empty and header-only files | Rejected with an explanation, not an exception |
| Formula injection | Cells beginning `=`, `+`, `-`, `@`, tab, or CR are neutralised on export, so a report cannot attack whoever opens it in Excel |
| Storage | Files are written under `STORAGE_DIR/uploads/<workspace-id>/<dataset-id>/`, never at a client-controlled path |

Every rejection carries a message the uploader can act on. "We couldn't read
this file" with no reason is a support ticket; "This file contains column
headers but no data rows" is not.

---

## 7. Input validation and injection

- **SQL injection:** every query is SQLAlchemy ORM or a parameterised
  `text()` construct. No string interpolation reaches the database layer.
- **XSS:** React escapes by default; no `dangerouslySetInnerHTML` renders
  user-derived content. The single inline script is the pre-paint theme
  switcher, which is a fixed literal.
- **Request validation:** pydantic models on every endpoint, with a handler that
  rewrites pydantic's output into a message a business user can act on.
- **CSRF:** state-changing requests are `POST`/`PATCH`/`DELETE` with
  `SameSite=Lax` cookies, and the API requires a bearer token that the browser
  cannot read or replay from another origin.

---

## 8. Security headers

**Frontend** (`next.config.ts`) — the origin a browser actually visits:

- `Content-Security-Policy` — `default-src 'self'`, `frame-ancestors 'none'`,
  `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, and
  `connect-src 'self'` (unusually tight for an app with an API, and correct
  here: the browser never contacts the backend directly). `'unsafe-eval'` is
  present in development only, for React Refresh.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`,
  production builds only — issuing HSTS from a local HTTP server pins
  `localhost` to HTTPS in the developer's browser.
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`
- `Cache-Control: no-store` on every `/api/*` response

**Backend** (`app/core/middleware.py`): `nosniff`, `DENY`,
`Referrer-Policy: no-referrer`, `Permissions-Policy`, and HSTS in production.

---

## 9. Error handling

No stack trace, driver message, file path, or schema detail ever crosses the API
boundary. Every error takes the same shape:

```json
{ "error": { "code": "...", "message": "...", "hint": "...", "request_id": "..." } }
```

A catch-all handler converts any unhandled exception into a generic message plus
a request id, with the trace logged server-side only. The request id is the link
between what the user saw and what the operator can find.

API documentation (`/docs`, `/redoc`, `/openapi.json`) is disabled when
`ENVIRONMENT=production`.

---

## 10. Audit logging

`app/api/deps.py::record_audit`. Recorded events:

`user.signup` · `user.login` · `user.login_failed` · `user.logout` ·
`user.password_reset_requested` · `user.password_reset` · `dataset.upload` ·
`dataset.confirm` · `dataset.delete` · `dataset.demo_loaded` ·
`analysis.start` · `analysis.complete` · `report.create` ·
`workspace.update` · `demo.start`

Each entry holds the workspace, user, action, resource type and id, client
address, user agent, request id, and timestamp.

**Dataset contents are never logged.** Not rows, not cell values, not column
values. Metadata about an action, never the business data the action touched.

The client address written here is the trusted one from §4 — an audit log that
records a caller-supplied address is worse than one that records none, because
it is evidence pointing wherever the attacker chose.

---

## 11. Data sent to AI providers

Aggregated metrics, segment names, period labels, the calculation behind each
figure, and your question. **Individual rows are never sent.**

With `AI_PROVIDER=ollama` the model runs locally and nothing leaves the machine.
With `AI_PROVIDER=openai` the evidence bundle above is sent to the configured
endpoint. Settings → AI & data shows the active provider and the exact list,
generated from the running configuration rather than written by hand.

`AI_MAX_SAMPLE_ROWS` is a hard ceiling for any future feature that might need
row-level context. Nothing currently uses it.

See [AI_GUARDRAILS.md](AI_GUARDRAILS.md) for what happens to the response.

---

## 12. Secrets

- No secret is committed. `.env`, `.env.local`, and `.env.*.local` are ignored,
  and `.env.example` files carry documentation and placeholders only.
- `SECRET_KEY` and `PROXY_SHARED_SECRET` are read from the environment. Neither
  has a production default.
- **Production start-up refuses to proceed** with a placeholder `SECRET_KEY`, a
  key shorter than 32 characters, an empty `DATABASE_URL`, or
  `AI_PROVIDER=openai` with no API key. A misconfigured deployment should fail
  loudly at boot rather than quietly issue forgeable sessions.
- CI runs `gitleaks` over the full history on every push and pull request.

The only credential-shaped strings in the repository are the throwaway passwords
used by the acceptance script and the browser tests to create accounts during a
run (`CorrectHorse42!`). They are not credentials to anything.

---

## 13. The public demo

An unauthenticated endpoint that creates an account deserves scrutiny.

- Governed by `DEMO_DATA_ENABLED`; setting it false removes the endpoint.
- It sits under `/auth/` and inherits the strict authentication rate limit.
- Each visitor gets their own workspace, isolated by exactly the mechanism in §3
  — `tests/test_demo.py` asserts one demo cannot read another's.
- The data is generated, not borrowed. No production data is exposed.
- **No shared demo credential exists** in the source, the documentation, or the
  response body. The account is created with a random password that is never
  displayed and never usable again.
- Demo workspaces and their files are deleted after `DEMO_SESSION_HOURS`
  (default 24). The clean-up filters on `is_demo` and is tested to leave real
  accounts untouched.

---

## 14. User data control

- Datasets can be deleted, taking their analyses, insights, anomalies, columns,
  versions, and files with them. Rows are removed in a transaction; files are
  removed after it commits, because an orphaned file is recoverable and an
  orphaned row pointing at deleted data is not.
- Analyses, reports, and conversations can be deleted individually.
- Deleting a workspace cascades to everything scoped to it.

---

## 15. Verifying all of this

```bash
cd backend
pytest tests/test_auth.py           # authentication, hashing, token lifecycle
pytest tests/test_authorization.py  # tenant isolation with real cross-tenant ids
pytest tests/test_client_identity.py # the rate-limit trust boundary
pytest tests/test_datasets.py       # upload validation and hostile files
pytest tests/test_demo.py           # demo isolation and expiry
pytest tests/test_ai_adversarial.py # AI fabrication and causal overreach

# End to end, through the Next.js layer with a real session cookie
python scripts/acceptance_check.py
```

---

## 16. Reporting a vulnerability

Open a GitHub issue for anything non-sensitive. For something that should not be
public, use GitHub's private vulnerability reporting on the repository.
