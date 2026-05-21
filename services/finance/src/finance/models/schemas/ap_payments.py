"""
Pydantic schemas for the AP Payment module (Phase D).

Vendor payments are finance-internal actions: a finance user picks one or more
open AP invoices, records the bank outflow, and a JE is created atomically in
the same request (DR AP Control / CR Bank).

Payment records are one-shot.  To correct an error the finance user reverses
the linked JE via POST /journal-entries/{jeId}/reverse.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field

from ..orm.models import PaymentMethodEnum


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class ApPaymentApplicationRequest(BaseModel):
    """
    A single invoice application within a payment request.

    The frontend supplies the AP invoice details — it already has them from
    calling the operation-side AP invoice list.  Finance uses apDocId to
    de-duplicate and look up any prior payments.
    """

    apDocId: str = Field(..., description="UUID of the operation-side AP invoice document")
    apDocNumber: str = Field(..., description="Human-readable AP document number (denormalized)")
    amountApplied: Decimal = Field(
        ...,
        gt=0,
        description="Amount applied from this payment against this invoice (must be > 0)",
    )


class CreateApPaymentRequest(BaseModel):
    """
    Request body for POST /ap-payments.

    The bankAccountId in the request takes precedence over the posting setup
    default bank account.  This allows one-off payments from non-default bank
    accounts (e.g. a secondary account for a specific vendor).
    """

    organizationId: str
    companyCode: str
    paymentDate: date = Field(..., description="Date the money leaves the bank (ISO date)")
    vendorId: str
    vendorCode: Optional[str] = Field(None, description="Denormalized for display")
    bankAccountId: str = Field(
        ...,
        description=(
            "GL account to credit (the bank account money leaves from). "
            "Must be an active account in the same org."
        ),
    )
    paymentMethod: PaymentMethodEnum = Field(
        PaymentMethodEnum.BANK_TRANSFER,
        description="Payment method: bank_transfer, cheque, or cash",
    )
    referenceNumber: Optional[str] = Field(
        None,
        max_length=50,
        description="Cheque number, wire transfer reference, or other bank reference",
    )
    currencyCode: str = Field("AED", max_length=3)
    notes: Optional[str] = Field(None, max_length=500)
    applications: List[ApPaymentApplicationRequest] = Field(
        ...,
        min_length=1,
        description="At least one AP invoice application is required",
    )


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class ApPaymentApplicationResponse(BaseModel):
    """Response representation of a payment application row."""

    applicationId: str
    paymentId: str
    apInvoiceDocId: str
    apInvoiceDocNumber: Optional[str]
    amountApplied: Decimal
    createdAt: datetime

    model_config = {"from_attributes": True}


class JESummary(BaseModel):
    """
    Minimal journal entry summary embedded in payment responses.

    Full JE detail is available via GET /journal-entries/{jeId}.
    """

    jeId: str
    jeNumber: str
    jeDate: date
    totalDebit: Decimal
    totalCredit: Decimal
    status: str

    model_config = {"from_attributes": True}


class ApPaymentResponse(BaseModel):
    """
    Response for a vendor payment (list and create responses).

    applications is always included.  je is included when the jeId is set
    (i.e., after the transaction commits).
    """

    paymentId: str
    organizationId: str
    companyCode: str
    paymentNumber: str
    paymentDate: date
    periodId: str
    vendorId: str
    vendorCode: Optional[str]
    bankAccountId: str
    paymentMethod: PaymentMethodEnum
    referenceNumber: Optional[str]
    currencyCode: str
    totalAmount: Decimal
    notes: Optional[str]
    jeId: Optional[str]
    createdBy: str
    createdAt: datetime
    updatedAt: datetime
    applications: List[ApPaymentApplicationResponse] = []
    je: Optional[JESummary] = None

    model_config = {"from_attributes": True}


class ApPaymentDetailResponse(ApPaymentResponse):
    """
    Detailed payment response including JE summary.

    This is the same as ApPaymentResponse for now — the je field is populated
    at the endpoint level by loading the JE from the DB.  Kept as a separate
    type so the API contract can diverge from the list response in the future.
    """


# ---------------------------------------------------------------------------
# Open AP Invoice schemas (v1 frontend-join approach)
# ---------------------------------------------------------------------------


class ApDocTotalPaidItem(BaseModel):
    """
    Outstanding-amount lookup item — v1 frontend-join approach.

    The frontend already has the AP invoice list from the operation API.
    It sends us a list of apDocIds and we return how much has been paid
    against each one.  The frontend computes outstandingAmount = totalGross - totalPaid.

    This avoids service-to-service HTTP from finance to operation for v1.
    Document this simplification: in v2, the finance service can be enhanced
    to call the operation API directly for a richer open-AP-invoices endpoint.
    """

    apDocId: str
    totalPaid: Decimal


class GetApDocTotalsPaidRequest(BaseModel):
    """
    Request body for POST /ap-invoices/totals-paid.

    The frontend passes the list of AP doc IDs it wants to look up.
    """

    organizationId: str
    apDocIds: List[str] = Field(..., min_length=1, max_length=500)
