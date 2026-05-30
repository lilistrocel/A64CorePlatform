"""
Finance Service — Master Data Extension Schemas

Pydantic models for vendor_finance_ext, purchase_item_finance_ext,
and approval_rules endpoints.
"""

from decimal import Decimal
from typing import Literal, Optional
from datetime import datetime

import enum as _enum

from pydantic import BaseModel, ConfigDict, Field, model_validator

# Reason: mirrors the operational Literal and the ORM PurchaseItemTypeEnum so
# the API surface uses the same string values as the event payload.
PurchaseItemTypeLiteral = Literal[
    "raw_material",
    "consumable",
    "service",
    "fixed_asset_acquisition",
]


# ---------------------------------------------------------------------------
# VendorFinanceExt schemas
# ---------------------------------------------------------------------------


class VendorFinanceExtBase(BaseModel):
    """Shared fields for vendor finance extension."""

    reconciliationAccountId: Optional[str] = Field(
        None, description="GL account ID for AP reconciliation (221000-001)"
    )
    defaultExpenseAccountId: Optional[str] = Field(
        None, description="Default expense GL account for this vendor"
    )
    creditTermsOverride: Optional[str] = Field(
        None, max_length=20, description="Override ops payment terms code"
    )
    notes: Optional[str] = None


class VendorFinanceExtUpsert(VendorFinanceExtBase):
    """
    Request model for creating or updating a vendor finance extension.

    All fields optional — only supplied fields are updated on an upsert.
    """

    pass


class VendorFinanceExtResponse(VendorFinanceExtBase):
    """Response model for vendor finance extension."""

    extId: str
    organizationId: str
    vendorId: str
    vendorCode: str
    isActive: bool
    createdAt: datetime
    updatedAt: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True


# ---------------------------------------------------------------------------
# PurchaseItemFinanceExt schemas
# ---------------------------------------------------------------------------


class PurchaseItemFinanceExtBase(BaseModel):
    """Shared fields for purchase item finance extension."""

    inventoryAccountId: Optional[str] = None
    cogsAccountId: Optional[str] = None
    allocationAccountId: Optional[str] = Field(
        None, description="GRNI clearing account"
    )
    valuationMethod: Optional[Literal["MovingAverage", "Standard", "FIFO"]] = Field(
        None, description="Inventory valuation method"
    )
    taxCodeDefault: Optional[str] = Field(None, max_length=5)
    ifrsTag: Optional[str] = Field(None, max_length=10)
    notes: Optional[str] = None


class PurchaseItemFinanceExtUpsert(PurchaseItemFinanceExtBase):
    """
    Request model for creating or updating a purchase item finance extension.
    """

    pass


class PurchaseItemFinanceExtUpdate(BaseModel):
    """
    Request body for PATCH /master-data/purchase-items/{item_id}.

    All fields are entirely optional — omit a field to leave it unchanged.
    Account ID fields are validated against gl_accounts (active leaf only)
    in the endpoint handler.

    Pass null explicitly to clear an account assignment.

    Reason: we use a sentinel default (_UNSET) to distinguish "field was not
    provided in the request body" (keep current value) from "field was provided
    as null" (clear the value).  Pydantic's model_fields_set tracks which fields
    were actually present in the JSON body; the endpoint handler iterates only
    those fields.
    """

    inventoryAccountId: Optional[str] = Field(
        default=None,
        description=(
            "GL account for inventory posting. Must be an active leaf account "
            "in the same organisation. Omit to leave unchanged; pass null to clear."
        ),
    )
    cogsAccountId: Optional[str] = Field(
        default=None,
        description=(
            "GL account for cost-of-goods-sold. "
            "Omit to leave unchanged; pass null to clear."
        ),
    )
    allocationAccountId: Optional[str] = Field(
        default=None,
        description="GRNI clearing account. Omit to leave unchanged; pass null to clear.",
    )
    valuationMethod: Optional[Literal["MovingAverage", "Standard", "FIFO"]] = Field(
        default=None,
        description="Inventory valuation method. Omit to leave unchanged.",
    )
    taxCodeDefault: Optional[str] = Field(default=None, max_length=5)
    ifrsTag: Optional[str] = Field(default=None, max_length=10)
    notes: Optional[str] = Field(default=None)


class PurchaseItemFinanceExtResponse(BaseModel):
    """Response model for purchase item finance extension."""

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def _coerce_enums_to_values(cls, data: object) -> object:
        """
        Convert SQLAlchemy enum instances to their string values.

        Reason: Pydantic V2 Literal validators reject enum instances even when
        the enum extends str.  When model_validate is called with from_attributes=True,
        the ORM attribute value is the enum instance (e.g. ValuationMethodEnum.MOVING_AVERAGE),
        not its string value.  This validator converts all enum fields to their .value
        before Pydantic checks them against the Literal constraints.
        """
        if not isinstance(data, dict):
            # ORM object — build a plain dict from attributes
            data = {
                key: (v.value if isinstance(v, _enum.Enum) else v)
                for key, v in vars(data).items()
                if not key.startswith("_")
            }
        else:
            data = {
                key: (v.value if isinstance(v, _enum.Enum) else v)
                for key, v in data.items()
            }
        return data

    extId: str
    organizationId: str
    itemId: str
    itemCode: str
    # Reason: denormalized from operational item; nullable for rows that
    # pre-date migration 009.
    itemName: Optional[str] = None
    itemType: Optional[PurchaseItemTypeLiteral] = None
    isActive: bool
    createdAt: datetime
    updatedAt: datetime
    # Finance GL mapping fields (from PurchaseItemFinanceExtBase)
    inventoryAccountId: Optional[str] = None
    cogsAccountId: Optional[str] = None
    allocationAccountId: Optional[str] = Field(
        None, description="GRNI clearing account"
    )
    valuationMethod: Optional[Literal["MovingAverage", "Standard", "FIFO"]] = Field(
        None, description="Inventory valuation method"
    )
    taxCodeDefault: Optional[str] = Field(None, max_length=5)
    ifrsTag: Optional[str] = Field(None, max_length=10)
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# ApprovalRule schemas
# ---------------------------------------------------------------------------


class ApprovalRuleCreate(BaseModel):
    """Request model for creating an approval rule."""

    organizationId: str
    companyCode: str = Field(..., max_length=10)
    docType: Literal[
        "PR", "PO", "GRPO", "AP_INVOICE", "OUTGOING_PAYMENT", "AP_CREDIT_NOTE", "GOODS_ISSUE"
    ]
    thresholdAmount: Optional[Decimal] = Field(None, ge=0)
    approverRole: str = Field(..., max_length=50)
    alwaysRequired: bool = False
    priority: int = Field(default=100, ge=1)
    notes: Optional[str] = None


class ApprovalRuleUpdate(BaseModel):
    """Request model for partial approval rule update."""

    thresholdAmount: Optional[Decimal] = Field(None, ge=0)
    approverRole: Optional[str] = Field(None, max_length=50)
    alwaysRequired: Optional[bool] = None
    priority: Optional[int] = Field(None, ge=1)
    isActive: Optional[bool] = None
    notes: Optional[str] = None


class ApprovalRuleResponse(BaseModel):
    """Response model for approval rule."""

    ruleId: str
    organizationId: str
    companyCode: str
    docType: str
    thresholdAmount: Optional[Decimal] = None
    approverRole: str
    alwaysRequired: bool
    priority: int
    isActive: bool
    notes: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True


class ApprovalRuleResolveResponse(BaseModel):
    """
    Response for the /approval-rules/resolve endpoint.

    Returns whether approval is required and which rule matched.
    """

    requiresApproval: bool
    matchedRule: Optional[ApprovalRuleResponse] = None
    reason: str


# ---------------------------------------------------------------------------
# CustomerFinanceExt schemas  (Wave 3 / T-100.2)
# ---------------------------------------------------------------------------


class CustomerFinanceExtCreate(BaseModel):
    """
    Request model for creating a customer finance extension (POST).

    organizationId and customerId are required — they form the unique key.
    All finance fields are optional; omit to leave unset.

    Args:
        organizationId: Org scope (multi-tenant).
        customerId: UUID string from the ops MongoDB customers collection.
        arControlAccountId: GL account UUID for AR control override. Must
            reference an active leaf ASSETS/asset account. Null falls back
            to CompanyPostingSetup.arControlAccountId.
        paymentTermsId: Payment terms code string (e.g. "NET30").
        defaultTaxCode: Tax code string (e.g. "S", "Z", "E").
        creditLimit: Maximum credit; None means no limit enforced. Must be >= 0.
        creditLimitCurrency: ISO 4217 currency code (default "AED").
        bpRefDefault: Placeholder for customer PO numbering pattern.
        notes: Free-text annotation.
    """

    organizationId: str = Field(..., min_length=1)
    customerId: str = Field(..., min_length=1)
    arControlAccountId: Optional[str] = Field(
        None,
        description="GL account UUID for per-customer AR control override",
    )
    paymentTermsId: Optional[str] = Field(None, max_length=50)
    defaultTaxCode: Optional[str] = Field(None, max_length=10)
    creditLimit: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        description="None means no credit limit enforced",
    )
    creditLimitCurrency: str = Field(
        default="AED",
        min_length=3,
        max_length=3,
        description="ISO 4217 3-character currency code",
    )
    bpRefDefault: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=500)


class CustomerFinanceExtUpdate(BaseModel):
    """
    Request model for partially updating a customer finance extension (PATCH).

    All fields are optional. Omit a field to leave it unchanged.
    Pass null explicitly to clear an optional field.
    """

    arControlAccountId: Optional[str] = Field(
        default=None,
        description=(
            "GL account UUID for AR control override. Null clears the override, "
            "reverting to the company posting setup default."
        ),
    )
    paymentTermsId: Optional[str] = Field(default=None, max_length=50)
    defaultTaxCode: Optional[str] = Field(default=None, max_length=10)
    creditLimit: Optional[Decimal] = Field(
        default=None,
        ge=Decimal("0"),
        description="None means no credit limit enforced",
    )
    creditLimitCurrency: Optional[str] = Field(
        default=None,
        min_length=3,
        max_length=3,
    )
    bpRefDefault: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=500)


class CustomerFinanceExtResponse(BaseModel):
    """Response model for customer finance extension."""

    model_config = ConfigDict(from_attributes=True)

    customer_finance_ext_id: str
    customerId: str
    organizationId: str
    arControlAccountId: Optional[str] = None
    paymentTermsId: Optional[str] = None
    defaultTaxCode: Optional[str] = None
    creditLimit: Optional[Decimal] = None
    creditLimitCurrency: str
    bpRefDefault: Optional[str] = None
    notes: Optional[str] = None
    createdBy: Optional[str] = None
    updatedBy: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime


# ---------------------------------------------------------------------------
# SaleItemFinanceExt schemas  (Wave 3 / T-100.3)
# ---------------------------------------------------------------------------


class SaleItemFinanceExtCreate(BaseModel):
    """
    Request model for creating a sale item finance extension (POST).

    organizationId and itemId are required — they form the unique key.
    All finance fields are optional; omit to leave unset.

    Args:
        organizationId: Org scope (multi-tenant).
        itemId: UUID string from the ops MongoDB items collection.
        itemCode: Denormalized item code (informational display only).
        itemName: Denormalized item name (informational display only).
        revenueAccountId: GL account UUID for revenue posting. Must
            reference an active non-header REVENUE/revenue account.
        cogsAccountId: GL account UUID for COGS posting (Delivery JE).
            Must reference an active non-header COST_OF_SALES/expense account.
        salesTaxCode: Output VAT tax code string (e.g. "S", "Z").
        isSellable: Whether this item is enabled for sale. Defaults True.
        notes: Free-text annotation.
    """

    organizationId: str = Field(..., min_length=1)
    itemId: str = Field(..., min_length=1)
    itemCode: Optional[str] = Field(None, max_length=20)
    itemName: Optional[str] = Field(None, max_length=200)
    revenueAccountId: Optional[str] = Field(
        None,
        description=(
            "GL account UUID for revenue posting. "
            "Must be drawer=REVENUE, accountType=revenue, non-header, active."
        ),
    )
    cogsAccountId: Optional[str] = Field(
        None,
        description=(
            "GL account UUID for cost-of-goods-sold (Delivery JE). "
            "Must be drawer=COST_OF_SALES, accountType=expense, non-header, active."
        ),
    )
    # Reason: stored as string code (no hard FK) — mirrors T-100.2 customer_finance_ext
    # defaultTaxCode deviation: tax_codes uses composite PK (organizationId, taxCode) and
    # cross-table validation is done at the application layer, not at DB level.
    salesTaxCode: Optional[str] = Field(None, max_length=10)
    isSellable: bool = Field(default=True)
    notes: Optional[str] = Field(None, max_length=500)


class SaleItemFinanceExtUpdate(BaseModel):
    """
    Request model for partially updating a sale item finance extension (PATCH).

    All fields are optional. Omit a field to leave it unchanged.
    Pass null explicitly to clear an optional field.
    """

    itemCode: Optional[str] = Field(default=None, max_length=20)
    itemName: Optional[str] = Field(default=None, max_length=200)
    revenueAccountId: Optional[str] = Field(
        default=None,
        description=(
            "GL account UUID for revenue. Null clears the assignment. "
            "Non-null value must be drawer=REVENUE, accountType=revenue, non-header, active."
        ),
    )
    cogsAccountId: Optional[str] = Field(
        default=None,
        description=(
            "GL account UUID for COGS (Delivery JE). Null clears the assignment. "
            "Non-null value must be drawer=COST_OF_SALES, accountType=expense, non-header, active."
        ),
    )
    salesTaxCode: Optional[str] = Field(default=None, max_length=10)
    isSellable: Optional[bool] = Field(default=None)
    notes: Optional[str] = Field(default=None, max_length=500)


class SaleItemFinanceExtResponse(BaseModel):
    """Response model for sale item finance extension."""

    model_config = ConfigDict(from_attributes=True)

    sale_item_finance_ext_id: str
    itemId: str
    organizationId: str
    itemCode: Optional[str] = None
    itemName: Optional[str] = None
    revenueAccountId: Optional[str] = None
    cogsAccountId: Optional[str] = None
    salesTaxCode: Optional[str] = None
    isSellable: bool
    notes: Optional[str] = None
    createdBy: Optional[str] = None
    updatedBy: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime
