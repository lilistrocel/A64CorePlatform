"""
Fiscal Periods API

Endpoints to create and manage fiscal periods.

Permissions:
- GET: accountant, finance_admin, auditor
- POST: finance_admin
- PATCH /close, /reopen: finance_admin

Audit trail (migration 013):
  closedAt / closedByUserId / closeReason — populated on close, cleared on reopen.
  reopenedAt / reopenedByUserId / reopenReason — populated on reopen, cleared on close.
  On a close-reopen-close cycle the fields always reflect the MOST RECENT transition.

T-060.11-preview (2026-05-29):
  `close_period` now accepts `dry_run=true` query flag. All pre-close validations
  still run. When dry_run=true the closing-JE lines are computed but never written;
  the response carries `closingJePreview` instead of `closingJe`. When dry_run=false
  (default) the behaviour is unchanged — the preview is computed first and then used
  as the source for the real write, guaranteeing the preview matches the commit.
"""

import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...db.session import get_db
from ...middleware.auth import TokenPayload, require_roles
from ...models.orm.models import (
    AccountTypeEnum,
    AuditLog,
    CompanyCode,
    CompanyPostingSetup,
    DrawerEnum,
    FiscalPeriod,
    GLAccount,
    JEStatusEnum,
    JournalEntry,
    JournalEntryLine,
    PeriodStatusEnum,
)
from ...models.schemas.common import SuccessResponse
from ...models.schemas.period import FiscalPeriodCreate, FiscalPeriodResponse
from ...utils.responses import success

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Fiscal Periods"])

_READ_ROLES = ("accountant", "finance_admin", "auditor", "super_admin", "admin")
_WRITE_ROLES = ("finance_admin", "super_admin", "admin")


# ---------------------------------------------------------------------------
# Request body schemas
# ---------------------------------------------------------------------------


class ClosePeriodRequest(BaseModel):
    """Optional body for the close-period endpoint.

    When dry_run=true the `reason` field is not required — the user is
    previewing the proposed closing JE before committing.  On dry_run=false
    (the real close) `reason` remains optional (it was always optional here;
    the audit record still captures it when supplied).
    """

    reason: Optional[str] = Field(
        None,
        max_length=500,
        description="Optional explanation for closing this period (max 500 chars).",
    )


class ReopenPeriodRequest(BaseModel):
    """Required body for the reopen-period endpoint.

    Production accounting requires a reason whenever a closed period is
    reopened — this is a mandatory audit-trail requirement.
    """

    reason: str = Field(
        ...,
        min_length=5,
        max_length=500,
        description="Required justification for reopening this period (5–500 chars).",
    )


# ---------------------------------------------------------------------------
# Response body schemas (Wave 2 / T-060.1 — closing JE info on close response)
# ---------------------------------------------------------------------------


class ClosingJeInfo(BaseModel):
    """Closing-JE metadata returned alongside the period on close/reopen."""

    jeId: str
    jeNumber: str
    jeDate: date
    netIncome: Decimal
    currencyCode: str = "AED"

    model_config = {"from_attributes": True}


class ClosePeriodResponse(BaseModel):
    """Response shape for POST /periods/{id}/close (Wave 2, dry_run=false)."""

    period: FiscalPeriodResponse
    closingJe: Optional[ClosingJeInfo] = Field(
        None,
        description=(
            "Closing JE auto-posted when this period contains the fiscal "
            "year-end. Null for ordinary monthly closes."
        ),
    )


class ReopenPeriodResponse(BaseModel):
    """Response shape for POST /periods/{id}/reopen (Wave 2)."""

    period: FiscalPeriodResponse
    closingJeReversal: Optional[ClosingJeInfo] = Field(
        None,
        description=(
            "Offsetting JE posted to reverse the original closing JE when "
            "reopening a fiscal year-end period. Null if no closing JE was "
            "found for this period."
        ),
    )


# ---------------------------------------------------------------------------
# T-060.11-preview — dry-run preview schemas
# ---------------------------------------------------------------------------


class ClosingJePreviewLine(BaseModel):
    """One proposed line of the would-be closing JE.

    Amounts are Decimal strings so the frontend can render them without
    floating-point rounding surprises.  Exactly one of `debit` / `credit`
    is non-null on each line (the other is None).
    """

    lineNumber: int
    accountId: str
    accountNumber: str
    accountName: str
    debit: Optional[Decimal] = None
    credit: Optional[Decimal] = None
    description: str


class ClosingJeTargetAccount(BaseModel):
    """Identifies the Retained Earnings account that receives the net."""

    accountId: str
    accountNumber: str
    accountName: str


class ClosingJePreview(BaseModel):
    """
    Proposed closing-JE structure returned when dry_run=true.

    For a **year-end period** with non-zero net income:
      - `isYearEnd` = True
      - `lines` contains the two balanced JE lines (DR / CR)
      - `totalDebit` == `totalCredit`
      - `netIncome` = absolute value of net income (positive for profit,
        negative for loss)
      - `targetAccount` identifies the Retained Earnings destination
      - `note` = None

    For a **mid-year (monthly) period** or a year-end period with zero
    net income:
      - `isYearEnd` = True/False accordingly
      - `lines` = []
      - `totalDebit` = `totalCredit` = Decimal("0")
      - `netIncome` = Decimal("0")
      - `targetAccount` = None
      - `note` describes why no JE would be posted
    """

    isYearEnd: bool
    lines: List[ClosingJePreviewLine]
    totalDebit: Decimal
    totalCredit: Decimal
    netIncome: Decimal
    targetAccount: Optional[ClosingJeTargetAccount] = None
    note: Optional[str] = None


class PreviewClosePeriodResponse(BaseModel):
    """Response shape for PATCH /periods/{id}/close?dry_run=true."""

    period: FiscalPeriodResponse
    closingJePreview: ClosingJePreview


# ---------------------------------------------------------------------------
# Helpers — Wave 2 / T-060.1 (period close + closing JE)
# ---------------------------------------------------------------------------

# Current Year Profit/(Loss) account is identified by code in the standard
# UAE-agri seed CoA (`Docs/4-Finance-Mod-docs/FINANCE_MODULE_GUIDE.md` §5).
# We look it up per-organization because the CoA is org-scoped. If a tenant
# customised their CoA away from this code, surface a clear error rather
# than silently picking a wrong account.
_CURRENT_YEAR_PL_ACCOUNT_CODE = "312000-002"

# P&L drawers — anything that contributes to Net Income calculation.
# Sign convention by AccountType (matches Trial Balance):
#   REVENUE / EQUITY / LIABILITY → balance = sum(credit) - sum(debit)
#   EXPENSE / ASSET → balance = sum(debit) - sum(credit)
_PL_DRAWERS = (
    DrawerEnum.REVENUE,
    DrawerEnum.COST_OF_SALES,
    DrawerEnum.OPERATING_COST,
    DrawerEnum.NON_OPERATING,
    DrawerEnum.OTHER_INCOME,
    DrawerEnum.TAXATION,
)

# Floating-point tolerance for balance validation (1 fil = 0.01 AED).
_BALANCE_TOLERANCE = Decimal("0.01")


async def _resolve_closing_accounts(
    db: AsyncSession,
    organization_id: str,
    company_code: str,
) -> Tuple[str, str]:
    """
    Resolve the two GL accounts the closing JE writes to.

    Returns (currentYearPlAccountId, retainedEarningsAccountId).

    Raises HTTPException 400 with a remediation hint when either account
    is missing — closing cannot proceed without both.
    """
    cy_account = await db.scalar(
        select(GLAccount.accountId).where(
            GLAccount.organizationId == organization_id,
            GLAccount.accountNumber == _CURRENT_YEAR_PL_ACCOUNT_CODE,
        )
    )
    if cy_account is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Current Year Profit/(Loss) account ({_CURRENT_YEAR_PL_ACCOUNT_CODE}) "
                "is missing from the Chart of Accounts. Add it before closing "
                "the fiscal year-end period."
            ),
        )

    setup = await db.scalar(
        select(CompanyPostingSetup).where(
            CompanyPostingSetup.organizationId == organization_id,
            CompanyPostingSetup.companyCode == company_code,
        )
    )
    if setup is None or setup.retainedEarningsAccountId is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Retained Earnings account is not configured in Posting Setup "
                f"for company {company_code}. Set it on the Posting Setup page "
                "before closing the fiscal year-end period."
            ),
        )

    return cy_account, setup.retainedEarningsAccountId


async def _is_fiscal_year_end_period(
    db: AsyncSession, period: FiscalPeriod
) -> bool:
    """
    Return True if `period` is the last period of its fiscal year.

    Detection: compare period.endDate to the MAX endDate across all periods
    in the same (companyCode, fiscalYear). Robust regardless of whether the
    company uses a calendar year, an August-start agri year, or a 4-4-5
    calendar.
    """
    max_end = await db.scalar(
        select(func.max(FiscalPeriod.endDate)).where(
            FiscalPeriod.companyCode == period.companyCode,
            FiscalPeriod.fiscalYear == period.fiscalYear,
        )
    )
    return max_end is not None and period.endDate == max_end


async def _compute_fiscal_year_net_income(
    db: AsyncSession,
    organization_id: str,
    company_code: str,
    fiscal_year: int,
) -> Decimal:
    """
    Net Income for the fiscal year = sum of P&L drawer activity.

    REVENUE + OTHER_INCOME contribute via (credit - debit).
    COST_OF_SALES + OPERATING_COST + NON_OPERATING + TAXATION contribute
    via (credit - debit) too (their balances are debit-positive, so a
    positive sum means a debit balance → expense → reduces NI).

    Net Income = Σ (credit - debit) for all P&L lines in the fiscal year.

    A positive return = profit; negative = loss.
    """
    # Find all period IDs belonging to this fiscal year for this company.
    period_ids_q = await db.execute(
        select(FiscalPeriod.periodId).where(
            FiscalPeriod.companyCode == company_code,
            FiscalPeriod.fiscalYear == fiscal_year,
        )
    )
    period_ids = [row[0] for row in period_ids_q.all()]
    if not period_ids:
        return Decimal("0")

    # Aggregate JE line debits/credits joined to P&L-drawer accounts.
    result = await db.execute(
        select(
            func.coalesce(func.sum(JournalEntryLine.credit), 0)
            - func.coalesce(func.sum(JournalEntryLine.debit), 0)
        )
        .select_from(JournalEntryLine)
        .join(JournalEntry, JournalEntryLine.jeId == JournalEntry.jeId)
        .join(GLAccount, JournalEntryLine.accountId == GLAccount.accountId)
        .where(
            JournalEntry.organizationId == organization_id,
            JournalEntry.companyCode == company_code,
            JournalEntry.periodId.in_(period_ids),
            JournalEntry.status == JEStatusEnum.POSTED,
            GLAccount.drawer.in_(_PL_DRAWERS),
        )
    )
    net_income = result.scalar_one() or Decimal("0")
    # Convert to Decimal explicitly (SQLAlchemy may return float on SQLite).
    return Decimal(str(net_income))


async def _validate_period_balanced(
    db: AsyncSession,
    organization_id: str,
    company_code: str,
    period_id: str,
) -> None:
    """
    Refuse to close a period whose JEs don't balance (Σ DR != Σ CR within
    the period). A mismatch signals corrupted data and must be investigated
    before close — silently closing would hide the problem.
    """
    result = await db.execute(
        select(
            func.coalesce(func.sum(JournalEntryLine.debit), 0).label("dr"),
            func.coalesce(func.sum(JournalEntryLine.credit), 0).label("cr"),
        )
        .select_from(JournalEntryLine)
        .join(JournalEntry, JournalEntryLine.jeId == JournalEntry.jeId)
        .where(
            JournalEntry.organizationId == organization_id,
            JournalEntry.companyCode == company_code,
            JournalEntry.periodId == period_id,
            JournalEntry.status == JEStatusEnum.POSTED,
        )
    )
    row = result.one()
    dr = Decimal(str(row.dr or 0))
    cr = Decimal(str(row.cr or 0))
    delta = (dr - cr).copy_abs()
    if delta > _BALANCE_TOLERANCE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Period {period_id} does not balance: Σ DR = {dr}, "
                f"Σ CR = {cr}, delta = {delta}. Investigate and correct "
                "before closing."
            ),
        )


async def _next_je_number(
    db: AsyncSession, company_code: str, fiscal_year: int
) -> str:
    """
    Generate the next sequential JE number for (companyCode, fiscalYear).

    Mirrors the implementation in events.py — duplicated here to keep
    api/v1 modules from importing each other (cleaner module graph).
    Format: JE-{companyCode}-{YYYY}-{NNNN} (zero-padded to 4 digits).
    """
    prefix = f"JE-{company_code}-{fiscal_year}-"
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
        suffix_str = max_number.rsplit("-", 1)[-1]
        try:
            next_seq = int(suffix_str) + 1
        except ValueError:
            next_seq = 1
    return f"{prefix}{next_seq:04d}"


# ---------------------------------------------------------------------------
# T-060.11-preview — pure compute phase (no DB writes)
# ---------------------------------------------------------------------------


async def _compute_closing_je_preview(
    db: AsyncSession,
    period: FiscalPeriod,
    organization_id: str,
) -> ClosingJePreview:
    """
    Compute what the closing JE *would* look like for this period.

    No DB writes.  Returns a ClosingJePreview that the caller can either
    render directly (dry_run=True) or use as the blueprint for the real
    JE write (_post_closing_je_from_preview), guaranteeing that the
    preview and the committed JE are identical.

    Year-end detection:
        Compares period.endDate to MAX(endDate) across all periods for the
        same (companyCode, fiscalYear).  Robust against arbitrary fiscal
        calendars — no hard-coded month assumption.

    For a **year-end period** with |net income| > 0.01 AED:
        Line 1 — debit leg  (DR Current Year P/(L)  or DR Retained Earnings)
        Line 2 — credit leg (CR Retained Earnings   or CR Current Year P/(L))
        totalDebit == totalCredit == |net_income|

    For a **mid-year period** or a year-end period with zero net income:
        lines = [], totals = 0, note populated.

    Args:
        db:              Active async session (read-only in this function).
        period:          The FiscalPeriod ORM row being considered for close.
        organization_id: Org scope for CoA and PostingSetup lookups.

    Returns:
        ClosingJePreview — structured preview the caller can show or commit.

    Raises:
        HTTPException 400: If year-end close is detected but closing accounts
                           are not configured (same error the real close raises).
    """
    is_year_end = await _is_fiscal_year_end_period(db, period)

    if not is_year_end:
        return ClosingJePreview(
            isYearEnd=False,
            lines=[],
            totalDebit=Decimal("0"),
            totalCredit=Decimal("0"),
            netIncome=Decimal("0"),
            targetAccount=None,
            note="No closing JE — period status flip only (mid-year close).",
        )

    # Compute net income first. Accounts are only needed (and validated) when
    # net income is non-zero — a zero-NI year-end still closes cleanly without
    # posting a JE, so we must not require PostingSetup in that case.
    net_income = await _compute_fiscal_year_net_income(
        db, organization_id, period.companyCode, period.fiscalYear
    )

    if net_income.copy_abs() <= _BALANCE_TOLERANCE:
        return ClosingJePreview(
            isYearEnd=True,
            lines=[],
            totalDebit=Decimal("0"),
            totalCredit=Decimal("0"),
            netIncome=Decimal("0"),
            targetAccount=None,
            note=(
                "Net income for the fiscal year is zero (within 0.01 AED tolerance). "
                "No closing JE will be posted."
            ),
        )

    # Net income is non-zero — resolve closing accounts now. If they are missing,
    # surface a clear 400 before building any lines. (Same behaviour as old code.)
    cy_account_id, re_account_id = await _resolve_closing_accounts(
        db, organization_id, period.companyCode
    )

    # Fetch account metadata (number + name) for both accounts so the preview
    # lines carry human-readable info, not just opaque UUIDs.
    accounts_result = await db.execute(
        select(
            GLAccount.accountId,
            GLAccount.accountNumber,
            GLAccount.accountName,
        ).where(
            GLAccount.accountId.in_([cy_account_id, re_account_id])
        )
    )
    acct_map: dict[str, Tuple[str, str]] = {
        row.accountId: (row.accountNumber, row.accountName)
        for row in accounts_result.all()
    }

    cy_num, cy_name = acct_map.get(cy_account_id, (_CURRENT_YEAR_PL_ACCOUNT_CODE, "Current Year P/(L)"))
    re_num, re_name = acct_map.get(re_account_id, ("312000-001", "Retained Earnings"))

    amount = net_income.copy_abs()
    profit = net_income >= 0

    # Profit: DR Current Year P/(L) / CR Retained Earnings
    # Loss:   DR Retained Earnings  / CR Current Year P/(L)
    if profit:
        dr_id, dr_num, dr_name = cy_account_id, cy_num, cy_name
        cr_id, cr_num, cr_name = re_account_id, re_num, re_name
        dr_desc = "Year-end closing — debit leg"
        cr_desc = "Year-end closing — credit leg"
    else:
        dr_id, dr_num, dr_name = re_account_id, re_num, re_name
        cr_id, cr_num, cr_name = cy_account_id, cy_num, cy_name
        dr_desc = "Year-end closing — debit leg"
        cr_desc = "Year-end closing — credit leg"

    lines = [
        ClosingJePreviewLine(
            lineNumber=1,
            accountId=dr_id,
            accountNumber=dr_num,
            accountName=dr_name,
            debit=amount,
            credit=None,
            description=dr_desc,
        ),
        ClosingJePreviewLine(
            lineNumber=2,
            accountId=cr_id,
            accountNumber=cr_num,
            accountName=cr_name,
            debit=None,
            credit=amount,
            description=cr_desc,
        ),
    ]

    target = ClosingJeTargetAccount(
        accountId=re_account_id,
        accountNumber=re_num,
        accountName=re_name,
    )

    return ClosingJePreview(
        isYearEnd=True,
        lines=lines,
        totalDebit=amount,
        totalCredit=amount,
        netIncome=net_income,
        targetAccount=target,
        note=None,
    )


async def _post_closing_je_from_preview(
    db: AsyncSession,
    organization_id: str,
    period: FiscalPeriod,
    preview: ClosingJePreview,
    user_id: str,
    now_utc: datetime,
) -> JournalEntry:
    """
    Persist the closing JE whose lines were already computed by
    `_compute_closing_je_preview`.  No re-computation happens here —
    the `preview` is the single source of truth for both the dry-run
    response and the real write.  This guarantees that the preview the
    user sees matches the JE that is actually posted.

    Caller is responsible for:
      - Verifying `preview.lines` is non-empty before calling.
      - Calling `_next_je_number` AFTER deciding to commit (not during preview)
        so no sequence number is consumed by a dry-run.

    Args:
        db:              Active async session (will db.add + db.flush).
        organization_id: Org scope for JournalEntry header.
        period:          FiscalPeriod being closed.
        preview:         Output of `_compute_closing_je_preview`.
        user_id:         Actor user ID for `postedBy`.
        now_utc:         Commit timestamp (UTC, tz-naive for MySQL compat).

    Returns:
        The newly flushed JournalEntry ORM row.
    """
    je_number = await _next_je_number(db, period.companyCode, period.fiscalYear)
    je_id = str(uuid.uuid4())

    # Reason: net_income from preview may be negative (loss); use copy_abs for
    # totalDebit/totalCredit — they must always be positive by convention.
    amount = preview.netIncome.copy_abs()
    profit = preview.netIncome >= 0

    je = JournalEntry(
        jeId=je_id,
        organizationId=organization_id,
        companyCode=period.companyCode,
        jeNumber=je_number,
        jeDate=period.endDate,
        periodId=period.periodId,
        sourceEventType="period_close",
        # Reason: sourceEventId is NOT NULL; using periodId gives a direct
        # trace from the JE back to the period that triggered it.
        sourceEventId=period.periodId,
        sourceDocId=period.periodId,
        sourceDocNumber=f"PERIOD-CLOSE-{period.fiscalYear}-{period.periodNumber}",
        description=(
            f"Year-end closing entry for fiscal year {period.fiscalYear}: "
            f"roll net {'profit' if profit else 'loss'} of "
            f"{amount} into Retained Earnings."
        ),
        totalDebit=preview.totalDebit,
        totalCredit=preview.totalCredit,
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy=user_id,
    )
    db.add(je)

    for line in preview.lines:
        db.add(
            JournalEntryLine(
                jeLineId=str(uuid.uuid4()),
                jeId=je_id,
                lineNumber=line.lineNumber,
                accountId=line.accountId,
                debit=line.debit if line.debit is not None else Decimal("0"),
                credit=line.credit if line.credit is not None else Decimal("0"),
                description=line.description,
                referenceLineId=None,
                costCenterId=None,
            )
        )

    await db.flush()
    return je


async def _post_closing_je(
    db: AsyncSession,
    organization_id: str,
    period: FiscalPeriod,
    net_income: Decimal,
    user_id: str,
    now_utc: datetime,
) -> JournalEntry:
    """
    Construct + write the year-end closing JE inside the caller's session.

    DEPRECATED internal path — preserved so the reopen reversal logic
    continues to work without changes. New callers should use the
    compute → commit split:
        preview = await _compute_closing_je_preview(...)
        je = await _post_closing_je_from_preview(...)

    This wrapper builds a minimal ClosingJePreview from `net_income` and
    delegates to `_post_closing_je_from_preview`, keeping both paths
    identical.
    """
    # Build a throwaway preview to delegate — this avoids duplicating JE
    # line construction logic. We pass it through the same path so both
    # produce byte-for-byte identical output.
    cy_account, re_account = await _resolve_closing_accounts(
        db, organization_id, period.companyCode
    )
    amount = net_income.copy_abs()
    profit = net_income >= 0

    # Fetch account metadata for labels (same query as in _compute_closing_je_preview).
    accounts_result = await db.execute(
        select(
            GLAccount.accountId,
            GLAccount.accountNumber,
            GLAccount.accountName,
        ).where(
            GLAccount.accountId.in_([cy_account, re_account])
        )
    )
    acct_map: dict[str, Tuple[str, str]] = {
        row.accountId: (row.accountNumber, row.accountName)
        for row in accounts_result.all()
    }
    cy_num, cy_name = acct_map.get(cy_account, (_CURRENT_YEAR_PL_ACCOUNT_CODE, "Current Year P/(L)"))
    re_num, re_name = acct_map.get(re_account, ("312000-001", "Retained Earnings"))

    if profit:
        dr_id, dr_num, dr_name = cy_account, cy_num, cy_name
        cr_id, cr_num, cr_name = re_account, re_num, re_name
    else:
        dr_id, dr_num, dr_name = re_account, re_num, re_name
        cr_id, cr_num, cr_name = cy_account, cy_num, cy_name

    preview = ClosingJePreview(
        isYearEnd=True,
        lines=[
            ClosingJePreviewLine(
                lineNumber=1, accountId=dr_id, accountNumber=dr_num,
                accountName=dr_name, debit=amount, credit=None,
                description="Year-end closing — debit leg",
            ),
            ClosingJePreviewLine(
                lineNumber=2, accountId=cr_id, accountNumber=cr_num,
                accountName=cr_name, debit=None, credit=amount,
                description="Year-end closing — credit leg",
            ),
        ],
        totalDebit=amount,
        totalCredit=amount,
        netIncome=net_income,
        targetAccount=ClosingJeTargetAccount(
            accountId=re_account, accountNumber=re_num, accountName=re_name,
        ),
        note=None,
    )
    return await _post_closing_je_from_preview(
        db=db,
        organization_id=organization_id,
        period=period,
        preview=preview,
        user_id=user_id,
        now_utc=now_utc,
    )


async def _find_closing_je_for_period(
    db: AsyncSession, period_id: str
) -> Optional[JournalEntry]:
    """Locate the year-end closing JE for a period (None if never closed)."""
    result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(
            JournalEntry.sourceEventType == "period_close",
            JournalEntry.sourceDocId == period_id,
            JournalEntry.status == JEStatusEnum.POSTED,
        )
    )
    return result.scalar_one_or_none()


async def _post_closing_je_reversal(
    db: AsyncSession,
    original: JournalEntry,
    user_id: str,
    today: date,
    now_utc: datetime,
    period_id_for_reversal: str,
) -> JournalEntry:
    """
    Post an offsetting JE that reverses the closing JE on reopen.

    Follows the same pattern as POST /journal-entries/{jeId}/reverse —
    the original stays POSTED, a new JE with debit/credit swapped is
    inserted. The pair nets to zero on the books and the audit trail
    preserves both events.

    The reversal is dated `today` and posted into the period being
    reopened (passed in as `period_id_for_reversal`) — reopen brings the
    period back to OPEN status before this runs, so the
    `_resolve_fiscal_period_or_raise` check downstream won't refuse.
    """
    reversal_id = str(uuid.uuid4())
    # Reason: a sequential `_next_je_number` would race with the close
    # transaction's recently-inserted closing JE in some session-isolation
    # scenarios (notably the test SQLite). Reversals don't need to sit on
    # the sequential per-company series — append a "-REV-{short}" suffix
    # to the original's number. Uniqueness is guaranteed by the per-org
    # original jeNumber being unique + a 6-hex-char UUID disambiguator
    # for the (extremely unlikely) case of reopen being run twice.
    short_suffix = uuid.uuid4().hex[:6].upper()
    reversal_number = f"{original.jeNumber}-REV-{short_suffix}"

    reversal = JournalEntry(
        jeId=reversal_id,
        organizationId=original.organizationId,
        companyCode=original.companyCode,
        jeNumber=reversal_number,
        jeDate=today,
        periodId=period_id_for_reversal,
        sourceEventType="period_close_reversal",
        sourceEventId=original.jeId,
        sourceDocId=original.jeId,
        sourceDocNumber=original.jeNumber,
        description=(
            f"Reversal of year-end closing entry {original.jeNumber} on "
            f"period reopen."
        ),
        totalDebit=Decimal(str(original.totalCredit)),
        totalCredit=Decimal(str(original.totalDebit)),
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy=user_id,
    )
    db.add(reversal)

    for line in original.lines:
        orig_debit = Decimal(str(line.debit)) if line.debit is not None else None
        orig_credit = (
            Decimal(str(line.credit)) if line.credit is not None else None
        )
        db.add(
            JournalEntryLine(
                jeLineId=str(uuid.uuid4()),
                jeId=reversal_id,
                lineNumber=line.lineNumber,
                accountId=line.accountId,
                debit=orig_credit,
                credit=orig_debit,
                description=(
                    f"Reversal: {line.description}"
                    if line.description
                    else "Reversal"
                ),
                referenceLineId=line.referenceLineId,
                costCenterId=line.costCenterId,
            )
        )

    await db.flush()
    return reversal


def _audit_entry(
    organization_id: str,
    actor_user_id: str,
    action: str,
    period: FiscalPeriod,
    before_status: PeriodStatusEnum,
    after_status: PeriodStatusEnum,
    closing_je: Optional[JournalEntry] = None,
    reason: Optional[str] = None,
) -> AuditLog:
    """Build an AuditLog row for a period close/reopen transition."""
    return AuditLog(
        auditId=str(uuid.uuid4()),
        organizationId=organization_id,
        actorUserId=actor_user_id,
        action=action,
        entityType="FiscalPeriod",
        entityId=period.periodId,
        beforeJson={
            "status": before_status.value,
            "companyCode": period.companyCode,
            "fiscalYear": period.fiscalYear,
            "periodNumber": period.periodNumber,
        },
        afterJson={
            "status": after_status.value,
            "reason": reason,
            "closingJeId": closing_je.jeId if closing_je else None,
            "closingJeNumber": closing_je.jeNumber if closing_je else None,
        },
    )


@router.get(
    "/periods",
    response_model=SuccessResponse[List[FiscalPeriodResponse]],
    summary="List fiscal periods",
)
async def list_periods(
    company_code: str = Query(..., description="Filter by company code"),
    fiscal_year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[List[FiscalPeriodResponse]]:
    """List fiscal periods for a company, optionally filtered by year."""
    query = select(FiscalPeriod).where(FiscalPeriod.companyCode == company_code)
    if fiscal_year is not None:
        query = query.where(FiscalPeriod.fiscalYear == fiscal_year)
    query = query.order_by(FiscalPeriod.fiscalYear, FiscalPeriod.periodNumber)

    result = await db.execute(query)
    periods = result.scalars().all()
    return success([FiscalPeriodResponse.model_validate(p) for p in periods])


@router.post(
    "/periods",
    response_model=SuccessResponse[FiscalPeriodResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create fiscal period",
)
async def create_period(
    body: FiscalPeriodCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[FiscalPeriodResponse]:
    """
    Create a new fiscal period.

    Raises:
        HTTPException 404: If companyCode not found.
        HTTPException 409: If the (companyCode, fiscalYear, periodNumber) already exists.
    """
    company = await db.get(CompanyCode, body.companyCode)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company code '{body.companyCode}' not found.",
        )

    existing = await db.scalar(
        select(FiscalPeriod.periodId).where(
            FiscalPeriod.companyCode == body.companyCode,
            FiscalPeriod.fiscalYear == body.fiscalYear,
            FiscalPeriod.periodNumber == body.periodNumber,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Period {body.fiscalYear}/{body.periodNumber} already exists "
                f"for company '{body.companyCode}'."
            ),
        )

    period = FiscalPeriod(**body.model_dump())
    db.add(period)
    await db.flush()
    await db.refresh(period)

    return success(FiscalPeriodResponse.model_validate(period))


@router.patch(
    "/periods/{period_id}/close",
    # Reason: response_model=None because the route returns one of two different
    # Pydantic shapes depending on dry_run — SuccessResponse[ClosePeriodResponse]
    # (commit) or SuccessResponse[PreviewClosePeriodResponse] (dry-run). FastAPI
    # would strip `closingJePreview` if response_model were fixed to
    # ClosePeriodResponse. Correctness is enforced by the models in the return
    # statements; the OpenAPI schema is intentionally untyped for this endpoint.
    response_model=None,
    summary="Close a fiscal period (or preview the closing JE with dry_run=true)",
)
async def close_period(
    period_id: str,
    body: ClosePeriodRequest = None,
    organization_id: str = Query(
        ...,
        description=(
            "Org scope. Required to locate the Current Year P/(L) account "
            "and Posting Setup when auto-posting the closing JE on fiscal "
            "year-end close."
        ),
    ),
    dry_run: bool = Query(
        False,
        description=(
            "When true: run all pre-close validations and compute the proposed "
            "closing JE, but do NOT write anything to the database. Returns a "
            "`closingJePreview` instead of `closingJe`. `reason` is not required "
            "on the dry-run path. The preview lines are identical to what a real "
            "close would post — this is enforced by the compute→commit split."
        ),
    ),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
):
    """
    Close a fiscal period (Wave 2 / T-060.1 + T-060.11-preview).

    When ``dry_run=false`` (default) — real close, atomic:
      1. Refuse if period not OPEN.
      2. Validate the period's JEs balance (Σ DR == Σ CR ± 0.01 AED).
      3. Compute the proposed closing JE (pure, no writes).
      4. If this period is the **fiscal year-end** and net income is non-zero,
         persist the closing JE using the computed preview as the blueprint.
         DR Current Year P/(L) / CR Retained Earnings (or reversed if loss).
      5. Flip period.status → CLOSED, populate audit fields, clear any
         reopen-trail fields.
      6. Write an audit_log row referencing the closing JE (when posted).
      All steps run in a single MySQL transaction; either everything
      succeeds or nothing changes.

    When ``dry_run=true`` — preview only, no DB writes:
      1. Refuse if period not OPEN.
      2. Validate balance (same as real close).
      3. Compute and return the proposed closing JE in ``closingJePreview``.
      No status change, no JE write, no audit_log entry.
      The ``reason`` field in the request body is NOT required on this path.

    Raises:
      404 if period not found.
      409 if period is not OPEN (same on dry-run — prevents previewing an
          already-closed period as if it could be re-closed).
      400 if period doesn't balance, or if closing accounts are
          unconfigured at year-end (same on dry-run — surfaces errors early).
    """
    period = await db.get(FiscalPeriod, period_id)
    if not period:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Period '{period_id}' not found.",
        )
    if period.status != PeriodStatusEnum.OPEN:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Period is already {period.status.value} and cannot "
                "be closed again."
            ),
        )

    # Pre-close validation — same on both paths. Surface errors before any
    # compute work, and before any writes (dry-run or real).
    await _validate_period_balanced(
        db, organization_id, period.companyCode, period.periodId
    )

    # Compute the proposed JE (pure — no DB writes regardless of dry_run).
    # This is the single source of truth for both the preview response and
    # the real JE write, so the two paths are guaranteed to be identical.
    preview = await _compute_closing_je_preview(db, period, organization_id)

    # ------------------------------------------------------------------ #
    # DRY-RUN PATH — return preview, no mutations                         #
    # ------------------------------------------------------------------ #
    if dry_run:
        # Reason: refresh is NOT called here because we haven't mutated the
        # period row — the ORM object already reflects the DB state.
        logger.info(
            "[Finance/Periods] dry_run period_id=%s org=%s isYearEnd=%s "
            "netIncome=%s lines=%d",
            period_id,
            organization_id,
            preview.isYearEnd,
            preview.netIncome,
            len(preview.lines),
        )
        return success(
            PreviewClosePeriodResponse(
                period=FiscalPeriodResponse.model_validate(period),
                closingJePreview=preview,
            ),
            message=None,
        )

    # ------------------------------------------------------------------ #
    # COMMIT PATH — persist JE, flip status, write audit                  #
    # ------------------------------------------------------------------ #
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    reason_text = body.reason if body is not None else None
    before_status = period.status

    # Persist the closing JE from the preview if lines were computed.
    # Reason: `_next_je_number` is called inside _post_closing_je_from_preview —
    # deliberately NOT called during _compute_closing_je_preview so that dry-run
    # calls never consume a sequence slot.
    closing_je: Optional[JournalEntry] = None
    if preview.lines:
        closing_je = await _post_closing_je_from_preview(
            db=db,
            organization_id=organization_id,
            period=period,
            preview=preview,
            user_id=current_user.userId,
            now_utc=now_utc,
        )

    # Reason: populate close audit fields, clear any prior reopen audit
    # fields so the record always reflects only the MOST RECENT transition.
    period.status = PeriodStatusEnum.CLOSED
    period.closedAt = now_utc
    period.closedByUserId = current_user.userId
    period.closeReason = reason_text
    period.reopenedAt = None
    period.reopenedByUserId = None
    period.reopenReason = None

    db.add(
        _audit_entry(
            organization_id=organization_id,
            actor_user_id=current_user.userId,
            action="CLOSE",
            period=period,
            before_status=before_status,
            after_status=PeriodStatusEnum.CLOSED,
            closing_je=closing_je,
            reason=reason_text,
        )
    )

    await db.flush()
    # Reason: flush expires attributes with server_default/onupdate
    # (`updatedAt`); refresh so Pydantic's `from_attributes=True` doesn't
    # trigger a sync lazy load inside an async context.
    await db.refresh(period)

    logger.info(
        "[Finance/Periods] period_id=%s closed by userId=%s reason=%r "
        "closing_je=%s",
        period_id,
        current_user.userId,
        reason_text,
        closing_je.jeNumber if closing_je else None,
    )

    je_info: Optional[ClosingJeInfo] = None
    if closing_je is not None:
        je_info = ClosingJeInfo(
            jeId=closing_je.jeId,
            jeNumber=closing_je.jeNumber,
            jeDate=closing_je.jeDate,
            netIncome=Decimal(str(closing_je.totalDebit)),
            currencyCode="AED",
        )

    return success(
        ClosePeriodResponse(
            period=FiscalPeriodResponse.model_validate(period),
            closingJe=je_info,
        ),
        message="Period closed successfully.",
    )


@router.patch(
    "/periods/{period_id}/reopen",
    response_model=SuccessResponse[ReopenPeriodResponse],
    summary="Reopen a closed fiscal period",
)
async def reopen_period(
    period_id: str,
    body: ReopenPeriodRequest,
    organization_id: str = Query(
        ...,
        description=(
            "Org scope. Required to locate any closing JE that needs "
            "reversing when reopening a fiscal year-end period."
        ),
    ),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[ReopenPeriodResponse]:
    """
    Reopen a closed fiscal period (Wave 2 / T-060.1).

    Pipeline (atomic):
      1. Refuse if period is OPEN or LOCKED.
      2. Flip period.status → OPEN, populate reopen audit fields, clear
         the close-trail fields.
      3. If a closing JE was previously posted for this period (year-end
         close), post an offsetting JE in this period to reverse it.
         Original closing JE stays POSTED — the pair nets to zero on
         the books, matching the existing reversal convention from
         POST /journal-entries/{jeId}/reverse.
      4. Write an audit_log row referencing the reversal JE (when posted).
      All steps run in a single MySQL transaction.

    A reason is required (5–500 chars) — production accounting demands an
    audit justification every time a closed period is re-opened.

    Raises:
      404 if period not found.
      409 if period is already OPEN.
      423 if period is LOCKED.
    """
    period = await db.get(FiscalPeriod, period_id)
    if not period:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Period '{period_id}' not found.",
        )
    if period.status == PeriodStatusEnum.OPEN:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Period is already open.",
        )
    if period.status == PeriodStatusEnum.LOCKED:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Locked periods cannot be reopened.",
        )

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    today = now_utc.date()
    before_status = period.status

    # Reason: populate reopen audit fields, clear prior close audit fields
    # so the record always reflects only the MOST RECENT transition.
    period.status = PeriodStatusEnum.OPEN
    period.reopenedAt = now_utc
    period.reopenedByUserId = current_user.userId
    period.reopenReason = body.reason
    period.closedAt = None
    period.closedByUserId = None
    period.closeReason = None

    # Reverse any year-end closing JE that was posted on close.
    reversal_je: Optional[JournalEntry] = None
    original_closing = await _find_closing_je_for_period(db, period_id)
    if original_closing is not None:
        reversal_je = await _post_closing_je_reversal(
            db=db,
            original=original_closing,
            user_id=current_user.userId,
            today=today,
            now_utc=now_utc,
            period_id_for_reversal=period_id,
        )

    db.add(
        _audit_entry(
            organization_id=organization_id,
            actor_user_id=current_user.userId,
            action="REOPEN",
            period=period,
            before_status=before_status,
            after_status=PeriodStatusEnum.OPEN,
            closing_je=reversal_je,
            reason=body.reason,
        )
    )

    await db.flush()
    # Reason: same as close — refresh so the response serialiser doesn't
    # trigger an async lazy load on auto-updated attributes.
    await db.refresh(period)

    logger.info(
        "[Finance/Periods] period_id=%s reopened by userId=%s reason=%r "
        "reversal_je=%s",
        period_id,
        current_user.userId,
        body.reason,
        reversal_je.jeNumber if reversal_je else None,
    )

    rev_info: Optional[ClosingJeInfo] = None
    if reversal_je is not None:
        rev_info = ClosingJeInfo(
            jeId=reversal_je.jeId,
            jeNumber=reversal_je.jeNumber,
            jeDate=reversal_je.jeDate,
            netIncome=Decimal(str(reversal_je.totalDebit)),
            currencyCode="AED",
        )

    return success(
        ReopenPeriodResponse(
            period=FiscalPeriodResponse.model_validate(period),
            closingJeReversal=rev_info,
        ),
        message="Period reopened successfully.",
    )
