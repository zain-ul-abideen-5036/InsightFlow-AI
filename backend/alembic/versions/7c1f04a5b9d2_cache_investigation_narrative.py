"""cache the investigation narrative on the anomaly

Revision ID: 7c1f04a5b9d2
Revises: 43683704cd6d
Create Date: 2026-09-20 01:58:11.402117

The deterministic investigation was already cached on ``anomalies.investigation``
but the written narrative over it was not, so every reopening of an investigation
either paid the inference cost again or silently fell back to plainer prose.
This column stores the generated narrative next to the evidence it describes.

Nullable with no default: existing rows simply have no cached narrative yet and
generate one on next request, so this migration needs no data backfill.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

import app.db.base

revision: str = "7c1f04a5b9d2"
down_revision: Union[str, None] = "43683704cd6d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("anomalies", schema=None) as batch_op:
        batch_op.add_column(sa.Column("narrative", app.db.base.JSONB(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("anomalies", schema=None) as batch_op:
        batch_op.drop_column("narrative")
