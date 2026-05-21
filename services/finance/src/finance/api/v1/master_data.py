"""
Finance Service — Master Data Extension API

Endpoints for vendor_finance_ext, purchase_item_finance_ext, and approval_rules.

All endpoints live under /api/v1/finance/master-data/.

Permissions:
  - Read: accountant, finance_admin, auditor, admin, super_admin
  - Write: finance_admin, admin, super_admin
"""

import logging
import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...middleware.auth import TokenPayload, require_roles
from ...models.orm.models import ApprovalRule, PurchaseItemFinanceExt, VendorFinanceExt
from ...models.schemas.common import PaginatedResponse, SuccessResponse
from ...models.schemas.master_data import (
    ApprovalRuleCreate,
    ApprovalRuleResponse,
    ApprovalRuleResolveResponse,
    ApprovalRuleUpdate,
    PurchaseItemFinanceExtResponse,
    PurchaseItemFinanceExtUpdate,
    PurchaseItemFinanceExtUpsert,
    PurchaseItemTypeLiteral,
    VendorFinanceExtResponse,
    VendorFinanceExtUpsert,
)
from ...utils.responses import paginated, success

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/master-data", tags=["Finance — Master Data Extensions"])

_READ_ROLES = ("accountant", "finance_admin", "auditor", "super_admin", "admin")
_WRITE_ROLES = ("finance_admin", "super_admin", "admin")


# ===========================================================================
# Vendor Finance Ext
# ===========================================================================


@router.get(
    "/vendor-ext",
    response_model=PaginatedResponse[VendorFinanceExtResponse],
    summary="List vendor finance extensions",
)
async def list_vendor_ext(
    organization_id: str = Query(...),
    vendor_code: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> PaginatedResponse[VendorFinanceExtResponse]:
    """
    Return paginated vendor finance extensions for an organisation.

    Args:
        organization_id: Filter to this org.
        vendor_code: Optional filter by vendorCode.
        page: Page number (1-based).
        size: Items per page.
        db: Async DB session.
        _current_user: Authenticated user (read roles).

    Returns:
        Paginated vendor finance ext list.
    """
    from sqlalchemy import func

    query = select(VendorFinanceExt).where(
        VendorFinanceExt.organizationId == organization_id
    )
    count_q = select(func.count()).select_from(VendorFinanceExt).where(
        VendorFinanceExt.organizationId == organization_id
    )

    if vendor_code:
        query = query.where(VendorFinanceExt.vendorCode == vendor_code)
        count_q = count_q.where(VendorFinanceExt.vendorCode == vendor_code)

    total = await db.scalar(count_q) or 0
    offset = (page - 1) * size
    result = await db.execute(
        query.order_by(VendorFinanceExt.vendorCode).offset(offset).limit(size)
    )
    items = result.scalars().all()

    return paginated(
        items=[VendorFinanceExtResponse.model_validate(r) for r in items],
        total=total,
        page=page,
        size=size,
    )


@router.get(
    "/vendor-ext/by-vendor/{vendor_id}",
    response_model=SuccessResponse[VendorFinanceExtResponse],
    summary="Get vendor finance extension by main-app vendorId",
)
async def get_vendor_ext(
    vendor_id: str,
    organization_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[VendorFinanceExtResponse]:
    """
    Retrieve vendor finance extension by the main-app vendorId.

    Args:
        vendor_id: UUID string matching the main app's vendor document.
        organization_id: Org scope.
        db: Async DB session.
        _current_user: Authenticated user.

    Returns:
        VendorFinanceExtResponse wrapped in SuccessResponse.

    Raises:
        HTTPException 404: If not found.
    """
    result = await db.execute(
        select(VendorFinanceExt).where(
            VendorFinanceExt.organizationId == organization_id,
            VendorFinanceExt.vendorId == vendor_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No finance extension found for vendor '{vendor_id}'",
        )
    return success(VendorFinanceExtResponse.model_validate(row))


@router.put(
    "/vendor-ext/by-vendor/{vendor_id}",
    response_model=SuccessResponse[VendorFinanceExtResponse],
    summary="Upsert vendor finance extension",
)
async def upsert_vendor_ext(
    vendor_id: str,
    body: VendorFinanceExtUpsert,
    organization_id: str = Query(...),
    vendor_code: str = Query(..., description="Denormalized vendor code"),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[VendorFinanceExtResponse]:
    """
    Create or update vendor finance extension for a given vendorId.

    Args:
        vendor_id: Main-app vendorId.
        body: Finance fields to set.
        organization_id: Org scope.
        vendor_code: Denormalized vendorCode for indexing.
        db: Async DB session.
        _current_user: Authenticated user (write roles).

    Returns:
        Created/updated VendorFinanceExtResponse.
    """
    result = await db.execute(
        select(VendorFinanceExt).where(
            VendorFinanceExt.organizationId == organization_id,
            VendorFinanceExt.vendorId == vendor_id,
        )
    )
    row = result.scalar_one_or_none()

    if row is None:
        row = VendorFinanceExt(
            extId=str(uuid.uuid4()),
            organizationId=organization_id,
            vendorId=vendor_id,
            vendorCode=vendor_code,
        )
        db.add(row)

    # Apply supplied fields
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(row, field, value)

    row.vendorCode = vendor_code
    await db.flush()
    await db.refresh(row)

    return success(VendorFinanceExtResponse.model_validate(row))


@router.delete(
    "/vendor-ext/by-vendor/{vendor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Detach vendor finance extension",
)
async def delete_vendor_ext(
    vendor_id: str,
    organization_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> None:
    """
    Delete vendor finance extension (does NOT delete the vendor in main app).

    Args:
        vendor_id: Main-app vendorId.
        organization_id: Org scope.
        db: Async DB session.
        _current_user: Authenticated user (write roles).

    Raises:
        HTTPException 404: If not found.
    """
    result = await db.execute(
        select(VendorFinanceExt).where(
            VendorFinanceExt.organizationId == organization_id,
            VendorFinanceExt.vendorId == vendor_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No finance extension found for vendor '{vendor_id}'",
        )
    await db.delete(row)


# ===========================================================================
# Purchase Item Finance Ext
# ===========================================================================


@router.get(
    "/purchase-item-ext",
    response_model=PaginatedResponse[PurchaseItemFinanceExtResponse],
    summary="List purchase item finance extensions",
)
async def list_item_ext(
    organization_id: str = Query(...),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> PaginatedResponse[PurchaseItemFinanceExtResponse]:
    """Return paginated purchase item finance extensions."""
    from sqlalchemy import func

    count_q = select(func.count()).select_from(PurchaseItemFinanceExt).where(
        PurchaseItemFinanceExt.organizationId == organization_id
    )
    total = await db.scalar(count_q) or 0
    offset = (page - 1) * size
    result = await db.execute(
        select(PurchaseItemFinanceExt)
        .where(PurchaseItemFinanceExt.organizationId == organization_id)
        .order_by(PurchaseItemFinanceExt.itemCode)
        .offset(offset)
        .limit(size)
    )
    items = result.scalars().all()
    return paginated(
        items=[PurchaseItemFinanceExtResponse.model_validate(r) for r in items],
        total=total,
        page=page,
        size=size,
    )


@router.get(
    "/purchase-item-ext/by-item/{item_id}",
    response_model=SuccessResponse[PurchaseItemFinanceExtResponse],
    summary="Get purchase item finance extension by itemId",
)
async def get_item_ext(
    item_id: str,
    organization_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[PurchaseItemFinanceExtResponse]:
    """Retrieve purchase item finance extension by main-app itemId."""
    result = await db.execute(
        select(PurchaseItemFinanceExt).where(
            PurchaseItemFinanceExt.organizationId == organization_id,
            PurchaseItemFinanceExt.itemId == item_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No finance extension found for item '{item_id}'",
        )
    return success(PurchaseItemFinanceExtResponse.model_validate(row))


@router.put(
    "/purchase-item-ext/by-item/{item_id}",
    response_model=SuccessResponse[PurchaseItemFinanceExtResponse],
    summary="Upsert purchase item finance extension",
)
async def upsert_item_ext(
    item_id: str,
    body: PurchaseItemFinanceExtUpsert,
    organization_id: str = Query(...),
    item_code: str = Query(..., description="Denormalized item code"),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[PurchaseItemFinanceExtResponse]:
    """Create or update purchase item finance extension."""
    result = await db.execute(
        select(PurchaseItemFinanceExt).where(
            PurchaseItemFinanceExt.organizationId == organization_id,
            PurchaseItemFinanceExt.itemId == item_id,
        )
    )
    row = result.scalar_one_or_none()

    if row is None:
        from ...models.orm.models import ValuationMethodEnum

        row = PurchaseItemFinanceExt(
            extId=str(uuid.uuid4()),
            organizationId=organization_id,
            itemId=item_id,
            itemCode=item_code,
            valuationMethod=ValuationMethodEnum.MOVING_AVERAGE,
        )
        db.add(row)

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(row, field, value)

    row.itemCode = item_code
    await db.flush()
    await db.refresh(row)

    return success(PurchaseItemFinanceExtResponse.model_validate(row))


@router.delete(
    "/purchase-item-ext/by-item/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Detach purchase item finance extension",
)
async def delete_item_ext(
    item_id: str,
    organization_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> None:
    """Delete purchase item finance extension."""
    result = await db.execute(
        select(PurchaseItemFinanceExt).where(
            PurchaseItemFinanceExt.organizationId == organization_id,
            PurchaseItemFinanceExt.itemId == item_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No finance extension found for item '{item_id}'",
        )
    await db.delete(row)


# ===========================================================================
# Purchase Items — finance GL mapping view
# New endpoints added for A.4: GET list/detail and PATCH for account mapping.
# These sit alongside the existing purchase-item-ext PUT/DELETE routes and
# expose a cleaner URL scheme (/purchase-items/{item_id}) plus search/filter.
# ===========================================================================


@router.get(
    "/purchase-items",
    response_model=PaginatedResponse[PurchaseItemFinanceExtResponse],
    summary="List purchase items with their finance GL mapping",
)
async def list_purchase_items(
    organization_id: str = Query(...),
    item_type: Optional[PurchaseItemTypeLiteral] = Query(
        None, alias="itemType", description="Filter by item type"
    ),
    is_active: Optional[bool] = Query(None, alias="is_active"),
    search: Optional[str] = Query(
        None,
        description="Substring search on itemCode or itemName (case-insensitive)",
    ),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> PaginatedResponse[PurchaseItemFinanceExtResponse]:
    """
    Return a paginated list of purchase items with their finance-side GL mapping.

    Supports optional filtering by itemType, isActive status, and a substring
    search on itemCode / itemName (case-insensitive).

    Args:
        organization_id: Org scope (required).
        item_type: Optional filter by operational item type.
        is_active: Optional filter by active/inactive status.
        search: Optional substring match on itemCode or itemName.
        page: 1-based page number.
        size: Items per page (max 200).
        db: Async DB session.
        _current_user: Authenticated user (read roles).

    Returns:
        Paginated list of PurchaseItemFinanceExtResponse.
    """
    from sqlalchemy import func, or_

    from ...models.orm.models import PurchaseItemTypeEnum

    base_filter = [PurchaseItemFinanceExt.organizationId == organization_id]

    if item_type is not None:
        try:
            enum_val = PurchaseItemTypeEnum(item_type)
            base_filter.append(PurchaseItemFinanceExt.itemType == enum_val)
        except ValueError:
            pass  # Reason: unknown value returns empty result gracefully

    if is_active is not None:
        base_filter.append(PurchaseItemFinanceExt.isActive == is_active)

    if search:
        # Reason: use ilike for case-insensitive substring match on either field.
        pattern = f"%{search}%"
        base_filter.append(
            or_(
                PurchaseItemFinanceExt.itemCode.ilike(pattern),
                PurchaseItemFinanceExt.itemName.ilike(pattern),
            )
        )

    count_q = (
        select(func.count())
        .select_from(PurchaseItemFinanceExt)
        .where(*base_filter)
    )
    total = await db.scalar(count_q) or 0

    offset = (page - 1) * size
    result = await db.execute(
        select(PurchaseItemFinanceExt)
        .where(*base_filter)
        .order_by(PurchaseItemFinanceExt.itemCode)
        .offset(offset)
        .limit(size)
    )
    items = result.scalars().all()

    return paginated(
        items=[PurchaseItemFinanceExtResponse.model_validate(r) for r in items],
        total=total,
        page=page,
        size=size,
    )


@router.get(
    "/purchase-items/{item_id}",
    response_model=SuccessResponse[PurchaseItemFinanceExtResponse],
    summary="Get purchase item finance mapping by itemId",
)
async def get_purchase_item(
    item_id: str,
    organization_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[PurchaseItemFinanceExtResponse]:
    """
    Retrieve the finance GL mapping for a single purchase item.

    Args:
        item_id: UUID string matching the main app's purchase item document.
        organization_id: Org scope.
        db: Async DB session.
        _current_user: Authenticated user (read roles).

    Returns:
        PurchaseItemFinanceExtResponse wrapped in SuccessResponse.

    Raises:
        HTTPException 404: If no ext row exists for this item in this org.
    """
    result = await db.execute(
        select(PurchaseItemFinanceExt).where(
            PurchaseItemFinanceExt.organizationId == organization_id,
            PurchaseItemFinanceExt.itemId == item_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No finance extension found for item '{item_id}'",
        )
    return success(PurchaseItemFinanceExtResponse.model_validate(row))


@router.patch(
    "/purchase-items/{item_id}",
    response_model=SuccessResponse[PurchaseItemFinanceExtResponse],
    summary="Update GL account mapping for a purchase item",
)
async def patch_purchase_item(
    item_id: str,
    body: PurchaseItemFinanceExtUpdate,
    organization_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[PurchaseItemFinanceExtResponse]:
    """
    Partially update the GL account mapping for a purchase item.

    Any account ID field supplied is validated: it must reference an active
    leaf-level (accountLevel='active') GL account in the SAME organisation.
    Pass null to explicitly clear an account assignment.
    Only fields present in the request body are written.

    Args:
        item_id: UUID string matching the main app's purchase item document.
        body: Fields to update; omitted fields are unchanged.
        organization_id: Org scope.
        db: Async DB session.
        _current_user: Authenticated user (write roles).

    Returns:
        Updated PurchaseItemFinanceExtResponse.

    Raises:
        HTTPException 404: If no ext row exists for this item.
        HTTPException 422: If an account ID is not a valid active leaf account
                           in this organisation.
    """
    result = await db.execute(
        select(PurchaseItemFinanceExt).where(
            PurchaseItemFinanceExt.organizationId == organization_id,
            PurchaseItemFinanceExt.itemId == item_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No finance extension found for item '{item_id}'",
        )

    # Reason: account FK fields need extra validation — they must reference an
    # active leaf account in the SAME org (not a title/drawer header account).
    _ACCOUNT_FK_FIELDS = {"inventoryAccountId", "cogsAccountId", "allocationAccountId"}

    from ...models.orm.models import AccountLevelEnum, GLAccount

    # Reason: model_fields_set contains only the fields explicitly present in
    # the JSON body.  Fields omitted by the caller are not iterated, so we
    # never overwrite something the caller didn't touch.  Fields present with
    # value null are in model_fields_set with a None value — we allow those
    # through to clear the FK.
    for field_name in body.model_fields_set:
        value = getattr(body, field_name)
        if field_name not in _ACCOUNT_FK_FIELDS or value is None:
            # null is always allowed (clears the FK); non-account fields skip validation
            setattr(row, field_name, value)
            continue

        # Validate that the account exists, belongs to this org, and is active leaf
        acct_result = await db.execute(
            select(GLAccount).where(
                GLAccount.accountId == value,
                GLAccount.organizationId == organization_id,
                GLAccount.isActive == True,  # noqa: E712
            )
        )
        acct = acct_result.scalar_one_or_none()
        if acct is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"{field_name}: account '{value}' not found or inactive "
                    f"in organisation '{organization_id}'"
                ),
            )
        if acct.accountLevel != AccountLevelEnum.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"{field_name}: account '{value}' is a "
                    f"'{acct.accountLevel.value}' account — only active leaf "
                    f"accounts may be assigned for posting"
                ),
            )
        setattr(row, field_name, value)

    await db.flush()
    await db.refresh(row)
    return success(PurchaseItemFinanceExtResponse.model_validate(row))


# ===========================================================================
# Approval Rules
# ===========================================================================


@router.get(
    "/approval-rules",
    response_model=PaginatedResponse[ApprovalRuleResponse],
    summary="List approval rules",
)
async def list_approval_rules(
    organization_id: str = Query(...),
    company_code: Optional[str] = Query(None),
    doc_type: Optional[str] = Query(None, alias="docType"),
    is_active: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> PaginatedResponse[ApprovalRuleResponse]:
    """Return paginated approval rules with optional filters."""
    from sqlalchemy import func

    query = select(ApprovalRule).where(ApprovalRule.organizationId == organization_id)
    count_q = select(func.count()).select_from(ApprovalRule).where(
        ApprovalRule.organizationId == organization_id
    )

    if company_code:
        query = query.where(ApprovalRule.companyCode == company_code)
        count_q = count_q.where(ApprovalRule.companyCode == company_code)
    if doc_type:
        query = query.where(ApprovalRule.docType == doc_type)
        count_q = count_q.where(ApprovalRule.docType == doc_type)
    if is_active is not None:
        query = query.where(ApprovalRule.isActive == is_active)
        count_q = count_q.where(ApprovalRule.isActive == is_active)

    total = await db.scalar(count_q) or 0
    offset = (page - 1) * size
    result = await db.execute(
        query.order_by(ApprovalRule.docType, ApprovalRule.priority).offset(offset).limit(size)
    )
    items = result.scalars().all()

    return paginated(
        items=[ApprovalRuleResponse.model_validate(r) for r in items],
        total=total,
        page=page,
        size=size,
    )


@router.get(
    "/approval-rules/resolve",
    response_model=SuccessResponse[ApprovalRuleResolveResponse],
    summary="Resolve whether a document needs approval",
    description=(
        "Query: companyCode + docType + amount → returns whether the document "
        "requires approval and which rule matched."
    ),
)
async def resolve_approval_rule(
    organization_id: str = Query(...),
    company_code: str = Query(...),
    doc_type: str = Query(..., alias="docType"),
    amount: Optional[Decimal] = Query(None, ge=0),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[ApprovalRuleResolveResponse]:
    """
    Determine if a document requires approval.

    Matching logic:
      1. Find active rules for (org, company, docType) sorted by priority.
      2. If any rule has alwaysRequired=True → requires approval.
      3. If amount >= rule.thresholdAmount → requires approval.

    Args:
        organization_id: Org scope.
        company_code: Finance company code.
        doc_type: Document type enum string.
        amount: Document amount for threshold check.
        db: Async DB session.
        _current_user: Authenticated user.

    Returns:
        ApprovalRuleResolveResponse with requiresApproval, matchedRule, reason.
    """
    result = await db.execute(
        select(ApprovalRule)
        .where(
            ApprovalRule.organizationId == organization_id,
            ApprovalRule.companyCode == company_code,
            ApprovalRule.docType == doc_type,
            ApprovalRule.isActive == True,  # noqa: E712
        )
        .order_by(ApprovalRule.priority)
    )
    rules = result.scalars().all()

    for rule in rules:
        if rule.alwaysRequired:
            return success(ApprovalRuleResolveResponse(
                requiresApproval=True,
                matchedRule=ApprovalRuleResponse.model_validate(rule),
                reason=f"Always required: {rule.approverRole} must approve all {doc_type} documents",
            ))
        if rule.thresholdAmount is not None and amount is not None:
            if amount >= rule.thresholdAmount:
                return success(ApprovalRuleResolveResponse(
                    requiresApproval=True,
                    matchedRule=ApprovalRuleResponse.model_validate(rule),
                    reason=(
                        f"Amount {amount} exceeds threshold {rule.thresholdAmount}; "
                        f"{rule.approverRole} approval required"
                    ),
                ))

    return success(ApprovalRuleResolveResponse(
        requiresApproval=False,
        matchedRule=None,
        reason="No matching approval rule found for this document",
    ))


@router.post(
    "/approval-rules",
    response_model=SuccessResponse[ApprovalRuleResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create approval rule",
)
async def create_approval_rule(
    body: ApprovalRuleCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[ApprovalRuleResponse]:
    """Create a new approval rule."""
    rule = ApprovalRule(
        ruleId=str(uuid.uuid4()),
        organizationId=body.organizationId,
        companyCode=body.companyCode,
        docType=body.docType,
        thresholdAmount=body.thresholdAmount,
        approverRole=body.approverRole,
        alwaysRequired=body.alwaysRequired,
        priority=body.priority,
        isActive=True,
        notes=body.notes,
    )
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return success(ApprovalRuleResponse.model_validate(rule))


@router.patch(
    "/approval-rules/{rule_id}",
    response_model=SuccessResponse[ApprovalRuleResponse],
    summary="Update approval rule",
)
async def update_approval_rule(
    rule_id: str,
    body: ApprovalRuleUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[ApprovalRuleResponse]:
    """Partially update an approval rule."""
    rule = await db.get(ApprovalRule, rule_id)
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Approval rule '{rule_id}' not found",
        )
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(rule, field, value)
    return success(ApprovalRuleResponse.model_validate(rule))


@router.delete(
    "/approval-rules/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deactivate approval rule (soft delete)",
)
async def delete_approval_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> None:
    """
    Soft-delete an approval rule by setting isActive=False.

    Args:
        rule_id: UUID string of the rule.
        db: Async DB session.
        _current_user: Authenticated user (write roles).

    Raises:
        HTTPException 404: If rule not found.
    """
    rule = await db.get(ApprovalRule, rule_id)
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Approval rule '{rule_id}' not found",
        )
    rule.isActive = False
