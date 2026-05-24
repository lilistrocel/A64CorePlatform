"""
Finance Events Ingestion Endpoint

Receives outbox events from the consumer worker and records them as
processed in the `outbox_events_processed` table.

Auth: Service-to-service shared secret via `X-Service-Secret` header.
This endpoint does NOT use JWT — it is called by the internal consumer
worker, not by browser clients.

Phase B.3: `_handle_purchase_received` is now live. It consumes
`purchase_received` outbox events and produces Journal Entries:
  DR  per-line inventory account (from purchase_item_finance_ext)
  CR  GR/IR Clearing account (from company_posting_setup)
VAT is NOT recognised at GR; only lineNet is posted (lineGross/lineTax ignored).

Phase C.5: `_handle_ap_invoice_posted` is now live. It consumes
`ap_invoice_posted` outbox events and produces Journal Entries:
  DR  GR/IR Clearing          (expectedNet = totalNetAmount - totalPriceVariance)
  DR  Input VAT               (totalTaxAmount, only if > 0)
  DR  Purchase Price Variance (totalPriceVariance, only if > 0)
  CR  Purchase Price Variance (abs(totalPriceVariance), only if < 0)
  CR  AP Control              (totalGrossAmount — vendor's liability)
"""

import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import ValidationError
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import settings
from ...db.session import get_db
from ...models.orm.models import (
    CompanyPostingSetup,
    FiscalPeriod,
    GLAccount,
    JEStatusEnum,
    JournalEntry,
    JournalEntryLine,
    OutboxEventResultEnum,
    OutboxEventsProcessed,
    PeriodStatusEnum,
    PurchaseItemFinanceExt,
    PurchaseItemTypeEnum,
    TaxCode,
    VendorFinanceExt,
)

# Import shared contracts — both the envelope and the registry
from contracts.finance_events import BaseFinanceEvent, EVENT_TYPE_REGISTRY

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Events — Outbox Ingest"])


# ---------------------------------------------------------------------------
# Service-to-service auth dependency
# ---------------------------------------------------------------------------


async def verify_service_secret(
    x_service_secret: str = Header(
        ...,
        alias="X-Service-Secret",
        description="Shared secret for service-to-service auth (consumer → finance)",
    ),
) -> None:
    """
    Dependency that validates the X-Service-Secret header.

    Raises:
        HTTPException 401: If the header is missing or does not match
                           the FINANCE_INGESTION_SECRET setting.
    """
    # Reason: constant-time comparison prevents timing attacks on the secret
    import hmac

    if not hmac.compare_digest(x_service_secret, settings.FINANCE_INGESTION_SECRET):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Service-Secret",
        )


# ---------------------------------------------------------------------------
# Phase 1A master data event handlers
# ---------------------------------------------------------------------------


async def _resolve_account_id(
    db: AsyncSession, organization_id: str, account_number: str
) -> Optional[str]:
    """
    Resolve a GL account number to its accountId UUID for an organisation.

    Args:
        db: Active SQLAlchemy async session.
        organization_id: Organisation to scope the lookup.
        account_number: Account number string (e.g. '221000-001').

    Returns:
        accountId string, or None if not found.
    """
    result = await db.execute(
        select(GLAccount.accountId).where(
            GLAccount.organizationId == organization_id,
            GLAccount.accountNumber == account_number,
        )
    )
    return result.scalar_one_or_none()


async def _handle_vendor_changed(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle vendor_changed outbox events.

    - If isDeleted=True: mark vendor_finance_ext.isActive=False.
    - If new vendor: create vendor_finance_ext with default reconciliation
      account (221000-001 AP Control if it exists).
    - If existing vendor: update denormalized vendorCode only.
      Finance-specific fields are NOT overwritten.

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope.
    """
    payload = event.payload
    vendor_id = str(payload["vendorId"])
    org_id = str(event.organizationId)

    # Look up existing ext row
    existing = await db.execute(
        select(VendorFinanceExt).where(
            VendorFinanceExt.organizationId == org_id,
            VendorFinanceExt.vendorId == vendor_id,
        )
    )
    ext_row = existing.scalar_one_or_none()

    if payload.get("isDeleted"):
        # Soft delete: mark inactive
        if ext_row:
            ext_row.isActive = False
            logger.info(
                "[Finance/Events] marked vendor_finance_ext inactive vendorId=%s", vendor_id
            )
        return

    if ext_row is None:
        # New vendor: create ext row with default reconciliation account
        recon_account_id = await _resolve_account_id(db, org_id, "221000-001")
        ext_row = VendorFinanceExt(
            organizationId=org_id,
            vendorId=vendor_id,
            vendorCode=str(payload["vendorCode"]),
            reconciliationAccountId=recon_account_id,
            defaultExpenseAccountId=None,
            isActive=True,
        )
        db.add(ext_row)
        logger.info(
            "[Finance/Events] created vendor_finance_ext vendorId=%s recon_account=%s",
            vendor_id, recon_account_id,
        )
    else:
        # Existing: only update denormalized vendorCode
        ext_row.vendorCode = str(payload["vendorCode"])
        ext_row.isActive = True
        logger.info(
            "[Finance/Events] updated vendor_finance_ext vendorId=%s", vendor_id
        )


# ---------------------------------------------------------------------------
# Item type → default inventory account mapping
# Reason: per A.4 spec only raw_material gets an auto-assigned inventory account
# (121000-002 Raw Materials - Fertilisers).  All other types leave inventoryAccountId
# null so finance can set them explicitly via PATCH when the business needs it.
# ---------------------------------------------------------------------------
_RAW_MATERIAL_INVENTORY_ACCOUNT = "121000-002"

# GRNI Clearing account number
_GRNI_CLEARING_ACCOUNT = "221000-099"


async def _handle_purchase_item_changed(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle purchase_item_changed outbox events.

    - If isDeleted=True: mark purchase_item_finance_ext.isActive=False.
    - If new item: create ext row; auto-assign inventoryAccountId for raw_material
      only (looks up 121000-002; logs warning and leaves null if not found).
    - If existing: update denormalized itemCode, itemName, and itemType from payload.
      Finance-specific account assignments are NOT overwritten by events (finance
      is the master for those via PATCH).

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope.
    """
    payload = event.payload
    item_id = str(payload["itemId"])
    org_id = str(event.organizationId)

    # Reason: normalize itemType early so it can be stored as the ORM enum value.
    raw_item_type = str(payload.get("itemType", "raw_material"))
    try:
        item_type_enum = PurchaseItemTypeEnum(raw_item_type)
    except ValueError:
        # Unknown item type from ops — store null rather than crash the handler.
        item_type_enum = None
        logger.warning(
            "[Finance/Events] unknown itemType=%s for itemId=%s — storing null",
            raw_item_type, item_id,
        )

    item_name = str(payload.get("name", "")) or None
    item_code = str(payload["itemCode"])

    existing = await db.execute(
        select(PurchaseItemFinanceExt).where(
            PurchaseItemFinanceExt.organizationId == org_id,
            PurchaseItemFinanceExt.itemId == item_id,
        )
    )
    ext_row = existing.scalar_one_or_none()

    if payload.get("isDeleted"):
        if ext_row:
            ext_row.isActive = False
            logger.info(
                "[Finance/Events] marked purchase_item_finance_ext inactive itemId=%s", item_id
            )
        return

    if ext_row is None:
        # Reason: auto-assign inventoryAccountId only for raw_material.  The
        # account 121000-002 is a sensible farm-operations default; finance can
        # override it anytime via PATCH.  If the account doesn't exist in this
        # org's CoA we log a warning and leave the field null.
        inv_acct_id: Optional[str] = None
        if raw_item_type == "raw_material":
            inv_acct_id = await _resolve_account_id(
                db, org_id, _RAW_MATERIAL_INVENTORY_ACCOUNT
            )
            if inv_acct_id is None:
                logger.warning(
                    "[Finance/Events] auto-assign skipped: account %s not found "
                    "in org=%s for itemId=%s",
                    _RAW_MATERIAL_INVENTORY_ACCOUNT, org_id, item_id,
                )

        # Resolve GRNI clearing account
        grni_id = await _resolve_account_id(db, org_id, _GRNI_CLEARING_ACCOUNT)

        from ...models.orm.models import ValuationMethodEnum

        ext_row = PurchaseItemFinanceExt(
            organizationId=org_id,
            itemId=item_id,
            itemCode=item_code,
            itemName=item_name,
            itemType=item_type_enum,
            inventoryAccountId=inv_acct_id,
            cogsAccountId=None,
            allocationAccountId=grni_id,
            valuationMethod=ValuationMethodEnum.MOVING_AVERAGE,
            isActive=True,
        )
        db.add(ext_row)
        logger.info(
            "[Finance/Events] created purchase_item_finance_ext itemId=%s "
            "itemType=%s inv_acct=%s",
            item_id, raw_item_type, inv_acct_id,
        )
    else:
        # Reason: operational side is source of truth for denormalized identity
        # fields.  Finance-specific account assignments are intentionally NOT
        # overwritten — those are owned by finance via PATCH.
        ext_row.itemCode = item_code
        ext_row.itemName = item_name
        ext_row.itemType = item_type_enum
        ext_row.isActive = True
        logger.info(
            "[Finance/Events] updated purchase_item_finance_ext itemId=%s", item_id
        )


# ---------------------------------------------------------------------------
# Phase B.3 — purchase_received posting helpers
# ---------------------------------------------------------------------------


async def _resolve_posting_setup_or_raise(
    db: AsyncSession,
    organization_id: str,
    company_code: str,
) -> CompanyPostingSetup:
    """
    Load the company_posting_setup row for (organizationId, companyCode).

    Args:
        db: Active SQLAlchemy async session.
        organization_id: Owning organisation.
        company_code: Company code from the event.

    Returns:
        CompanyPostingSetup ORM row.

    Raises:
        HTTPException 400: If no posting setup row exists. Permanent failure — no retry.
    """
    result = await db.execute(
        select(CompanyPostingSetup).where(
            CompanyPostingSetup.organizationId == organization_id,
            CompanyPostingSetup.companyCode == company_code,
        )
    )
    setup = result.scalar_one_or_none()
    if setup is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Company posting setup not configured for {company_code}. "
                "Configure via PUT /finance/companies/{companyCode}/posting-setup."
            ),
        )
    return setup


async def _resolve_item_inventory_account_or_raise(
    db: AsyncSession,
    organization_id: str,
    item_id: str,
    item_code: str,
) -> str:
    """
    Look up purchase_item_finance_ext and return inventoryAccountId.

    Args:
        db: Active SQLAlchemy async session.
        organization_id: Owning organisation.
        item_id: UUID of the item from the GR line.
        item_code: Item code (for error messages only).

    Returns:
        inventoryAccountId string (non-null, non-empty).

    Raises:
        HTTPException 400: If no ext row exists, or if inventoryAccountId is null.
                           Permanent failure — no retry.
    """
    result = await db.execute(
        select(PurchaseItemFinanceExt).where(
            PurchaseItemFinanceExt.organizationId == organization_id,
            PurchaseItemFinanceExt.itemId == item_id,
        )
    )
    ext_row = result.scalar_one_or_none()
    if ext_row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Item {item_code} not configured in finance master data. "
                "Process a purchase_item_changed event for this item first."
            ),
        )
    if not ext_row.inventoryAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Item {item_code} has no inventory account assigned. "
                "Set inventoryAccountId via the Item GL Mapping page."
            ),
        )
    return ext_row.inventoryAccountId


async def _resolve_fiscal_period_or_raise(
    db: AsyncSession,
    company_code: str,
    je_date: date,
) -> str:
    """
    Find an open fiscal period covering je_date for the given company.

    Args:
        db: Active SQLAlchemy async session.
        company_code: Company code to scope the period lookup.
        je_date: The accounting date (from grDate) that must fall within the period.

    Returns:
        periodId string.

    Raises:
        HTTPException 400: If no open fiscal period covers je_date. Permanent failure.
    """
    result = await db.execute(
        select(FiscalPeriod.periodId).where(
            FiscalPeriod.companyCode == company_code,
            FiscalPeriod.status == PeriodStatusEnum.OPEN,
            FiscalPeriod.startDate <= je_date,
            FiscalPeriod.endDate >= je_date,
        )
    )
    period_id = result.scalar_one_or_none()
    if period_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No open fiscal period for {je_date.isoformat()} "
                f"in company {company_code}. Open or create the relevant period first."
            ),
        )
    return period_id


async def _next_je_number(
    db: AsyncSession,
    company_code: str,
    fiscal_year: int,
) -> str:
    """
    Generate the next sequential JE number for (companyCode, fiscalYear).

    Format: JE-{companyCode}-{YYYY}-{NNNN} (zero-padded to 4 digits).

    Design choice: Uses MAX(jeNumber) + 1 within the session rather than a
    separate counter table, to avoid an extra DDL migration.  Concurrent-safe
    in MySQL because the INSERT that follows holds a table-level intent lock
    and the UNIQUE constraint on jeNumber will reject duplicates from a race.
    In the unlikely event of a collision the INSERT raises IntegrityError,
    which propagates as HTTP 500 and the consumer retries with backoff.
    SQLite (test suite) serializes writes so no race is possible there.

    Args:
        db: Active SQLAlchemy async session (must be inside the JE transaction).
        company_code: Company code prefix for the JE number.
        fiscal_year: Four-digit year for the JE number segment.

    Returns:
        Formatted JE number string, e.g. "JE-A001-2026-0001".
    """
    prefix = f"JE-{company_code}-{fiscal_year}-"
    # Reason: filtering by prefix (LIKE) and taking MAX ensures we count only
    # JEs for this company+year combination.  MAX on a zero-padded fixed-width
    # suffix gives the correct lexicographic maximum.
    result = await db.execute(
        select(func.max(JournalEntry.jeNumber)).where(
            JournalEntry.companyCode == company_code,
            JournalEntry.jeNumber.like(f"{prefix}%"),
        )
    )
    max_number = result.scalar_one_or_none()
    if max_number is None:
        next_seq = 1
    else:
        # Reason: extract the numeric suffix after the last '-'
        suffix_str = max_number.rsplit("-", 1)[-1]
        try:
            next_seq = int(suffix_str) + 1
        except ValueError:
            # Reason: defensive fallback — should never happen with our format
            next_seq = 1
    return f"{prefix}{next_seq:04d}"


async def _next_payment_number(
    db: AsyncSession,
    company_code: str,
    fiscal_year: int,
) -> str:
    """
    Generate the next sequential payment number for (companyCode, fiscalYear).

    Format: PAY-{companyCode}-{YYYY}-{NNNN} (zero-padded to 4 digits).

    Uses the same MAX+1 strategy as _next_je_number.  Concurrent-safe because
    the INSERT that follows holds a table-level intent lock and the UNIQUE
    constraint on paymentNumber rejects duplicate races.

    Args:
        db: Active SQLAlchemy async session (must be inside the payment transaction).
        company_code: Company code prefix.
        fiscal_year: Four-digit year.

    Returns:
        Formatted payment number string, e.g. "PAY-A001-2026-0001".
    """
    from ...models.orm.models import ApPayment

    prefix = f"PAY-{company_code}-{fiscal_year}-"
    result = await db.execute(
        select(func.max(ApPayment.paymentNumber)).where(
            ApPayment.companyCode == company_code,
            ApPayment.paymentNumber.like(f"{prefix}%"),
        )
    )
    max_number = result.scalar_one_or_none()
    if max_number is None:
        next_seq = 1
    else:
        suffix_str = max_number.rsplit("-", 1)[-1]
        try:
            next_seq = int(suffix_str) + 1
        except ValueError:
            # Reason: defensive fallback — should never happen with our format
            next_seq = 1
    return f"{prefix}{next_seq:04d}"


async def _handle_purchase_received(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle purchase_received outbox events (Phase B.3).

    Produces a Journal Entry:
      DR  per-line inventory account (purchase_item_finance_ext.inventoryAccountId)
           for lineNet of each GR line.
      CR  GR/IR Clearing account (company_posting_setup.grIrClearingAccountId)
           for the sum of all lineNet values.

    VAT (lineTax, lineGross) is intentionally ignored here — VAT is recognized
    at AP Invoice stage (Phase C).

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope with purchase_received payload.

    Raises:
        HTTPException 400: For all permanent validation failures (no retry).
        HTTPException 500: For unexpected DB errors (consumer will retry).
    """
    from contracts.finance_events import PurchaseReceivedPayload

    payload = PurchaseReceivedPayload(**event.payload)
    org_id = str(event.organizationId)
    company_code = payload.companyCode

    logger.info(
        "[Finance/Posting] handling purchase_received gr=%s po=%s lines=%d total_net=%s",
        payload.grDocNumber,
        payload.poDocNumber,
        len(payload.lines),
        payload.totalNetAmount,
    )

    # ------------------------------------------------------------------
    # 1. Resolve company posting setup
    # ------------------------------------------------------------------
    setup = await _resolve_posting_setup_or_raise(db, org_id, company_code)

    # ------------------------------------------------------------------
    # 2. Validate GR/IR Clearing account is configured
    # ------------------------------------------------------------------
    if not setup.grIrClearingAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"GR/IR Clearing account not configured in posting setup "
                f"for company {company_code}."
            ),
        )

    # ------------------------------------------------------------------
    # 3. Resolve inventory account for each line
    # ------------------------------------------------------------------
    # Reason: resolve all accounts before opening the transaction so a
    # missing item causes a clean 400 without any partial writes.
    line_inventory_accounts: list[tuple[Any, str]] = []
    for line in payload.lines:
        inv_acct_id = await _resolve_item_inventory_account_or_raise(
            db, org_id, str(line.itemId), line.itemCode
        )
        line_inventory_accounts.append((line, inv_acct_id))

    # ------------------------------------------------------------------
    # 4. Resolve fiscal period
    # ------------------------------------------------------------------
    je_date = date.fromisoformat(payload.grDate)
    period_id = await _resolve_fiscal_period_or_raise(db, company_code, je_date)

    # ------------------------------------------------------------------
    # 5. Generate JE number (concurrent-safe MAX+1)
    # ------------------------------------------------------------------
    je_number = await _next_je_number(db, company_code, je_date.year)

    # ------------------------------------------------------------------
    # 6. Build and persist the JE atomically
    # ------------------------------------------------------------------
    # Reason: total_net_amount is the sum of lineNet values (VAT excluded).
    # We compute it from the lines rather than trusting the payload total
    # so the DR and CR sides are always balanced.
    total_net = sum(line.lineNet for line, _ in line_inventory_accounts)
    total_net_decimal = Decimal(str(total_net))

    vendor_label = payload.vendorCode or str(payload.vendorId)
    description = (
        f"Goods Receipt — PO {payload.poDocNumber}, Vendor {vendor_label}"
    )

    je_id = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

    je = JournalEntry(
        jeId=je_id,
        organizationId=org_id,
        companyCode=company_code,
        jeNumber=je_number,
        jeDate=je_date,
        periodId=period_id,
        sourceEventType="purchase_received",
        sourceEventId=str(event.eventId),
        sourceDocId=str(payload.grDocId),
        sourceDocNumber=payload.grDocNumber,
        description=description,
        totalDebit=total_net_decimal,
        totalCredit=total_net_decimal,
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy="system",
    )
    db.add(je)

    # Insert one debit line per GR line
    for line_num, (line, inv_acct_id) in enumerate(line_inventory_accounts, start=1):
        dr_line = JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=line_num,
            accountId=inv_acct_id,
            debit=Decimal(str(line.lineNet)),
            credit=None,
            # Reason: line description is a memo. DR/CR direction shows in the
            # dedicated columns and the account name appears on the line, so the
            # description carries only what's not visible elsewhere — the item
            # code and received quantity.
            description=f"{line.itemCode} — qty {line.quantity} {line.uom}",
            referenceLineId=str(line.baseLineId) if line.baseLineId else None,
        )
        db.add(dr_line)

    # Insert one credit line for the GR/IR Clearing total
    cr_line_number = len(line_inventory_accounts) + 1
    cr_line = JournalEntryLine(
        jeLineId=str(uuid.uuid4()),
        jeId=je_id,
        lineNumber=cr_line_number,
        accountId=setup.grIrClearingAccountId,
        debit=None,
        credit=total_net_decimal,
        # Reason: see DR-line description rationale above. Memo points to the
        # source GR; CR direction and account are already on the line.
        description=f"Goods receipt {payload.grDocNumber}",
    )
    db.add(cr_line)

    # Reason: flush here so any FK violations surface inside this handler
    # (which the consumer treats as a 500 → retry) rather than in the
    # outer commit path where the error would be harder to attribute.
    await db.flush()

    logger.info(
        "[Finance/Posting] posted JE jeNumber=%s jeId=%s "
        "debit_lines=%d credit_lines=1 total=%s",
        je_number,
        je_id,
        len(line_inventory_accounts),
        total_net_decimal,
    )


# ---------------------------------------------------------------------------
# Phase C.5 — ap_invoice_posted posting handler
# ---------------------------------------------------------------------------


async def _lookup_tax_code_reverse_charge(
    db: AsyncSession,
    organization_id: str,
    tax_code_str: Optional[str],
) -> bool:
    """
    Look up whether a tax code has isReverseCharge=True for this organisation.

    Args:
        db: Active SQLAlchemy async session.
        organization_id: Organisation scope for the tax code lookup.
        tax_code_str: The tax code string from the invoice line (e.g. 'S', 'SR').

    Returns:
        True if the tax code exists and isReverseCharge=True, False otherwise.
        Returns False for null/empty tax codes (treated as standard).
    """
    if not tax_code_str:
        return False
    result = await db.execute(
        select(TaxCode.isReverseCharge).where(
            TaxCode.organizationId == organization_id,
            TaxCode.taxCode == tax_code_str,
        )
    )
    is_rc = result.scalar_one_or_none()
    # Reason: None means the tax code row doesn't exist — treat as non-reverse-charge.
    return bool(is_rc) if is_rc is not None else False


def _compute_tax_point_date(date_of_supply: str, invoice_date: str) -> str:
    """
    Compute the UAE VAT Article 25 tax point date.

    The tax point is the earliest of:
      - date_of_supply (= GR docDate, when goods physically arrived)
      - invoice_date (the vendor's invoice date)
      (payment date is not yet relevant at AP Invoice posting time)

    Args:
        date_of_supply: ISO date string for the GR date.  May be empty/blank.
        invoice_date:   ISO date string for the vendor's invoice date.

    Returns:
        ISO date string of the earlier date.  Falls back to invoice_date when
        date_of_supply is absent or unparseable.
    """
    if not date_of_supply or not date_of_supply.strip():
        # Reason: dateOfSupply was absent in pre-012 events — fall back to
        # invoiceDate as a conservative valid tax point.
        return invoice_date
    try:
        dos = date.fromisoformat(date_of_supply[:10])
        inv = date.fromisoformat(invoice_date[:10])
        return min(dos, inv).isoformat()
    except ValueError:
        # Reason: defensive fallback — malformed date should not crash posting.
        logger.warning(
            "[Finance/Posting] could not parse tax-point dates "
            "dateOfSupply=%r invoiceDate=%r — using invoiceDate",
            date_of_supply,
            invoice_date,
        )
        return invoice_date


async def _handle_ap_invoice_posted(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle ap_invoice_posted outbox events (Phase C.5 + PM items 2 & 3).

    Produces a Journal Entry with the following lines:

      DR  GR/IR Clearing   for expectedNet (= totalNetAmount - totalPriceVariance)
                           This clears exactly what was credited at GR time.
      DR  Input VAT        for total_dr_input_vat — all lines with tax (only if > 0)
      CR  Output VAT       for total_cr_output_vat — reverse-charge lines only
                           (only if any line has isReverseCharge=True)
      DR  PPV              for max(totalPriceVariance, 0) (only if variance > 0)
      CR  PPV              for abs(min(totalPriceVariance, 0)) (only if variance < 0)
      CR  AP Control       for total_ap_credit — per-line: lineNet if reverse-charge,
                           lineGross if standard. Vendor's specific liability.

    Reverse-charge logic (UAE VAT — imported services / designated-zone):
      - Standard tax ('S'): DR Input VAT only; CR AP = lineGross (vendor billed VAT)
      - Reverse-charge ('SR'): DR Input VAT + CR Output VAT; CR AP = lineNet only
        (foreign supplier did NOT bill VAT; buyer self-accounts both sides)
      - Net cash impact of reverse-charge is zero; both sides needed for VAT return.

    Tax-point rule (UAE VAT Decree-Law Article 25):
      tax_point = min(dateOfSupply, invoiceDate)
      Used in the Input VAT line description for VAT return traceability.
      The JE jeDate remains apDate (booking date); only the description memo carries
      the tax-point date. This is the simpler of the two acceptable approaches
      described in the spec — no separate column on journal_entries is added.

    Balance proof:
      Let v = totalPriceVariance, net = totalNetAmount,
          tax_s  = sum(lineTax for standard lines),
          tax_rc = sum(lineTax for reverse-charge lines),
          total_tax = tax_s + tax_rc
          ap_credit  = sum(lineGross for S lines) + sum(lineNet for SR lines)
                     = sum(lineNet + lineTax for S) + sum(lineNet for SR)
                     = (net_s + tax_s) + net_rc      [where net_s + net_rc = net]
          total_cr_output_vat = tax_rc

      expectedNet = net - v

      Case v >= 0:
        DR = expectedNet + v + total_tax
           = (net - v) + v + total_tax = net + total_tax
        CR = ap_credit + total_cr_output_vat
           = (net_s + tax_s + net_rc) + tax_rc
           = (net_s + net_rc) + (tax_s + tax_rc)
           = net + total_tax  ✓

      Case v < 0:
        DR = expectedNet + total_tax = (net - v) + total_tax
        CR = ap_credit + |v| + total_cr_output_vat
           = (net + total_tax - tax_rc) + (-v) + tax_rc
           = net + total_tax - v  ✓

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope with ap_invoice_posted payload.

    Raises:
        HTTPException 400: For all permanent validation failures (no retry).
        HTTPException 500: For unexpected DB errors (consumer will retry).
    """
    from contracts.finance_events import ApInvoicePostedPayload

    payload = ApInvoicePostedPayload(**event.payload)
    org_id = str(event.organizationId)
    company_code = payload.companyCode

    total_net = Decimal(str(payload.totalNetAmount))
    total_tax = Decimal(str(payload.totalTaxAmount))
    total_gross = Decimal(str(payload.totalGrossAmount))
    total_variance = Decimal(str(payload.totalPriceVariance))

    logger.info(
        "[Finance/Posting] handling ap_invoice_posted ap=%s vendor=%s "
        "net=%s tax=%s gross=%s variance=%s",
        payload.apDocNumber,
        payload.vendorCode or str(payload.vendorId),
        total_net,
        total_tax,
        total_gross,
        total_variance,
    )

    # ------------------------------------------------------------------
    # 1. Resolve company posting setup
    # ------------------------------------------------------------------
    setup = await _resolve_posting_setup_or_raise(db, org_id, company_code)

    # ------------------------------------------------------------------
    # 2. Resolve per-line reverse-charge flags
    # ------------------------------------------------------------------
    # Reason: we look up each distinct tax code once to avoid N+1 queries.
    # Cache the results in a small dict keyed by taxCode string.
    _rc_cache: Dict[str, bool] = {}

    async def _is_reverse_charge(tc_str: Optional[str]) -> bool:
        """Cached reverse-charge lookup for a tax code string."""
        if tc_str not in _rc_cache:
            _rc_cache[tc_str] = await _lookup_tax_code_reverse_charge(
                db, org_id, tc_str
            )
        return _rc_cache[tc_str]

    # Build per-line reverse-charge flags and per-line tax amounts
    line_rc_flags: list[bool] = []
    for line in payload.lines:
        is_rc = await _is_reverse_charge(line.taxCode)
        line_rc_flags.append(is_rc)

    # ------------------------------------------------------------------
    # 3. Compute aggregate amounts respecting reverse-charge per line
    #    AND per-cost-center buckets for JE line tagging.
    # ------------------------------------------------------------------
    # Reason: AP credit = lineGross for standard lines (vendor billed VAT)
    #                    = lineNet only for reverse-charge lines (foreign supplier
    #                      did not bill VAT; buyer self-accounts the VAT separately)
    # Reason: per-cost-center buckets let us emit one DR GR/IR Clearing and one
    # DR Input VAT JE line per distinct costCenterId. Lines without a cost
    # centre collapse into a single (None-keyed) bucket. The CR AP Control line
    # stays unsplit (vendor liability, not per-CC).
    total_ap_credit = Decimal("0")
    total_dr_input_vat = Decimal("0")
    total_cr_output_vat = Decimal("0")

    # cc_id -> {"expected_net": Decimal, "input_vat": Decimal}
    # Insertion-ordered dict (Python 3.7+) — preserves first-seen order so
    # JE lines emit in a stable, line-order-driven sequence.
    cc_buckets: Dict[Optional[str], Dict[str, Decimal]] = {}

    for line, is_rc in zip(payload.lines, line_rc_flags):
        line_tax = Decimal(str(line.lineTax))
        line_net = Decimal(str(line.lineNet))
        line_gross = Decimal(str(line.lineGross))
        line_variance = Decimal(str(line.priceVarianceAmount))

        total_dr_input_vat += line_tax  # ALL lines contribute to DR Input VAT

        if is_rc:
            # Reverse-charge: CR Output VAT for same amount; AP = lineNet only
            total_cr_output_vat += line_tax
            total_ap_credit += line_net
        else:
            # Standard: no CR Output VAT; AP = lineGross (vendor charged us VAT)
            total_ap_credit += line_gross

        # Per-line GR/IR contribution = lineNet - priceVarianceAmount (exactly
        # what GR posting originally credited to GR/IR Clearing for this line).
        cc_id = line.costCenterId  # may be None
        bucket = cc_buckets.setdefault(
            cc_id, {"expected_net": Decimal("0"), "input_vat": Decimal("0")}
        )
        bucket["expected_net"] += line_net - line_variance
        bucket["input_vat"] += line_tax

    has_vat = total_dr_input_vat > Decimal("0")
    has_reverse_charge = total_cr_output_vat > Decimal("0")
    has_variance = total_variance != Decimal("0")

    # ------------------------------------------------------------------
    # 4. Validate required GL accounts are configured
    # ------------------------------------------------------------------
    if not setup.apControlAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"AP Control account (apControlAccountId) not configured in posting setup "
                f"for company {company_code}. Configure via the Posting Setup page."
            ),
        )

    if not setup.grIrClearingAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"GR/IR Clearing account (grIrClearingAccountId) not configured in posting "
                f"setup for company {company_code}."
            ),
        )

    # Reason: inputVatAccountId is only required when any line carries non-zero tax.
    # If the vendor invoiced at zero-rated (Z/E/N), no VAT line is posted and the
    # account does not need to be configured.
    if has_vat and not setup.inputVatAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Input VAT account (inputVatAccountId) not configured in posting setup "
                f"for company {company_code}, but invoice {payload.invoiceNumber} "
                f"carries non-zero tax ({total_dr_input_vat}). Configure the Input VAT "
                "account first."
            ),
        )

    # Reason: outputVatAccountId required when any line is reverse-charge.
    # Without it the CR Output VAT leg has no account to post to.
    if has_reverse_charge and not setup.outputVatAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Output VAT account (outputVatAccountId) not configured in posting setup "
                f"for company {company_code}, but invoice {payload.invoiceNumber} "
                f"contains reverse-charge tax lines ({total_cr_output_vat}). "
                "Output VAT account required for reverse-charge tax codes."
            ),
        )

    # Reason: purchasePriceVarianceAccountId only required when variance != 0.
    # Zero-variance invoices do not post a PPV line and need no account.
    if has_variance and not setup.purchasePriceVarianceAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Purchase Price Variance account (purchasePriceVarianceAccountId) not "
                f"configured in posting setup for company {company_code}, but invoice "
                f"{payload.invoiceNumber} has non-zero price variance ({total_variance}). "
                "Configure the PPV account first."
            ),
        )

    # ------------------------------------------------------------------
    # 5. Compute tax-point date (UAE VAT Article 25)
    # ------------------------------------------------------------------
    # Reason: tax_point_date = min(dateOfSupply, invoiceDate). This date is
    # embedded in the Input VAT line description as an FTA audit memo. The JE
    # jeDate remains apDate (the accounting booking date). We do NOT split the
    # JE across two dates — the tax point is a memo only, per spec item 2.
    tax_point_date = _compute_tax_point_date(
        payload.dateOfSupply, payload.invoiceDate
    )

    # ------------------------------------------------------------------
    # 6. Resolve fiscal period using apDate
    # ------------------------------------------------------------------
    je_date = date.fromisoformat(payload.apDate)
    period_id = await _resolve_fiscal_period_or_raise(db, company_code, je_date)

    # ------------------------------------------------------------------
    # 7. Generate JE number (concurrent-safe MAX+1)
    # ------------------------------------------------------------------
    je_number = await _next_je_number(db, company_code, je_date.year)

    # ------------------------------------------------------------------
    # 8. Compute GR/IR clearing amount and PPV legs
    # ------------------------------------------------------------------
    # Reason: expectedNet is what we credited GR/IR Clearing at goods-receipt
    # time. We MUST clear exactly that amount here so the GR/IR account returns
    # to zero for this document. Variance flows through the PPV account only.
    expected_net = total_net - total_variance

    dr_variance: Optional[Decimal] = total_variance if total_variance > 0 else None
    cr_variance: Optional[Decimal] = -total_variance if total_variance < 0 else None

    # ------------------------------------------------------------------
    # 9. Build the JE description
    # ------------------------------------------------------------------
    vendor_label = payload.vendorCode or str(payload.vendorId)
    description = (
        f"AP Invoice — {payload.apDocNumber} from {vendor_label}, "
        f"vendor invoice {payload.invoiceNumber}"
    )

    # ------------------------------------------------------------------
    # 10. Compute totalDebit / totalCredit for the JE header
    # ------------------------------------------------------------------
    # Reason: compute from first principles so the header fields always
    # reflect what we actually post, regardless of payload totals.
    #
    # DR side: GR/IR clearing + (PPV DR if positive) + Input VAT
    # CR side: AP credit + (CR Output VAT if reverse-charge) + (PPV CR if negative)
    dr_total = (
        expected_net
        + (dr_variance or Decimal("0"))
        + total_dr_input_vat
    )
    cr_total = (
        total_ap_credit
        + total_cr_output_vat
        + (cr_variance or Decimal("0"))
    )
    # Sanity check — should never fail given the balance proof, but guard in dev.
    assert dr_total == cr_total, (
        f"JE imbalance! DR={dr_total} CR={cr_total} for ap={payload.apDocNumber}"
    )

    # ------------------------------------------------------------------
    # 11. Build and persist the JE atomically
    # ------------------------------------------------------------------
    je_id = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

    je = JournalEntry(
        jeId=je_id,
        organizationId=org_id,
        companyCode=company_code,
        jeNumber=je_number,
        jeDate=je_date,
        periodId=period_id,
        sourceEventType="ap_invoice_posted",
        sourceEventId=str(event.eventId),
        sourceDocId=str(payload.apDocId),
        sourceDocNumber=payload.apDocNumber,
        description=description,
        totalDebit=dr_total,
        totalCredit=cr_total,
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy="system",
    )
    db.add(je)

    # Track line numbers sequentially
    line_num = 1

    # ------------------------------------------------------------------
    # Line 1+: DR GR/IR Clearing — clears the GR holding for expectedNet.
    # Split into one JE line per distinct costCenterId so cost-centre
    # reports can attribute the cleared cost. Lines without a CC collapse
    # into a single un-tagged JE line.
    # Sum of all DR GR/IR line debits == expected_net (preserves balance).
    # ------------------------------------------------------------------
    for cc_id, bucket in cc_buckets.items():
        bucket_expected_net = bucket["expected_net"]
        if bucket_expected_net == Decimal("0"):
            continue  # skip empty buckets (no real-money posting)
        cc_suffix = f" (CC {cc_id})" if cc_id else ""
        db.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=line_num,
            accountId=setup.grIrClearingAccountId,
            debit=bucket_expected_net,
            credit=None,
            description=f"Clear GR/IR — {payload.grDocNumber}{cc_suffix}",
            costCenterId=cc_id,
        ))
        line_num += 1

    # ------------------------------------------------------------------
    # Line N: DR Input VAT — reclaimable VAT for ALL lines (only if > 0).
    # Split per cost centre, mirroring the GR/IR split. Sum of all DR
    # Input VAT line debits == total_dr_input_vat. Each line description
    # carries the FTA Article 25 tax-point date as an audit memo.
    # ------------------------------------------------------------------
    if has_vat:
        for cc_id, bucket in cc_buckets.items():
            bucket_input_vat = bucket["input_vat"]
            if bucket_input_vat == Decimal("0"):
                continue
            cc_suffix = f" (CC {cc_id})" if cc_id else ""
            db.add(JournalEntryLine(
                jeLineId=str(uuid.uuid4()),
                jeId=je_id,
                lineNumber=line_num,
                accountId=setup.inputVatAccountId,
                debit=bucket_input_vat,
                credit=None,
                # Reason: tax_point_date is embedded here per UAE Article 25 so
                # that VAT return queries can read the FTA-compliant tax point
                # from the JE line description without needing a separate column.
                description=f"Input VAT — tax point {tax_point_date}{cc_suffix}",
                costCenterId=cc_id,
            ))
            line_num += 1

    # ------------------------------------------------------------------
    # Line 3 (conditional): CR Output VAT — reverse-charge self-accounting
    # Only posted when at least one line carries isReverseCharge=True.
    # ------------------------------------------------------------------
    if has_reverse_charge:
        db.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=line_num,
            accountId=setup.outputVatAccountId,
            debit=None,
            credit=total_cr_output_vat,
            description=(
                f"Reverse-charge Output VAT — {payload.invoiceNumber} "
                f"(tax point {tax_point_date})"
            ),
        ))
        line_num += 1

    # ------------------------------------------------------------------
    # Line 4 (conditional): DR or CR Purchase Price Variance
    # ------------------------------------------------------------------
    if has_variance:
        if dr_variance is not None:
            # Vendor over-billed relative to PO: extra expense
            db.add(JournalEntryLine(
                jeLineId=str(uuid.uuid4()),
                jeId=je_id,
                lineNumber=line_num,
                accountId=setup.purchasePriceVarianceAccountId,
                debit=dr_variance,
                credit=None,
                description=f"Price variance — {payload.invoiceNumber}",
            ))
        else:
            # Vendor under-billed relative to PO: recognised gain
            db.add(JournalEntryLine(
                jeLineId=str(uuid.uuid4()),
                jeId=je_id,
                lineNumber=line_num,
                accountId=setup.purchasePriceVarianceAccountId,
                debit=None,
                credit=cr_variance,
                description=f"Price variance — {payload.invoiceNumber}",
            ))
        line_num += 1

    # ------------------------------------------------------------------
    # Last line: CR AP Control — vendor's specific liability
    # For reverse-charge lines: credit = lineNet (no vendor VAT).
    # For standard lines: credit = lineGross (vendor charged VAT).
    # referenceLineId stores vendorId for sub-ledger linkage.
    # ------------------------------------------------------------------
    db.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()),
        jeId=je_id,
        lineNumber=line_num,
        accountId=setup.apControlAccountId,
        debit=None,
        credit=total_ap_credit,
        description=f"AP — {vendor_label}",
        # Reason: store vendorId in referenceLineId so the sub-ledger has the
        # vendor link even before a dedicated AP sub-ledger table exists.
        # This field is intentionally free-form (no FK) per the ORM comment.
        referenceLineId=str(payload.vendorId),
    ))

    # Reason: flush here so FK violations surface inside this handler
    # rather than in the outer commit path where they are harder to attribute.
    await db.flush()

    logger.info(
        "[Finance/Posting] posted JE jeNumber=%s jeId=%s sourceDoc=%s "
        "expected_net=%s input_vat=%s output_vat=%s ap_credit=%s "
        "variance=%s tax_point=%s total=%s",
        je_number,
        je_id,
        payload.apDocNumber,
        expected_net,
        total_dr_input_vat,
        total_cr_output_vat,
        total_ap_credit,
        total_variance,
        tax_point_date,
        dr_total,
    )


# ---------------------------------------------------------------------------
# Ingest endpoint
# ---------------------------------------------------------------------------


@router.post(
    "/events/ingest",
    status_code=status.HTTP_200_OK,
    summary="Ingest an outbox event from the consumer worker",
    description=(
        "Service-to-service endpoint (X-Service-Secret auth). "
        "Validates the event, checks idempotency, records as processed. "
        "Week 3: posting logic is a stub — actual GL entries ship in Week 4."
    ),
    dependencies=[Depends(verify_service_secret)],
)
async def ingest_event(
    event: BaseFinanceEvent,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Receive, validate, and record an outbox event.

    Args:
        event: Validated BaseFinanceEvent envelope from the consumer.
        db: Async SQLAlchemy session.

    Returns:
        Dict with status ('processed' or 'already_processed'), eventId,
        and processedAt timestamp.
    """
    event_id = str(event.eventId)

    # ------------------------------------------------------------------
    # 1. Validate eventType against registry
    # ------------------------------------------------------------------
    if event.eventType not in EVENT_TYPE_REGISTRY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown eventType '{event.eventType}'. "
            f"Valid types: {list(EVENT_TYPE_REGISTRY.keys())}",
        )

    # ------------------------------------------------------------------
    # 2. Validate payload shape against the registered payload class
    # ------------------------------------------------------------------
    payload_class = EVENT_TYPE_REGISTRY[event.eventType]
    try:
        payload_class(**event.payload)
    except (ValidationError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid payload for eventType '{event.eventType}': {str(exc)[:500]}",
        )

    # ------------------------------------------------------------------
    # 3. Idempotency check — return 200 if already processed
    # ------------------------------------------------------------------
    existing = await db.execute(
        select(OutboxEventsProcessed).where(
            OutboxEventsProcessed.eventId == event_id
        )
    )
    existing_row = existing.scalar_one_or_none()

    if existing_row is not None:
        logger.info(
            "[Finance/Ingest] already_processed event_id=%s event_type=%s",
            event_id,
            event.eventType,
        )
        return {
            "status": "already_processed",
            "eventId": event_id,
            "originalProcessedAt": existing_row.processedAt.isoformat()
            if existing_row.processedAt
            else None,
        }

    # ------------------------------------------------------------------
    # 4. Dispatch to the appropriate handler
    # ------------------------------------------------------------------
    if event.eventType == "vendor_changed":
        # Phase 1A — master data sync
        await _handle_vendor_changed(db, event)
    elif event.eventType == "purchase_item_changed":
        # Phase 1A — master data sync
        await _handle_purchase_item_changed(db, event)
    elif event.eventType == "payment_terms_changed":
        # Operations holds the master; finance just logs receipt.
        logger.info(
            "[Finance/Ingest] payment_terms_changed received org=%s terms_code=%s",
            str(event.organizationId),
            event.payload.get("termsCode"),
        )
    elif event.eventType == "purchase_received":
        # Phase B.3 — GR posting: DR Inventory / CR GR/IR Clearing
        await _handle_purchase_received(db, event)
    elif event.eventType == "ap_invoice_posted":
        # Phase C.5 — AP Invoice posting:
        # DR GR/IR Clearing / DR Input VAT / DR|CR PPV / CR AP Control
        await _handle_ap_invoice_posted(db, event)
    else:
        # All other event types: posting logic is a NO-OP stub pending future phases.
        logger.info(
            "[Finance/Ingest] received event event_type=%s event_id=%s "
            "org=%s company=%s — no handler yet (stub)",
            event.eventType,
            event_id,
            str(event.organizationId),
            event.companyCode,
        )

    # ------------------------------------------------------------------
    # 5. Record in outbox_events_processed (idempotency table)
    # ------------------------------------------------------------------
    now = datetime.now(tz=timezone.utc)
    processed_row = OutboxEventsProcessed(
        eventId=event_id,
        eventType=event.eventType,
        organizationId=str(event.organizationId),
        companyCode=event.companyCode,
        occurredAt=event.occurredAt.replace(tzinfo=None)
        if event.occurredAt.tzinfo
        else event.occurredAt,
        processedAt=now.replace(tzinfo=None),
        result=OutboxEventResultEnum.SUCCESS,
        errorMessage=None,
    )
    db.add(processed_row)
    await db.commit()
    await db.refresh(processed_row)

    logger.info(
        "[Finance/Ingest] recorded event_id=%s processedAt=%s",
        event_id,
        processed_row.processedAt,
    )

    return {
        "status": "processed",
        "eventId": event_id,
        "processedAt": processed_row.processedAt.isoformat()
        if processed_row.processedAt
        else now.isoformat(),
    }
