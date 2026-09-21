"""Dataset upload, profiling, schema review, and confirmation."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Query, Request, UploadFile, status
from sqlalchemy import func, select

from app.analytics.ingestion import (
    checksum,
    frame_to_parquet_bytes,
    read_upload,
    validate_upload,
)
from app.analytics.profiling import column_summary, profile_dataset
from app.analytics.schema_inference import ColumnInference
from app.analytics.types import ROLE_LABELS, Grain, SemanticRole
from app.api.deps import (
    CurrentUser,
    CurrentWorkspace,
    DbSession,
    ScopedDataset,
    record_audit,
)
from app.core.config import settings
from app.core.errors import ConflictError, DatasetError, FileValidationError, ValidationError
from app.core.logging import get_logger
from app.core.storage import get_storage, storage_key
from app.db.models import Analysis, Dataset, DatasetColumn, DatasetStatus, DatasetVersion, JobStatus
from app.jobs.runner import initial_stages, submit_analysis
from app.schemas.api import (
    AnalysisOut,
    DatasetDetailOut,
    DatasetOut,
    DatasetUpdate,
    SchemaConfirmRequest,
    SchemaConfirmResponse,
)
from app.schemas.common import MessageResponse, Page

logger = get_logger(__name__)
router = APIRouter(prefix="/workspaces/{workspace_id}/datasets", tags=["datasets"])


def _dataset_prefix(workspace_id: uuid.UUID, dataset_id: uuid.UUID) -> str:
    """Where this dataset's files live, as a storage key prefix.

    Identical to the directory layout the local backend writes, so a key means
    the same thing whichever backend is configured.
    """
    return storage_key("uploads", str(workspace_id), str(dataset_id))


def _persist_columns(db: DbSession, dataset: Dataset, columns: list[ColumnInference]) -> None:
    for inference in columns:
        db.add(
            DatasetColumn(
                workspace_id=dataset.workspace_id,
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


@router.post("", response_model=DatasetDetailOut, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    workspace: CurrentWorkspace,
    user: CurrentUser,
    db: DbSession,
    request: Request,
    file: UploadFile = File(...),
) -> DatasetDetailOut:
    """Upload, validate, parse, and profile a dataset.

    Profiling runs inline rather than as a job: the user is waiting on this
    screen and needs the preview and detected fields immediately. It is bounded
    work on a bounded file, unlike the full analysis.
    """
    filename = Path(file.filename or "upload.csv").name

    # Read with a hard ceiling so an oversized upload cannot exhaust memory,
    # rather than trusting the declared content-length.
    limit = settings.max_upload_bytes
    raw = await file.read(limit + 1)
    if len(raw) > limit:
        raise FileValidationError(
            f"This file is larger than the {settings.max_upload_size_mb} MB limit.",
            hint="Split the export into smaller files, or filter to a shorter date range.",
        )

    file_format = validate_upload(filename, len(raw), raw[:8])
    digest = checksum(raw)

    duplicate = db.scalar(
        select(Dataset).where(
            Dataset.workspace_id == workspace.id,
            Dataset.checksum == digest,
            Dataset.status != DatasetStatus.FAILED,
        )
    )
    if duplicate is not None:
        raise ConflictError(
            f"This exact file has already been uploaded as '{duplicate.name}'.",
            hint="Open the existing dataset, or upload a different file.",
            details={"dataset_id": str(duplicate.id)},
        )

    result = read_upload(raw, filename)
    profile = profile_dataset(result.frame, warnings=result.warnings)

    dataset = Dataset(
        workspace_id=workspace.id,
        created_by_id=user.id,
        name=Path(filename).stem[:255] or "Dataset",
        original_filename=filename,
        file_format=file_format,
        file_size_bytes=len(raw),
        encoding=result.encoding,
        delimiter=result.delimiter,
        checksum=digest,
        storage_path="",
        row_count=profile.row_count,
        column_count=profile.column_count,
        duplicate_row_count=profile.duplicate_rows,
        missing_cell_count=profile.missing_cells,
        status=DatasetStatus.READY,
        profile=profile.to_dict(),
        preview_rows=[],
    )
    db.add(dataset)
    db.flush()

    storage = get_storage()
    prefix = _dataset_prefix(workspace.id, dataset.id)

    raw_key = storage_key(prefix, filename)
    storage.write(raw_key, raw, db=db)
    dataset.storage_path = raw_key

    # A normalised Parquet copy makes every later analysis a fast columnar read
    # rather than a repeated CSV parse.
    try:
        normalized_key = storage_key(prefix, "normalized.parquet")
        storage.write(normalized_key, frame_to_parquet_bytes(result.frame), db=db)
        dataset.normalized_path = normalized_key
    except Exception as exc:  # noqa: BLE001 - the raw file remains authoritative
        logger.warning(
            "could not write parquet cache",
            extra={"dataset_id": str(dataset.id), "reason": str(exc)[:200]},
        )

    from app.analytics.profiling import build_preview

    dataset.preview_rows = build_preview(result.frame)
    _persist_columns(db, dataset, profile.columns)

    db.add(
        DatasetVersion(
            workspace_id=workspace.id,
            dataset_id=dataset.id,
            version=1,
            row_count=profile.row_count,
            storage_path=dataset.storage_path,
            change_summary="Initial upload",
        )
    )
    record_audit(
        db, action="dataset.upload", user=user, workspace=workspace,
        resource_type="dataset", resource_id=str(dataset.id), request=request,
        metadata={"rows": profile.row_count, "columns": profile.column_count},
    )
    db.commit()
    db.refresh(dataset)

    logger.info(
        "dataset uploaded",
        extra={
            "dataset_id": str(dataset.id),
            "rows": profile.row_count,
            "columns": profile.column_count,
            "truncated": result.was_truncated,
        },
    )
    return DatasetDetailOut.model_validate(dataset)


@router.get("", response_model=Page[DatasetOut])
def list_datasets(
    workspace: CurrentWorkspace,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Page[DatasetOut]:
    total = (
        db.scalar(select(func.count(Dataset.id)).where(Dataset.workspace_id == workspace.id))
        or 0
    )
    rows = db.scalars(
        select(Dataset)
        .where(Dataset.workspace_id == workspace.id)
        .order_by(Dataset.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return Page[DatasetOut](
        items=[DatasetOut.model_validate(d) for d in rows],
        total=total, limit=limit, offset=offset,
    )


@router.get("/{dataset_id}", response_model=DatasetDetailOut)
def get_dataset_detail(dataset: ScopedDataset) -> DatasetDetailOut:
    return DatasetDetailOut.model_validate(dataset)


@router.get("/{dataset_id}/fields")
def get_detected_fields(dataset: ScopedDataset) -> dict:
    """The 'Review detected fields' payload.

    Ships the full role vocabulary so the picker never needs a second request,
    and so the options the user sees always match what the backend accepts.
    """
    return {
        "dataset_id": str(dataset.id),
        "columns": [
            {
                "id": str(column.id),
                "name": column.name,
                "position": column.position,
                "data_type": column.data_type,
                "semantic_role": column.semantic_role,
                "confirmed_role": column.confirmed_role,
                "effective_role": column.effective_role,
                "role_label": ROLE_LABELS.get(column.effective_role, column.effective_role),
                "confidence": column.role_confidence,
                "is_included": column.is_included,
                "null_count": column.null_count,
                "unique_count": column.unique_count,
                "stats": column.stats,
            }
            for column in dataset.columns
        ],
        "available_roles": [
            {"value": role.value, "label": ROLE_LABELS.get(role.value, role.value)}
            for role in SemanticRole
        ],
        "capabilities": dataset.profile.get("capabilities", {}),
        "quality_issues": dataset.profile.get("quality_issues", []),
        "suggested_grain": dataset.profile.get("suggested_grain"),
        "available_grains": dataset.profile.get("available_grains", []),
        "warnings": dataset.profile.get("warnings", []),
    }


@router.post("/{dataset_id}/confirm", response_model=SchemaConfirmResponse)
def confirm_schema(
    payload: SchemaConfirmRequest,
    dataset: ScopedDataset,
    workspace: CurrentWorkspace,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> SchemaConfirmResponse:
    """Apply the user's field corrections and, by default, start the analysis.

    When ``start_analysis`` is false the corrections are saved and nothing is
    queued. Creating an analysis row that is never submitted would leave it
    stuck in "queued" forever and block later runs on the same dataset.
    """
    if dataset.status == DatasetStatus.FAILED:
        raise DatasetError(
            "This dataset could not be processed and cannot be analysed.",
            hint="Upload the file again.",
        )

    by_name = {column.name: column for column in dataset.columns}
    valid_roles = {role.value for role in SemanticRole}

    for update in payload.columns:
        column = by_name.get(update.name)
        if column is None:
            raise ValidationError(
                f"'{update.name}' is not a column in this dataset.",
                hint="Reload the page and try again.",
            )
        if update.confirmed_role is not None:
            if update.confirmed_role not in valid_roles:
                raise ValidationError(
                    f"'{update.confirmed_role}' is not a recognised field type."
                )
            column.confirmed_role = update.confirmed_role
        column.is_included = update.is_included

    grain = payload.grain or dataset.profile.get("suggested_grain") or Grain.DAY.value

    role_map = {
        column.name: column.effective_role
        for column in dataset.columns
        if column.is_included
    }
    dataset.semantic_map = {"roles": role_map, "grain": grain}
    dataset.status = DatasetStatus.CONFIRMED

    analysis: Analysis | None = None
    if payload.start_analysis:
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

    record_audit(
        db, action="dataset.confirm", user=user, workspace=workspace,
        resource_type="dataset", resource_id=str(dataset.id), request=request,
        metadata={"grain": grain, "columns_included": len(role_map)},
    )
    db.commit()
    db.refresh(dataset)

    if analysis is not None:
        db.refresh(analysis)
        submit_analysis(analysis.id)

    return SchemaConfirmResponse(
        dataset=DatasetDetailOut.model_validate(dataset),
        analysis=AnalysisOut.model_validate(analysis) if analysis is not None else None,
    )


@router.patch("/{dataset_id}", response_model=DatasetOut)
def update_dataset(
    payload: DatasetUpdate, dataset: ScopedDataset, db: DbSession
) -> DatasetOut:
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        if value is not None:
            setattr(dataset, field, value)
    db.commit()
    db.refresh(dataset)
    return DatasetOut.model_validate(dataset)


@router.delete("/{dataset_id}", response_model=MessageResponse)
def delete_dataset(
    dataset: ScopedDataset,
    workspace: CurrentWorkspace,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> MessageResponse:
    """Delete a dataset, its analyses, and its files."""
    prefix = _dataset_prefix(workspace.id, dataset.id)
    dataset_name = dataset.name

    record_audit(
        db, action="dataset.delete", user=user, workspace=workspace,
        resource_type="dataset", resource_id=str(dataset.id), request=request,
        metadata={"name": dataset_name},
    )
    db.delete(dataset)
    db.commit()

    # Files are removed after the transaction commits: an orphaned file is
    # recoverable, an orphaned database row pointing at deleted data is not.
    try:
        get_storage().delete_prefix(prefix)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "could not remove dataset files",
            extra={"prefix": prefix, "reason": str(exc)[:200]},
        )

    return MessageResponse(message=f"'{dataset_name}' has been deleted.")


@router.post("/demo", response_model=DatasetDetailOut, status_code=status.HTTP_201_CREATED)
def load_demo_dataset(
    workspace: CurrentWorkspace, user: CurrentUser, db: DbSession, request: Request
) -> DatasetDetailOut:
    """Load the NovaMart sample dataset into an existing workspace.

    The same installer the public demo uses, so the two paths cannot drift.
    This one is for a signed-in user who wants sample data alongside their own.
    """
    from app.seed.demo import install_demo_dataset

    if not settings.demo_data_enabled:
        raise DatasetError("Demo data is not available in this deployment.")

    dataset = install_demo_dataset(db, workspace, user)
    record_audit(
        db, action="dataset.demo_loaded", user=user, workspace=workspace,
        resource_type="dataset", resource_id=str(dataset.id), request=request,
    )
    db.commit()
    db.refresh(dataset)
    return DatasetDetailOut.model_validate(dataset)
