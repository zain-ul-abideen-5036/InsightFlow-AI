"""Analysis jobs: create, poll, and read results."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query, Request, status
from sqlalchemy import func, select

from app.analytics.types import Grain
from app.core.config import settings
from app.api.deps import (
    CurrentUser,
    CurrentWorkspace,
    DbSession,
    ScopedAnalysis,
    record_audit,
)
from app.core.errors import ConflictError, DatasetError, NotFoundError
from app.db.models import Analysis, AnalysisResult, Dataset, DatasetStatus, JobStatus
from app.jobs.runner import initial_stages, submit_analysis
from app.schemas.api import AnalysisCreate, AnalysisDetailOut, AnalysisOut
from app.schemas.common import MessageResponse, Page

router = APIRouter(prefix="/workspaces/{workspace_id}/analyses", tags=["analyses"])


@router.post("", response_model=AnalysisOut, status_code=status.HTTP_201_CREATED)
def create_analysis(
    payload: AnalysisCreate,
    workspace: CurrentWorkspace,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> AnalysisOut:
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.id == payload.dataset_id, Dataset.workspace_id == workspace.id
        )
    )
    if dataset is None:
        raise NotFoundError("We could not find that dataset.")
    if dataset.status == DatasetStatus.FAILED:
        raise DatasetError(
            "This dataset could not be processed, so it cannot be analysed.",
            hint="Upload the file again.",
        )

    running = db.scalar(
        select(Analysis).where(
            Analysis.dataset_id == dataset.id,
            Analysis.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]),
        )
    )
    if running is not None:
        raise ConflictError(
            "An analysis for this dataset is already running.",
            hint="Wait for it to finish, or open it to watch the progress.",
            details={"analysis_id": str(running.id)},
        )

    grain = (
        payload.grain
        or dataset.semantic_map.get("grain")
        or dataset.profile.get("suggested_grain")
        or Grain.DAY.value
    )

    analysis = Analysis(
        workspace_id=workspace.id,
        dataset_id=dataset.id,
        created_by_id=user.id,
        kind="full",
        status=JobStatus.QUEUED,
        stage="queued",
        stages=initial_stages(),
        params={"grain": grain},
    )
    db.add(analysis)
    record_audit(
        db, action="analysis.create", user=user, workspace=workspace,
        resource_type="analysis", resource_id=str(analysis.id), request=request,
    )
    db.commit()
    db.refresh(analysis)

    submit_analysis(analysis.id)
    return AnalysisOut.model_validate(analysis)


@router.get("", response_model=Page[AnalysisOut])
def list_analyses(
    workspace: CurrentWorkspace,
    db: DbSession,
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> Page[AnalysisOut]:
    total = (
        db.scalar(
            select(func.count(Analysis.id)).where(Analysis.workspace_id == workspace.id)
        )
        or 0
    )
    rows = db.scalars(
        select(Analysis)
        .where(Analysis.workspace_id == workspace.id)
        .order_by(Analysis.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return Page[AnalysisOut](
        items=[AnalysisOut.model_validate(a) for a in rows],
        total=total, limit=limit, offset=offset,
    )


@router.post("/{analysis_id}/run", response_model=AnalysisOut)
def run_analysis(analysis: ScopedAnalysis, db: DbSession) -> AnalysisOut:
    """Run a queued analysis to completion, synchronously.

    The client calls this once, immediately after the analysis is created, and
    keeps polling ``GET /{analysis_id}`` for the staged progress as it always
    has. The two requests are independent on purpose: this one may take as long
    as the analysis takes, while the poll stays fast.

    It is safe to call in any deployment and safe to call twice. Where
    ``ANALYSIS_EXECUTION=thread`` the pool has normally claimed the job already,
    so this returns the current status without running anything — which is why
    the client does not need to know which mode the backend is in. The claim is
    a conditional UPDATE, so a double-click cannot produce two runs.
    """
    from app.jobs.runner import run_analysis_now

    if analysis.status in (JobStatus.QUEUED, JobStatus.RUNNING):
        analysis_id = analysis.id

        # Let go of this request's connection before starting.
        #
        # Loading the analysis opened a transaction, and the work below takes as
        # long as the analysis takes — up to the platform's whole request budget.
        # Holding a pooled connection idle-in-transaction for that duration,
        # while the job opens its own connections to commit each stage, is how a
        # handful of concurrent analyses exhaust a small pool and start failing
        # requests that had nothing to do with them. On SQLite it is worse: the
        # read lock this would keep open contends with the job's writes.
        db.commit()

        run_analysis_now(analysis_id)
        db.refresh(analysis)

    return AnalysisOut.model_validate(analysis)


@router.get("/{analysis_id}", response_model=AnalysisOut)
def get_analysis_status(analysis: ScopedAnalysis, db: DbSession) -> AnalysisOut:
    """Status and stage progress. Polled by the frontend while running.

    Also where an abandoned job is noticed. A run that was interrupted — the
    process was killed, a serverless invocation timed out — leaves a row that
    says ``running`` and never changes again, and the UI would spin on it
    forever. Start-up reconciliation catches these on a long-lived server, but
    a deployment that never "starts up" in that sense needs them caught
    somewhere, and the poll is exactly the moment someone is waiting on an
    answer.
    """
    _fail_if_abandoned(analysis, db)
    return AnalysisOut.model_validate(analysis)


def _fail_if_abandoned(analysis: Analysis, db: DbSession) -> None:
    """Mark a job that can no longer be running as failed."""
    if analysis.status not in (JobStatus.QUEUED, JobStatus.RUNNING):
        return

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.analysis_stale_minutes)
    started = analysis.started_at or analysis.created_at
    if started is None or started >= cutoff:
        return

    analysis.status = JobStatus.FAILED
    analysis.error_code = "interrupted"
    analysis.error_message = (
        "This analysis was interrupted, most likely because the server restarted."
    )
    analysis.error_hint = "Run the analysis again."
    analysis.finished_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(analysis)


@router.get("/{analysis_id}/results", response_model=AnalysisDetailOut)
def get_analysis_results(analysis: ScopedAnalysis, db: DbSession) -> AnalysisDetailOut:
    if analysis.status != JobStatus.COMPLETED:
        # Not an error: the client polls this and renders progress until ready.
        return AnalysisDetailOut.model_validate(analysis)

    sections = {
        row.section: row.payload
        for row in db.scalars(
            select(AnalysisResult).where(AnalysisResult.analysis_id == analysis.id)
        ).all()
    }
    detail = AnalysisDetailOut.model_validate(analysis)
    detail.results = sections
    return detail


@router.delete("/{analysis_id}", response_model=MessageResponse)
def delete_analysis(analysis: ScopedAnalysis, db: DbSession) -> MessageResponse:
    db.delete(analysis)
    db.commit()
    return MessageResponse(message="Analysis deleted.")
