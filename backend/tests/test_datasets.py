"""Dataset upload, validation, profiling, and schema inference."""

from __future__ import annotations

import io

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.analytics.ingestion import read_upload
from app.analytics.profiling import profile_dataset
from app.analytics.schema_inference import infer_schema, normalize_name
from app.analytics.types import SemanticRole
from app.core.errors import FileValidationError


def upload(client: TestClient, owner, content: bytes, filename="sales.csv"):
    return client.post(
        f"/api/v1/workspaces/{owner['workspace']['id']}/datasets",
        headers=owner["headers"],
        files={"file": (filename, content, "text/csv")},
    )


class TestUploadValidation:
    def test_valid_csv_accepted(self, client: TestClient, owner, known_answer_csv):
        response = upload(client, owner, known_answer_csv)
        assert response.status_code == 201
        body = response.json()
        assert body["row_count"] == 4
        assert body["column_count"] == 10
        assert body["status"] == "ready"
        assert len(body["preview_rows"]) == 4

    def test_empty_file_rejected_with_a_useful_message(self, client: TestClient, owner):
        response = upload(client, owner, b"")
        assert response.status_code == 422
        assert "empty" in response.json()["error"]["message"].lower()

    def test_header_only_file_rejected(self, client: TestClient, owner):
        response = upload(client, owner, b"a,b,c\n")
        assert response.status_code == 422
        assert response.json()["error"]["hint"]

    def test_single_row_rejected(self, client: TestClient, owner):
        response = upload(client, owner, b"date,revenue\n2025-01-01,100\n")
        assert response.status_code == 422
        assert "one row" in response.json()["error"]["message"]

    def test_unsupported_extension_rejected(self, client: TestClient, owner):
        response = client.post(
            f"/api/v1/workspaces/{owner['workspace']['id']}/datasets",
            headers=owner["headers"],
            files={"file": ("notes.txt", b"hello world", "text/plain")},
        )
        assert response.status_code == 422
        assert ".txt" in response.json()["error"]["message"]

    def test_binary_masquerading_as_csv_rejected(self, client: TestClient, owner):
        response = upload(client, owner, b"\x00\x01\x02\x03binary", "evil.csv")
        assert response.status_code == 422

    def test_xlsx_extension_with_non_xlsx_content_rejected(
        self, client: TestClient, owner
    ):
        response = client.post(
            f"/api/v1/workspaces/{owner['workspace']['id']}/datasets",
            headers=owner["headers"],
            files={"file": ("book.xlsx", b"not,really,excel\n1,2,3\n", "application/vnd.ms-excel")},
        )
        assert response.status_code == 422

    def test_legacy_xls_gets_an_actionable_message(self, client: TestClient, owner):
        response = client.post(
            f"/api/v1/workspaces/{owner['workspace']['id']}/datasets",
            headers=owner["headers"],
            files={"file": ("old.xls", b"\xd0\xcf\x11\xe0legacy", "application/vnd.ms-excel")},
        )
        assert response.status_code == 422
        assert "Save As" in response.json()["error"]["hint"]

    def test_duplicate_upload_is_rejected_with_a_pointer(
        self, client: TestClient, owner, known_answer_csv
    ):
        first = upload(client, owner, known_answer_csv)
        assert first.status_code == 201
        second = upload(client, owner, known_answer_csv)
        assert second.status_code == 409
        assert second.json()["error"]["details"]["dataset_id"] == first.json()["id"]

    def test_path_traversal_in_filename_is_neutralised(
        self, client: TestClient, owner, known_answer_csv
    ):
        response = upload(client, owner, known_answer_csv, "../../../etc/passwd.csv")
        assert response.status_code == 201
        assert "/" not in response.json()["original_filename"]
        assert "\\" not in response.json()["original_filename"]


class TestIngestionRobustness:
    def test_semicolon_delimiter_detected(self):
        raw = b"date;revenue;product\n2025-01-01;100;A\n2025-01-02;200;B\n"
        result = read_upload(raw, "euro.csv")
        assert result.delimiter == ";"
        assert list(result.frame.columns) == ["date", "revenue", "product"]

    def test_tab_delimiter_detected(self):
        raw = b"date\trevenue\n2025-01-01\t100\n2025-01-02\t200\n"
        result = read_upload(raw, "data.tsv")
        assert result.delimiter == "\t"

    def test_utf8_bom_handled(self):
        raw = "﻿date,revenue\n2025-01-01,100\n2025-01-02,200\n".encode("utf-8")
        result = read_upload(raw, "bom.csv")
        assert list(result.frame.columns) == ["date", "revenue"]

    def test_title_rows_above_the_header_are_skipped(self):
        raw = (
            b"Quarterly Sales Export\n"
            b"Generated 2025-01-01\n"
            b"\n"
            b"order_date,revenue,product\n"
            b"2025-01-01,100,A\n"
            b"2025-01-02,200,B\n"
        )
        result = read_upload(raw, "export.csv")
        assert "order_date" in result.frame.columns
        assert len(result.frame) == 2
        assert any("Skipped" in w for w in result.warnings)

    def test_duplicate_headers_are_renamed(self):
        raw = b"name,name,value\na,b,1\nc,d,2\n"
        result = read_upload(raw, "dupes.csv")
        assert len(set(result.frame.columns)) == 3
        assert any("renamed" in w for w in result.warnings)

    def test_completely_empty_columns_removed(self):
        raw = b"a,b,c\n1,,3\n4,,6\n"
        result = read_upload(raw, "sparse.csv")
        assert "b" not in result.frame.columns
        assert any("empty column" in w for w in result.warnings)

    def test_currency_formatted_numbers_parsed(self):
        raw = (
            b"order_date,revenue\n"
            b'2025-01-01,"$1,234.50"\n'
            b'2025-01-02,"$2,000.00"\n'
            b'2025-01-03,"$1,500.25"\n'
        )
        result = read_upload(raw, "money.csv")
        profile = profile_dataset(result.frame)
        from app.analytics.context import build_context
        from app.analytics.metrics import compute_metrics

        ctx = build_context(result.frame, profile.role_map)
        assert compute_metrics(ctx)["revenue"].value == pytest.approx(4734.75)

    def test_accounting_negatives_parsed(self):
        from app.analytics.schema_inference import coerce_numeric

        series = pd.Series(["1,000.00", "(500.00)", "250.00"])
        parsed, ratio, _ = coerce_numeric(series)
        assert ratio == pytest.approx(1.0)
        assert list(parsed) == pytest.approx([1000.0, -500.0, 250.0])


class TestSchemaInference:
    def test_normalizes_column_names(self):
        assert normalize_name("Order Date (UTC)") == "order_date_utc"
        assert normalize_name("  Total  Revenue ") == "total_revenue"

    def test_detects_standard_ecommerce_schema(self, known_answer_frame):
        roles = {c.name: c.role for c in infer_schema(known_answer_frame)}
        assert roles["order_id"] == SemanticRole.ORDER_ID
        assert roles["order_date"] == SemanticRole.ORDER_DATE
        assert roles["customer_id"] == SemanticRole.CUSTOMER_ID
        assert roles["product"] == SemanticRole.PRODUCT
        assert roles["region"] == SemanticRole.REGION
        assert roles["quantity"] == SemanticRole.QUANTITY
        assert roles["unit_price"] == SemanticRole.UNIT_PRICE
        assert roles["revenue"] == SemanticRole.REVENUE
        assert roles["cost"] == SemanticRole.COST
        assert roles["profit"] == SemanticRole.PROFIT

    def test_values_override_a_misleading_column_name(self):
        """A column called 'revenue' holding words is not revenue, and treating
        it as such would poison every downstream calculation."""
        frame = pd.DataFrame(
            {
                "revenue": ["high", "low", "medium", "high", "low"],
                "order_date": pd.date_range("2025-01-01", periods=5).astype(str),
            }
        )
        roles = {c.name: c.role for c in infer_schema(frame)}
        assert roles["revenue"] != SemanticRole.REVENUE

    def test_only_one_primary_date_column(self):
        frame = pd.DataFrame(
            {
                "order_date": ["2025-01-01", "2025-01-02"],
                "ship_date": ["2025-01-03", "2025-01-04"],
                "revenue": [100, 200],
            }
        )
        roles = [c.role for c in infer_schema(frame)]
        assert roles.count(SemanticRole.ORDER_DATE) == 1

    def test_status_vocabulary_detected_without_a_helpful_name(self):
        frame = pd.DataFrame(
            {
                "col_a": ["completed", "cancelled", "shipped", "completed", "refunded"] * 4,
                "order_date": pd.date_range("2025-01-01", periods=20).astype(str),
            }
        )
        roles = {c.name: c.role for c in infer_schema(frame)}
        assert roles["col_a"] == SemanticRole.STATUS

    def test_year_column_is_not_mistaken_for_a_date(self):
        frame = pd.DataFrame({"year": [2021, 2022, 2023, 2024], "revenue": [1, 2, 3, 4]})
        roles = {c.name: c.role for c in infer_schema(frame)}
        assert roles["year"] not in {SemanticRole.DATE, SemanticRole.ORDER_DATE}


class TestCapabilities:
    def test_dataset_without_dates_reports_why_trends_are_unavailable(self):
        frame = pd.DataFrame({"product": ["A", "B", "C"], "revenue": [10.0, 20.0, 30.0]})
        profile = profile_dataset(frame)
        assert profile.capabilities["time_series"]["available"] is False
        assert "date" in profile.capabilities["time_series"]["reason"].lower()

    def test_short_dataset_explains_forecast_unavailability(self, known_answer_frame):
        profile = profile_dataset(known_answer_frame)
        forecast = profile.capabilities["forecast"]
        assert forecast["available"] is False
        assert "30" in forecast["reason"]

    def test_derived_revenue_enables_profit(self):
        """Profit is possible from quantity x price and cost, with no revenue column."""
        frame = pd.DataFrame(
            {
                "order_date": pd.date_range("2025-01-01", periods=5).astype(str),
                "quantity": [1, 2, 3, 4, 5],
                "unit_price": [10.0] * 5,
                "cost": [5.0] * 5,
            }
        )
        profile = profile_dataset(frame)
        assert profile.capabilities["revenue"]["available"] is True
        assert profile.capabilities["profit"]["available"] is True

    def test_duplicate_rows_are_reported(self):
        frame = pd.DataFrame(
            {"order_date": ["2025-01-01"] * 4, "revenue": [100.0, 100.0, 100.0, 200.0]}
        )
        profile = profile_dataset(frame)
        assert profile.duplicate_rows == 2
        assert any(i["kind"] == "duplicate_rows" for i in profile.quality_issues)


class TestFieldReviewAndConfirmation:
    def test_fields_endpoint_offers_the_full_role_vocabulary(
        self, client: TestClient, owner, known_answer_csv
    ):
        dataset = upload(client, owner, known_answer_csv).json()
        response = client.get(
            f"/api/v1/workspaces/{owner['workspace']['id']}/datasets/{dataset['id']}/fields",
            headers=owner["headers"],
        )
        assert response.status_code == 200
        body = response.json()
        assert len(body["columns"]) == 10
        assert len(body["available_roles"]) > 20
        assert all("label" in role for role in body["available_roles"])

    def test_user_correction_is_applied(self, client: TestClient, owner, known_answer_csv):
        workspace_id = owner["workspace"]["id"]
        dataset = upload(client, owner, known_answer_csv).json()

        response = client.post(
            f"/api/v1/workspaces/{workspace_id}/datasets/{dataset['id']}/confirm",
            headers=owner["headers"],
            json={
                "columns": [{"name": "region", "confirmed_role": "channel", "is_included": True}],
                "grain": "month",
                "start_analysis": False,
            },
        )
        assert response.status_code == 200

        fields = client.get(
            f"/api/v1/workspaces/{workspace_id}/datasets/{dataset['id']}/fields",
            headers=owner["headers"],
        ).json()
        region = next(c for c in fields["columns"] if c["name"] == "region")
        assert region["confirmed_role"] == "channel"
        assert region["effective_role"] == "channel"

    def test_invalid_role_rejected(self, client: TestClient, owner, known_answer_csv):
        dataset = upload(client, owner, known_answer_csv).json()
        response = client.post(
            f"/api/v1/workspaces/{owner['workspace']['id']}/datasets/{dataset['id']}/confirm",
            headers=owner["headers"],
            json={
                "columns": [{"name": "region", "confirmed_role": "nonsense", "is_included": True}],
                "start_analysis": False,
            },
        )
        assert response.status_code == 422

    def test_unknown_column_rejected(self, client: TestClient, owner, known_answer_csv):
        dataset = upload(client, owner, known_answer_csv).json()
        response = client.post(
            f"/api/v1/workspaces/{owner['workspace']['id']}/datasets/{dataset['id']}/confirm",
            headers=owner["headers"],
            json={
                "columns": [{"name": "does_not_exist", "confirmed_role": "revenue"}],
                "start_analysis": False,
            },
        )
        assert response.status_code == 422


class TestDemoDataset:
    def test_demo_dataset_loads_and_is_idempotent(self, client: TestClient, owner):
        url = f"/api/v1/workspaces/{owner['workspace']['id']}/datasets/demo"
        first = client.post(url, headers=owner["headers"])
        assert first.status_code == 201
        assert first.json()["is_demo"] is True
        assert first.json()["row_count"] > 10_000

        second = client.post(url, headers=owner["headers"])
        assert second.json()["id"] == first.json()["id"]
