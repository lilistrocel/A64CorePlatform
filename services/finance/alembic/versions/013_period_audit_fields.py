"""Add close/reopen audit trail columns to fiscal_periods

Revision ID: 013
Revises: 012
Create Date: 2026-05-21 00:00:00.000000

Adds six nullable audit columns to fiscal_periods so every close and reopen
operation records who acted and why.  Production accounting requires this
trail so auditors can verify the legitimacy of any period state change.

New columns:
  - closeReason   VARCHAR(500) NULLABLE — optional free-text reason for close
  - reopenedAt    DATETIME    NULLABLE — UTC timestamp of last reopen
  - reopenedByUserId VARCHAR(36) NULLABLE — userId (JWT) who reopened
  - reopenReason  VARCHAR(500) NULLABLE — required free-text reason for reopen

Note: closedAt and closedByUserId already exist (added in migration 001).
This migration adds the missing four columns to complete the audit trail.

Lifecycle semantics (enforced in the API layer, not DB):
  - On CLOSE:  closedAt/closedByUserId/closeReason populated; reopened* cleared.
  - On REOPEN: reopenedAt/reopenedByUserId/reopenReason populated; closed* cleared.
  - A close-reopen-close cycle always reflects only the most recent transition.

Reversible: downgrade drops the four new columns only.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add close/reopen audit columns to fiscal_periods."""
    # Reason: closeReason is the free-text motivation for closing; optional
    # so existing rows (closed without a reason) are unaffected.
    op.add_column(
        "fiscal_periods",
        sa.Column("closeReason", sa.String(500), nullable=True),
    )
    # Reason: reopenedAt records the exact UTC moment a period was reopened.
    op.add_column(
        "fiscal_periods",
        sa.Column("reopenedAt", sa.DateTime, nullable=True),
    )
    # Reason: reopenedByUserId stores the JWT userId of whoever reopened the
    # period.  VARCHAR(36) matches the UUID format used across the platform.
    op.add_column(
        "fiscal_periods",
        sa.Column("reopenedByUserId", sa.String(36), nullable=True),
    )
    # Reason: reopenReason is required on reopen (enforced at API layer, not
    # DB, since adding a NOT NULL column to an existing table with data would
    # fail without a default — the API guarantees it is always populated).
    op.add_column(
        "fiscal_periods",
        sa.Column("reopenReason", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    """Drop the four audit columns added in this migration."""
    # Reason: drop in reverse add order for clarity.
    op.drop_column("fiscal_periods", "reopenReason")
    op.drop_column("fiscal_periods", "reopenedByUserId")
    op.drop_column("fiscal_periods", "reopenedAt")
    op.drop_column("fiscal_periods", "closeReason")
