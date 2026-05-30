"""Upgrade customer_finance_ext to full Wave 3 schema

Revision ID: 015
Revises: 014
Create Date: 2026-05-29 10:00:00.000000

Wave 3 / T-100.2 — Rebuilds the customer_finance_ext table from the
original minimal schema (customerId PK, simple fields from migration 001)
to the full sales-module extension needed by every sales JE:

  arControlAccountId  — per-customer AR control account override
  paymentTermsId      — drives due dates and AR aging
  defaultTaxCode      — VAT treatment for this customer
  creditLimit / creditLimitCurrency  — SO credit gate
  bpRefDefault        — placeholder for customer PO numbering patterns
  notes               — free-text annotation
  createdBy / updatedBy — actor tracking

Schema changes:
  1. DROP old customer_finance_ext (PK = customerId, no multi-tenant
     unique constraint).
  2. CREATE new customer_finance_ext with:
     - customer_finance_ext_id  VARCHAR(36)  PK (UUID)
     - customerId               VARCHAR(36)  NOT NULL
     - organizationId           VARCHAR(36)  NOT NULL
     - arControlAccountId       VARCHAR(36)  FK gl_accounts (nullable)
     - paymentTermsId           VARCHAR(50)  (string code, nullable)
     - defaultTaxCode           VARCHAR(10)  (string code, nullable)
     - creditLimit              DECIMAL(15,2) (nullable)
     - creditLimitCurrency      CHAR(3)       DEFAULT 'AED'
     - bpRefDefault             VARCHAR(100)  (nullable)
     - notes                    VARCHAR(500)  (nullable)
     - createdBy                VARCHAR(36)   (nullable)
     - updatedBy                VARCHAR(36)   (nullable)
     - createdAt / updatedAt    DATETIME
     - UNIQUE (organizationId, customerId)

Note: this migration drops the old table. Any rows that existed in the
old table are lost. In practice the old table had no FK from other
finance tables, so this is safe.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # Drop the old minimal table (PK was customerId, no org-scoped unique)
    # ------------------------------------------------------------------ #
    op.drop_index("ix_customer_finance_ext_organizationId", "customer_finance_ext")
    op.drop_table("customer_finance_ext")

    # ------------------------------------------------------------------ #
    # Create the new full-schema table
    # ------------------------------------------------------------------ #
    op.create_table(
        "customer_finance_ext",
        sa.Column("customer_finance_ext_id", sa.String(36), primary_key=True),
        sa.Column("customerId", sa.String(36), nullable=False),
        sa.Column("organizationId", sa.String(36), nullable=False),
        sa.Column(
            "arControlAccountId",
            sa.String(36),
            sa.ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
            nullable=True,
            comment="Per-customer AR control account override (falls back to company default)",
        ),
        sa.Column(
            "paymentTermsId",
            sa.String(50),
            nullable=True,
            comment="Payment terms code; drives due dates and AR aging",
        ),
        sa.Column(
            "defaultTaxCode",
            sa.String(10),
            nullable=True,
            comment="Default VAT tax code for this customer (standard/zero-rated/exempt/reverse-charge)",
        ),
        sa.Column(
            "creditLimit",
            sa.Numeric(15, 2),
            nullable=True,
            comment="None means no credit limit enforced",
        ),
        sa.Column(
            "creditLimitCurrency",
            sa.String(3),
            nullable=False,
            server_default="AED",
        ),
        sa.Column(
            "bpRefDefault",
            sa.String(100),
            nullable=True,
            comment="Placeholder for customer standard PO numbering pattern",
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
            "customerId",
            name="uk_customer_finance_ext",
        ),
    )
    # Indexes for the three query patterns called out in the task spec.
    op.create_index(
        "idx_customer_ext_org",
        "customer_finance_ext",
        ["organizationId"],
    )
    op.create_index(
        "idx_customer_ext_customer",
        "customer_finance_ext",
        ["customerId"],
    )
    op.create_index(
        "idx_customer_ext_ar_account",
        "customer_finance_ext",
        ["arControlAccountId"],
    )


def downgrade() -> None:
    op.drop_index("idx_customer_ext_ar_account", "customer_finance_ext")
    op.drop_index("idx_customer_ext_customer", "customer_finance_ext")
    op.drop_index("idx_customer_ext_org", "customer_finance_ext")
    op.drop_table("customer_finance_ext")

    # Restore the original minimal table
    op.create_table(
        "customer_finance_ext",
        sa.Column("customerId", sa.String(36), primary_key=True),
        sa.Column("organizationId", sa.String(36), nullable=False),
        sa.Column("trn", sa.String(50), nullable=True),
        sa.Column("paymentTerms", sa.String(50), nullable=True),
        sa.Column(
            "reconciliationAccountId",
            sa.String(36),
            sa.ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "defaultRevenueAccountId",
            sa.String(36),
            sa.ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("creditLimit", sa.Numeric(15, 2), nullable=True),
        sa.Column("isBlocked", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updatedAt",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_customer_finance_ext_organizationId",
        "customer_finance_ext",
        ["organizationId"],
    )
