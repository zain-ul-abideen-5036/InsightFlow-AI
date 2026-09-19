"""Analysis jobs: create, poll, and read results."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request, status
from sqlalchemy import func, select

from app.analytics.types import Grain
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


@router.get("/{analysis_id}", response_model=AnalysisOut)
def get_analysis_status(analysis: ScopedAnalysis) -> AnalysisOut:
    """Status and stage progress. Polled by the frontend while running."""
    return AnalysisOut.model_validate(analysis)


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
