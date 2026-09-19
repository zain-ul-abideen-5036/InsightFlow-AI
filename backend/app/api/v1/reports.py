"""Business performance reports."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, status
from sqlalchemy import func, select

from app.analytics.types import Evidence, EvidenceKind, Unit
from app.api.deps import (
    CurrentUser,
    CurrentWorkspace,
    DbSession,
    ScopedReport,
    record_audit,
)
from app.core.errors import NotFoundError, ValidationError
from app.db.models import (
    Analysis,
    AnalysisResult,
    Anomaly,
    BusinessMetric,
    Dataset,
    Insight,
    JobStatus,
    Report,
)
from app.schemas.api import ReportCreate, ReportDetailOut, ReportOut
from app.schemas.common import MessageResponse, Page

router = APIRouter(prefix="/workspaces/{workspace_id}/reports", tags=["reports"])


@router.post("", response_model=ReportDetailOut, status_code=status.HTTP_201_CREATED)
def create_report(
    payload: ReportCreate,
    workspace: CurrentWorkspace,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> ReportDetailOut:
    """Assemble a report from a completed analysis.

    The report is a snapshot: sections are materialised at creation time so it
    stays exactly as it read when generated, even if the dataset is re-analysed
    or deleted afterwards. A report that silently changes its own figures would
    be worthless as a record.
    """
    from app.ai.service import narrate_report

    analysis = _resolve_analysis(db, workspace, payload.analysis_id, payload.dataset_id)

    sections_by_key = {
        row.section: row.payload
        for row in db.scalars(
            select(AnalysisResult).where(AnalysisResult.analysis_id == analysis.id)
        ).all()
    }
    metrics = db.scalars(
        select(BusinessMetric).where(BusinessMetric.analysis_id == analysis.id)
    ).all()
    insights = db.scalars(
        select(Insight)
        .where(Insight.analysis_id == analysis.id, Insight.is_dismissed.is_(False))
        .order_by(Insight.score.desc())
        .limit(12)
    ).all()
    anomalies = db.scalars(
        select(Anomaly)
        .where(Anomaly.analysis_id == analysis.id)
        .order_by(Anomaly.score.desc())
        .limit(8)
    ).all()

    dataset = db.get(Dataset, analysis.dataset_id)
    summary = analysis.summary or {}
    period_label = _period_label(summary, sections_by_key)

    insight_payload = [
        {
            "id": str(i.id),
            "title": i.title,
            "summary": i.summary,
            "severity": i.severity.value,
            "kind": i.kind.value,
            "change_pct": i.change_pct,
            "metric_key": i.metric_key,
            "evidence": i.evidence,
        }
        for i in insights
    ]

    evidence = [
        Evidence(
            label=m.label,
            value=round(m.value, 2),
            unit=Unit(m.unit) if m.unit in {u.value for u in Unit} else Unit.NUMBER,
            kind=EvidenceKind.OBSERVATION,
            calculation=(m.provenance or {}).get("calculation", ""),
            period=period_label,
        )
        for m in metrics
    ]

    outcome = narrate_report(
        workspace.name,
        period_label,
        summary,
        insight_payload,
        evidence,
        currency=workspace.currency,
    )
    narrative = outcome.structured

    sections = [
        {
            "key": "summary",
            "title": "Executive summary",
            "type": "text",
            "body": narrative.get("executive_summary", ""),
            "key_points": narrative.get("key_points", []),
            "recommended_focus": narrative.get("recommended_focus", []),
        },
        {
            "key": "kpis",
            "title": "Key figures",
            "type": "metrics",
            "items": [
                {
                    "key": m.key, "label": m.label, "value": m.value, "unit": m.unit,
                    "previous_value": m.previous_value, "change_pct": m.change_pct,
                    "direction": m.direction.value if m.direction else None,
                }
                for m in metrics
            ],
        },
        {
            "key": "trends",
            "title": "Trends over time",
            "type": "trends",
            "payload": sections_by_key.get("trends", {}),
        },
        {
            "key": "segments",
            "title": "Performance by segment",
            "type": "segments",
            "payload": sections_by_key.get("segments", {}),
        },
        {
            "key": "customers",
            "title": "Customers",
            "type": "customers",
            "payload": sections_by_key.get("customers", {}),
        },
        {
            "key": "insights",
            "title": "Key insights",
            "type": "insights",
            "items": insight_payload,
        },
        {
            "key": "anomalies",
            "title": "Unusual activity",
            "type": "anomalies",
            "items": [
                {
                    "id": str(a.id),
                    "metric_label": a.metric_label,
                    "occurred_at": a.occurred_at.isoformat(),
                    "observed_value": a.observed_value,
                    "expected_value": a.expected_value,
                    "deviation_pct": a.deviation_pct,
                    "severity": a.severity.value,
                    "direction": a.direction.value,
                }
                for a in anomalies
            ],
        },
        {
            "key": "data",
            "title": "About this analysis",
            "type": "meta",
            "payload": {
                "dataset_name": dataset.name if dataset else "",
                "row_count": summary.get("row_count"),
                "generated_by": "deterministic" if outcome.is_fallback else outcome.provider,
                "model": outcome.model or None,
                "derivations": sections_by_key.get("dataset", {}).get("derivations", {}),
                "quality_issues": sections_by_key.get("dataset", {}).get("quality_issues", []),
            },
        },
    ]

    report = Report(
        workspace_id=workspace.id,
        analysis_id=analysis.id,
        dataset_id=analysis.dataset_id,
        created_by_id=user.id,
        title=payload.title or f"{workspace.name} — business performance",
        period_label=period_label,
        executive_summary=narrative.get("executive_summary", ""),
        sections=sections,
        generated_by="deterministic" if outcome.is_fallback else (outcome.provider or "ai"),
    )
    db.add(report)
    record_audit(
        db, action="report.create", user=user, workspace=workspace,
        resource_type="report", resource_id=str(report.id), request=request,
    )
    db.commit()
    db.refresh(report)
    return ReportDetailOut.model_validate(report)


def _resolve_analysis(
    db: DbSession, workspace, analysis_id: uuid.UUID | None, dataset_id: uuid.UUID | None
) -> Analysis:
    conditions = [
        Analysis.workspace_id == workspace.id,
        Analysis.status == JobStatus.COMPLETED,
    ]
    if analysis_id is not None:
        analysis = db.scalar(
            select(Analysis).where(Analysis.id == analysis_id, *conditions[:1])
        )
        if analysis is None:
            raise NotFoundError("We could not find that analysis.")
        if analysis.status != JobStatus.COMPLETED:
            raise ValidationError(
                "That analysis has not finished yet.",
                hint="Wait for it to complete, then generate the report.",
            )
        return analysis

    if dataset_id is not None:
        conditions.append(Analysis.dataset_id == dataset_id)

    analysis = db.scalar(
        select(Analysis)
        .where(*conditions)
        .order_by(Analysis.finished_at.desc().nulls_last(), Analysis.created_at.desc())
        .limit(1)
    )
    if analysis is None:
        raise ValidationError(
            "There is no completed analysis to build a report from.",
            hint="Upload a dataset and run an analysis first.",
        )
    return analysis


def _period_label(summary: dict, sections: dict) -> str:
    current = summary.get("current_period")
    previous = summary.get("previous_period")
    if current and previous:
        return f"{current} (compared with {previous})"
    if current:
        return current
    dataset_section = sections.get("dataset", {})
    start, end = dataset_section.get("date_min"), dataset_section.get("date_max")
    if start and end:
        return f"{str(start)[:10]} to {str(end)[:10]}"
    return "All available data"


@router.get("", response_model=Page[ReportOut])
def list_reports(
    workspace: CurrentWorkspace, db: DbSession, limit: int = 50, offset: int = 0
) -> Page[ReportOut]:
    total = (
        db.scalar(select(func.count(Report.id)).where(Report.workspace_id == workspace.id))
        or 0
    )
    rows = db.scalars(
        select(Report)
        .where(Report.workspace_id == workspace.id)
        .order_by(Report.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return Page[ReportOut](
        items=[ReportOut.model_validate(r) for r in rows],
        total=total, limit=limit, offset=offset,
    )


@router.get("/{report_id}", response_model=ReportDetailOut)
def get_report_detail(report: ScopedReport) -> ReportDetailOut:
    return ReportDetailOut.model_validate(report)


@router.delete("/{report_id}", response_model=MessageResponse)
def delete_report(report: ScopedReport, db: DbSession) -> MessageResponse:
    db.delete(report)
    db.commit()
    return MessageResponse(message="Report deleted.")
