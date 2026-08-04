"""
Fertilizer Cost API

Endpoints for price management and calculation.
Mounted at /api/v1/farm/tools/fertilizer-cost.

Endpoints:
  GET    /prices                   — list all chemicals with resolved price
  PATCH  /prices/{chemicalId}      — upsert price override
  DELETE /prices/{chemicalId}      — remove price override
  POST   /calculate                — run calculation
  POST   /export                   — run calculation and return .xlsx
  POST   /import                   — parse .xlsx and return crop list
  GET    /lists                    — list saved calculation lists
  POST   /lists                    — save a new list
  PATCH  /lists/{listId}           — update a saved list
  DELETE /lists/{listId}           — delete a saved list
"""

from datetime import date, datetime
from typing import List, Optional
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import Response
from pydantic import BaseModel, Field

from src.modules.farm_manager.middleware.auth import (
    get_current_active_user,
    CurrentUser,
    require_permission,
)
from src.modules.farm_manager.models.tools.fertilizer_chemical import FertilizerChemical
from src.modules.farm_manager.models.tools.fertilizer_price import (
    PriceOverride,
    ResolvedPrice,
)
from src.modules.farm_manager.models.tools.calculation_list import (
    CalculationList,
    CalculationListCreate,
    CalculationListUpdate,
)
from src.modules.farm_manager.models.tools.calculator_request import (
    CalculateRequest,
    CalculateResponse,
    ParsedImport,
)
from src.modules.farm_manager.services.tools.chemicals_repository import (
    ChemicalsRepository,
)
from src.modules.farm_manager.services.tools.fertilizer_calculator import (
    calculate_for_crops,
)
from src.modules.farm_manager.services.tools.excel_handler import (
    build_import_template,
    export_calculation,
    import_crops,
)
from src.modules.farm_manager.services.tools.calculation_lists_repository import (
    CalculationListsRepository,
)
from src.modules.farm_manager.services.tools.price_book import PriceBook
from src.modules.farm_manager.services.database import farm_db
from src.modules.farm_manager.utils.responses import SuccessResponse

router = APIRouter(prefix="/fertilizer-cost", tags=["tools-fertilizer-cost"])

OVERRIDES_COLLECTION = "fertilizer_price_overrides"


# ---------------------------------------------------------------------------
# Request / response helpers
# ---------------------------------------------------------------------------


class PriceUpsertBody(BaseModel):
    """Request body for PATCH /prices/{chemicalId}."""

    price: float = Field(..., ge=0, description="Price in AED per defaultUnit")


class ChemicalWithPrice(BaseModel):
    """Combined chemical + resolved price for the price-book listing."""

    chemical: FertilizerChemical
    price: Optional[float]
    source: str


class PaginatedSavedLists(BaseModel):
    """Paginated saved-lists response for /lists."""

    items: List[CalculationList]
    total: int
    page: int
    size: int


# ---------------------------------------------------------------------------
# Price Book endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/prices",
    response_model=SuccessResponse[List[ChemicalWithPrice]],
    summary="Get price book",
    description="Return all non-archived chemicals with their resolved prices.",
)
async def get_prices(
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse:
    """
    Return all non-archived chemicals with their resolved prices.

    Resolution order: override → inventory → none.

    Args:
        current_user: Authenticated user.

    Returns:
        SuccessResponse with a list of {chemical, price, source} entries.
    """
    org_id = _require_org(current_user)
    chemicals = await ChemicalsRepository.list_all(org_id, include_archived=False)
    prices = await PriceBook.resolve_prices(chemicals, org_id)

    result = []
    for chemical in chemicals:
        resolved = prices.get(str(chemical.chemicalId))
        result.append(
            ChemicalWithPrice(
                chemical=chemical,
                price=resolved.price if resolved else None,
                source=resolved.source if resolved else "none",
            )
        )

    return SuccessResponse(
        data=result, message=f"{len(result)} chemical(s) in price book"
    )


@router.patch(
    "/prices/{chemical_id}",
    response_model=SuccessResponse[PriceOverride],
    summary="Upsert price override",
)
async def upsert_price(
    chemical_id: UUID,
    body: PriceUpsertBody,
    current_user: CurrentUser = Depends(require_permission("agronomist")),
) -> SuccessResponse:
    """
    Create or update a price override for a chemical.

    Args:
        chemical_id: Target chemical UUID.
        body: Price value in AED.
        current_user: Authenticated user with agronomist permission.

    Returns:
        SuccessResponse with the upserted PriceOverride.

    Raises:
        HTTPException: 404 if the chemical does not exist.
    """
    org_id = _require_org(current_user)

    # Verify chemical exists
    chemical = await ChemicalsRepository.get_by_id(chemical_id, org_id)
    if not chemical:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chemical not found",
        )

    db = farm_db.get_database()
    now = datetime.utcnow()
    override_doc = {
        "chemicalId": str(chemical_id),
        "price": body.price,
        "organizationId": str(org_id),
        "updatedBy": str(current_user.userId),
        "updatedAt": now,
    }

    # Reason: upsert on (chemicalId, organizationId) — unique index ensures one record
    result = await db[OVERRIDES_COLLECTION].find_one_and_update(
        {"chemicalId": str(chemical_id), "organizationId": str(org_id)},
        {"$set": override_doc, "$setOnInsert": {"overrideId": str(uuid4())}},
        upsert=True,
        return_document=True,
    )

    override = PriceOverride(
        overrideId=UUID(result.get("overrideId", str(uuid4()))),
        chemicalId=chemical_id,
        price=body.price,
        organizationId=org_id,
        updatedBy=UUID(current_user.userId),
        updatedAt=now,
    )
    return SuccessResponse(data=override, message="Price override saved")


@router.delete(
    "/prices/{chemical_id}",
    response_model=SuccessResponse[dict],
    summary="Remove price override",
)
async def delete_price(
    chemical_id: UUID,
    current_user: CurrentUser = Depends(require_permission("agronomist")),
) -> SuccessResponse:
    """
    Remove the manual price override for a chemical.

    After deletion the price reverts to the inventory fallback (or 'none').

    Args:
        chemical_id: Target chemical UUID.
        current_user: Authenticated user with agronomist permission.

    Returns:
        SuccessResponse confirming deletion.

    Raises:
        HTTPException: 404 if no override exists.
    """
    org_id = _require_org(current_user)
    db = farm_db.get_database()
    result = await db[OVERRIDES_COLLECTION].delete_one(
        {
            "chemicalId": str(chemical_id),
            "organizationId": str(org_id),
        }
    )
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No price override found for this chemical",
        )
    return SuccessResponse(data={"deleted": True}, message="Price override removed")


# ---------------------------------------------------------------------------
# Calculation endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/calculate",
    response_model=SuccessResponse[CalculateResponse],
    summary="Calculate fertilizer costs",
)
async def run_calculation(
    body: CalculateRequest,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse:
    """
    Run the fertilizer cost calculator.

    For each (plantDataId, points) pair, loads the plant's fertigation schedule,
    sums ingredient quantities over the full growth cycle, converts to pricing units,
    and returns costs where prices are available.

    Args:
        body: List of crop + points entries.
        current_user: Authenticated user.

    Returns:
        SuccessResponse with CalculateResponse.
    """
    org_id = _require_org(current_user)
    response = await calculate_for_crops(body.items, org_id)
    return SuccessResponse(data=response, message="Calculation complete")


@router.post(
    "/export",
    summary="Calculate and export to Excel",
    responses={
        200: {
            "content": {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {}
            },
            "description": "Returns a .xlsx file",
        }
    },
)
async def export_to_excel(
    body: CalculateRequest,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> Response:
    """
    Calculate fertilizer costs and export the result as an Excel file.

    Args:
        body: List of crop + points entries.
        current_user: Authenticated user.

    Returns:
        FastAPI Response with application/vnd.openxmlformats... content-type.
    """
    org_id = _require_org(current_user)
    calc_response = await calculate_for_crops(body.items, org_id)

    # Reason: load yieldInfo for each plantDataId in the calculation so the
    # export can include estimated yield per crop + total yield row.
    db = farm_db.get_database()
    plant_ids = [str(c.plantDataId) for c in calc_response.perCrop]
    yield_info_by_plant: dict = {}
    if plant_ids:
        cursor = db.plant_data_enhanced.find(
            {"plantDataId": {"$in": plant_ids}},
            {"plantDataId": 1, "yieldInfo": 1},
        )
        async for doc in cursor:
            yi = doc.get("yieldInfo")
            if yi:
                yield_info_by_plant[doc["plantDataId"]] = yi

    xlsx_bytes = export_calculation(calc_response, yield_info_by_plant)
    filename = f"fertilizer-cost-{date.today().isoformat()}.xlsx"

    return Response(
        content=xlsx_bytes,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/import-template",
    summary="Download sample import template",
    responses={
        200: {
            "content": {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {}
            },
            "description": "Returns a sample .xlsx with the import column layout.",
        }
    },
)
async def download_import_template(
    current_user: CurrentUser = Depends(get_current_active_user),
) -> Response:
    """
    Download a blank .xlsx template the user can fill in and re-upload via /import.

    Args:
        current_user: Authenticated user.

    Returns:
        FastAPI Response with application/vnd.openxmlformats... content-type.
    """
    _require_org(current_user)
    xlsx_bytes = build_import_template()
    return Response(
        content=xlsx_bytes,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": 'attachment; filename="fertilizer-cost-import-template.xlsx"'
        },
    )


@router.post(
    "/import",
    response_model=SuccessResponse[ParsedImport],
    summary="Import crops from Excel",
)
async def import_from_excel(
    file: UploadFile = File(
        ..., description=".xlsx file with 'Crop Name' and 'Points' columns"
    ),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse:
    """
    Parse a .xlsx file and return crop + points entries.

    Expected format:
    - First sheet
    - Header row with at least "Crop Name" and "Points" columns
    - Data rows below

    Args:
        file: Uploaded .xlsx file.
        current_user: Authenticated user (org scoping used for plant lookup).

    Returns:
        SuccessResponse with ParsedImport (items + skipped + warnings).

    Raises:
        HTTPException: 400 if the file format is invalid.
    """
    _require_org(current_user)

    file_bytes = await file.read()
    try:
        result = await import_crops(file_bytes)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    msg = f"Parsed {len(result.items)} crop(s)" + (
        f", skipped {len(result.skipped)}" if result.skipped else ""
    )
    return SuccessResponse(data=result, message=msg)


# ---------------------------------------------------------------------------
# Saved Lists endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/lists",
    response_model=SuccessResponse[PaginatedSavedLists],
    summary="List saved calculation lists (paginated, searchable)",
)
async def list_saved_lists(
    page: int = Query(1, ge=1, description="1-indexed page number"),
    size: int = Query(20, ge=1, le=200, description="Page size (max 200)"),
    search: Optional[str] = Query(
        None, description="Case-insensitive name substring filter"
    ),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse:
    """
    Return paginated saved fertilizer-cost lists for the authenticated user's org.

    Args:
        page: 1-indexed page number.
        size: Page size (1-200).
        search: Optional name substring filter (case-insensitive).
        current_user: Authenticated user.

    Returns:
        SuccessResponse with PaginatedSavedLists (items + total + page + size).
    """
    org_id = _require_org(current_user)
    items, total = await CalculationListsRepository.list_paginated(
        org_id, page=page, size=size, search=search
    )
    return SuccessResponse(
        data=PaginatedSavedLists(items=items, total=total, page=page, size=size),
        message=f"{len(items)} of {total} list(s) returned",
    )


@router.post(
    "/lists",
    response_model=SuccessResponse[CalculationList],
    status_code=status.HTTP_201_CREATED,
    summary="Save a calculation list",
)
async def create_saved_list(
    body: CalculationListCreate,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse:
    """
    Save a new fertilizer-cost calculation list.

    Args:
        body: List name and items.
        current_user: Authenticated user.

    Returns:
        SuccessResponse with the created CalculationList.
    """
    org_id = _require_org(current_user)
    calc_list = await CalculationListsRepository.create(
        body,
        organization_id=org_id,
        created_by=UUID(current_user.userId),
    )
    return SuccessResponse(data=calc_list, message="List saved")


@router.patch(
    "/lists/{list_id}",
    response_model=SuccessResponse[CalculationList],
    summary="Update a saved list",
)
async def update_saved_list(
    list_id: UUID,
    body: CalculationListUpdate,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse:
    """
    Partially update a saved calculation list.

    Args:
        list_id: Target list UUID.
        body: Fields to update.
        current_user: Authenticated user.

    Returns:
        SuccessResponse with the updated CalculationList.

    Raises:
        HTTPException: 404 if not found.
    """
    org_id = _require_org(current_user)
    updated = await CalculationListsRepository.update(list_id, org_id, body)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved list not found",
        )
    return SuccessResponse(data=updated, message="List updated")


@router.delete(
    "/lists/{list_id}",
    response_model=SuccessResponse[dict],
    summary="Delete a saved list",
)
async def delete_saved_list(
    list_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse:
    """
    Hard-delete a saved calculation list.

    Args:
        list_id: Target list UUID.
        current_user: Authenticated user.

    Returns:
        SuccessResponse confirming deletion.

    Raises:
        HTTPException: 404 if not found.
    """
    org_id = _require_org(current_user)
    deleted = await CalculationListsRepository.delete(list_id, org_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved list not found",
        )
    return SuccessResponse(data={"deleted": True}, message="List deleted")


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _require_org(user: CurrentUser) -> UUID:
    """
    Extract the organisation ID from the current user or raise 400.

    Args:
        user: Authenticated CurrentUser.

    Returns:
        Organisation UUID.

    Raises:
        HTTPException: 400 if the user has no organisation.
    """
    if not user.organizationId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User does not belong to any organisation",
        )
    return UUID(user.organizationId)
