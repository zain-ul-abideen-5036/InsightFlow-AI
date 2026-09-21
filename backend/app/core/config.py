"""Application configuration.

Every tunable lives here and is sourced from the environment, so that no secret
or deployment-specific value is ever hard-coded. See ``.env.example`` for the
documented list.
"""

from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]

DEV_SECRET_PLACEHOLDER = "dev-only-insecure-secret-change-me"


class Settings(BaseSettings):
    """Typed, validated application settings."""

    model_config = SettingsConfigDict(
        env_file=(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # -- Application ---------------------------------------------------------
    app_name: str = "InsightFlow AI"
    api_v1_prefix: str = "/api/v1"
    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    log_json: bool = False

    # -- Database ------------------------------------------------------------
    database_url: str = ""

    # -- Security ------------------------------------------------------------
    secret_key: str = DEV_SECRET_PLACEHOLDER
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # -- Proxy / client identification ---------------------------------------
    # How many reverse proxies sit in front of this service.
    #
    # 0 means the application is reached directly, so `X-Forwarded-For` is
    # attacker-controlled and must be ignored entirely. Any other value means
    # that many trailing entries of the header were written by infrastructure we
    # control, and the client address is the one immediately before them.
    # Trusting the *left-most* entry — the obvious reading of the header — is
    # what makes rate limiting bypassable, because that end is whatever the
    # client sent.
    trusted_proxy_count: int = 0
    # Shared secret between the Next.js proxy and this API.
    #
    # On Vercel every request reaches the backend from Vercel's own network, so
    # `X-Forwarded-For` describes Vercel, not the browser: without this, one
    # rate-limit budget is shared by every user of the product. The Next.js
    # layer knows the real address and forwards it in `X-Real-Client-IP`, but
    # the backend is publicly reachable, so that header is only believed when
    # accompanied by this secret. Empty (the default) means the header is
    # ignored entirely.
    proxy_shared_secret: str = ""
    proxy_auth_header: str = "x-insightflow-proxy"
    client_ip_header: str = "x-real-client-ip"

    # -- Rate limiting -------------------------------------------------------
    rate_limit_enabled: bool = True
    rate_limit_requests: int = 300
    rate_limit_window_seconds: int = 60
    auth_rate_limit_requests: int = 10
    auth_rate_limit_window_seconds: int = 300

    # -- Uploads -------------------------------------------------------------
    storage_dir: str = "./storage"
    max_upload_size_mb: int = 50
    allowed_upload_extensions: str = ".csv,.xlsx,.xls,.tsv"
    profile_sample_rows: int = 50_000
    max_analysis_rows: int = 500_000

    # -- Jobs ----------------------------------------------------------------
    analysis_workers: int = 2
    analysis_timeout_seconds: int = 600
    analysis_stale_minutes: int = 30

    # -- AI ------------------------------------------------------------------
    ai_provider: Literal["ollama", "openai", "none"] = "ollama"
    ai_enabled: bool = True
    # A whole request must finish inside the ceiling the Node proxy allows.
    # Node's HTTP client gives up waiting for response headers after 300s and
    # it is not configurable from a Next.js route handler, so anything slower
    # is reported to the user as "we could not reach the analysis service" —
    # a wrong diagnosis for a backend that is working, and it throws away the
    # result that was about to arrive.
    #
    # One call costs at most (ai_max_retries + 1) * ai_timeout_seconds, so
    # these two together are the budget: 2 * 120 = 240s, leaving headroom.
    # Past that the AI layer times out on its own and `_run` falls back to the
    # deterministic answer, which is a designed and tested path that tells the
    # truth. That is strictly better than the proxy failing first.
    ai_timeout_seconds: int = 120
    ai_max_retries: int = 1
    ai_max_sample_rows: int = 25

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:3b-instruct"

    openai_base_url: str = "https://api.openai.com/v1"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # -- Demo ----------------------------------------------------------------
    demo_data_enabled: bool = True
    # How long a public demo workspace survives before it is deleted along with
    # its files. Long enough to explore properly, short enough that an open
    # endpoint cannot fill a disk.
    demo_session_hours: int = 24

    # -- Derived -------------------------------------------------------------

    @field_validator("log_level")
    @classmethod
    def _upper_log_level(cls, value: str) -> str:
        return value.upper()

    @model_validator(mode="after")
    def _validate_production_secrets(self) -> "Settings":
        """Refuse to start a production deployment with development defaults."""
        if self.environment == "production":
            if not self.secret_key or self.secret_key == DEV_SECRET_PLACEHOLDER:
                raise ValueError(
                    "SECRET_KEY must be set to a strong unique value when "
                    "ENVIRONMENT=production. Generate one with: "
                    'python -c "import secrets;print(secrets.token_urlsafe(48))"'
                )
            if len(self.secret_key) < 32:
                raise ValueError("SECRET_KEY must be at least 32 characters in production.")
            if not self.database_url:
                raise ValueError(
                    "DATABASE_URL must point at a PostgreSQL instance when "
                    "ENVIRONMENT=production (SQLite is development-only)."
                )
            if self.ai_provider == "openai" and not self.openai_api_key:
                raise ValueError("OPENAI_API_KEY is required when AI_PROVIDER=openai.")
        elif not self.secret_key:
            # Never leave signing unkeyed, even in development.
            self.secret_key = secrets.token_urlsafe(48)
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def storage_path(self) -> Path:
        path = Path(self.storage_dir)
        if not path.is_absolute():
            path = BACKEND_ROOT / path
        return path

    @property
    def sqlalchemy_url(self) -> str:
        """Resolve the database URL, defaulting to a local SQLite file."""
        if self.database_url:
            url = self.database_url
            # Accept the common `postgresql://` and `postgres://` forms and route
            # them to the psycopg 3 driver we actually ship.
            if url.startswith("postgres://"):
                url = "postgresql+psycopg://" + url[len("postgres://") :]
            elif url.startswith("postgresql://"):
                url = "postgresql+psycopg://" + url[len("postgresql://") :]
            return url
        self.storage_path.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{(self.storage_path / 'insightflow.db').as_posix()}"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_extensions(self) -> set[str]:
        return {
            ext.strip().lower() if ext.strip().startswith(".") else f".{ext.strip().lower()}"
            for ext in self.allowed_upload_extensions.split(",")
            if ext.strip()
        }

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    @property
    def uploads_path(self) -> Path:
        return self.storage_path / "uploads"


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor (import-safe, test-overridable)."""
    return Settings()


settings = get_settings()
