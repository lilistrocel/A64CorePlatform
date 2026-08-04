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


class AccountLevelEnum(str, enum.Enum):
    """Hierarchical level of a GL account in the chart of accounts."""

    DRAWER = "drawer"
    TITLE = "title"
    ACTIVE = "active"


class AccountRoleEnum(str, enum.Enum):
    """Functional role of a GL account for automated posting rules."""

    POSTING = "posting"
    BANK = "bank"
    CASH = "cash"
    RECONCILIATION = "reconciliation"
    CLEARING = "clearing"
    CONTRA = "contra"
    REVENUE = "revenue"
    EXPENSE = "expense"
    OTHER = "other"


class CashFlowCategoryEnum(str, enum.Enum):
    """
    Wave 2 (T-060.2) — categorises a GL account for indirect-method
    cash flow statement.

    - CASH                — actual cash & equivalents (drives "Cash at
      beginning/end of period" line).
    - WORKING_CAPITAL     — current AR/AP/inventory/prepayments etc.
      Period delta contributes to "Changes in working capital".
    - NON_CASH_ADJUSTMENT — depreciation / amortisation / provisions
      whose period activity is added back to net income.
    - INVESTING           — non-current asset purchases/disposals,
      equity investments.
    - FINANCING           — borrowings, share capital, dividends.
    - NONE                — excluded from the cash flow statement
      entirely. Default for new accounts and all P&L drawers (their
      net result is captured via the net-income line, not by
      double-counting).
    """

    CASH = "cash"
    WORKING_CAPITAL = "working_capital"
    NON_CASH_ADJUSTMENT = "non_cash_adjustment"
    INVESTING = "investing"
    FINANCING = "financing"
    NONE = "none"


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
    # Reason: description is free-text metadata; nullable so existing rows are unaffected.
    description = Column(String(500), nullable=True)
    drawer = Column(Enum(DrawerEnum), nullable=False)
    # Reason: values_callable forces SQLAlchemy to use enum VALUES ('asset', 'liability',
    # etc.) not names ('ASSET', 'LIABILITY') to match the MySQL column definition in
    # migration 001 which uses lowercase values.
    accountType = Column(
        Enum(AccountTypeEnum, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    parentAccountId = Column(
        String(36), ForeignKey("gl_accounts.accountId", ondelete="RESTRICT"), nullable=True
    )
    isHeader = Column(Boolean, nullable=False, default=False)
    isControlAccount = Column(Boolean, nullable=False, default=False)
    isActive = Column(Boolean, nullable=False, default=True)
    isLockedNumber = Column(Boolean, nullable=False, default=False)
    # Reason: values_callable forces SQLAlchemy to use enum VALUES ('drawer', 'title',
    # 'active') not names, matching the MySQL ENUM created by migration 004.
    # Column name= maps the camelCase ORM attribute to the snake_case DB column.
    accountLevel = Column(
        "account_level",
        Enum(AccountLevelEnum, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=AccountLevelEnum.ACTIVE,
        server_default="active",
    )
    # Reason: nullable — not every account has a role; migration 004 seeded these as NULL.
    accountRole = Column(
        "account_role",
        Enum(AccountRoleEnum, values_callable=lambda e: [m.value for m in e]),
        nullable=True,
    )
    # Reason: nullable — IFRS tag is optional metadata; most accounts will not have one.
    ifrsTag = Column("ifrs_tag", String(10), nullable=True)
    # Reason: Wave 2 (T-060.2) — drives placement on the Cash Flow
    # Statement. Defaults to 'none' for safety so existing rows + any
    # newly-created account that the operator hasn't classified yet are
    # simply excluded from CF until classified. Migration 014 backfills
    # sensible defaults for the seeded CoA based on accountNumber
    # prefix + name patterns.
    cashFlowCategory = Column(
        "cash_flow_category",
        Enum(
            CashFlowCategoryEnum,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default="none",
        default=CashFlowCategoryEnum.NONE,
    )
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
    # Reason: values_callable forces SQLAlchemy to use enum VALUES ('open', 'closed',
    # 'locked') not names ('OPEN', 'CLOSED', 'LOCKED') to match migration 001.
    status = Column(
        Enum(PeriodStatusEnum, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=PeriodStatusEnum.OPEN,
    )
    closedAt = Column(DateTime, nullable=True)
    # Reason: closedByUserId stores the JWT userId of whoever closed the period.
    # VARCHAR(36) matches the UUID format used throughout the platform.
    closedByUserId = Column(String(36), nullable=True)
    closeReason = Column(String(500), nullable=True)
    reopenedAt = Column(DateTime, nullable=True)
    reopenedByUserId = Column(String(36), nullable=True)
    reopenReason = Column(String(500), nullable=True)
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
    # Reason: UAE VAT reverse-charge flag (migration 012). When True, the AP
    # invoice posting handler must post both DR Input VAT and CR Output VAT
    # for the same amount (self-accounting). The foreign supplier did not
    # charge VAT, so AP control is credited for lineNet only (not lineGross).
    isReverseCharge = Column(Boolean, nullable=False, default=False, server_default="0")
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
    Customer Finance Extension (Wave 3 / T-100.2).

    Finance-side attributes for customers managed in the main app (MongoDB).
    Required by the sales_invoice_posted JE handler so every sales document
    can resolve the correct AR control account, payment terms, and tax code
    without cross-DB joins into the ops MongoDB.

    PK is a generated UUID (customer_finance_ext_id).
    Uniqueness is enforced at (organizationId, customerId).
    customerId is the MongoDB customer document's _id (stored as string).
    """

    __tablename__ = "customer_finance_ext"
    __table_args__ = (
        UniqueConstraint("organizationId", "customerId", name="uk_customer_finance_ext"),
    )

    customer_finance_ext_id = Column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    customerId = Column(String(36), nullable=False, index=True)
    organizationId = Column(String(36), nullable=False, index=True)
    # Reason: per-customer AR control account override. Falls back to
    # CompanyPostingSetup.arControlAccountId when null.
    arControlAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Reason: string code (e.g. "NET30", "NET60") — not a FK to a payment_terms
    # table because the finance service does not host that master data; it lives
    # in the ops MongoDB. Stored for informational use and AR aging computation.
    paymentTermsId = Column(String(50), nullable=True)
    # Reason: string code (e.g. "S", "Z", "E") — references tax_codes.taxCode
    # but a hard FK is avoided because tax codes use a composite PK
    # (organizationId, taxCode) and cross-table validation is done at the
    # application layer (endpoint handler), not at DB level.
    defaultTaxCode = Column(String(10), nullable=True)
    # Reason: None means no credit limit enforced (open credit).
    creditLimit = Column(Numeric(15, 2), nullable=True)
    creditLimitCurrency = Column(String(3), nullable=False, default="AED", server_default="AED")
    # Reason: placeholder for customer's standard PO numbering pattern if known.
    # Not used at run-time — informational only.
    bpRefDefault = Column(String(100), nullable=True)
    notes = Column(String(500), nullable=True)
    createdBy = Column(String(36), nullable=True)
    updatedBy = Column(String(36), nullable=True)
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


class ValuationMethodEnum(str, enum.Enum):
    """Inventory valuation method for purchase items."""

    MOVING_AVERAGE = "MovingAverage"
    STANDARD = "Standard"
    FIFO = "FIFO"


class PurchaseItemTypeEnum(str, enum.Enum):
    """
    Operational item type, denormalized into purchase_item_finance_ext.

    Mirrors the Literal in PurchaseItemChangedPayload so the finance service
    can filter and display items without cross-DB joins to MongoDB.
    """

    RAW_MATERIAL = "raw_material"
    CONSUMABLE = "consumable"
    SERVICE = "service"
    FIXED_ASSET_ACQUISITION = "fixed_asset_acquisition"


class ApprovalDocTypeEnum(str, enum.Enum):
    """Document types that require approval."""

    PR = "PR"
    PO = "PO"
    GRPO = "GRPO"
    AP_INVOICE = "AP_INVOICE"
    OUTGOING_PAYMENT = "OUTGOING_PAYMENT"
    AP_CREDIT_NOTE = "AP_CREDIT_NOTE"
    GOODS_ISSUE = "GOODS_ISSUE"


class VendorFinanceExt(Base):
    """
    Vendor Finance Extension.

    Finance-side attributes for vendors managed in the main app (MongoDB).
    Created/updated automatically when vendor_changed events arrive via the
    outbox bridge.  Finance-specific fields (reconciliationAccountId,
    defaultExpenseAccountId) are NOT overwritten by subsequent vendor_changed
    events — only the denormalized vendorCode is updated.
    """

    __tablename__ = "vendor_finance_ext"
    __table_args__ = (
        UniqueConstraint("organizationId", "vendorId", name="uk_vendor_finance_ext"),
    )

    extId = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organizationId = Column(String(36), nullable=False, index=True)
    vendorId = Column(String(36), nullable=False)
    vendorCode = Column(String(20), nullable=False)
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
    creditTermsOverride = Column(String(20), nullable=True)
    isActive = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)
    createdAt = Column(DateTime, nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class PurchaseItemFinanceExt(Base):
    """
    Purchase Item Finance Extension.

    Finance-side attributes for purchase items managed in the main app.
    Created/updated when purchase_item_changed events arrive.
    Default account assignments are set at creation time based on itemType;
    they are not overwritten by subsequent events.
    """

    __tablename__ = "purchase_item_finance_ext"
    __table_args__ = (
        UniqueConstraint("organizationId", "itemId", name="uk_purchase_item_finance_ext"),
    )

    extId = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organizationId = Column(String(36), nullable=False, index=True)
    itemId = Column(String(36), nullable=False)
    itemCode = Column(String(20), nullable=False)
    # Reason: denormalized from the operational item so the finance UI can display
    # useful item info without cross-DB joins.  Nullable because existing rows
    # pre-date migration 009; populated on the next purchase_item_changed event.
    itemName = Column(String(200), nullable=True)
    itemType = Column(
        # Reason: values_callable forces SQLAlchemy to use enum VALUES
        # ('raw_material', etc.) not names ('RAW_MATERIAL', etc.) to match
        # the MySQL ENUM column created by migration 009.
        Enum(PurchaseItemTypeEnum, values_callable=lambda e: [m.value for m in e]),
        nullable=True,
    )
    inventoryAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    cogsAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    allocationAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
        comment="GRNI clearing account",
    )
    # DEPRECATED (Item 11, 2026-05-20): per-item valuation is no longer the source of truth.
    # IAS 2 requires a consistent cost formula per company.  The authoritative value is now
    # CompanyPostingSetup.defaultValuationMethod.  This column is retained for backward
    # compatibility and historical data; it will be removed in v2.
    # At posting time, consume CompanyPostingSetup.defaultValuationMethod — not this field.
    valuationMethod = Column(
        Enum(ValuationMethodEnum, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=ValuationMethodEnum.MOVING_AVERAGE,
    )
    taxCodeDefault = Column(String(5), nullable=True)
    ifrsTag = Column(String(10), nullable=True)
    isActive = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)
    createdAt = Column(DateTime, nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class SaleItemFinanceExt(Base):
    """
    Sale Item Finance Extension (Wave 3 / T-100.3).

    Finance-side sales attributes for items managed in the main app (MongoDB).
    Required by the AR Invoice and Delivery JE handlers so every sales document
    can resolve the correct revenue account, COGS account, and output VAT code
    per item without cross-DB joins into the ops MongoDB.

    PK is a generated UUID (sale_item_finance_ext_id).
    Uniqueness is enforced at (organizationId, itemId).
    itemId is the MongoDB item document's _id (stored as string).

    Parallel to purchase_item_finance_ext (purchase-side): this table holds the
    SALES-side GL mapping only.  The two cogsAccountId fields serve different
    JE handlers:
      - purchase_item_finance_ext.cogsAccountId — used by purchase_received
        posting for GR-COGS (direct-cost recognition at receipt, optional).
      - sale_item_finance_ext.cogsAccountId — used by Delivery JE handler
        (DR COGS / CR Inventory at shipment), the canonical inventory-depletion
        entry.
    Keeping them separate avoids a single row carrying mixed purchase+sale
    semantics, reduces audit surface, and eliminates risk to the live
    _handle_purchase_received handler.
    """

    __tablename__ = "sale_item_finance_ext"
    __table_args__ = (
        UniqueConstraint("organizationId", "itemId", name="uk_sale_item_finance_ext"),
    )

    sale_item_finance_ext_id = Column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    itemId = Column(String(36), nullable=False, index=True)
    organizationId = Column(String(36), nullable=False, index=True)
    # Reason: denormalized from the operational item so the finance UI can display
    # useful item info without cross-DB joins.  Nullable so the row can be created
    # manually before the ops event arrives, and updated on the next sync.
    itemCode = Column(String(20), nullable=True)
    itemName = Column(String(200), nullable=True)
    # Reason: per-item revenue account override.  AR Invoice JE handler posts
    # DR AR / CR Revenue using this account.  Must be drawer=REVENUE, accountType=revenue.
    revenueAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Reason: per-item COGS account for Delivery JE (DR COGS / CR Inventory).
    # Must be drawer=COST_OF_SALES, accountType=expense, isHeader=false.
    cogsAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    # Reason: string code (e.g. "S", "Z", "E") — references tax_codes.taxCode
    # but a hard FK is avoided because tax codes use a composite PK
    # (organizationId, taxCode) and cross-table validation is done at the
    # application layer, not at DB level.  Mirrors defaultTaxCode on
    # customer_finance_ext (T-100.2 deviation rationale).
    salesTaxCode = Column(String(10), nullable=True)
    # Reason: isSellable flag lets the AR Invoice UI filter down to only items
    # that are configured for sale (i.e. have been enabled by finance).
    # Defaults to True so items created via event sync are immediately visible.
    isSellable = Column(Boolean, nullable=False, default=True, server_default="1")
    # Reason: gates direct-create AR Invoice (T-201.8). Stock items must flow through
    # a Delivery Note so COGS posts symmetrically with the revenue side. Service/fee
    # items (delivery fees, late charges, retainers) can be invoiced directly because
    # they have no inventory to deplete. Defaults True (conservative) so legacy items
    # behave exactly as before until an admin classifies them.
    isStock = Column(Boolean, nullable=False, default=True, server_default="1")
    notes = Column(String(500), nullable=True)
    createdBy = Column(String(36), nullable=True)
    updatedBy = Column(String(36), nullable=True)
    createdAt = Column(DateTime, nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class ApprovalRule(Base):
    """
    Approval Rules.

    Defines who must approve which document types and at what amount thresholds.
    Seeded with four defaults per company code at company creation time.
    """

    __tablename__ = "approval_rules"

    ruleId = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organizationId = Column(String(36), nullable=False, index=True)
    companyCode = Column(String(10), nullable=False)
    docType = Column(
        Enum(ApprovalDocTypeEnum, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    thresholdAmount = Column(Numeric(15, 2), nullable=True)
    """Null + alwaysRequired=True → always requires approval."""
    approverRole = Column(String(50), nullable=False)
    alwaysRequired = Column(Boolean, nullable=False, default=False)
    priority = Column(Integer, nullable=False, default=100)
    isActive = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)
    createdAt = Column(DateTime, nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class JEStatusEnum(str, enum.Enum):
    """Lifecycle status of a journal entry."""

    POSTED = "posted"
    VOID = "void"


class JournalEntry(Base):
    """
    Journal Entry header.

    Immutable from the API perspective — only the posting handlers (Phase B+)
    may create rows. The API exposes read-only list and detail endpoints.

    jeNumber format: JE-{companyCode}-{YYYY}-{NNNN} (per-company sequence).
    totalDebit must equal totalCredit — enforced by the posting handler, not
    at DB level (MySQL CHECK constraints are poorly supported across versions).
    status transitions: posted → void only; no edit, no delete.
    """

    __tablename__ = "journal_entries"
    __table_args__ = (
        UniqueConstraint("organizationId", "jeNumber", name="uq_org_je_number"),
    )

    jeId = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organizationId = Column(String(36), nullable=False, index=True)
    companyCode = Column(String(10), nullable=False)
    jeNumber = Column(String(40), nullable=False, index=True)
    jeDate = Column(Date, nullable=False)
    periodId = Column(
        String(36),
        ForeignKey("fiscal_periods.periodId", ondelete="RESTRICT"),
        nullable=False,
    )
    sourceEventType = Column(String(60), nullable=False)
    sourceEventId = Column(String(36), nullable=False, index=True)
    sourceDocId = Column(String(36), nullable=True)
    sourceDocNumber = Column(String(40), nullable=True)
    description = Column(String(500), nullable=True)
    totalDebit = Column(Numeric(15, 2), nullable=False)
    totalCredit = Column(Numeric(15, 2), nullable=False)
    # Reason: values_callable forces SQLAlchemy to use enum VALUES ('posted', 'void')
    # not names ('POSTED', 'VOID') to match the MySQL ENUM column definition.
    status = Column(
        Enum(JEStatusEnum, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=JEStatusEnum.POSTED,
        server_default="posted",
    )
    voidedAt = Column(DateTime, nullable=True)
    voidedBy = Column(String(36), nullable=True)
    voidReason = Column(String(500), nullable=True)
    postedAt = Column(DateTime, nullable=False)
    postedBy = Column(String(36), nullable=False)
    createdAt = Column(DateTime, nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    lines = relationship(
        "JournalEntryLine",
        back_populates="journal_entry",
        cascade="all, delete-orphan",
        order_by="JournalEntryLine.lineNumber",
    )
    period = relationship("FiscalPeriod")


class JournalEntryLine(Base):
    """
    Journal Entry line (DR or CR leg).

    Exactly one of debit/credit must be > 0 per line — enforced in Pydantic
    validators and the posting handler, not at DB level (the XOR constraint
    cannot be expressed cleanly as a MySQL CHECK without version-specific syntax).

    referenceLineId is a free-form link back to an operational line (e.g. PO line
    UUID) for traceability; no FK enforced since it references a Mongo document.
    """

    __tablename__ = "journal_entry_lines"
    __table_args__ = (
        UniqueConstraint("jeId", "lineNumber", name="uq_je_line_number"),
    )

    jeLineId = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    jeId = Column(
        String(36),
        ForeignKey("journal_entries.jeId", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    lineNumber = Column(Integer, nullable=False)
    accountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    debit = Column(Numeric(15, 2), nullable=True)
    credit = Column(Numeric(15, 2), nullable=True)
    description = Column(String(500), nullable=True)
    # Reason: cost_centers has a composite PK (organizationId, costCenterId) so
    # MySQL cannot enforce a FK referencing costCenterId alone.  Stored as a soft
    # reference; application layer enforces validity if needed.
    costCenterId = Column(String(36), nullable=True)
    # Reason: referenceLineId links to an operational doc line in MongoDB — no FK.
    referenceLineId = Column(String(36), nullable=True)
    createdAt = Column(DateTime, nullable=False, server_default=func.now())

    # Relationships
    journal_entry = relationship("JournalEntry", back_populates="lines")
    account = relationship("GLAccount")


class CompanyPostingSetup(Base):
    """
    Company Posting Setup configuration.

    One row per (organizationId, companyCode). Holds the default GL account
    assignments used by Phase B+ posting handlers when building journal entries.

    Required fields for isComplete=True (enforced at application layer):
      - apControlAccountId  (Trade Payables control)
      - bankAccountId       (Operating bank account)
      - grIrClearingAccountId (GR/IR holding account)
      - inputVatAccountId   (Reclaimable VAT)
      - retainedEarningsAccountId (Period close)

    Optional in v1 (consumed by later phases):
      - arControlAccountId, cashAccountId, outputVatAccountId,
        purchasePriceVarianceAccountId, roundingAccountId,
        vendorAdvanceAccountId (T-910 — DR leg of ap_down_payment_posted).

    isComplete is computed and stored by the PUT handler based on required fields.
    """

    __tablename__ = "company_posting_setup"
    __table_args__ = (
        UniqueConstraint(
            "organizationId", "companyCode", name="uq_posting_setup_org_company"
        ),
    )

    setupId = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organizationId = Column(String(36), nullable=False)
    companyCode = Column(String(10), nullable=False)

    apControlAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    arControlAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    vendorAdvanceAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    """Vendor Advance / prepaid-asset account for the DR leg of
    ap_down_payment_posted JEs (T-910). Added in migration 021."""
    bankAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    cashAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    grIrClearingAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    inputVatAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    outputVatAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    retainedEarningsAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    purchasePriceVarianceAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    roundingAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="SET NULL"),
        nullable=True,
    )
    # Item 11: IAS 2 requires the same cost formula across inventories of similar nature.
    # Company-level defaultValuationMethod is the authoritative source of truth from v1.
    # The per-item valuationMethod on PurchaseItemFinanceExt is DEPRECATED — it is
    # "informational, derived from company setting at posting time" and will be removed in v2.
    # Reason: Enum values must use values_callable to emit MySQL-compatible lowercase strings
    # matching the ENUM column created by migration 010.
    defaultValuationMethod = Column(
        Enum(ValuationMethodEnum, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=ValuationMethodEnum.MOVING_AVERAGE,
        server_default="MovingAverage",
    )

    isComplete = Column(Boolean, nullable=False, default=False, server_default="0")
    updatedBy = Column(String(36), nullable=True)
    createdAt = Column(DateTime, nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


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


# ---------------------------------------------------------------------------
# Phase D — Vendor Payment models
# ---------------------------------------------------------------------------


class PaymentMethodEnum(str, enum.Enum):
    """Payment method for vendor payments."""

    BANK_TRANSFER = "bank_transfer"
    CHEQUE = "cheque"
    CASH = "cash"


class ApPayment(Base):
    """
    Vendor Payment header.

    Finance-internal action: a finance user picks one or more open AP invoices
    and records the bank outflow.  The posting handler creates the JE atomically
    in the same request (DR AP Control / CR Bank).

    Payment records are one-shot: no edit, no delete in v1.  To correct an
    error the finance user reverses the associated JE via the existing reversal
    endpoint (POST /journal-entries/{jeId}/reverse).

    paymentNumber format: PAY-{companyCode}-{YYYY}-{NNNN}
    """

    __tablename__ = "ap_payments"
    __table_args__ = (
        UniqueConstraint("organizationId", "paymentNumber", name="uq_org_payment_number"),
    )

    paymentId = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organizationId = Column(String(36), nullable=False, index=True)
    companyCode = Column(String(10), nullable=False, index=True)
    paymentNumber = Column(String(40), nullable=False, index=True)
    paymentDate = Column(Date, nullable=False)
    periodId = Column(
        String(36),
        ForeignKey("fiscal_periods.periodId", ondelete="RESTRICT"),
        nullable=False,
    )
    vendorId = Column(String(36), nullable=False, index=True)
    vendorCode = Column(String(20), nullable=True)
    bankAccountId = Column(
        String(36),
        ForeignKey("gl_accounts.accountId", ondelete="RESTRICT"),
        nullable=False,
    )
    # Reason: values_callable forces SQLAlchemy to use enum VALUES
    # ('bank_transfer', 'cheque', 'cash') not names, matching the MySQL ENUM
    # column definition created by migration 011.
    paymentMethod = Column(
        Enum(PaymentMethodEnum, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=PaymentMethodEnum.BANK_TRANSFER,
        server_default="bank_transfer",
    )
    referenceNumber = Column(String(50), nullable=True)
    currencyCode = Column(String(3), nullable=False, default="AED")
    totalAmount = Column(Numeric(15, 2), nullable=False)
    notes = Column(String(500), nullable=True)
    # Reason: jeId is null at INSERT time; updated after the JE row is created
    # within the same transaction.  The FK ensures the JE exists before commit.
    jeId = Column(
        String(36),
        ForeignKey("journal_entries.jeId", ondelete="RESTRICT"),
        nullable=True,
    )
    createdBy = Column(String(36), nullable=False)
    createdAt = Column(DateTime, nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    applications = relationship(
        "ApPaymentApplication",
        back_populates="payment",
        cascade="all, delete-orphan",
        order_by="ApPaymentApplication.createdAt",
    )
    journal_entry = relationship("JournalEntry")


class ApPaymentApplication(Base):
    """
    AP Payment Application — junction between a payment and an AP invoice.

    Each row represents how much of a payment was applied against a specific
    AP invoice document.  The apInvoiceDocId references the operation-side
    MongoDB document (no FK enforced — cross-store reference).

    UNIQUE on (paymentId, apInvoiceDocId) prevents the same invoice being
    applied twice on the same payment.
    """

    __tablename__ = "ap_payment_applications"
    __table_args__ = (
        UniqueConstraint("paymentId", "apInvoiceDocId", name="uq_payment_application"),
    )

    applicationId = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    paymentId = Column(
        String(36),
        ForeignKey("ap_payments.paymentId", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # Reason: cross-store reference to the operation MongoDB document — no FK.
    apInvoiceDocId = Column(String(36), nullable=False, index=True)
    apInvoiceDocNumber = Column(String(40), nullable=True)
    amountApplied = Column(Numeric(15, 2), nullable=False)
    createdAt = Column(DateTime, nullable=False, server_default=func.now())

    # Relationships
    payment = relationship("ApPayment", back_populates="applications")
