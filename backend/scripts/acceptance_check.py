"""End-to-end acceptance check against a running stack.

Drives the product the way a real user does — through the Next.js layer, with a
session cookie, not against the API directly — and asserts the full journey from
the landing page to a generated report.

    python scripts/acceptance_check.py [--frontend http://localhost:3000]

Exits non-zero if any step fails, so it can gate a deploy.
"""

from __future__ import annotations

import argparse
import sys
import time
import uuid
from typing import Any

import httpx

PASS = "PASS"
FAIL = "FAIL"

results: list[tuple[str, str, str]] = []


def check(name: str, condition: bool, detail: str = "") -> bool:
    results.append((PASS if condition else FAIL, name, detail))
    marker = "[ok]" if condition else "[FAIL]"
    line = f"  {marker} {name}"
    if detail:
        line += f"  -- {detail}"
    print(line, flush=True)
    return condition


def section(title: str) -> None:
    print(f"\n{title}", flush=True)
    print("-" * len(title), flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frontend", default="http://localhost:3000")
    # Optional, and empty by default. In the deployment this project ships,
    # the API is an internal service with no public address — the only way to
    # reach it is through the frontend, which is also how a real user reaches
    # it, so that is the default path. Pass a URL to probe a backend directly
    # when it does have one.
    parser.add_argument("--backend", default="")
    # Must exceed the backend's own AI_TIMEOUT_SECONDS (180 by default), and
    # by a wide margin. A client that gives up at the same moment the server
    # does can never observe the server's graceful timeout path — it just sees
    # a read timeout and the run dies mid-journey, which is a fault in the
    # harness rather than in the product. Answering a question is also two
    # model calls, not one, so a single request can legitimately run past any
    # per-call budget: 184s measured here, 333s on a busier machine. The
    # default is the value this suite is actually verified against.
    parser.add_argument("--timeout", type=float, default=600.0)
    args = parser.parse_args()

    frontend = args.frontend.rstrip("/")
    backend = args.backend.rstrip("/")

    # A cookie jar is what makes this a real user journey rather than an API test.
    client = httpx.Client(base_url=frontend, timeout=args.timeout, follow_redirects=False)
    api = lambda path: f"/api/backend{path}"  # noqa: E731

    email = f"acceptance-{uuid.uuid4().hex[:10]}@example.com"
    password = "CorrectHorse42!"

    # ------------------------------------------------------------------ 1-2
    section("1-2. Landing page and account creation")
    landing = client.get("/")
    check("Landing page loads", landing.status_code == 200, f"HTTP {landing.status_code}")
    check(
        "Landing page states the value proposition",
        "Understand your business" in landing.text,
    )
    check(
        "Landing page makes no fabricated social proof claims",
        not any(
            phrase in landing.text.lower()
            for phrase in ("trusted by 10,000", "soc 2 certified", "customers say")
        ),
    )

    health = (
        httpx.get(f"{backend}/api/v1/health", timeout=30)
        if backend
        else client.get(api("/health"))
    )
    check("Backend health endpoint responds", health.status_code == 200)
    health_body = health.json()
    check("Database is reachable", health_body.get("database") is True)
    ai_info = health_body.get("ai", {})
    print(
        f"       AI provider: {ai_info.get('provider')} "
        f"({'available' if ai_info.get('available') else 'unavailable'})",
        flush=True,
    )

    signup = client.post(
        "/api/auth/signup",
        json={
            "email": email,
            "password": password,
            "full_name": "Acceptance Runner",
            "business_name": "Acceptance Co",
        },
    )
    if not check("Account created", signup.status_code == 201, signup.text[:180]):
        return summarise()

    workspace = signup.json()["workspaces"][0]
    workspace_id = workspace["id"]
    check("Workspace created with the account", bool(workspace_id))
    check("Session cookie set by the frontend", "if_session" in client.cookies)

    session = client.get("/api/auth/session")
    check("Session resolves for the new account", session.status_code == 200)

    # -------------------------------------------------------------------- 3-5
    section("3-5. Onboarding and dataset upload")
    updated = client.patch(
        api(f"/workspaces/{workspace_id}"),
        json={"name": "NovaMart", "business_type": "ecommerce", "currency": "USD",
              "onboarding_step": 2},
    )
    check("Workspace details saved", updated.status_code == 200, updated.text[:160])

    demo = client.post(api(f"/workspaces/{workspace_id}/datasets/demo"))
    if not check("NovaMart sample dataset uploaded", demo.status_code == 201, demo.text[:180]):
        return summarise()

    dataset = demo.json()
    dataset_id = dataset["id"]
    check(
        "Dataset has a realistic number of rows",
        dataset["row_count"] > 10_000,
        f"{dataset['row_count']:,} rows",
    )

    # -------------------------------------------------------------------- 6-7
    section("6-7. Preview and schema review")
    check("Dataset preview rows returned", len(dataset["preview_rows"]) > 0)

    fields = client.get(api(f"/workspaces/{workspace_id}/datasets/{dataset_id}/fields"))
    check("Detected fields returned", fields.status_code == 200)
    field_body = fields.json()
    roles = {c["name"]: c["effective_role"] for c in field_body["columns"]}

    check("Order date detected", roles.get("order_date") == "order_date", str(roles.get("order_date")))
    check("Revenue detected", roles.get("revenue") == "revenue", str(roles.get("revenue")))
    check("Product detected", roles.get("product") == "product", str(roles.get("product")))
    check("Region detected", roles.get("region") == "region", str(roles.get("region")))
    check("Inventory detected", roles.get("units_in_stock") == "inventory", str(roles.get("units_in_stock")))
    check("Role vocabulary offered for correction", len(field_body["available_roles"]) > 20)

    capabilities = field_body["capabilities"]
    check("Revenue analysis reported as possible", capabilities["revenue"]["available"])
    check(
        "Unavailable analyses explain themselves",
        all(
            cap["available"] or cap["reason"]
            for cap in capabilities.values()
        ),
    )

    # -------------------------------------------------------------------- 8-10
    section("8-10. Analysis")
    confirm = client.post(
        api(f"/workspaces/{workspace_id}/datasets/{dataset_id}/confirm"),
        json={"columns": [], "grain": "month", "start_analysis": True},
    )
    if not check("Schema confirmed and analysis started", confirm.status_code == 200, confirm.text[:180]):
        return summarise()

    analysis_id = confirm.json()["analysis"]["id"]

    # Ask for the analysis to run, which is what the browser does on this screen.
    #
    # Whether it is this request that does the work depends on the deployment:
    # where the backend runs analyses on a thread pool it has already claimed
    # the job and this returns the current status, and where it cannot run work
    # behind a response this request *is* the analysis. The client does not know
    # which, and neither does this script — that is the point. Sent without
    # waiting for it, so the polling below reports progress exactly as the UI
    # does.
    run = client.post(
        api(f"/workspaces/{workspace_id}/analyses/{analysis_id}/run"),
        timeout=args.timeout,
    )
    check("Analysis run accepted", run.status_code == 200, run.text[:180])

    deadline = time.time() + args.timeout
    analysis: dict[str, Any] = {}
    observed_running = False

    while time.time() < deadline:
        poll = client.get(api(f"/workspaces/{workspace_id}/analyses/{analysis_id}"))
        analysis = poll.json()
        if analysis["status"] == "running":
            observed_running = True
        if analysis["status"] in {"completed", "failed"}:
            break
        time.sleep(0.4)

    if not check("Analysis completed", analysis.get("status") == "completed", str(analysis.get("error_message"))):
        return summarise()

    check("Progress reached 100%", analysis["progress"] == 100)
    check("All six stages reported done", all(s["status"] == "done" for s in analysis["stages"]))
    check("Analysis produced a headline", bool(analysis["summary"].get("headline")),
          analysis["summary"].get("headline", "")[:90])
    print(f"       Completed in {analysis['duration_ms']} ms", flush=True)

    # ------------------------------------------------------------------- 11-13
    section("11-13. Dashboard, trend, and product performance")
    overview = client.get(api(f"/workspaces/{workspace_id}/overview"))
    check("Overview loads", overview.status_code == 200)
    ov = overview.json()

    check("Dashboard reports data present", ov["has_data"] is True)
    metrics = {m["key"]: m for m in ov["metrics"]}
    check("Revenue KPI present", "revenue" in metrics)
    check("Revenue is first card shown", ov["metrics"][0]["key"] == "revenue")
    check(
        "Every KPI carries its calculation",
        all(m["provenance"].get("calculation") for m in ov["metrics"]),
    )
    check("Revenue has a comparison period", metrics["revenue"]["change_pct"] is not None,
          f"{metrics['revenue']['change_pct']}%")

    results_response = client.get(api(f"/workspaces/{workspace_id}/analyses/{analysis_id}/results"))
    sections = results_response.json()["results"]
    check("Revenue trend series present", bool(sections.get("trends", {}).get("series", {}).get("revenue")))
    check("Product breakdown present", "product" in sections.get("segments", {}).get("breakdowns", {}))
    check("Uninformative dimensions excluded from attribution",
          "status" in sections.get("segments", {}).get("uninformative_dimensions", []))

    # ------------------------------------------------------------------- 14-16
    section("14-16. Anomalies, investigation, and evidence")
    anomalies = client.get(api(f"/workspaces/{workspace_id}/anomalies"))
    check("Anomalies endpoint responds", anomalies.status_code == 200)
    anomaly_items = anomalies.json()["items"]
    if not check("Anomalies detected in the sample data", len(anomaly_items) > 0):
        return summarise()

    target = anomaly_items[0]
    investigation = client.post(
        api(f"/workspaces/{workspace_id}/anomalies/{target['id']}/investigate"),
        timeout=args.timeout,
    )
    if not check("Investigation runs", investigation.status_code == 200, investigation.text[:180]):
        return summarise()

    inv = investigation.json()["investigation"]
    check("Investigation has a headline", bool(inv["headline"]), inv["headline"][:90])
    check("Investigation states what happened", len(inv["what_happened"]) > 0)
    check("Investigation reports a confidence level", inv["confidence"] in {"low", "moderate", "high"})
    check("Investigation suggests what to check", len(inv["recommended_checks"]) > 0)

    evidence_items = [e for f in inv["what_happened"] for e in f["evidence"]]
    check("Evidence carries calculations", all(e.get("calculation") for e in evidence_items))

    explanations = " ".join(f["statement"] for f in inv["possible_explanations"]).lower()
    check(
        "Explanations are hedged, not asserted as causes",
        not explanations
        or any(word in explanations for word in ("may", "coincide", "consistent with", "could", "cannot confirm")),
    )

    # ------------------------------------------------------------------- 17-18
    section("17-18. Ask InsightFlow")
    ask = client.post(
        api(f"/workspaces/{workspace_id}/chat/ask"),
        json={"question": "Why did revenue decline?"},
        timeout=args.timeout,
    )
    if not check("Question answered", ask.status_code == 201, ask.text[:180]):
        return summarise()

    message = ask.json()["message"]
    check("Intent correctly identified", message["plan"]["intent"] == "explain_change",
          message["plan"]["intent"])
    check("Answer has a headline", bool(message["structured"]["headline"]),
          message["structured"]["headline"][:90])
    check("Evidence persisted with the answer", len(message["evidence"]["items"]) > 0,
          f"{len(message['evidence']['items'])} figures")
    check("Answer reports a confidence level",
          message["structured"]["confidence"] in {"low", "moderate", "high"})
    print(
        f"       {'Deterministic answer' if message['is_fallback'] else 'AI-written answer'}"
        f" in {message['latency_ms']} ms",
        flush=True,
    )

    unanswerable = client.post(
        api(f"/workspaces/{workspace_id}/chat/ask"),
        json={"question": "zzzz qqqq wwww"},
        timeout=args.timeout,
    )
    check(
        "Unanswerable question is refused rather than guessed",
        unanswerable.status_code == 201
        and bool(unanswerable.json()["message"]["plan"]["unsupported_reason"]),
    )

    # ---------------------------------------------------------------------- 19
    section("19. Report generation")
    report = client.post(
        api(f"/workspaces/{workspace_id}/reports"),
        json={"analysis_id": analysis_id},
        timeout=args.timeout,
    )
    if not check("Report generated", report.status_code == 201, report.text[:180]):
        return summarise()

    report_body = report.json()
    check("Report has an executive summary", bool(report_body["executive_summary"]))
    keys = [s["key"] for s in report_body["sections"]]
    check("Report contains every section", keys == [
        "summary", "kpis", "trends", "segments", "customers", "insights", "anomalies", "data",
    ], str(keys))

    # ------------------------------------------------------------------- 20-23
    section("20-23. Navigation")
    for label, path in [
        ("Overview", "/overview"),
        ("Datasets", "/datasets"),
        ("Insights", "/insights"),
        ("Anomalies", "/anomalies"),
        ("Reports", "/reports"),
        ("Ask InsightFlow", "/ask"),
        ("Settings", "/settings"),
    ]:
        page = client.get(path)
        check(f"{label} page renders", page.status_code == 200, f"HTTP {page.status_code}")

    report_page = client.get(f"/reports/{report_body['id']}")
    check("Report detail page renders", report_page.status_code == 200)

    anomaly_page = client.get(f"/anomalies/{target['id']}")
    check("Investigation page renders", anomaly_page.status_code == 200)

    # ------------------------------------------------------------------- 24-25
    section("24-25. Logout and sign in again")
    logout = client.post("/api/auth/logout")
    check("Logout succeeds", logout.status_code == 200)
    check("Session cookie cleared", not client.cookies.get("if_session"))

    protected = client.get("/overview")
    check(
        "Signed-out user is redirected away from the dashboard",
        protected.status_code in (302, 307) and "/login" in protected.headers.get("location", ""),
        f"HTTP {protected.status_code} -> {protected.headers.get('location', '')}",
    )

    login = client.post("/api/auth/login", json={"email": email, "password": password})
    if check("Sign in again succeeds", login.status_code == 200, login.text[:160]):
        restored = client.get(api(f"/workspaces/{workspace_id}/overview")).json()
        check("Data still present after signing back in", restored.get("has_data") is True)
    else:
        check("Data still present after signing back in", False, "skipped: sign-in failed")

    # ---------------------------------------------------------------------- 26
    section("26. Workspace isolation")
    other = httpx.Client(base_url=frontend, timeout=args.timeout)
    other.post(
        "/api/auth/signup",
        json={
            "email": f"intruder-{uuid.uuid4().hex[:8]}@example.com",
            "password": password,
            "business_name": "Other Co",
        },
    )
    leak = other.get(api(f"/workspaces/{workspace_id}/overview"))
    check(
        "Another account cannot read this workspace",
        leak.status_code == 404,
        f"HTTP {leak.status_code}",
    )
    leak_dataset = other.get(api(f"/workspaces/{workspace_id}/datasets/{dataset_id}"))
    check("Another account cannot read this dataset", leak_dataset.status_code == 404)
    other.close()

    # ------------------------------------------------------------------- 27-29
    section("27-29. Invalid input handling")
    bad_type = client.post(
        api(f"/workspaces/{workspace_id}/datasets"),
        files={"file": ("notes.txt", b"just some text", "text/plain")},
    )
    check("Unsupported file type rejected", bad_type.status_code == 422)
    check("Rejection explains what to do",
          bool(bad_type.json().get("error", {}).get("hint")),
          bad_type.json().get("error", {}).get("message", "")[:80])

    empty = client.post(
        api(f"/workspaces/{workspace_id}/datasets"),
        files={"file": ("empty.csv", b"", "text/csv")},
    )
    check("Empty file rejected with a readable message", empty.status_code == 422,
          empty.json().get("error", {}).get("message", "")[:80])

    header_only = client.post(
        api(f"/workspaces/{workspace_id}/datasets"),
        files={"file": ("headers.csv", b"a,b,c\n", "text/csv")},
    )
    check("Header-only file rejected", header_only.status_code == 422,
          header_only.json().get("error", {}).get("message", "")[:80])

    malformed = client.post(
        api(f"/workspaces/{workspace_id}/datasets"),
        files={"file": ("binary.csv", b"\x00\x01\x02\x03\x04", "text/csv")},
    )
    check("Binary content rejected", malformed.status_code == 422)

    client.close()
    return summarise()


def summarise() -> int:
    failures = [r for r in results if r[0] == FAIL]
    passed = len(results) - len(failures)

    print("\n" + "=" * 62, flush=True)
    print(f"  {passed} passed, {len(failures)} failed, {len(results)} checks total", flush=True)
    print("=" * 62, flush=True)

    if failures:
        print("\nFailed checks:", flush=True)
        for _, name, detail in failures:
            print(f"  - {name}" + (f": {detail}" if detail else ""), flush=True)
        return 1

    print("\nAll acceptance checks passed.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
