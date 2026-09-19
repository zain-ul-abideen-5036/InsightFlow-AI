"""Working out who a request actually came from.

Everything that keys on "the client" — rate limiting and audit logging — needs
one answer to this question, and it has to be an answer an attacker cannot
choose for themselves.

The naive implementation reads the left-most entry of ``X-Forwarded-For``. That
entry is whatever the client wrote. Anyone can rotate it and every per-client
budget in the application evaporates, which is precisely the bypass this module
exists to close.

Three sources are consulted, in descending order of trustworthiness:

1. ``X-Real-Client-IP``, but **only** when the request also carries the shared
   secret that the Next.js proxy is configured with. That proxy sits between the
   browser and this API, so it is the only component that both knows the real
   address and can be authenticated.
2. ``X-Forwarded-For``, counted from the *right*, when the deployment declares
   how many reverse proxies sit in front of it. The right-hand end of that
   header is written by infrastructure; the left-hand end is written by the
   caller.
3. The socket peer address, which nobody can forge, and which is correct
   whenever the service is reached directly.

The default configuration — no shared secret, no declared proxies — uses only
(3). Believing a header takes an explicit deployment decision.
"""

from __future__ import annotations

import hmac

from starlette.requests import Request

from app.core.config import settings

UNKNOWN = "unknown"


def _first_token(value: str | None) -> str | None:
    if not value:
        return None
    token = value.split(",")[0].strip()
    return token or None


def _from_trusted_proxy(request: Request) -> str | None:
    """The address the Next.js proxy reports, if it proved it is the proxy."""
    secret = settings.proxy_shared_secret
    if not secret:
        return None

    presented = request.headers.get(settings.proxy_auth_header)
    if not presented:
        return None

    # Constant-time: a timing oracle on this comparison would leak the secret
    # that authorises spoofing the client address.
    if not hmac.compare_digest(presented, secret):
        return None

    return _first_token(request.headers.get(settings.client_ip_header))


def _from_forwarded_for(request: Request) -> str | None:
    """The client address according to a declared chain of reverse proxies."""
    hops = settings.trusted_proxy_count
    if hops <= 0:
        return None

    raw = request.headers.get("x-forwarded-for")
    if not raw:
        return None

    parts = [part.strip() for part in raw.split(",") if part.strip()]
    if not parts:
        return None

    # With one trusted proxy the client is the last entry; with two it is the
    # one before that, and so on. A header shorter than the declared chain means
    # the request did not arrive the way the deployment says it does, so the
    # value is not trusted at all.
    index = len(parts) - hops
    if index < 0:
        return None
    return parts[index] if index < len(parts) else parts[-1]


def client_address(request: Request) -> str:
    """The best trustworthy identification of the caller."""
    return (
        _from_trusted_proxy(request)
        or _from_forwarded_for(request)
        or (request.client.host if request.client else None)
        or UNKNOWN
    )
