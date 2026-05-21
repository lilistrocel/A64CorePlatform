"""
AP Payments API — Phase D

Finance-internal vendor payment recording.  A finance user picks one or more
open AP invoices and records the bank outflow.  The JE (DR AP Control / CR Bank)
is created atomically in the same request.

No outbox event is emitted — payment is a finance-internal action.

Payment records are one-shot: no edit, no delete in v1.  To correct an error
the finance user must reverse the linked JE via:
  POST /api/v1/finance/journal-entries/{jeId}/reverse

Permissions:
  GET:  accountant, finance_admin, auditor, admin, super_admin
  POST: finance_admin, admin, super_admin
"""

import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Dict, Iterable, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...db.session import get_db
from ...middleware.auth import TokenPayload, require_roles
from ...models.orm.models import (
    AccountLevelEnum,
    ApPayment,
    ApPaymentApplication,
    CompanyPostingSetup,
    GLAccount,
    JEStatusEnum,
    JournalEntry,
    JournalEntryLine,
    PaymentMethodEnum,
)
from ...models.schemas.ap_payments import (
    ApDocTotalPaidItem,
    ApPaymentDetailResponse,
    ApPaymentResponse,
    CreateApPaymentRequest,
    GetApDocTotalsPaidRequest,
    JESummary,
)
from ...models.schemas.common import PaginatedResponse, SuccessResponse
from ...utils.responses import paginated, success
from .events import (
    _next_je_number,
    _next_payment_number,
    _resolve_fiscal_period_or_raise,
    _resolve_posting_setup_or_raise,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AP Payments"])

_READ_ROLES = ("accountant", "finance_admin", "auditor", "super_admin", "admin")
_WRITE_ROLES = ("finance_admin", "admin", "super_admin")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _validate_bank_account(
    db: AsyncSession,
    organization_id: str,
    bank_account_id: str,
) -> None:
    """
    Validate that bankAccountId is an active, active-level GL account in the org.

    Args:
        db: Active SQLAlchemy async session.
        organization_id: Org scope to prevent cross-org access.
        bank_account_id: UUID of the GL account to validate.

    Raises:
        HTTPException 400: If the account does not exist or is not active/postable.
    """
    result = await db.execute(
        select(GLAccount).where(
            GLAccount.accountId == bank_account_id,
            GLAccount.organizationId == organization_id,
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bank account '{bank_account_id}' not found in organization.",
        )
    if not account.isActive:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Bank account '{bank_account_id}' ({account.accountNumber} "
                f"{account.accountName}) is inactive. Activate it before use."
            ),
        )
    if account.accountLevel != AccountLevelEnum.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Bank account '{bank_account_id}' ({account.accountNumber} "
                f"{account.accountName}) is a header/title account and cannot "
                "be posted to directly. Select a leaf-level (active) account."
            ),
        )


async def _check_no_overpayment(
    db: AsyncSession,
    organization_id: str,
    ap_doc_id: str,
    amount_applied: Decimal,
    ap_doc_number: Optional[str],
    total_gross_hint: Optional[Decimal] = None,
) -> None:
    """
    Guard against re-applying an already-fully-paid invoice.

    For v1, the frontend passes the invoice totalGross as a hint (via the
    CreateApPaymentRequest); without a cross-service call to the operation API,
    the finance service cannot independently verify the totalGross.

    What we CAN enforce server-side: if totalPaid (from existing applications)
    already equals or exceeds total_gross_hint, reject the application.  If no
    hint is provided, we skip the totalGross check and only block duplicate
    apDocIds within the same payment (handled by the UNIQUE constraint).

    Args:
        db: Active SQLAlchemy async session.
        organization_id: Org scope (not currently used in query but kept for
            future cross-org enforcement).
        ap_doc_id: The operation AP document ID to check.
        amount_applied: Amount being applied now.
        ap_doc_number: Human-readable doc number for error messages.
        total_gross_hint: Total invoice amount (optional) — if provided, triggers
            overpayment guard.
    """
    # Compute total already paid against this apDocId across all payments.
    result = await db.execute(
        select(func.coalesce(func.sum(ApPaymentApplication.amountApplied), Decimal("0")))
        .where(ApPaymentApplication.apInvoiceDocId == ap_doc_id)
    )
    total_already_paid: Decimal = result.scalar_one() or Decimal("0")

    if total_gross_hint is not None:
        total_after = total_already_paid + amount_applied
        if total_after > total_gross_hint:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Overpayment: AP invoice {ap_doc_number or ap_doc_id} "
                    f"has totalGross={total_gross_hint}, already paid={total_already_paid}, "
                    f"this payment would bring total to {total_after}. "
                    "Reduce amountApplied."
                ),
            )


async def _fetch_payment_reversal_map(
    db: AsyncSession,
    organization_id: str,
    je_numbers: Iterable[str],
) -> Dict[str, str]:
    """
    Batch-fetch reversal JE numbers for the supplied original JE numbers in
    one round trip. Returns { originalJeNumber: reversalJeNumber }; originals
    with no reversal are absent from the map.
    """
    numbers = [n for n in je_numbers if n]
    if not numbers:
        return {}
    rows = await db.execute(
        select(JournalEntry.sourceDocNumber, JournalEntry.jeNumber).where(
            JournalEntry.organizationId == organization_id,
            JournalEntry.sourceEventType == "je_reversal",
            JournalEntry.sourceDocNumber.in_(numbers),
        )
    )
    return {orig: rev for orig, rev in rows.all() if orig}


def _build_payment_response(
    payment: ApPayment,
    reversal_map: Optional[Dict[str, str]] = None,
) -> ApPaymentResponse:
    """
    Build an ApPaymentResponse from an ORM ApPayment instance.

    Args:
        payment: Loaded ApPayment ORM instance (applications relationship loaded).
        reversal_map: Optional { originalJeNumber: reversalJeNumber } map for
            flagging payments whose linked JE has been reversed. Pass {} (or
            omit) when reversal status is irrelevant (e.g. immediately after
            create — a brand new payment has no reversal yet).

    Returns:
        ApPaymentResponse Pydantic model.
    """
    je_summary: Optional[JESummary] = None
    if payment.journal_entry is not None:
        je_summary = JESummary(
            jeId=payment.journal_entry.jeId,
            jeNumber=payment.journal_entry.jeNumber,
            jeDate=payment.journal_entry.jeDate,
            totalDebit=Decimal(str(payment.journal_entry.totalDebit)),
            totalCredit=Decimal(str(payment.journal_entry.totalCredit)),
            status=payment.journal_entry.status.value,
            reversedByJeNumber=(reversal_map or {}).get(
                payment.journal_entry.jeNumber
            ),
        )
    return ApPaymentResponse(
        paymentId=payment.paymentId,
        organizationId=payment.organizationId,
        companyCode=payment.companyCode,
        paymentNumber=payment.paymentNumber,
        paymentDate=payment.paymentDate,
        periodId=payment.periodId,
        vendorId=payment.vendorId,
        vendorCode=payment.vendorCode,
        bankAccountId=payment.bankAccountId,
        paymentMethod=payment.paymentMethod,
        referenceNumber=payment.referenceNumber,
        currencyCode=payment.currencyCode,
        totalAmount=Decimal(str(payment.totalAmount)),
        notes=payment.notes,
        jeId=payment.jeId,
        createdBy=payment.createdBy,
        createdAt=payment.createdAt,
        updatedAt=payment.updatedAt,
        applications=[
            ApPaymentResponse.model_fields["applications"].annotation.__args__[0](
                applicationId=a.applicationId,
                paymentId=a.paymentId,
                apInvoiceDocId=a.apInvoiceDocId,
                apInvoiceDocNumber=a.apInvoiceDocNumber,
                amountApplied=Decimal(str(a.amountApplied)),
                createdAt=a.createdAt,
            )
            for a in (payment.applications or [])
        ],
        je=je_summary,
    )


# ---------------------------------------------------------------------------
# Open AP invoice totals (v1 frontend-join approach)
# ---------------------------------------------------------------------------


@router.post(
    "/ap-invoices/totals-paid",
    response_model=SuccessResponse[List[ApDocTotalPaidItem]],
    status_code=status.HTTP_200_OK,
    summary="Get total paid amounts for a list of AP invoice document IDs",
    description=(
        "V1 frontend-join approach: the frontend already has the AP invoice list "
        "from the operation API.  This endpoint returns how much has been applied "
        "(paid) against each supplied apDocId from the local ap_payment_applications "
        "table.  The frontend computes outstandingAmount = totalGross - totalPaid.\n\n"
        "V1 simplification note: this avoids a service-to-service HTTP call from "
        "finance → operation.  In v2 this can be replaced by a richer open-AP-invoices "
        "endpoint that calls the operation API directly."
    ),
)
async def get_ap_doc_totals_paid(
    body: GetApDocTotalsPaidRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[List[ApDocTotalPaidItem]]:
    """
    Return the sum of amountApplied per apDocId from ap_payment_applications.

    Args:
        body: Request body with organizationId and list of apDocIds to look up.
        db: Async DB session.
        _current_user: Authenticated user (read roles).

    Returns:
        List of (apDocId, totalPaid) items.  DocIds with no payments return 0.
    """
    # Reason: query aggregation for all requested docIds in one round trip.
    result = await db.execute(
        select(
            ApPaymentApplication.apInvoiceDocId,
            func.coalesce(func.sum(ApPaymentApplication.amountApplied), Decimal("0")).label(
                "total_paid"
            ),
        )
        .where(ApPaymentApplication.apInvoiceDocId.in_(body.apDocIds))
        .group_by(ApPaymentApplication.apInvoiceDocId)
    )
    rows = result.all()

    # Build lookup dict from DB results
    paid_map = {row.apInvoiceDocId: Decimal(str(row.total_paid)) for row in rows}

    # Return an entry for every requested docId — zero if no payments found
    items = [
        ApDocTotalPaidItem(
            apDocId=doc_id,
            totalPaid=paid_map.get(doc_id, Decimal("0")),
        )
        for doc_id in body.apDocIds
    ]
    return success(items)


# ---------------------------------------------------------------------------
# Record a vendor payment
# ---------------------------------------------------------------------------


@router.post(
    "/ap-payments",
    response_model=SuccessResponse[ApPaymentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Record a vendor payment",
    description=(
        "Finance-internal action: creates a payment record, application rows, "
        "and the JE (DR AP Control / CR Bank) atomically in one transaction.\n\n"
        "Payment records are one-shot — no edit or delete.  To correct an error, "
        "reverse the linked JE via POST /journal-entries/{jeId}/reverse."
    ),
)
async def create_ap_payment(
    body: CreateApPaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[ApPaymentResponse]:
    """
    Record a vendor payment and create the corresponding JE atomically.

    Steps (all inside one transaction):
    1. Validate posting setup (apControlAccountId required).
    2. Validate fiscal period is open for paymentDate.
    3. Validate each application's apDocId for overpayment (if hint provided).
    4. Validate bankAccountId is an active postable GL account in the org.
    5. Generate paymentNumber (PAY-{companyCode}-{YYYY}-{NNNN}).
    6. Insert ap_payments row.
    7. Insert ap_payment_applications rows.
    8. Generate JE number + insert journal_entry + journal_entry_lines.
    9. Update ap_payments.jeId with the new JE ID.
    10. Return full ApPaymentResponse.

    Args:
        body: Payment creation request.
        db: Async DB session.
        current_user: Authenticated user (write roles).

    Returns:
        Created payment with embedded JE summary.

    Raises:
        HTTPException 400: Validation failures (no retry logic needed — client must fix).
        HTTPException 403: Role gate violation (handled by require_roles).
    """
    org_id = body.organizationId
    company_code = body.companyCode
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

    # ------------------------------------------------------------------
    # 1. Validate posting setup — apControlAccountId is mandatory
    # ------------------------------------------------------------------
    setup = await _resolve_posting_setup_or_raise(db, org_id, company_code)

    if not setup.apControlAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"AP Control account (apControlAccountId) not configured in posting setup "
                f"for company {company_code}. Configure via the Posting Setup page."
            ),
        )

    # ------------------------------------------------------------------
    # 2. Validate fiscal period is open for paymentDate
    # ------------------------------------------------------------------
    period_id = await _resolve_fiscal_period_or_raise(db, company_code, body.paymentDate)

    # ------------------------------------------------------------------
    # 3. Validate bank account
    # ------------------------------------------------------------------
    await _validate_bank_account(db, org_id, body.bankAccountId)

    # ------------------------------------------------------------------
    # 4. Validate applications — overpayment check
    #    (The frontend should pre-filter, but we enforce server-side.)
    # ------------------------------------------------------------------
    total_amount = sum(Decimal(str(app.amountApplied)) for app in body.applications)

    for app in body.applications:
        # Reason: the frontend now passes totalGross per application
        # (denormalized from the AP invoice it already has loaded). The
        # finance service does not call the operation API to fetch it.
        # When the hint is present, _check_no_overpayment enforces:
        #   sum(existing applications for this apDocId) + amountApplied
        #     must not exceed totalGross.
        # Without the hint, only the per-payment duplicate-apDocId UNIQUE
        # constraint fires — which is what allowed the live over-payment
        # bug across two separate payment records.
        await _check_no_overpayment(
            db=db,
            organization_id=org_id,
            ap_doc_id=app.apDocId,
            amount_applied=Decimal(str(app.amountApplied)),
            ap_doc_number=app.apDocNumber,
            total_gross_hint=(
                Decimal(str(app.totalGross)) if app.totalGross is not None else None
            ),
        )

    # ------------------------------------------------------------------
    # 5. Generate sequential payment number
    # ------------------------------------------------------------------
    payment_number = await _next_payment_number(db, company_code, body.paymentDate.year)

    # ------------------------------------------------------------------
    # 6. Insert ap_payments row (jeId null at this point)
    # ------------------------------------------------------------------
    payment_id = str(uuid.uuid4())
    payment = ApPayment(
        paymentId=payment_id,
        organizationId=org_id,
        companyCode=company_code,
        paymentNumber=payment_number,
        paymentDate=body.paymentDate,
        periodId=period_id,
        vendorId=body.vendorId,
        vendorCode=body.vendorCode,
        bankAccountId=body.bankAccountId,
        paymentMethod=body.paymentMethod,
        referenceNumber=body.referenceNumber,
        currencyCode=body.currencyCode,
        totalAmount=total_amount,
        notes=body.notes,
        jeId=None,  # Will be updated after JE insert
        createdBy=current_user.userId,
    )
    db.add(payment)

    # ------------------------------------------------------------------
    # 7. Insert ap_payment_applications rows
    # ------------------------------------------------------------------
    for app in body.applications:
        application = ApPaymentApplication(
            applicationId=str(uuid.uuid4()),
            paymentId=payment_id,
            apInvoiceDocId=app.apDocId,
            apInvoiceDocNumber=app.apDocNumber,
            amountApplied=Decimal(str(app.amountApplied)),
        )
        db.add(application)

    # Flush so UNIQUE constraint violations on applications surface here
    # (before we generate the JE number, which increments the counter).
    await db.flush()

    # ------------------------------------------------------------------
    # 8. Generate JE number and build the journal entry
    # ------------------------------------------------------------------
    je_number = await _next_je_number(db, company_code, body.paymentDate.year)
    je_id = str(uuid.uuid4())

    ref_label = body.referenceNumber or "n/a"
    vendor_label = body.vendorCode or body.vendorId
    je_description = (
        f"Vendor payment {payment_number} to {vendor_label}, ref {ref_label}"
    )

    je = JournalEntry(
        jeId=je_id,
        organizationId=org_id,
        companyCode=company_code,
        jeNumber=je_number,
        jeDate=body.paymentDate,
        periodId=period_id,
        # Reason: vendor_payment is a finance-internal action; no outbox event ID.
        # Using payment_id in sourceEventId satisfies the NOT NULL constraint and
        # provides a direct trace back to the payment record.
        sourceEventType="vendor_payment",
        sourceEventId=payment_id,
        sourceDocId=payment_id,
        sourceDocNumber=payment_number,
        description=je_description,
        totalDebit=total_amount,
        totalCredit=total_amount,
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy=current_user.userId,
    )
    db.add(je)

    # ------------------------------------------------------------------
    # JE Line 1: DR AP Control — vendor liability cleared
    # referenceLineId = vendorId (sub-ledger hook)
    # ------------------------------------------------------------------
    db.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()),
        jeId=je_id,
        lineNumber=1,
        accountId=setup.apControlAccountId,
        debit=total_amount,
        credit=None,
        description=f"AP clearance — {vendor_label}",
        referenceLineId=body.vendorId,
    ))

    # ------------------------------------------------------------------
    # JE Line 2: CR Bank — cash leaves
    # ------------------------------------------------------------------
    db.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()),
        jeId=je_id,
        lineNumber=2,
        accountId=body.bankAccountId,
        debit=None,
        credit=total_amount,
        description=f"Payment via {body.paymentMethod.value}",
    ))

    # Flush JE rows so FK between ap_payments.jeId and journal_entries is satisfied
    await db.flush()

    # ------------------------------------------------------------------
    # 9. Update payment row with the new jeId
    # ------------------------------------------------------------------
    payment.jeId = je_id
    await db.flush()

    logger.info(
        "[Finance/Payment] recorded payment paymentId=%s paymentNumber=%s "
        "vendor=%s totalAmount=%s jeNumber=%s jeId=%s",
        payment_id,
        payment_number,
        vendor_label,
        total_amount,
        je_number,
        je_id,
    )

    # ------------------------------------------------------------------
    # 10. Reload with relationships for the response
    # ------------------------------------------------------------------
    result = await db.execute(
        select(ApPayment)
        .options(
            selectinload(ApPayment.applications),
            selectinload(ApPayment.journal_entry),
        )
        .where(ApPayment.paymentId == payment_id)
    )
    loaded_payment = result.scalar_one()

    return success(
        _build_payment_response(loaded_payment),
        message=f"Payment {payment_number} recorded successfully.",
    )


# ---------------------------------------------------------------------------
# List payments
# ---------------------------------------------------------------------------


@router.get(
    "/ap-payments",
    response_model=PaginatedResponse[ApPaymentResponse],
    summary="List vendor payments",
    description="Return a paginated list of AP payments. organization_id is required.",
)
async def list_ap_payments(
    organization_id: str = Query(..., description="Required — filter by organization"),
    company_code: Optional[str] = Query(None),
    vendor_id: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None, description="paymentDate >= this date"),
    date_to: Optional[date] = Query(None, description="paymentDate <= this date"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> PaginatedResponse[ApPaymentResponse]:
    """
    List vendor payments with optional filtering and pagination.

    Args:
        organization_id: Required org scope.
        company_code: Optional company code filter.
        vendor_id: Optional vendor filter.
        date_from: Optional lower bound on paymentDate.
        date_to: Optional upper bound on paymentDate.
        page: Page number (1-based).
        size: Items per page (max 500).
        db: Async DB session.
        _current_user: Authenticated user (read roles).

    Returns:
        Paginated payment list with applications (no JE lines for performance).
    """
    base_filter = ApPayment.organizationId == organization_id
    query = select(ApPayment).where(base_filter)
    count_query = select(func.count()).select_from(ApPayment).where(base_filter)

    if company_code is not None:
        query = query.where(ApPayment.companyCode == company_code)
        count_query = count_query.where(ApPayment.companyCode == company_code)
    if vendor_id is not None:
        query = query.where(ApPayment.vendorId == vendor_id)
        count_query = count_query.where(ApPayment.vendorId == vendor_id)
    if date_from is not None:
        query = query.where(ApPayment.paymentDate >= date_from)
        count_query = count_query.where(ApPayment.paymentDate >= date_from)
    if date_to is not None:
        query = query.where(ApPayment.paymentDate <= date_to)
        count_query = count_query.where(ApPayment.paymentDate <= date_to)

    total = await db.scalar(count_query) or 0
    offset = (page - 1) * size

    result = await db.execute(
        query.options(
            selectinload(ApPayment.applications),
            selectinload(ApPayment.journal_entry),
        )
        .order_by(ApPayment.paymentDate.desc(), ApPayment.paymentNumber.desc())
        .offset(offset)
        .limit(size)
    )
    payments = result.scalars().all()

    # Batch-fetch reversal status for every payment's linked JE so the list
    # can flag reversed payments without an extra round trip per row.
    reversal_map = await _fetch_payment_reversal_map(
        db,
        organization_id,
        (
            p.journal_entry.jeNumber
            for p in payments
            if p.journal_entry is not None
        ),
    )

    return paginated(
        items=[_build_payment_response(p, reversal_map) for p in payments],
        total=total,
        page=page,
        size=size,
    )


# ---------------------------------------------------------------------------
# Get single payment (detail)
# ---------------------------------------------------------------------------


@router.get(
    "/ap-payments/{payment_id}",
    response_model=SuccessResponse[ApPaymentDetailResponse],
    summary="Get a vendor payment with applied invoices and JE summary",
)
async def get_ap_payment(
    payment_id: str,
    organization_id: str = Query(..., description="Required — org scope for authorization"),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[ApPaymentDetailResponse]:
    """
    Retrieve a single vendor payment with all applied invoices and JE summary.

    Args:
        payment_id: UUID of the payment to retrieve.
        organization_id: Org scope — prevents cross-org access.
        db: Async DB session.
        _current_user: Authenticated user (read roles).

    Returns:
        ApPaymentDetailResponse with applications and JE summary.

    Raises:
        HTTPException 404: If payment not found or belongs to a different org.
    """
    result = await db.execute(
        select(ApPayment)
        .options(
            selectinload(ApPayment.applications),
            selectinload(ApPayment.journal_entry),
        )
        .where(
            ApPayment.paymentId == payment_id,
            ApPayment.organizationId == organization_id,
        )
    )
    payment = result.scalar_one_or_none()
    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payment '{payment_id}' not found.",
        )

    reversal_map = await _fetch_payment_reversal_map(
        db,
        organization_id,
        [payment.journal_entry.jeNumber] if payment.journal_entry else [],
    )
    response_data = _build_payment_response(payment, reversal_map)
    detail_response = ApPaymentDetailResponse(**response_data.model_dump())
    return success(detail_response)
