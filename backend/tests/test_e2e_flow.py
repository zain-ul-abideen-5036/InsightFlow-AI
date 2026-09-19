"""End-to-end: the complete user journey through the API.

Signup -> upload -> review fields -> analyse -> dashboard -> investigate ->
ask a question -> generate a report.

AI is disabled for the suite, so these also prove the product is fully
functional without any model: every assertion below is satisfied by the
deterministic engine alone.
"""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app.analytics.anomalies import detect_anomalies
from app.analytics.timeseries import resample_metric
from app.analytics.types import Grain


def wait_for_analysis(
    client: TestClient, headers, workspace_id: str, analysis_id: str, timeout: float = 120.0
) -> dict:
    """Poll until the background analysis finishes, exactly as the UI does."""
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        response = client.get(
            f"/api/v1/workspaces/{workspace_id}/analyses/{analysis_id}", headers=headers
        )
        assert response.status_code == 200, response.text
        last = response.json()
        if last["status"] in {"completed", "failed", "cancelled"}:
            return last
        time.sleep(0.25)
    pytest.fail(f"Analysis did not finish within {timeout}s (last state: {last})")


@pytest.fixture
def analysed_workspace(client: TestClient, owner, known_answer_csv):
    """A workspace with a confirmed dataset and a completed analysis."""
    workspace_id = owner["workspace"]["id"]

    dataset = client.post(
        f"/api/v1/workspaces/{workspace_id}/datasets",
        headers=owner["headers"],
        files={"file": ("sales.csv", known_answer_csv, "text/csv")},
    ).json()

    confirmed = client.post(
        f"/api/v1/workspaces/{workspace_id}/datasets/{dataset['id']}/confirm",
        headers=owner["headers"],
        json={"columns": [], "grain": "month", "start_analysis": True},
    ).json()
    analysis = confirmed["analysis"]
    assert analysis is not None

    final = wait_for_analysis(client, owner["headers"], workspace_id, analysis["id"])
    assert final["status"] == "completed", final
    return {
        "owner": owner,
        "workspace_id": workspace_id,
        "dataset": dataset,
        "analysis": final,
    }


class TestFullJourney:
    def test_signup_upload_analyse_dashboard(self, client: TestClient, analysed_workspace):
        env = analysed_workspace
        analysis = env["analysis"]

        assert analysis["progress"] == 100
        assert analysis["duration_ms"] is not None
        assert analysis["summary"]["headline"]
        # Every stage the UI displayed must have actually run.
        assert all(stage["status"] == "done" for stage in analysis["stages"])
        assert len(analysis["stages"]) == 6

    def test_analysis_progress_is_real(self, client: TestClient, analysed_workspace):
        """Stage labels shown to the user correspond to work that happened."""
        stages = [s["key"] for s in analysed_workspace["analysis"]["stages"]]
        assert stages == [
            "profiling", "metrics", "trends", "segments", "anomalies", "insights",
        ]
        for stage in analysed_workspace["analysis"]["stages"]:
            assert stage["started_at"] is not None

    def test_overview_returns_correct_kpis(self, client: TestClient, analysed_workspace):
        env = analysed_workspace
        response = client.get(
            f"/api/v1/workspaces/{env['workspace_id']}/overview",
            headers=env["owner"]["headers"],
        )
        assert response.status_code == 200
        body = response.json()

        assert body["has_data"] is True
        assert body["dataset_count"] == 1

        metrics = {m["key"]: m for m in body["metrics"]}
        # February figures, compared with January.
        assert metrics["revenue"]["value"] == pytest.approx(1200.0)
        assert metrics["revenue"]["previous_value"] == pytest.approx(1000.0)
        assert metrics["revenue"]["change_pct"] == pytest.approx(20.0)

        # Revenue must be the first card a business owner sees.
        assert body["metrics"][0]["key"] == "revenue"

    def test_every_metric_can_be_traced(self, client: TestClient, analysed_workspace):
        env = analysed_workspace
        body = client.get(
            f"/api/v1/workspaces/{env['workspace_id']}/overview",
            headers=env["owner"]["headers"],
        ).json()
        for metric in body["metrics"]:
            assert metric["provenance"].get("calculation"), metric["key"]

    def test_analysis_results_contain_every_section(
        self, client: TestClient, analysed_workspace
    ):
        env = analysed_workspace
        response = client.get(
            f"/api/v1/workspaces/{env['workspace_id']}/analyses/{env['analysis']['id']}/results",
            headers=env["owner"]["headers"],
        )
        assert response.status_code == 200
        sections = response.json()["results"]
        for key in (
            "dataset", "overview", "comparison", "trends",
            "segments", "customers", "anomalies", "insights",
        ):
            assert key in sections, f"missing section: {key}"

    def test_insights_are_generated_with_evidence(
        self, client: TestClient, analysed_workspace
    ):
        env = analysed_workspace
        response = client.get(
            f"/api/v1/workspaces/{env['workspace_id']}/insights",
            headers=env["owner"]["headers"],
        )
        assert response.status_code == 200
        items = response.json()["items"]
        assert items, "an analysis with a 20% revenue rise should produce insights"

        for insight in items:
            assert insight["title"]
            assert insight["summary"]
            assert insight["severity"] in {"info", "low", "medium", "high", "critical"}
            # The "View evidence" promise: every card must be traceable.
            assert insight["evidence"], insight["title"]
            for item in insight["evidence"]:
                assert "label" in item and "calculation" in item

    def test_insight_can_be_dismissed(self, client: TestClient, analysed_workspace):
        env = analysed_workspace
        insights = client.get(
            f"/api/v1/workspaces/{env['workspace_id']}/insights",
            headers=env["owner"]["headers"],
        ).json()["items"]

        target = insights[0]["id"]
        assert client.post(
            f"/api/v1/workspaces/{env['workspace_id']}/insights/{target}/dismiss",
            headers=env["owner"]["headers"],
        ).status_code == 200

        remaining = client.get(
            f"/api/v1/workspaces/{env['workspace_id']}/insights",
            headers=env["owner"]["headers"],
        ).json()["items"]
        assert target not in {i["id"] for i in remaining}

    def test_ask_a_question_and_get_evidence(self, client: TestClient, analysed_workspace):
        env = analysed_workspace
        response = client.post(
            f"/api/v1/workspaces/{env['workspace_id']}/chat/ask",
            headers=env["owner"]["headers"],
            json={"question": "Why did revenue change?"},
        )
        assert response.status_code == 201, response.text
        body = response.json()
        message = body["message"]

        assert message["role"] == "assistant"
        assert message["content"]
        assert message["plan"]["intent"] == "explain_change"
        # AI is disabled in tests, so this must be a deterministic answer.
        assert message["is_fallback"] is True
        assert message["evidence"]["items"], "evidence must be persisted for the answer"
        assert message["structured"]["confidence"] in {"low", "moderate", "high"}

    def test_answer_cites_the_correct_figures(self, client: TestClient, analysed_workspace):
        env = analysed_workspace
        body = client.post(
            f"/api/v1/workspaces/{env['workspace_id']}/chat/ask",
            headers=env["owner"]["headers"],
            json={"question": "Compare this month with last month."},
        ).json()

        values = {
            item["label"]: item["value"] for item in body["message"]["evidence"]["items"]
        }
        assert values.get("Revenue in Feb 2025") == pytest.approx(1200.0)
        assert values.get("Revenue in Jan 2025") == pytest.approx(1000.0)
        assert values.get("Revenue change") == pytest.approx(20.0)

    def test_conversation_is_persisted(self, client: TestClient, analysed_workspace):
        env = analysed_workspace
        first = client.post(
            f"/api/v1/workspaces/{env['workspace_id']}/chat/ask",
            headers=env["owner"]["headers"],
            json={"question": "What are my best products?"},
        ).json()
        session_id = first["session"]["id"]

        client.post(
            f"/api/v1/workspaces/{env['workspace_id']}/chat/ask",
            headers=env["owner"]["headers"],
            json={"question": "Which region is biggest?", "session_id": session_id},
        )

        detail = client.get(
            f"/api/v1/workspaces/{env['workspace_id']}/chat/sessions/{session_id}",
            headers=env["owner"]["headers"],
        ).json()
        # Two questions and two answers.
        assert len(detail["messages"]) == 4

    def test_report_generation(self, client: TestClient, analysed_workspace):
        env = analysed_workspace
        response = client.post(
            f"/api/v1/workspaces/{env['workspace_id']}/reports",
            headers=env["owner"]["headers"],
            json={"analysis_id": env["analysis"]["id"]},
        )
        assert response.status_code == 201, response.text
        report = response.json()

        assert report["executive_summary"]
        assert report["period_label"] == "Feb 2025 (compared with Jan 2025)"
        keys = [section["key"] for section in report["sections"]]
        assert keys == [
            "summary", "kpis", "trends", "segments",
            "customers", "insights", "anomalies", "data",
        ]

        kpis = next(s for s in report["sections"] if s["key"] == "kpis")
        revenue = next(i for i in kpis["items"] if i["key"] == "revenue")
        assert revenue["value"] == pytest.approx(1200.0)

    def test_report_is_a_snapshot(self, client: TestClient, analysed_workspace):
        """A report must not silently change its own figures later."""
        env = analysed_workspace
        report = client.post(
            f"/api/v1/workspaces/{env['workspace_id']}/reports",
            headers=env["owner"]["headers"],
            json={"analysis_id": env["analysis"]["id"]},
        ).json()

        client.delete(
            f"/api/v1/workspaces/{env['workspace_id']}/datasets/{env['dataset']['id']}",
            headers=env["owner"]["headers"],
        )

        fetched = client.get(
            f"/api/v1/workspaces/{env['workspace_id']}/reports/{report['id']}",
            headers=env["owner"]["headers"],
        )
        assert fetched.status_code == 200
        assert fetched.json()["executive_summary"] == report["executive_summary"]

    def test_logout_then_login_again(self, client: TestClient, analysed_workspace):
        env = analysed_workspace
        owner = env["owner"]

        assert client.post(
            "/api/v1/auth/logout", headers=owner["headers"]
        ).status_code == 200

        again = client.post(
            "/api/v1/auth/login",
            json={"email": owner["email"], "password": owner["password"]},
        )
        assert again.status_code == 200
        new_headers = {"Authorization": f"Bearer {again.json()['access_token']}"}

        # The data must still be there after signing back in.
        overview = client.get(
            f"/api/v1/workspaces/{env['workspace_id']}/overview", headers=new_headers
        )
        assert overview.status_code == 200
        assert overview.json()["has_data"] is True


class TestEmptyStates:
    def test_new_workspace_reports_no_data(self, client: TestClient, owner):
        response = client.get(
            f"/api/v1/workspaces/{owner['workspace']['id']}/overview",
            headers=owner["headers"],
        )
        assert response.status_code == 200
        body = response.json()
        assert body["has_data"] is False
        assert body["latest_analysis"] is None
        assert body["metrics"] == []

    def test_question_without_data_explains_what_to_do(self, client: TestClient, owner):
        response = client.post(
            f"/api/v1/workspaces/{owner['workspace']['id']}/chat/ask",
            headers=owner["headers"],
            json={"question": "How is my business doing?"},
        )
        assert response.status_code == 422
        error = response.json()["error"]
        assert "no analysed dataset" in error["message"].lower()
        assert "upload" in error["hint"].lower()

    def test_report_without_analysis_explains_what_to_do(self, client: TestClient, owner):
        response = client.post(
            f"/api/v1/workspaces/{owner['workspace']['id']}/reports",
            headers=owner["headers"],
            json={},
        )
        assert response.status_code == 422
        assert "upload" in response.json()["error"]["hint"].lower()


class TestAnomalyInvestigation:
    @pytest.fixture
    def workspace_with_anomaly(self, client: TestClient, owner, daily_series_csv):
        workspace_id = owner["workspace"]["id"]
        dataset = client.post(
            f"/api/v1/workspaces/{workspace_id}/datasets",
            headers=owner["headers"],
            files={"file": ("daily.csv", daily_series_csv, "text/csv")},
        ).json()
        analysis = client.post(
            f"/api/v1/workspaces/{workspace_id}/datasets/{dataset['id']}/confirm",
            headers=owner["headers"],
            json={"columns": [], "grain": "day", "start_analysis": True},
        ).json()["analysis"]
        final = wait_for_analysis(client, owner["headers"], workspace_id, analysis["id"])
        assert final["status"] == "completed", final
        return {"owner": owner, "workspace_id": workspace_id, "analysis": final}

    def test_planted_anomaly_is_detected(self, client: TestClient, workspace_with_anomaly):
        env = workspace_with_anomaly
        response = client.get(
            f"/api/v1/workspaces/{env['workspace_id']}/anomalies",
            headers=env["owner"]["headers"],
        )
        assert response.status_code == 200
        items = response.json()["items"]
        assert items, "the 60% collapse on day 45 should be detected"

        # 2025-01-01 + 44 days = 2025-02-14
        dates = {item["occurred_at"][:10] for item in items}
        assert "2025-02-14" in dates

        planted = next(i for i in items if i["occurred_at"][:10] == "2025-02-14")
        assert planted["direction"] == "down"
        assert planted["severity"] in {"high", "critical"}
        assert planted["deviation_pct"] < -40

    def test_investigation_produces_evidence_not_assertions(
        self, client: TestClient, workspace_with_anomaly
    ):
        env = workspace_with_anomaly
        anomalies = client.get(
            f"/api/v1/workspaces/{env['workspace_id']}/anomalies",
            headers=env["owner"]["headers"],
        ).json()["items"]

        target = next(a for a in anomalies if a["occurred_at"][:10] == "2025-02-14")
        response = client.post(
            f"/api/v1/workspaces/{env['workspace_id']}/anomalies/{target['id']}/investigate",
            headers=env["owner"]["headers"],
        )
        assert response.status_code == 200, response.text
        body = response.json()

        investigation = body["investigation"]
        assert investigation["headline"]
        assert investigation["what_happened"]
        assert investigation["confidence"] in {"low", "moderate", "high"}
        assert investigation["recommended_checks"]

        # Explanations must be framed as hypotheses, never as causes.
        for item in investigation["possible_explanations"]:
            assert item["kind"] == "possible_explanation"

        from app.ai.guardrails import check_causal_language

        prose = " ".join(
            [investigation["headline"]]
            + [f["statement"] for f in investigation["what_happened"]]
            + [f["statement"] for f in investigation["possible_explanations"]]
        )
        ok, offending = check_causal_language(prose)
        assert ok, f"investigation asserted a cause: {offending}"

    def test_investigation_is_cached(self, client: TestClient, workspace_with_anomaly):
        env = workspace_with_anomaly
        anomalies = client.get(
            f"/api/v1/workspaces/{env['workspace_id']}/anomalies",
            headers=env["owner"]["headers"],
        ).json()["items"]
        target = anomalies[0]["id"]
        url = f"/api/v1/workspaces/{env['workspace_id']}/anomalies/{target}/investigate"

        first = client.post(url, headers=env["owner"]["headers"]).json()
        second = client.post(url, headers=env["owner"]["headers"]).json()
        assert second["anomaly"]["investigated_at"] is not None
        assert first["investigation"]["headline"] == second["investigation"]["headline"]

    def test_evidence_is_returned_without_waiting_for_the_model(
        self, client: TestClient, workspace_with_anomaly
    ):
        """``narrate=false`` must produce a complete investigation on its own.

        This is the contract behind the two-phase investigation page: the
        evidence is rendered immediately and the prose is fetched separately.
        If the fast leg ever returned a partial result, the page would show a
        half-finished answer rather than a plainly-worded complete one.
        """
        env = workspace_with_anomaly
        anomalies = client.get(
            f"/api/v1/workspaces/{env['workspace_id']}/anomalies",
            headers=env["owner"]["headers"],
        ).json()["items"]
        target = anomalies[0]["id"]
        url = f"/api/v1/workspaces/{env['workspace_id']}/anomalies/{target}/investigate"

        fast = client.post(f"{url}?narrate=false", headers=env["owner"]["headers"])
        assert fast.status_code == 200, fast.text
        body = fast.json()

        assert body["investigation"]["headline"]
        assert body["investigation"]["what_happened"]
        assert body["narrative"]["headline"]
        assert body["narrative"]["confidence"] in {"low", "moderate", "high"}
        # Nothing was generated, so nothing may be attributed to a model.
        assert body["is_fallback"] is True
        assert body["provider"] is None

        # With AI switched off — which is how the suite runs — there is no
        # written version to wait for, and saying otherwise would leave the
        # interface spinning for something that will never arrive.
        assert body["narrative_pending"] is False

    def test_a_rehydrated_investigation_carries_its_evidence(
        self, client: TestClient, workspace_with_anomaly
    ):
        """The cached investigation must survive the JSON round trip.

        The second leg of the two-phase flow rebuilds the investigation from the
        stored dict rather than recomputing it. If that rehydration dropped the
        evidence, the guardrails would have nothing to validate generated prose
        against and would reject every figure in it.
        """
        from app.analytics.investigation import Investigation

        env = workspace_with_anomaly
        anomalies = client.get(
            f"/api/v1/workspaces/{env['workspace_id']}/anomalies",
            headers=env["owner"]["headers"],
        ).json()["items"]
        target = anomalies[0]["id"]

        stored = client.post(
            f"/api/v1/workspaces/{env['workspace_id']}/anomalies/{target}/investigate",
            headers=env["owner"]["headers"],
        ).json()["investigation"]

        rebuilt = Investigation.from_dict(stored)

        assert rebuilt.headline == stored["headline"]
        assert rebuilt.confidence == stored["confidence"]
        assert len(rebuilt.what_happened) == len(stored["what_happened"])
        assert rebuilt.to_dict() == stored

        original_evidence = sum(
            len(f["evidence"])
            for key in (
                "what_happened",
                "where_it_happened",
                "supporting_evidence",
                "possible_explanations",
            )
            for f in stored[key]
        )
        assert len(rebuilt.all_evidence()) == original_evidence


class TestFailureHandling:
    def test_analysis_of_an_undated_dataset_still_succeeds(
        self, client: TestClient, owner
    ):
        """No dates means no trends, but the metrics that are possible must work."""
        workspace_id = owner["workspace"]["id"]
        csv = b"product,revenue,quantity\nWidget,100.50,2\nGadget,200.25,3\nDoohickey,50.00,1\n"

        dataset = client.post(
            f"/api/v1/workspaces/{workspace_id}/datasets",
            headers=owner["headers"],
            files={"file": ("nodate.csv", csv, "text/csv")},
        ).json()
        assert dataset["profile"]["capabilities"]["time_series"]["available"] is False

        analysis = client.post(
            f"/api/v1/workspaces/{workspace_id}/datasets/{dataset['id']}/confirm",
            headers=owner["headers"],
            json={"columns": [], "start_analysis": True},
        ).json()["analysis"]
        final = wait_for_analysis(client, owner["headers"], workspace_id, analysis["id"])

        assert final["status"] == "completed", final
        results = client.get(
            f"/api/v1/workspaces/{workspace_id}/analyses/{analysis['id']}/results",
            headers=owner["headers"],
        ).json()["results"]

        assert results["overview"]["metrics"]["revenue"]["value"] == pytest.approx(350.75)
        assert results["anomalies"]["available"] is False
        assert results["anomalies"]["reason"]

    def test_duplicate_running_analysis_rejected(
        self, client: TestClient, owner, daily_series_csv
    ):
        workspace_id = owner["workspace"]["id"]
        dataset = client.post(
            f"/api/v1/workspaces/{workspace_id}/datasets",
            headers=owner["headers"],
            files={"file": ("daily.csv", daily_series_csv, "text/csv")},
        ).json()

        client.post(
            f"/api/v1/workspaces/{workspace_id}/datasets/{dataset['id']}/confirm",
            headers=owner["headers"],
            json={"columns": [], "start_analysis": False},
        )

        first = client.post(
            f"/api/v1/workspaces/{workspace_id}/analyses",
            headers=owner["headers"],
            json={"dataset_id": dataset["id"]},
        )
        assert first.status_code == 201

        second = client.post(
            f"/api/v1/workspaces/{workspace_id}/analyses",
            headers=owner["headers"],
            json={"dataset_id": dataset["id"]},
        )
        # Either it is still running (409) or it already finished (201).
        assert second.status_code in {201, 409}
        if second.status_code == 409:
            assert second.json()["error"]["details"]["analysis_id"]

        wait_for_analysis(client, owner["headers"], workspace_id, first.json()["id"])


class TestNovaMartNarrative:
    """The demo dataset must actually demonstrate the product.

    These assertions pin the planted story: if the generator or the engine
    drifts, the demo stops being a demo and these fail.
    """

    def test_august_decline_is_found_and_attributed(self, novamart_context):
        from app.analytics.investigation import investigate_metric_change
        from app.analytics.timeseries import last_two_periods

        ctx, _ = novamart_context
        current, previous, current_label, previous_label = last_two_periods(ctx, Grain.MONTH)
        assert current_label == "Aug 2026"
        assert previous_label == "Jul 2026"

        investigation = investigate_metric_change(
            ctx, "revenue", current, previous, current_label, previous_label
        )
        assert "fell" in investigation.headline

        # The stocked-out product must be the leading contributor.
        where = " ".join(f.statement for f in investigation.where_it_happened)
        assert "Nova Air Purifier" in where

        # The inventory signal must be found in the data.
        supporting = " ".join(f.statement for f in investigation.supporting_evidence)
        assert "zero available units" in supporting

        # And it must be offered as a coincidence, not a cause.
        explanations = " ".join(f.statement for f in investigation.possible_explanations)
        assert "coincide" in explanations
        assert "cannot confirm" in explanations

    def test_anomaly_detection_finds_the_flash_sale(self, novamart_context):
        ctx, _ = novamart_context
        series = {
            key: resample_metric(ctx, key, Grain.DAY)
            for key in ("revenue", "orders", "units_sold")
        }
        anomalies = detect_anomalies(ctx, series)
        periods = {a.period for a in anomalies}
        assert "2026-03-14" in periods, "the planted flash sale should be detected"

    def test_related_metrics_collapse_into_one_event(self, novamart_context):
        """One business event must not be reported as four anomalies."""
        ctx, _ = novamart_context
        series = {
            key: resample_metric(ctx, key, Grain.DAY)
            for key in ("revenue", "orders", "units_sold", "customers")
        }
        anomalies = detect_anomalies(ctx, series)
        flash_sale = [a for a in anomalies if a.period == "2026-03-14"]
        assert len(flash_sale) == 1
        assert flash_sale[0].context.get("also_affected")
