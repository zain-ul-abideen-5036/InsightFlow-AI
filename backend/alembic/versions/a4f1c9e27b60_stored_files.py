"""stored_files: uploaded files for deployments with no durable filesystem

Revision ID: a4f1c9e27b60
Revises: 2dc7c70b930e
Create Date: 2026-09-21

Adds the table behind ``STORAGE_BACKEND=database`` (see app/core/storage.py).
A deployment using the local filesystem backend never writes a row here, so
this migration is additive and inert for existing installations.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# Required: our portable GUID/JSONB column types are rendered by autogenerate
# as `app.db.base.GUID(...)`, and Alembic does not emit this import itself.
import app.db.base

revision: str = "a4f1c9e27b60"
down_revision: Union[str, None] = "2dc7c70b930e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stored_files",
        sa.Column("id", app.db.base.GUID(), nullable=False),
        sa.Column("key", sa.String(length=512), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    # Unique because a key names exactly one file, as a path does. Indexed
    # because every read is a lookup by key and every delete is a prefix scan.
    op.create_index(op.f("ix_stored_files_key"), "stored_files", ["key"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_stored_files_key"), table_name="stored_files")
    op.drop_table("stored_files")
