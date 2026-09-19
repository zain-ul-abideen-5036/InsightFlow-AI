"""Shared test fixtures.

The suite runs against an isolated on-disk SQLite database and storage
directory, both created per session and torn down afterwards, so tests never
touch development data.
"""

from __future__ import annotations

import os
import shutil
import tempfile
import uuid
from pathlib import Path

import pytest

# Configuration must be set before any application module is imported, because
# `settings` is instantiated at import time.
_TEST_DIR = Path(tempfile.mkdtemp(prefix="insightflow-tests-"))
os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-tests-1234567890"
os.environ["STORAGE_DIR"] = str(_TEST_DIR)
os.environ["DATABASE_URL"] = f"sqlite:///{(_TEST_DIR / 'test.db').as_posix()}"
os.environ["AI_ENABLED"] = "false"
os.environ["AI_PROVIDER"] = "none"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["DEMO_DATA_ENABLED"] = "true"

import pandas as pd  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _database():
    Base.metadata.create_all(bind=engine)
    yield

    # Analysis jobs run on a thread pool, so a test that starts one can finish
    # while its job is still working. Tearing the database down underneath those
    # threads produces a page of "unable to open database file" tracebacks after
    # a green run — alarming, and unrelated to anything that failed. Wait for
    # them instead.
    from app.jobs.runner import shutdown_executor

    shutdown_executor(wait=True)

    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    shutil.rmtree(_TEST_DIR, ignore_errors=True)


@pytest.fixture(autouse=True)
def _clean_tables(_database):
    """Truncate between tests so each one starts from a known state."""
    yield
    with SessionLocal() as db:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# --------------------------------------------------------------------------- #
# Account helpers
# --------------------------------------------------------------------------- #


def unique_email(prefix: str = "user") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture
def account(client: TestClient):
    """A signed-up user with a workspace and ready-to-use auth headers."""

    def _create(email: str | None = None, password: str = "CorrectHorse42!"):
        response = client.post(
            "/api/v1/auth/signup",
            json={
                "email": email or unique_email(),
                "password": password,
                "full_name": "Test Owner",
                "business_name": "Test Business",
            },
        )
        assert response.status_code == 201, response.text
        data = response.json()
        return {
            "token": data["access_token"],
            "refresh_token": data["refresh_token"],
            "user": data["user"],
            "workspace": data["workspaces"][0],
            "headers": {"Authorization": f"Bearer {data['access_token']}"},
            "password": password,
            "email": data["user"]["email"],
        }

    return _create


@pytest.fixture
def owner(account):
    return account()


# --------------------------------------------------------------------------- #
# Dataset fixtures with known answers
# --------------------------------------------------------------------------- #


@pytest.fixture
def known_answer_csv() -> bytes:
    """A tiny dataset whose every metric can be verified by hand.

    January: 2 orders, revenue 1000, cost 600, profit 400
    February: 2 orders, revenue 1200, cost 700, profit 500
    Expected month-over-month revenue growth: exactly +20%.
    """
    rows = [
        # order_id, order_date, customer_id, product, region, quantity,
        # unit_price, revenue, cost, profit
        ("A-1", "2025-01-10", "C1", "Widget", "North", 2, 200.00, 400.00, 250.00, 150.00),
        ("A-2", "2025-01-20", "C2", "Gadget", "South", 3, 200.00, 600.00, 350.00, 250.00),
        ("A-3", "2025-02-10", "C1", "Widget", "North", 2, 250.00, 500.00, 300.00, 200.00),
        ("A-4", "2025-02-20", "C3", "Gadget", "South", 2, 350.00, 700.00, 400.00, 300.00),
    ]
    header = (
        "order_id,order_date,customer_id,product,region,quantity,"
        "unit_price,revenue,cost,profit\n"
    )
    body = "".join(
        f"{r[0]},{r[1]},{r[2]},{r[3]},{r[4]},{r[5]},{r[6]:.2f},{r[7]:.2f},{r[8]:.2f},{r[9]:.2f}\n"
        for r in rows
    )
    return (header + body).encode("utf-8")


@pytest.fixture
def known_answer_frame(known_answer_csv) -> pd.DataFrame:
    import io

    return pd.read_csv(io.BytesIO(known_answer_csv))


@pytest.fixture
def daily_series_csv() -> bytes:
    """Sixty days of steady revenue with one deliberate 60% collapse on day 45.

    Used to assert that anomaly detection finds the planted event and does not
    invent others.
    """
    lines = ["order_id,order_date,customer_id,product,revenue,quantity"]
    start = pd.Timestamp("2025-01-01")
    for day in range(60):
        date = (start + pd.Timedelta(days=day)).strftime("%Y-%m-%d")
        # Deterministic gentle wobble so the series is not perfectly flat, which
        # would make every deviation infinitely significant.
        base = 1000.0 + (day % 5) * 10.0
        amount = base * 0.4 if day == 44 else base
        lines.append(f"O-{day}-1,{date},C{day % 7},Widget,{amount / 2:.2f},1")
        lines.append(f"O-{day}-2,{date},C{(day + 3) % 7},Gadget,{amount / 2:.2f},1")
    return ("\n".join(lines) + "\n").encode("utf-8")


@pytest.fixture
def novamart_frame() -> pd.DataFrame:
    from app.seed.novamart import generate_rows

    return pd.DataFrame(generate_rows())


@pytest.fixture
def novamart_context(novamart_frame):
    from app.analytics.context import build_context
    from app.analytics.profiling import profile_dataset
    from app.analytics.types import Grain

    profile = profile_dataset(novamart_frame)
    return build_context(
        novamart_frame,
        profile.role_map,
        grain=Grain.MONTH,
        dataset_name="NovaMart Orders",
    ), profile
