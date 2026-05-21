"""Create ap_payments and ap_payment_applications tables

Revision ID: 011
Revises: 010
Create Date: 2026-05-20 00:00:00.000000

Adds:
  - ap_payments — one row per vendor payment recorded by finance.
  - ap_payment_applications — junction rows linking a payment to one or more
    AP invoice documents (stored as apDocId referencing the operation Mongo store).

Phase D: vendor payment is finance-internal (no outbox event).
The posting handler creates the JE (DR AP Control / CR Bank) atomically in
the same request as the payment insert.

Reversible: downgrade drops both tables in reverse FK order.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Reason: enum values must match PaymentMethodEnum values in models.py exactly.
# MySQL stores these as the string values, not Python enum member names.
_PAYMENT_METHOD_ENUM_NAME = "paymentmethodenum"
_PAYMENT_METHOD_VALUES = ("bank_transfer", "cheque", "cash")


def upgrade() -> None:
    """Create ap_payments and ap_payment_applications tables."""
    op.create_table(
        "ap_payments",
        sa.Column("paymentId", sa.String(36), primary_key=True),
        sa.Column("organizationId", sa.String(36), nullable=False),
        sa.Column("companyCode", sa.String(10), nullable=False),
        sa.Column("paymentNumber", sa.String(40), nullable=False),
        sa.Column("paymentDate", sa.Date, nullable=False),
        sa.Column(
            "periodId",
            sa.String(36),
            sa.ForeignKey("fiscal_periods.periodId", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("vendorId", sa.String(36), nullable=False),
        sa.Column("vendorCode", sa.String(20), nullable=True),
        sa.Column(
            "bankAccountId",
            sa.String(36),
            sa.ForeignKey("gl_accounts.accountId", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "paymentMethod",
            sa.Enum(*_PAYMENT_METHOD_VALUES, name=_PAYMENT_METHOD_ENUM_NAME),
            nullable=False,
            server_default="bank_transfer",
        ),
        sa.Column("referenceNumber", sa.String(50), nullable=True),
        sa.Column("currencyCode", sa.String(3), nullable=False, server_default="AED"),
        sa.Column("totalAmount", sa.Numeric(15, 2), nullable=False),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column(
            "jeId",
            sa.String(36),
            sa.ForeignKey("journal_entries.jeId", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("createdBy", sa.String(36), nullable=False),
        sa.Column(
            "createdAt",
            sa.DateTime,
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updatedAt",
            sa.DateTime,
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("organizationId", "paymentNumber", name="uq_org_payment_number"),
    )

    op.create_index("ix_ap_payments_organizationId", "ap_payments", ["organizationId"])
    op.create_index("ix_ap_payments_vendorId", "ap_payments", ["vendorId"])
    op.create_index("ix_ap_payments_paymentDate", "ap_payments", ["paymentDate"])
    op.create_index("ix_ap_payments_companyCode", "ap_payments", ["companyCode"])

    op.create_table(
        "ap_payment_applications",
        sa.Column("applicationId", sa.String(36), primary_key=True),
        sa.Column(
            "paymentId",
            sa.String(36),
            sa.ForeignKey("ap_payments.paymentId", ondelete="RESTRICT"),
            nullable=False,
        ),
        # Reason: apInvoiceDocId references an operation-side MongoDB document.
        # No FK constraint because it crosses store boundaries.
        sa.Column("apInvoiceDocId", sa.String(36), nullable=False),
        sa.Column("apInvoiceDocNumber", sa.String(40), nullable=True),
        sa.Column("amountApplied", sa.Numeric(15, 2), nullable=False),
        sa.Column(
            "createdAt",
            sa.DateTime,
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        # Reason: the same invoice must not appear twice on the same payment.
        sa.UniqueConstraint(
            "paymentId", "apInvoiceDocId", name="uq_payment_application"
        ),
    )

    op.create_index(
        "ix_ap_payment_applications_paymentId",
        "ap_payment_applications",
        ["paymentId"],
    )
    op.create_index(
        "ix_ap_payment_applications_apInvoiceDocId",
        "ap_payment_applications",
        ["apInvoiceDocId"],
    )


def downgrade() -> None:
    """Drop ap_payment_applications and ap_payments tables."""
    # Reason: drop child table first to remove FK dependency on ap_payments.
    op.drop_table("ap_payment_applications")
    op.drop_table("ap_payments")
    # Reason: MySQL ENUM types are inline; attempt to drop the named type only on
    # non-SQLite databases to avoid errors during test runs with aiosqlite.
    sa.Enum(name=_PAYMENT_METHOD_ENUM_NAME).drop(op.get_bind(), checkfirst=True)
