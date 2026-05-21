"""Create company_posting_setup table

Revision ID: 008
Revises: 007
Create Date: 2026-05-20 00:00:00.000000

Adds:
  - company_posting_setup — one row per (organizationId, companyCode); holds the
    default GL account assignments used by posting handlers when building JEs.

Required fields for isComplete=true (enforced at application layer):
  apControlAccountId, bankAccountId, grIrClearingAccountId,
  inputVatAccountId, retainedEarningsAccountId.

All remaining FK columns are optional in v1 — they are consumed by later phases.

Reversible: downgrade drops the table.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Reason: helper to reduce repetition for the FK account columns — all reference
# gl_accounts.accountId with SET NULL on delete (deleting the GL account does not
# cascade-delete the posting setup row, it just clears the assignment).
def _fk_account_col(name: str) -> sa.Column:
    return sa.Column(
        name,
        sa.String(36),
        sa.ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )


def upgrade() -> None:
    op.create_table(
        "company_posting_setup",
        sa.Column("setupId", sa.String(36), primary_key=True),
        sa.Column("organizationId", sa.String(36), nullable=False),
        sa.Column("companyCode", sa.String(10), nullable=False),
        _fk_account_col("apControlAccountId"),
        _fk_account_col("arControlAccountId"),
        _fk_account_col("bankAccountId"),
        _fk_account_col("cashAccountId"),
        _fk_account_col("grIrClearingAccountId"),
        _fk_account_col("inputVatAccountId"),
        _fk_account_col("outputVatAccountId"),
        _fk_account_col("retainedEarningsAccountId"),
        _fk_account_col("purchasePriceVarianceAccountId"),
        _fk_account_col("roundingAccountId"),
        sa.Column(
            "isComplete",
            sa.Boolean,
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("updatedBy", sa.String(36), nullable=True),
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
        sa.UniqueConstraint(
            "organizationId", "companyCode", name="uq_posting_setup_org_company"
        ),
    )


def downgrade() -> None:
    op.drop_table("company_posting_setup")
