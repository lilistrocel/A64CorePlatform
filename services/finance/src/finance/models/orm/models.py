"""
Finance ORM Models

SQLAlchemy 2.x ORM definitions for all 8 finance tables.
Drawer and period-status use Python Enum types so valid values are
enforced at the application layer.
"""

import enum
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from .base import Base


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class DrawerEnum(str, enum.Enum):
    """Top-level account drawers for the chart of accounts."""

    ASSETS = "ASSETS"
    LIABILITIES = "LIABILITIES"
    EQUITY = "EQUITY"
    REVENUE = "REVENUE"
    COST_OF_SALES = "COST_OF_SALES"
    OPERATING_COST = "OPERATING_COST"
    NON_OPERATING = "NON_OPERATING"
    OTHER_INCOME = "OTHER_INCOME"
    TAXATION = "TAXATION"


class AccountTypeEnum(str, enum.Enum):
    """Financial statement type of the GL account."""

    ASSET = "asset"
    LIABILITY = "liability"
    EQUITY = "equity"
    REVENUE = "revenue"
    EXPENSE = "expense"


class PeriodStatusEnum(str, enum.Enum):
    """Lifecycle status of a fiscal period."""

    OPEN = "open"
    CLOSED = "closed"
    LOCKED = "locked"


class CostCenterTypeEnum(str, enum.Enum):
    """Operational type of a cost centre."""

    FARM = "FARM"
    DEPARTMENT = "DEPARTMENT"
    PROJECT = "PROJECT"
    OTHER = "OTHER"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class CompanyCode(Base):
    """
    Company Codes (SAP-style company entities).

    Each company belongs to one organization and has its own fiscal calendar.
    Creating a company seeds the default chart of accounts automatically.
    """

    __tablename__ = "company_codes"

    companyCode = Column(String(10), primary_key=True)
    organizationId = Column(String(36), nullable=False, index=True)
    legalName = Column(String(200), nullable=False)
    trn = Column(String(50), nullable=True)  # Tax Registration Number (UAE VAT)
    fiscalYearStartMonth = Column(Integer, nullable=False, default=1)
    fiscalYearStartDay = Column(Integer, nullable=False, default=1)
    defaultCurrency = Column(String(3), nullable=False, default="AED")
    isLocked = Column(Boolean, nullable=False, default=False)
    createdAt = Column(DateTime, nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    fiscal_periods = relationship(
        "FiscalPeriod", back_populates="company", cascade="all, delete-orphan"
    )
    cost_centers = relationship("CostCenter", back_populates="company")


class GLAccount(Base):
    """
    General Ledger Accounts (Chart of Accounts).

    Supports a tree structure via self-referential parentAccountId.
    Header accounts cannot be posted to directly.
    """

    __tablename__ = "gl_accounts"
    __table_args__ = (
        UniqueConstraint("organizationId", "accountNumber", name="uq_org_account_number"),
    )

    accountId = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organizationId = Column(String(36), nullable=False, index=True)
    accountNumber = Column(String(20), nullable=False)
    accountName = Column(String(200), nullable=False)
    drawer = Column(Enum(DrawerEnum), nullable=False)
    accountType = Column(Enum(AccountTypeEnum), nullable=False)
    parentAccountId = Column(
        String(36), ForeignKey("gl_accounts.accountId", ondelete="RESTRICT"), nullable=True
    )
    isHeader = Column(Boolean, nullable=False, default=False)
    isControlAccount = Column(Boolean, nullable=False, default=False)
    isActive = Column(Boolean, nullable=False, default=True)
    isLockedNumber = Column(Boolean, nullable=False, default=False)
    createdAt = Column(DateTime, nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Self-referential relationship — remote_side marks the "one" side (parent)
    children = relationship(
        "GLAccount",
        back_populates="parent",
        foreign_keys=[parentAccountId],
    )
    parent = relationship(
        "GLAccount",
        back_populates="children",
        foreign_keys=[parentAccountId],
        remote_side="GLAccount.accountId",
    )


class FiscalPeriod(Base):
    """
    Fiscal Periods.

    Supports up to 13 periods per fiscal year (for 4-4-5 calendars).
    Only one period per (companyCode, fiscalYear, periodNumber) can exist.
    """

    __tablename__ = "fiscal_periods"
    __table_args__ = (
        UniqueConstraint(
            "companyCode",
            "fiscalYear",
            "periodNumber",
            name="uq_company_year_period",
        ),
    )

    periodId = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    companyCode = Column(
        String(10), ForeignKey("company_codes.companyCode", ondelete="RESTRICT"), nullable=False
    )
    fiscalYear = Column(Integer, nullable=False)
    periodNumber = Column(Integer, nullable=False)  # 1–13
    startDate = Column(Date, nullable=False)
    endDate = Column(Date, nullable=False)
    status = Column(Enum(PeriodStatusEnum), nullable=False, default=PeriodStatusEnum.OPEN)
    closedAt = Column(DateTime, nullable=True)
    closedByUserId = Column(String(36), nullable=True)
    createdAt = Column(DateTime, nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    company = relationship("CompanyCode", back_populates="fiscal_periods")


class TaxCode(Base):
    """
    Tax Codes (UAE VAT).

    Composite PK on (organizationId, taxCode).
    inputTaxAccountId / outputTaxAccountId are optional FKs to gl_accounts.
    """

    __tablename__ = "tax_codes"

    organizationId = Column(String(36), primary_key=True)
    taxCode = Column(String(10), primary_key=True)
    description = Column(String(200), nullable=False)
    rate = Column(Numeric(5, 2), nullable=False, default=0)
    inputTaxAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    outputTaxAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    isActive = Column(Boolean, nullable=False, default=True)
    createdAt = Column(DateTime, nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class CostCenter(Base):
    """
    Cost Centres.

    Composite PK on (organizationId, costCenterId).
    Optionally linked to a company code.
    """

    __tablename__ = "cost_centers"

    organizationId = Column(String(36), primary_key=True)
    costCenterId = Column(String(20), primary_key=True)
    companyCode = Column(
        String(10),
        ForeignKey("company_codes.companyCode", ondelete="SET NULL"),
        nullable=True,
    )
    name = Column(String(200), nullable=False)
    type = Column(Enum(CostCenterTypeEnum), nullable=False, default=CostCenterTypeEnum.OTHER)
    isActive = Column(Boolean, nullable=False, default=True)
    createdAt = Column(DateTime, nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    company = relationship("CompanyCode", back_populates="cost_centers")


class Vendor(Base):
    """
    Vendor master data.

    bankDetails stored as JSON for flexibility.
    reconciliationAccountId and defaultExpenseAccountId are FK to gl_accounts.
    """

    __tablename__ = "vendors"

    vendorId = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organizationId = Column(String(36), nullable=False, index=True)
    vendorCode = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    trn = Column(String(50), nullable=True)
    address = Column(Text, nullable=True)
    contactEmail = Column(String(200), nullable=True)
    contactPhone = Column(String(50), nullable=True)
    paymentTerms = Column(String(50), nullable=True)
    reconciliationAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    defaultExpenseAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    bankDetails = Column(JSON, nullable=True)
    currency = Column(String(3), nullable=False, default="AED")
    isActive = Column(Boolean, nullable=False, default=True)
    isBlocked = Column(Boolean, nullable=False, default=False)
    createdAt = Column(DateTime, nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class CustomerFinanceExt(Base):
    """
    Customer Finance Extension.

    Extends the MongoDB customer document with finance-specific fields.
    customerId is the primary key and must match the Mongo document's customerId.
    """

    __tablename__ = "customer_finance_ext"

    customerId = Column(String(36), primary_key=True)
    organizationId = Column(String(36), nullable=False, index=True)
    trn = Column(String(50), nullable=True)
    paymentTerms = Column(String(50), nullable=True)
    reconciliationAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    defaultRevenueAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    creditLimit = Column(Numeric(15, 2), nullable=True)
    isBlocked = Column(Boolean, nullable=False, default=False)
    createdAt = Column(DateTime, nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class AuditLog(Base):
    """
    Immutable audit trail for all finance mutations.

    beforeJson / afterJson store the serialised entity state before and after change.
    Rows are insert-only; no updates or deletes.
    """

    __tablename__ = "audit_log"

    auditId = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organizationId = Column(String(36), nullable=False, index=True)
    actorUserId = Column(String(36), nullable=False)
    action = Column(String(50), nullable=False)   # CREATE, UPDATE, DELETE, CLOSE, REOPEN
    entityType = Column(String(50), nullable=False)
    entityId = Column(String(100), nullable=False)
    beforeJson = Column(JSON, nullable=True)
    afterJson = Column(JSON, nullable=True)
    timestamp = Column(DateTime, nullable=False, server_default=func.now(), index=True)


class OutboxEventResultEnum(str, enum.Enum):
    """Processing outcome for an outbox event."""

    SUCCESS = "success"
    SKIPPED = "skipped"
    FAILED = "failed"


class OutboxEventsProcessed(Base):
    """
    Idempotency table for the outbox bridge.

    Every event the finance service receives is recorded here keyed on
    eventId.  Before processing, the finance ingest endpoint checks this
    table — if the eventId already exists it returns 'already_processed'
    without running the posting logic again.

    Rows are insert-only (no updates or deletes).
    """

    __tablename__ = "outbox_events_processed"

    eventId = Column(String(36), primary_key=True)
    eventType = Column(String(50), nullable=False)
    organizationId = Column(String(36), nullable=False)
    companyCode = Column(String(10), nullable=False)
    occurredAt = Column(DateTime, nullable=False)
    processedAt = Column(DateTime, nullable=False, server_default=func.now())
    result = Column(
        # Reason: values_callable forces SQLAlchemy to serialize using enum VALUES
        # (lowercase 'success'/'skipped'/'failed') instead of the default NAMES
        # ('SUCCESS'/'SKIPPED'/'FAILED'). The MySQL ENUM column was created with
        # lowercase values in migration 003.
        Enum(OutboxEventResultEnum, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=OutboxEventResultEnum.SUCCESS,
    )
    errorMessage = Column(Text, nullable=True)
