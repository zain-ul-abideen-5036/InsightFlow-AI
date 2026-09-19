"""ORM models.

Tenancy rule enforced throughout: every table that holds customer data carries a
``workspace_id`` foreign key with an index, and deletion cascades from the
workspace downwards. No query in the application ever loads a workspace-scoped
row without filtering on that column.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import GUID, JSONB, Base, TimestampMixin, UTCDateTime, UUIDPrimaryKeyMixin


# --------------------------------------------------------------------------- #
# Enumerations
# --------------------------------------------------------------------------- #


class WorkspaceRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class DatasetStatus(str, enum.Enum):
    UPLOADING = "uploading"
    PROFILING = "profiling"
    READY = "ready"          # profiled, schema awaiting confirmation
    CONFIRMED = "confirmed"  # schema confirmed by the user
    FAILED = "failed"


class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Severity(str, enum.Enum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class InsightKind(str, enum.Enum):
    TREND = "trend"
    RISK = "risk"
    OPPORTUNITY = "opportunity"
    ANOMALY = "anomaly"
    CONCENTRATION = "concentration"
    CUSTOMER = "customer"
    PRODUCT = "product"
    GEOGRAPHY = "geography"
    DATA_QUALITY = "data_quality"


class Direction(str, enum.Enum):
    UP = "up"
    DOWN = "down"
    FLAT = "flat"


class Confidence(str, enum.Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"


class MessageRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


def _enum(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    """VARCHAR-backed enum: portable across SQLite and PostgreSQL."""
    return SAEnum(
        enum_cls,
        name=name,
        native_enum=False,
        length=32,
        values_callable=lambda e: [member.value for member in e],
    )


# --------------------------------------------------------------------------- #
# Identity
# --------------------------------------------------------------------------- #


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    # Bumped on password change so previously issued tokens stop working.
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # A throwaway account created by the public demo, deleted when it expires.
    # Nothing about it is privileged; the flag exists so the clean-up job can
    # tell generated accounts from real ones and never touch a real one.
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    memberships: Mapped[list["WorkspaceMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Workspace(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "workspaces"
    # The demo clean-up filters on is_demo, and almost no rows will have it set.
    __table_args__ = (Index("ix_workspaces_is_demo", "is_demo"),)

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    business_type: Mapped[str] = mapped_column(String(64), nullable=False, default="other")
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    onboarding_step: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    # Created by the public demo and reclaimed after DEMO_SESSION_HOURS.
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    members: Mapped[list["WorkspaceMember"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )
    datasets: Mapped[list["Dataset"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )


class WorkspaceMember(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "workspace_members"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),
        Index("ix_workspace_members_user", "user_id"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[WorkspaceRole] = mapped_column(
        _enum(WorkspaceRole, "workspace_role"), nullable=False, default=WorkspaceRole.OWNER
    )

    workspace: Mapped[Workspace] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")


# --------------------------------------------------------------------------- #
# Datasets
# --------------------------------------------------------------------------- #


class Dataset(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "datasets"
    __table_args__ = (Index("ix_datasets_workspace_created", "workspace_id", "created_at"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="SET NULL")
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_format: Mapped[str] = mapped_column(String(16), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    encoding: Mapped[str] = mapped_column(String(32), nullable=False, default="utf-8")
    delimiter: Mapped[str] = mapped_column(String(8), nullable=False, default=",")
    checksum: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    normalized_path: Mapped[str | None] = mapped_column(String(512))

    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    column_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duplicate_row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    missing_cell_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    status: Mapped[DatasetStatus] = mapped_column(
        _enum(DatasetStatus, "dataset_status"), nullable=False, default=DatasetStatus.UPLOADING
    )
    error_message: Mapped[str | None] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Detected structure: grain, date range, entity mapping, quality warnings.
    profile: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    # User-confirmed semantic mapping (metric column -> role).
    semantic_map: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    preview_rows: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)

    workspace: Mapped[Workspace] = relationship(back_populates="datasets")
    columns: Mapped[list["DatasetColumn"]] = relationship(
        back_populates="dataset",
        cascade="all, delete-orphan",
        order_by="DatasetColumn.position",
    )
    versions: Mapped[list["DatasetVersion"]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )
    analyses: Mapped[list["Analysis"]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )


class DatasetColumn(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "dataset_columns"
    __table_args__ = (
        UniqueConstraint("dataset_id", "name", name="uq_dataset_column_name"),
        Index("ix_dataset_columns_workspace", "workspace_id"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    data_type: Mapped[str] = mapped_column(String(32), nullable=False, default="string")
    # Detected semantic role, e.g. date / currency / customer_id / product.
    semantic_role: Mapped[str] = mapped_column(String(48), nullable=False, default="unknown")
    # Role after user review — this is what analysis actually uses.
    confirmed_role: Mapped[str | None] = mapped_column(String(48))
    role_confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    is_included: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    null_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unique_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Distribution summary: min/max/mean/median/std, top values, sample values.
    stats: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    dataset: Mapped[Dataset] = relationship(back_populates="columns")

    @property
    def effective_role(self) -> str:
        return self.confirmed_role or self.semantic_role


class DatasetVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Immutable record of each upload/confirmation, for auditability."""

    __tablename__ = "dataset_versions"
    __table_args__ = (UniqueConstraint("dataset_id", "version", name="uq_dataset_version"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    change_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")

    dataset: Mapped[Dataset] = relationship(back_populates="versions")


# --------------------------------------------------------------------------- #
# Analysis
# --------------------------------------------------------------------------- #


class Analysis(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """An analysis run. Doubles as the job record for the async runner."""

    __tablename__ = "analyses"
    __table_args__ = (Index("ix_analyses_workspace_status", "workspace_id", "status"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="SET NULL")
    )

    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="full")
    status: Mapped[JobStatus] = mapped_column(
        _enum(JobStatus, "job_status"), nullable=False, default=JobStatus.QUEUED, index=True
    )
    stage: Mapped[str] = mapped_column(String(48), nullable=False, default="queued")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Ordered stage log: [{key, label, status, started_at, finished_at}]
    stages: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)

    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    duration_ms: Mapped[int | None] = mapped_column(Integer)

    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)
    error_hint: Mapped[str | None] = mapped_column(Text)

    params: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    summary: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    dataset: Mapped[Dataset] = relationship(back_populates="analyses")
    # Named `result_sections`, not `results`: the API exposes a `results` field
    # holding a section->payload mapping, and an ORM attribute of the same name
    # is silently picked up by `model_validate`, replacing the mapping with a
    # list of ORM objects.
    result_sections: Mapped[list["AnalysisResult"]] = relationship(
        back_populates="analysis", cascade="all, delete-orphan"
    )
    insights: Mapped[list["Insight"]] = relationship(
        back_populates="analysis", cascade="all, delete-orphan"
    )
    anomalies: Mapped[list["Anomaly"]] = relationship(
        back_populates="analysis", cascade="all, delete-orphan"
    )
    metrics: Mapped[list["BusinessMetric"]] = relationship(
        back_populates="analysis", cascade="all, delete-orphan"
    )


class AnalysisResult(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One section of a completed analysis (revenue, products, customers, …)."""

    __tablename__ = "analysis_results"
    __table_args__ = (
        UniqueConstraint("analysis_id", "section", name="uq_analysis_section"),
        Index("ix_analysis_results_workspace", "workspace_id"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    section: Mapped[str] = mapped_column(String(48), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    analysis: Mapped[Analysis] = relationship(back_populates="result_sections")


class BusinessMetric(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A headline KPI with its comparison window, kept queryable for dashboards."""

    __tablename__ = "business_metrics"
    __table_args__ = (
        Index("ix_business_metrics_workspace_key", "workspace_id", "key"),
        CheckConstraint("value = value", name="ck_business_metric_value_not_nan"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False
    )

    key: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(24), nullable=False, default="number")
    previous_value: Mapped[float | None] = mapped_column(Float)
    change_pct: Mapped[float | None] = mapped_column(Float)
    direction: Mapped[Direction | None] = mapped_column(_enum(Direction, "direction"))
    period_start: Mapped[datetime | None] = mapped_column(UTCDateTime())
    period_end: Mapped[datetime | None] = mapped_column(UTCDateTime())
    # Which columns and row counts produced this number.
    provenance: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    analysis: Mapped[Analysis] = relationship(back_populates="metrics")


class Insight(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "insights"
    __table_args__ = (
        Index("ix_insights_workspace_created", "workspace_id", "created_at"),
        Index("ix_insights_workspace_severity", "workspace_id", "severity"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False
    )

    kind: Mapped[InsightKind] = mapped_column(_enum(InsightKind, "insight_kind"), nullable=False)
    severity: Mapped[Severity] = mapped_column(
        _enum(Severity, "severity"), nullable=False, default=Severity.INFO
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    # Deterministic, template-generated summary. Always present.
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Optional AI-written narrative. Never replaces `summary`.
    narrative: Mapped[str | None] = mapped_column(Text)

    metric_key: Mapped[str | None] = mapped_column(String(64))
    metric_value: Mapped[float | None] = mapped_column(Float)
    comparison_value: Mapped[float | None] = mapped_column(Float)
    change_pct: Mapped[float | None] = mapped_column(Float)
    direction: Mapped[Direction | None] = mapped_column(_enum(Direction, "direction"))
    unit: Mapped[str] = mapped_column(String(24), nullable=False, default="number")

    # Typed supporting facts: [{label, value, unit, kind, column, period}]
    evidence: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    # Chart/period pointers so "View evidence" can reconstruct the calculation.
    evidence_refs: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    is_dismissed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    analysis: Mapped[Analysis] = relationship(back_populates="insights")


class Anomaly(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "anomalies"
    __table_args__ = (
        Index("ix_anomalies_workspace_occurred", "workspace_id", "occurred_at"),
        Index("ix_anomalies_workspace_severity", "workspace_id", "severity"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False
    )

    metric_key: Mapped[str] = mapped_column(String(64), nullable=False)
    metric_label: Mapped[str] = mapped_column(String(120), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    grain: Mapped[str] = mapped_column(String(16), nullable=False, default="day")

    observed_value: Mapped[float] = mapped_column(Float, nullable=False)
    expected_value: Mapped[float] = mapped_column(Float, nullable=False)
    lower_bound: Mapped[float | None] = mapped_column(Float)
    upper_bound: Mapped[float | None] = mapped_column(Float)
    deviation_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # Standardised deviation; kept for ranking, surfaced only in advanced views.
    z_score: Mapped[float | None] = mapped_column(Float)

    method: Mapped[str] = mapped_column(String(32), nullable=False, default="rolling_zscore")
    direction: Mapped[Direction] = mapped_column(
        _enum(Direction, "direction"), nullable=False, default=Direction.DOWN
    )
    severity: Mapped[Severity] = mapped_column(
        _enum(Severity, "severity"), nullable=False, default=Severity.MEDIUM
    )
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    context: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    # Populated on demand by the investigation engine.
    investigation: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    # The written narrative over that investigation, cached alongside it.
    #
    # Without this, reopening an investigation silently downgraded its prose:
    # the deterministic result was cached but the generated text was not, so the
    # second visit fell back to the plainer engine-written summary while showing
    # no indication that anything had changed. Storing it also means the 60-180s
    # cost of local inference is paid exactly once per anomaly.
    narrative: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    investigated_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    is_acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    analysis: Mapped[Analysis] = relationship(back_populates="anomalies")


# --------------------------------------------------------------------------- #
# Conversation
# --------------------------------------------------------------------------- #


class ChatSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "chat_sessions"
    __table_args__ = (Index("ix_chat_sessions_workspace_updated", "workspace_id", "updated_at"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="SET NULL")
    )
    dataset_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("datasets.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="New conversation")

    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )


class ChatMessage(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "chat_messages"
    __table_args__ = (Index("ix_chat_messages_session_created", "session_id", "created_at"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[MessageRole] = mapped_column(_enum(MessageRole, "message_role"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # The deterministic plan that was executed to answer this question.
    plan: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    # The structured evidence bundle handed to the model.
    evidence: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    # Validated structured answer (summary, findings, confidence, actions).
    structured: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    confidence: Mapped[Confidence | None] = mapped_column(_enum(Confidence, "confidence"))
    provider: Mapped[str | None] = mapped_column(String(48))
    model: Mapped[str | None] = mapped_column(String(96))
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    # True when the AI layer was unavailable and a deterministic answer was used.
    is_fallback: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    error_message: Mapped[str | None] = mapped_column(Text)

    session: Mapped[ChatSession] = relationship(back_populates="messages")


# --------------------------------------------------------------------------- #
# Reports, notifications, audit
# --------------------------------------------------------------------------- #


class Report(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "reports"
    __table_args__ = (Index("ix_reports_workspace_created", "workspace_id", "created_at"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    analysis_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("analyses.id", ondelete="SET NULL")
    )
    dataset_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("datasets.id", ondelete="SET NULL")
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="SET NULL")
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    period_label: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    executive_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Ordered, typed sections rendered by the report page.
    sections: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    generated_by: Mapped[str] = mapped_column(String(32), nullable=False, default="deterministic")


class Notification(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_workspace_read", "workspace_id", "is_read"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE")
    )
    kind: Mapped[str] = mapped_column(String(48), nullable=False, default="info")
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    link: Mapped[str | None] = mapped_column(String(512))
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class AuditLog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Security-relevant events. Never contains dataset contents."""

    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_workspace_created", "workspace_id", "created_at"),)

    workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    resource_type: Mapped[str | None] = mapped_column(String(48))
    resource_id: Mapped[str | None] = mapped_column(String(64))
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    request_id: Mapped[str | None] = mapped_column(String(32))
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
