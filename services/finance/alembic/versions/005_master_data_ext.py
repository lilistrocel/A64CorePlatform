"""Add vendor_finance_ext, purchase_item_finance_ext, and approval_rules tables

Revision ID: 005
Revises: 004
Create Date: 2026-05-19 00:00:04.000000

Creates three new tables for the Purchasing Phase 1A master data extensions:
  - vendor_finance_ext       : Finance-side attributes for vendors from main app
  - purchase_item_finance_ext: Finance-side attributes for purchase items
  - approval_rules           : Document approval thresholds per company/docType

Also seeds four default approval rules for any existing company codes.
"""

import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # vendor_finance_ext
    # ------------------------------------------------------------------ #
    op.create_table(
        "vendor_finance_ext",
        sa.Column("extId", sa.String(36), primary_key=True),
        sa.Column("organizationId", sa.String(36), nullable=False),
        sa.Column("vendorId", sa.String(36), nullable=False),
        sa.Column("vendorCode", sa.String(20), nullable=False),
        sa.Column(
            "reconciliationAccountId",
            sa.String(36),
            sa.ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "defaultExpenseAccountId",
            sa.String(36),
            sa.ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("creditTermsOverride", sa.String(20), nullable=True),
        sa.Column("isActive", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "createdAt",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updatedAt",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
        sa.UniqueConstraint("organizationId", "vendorId", name="uk_vendor_finance_ext"),
    )
    op.create_index(
        "idx_vendor_ext_code",
        "vendor_finance_ext",
        ["organizationId", "vendorCode"],
    )
    op.create_index(
        "idx_vendor_ext_org",
        "vendor_finance_ext",
        ["organizationId"],
    )

    # ------------------------------------------------------------------ #
    # purchase_item_finance_ext
    # ------------------------------------------------------------------ #
    op.create_table(
        "purchase_item_finance_ext",
        sa.Column("extId", sa.String(36), primary_key=True),
        sa.Column("organizationId", sa.String(36), nullable=False),
        sa.Column("itemId", sa.String(36), nullable=False),
        sa.Column("itemCode", sa.String(20), nullable=False),
        sa.Column(
            "inventoryAccountId",
            sa.String(36),
            sa.ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "cogsAccountId",
            sa.String(36),
            sa.ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "allocationAccountId",
            sa.String(36),
            sa.ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
            nullable=True,
            comment="GRNI clearing account",
        ),
        sa.Column(
            "valuationMethod",
            sa.Enum("MovingAverage", "Standard", "FIFO", name="valuationmethodenum"),
            nullable=False,
            server_default="MovingAverage",
        ),
        sa.Column("taxCodeDefault", sa.String(5), nullable=True),
        sa.Column("ifrsTag", sa.String(10), nullable=True),
        sa.Column("isActive", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "createdAt",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updatedAt",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
        sa.UniqueConstraint("organizationId", "itemId", name="uk_purchase_item_finance_ext"),
    )
    op.create_index(
        "idx_item_ext_code",
        "purchase_item_finance_ext",
        ["organizationId", "itemCode"],
    )
    op.create_index(
        "idx_item_ext_org",
        "purchase_item_finance_ext",
        ["organizationId"],
    )

    # ------------------------------------------------------------------ #
    # approval_rules
    # ------------------------------------------------------------------ #
    op.create_table(
        "approval_rules",
        sa.Column("ruleId", sa.String(36), primary_key=True),
        sa.Column("organizationId", sa.String(36), nullable=False),
        sa.Column("companyCode", sa.String(10), nullable=False),
        sa.Column(
            "docType",
            sa.Enum(
                "PR",
                "PO",
                "GRPO",
                "AP_INVOICE",
                "OUTGOING_PAYMENT",
                "AP_CREDIT_NOTE",
                "GOODS_ISSUE",
                name="appdoctypeenum",
            ),
            nullable=False,
        ),
        sa.Column("thresholdAmount", sa.Numeric(15, 2), nullable=True),
        sa.Column("approverRole", sa.String(50), nullable=False),
        sa.Column("alwaysRequired", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("isActive", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "createdAt",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updatedAt",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    op.create_index(
        "idx_approval_rules_lookup",
        "approval_rules",
        ["organizationId", "companyCode", "docType", "isActive", "priority"],
    )

    # ------------------------------------------------------------------ #
    # Seed default approval rules for all existing company codes
    # ------------------------------------------------------------------ #
    _seed_approval_rules(op.get_bind())


def _seed_approval_rules(conn: sa.engine.Connection) -> None:
    """
    Seed four default approval rules for every existing company code.

    Called inside the upgrade transaction so the seed is atomic with the
    schema changes.

    Args:
        conn: Active SQLAlchemy connection from the migration context.
    """
    # Fetch all existing company codes
    result = conn.execute(
        sa.text("SELECT companyCode, organizationId FROM company_codes")
    )
    companies = result.fetchall()

    if not companies:
        return

    # Default rules template per company
    default_rules = [
        {
            "docType": "PR",
            "thresholdAmount": None,
            "approverRole": "procurement_manager",
            "alwaysRequired": True,
            "priority": 100,
        },
        {
            "docType": "PO",
            "thresholdAmount": 10000.00,
            "approverRole": "procurement_manager",
            "alwaysRequired": False,
            "priority": 100,
        },
        {
            "docType": "AP_INVOICE",
            "thresholdAmount": 10000.00,
            "approverRole": "accountant",
            "alwaysRequired": False,
            "priority": 100,
        },
        {
            "docType": "OUTGOING_PAYMENT",
            "thresholdAmount": None,
            "approverRole": "finance_admin",
            "alwaysRequired": True,
            "priority": 100,
        },
    ]

    rows = []
    for company_code, organization_id in companies:
        for rule in default_rules:
            rows.append(
                {
                    "ruleId": str(uuid.uuid4()),
                    "organizationId": organization_id,
                    "companyCode": company_code,
                    "docType": rule["docType"],
                    "thresholdAmount": rule["thresholdAmount"],
                    "approverRole": rule["approverRole"],
                    "alwaysRequired": rule["alwaysRequired"],
                    "priority": rule["priority"],
                    "isActive": True,
                    "notes": "Default rule seeded by migration 005",
                }
            )

    if rows:
        conn.execute(
            sa.text(
                "INSERT INTO approval_rules "
                "(ruleId, organizationId, companyCode, docType, thresholdAmount, "
                " approverRole, alwaysRequired, priority, isActive, notes) "
                "VALUES "
                "(:ruleId, :organizationId, :companyCode, :docType, :thresholdAmount, "
                " :approverRole, :alwaysRequired, :priority, :isActive, :notes)"
            ),
            rows,
        )


def downgrade() -> None:
    op.drop_index("idx_approval_rules_lookup", "approval_rules")
    op.drop_table("approval_rules")

    op.drop_index("idx_item_ext_code", "purchase_item_finance_ext")
    op.drop_index("idx_item_ext_org", "purchase_item_finance_ext")
    op.drop_table("purchase_item_finance_ext")

    op.drop_index("idx_vendor_ext_code", "vendor_finance_ext")
    op.drop_index("idx_vendor_ext_org", "vendor_finance_ext")
    op.drop_table("vendor_finance_ext")

    # Drop enum types
    for name in ("appdoctypeenum", "valuationmethodenum"):
        sa.Enum(name=name).drop(op.get_bind(), checkfirst=True)
