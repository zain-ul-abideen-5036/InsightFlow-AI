"""Workspace management and the executive overview."""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Request, status
from sqlalchemy import func, select

from app.api.deps import (
    CurrentUser,
    CurrentWorkspace,
    DbSession,
    record_audit,
)
from app.core.errors import NotFoundError
from app.db.models import (
    Analysis,
    AnalysisResult,
    Anomaly,
    BusinessMetric,
    Dataset,
    Insight,
    JobStatus,
    Notification,
    Workspace,
    WorkspaceMember,
    WorkspaceRole,
)
from app.schemas.api import (
    AnalysisOut,
    AnomalyOut,
    InsightOut,
    NotificationOut,
    OverviewResponse,
    WorkspaceCreate,
    WorkspaceOut,
    WorkspaceUpdate,
)
from app.schemas.common import MessageResponse

router = APIRouter(tags=["workspaces"])


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:60] or "workspace"


def _unique_slug(db: DbSession, base: str) -> str:
    slug = _slugify(base)
    candidate, suffix = slug, 1
    while db.scalar(select(Workspace.id).where(Workspace.slug == candidate)) is not None:
        suffix += 1
        candidate = f"{slug}-{suffix}"
        if suffix > 50:
            return f"{slug}-{uuid.uuid4().hex[:8]}"
    return candidate


@router.get("/workspaces", response_model=list[WorkspaceOut])
def list_workspaces(user: CurrentUser, db: DbSession) -> list[WorkspaceOut]:
    workspaces = db.scalars(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id)
        .order_by(Workspace.created_at)
    ).all()
    return [WorkspaceOut.model_validate(w) for w in workspaces]


@router.post("/workspaces", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: WorkspaceCreate, user: CurrentUser, db: DbSession, request: Request
) -> WorkspaceOut:
    workspace = Workspace(
        name=payload.name.strip(),
        slug=_unique_slug(db, payload.name),
        business_type=payload.business_type,
        currency=payload.currency.upper()[:8],
        timezone=payload.timezone,
    )
    db.add(workspace)
    db.flush()
    db.add(
        WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.OWNER)
    )
    record_audit(
        db, action="workspace.create", user=user, workspace=workspace,
        resource_type="workspace", resource_id=str(workspace.id), request=request,
    )
    db.commit()
    db.refresh(workspace)
    return WorkspaceOut.model_validate(workspace)


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceOut)
def get_workspace(workspace: CurrentWorkspace) -> WorkspaceOut:
    return WorkspaceOut.model_validate(workspace)


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceOut)
def update_workspace(
    payload: WorkspaceUpdate,
    workspace: CurrentWorkspace,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> WorkspaceOut:
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        if value is None:
            continue
        if field == "currency":
            value = str(value).upper()[:8]
        setattr(workspace, field, value)

    if data.get("onboarding_step") is not None and data["onboarding_step"] >= 6:
        user.onboarding_completed = True

    record_audit(
        db, action="workspace.update", user=user, workspace=workspace,
        resource_type="workspace", resource_id=str(workspace.id), request=request,
        metadata={"fields": sorted(data.keys())},
    )
    db.commit()
    db.refresh(workspace)
    return WorkspaceOut.model_validate(workspace)


@router.get("/workspaces/{workspace_id}/overview", response_model=OverviewResponse)
def overview(workspace: CurrentWorkspace, db: DbSession) -> OverviewResponse:
    """Everything the dashboard needs, in one request.

    The dashboard would otherwise fire six requests and render progressively,
    which on a business-health screen reads as instability.
    """
    dataset_count = (
        db.scalar(
            select(func.count(Dataset.id)).where(Dataset.workspace_id == workspace.id)
        )
        or 0
    )

    latest = db.scalar(
        select(Analysis)
        .where(
            Analysis.workspace_id == workspace.id,
            Analysis.status == JobStatus.COMPLETED,
        )
        .order_by(Analysis.finished_at.desc().nulls_last(), Analysis.created_at.desc())
        .limit(1)
    )

    # An analysis that is queued or running is not "no analysis". Reporting
    # only completed runs left the dashboard telling a user to go and start an
    # analysis that was already under way — which is the first screen a demo
    # visitor sees, and the one moment the product most needs to be believed.
    running = db.scalar(
        select(Analysis)
        .where(
            Analysis.workspace_id == workspace.id,
            Analysis.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]),
        )
        .order_by(Analysis.created_at.desc())
        .limit(1)
    )

    if latest is None:
        return OverviewResponse(
            workspace=WorkspaceOut.model_validate(workspace),
            has_data=dataset_count > 0,
            latest_analysis=None,
            running_analysis=AnalysisOut.model_validate(running) if running else None,
            metrics=[],
            insights=[],
            anomalies=[],
            trends={},
            top_segments={},
            dataset_count=dataset_count,
            suggestions=[],
        )

    metrics = db.scalars(
        select(BusinessMetric)
        .where(BusinessMetric.analysis_id == latest.id)
        .order_by(BusinessMetric.created_at)
    ).all()

    # Ordered as a business owner reads them, not as they were computed.
    order = [
        "revenue", "profit", "orders", "customers",
        "avg_order_value", "profit_margin", "units_sold", "cost",
    ]
    rank = {key: index for index, key in enumerate(order)}
    metric_payload = sorted(
        (
            {
                "key": m.key,
                "label": m.label,
                "value": m.value,
                "unit": m.unit,
                "previous_value": m.previous_value,
                "change_pct": m.change_pct,
                "direction": m.direction.value if m.direction else None,
                "provenance": m.provenance,
            }
            for m in metrics
        ),
        key=lambda m: rank.get(m["key"], 99),
    )

    insights = db.scalars(
        select(Insight)
        .where(Insight.analysis_id == latest.id, Insight.is_dismissed.is_(False))
        .order_by(Insight.score.desc())
        .limit(8)
    ).all()

    anomalies = db.scalars(
        select(Anomaly)
        .where(Anomaly.analysis_id == latest.id)
        .order_by(Anomaly.score.desc())
        .limit(6)
    ).all()

    sections = {
        row.section: row.payload
        for row in db.scalars(
            select(AnalysisResult).where(AnalysisResult.analysis_id == latest.id)
        ).all()
    }

    return OverviewResponse(
        workspace=WorkspaceOut.model_validate(workspace),
        has_data=True,
        latest_analysis=AnalysisOut.model_validate(latest),
        # A re-run in flight over an already-analysed workspace: the dashboard
        # keeps showing the last good result and notes that a newer one is
        # coming, rather than blanking out.
        running_analysis=AnalysisOut.model_validate(running) if running else None,
        metrics=metric_payload,
        insights=[InsightOut.model_validate(i) for i in insights],
        anomalies=[AnomalyOut.model_validate(a) for a in anomalies],
        trends=sections.get("trends", {}),
        top_segments=sections.get("segments", {}),
        dataset_count=dataset_count,
        suggestions=_suggestions(sections),
    )


def _suggestions(sections: dict) -> list[str]:
    """Questions this workspace's data can answer, for the Ask panel."""
    dataset = sections.get("dataset", {})
    dimensions = set(dataset.get("dimensions", []))
    suggestions: list[str] = []

    if sections.get("comparison", {}).get("available"):
        suggestions.append("Why did revenue change last month?")
        suggestions.append("Compare this month with last month.")
    if "product" in dimensions:
        suggestions.append("What are my best-selling products?")
        suggestions.append("Which products are declining?")
    if "region" in dimensions:
        suggestions.append("Which region is growing fastest?")
    if sections.get("anomalies", {}).get("available"):
        suggestions.append("Show me unusual activity.")
    if sections.get("customers"):
        suggestions.append("How many repeat customers do I have?")
    return suggestions[:6]


@router.get("/workspaces/{workspace_id}/notifications", response_model=list[NotificationOut])
def list_notifications(workspace: CurrentWorkspace, db: DbSession) -> list[NotificationOut]:
    rows = db.scalars(
        select(Notification)
        .where(Notification.workspace_id == workspace.id)
        .order_by(Notification.created_at.desc())
        .limit(30)
    ).all()
    return [NotificationOut.model_validate(n) for n in rows]


@router.post(
    "/workspaces/{workspace_id}/notifications/{notification_id}/read",
    response_model=MessageResponse,
)
def mark_notification_read(
    notification_id: uuid.UUID, workspace: CurrentWorkspace, db: DbSession
) -> MessageResponse:
    notification = db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.workspace_id == workspace.id,
        )
    )
    if notification is None:
        raise NotFoundError("We could not find that notification.")
    notification.is_read = True
    db.commit()
    return MessageResponse(message="Marked as read.")
