"""Asynchronous analysis jobs.

A deliberately small mechanism: a bounded thread pool plus the ``analyses``
table acting as the job record. There is no Celery, Redis, or message broker,
because the requirement is a *reliable* job runner and extra infrastructure
would be the single biggest obstacle to someone deploying this.

What this gives us:

* pandas work runs off the request thread, so uploads return immediately
* progress is committed after every stage, so it is durable and pollable
* a crashed or killed process leaves rows in ``running``; those are reconciled
  at start-up rather than hanging forever

The interface is narrow (``submit_analysis``), so replacing the pool with a
broker later touches this file and nothing else.
"""

from __future__ import annotations

import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, update

from app.analytics.context import build_context
from app.analytics.ingestion import load_frame
from app.analytics.pipeline import STAGES, run_analysis
from app.analytics.types import Grain
from app.core.config import settings
from app.core.logging import get_logger, set_request_id
from app.db.models import (
    Analysis,
    Anomaly,
    BusinessMetric,
    Dataset,
    Direction,
    Insight,
    InsightKind,
    JobStatus,
    Notification,
    Severity,
)
from app.db.session import session_scope

logger = get_logger(__name__)

_executor: ThreadPoolExecutor | None = None
_lock = threading.Lock()


def get_executor() -> ThreadPoolExecutor:
    global _executor
    with _lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(
                max_workers=max(1, settings.analysis_workers),
                thread_name_prefix="analysis",
            )
    return _executor


def shutdown_executor(wait: bool = False) -> None:
    global _executor
    with _lock:
        if _executor is not None:
            _executor.shutdown(wait=wait, cancel_futures=not wait)
            _executor = None


def initial_stages() -> list[dict[str, Any]]:
    """The stage list, all pending. Written at enqueue time so the UI can show
    the real plan immediately rather than inventing placeholder steps."""
    return [
        {"key": key, "label": label, "status": "pending", "started_at": None, "finished_at": None}
        for key, label in STAGES
    ]


def submit_analysis(analysis_id: uuid.UUID) -> None:
    """Queue an analysis for background execution."""
    get_executor().submit(_run_job, analysis_id)
    logger.info("analysis queued", extra={"analysis_id": str(analysis_id)})


def reconcile_stale_jobs() -> int:
    """Fail jobs left ``running`` by a previous process. Called at start-up."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.analysis_stale_minutes)
    with session_scope() as db:
        stale = db.scalars(
            select(Analysis).where(
                Analysis.status.in_([JobStatus.RUNNING, JobStatus.QUEUED]),
                Analysis.created_at < cutoff,
            )
        ).all()
        for analysis in stale:
            analysis.status = JobStatus.FAILED
            analysis.error_code = "interrupted"
            analysis.error_message = (
                "This analysis was interrupted, most likely because the server restarted."
            )
            analysis.error_hint = "Run the analysis again."
            analysis.finished_at = datetime.now(timezone.utc)
        count = len(stale)
    if count:
        logger.warning("reconciled stale analyses", extra={"count": count})
    return count


# --------------------------------------------------------------------------- #
# Job body
# --------------------------------------------------------------------------- #


def _run_job(analysis_id: uuid.UUID) -> None:
    set_request_id(f"job-{str(analysis_id)[:8]}")
    started = time.perf_counter()

    try:
        with session_scope() as db:
            analysis = db.get(Analysis, analysis_id)
            if analysis is None:
                logger.error("analysis not found", extra={"analysis_id": str(analysis_id)})
                return
            if analysis.status not in (JobStatus.QUEUED, JobStatus.RUNNING):
                return

            dataset = db.get(Dataset, analysis.dataset_id)
            if dataset is None:
                _fail(
                    analysis, "dataset_missing",
                    "The dataset for this analysis no longer exists.",
                    "Upload the file again.",
                )
                return

            analysis.status = JobStatus.RUNNING
            analysis.started_at = datetime.now(timezone.utc)
            analysis.stage = STAGES[0][0]
            analysis.stages = initial_stages()
            workspace_id = analysis.workspace_id
            dataset_id = dataset.id
            storage_path = dataset.normalized_path or dataset.storage_path
            role_map = _effective_role_map(db, dataset)
            grain_value = (
                analysis.params.get("grain")
                or dataset.profile.get("suggested_grain")
                or Grain.DAY.value
            )
            currency = dataset.workspace.currency if dataset.workspace else "USD"
            dataset_name = dataset.name
            profile = dict(dataset.profile or {})

        # ------------------------------------------------------------------ #
        # Heavy work happens outside the session so we never hold a connection
        # (or a SQLite write lock) open for the duration of the analysis.
        # ------------------------------------------------------------------ #
        frame = load_frame(_resolve_path(storage_path))
        ctx = build_context(
            frame,
            role_map,
            currency=currency,
            dataset_name=dataset_name,
            dataset_id=str(dataset_id),
            grain=Grain(grain_value),
        )

        def on_progress(stage_key: str, label: str, progress: int) -> None:
            _record_stage(analysis_id, stage_key, label, progress)

        output = run_analysis(ctx, profile=profile, on_progress=on_progress)

        duration_ms = int((time.perf_counter() - started) * 1000)
        _persist(analysis_id, workspace_id, dataset_id, output, duration_ms)

        logger.info(
            "analysis completed",
            extra={
                "analysis_id": str(analysis_id),
                "duration_ms": duration_ms,
                "rows": ctx.row_count,
                "insights": len(output.insights),
                "anomalies": len(output.anomalies),
            },
        )

    except FileNotFoundError:
        _fail_by_id(
            analysis_id, "file_missing",
            "The uploaded file could not be found on the server.",
            "Upload the dataset again.",
        )
    except Exception as exc:  # noqa: BLE001 - a failed job must never kill the worker
        logger.exception("analysis failed", extra={"analysis_id": str(analysis_id)})
        _fail_by_id(
            analysis_id,
            "analysis_failed",
            "Something went wrong while analysing this dataset.",
            "Check that the detected fields are correct, then try again.",
            detail=str(exc)[:500],
        )


def _resolve_path(path_value: str):
    from pathlib import Path

    path = Path(path_value)
    return path if path.is_absolute() else (settings.storage_path / path)


def _effective_role_map(db, dataset: Dataset) -> dict[str, str]:
    """The user's confirmed roles, falling back to what was detected."""
    return {
        column.name: (column.confirmed_role or column.semantic_role)
        for column in dataset.columns
        if column.is_included
    }


def _record_stage(analysis_id: uuid.UUID, stage_key: str, label: str, progress: int) -> None:
    """Commit progress after each stage so polling reflects real work."""
    now = datetime.now(timezone.utc).isoformat()
    with session_scope() as db:
        analysis = db.get(Analysis, analysis_id)
        if analysis is None:
            return

        # Copy every dict rather than mutating in place. A plain JSON column is
        # not mutation-tracked: if the nested dicts are edited directly, the
        # "old" and "new" values SQLAlchemy compares at flush are the same
        # objects, the attribute looks unchanged, and no UPDATE is emitted --
        # so progress silently never persists.
        stages = [dict(entry) for entry in (analysis.stages or initial_stages())]

        for entry in stages:
            if entry["key"] == stage_key:
                entry["status"] = "running"
                entry["started_at"] = now
            elif entry["status"] == "running":
                entry["status"] = "done"
                entry["finished_at"] = now
        if stage_key == "complete":
            for entry in stages:
                if entry["status"] != "done":
                    entry["status"] = "done"
                    entry.setdefault("started_at", now)
                    entry["finished_at"] = now

        analysis.stages = stages
        analysis.stage = stage_key
        analysis.progress = max(0, min(100, progress))


def _persist(
    analysis_id: uuid.UUID,
    workspace_id: uuid.UUID,
    dataset_id: uuid.UUID,
    output,
    duration_ms: int,
) -> None:
    """Write results, metrics, insights, and anomalies in one transaction."""
    from app.db.models import AnalysisResult

    with session_scope() as db:
        analysis = db.get(Analysis, analysis_id)
        if analysis is None:
            return

        for section, payload in output.sections.items():
            db.add(
                AnalysisResult(
                    workspace_id=workspace_id,
                    analysis_id=analysis_id,
                    section=section,
                    payload=payload if isinstance(payload, dict) else {"items": payload},
                )
            )

        for key, metric in output.metrics.items():
            db.add(
                BusinessMetric(
                    workspace_id=workspace_id,
                    analysis_id=analysis_id,
                    dataset_id=dataset_id,
                    key=key,
                    label=metric.label,
                    value=float(metric.value),
                    unit=metric.unit.value,
                    previous_value=metric.previous_value,
                    change_pct=metric.change_pct,
                    direction=_direction(metric.direction),
                    provenance=metric.provenance,
                )
            )

        for card in output.insights:
            db.add(
                Insight(
                    workspace_id=workspace_id,
                    analysis_id=analysis_id,
                    dataset_id=dataset_id,
                    kind=_insight_kind(card.kind),
                    severity=_severity(card.severity),
                    title=card.title[:255],
                    summary=card.summary,
                    metric_key=card.metric_key,
                    metric_value=card.metric_value,
                    comparison_value=card.comparison_value,
                    change_pct=card.change_pct,
                    direction=_direction(card.direction),
                    unit=card.unit,
                    evidence=[e.to_dict() for e in card.evidence],
                    evidence_refs=card.evidence_refs,
                    score=card.score,
                )
            )

        for anomaly in output.anomalies:
            db.add(
                Anomaly(
                    workspace_id=workspace_id,
                    analysis_id=analysis_id,
                    dataset_id=dataset_id,
                    metric_key=anomaly.metric_key,
                    metric_label=anomaly.metric_label,
                    occurred_at=anomaly.occurred_at,
                    grain=anomaly.grain,
                    observed_value=anomaly.observed,
                    expected_value=anomaly.expected,
                    lower_bound=anomaly.lower_bound,
                    upper_bound=anomaly.upper_bound,
                    deviation_pct=anomaly.deviation_pct,
                    z_score=anomaly.z_score,
                    method=anomaly.method,
                    direction=_direction(anomaly.direction) or Direction.DOWN,
                    severity=_severity(anomaly.severity),
                    score=anomaly.score,
                    context=anomaly.context,
                )
            )

        analysis.status = JobStatus.COMPLETED
        analysis.stage = "complete"
        analysis.progress = 100
        analysis.finished_at = datetime.now(timezone.utc)
        analysis.duration_ms = duration_ms
        analysis.summary = output.summary

        # Copied, not mutated — see the note in `_record_stage`.
        stages = [dict(entry) for entry in (analysis.stages or initial_stages())]
        now = datetime.now(timezone.utc).isoformat()
        for entry in stages:
            if entry["status"] != "done":
                entry["status"] = "done"
                entry.setdefault("started_at", now)
                entry["finished_at"] = now
        analysis.stages = stages

        critical = output.summary.get("critical_count", 0)
        db.add(
            Notification(
                workspace_id=workspace_id,
                kind="analysis_complete",
                title="Analysis complete",
                body=(
                    output.summary.get("headline")
                    or f"{len(output.insights)} insight(s) were generated."
                )
                + (f" {critical} need attention." if critical else ""),
                link=f"/analyses/{analysis_id}",
            )
        )


def _fail(analysis: Analysis, code: str, message: str, hint: str, detail: str = "") -> None:
    analysis.status = JobStatus.FAILED
    analysis.error_code = code
    analysis.error_message = message
    analysis.error_hint = hint
    analysis.finished_at = datetime.now(timezone.utc)
    if detail:
        analysis.params = {**(analysis.params or {}), "failure_detail": detail}


def _fail_by_id(
    analysis_id: uuid.UUID, code: str, message: str, hint: str, detail: str = ""
) -> None:
    try:
        with session_scope() as db:
            analysis = db.get(Analysis, analysis_id)
            if analysis is not None:
                _fail(analysis, code, message, hint, detail)
    except Exception:  # noqa: BLE001
        logger.exception("could not record analysis failure")


def _severity(value: str | None) -> Severity:
    try:
        return Severity(value or "info")
    except ValueError:
        return Severity.INFO


def _direction(value: str | None) -> Direction | None:
    if not value:
        return None
    try:
        return Direction(value)
    except ValueError:
        return None


def _insight_kind(value: str) -> InsightKind:
    try:
        return InsightKind(value)
    except ValueError:
        return InsightKind.TREND
