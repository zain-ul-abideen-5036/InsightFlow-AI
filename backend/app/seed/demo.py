"""The public demo: a working product, one click from the landing page.

A visitor should be able to judge an analytics tool before creating an account,
and asking them to invent a password and find a spreadsheet first is exactly the
friction that stops them. This module builds a complete, self-contained
workspace — account, dataset, confirmed schema, running analysis — from nothing.

Three properties make that safe rather than reckless:

* **Every demo is isolated.** Each visitor gets their own workspace. Nobody can
  see, edit, or delete anyone else's, and no production data is exposed, because
  the data is generated.
* **Nothing is a secret.** There are no shared demo credentials in the source or
  the documentation. The account is created on the fly with a random password
  that is never displayed, never emailed, and never usable again once the
  session cookie is gone.
* **It expires.** Demo workspaces are deleted after ``DEMO_SESSION_HOURS``,
  along with their files, so an open endpoint cannot fill a disk.

The endpoint that calls this is under ``/auth/``, so it inherits the strict
authentication rate limit.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.ingestion import checksum, frame_to_parquet_bytes, read_upload
from app.analytics.profiling import build_preview, column_summary, profile_dataset
from app.analytics.types import Grain
from app.core.config import settings
from app.core.errors import AppError
from app.core.logging import get_logger
from app.core.storage import get_storage, storage_key
from app.db.models import (
    Analysis,
    Dataset,
    DatasetColumn,
    DatasetStatus,
    DatasetVersion,
    JobStatus,
    User,
    Workspace,
    WorkspaceMember,
    WorkspaceRole,
)

logger = get_logger(__name__)

DEMO_EMAIL_DOMAIN = "demo.insightflow.local"
DEMO_DATASET_NAME = "NovaMart Orders (sample)"
DEMO_DATASET_DESCRIPTION = (
    "A fictional e-commerce dataset covering 15 months of orders, "
    "used to demonstrate InsightFlow."
)
DEMO_FILENAME = "novamart_orders.csv"


class DemoUnavailableError(AppError):
    """Demo mode is switched off for this deployment."""

    status_code = 404
    code = "demo_unavailable"


def _dataset_prefix(workspace_id: uuid.UUID, dataset_id: uuid.UUID) -> str:
    return storage_key("uploads", str(workspace_id), str(dataset_id))


def install_demo_dataset(db: Session, workspace: Workspace, user: User) -> Dataset:
    """Load the NovaMart sample into a workspace, through the normal pipeline.

    Deliberately not a database fixture: the file is generated, then read,
    profiled, and stored by the same code an uploaded file goes through. A demo
    that bypassed ingestion would stop exercising the part most likely to break.
    """
    from app.seed.novamart import generate_csv_bytes

    existing = db.scalar(
        select(Dataset).where(
            Dataset.workspace_id == workspace.id, Dataset.is_demo.is_(True)
        )
    )
    if existing is not None:
        return existing

    raw = generate_csv_bytes()
    result = read_upload(raw, DEMO_FILENAME)
    profile = profile_dataset(result.frame, warnings=result.warnings)

    dataset = Dataset(
        workspace_id=workspace.id,
        created_by_id=user.id,
        name=DEMO_DATASET_NAME,
        description=DEMO_DATASET_DESCRIPTION,
        original_filename=DEMO_FILENAME,
        file_format="csv",
        file_size_bytes=len(raw),
        encoding="utf-8",
        delimiter=",",
        checksum=checksum(raw),
        storage_path="",
        row_count=profile.row_count,
        column_count=profile.column_count,
        duplicate_row_count=profile.duplicate_rows,
        missing_cell_count=profile.missing_cells,
        status=DatasetStatus.READY,
        is_demo=True,
        profile=profile.to_dict(),
    )
    db.add(dataset)
    db.flush()

    storage = get_storage()
    prefix = _dataset_prefix(workspace.id, dataset.id)

    raw_key = storage_key(prefix, DEMO_FILENAME)
    storage.write(raw_key, raw, db=db)
    dataset.storage_path = raw_key

    try:
        normalized_key = storage_key(prefix, "normalized.parquet")
        storage.write(normalized_key, frame_to_parquet_bytes(result.frame), db=db)
        dataset.normalized_path = normalized_key
    except Exception:  # noqa: BLE001
        # The parquet cache is an optimisation; the CSV remains the source.
        logger.warning("could not write demo parquet cache")

    dataset.preview_rows = build_preview(result.frame)

    for inference in profile.columns:
        db.add(
            DatasetColumn(
                workspace_id=workspace.id,
                dataset_id=dataset.id,
                name=inference.name,
                position=inference.position,
                data_type=inference.data_type,
                semantic_role=inference.role.value,
                role_confidence=inference.confidence,
                null_count=inference.null_count,
                unique_count=inference.unique_count,
                stats=column_summary(inference)["stats"],
            )
        )

    db.add(
        DatasetVersion(
            workspace_id=workspace.id,
            dataset_id=dataset.id,
            version=1,
            row_count=profile.row_count,
            storage_path=dataset.storage_path,
            change_summary="Demo dataset loaded",
        )
    )
    return dataset


def _unique_demo_slug(db: Session) -> str:
    for _ in range(10):
        candidate = f"demo-{secrets.token_hex(5)}"
        if db.scalar(select(Workspace.id).where(Workspace.slug == candidate)) is None:
            return candidate
    return f"demo-{uuid.uuid4().hex}"


def create_demo_session(db: Session) -> tuple[User, Workspace, Analysis]:
    """Build a throwaway account with the sample data already analysed.

    Returns the pieces the caller needs to issue tokens. The analysis is created
    but *not* submitted here — the caller submits it after the transaction
    commits, or the job thread can start against a row that does not yet exist.
    """
    from app.core.security import hash_password

    if not settings.demo_data_enabled:
        raise DemoUnavailableError(
            "The demo is not available on this deployment.",
            hint="Create an account to analyse your own data.",
        )

    purge_expired_demo_sessions(db)

    handle = secrets.token_hex(8)
    user = User(
        email=f"demo-{handle}@{DEMO_EMAIL_DOMAIN}",
        full_name="Demo visitor",
        # Random and discarded. The visitor signs in with the session this
        # request returns, never with a password, so there is nothing to leak
        # and nothing to guess.
        password_hash=hash_password(secrets.token_urlsafe(32)),
        # The demo skips onboarding: its data is already loaded, and walking a
        # visitor through a wizard that has nothing to ask would be theatre.
        onboarding_completed=True,
        is_demo=True,
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()

    workspace = Workspace(
        name="NovaMart",
        slug=_unique_demo_slug(db),
        business_type="ecommerce",
        currency="USD",
        onboarding_step=99,
        is_demo=True,
    )
    db.add(workspace)
    db.flush()

    db.add(
        WorkspaceMember(
            workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.OWNER
        )
    )

    dataset = install_demo_dataset(db, workspace, user)

    # Accept the inferred schema. A visitor has no corrections to make to data
    # they have never seen, and the inference is tested against this exact file.
    grain = dataset.profile.get("suggested_grain") or Grain.DAY.value
    dataset.semantic_map = {
        "roles": {
            column.name: column.effective_role
            for column in dataset.columns
            if column.is_included
        },
        "grain": grain,
    }
    dataset.status = DatasetStatus.CONFIRMED

    from app.jobs.runner import initial_stages

    analysis = Analysis(
        workspace_id=workspace.id,
        dataset_id=dataset.id,
        created_by_id=user.id,
        kind="full",
        status=JobStatus.QUEUED,
        stage="queued",
        progress=0,
        stages=initial_stages(),
        params={"grain": grain},
    )
    db.add(analysis)

    logger.info("demo session created", extra={"workspace_id": str(workspace.id)})
    return user, workspace, analysis


RETIRED_SUFFIX = ".deleted"


def _remove_tree(directory: Path) -> bool:
    """Delete a directory and its contents. Returns whether it is now gone."""
    try:
        if not directory.exists():
            return True
        for path in sorted(directory.rglob("*"), reverse=True):
            try:
                path.unlink() if path.is_file() else path.rmdir()
            except OSError:
                # One locked file must not abandon the rest of the tree.
                continue
        directory.rmdir()
        return True
    except OSError:
        return False


def retire_workspace_files(workspace_id: uuid.UUID) -> None:
    """Remove a deleted workspace's files, or mark them for a later sweep.

    Deleting files can fail for reasons that have nothing to do with the
    deletion being wrong: an analysis still reading a cached parquet holds the
    file open on Windows, a network volume hiccups. The database rows are gone
    by this point, so raising would turn a tidy-up into an outage, and retrying
    in a loop would just fail again while whatever holds the handle still holds
    it.

    None of that applies when files are rows: a ``DELETE`` either happens or
    rolls back, nothing holds a handle, and there is nothing to sweep later. So
    that backend takes the direct path and the rest of this function is the
    filesystem's problem alone.

    So a directory that cannot be removed is *renamed* instead. The suffix is
    the record that this directory belongs to a workspace that no longer
    exists — which is what makes the later sweep safe. Inferring the same thing
    by comparing the disk against the database would mean that a misconfigured
    ``DATABASE_URL`` pointing at an empty database made every real customer's
    files look orphaned.
    """
    if settings.storage_backend != "local":
        try:
            get_storage().delete_prefix(storage_key("uploads", str(workspace_id)))
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "could not remove workspace files",
                extra={"workspace_id": str(workspace_id), "reason": str(exc)[:200]},
            )
        return

    directory = settings.uploads_path / str(workspace_id)
    if _remove_tree(directory):
        return

    retired = directory.with_name(f"{directory.name}{RETIRED_SUFFIX}")
    try:
        if retired.exists():
            _remove_tree(retired)
        directory.rename(retired)
        logger.info(
            "workspace files could not be deleted yet; marked for the next sweep",
            extra={"workspace_id": str(workspace_id)},
        )
    except OSError as exc:
        logger.warning(
            "could not remove or mark workspace files",
            extra={"workspace_id": str(workspace_id), "reason": str(exc)[:200]},
        )


def sweep_retired_upload_dirs() -> int:
    """Remove directories a previous purge marked and could not delete.

    Only directories carrying the suffix this module writes are touched, so the
    sweep can never remove files belonging to a workspace that still exists —
    however the database happens to be configured when it runs.

    Nothing is ever marked on a backend that stores files as rows, so there is
    nothing for this to collect there.
    """
    if settings.storage_backend != "local":
        return 0

    root = settings.uploads_path
    if not root.exists():
        return 0

    removed = 0
    for directory in root.iterdir():
        if directory.is_dir() and directory.name.endswith(RETIRED_SUFFIX):
            if _remove_tree(directory):
                removed += 1

    if removed:
        logger.info("removed retired upload directories", extra={"count": removed})
    return removed


def purge_expired_demo_sessions(db: Session) -> int:
    """Delete demo workspaces past their lifetime, and their files.

    Called at start-up and again whenever a demo is created, so the clean-up
    happens without a scheduler. Files are removed after the rows are gone: an
    orphaned file wastes bytes, an orphaned row points at data that no longer
    exists.

    Returns the number of workspaces removed.
    """
    hours = max(1, settings.demo_session_hours)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    expired = list(
        db.scalars(
            select(Workspace).where(
                Workspace.is_demo.is_(True), Workspace.created_at < cutoff
            )
        ).all()
    )

    if expired:
        workspace_ids = [w.id for w in expired]

        users = list(
            db.scalars(
                select(User)
                .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
                .where(
                    User.is_demo.is_(True),
                    WorkspaceMember.workspace_id.in_(workspace_ids),
                )
            ).all()
        )

        for workspace in expired:
            db.delete(workspace)
        for user in users:
            db.delete(user)
        db.commit()

        # After the commit, never before: an orphaned file wastes bytes, an
        # orphaned row points at data that no longer exists.
        for workspace_id in workspace_ids:
            retire_workspace_files(workspace_id)

        logger.info("purged expired demo sessions", extra={"count": len(expired)})

    # Always sweep, even when nothing expired this time: this is what collects
    # what a previous run marked but could not delete.
    sweep_retired_upload_dirs()
    return len(expired)
