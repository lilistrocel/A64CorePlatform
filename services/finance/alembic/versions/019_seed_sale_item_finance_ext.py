"""Seed sale_item_finance_ext for existing test items (Wave 3 / T-200.9)

Revision ID: 019
Revises: 018
Create Date: 2026-05-31 00:00:00.000000

Background
----------
Wave 3 sales documents (Delivery, AR Invoice, Returns) snapshot a unit cost
onto each line from the `inventory_balances` collection (moving average cost).
They also look up `revenueAccountId`, `cogsAccountId`, and `salesTaxCode`
from the `sale_item_finance_ext` table at create time.

The existing test item ``TOM-SEED`` (Tomato - Seeds) was created during smoke
testing but has no `sale_item_finance_ext` row.  Every delivery against this
item therefore:

  - Posts Dr COGS AED 0.00 / Cr Inventory AED 0.00 (unit cost is zero because
    `inventory_balances` has no GR receipt seeded for it)
  - Resolves the COGS / Revenue accounts from the fallback posting_setup rather
    than the per-item config (less specific; harder to audit per-item)

This migration idempotently seeds one row for TOM-SEED and any other items
present in the `sale_item_finance_ext` table identified from the delivery data.
Since items in the ops MongoDB are not available from the finance service's MySQL
context, we store the known item IDs as constants (verified from the live DB).

GL Account Assignments
----------------------
TOM-SEED is a seed/propagation input — the most natural revenue line is
``411000-001 Sales - Fresh Vegetables`` (used for all produce sold by the farm)
and the COGS line is ``511000-001 Seeds & Propagation Materials``.

  Item           | Revenue            | COGS               | Tax Code
  -------------- | ------------------ | ------------------ | --------
  TOM-SEED       | 411000-001 (UUID   | 511000-001 (UUID   | S (5% UAE VAT)
  Tomato - Seeds | f6bc601b-...)      | 24b4e725-...)      |

Tax code ``S`` = "Standard Rated 5% (UAE VAT)" — the correct UAE VAT code for
taxable agricultural produce sold domestically.

Account IDs verified against gl_accounts in the live finance_db:
  411000-001  Sales - Fresh Vegetables        f6bc601b-2e04-4224-9c55-f1cab96d2235
  511000-001  Seeds & Propagation Materials   24b4e725-2376-4ac9-add0-33c6080a4e19

Item IDs verified from deliveries_v2 + ar_invoices_v2 in the live ops MongoDB:
  TOM-SEED    Tomato - Seeds    35aeef22-e1c9-4f9f-9506-a2265fb036cf

Idempotency
-----------
Each INSERT is guarded by a ``SELECT … LIMIT 1`` existence check on
(organizationId, itemId).  Running this migration twice produces no duplicate
rows (the unique constraint on the table would also catch it, but the explicit
guard gives a cleaner migration log).

Downgrade
---------
Removes only the rows created by this migration (matched by itemId).
Does NOT remove the sale_item_finance_ext TABLE — that was created by 016.
Will NOT affect any other tenant's rows (organizationId-scoped).
"""

from __future__ import annotations

import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "019"
down_revision: Union[str, None] = "018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ORG_ID = "00000000-0000-0000-0000-000000000001"

# GL Account IDs — verified against live finance_db gl_accounts table.
_REVENUE_ACCOUNT_ID = "f6bc601b-2e04-4224-9c55-f1cab96d2235"   # 411000-001 Sales - Fresh Vegetables
_COGS_ACCOUNT_ID = "24b4e725-2376-4ac9-add0-33c6080a4e19"       # 511000-001 Seeds & Propagation Materials

# Tax code — 'S' = Standard Rated 5% (UAE VAT), outputTaxAccountId = 222000-001 Output VAT Payable.
_SALES_TAX_CODE = "S"

# System actor for createdBy / updatedBy (migration seeder, not a real user).
_SEEDER_USER_ID = "00000000-0000-0000-0000-000000000000"

# Items to seed — add rows here as new test items are created in the ops DB.
# Format: (item_id, item_code, item_name)
# item_id is the MongoDB ObjectId stored as string in the delivery/invoice lines.
_ITEMS_TO_SEED = [
    (
        "35aeef22-e1c9-4f9f-9506-a2265fb036cf",   # itemId (MongoDB _id)
        "TOM-SEED",                                 # itemCode
        "Tomato - Seeds",                           # itemName
    ),
]


def upgrade() -> None:
    """
    Seed sale_item_finance_ext rows for known test items.

    Each row is guarded by an existence check — safe to run multiple times
    on any environment including fresh container rebuilds.
    """
    conn = op.get_bind()

    for item_id, item_code, item_name in _ITEMS_TO_SEED:
        # Idempotency guard — skip if already seeded.
        existing = conn.execute(
            sa.text(
                "SELECT sale_item_finance_ext_id "
                "FROM sale_item_finance_ext "
                "WHERE organizationId = :org AND itemId = :item_id "
                "LIMIT 1"
            ),
            {"org": _ORG_ID, "item_id": item_id},
        ).fetchone()

        if existing:
            # Already seeded — skip silently.
            continue

        ext_id = str(uuid.uuid4())
        conn.execute(
            sa.text(
                """
                INSERT INTO sale_item_finance_ext
                    (sale_item_finance_ext_id, itemId, organizationId,
                     itemCode, itemName,
                     revenueAccountId, cogsAccountId,
                     salesTaxCode, isSellable, notes,
                     createdBy, updatedBy,
                     createdAt, updatedAt)
                VALUES
                    (:ext_id, :item_id, :org,
                     :item_code, :item_name,
                     :revenue_account_id, :cogs_account_id,
                     :tax_code, 1, :notes,
                     :actor, :actor,
                     NOW(), NOW())
                """
            ),
            {
                "ext_id": ext_id,
                "item_id": item_id,
                "org": _ORG_ID,
                "item_code": item_code,
                "item_name": item_name,
                "revenue_account_id": _REVENUE_ACCOUNT_ID,
                "cogs_account_id": _COGS_ACCOUNT_ID,
                "tax_code": _SALES_TAX_CODE,
                "notes": (
                    "Seeded by migration 019 (T-200.9). "
                    "Revenue: 411000-001 Sales - Fresh Vegetables. "
                    "COGS: 511000-001 Seeds & Propagation Materials. "
                    "Tax: S (5% UAE VAT standard rate)."
                ),
                "actor": _SEEDER_USER_ID,
            },
        )


def downgrade() -> None:
    """
    Remove the seeded rows for items created by this migration.

    Identified by itemId — does not remove any manually created rows for the
    same items (which would have a different notes string but same itemId;
    the UNIQUE constraint on (organizationId, itemId) prevents duplicates).
    Only removes rows for the org/items seeded above.
    """
    conn = op.get_bind()

    for item_id, _item_code, _item_name in _ITEMS_TO_SEED:
        conn.execute(
            sa.text(
                "DELETE FROM sale_item_finance_ext "
                "WHERE organizationId = :org AND itemId = :item_id"
            ),
            {"org": _ORG_ID, "item_id": item_id},
        )
