"""Add isReverseCharge column to tax_codes and backfill SR

Revision ID: 012
Revises: 011
Create Date: 2026-05-21 00:00:00.000000

Adds:
  - isReverseCharge BOOLEAN NOT NULL DEFAULT FALSE to tax_codes table.
  - Backfills: UPDATE tax_codes SET isReverseCharge = TRUE WHERE taxCode = 'SR'

UAE VAT compliance (PM feedback item 3): the SR (Standard Reverse Charge 5%)
tax code requires the buyer to self-account VAT — posting both DR Input VAT
and CR Output VAT for the same amount. The new column lets the AP invoice
posting handler identify reverse-charge lines without hard-coding the tax code
string.

Reversible: downgrade drops the column (data loss for non-default values —
acceptable since the column is always FALSE except for SR, which was seeded).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add isReverseCharge column and backfill SR row."""
    op.add_column(
        "tax_codes",
        sa.Column(
            "isReverseCharge",
            sa.Boolean,
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # Reason: data migration in same file so a single `alembic upgrade head`
    # leaves the table fully consistent. The SR tax code was seeded by
    # seed_tax_codes(); every existing deployment has it. New deployments will
    # have isReverseCharge set by the seed loader directly (see seed_loader.py).
    op.execute(
        "UPDATE tax_codes SET isReverseCharge = TRUE WHERE taxCode = 'SR'"
    )


def downgrade() -> None:
    """Drop isReverseCharge column."""
    op.drop_column("tax_codes", "isReverseCharge")
