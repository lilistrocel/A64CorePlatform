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

T-910: `_handle_ap_down_payment_posted` and `_handle_ap_credit_note_posted`
are now live. They consume `ap_down_payment_posted` / `ap_credit_note_posted`
outbox events (previously dropped into the dispatch NO-OP stub below):
  ap_down_payment_posted: DR Vendor Advance / DR Input VAT / CR AP Control
  ap_credit_note_posted:  DR AP Control / CR GR/IR Clearing / CR Input VAT
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
    AccountTypeEnum,
    CompanyPostingSetup,
    CustomerFinanceExt,
    DrawerEnum,
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
    SaleItemFinanceExt,
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
# T-100.8.1 — Delivery posted / cancelled account-resolution helpers
# ---------------------------------------------------------------------------


async def _resolve_item_cogs_account_or_raise(
    db: AsyncSession,
    organization_id: str,
    item_id: str,
    item_code: str,
) -> str:
    """
    Look up sale_item_finance_ext and return cogsAccountId.

    Also validates that the resolved GL account is active and belongs to the
    COST_OF_SALES drawer with accountType=expense.

    Args:
        db: Active SQLAlchemy async session.
        organization_id: Owning organisation.
        item_id: UUID of the item from the delivery line.
        item_code: Item code (for error messages only).

    Returns:
        cogsAccountId string (non-null, non-empty, validated).

    Raises:
        HTTPException 400: If no ext row exists, cogsAccountId is null,
                           or the account is inactive / wrong type.
    """
    result = await db.execute(
        select(SaleItemFinanceExt).where(
            SaleItemFinanceExt.organizationId == organization_id,
            SaleItemFinanceExt.itemId == item_id,
        )
    )
    ext_row = result.scalar_one_or_none()
    if ext_row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Item {item_code} has no sale finance extension. "
                "Create a sale_item_finance_ext row for this item first."
            ),
        )
    if not ext_row.cogsAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Item {item_code} has no COGS account assigned. "
                "Set cogsAccountId via the Item GL Mapping page."
            ),
        )
    # Reason: validate at posting time that the assigned account is still
    # active, still in the COST_OF_SALES drawer, and accountType=expense.
    # Finance may have archived or re-typed the account since the mapping
    # was saved, so a runtime check prevents silent mis-postings.
    acct_result = await db.execute(
        select(GLAccount).where(GLAccount.accountId == ext_row.cogsAccountId)
    )
    acct = acct_result.scalar_one_or_none()
    if acct is None or not acct.isActive:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"COGS account for item {item_code} is inactive or not found. "
                "Re-assign cogsAccountId to an active account."
            ),
        )
    if acct.drawer != DrawerEnum.COST_OF_SALES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"COGS account for item {item_code} is in drawer '{acct.drawer.value}' "
                f"— must be COST_OF_SALES."
            ),
        )
    if acct.accountType != AccountTypeEnum.EXPENSE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"COGS account for item {item_code} has accountType "
                f"'{acct.accountType.value}' — must be expense."
            ),
        )
    return ext_row.cogsAccountId


async def _resolve_item_inventory_account_validated_or_raise(
    db: AsyncSession,
    organization_id: str,
    item_id: str,
    item_code: str,
) -> str:
    """
    Look up purchase_item_finance_ext.inventoryAccountId for the Delivery JE.

    Validates that the account is active and belongs to the ASSETS drawer
    with accountType=asset.  The inventory side of the COGS entry comes from
    the purchasing extension because items are received (and inventoried) on
    the purchasing side first.

    Args:
        db: Active SQLAlchemy async session.
        organization_id: Owning organisation.
        item_id: UUID of the item from the delivery line.
        item_code: Item code (for error messages only).

    Returns:
        inventoryAccountId string (non-null, non-empty, validated).

    Raises:
        HTTPException 400: If no ext row exists, inventoryAccountId is null,
                           or the account is inactive / wrong type.
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
                f"Item {item_code} has no purchase finance extension. "
                "Process a purchase_item_changed event for this item first."
            ),
        )
    if not ext_row.inventoryAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Item {item_code} has no inventory account assigned "
                f"in purchase_item_finance_ext. "
                "Set inventoryAccountId via the Item GL Mapping page."
            ),
        )
    # Reason: validate at posting time that the inventory account is still
    # active and is in the ASSETS drawer with accountType=asset.
    acct_result = await db.execute(
        select(GLAccount).where(GLAccount.accountId == ext_row.inventoryAccountId)
    )
    acct = acct_result.scalar_one_or_none()
    if acct is None or not acct.isActive:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Inventory account for item {item_code} is inactive or not found. "
                "Re-assign inventoryAccountId to an active account."
            ),
        )
    if acct.drawer != DrawerEnum.ASSETS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Inventory account for item {item_code} is in drawer "
                f"'{acct.drawer.value}' — must be ASSETS."
            ),
        )
    if acct.accountType != AccountTypeEnum.ASSET:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Inventory account for item {item_code} has accountType "
                f"'{acct.accountType.value}' — must be asset."
            ),
        )
    return ext_row.inventoryAccountId


# ---------------------------------------------------------------------------
# T-100.8.1 — delivery_posted posting handler (Wave 3 Phase 2)
# ---------------------------------------------------------------------------


async def _handle_delivery_posted(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle delivery_posted outbox events (T-100.8.1).

    Produces one Journal Entry with two lines per delivery line:
      DR  COGS account     (sale_item_finance_ext.cogsAccountId)   for lineCogs
      CR  Inventory account (purchase_item_finance_ext.inventoryAccountId) for lineCogs

    VAT is NOT recognised here — that happens at AR Invoice (T-100.9).
    This handler posts only the cost-of-goods-sold side of the delivery.

    Total line count = 2 × len(payload.lines).

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope with delivery_posted payload.

    Raises:
        HTTPException 400: For all permanent validation failures (no retry).
        HTTPException 500: For unexpected DB errors (consumer will retry).
    """
    from contracts.finance_events import DeliveryPostedPayload

    payload = DeliveryPostedPayload(**event.payload)
    org_id = str(event.organizationId)
    company_code = event.companyCode

    logger.info(
        "[Finance/Posting] handling delivery_posted dn=%s so=%s customer=%s lines=%d total_cogs=%s",
        payload.deliveryDocNumber,
        payload.sourceSoDocNumber,
        payload.customerName,
        len(payload.lines),
        payload.totalCogs,
    )

    # ------------------------------------------------------------------
    # 1. Resolve company posting setup (confirms company is configured)
    # ------------------------------------------------------------------
    await _resolve_posting_setup_or_raise(db, org_id, company_code)

    # ------------------------------------------------------------------
    # 2. Resolve COGS + Inventory accounts for each line — fail fast if
    #    anything is missing BEFORE any writes are made.
    # ------------------------------------------------------------------
    # Reason: resolve all accounts before opening the transaction so a
    # missing item config causes a clean 400 without any partial writes.
    line_accounts: list[tuple[Any, str, str]] = []
    for line in payload.lines:
        cogs_acct_id = await _resolve_item_cogs_account_or_raise(
            db, org_id, str(line.itemId), line.itemCode
        )
        inv_acct_id = await _resolve_item_inventory_account_validated_or_raise(
            db, org_id, str(line.itemId), line.itemCode
        )
        line_accounts.append((line, cogs_acct_id, inv_acct_id))

    # ------------------------------------------------------------------
    # 3. Resolve fiscal period from docDate (accounting date, not delivery date)
    # ------------------------------------------------------------------
    je_date = date.fromisoformat(payload.docDate)
    period_id = await _resolve_fiscal_period_or_raise(db, company_code, je_date)

    # ------------------------------------------------------------------
    # 4. Generate JE number (concurrent-safe MAX+1)
    # ------------------------------------------------------------------
    je_number = await _next_je_number(db, company_code, je_date.year)

    # ------------------------------------------------------------------
    # 5. Build and persist the JE atomically
    # ------------------------------------------------------------------
    # Reason: compute total from per-line lineCogs rather than trusting the
    # payload totalCogs so the DR and CR sides are always balanced.
    total_cogs = sum(line.lineCogs for line, _, _ in line_accounts)
    total_cogs_decimal = Decimal(str(total_cogs))

    description = (
        f"Delivery {payload.deliveryDocNumber} — Customer {payload.customerName}"
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
        sourceEventType="delivery_posted",
        sourceEventId=str(event.eventId),
        sourceDocId=payload.deliveryDocEntry,
        sourceDocNumber=payload.deliveryDocNumber,
        description=description,
        totalDebit=total_cogs_decimal,
        totalCredit=total_cogs_decimal,
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy="system",
    )
    db.add(je)

    # Insert DR (COGS) + CR (Inventory) lines per delivery line
    line_number = 1
    for line, cogs_acct_id, inv_acct_id in line_accounts:
        line_cogs = Decimal(str(line.lineCogs))
        line_desc = f"{line.itemCode} — qty {line.quantity}"

        # Debit COGS account
        dr_line = JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=line_number,
            accountId=cogs_acct_id,
            debit=line_cogs,
            credit=None,
            description=f"COGS: {line_desc}",
            # Reason: preserve back-link to the source SO line for audit trail.
            referenceLineId=str(line.sourceSoLineNumber),
            costCenterId=line.costCenterId,
        )
        db.add(dr_line)
        line_number += 1

        # Credit Inventory account
        cr_line = JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=line_number,
            accountId=inv_acct_id,
            debit=None,
            credit=line_cogs,
            description=f"Inventory: {line_desc}",
            referenceLineId=str(line.sourceSoLineNumber),
            costCenterId=line.costCenterId,
        )
        db.add(cr_line)
        line_number += 1

    # Reason: flush here so FK violations surface inside this handler
    # (consumer treats as 500 → retry) rather than in the outer commit path.
    await db.flush()

    logger.info(
        "[Finance/Posting] posted delivery JE jeNumber=%s jeId=%s "
        "lines=%d total_cogs=%s customer=%s",
        je_number,
        je_id,
        len(line_accounts) * 2,
        total_cogs_decimal,
        payload.customerName,
    )


# ---------------------------------------------------------------------------
# T-100.8.1 — delivery_cancelled reversal handler (Wave 3 Phase 2)
# ---------------------------------------------------------------------------


async def _handle_delivery_cancelled(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle delivery_cancelled outbox events (T-100.8.1).

    Finds the original delivery_posted JE by sourceEventId == payload.originalEventId
    and posts a reversing JE:
      - DR lines become CR lines (same accounts, same amounts)
      - CR lines become DR lines (same accounts, same amounts)

    The original JE remains POSTED (it is not voided). Both JEs live on the
    books and net to zero — standard accounting reversing-entry pattern.

    Uses today's date for the reversal (no backdating — standard SAP behaviour).

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope with delivery_cancelled payload.

    Raises:
        HTTPException 400: If the original JE is not found, or no open period
                           covers today. Caller (consumer) will retry.
        HTTPException 500: For unexpected DB errors (consumer will retry).
    """
    from sqlalchemy.orm import selectinload

    from contracts.finance_events import DeliveryCancelledPayload

    payload = DeliveryCancelledPayload(**event.payload)
    org_id = str(event.organizationId)
    company_code = event.companyCode
    original_event_id = payload.originalEventId

    logger.info(
        "[Finance/Posting] handling delivery_cancelled dn=%s original_event_id=%s",
        payload.deliveryDocNumber,
        original_event_id,
    )

    # ------------------------------------------------------------------
    # 1. Find the original delivery_posted JE by sourceEventId
    # ------------------------------------------------------------------
    orig_result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(
            JournalEntry.organizationId == org_id,
            JournalEntry.sourceEventType == "delivery_posted",
            JournalEntry.sourceEventId == original_event_id,
        )
    )
    original = orig_result.scalar_one_or_none()
    if original is None:
        # Reason: permanent error — operator must investigate why the original
        # JE does not exist. Consumer will retry; if the original event was
        # never processed this will eventually surface to a dead-letter alert.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No delivery_posted JE found for originalEventId={original_event_id}. "
                "The original delivery_posted event may not have been processed yet."
            ),
        )

    # ------------------------------------------------------------------
    # 2. Idempotency guard — check if a reversal JE already exists for this
    #    original event. Duplicate delivery_cancelled events are no-ops.
    # ------------------------------------------------------------------
    existing_reversal_result = await db.execute(
        select(JournalEntry.jeNumber).where(
            JournalEntry.organizationId == org_id,
            JournalEntry.sourceEventType == "delivery_cancelled",
            JournalEntry.sourceDocNumber == original.jeNumber,
        )
    )
    existing_reversal_number = existing_reversal_result.scalar_one_or_none()
    if existing_reversal_number is not None:
        logger.info(
            "[Finance/Posting] delivery_cancelled already reversed: "
            "original jeNumber=%s reversed by=%s — idempotent no-op",
            original.jeNumber,
            existing_reversal_number,
        )
        return

    # ------------------------------------------------------------------
    # 3. Resolve open fiscal period for today (reversals never backdate)
    # ------------------------------------------------------------------
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    today = now_utc.date()
    period_id = await _resolve_fiscal_period_or_raise(db, company_code, today)

    # ------------------------------------------------------------------
    # 4. Generate reversal JE number
    # ------------------------------------------------------------------
    reversal_je_number = await _next_je_number(db, company_code, today.year)

    # ------------------------------------------------------------------
    # 5. Build the reversal JE header
    # ------------------------------------------------------------------
    reversal_id = str(uuid.uuid4())
    reversal_je = JournalEntry(
        jeId=reversal_id,
        organizationId=org_id,
        companyCode=company_code,
        jeNumber=reversal_je_number,
        jeDate=today,
        periodId=period_id,
        sourceEventType="delivery_cancelled",
        sourceEventId=str(event.eventId),
        # Reason: sourceDocNumber points to original JE number so the ledger
        # shows a clear audit trail from the cancellation to its original entry.
        sourceDocId=original.jeId,
        sourceDocNumber=original.jeNumber,
        description=(
            f"Reversal of {original.jeNumber}: "
            f"Delivery {payload.deliveryDocNumber} cancelled"
        ),
        # Reason: swap totalDebit/totalCredit — the reversal header mirrors
        # the opposite entry direction (DR→CR, CR→DR).
        totalDebit=Decimal(str(original.totalCredit)),
        totalCredit=Decimal(str(original.totalDebit)),
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy="system",
    )
    db.add(reversal_je)

    # ------------------------------------------------------------------
    # 6. Build reversal lines — swap debit/credit for every original line
    # ------------------------------------------------------------------
    for line in original.lines:
        orig_debit = Decimal(str(line.debit)) if line.debit is not None else None
        orig_credit = Decimal(str(line.credit)) if line.credit is not None else None

        # Reason: original DR (COGS) → reversal CR; original CR (Inventory) → reversal DR.
        # This is the mathematical inverse that cancels the original posting.
        reversal_line = JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=reversal_id,
            lineNumber=line.lineNumber,
            accountId=line.accountId,
            debit=orig_credit,   # original CR (Inventory) → reversal DR
            credit=orig_debit,   # original DR (COGS) → reversal CR
            description=(
                f"Reversal: {line.description}" if line.description else "Reversal"
            ),
            referenceLineId=line.referenceLineId,
            costCenterId=line.costCenterId,
        )
        db.add(reversal_line)

    await db.flush()

    logger.info(
        "[Finance/Posting] posted delivery reversal JE jeNumber=%s jeId=%s "
        "original=%s customer=%s",
        reversal_je_number,
        reversal_id,
        original.jeNumber,
        payload.customerName,
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
# T-910 — AP Down Payment Invoice handler (ap_down_payment_posted)
# ---------------------------------------------------------------------------


async def _handle_ap_down_payment_posted(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle ap_down_payment_posted outbox events (T-910).

    Posts a Journal Entry recording a vendor prepayment when an AP Down
    Payment Invoice transitions PENDING_APPROVAL -> OPEN:

      DR  Vendor Advance   (totals.net  — prepaid-asset sub-ledger)
      DR  Input VAT        (totals.tax  — reclaimable, only if > 0)
      CR  AP Control       (totals.gross — vendor's specific liability)

    Kept deliberately simpler than _handle_ap_invoice_posted: no
    reverse-charge, no PPV, no cost-centre split. A down payment is a single
    vendor-level prepaid-asset movement, not yet tied to specific PO
    lines/cost centres — that attribution happens later when the DPI is
    applied against an AP Invoice.

    Balance proof:
      DR = net + tax = gross = CR  ✓

    Idempotency: handled by the outer ingest endpoint's outbox_events_processed
    table before this handler is called — a redelivered eventId short-circuits
    at the ingest layer and never reaches this function.

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope with ap_down_payment_posted payload.

    Raises:
        HTTPException 400: For all permanent validation failures (no retry).
        HTTPException 500: For unexpected DB errors (consumer will retry).
    """
    from contracts.finance_events import ApDownPaymentPostedPayload

    payload = ApDownPaymentPostedPayload(**event.payload)
    org_id = str(event.organizationId)
    # Reason: ApDownPaymentPostedPayload has no companyCode field of its own —
    # the envelope carries it, same pattern as _handle_credit_note_posted.
    company_code = event.companyCode

    total_net = Decimal(str(payload.totals.get("net", "0")))
    total_tax = Decimal(str(payload.totals.get("tax", "0")))
    total_gross = Decimal(str(payload.totals.get("gross", "0")))
    vendor_label = payload.vendorName or payload.vendorId

    logger.info(
        "[Finance/Posting] handling ap_down_payment_posted dpi=%s vendor=%s "
        "net=%s tax=%s gross=%s",
        payload.dpiDocNumber,
        vendor_label,
        total_net,
        total_tax,
        total_gross,
    )

    # ------------------------------------------------------------------
    # 1. Resolve company posting setup
    # ------------------------------------------------------------------
    setup = await _resolve_posting_setup_or_raise(db, org_id, company_code)

    has_vat = total_tax > Decimal("0")

    # ------------------------------------------------------------------
    # 2. Validate required GL accounts are configured
    # ------------------------------------------------------------------
    if not setup.apControlAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"AP Control account (apControlAccountId) not configured in posting setup "
                f"for company {company_code}. Configure via the Posting Setup page."
            ),
        )

    if not setup.vendorAdvanceAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Vendor Advance account (vendorAdvanceAccountId) not configured in "
                f"posting setup for company {company_code}. Configure via the Posting "
                "Setup page."
            ),
        )

    # Reason: inputVatAccountId is only required when the DPI carries non-zero
    # tax. A zero-rated / no-tax down payment does not post a VAT line and does
    # not need the account configured.
    if has_vat and not setup.inputVatAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Input VAT account (inputVatAccountId) not configured in posting setup "
                f"for company {company_code}, but down payment {payload.dpiDocNumber} "
                f"carries non-zero tax ({total_tax}). Configure the Input VAT account first."
            ),
        )

    # ------------------------------------------------------------------
    # 3. Resolve fiscal period from docDate
    # ------------------------------------------------------------------
    je_date = date.fromisoformat(payload.docDate)
    period_id = await _resolve_fiscal_period_or_raise(db, company_code, je_date)

    # ------------------------------------------------------------------
    # 4. Generate JE number (concurrent-safe MAX+1)
    # ------------------------------------------------------------------
    je_number = await _next_je_number(db, company_code, je_date.year)

    # ------------------------------------------------------------------
    # 5. Balance verification
    # ------------------------------------------------------------------
    dr_total = total_net + total_tax
    cr_total = total_gross
    assert abs(dr_total - cr_total) <= Decimal("0.01"), (
        f"JE imbalance! DR={dr_total} CR={cr_total} for dpi={payload.dpiDocNumber}"
    )

    # ------------------------------------------------------------------
    # 6. Build and persist the JE atomically
    # ------------------------------------------------------------------
    je_id = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

    description = f"AP Down Payment — {payload.dpiDocNumber} to {vendor_label}"

    je = JournalEntry(
        jeId=je_id,
        organizationId=org_id,
        companyCode=company_code,
        jeNumber=je_number,
        jeDate=je_date,
        periodId=period_id,
        sourceEventType="ap_down_payment_posted",
        sourceEventId=str(event.eventId),
        sourceDocId=str(payload.dpiDocId),
        sourceDocNumber=payload.dpiDocNumber,
        description=description,
        totalDebit=dr_total,
        totalCredit=cr_total,
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy="system",
    )
    db.add(je)

    line_num = 1

    # ------------------------------------------------------------------
    # Line 1: DR Vendor Advance — the prepaid-asset leg.
    # ------------------------------------------------------------------
    db.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()),
        jeId=je_id,
        lineNumber=line_num,
        accountId=setup.vendorAdvanceAccountId,
        debit=total_net,
        credit=None,
        description=f"Vendor advance — {vendor_label}",
        # Reason: store vendorId in referenceLineId so the sub-ledger has the
        # vendor link even before a dedicated AP sub-ledger table exists.
        referenceLineId=str(payload.vendorId),
    ))
    line_num += 1

    # ------------------------------------------------------------------
    # Line 2 (conditional): DR Input VAT — reclaimable VAT (only if > 0).
    # ------------------------------------------------------------------
    if has_vat:
        db.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=line_num,
            accountId=setup.inputVatAccountId,
            debit=total_tax,
            credit=None,
            description=f"Input VAT — {payload.dpiDocNumber}",
        ))
        line_num += 1

    # ------------------------------------------------------------------
    # Last line: CR AP Control — vendor's specific liability for the advance.
    # ------------------------------------------------------------------
    db.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()),
        jeId=je_id,
        lineNumber=line_num,
        accountId=setup.apControlAccountId,
        debit=None,
        credit=total_gross,
        description=f"AP — {vendor_label} (down payment)",
        referenceLineId=str(payload.vendorId),
    ))

    # Reason: flush here so FK violations surface inside this handler
    # rather than in the outer commit path where they are harder to attribute.
    await db.flush()

    logger.info(
        "[Finance/Posting] posted JE jeNumber=%s jeId=%s sourceDoc=%s "
        "net=%s tax=%s gross=%s",
        je_number,
        je_id,
        payload.dpiDocNumber,
        total_net,
        total_tax,
        total_gross,
    )


# ---------------------------------------------------------------------------
# T-910 — AP Credit Note handler (ap_credit_note_posted)
# ---------------------------------------------------------------------------


async def _handle_ap_credit_note_posted(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle ap_credit_note_posted outbox events (T-910).

    Posts a Journal Entry that reverses an AP Invoice bill:

      DR  AP Control      (totals.gross — reduces the vendor liability)
      CR  GR/IR Clearing  (per line.lineNet, bucketed by line.costCenterId —
                           mirrors the cost-centre split _handle_ap_invoice_posted
                           applies on the DEBIT side, but reversed here)
      CR  Input VAT       (totals.tax — VAT reduction, only if > 0)

    TODO(reverse-charge): _handle_ap_invoice_posted resolves each line's
    taxCode via _lookup_tax_code_reverse_charge and routes reverse-charge
    (SR) lines through a symmetric CR Input VAT / DR Output VAT pair instead
    of a plain CR Input VAT leg, with AP credit reduced to lineNet only for
    those lines. It is NOT yet confirmed whether AP Credit Notes can carry
    reverse-charge tax codes in production (an ACN is typically raised
    against an already-received local bill, not an imported-service /
    designated-zone purchase). This handler therefore implements only the
    standard (non-RC) path — deliberately, rather than guessing a
    self-accounting entry that has never been verified against a real
    reverse-charge ACN. If/when a reverse-charge ACN is confirmed, mirror
    the ap_invoice_posted per-line RC branch here, reversed: for RC lines,
    CR Input VAT + DR Output VAT (both totals.tax for that line) and CR AP
    Control = lineNet only for those lines.

    Balance proof:
      DR = total_gross
      CR = sum(line.lineNet for all lines) + total_tax
         = total_net + total_tax = total_gross  ✓

    Idempotency: handled by the outer ingest endpoint's outbox_events_processed
    table before this handler is called — a redelivered eventId short-circuits
    at the ingest layer and never reaches this function.

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope with ap_credit_note_posted payload.

    Raises:
        HTTPException 400: For all permanent validation failures (no retry).
        HTTPException 500: For unexpected DB errors (consumer will retry).
    """
    from contracts.finance_events import ApCreditNotePostedPayload

    payload = ApCreditNotePostedPayload(**event.payload)
    org_id = str(event.organizationId)
    # Reason: ApCreditNotePostedPayload has no companyCode field of its own —
    # the envelope carries it, same pattern as _handle_credit_note_posted.
    company_code = event.companyCode

    total_net = Decimal(str(payload.totals.get("net", "0")))
    total_tax = Decimal(str(payload.totals.get("tax", "0")))
    total_gross = Decimal(str(payload.totals.get("gross", "0")))
    vendor_label = payload.vendorName or payload.vendorId

    logger.info(
        "[Finance/Posting] handling ap_credit_note_posted acn=%s vendor=%s "
        "net=%s tax=%s gross=%s lines=%d",
        payload.acnDocNumber,
        vendor_label,
        total_net,
        total_tax,
        total_gross,
        len(payload.lines),
    )

    # ------------------------------------------------------------------
    # 1. Resolve company posting setup
    # ------------------------------------------------------------------
    setup = await _resolve_posting_setup_or_raise(db, org_id, company_code)

    has_vat = total_tax > Decimal("0")

    # ------------------------------------------------------------------
    # 2. Validate required GL accounts are configured
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

    # Reason: inputVatAccountId is only required when the ACN carries non-zero tax.
    if has_vat and not setup.inputVatAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Input VAT account (inputVatAccountId) not configured in posting setup "
                f"for company {company_code}, but credit note {payload.acnDocNumber} "
                f"carries non-zero tax ({total_tax}). Configure the Input VAT account first."
            ),
        )

    # ------------------------------------------------------------------
    # 3. Bucket lineNet per costCenterId (mirrors _handle_ap_invoice_posted's
    #    DR GR/IR split, but on the CREDIT side here). Insertion-ordered dict
    #    preserves first-seen order so JE lines emit in a stable,
    #    line-order-driven sequence. Lines without a cost centre collapse
    #    into a single (None-keyed) bucket.
    # ------------------------------------------------------------------
    cc_buckets: Dict[Optional[str], Decimal] = {}
    for line in payload.lines:
        line_net = Decimal(str(line.lineNet))
        cc_id = line.costCenterId
        cc_buckets[cc_id] = cc_buckets.get(cc_id, Decimal("0")) + line_net

    # ------------------------------------------------------------------
    # 4. Resolve fiscal period from docDate
    # ------------------------------------------------------------------
    je_date = date.fromisoformat(payload.docDate)
    period_id = await _resolve_fiscal_period_or_raise(db, company_code, je_date)

    # ------------------------------------------------------------------
    # 5. Generate JE number (concurrent-safe MAX+1)
    # ------------------------------------------------------------------
    je_number = await _next_je_number(db, company_code, je_date.year)

    # ------------------------------------------------------------------
    # 6. Balance verification
    # ------------------------------------------------------------------
    total_gr_ir_credit = sum(cc_buckets.values(), Decimal("0"))
    dr_total = total_gross
    cr_total = total_gr_ir_credit + total_tax
    assert abs(dr_total - cr_total) <= Decimal("0.01"), (
        f"JE imbalance! DR={dr_total} CR={cr_total} for acn={payload.acnDocNumber}"
    )

    # ------------------------------------------------------------------
    # 7. Build and persist the JE atomically
    # ------------------------------------------------------------------
    je_id = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

    description = f"AP Credit Note — {payload.acnDocNumber} from {vendor_label}"

    je = JournalEntry(
        jeId=je_id,
        organizationId=org_id,
        companyCode=company_code,
        jeNumber=je_number,
        jeDate=je_date,
        periodId=period_id,
        sourceEventType="ap_credit_note_posted",
        sourceEventId=str(event.eventId),
        sourceDocId=str(payload.acnDocId),
        sourceDocNumber=payload.acnDocNumber,
        description=description,
        totalDebit=dr_total,
        totalCredit=cr_total,
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy="system",
    )
    db.add(je)

    line_num = 1

    # ------------------------------------------------------------------
    # Line 1: DR AP Control — reduces the vendor's specific liability.
    # ------------------------------------------------------------------
    db.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()),
        jeId=je_id,
        lineNumber=line_num,
        accountId=setup.apControlAccountId,
        debit=total_gross,
        credit=None,
        description=f"AP reduction — {vendor_label}",
        referenceLineId=str(payload.vendorId),
    ))
    line_num += 1

    # ------------------------------------------------------------------
    # Line 2+: CR GR/IR Clearing — one JE line per distinct costCenterId.
    # Sum of all CR GR/IR line credits == total_net (preserves balance).
    # ------------------------------------------------------------------
    for cc_id, bucket_net in cc_buckets.items():
        if bucket_net == Decimal("0"):
            continue  # skip empty buckets (no real-money posting)
        cc_suffix = f" (CC {cc_id})" if cc_id else ""
        db.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=line_num,
            accountId=setup.grIrClearingAccountId,
            debit=None,
            credit=bucket_net,
            description=f"GR/IR reversal — {payload.acnDocNumber}{cc_suffix}",
            costCenterId=cc_id,
        ))
        line_num += 1

    # ------------------------------------------------------------------
    # Last line (conditional): CR Input VAT — VAT reduction (only if > 0).
    # ------------------------------------------------------------------
    if has_vat:
        db.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=line_num,
            accountId=setup.inputVatAccountId,
            debit=None,
            credit=total_tax,
            description=f"Input VAT reversal — {payload.acnDocNumber}",
        ))
        line_num += 1

    # Reason: flush here so FK violations surface inside this handler
    # rather than in the outer commit path where they are harder to attribute.
    await db.flush()

    logger.info(
        "[Finance/Posting] posted JE jeNumber=%s jeId=%s sourceDoc=%s "
        "ap_debit=%s gr_ir_credit=%s input_vat_credit=%s total=%s",
        je_number,
        je_id,
        payload.acnDocNumber,
        total_gross,
        total_gr_ir_credit,
        total_tax,
        cr_total,
    )


# ---------------------------------------------------------------------------
# T-100.9b — AR invoice handlers (sales_invoice_posted / cancelled)
# ---------------------------------------------------------------------------


async def _resolve_ar_control_account_or_raise(
    db: AsyncSession,
    org_id: str,
    company_code: str,
    customer_id: str,
    setup: CompanyPostingSetup,
) -> str:
    """
    Resolve the AR control account for a sales invoice via the 3-tier chain.

    Priority:
      Tier 1: customer_finance_ext.arControlAccountId (per-customer override)
      Tier 2: company_posting_setup.arControlAccountId (company default)
      Tier 3: gl_accounts lookup by accountNumber '124000-001' (system fallback)

    The resolved account is validated:
      - Must be active
      - Must have drawer=ASSETS, accountType=asset
      - Must not be a header account

    Args:
        db: Active SQLAlchemy async session.
        org_id: Organisation scope.
        company_code: Company code (for error messages).
        customer_id: MongoDB customer document ID string.
        setup: Loaded CompanyPostingSetup for this company.

    Returns:
        Resolved AR control account GL account UUID string.

    Raises:
        HTTPException 400: If all three tiers fail to yield an account,
                           or if the resolved account is inactive / wrong type.
    """
    ar_account_id: Optional[str] = None

    # ------------------------------------------------------------------
    # Tier 1: per-customer override in customer_finance_ext
    # ------------------------------------------------------------------
    cust_ext_result = await db.execute(
        select(CustomerFinanceExt.arControlAccountId).where(
            CustomerFinanceExt.organizationId == org_id,
            CustomerFinanceExt.customerId == customer_id,
        )
    )
    cust_ext_ar = cust_ext_result.scalar_one_or_none()
    if cust_ext_ar:
        ar_account_id = cust_ext_ar

    # ------------------------------------------------------------------
    # Tier 2: company posting setup default
    # ------------------------------------------------------------------
    if not ar_account_id and setup.arControlAccountId:
        ar_account_id = setup.arControlAccountId

    # ------------------------------------------------------------------
    # Tier 3: system fallback — lookup by account number '124000-001'
    # ------------------------------------------------------------------
    if not ar_account_id:
        fallback_result = await db.execute(
            select(GLAccount.accountId).where(
                GLAccount.organizationId == org_id,
                GLAccount.accountNumber == "124000-001",
                GLAccount.isActive == True,  # noqa: E712
            )
        )
        ar_account_id = fallback_result.scalar_one_or_none()

    if not ar_account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No AR control account found for customer {customer_id} in company "
                f"{company_code}. Set customer_finance_ext.arControlAccountId, "
                f"company_posting_setup.arControlAccountId, or ensure account "
                f"124000-001 (Trade Receivables - Customers) exists and is active."
            ),
        )

    # ------------------------------------------------------------------
    # Validate the resolved account
    # ------------------------------------------------------------------
    acct_result = await db.execute(
        select(GLAccount).where(GLAccount.accountId == ar_account_id)
    )
    acct = acct_result.scalar_one_or_none()
    if acct is None or not acct.isActive:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Resolved AR control account {ar_account_id} is inactive or not found. "
                "Re-assign arControlAccountId to an active account."
            ),
        )
    if acct.isHeader:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Resolved AR control account {acct.accountNumber} '{acct.accountName}' "
                f"is a header account — posting to header accounts is not allowed. "
                "Use a leaf (detail) account."
            ),
        )
    if acct.drawer != DrawerEnum.ASSETS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Resolved AR control account {acct.accountNumber} '{acct.accountName}' "
                f"is in drawer '{acct.drawer.value}' — AR control account must be ASSETS."
            ),
        )
    if acct.accountType != AccountTypeEnum.ASSET:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Resolved AR control account {acct.accountNumber} '{acct.accountName}' "
                f"has accountType '{acct.accountType.value}' — must be asset."
            ),
        )
    return ar_account_id


async def _validate_revenue_account_or_raise(
    db: AsyncSession,
    account_id: str,
    item_code: str,
    line_number: int,
) -> None:
    """
    Validate that a revenue account is active, non-header, drawer=REVENUE,
    accountType=revenue.

    Args:
        db: Active SQLAlchemy async session.
        account_id: The revenueAccountId from the invoice line.
        item_code: Item code (for error messages).
        line_number: Line number (for error messages).

    Raises:
        HTTPException 400: If the account fails any validation check.
    """
    acct_result = await db.execute(
        select(GLAccount).where(GLAccount.accountId == account_id)
    )
    acct = acct_result.scalar_one_or_none()
    if acct is None or not acct.isActive:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Revenue account {account_id} for line {line_number} (item {item_code}) "
                f"is inactive or not found. Re-assign revenueAccountId to an active account."
            ),
        )
    if acct.isHeader:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Revenue account {acct.accountNumber} '{acct.accountName}' "
                f"on line {line_number} (item {item_code}) is a header account — "
                "posting to header accounts is not allowed. Use a leaf account."
            ),
        )
    if acct.drawer != DrawerEnum.REVENUE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Revenue account {acct.accountNumber} '{acct.accountName}' "
                f"on line {line_number} (item {item_code}) is in drawer "
                f"'{acct.drawer.value}' — must be REVENUE."
            ),
        )
    if acct.accountType != AccountTypeEnum.REVENUE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Revenue account {acct.accountNumber} '{acct.accountName}' "
                f"on line {line_number} (item {item_code}) has accountType "
                f"'{acct.accountType.value}' — must be revenue."
            ),
        )


async def _validate_bank_account_or_raise(
    db: AsyncSession,
    org_id: str,
    account_id: str,
) -> "GLAccount":
    """
    Validate that account_id is an active, non-header, ASSETS/asset GL account.

    Used as the DR side of an incoming customer payment JE (Dr Bank / Cr AR).

    Args:
        db: Active SQLAlchemy async session.
        org_id: Organisation scope (cross-org protection).
        account_id: The bankAccountId from the CustomerPaymentReceivedPayload.

    Returns:
        The validated GLAccount ORM object.

    Raises:
        HTTPException 400: If the account is not found, inactive, a header account,
                           wrong drawer (not ASSETS), or wrong accountType (not asset).
    """
    acct_result = await db.execute(
        select(GLAccount).where(
            GLAccount.accountId == account_id,
            GLAccount.organizationId == org_id,
        )
    )
    acct = acct_result.scalar_one_or_none()
    if acct is None or not acct.isActive:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Bank account '{account_id}' is not found or inactive in this organisation. "
                "Assign an active GL account as the bank account before recording payments."
            ),
        )
    if acct.isHeader:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Bank account {acct.accountNumber} '{acct.accountName}' is a header account — "
                "posting to header accounts is not allowed. Use a leaf (detail) account."
            ),
        )
    if acct.drawer != DrawerEnum.ASSETS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Bank account {acct.accountNumber} '{acct.accountName}' is in drawer "
                f"'{acct.drawer.value}' — bank/cash accounts must be in the ASSETS drawer."
            ),
        )
    if acct.accountType != AccountTypeEnum.ASSET:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Bank account {acct.accountNumber} '{acct.accountName}' has accountType "
                f"'{acct.accountType.value}' — must be asset."
            ),
        )
    return acct


async def _handle_sales_invoice_posted(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle sales_invoice_posted outbox events (T-100.9b).

    Posts a Journal Entry that recognises revenue and creates the AR receivable:

      DR  AR Control Account          totals.gross
              (resolved via 3-tier chain: customer_finance_ext →
               company_posting_setup → 124000-001 account number lookup)
      CR  Revenue (per line)          line.lineNet  per revenueAccountId
              (one credit line per invoice line, tagged with costCenterId)
      CR  Output VAT (combined)       totals.tax    from setup.outputVatAccountId
              (one combined line for the whole invoice; skipped if totals.tax == 0)

    Down payment netting is NOT supported in v1 (totals.downPaymentApplied expected
    to be 0). Cash-sale flow (combined Invoice + Payment) is a separate future path.

    Idempotency: the outer ingest endpoint deduplicates on event_id via the
    outbox_events_processed table before calling this handler — no explicit
    guard is needed inside this function.

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope with sales_invoice_posted payload.

    Raises:
        HTTPException 400: For all permanent validation failures (no retry).
        HTTPException 500: For unexpected DB errors (consumer will retry).
    """
    from contracts.finance_events import SalesInvoicePostedPayload

    payload = SalesInvoicePostedPayload(**event.payload)
    org_id = str(event.organizationId)
    company_code = event.companyCode

    totals = payload.totals
    total_gross = Decimal(str(totals.get("gross", "0")))
    total_tax = Decimal(str(totals.get("tax", "0")))
    total_net = Decimal(str(totals.get("net", "0")))

    logger.info(
        "[Finance/Posting] handling sales_invoice_posted ari=%s customer=%s "
        "net=%s tax=%s gross=%s lines=%d",
        payload.arInvoiceDocNumber,
        payload.customerName,
        total_net,
        total_tax,
        total_gross,
        len(payload.lines),
    )

    # ------------------------------------------------------------------
    # 1. Resolve company posting setup
    # ------------------------------------------------------------------
    setup = await _resolve_posting_setup_or_raise(db, org_id, company_code)

    # ------------------------------------------------------------------
    # 2. Validate outputVatAccountId is configured when VAT is non-zero
    # ------------------------------------------------------------------
    has_vat = total_tax > Decimal("0.0001")
    if has_vat and not setup.outputVatAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Output VAT account (outputVatAccountId) not configured in posting setup "
                f"for company {company_code}, but invoice {payload.arInvoiceDocNumber} "
                f"carries non-zero tax ({total_tax}). Configure the Output VAT account first."
            ),
        )

    # ------------------------------------------------------------------
    # 3. Resolve AR control account via 3-tier chain
    # ------------------------------------------------------------------
    ar_account_id = await _resolve_ar_control_account_or_raise(
        db, org_id, company_code, payload.customerId, setup
    )

    # ------------------------------------------------------------------
    # 4. Validate all revenue accounts before any writes
    # ------------------------------------------------------------------
    # Reason: fail fast — resolve and validate all accounts before any writes
    # so a misconfigured line causes a clean 400 with no partial JE in DB.
    for line in payload.lines:
        await _validate_revenue_account_or_raise(
            db, line.revenueAccountId, line.itemCode, line.lineNumber
        )

    # ------------------------------------------------------------------
    # 5. Resolve fiscal period from docDate
    # ------------------------------------------------------------------
    je_date = date.fromisoformat(payload.docDate)
    period_id = await _resolve_fiscal_period_or_raise(db, company_code, je_date)

    # ------------------------------------------------------------------
    # 6. Generate JE number (concurrent-safe MAX+1)
    # ------------------------------------------------------------------
    je_number = await _next_je_number(db, company_code, je_date.year)

    # ------------------------------------------------------------------
    # 7. Compute sum of revenue lines from payload to verify balance
    # ------------------------------------------------------------------
    # Reason: compute total net from lines rather than trusting totals.net
    # so the DR == CR invariant is always derived from the actual lines posted.
    total_revenue_net = sum(Decimal(str(line.lineNet)) for line in payload.lines)

    # Balance proof:
    #   DR = total_gross (= total_net + total_tax)
    #   CR = total_revenue_net (per line) + total_tax (output VAT)
    #      = total_net + total_tax = total_gross  ✓
    # Assert within 0.01 tolerance (rounding on multi-line invoices)
    dr_total = total_gross
    cr_total = total_revenue_net + total_tax
    assert abs(dr_total - cr_total) <= Decimal("0.01"), (
        f"JE imbalance! DR={dr_total} CR={cr_total} for ari={payload.arInvoiceDocNumber}"
    )

    # ------------------------------------------------------------------
    # 8. Build JE header
    # ------------------------------------------------------------------
    je_id = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

    description = (
        f"AR Invoice {payload.arInvoiceDocNumber} — "
        f"Customer {payload.customerName}, "
        f"ref {payload.bpRefNo or 'n/a'}"
    )

    je = JournalEntry(
        jeId=je_id,
        organizationId=org_id,
        companyCode=company_code,
        jeNumber=je_number,
        jeDate=je_date,
        periodId=period_id,
        sourceEventType="sales_invoice_posted",
        sourceEventId=str(event.eventId),
        sourceDocId=payload.arInvoiceDocEntry,
        sourceDocNumber=payload.arInvoiceDocNumber,
        description=description,
        totalDebit=dr_total,
        totalCredit=cr_total,
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy="system",
    )
    db.add(je)

    line_num = 1

    # ------------------------------------------------------------------
    # 9. Line 1: DR AR Control Account for total_gross
    # ------------------------------------------------------------------
    db.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()),
        jeId=je_id,
        lineNumber=line_num,
        accountId=ar_account_id,
        debit=total_gross,
        credit=None,
        description=f"AR — Customer {payload.customerName}",
        # Reason: store customerId in referenceLineId for sub-ledger linkage
        # before a dedicated AR sub-ledger table exists. Free-form per ORM comment.
        referenceLineId=str(payload.customerId),
    ))
    line_num += 1

    # ------------------------------------------------------------------
    # 10. Per-line: CR Revenue (one line per invoice line)
    # ------------------------------------------------------------------
    for line in payload.lines:
        line_net = Decimal(str(line.lineNet))
        db.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=line_num,
            accountId=line.revenueAccountId,
            debit=None,
            credit=line_net,
            description=f"Revenue: {line.itemCode}",
            referenceLineId=str(line.lineNumber),
            costCenterId=line.costCenterId,
        ))
        line_num += 1

    # ------------------------------------------------------------------
    # 11. CR Output VAT (one combined line, only if tax > 0)
    # ------------------------------------------------------------------
    if has_vat:
        db.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=line_num,
            accountId=setup.outputVatAccountId,
            debit=None,
            credit=total_tax,
            # Reason: embed tax_date (UAE VAT tax-point date) in description
            # for FTA audit traceability, mirroring the AP invoice convention.
            description=f"Output VAT — tax_date {payload.taxDate}",
        ))
        line_num += 1  # noqa: F841 — kept for symmetry

    # Reason: flush here so FK violations surface inside this handler
    # rather than in the outer commit path where they are harder to attribute.
    await db.flush()

    logger.info(
        "[Finance/Posting] posted AR invoice JE jeNumber=%s jeId=%s "
        "ari=%s ar_account=%s revenue=%s output_vat=%s total=%s lines=%d",
        je_number,
        je_id,
        payload.arInvoiceDocNumber,
        ar_account_id,
        total_revenue_net,
        total_tax,
        dr_total,
        line_num - 1,
    )


async def _handle_sales_invoice_cancelled(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle sales_invoice_cancelled outbox events (T-100.9b).

    Finds the original sales_invoice_posted JE by
    sourceEventId == payload.originalEventId and posts a reversing JE:
      - DR lines become CR lines (same accounts, same amounts)
      - CR lines become DR lines (same accounts, same amounts)

    The original JE remains POSTED (it is not voided). Both JEs live on the
    books and net to zero — standard accounting reversing-entry pattern,
    mirroring the delivery_cancelled reversal in T-100.8.1.

    Idempotency: if a reversal JE already exists with
    sourceEventType='sales_invoice_cancelled' pointing to the same original
    JE number, this handler returns silently (no-op). The outer ingest
    endpoint's outbox_events_processed check handles true event-id duplicates.

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope with sales_invoice_cancelled payload.

    Raises:
        HTTPException 400: If the original JE is not found, or no open period
                           covers today. Permanent failure (no retry).
        HTTPException 500: For unexpected DB errors (consumer will retry).
    """
    from sqlalchemy.orm import selectinload

    from contracts.finance_events import SalesInvoiceCancelledPayload

    payload = SalesInvoiceCancelledPayload(**event.payload)
    org_id = str(event.organizationId)
    company_code = event.companyCode
    original_event_id = payload.originalEventId

    logger.info(
        "[Finance/Posting] handling sales_invoice_cancelled ari=%s original_event_id=%s",
        payload.arInvoiceDocNumber,
        original_event_id,
    )

    # ------------------------------------------------------------------
    # 1. Find the original sales_invoice_posted JE by sourceEventId
    # ------------------------------------------------------------------
    orig_result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(
            JournalEntry.organizationId == org_id,
            JournalEntry.sourceEventType == "sales_invoice_posted",
            JournalEntry.sourceEventId == original_event_id,
        )
    )
    original = orig_result.scalar_one_or_none()
    if original is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No sales_invoice_posted JE found for originalEventId={original_event_id}. "
                "The original sales_invoice_posted event may not have been processed yet."
            ),
        )

    # ------------------------------------------------------------------
    # 2. Idempotency guard — check if a reversal JE already exists for
    #    this original JE. Duplicate cancellation events are no-ops.
    # ------------------------------------------------------------------
    existing_reversal_result = await db.execute(
        select(JournalEntry.jeNumber).where(
            JournalEntry.organizationId == org_id,
            JournalEntry.sourceEventType == "sales_invoice_cancelled",
            JournalEntry.sourceDocNumber == original.jeNumber,
        )
    )
    existing_reversal_number = existing_reversal_result.scalar_one_or_none()
    if existing_reversal_number is not None:
        logger.info(
            "[Finance/Posting] sales_invoice_cancelled already reversed: "
            "original jeNumber=%s reversed by=%s — idempotent no-op",
            original.jeNumber,
            existing_reversal_number,
        )
        return

    # ------------------------------------------------------------------
    # 3. Resolve open fiscal period for today (reversals never backdate)
    # ------------------------------------------------------------------
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    today = now_utc.date()
    period_id = await _resolve_fiscal_period_or_raise(db, company_code, today)

    # ------------------------------------------------------------------
    # 4. Generate reversal JE number
    # ------------------------------------------------------------------
    reversal_je_number = await _next_je_number(db, company_code, today.year)

    # ------------------------------------------------------------------
    # 5. Build the reversal JE header
    # ------------------------------------------------------------------
    reversal_id = str(uuid.uuid4())
    reversal_je = JournalEntry(
        jeId=reversal_id,
        organizationId=org_id,
        companyCode=company_code,
        jeNumber=reversal_je_number,
        jeDate=today,
        periodId=period_id,
        sourceEventType="sales_invoice_cancelled",
        sourceEventId=str(event.eventId),
        # Reason: sourceDocNumber points to the original JE number so the ledger
        # shows a clear audit trail from the cancellation to its original entry.
        sourceDocId=original.jeId,
        sourceDocNumber=original.jeNumber,
        description=(
            f"Reversal of {original.jeNumber}: "
            f"AR Invoice {payload.arInvoiceDocNumber} cancelled"
        ),
        # Reason: swap totalDebit/totalCredit — the reversal header mirrors
        # the opposite entry direction (DR→CR, CR→DR).
        totalDebit=Decimal(str(original.totalCredit)),
        totalCredit=Decimal(str(original.totalDebit)),
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy="system",
    )
    db.add(reversal_je)

    # ------------------------------------------------------------------
    # 6. Build reversal lines — swap debit/credit for every original line
    # ------------------------------------------------------------------
    for line in original.lines:
        orig_debit = Decimal(str(line.debit)) if line.debit is not None else None
        orig_credit = Decimal(str(line.credit)) if line.credit is not None else None

        # Reason: original DR (AR) → reversal CR; original CR (Revenue/VAT) → reversal DR.
        reversal_line = JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=reversal_id,
            lineNumber=line.lineNumber,
            accountId=line.accountId,
            debit=orig_credit,    # original CR (Revenue/VAT) → reversal DR
            credit=orig_debit,    # original DR (AR) → reversal CR
            description=(
                f"Reversal: {line.description}" if line.description else "Reversal"
            ),
            referenceLineId=line.referenceLineId,
            costCenterId=line.costCenterId,
        )
        db.add(reversal_line)

    await db.flush()

    logger.info(
        "[Finance/Posting] posted AR invoice reversal JE jeNumber=%s jeId=%s "
        "original=%s customer=%s",
        reversal_je_number,
        reversal_id,
        original.jeNumber,
        payload.customerName,
    )


async def _handle_customer_payment_received(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle customer_payment_received outbox events (T-100.10.1).

    Posts a single 2-line Journal Entry that records cash collection:

      DR  Bank / Cash Account       (payload.bankAccountId)    for amountReceived
      CR  AR Control Account        (3-tier chain resolution)  for amountReceived

    The JE is intentionally flat: one DR and one CR regardless of how many
    invoice allocations are in the payload. Allocation detail lives in the
    operations sub-ledger; the finance ledger records only the net cash movement.

    AR control account resolution uses the same 3-tier chain as
    _handle_sales_invoice_posted (customer_finance_ext → posting_setup → 124000-001).

    Idempotency: the outer ingest endpoint deduplicates on event_id via the
    outbox_events_processed table before calling this handler — no explicit
    guard is needed inside this function.

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope with customer_payment_received payload.

    Raises:
        HTTPException 400: For all permanent validation failures (no retry).
        HTTPException 500: For unexpected DB errors (consumer will retry).
    """
    from contracts.finance_events import CustomerPaymentReceivedPayload

    payload = CustomerPaymentReceivedPayload(**event.payload)
    org_id = str(event.organizationId)
    company_code = event.companyCode

    allocation_numbers = ", ".join(
        a.arInvoiceDocNumber for a in payload.allocations
    )
    logger.info(
        "[Finance/Posting] handling customer_payment_received receipt=%s customer=%s "
        "amount=%s method=%s allocations=[%s]",
        payload.receiptDocNumber,
        payload.customerName,
        payload.amountReceived,
        payload.paymentMethod,
        allocation_numbers,
    )

    # ------------------------------------------------------------------
    # 1. Validate bank account (DR side)
    # ------------------------------------------------------------------
    await _validate_bank_account_or_raise(db, org_id, payload.bankAccountId)

    # ------------------------------------------------------------------
    # 2. Resolve company posting setup (needed for AR 3-tier chain tier 2)
    # ------------------------------------------------------------------
    setup = await _resolve_posting_setup_or_raise(db, org_id, company_code)

    # ------------------------------------------------------------------
    # 3. Resolve AR control account via 3-tier chain (CR side)
    # ------------------------------------------------------------------
    ar_account_id = await _resolve_ar_control_account_or_raise(
        db, org_id, company_code, payload.customerId, setup
    )

    # ------------------------------------------------------------------
    # 4. Resolve fiscal period from docDate
    # ------------------------------------------------------------------
    je_date = date.fromisoformat(payload.docDate)
    period_id = await _resolve_fiscal_period_or_raise(db, company_code, je_date)

    # ------------------------------------------------------------------
    # 5. Generate JE number (concurrent-safe MAX+1)
    # ------------------------------------------------------------------
    je_number = await _next_je_number(db, company_code, je_date.year)

    # ------------------------------------------------------------------
    # 6. Build JE header
    # ------------------------------------------------------------------
    je_id = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    amount = Decimal(str(payload.amountReceived))

    # Truncate description to 500 chars — allocation list can be long for bulk payments
    description_full = (
        f"Receipt {payload.receiptDocNumber} from {payload.customerName}"
        f" — applied to {allocation_numbers}"
    )
    description = description_full[:500]

    je = JournalEntry(
        jeId=je_id,
        organizationId=org_id,
        companyCode=company_code,
        jeNumber=je_number,
        jeDate=je_date,
        periodId=period_id,
        sourceEventType="customer_payment_received",
        sourceEventId=str(event.eventId),
        sourceDocId=payload.receiptDocEntry,
        sourceDocNumber=payload.receiptDocNumber,
        description=description,
        totalDebit=amount,
        totalCredit=amount,
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy="system",
    )
    db.add(je)

    # ------------------------------------------------------------------
    # 7. Line 1: DR Bank Account for amountReceived
    # ------------------------------------------------------------------
    db.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()),
        jeId=je_id,
        lineNumber=1,
        accountId=payload.bankAccountId,
        debit=amount,
        credit=None,
        description=(
            f"Bank receipt — {payload.paymentMethod} ref {payload.paymentRef or 'n/a'}"
        ),
        referenceLineId=None,
        costCenterId=None,
    ))

    # ------------------------------------------------------------------
    # 8. Line 2: CR AR Control Account for amountReceived
    # ------------------------------------------------------------------
    db.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()),
        jeId=je_id,
        lineNumber=2,
        accountId=ar_account_id,
        debit=None,
        credit=amount,
        description=f"AR cleared — Customer {payload.customerName}",
        # Reason: store customerId in referenceLineId for sub-ledger linkage
        # before a dedicated AR sub-ledger table exists.
        referenceLineId=str(payload.customerId),
        costCenterId=None,
    ))

    # Reason: flush here so FK violations surface inside this handler
    # rather than in the outer commit path where they are harder to attribute.
    await db.flush()

    logger.info(
        "[Finance/Posting] posted customer payment JE jeNumber=%s jeId=%s "
        "receipt=%s bank_account=%s ar_account=%s amount=%s",
        je_number,
        je_id,
        payload.receiptDocNumber,
        payload.bankAccountId,
        ar_account_id,
        amount,
    )


async def _handle_customer_payment_cancelled(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle customer_payment_cancelled outbox events (T-100.10.1).

    Finds the original customer_payment_received JE by
    sourceEventId == payload.originalEventId and posts a reversing JE:
      - DR line (Bank) becomes CR line (same account, same amount)
      - CR line (AR)   becomes DR line (same account, same amount)

    The original JE remains POSTED. Both JEs live on the books and net to
    zero — standard accounting reversing-entry pattern, mirroring the
    delivery_cancelled and sales_invoice_cancelled reversals.

    Idempotency: if a reversal JE already exists with
    sourceEventType='customer_payment_cancelled' pointing to the same original
    JE number, this handler returns silently (no-op). The outer ingest
    endpoint's outbox_events_processed check handles true event-id duplicates.

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope with customer_payment_cancelled payload.

    Raises:
        HTTPException 400: If the original JE is not found, or no open period
                           covers today. Permanent failure (no retry).
        HTTPException 500: For unexpected DB errors (consumer will retry).
    """
    from sqlalchemy.orm import selectinload

    from contracts.finance_events import CustomerPaymentCancelledPayload

    payload = CustomerPaymentCancelledPayload(**event.payload)
    org_id = str(event.organizationId)
    company_code = event.companyCode
    original_event_id = payload.originalEventId

    logger.info(
        "[Finance/Posting] handling customer_payment_cancelled receipt=%s original_event_id=%s",
        payload.receiptDocNumber,
        original_event_id,
    )

    # ------------------------------------------------------------------
    # 1. Find the original customer_payment_received JE by sourceEventId
    # ------------------------------------------------------------------
    orig_result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(
            JournalEntry.organizationId == org_id,
            JournalEntry.sourceEventType == "customer_payment_received",
            JournalEntry.sourceEventId == original_event_id,
        )
    )
    original = orig_result.scalar_one_or_none()
    if original is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No customer_payment_received JE found for "
                f"originalEventId={original_event_id}. "
                "The original customer_payment_received event may not have been processed yet."
            ),
        )

    # ------------------------------------------------------------------
    # 2. Idempotency guard — check if a reversal JE already exists for
    #    this original JE. Duplicate cancellation events are no-ops.
    # ------------------------------------------------------------------
    existing_reversal_result = await db.execute(
        select(JournalEntry.jeNumber).where(
            JournalEntry.organizationId == org_id,
            JournalEntry.sourceEventType == "customer_payment_cancelled",
            JournalEntry.sourceDocNumber == original.jeNumber,
        )
    )
    existing_reversal_number = existing_reversal_result.scalar_one_or_none()
    if existing_reversal_number is not None:
        logger.info(
            "[Finance/Posting] customer_payment_cancelled already reversed: "
            "original jeNumber=%s reversed by=%s — idempotent no-op",
            original.jeNumber,
            existing_reversal_number,
        )
        return

    # ------------------------------------------------------------------
    # 3. Resolve open fiscal period for today (reversals never backdate)
    # ------------------------------------------------------------------
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    today = now_utc.date()
    period_id = await _resolve_fiscal_period_or_raise(db, company_code, today)

    # ------------------------------------------------------------------
    # 4. Generate reversal JE number
    # ------------------------------------------------------------------
    reversal_je_number = await _next_je_number(db, company_code, today.year)

    # ------------------------------------------------------------------
    # 5. Build the reversal JE header
    # ------------------------------------------------------------------
    reversal_id = str(uuid.uuid4())
    reversal_je = JournalEntry(
        jeId=reversal_id,
        organizationId=org_id,
        companyCode=company_code,
        jeNumber=reversal_je_number,
        jeDate=today,
        periodId=period_id,
        sourceEventType="customer_payment_cancelled",
        sourceEventId=str(event.eventId),
        # Reason: sourceDocNumber points to the original JE number so the ledger
        # shows a clear audit trail from the cancellation to its original entry.
        sourceDocId=original.jeId,
        sourceDocNumber=original.jeNumber,
        description=(
            f"Reversal of {original.jeNumber}: "
            f"Receipt {payload.receiptDocNumber} cancelled — {payload.customerName}"
        ),
        # Reason: swap totalDebit/totalCredit — the reversal header mirrors
        # the opposite entry direction (DR→CR, CR→DR).
        totalDebit=Decimal(str(original.totalCredit)),
        totalCredit=Decimal(str(original.totalDebit)),
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy="system",
    )
    db.add(reversal_je)

    # ------------------------------------------------------------------
    # 6. Build reversal lines — swap debit/credit for every original line
    # ------------------------------------------------------------------
    for line in original.lines:
        orig_debit = Decimal(str(line.debit)) if line.debit is not None else None
        orig_credit = Decimal(str(line.credit)) if line.credit is not None else None

        # Reason: original DR (Bank) → reversal CR; original CR (AR) → reversal DR.
        reversal_line = JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=reversal_id,
            lineNumber=line.lineNumber,
            accountId=line.accountId,
            debit=orig_credit,    # original CR (AR) → reversal DR
            credit=orig_debit,    # original DR (Bank) → reversal CR
            description=(
                f"Reversal: {line.description}" if line.description else "Reversal"
            ),
            referenceLineId=line.referenceLineId,
            costCenterId=line.costCenterId,
        )
        db.add(reversal_line)

    await db.flush()

    logger.info(
        "[Finance/Posting] posted customer payment reversal JE jeNumber=%s jeId=%s "
        "original=%s customer=%s",
        reversal_je_number,
        reversal_id,
        original.jeNumber,
        payload.customerName,
    )


# ---------------------------------------------------------------------------
# T-100.11 — return_posted posting handler (Wave 3 Phase 2 finale)
# ---------------------------------------------------------------------------


async def _handle_return_posted(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle return_posted outbox events (T-100.11).

    Produces one Journal Entry that restores inventory and reverses COGS:

      DR  Inventory account  (purchase_item_finance_ext.inventoryAccountId)  lineCogs per line
      CR  COGS account       (sale_item_finance_ext.cogsAccountId)            lineCogs per line

    This is the symmetric reversal of the delivery_posted JE:
      - delivery_posted:   DR COGS / CR Inventory
      - return_posted:     DR Inventory / CR COGS

    Total line count = 2 × len(payload.lines).

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope with return_posted payload.

    Raises:
        HTTPException 400: For all permanent validation failures (no retry).
        HTTPException 500: For unexpected DB errors (consumer will retry).
    """
    from contracts.finance_events import ReturnPostedPayload

    payload = ReturnPostedPayload(**event.payload)
    org_id = str(event.organizationId)
    company_code = event.companyCode

    logger.info(
        "[Finance/Posting] handling return_posted rtn=%s customer=%s lines=%d total_cogs=%s",
        payload.returnDocNumber,
        payload.customerName,
        len(payload.lines),
        payload.totalCogs,
    )

    # ------------------------------------------------------------------
    # 1. Resolve company posting setup
    # ------------------------------------------------------------------
    await _resolve_posting_setup_or_raise(db, org_id, company_code)

    # ------------------------------------------------------------------
    # 2. Resolve Inventory + COGS accounts for each line — fail fast
    # ------------------------------------------------------------------
    # Reason: resolve all accounts before any writes so a missing item config
    # causes a clean 400 without partial writes.
    line_accounts: list[tuple[Any, str, str]] = []
    for line in payload.lines:
        inv_acct_id = await _resolve_item_inventory_account_validated_or_raise(
            db, org_id, str(line.itemId), line.itemCode
        )
        cogs_acct_id = await _resolve_item_cogs_account_or_raise(
            db, org_id, str(line.itemId), line.itemCode
        )
        line_accounts.append((line, inv_acct_id, cogs_acct_id))

    # ------------------------------------------------------------------
    # 3. Resolve fiscal period from docDate (accounting date)
    # ------------------------------------------------------------------
    je_date = date.fromisoformat(payload.docDate)
    period_id = await _resolve_fiscal_period_or_raise(db, company_code, je_date)

    # ------------------------------------------------------------------
    # 4. Generate JE number
    # ------------------------------------------------------------------
    je_number = await _next_je_number(db, company_code, je_date.year)

    # ------------------------------------------------------------------
    # 5. Build and persist the JE atomically
    # ------------------------------------------------------------------
    # Reason: compute total from per-line lineCogs to guarantee DR == CR balance.
    total_cogs = sum(Decimal(str(line.lineCogs)) for line, _, _ in line_accounts)

    description = (
        f"Return {payload.returnDocNumber} — Customer {payload.customerName}"
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
        sourceEventType="return_posted",
        sourceEventId=str(event.eventId),
        sourceDocId=payload.returnDocEntry,
        sourceDocNumber=payload.returnDocNumber,
        description=description,
        totalDebit=total_cogs,
        totalCredit=total_cogs,
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy="system",
    )
    db.add(je)

    # Insert DR (Inventory) + CR (COGS) lines per return line
    line_number = 1
    for line, inv_acct_id, cogs_acct_id in line_accounts:
        line_cogs = Decimal(str(line.lineCogs))
        line_desc = f"{line.itemCode} — qty {line.returnedQty}"

        # DR Inventory account — goods restored to stock
        db.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=line_number,
            accountId=inv_acct_id,
            debit=line_cogs,
            credit=None,
            description=f"Inventory: {line_desc}",
            referenceLineId=str(line.lineNumber),
            costCenterId=line.costCenterId,
        ))
        line_number += 1

        # CR COGS account — COGS reversed
        db.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=line_number,
            accountId=cogs_acct_id,
            debit=None,
            credit=line_cogs,
            description=f"COGS reversal: {line_desc}",
            referenceLineId=str(line.lineNumber),
            costCenterId=line.costCenterId,
        ))
        line_number += 1

    await db.flush()

    logger.info(
        "[Finance/Posting] posted return JE jeNumber=%s jeId=%s "
        "lines=%d total_cogs=%s customer=%s",
        je_number,
        je_id,
        len(line_accounts) * 2,
        total_cogs,
        payload.customerName,
    )


# ---------------------------------------------------------------------------
# T-100.11 — return_cancelled reversal handler (Wave 3 Phase 2 finale)
# ---------------------------------------------------------------------------


async def _handle_return_cancelled(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle return_cancelled outbox events (T-100.11).

    Finds the original return_posted JE by
    sourceEventId == payload.originalEventId and posts a reversing JE:
      - DR lines (Inventory) become CR lines (same accounts, same amounts)
      - CR lines (COGS)      become DR lines (same accounts, same amounts)

    The original JE remains POSTED. Both JEs live on the books and net to
    zero — standard accounting reversing-entry pattern.

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope with return_cancelled payload.

    Raises:
        HTTPException 400: If the original JE is not found, or no open period.
        HTTPException 500: For unexpected DB errors (consumer will retry).
    """
    from sqlalchemy.orm import selectinload

    from contracts.finance_events import ReturnCancelledPayload

    payload = ReturnCancelledPayload(**event.payload)
    org_id = str(event.organizationId)
    company_code = event.companyCode
    original_event_id = payload.originalEventId

    logger.info(
        "[Finance/Posting] handling return_cancelled rtn=%s original_event_id=%s",
        payload.returnDocNumber,
        original_event_id,
    )

    # ------------------------------------------------------------------
    # 1. Find the original return_posted JE by sourceEventId
    # ------------------------------------------------------------------
    orig_result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(
            JournalEntry.organizationId == org_id,
            JournalEntry.sourceEventType == "return_posted",
            JournalEntry.sourceEventId == original_event_id,
        )
    )
    original = orig_result.scalar_one_or_none()
    if original is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No return_posted JE found for originalEventId={original_event_id}. "
                "The original return_posted event may not have been processed yet."
            ),
        )

    # ------------------------------------------------------------------
    # 2. Idempotency guard
    # ------------------------------------------------------------------
    existing_reversal_result = await db.execute(
        select(JournalEntry.jeNumber).where(
            JournalEntry.organizationId == org_id,
            JournalEntry.sourceEventType == "return_cancelled",
            JournalEntry.sourceDocNumber == original.jeNumber,
        )
    )
    existing_reversal_number = existing_reversal_result.scalar_one_or_none()
    if existing_reversal_number is not None:
        logger.info(
            "[Finance/Posting] return_cancelled already reversed: "
            "original jeNumber=%s reversed by=%s — idempotent no-op",
            original.jeNumber,
            existing_reversal_number,
        )
        return

    # ------------------------------------------------------------------
    # 3. Resolve open fiscal period for today (reversals never backdate)
    # ------------------------------------------------------------------
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    today = now_utc.date()
    period_id = await _resolve_fiscal_period_or_raise(db, company_code, today)

    # ------------------------------------------------------------------
    # 4. Generate reversal JE number
    # ------------------------------------------------------------------
    reversal_je_number = await _next_je_number(db, company_code, today.year)

    # ------------------------------------------------------------------
    # 5. Build the reversal JE header
    # ------------------------------------------------------------------
    reversal_id = str(uuid.uuid4())
    reversal_je = JournalEntry(
        jeId=reversal_id,
        organizationId=org_id,
        companyCode=company_code,
        jeNumber=reversal_je_number,
        jeDate=today,
        periodId=period_id,
        sourceEventType="return_cancelled",
        sourceEventId=str(event.eventId),
        sourceDocId=original.jeId,
        sourceDocNumber=original.jeNumber,
        description=(
            f"Reversal of {original.jeNumber}: "
            f"Return {payload.returnDocNumber} cancelled"
        ),
        # Reason: swap totalDebit/totalCredit — reversal mirrors original in reverse.
        totalDebit=Decimal(str(original.totalCredit)),
        totalCredit=Decimal(str(original.totalDebit)),
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy="system",
    )
    db.add(reversal_je)

    # ------------------------------------------------------------------
    # 6. Build reversal lines — swap debit/credit for every original line
    # ------------------------------------------------------------------
    for line in original.lines:
        orig_debit = Decimal(str(line.debit)) if line.debit is not None else None
        orig_credit = Decimal(str(line.credit)) if line.credit is not None else None

        # Reason: original DR (Inventory) → reversal CR; original CR (COGS) → reversal DR.
        db.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=reversal_id,
            lineNumber=line.lineNumber,
            accountId=line.accountId,
            debit=orig_credit,   # original CR (COGS) → reversal DR
            credit=orig_debit,   # original DR (Inventory) → reversal CR
            description=(
                f"Reversal: {line.description}" if line.description else "Reversal"
            ),
            referenceLineId=line.referenceLineId,
            costCenterId=line.costCenterId,
        ))

    await db.flush()

    logger.info(
        "[Finance/Posting] posted return reversal JE jeNumber=%s jeId=%s "
        "original=%s customer=%s",
        reversal_je_number,
        reversal_id,
        original.jeNumber,
        payload.customerName,
    )


# ---------------------------------------------------------------------------
# T-100.11 — credit_note_posted posting handler (Wave 3 Phase 2 finale)
# ---------------------------------------------------------------------------


async def _handle_credit_note_posted(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle credit_note_posted outbox events (T-100.11).

    Posts a Journal Entry that is the symmetric reversal of sales_invoice_posted:

      DR  Revenue (per line)          line.lineNet  per revenueAccountId
              (one debit line per credit note line — reverses original revenue)
      DR  Output VAT (combined)       totals.tax    from setup.outputVatAccountId
              (one debit line for the whole credit note; skipped if tax == 0)
      CR  AR Control Account          totals.gross  (3-tier chain resolution)
              (reduces the customer's AR balance)

    Balance proof:
        DR = total_revenue_net (per line) + total_tax
           = total_net + total_tax = total_gross
        CR = total_gross ✓

    Idempotency: handled by the outer ingest endpoint's outbox_events_processed
    table before this handler is called.

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope with credit_note_posted payload.

    Raises:
        HTTPException 400: For all permanent validation failures (no retry).
        HTTPException 500: For unexpected DB errors (consumer will retry).
    """
    from contracts.finance_events import CreditNotePostedPayload

    payload = CreditNotePostedPayload(**event.payload)
    org_id = str(event.organizationId)
    company_code = event.companyCode

    totals = payload.totals
    total_gross = Decimal(str(totals.get("gross", "0")))
    total_tax = Decimal(str(totals.get("tax", "0")))
    total_net = Decimal(str(totals.get("net", "0")))

    logger.info(
        "[Finance/Posting] handling credit_note_posted arc=%s customer=%s "
        "net=%s tax=%s gross=%s lines=%d",
        payload.arcDocNumber,
        payload.customerName,
        total_net,
        total_tax,
        total_gross,
        len(payload.lines),
    )

    # ------------------------------------------------------------------
    # 1. Resolve company posting setup
    # ------------------------------------------------------------------
    setup = await _resolve_posting_setup_or_raise(db, org_id, company_code)

    # ------------------------------------------------------------------
    # 2. Validate outputVatAccountId is configured when VAT is non-zero
    # ------------------------------------------------------------------
    has_vat = total_tax > Decimal("0.0001")
    if has_vat and not setup.outputVatAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Output VAT account (outputVatAccountId) not configured in posting setup "
                f"for company {company_code}, but credit note {payload.arcDocNumber} "
                f"carries non-zero tax ({total_tax}). Configure the Output VAT account first."
            ),
        )

    # ------------------------------------------------------------------
    # 3. Resolve AR control account via 3-tier chain
    # ------------------------------------------------------------------
    ar_account_id = await _resolve_ar_control_account_or_raise(
        db, org_id, company_code, payload.customerId, setup
    )

    # ------------------------------------------------------------------
    # 4. Validate all revenue accounts before any writes (fail fast)
    # ------------------------------------------------------------------
    for line in payload.lines:
        await _validate_revenue_account_or_raise(
            db, line.revenueAccountId, line.itemCode, line.lineNumber
        )

    # ------------------------------------------------------------------
    # 5. Resolve fiscal period from docDate
    # ------------------------------------------------------------------
    je_date = date.fromisoformat(payload.docDate)
    period_id = await _resolve_fiscal_period_or_raise(db, company_code, je_date)

    # ------------------------------------------------------------------
    # 6. Generate JE number
    # ------------------------------------------------------------------
    je_number = await _next_je_number(db, company_code, je_date.year)

    # ------------------------------------------------------------------
    # 7. Balance verification
    # ------------------------------------------------------------------
    total_revenue_net = sum(Decimal(str(line.lineNet)) for line in payload.lines)
    dr_total = total_revenue_net + total_tax
    cr_total = total_gross
    assert abs(dr_total - cr_total) <= Decimal("0.01"), (
        f"JE imbalance! DR={dr_total} CR={cr_total} for arc={payload.arcDocNumber}"
    )

    # ------------------------------------------------------------------
    # 8. Build JE header
    # ------------------------------------------------------------------
    je_id = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

    description = (
        f"CR Note {payload.arcDocNumber} — "
        f"Customer {payload.customerName}, reason {payload.creditReason}"
    )

    je = JournalEntry(
        jeId=je_id,
        organizationId=org_id,
        companyCode=company_code,
        jeNumber=je_number,
        jeDate=je_date,
        periodId=period_id,
        sourceEventType="credit_note_posted",
        sourceEventId=str(event.eventId),
        sourceDocId=payload.arcDocEntry,
        sourceDocNumber=payload.arcDocNumber,
        description=description,
        totalDebit=dr_total,
        totalCredit=cr_total,
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy="system",
    )
    db.add(je)

    line_num = 1

    # ------------------------------------------------------------------
    # 9. Per-line: DR Revenue (one line per credit note line — reversal)
    # ------------------------------------------------------------------
    for line in payload.lines:
        line_net = Decimal(str(line.lineNet))
        db.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=line_num,
            accountId=line.revenueAccountId,
            debit=line_net,
            credit=None,
            description=f"Revenue reversal: {line.itemCode}",
            referenceLineId=str(line.lineNumber),
            costCenterId=line.costCenterId,
        ))
        line_num += 1

    # ------------------------------------------------------------------
    # 10. DR Output VAT (one combined line, only if tax > 0 — reversal)
    # ------------------------------------------------------------------
    if has_vat:
        db.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=line_num,
            accountId=setup.outputVatAccountId,
            debit=total_tax,
            credit=None,
            description=f"Output VAT reversal — tax_date {payload.taxDate}",
        ))
        line_num += 1

    # ------------------------------------------------------------------
    # 11. CR AR Control Account for total_gross (reduces AR balance)
    # ------------------------------------------------------------------
    db.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()),
        jeId=je_id,
        lineNumber=line_num,
        accountId=ar_account_id,
        debit=None,
        credit=total_gross,
        description=f"AR reduction — Customer {payload.customerName}",
        # Reason: store customerId in referenceLineId for sub-ledger linkage.
        referenceLineId=str(payload.customerId),
    ))

    await db.flush()

    logger.info(
        "[Finance/Posting] posted credit note JE jeNumber=%s jeId=%s "
        "arc=%s ar_account=%s revenue=%s output_vat=%s total=%s lines=%d",
        je_number,
        je_id,
        payload.arcDocNumber,
        ar_account_id,
        total_revenue_net,
        total_tax,
        cr_total,
        line_num,
    )


# ---------------------------------------------------------------------------
# T-100.11 — credit_note_cancelled reversal handler (Wave 3 Phase 2 finale)
# ---------------------------------------------------------------------------


async def _handle_credit_note_cancelled(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle credit_note_cancelled outbox events (T-100.11).

    Finds the original credit_note_posted JE by
    sourceEventId == payload.originalEventId and posts a reversing JE:
      - DR lines (Revenue, Output VAT) become CR lines
      - CR line  (AR Control)          becomes DR line

    The original JE remains POSTED. Both JEs live on the books and net to
    zero — standard accounting reversing-entry pattern, mirroring the
    sales_invoice_cancelled reversal in T-100.9b.

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope with credit_note_cancelled payload.

    Raises:
        HTTPException 400: If the original JE is not found, or no open period.
        HTTPException 500: For unexpected DB errors (consumer will retry).
    """
    from sqlalchemy.orm import selectinload

    from contracts.finance_events import CreditNoteCancelledPayload

    payload = CreditNoteCancelledPayload(**event.payload)
    org_id = str(event.organizationId)
    company_code = event.companyCode
    original_event_id = payload.originalEventId

    logger.info(
        "[Finance/Posting] handling credit_note_cancelled arc=%s original_event_id=%s",
        payload.arcDocNumber,
        original_event_id,
    )

    # ------------------------------------------------------------------
    # 1. Find the original credit_note_posted JE by sourceEventId
    # ------------------------------------------------------------------
    orig_result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(
            JournalEntry.organizationId == org_id,
            JournalEntry.sourceEventType == "credit_note_posted",
            JournalEntry.sourceEventId == original_event_id,
        )
    )
    original = orig_result.scalar_one_or_none()
    if original is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No credit_note_posted JE found for originalEventId={original_event_id}. "
                "The original credit_note_posted event may not have been processed yet."
            ),
        )

    # ------------------------------------------------------------------
    # 2. Idempotency guard
    # ------------------------------------------------------------------
    existing_reversal_result = await db.execute(
        select(JournalEntry.jeNumber).where(
            JournalEntry.organizationId == org_id,
            JournalEntry.sourceEventType == "credit_note_cancelled",
            JournalEntry.sourceDocNumber == original.jeNumber,
        )
    )
    existing_reversal_number = existing_reversal_result.scalar_one_or_none()
    if existing_reversal_number is not None:
        logger.info(
            "[Finance/Posting] credit_note_cancelled already reversed: "
            "original jeNumber=%s reversed by=%s — idempotent no-op",
            original.jeNumber,
            existing_reversal_number,
        )
        return

    # ------------------------------------------------------------------
    # 3. Resolve open fiscal period for today (reversals never backdate)
    # ------------------------------------------------------------------
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    today = now_utc.date()
    period_id = await _resolve_fiscal_period_or_raise(db, company_code, today)

    # ------------------------------------------------------------------
    # 4. Generate reversal JE number
    # ------------------------------------------------------------------
    reversal_je_number = await _next_je_number(db, company_code, today.year)

    # ------------------------------------------------------------------
    # 5. Build the reversal JE header
    # ------------------------------------------------------------------
    reversal_id = str(uuid.uuid4())
    reversal_je = JournalEntry(
        jeId=reversal_id,
        organizationId=org_id,
        companyCode=company_code,
        jeNumber=reversal_je_number,
        jeDate=today,
        periodId=period_id,
        sourceEventType="credit_note_cancelled",
        sourceEventId=str(event.eventId),
        sourceDocId=original.jeId,
        sourceDocNumber=original.jeNumber,
        description=(
            f"Reversal of {original.jeNumber}: "
            f"Credit Note {payload.arcDocNumber} cancelled"
        ),
        # Reason: swap totalDebit/totalCredit — reversal mirrors original in reverse.
        totalDebit=Decimal(str(original.totalCredit)),
        totalCredit=Decimal(str(original.totalDebit)),
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy="system",
    )
    db.add(reversal_je)

    # ------------------------------------------------------------------
    # 6. Build reversal lines — swap debit/credit for every original line
    # ------------------------------------------------------------------
    for line in original.lines:
        orig_debit = Decimal(str(line.debit)) if line.debit is not None else None
        orig_credit = Decimal(str(line.credit)) if line.credit is not None else None

        # Reason: original DR (Revenue/VAT) → reversal CR; original CR (AR) → reversal DR.
        db.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=reversal_id,
            lineNumber=line.lineNumber,
            accountId=line.accountId,
            debit=orig_credit,   # original CR (AR) → reversal DR
            credit=orig_debit,   # original DR (Revenue/VAT) → reversal CR
            description=(
                f"Reversal: {line.description}" if line.description else "Reversal"
            ),
            referenceLineId=line.referenceLineId,
            costCenterId=line.costCenterId,
        ))

    await db.flush()

    logger.info(
        "[Finance/Posting] posted credit note reversal JE jeNumber=%s jeId=%s "
        "original=%s customer=%s",
        reversal_je_number,
        reversal_id,
        original.jeNumber,
        payload.customerName,
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
    elif event.eventType == "delivery_posted":
        # T-100.8.1 — Delivery COGS posting: DR COGS / CR Inventory (per line)
        await _handle_delivery_posted(db, event)
    elif event.eventType == "delivery_cancelled":
        # T-100.8.1 — Delivery cancellation: reverse the original COGS JE
        await _handle_delivery_cancelled(db, event)
    elif event.eventType == "sales_invoice_posted":
        # T-100.9b — AR Invoice: posts Dr AR / Cr Revenue / Cr Output VAT
        await _handle_sales_invoice_posted(db, event)
    elif event.eventType == "sales_invoice_cancelled":
        # T-100.9b — AR Invoice cancellation: reverse the original JE
        await _handle_sales_invoice_cancelled(db, event)
    elif event.eventType == "customer_payment_received":
        # T-100.10.1 — Customer Receipt: Dr Bank / Cr AR
        await _handle_customer_payment_received(db, event)
    elif event.eventType == "customer_payment_cancelled":
        # T-100.10.1 — Customer Receipt cancellation: reverse the JE
        await _handle_customer_payment_cancelled(db, event)
    elif event.eventType == "return_posted":
        # T-100.11 — Return Note: Dr Inventory / Cr COGS (per line)
        await _handle_return_posted(db, event)
    elif event.eventType == "return_cancelled":
        # T-100.11 — Return Note cancellation: reverse the inventory restoration JE
        await _handle_return_cancelled(db, event)
    elif event.eventType == "credit_note_posted":
        # T-100.11 — AR Credit Note: Dr Revenue / Dr Output VAT / Cr AR
        await _handle_credit_note_posted(db, event)
    elif event.eventType == "credit_note_cancelled":
        # T-100.11 — AR Credit Note cancellation: reverse the credit note JE
        await _handle_credit_note_cancelled(db, event)
    elif event.eventType == "ap_down_payment_posted":
        # T-910 — AP Down Payment Invoice: DR Vendor Advance / DR Input VAT / CR AP Control
        await _handle_ap_down_payment_posted(db, event)
    elif event.eventType == "ap_credit_note_posted":
        # T-910 — AP Credit Note: DR AP Control / CR GR/IR Clearing / CR Input VAT
        await _handle_ap_credit_note_posted(db, event)
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
