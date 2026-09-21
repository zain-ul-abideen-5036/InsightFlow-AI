"""Insights and anomalies, including on-demand investigation."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.analytics.anomalies import AnomalyPoint
from app.analytics.context import build_context
from app.analytics.ingestion import load_frame
from app.analytics.investigation import Investigation, investigate_anomaly
from app.analytics.types import Grain
from app.api.deps import CurrentWorkspace, DbSession
from app.core.config import settings
from app.core.errors import NotFoundError
from app.core.logging import get_logger
from app.db.models import Analysis, Anomaly, Dataset, Insight, JobStatus, Severity
from app.schemas.api import AnomalyOut, InsightOut, InvestigationResponse
from app.schemas.common import MessageResponse, Page

logger = get_logger(__name__)
router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["insights"])

_SEVERITY_RANK = {
    Severity.CRITICAL: 0, Severity.HIGH: 1, Severity.MEDIUM: 2,
    Severity.LOW: 3, Severity.INFO: 4,
}


@router.get("/insights", response_model=Page[InsightOut])
def list_insights(
    workspace: CurrentWorkspace,
    db: DbSession,
    analysis_id: uuid.UUID | None = Query(default=None),
    severity: str | None = Query(default=None),
    kind: str | None = Query(default=None),
    include_dismissed: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Page[InsightOut]:
    conditions = [Insight.workspace_id == workspace.id]
    if analysis_id is not None:
        conditions.append(Insight.analysis_id == analysis_id)
    if severity:
        conditions.append(Insight.severity == severity)
    if kind:
        conditions.append(Insight.kind == kind)
    if not include_dismissed:
        conditions.append(Insight.is_dismissed.is_(False))

    total = db.scalar(select(func.count(Insight.id)).where(*conditions)) or 0
    rows = db.scalars(
        select(Insight)
        .where(*conditions)
        .order_by(Insight.created_at.desc(), Insight.score.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return Page[InsightOut](
        items=[InsightOut.model_validate(i) for i in rows],
        total=total, limit=limit, offset=offset,
    )


@router.get("/insights/{insight_id}", response_model=InsightOut)
def get_insight(
    insight_id: uuid.UUID, workspace: CurrentWorkspace, db: DbSession
) -> InsightOut:
    insight = db.scalar(
        select(Insight).where(
            Insight.id == insight_id, Insight.workspace_id == workspace.id
        )
    )
    if insight is None:
        raise NotFoundError("We could not find that insight.")
    return InsightOut.model_validate(insight)


@router.post("/insights/{insight_id}/dismiss", response_model=MessageResponse)
def dismiss_insight(
    insight_id: uuid.UUID, workspace: CurrentWorkspace, db: DbSession
) -> MessageResponse:
    insight = db.scalar(
        select(Insight).where(
            Insight.id == insight_id, Insight.workspace_id == workspace.id
        )
    )
    if insight is None:
        raise NotFoundError("We could not find that insight.")
    insight.is_dismissed = True
    db.commit()
    return MessageResponse(message="Insight dismissed.")


@router.post("/insights/{insight_id}/explain", response_model=InsightOut)
def explain_insight(
    insight_id: uuid.UUID, workspace: CurrentWorkspace, db: DbSession
) -> InsightOut:
    """Generate a written narrative for one insight.

    Deliberately on demand rather than during analysis: writing fourteen
    narratives would add minutes to every analysis run, and most are never read.
    """
    from app.ai.service import narrate_insight

    insight = db.scalar(
        select(Insight).where(
            Insight.id == insight_id, Insight.workspace_id == workspace.id
        )
    )
    if insight is None:
        raise NotFoundError("We could not find that insight.")

    if insight.narrative:
        return InsightOut.model_validate(insight)

    outcome = narrate_insight(
        {
            "title": insight.title,
            "summary": insight.summary,
            "severity": insight.severity.value,
            "evidence": insight.evidence,
        },
        currency=workspace.currency,
    )
    if not outcome.is_fallback:
        insight.narrative = outcome.structured.get("narrative", "")
        db.commit()
        db.refresh(insight)
    return InsightOut.model_validate(insight)


# --------------------------------------------------------------------------- #
# Anomalies
# --------------------------------------------------------------------------- #


@router.get("/anomalies", response_model=Page[AnomalyOut])
def list_anomalies(
    workspace: CurrentWorkspace,
    db: DbSession,
    analysis_id: uuid.UUID | None = Query(default=None),
    severity: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Page[AnomalyOut]:
    conditions = [Anomaly.workspace_id == workspace.id]
    if analysis_id is not None:
        conditions.append(Anomaly.analysis_id == analysis_id)
    if severity:
        conditions.append(Anomaly.severity == severity)

    total = db.scalar(select(func.count(Anomaly.id)).where(*conditions)) or 0
    rows = db.scalars(
        select(Anomaly)
        .where(*conditions)
        .order_by(Anomaly.score.desc(), Anomaly.occurred_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return Page[AnomalyOut](
        items=[AnomalyOut.model_validate(a) for a in rows],
        total=total, limit=limit, offset=offset,
    )


@router.get("/anomalies/{anomaly_id}", response_model=AnomalyOut)
def get_anomaly(
    anomaly_id: uuid.UUID, workspace: CurrentWorkspace, db: DbSession
) -> AnomalyOut:
    anomaly = db.scalar(
        select(Anomaly).where(
            Anomaly.id == anomaly_id, Anomaly.workspace_id == workspace.id
        )
    )
    if anomaly is None:
        raise NotFoundError("We could not find that anomaly.")
    return AnomalyOut.model_validate(anomaly)


@router.post("/anomalies/{anomaly_id}/investigate", response_model=InvestigationResponse)
def investigate(
    anomaly_id: uuid.UUID,
    workspace: CurrentWorkspace,
    db: DbSession,
    refresh: bool = Query(default=False),
    narrate: bool = Query(
        default=True,
        description=(
            "Generate the written narrative. Pass false to return the "
            "deterministic investigation immediately without waiting for the "
            "model, then request it again with narrate=true."
        ),
    ),
) -> InvestigationResponse:
    """Run the investigation engine over one anomaly.

    Both halves are cached on the anomaly: the deterministic investigation,
    which is the source of every figure, and the narrative written over it.

    The two are separable on purpose. Local CPU inference takes 60-180 seconds,
    and the evidence — what moved, where, by how much, and what coincided with
    it — is complete before a single token is generated. Holding the page behind
    the model would mean staring at a spinner while the answer already exists.
    ``narrate=false`` returns that evidence straight away with
    ``narrative_pending`` set; the interface then asks for the prose separately
    and swaps it in when it arrives.
    """
    from app.ai.service import deterministic_investigation, narrate_investigation

    anomaly = db.scalar(
        select(Anomaly).where(
            Anomaly.id == anomaly_id, Anomaly.workspace_id == workspace.id
        )
    )
    if anomaly is None:
        raise NotFoundError("We could not find that anomaly.")

    dataset = db.scalar(
        select(Dataset).where(
            Dataset.id == anomaly.dataset_id, Dataset.workspace_id == workspace.id
        )
    )
    if dataset is None:
        raise NotFoundError(
            "The dataset behind this anomaly is no longer available."
        )

    investigation_dict = anomaly.investigation if not refresh else None
    cached_narrative = anomaly.narrative if not refresh else None
    investigation_obj = None

    if investigation_dict is None:
        from pathlib import Path

        stored = dataset.normalized_path or dataset.storage_path
        path = Path(stored)
        if not path.is_absolute():
            path = settings.storage_path / path
        # An investigation is computed from the file, not from the stored
        # anomaly, so a file that is gone has to be said out loud. Without this
        # the read below raises FileNotFoundError and the user is told
        # "something went wrong on our side", which sends them to support for a
        # problem they can fix themselves by uploading the dataset again. It
        # happens whenever storage is not persistent — a container restart on a
        # host with an ephemeral filesystem is enough. `Ask` already answers
        # this way (see chat.py); this path was the one that did not.
        if not path.exists():
            raise NotFoundError(
                "The file behind this dataset is no longer available.",
                hint="Upload the dataset again to investigate this anomaly.",
            )

        frame = load_frame(path)
        role_map = {
            column.name: column.effective_role
            for column in dataset.columns
            if column.is_included
        }
        ctx = build_context(
            frame,
            role_map,
            currency=workspace.currency,
            dataset_name=dataset.name,
            dataset_id=str(dataset.id),
            grain=Grain(dataset.semantic_map.get("grain", Grain.DAY.value)),
        )

        point = AnomalyPoint(
            period=_period_label(anomaly),
            occurred_at=anomaly.occurred_at,
            metric_key=anomaly.metric_key,
            metric_label=anomaly.metric_label,
            observed=anomaly.observed_value,
            expected=anomaly.expected_value,
            lower_bound=anomaly.lower_bound,
            upper_bound=anomaly.upper_bound,
            deviation_pct=anomaly.deviation_pct,
            z_score=anomaly.z_score,
            direction=anomaly.direction.value,
            severity=anomaly.severity.value,
            method=anomaly.method,
            score=anomaly.score,
            grain=anomaly.grain,
            context=anomaly.context or {},
        )
        investigation_obj = investigate_anomaly(ctx, point)
        investigation_dict = investigation_obj.to_dict()

        anomaly.investigation = investigation_dict
        # Any prose cached earlier described the previous run. Drop it rather
        # than let it describe figures that no longer exist.
        anomaly.narrative = None
        cached_narrative = None
        anomaly.investigated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(anomaly)

    def _respond(
        narrative: dict,
        *,
        is_fallback: bool,
        provider: str | None = None,
        model: str | None = None,
        error: str | None = None,
        narrative_pending: bool = False,
    ) -> InvestigationResponse:
        return InvestigationResponse(
            anomaly=AnomalyOut.model_validate(anomaly),
            investigation=investigation_dict,
            narrative=narrative,
            is_fallback=is_fallback,
            provider=provider,
            model=model,
            error=error,
            narrative_pending=narrative_pending,
        )

    # A narrative written earlier is authoritative and costs nothing to serve.
    if cached_narrative:
        return _respond(cached_narrative, is_fallback=False)

    plain = _plain_narrative(investigation_dict)

    # The caller asked for evidence only, or there is no model to ask. Both
    # return the deterministic narrative, which is always correct; only the
    # first can still be upgraded, so only the first is "pending".
    if not narrate:
        return _respond(plain, is_fallback=True, narrative_pending=settings.ai_enabled)
    if not settings.ai_enabled:
        return _respond(plain, is_fallback=True)

    # Narrating needs the typed object. On the second leg of the two-phase
    # flow the deterministic half is already cached, so rehydrate it rather
    # than reload the dataset and re-run the attribution.
    if investigation_obj is None:
        investigation_obj = Investigation.from_dict(investigation_dict)

    # Everything this response needs from the database has been read. Release
    # the transaction before the model call, which takes 60-180 seconds on local
    # inference: holding a connection open for that long starves the pool and,
    # on SQLite, makes every concurrent writer wait out its busy timeout and
    # fail with "database is locked".
    anomaly_snapshot = AnomalyOut.model_validate(anomaly)
    anomaly_id_value = anomaly.id
    db.commit()

    outcome = narrate_investigation(
        investigation_obj, dataset_name=dataset.name, currency=workspace.currency
    )

    if not outcome.is_fallback:
        # Best effort, deliberately. This is a cache: failing to write it costs
        # one regeneration on the next visit, while failing the request costs
        # the user an answer that has already been computed and validated.
        try:
            fresh = db.get(Anomaly, anomaly_id_value)
            if fresh is not None:
                fresh.narrative = outcome.structured
                db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
            logger.warning(
                "could not cache the investigation narrative",
                extra={"anomaly_id": str(anomaly_id_value)},
                exc_info=True,
            )

    return InvestigationResponse(
        anomaly=anomaly_snapshot,
        investigation=investigation_dict,
        narrative=outcome.structured,
        is_fallback=outcome.is_fallback,
        provider=outcome.provider,
        model=outcome.model,
        error=outcome.error,
    )


@router.post("/anomalies/{anomaly_id}/acknowledge", response_model=MessageResponse)
def acknowledge_anomaly(
    anomaly_id: uuid.UUID, workspace: CurrentWorkspace, db: DbSession
) -> MessageResponse:
    anomaly = db.scalar(
        select(Anomaly).where(
            Anomaly.id == anomaly_id, Anomaly.workspace_id == workspace.id
        )
    )
    if anomaly is None:
        raise NotFoundError("We could not find that anomaly.")
    anomaly.is_acknowledged = True
    db.commit()
    return MessageResponse(message="Anomaly acknowledged.")


def _plain_narrative(investigation: dict) -> dict:
    """The investigation stated in the engine's own words.

    Not a degraded placeholder: every statement here was written by the
    deterministic engine from computed figures, so it is the most trustworthy
    form the answer takes. It is plainer prose than a model produces, and that
    is the only difference.
    """
    return {
        "headline": investigation.get("headline", ""),
        "what_happened": " ".join(
            f["statement"] for f in investigation.get("what_happened", [])
        ),
        "where_it_happened": " ".join(
            f["statement"] for f in investigation.get("where_it_happened", [])
        ),
        "possible_explanations": [
            f["statement"] for f in investigation.get("possible_explanations", [])
        ],
        "recommended_checks": investigation.get("recommended_checks", []),
        "confidence": investigation.get("confidence", "low"),
    }


def _period_label(anomaly: Anomaly) -> str:
    """Rebuild the display label the detector produced for this period."""
    from app.analytics.investigation import as_frame_timestamp
    from app.analytics.timeseries import period_label

    # Naive, to match the labels the detector produced from the dataset's own
    # naive dates. A timezone-aware value here would shift the label by the
    # offset and name the wrong day.
    return period_label(as_frame_timestamp(anomaly.occurred_at), Grain(anomaly.grain))
