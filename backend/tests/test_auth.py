"""Authentication: signup, login, tokens, and password reset."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from tests.conftest import unique_email

SIGNUP = "/api/v1/auth/signup"
LOGIN = "/api/v1/auth/login"


class TestSignup:
    def test_creates_user_and_first_workspace(self, client: TestClient):
        response = client.post(
            SIGNUP,
            json={
                "email": unique_email(),
                "password": "CorrectHorse42!",
                "full_name": "Ada Lovelace",
                "business_name": "Analytical Engines",
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert body["access_token"]
        assert body["refresh_token"]
        assert body["user"]["full_name"] == "Ada Lovelace"
        assert len(body["workspaces"]) == 1
        assert body["workspaces"][0]["name"] == "Analytical Engines"

    def test_password_hash_is_never_returned(self, client: TestClient):
        response = client.post(
            SIGNUP, json={"email": unique_email(), "password": "CorrectHorse42!"}
        )
        assert "password" not in response.text.lower().replace("password_reset", "")

    def test_duplicate_email_rejected(self, client: TestClient):
        email = unique_email()
        payload = {"email": email, "password": "CorrectHorse42!"}
        assert client.post(SIGNUP, json=payload).status_code == 201
        response = client.post(SIGNUP, json=payload)
        assert response.status_code == 409
        assert "already exists" in response.json()["error"]["message"]

    def test_email_is_case_insensitive(self, client: TestClient):
        email = unique_email()
        client.post(SIGNUP, json={"email": email, "password": "CorrectHorse42!"})
        response = client.post(
            SIGNUP, json={"email": email.upper(), "password": "CorrectHorse42!"}
        )
        assert response.status_code == 409

    @pytest.mark.parametrize(
        "password", ["short", "12345678", "password", "1234567890123"]
    )
    def test_weak_passwords_rejected(self, client: TestClient, password: str):
        response = client.post(SIGNUP, json={"email": unique_email(), "password": password})
        assert response.status_code == 422

    def test_invalid_email_rejected(self, client: TestClient):
        response = client.post(SIGNUP, json={"email": "not-an-email", "password": "CorrectHorse42!"})
        assert response.status_code == 422

    def test_overlong_password_rejected(self, client: TestClient):
        """bcrypt truncates past 72 bytes, which would make long passwords
        interchangeable. We must refuse rather than silently truncate."""
        response = client.post(
            SIGNUP, json={"email": unique_email(), "password": "a" * 100}
        )
        assert response.status_code == 422


class TestLogin:
    def test_successful_login(self, client: TestClient, owner):
        response = client.post(
            LOGIN, json={"email": owner["email"], "password": owner["password"]}
        )
        assert response.status_code == 200
        assert response.json()["access_token"]

    def test_wrong_password_rejected(self, client: TestClient, owner):
        response = client.post(
            LOGIN, json={"email": owner["email"], "password": "WrongPassword99!"}
        )
        assert response.status_code == 401

    def test_unknown_and_wrong_password_are_indistinguishable(
        self, client: TestClient, owner
    ):
        """Different messages here would let an attacker enumerate accounts."""
        unknown = client.post(
            LOGIN, json={"email": unique_email(), "password": "CorrectHorse42!"}
        )
        wrong = client.post(
            LOGIN, json={"email": owner["email"], "password": "WrongPassword99!"}
        )
        assert unknown.status_code == wrong.status_code == 401
        assert unknown.json()["error"]["message"] == wrong.json()["error"]["message"]


class TestTokens:
    def test_session_requires_a_token(self, client: TestClient):
        assert client.get("/api/v1/auth/session").status_code == 401

    def test_session_returns_user_and_workspaces(self, client: TestClient, owner):
        response = client.get("/api/v1/auth/session", headers=owner["headers"])
        assert response.status_code == 200
        assert response.json()["user"]["email"] == owner["email"]
        assert len(response.json()["workspaces"]) == 1

    def test_malformed_token_rejected(self, client: TestClient):
        response = client.get(
            "/api/v1/auth/session", headers={"Authorization": "Bearer not.a.token"}
        )
        assert response.status_code == 401

    def test_missing_bearer_scheme_rejected(self, client: TestClient, owner):
        response = client.get(
            "/api/v1/auth/session", headers={"Authorization": owner["token"]}
        )
        assert response.status_code == 401

    def test_refresh_token_cannot_be_used_as_an_access_token(
        self, client: TestClient, owner
    ):
        """Token type confusion would let a long-lived refresh token act as a
        session token, defeating short access-token expiry entirely."""
        response = client.get(
            "/api/v1/auth/session",
            headers={"Authorization": f"Bearer {owner['refresh_token']}"},
        )
        assert response.status_code == 401

    def test_refresh_issues_a_new_access_token(self, client: TestClient, owner):
        response = client.post(
            "/api/v1/auth/refresh", json={"refresh_token": owner["refresh_token"]}
        )
        assert response.status_code == 200
        assert response.json()["access_token"]

    def test_access_token_cannot_be_used_to_refresh(self, client: TestClient, owner):
        response = client.post(
            "/api/v1/auth/refresh", json={"refresh_token": owner["token"]}
        )
        assert response.status_code == 401


class TestPasswordReset:
    def test_reset_request_does_not_reveal_whether_an_account_exists(
        self, client: TestClient, owner
    ):
        known = client.post("/api/v1/auth/password-reset", json={"email": owner["email"]})
        unknown = client.post("/api/v1/auth/password-reset", json={"email": unique_email()})
        assert known.status_code == unknown.status_code == 200
        assert known.json() == unknown.json()

    def test_reset_changes_password_and_retires_old_sessions(
        self, client: TestClient, owner
    ):
        from app.core.security import create_password_reset_token

        token = create_password_reset_token(owner["user"]["id"])
        response = client.post(
            "/api/v1/auth/password-reset/confirm",
            json={"token": token, "password": "BrandNewSecret77!"},
        )
        assert response.status_code == 200

        # The old token must stop working: token_version was bumped.
        assert client.get("/api/v1/auth/session", headers=owner["headers"]).status_code == 401

        # The old password must stop working.
        assert client.post(
            LOGIN, json={"email": owner["email"], "password": owner["password"]}
        ).status_code == 401

        # The new one must work.
        assert client.post(
            LOGIN, json={"email": owner["email"], "password": "BrandNewSecret77!"}
        ).status_code == 200

    def test_invalid_reset_token_rejected(self, client: TestClient):
        response = client.post(
            "/api/v1/auth/password-reset/confirm",
            json={"token": "garbage", "password": "BrandNewSecret77!"},
        )
        assert response.status_code == 401

    def test_access_token_cannot_be_used_as_a_reset_token(
        self, client: TestClient, owner
    ):
        response = client.post(
            "/api/v1/auth/password-reset/confirm",
            json={"token": owner["token"], "password": "BrandNewSecret77!"},
        )
        assert response.status_code == 401


class TestLogout:
    def test_logout_succeeds(self, client: TestClient, owner):
        response = client.post("/api/v1/auth/logout", headers=owner["headers"])
        assert response.status_code == 200
