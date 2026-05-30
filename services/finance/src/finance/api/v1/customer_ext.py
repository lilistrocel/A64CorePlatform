"""
Customer Finance Extension API  (Wave 3 / T-100.2)

Full CRUD for the customer_finance_ext table.  Every sales document that
posts a JE (AR Invoice, Credit Note, etc.) reads this table to resolve the
per-customer AR control account, payment terms, and default tax code.

URL pattern mirrors vendor_finance_ext under /master-data/ but lives in
this dedicated file because it was seeded here in migration 001 and the
main.py router already registers it at the finance prefix.

Endpoints:
  GET    /customer-finance-ext                        list (paginated, org-scoped)
  GET    /customer-finance-ext/{customer_id}          get by customerId
  POST   /customer-finance-ext                        create
  PATCH  /customer-finance-ext/{customer_id}          update
  DELETE /customer-finance-ext/{customer_id}          delete

Permissions:
  Read:  finance_admin, finance_reviewer, accountant, auditor, super_admin, admin
  Write: finance_admin, super_admin, admin

Validation guards on arControlAccountId:
  1. Type guard  — account must be drawer=ASSETS, accountType=asset (HTTP 422).
  2. Balance guard — if OLD arControlAccountId has a non-zero posted AR balance,
     refuse the change until the caller posts a correcting JE (HTTP 409).

Audit log:
  Every POST / PATCH / DELETE writes one row to the audit_log table.
"""

import logging
import uuid
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...middleware.auth import TokenPayload, require_roles
from ...models.orm.models import (
    AccountTypeEnum,
    AuditLog,
    CustomerFinanceExt,
    DrawerEnum,
    GLAccount,
    JEStatusEnum,
    JournalEntry,
    JournalEntryLine,
)
from ...models.schemas.common import PaginatedResponse, SuccessResponse
from ...models.schemas.master_data import (
    CustomerFinanceExtCreate,
    CustomerFinanceExtResponse,
    CustomerFinanceExtUpdate,
)
from ...utils.responses import paginated, success

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Customer Finance Extension"])

_READ_ROLES = ("finance_admin", "finance_reviewer", "accountant", "auditor", "super_admin", "admin")
_WRITE_ROLES = ("finance_admin", "super_admin", "admin")

# ---------------------------------------------------------------------------
# Internal validation helpers
# ---------------------------------------------------------------------------

# Reason: AR control account must be an asset account (debit-normal) so the
# JE for an AR Invoice correctly records DR Trade Receivables / CR Revenue.
# Using a Liability or Expense account here would produce an inverted entry.
_AR_CONTROL_ALLOWED: frozenset[tuple[DrawerEnum, AccountTypeEnum]] = frozenset({
    (DrawerEnum.ASSETS, AccountTypeEnum.ASSET),
})


async def _check_ar_account_type(
    account_id: str,
    organization_id: str,
    db: AsyncSession,
) -> None:
    """
    Reject assignment of arControlAccountId when the account's drawer /
    accountType is not ASSETS / asset, or when isHeader=True.

    Mirrors _check_clearing_account_type in company.py (T-063 pattern).

    Args:
        account_id: The GL account UUID to type-check.
        organization_id: Org scope.
        db: Async DB session.

    Raises:
        HTTPException 422: If the account type or header flag is wrong.
    """
    account = await db.get(GLAccount, account_id)
    if account is None or account.organizationId != organization_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"arControlAccountId: account '{account_id}' not found in this organisation.",
        )
    if not account.isActive:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"arControlAccountId: account '{account_id}' is inactive.",
        )
    if account.isHeader:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Cannot assign account {account.accountNumber} "
                f"'{account.accountName}' to arControlAccountId — "
                f"header accounts (isHeader=true) cannot be used as posting targets."
            ),
        )
    actual_pair = (account.drawer, account.accountType)
    if actual_pair not in _AR_CONTROL_ALLOWED:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Cannot assign account {account.accountNumber} "
                f"'{account.accountName}' "
                f"(drawer={account.drawer.value}, accountType={account.accountType.value}) "
                f"to arControlAccountId — this field requires an account with "
                f"drawer=ASSETS, accountType=asset."
            ),
        )


async def _check_ar_account_balance(
    old_account_id: str,
    organization_id: str,
    db: AsyncSession,
) -> None:
    """
    Reject changing arControlAccountId when the OLD account still carries a
    non-zero posted balance.

    Mirrors _check_clearing_account_balance in company.py (T-060.9.1 pattern).
    Cheap to add here even though AR isn't yet being posted — it prevents
    regressions once sales invoice posting is live.

    Args:
        old_account_id: The current (outgoing) GL account UUID.
        organization_id: Org scope.
        db: Async DB session.

    Raises:
        HTTPException 409: If the old account has a non-zero posted balance.
    """
    result = await db.execute(
        select(
            func.coalesce(func.sum(JournalEntryLine.debit), Decimal("0")).label("sum_debit"),
            func.coalesce(func.sum(JournalEntryLine.credit), Decimal("0")).label("sum_credit"),
        )
        .join(JournalEntry, JournalEntryLine.jeId == JournalEntry.jeId)
        .where(
            JournalEntry.organizationId == organization_id,
            JournalEntry.status == JEStatusEnum.POSTED,
            JournalEntryLine.accountId == old_account_id,
        )
    )
    row = result.one()
    sum_debit = Decimal(str(row.sum_debit))
    sum_credit = Decimal(str(row.sum_credit))
    signed_balance = sum_debit - sum_credit

    if signed_balance != Decimal("0"):
        old_account = await db.get(GLAccount, old_account_id)
        account_number = old_account.accountNumber if old_account else old_account_id
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot change arControlAccountId — old account {account_number} holds a "
                f"non-zero balance ({signed_balance:.2f}). Post a correcting JE to "
                f"clear it first, or contact a finance admin to migrate the balance."
            ),
        )


def _ext_to_dict(ext: CustomerFinanceExt) -> dict:
    """
    Serialise a CustomerFinanceExt ORM row to a JSON-safe dict for audit_log.

    Args:
        ext: ORM instance.

    Returns:
        Plain dict with all relevant fields.
    """
    return {
        "customer_finance_ext_id": ext.customer_finance_ext_id,
        "customerId": ext.customerId,
        "organizationId": ext.organizationId,
        "arControlAccountId": ext.arControlAccountId,
        "paymentTermsId": ext.paymentTermsId,
        "defaultTaxCode": ext.defaultTaxCode,
        "creditLimit": str(ext.creditLimit) if ext.creditLimit is not None else None,
        "creditLimitCurrency": ext.creditLimitCurrency,
        "bpRefDefault": ext.bpRefDefault,
        "notes": ext.notes,
        "createdBy": ext.createdBy,
        "updatedBy": ext.updatedBy,
    }


async def _write_audit(
    db: AsyncSession,
    event_type: str,
    ext_id: str,
    organization_id: str,
    actor_user_id: str,
    before: Optional[dict],
    after: Optional[dict],
) -> None:
    """
    Insert one audit_log row for a write operation on customer_finance_ext.

    Args:
        db: Async DB session.
        event_type: "customer_finance_ext_created" | "customer_finance_ext_updated"
            | "customer_finance_ext_deleted".
        ext_id: customer_finance_ext_id UUID string.
        organization_id: Org scope.
        actor_user_id: JWT userId of the caller.
        before: Serialised state before the change (None for create).
        after: Serialised state after the change (None for delete).
    """
    log = AuditLog(
        auditId=str(uuid.uuid4()),
        organizationId=organization_id,
        actorUserId=actor_user_id,
        action=event_type,
        entityType="CustomerFinanceExt",
        entityId=ext_id,
        beforeJson=before,
        afterJson=after,
    )
    db.add(log)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/customer-finance-ext",
    response_model=PaginatedResponse[CustomerFinanceExtResponse],
    summary="List customer finance extensions",
)
async def list_customer_ext(
    organization_id: str = Query(...),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> PaginatedResponse[CustomerFinanceExtResponse]:
    """
    Return paginated customer finance extensions for an organisation.

    Args:
        organization_id: Org scope (required).
        page: 1-based page number.
        size: Items per page (max 200).
        db: Async DB session.
        _current_user: Authenticated user (read roles).

    Returns:
        Paginated list of CustomerFinanceExtResponse.
    """
    count_q = (
        select(func.count())
        .select_from(CustomerFinanceExt)
        .where(CustomerFinanceExt.organizationId == organization_id)
    )
    total = await db.scalar(count_q) or 0
    offset = (page - 1) * size
    result = await db.execute(
        select(CustomerFinanceExt)
        .where(CustomerFinanceExt.organizationId == organization_id)
        .order_by(CustomerFinanceExt.customerId)
        .offset(offset)
        .limit(size)
    )
    items = result.scalars().all()
    return paginated(
        items=[CustomerFinanceExtResponse.model_validate(r) for r in items],
        total=total,
        page=page,
        size=size,
    )


@router.get(
    "/customer-finance-ext/{customer_id}",
    response_model=SuccessResponse[CustomerFinanceExtResponse],
    summary="Get customer finance extension by customerId",
)
async def get_customer_ext(
    customer_id: str,
    organization_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[CustomerFinanceExtResponse]:
    """
    Retrieve the finance extension for a specific customer in an org.

    Lookup is by customerId (not by customer_finance_ext_id), since callers
    know the customer's MongoDB ID.

    Args:
        customer_id: MongoDB customerId UUID string.
        organization_id: Org scope (required query param).
        db: Async DB session.
        _current_user: Authenticated user (read roles).

    Returns:
        CustomerFinanceExtResponse wrapped in SuccessResponse.

    Raises:
        HTTPException 404: If no extension found for this customer in this org.
    """
    result = await db.execute(
        select(CustomerFinanceExt).where(
            CustomerFinanceExt.organizationId == organization_id,
            CustomerFinanceExt.customerId == customer_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No finance extension found for customer '{customer_id}' in this organisation.",
        )
    return success(CustomerFinanceExtResponse.model_validate(row))


@router.post(
    "/customer-finance-ext",
    response_model=SuccessResponse[CustomerFinanceExtResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create customer finance extension",
)
async def create_customer_ext(
    body: CustomerFinanceExtCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[CustomerFinanceExtResponse]:
    """
    Create a new customer finance extension.

    Validates arControlAccountId type (ASSETS/asset, non-header) if provided.

    Args:
        body: CustomerFinanceExtCreate with organizationId + customerId + finance fields.
        db: Async DB session.
        current_user: Authenticated user (write roles).

    Returns:
        Created CustomerFinanceExtResponse with HTTP 201.

    Raises:
        HTTPException 409: If (organizationId, customerId) pair already exists.
        HTTPException 422: If arControlAccountId fails type guard.
    """
    # Uniqueness check — more descriptive error than a DB IntegrityError.
    existing = await db.execute(
        select(CustomerFinanceExt).where(
            CustomerFinanceExt.organizationId == body.organizationId,
            CustomerFinanceExt.customerId == body.customerId,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"A finance extension already exists for customer '{body.customerId}' "
                f"in organisation '{body.organizationId}'."
            ),
        )

    # Type guard on arControlAccountId.
    if body.arControlAccountId is not None:
        await _check_ar_account_type(body.arControlAccountId, body.organizationId, db)

    ext_id = str(uuid.uuid4())
    row = CustomerFinanceExt(
        customer_finance_ext_id=ext_id,
        customerId=body.customerId,
        organizationId=body.organizationId,
        arControlAccountId=body.arControlAccountId,
        paymentTermsId=body.paymentTermsId,
        defaultTaxCode=body.defaultTaxCode,
        creditLimit=body.creditLimit,
        creditLimitCurrency=body.creditLimitCurrency,
        bpRefDefault=body.bpRefDefault,
        notes=body.notes,
        createdBy=current_user.userId,
        updatedBy=current_user.userId,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)

    await _write_audit(
        db=db,
        event_type="customer_finance_ext_created",
        ext_id=row.customer_finance_ext_id,
        organization_id=row.organizationId,
        actor_user_id=current_user.userId,
        before=None,
        after=_ext_to_dict(row),
    )

    return success(CustomerFinanceExtResponse.model_validate(row), message="Customer finance extension created.")


@router.patch(
    "/customer-finance-ext/{customer_id}",
    response_model=SuccessResponse[CustomerFinanceExtResponse],
    summary="Update customer finance extension",
)
async def update_customer_ext(
    customer_id: str,
    body: CustomerFinanceExtUpdate,
    organization_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[CustomerFinanceExtResponse]:
    """
    Partially update a customer finance extension.

    Only fields explicitly present in the JSON body are written.
    Omit a field to leave it unchanged.
    Pass null to clear an optional field.

    Applies two guards on arControlAccountId:
      - Type guard: must be ASSETS/asset, non-header.
      - Balance guard: old account must have zero posted balance.

    No-op if no fields change — returns 200 but skips audit row.

    Args:
        customer_id: MongoDB customerId UUID string.
        organization_id: Org scope (required query param).
        body: Fields to update.
        db: Async DB session.
        current_user: Authenticated user (write roles).

    Returns:
        Updated CustomerFinanceExtResponse.

    Raises:
        HTTPException 404: If no extension found.
        HTTPException 409: If balance guard fires on arControlAccountId change.
        HTTPException 422: If type guard fires on arControlAccountId.
    """
    result = await db.execute(
        select(CustomerFinanceExt).where(
            CustomerFinanceExt.organizationId == organization_id,
            CustomerFinanceExt.customerId == customer_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No finance extension found for customer '{customer_id}' in this organisation.",
        )

    before_snapshot = _ext_to_dict(row)

    # Reason: model_fields_set contains only fields present in the JSON body;
    # omitted fields are skipped so we never overwrite what the caller didn't touch.
    changed = False
    for field_name in body.model_fields_set:
        new_value = getattr(body, field_name)

        if field_name == "arControlAccountId":
            old_value = row.arControlAccountId

            # Type guard: new non-null value must be ASSETS/asset.
            if new_value is not None:
                await _check_ar_account_type(new_value, organization_id, db)

            # Balance guard: if old account changes, ensure its balance is zero.
            if new_value != old_value and old_value is not None:
                await _check_ar_account_balance(old_value, organization_id, db)

        current_value = getattr(row, field_name)
        if new_value != current_value:
            setattr(row, field_name, new_value)
            changed = True

    if not changed:
        # No-op — return current state without writing an audit row.
        return success(CustomerFinanceExtResponse.model_validate(row))

    row.updatedBy = current_user.userId
    await db.flush()
    await db.refresh(row)

    after_snapshot = _ext_to_dict(row)
    await _write_audit(
        db=db,
        event_type="customer_finance_ext_updated",
        ext_id=row.customer_finance_ext_id,
        organization_id=row.organizationId,
        actor_user_id=current_user.userId,
        before=before_snapshot,
        after=after_snapshot,
    )

    return success(CustomerFinanceExtResponse.model_validate(row))


@router.delete(
    "/customer-finance-ext/{customer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete customer finance extension",
)
async def delete_customer_ext(
    customer_id: str,
    organization_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> None:
    """
    Hard-delete a customer finance extension.

    Does NOT delete the customer in the main app's MongoDB.
    This table has no ledger value (unlike JE lines), so hard-delete
    is appropriate — mirrors vendor_finance_ext behaviour.

    An audit_log row is written before deletion (before=snapshot, after=None).

    Args:
        customer_id: MongoDB customerId UUID string.
        organization_id: Org scope (required query param).
        db: Async DB session.
        current_user: Authenticated user (write roles).

    Raises:
        HTTPException 404: If no extension found.
    """
    result = await db.execute(
        select(CustomerFinanceExt).where(
            CustomerFinanceExt.organizationId == organization_id,
            CustomerFinanceExt.customerId == customer_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No finance extension found for customer '{customer_id}' in this organisation.",
        )

    before_snapshot = _ext_to_dict(row)
    ext_id = row.customer_finance_ext_id

    await _write_audit(
        db=db,
        event_type="customer_finance_ext_deleted",
        ext_id=ext_id,
        organization_id=organization_id,
        actor_user_id=current_user.userId,
        before=before_snapshot,
        after=None,
    )

    await db.delete(row)
    # Reason: flush here so the audit row + delete are committed together
    # in the session's unit of work before the response is sent.
    await db.flush()
