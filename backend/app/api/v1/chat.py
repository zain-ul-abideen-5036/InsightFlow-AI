"""Ask InsightFlow — the business question interface.

The pipeline is strict:

    question -> plan -> deterministic execution -> evidence -> written answer

The answer is persisted with the plan and the evidence bundle attached, so
"View evidence" can reconstruct exactly how every figure was produced — even
months later, and even if the AI provider has since changed.
"""

from __future__ import annotations

import time
import uuid

from fastapi import APIRouter, Query, Request, status
from sqlalchemy import func, select

from app.analytics.context import build_context
from app.analytics.executor import answer_question
from app.analytics.ingestion import DatasetFileMissingError, read_dataset_frame
from app.analytics.planner import suggested_questions
from app.analytics.types import Grain
from app.api.deps import (
    CurrentUser,
    CurrentWorkspace,
    DbSession,
    ScopedChatSession,
    record_audit,
)
from app.core.errors import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.db.models import (
    ChatMessage,
    ChatSession,
    Confidence,
    Dataset,
    DatasetStatus,
    MessageRole,
)
from app.schemas.api import (
    ChatAskRequest,
    ChatAskResponse,
    ChatMessageOut,
    ChatSessionDetailOut,
    ChatSessionOut,
)
from app.schemas.common import MessageResponse

logger = get_logger(__name__)
router = APIRouter(prefix="/workspaces/{workspace_id}/chat", tags=["chat"])


def _resolve_dataset(db: DbSession, workspace, dataset_id: uuid.UUID | None) -> Dataset:
    """The dataset to answer against: the one requested, or the newest confirmed."""
    if dataset_id is not None:
        dataset = db.scalar(
            select(Dataset).where(
                Dataset.id == dataset_id, Dataset.workspace_id == workspace.id
            )
        )
        if dataset is None:
            raise NotFoundError("We could not find that dataset.")
        return dataset

    dataset = db.scalar(
        select(Dataset)
        .where(
            Dataset.workspace_id == workspace.id,
            Dataset.status == DatasetStatus.CONFIRMED,
        )
        .order_by(Dataset.created_at.desc())
        .limit(1)
    )
    if dataset is None:
        raise ValidationError(
            "There is no analysed dataset in this workspace yet.",
            hint="Upload a file and run an analysis, then ask your question again.",
        )
    return dataset


def _build_context_for(dataset: Dataset, workspace, db=None):
    try:
        frame = read_dataset_frame(dataset.storage_path, dataset.normalized_path, db=db)
    except DatasetFileMissingError:
        raise NotFoundError(
            "The file behind this dataset is no longer available.",
            hint="Upload the dataset again.",
        ) from None

    role_map = {
        column.name: column.effective_role
        for column in dataset.columns
        if column.is_included
    } or {column.name: column.semantic_role for column in dataset.columns}

    return build_context(
        frame,
        role_map,
        currency=workspace.currency,
        dataset_name=dataset.name,
        dataset_id=str(dataset.id),
        grain=Grain(dataset.semantic_map.get("grain") or dataset.profile.get("suggested_grain") or "day"),
    )


@router.post("/ask", response_model=ChatAskResponse, status_code=status.HTTP_201_CREATED)
def ask(
    payload: ChatAskRequest,
    workspace: CurrentWorkspace,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> ChatAskResponse:
    """Answer a business question with evidence."""
    from app.ai.service import deterministic_answer, explain_answer

    started = time.perf_counter()
    dataset = _resolve_dataset(db, workspace, payload.dataset_id)

    # -- Session -----------------------------------------------------------
    if payload.session_id is not None:
        chat_session = db.scalar(
            select(ChatSession).where(
                ChatSession.id == payload.session_id,
                ChatSession.workspace_id == workspace.id,
            )
        )
        if chat_session is None:
            raise NotFoundError("We could not find that conversation.")
    else:
        chat_session = ChatSession(
            workspace_id=workspace.id,
            user_id=user.id,
            dataset_id=dataset.id,
            title=payload.question.strip()[:120],
        )
        db.add(chat_session)
        db.flush()

    db.add(
        ChatMessage(
            workspace_id=workspace.id,
            session_id=chat_session.id,
            role=MessageRole.USER,
            content=payload.question.strip(),
        )
    )

    # Commit the question before doing any slow work.
    #
    # Everything below — the pandas analysis, and then a model call that takes
    # 60-180 seconds on local inference — used to run inside this transaction.
    # On SQLite the flush above takes a write lock, so every other writer in the
    # process spent that whole time waiting and then failed with "database is
    # locked"; on PostgreSQL it holds a pooled connection open for minutes to do
    # nothing. Committing here also means the user's question survives a model
    # failure or a restart mid-answer.
    session_id = chat_session.id
    db.commit()

    # -- Deterministic analysis -------------------------------------------
    ctx = _build_context_for(dataset, workspace, db)
    execution = answer_question(payload.question, ctx)

    # -- Written answer ----------------------------------------------------
    outcome = explain_answer(
        execution,
        dataset_name=dataset.name,
        currency=workspace.currency,
        notes=ctx.notes,
    )
    structured = outcome.structured or deterministic_answer(execution)

    content = structured.get("headline") or execution.narrative_hint or "No answer available."
    confidence_value = structured.get("confidence", "moderate")
    try:
        confidence = Confidence(confidence_value)
    except ValueError:
        confidence = Confidence.MODERATE

    message = ChatMessage(
        workspace_id=workspace.id,
        session_id=session_id,
        role=MessageRole.ASSISTANT,
        content=content,
        plan=execution.plan.to_dict(),
        # Persisted so "View evidence" works for the life of the conversation,
        # independent of the dataset and of the AI provider in use.
        evidence={
            "items": [e.to_dict() for e in execution.evidence],
            "results": execution.results,
            "narrative_hint": execution.narrative_hint,
            "insufficient": execution.insufficient,
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
        },
        structured=structured,
        confidence=confidence,
        provider=outcome.provider or None,
        model=outcome.model or None,
        latency_ms=int((time.perf_counter() - started) * 1000),
        is_fallback=outcome.is_fallback,
        error_message=outcome.error,
    )
    db.add(message)

    record_audit(
        db, action="chat.ask", user=user, workspace=workspace,
        resource_type="chat_session", resource_id=str(chat_session.id), request=request,
        metadata={"intent": execution.plan.intent.value, "fallback": outcome.is_fallback},
    )
    db.commit()
    db.refresh(message)
    db.refresh(chat_session)

    logger.info(
        "question answered",
        extra={
            "intent": execution.plan.intent.value,
            "evidence_items": len(execution.evidence),
            "fallback": outcome.is_fallback,
            "latency_ms": message.latency_ms,
        },
    )

    return ChatAskResponse(
        session=ChatSessionOut.model_validate(chat_session),
        message=ChatMessageOut.model_validate(message),
        suggestions=suggested_questions(ctx),
    )


@router.get("/suggestions", response_model=list[str])
def get_suggestions(
    workspace: CurrentWorkspace,
    db: DbSession,
    dataset_id: uuid.UUID | None = Query(default=None),
) -> list[str]:
    """Questions this workspace's data can actually answer."""
    try:
        dataset = _resolve_dataset(db, workspace, dataset_id)
        ctx = _build_context_for(dataset, workspace, db)
        return suggested_questions(ctx)
    except (ValidationError, NotFoundError):
        return []


@router.get("/sessions", response_model=list[ChatSessionOut])
def list_sessions(workspace: CurrentWorkspace, db: DbSession) -> list[ChatSessionOut]:
    rows = db.scalars(
        select(ChatSession)
        .where(ChatSession.workspace_id == workspace.id)
        .order_by(ChatSession.updated_at.desc())
        .limit(50)
    ).all()
    return [ChatSessionOut.model_validate(s) for s in rows]


@router.get("/sessions/{session_id}", response_model=ChatSessionDetailOut)
def get_session(chat_session: ScopedChatSession) -> ChatSessionDetailOut:
    return ChatSessionDetailOut.model_validate(chat_session)


@router.delete("/sessions/{session_id}", response_model=MessageResponse)
def delete_session(chat_session: ScopedChatSession, db: DbSession) -> MessageResponse:
    db.delete(chat_session)
    db.commit()
    return MessageResponse(message="Conversation deleted.")
