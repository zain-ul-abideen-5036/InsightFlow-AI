"""The two deployment shapes the application supports.

The default shape — a long-lived server with a filesystem — is what every other
test in this suite exercises. This file covers the other one: files kept in
PostgreSQL rather than on disk, and analyses run inside a request rather than on
a thread pool. Those are the settings a serverless deployment needs, and the
whole point of them is that the product behaves identically, so the assertions
here are about the *product*, not about the mechanism.

Both modes are switched on per test rather than for the file, so a failure names
which one broke.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.storage import (
    DatabaseFileStorage,
    LocalFileStorage,
    get_storage,
    reset_storage,
    storage_key,
)


@pytest.fixture
def database_storage(monkeypatch):
    """Switch file storage to PostgreSQL (SQLite here) for one test."""
    monkeypatch.setattr(settings, "storage_backend", "database")
    reset_storage()
    yield
    reset_storage()


@pytest.fixture
def request_mode(monkeypatch):
    """Switch analysis execution to the serverless mode for one test."""
    monkeypatch.setattr(settings, "analysis_execution", "request")
    yield


def upload(client: TestClient, owner, content: bytes, filename="sales.csv"):
    return client.post(
        f"/api/v1/workspaces/{owner['workspace']['id']}/datasets",
        headers=owner["headers"],
        files={"file": (filename, content, "text/csv")},
    )


def stored_keys(db, dataset_id: str) -> tuple[str, str | None]:
    """The storage keys for a dataset, read from the database.

    Not from the API: `storage_path` is internal, and an endpoint that told a
    client where a file is kept would be telling it something it has no use for.
    """
    import uuid as uuid_module

    from app.db.models import Dataset

    row = db.get(Dataset, uuid_module.UUID(dataset_id))
    db.refresh(row)
    return row.storage_path, row.normalized_path


def overview_metrics(client: TestClient, owner) -> dict:
    """The dashboard KPIs, keyed by metric name."""
    response = client.get(
        f"/api/v1/workspaces/{owner['workspace']['id']}/overview",
        headers=owner["headers"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["has_data"] is True, body
    return {metric["key"]: metric for metric in body["metrics"]}


# --------------------------------------------------------------------------- #
# The storage interface
# --------------------------------------------------------------------------- #


class TestStorageBackends:
    def test_selected_from_configuration(self, database_storage):
        assert isinstance(get_storage(), DatabaseFileStorage)
        reset_storage()
        settings.storage_backend = "local"
        try:
            assert isinstance(get_storage(), LocalFileStorage)
        finally:
            settings.storage_backend = "database"
            reset_storage()

    @pytest.mark.parametrize("backend", ["local", "database"])
    def test_round_trip(self, monkeypatch, backend):
        """Both backends are the same interface, so both get the same test."""
        monkeypatch.setattr(settings, "storage_backend", backend)
        reset_storage()
        try:
            storage = get_storage()
            key = storage_key("uploads", "ws-round-trip", "ds-1", "orders.csv")

            storage.write(key, b"date,revenue\n2025-01-01,100\n")
            assert storage.exists(key)
            assert storage.read(key) == b"date,revenue\n2025-01-01,100\n"

            # Re-writing a key replaces it, the way writing to a path does.
            storage.write(key, b"replaced")
            assert storage.read(key) == b"replaced"

            storage.delete_prefix(storage_key("uploads", "ws-round-trip", "ds-1"))
            assert not storage.exists(key)
        finally:
            reset_storage()

    @pytest.mark.parametrize("backend", ["local", "database"])
    def test_missing_file_raises_file_not_found(self, monkeypatch, backend):
        """Not an error type of its own: callers already handle this one."""
        monkeypatch.setattr(settings, "storage_backend", backend)
        reset_storage()
        try:
            with pytest.raises(FileNotFoundError):
                get_storage().read(storage_key("uploads", "nope", "nope", "nope.csv"))
        finally:
            reset_storage()

    def test_delete_prefix_leaves_a_sibling_alone(self, database_storage):
        """A prefix is a directory, not a substring."""
        storage = get_storage()
        keep = storage_key("uploads", "ws-a", "ds-2", "orders.csv")
        drop = storage_key("uploads", "ws-a", "ds-1", "orders.csv")
        storage.write(keep, b"keep")
        storage.write(drop, b"drop")

        storage.delete_prefix(storage_key("uploads", "ws-a", "ds-1"))

        assert storage.exists(keep)
        assert not storage.exists(drop)

    def test_keys_are_posix_on_every_platform(self):
        """A key written on Windows has to read back on Linux."""
        assert storage_key("uploads", "ws", "ds", "a.csv") == "uploads/ws/ds/a.csv"
        assert "\\" not in storage_key("uploads", "ws/", "/ds", "a.csv")

    def test_local_backend_refuses_to_escape_the_storage_root(self, monkeypatch):
        monkeypatch.setattr(settings, "storage_backend", "local")
        reset_storage()
        try:
            with pytest.raises(Exception):
                get_storage().read("../../etc/passwd")
        finally:
            reset_storage()

    @pytest.mark.parametrize("backend", ["local", "database"])
    def test_readiness_reflects_the_configured_backend(
        self, monkeypatch, backend, client: TestClient
    ):
        monkeypatch.setattr(settings, "storage_backend", backend)
        reset_storage()
        try:
            body = client.get("/api/v1/ready").json()
            assert body["checks"]["storage"] is True
        finally:
            reset_storage()


# --------------------------------------------------------------------------- #
# The product, with files in the database
# --------------------------------------------------------------------------- #


class TestDatabaseStorageEndToEnd:
    def test_upload_analyse_and_ask_without_a_filesystem(
        self, client: TestClient, owner, db, database_storage, request_mode, known_answer_csv
    ):
        """The whole journey on the serverless settings, with known answers.

        This is the test that matters: if files in the database and analyses in
        a request produce the same figures as files on disk and analyses on a
        thread, the deployment change is invisible to the product. February
        revenue is 1200 against January's 1000, so growth is exactly +20% —
        the same numbers the filesystem journey asserts in test_e2e_flow.
        """
        workspace_id = owner["workspace"]["id"]

        dataset = upload(client, owner, known_answer_csv).json()
        assert dataset["row_count"] == 4

        # The file is a row, addressed by a key in the shared namespace, and it
        # is really there — not on a disk this deployment does not have.
        raw_key, normalized_key = stored_keys(db, dataset["id"])
        assert raw_key.startswith(f"uploads/{workspace_id}/{dataset['id']}/")
        assert get_storage().read(raw_key) == known_answer_csv
        assert normalized_key is not None

        confirmed = client.post(
            f"/api/v1/workspaces/{workspace_id}/datasets/{dataset['id']}/confirm",
            headers=owner["headers"],
            json={"columns": [], "grain": "month", "start_analysis": True},
        ).json()
        analysis = confirmed["analysis"]
        assert analysis is not None

        # Nothing runs behind the response in this mode: the row waits.
        polled = client.get(
            f"/api/v1/workspaces/{workspace_id}/analyses/{analysis['id']}",
            headers=owner["headers"],
        ).json()
        assert polled["status"] == "queued"

        # The explicit run is what does the work, and it finishes it.
        ran = client.post(
            f"/api/v1/workspaces/{workspace_id}/analyses/{analysis['id']}/run",
            headers=owner["headers"],
        )
        assert ran.status_code == 200, ran.text
        assert ran.json()["status"] == "completed"

        revenue = overview_metrics(client, owner)["revenue"]
        assert revenue["value"] == pytest.approx(1200.0)
        assert revenue["previous_value"] == pytest.approx(1000.0)
        assert revenue["change_pct"] == pytest.approx(20.0)

        # `Ask` re-reads the stored file, which is exactly what an ephemeral
        # filesystem breaks — and it has to reach the same figure the dashboard
        # did, from the same bytes.
        answer = client.post(
            f"/api/v1/workspaces/{workspace_id}/chat/ask",
            headers=owner["headers"],
            json={"question": "Compare this month with last month."},
        )
        assert answer.status_code == 201, answer.text
        evidence = {
            item["label"]: item["value"]
            for item in answer.json()["message"]["evidence"]["items"]
        }
        assert evidence.get("Revenue in Feb 2025") == pytest.approx(1200.0)

    def test_deleting_a_dataset_removes_its_stored_file(
        self, client: TestClient, owner, db, database_storage, known_answer_csv
    ):
        workspace_id = owner["workspace"]["id"]
        dataset = upload(client, owner, known_answer_csv).json()
        key, _ = stored_keys(db, dataset["id"])
        assert get_storage().exists(key)

        deleted = client.delete(
            f"/api/v1/workspaces/{workspace_id}/datasets/{dataset['id']}",
            headers=owner["headers"],
        )
        assert deleted.status_code == 200

        assert not get_storage().exists(key)

    def test_a_dataset_whose_file_vanished_says_so(
        self, client: TestClient, owner, database_storage, request_mode, known_answer_csv
    ):
        """The honest answer, not a 500.

        `Ask` recomputes from the file. If it is gone the user can fix that by
        uploading again, so they are told to — rather than being sent to support
        with "something went wrong on our side".
        """
        workspace_id = owner["workspace"]["id"]
        dataset = upload(client, owner, known_answer_csv).json()
        analysis = client.post(
            f"/api/v1/workspaces/{workspace_id}/datasets/{dataset['id']}/confirm",
            headers=owner["headers"],
            json={"columns": [], "grain": "month", "start_analysis": True},
        ).json()["analysis"]
        client.post(
            f"/api/v1/workspaces/{workspace_id}/analyses/{analysis['id']}/run",
            headers=owner["headers"],
        )

        get_storage().delete_prefix(
            storage_key("uploads", workspace_id, dataset["id"])
        )

        answer = client.post(
            f"/api/v1/workspaces/{workspace_id}/chat/ask",
            headers=owner["headers"],
            json={"question": "What was revenue last month?"},
        )
        assert answer.status_code == 404
        assert "no longer available" in answer.json()["error"]["message"]
        assert answer.json()["error"]["hint"]


# --------------------------------------------------------------------------- #
# Running analyses inside a request
# --------------------------------------------------------------------------- #


class TestRequestModeExecution:
    def test_running_twice_does_not_analyse_twice(
        self, client: TestClient, owner, request_mode, known_answer_csv
    ):
        """A double-click must not write two sets of results.

        The claim is a conditional UPDATE, so the second caller finds nothing to
        claim. Without it both callers would run the whole analysis and persist
        a full set of metrics, insights and anomalies against one analysis id —
        every figure on the dashboard silently doubled.
        """
        workspace_id = owner["workspace"]["id"]
        dataset = upload(client, owner, known_answer_csv).json()
        analysis = client.post(
            f"/api/v1/workspaces/{workspace_id}/datasets/{dataset['id']}/confirm",
            headers=owner["headers"],
            json={"columns": [], "grain": "month", "start_analysis": True},
        ).json()["analysis"]

        first = client.post(
            f"/api/v1/workspaces/{workspace_id}/analyses/{analysis['id']}/run",
            headers=owner["headers"],
        )
        assert first.json()["status"] == "completed"

        second = client.post(
            f"/api/v1/workspaces/{workspace_id}/analyses/{analysis['id']}/run",
            headers=owner["headers"],
        )
        assert second.status_code == 200
        assert second.json()["status"] == "completed"

        # 1200 for February, not 2400. A second run would have persisted a
        # duplicate metric row and doubled the figure on the dashboard.
        revenue = overview_metrics(client, owner)["revenue"]
        assert revenue["value"] == pytest.approx(1200.0)
        assert revenue["change_pct"] == pytest.approx(20.0)

    def test_run_is_harmless_in_thread_mode(
        self, client: TestClient, owner, known_answer_csv
    ):
        """The client calls this in every deployment, so it must be safe here.

        In thread mode the pool normally claims the job first. Whichever wins,
        the endpoint answers with the real status and never runs a second copy —
        which is why the frontend does not need to know the backend's mode.
        """
        from tests.test_e2e_flow import wait_for_analysis

        workspace_id = owner["workspace"]["id"]
        dataset = upload(client, owner, known_answer_csv).json()
        analysis = client.post(
            f"/api/v1/workspaces/{workspace_id}/datasets/{dataset['id']}/confirm",
            headers=owner["headers"],
            json={"columns": [], "grain": "month", "start_analysis": True},
        ).json()["analysis"]

        ran = client.post(
            f"/api/v1/workspaces/{workspace_id}/analyses/{analysis['id']}/run",
            headers=owner["headers"],
        )
        assert ran.status_code == 200

        final = wait_for_analysis(client, owner["headers"], workspace_id, analysis["id"])
        assert final["status"] == "completed"

        revenue = overview_metrics(client, owner)["revenue"]
        assert revenue["value"] == pytest.approx(1200.0)
        assert revenue["change_pct"] == pytest.approx(20.0)

    def test_a_run_that_never_finished_is_reported_as_interrupted(
        self, client: TestClient, owner, db, request_mode, known_answer_csv
    ):
        """An abandoned job must not spin in the UI forever.

        Start-up reconciliation catches these on a long-lived server. A
        deployment that never starts up in that sense needs them caught
        somewhere, so the status poll — the moment someone is actually waiting —
        does it too.
        """
        import uuid as uuid_module

        from app.db.models import Analysis, JobStatus

        workspace_id = owner["workspace"]["id"]
        dataset = upload(client, owner, known_answer_csv).json()
        analysis = client.post(
            f"/api/v1/workspaces/{workspace_id}/datasets/{dataset['id']}/confirm",
            headers=owner["headers"],
            json={"columns": [], "grain": "month", "start_analysis": True},
        ).json()["analysis"]

        # Exactly what a killed invocation leaves behind: running, and older
        # than any run could legitimately be.
        stale = datetime.now(timezone.utc) - timedelta(
            minutes=settings.analysis_stale_minutes + 5
        )
        row = db.get(Analysis, uuid_module.UUID(analysis["id"]))
        row.status = JobStatus.RUNNING
        row.started_at = stale
        db.commit()

        polled = client.get(
            f"/api/v1/workspaces/{workspace_id}/analyses/{analysis['id']}",
            headers=owner["headers"],
        ).json()

        assert polled["status"] == "failed"
        assert polled["error_code"] == "interrupted"
        assert polled["error_hint"]

    def test_a_run_still_in_progress_is_left_alone(
        self, client: TestClient, owner, db, request_mode, known_answer_csv
    ):
        """The mirror of the test above: only *stale* jobs are failed."""
        import uuid as uuid_module

        from app.db.models import Analysis, JobStatus

        workspace_id = owner["workspace"]["id"]
        dataset = upload(client, owner, known_answer_csv).json()
        analysis = client.post(
            f"/api/v1/workspaces/{workspace_id}/datasets/{dataset['id']}/confirm",
            headers=owner["headers"],
            json={"columns": [], "grain": "month", "start_analysis": True},
        ).json()["analysis"]

        row = db.get(Analysis, uuid_module.UUID(analysis["id"]))
        row.status = JobStatus.RUNNING
        row.started_at = datetime.now(timezone.utc)
        db.commit()

        polled = client.get(
            f"/api/v1/workspaces/{workspace_id}/analyses/{analysis['id']}",
            headers=owner["headers"],
        ).json()

        assert polled["status"] == "running"


# --------------------------------------------------------------------------- #
# Configuration guardrails
# --------------------------------------------------------------------------- #


class TestProductionDefaults:
    def test_production_does_not_create_tables_from_the_models(self):
        """Alembic owns the schema in production.

        Creating tables from the models there would hide a migration that was
        never written until the first deployment that did run one — at which
        point the mismatch surfaces as a broken deploy rather than a failing
        test.
        """
        from app.core.config import Settings

        production = Settings(
            environment="production",
            secret_key="a" * 48,
            database_url="postgresql://user:pw@example.invalid:5432/db",
        )
        assert production.auto_create_tables is False

    def test_an_explicit_setting_still_wins(self):
        from app.core.config import Settings

        production = Settings(
            environment="production",
            secret_key="a" * 48,
            database_url="postgresql://user:pw@example.invalid:5432/db",
            auto_create_tables=True,
        )
        assert production.auto_create_tables is True

    def test_development_creates_tables(self):
        from app.core.config import Settings

        assert Settings(environment="development").auto_create_tables is True

    def test_postgres_urls_are_routed_to_the_installed_driver(self):
        """Neon hands out `postgresql://`; we ship psycopg 3.

        Both spellings a provider might give are accepted, because the failure
        mode otherwise is a driver-not-found traceback at boot with a connection
        string that looks perfectly correct.
        """
        from app.core.config import Settings

        for given in (
            "postgres://u:p@host/db",
            "postgresql://u:p@host/db",
        ):
            resolved = Settings(
                environment="production",
                secret_key="a" * 48,
                database_url=given,
            ).sqlalchemy_url
            assert resolved.startswith("postgresql+psycopg://")
