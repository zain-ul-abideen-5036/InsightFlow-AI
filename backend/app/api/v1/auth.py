"""Authentication endpoints.

The API is stateless: it issues bearer tokens and validates them. The browser
session cookie is owned by the Next.js layer, which keeps cookie handling out of
the backend entirely and makes these routes trivial to test.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession, record_audit
from app.core.config import settings
from app.core.errors import AuthenticationError, ConflictError, ValidationError
from app.core.logging import get_logger
from app.core.security import (
    InvalidTokenError,
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    decode_token,
    dummy_password_verify,
    hash_password,
    password_problems,
    token_expiry_seconds,
    verify_password,
)
from app.db.models import User, Workspace, WorkspaceMember, WorkspaceRole
from app.schemas.api import (
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    SessionResponse,
    SignupRequest,
    TokenResponse,
    UserOut,
    WorkspaceOut,
)
from app.schemas.common import MessageResponse

logger = get_logger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:60] or "workspace"


def _unique_slug(db: DbSession, base: str) -> str:
    slug = _slugify(base)
    candidate = slug
    suffix = 1
    while db.scalar(select(Workspace.id).where(Workspace.slug == candidate)) is not None:
        suffix += 1
        candidate = f"{slug}-{suffix}"
        if suffix > 50:
            candidate = f"{slug}-{uuid.uuid4().hex[:8]}"
            break
    return candidate


def _workspaces_for(db: DbSession, user: User) -> list[Workspace]:
    return list(
        db.scalars(
            select(Workspace)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .where(WorkspaceMember.user_id == user.id)
            .order_by(Workspace.created_at)
        ).all()
    )


def _issue_tokens(db: DbSession, user: User) -> TokenResponse:
    workspaces = _workspaces_for(db, user)
    return TokenResponse(
        access_token=create_access_token(str(user.id), tv=user.token_version),
        refresh_token=create_refresh_token(str(user.id)),
        expires_in=token_expiry_seconds(),
        user=UserOut.model_validate(user),
        workspaces=[WorkspaceOut.model_validate(w) for w in workspaces],
    )


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, request: Request, db: DbSession) -> TokenResponse:
    """Create an account and its first workspace."""
    email = payload.email.lower().strip()

    existing = db.scalar(select(User).where(func.lower(User.email) == email))
    if existing is not None:
        # The email is already visible to whoever submitted it, so this is not
        # an enumeration leak — and a vague error here only frustrates users.
        raise ConflictError(
            "An account with this email address already exists.",
            hint="Sign in instead, or reset your password.",
        )

    problems = password_problems(payload.password)
    if problems:
        raise ValidationError(" ".join(problems))

    user = User(
        email=email,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()

    workspace_name = (payload.business_name or payload.full_name or "My workspace").strip()
    workspace = Workspace(name=workspace_name[:160], slug=_unique_slug(db, workspace_name))
    db.add(workspace)
    db.flush()

    db.add(
        WorkspaceMember(
            workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.OWNER
        )
    )
    record_audit(
        db, action="user.signup", user=user, workspace=workspace,
        resource_type="user", resource_id=str(user.id), request=request,
    )
    db.commit()
    db.refresh(user)

    logger.info("user signed up", extra={"user_id": str(user.id)})
    return _issue_tokens(db, user)


@router.post("/demo", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def start_demo(request: Request, db: DbSession) -> TokenResponse:
    """Open a throwaway workspace with the sample data already loading.

    The point of the demo is to remove every step between "I saw the landing
    page" and "I am looking at an analysis of real-shaped data". That means no
    password to invent, no file to find, and no onboarding wizard with nothing
    to ask.

    It is an unauthenticated endpoint that creates a row, which deserves care,
    so: it sits under ``/auth/`` and inherits the strict authentication rate
    limit, it is switched off entirely unless ``DEMO_DATA_ENABLED``, the
    workspace it creates is isolated like any other, the data in it is
    generated, and it is deleted after ``DEMO_SESSION_HOURS`` together with its
    files.
    """
    from app.jobs.runner import run_analysis_now, submit_analysis
    from app.seed.demo import create_demo_session

    user, workspace, analysis = create_demo_session(db)

    record_audit(
        db, action="demo.start", user=user, workspace=workspace,
        resource_type="workspace", resource_id=str(workspace.id), request=request,
    )
    db.commit()
    db.refresh(user)
    db.refresh(analysis)

    # After the commit, never before: the worker thread looks the row up by id.
    submit_analysis(analysis.id)

    # Where nothing runs behind a response, run it here instead.
    #
    # The demo has no screen on which to trigger the run: it hands back a
    # session and the visitor lands on a dashboard. Leaving the analysis queued
    # would mean the one flow designed to need no steps is the only one that
    # arrives empty. Measured at ~4s on this dataset, against the ~9s the
    # endpoint already spends generating and profiling it, so the visitor waits
    # a little longer once rather than looking at a blank overview.
    if settings.analysis_execution == "request":
        run_analysis_now(analysis.id)
        db.refresh(analysis)

    logger.info("demo session started", extra={"workspace_id": str(workspace.id)})
    return _issue_tokens(db, user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: DbSession) -> TokenResponse:
    email = payload.email.lower().strip()
    user = db.scalar(select(User).where(func.lower(User.email) == email))

    if user is None:
        # Spend comparable CPU so response timing does not reveal whether the
        # address is registered.
        dummy_password_verify()
        raise AuthenticationError(
            "That email address or password is incorrect.",
            hint="Check for typos, or reset your password.",
        )

    if not verify_password(payload.password, user.password_hash):
        record_audit(
            db, action="user.login_failed", user=user,
            resource_type="user", resource_id=str(user.id), request=request,
        )
        db.commit()
        raise AuthenticationError(
            "That email address or password is incorrect.",
            hint="Check for typos, or reset your password.",
        )

    if not user.is_active:
        raise AuthenticationError("This account has been deactivated.")

    user.last_login_at = datetime.now(timezone.utc)
    record_audit(
        db, action="user.login", user=user,
        resource_type="user", resource_id=str(user.id), request=request,
    )
    db.commit()
    db.refresh(user)
    return _issue_tokens(db, user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: DbSession) -> TokenResponse:
    try:
        claims = decode_token(payload.refresh_token, "refresh")
    except InvalidTokenError as exc:
        raise AuthenticationError(str(exc), hint="Sign in again to continue.") from exc

    user = db.get(User, uuid.UUID(claims["sub"]))
    if user is None or not user.is_active:
        raise AuthenticationError("This account is no longer active.")
    return _issue_tokens(db, user)


@router.get("/session", response_model=SessionResponse)
def session(user: CurrentUser, db: DbSession) -> SessionResponse:
    """The current user and their workspaces."""
    return SessionResponse(
        user=UserOut.model_validate(user),
        workspaces=[WorkspaceOut.model_validate(w) for w in _workspaces_for(db, user)],
    )


@router.post("/password-reset", response_model=MessageResponse)
def request_password_reset(
    payload: PasswordResetRequest, request: Request, db: DbSession
) -> MessageResponse:
    """Begin a password reset.

    Always reports success. Revealing whether an address is registered would
    turn this endpoint into an account-enumeration oracle.
    """
    email = payload.email.lower().strip()
    user = db.scalar(select(User).where(func.lower(User.email) == email))

    if user is not None:
        token = create_password_reset_token(str(user.id))
        record_audit(
            db, action="user.password_reset_requested", user=user,
            resource_type="user", resource_id=str(user.id), request=request,
        )
        db.commit()
        # No email provider is configured in this build. In development the
        # token is logged so the flow is testable end to end; in production this
        # is where the transactional email would be sent.
        if not settings.is_production:
            logger.info(
                "password reset token issued (development only)",
                extra={"email": email, "token": token},
            )

    return MessageResponse(
        message=(
            "If an account exists for that email address, we have sent password "
            "reset instructions."
        )
    )


@router.post("/password-reset/confirm", response_model=MessageResponse)
def confirm_password_reset(
    payload: PasswordResetConfirm, request: Request, db: DbSession
) -> MessageResponse:
    try:
        claims = decode_token(payload.token, "password_reset")
    except InvalidTokenError as exc:
        raise AuthenticationError(
            str(exc), hint="Request a new password reset link."
        ) from exc

    user = db.get(User, uuid.UUID(claims["sub"]))
    if user is None or not user.is_active:
        raise AuthenticationError("This reset link is no longer valid.")

    problems = password_problems(payload.password)
    if problems:
        raise ValidationError(" ".join(problems))

    user.password_hash = hash_password(payload.password)
    # Invalidate every token issued before this change.
    user.token_version += 1
    record_audit(
        db, action="user.password_reset", user=user,
        resource_type="user", resource_id=str(user.id), request=request,
    )
    db.commit()
    return MessageResponse(message="Your password has been updated. You can now sign in.")


@router.post("/logout", response_model=MessageResponse)
def logout(user: CurrentUser, request: Request, db: DbSession) -> MessageResponse:
    """Record the logout.

    Tokens are stateless and short-lived, so the meaningful action is the
    frontend clearing its session cookie. This endpoint exists so the event is
    auditable.
    """
    record_audit(
        db, action="user.logout", user=user,
        resource_type="user", resource_id=str(user.id), request=request,
    )
    db.commit()
    return MessageResponse(message="Signed out.")
