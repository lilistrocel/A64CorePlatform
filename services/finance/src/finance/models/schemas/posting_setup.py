"""Pydantic schemas for Company Posting Setup.

CompanyPostingSetupUpdate — PUT body (all account FK fields are Optional[str]).
CompanyPostingSetupResponse — response shape (includes isComplete).

updatedBy is injected from the JWT userId in the endpoint handler; it must
NOT be supplied by the client in the request body.

Item 11 (2026-05-20): defaultValuationMethod added.  IAS 2 requires a consistent
cost formula per company.  The per-item valuationMethod on purchase items is
deprecated; consumption logic should read from this setup, not the item.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from ..orm.models import ValuationMethodEnum


class CompanyPostingSetupUpdate(BaseModel):
    """
    Request body for PUT /companies/{company_code}/posting-setup.

    All account FK fields are optional — the caller only needs to supply the
    accounts they want to set (or clear by passing null).  updatedBy is set
    server-side from the JWT; clients must not include it.

    defaultValuationMethod: IAS 2 company-level cost formula.  Defaults to
    MovingAverage if not supplied; existing rows retain their stored value on
    partial updates.
    """

    apControlAccountId: Optional[str] = Field(None, max_length=36)
    arControlAccountId: Optional[str] = Field(None, max_length=36)
    bankAccountId: Optional[str] = Field(None, max_length=36)
    cashAccountId: Optional[str] = Field(None, max_length=36)
    grIrClearingAccountId: Optional[str] = Field(None, max_length=36)
    inputVatAccountId: Optional[str] = Field(None, max_length=36)
    outputVatAccountId: Optional[str] = Field(None, max_length=36)
    retainedEarningsAccountId: Optional[str] = Field(None, max_length=36)
    purchasePriceVarianceAccountId: Optional[str] = Field(None, max_length=36)
    roundingAccountId: Optional[str] = Field(None, max_length=36)
    # Item 11: company-level valuation method — authoritative source of truth per IAS 2.
    defaultValuationMethod: Optional[ValuationMethodEnum] = Field(
        None,
        description=(
            "IAS 2 cost formula applied to all inventories for this company. "
            "When omitted on first PUT, defaults to MovingAverage (server default). "
            "Per-item valuationMethod on purchase items is deprecated."
        ),
    )


class CompanyPostingSetupResponse(BaseModel):
    """Response representation of a company posting setup row."""

    setupId: str
    organizationId: str
    companyCode: str
    apControlAccountId: Optional[str]
    arControlAccountId: Optional[str]
    bankAccountId: Optional[str]
    cashAccountId: Optional[str]
    grIrClearingAccountId: Optional[str]
    inputVatAccountId: Optional[str]
    outputVatAccountId: Optional[str]
    retainedEarningsAccountId: Optional[str]
    purchasePriceVarianceAccountId: Optional[str]
    roundingAccountId: Optional[str]
    # Item 11: company-level valuation method — included in all responses.
    defaultValuationMethod: ValuationMethodEnum
    isComplete: bool
    updatedBy: Optional[str]
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}
