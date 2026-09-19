"""The public demo.

An unauthenticated endpoint that creates an account and writes files to disk is
worth being suspicious of. These tests pin the properties that make it
acceptable: each visitor is isolated from every other, the demo data really is
generated rather than borrowed from somewhere, no credential is ever handed out,
and expired sessions are reclaimed along with their files.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.models import User, Workspace
from app.db.session import SessionLocal


@pytest.fixture
def demo(client: TestClient):
    response = client.post("/api/v1/auth/demo")
    assert response.status_code == 201, response.text
    body = response.json()
    return {
        "body": body,
        "headers": {"Authorization": f"Bearer {body['access_token']}"},
        "workspace": body["workspaces"][0],
    }


class TestDemoSession:
    def test_it_returns_a_usable_session(self, demo):
        assert demo["body"]["access_token"]
        assert demo["body"]["refresh_token"]
        assert demo["workspace"]["name"] == "NovaMart"

    def test_it_never_reveals_a_password(self, demo):
        """There is no demo credential to find, in the response or anywhere else.

        The visitor is signed in by the session this request returns. Shipping a
        shared username and password — in the source, the README, or the
        response body — would be a permanent public account on a real database.
        """
        serialised = str(demo["body"]).lower()
        for leak in ("password", "secret", "credential"):
            assert leak not in serialised

    def test_the_dataset_is_already_loaded(self, client: TestClient, demo):
        response = client.get(
            f"/api/v1/workspaces/{demo['workspace']['id']}/datasets",
            headers=demo["headers"],
        )
        assert response.status_code == 200
        datasets = response.json()["items"]
        assert len(datasets) == 1
        assert datasets[0]["is_demo"] is True
        assert datasets[0]["row_count"] > 1000

    def test_onboarding_is_already_complete(self, demo):
        """Nothing to ask: the data is loaded and the schema is confirmed."""
        assert demo["body"]["user"]["onboarding_completed"] is True

    def test_an_analysis_is_running_or_done(self, client: TestClient, demo):
        response = client.get(
            f"/api/v1/workspaces/{demo['workspace']['id']}/analyses",
            headers=demo["headers"],
        )
        assert response.status_code == 200
        analyses = response.json()["items"]
        assert len(analyses) == 1
        assert analyses[0]["status"] in {"queued", "running", "completed"}

    def test_two_visitors_cannot_see_each_other(self, client: TestClient):
        """Every demo is its own tenant, enforced the same way real ones are."""
        first = client.post("/api/v1/auth/demo").json()
        second = client.post("/api/v1/auth/demo").json()

        first_workspace = first["workspaces"][0]["id"]
        second_workspace = second["workspaces"][0]["id"]
        assert first_workspace != second_workspace

        response = client.get(
            f"/api/v1/workspaces/{first_workspace}",
            headers={"Authorization": f"Bearer {second['access_token']}"},
        )
        # 404 rather than 403, exactly as for a non-demo tenant.
        assert response.status_code == 404

    def test_it_can_be_switched_off(self, client: TestClient, monkeypatch):
        from app.seed import demo as demo_module

        monkeypatch.setattr(demo_module.settings, "demo_data_enabled", False)
        response = client.post("/api/v1/auth/demo")
        assert response.status_code == 404
        assert "demo" in response.json()["error"]["message"].lower()


class TestExpiry:
    def test_expired_sessions_are_purged_with_their_files(self, client: TestClient):
        from app.seed.demo import RETIRED_SUFFIX, purge_expired_demo_sessions

        body = client.post("/api/v1/auth/demo").json()
        workspace_id = body["workspaces"][0]["id"]
        directory = settings.uploads_path / workspace_id
        assert directory.exists(), "the demo should have written its dataset to disk"

        # Age it past the retention window.
        with SessionLocal() as db:
            workspace = db.get(Workspace, uuid.UUID(workspace_id))
            workspace.created_at = datetime.now(timezone.utc) - timedelta(
                hours=settings.demo_session_hours + 1
            )
            db.commit()

        with SessionLocal() as db:
            assert purge_expired_demo_sessions(db) == 1

        with SessionLocal() as db:
            assert db.get(Workspace, uuid.UUID(workspace_id)) is None
            assert db.query(User).filter(User.is_demo.is_(True)).count() == 0

        # The demo's own analysis may still hold the cached parquet open, which
        # on Windows blocks the unlink. The directory must then be *marked*
        # rather than left looking live, so that a later sweep collects it.
        marked = directory.with_name(directory.name + RETIRED_SUFFIX)
        assert not directory.exists() or marked.exists(), (
            "deleted workspace files were neither removed nor marked for removal"
        )

    def test_marked_directories_are_collected_on_a_later_sweep(self):
        """The self-healing property, tested directly.

        Whatever a purge could not delete is picked up next time, once whatever
        held the file has let go.
        """
        from app.seed.demo import RETIRED_SUFFIX, sweep_retired_upload_dirs

        retired = settings.uploads_path / f"{uuid.uuid4()}{RETIRED_SUFFIX}"
        retired.mkdir(parents=True, exist_ok=True)
        (retired / "leftover.csv").write_text("a,b\n1,2\n", encoding="utf-8")

        assert sweep_retired_upload_dirs() >= 1
        assert not retired.exists()

    def test_the_sweep_only_touches_marked_directories(self, account):
        """The safety property, and the reason the marker exists at all.

        The sweep must never infer that a directory is deletable by comparing
        the disk against the database. A ``DATABASE_URL`` pointed at an empty
        database would then make every real customer's files look orphaned, and
        the clean-up would delete all of them. Only what a purge explicitly
        marked is ever removed.
        """
        from app.seed.demo import sweep_retired_upload_dirs

        real = account()
        live = settings.uploads_path / real["workspace"]["id"]
        live.mkdir(parents=True, exist_ok=True)
        (live / "mine.csv").write_text("a,b\n1,2\n", encoding="utf-8")

        unknown = settings.uploads_path / str(uuid.uuid4())
        unknown.mkdir(parents=True, exist_ok=True)
        (unknown / "not-mine.csv").write_text("a,b\n1,2\n", encoding="utf-8")

        sweep_retired_upload_dirs()

        assert (live / "mine.csv").exists(), "a live workspace's files were deleted"
        assert (unknown / "not-mine.csv").exists(), (
            "an unmarked directory was deleted on inference alone"
        )

    def test_a_live_session_is_left_alone(self, client: TestClient):
        from app.seed.demo import purge_expired_demo_sessions

        body = client.post("/api/v1/auth/demo").json()
        workspace_id = body["workspaces"][0]["id"]

        with SessionLocal() as db:
            assert purge_expired_demo_sessions(db) == 0

        response = client.get(
            f"/api/v1/workspaces/{workspace_id}",
            headers={"Authorization": f"Bearer {body['access_token']}"},
        )
        assert response.status_code == 200

    def test_real_accounts_are_never_purged(self, client: TestClient, account):
        """The flag is the whole safety property. Nothing else may be deleted."""
        from app.seed.demo import purge_expired_demo_sessions

        real = account()
        with SessionLocal() as db:
            workspace = db.get(Workspace, uuid.UUID(real["workspace"]["id"]))
            # Older than any demo would ever be.
            workspace.created_at = datetime.now(timezone.utc) - timedelta(days=400)
            db.commit()

        with SessionLocal() as db:
            assert purge_expired_demo_sessions(db) == 0

        response = client.get(
            f"/api/v1/workspaces/{real['workspace']['id']}", headers=real["headers"]
        )
        assert response.status_code == 200
