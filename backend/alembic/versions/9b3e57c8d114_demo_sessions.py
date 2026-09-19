"""mark demo accounts and workspaces so they can be reclaimed

Revision ID: 9b3e57c8d114
Revises: 7c1f04a5b9d2
Create Date: 2026-09-20 02:24:53.918204

The public demo creates a throwaway account and workspace per visitor. These
flags let the clean-up job find them when they expire, and — more importantly —
guarantee it can never touch an account somebody actually uses.

A server default is required rather than optional: the columns are NOT NULL,
and without one the ALTER fails on any table that already has rows. ``sa.false()``
rather than a literal 0, so it renders as ``false`` on PostgreSQL and ``0`` on
SQLite instead of being valid on only one of them.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "9b3e57c8d114"
down_revision: Union[str, None] = "7c1f04a5b9d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ("users", "workspaces"):
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.add_column(
                sa.Column(
                    "is_demo",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.false(),
                )
            )

    # Every demo lookup filters on this flag, and the overwhelming majority of
    # rows will not have it set.
    op.create_index("ix_workspaces_is_demo", "workspaces", ["is_demo"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_workspaces_is_demo", table_name="workspaces")
    for table in ("workspaces", "users"):
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.drop_column("is_demo")
