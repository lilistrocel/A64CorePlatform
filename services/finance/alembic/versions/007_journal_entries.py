"""Create journal_entries and journal_entry_lines tables

Revision ID: 007
Revises: 006
Create Date: 2026-05-20 00:00:00.000000

Adds:
  - journal_entries — immutable header rows; status is posted or void only.
  - journal_entry_lines — DR/CR line detail for each JE.

Reversible: downgrade drops both tables in reverse FK order.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "journal_entries",
        sa.Column("jeId", sa.String(36), primary_key=True),
        sa.Column("organizationId", sa.String(36), nullable=False),
        sa.Column("companyCode", sa.String(10), nullable=False),
        sa.Column("jeNumber", sa.String(40), nullable=False),
        sa.Column("jeDate", sa.Date, nullable=False),
        sa.Column(
            "periodId",
            sa.String(36),
            sa.ForeignKey("fiscal_periods.periodId", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("sourceEventType", sa.String(60), nullable=False),
        sa.Column("sourceEventId", sa.String(36), nullable=False),
        sa.Column("sourceDocId", sa.String(36), nullable=True),
        sa.Column("sourceDocNumber", sa.String(40), nullable=True),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("totalDebit", sa.Numeric(15, 2), nullable=False),
        sa.Column("totalCredit", sa.Numeric(15, 2), nullable=False),
        sa.Column(
            "status",
            sa.Enum("posted", "void", name="jestatusenum"),
            nullable=False,
            server_default="posted",
        ),
        sa.Column("voidedAt", sa.DateTime, nullable=True),
        sa.Column("voidedBy", sa.String(36), nullable=True),
        sa.Column("voidReason", sa.String(500), nullable=True),
        sa.Column("postedAt", sa.DateTime, nullable=False),
        sa.Column("postedBy", sa.String(36), nullable=False),
        sa.Column(
            "createdAt",
            sa.DateTime,
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updatedAt",
            sa.DateTime,
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("organizationId", "jeNumber", name="uq_org_je_number"),
    )

    op.create_index("ix_journal_entries_organizationId", "journal_entries", ["organizationId"])
    op.create_index("ix_journal_entries_jeNumber", "journal_entries", ["jeNumber"])
    op.create_index("ix_journal_entries_sourceEventId", "journal_entries", ["sourceEventId"])

    op.create_table(
        "journal_entry_lines",
        sa.Column("jeLineId", sa.String(36), primary_key=True),
        sa.Column(
            "jeId",
            sa.String(36),
            sa.ForeignKey("journal_entries.jeId", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("lineNumber", sa.Integer, nullable=False),
        sa.Column(
            "accountId",
            sa.String(36),
            sa.ForeignKey("gl_accounts.accountId", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("debit", sa.Numeric(15, 2), nullable=True),
        sa.Column("credit", sa.Numeric(15, 2), nullable=True),
        sa.Column("description", sa.String(500), nullable=True),
        # Reason: cost_centers uses a composite PK (organizationId, costCenterId) so
        # MySQL cannot enforce a FK on costCenterId alone.  We store the value as a
        # soft reference; referential integrity is enforced at the application layer.
        sa.Column("costCenterId", sa.String(36), nullable=True),
        sa.Column("referenceLineId", sa.String(36), nullable=True),
        sa.Column(
            "createdAt",
            sa.DateTime,
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("jeId", "lineNumber", name="uq_je_line_number"),
    )

    op.create_index("ix_journal_entry_lines_jeId", "journal_entry_lines", ["jeId"])
    op.create_index("ix_journal_entry_lines_accountId", "journal_entry_lines", ["accountId"])


def downgrade() -> None:
    op.drop_table("journal_entry_lines")
    op.drop_table("journal_entries")
    # Reason: drop the ENUM type created for MySQL; no-op on SQLite.
    op.execute("DROP TYPE IF EXISTS jestatusenum")
