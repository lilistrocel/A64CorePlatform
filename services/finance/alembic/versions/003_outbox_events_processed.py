"""Add outbox_events_processed table (Week 3 outbox bridge)

Revision ID: 003
Revises: 002
Create Date: 2026-05-19 00:00:02.000000

Creates the idempotency table for the outbox bridge.
The finance ingest endpoint checks this table before processing any event.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "outbox_events_processed",
        sa.Column("eventId", sa.String(36), primary_key=True),
        sa.Column("eventType", sa.String(50), nullable=False),
        sa.Column("organizationId", sa.String(36), nullable=False),
        sa.Column("companyCode", sa.String(10), nullable=False),
        sa.Column("occurredAt", sa.DateTime(), nullable=False),
        sa.Column(
            "processedAt",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "result",
            sa.Enum("success", "skipped", "failed", name="outboxeventresultenum"),
            nullable=False,
            server_default="success",
        ),
        sa.Column("errorMessage", sa.Text(), nullable=True),
    )
    # Covering index for org + company queries (compliance reports)
    op.create_index(
        "idx_processed_org_company",
        "outbox_events_processed",
        ["organizationId", "companyCode"],
    )
    # Index for time-range queries on processedAt
    op.create_index(
        "idx_processed_at",
        "outbox_events_processed",
        ["processedAt"],
    )


def downgrade() -> None:
    op.drop_index("idx_processed_at", "outbox_events_processed")
    op.drop_index("idx_processed_org_company", "outbox_events_processed")
    op.drop_table("outbox_events_processed")
    # Reason: drop the enum type on MySQL — not needed as MySQL handles ENUMs inline
    # but add it here for completeness with other DB backends
    sa.Enum(name="outboxeventresultenum").drop(op.get_bind(), checkfirst=True)
