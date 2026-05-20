"""Add account_level, account_role, ifrs_tag columns to gl_accounts

Revision ID: 004
Revises: 003
Create Date: 2026-05-19 00:00:03.000000

Adds three new columns to gl_accounts:
  - account_level ENUM('drawer', 'title', 'active') NOT NULL DEFAULT 'active'
  - account_role  ENUM(...) NULL
  - ifrs_tag      VARCHAR(10) NULL

Then back-fills account_level values:
  - 'drawer' for root accounts (no parent, no children of their own children roots)
  - 'title'  for intermediate accounts (has children via parentAccountId)
  - 'active' for leaf accounts (isHeader=False in pre-existing data)

After back-fill, only account_level='active' should accept postings
(enforcement arrives in Phase 2).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # 1. Add new columns
    # ------------------------------------------------------------------ #
    op.add_column(
        "gl_accounts",
        sa.Column(
            "account_level",
            sa.Enum("drawer", "title", "active", name="accountlevelenum"),
            nullable=False,
            server_default="active",
        ),
    )
    op.add_column(
        "gl_accounts",
        sa.Column(
            "account_role",
            sa.Enum(
                "posting",
                "bank",
                "cash",
                "reconciliation",
                "clearing",
                "contra",
                "revenue",
                "expense",
                "other",
                name="accountroleenum",
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "gl_accounts",
        sa.Column("ifrs_tag", sa.String(10), nullable=True),
    )

    # ------------------------------------------------------------------ #
    # 2. Back-fill account_level
    #
    # Logic:
    #   - Accounts with no parentAccountId that have children  → 'drawer'
    #   - Accounts that have children (any level)              → 'title'
    #   - All other accounts (leaves, isHeader=False)          → 'active'
    #
    # We rely on isHeader which was set by migration 001.
    # ------------------------------------------------------------------ #
    conn = op.get_bind()

    # Mark header accounts: isHeader=True → 'title'
    conn.execute(
        sa.text(
            "UPDATE gl_accounts SET account_level = 'title' WHERE isHeader = 1"
        )
    )

    # Mark root headers with no parent → 'drawer'
    conn.execute(
        sa.text(
            "UPDATE gl_accounts SET account_level = 'drawer' "
            "WHERE isHeader = 1 AND parentAccountId IS NULL"
        )
    )

    # Leaf accounts (isHeader=False) stay as 'active' (the DEFAULT)


def downgrade() -> None:
    op.drop_column("gl_accounts", "ifrs_tag")
    op.drop_column("gl_accounts", "account_role")
    op.drop_column("gl_accounts", "account_level")

    # Drop the enum types (MySQL handles enums inline, but be explicit)
    sa.Enum(name="accountlevelenum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="accountroleenum").drop(op.get_bind(), checkfirst=True)
