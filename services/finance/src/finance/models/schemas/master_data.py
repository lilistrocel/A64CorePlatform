"""
Finance Service — Master Data Extension Schemas

Pydantic models for vendor_finance_ext, purchase_item_finance_ext,
and approval_rules endpoints.
"""

from decimal import Decimal
from typing import Literal, Optional
from datetime import datetime

from pydantic import BaseModel, Field


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


class PurchaseItemFinanceExtResponse(PurchaseItemFinanceExtBase):
    """Response model for purchase item finance extension."""

    extId: str
    organizationId: str
    itemId: str
    itemCode: str
    isActive: bool
    createdAt: datetime
    updatedAt: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True


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
