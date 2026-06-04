"""Add isStock column to sale_item_finance_ext (T-201.8)

Revision ID: 020
Revises: 019
Create Date: 2026-06-02 00:00:00.000000

Background
----------
T-201.8 introduces a billing-routing flag ``isStock`` on ``sale_item_finance_ext``
to distinguish stock items from service/fee items at the AR Invoice layer.

  - isStock = True  (default) — stock item; must flow through a Delivery Note so
    COGS posts symmetrically with the revenue side (Dr COGS / Cr Inventory at
    shipment).  Creating a standalone AR Invoice for a stock item is blocked at the
    ops service layer.
  - isStock = False — service/fee item (delivery fees, late charges, retainers,
    consulting); no inventory to deplete, so a direct AR Invoice is permitted.

This flag is intentionally placed on the finance-side ``sale_item_finance_ext``
table (not on the ops MongoDB items collection) because it governs billing/posting
routing, not inventory.  The ops MongoDB ``inventory_movements`` collection owns
actual inventory tracking.  Wave 6 (T-201.8b) will introduce a proper ops-side SKU
master; for now this column is the authoritative source for the isStock flag.

Schema Change
-------------
  ALTER TABLE sale_item_finance_ext
  ADD COLUMN isStock BOOLEAN NOT NULL DEFAULT 1;

  server_default="1" is critical: it ensures all existing rows receive isStock=true
  without a manual backfill step that could block the migration on large tables
  (MySQL 8.0 instant ADD COLUMN with a server_default avoids a full table rewrite).

Heuristic Backfill
------------------
After adding the column, a best-effort UPDATE flips ``isStock = 0`` for rows
whose ``itemName`` matches common service/fee name patterns.  This is heuristic
only — admins MUST audit and correct the classification in the Finance UI after
upgrade.  The regex targets:

  fee | charge | delivery | freight | service | rental | deposit | consulting

MySQL 8.0 REGEXP is used (case-insensitive by default for utf8mb4_unicode_ci
collation).  The REGEXP pattern is NOT anchored so it matches substrings anywhere
in the name (e.g. "Late Charge", "Monthly Service Fee", "Freight/Delivery").

Downgrade
---------
Drops the isStock column.  No data can be recovered after downgrade.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "020"
down_revision: Union[str, None] = "019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Add isStock column and apply heuristic backfill for service/fee items.

    server_default="1" ensures all existing rows default to isStock=true
    (conservative: legacy items behave as stock items until classified by admin).
    """
    op.add_column(
        "sale_item_finance_ext",
        sa.Column(
            "isStock",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("1"),
            comment=(
                "True = stock item (must flow through Delivery Note for COGS symmetry). "
                "False = service/fee item (direct AR Invoice permitted). "
                "T-201.8 billing-routing flag."
            ),
        ),
    )

    # Heuristic backfill: flip isStock = False for rows whose itemName matches
    # common service/fee naming patterns.  This is a best-effort classification
    # only — admins MUST audit and correct via the Finance UI after the upgrade.
    # Pattern targets substrings (case-insensitive): fee, charge, delivery,
    # freight, service, rental, deposit, consulting.
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE sale_item_finance_ext
            SET isStock = 0
            WHERE itemName REGEXP
                '(?i)(fee|charge|delivery|freight|service|rental|deposit|consulting)'
            """
        )
    )


def downgrade() -> None:
    """
    Drop the isStock column.

    No data recovery after downgrade — all isStock classifications are lost.
    """
    op.drop_column("sale_item_finance_ext", "isStock")
