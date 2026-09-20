"""Request and response schemas for the v1 API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import MIN_PASSWORD_LENGTH, password_problems
from app.schemas.common import ORMModel

# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=200)
    full_name: str = Field(default="", max_length=160)
    business_name: str = Field(default="", max_length=160)

    @field_validator("password")
    @classmethod
    def _strong_enough(cls, value: str) -> str:
        problems = password_problems(value)
        if problems:
            raise ValueError(" ".join(problems))
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=200)

    @field_validator("password")
    @classmethod
    def _strong_enough(cls, value: str) -> str:
        problems = password_problems(value)
        if problems:
            raise ValueError(" ".join(problems))
        return value


class UserOut(ORMModel):
    id: uuid.UUID
    email: str
    full_name: str
    onboarding_completed: bool
    created_at: datetime


class WorkspaceOut(ORMModel):
    id: uuid.UUID
    name: str
    slug: str
    business_type: str
    currency: str
    timezone: str
    onboarding_step: int
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut
    workspaces: list[WorkspaceOut] = Field(default_factory=list)


class SessionResponse(BaseModel):
    user: UserOut
    workspaces: list[WorkspaceOut]


# --------------------------------------------------------------------------- #
# Workspace
# --------------------------------------------------------------------------- #


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    business_type: str = Field(default="other", max_length=64)
    currency: str = Field(default="USD", max_length=8)
    timezone: str = Field(default="UTC", max_length=64)


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    business_type: str | None = Field(default=None, max_length=64)
    currency: str | None = Field(default=None, max_length=8)
    timezone: str | None = Field(default=None, max_length=64)
    onboarding_step: int | None = Field(default=None, ge=0, le=6)


# --------------------------------------------------------------------------- #
# Datasets
# --------------------------------------------------------------------------- #


class DatasetColumnOut(ORMModel):
    id: uuid.UUID
    name: str
    position: int
    data_type: str
    semantic_role: str
    confirmed_role: str | None
    role_confidence: float
    is_included: bool
    null_count: int
    unique_count: int
    stats: dict[str, Any]


class DatasetOut(ORMModel):
    id: uuid.UUID
    name: str
    description: str
    original_filename: str
    file_format: str
    file_size_bytes: int
    row_count: int
    column_count: int
    duplicate_row_count: int
    missing_cell_count: int
    status: str
    error_message: str | None
    is_demo: bool
    created_at: datetime
    updated_at: datetime

    @field_validator("status", mode="before")
    @classmethod
    def _enum_value(cls, value: Any) -> str:
        return value.value if hasattr(value, "value") else str(value)


class DatasetDetailOut(DatasetOut):
    profile: dict[str, Any]
    semantic_map: dict[str, Any]
    preview_rows: list[dict[str, Any]]
    columns: list[DatasetColumnOut]


class ColumnRoleUpdate(BaseModel):
    name: str
    confirmed_role: str | None = None
    is_included: bool = True


class SchemaConfirmRequest(BaseModel):
    columns: list[ColumnRoleUpdate] = Field(default_factory=list)
    grain: str | None = Field(default=None, pattern="^(day|week|month|quarter)$")
    start_analysis: bool = True


class SchemaConfirmResponse(BaseModel):
    """The confirmed dataset, plus the analysis if one was started."""

    dataset: "DatasetDetailOut"
    analysis: "AnalysisOut | None" = None


class DatasetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)


# --------------------------------------------------------------------------- #
# Analyses
# --------------------------------------------------------------------------- #


class AnalysisCreate(BaseModel):
    dataset_id: uuid.UUID
    grain: str | None = Field(default=None, pattern="^(day|week|month|quarter)$")


class AnalysisOut(ORMModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    kind: str
    status: str
    stage: str
    progress: int
    stages: list[dict[str, Any]]
    started_at: datetime | None
    finished_at: datetime | None
    duration_ms: int | None
    error_code: str | None
    error_message: str | None
    error_hint: str | None
    summary: dict[str, Any]
    created_at: datetime

    @field_validator("status", mode="before")
    @classmethod
    def _enum_value(cls, value: Any) -> str:
        return value.value if hasattr(value, "value") else str(value)


class AnalysisDetailOut(AnalysisOut):
    results: dict[str, Any] = Field(default_factory=dict)


# --------------------------------------------------------------------------- #
# Insights & anomalies
# --------------------------------------------------------------------------- #


class InsightOut(ORMModel):
    id: uuid.UUID
    analysis_id: uuid.UUID
    dataset_id: uuid.UUID
    kind: str
    severity: str
    title: str
    summary: str
    narrative: str | None
    metric_key: str | None
    metric_value: float | None
    comparison_value: float | None
    change_pct: float | None
    direction: str | None
    unit: str
    evidence: list[dict[str, Any]]
    evidence_refs: dict[str, Any]
    score: float
    is_dismissed: bool
    created_at: datetime

    @field_validator("kind", "severity", "direction", mode="before")
    @classmethod
    def _enum_value(cls, value: Any) -> Any:
        return value.value if hasattr(value, "value") else value


class AnomalyOut(ORMModel):
    id: uuid.UUID
    analysis_id: uuid.UUID
    dataset_id: uuid.UUID
    metric_key: str
    metric_label: str
    occurred_at: datetime
    grain: str
    observed_value: float
    expected_value: float
    lower_bound: float | None
    upper_bound: float | None
    deviation_pct: float
    z_score: float | None
    method: str
    direction: str
    severity: str
    score: float
    context: dict[str, Any]
    investigation: dict[str, Any] | None
    investigated_at: datetime | None
    is_acknowledged: bool
    created_at: datetime

    @field_validator("direction", "severity", mode="before")
    @classmethod
    def _enum_value(cls, value: Any) -> Any:
        return value.value if hasattr(value, "value") else value


class InvestigationResponse(BaseModel):
    anomaly: AnomalyOut
    investigation: dict[str, Any]
    narrative: dict[str, Any]
    is_fallback: bool
    provider: str | None = None
    model: str | None = None
    error: str | None = None
    # True when a written narrative could still be produced for this
    # investigation but was not generated on this request. The interface uses
    # it to show the evidence immediately and fetch the prose separately,
    # rather than holding the whole page behind a slow model call.
    narrative_pending: bool = False


# --------------------------------------------------------------------------- #
# Chat
# --------------------------------------------------------------------------- #


class ChatAskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    session_id: uuid.UUID | None = None
    dataset_id: uuid.UUID | None = None


class ChatMessageOut(ORMModel):
    id: uuid.UUID
    session_id: uuid.UUID
    role: str
    content: str
    plan: dict[str, Any] | None
    evidence: dict[str, Any] | None
    structured: dict[str, Any] | None
    confidence: str | None
    provider: str | None
    model: str | None
    latency_ms: int | None
    is_fallback: bool
    error_message: str | None
    created_at: datetime

    @field_validator("role", "confidence", mode="before")
    @classmethod
    def _enum_value(cls, value: Any) -> Any:
        return value.value if hasattr(value, "value") else value


class ChatSessionOut(ORMModel):
    id: uuid.UUID
    title: str
    dataset_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class ChatSessionDetailOut(ChatSessionOut):
    messages: list[ChatMessageOut]


class ChatAskResponse(BaseModel):
    session: ChatSessionOut
    message: ChatMessageOut
    suggestions: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Reports
# --------------------------------------------------------------------------- #


class ReportCreate(BaseModel):
    analysis_id: uuid.UUID | None = None
    dataset_id: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=255)


class ReportOut(ORMModel):
    id: uuid.UUID
    title: str
    period_label: str
    executive_summary: str
    generated_by: str
    analysis_id: uuid.UUID | None
    dataset_id: uuid.UUID | None
    created_at: datetime


class ReportDetailOut(ReportOut):
    sections: list[dict[str, Any]]


# --------------------------------------------------------------------------- #
# Settings / misc
# --------------------------------------------------------------------------- #


class AIStatusResponse(BaseModel):
    enabled: bool
    provider: str
    model: str
    available: bool
    detail: str
    latency_ms: int | None = None
    data_sent: list[str]
    max_sample_rows: int


class OverviewResponse(BaseModel):
    workspace: WorkspaceOut
    has_data: bool
    latest_analysis: AnalysisOut | None
    # An analysis currently queued or running, if there is one. Distinct from
    # `latest_analysis`, which is always the most recent *completed* run: a
    # workspace can have finished results and a newer analysis in flight at the
    # same time, and the dashboard needs to tell those apart.
    running_analysis: AnalysisOut | None = None
    metrics: list[dict[str, Any]]
    insights: list[InsightOut]
    anomalies: list[AnomalyOut]
    trends: dict[str, Any]
    top_segments: dict[str, Any]
    dataset_count: int
    suggestions: list[str]


class NotificationOut(ORMModel):
    id: uuid.UUID
    kind: str
    title: str
    body: str
    link: str | None
    is_read: bool
    created_at: datetime
