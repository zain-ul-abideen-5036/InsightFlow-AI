"""Shared API dependencies.

**This module is where multi-tenancy is enforced.** Every workspace-scoped route
resolves its workspace through :func:`require_workspace`, and every nested
resource is loaded through a helper that filters on ``workspace_id``. A dataset
id belonging to another tenant does not resolve, regardless of how the request
reached us.

Not-found is returned instead of forbidden when a caller is not a member of a
workspace. Returning 403 would confirm that the workspace exists, which is an
information leak across tenants.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Annotated, TypeVar

from fastapi import Depends, Header, Path, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.client import client_address
from app.core.errors import AuthenticationError, NotFoundError, PermissionDeniedError
from app.core.security import InvalidTokenError, decode_token
from app.db.models import (
    Analysis,
    ChatSession,
    Dataset,
    Report,
    User,
    Workspace,
    WorkspaceMember,
    WorkspaceRole,
)
from app.db.session import get_db

ModelT = TypeVar("ModelT")

DbSession = Annotated[Session, Depends(get_db)]


def _bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise AuthenticationError(
            "You need to sign in to do that.",
            hint="Your session may have expired. Sign in again.",
        )
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AuthenticationError("The authorization header is malformed.")
    return token


def get_current_user(
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    """Resolve the authenticated user from a bearer token."""
    token = _bearer_token(authorization)
    try:
        payload = decode_token(token, "access")
    except InvalidTokenError as exc:
        raise AuthenticationError(str(exc), hint="Sign in again to continue.") from exc

    try:
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, KeyError, TypeError) as exc:
        raise AuthenticationError("This session token is not valid.") from exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("This account is no longer active.")

    # Password changes bump token_version, which retires every token issued
    # before the change.
    if payload.get("tv") is not None and payload["tv"] != user.token_version:
        raise AuthenticationError(
            "Your password was changed, so this session has ended.",
            hint="Sign in again with your new password.",
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_workspace(
    workspace_id: Annotated[uuid.UUID, Path()],
    db: DbSession,
    user: CurrentUser,
) -> Workspace:
    """Resolve a workspace the caller is actually a member of."""
    membership = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    if membership is None:
        # Deliberately 404: a 403 would confirm this workspace exists.
        raise NotFoundError(
            "We could not find that workspace.",
            hint="Check the link, or switch workspace from the sidebar.",
        )
    workspace = db.get(Workspace, workspace_id)
    if workspace is None:
        raise NotFoundError("We could not find that workspace.")
    return workspace


CurrentWorkspace = Annotated[Workspace, Depends(require_workspace)]


def require_role(*roles: WorkspaceRole) -> Callable[..., Workspace]:
    """Dependency factory for routes that need elevated membership."""

    def dependency(
        workspace: CurrentWorkspace,
        db: DbSession,
        user: CurrentUser,
    ) -> Workspace:
        membership = db.scalar(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace.id,
                WorkspaceMember.user_id == user.id,
            )
        )
        if membership is None or membership.role not in roles:
            raise PermissionDeniedError(
                "You do not have permission to do that in this workspace.",
                hint="Ask a workspace owner or admin to make the change.",
            )
        return workspace

    return dependency


# --------------------------------------------------------------------------- #
# Scoped resource loaders
# --------------------------------------------------------------------------- #


def _scoped(
    db: Session,
    model: type[ModelT],
    resource_id: uuid.UUID,
    workspace: Workspace,
    label: str,
) -> ModelT:
    """Load a record, filtering on workspace so cross-tenant ids never resolve."""
    instance = db.scalar(
        select(model).where(
            model.id == resource_id,  # type: ignore[attr-defined]
            model.workspace_id == workspace.id,  # type: ignore[attr-defined]
        )
    )
    if instance is None:
        raise NotFoundError(f"We could not find that {label}.")
    return instance


def get_dataset(
    dataset_id: Annotated[uuid.UUID, Path()],
    db: DbSession,
    workspace: CurrentWorkspace,
) -> Dataset:
    return _scoped(db, Dataset, dataset_id, workspace, "dataset")


def get_analysis(
    analysis_id: Annotated[uuid.UUID, Path()],
    db: DbSession,
    workspace: CurrentWorkspace,
) -> Analysis:
    return _scoped(db, Analysis, analysis_id, workspace, "analysis")


def get_report(
    report_id: Annotated[uuid.UUID, Path()],
    db: DbSession,
    workspace: CurrentWorkspace,
) -> Report:
    return _scoped(db, Report, report_id, workspace, "report")


def get_chat_session(
    session_id: Annotated[uuid.UUID, Path()],
    db: DbSession,
    workspace: CurrentWorkspace,
) -> ChatSession:
    return _scoped(db, ChatSession, session_id, workspace, "conversation")


ScopedDataset = Annotated[Dataset, Depends(get_dataset)]
ScopedAnalysis = Annotated[Analysis, Depends(get_analysis)]
ScopedReport = Annotated[Report, Depends(get_report)]
ScopedChatSession = Annotated[ChatSession, Depends(get_chat_session)]


# --------------------------------------------------------------------------- #
# Audit
# --------------------------------------------------------------------------- #


def client_info(request: Request) -> dict[str, str | None]:
    # The same trusted resolution the rate limiter uses. An audit log that
    # records a caller-supplied address is worse than one that records none:
    # it is evidence that points wherever the attacker chose.
    ip = client_address(request)
    return {
        "ip_address": None if ip == "unknown" else ip,
        "user_agent": (request.headers.get("user-agent") or "")[:255] or None,
    }


def record_audit(
    db: Session,
    *,
    action: str,
    user: User | None = None,
    workspace: Workspace | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    request: Request | None = None,
    metadata: dict | None = None,
) -> None:
    """Write an audit entry. Never contains dataset contents."""
    from app.core.logging import get_request_id
    from app.db.models import AuditLog

    info = client_info(request) if request is not None else {}
    db.add(
        AuditLog(
            workspace_id=workspace.id if workspace else None,
            user_id=user.id if user else None,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else None,
            ip_address=info.get("ip_address"),
            user_agent=info.get("user_agent"),
            request_id=get_request_id(),
            metadata_json=metadata or {},
        )
    )
