"""Who the application thinks a request came from.

Rate limiting and audit logging both key on "the client". If that answer is
taken from a header the caller controls, then every per-client budget in the
product is advisory only: an attacker rotates one header and brute-forces
freely, while the audit log dutifully records whatever addresses they chose.

These tests pin the trust boundary. The rule is that a forwarded address is
believed only when the deployment has explicitly said who is allowed to forward
it — never by default, and never from the end of the header the caller writes.
"""

from __future__ import annotations

import pytest
from starlette.datastructures import Headers

from app.core import client as client_module
from app.core.client import UNKNOWN, client_address


class _FakeClient:
    def __init__(self, host: str) -> None:
        self.host = host


class _FakeRequest:
    """The two things ``client_address`` reads: headers and the socket peer."""

    def __init__(self, headers: dict[str, str] | None = None, peer: str | None = "10.0.0.1"):
        self.headers = Headers(headers or {})
        self.client = _FakeClient(peer) if peer else None


@pytest.fixture
def configure(monkeypatch):
    """Set proxy-trust settings for one test."""

    def _apply(**values):
        for key, value in values.items():
            monkeypatch.setattr(client_module.settings, key, value, raising=False)

    return _apply


class TestDefaultIsDistrust:
    def test_socket_address_is_used_when_nothing_is_configured(self, configure):
        configure(proxy_shared_secret="", trusted_proxy_count=0)
        request = _FakeRequest(peer="203.0.113.9")
        assert client_address(request) == "203.0.113.9"

    def test_forwarded_for_is_ignored_by_default(self, configure):
        """The header exists on every Vercel request. That does not make it true."""
        configure(proxy_shared_secret="", trusted_proxy_count=0)
        request = _FakeRequest(
            {"x-forwarded-for": "1.2.3.4"},
            peer="203.0.113.9",
        )
        assert client_address(request) == "203.0.113.9"

    def test_real_client_ip_without_the_secret_is_ignored(self, configure):
        configure(proxy_shared_secret="s3cret", trusted_proxy_count=0)
        request = _FakeRequest(
            {"x-real-client-ip": "1.2.3.4"},
            peer="203.0.113.9",
        )
        assert client_address(request) == "203.0.113.9"

    def test_a_wrong_secret_is_ignored(self, configure):
        configure(proxy_shared_secret="s3cret", trusted_proxy_count=0)
        request = _FakeRequest(
            {"x-insightflow-proxy": "not-the-secret", "x-real-client-ip": "1.2.3.4"},
            peer="203.0.113.9",
        )
        assert client_address(request) == "203.0.113.9"

    def test_unidentifiable_requests_are_not_guessed(self, configure):
        configure(proxy_shared_secret="", trusted_proxy_count=0)
        assert client_address(_FakeRequest(peer=None)) == UNKNOWN


class TestTrustedProxyHeader:
    def test_the_secret_authorises_the_forwarded_address(self, configure):
        configure(proxy_shared_secret="s3cret", trusted_proxy_count=0)
        request = _FakeRequest(
            {"x-insightflow-proxy": "s3cret", "x-real-client-ip": "198.51.100.7"},
            peer="10.0.0.1",
        )
        assert client_address(request) == "198.51.100.7"

    def test_it_takes_precedence_over_forwarded_for(self, configure):
        configure(proxy_shared_secret="s3cret", trusted_proxy_count=1)
        request = _FakeRequest(
            {
                "x-insightflow-proxy": "s3cret",
                "x-real-client-ip": "198.51.100.7",
                "x-forwarded-for": "1.2.3.4",
            },
            peer="10.0.0.1",
        )
        assert client_address(request) == "198.51.100.7"


class TestForwardedForIsCountedFromTheRight:
    def test_a_single_proxy_reports_the_client(self, configure):
        configure(proxy_shared_secret="", trusted_proxy_count=1)
        request = _FakeRequest({"x-forwarded-for": "198.51.100.7"}, peer="10.0.0.1")
        assert client_address(request) == "198.51.100.7"

    def test_a_spoofed_prefix_does_not_win(self, configure):
        """The bypass this whole module exists to prevent.

        The client sent ``X-Forwarded-For: 1.2.3.4``; the trusted proxy appended
        the address it actually saw. Reading the header left to right — the
        obvious implementation — hands the attacker a fresh rate-limit bucket on
        every request.
        """
        configure(proxy_shared_secret="", trusted_proxy_count=1)
        request = _FakeRequest(
            {"x-forwarded-for": "1.2.3.4, 198.51.100.7"},
            peer="10.0.0.1",
        )
        assert client_address(request) == "198.51.100.7"

    def test_two_proxies_skip_two_entries(self, configure):
        configure(proxy_shared_secret="", trusted_proxy_count=2)
        request = _FakeRequest(
            {"x-forwarded-for": "1.2.3.4, 198.51.100.7, 172.16.0.1"},
            peer="10.0.0.1",
        )
        assert client_address(request) == "198.51.100.7"

    def test_a_header_shorter_than_the_declared_chain_is_rejected(self, configure):
        """The request did not arrive the way the deployment says it does."""
        configure(proxy_shared_secret="", trusted_proxy_count=2)
        request = _FakeRequest({"x-forwarded-for": "1.2.3.4"}, peer="10.0.0.1")
        assert client_address(request) == "10.0.0.1"


class TestRateLimitingUsesIt:
    def test_rotating_forwarded_for_does_not_refresh_the_auth_budget(
        self, client, monkeypatch
    ):
        """End to end: the limiter must not be resettable from outside.

        Configured as it ships — no trusted proxy — a caller changing
        ``X-Forwarded-For`` on every attempt should still exhaust the strict
        authentication budget.
        """
        from app.core import middleware

        monkeypatch.setattr(middleware.settings, "rate_limit_enabled", True)
        monkeypatch.setattr(middleware.settings, "auth_rate_limit_requests", 3)
        monkeypatch.setattr(middleware.settings, "auth_rate_limit_window_seconds", 300)
        monkeypatch.setattr(client_module.settings, "trusted_proxy_count", 0)
        monkeypatch.setattr(client_module.settings, "proxy_shared_secret", "")

        statuses = []
        for attempt in range(6):
            response = client.post(
                "/api/v1/auth/login",
                json={"email": "nobody@example.com", "password": "WrongPassword99!"},
                headers={"x-forwarded-for": f"203.0.113.{attempt}"},
            )
            statuses.append(response.status_code)

        assert 429 in statuses, (
            "rotating X-Forwarded-For defeated the authentication rate limit: "
            f"{statuses}"
        )
