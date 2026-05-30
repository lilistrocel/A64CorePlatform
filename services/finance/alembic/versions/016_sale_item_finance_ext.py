"""Add sale_item_finance_ext table (Wave 3 / T-100.3)

Revision ID: 016
Revises: 015
Create Date: 2026-05-29 12:00:00.000000

Wave 3 / T-100.3 — Creates the sale_item_finance_ext table.

This is a NEW parallel table alongside purchase_item_finance_ext.  We chose
Option B (parallel table) over Option A/C (rename + extend) for these reasons:

  1. purchase_item_finance_ext.cogsAccountId is already used by the live
     _handle_purchase_received posting handler (GR-COGS recognition at receipt).
     Consolidating into a single row would conflate two semantically distinct
     cogsAccountId values pointing at the same GL account but serving different JE
     handlers.  Keeping them separate makes each table's contract clear and
     eliminates any risk to the existing purchase posting path.
  2. Zero migration-time risk: no ALTER TABLE, no data movement, no FK changes on
     existing tables.  The existing handler imports are untouched.
  3. Mirrors the T-100.2 CustomerFinanceExt pattern: a dedicated per-entity table
     with its own CRUD + audit + type-guards.

Schema:
  sale_item_finance_ext
    sale_item_finance_ext_id  VARCHAR(36)   PK (UUID)
    itemId                    VARCHAR(36)   NOT NULL (FK to ops MongoDB item)
    organizationId            VARCHAR(36)   NOT NULL
    itemCode                  VARCHAR(20)   nullable (denormalized)
    itemName                  VARCHAR(200)  nullable (denormalized)
    revenueAccountId          VARCHAR(36)   FK gl_accounts (nullable)
    cogsAccountId             VARCHAR(36)   FK gl_accounts (nullable)
    salesTaxCode              VARCHAR(10)   nullable (string code, no hard FK)
    isSellable                BOOLEAN       NOT NULL DEFAULT 1
    createdBy                 VARCHAR(36)   nullable
    updatedBy                 VARCHAR(36)   nullable
    createdAt / updatedAt     DATETIME
    UNIQUE (organizationId, itemId)
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "016"
down_revision: Union[str, None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sale_item_finance_ext",
        sa.Column("sale_item_finance_ext_id", sa.String(36), primary_key=True),
        sa.Column("itemId", sa.String(36), nullable=False),
        sa.Column("organizationId", sa.String(36), nullable=False),
        sa.Column(
            "itemCode",
            sa.String(20),
            nullable=True,
            comment="Denormalized item code for display; not a FK",
        ),
        sa.Column(
            "itemName",
            sa.String(200),
            nullable=True,
            comment="Denormalized item name for display; not a FK",
        ),
        sa.Column(
            "revenueAccountId",
            sa.String(36),
            sa.ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
            nullable=True,
            comment="Per-item revenue account (drawer=REVENUE, accountType=revenue)",
        ),
        sa.Column(
            "cogsAccountId",
            sa.String(36),
            sa.ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
            nullable=True,
            comment="Per-item COGS account for Delivery JE (drawer=COST_OF_SALES, accountType=expense)",
        ),
        sa.Column(
            "salesTaxCode",
            sa.String(10),
            nullable=True,
            comment="Output VAT tax code string (no hard FK — mirrors T-100.2 deviation)",
        ),
        sa.Column(
            "isSellable",
            sa.Boolean(),
            nullable=False,
            server_default="1",
            comment="Whether this item is enabled for sale; filters AR Invoice item picker",
        ),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("createdBy", sa.String(36), nullable=True),
        sa.Column("updatedBy", sa.String(36), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updatedAt",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "organizationId",
            "itemId",
            name="uk_sale_item_finance_ext",
        ),
    )

    # Reason: three index patterns cover all expected query paths.
    # idx_sale_item_ext_org    — list endpoint filtered by organizationId
    # idx_sale_item_ext_item   — GET/PATCH/DELETE by itemId
    # idx_sale_item_ext_rev    — future AR Invoice lookup by revenueAccountId
    op.create_index(
        "idx_sale_item_ext_org",
        "sale_item_finance_ext",
        ["organizationId"],
    )
    op.create_index(
        "idx_sale_item_ext_item",
        "sale_item_finance_ext",
        ["itemId"],
    )
    op.create_index(
        "idx_sale_item_ext_rev",
        "sale_item_finance_ext",
        ["revenueAccountId"],
    )


def downgrade() -> None:
    op.drop_index("idx_sale_item_ext_rev", "sale_item_finance_ext")
    op.drop_index("idx_sale_item_ext_item", "sale_item_finance_ext")
    op.drop_index("idx_sale_item_ext_org", "sale_item_finance_ext")
    op.drop_table("sale_item_finance_ext")
