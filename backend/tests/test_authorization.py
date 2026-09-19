"""Multi-tenancy: one workspace's data must be unreachable from another.

These tests exist because tenancy bugs are silent. Nothing fails, nothing logs
an error — one business simply sees another's revenue. Every workspace-scoped
resource is therefore probed with a *valid* id belonging to a different tenant,
which is the exact shape of the bug that matters.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def two_tenants(client: TestClient, account, known_answer_csv):
    """Two independent accounts, the first holding a dataset and an analysis."""
    alice = account()
    bob = account()

    upload = client.post(
        f"/api/v1/workspaces/{alice['workspace']['id']}/datasets",
        headers=alice["headers"],
        files={"file": ("sales.csv", known_answer_csv, "text/csv")},
    )
    assert upload.status_code == 201, upload.text
    dataset = upload.json()

    confirm = client.post(
        f"/api/v1/workspaces/{alice['workspace']['id']}/datasets/{dataset['id']}/confirm",
        headers=alice["headers"],
        json={"columns": [], "grain": "month", "start_analysis": True},
    )
    assert confirm.status_code == 200, confirm.text

    return {
        "alice": alice,
        "bob": bob,
        "dataset_id": dataset["id"],
        "analysis_id": confirm.json()["analysis"]["id"],
    }


class TestWorkspaceIsolation:
    def test_workspace_list_shows_only_your_own(self, client: TestClient, two_tenants):
        response = client.get(
            "/api/v1/workspaces", headers=two_tenants["bob"]["headers"]
        )
        ids = {w["id"] for w in response.json()}
        assert two_tenants["alice"]["workspace"]["id"] not in ids

    def test_cannot_read_another_workspace(self, client: TestClient, two_tenants):
        response = client.get(
            f"/api/v1/workspaces/{two_tenants['alice']['workspace']['id']}",
            headers=two_tenants["bob"]["headers"],
        )
        # 404, not 403: a 403 would confirm the workspace exists.
        assert response.status_code == 404

    def test_cannot_modify_another_workspace(self, client: TestClient, two_tenants):
        response = client.patch(
            f"/api/v1/workspaces/{two_tenants['alice']['workspace']['id']}",
            headers=two_tenants["bob"]["headers"],
            json={"name": "Hijacked"},
        )
        assert response.status_code == 404

    def test_cannot_read_another_workspaces_overview(self, client: TestClient, two_tenants):
        response = client.get(
            f"/api/v1/workspaces/{two_tenants['alice']['workspace']['id']}/overview",
            headers=two_tenants["bob"]["headers"],
        )
        assert response.status_code == 404


class TestResourceIsolation:
    """A valid resource id must not resolve under the wrong workspace."""

    def test_dataset_not_visible_across_tenants(self, client: TestClient, two_tenants):
        alice, bob = two_tenants["alice"], two_tenants["bob"]

        # Through Alice's workspace path, using Bob's token.
        assert client.get(
            f"/api/v1/workspaces/{alice['workspace']['id']}/datasets/{two_tenants['dataset_id']}",
            headers=bob["headers"],
        ).status_code == 404

        # Through Bob's own workspace path, using Alice's dataset id.
        assert client.get(
            f"/api/v1/workspaces/{bob['workspace']['id']}/datasets/{two_tenants['dataset_id']}",
            headers=bob["headers"],
        ).status_code == 404

    def test_dataset_list_is_scoped(self, client: TestClient, two_tenants):
        response = client.get(
            f"/api/v1/workspaces/{two_tenants['bob']['workspace']['id']}/datasets",
            headers=two_tenants["bob"]["headers"],
        )
        assert response.status_code == 200
        assert response.json()["items"] == []
        assert response.json()["total"] == 0

    def test_cannot_delete_another_tenants_dataset(self, client: TestClient, two_tenants):
        response = client.delete(
            f"/api/v1/workspaces/{two_tenants['bob']['workspace']['id']}/datasets/{two_tenants['dataset_id']}",
            headers=two_tenants["bob"]["headers"],
        )
        assert response.status_code == 404

        # And it must still be there for its real owner.
        assert client.get(
            f"/api/v1/workspaces/{two_tenants['alice']['workspace']['id']}/datasets/{two_tenants['dataset_id']}",
            headers=two_tenants["alice"]["headers"],
        ).status_code == 200

    def test_cannot_read_another_tenants_analysis(self, client: TestClient, two_tenants):
        response = client.get(
            f"/api/v1/workspaces/{two_tenants['bob']['workspace']['id']}/analyses/{two_tenants['analysis_id']}",
            headers=two_tenants["bob"]["headers"],
        )
        assert response.status_code == 404

    def test_cannot_start_an_analysis_on_another_tenants_dataset(
        self, client: TestClient, two_tenants
    ):
        response = client.post(
            f"/api/v1/workspaces/{two_tenants['bob']['workspace']['id']}/analyses",
            headers=two_tenants["bob"]["headers"],
            json={"dataset_id": two_tenants["dataset_id"]},
        )
        assert response.status_code == 404

    def test_cannot_ask_questions_against_another_tenants_dataset(
        self, client: TestClient, two_tenants
    ):
        response = client.post(
            f"/api/v1/workspaces/{two_tenants['bob']['workspace']['id']}/chat/ask",
            headers=two_tenants["bob"]["headers"],
            json={
                "question": "What is my revenue?",
                "dataset_id": two_tenants["dataset_id"],
            },
        )
        assert response.status_code == 404


class TestUnauthenticated:
    @pytest.mark.parametrize(
        "method,path",
        [
            ("get", "/api/v1/workspaces"),
            ("get", "/api/v1/auth/session"),
            ("get", "/api/v1/ai/status"),
        ],
    )
    def test_protected_routes_require_authentication(
        self, client: TestClient, method: str, path: str
    ):
        assert getattr(client, method)(path).status_code == 401

    def test_workspace_routes_require_authentication(self, client: TestClient, owner):
        workspace_id = owner["workspace"]["id"]
        for path in (
            f"/api/v1/workspaces/{workspace_id}",
            f"/api/v1/workspaces/{workspace_id}/overview",
            f"/api/v1/workspaces/{workspace_id}/datasets",
            f"/api/v1/workspaces/{workspace_id}/insights",
            f"/api/v1/workspaces/{workspace_id}/anomalies",
            f"/api/v1/workspaces/{workspace_id}/reports",
        ):
            assert client.get(path).status_code == 401, path

    def test_health_is_public(self, client: TestClient):
        assert client.get("/api/v1/health").status_code == 200


class TestNonexistentResources:
    def test_unknown_workspace_is_not_found(self, client: TestClient, owner):
        response = client.get(
            f"/api/v1/workspaces/{uuid.uuid4()}", headers=owner["headers"]
        )
        assert response.status_code == 404

    def test_malformed_uuid_is_rejected(self, client: TestClient, owner):
        response = client.get("/api/v1/workspaces/not-a-uuid", headers=owner["headers"])
        assert response.status_code == 422
