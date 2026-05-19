"""Pydantic schemas for customer finance extensions."""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class CustomerFinanceExtUpsert(BaseModel):
    """Request body for creating or updating a customer finance extension."""

    organizationId: str = Field(..., min_length=1)
    trn: Optional[str] = Field(None, max_length=50)
    paymentTerms: Optional[str] = Field(None, max_length=50)
    reconciliationAccountId: Optional[str] = None
    defaultRevenueAccountId: Optional[str] = None
    creditLimit: Optional[Decimal] = Field(None, ge=0)
    isBlocked: bool = False


class CustomerFinanceExtResponse(BaseModel):
    """Response representation of a customer finance extension."""

    customerId: str
    organizationId: str
    trn: Optional[str]
    paymentTerms: Optional[str]
    reconciliationAccountId: Optional[str]
    defaultRevenueAccountId: Optional[str]
    creditLimit: Optional[Decimal]
    isBlocked: bool
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}
