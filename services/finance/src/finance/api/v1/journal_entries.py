"""
Journal Entries API

JEs are created by posting handlers (Phase B+), via the reversal action,
and as of T-061 via the manual create endpoint (POST /journal-entries).

Permissions:
  GET:              accountant, finance_admin, auditor, admin, super_admin
  POST (create):    finance_admin, super_admin  (NOT finance_reviewer)
  POST (reverse):   finance_admin, admin, super_admin
"""

import hashlib
import json
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
    AuditLog,
    CostCenter,
    FiscalPeriod,
    GLAccount,
    JEStatusEnum,
    JournalEntry,
    JournalEntryLine,
    PeriodStatusEnum,
)
from ...models.schemas.common import PaginatedResponse, SuccessResponse
from ...models.schemas.journal_entries import (
    JournalEntryResponse,
    ManualJECreateRequest,
    ManualJECreateResponse,
    ManualJEMeta,
    ReversalRequest,
    ReversalResponse,
)
from ...utils.responses import paginated, success

# Import the JE-number generator and fiscal period resolver from the events
# module — both are the single source of truth; not duplicated here.
from .events import _next_je_number, _resolve_fiscal_period_or_raise

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Journal Entries"])

_READ_ROLES = ("accountant", "finance_admin", "auditor", "super_admin", "admin")


async def _fetch_reversal_map(
    db: AsyncSession,
    organization_id: str,
    je_numbers: Iterable[str],
) -> Dict[str, str]:
    """
    Batch-fetch the reversal JE number (if any) for each given original JE
    number, scoped to one organization.

    Returns a dict { originalJeNumber: reversalJeNumber }. Originals with no
    reversal are simply absent from the map. A single SQL roundtrip regardless
    of input size.
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


def _attach_reversed_by(
    response: JournalEntryResponse,
    reversal_map: Dict[str, str],
) -> JournalEntryResponse:
    """Set reversedByJeNumber on a JournalEntryResponse from the lookup map."""
    response.reversedByJeNumber = reversal_map.get(response.jeNumber)
    return response


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

    # Enrich responses with reversedByJeNumber so the UI can show a
    # "Reversed" badge under the standard reversing-entry pattern.
    items = [JournalEntryResponse.model_validate(e) for e in entries]
    reversal_map = await _fetch_reversal_map(
        db, organization_id, (i.jeNumber for i in items)
    )
    for item in items:
        _attach_reversed_by(item, reversal_map)

    return paginated(items=items, total=total, page=page, size=size)


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
    response = JournalEntryResponse.model_validate(entry)
    reversal_map = await _fetch_reversal_map(
        db, organization_id, [response.jeNumber]
    )
    _attach_reversed_by(response, reversal_map)
    return success(response)


# ---------------------------------------------------------------------------
# Manual JE Creation (T-061)
# ---------------------------------------------------------------------------

# Reason: finance_reviewer is explicitly excluded — this is a write operation.
# admin is also excluded to keep the privilege minimal; finance_admin and
# super_admin are the only roles that should post correcting JEs.
_MANUAL_CREATE_ROLES = ("finance_admin", "super_admin")


@router.post(
    "/journal-entries",
    response_model=ManualJECreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a manual journal entry",
    description=(
        "Post a manually authored correcting / adjusting JE as finance_admin or super_admin. "
        "Lines must be balanced (SUM debit == SUM credit). "
        "jeDate must fall in an OPEN fiscal period. "
        "Header accounts are rejected; inactive accounts are allowed with a warning."
    ),
)
async def create_manual_journal_entry(
    body: ManualJECreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_roles(*_MANUAL_CREATE_ROLES)),
) -> ManualJECreateResponse:
    """
    Create a manual correcting/adjusting JE (T-061).

    Validation order (all 422 unless noted):
      1. Pydantic already validates: min 2 lines, each line has exactly one side,
         amounts > 0, SUM(DR)==SUM(CR), reason non-whitespace.
      2. jeDate must fall in an OPEN fiscal period (via _resolve_fiscal_period_or_raise).
      3. Every accountId must exist in gl_accounts for the org.
         - Header accounts (isHeader=True) → 422.
         - Inactive accounts (isActive=False) → allowed; produce meta.warnings entry.
      4. costCenterId, if provided, must be active for the org → 422 if not.

    After validation the JE header, lines, and an audit_log row are written in
    a single DB transaction (flush-then-commit).

    Args:
        body: Validated request body.
        db: Async DB session.
        current_user: Authenticated finance_admin or super_admin.

    Returns:
        ManualJECreateResponse with the created JE and any inactive-account warnings.

    Raises:
        HTTPException 422: For any validation failure listed above.
        HTTPException 400: If no open period covers jeDate (from _resolve_fiscal_period_or_raise).
    """
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    warnings: List[str] = []

    # ------------------------------------------------------------------
    # 1. Resolve fiscal period (raises HTTP 400 if closed/missing)
    # ------------------------------------------------------------------
    period_id = await _resolve_fiscal_period_or_raise(db, body.companyCode, body.jeDate)

    # ------------------------------------------------------------------
    # 2. Validate all accounts in a single batch query
    # ------------------------------------------------------------------
    account_ids = list({ln.accountId for ln in body.lines})
    acct_result = await db.execute(
        select(
            GLAccount.accountId,
            GLAccount.accountNumber,
            GLAccount.accountName,
            GLAccount.isHeader,
            GLAccount.isActive,
        ).where(
            GLAccount.organizationId == body.organizationId,
            GLAccount.accountId.in_(account_ids),
        )
    )
    accounts_found = {
        row.accountId: row
        for row in acct_result.all()
    }

    # Check every requested account exists and is not a header
    missing_ids = [aid for aid in account_ids if aid not in accounts_found]
    if missing_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Account(s) not found for this organization: {missing_ids}",
        )

    for acct_row in accounts_found.values():
        if acct_row.isHeader:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Account {acct_row.accountNumber} '{acct_row.accountName}' is a header "
                    "account and cannot be posted to. Use a leaf account instead."
                ),
            )

    # ------------------------------------------------------------------
    # 3. Collect inactive-account warnings (soft — not a hard reject)
    # ------------------------------------------------------------------
    for line_idx, line in enumerate(body.lines, start=1):
        acct = accounts_found[line.accountId]
        if not acct.isActive:
            warnings.append(
                f"Line {line_idx} posts to inactive account "
                f"{acct.accountNumber} '{acct.accountName}' "
                "(Cleanup posting; intentional)."
            )

    # ------------------------------------------------------------------
    # 4. Validate cost centres (if provided) — must be active for the org
    # ------------------------------------------------------------------
    cost_center_ids = list(
        {ln.costCenterId for ln in body.lines if ln.costCenterId is not None}
    )
    if cost_center_ids:
        cc_result = await db.execute(
            select(CostCenter.costCenterId, CostCenter.isActive).where(
                CostCenter.organizationId == body.organizationId,
                CostCenter.costCenterId.in_(cost_center_ids),
            )
        )
        found_ccs = {row.costCenterId: row.isActive for row in cc_result.all()}

        for cc_id in cost_center_ids:
            if cc_id not in found_ccs:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Cost centre '{cc_id}' not found for this organization.",
                )
            if not found_ccs[cc_id]:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Cost centre '{cc_id}' is inactive and cannot be used.",
                )

    # ------------------------------------------------------------------
    # 5. Generate JE number (concurrent-safe MAX+1)
    # ------------------------------------------------------------------
    je_number = await _next_je_number(db, body.companyCode, body.jeDate.year)

    # ------------------------------------------------------------------
    # 6. Compute totals from the validated lines (source of truth)
    # ------------------------------------------------------------------
    total_debit = sum(
        (ln.debit for ln in body.lines if ln.debit is not None), Decimal("0")
    )
    total_credit = sum(
        (ln.credit for ln in body.lines if ln.credit is not None), Decimal("0")
    )

    # ------------------------------------------------------------------
    # 7. Build JE header
    # ------------------------------------------------------------------
    je_id = str(uuid.uuid4())
    # Reason: sourceEventId is NOT NULL in the schema. For manual JEs there is
    # no system event, so we generate a fresh UUID as the "event ID" — it is
    # unique, traceable, and satisfies the constraint.
    source_event_id = str(uuid.uuid4())

    je = JournalEntry(
        jeId=je_id,
        organizationId=body.organizationId,
        companyCode=body.companyCode,
        jeNumber=je_number,
        jeDate=body.jeDate,
        periodId=period_id,
        sourceEventType="manual",
        sourceEventId=source_event_id,
        sourceDocId=None,
        sourceDocNumber=None,
        description=body.description,
        totalDebit=total_debit,
        totalCredit=total_credit,
        status=JEStatusEnum.POSTED,
        postedAt=now_utc,
        postedBy=current_user.userId,
    )
    db.add(je)

    # ------------------------------------------------------------------
    # 8. Build JE lines
    # ------------------------------------------------------------------
    for line_num, line in enumerate(body.lines, start=1):
        je_line = JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=line_num,
            accountId=line.accountId,
            debit=line.debit,
            credit=line.credit,
            description=line.description,
            costCenterId=line.costCenterId,
        )
        db.add(je_line)

    # ------------------------------------------------------------------
    # 9. Write audit_log row (same transaction — all-or-nothing)
    # ------------------------------------------------------------------
    # Reason: SHA-256 of the request JSON provides tamper-evidence in the
    # audit trail. model_dump_json() gives canonical JSON with no ambiguity
    # from dict key ordering (Pydantic sorts by field order).
    payload_json = body.model_dump_json()
    payload_hash = hashlib.sha256(payload_json.encode()).hexdigest()

    audit_row = AuditLog(
        auditId=str(uuid.uuid4()),
        organizationId=body.organizationId,
        actorUserId=current_user.userId,
        action="manual_je_posted",
        entityType="JournalEntry",
        entityId=je_id,
        beforeJson=None,
        afterJson={
            "jeId": je_id,
            "jeNumber": je_number,
            "companyCode": body.companyCode,
            "jeDate": body.jeDate.isoformat(),
            "payloadHash": payload_hash,
            "reason": body.reason,
            "payload": json.loads(payload_json),
        },
    )
    db.add(audit_row)

    # ------------------------------------------------------------------
    # 10. Flush (FK violations surface here) then commit
    # ------------------------------------------------------------------
    await db.flush()

    # Reload the JE with lines for the response (lines may not be loaded
    # in-memory after flush depending on the session state)
    je_reloaded_result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(JournalEntry.jeId == je_id)
    )
    je_reloaded = je_reloaded_result.scalar_one()

    await db.commit()

    logger.info(
        "[Finance/ManualJE] posted jeId=%s jeNumber=%s lines=%d "
        "totalDebit=%s by user=%s reason=%r",
        je_id,
        je_number,
        len(body.lines),
        total_debit,
        current_user.userId,
        body.reason,
    )

    return ManualJECreateResponse(
        data=JournalEntryResponse.model_validate(je_reloaded),
        meta=ManualJEMeta(warnings=warnings),
        message=None,
    )


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
    # 2. Validate — refuse if this JE is already reversed or voided
    # ------------------------------------------------------------------
    if original.status == JEStatusEnum.VOID:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot reverse a voided JE.",
        )
    existing_reversal = await db.scalar(
        select(JournalEntry.jeNumber).where(
            JournalEntry.organizationId == original.organizationId,
            JournalEntry.companyCode == original.companyCode,
            JournalEntry.sourceEventType == "je_reversal",
            JournalEntry.sourceDocNumber == original.jeNumber,
        )
    )
    if existing_reversal is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Journal entry {original.jeNumber} has already been reversed "
                f"by {existing_reversal}."
            ),
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
        # referenceLineId is preserved as-is: it carries the vendor/customer/
        # sub-ledger key (e.g. vendorId on AP lines). Replacing it would orphan
        # the credit/debit from the entity's sub-ledger and leave a phantom
        # balance under a stranger UUID. JE-level lineage is already covered
        # by sourceEventType='je_reversal' + sourceDocNumber=original.jeNumber.
        reversal_line = JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=reversal_id,
            lineNumber=line.lineNumber,
            accountId=line.accountId,
            debit=orig_credit,   # original CR → reversal DR
            credit=orig_debit,   # original DR → reversal CR
            description=f"Reversal: {line.description}" if line.description else "Reversal",
            referenceLineId=line.referenceLineId,
            costCenterId=line.costCenterId,
        )
        db.add(reversal_line)

    # ------------------------------------------------------------------
    # 7. Standard reversing-entry pattern: the original STAYS posted.
    #    Two posted JEs (original + reversal) live on the books and net
    #    to zero. The void status is reserved for true posting errors
    #    that should never affect any report (set via a different action,
    #    not by this endpoint). The reason supplied here is captured in
    #    the reversal JE's description (set above).
    # ------------------------------------------------------------------

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

    original_response = JournalEntryResponse.model_validate(original_reloaded)
    reversal_response = JournalEntryResponse.model_validate(reversal_reloaded)
    # The original now has a reversal; tag it so the client can render the
    # "Reversed" badge without an extra fetch. The reversal itself never has
    # a child reversal (it would be a no-op chain), so it stays None.
    original_response.reversedByJeNumber = reversal_je_number

    return success(
        ReversalResponse(
            original=original_response,
            reversal=reversal_response,
        ),
        message=f"Journal entry {original.jeNumber} reversed successfully.",
    )
