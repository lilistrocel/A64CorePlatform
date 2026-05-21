"""Add itemName and itemType denormalization columns to purchase_item_finance_ext

Revision ID: 009
Revises: 008
Create Date: 2026-05-20 00:00:00.000000

Adds two nullable columns to purchase_item_finance_ext so that the finance UI
can display useful item information without cross-DB joins back to MongoDB:

  - itemName  VARCHAR(200) NULLABLE — denormalized from the operational item
  - itemType  ENUM(...)    NULLABLE — denormalized from the operational item

Both are NULLABLE because existing ext rows pre-date these columns.  They will
be populated the next time a purchase_item_changed event arrives for each item.

The ENUM mirrors the operational Literal used in PurchaseItemChangedPayload.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Reason: enum name must not collide with any existing MySQL ENUM.  We use the
# full table-prefixed name to avoid conflicts across migrations.
_ITEM_TYPE_ENUM_NAME = "purchaseitemtypeenum"
_ITEM_TYPE_VALUES = (
    "raw_material",
    "consumable",
    "service",
    "fixed_asset_acquisition",
)


def upgrade() -> None:
    """Add itemName and itemType to purchase_item_finance_ext."""
    # Reason: add_column is idempotent-safe for nullable columns — existing rows
    # get NULL automatically, satisfying the nullable constraint.
    op.add_column(
        "purchase_item_finance_ext",
        sa.Column("itemName", sa.String(200), nullable=True),
    )
    op.add_column(
        "purchase_item_finance_ext",
        sa.Column(
            "itemType",
            sa.Enum(*_ITEM_TYPE_VALUES, name=_ITEM_TYPE_ENUM_NAME),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Remove itemName and itemType from purchase_item_finance_ext."""
    op.drop_column("purchase_item_finance_ext", "itemType")
    op.drop_column("purchase_item_finance_ext", "itemName")
    # Reason: MySQL ENUM types are inline; drop the type only on non-SQLite
    # databases to avoid errors during test runs with aiosqlite.
    sa.Enum(name=_ITEM_TYPE_ENUM_NAME).drop(op.get_bind(), checkfirst=True)
