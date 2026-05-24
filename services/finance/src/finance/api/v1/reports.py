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
    CashFlowCategoryEnum,
    CompanyCode,
    CompanyPostingSetup,
    DrawerEnum,
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


# ===========================================================================
# Wave 2 / T-060.3 — Balance Sheet
# ===========================================================================

# BS-relevant drawers (those that hit the Balance Sheet, not the P&L).
_BS_DRAWERS = (DrawerEnum.ASSETS, DrawerEnum.LIABILITIES, DrawerEnum.EQUITY)

# P&L drawers — used to compute live Net Income for the current fiscal year.
# Mirrors the list in services/finance/src/finance/api/v1/periods.py.
_PL_DRAWERS = (
    DrawerEnum.REVENUE,
    DrawerEnum.COST_OF_SALES,
    DrawerEnum.OPERATING_COST,
    DrawerEnum.NON_OPERATING,
    DrawerEnum.OTHER_INCOME,
    DrawerEnum.TAXATION,
)

_BALANCE_TOLERANCE = Decimal("0.01")


class BalanceSheetRow(BaseModel):
    """A single account row in the Balance Sheet."""

    accountId: str
    accountNumber: str
    accountName: str
    drawer: str
    accountType: str
    parentAccountId: Optional[str]
    isHeader: bool
    # Balance with sign convention applied:
    #   ASSET → positive = DR balance (normal)
    #   LIABILITY / EQUITY → positive = CR balance (normal)
    # Header accounts carry the sum of their descendants' balances.
    balance: str


class BalanceSheetTotals(BaseModel):
    """Aggregate totals — assets should equal liabilities + equity."""

    totalAssets: str
    totalLiabilities: str
    totalEquity: str            # INCLUDES currentYearProfitLoss
    totalLiabilitiesPlusEquity: str
    balanceDelta: str           # totalAssets - totalLiabilitiesPlusEquity


class BalanceSheetResponse(BaseModel):
    """
    Balance Sheet response — flat row list with drawer + parent linkage so
    the frontend can render either as a flat table or a nested tree.

    `currentYearProfitLoss` is the live-computed net of all P&L drawer
    activity from the start of the current fiscal year up to as_of_date.
    Frontend renders it as a synthetic row inside the equity section.
    """

    organizationId: str
    companyCode: str
    asOfDate: str
    generatedAt: str
    currency: str = "AED"
    includesVoided: bool
    rows: List[BalanceSheetRow]
    currentYearProfitLoss: str
    totals: BalanceSheetTotals
    warnings: List[str] = Field(default_factory=list)


def _resolve_fiscal_year_start(
    company: CompanyCode, as_of: date
) -> date:
    """
    Compute the start date of the fiscal year containing `as_of`.

    Honors the company's `fiscalYearStartMonth` / `fiscalYearStartDay`
    settings (defaults Jan 1 / Jan 1). Examples:
      - Calendar year (1/1):  as_of=2026-05-24 → 2026-01-01.
      - Agri Aug-start (8/1): as_of=2026-05-24 → 2025-08-01.
      - Agri Aug-start (8/1): as_of=2026-09-15 → 2026-08-01.
    """
    sm = company.fiscalYearStartMonth or 1
    sd = company.fiscalYearStartDay or 1
    candidate = date(as_of.year, sm, sd)
    if candidate <= as_of:
        return candidate
    # Fiscal year started in the previous calendar year.
    return date(as_of.year - 1, sm, sd)


@router.get(
    "/reports/balance-sheet",
    response_model=SuccessResponse[BalanceSheetResponse],
    summary="Balance Sheet (as of a given date)",
    description=(
        "Wave 2 (T-060.3) — Standard Balance Sheet snapshot. Walks the "
        "Chart-of-Accounts hierarchy for ASSETS / LIABILITIES / EQUITY "
        "drawers and computes the balance of every account as of "
        "`as_of_date`. Header accounts (isHeader=True) report the sum "
        "of their descendant balances.\n\n"
        "`currentYearProfitLoss` is the live net of all P&L drawer "
        "activity from the start of the current fiscal year up to "
        "`as_of_date`. Total equity in the totals block already "
        "includes this amount.\n\n"
        "**Validation:** `totalAssets ≈ totalLiabilitiesPlusEquity` "
        "within 0.01 AED. A non-zero `balanceDelta` is surfaced as a "
        "warning rather than refusing the request."
    ),
)
async def get_balance_sheet(
    organization_id: str = Query(..., description="Required — org scope"),
    company_code: str = Query(..., description="Required — company code"),
    as_of_date: Optional[date] = Query(
        None,
        description="Snapshot date (default: today). All JEs with jeDate "
        "<= as_of_date are accumulated.",
    ),
    include_voided: bool = Query(
        False,
        description="Include voided JEs in the balance computation.",
    ),
    cost_center_id: Optional[str] = Query(
        None,
        description="Optional — filter JE lines by cost-centre. BS-by-"
        "cost-centre is non-statutory presentation; use with care.",
    ),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[BalanceSheetResponse]:
    """
    Compute the Balance Sheet as of `as_of_date` for the given
    organisation + company.

    Algorithm:
    1. Aggregate JE line debits/credits per BS account where
       jeDate <= as_of_date (LEFT JOIN from accounts to a filtered
       subquery so zero-activity accounts still appear).
    2. Apply sign convention to compute each account's balance.
    3. Walk parentAccountId to nest accounts; compute header balances
       as sum of leaf descendants.
    4. Compute current-year P/(L) separately from P&L drawer activity
       (fiscal year derived from CompanyCode settings).
    5. Validate totalAssets == totalLiabilitiesPlusEquity ±0.01 AED;
       attach a warning if not.
    """
    effective_date: date = as_of_date or date.today()
    generated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    # ------------------------------------------------------------------
    # 0. Resolve company (need fiscal-year start for live NI)
    # ------------------------------------------------------------------
    company = await db.get(CompanyCode, company_code)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company '{company_code}' not found.",
        )
    fy_start = _resolve_fiscal_year_start(company, effective_date)

    # ------------------------------------------------------------------
    # 1. BS aggregation — same LEFT-JOIN pattern as Trial Balance.
    # ------------------------------------------------------------------
    je_filters = [
        JournalEntry.organizationId == organization_id,
        JournalEntry.companyCode == company_code,
        JournalEntry.jeDate <= effective_date,
    ]
    if not include_voided:
        je_filters.append(JournalEntry.status == JEStatusEnum.POSTED)

    line_filters = []
    if cost_center_id is not None:
        line_filters.append(JournalEntryLine.costCenterId == cost_center_id)

    subq = (
        select(
            JournalEntryLine.accountId.label("account_id"),
            func.sum(JournalEntryLine.debit).label("sum_debit"),
            func.sum(JournalEntryLine.credit).label("sum_credit"),
        )
        .join(JournalEntry, JournalEntryLine.jeId == JournalEntry.jeId)
        .where(*je_filters, *line_filters)
        .group_by(JournalEntryLine.accountId)
        .subquery("bs_agg")
    )

    sum_debit = func.coalesce(subq.c.sum_debit, Decimal("0")).label("total_debit")
    sum_credit = func.coalesce(subq.c.sum_credit, Decimal("0")).label("total_credit")

    stmt = (
        select(
            GLAccount.accountId,
            GLAccount.accountNumber,
            GLAccount.accountName,
            GLAccount.drawer,
            GLAccount.accountType,
            GLAccount.parentAccountId,
            GLAccount.isHeader,
            sum_debit,
            sum_credit,
        )
        .outerjoin(subq, subq.c.account_id == GLAccount.accountId)
        .where(
            GLAccount.organizationId == organization_id,
            GLAccount.drawer.in_(_BS_DRAWERS),
            GLAccount.isActive == True,  # noqa: E712 — SQLAlchemy idiom
        )
        .group_by(
            GLAccount.accountId,
            GLAccount.accountNumber,
            GLAccount.accountName,
            GLAccount.drawer,
            GLAccount.accountType,
            GLAccount.parentAccountId,
            GLAccount.isHeader,
        )
        .order_by(GLAccount.accountNumber)
    )

    rows = (await db.execute(stmt)).all()

    # ------------------------------------------------------------------
    # 2. Compute each account's leaf balance with sign convention.
    # ------------------------------------------------------------------
    leaf_balances: Dict[str, Decimal] = {}
    account_meta: Dict[str, Dict] = {}

    for row in rows:
        dr = Decimal(str(row.total_debit))
        cr = Decimal(str(row.total_credit))

        acct_type_val = row.accountType
        if isinstance(acct_type_val, AccountTypeEnum):
            acct_type_enum = acct_type_val
        else:
            try:
                acct_type_enum = AccountTypeEnum(acct_type_val)
            except ValueError:
                acct_type_enum = AccountTypeEnum.ASSET

        # Sign convention: assets debit-natural; liability/equity credit-natural.
        if acct_type_enum in _DEBIT_NATURAL_TYPES:
            balance = dr - cr
        else:
            balance = cr - dr

        leaf_balances[row.accountId] = balance

        drawer_str = (
            row.drawer.value if hasattr(row.drawer, "value") else str(row.drawer)
        )
        account_meta[row.accountId] = {
            "accountNumber": row.accountNumber,
            "accountName": row.accountName,
            "drawer": drawer_str,
            "accountType": acct_type_enum.value,
            "parentAccountId": row.parentAccountId,
            "isHeader": bool(row.isHeader),
        }

    # ------------------------------------------------------------------
    # 3. Roll leaf balances UP into header accounts.
    #
    # For each account, walk parentAccountId chain to root, adding its
    # leaf balance into each ancestor. Headers thus end up holding the
    # sum of their descendant leaves regardless of nesting depth.
    # ------------------------------------------------------------------
    rolled: Dict[str, Decimal] = dict(leaf_balances)  # start with own balance

    for account_id, meta in account_meta.items():
        if meta["isHeader"]:
            continue  # headers don't seed their own value into ancestors
        # Walk up to add leaf balance to each ancestor header.
        leaf_balance = leaf_balances[account_id]
        parent_id = meta["parentAccountId"]
        guard = 0  # cycle guard
        while parent_id is not None and guard < 100:
            if parent_id not in rolled:
                rolled[parent_id] = Decimal("0")
            rolled[parent_id] = rolled[parent_id] + leaf_balance
            parent_meta = account_meta.get(parent_id)
            if parent_meta is None:
                break
            parent_id = parent_meta["parentAccountId"]
            guard += 1

    # For header accounts, replace their seeded (own) balance with the
    # rolled total. Leaves keep their leaf balance. Reason: headers
    # shouldn't have direct postings, but if they do (mis-classified
    # account), the leaf balance is already counted via the chain
    # walk — replacing avoids double counting.
    final_balances: Dict[str, Decimal] = {}
    for account_id, meta in account_meta.items():
        if meta["isHeader"]:
            # Header total = rolled - leaf_balance (we subtract because the
            # leaf_balance is the header's OWN direct postings, which we
            # don't want to double-count when summing descendants).
            # In practice header accounts have leaf_balance=0.
            final_balances[account_id] = rolled.get(account_id, Decimal("0"))
        else:
            final_balances[account_id] = leaf_balances[account_id]

    # ------------------------------------------------------------------
    # 4. Compute live Current Year Profit/(Loss) from P&L drawer activity.
    # ------------------------------------------------------------------
    pl_je_filters = [
        JournalEntry.organizationId == organization_id,
        JournalEntry.companyCode == company_code,
        JournalEntry.jeDate >= fy_start,
        JournalEntry.jeDate <= effective_date,
    ]
    if not include_voided:
        pl_je_filters.append(JournalEntry.status == JEStatusEnum.POSTED)

    pl_line_filters = []
    if cost_center_id is not None:
        pl_line_filters.append(JournalEntryLine.costCenterId == cost_center_id)

    ni_result = await db.execute(
        select(
            func.coalesce(func.sum(JournalEntryLine.credit), 0)
            - func.coalesce(func.sum(JournalEntryLine.debit), 0)
        )
        .select_from(JournalEntryLine)
        .join(JournalEntry, JournalEntryLine.jeId == JournalEntry.jeId)
        .join(GLAccount, JournalEntryLine.accountId == GLAccount.accountId)
        .where(
            *pl_je_filters,
            *pl_line_filters,
            GLAccount.drawer.in_(_PL_DRAWERS),
        )
    )
    current_year_pl = Decimal(str(ni_result.scalar_one() or 0))

    # ------------------------------------------------------------------
    # 5. Build response rows + compute drawer totals.
    # ------------------------------------------------------------------
    response_rows: List[BalanceSheetRow] = []
    drawer_totals: Dict[str, Decimal] = {
        DrawerEnum.ASSETS.value: Decimal("0"),
        DrawerEnum.LIABILITIES.value: Decimal("0"),
        DrawerEnum.EQUITY.value: Decimal("0"),
    }
    # For drawer totals we sum ONLY LEAF balances — header sums would
    # double-count their own children.
    for account_id, meta in account_meta.items():
        balance = final_balances[account_id]
        response_rows.append(
            BalanceSheetRow(
                accountId=account_id,
                accountNumber=meta["accountNumber"],
                accountName=meta["accountName"],
                drawer=meta["drawer"],
                accountType=meta["accountType"],
                parentAccountId=meta["parentAccountId"],
                isHeader=meta["isHeader"],
                balance=str(balance),
            )
        )
        if not meta["isHeader"]:
            drawer_totals[meta["drawer"]] = (
                drawer_totals[meta["drawer"]] + balance
            )

    # Sort rows by accountNumber so the frontend gets predictable order.
    response_rows.sort(key=lambda r: r.accountNumber)

    total_assets = drawer_totals[DrawerEnum.ASSETS.value]
    total_liabilities = drawer_totals[DrawerEnum.LIABILITIES.value]
    total_equity_gl = drawer_totals[DrawerEnum.EQUITY.value]
    # Equity total includes the live current-year P/L (see design §4.1).
    total_equity = total_equity_gl + current_year_pl
    total_liab_plus_eq = total_liabilities + total_equity
    balance_delta = total_assets - total_liab_plus_eq

    warnings: List[str] = []
    if balance_delta.copy_abs() > _BALANCE_TOLERANCE:
        warnings.append(
            f"Balance Sheet does not balance: assets={total_assets} vs "
            f"liabilities+equity={total_liab_plus_eq} (delta={balance_delta}). "
            "Investigate unbalanced JEs or missing closing entries."
        )

    logger.info(
        "[Finance/Reports] balance_sheet org=%s company=%s as_of=%s "
        "assets=%s liab=%s equity=%s ni=%s balanced=%s",
        organization_id,
        company_code,
        effective_date.isoformat(),
        total_assets,
        total_liabilities,
        total_equity,
        current_year_pl,
        balance_delta.copy_abs() <= _BALANCE_TOLERANCE,
    )

    return success(BalanceSheetResponse(
        organizationId=organization_id,
        companyCode=company_code,
        asOfDate=effective_date.isoformat(),
        generatedAt=generated_at.isoformat(),
        currency=company.defaultCurrency or "AED",
        includesVoided=include_voided,
        rows=response_rows,
        currentYearProfitLoss=str(current_year_pl),
        totals=BalanceSheetTotals(
            totalAssets=str(total_assets),
            totalLiabilities=str(total_liabilities),
            totalEquity=str(total_equity),
            totalLiabilitiesPlusEquity=str(total_liab_plus_eq),
            balanceDelta=str(balance_delta),
        ),
        warnings=warnings,
    ))


# ===========================================================================
# Wave 2 / T-060.4 — Income Statement (a.k.a. Statutory P&L)
# ===========================================================================
#
# Distinct from the existing /finance/pnl (operational P&L derived from
# sales/harvest data). This endpoint computes the statutory income
# statement directly from the GL — drawer-grouped period activity with
# Gross Profit / EBIT / Net Income subtotals.


# Order in which drawers appear on the report (top to bottom).
_IS_DRAWER_ORDER = (
    DrawerEnum.REVENUE,
    DrawerEnum.COST_OF_SALES,
    DrawerEnum.OPERATING_COST,
    DrawerEnum.OTHER_INCOME,
    DrawerEnum.NON_OPERATING,
    DrawerEnum.TAXATION,
)


class IncomeStatementAccount(BaseModel):
    """A single P&L account row in the income statement."""

    accountId: str
    accountNumber: str
    accountName: str
    drawer: str
    accountType: str
    parentAccountId: Optional[str]
    isHeader: bool
    balance: str  # natural-side balance (positive = normal)


class IncomeStatementDrawerSection(BaseModel):
    """Per-drawer block: all accounts of a single drawer + drawer total."""

    drawer: str
    total: str  # sum of leaf-account balances in this drawer (natural side)
    rows: List[IncomeStatementAccount]


class IncomeStatementSubtotals(BaseModel):
    """
    Standard P&L subtotals derived from drawer totals.

    Sign convention: each value is the conventional accounting sign —
    Revenue and Other Income contribute positively; Cost of Sales,
    Operating Cost, Non-Operating, and Taxation contribute negatively
    when summed into Net Income.

      grossProfit = revenue - costOfSales
      operatingIncome (EBIT) = grossProfit - operatingCost
      netIncome = operatingIncome + otherIncome - nonOperating - taxation
    """

    revenue: str
    costOfSales: str
    grossProfit: str
    grossMarginPercent: Optional[str]  # null when revenue = 0
    operatingCost: str
    operatingIncome: str  # EBIT
    otherIncome: str
    nonOperating: str
    taxation: str
    netIncome: str


class IncomeStatementPeriod(BaseModel):
    """A single period's IS data (used for primary + optional comparison)."""

    periodStart: str  # ISO date
    periodEnd: str
    sections: List[IncomeStatementDrawerSection]
    subtotals: IncomeStatementSubtotals


class IncomeStatementResponse(BaseModel):
    """
    Income Statement response.

    `primary` is always returned. `comparison` is populated only when
    `compare_period_start` + `compare_period_end` were provided. The
    frontend renders comparative columns side-by-side using the
    matching drawer + subtotal keys.
    """

    organizationId: str
    companyCode: str
    generatedAt: str
    currency: str
    includesVoided: bool
    primary: IncomeStatementPeriod
    comparison: Optional[IncomeStatementPeriod] = None
    warnings: List[str] = Field(default_factory=list)


async def _compute_income_statement_period(
    db: AsyncSession,
    organization_id: str,
    company_code: str,
    period_start: date,
    period_end: date,
    include_voided: bool,
    cost_center_id: Optional[str],
) -> IncomeStatementPeriod:
    """
    Compute the income statement for ONE period.

    Re-used by both the primary period and the optional comparison
    period. Same LEFT-JOIN aggregation pattern as Balance Sheet,
    filtered to P&L drawers and date-bounded by [period_start,
    period_end].
    """
    # ── Aggregate JE line activity per P&L account, period-bounded ──────
    je_filters = [
        JournalEntry.organizationId == organization_id,
        JournalEntry.companyCode == company_code,
        JournalEntry.jeDate >= period_start,
        JournalEntry.jeDate <= period_end,
    ]
    if not include_voided:
        je_filters.append(JournalEntry.status == JEStatusEnum.POSTED)

    line_filters = []
    if cost_center_id is not None:
        line_filters.append(JournalEntryLine.costCenterId == cost_center_id)

    subq = (
        select(
            JournalEntryLine.accountId.label("account_id"),
            func.sum(JournalEntryLine.debit).label("sum_debit"),
            func.sum(JournalEntryLine.credit).label("sum_credit"),
        )
        .join(JournalEntry, JournalEntryLine.jeId == JournalEntry.jeId)
        .where(*je_filters, *line_filters)
        .group_by(JournalEntryLine.accountId)
        .subquery("is_agg")
    )

    sum_debit = func.coalesce(subq.c.sum_debit, Decimal("0")).label("total_debit")
    sum_credit = func.coalesce(subq.c.sum_credit, Decimal("0")).label("total_credit")

    stmt = (
        select(
            GLAccount.accountId,
            GLAccount.accountNumber,
            GLAccount.accountName,
            GLAccount.drawer,
            GLAccount.accountType,
            GLAccount.parentAccountId,
            GLAccount.isHeader,
            sum_debit,
            sum_credit,
        )
        .outerjoin(subq, subq.c.account_id == GLAccount.accountId)
        .where(
            GLAccount.organizationId == organization_id,
            GLAccount.drawer.in_(_IS_DRAWER_ORDER),
            GLAccount.isActive == True,  # noqa: E712
        )
        .group_by(
            GLAccount.accountId,
            GLAccount.accountNumber,
            GLAccount.accountName,
            GLAccount.drawer,
            GLAccount.accountType,
            GLAccount.parentAccountId,
            GLAccount.isHeader,
        )
        .order_by(GLAccount.drawer, GLAccount.accountNumber)
    )
    rows = (await db.execute(stmt)).all()

    # ── Compute leaf balances with sign convention ──────────────────────
    leaf_balances: Dict[str, Decimal] = {}
    account_meta: Dict[str, Dict] = {}

    for row in rows:
        dr = Decimal(str(row.total_debit))
        cr = Decimal(str(row.total_credit))

        acct_type_val = row.accountType
        if isinstance(acct_type_val, AccountTypeEnum):
            acct_type_enum = acct_type_val
        else:
            try:
                acct_type_enum = AccountTypeEnum(acct_type_val)
            except ValueError:
                acct_type_enum = AccountTypeEnum.REVENUE

        # Sign convention: expenses DR-natural → balance = DR - CR.
        # Revenue / other income CR-natural → balance = CR - DR.
        if acct_type_enum in _DEBIT_NATURAL_TYPES:
            balance = dr - cr
        else:
            balance = cr - dr

        leaf_balances[row.accountId] = balance

        drawer_val = row.drawer
        drawer_str = (
            drawer_val.value if hasattr(drawer_val, "value") else str(drawer_val)
        )
        account_meta[row.accountId] = {
            "accountNumber": row.accountNumber,
            "accountName": row.accountName,
            "drawer": drawer_str,
            "accountType": acct_type_enum.value,
            "parentAccountId": row.parentAccountId,
            "isHeader": bool(row.isHeader),
        }

    # ── Roll leaf balances up into header accounts (same as BS) ─────────
    rolled: Dict[str, Decimal] = dict(leaf_balances)
    for account_id, meta in account_meta.items():
        if meta["isHeader"]:
            continue
        leaf_balance = leaf_balances[account_id]
        parent_id = meta["parentAccountId"]
        guard = 0
        while parent_id is not None and guard < 100:
            if parent_id not in rolled:
                rolled[parent_id] = Decimal("0")
            rolled[parent_id] = rolled[parent_id] + leaf_balance
            parent_meta = account_meta.get(parent_id)
            if parent_meta is None:
                break
            parent_id = parent_meta["parentAccountId"]
            guard += 1

    final_balances: Dict[str, Decimal] = {}
    for account_id, meta in account_meta.items():
        if meta["isHeader"]:
            final_balances[account_id] = rolled.get(account_id, Decimal("0"))
        else:
            final_balances[account_id] = leaf_balances[account_id]

    # ── Group rows by drawer, compute drawer totals ─────────────────────
    drawer_groups: Dict[str, List[IncomeStatementAccount]] = {
        d.value: [] for d in _IS_DRAWER_ORDER
    }
    drawer_totals: Dict[str, Decimal] = {
        d.value: Decimal("0") for d in _IS_DRAWER_ORDER
    }

    for account_id, meta in account_meta.items():
        balance = final_balances[account_id]
        drawer_groups[meta["drawer"]].append(
            IncomeStatementAccount(
                accountId=account_id,
                accountNumber=meta["accountNumber"],
                accountName=meta["accountName"],
                drawer=meta["drawer"],
                accountType=meta["accountType"],
                parentAccountId=meta["parentAccountId"],
                isHeader=meta["isHeader"],
                balance=str(balance),
            )
        )
        if not meta["isHeader"]:
            drawer_totals[meta["drawer"]] = (
                drawer_totals[meta["drawer"]] + balance
            )

    sections: List[IncomeStatementDrawerSection] = []
    for drawer_enum in _IS_DRAWER_ORDER:
        rows_for_drawer = sorted(
            drawer_groups[drawer_enum.value], key=lambda r: r.accountNumber
        )
        sections.append(
            IncomeStatementDrawerSection(
                drawer=drawer_enum.value,
                total=str(drawer_totals[drawer_enum.value]),
                rows=rows_for_drawer,
            )
        )

    # ── Subtotals ────────────────────────────────────────────────────────
    revenue = drawer_totals[DrawerEnum.REVENUE.value]
    cogs = drawer_totals[DrawerEnum.COST_OF_SALES.value]
    operating_cost = drawer_totals[DrawerEnum.OPERATING_COST.value]
    other_income = drawer_totals[DrawerEnum.OTHER_INCOME.value]
    non_operating = drawer_totals[DrawerEnum.NON_OPERATING.value]
    taxation = drawer_totals[DrawerEnum.TAXATION.value]

    gross_profit = revenue - cogs
    operating_income = gross_profit - operating_cost
    net_income = operating_income + other_income - non_operating - taxation

    gross_margin: Optional[str] = None
    if revenue != Decimal("0"):
        # Two-decimal percent for display; frontend may reformat.
        gross_margin = str((gross_profit / revenue * Decimal("100")).quantize(
            Decimal("0.01")
        ))

    subtotals = IncomeStatementSubtotals(
        revenue=str(revenue),
        costOfSales=str(cogs),
        grossProfit=str(gross_profit),
        grossMarginPercent=gross_margin,
        operatingCost=str(operating_cost),
        operatingIncome=str(operating_income),
        otherIncome=str(other_income),
        nonOperating=str(non_operating),
        taxation=str(taxation),
        netIncome=str(net_income),
    )

    return IncomeStatementPeriod(
        periodStart=period_start.isoformat(),
        periodEnd=period_end.isoformat(),
        sections=sections,
        subtotals=subtotals,
    )


@router.get(
    "/reports/income-statement",
    response_model=SuccessResponse[IncomeStatementResponse],
    summary="Income Statement (statutory P&L)",
    description=(
        "Wave 2 (T-060.4) — Statutory income statement computed from the "
        "General Ledger. Distinct from /finance/pnl (which is the "
        "operational/management P&L derived from sales + harvest data). "
        "Groups P&L drawer activity over `[period_start, period_end]` "
        "and computes standard subtotals: Gross Profit, Operating "
        "Income (EBIT), Net Income.\n\n"
        "Optional `compare_period_start` + `compare_period_end` enable "
        "a comparative column with the same shape. The frontend renders "
        "the two columns side-by-side using matching drawer/subtotal "
        "keys.\n\n"
        "Optional `cost_center_id` filters JE lines so a single "
        "cost-centre's P&L can be inspected."
    ),
)
async def get_income_statement(
    organization_id: str = Query(..., description="Required — org scope"),
    company_code: str = Query(..., description="Required — company code"),
    period_start: date = Query(..., description="Inclusive period start"),
    period_end: date = Query(..., description="Inclusive period end"),
    compare_period_start: Optional[date] = Query(
        None, description="Optional comparison period start"
    ),
    compare_period_end: Optional[date] = Query(
        None, description="Optional comparison period end"
    ),
    include_voided: bool = Query(
        False, description="Include voided JEs in the totals"
    ),
    cost_center_id: Optional[str] = Query(
        None, description="Optional cost-centre filter on JE lines"
    ),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[IncomeStatementResponse]:
    """
    Compute the income statement for the given period.

    Raises:
      400 if period_end < period_start, or if the comparison-period
          query params are partially provided.
      404 if the company is unknown.
    """
    if period_end < period_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"period_end ({period_end}) must be on or after "
                f"period_start ({period_start})."
            ),
        )

    if (compare_period_start is None) != (compare_period_end is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "compare_period_start and compare_period_end must be "
                "provided together or omitted together."
            ),
        )
    if compare_period_start and compare_period_end:
        if compare_period_end < compare_period_start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"compare_period_end ({compare_period_end}) must be on "
                    f"or after compare_period_start ({compare_period_start})."
                ),
            )

    # Verify the company exists (consistent with BS endpoint).
    company = await db.get(CompanyCode, company_code)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company '{company_code}' not found.",
        )

    generated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    # Compute primary period
    primary = await _compute_income_statement_period(
        db=db,
        organization_id=organization_id,
        company_code=company_code,
        period_start=period_start,
        period_end=period_end,
        include_voided=include_voided,
        cost_center_id=cost_center_id,
    )

    # Compute optional comparison period
    comparison: Optional[IncomeStatementPeriod] = None
    if compare_period_start and compare_period_end:
        comparison = await _compute_income_statement_period(
            db=db,
            organization_id=organization_id,
            company_code=company_code,
            period_start=compare_period_start,
            period_end=compare_period_end,
            include_voided=include_voided,
            cost_center_id=cost_center_id,
        )

    logger.info(
        "[Finance/Reports] income_statement org=%s company=%s "
        "period=%s..%s ni=%s",
        organization_id,
        company_code,
        period_start.isoformat(),
        period_end.isoformat(),
        primary.subtotals.netIncome,
    )

    return success(IncomeStatementResponse(
        organizationId=organization_id,
        companyCode=company_code,
        generatedAt=generated_at.isoformat(),
        currency=company.defaultCurrency or "AED",
        includesVoided=include_voided,
        primary=primary,
        comparison=comparison,
        warnings=[],
    ))


# ===========================================================================
# Wave 2 / T-060.5 — Cash Flow Statement (indirect method)
# ===========================================================================
#
# Indirect-method CF starts from Net Income, adds back non-cash items
# (depreciation, amortisation, provisions), adjusts for working-capital
# changes (AR/AP/inventory deltas), then layers investing + financing
# activity. Bucket placement is driven by the GL account's
# `cashFlowCategory` column (seeded by Alembic migration 014).
#
# Sign convention (uniform across all categories):
#   - ASSET accounts:    cash contribution = -Δ(natural balance)
#   - LIABILITY accounts: cash contribution = +Δ(natural balance)
#   - EQUITY accounts:    cash contribution = +Δ(natural balance)
# Where natural balance follows the same convention as Balance Sheet:
#   - ASSETS / EXPENSES: balance = DR - CR
#   - LIABILITIES / EQUITY / REVENUE: balance = CR - DR


from datetime import timedelta  # noqa: E402  (kept near CF section)


class CashFlowLine(BaseModel):
    """A single contributing account row inside a CF section."""

    accountId: str
    accountNumber: str
    accountName: str
    drawer: str
    contribution: str          # signed value contributed to cash flow


class CashFlowOperatingSection(BaseModel):
    """
    Operating activities — net income + non-cash + working capital.

    `nonCashAdjustments` and `workingCapitalChanges` are surfaced as
    separate line lists so the frontend can render the textbook
    indirect-method layout.
    """

    netIncome: str
    nonCashAdjustments: List[CashFlowLine]
    nonCashAdjustmentsTotal: str
    workingCapitalChanges: List[CashFlowLine]
    workingCapitalChangesTotal: str
    total: str                  # netIncome + nonCash + workingCapital


class CashFlowActivitySection(BaseModel):
    """Investing or Financing activities — flat line list."""

    items: List[CashFlowLine]
    total: str


class CashFlowResponse(BaseModel):
    """Cash Flow Statement response (indirect method)."""

    organizationId: str
    companyCode: str
    periodStart: str
    periodEnd: str
    generatedAt: str
    currency: str
    includesVoided: bool
    operating: CashFlowOperatingSection
    investing: CashFlowActivitySection
    financing: CashFlowActivitySection
    netChangeInCash: str
    cashAtBeginning: str
    cashAtEnd: str
    cashDelta: str              # cashAtEnd - cashAtBeginning
    reconciliationDelta: str    # netChangeInCash - cashDelta
    warnings: List[str] = Field(default_factory=list)


async def _balances_at_date(
    db: AsyncSession,
    organization_id: str,
    company_code: str,
    as_of: date,
    include_voided: bool,
    cost_center_id: Optional[str],
) -> Dict[str, Decimal]:
    """
    Return {accountId: natural_balance} for every active BS account as of
    `as_of`. Uses the same sign convention as Balance Sheet: ASSET DR-
    natural, LIABILITY/EQUITY CR-natural.

    Accounts with zero activity appear with balance Decimal("0").
    """
    je_filters = [
        JournalEntry.organizationId == organization_id,
        JournalEntry.companyCode == company_code,
        JournalEntry.jeDate <= as_of,
    ]
    if not include_voided:
        je_filters.append(JournalEntry.status == JEStatusEnum.POSTED)

    line_filters = []
    if cost_center_id is not None:
        line_filters.append(JournalEntryLine.costCenterId == cost_center_id)

    subq = (
        select(
            JournalEntryLine.accountId.label("account_id"),
            func.sum(JournalEntryLine.debit).label("sum_debit"),
            func.sum(JournalEntryLine.credit).label("sum_credit"),
        )
        .join(JournalEntry, JournalEntryLine.jeId == JournalEntry.jeId)
        .where(*je_filters, *line_filters)
        .group_by(JournalEntryLine.accountId)
        .subquery(f"bal_agg_{as_of.isoformat().replace('-','')}")
    )

    sum_debit = func.coalesce(subq.c.sum_debit, Decimal("0"))
    sum_credit = func.coalesce(subq.c.sum_credit, Decimal("0"))

    stmt = (
        select(
            GLAccount.accountId,
            GLAccount.accountType,
            sum_debit.label("dr"),
            sum_credit.label("cr"),
        )
        .outerjoin(subq, subq.c.account_id == GLAccount.accountId)
        .where(
            GLAccount.organizationId == organization_id,
            GLAccount.drawer.in_(
                (DrawerEnum.ASSETS, DrawerEnum.LIABILITIES, DrawerEnum.EQUITY)
            ),
            GLAccount.isActive == True,  # noqa: E712
        )
    )
    rows = (await db.execute(stmt)).all()

    balances: Dict[str, Decimal] = {}
    for row in rows:
        dr = Decimal(str(row.dr))
        cr = Decimal(str(row.cr))
        atype = row.accountType
        if not isinstance(atype, AccountTypeEnum):
            try:
                atype = AccountTypeEnum(atype)
            except ValueError:
                atype = AccountTypeEnum.ASSET
        if atype in _DEBIT_NATURAL_TYPES:
            balances[row.accountId] = dr - cr
        else:
            balances[row.accountId] = cr - dr
    return balances


async def _net_income_for_period(
    db: AsyncSession,
    organization_id: str,
    company_code: str,
    period_start: date,
    period_end: date,
    include_voided: bool,
    cost_center_id: Optional[str],
) -> Decimal:
    """Sum P&L drawer activity (credit - debit) for the period."""
    pl_je_filters = [
        JournalEntry.organizationId == organization_id,
        JournalEntry.companyCode == company_code,
        JournalEntry.jeDate >= period_start,
        JournalEntry.jeDate <= period_end,
    ]
    if not include_voided:
        pl_je_filters.append(JournalEntry.status == JEStatusEnum.POSTED)
    pl_line_filters = []
    if cost_center_id is not None:
        pl_line_filters.append(JournalEntryLine.costCenterId == cost_center_id)

    result = await db.execute(
        select(
            func.coalesce(func.sum(JournalEntryLine.credit), 0)
            - func.coalesce(func.sum(JournalEntryLine.debit), 0)
        )
        .select_from(JournalEntryLine)
        .join(JournalEntry, JournalEntryLine.jeId == JournalEntry.jeId)
        .join(GLAccount, JournalEntryLine.accountId == GLAccount.accountId)
        .where(
            *pl_je_filters,
            *pl_line_filters,
            GLAccount.drawer.in_(
                (
                    DrawerEnum.REVENUE,
                    DrawerEnum.COST_OF_SALES,
                    DrawerEnum.OPERATING_COST,
                    DrawerEnum.NON_OPERATING,
                    DrawerEnum.OTHER_INCOME,
                    DrawerEnum.TAXATION,
                )
            ),
        )
    )
    return Decimal(str(result.scalar_one() or 0))


@router.get(
    "/reports/cash-flow",
    response_model=SuccessResponse[CashFlowResponse],
    summary="Cash Flow Statement (indirect method)",
    description=(
        "Wave 2 (T-060.5) — Indirect-method Cash Flow Statement. "
        "Starts from net income, adds back non-cash items, adjusts for "
        "working-capital changes, then layers investing + financing "
        "activity. Bucket placement comes from each GL account's "
        "`cashFlowCategory` (seeded by Alembic migration 014).\n\n"
        "**Validation:** Net Change in Cash should equal Cash at End − "
        "Cash at Beginning within 0.01 AED. Any mismatch is surfaced "
        "as a warning rather than refusing the report — typically "
        "caused by accounts the operator hasn't classified yet (still "
        "`cashFlowCategory='none'`), which silently drop out of the "
        "computation."
    ),
)
async def get_cash_flow(
    organization_id: str = Query(..., description="Required — org scope"),
    company_code: str = Query(..., description="Required — company code"),
    period_start: date = Query(..., description="Inclusive period start"),
    period_end: date = Query(..., description="Inclusive period end"),
    include_voided: bool = Query(
        False, description="Include voided JEs"
    ),
    cost_center_id: Optional[str] = Query(
        None, description="Optional cost-centre filter on JE lines"
    ),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[CashFlowResponse]:
    """
    Compute the indirect-method cash flow statement for the period.

    Raises:
      400 if period_end < period_start.
      404 if company unknown.
    """
    if period_end < period_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"period_end ({period_end}) must be on or after "
                f"period_start ({period_start})."
            ),
        )

    company = await db.get(CompanyCode, company_code)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company '{company_code}' not found.",
        )

    generated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    # ── Net Income for the period (also the Operating starting point) ──
    net_income = await _net_income_for_period(
        db, organization_id, company_code, period_start, period_end,
        include_voided, cost_center_id,
    )

    # ── Opening + closing BS balances ──────────────────────────────────
    # Opening = everything posted with jeDate < period_start.
    opening_as_of = period_start - timedelta(days=1)
    opening = await _balances_at_date(
        db, organization_id, company_code, opening_as_of,
        include_voided, cost_center_id,
    )
    closing = await _balances_at_date(
        db, organization_id, company_code, period_end,
        include_voided, cost_center_id,
    )

    # ── Fetch account metadata (drawer, type, category) ────────────────
    accts_result = await db.execute(
        select(
            GLAccount.accountId,
            GLAccount.accountNumber,
            GLAccount.accountName,
            GLAccount.drawer,
            GLAccount.accountType,
            GLAccount.cashFlowCategory,
        )
        .where(
            GLAccount.organizationId == organization_id,
            GLAccount.drawer.in_(
                (DrawerEnum.ASSETS, DrawerEnum.LIABILITIES, DrawerEnum.EQUITY)
            ),
            GLAccount.isActive == True,  # noqa: E712
        )
    )
    accts = accts_result.all()

    # ── Bucket Δ contributions by cashFlowCategory ─────────────────────
    non_cash: List[CashFlowLine] = []
    working_cap: List[CashFlowLine] = []
    investing: List[CashFlowLine] = []
    financing: List[CashFlowLine] = []

    non_cash_total = Decimal("0")
    working_cap_total = Decimal("0")
    investing_total = Decimal("0")
    financing_total = Decimal("0")
    cash_at_begin = Decimal("0")
    cash_at_end = Decimal("0")

    for row in accts:
        opening_bal = opening.get(row.accountId, Decimal("0"))
        closing_bal = closing.get(row.accountId, Decimal("0"))
        delta = closing_bal - opening_bal

        # Sign convention: asset increase = cash outflow.
        atype = row.accountType
        if not isinstance(atype, AccountTypeEnum):
            try:
                atype = AccountTypeEnum(atype)
            except ValueError:
                atype = AccountTypeEnum.ASSET
        if atype == AccountTypeEnum.ASSET:
            contribution = -delta
        else:
            # Liability & Equity: increase = cash inflow.
            contribution = delta

        category = row.cashFlowCategory
        if not isinstance(category, CashFlowCategoryEnum):
            try:
                category = CashFlowCategoryEnum(category)
            except (ValueError, TypeError):
                category = CashFlowCategoryEnum.NONE

        # CASH category accounts: track opening / closing only.
        if category == CashFlowCategoryEnum.CASH:
            cash_at_begin = cash_at_begin + opening_bal
            cash_at_end = cash_at_end + closing_bal
            continue

        # NONE category: silently excluded — this is the design intent
        # for P&L accounts (already captured in netIncome) and any
        # accounts the operator hasn't yet classified.
        if category == CashFlowCategoryEnum.NONE:
            continue

        drawer_str = (
            row.drawer.value if hasattr(row.drawer, "value") else str(row.drawer)
        )
        line = CashFlowLine(
            accountId=row.accountId,
            accountNumber=row.accountNumber,
            accountName=row.accountName,
            drawer=drawer_str,
            contribution=str(contribution),
        )

        if category == CashFlowCategoryEnum.NON_CASH_ADJUSTMENT:
            # Skip zero-contribution lines — keeps the report tidy.
            if contribution != Decimal("0"):
                non_cash.append(line)
            non_cash_total = non_cash_total + contribution
        elif category == CashFlowCategoryEnum.WORKING_CAPITAL:
            if contribution != Decimal("0"):
                working_cap.append(line)
            working_cap_total = working_cap_total + contribution
        elif category == CashFlowCategoryEnum.INVESTING:
            if contribution != Decimal("0"):
                investing.append(line)
            investing_total = investing_total + contribution
        elif category == CashFlowCategoryEnum.FINANCING:
            if contribution != Decimal("0"):
                financing.append(line)
            financing_total = financing_total + contribution

    # Sort lines deterministically.
    non_cash.sort(key=lambda l: l.accountNumber)
    working_cap.sort(key=lambda l: l.accountNumber)
    investing.sort(key=lambda l: l.accountNumber)
    financing.sort(key=lambda l: l.accountNumber)

    operating_total = net_income + non_cash_total + working_cap_total
    net_change = operating_total + investing_total + financing_total
    cash_delta = cash_at_end - cash_at_begin
    reconciliation_delta = net_change - cash_delta

    warnings: List[str] = []
    if reconciliation_delta.copy_abs() > _BALANCE_TOLERANCE:
        warnings.append(
            f"Cash Flow Statement does not reconcile: net change="
            f"{net_change} vs (end−begin) cash delta={cash_delta} "
            f"(reconciliation delta={reconciliation_delta}). Likely "
            "cause: accounts with cashFlowCategory='none' that should "
            "have been classified."
        )

    logger.info(
        "[Finance/Reports] cash_flow org=%s company=%s period=%s..%s "
        "ni=%s nonCash=%s wc=%s inv=%s fin=%s netChange=%s cashDelta=%s",
        organization_id, company_code,
        period_start.isoformat(), period_end.isoformat(),
        net_income, non_cash_total, working_cap_total,
        investing_total, financing_total, net_change, cash_delta,
    )

    return success(CashFlowResponse(
        organizationId=organization_id,
        companyCode=company_code,
        periodStart=period_start.isoformat(),
        periodEnd=period_end.isoformat(),
        generatedAt=generated_at.isoformat(),
        currency=company.defaultCurrency or "AED",
        includesVoided=include_voided,
        operating=CashFlowOperatingSection(
            netIncome=str(net_income),
            nonCashAdjustments=non_cash,
            nonCashAdjustmentsTotal=str(non_cash_total),
            workingCapitalChanges=working_cap,
            workingCapitalChangesTotal=str(working_cap_total),
            total=str(operating_total),
        ),
        investing=CashFlowActivitySection(
            items=investing, total=str(investing_total),
        ),
        financing=CashFlowActivitySection(
            items=financing, total=str(financing_total),
        ),
        netChangeInCash=str(net_change),
        cashAtBeginning=str(cash_at_begin),
        cashAtEnd=str(cash_at_end),
        cashDelta=str(cash_delta),
        reconciliationDelta=str(reconciliation_delta),
        warnings=warnings,
    ))
