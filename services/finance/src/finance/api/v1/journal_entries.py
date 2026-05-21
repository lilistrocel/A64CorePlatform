"""
Journal Entries API

JEs are created by posting handlers (Phase B+) and via the reversal action.
The API exposes list/detail reads plus the single mutating action: reverse.

Permissions:
  GET: accountant, finance_admin, auditor, admin, super_admin
  POST /{je_id}/reverse: finance_admin, admin, super_admin
"""

import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...db.session import get_db
from ...middleware.auth import TokenPayload, require_roles
from ...models.orm.models import (
    FiscalPeriod,
    JEStatusEnum,
    JournalEntry,
    JournalEntryLine,
    PeriodStatusEnum,
)
from ...models.schemas.common import PaginatedResponse, SuccessResponse
from ...models.schemas.journal_entries import (
    JournalEntryResponse,
    ReversalRequest,
    ReversalResponse,
)
from ...utils.responses import paginated, success

# Import the JE-number generator from the events module (single source of truth)
from .events import _next_je_number

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Journal Entries"])

_READ_ROLES = ("accountant", "finance_admin", "auditor", "super_admin", "admin")


@router.get(
    "/journal-entries",
    response_model=PaginatedResponse[JournalEntryResponse],
    summary="List journal entries",
    description=(
        "Return a paginated list of journal entries.  organization_id is required. "
        "All other filters are optional."
    ),
)
async def list_journal_entries(
    organization_id: str = Query(..., description="Required — filter by organization"),
    company_code: Optional[str] = Query(None, description="Filter by company code"),
    period_id: Optional[str] = Query(None, description="Filter by fiscal period UUID"),
    source_event_type: Optional[str] = Query(
        None, description="Filter by event type, e.g. purchase_received"
    ),
    status: Optional[JEStatusEnum] = Query(None, description="Filter by JE status"),
    date_from: Optional[date] = Query(None, description="jeDate >= this date (inclusive)"),
    date_to: Optional[date] = Query(None, description="jeDate <= this date (inclusive)"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> PaginatedResponse[JournalEntryResponse]:
    """
    List journal entries with optional filtering and pagination.

    Args:
        organization_id: Required org scope.
        company_code: Optional company code filter.
        period_id: Optional fiscal period filter.
        source_event_type: Optional event-type filter.
        status: Optional status filter (posted / void).
        date_from: Optional lower bound on jeDate.
        date_to: Optional upper bound on jeDate.
        page: Page number (1-based).
        size: Items per page (max 500).
        db: Async DB session.
        _current_user: Authenticated user (read roles).

    Returns:
        Paginated journal entries without line detail (use the detail endpoint for lines).
    """
    base_filter = JournalEntry.organizationId == organization_id
    query = select(JournalEntry).where(base_filter)
    count_query = select(func.count()).select_from(JournalEntry).where(base_filter)

    if company_code is not None:
        query = query.where(JournalEntry.companyCode == company_code)
        count_query = count_query.where(JournalEntry.companyCode == company_code)
    if period_id is not None:
        query = query.where(JournalEntry.periodId == period_id)
        count_query = count_query.where(JournalEntry.periodId == period_id)
    if source_event_type is not None:
        query = query.where(JournalEntry.sourceEventType == source_event_type)
        count_query = count_query.where(JournalEntry.sourceEventType == source_event_type)
    if status is not None:
        query = query.where(JournalEntry.status == status)
        count_query = count_query.where(JournalEntry.status == status)
    if date_from is not None:
        query = query.where(JournalEntry.jeDate >= date_from)
        count_query = count_query.where(JournalEntry.jeDate >= date_from)
    if date_to is not None:
        query = query.where(JournalEntry.jeDate <= date_to)
        count_query = count_query.where(JournalEntry.jeDate <= date_to)

    total = await db.scalar(count_query) or 0
    offset = (page - 1) * size

    # Reason: selectinload lines so each JE response includes line data
    # without triggering N+1 queries.
    result = await db.execute(
        query.options(selectinload(JournalEntry.lines))
        .order_by(JournalEntry.jeDate.desc(), JournalEntry.jeNumber.desc())
        .offset(offset)
        .limit(size)
    )
    entries = result.scalars().all()

    return paginated(
        items=[JournalEntryResponse.model_validate(e) for e in entries],
        total=total,
        page=page,
        size=size,
    )


@router.get(
    "/journal-entries/{je_id}",
    response_model=SuccessResponse[JournalEntryResponse],
    summary="Get journal entry with lines",
)
async def get_journal_entry(
    je_id: str,
    organization_id: str = Query(..., description="Required — org scope for authorization"),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[JournalEntryResponse]:
    """
    Retrieve a single journal entry with all its lines.

    Args:
        je_id: UUID string of the journal entry.
        organization_id: Org scope — ensures cross-org isolation.
        db: Async DB session.
        _current_user: Authenticated user (read roles).

    Returns:
        JournalEntryResponse with lines populated.

    Raises:
        HTTPException 404: If JE not found or belongs to a different org.
    """
    result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(
            JournalEntry.jeId == je_id,
            JournalEntry.organizationId == organization_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Journal entry '{je_id}' not found.",
        )
    return success(JournalEntryResponse.model_validate(entry))


# ---------------------------------------------------------------------------
# JE Reversal
# ---------------------------------------------------------------------------

_WRITE_ROLES = ("finance_admin", "admin", "super_admin")


@router.post(
    "/journal-entries/{je_id}/reverse",
    response_model=SuccessResponse[ReversalResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Reverse a posted journal entry",
    description=(
        "Creates an offsetting (reversing) JE that voids the original. "
        "The original JE status is set to 'void'. "
        "The reversal JE is posted in the current open fiscal period "
        "(not backdated to the original period, per standard accounting)."
    ),
)
async def reverse_journal_entry(
    je_id: str,
    body: ReversalRequest,
    organization_id: str = Query(..., description="Required — org scope for authorization"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[ReversalResponse]:
    """
    Reverse a posted journal entry with an offsetting JE.

    Implements standard double-entry reversal:
    - Original DR lines become CR lines in the reversal (same account, same amount).
    - Original CR lines become DR lines in the reversal (same account, same amount).
    - The original JE is marked void with reason and actor recorded.
    - The reversal JE is posted in today's open fiscal period (not backdated).
    - Everything is wrapped in a single DB transaction.

    Args:
        je_id: UUID of the JE to reverse.
        body: Request body containing the reversal reason.
        organization_id: Org scope — enforces cross-org isolation.
        db: Async DB session.
        current_user: Authenticated user (finance_admin / admin / super_admin).

    Returns:
        SuccessResponse containing both the voided original and the new reversal JE.

    Raises:
        HTTPException 404: If the JE is not found in the given org.
        HTTPException 400: If the JE is already void or no open period covers today.
    """
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    today = now_utc.date()

    # ------------------------------------------------------------------
    # 1. Load the original JE (with lines eager-loaded for the response)
    # ------------------------------------------------------------------
    orig_result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(
            JournalEntry.jeId == je_id,
            JournalEntry.organizationId == organization_id,
        )
    )
    original = orig_result.scalar_one_or_none()
    if original is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Journal entry '{je_id}' not found.",
        )

    # ------------------------------------------------------------------
    # 2. Validate status — only posted JEs can be reversed
    # ------------------------------------------------------------------
    if original.status == JEStatusEnum.VOID:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot reverse a voided JE.",
        )

    # ------------------------------------------------------------------
    # 3. Resolve the current open fiscal period for today's date
    #    (reversals always post in the current period, not the original's)
    # ------------------------------------------------------------------
    period_result = await db.execute(
        select(FiscalPeriod.periodId).where(
            FiscalPeriod.companyCode == original.companyCode,
            FiscalPeriod.status == PeriodStatusEnum.OPEN,
            FiscalPeriod.startDate <= today,
            FiscalPeriod.endDate >= today,
        )
    )
    current_period_id = period_result.scalar_one_or_none()
    if current_period_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No open fiscal period covers today ({today.isoformat()}) "
                f"in company {original.companyCode}. "
                "Open or create the relevant period before reversing."
            ),
        )

    # ------------------------------------------------------------------
    # 4. Generate the reversal JE number
    # ------------------------------------------------------------------
    reversal_je_number = await _next_je_number(db, original.companyCode, today.year)

    # ------------------------------------------------------------------
    # 5. Build the reversal JE header
    #    - totalDebit / totalCredit are swapped from the original
    #    - sourceEventId uses the original jeId (satisfies non-null constraint
    #      and provides unambiguous traceability back to the source)
    # ------------------------------------------------------------------
    reversal_id = str(uuid.uuid4())
    reversal_je = JournalEntry(
        jeId=reversal_id,
        organizationId=original.organizationId,
        companyCode=original.companyCode,
        jeNumber=reversal_je_number,
        jeDate=today,
        periodId=current_period_id,
        sourceEventType="je_reversal",
        # Reason: sourceEventId is NOT NULL; using original jeId satisfies the
        # constraint and gives a direct trace to the source JE.
        sourceEventId=original.jeId,
        sourceDocId=original.jeId,
        sourceDocNumber=original.jeNumber,
        description=f"Reversal of {original.jeNumber}: {body.reason}",
        # Reason: swap totalDebit/totalCredit so the reversal header mirrors
        # the opposite entry direction (DR->CR, CR->DR).
        totalDebit=Decimal(str(original.totalCredit)),
        totalCredit=Decimal(str(original.totalDebit)),
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy=current_user.userId,
    )
    db.add(reversal_je)

    # ------------------------------------------------------------------
    # 6. Build reversal lines — swap debit/credit for every original line
    # ------------------------------------------------------------------
    for line in original.lines:
        orig_debit = Decimal(str(line.debit)) if line.debit is not None else None
        orig_credit = Decimal(str(line.credit)) if line.credit is not None else None

        # Reason: original DR lines become CR lines in the reversal, and vice versa.
        # This is the mathematical inverse that cancels the original posting.
        reversal_line = JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=reversal_id,
            lineNumber=line.lineNumber,
            accountId=line.accountId,
            debit=orig_credit,   # original CR → reversal DR
            credit=orig_debit,   # original DR → reversal CR
            description=f"Reversal: {line.description}" if line.description else "Reversal",
            referenceLineId=line.jeLineId,  # link back to original line for traceability
            costCenterId=line.costCenterId,
        )
        db.add(reversal_line)

    # ------------------------------------------------------------------
    # 7. Void the original JE
    # ------------------------------------------------------------------
    original.status = JEStatusEnum.VOID
    original.voidedAt = now_utc
    original.voidedBy = current_user.userId
    original.voidReason = body.reason

    # ------------------------------------------------------------------
    # 8. Flush so FK violations surface here (before commit)
    # ------------------------------------------------------------------
    await db.flush()

    # Reload both JEs with lines for the response
    orig_reloaded_result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(JournalEntry.jeId == je_id)
    )
    original_reloaded = orig_reloaded_result.scalar_one()

    reversal_reloaded_result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(JournalEntry.jeId == reversal_id)
    )
    reversal_reloaded = reversal_reloaded_result.scalar_one()

    await db.commit()

    logger.info(
        "[Finance/Reversal] reversed jeId=%s jeNumber=%s → reversalId=%s reversalNumber=%s "
        "by user=%s reason=%r",
        je_id,
        original.jeNumber,
        reversal_id,
        reversal_je_number,
        current_user.userId,
        body.reason,
    )

    return success(
        ReversalResponse(
            original=JournalEntryResponse.model_validate(original_reloaded),
            reversal=JournalEntryResponse.model_validate(reversal_reloaded),
        ),
        message=f"Journal entry {original.jeNumber} reversed successfully.",
    )
