"""Add vendorAdvanceAccountId to company_posting_setup (T-910)

Revision ID: 021
Revises: 020
Create Date: 2026-08-04 00:00:00.000000

Background
----------
T-910 wires up two purchasing-side outbox events that were previously
falling into the dispatch NO-OP stub in events.py:

  - ap_down_payment_posted — vendor prepayment (DPI). The advance leg needs
    a dedicated asset account distinct from apControlAccountId — a down
    payment is a prepaid asset, not yet a specific vendor liability line
    item, until it is later applied against an AP Invoice.
  - ap_credit_note_posted  — vendor billing reversal (ACN). This handler
    reuses the existing grIrClearingAccountId column; no new column needed
    for it.

Schema Change
-------------
  ALTER TABLE company_posting_setup
  ADD COLUMN vendorAdvanceAccountId VARCHAR(36) NULL,
  ADD CONSTRAINT ... FOREIGN KEY (vendorAdvanceAccountId)
      REFERENCES gl_accounts(accountId) ON DELETE SET NULL;

Nullable, no backfill — mirrors every other optional posting-setup FK column
(apControlAccountId, grIrClearingAccountId, etc. added in migration 008).
Existing rows simply have vendorAdvanceAccountId = NULL until an admin
configures it via the Posting Setup page; the ap_down_payment_posted handler
raises a clear 400 config error if a DPI event arrives before it is set.

Downgrade
---------
Drops the column. Any values are lost.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "021"
down_revision: Union[str, None] = "020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_FK_NAME = "fk_company_posting_setup_vendor_advance_account_id"


def upgrade() -> None:
    """
    Add nullable vendorAdvanceAccountId FK column to company_posting_setup.

    Reason: MySQL parses (and silently ignores) an inline column-level
    REFERENCES clause on ADD COLUMN — it does not create an actual foreign
    key constraint that way. The constraint must be added as a separate
    ADD CONSTRAINT ... FOREIGN KEY statement via create_foreign_key(), same
    as every other add-a-nullable-FK-column migration would need on MySQL
    (none of this service's prior migrations added an FK column this way —
    they all created the FK inline inside create_table(), which MySQL does
    honour). SQLite (the test suite's dialect) enforces neither form of FK
    by default, so this split has no effect on test behaviour.
    """
    op.add_column(
        "company_posting_setup",
        sa.Column(
            "vendorAdvanceAccountId",
            sa.String(36),
            nullable=True,
            comment=(
                "Vendor Advance / prepaid-asset account for the DR leg of "
                "ap_down_payment_posted JEs. T-910."
            ),
        ),
    )
    op.create_foreign_key(
        _FK_NAME,
        "company_posting_setup",
        "gl_accounts",
        ["vendorAdvanceAccountId"],
        ["accountId"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Drop the FK constraint then the vendorAdvanceAccountId column."""
    op.drop_constraint(_FK_NAME, "company_posting_setup", type_="foreignkey")
    op.drop_column("company_posting_setup", "vendorAdvanceAccountId")
