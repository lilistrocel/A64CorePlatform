"""Add defaultValuationMethod to company_posting_setup

Revision ID: 010
Revises: 009
Create Date: 2026-05-20 00:00:00.000000

Adds:
  - defaultValuationMethod ENUM('MovingAverage','Standard','FIFO') NOT NULL DEFAULT 'MovingAverage'
    to company_posting_setup.

IAS 2 requires a consistent cost formula for inventories of similar nature.
Moving the valuation method from per-item (purchase_item_finance_ext.valuationMethod)
to per-company ensures audit compliance.  The per-item column is retained but
marked deprecated in the ORM docstring — it becomes informational only.

Reversible: downgrade removes the column.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Reason: enum values must match ValuationMethodEnum values in models.py exactly.
# MySQL stores these as the string values ('MovingAverage', 'Standard', 'FIFO'),
# not the Python enum member names.
_VALUATION_METHOD_ENUM_NAME = "valuationmethodenum_posting"
_VALUATION_METHOD_VALUES = ("MovingAverage", "Standard", "FIFO")


def upgrade() -> None:
    """Add defaultValuationMethod column to company_posting_setup."""
    op.add_column(
        "company_posting_setup",
        sa.Column(
            "defaultValuationMethod",
            sa.Enum(*_VALUATION_METHOD_VALUES, name=_VALUATION_METHOD_ENUM_NAME),
            nullable=False,
            server_default="MovingAverage",
        ),
    )


def downgrade() -> None:
    """Remove defaultValuationMethod from company_posting_setup."""
    op.drop_column("company_posting_setup", "defaultValuationMethod")
    # Reason: MySQL ENUM types are inline; drop the named type only on non-SQLite
    # databases to avoid errors during test runs with aiosqlite.
    sa.Enum(name=_VALUATION_METHOD_ENUM_NAME).drop(op.get_bind(), checkfirst=True)
