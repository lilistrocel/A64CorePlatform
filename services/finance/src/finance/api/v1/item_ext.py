"""
Sale Item Finance Extension API  (Wave 3 / T-100.3)

Full CRUD for the sale_item_finance_ext table.  Every sales document that
posts a JE (AR Invoice, Delivery, Credit Note, etc.) reads this table to
resolve the per-item revenue account, COGS account, and default sales tax code.

URL pattern mirrors customer_finance_ext from T-100.2 but lives in
this dedicated file, registered in main.py at the finance prefix.

Endpoints:
  GET    /item-finance-ext                    list (paginated, org-scoped)
  GET    /item-finance-ext/{item_id}          get by itemId
  POST   /item-finance-ext                    create
  PATCH  /item-finance-ext/{item_id}          update
  DELETE /item-finance-ext/{item_id}          delete

Permissions:
  Read:  finance_admin, finance_reviewer, accountant, auditor, super_admin, admin
  Write: finance_admin, super_admin, admin

Validation guards on revenueAccountId:
  Type guard — account must be drawer=REVENUE, accountType=revenue,
               isHeader=false, isActive=true (HTTP 422).

Validation guards on cogsAccountId:
  Type guard — account must be drawer=COST_OF_SALES, accountType=expense,
               isHeader=false, isActive=true (HTTP 422).

No balance-change guard: revenue / COGS accounts don't accumulate a
per-item balance — they are GL posting targets only.  A change affects
only future postings; there is no orphan-balance risk (unlike arControlAccountId
in T-100.2 which tracks an open AR balance per customer).

salesTaxCode stored as plain string (no FK) — same deviation as T-100.2.

Audit log:
  Every POST / PATCH / DELETE writes one row to the audit_log table.
"""

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...middleware.auth import TokenPayload, require_roles
from ...models.orm.models import (
    AccountTypeEnum,
    AuditLog,
    DrawerEnum,
    GLAccount,
    SaleItemFinanceExt,
)
from ...models.schemas.common import PaginatedResponse, SuccessResponse
from ...models.schemas.master_data import (
    SaleItemFinanceExtCreate,
    SaleItemFinanceExtResponse,
    SaleItemFinanceExtUpdate,
)
from ...utils.responses import paginated, success

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Sale Item Finance Extension"])

_READ_ROLES = ("finance_admin", "finance_reviewer", "accountant", "auditor", "super_admin", "admin")
_WRITE_ROLES = ("finance_admin", "super_admin", "admin")

# ---------------------------------------------------------------------------
# Internal type-guard helpers
# ---------------------------------------------------------------------------

# Reason: Revenue account must be REVENUE/revenue (credit-normal P&L account) so the
# AR Invoice JE correctly records CR Revenue.  Any other drawer/type would corrupt the
# income statement classification.
_REVENUE_ALLOWED: frozenset[tuple[DrawerEnum, AccountTypeEnum]] = frozenset({
    (DrawerEnum.REVENUE, AccountTypeEnum.REVENUE),
})

# Reason: COGS account must be COST_OF_SALES/expense (debit-normal P&L account) so the
# Delivery JE correctly records DR COGS / CR Inventory.  Using OPERATING_COST or ASSETS
# here would misclassify the depletion entry on the income statement.
_COGS_ALLOWED: frozenset[tuple[DrawerEnum, AccountTypeEnum]] = frozenset({
    (DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE),
})


async def _check_revenue_account_type(
    account_id: str,
    organization_id: str,
    field_name: str,
    db: AsyncSession,
) -> None:
    """
    Reject assignment of revenueAccountId when the account's drawer /
    accountType is not REVENUE / revenue, or when isHeader=True.

    Mirrors _check_ar_account_type in customer_ext.py (T-063 / T-100.2 pattern).

    Args:
        account_id: The GL account UUID to type-check.
        organization_id: Org scope.
        field_name: Field name for error messages ("revenueAccountId").
        db: Async DB session.

    Raises:
        HTTPException 422: If the account type, header flag, or active flag is wrong.
    """
    account = await db.get(GLAccount, account_id)
    if account is None or account.organizationId != organization_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name}: account '{account_id}' not found in this organisation.",
        )
    if not account.isActive:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name}: account '{account_id}' is inactive.",
        )
    if account.isHeader:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Cannot assign account {account.accountNumber} "
                f"'{account.accountName}' to {field_name} — "
                f"header accounts (isHeader=true) cannot be used as posting targets."
            ),
        )
    actual_pair = (account.drawer, account.accountType)
    if actual_pair not in _REVENUE_ALLOWED:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Cannot assign account {account.accountNumber} "
                f"'{account.accountName}' "
                f"(drawer={account.drawer.value}, accountType={account.accountType.value}) "
                f"to {field_name} — this field requires an account with "
                f"drawer=REVENUE, accountType=revenue."
            ),
        )


async def _check_cogs_account_type(
    account_id: str,
    organization_id: str,
    field_name: str,
    db: AsyncSession,
) -> None:
    """
    Reject assignment of cogsAccountId when the account's drawer /
    accountType is not COST_OF_SALES / expense, or when isHeader=True.

    Mirrors the T-063 / T-100.2 type-guard pattern.

    Args:
        account_id: The GL account UUID to type-check.
        organization_id: Org scope.
        field_name: Field name for error messages ("cogsAccountId").
        db: Async DB session.

    Raises:
        HTTPException 422: If the account type, header flag, or active flag is wrong.
    """
    account = await db.get(GLAccount, account_id)
    if account is None or account.organizationId != organization_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name}: account '{account_id}' not found in this organisation.",
        )
    if not account.isActive:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name}: account '{account_id}' is inactive.",
        )
    if account.isHeader:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Cannot assign account {account.accountNumber} "
                f"'{account.accountName}' to {field_name} — "
                f"header accounts (isHeader=true) cannot be used as posting targets."
            ),
        )
    actual_pair = (account.drawer, account.accountType)
    if actual_pair not in _COGS_ALLOWED:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Cannot assign account {account.accountNumber} "
                f"'{account.accountName}' "
                f"(drawer={account.drawer.value}, accountType={account.accountType.value}) "
                f"to {field_name} — this field requires an account with "
                f"drawer=COST_OF_SALES, accountType=expense."
            ),
        )


def _ext_to_dict(ext: SaleItemFinanceExt) -> dict:
    """
    Serialise a SaleItemFinanceExt ORM row to a JSON-safe dict for audit_log.

    Args:
        ext: ORM instance.

    Returns:
        Plain dict with all relevant fields.
    """
    return {
        "sale_item_finance_ext_id": ext.sale_item_finance_ext_id,
        "itemId": ext.itemId,
        "organizationId": ext.organizationId,
        "itemCode": ext.itemCode,
        "itemName": ext.itemName,
        "revenueAccountId": ext.revenueAccountId,
        "cogsAccountId": ext.cogsAccountId,
        "salesTaxCode": ext.salesTaxCode,
        "isSellable": ext.isSellable,
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
    Insert one audit_log row for a write operation on sale_item_finance_ext.

    Args:
        db: Async DB session.
        event_type: "item_finance_ext_created" | "item_finance_ext_updated"
            | "item_finance_ext_deleted".
        ext_id: sale_item_finance_ext_id UUID string.
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
        entityType="ItemFinanceExt",
        entityId=ext_id,
        beforeJson=before,
        afterJson=after,
    )
    db.add(log)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/item-finance-ext",
    response_model=PaginatedResponse[SaleItemFinanceExtResponse],
    summary="List sale item finance extensions",
)
async def list_item_ext(
    organization_id: str = Query(...),
    is_sellable: Optional[bool] = Query(
        None,
        alias="isSellable",
        description="Filter by isSellable flag",
    ),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> PaginatedResponse[SaleItemFinanceExtResponse]:
    """
    Return paginated sale item finance extensions for an organisation.

    Optionally filter by isSellable to retrieve only items configured for sale.

    Args:
        organization_id: Org scope (required).
        is_sellable: Optional filter on the isSellable flag.
        page: 1-based page number.
        size: Items per page (max 200).
        db: Async DB session.
        _current_user: Authenticated user (read roles).

    Returns:
        Paginated list of SaleItemFinanceExtResponse.
    """
    base_filter = [SaleItemFinanceExt.organizationId == organization_id]
    if is_sellable is not None:
        base_filter.append(SaleItemFinanceExt.isSellable == is_sellable)

    count_q = (
        select(func.count())
        .select_from(SaleItemFinanceExt)
        .where(*base_filter)
    )
    total = await db.scalar(count_q) or 0
    offset = (page - 1) * size
    result = await db.execute(
        select(SaleItemFinanceExt)
        .where(*base_filter)
        .order_by(SaleItemFinanceExt.itemId)
        .offset(offset)
        .limit(size)
    )
    items = result.scalars().all()
    return paginated(
        items=[SaleItemFinanceExtResponse.model_validate(r) for r in items],
        total=total,
        page=page,
        size=size,
    )


@router.get(
    "/item-finance-ext/{item_id}",
    response_model=SuccessResponse[SaleItemFinanceExtResponse],
    summary="Get sale item finance extension by itemId",
)
async def get_item_ext(
    item_id: str,
    organization_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[SaleItemFinanceExtResponse]:
    """
    Retrieve the sale finance extension for a specific item in an org.

    Lookup is by itemId (not by sale_item_finance_ext_id), since callers
    know the item's MongoDB ID.

    Args:
        item_id: MongoDB itemId UUID string.
        organization_id: Org scope (required query param).
        db: Async DB session.
        _current_user: Authenticated user (read roles).

    Returns:
        SaleItemFinanceExtResponse wrapped in SuccessResponse.

    Raises:
        HTTPException 404: If no extension found for this item in this org.
    """
    result = await db.execute(
        select(SaleItemFinanceExt).where(
            SaleItemFinanceExt.organizationId == organization_id,
            SaleItemFinanceExt.itemId == item_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No sale finance extension found for item '{item_id}' in this organisation.",
        )
    return success(SaleItemFinanceExtResponse.model_validate(row))


@router.post(
    "/item-finance-ext",
    response_model=SuccessResponse[SaleItemFinanceExtResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create sale item finance extension",
)
async def create_item_ext(
    body: SaleItemFinanceExtCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[SaleItemFinanceExtResponse]:
    """
    Create a new sale item finance extension.

    Validates revenueAccountId (REVENUE/revenue, non-header, active) and
    cogsAccountId (COST_OF_SALES/expense, non-header, active) if provided.

    Args:
        body: SaleItemFinanceExtCreate with organizationId + itemId + finance fields.
        db: Async DB session.
        current_user: Authenticated user (write roles).

    Returns:
        Created SaleItemFinanceExtResponse with HTTP 201.

    Raises:
        HTTPException 409: If (organizationId, itemId) pair already exists.
        HTTPException 422: If revenueAccountId or cogsAccountId fails type guard.
    """
    # Uniqueness check — more descriptive error than a DB IntegrityError.
    existing = await db.execute(
        select(SaleItemFinanceExt).where(
            SaleItemFinanceExt.organizationId == body.organizationId,
            SaleItemFinanceExt.itemId == body.itemId,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"A sale finance extension already exists for item '{body.itemId}' "
                f"in organisation '{body.organizationId}'."
            ),
        )

    # Type guards on account fields.
    if body.revenueAccountId is not None:
        await _check_revenue_account_type(
            body.revenueAccountId, body.organizationId, "revenueAccountId", db
        )
    if body.cogsAccountId is not None:
        await _check_cogs_account_type(
            body.cogsAccountId, body.organizationId, "cogsAccountId", db
        )

    ext_id = str(uuid.uuid4())
    row = SaleItemFinanceExt(
        sale_item_finance_ext_id=ext_id,
        itemId=body.itemId,
        organizationId=body.organizationId,
        itemCode=body.itemCode,
        itemName=body.itemName,
        revenueAccountId=body.revenueAccountId,
        cogsAccountId=body.cogsAccountId,
        salesTaxCode=body.salesTaxCode,
        isSellable=body.isSellable,
        notes=body.notes,
        createdBy=current_user.userId,
        updatedBy=current_user.userId,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)

    await _write_audit(
        db=db,
        event_type="item_finance_ext_created",
        ext_id=row.sale_item_finance_ext_id,
        organization_id=row.organizationId,
        actor_user_id=current_user.userId,
        before=None,
        after=_ext_to_dict(row),
    )

    return success(
        SaleItemFinanceExtResponse.model_validate(row),
        message="Sale item finance extension created.",
    )


@router.patch(
    "/item-finance-ext/{item_id}",
    response_model=SuccessResponse[SaleItemFinanceExtResponse],
    summary="Update sale item finance extension",
)
async def update_item_ext(
    item_id: str,
    body: SaleItemFinanceExtUpdate,
    organization_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[SaleItemFinanceExtResponse]:
    """
    Partially update a sale item finance extension.

    Only fields explicitly present in the JSON body are written.
    Omit a field to leave it unchanged.  Pass null to clear an optional field.

    Applies type guards on revenueAccountId and cogsAccountId when non-null
    values are supplied.

    No-op if no fields change — returns 200 but skips audit row.

    Args:
        item_id: MongoDB itemId UUID string.
        organization_id: Org scope (required query param).
        body: Fields to update.
        db: Async DB session.
        current_user: Authenticated user (write roles).

    Returns:
        Updated SaleItemFinanceExtResponse.

    Raises:
        HTTPException 404: If no extension found.
        HTTPException 422: If type guard fires on revenueAccountId or cogsAccountId.
    """
    result = await db.execute(
        select(SaleItemFinanceExt).where(
            SaleItemFinanceExt.organizationId == organization_id,
            SaleItemFinanceExt.itemId == item_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No sale finance extension found for item '{item_id}' in this organisation.",
        )

    before_snapshot = _ext_to_dict(row)

    # Reason: model_fields_set contains only fields present in the JSON body;
    # omitted fields are skipped so we never overwrite what the caller didn't touch.
    changed = False
    for field_name in body.model_fields_set:
        new_value = getattr(body, field_name)

        if field_name == "revenueAccountId" and new_value is not None:
            await _check_revenue_account_type(new_value, organization_id, "revenueAccountId", db)
        elif field_name == "cogsAccountId" and new_value is not None:
            await _check_cogs_account_type(new_value, organization_id, "cogsAccountId", db)

        current_value = getattr(row, field_name)
        if new_value != current_value:
            setattr(row, field_name, new_value)
            changed = True

    if not changed:
        # No-op — return current state without writing an audit row.
        return success(SaleItemFinanceExtResponse.model_validate(row))

    row.updatedBy = current_user.userId
    await db.flush()
    await db.refresh(row)

    after_snapshot = _ext_to_dict(row)
    await _write_audit(
        db=db,
        event_type="item_finance_ext_updated",
        ext_id=row.sale_item_finance_ext_id,
        organization_id=row.organizationId,
        actor_user_id=current_user.userId,
        before=before_snapshot,
        after=after_snapshot,
    )

    return success(SaleItemFinanceExtResponse.model_validate(row))


@router.delete(
    "/item-finance-ext/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete sale item finance extension",
)
async def delete_item_ext(
    item_id: str,
    organization_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> None:
    """
    Hard-delete a sale item finance extension.

    Does NOT delete the item in the main app's MongoDB.
    This table has no ledger value (unlike JE lines), so hard-delete
    is appropriate — mirrors customer_finance_ext behaviour.

    An audit_log row is written before deletion (before=snapshot, after=None).

    Args:
        item_id: MongoDB itemId UUID string.
        organization_id: Org scope (required query param).
        db: Async DB session.
        current_user: Authenticated user (write roles).

    Raises:
        HTTPException 404: If no extension found.
    """
    result = await db.execute(
        select(SaleItemFinanceExt).where(
            SaleItemFinanceExt.organizationId == organization_id,
            SaleItemFinanceExt.itemId == item_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No sale finance extension found for item '{item_id}' in this organisation.",
        )

    before_snapshot = _ext_to_dict(row)
    ext_id = row.sale_item_finance_ext_id

    await _write_audit(
        db=db,
        event_type="item_finance_ext_deleted",
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
