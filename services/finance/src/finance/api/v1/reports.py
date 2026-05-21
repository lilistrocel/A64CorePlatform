"""
Finance Reports API

Provides read-only financial report endpoints for the finance service.

Endpoints:
  GET  /reports/trial-balance         — Standard trial balance as of a given date.
  POST /reports/ap-aging              — AP aging bucket report (frontend-orchestrated).
  GET  /reports/vendor-sub-ledger     — Per-vendor AP sub-ledger from JE lines.

Permissions:
  All endpoints: accountant, finance_admin, auditor, admin, super_admin
"""

import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...middleware.auth import TokenPayload, require_roles
from ...models.orm.models import (
    AccountLevelEnum,
    AccountTypeEnum,
    ApPaymentApplication,
    CompanyPostingSetup,
    GLAccount,
    JEStatusEnum,
    JournalEntry,
    JournalEntryLine,
)
from ...models.schemas.common import SuccessResponse
from ...utils.responses import success

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Reports"])

_READ_ROLES = ("accountant", "finance_admin", "auditor", "admin", "super_admin")

# ---------------------------------------------------------------------------
# Response schemas (report-specific; not shared with other modules)
# ---------------------------------------------------------------------------

# Account types where the natural (positive) balance side is DEBIT.
# For these, balance = totalDebit - totalCredit (positive = normal).
# All other types (liability, equity, revenue) have a natural CREDIT balance:
# balance = totalCredit - totalDebit (positive = normal).
_DEBIT_NATURAL_TYPES = {AccountTypeEnum.ASSET, AccountTypeEnum.EXPENSE}


class TrialBalanceAccount(BaseModel):
    """A single account row in the trial balance report."""

    accountId: str
    accountNumber: str
    accountName: str
    drawer: str
    accountType: str
    accountLevel: str
    totalDebit: str    # Decimal serialised as string to preserve precision
    totalCredit: str
    balance: str       # Signed net balance; positive = natural-side balance


class TrialBalanceTotals(BaseModel):
    """Aggregate totals across all accounts (must be equal for balanced books)."""

    totalDebit: str
    totalCredit: str


class TrialBalanceResponse(BaseModel):
    """
    Standard trial balance report.

    All monetary values are serialised as Decimal strings to preserve
    precision and avoid floating-point rounding in JSON.
    """

    organizationId: str
    companyCode: str
    asOfDate: str           # ISO date string
    periodId: Optional[str]
    generatedAt: str        # ISO datetime string (UTC)
    includesVoided: bool
    accounts: List[TrialBalanceAccount]
    totals: TrialBalanceTotals


# ---------------------------------------------------------------------------
# Trial balance endpoint
# ---------------------------------------------------------------------------


@router.get(
    "/reports/trial-balance",
    response_model=SuccessResponse[TrialBalanceResponse],
    summary="Trial balance report",
    description=(
        "Returns every active GL account's net debit/credit balance as of the given date. "
        "Accounts with zero activity are included (balance = 0). "
        "totalDebit and totalCredit in `totals` should be equal — that proves the books balance."
    ),
)
async def get_trial_balance(
    organization_id: str = Query(..., description="Required — org scope"),
    company_code: str = Query(..., description="Required — company code"),
    as_of_date: Optional[date] = Query(
        None,
        description="Accumulate JEs up to and including this date (default: today).",
    ),
    period_id: Optional[str] = Query(
        None,
        description="If provided, limit to JEs posted in this fiscal period.",
    ),
    include_voided: bool = Query(
        False,
        description="Include voided JEs in the balance computation (default: false).",
    ),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[TrialBalanceResponse]:
    """
    Compute the trial balance for an organisation as of a given date.

    Uses a single SQL aggregation with a LEFT OUTER JOIN so accounts with
    zero posted activity still appear in the result (balance = 0).

    The balance sign convention:
    - asset / expense accounts: balance = DR - CR (positive = normal DR balance)
    - liability / equity / revenue accounts: balance = CR - DR (positive = normal CR balance)

    Args:
        organization_id: Owning organisation UUID.
        company_code: Company code to scope JE joins.
        as_of_date: Upper bound on jeDate (inclusive). Defaults to today.
        period_id: Optional fiscal period filter.
        include_voided: Whether to include voided JEs (default False).
        db: Async DB session.
        _current_user: Authenticated user (any finance read role).

    Returns:
        TrialBalanceResponse with per-account rows and aggregate totals.
    """
    effective_date: date = as_of_date or date.today()
    generated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    # ------------------------------------------------------------------
    # Build the aggregation query.
    #
    # Design rationale for the JOIN structure:
    #   We need accounts with ZERO JE activity to appear with balance = 0.
    #   A single LEFT JOIN (accounts → lines) with WHERE on JE columns would
    #   exclude zero-activity accounts because NULL rows fail equality checks.
    #
    #   Correct approach: LEFT JOIN from GLAccount to a subquery that already
    #   has all JE filters applied.  The subquery aggregates line amounts per
    #   accountId using only the matching JEs.  Zero-activity accounts get NULL
    #   from the LEFT JOIN, which coalesce() turns into 0.
    # ------------------------------------------------------------------

    # ------------------------------------------------------------------
    # 1. Build the inner subquery: filtered JE lines → aggregated per account
    # ------------------------------------------------------------------
    # Reason: start with the join conditions between JE header and lines so
    # every filter is applied before aggregation.
    line_je_join = JournalEntryLine.jeId == JournalEntry.jeId

    # Build the JE filter predicate incrementally
    je_filters = [
        JournalEntry.organizationId == organization_id,
        JournalEntry.companyCode == company_code,
        JournalEntry.jeDate <= effective_date,
    ]

    if not include_voided:
        je_filters.append(JournalEntry.status == JEStatusEnum.POSTED)
    # When include_voided=True we include all statuses (both posted and void).

    if period_id is not None:
        je_filters.append(JournalEntry.periodId == period_id)

    # Subquery: sum debits and credits per accountId for matching JEs only
    subq = (
        select(
            JournalEntryLine.accountId.label("account_id"),
            func.sum(JournalEntryLine.debit).label("sum_debit"),
            func.sum(JournalEntryLine.credit).label("sum_credit"),
        )
        .join(JournalEntry, line_je_join)
        .where(*je_filters)
        .group_by(JournalEntryLine.accountId)
        .subquery("je_agg")
    )

    # Reason: coalesce(subquery value, 0) so accounts with no matching JE
    # lines (NULL from LEFT JOIN) are treated as zero balance.
    sum_debit = func.coalesce(subq.c.sum_debit, Decimal("0")).label("total_debit")
    sum_credit = func.coalesce(subq.c.sum_credit, Decimal("0")).label("total_credit")

    # ------------------------------------------------------------------
    # 2. Outer query: LEFT JOIN accounts → aggregated subquery
    # ------------------------------------------------------------------
    stmt = (
        select(
            GLAccount.accountId,
            GLAccount.accountNumber,
            GLAccount.accountName,
            GLAccount.drawer,
            GLAccount.accountType,
            GLAccount.accountLevel,
            sum_debit,
            sum_credit,
        )
        # LEFT JOIN preserves accounts with zero JE activity (subq row is NULL)
        .outerjoin(subq, subq.c.account_id == GLAccount.accountId)
        # WHERE: scope to the org's active postable accounts only
        .where(
            GLAccount.organizationId == organization_id,
            GLAccount.accountLevel == AccountLevelEnum.ACTIVE,
        )
        .group_by(
            GLAccount.accountId,
            GLAccount.accountNumber,
            GLAccount.accountName,
            GLAccount.drawer,
            GLAccount.accountType,
            GLAccount.accountLevel,
        )
        .order_by(GLAccount.accountNumber)
    )

    rows = (await db.execute(stmt)).all()

    # ------------------------------------------------------------------
    # Compute per-account balances and aggregate totals
    # ------------------------------------------------------------------
    accounts: List[TrialBalanceAccount] = []
    grand_debit = Decimal("0")
    grand_credit = Decimal("0")

    for row in rows:
        dr = Decimal(str(row.total_debit))
        cr = Decimal(str(row.total_credit))

        # Reason: balance sign convention per account type.
        # Debit-natural types (asset, expense): positive balance = DR > CR.
        # Credit-natural types (liability, equity, revenue): positive = CR > DR.
        acct_type_val = row.accountType
        if isinstance(acct_type_val, AccountTypeEnum):
            acct_type_enum = acct_type_val
        else:
            # SQLite may return raw string values
            try:
                acct_type_enum = AccountTypeEnum(acct_type_val)
            except ValueError:
                acct_type_enum = AccountTypeEnum.ASSET  # safe fallback

        if acct_type_enum in _DEBIT_NATURAL_TYPES:
            balance = dr - cr
        else:
            balance = cr - dr

        # Normalise enum values to strings for the response
        drawer_str = (
            row.drawer.value if hasattr(row.drawer, "value") else str(row.drawer)
        )
        acct_type_str = (
            acct_type_enum.value
            if hasattr(acct_type_enum, "value")
            else str(acct_type_enum)
        )
        acct_level_str = (
            row.accountLevel.value
            if hasattr(row.accountLevel, "value")
            else str(row.accountLevel)
        )

        accounts.append(
            TrialBalanceAccount(
                accountId=row.accountId,
                accountNumber=row.accountNumber,
                accountName=row.accountName,
                drawer=drawer_str,
                accountType=acct_type_str,
                accountLevel=acct_level_str,
                totalDebit=str(dr),
                totalCredit=str(cr),
                balance=str(balance),
            )
        )

        grand_debit += dr
        grand_credit += cr

    logger.info(
        "[Finance/Reports] trial_balance org=%s company=%s as_of=%s "
        "accounts=%d total_dr=%s total_cr=%s balanced=%s",
        organization_id,
        company_code,
        effective_date.isoformat(),
        len(accounts),
        grand_debit,
        grand_credit,
        grand_debit == grand_credit,
    )

    return success(TrialBalanceResponse(
        organizationId=organization_id,
        companyCode=company_code,
        asOfDate=effective_date.isoformat(),
        periodId=period_id,
        generatedAt=generated_at.isoformat(),
        includesVoided=include_voided,
        accounts=accounts,
        totals=TrialBalanceTotals(
            totalDebit=str(grand_debit),
            totalCredit=str(grand_credit),
        ),
    ))


# ===========================================================================
# AP Aging Report
# ===========================================================================


class ApAgingInvoiceItem(BaseModel):
    """A single AP invoice supplied by the frontend for aging computation."""

    apDocId: str = Field(..., description="Operation-side AP document UUID.")
    totalGross: Decimal = Field(..., description="Total invoice amount (gross).")
    dueDate: date = Field(..., description="Invoice due date (used for bucket placement).")
    vendorId: str
    vendorCode: str
    vendorName: str


class ApAgingRequest(BaseModel):
    """
    Request body for the AP aging report.

    The frontend pre-fetches the Approved AP invoice list from the operation
    service, then POSTs the relevant fields here.  The finance backend looks
    up totalPaid per docId and classifies the outstanding balance into buckets.
    """

    organizationId: str
    companyCode: str
    asOfDate: Optional[date] = Field(
        None,
        description="Compute overdue days relative to this date (default: today).",
    )
    invoices: List[ApAgingInvoiceItem] = Field(
        default_factory=list,
        description="Approved AP invoices from the operation service.",
    )


class ApAgingBuckets(BaseModel):
    """Monetary amounts split across the five aging buckets (Decimal strings)."""

    notDue: str
    days1To30: str
    days31To60: str
    days61To90: str
    daysOver90: str
    total: str


class ApAgingVendorRow(ApAgingBuckets):
    """Per-vendor row in the aging report."""

    vendorId: str
    vendorCode: str
    vendorName: str


class ApAgingResponse(BaseModel):
    """
    AP aging report response.

    All monetary amounts are Decimal strings to preserve precision.
    Vendors are sorted by total outstanding descending.
    """

    asOfDate: str
    totals: ApAgingBuckets
    byVendor: List[ApAgingVendorRow]


def _classify_overdue(outstanding: Decimal, days_overdue: int) -> str:
    """
    Return the bucket key for a given outstanding amount and overdue count.

    Args:
        outstanding: Amount outstanding (already > 0 — caller checks this).
        days_overdue: Positive = overdue by N days; negative or zero = not due.

    Returns:
        Bucket key string: 'notDue' | 'days1To30' | 'days31To60' |
        'days61To90' | 'daysOver90'.
    """
    if days_overdue <= 0:
        return "notDue"
    if days_overdue <= 30:
        return "days1To30"
    if days_overdue <= 60:
        return "days31To60"
    if days_overdue <= 90:
        return "days61To90"
    return "daysOver90"


_ZERO = Decimal("0")
_BUCKET_KEYS = ("notDue", "days1To30", "days31To60", "days61To90", "daysOver90")


def _empty_buckets() -> Dict[str, Decimal]:
    """Return a fresh bucket accumulator keyed by bucket name."""
    return {k: _ZERO for k in _BUCKET_KEYS}


@router.post(
    "/reports/ap-aging",
    response_model=SuccessResponse[ApAgingResponse],
    status_code=status.HTTP_200_OK,
    summary="AP aging report",
    description=(
        "Frontend-orchestrated aging report (v1 pattern, consistent with the AP Payments "
        "totals-paid endpoint).  The caller supplies the list of Approved AP invoices "
        "fetched from the operation service; this endpoint looks up totalPaid per docId "
        "from ap_payment_applications and buckets the outstanding balance by overdue age.\n\n"
        "Use POST because the request carries a potentially large invoice list in the body."
    ),
)
async def get_ap_aging(
    body: ApAgingRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[ApAgingResponse]:
    """
    Compute the AP aging report from a caller-supplied invoice list.

    Steps:
    1. Resolve effective as-of date (default: today).
    2. Batch-query totalPaid per apDocId from ap_payment_applications.
    3. For each invoice, compute outstanding = totalGross - totalPaid.
       Skip invoices where outstanding <= 0 (fully paid).
    4. Calculate days_overdue = (asOfDate - dueDate).days.
    5. Place outstanding into the correct bucket per vendor.
    6. Aggregate vendor buckets + overall totals.
    7. Sort vendors by total outstanding descending.

    Args:
        body: AP aging request with invoice list and optional asOfDate.
        db: Async DB session.
        _current_user: Authenticated user (read roles).

    Returns:
        ApAgingResponse with totals and per-vendor breakdown.
    """
    effective_date: date = body.asOfDate or date.today()

    # ------------------------------------------------------------------
    # 1. Batch-fetch totalPaid for all supplied apDocIds in one query.
    # ------------------------------------------------------------------
    doc_ids = [inv.apDocId for inv in body.invoices]
    paid_map: Dict[str, Decimal] = {}

    if doc_ids:
        result = await db.execute(
            select(
                ApPaymentApplication.apInvoiceDocId,
                func.coalesce(
                    func.sum(ApPaymentApplication.amountApplied), _ZERO
                ).label("total_paid"),
            )
            .where(ApPaymentApplication.apInvoiceDocId.in_(doc_ids))
            .group_by(ApPaymentApplication.apInvoiceDocId)
        )
        for row in result.all():
            paid_map[row.apInvoiceDocId] = Decimal(str(row.total_paid))

    # ------------------------------------------------------------------
    # 2. Classify each invoice and accumulate per-vendor buckets.
    # ------------------------------------------------------------------
    # vendor_buckets[vendorId] = {"notDue": ..., "days1To30": ..., ...}
    vendor_buckets: Dict[str, Dict[str, Decimal]] = {}
    # vendor_meta[vendorId] = (vendorCode, vendorName)
    vendor_meta: Dict[str, tuple] = {}
    grand_buckets = _empty_buckets()

    for inv in body.invoices:
        total_paid = paid_map.get(inv.apDocId, _ZERO)
        outstanding = Decimal(str(inv.totalGross)) - total_paid

        # Reason: skip fully-paid (or over-applied) invoices — they carry no
        # aging exposure.
        if outstanding <= _ZERO:
            continue

        days_overdue = (effective_date - inv.dueDate).days
        bucket_key = _classify_overdue(outstanding, days_overdue)

        # Accumulate per vendor
        if inv.vendorId not in vendor_buckets:
            vendor_buckets[inv.vendorId] = _empty_buckets()
            vendor_meta[inv.vendorId] = (inv.vendorCode, inv.vendorName)
        vendor_buckets[inv.vendorId][bucket_key] += outstanding
        grand_buckets[bucket_key] += outstanding

    # ------------------------------------------------------------------
    # 3. Build response rows sorted by total outstanding descending.
    # ------------------------------------------------------------------
    vendor_rows: List[ApAgingVendorRow] = []
    for vendor_id, buckets in vendor_buckets.items():
        vendor_total = sum(buckets.values())
        vendor_code, vendor_name = vendor_meta[vendor_id]
        vendor_rows.append(
            ApAgingVendorRow(
                vendorId=vendor_id,
                vendorCode=vendor_code,
                vendorName=vendor_name,
                notDue=str(buckets["notDue"]),
                days1To30=str(buckets["days1To30"]),
                days31To60=str(buckets["days31To60"]),
                days61To90=str(buckets["days61To90"]),
                daysOver90=str(buckets["daysOver90"]),
                total=str(vendor_total),
            )
        )

    # Reason: sort largest exposure first so the UI highlights the worst vendors.
    vendor_rows.sort(key=lambda r: Decimal(r.total), reverse=True)

    grand_total = sum(grand_buckets.values())

    logger.info(
        "[Finance/Reports] ap_aging org=%s company=%s as_of=%s "
        "invoices_in=%d vendors=%d total_outstanding=%s",
        body.organizationId,
        body.companyCode,
        effective_date.isoformat(),
        len(body.invoices),
        len(vendor_rows),
        grand_total,
    )

    return success(ApAgingResponse(
        asOfDate=effective_date.isoformat(),
        totals=ApAgingBuckets(
            notDue=str(grand_buckets["notDue"]),
            days1To30=str(grand_buckets["days1To30"]),
            days31To60=str(grand_buckets["days31To60"]),
            days61To90=str(grand_buckets["days61To90"]),
            daysOver90=str(grand_buckets["daysOver90"]),
            total=str(grand_total),
        ),
        byVendor=vendor_rows,
    ))


# ===========================================================================
# Vendor Sub-ledger Report
# ===========================================================================


class VendorSubLedgerRow(BaseModel):
    """Per-vendor row in the AP sub-ledger report."""

    vendorId: str
    totalCredits: str    # sum of JE line credits to AP where referenceLineId = vendorId
    totalDebits: str     # sum of JE line debits to AP (payments / clearances)
    balance: str         # credits - debits (positive = we owe this vendor)
    lastActivityAt: str  # ISO date string of the most recent JE touching this vendor
    entryCount: int


class VendorSubLedgerResponse(BaseModel):
    """
    Vendor sub-ledger report response.

    Groups JE lines posted to the AP Control account by referenceLineId
    (which the AP invoice and payment posting handlers set to vendorId).
    Returns vendorId only — the frontend cross-references with the operation
    vendor list to display vendorCode and vendorName.
    """

    asOfDate: str
    totalOutstanding: str    # sum of all vendor balances
    byVendor: List[VendorSubLedgerRow]


@router.get(
    "/reports/vendor-sub-ledger",
    response_model=SuccessResponse[VendorSubLedgerResponse],
    summary="Vendor AP sub-ledger",
    description=(
        "Returns per-vendor aggregations of JE lines posted to the AP Control account. "
        "Each vendor row shows total credits (invoices booked), total debits (payments "
        "applied), the net balance (credits – debits), last activity date, and entry count.\n\n"
        "The AP Control account is resolved from company_posting_setup.apControlAccountId. "
        "Only posted JEs with jeDate <= asOfDate are included.\n\n"
        "Returns vendorId only — the frontend enriches with vendorCode/vendorName from "
        "the operation service (same v1 frontend-join pattern as AP Aging)."
    ),
)
async def get_vendor_sub_ledger(
    organization_id: str = Query(..., description="Required — org scope"),
    company_code: str = Query(..., description="Required — company code"),
    as_of_date: Optional[date] = Query(
        None,
        description="Include JEs up to and including this date (default: today).",
    ),
    vendor_id: Optional[str] = Query(
        None,
        description="Optional — filter to a single vendor.",
    ),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[VendorSubLedgerResponse]:
    """
    Compute the vendor AP sub-ledger for a company as of a given date.

    Logic:
    1. Resolve apControlAccountId from company_posting_setup.
    2. Query journal_entry_lines joined to journal_entries where:
       - accountId = apControlAccountId
       - referenceLineId IS NOT NULL (vendor sub-ledger marker)
       - jeDate <= asOfDate
       - je.status = 'posted'
       - je.companyCode = companyCode
    3. Group by referenceLineId (= vendorId), aggregate credits/debits.
    4. Filter to specific vendor if vendor_id query param provided.
    5. Compute balance = totalCredits - totalDebits (positive = liability).

    Args:
        organization_id: Owning org UUID.
        company_code: Company code to scope the query.
        as_of_date: Upper bound on jeDate (inclusive). Defaults to today.
        vendor_id: Optional vendor filter.
        db: Async DB session.
        _current_user: Authenticated user (read roles).

    Returns:
        VendorSubLedgerResponse with per-vendor rows.

    Raises:
        HTTPException 400: If posting setup not found or apControlAccountId not configured.
    """
    effective_date: date = as_of_date or date.today()

    # ------------------------------------------------------------------
    # 1. Resolve AP Control account from posting setup.
    # ------------------------------------------------------------------
    setup_result = await db.execute(
        select(CompanyPostingSetup).where(
            CompanyPostingSetup.organizationId == organization_id,
            CompanyPostingSetup.companyCode == company_code,
        )
    )
    setup = setup_result.scalar_one_or_none()
    if setup is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No posting setup found for company '{company_code}' in organization "
                f"'{organization_id}'. Configure via the Posting Setup page."
            ),
        )
    if not setup.apControlAccountId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"AP Control account (apControlAccountId) not configured in posting setup "
                f"for company '{company_code}'. Configure via the Posting Setup page."
            ),
        )

    # ------------------------------------------------------------------
    # 2. Build aggregation query.
    # ------------------------------------------------------------------
    # Reason: aggregate credits, debits, entry count, and last activity date
    # per referenceLineId (vendorId) in a single round trip.
    stmt = (
        select(
            JournalEntryLine.referenceLineId.label("vendor_id"),
            func.coalesce(func.sum(JournalEntryLine.credit), _ZERO).label("total_credits"),
            func.coalesce(func.sum(JournalEntryLine.debit), _ZERO).label("total_debits"),
            func.count(JournalEntryLine.jeLineId).label("entry_count"),
            func.max(JournalEntry.jeDate).label("last_activity_at"),
        )
        .join(JournalEntry, JournalEntryLine.jeId == JournalEntry.jeId)
        .where(
            JournalEntryLine.accountId == setup.apControlAccountId,
            JournalEntryLine.referenceLineId.isnot(None),
            JournalEntry.jeDate <= effective_date,
            JournalEntry.status == JEStatusEnum.POSTED,
            JournalEntry.companyCode == company_code,
        )
        .group_by(JournalEntryLine.referenceLineId)
    )

    # Reason: optional single-vendor filter for detail drill-down.
    if vendor_id is not None:
        stmt = stmt.where(JournalEntryLine.referenceLineId == vendor_id)

    rows = (await db.execute(stmt)).all()

    # ------------------------------------------------------------------
    # 3. Build response rows.
    # ------------------------------------------------------------------
    vendor_rows: List[VendorSubLedgerRow] = []
    total_outstanding = _ZERO

    for row in rows:
        credits = Decimal(str(row.total_credits))
        debits = Decimal(str(row.total_debits))
        balance = credits - debits
        total_outstanding += balance

        # Reason: jeDate is a Python date object from the DB; convert to ISO string.
        last_activity = (
            row.last_activity_at.isoformat()
            if hasattr(row.last_activity_at, "isoformat")
            else str(row.last_activity_at)
        )

        vendor_rows.append(
            VendorSubLedgerRow(
                vendorId=str(row.vendor_id),
                totalCredits=str(credits),
                totalDebits=str(debits),
                balance=str(balance),
                lastActivityAt=last_activity,
                entryCount=int(row.entry_count),
            )
        )

    # Reason: sort by balance descending — largest outstanding vendor first.
    vendor_rows.sort(key=lambda r: Decimal(r.balance), reverse=True)

    logger.info(
        "[Finance/Reports] vendor_sub_ledger org=%s company=%s as_of=%s "
        "vendors=%d total_outstanding=%s",
        organization_id,
        company_code,
        effective_date.isoformat(),
        len(vendor_rows),
        total_outstanding,
    )

    return success(VendorSubLedgerResponse(
        asOfDate=effective_date.isoformat(),
        totalOutstanding=str(total_outstanding),
        byVendor=vendor_rows,
    ))
