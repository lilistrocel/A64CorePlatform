"""Initial master data tables

Revision ID: 001
Revises:
Create Date: 2026-05-19 00:00:00.000000

Creates all 8 finance master-data tables:
  company_codes, gl_accounts, fiscal_periods, tax_codes,
  cost_centers, vendors, customer_finance_ext, audit_log
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # company_codes
    # ------------------------------------------------------------------ #
    op.create_table(
        "company_codes",
        sa.Column("companyCode", sa.String(10), primary_key=True),
        sa.Column("organizationId", sa.String(36), nullable=False),
        sa.Column("legalName", sa.String(200), nullable=False),
        sa.Column("trn", sa.String(50), nullable=True),
        sa.Column("fiscalYearStartMonth", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("fiscalYearStartDay", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("defaultCurrency", sa.String(3), nullable=False, server_default="AED"),
        sa.Column("isLocked", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updatedAt",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    op.create_index("ix_company_codes_organizationId", "company_codes", ["organizationId"])

    # ------------------------------------------------------------------ #
    # gl_accounts
    # ------------------------------------------------------------------ #
    drawer_enum = sa.Enum(
        "ASSETS",
        "LIABILITIES",
        "EQUITY",
        "REVENUE",
        "COST_OF_SALES",
        "OPERATING_COST",
        "NON_OPERATING",
        "OTHER_INCOME",
        "TAXATION",
        name="drawerenum",
    )
    account_type_enum = sa.Enum(
        "asset", "liability", "equity", "revenue", "expense", name="accounttypeenum"
    )

    op.create_table(
        "gl_accounts",
        sa.Column("accountId", sa.String(36), primary_key=True),
        sa.Column("organizationId", sa.String(36), nullable=False),
        sa.Column("accountNumber", sa.String(20), nullable=False),
        sa.Column("accountName", sa.String(200), nullable=False),
        sa.Column("drawer", drawer_enum, nullable=False),
        sa.Column("accountType", account_type_enum, nullable=False),
        sa.Column(
            "parentAccountId",
            sa.String(36),
            sa.ForeignKey("gl_accounts.accountId", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("isHeader", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("isControlAccount", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("isActive", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("isLockedNumber", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updatedAt",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    op.create_index("ix_gl_accounts_organizationId", "gl_accounts", ["organizationId"])
    op.create_unique_constraint(
        "uq_org_account_number", "gl_accounts", ["organizationId", "accountNumber"]
    )

    # ------------------------------------------------------------------ #
    # fiscal_periods
    # ------------------------------------------------------------------ #
    period_status_enum = sa.Enum("open", "closed", "locked", name="periodstatusenum")

    op.create_table(
        "fiscal_periods",
        sa.Column("periodId", sa.String(36), primary_key=True),
        sa.Column(
            "companyCode",
            sa.String(10),
            sa.ForeignKey("company_codes.companyCode", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("fiscalYear", sa.Integer(), nullable=False),
        sa.Column("periodNumber", sa.Integer(), nullable=False),
        sa.Column("startDate", sa.Date(), nullable=False),
        sa.Column("endDate", sa.Date(), nullable=False),
        sa.Column("status", period_status_enum, nullable=False, server_default="open"),
        sa.Column("closedAt", sa.DateTime(), nullable=True),
        sa.Column("closedByUserId", sa.String(36), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updatedAt",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    op.create_unique_constraint(
        "uq_company_year_period",
        "fiscal_periods",
        ["companyCode", "fiscalYear", "periodNumber"],
    )
    op.create_index("ix_fiscal_periods_companyCode", "fiscal_periods", ["companyCode"])

    # ------------------------------------------------------------------ #
    # tax_codes
    # ------------------------------------------------------------------ #
    op.create_table(
        "tax_codes",
        sa.Column("organizationId", sa.String(36), primary_key=True),
        sa.Column("taxCode", sa.String(10), primary_key=True),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("rate", sa.Numeric(5, 2), nullable=False, server_default="0.00"),
        sa.Column(
            "inputTaxAccountId",
            sa.String(36),
            sa.ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "outputTaxAccountId",
            sa.String(36),
            sa.ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("isActive", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updatedAt",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )

    # ------------------------------------------------------------------ #
    # cost_centers
    # ------------------------------------------------------------------ #
    cost_center_type_enum = sa.Enum(
        "FARM", "DEPARTMENT", "PROJECT", "OTHER", name="costcentertypeenum"
    )

    op.create_table(
        "cost_centers",
        sa.Column("organizationId", sa.String(36), primary_key=True),
        sa.Column("costCenterId", sa.String(20), primary_key=True),
        sa.Column(
            "companyCode",
            sa.String(10),
            sa.ForeignKey("company_codes.companyCode", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("type", cost_center_type_enum, nullable=False, server_default="OTHER"),
        sa.Column("isActive", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updatedAt",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )

    # ------------------------------------------------------------------ #
    # vendors
    # ------------------------------------------------------------------ #
    op.create_table(
        "vendors",
        sa.Column("vendorId", sa.String(36), primary_key=True),
        sa.Column("organizationId", sa.String(36), nullable=False),
        sa.Column("vendorCode", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("trn", sa.String(50), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("contactEmail", sa.String(200), nullable=True),
        sa.Column("contactPhone", sa.String(50), nullable=True),
        sa.Column("paymentTerms", sa.String(50), nullable=True),
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
        sa.Column("bankDetails", sa.JSON(), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="AED"),
        sa.Column("isActive", sa.Boolean(), nullable=False, server_default="1"),
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
    op.create_index("ix_vendors_organizationId", "vendors", ["organizationId"])

    # ------------------------------------------------------------------ #
    # customer_finance_ext
    # ------------------------------------------------------------------ #
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
        "ix_customer_finance_ext_organizationId", "customer_finance_ext", ["organizationId"]
    )

    # ------------------------------------------------------------------ #
    # audit_log
    # ------------------------------------------------------------------ #
    op.create_table(
        "audit_log",
        sa.Column("auditId", sa.String(36), primary_key=True),
        sa.Column("organizationId", sa.String(36), nullable=False),
        sa.Column("actorUserId", sa.String(36), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("entityType", sa.String(50), nullable=False),
        sa.Column("entityId", sa.String(100), nullable=False),
        sa.Column("beforeJson", sa.JSON(), nullable=True),
        sa.Column("afterJson", sa.JSON(), nullable=True),
        sa.Column(
            "timestamp", sa.DateTime(), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_audit_log_organizationId", "audit_log", ["organizationId"])
    op.create_index("ix_audit_log_timestamp", "audit_log", ["timestamp"])


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("customer_finance_ext")
    op.drop_table("vendors")
    op.drop_table("cost_centers")
    op.drop_table("tax_codes")
    op.drop_table("fiscal_periods")
    op.drop_table("gl_accounts")
    op.drop_table("company_codes")

    # Drop custom enum types (MySQL ignores these, but Postgres needs them)
    for enum_name in [
        "drawerenum",
        "accounttypeenum",
        "periodstatusenum",
        "costcentertypeenum",
    ]:
        try:
            sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
        except Exception:
            pass
