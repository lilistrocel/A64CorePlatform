"""
PlantMother API Routes (Plant Library Phase 2)

Endpoints for managing mother plants (products) and creating varieties
(plant_data_enhanced docs) underneath them. See models/plant_mother.py's
module docstring for the mother/variety hierarchy this belongs to.

Variety listing/get/update/delete for EXISTING varieties (not creation)
still live on the /plant-data-enhanced router (plant_data_enhanced.py) —
this router only adds the mother-scoped variety-creation endpoint and the
"list varieties by mother" convenience endpoint; it does not duplicate the
rest of that router's CRUD.
"""

from fastapi import APIRouter, Depends, Query, status
from typing import List, Optional
from uuid import UUID

from ...models.plant_mother import (
    PlantMother,
    PlantMotherCreate,
    PlantMotherUpdate,
    PlantMotherWithVarietyCount,
    PlantMotherWithVarieties,
    VarietyCreateForMother,
)
from ...models.plant_data_enhanced import PlantDataEnhanced
from ...services.plant_data import PlantMotherService
from ...middleware.auth import get_current_active_user, CurrentUser, require_permission
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

router = APIRouter(prefix="/plant-mothers", tags=["plant-mothers"])


@router.post(
    "",
    response_model=SuccessResponse[PlantMother],
    status_code=status.HTTP_201_CREATED,
    summary="Create a mother plant (product)",
)
async def create_mother(
    mother_data: PlantMotherCreate,
    current_user: CurrentUser = Depends(require_permission("agronomist")),
):
    """
    Create a new mother plant (product) — the top level of the Plant
    Library hierarchy that harvest/inventory/sales roll up to.

    Requires **agronomist** permission.

    **Validations**:
    - `plantName` must be unique among mother plants
    """
    mother = await PlantMotherService.create_mother(
        mother_data,
        UUID(current_user.userId),
        current_user.email,
        organization_id=current_user.organizationId,
    )
    return SuccessResponse(data=mother, message="Mother plant created successfully")


@router.get(
    "",
    response_model=PaginatedResponse[PlantMotherWithVarietyCount],
    summary="List mother plants (products)",
)
async def list_mothers(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(
        None, description="Text search on plantName/scientificName"
    ),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """
    List mother plants (products), excluding soft-deleted, each annotated
    with `varietyCount` — the number of active varieties under it.

    Org-scoped: when the current user belongs to an organization, only
    mothers in that organization are returned.
    """
    mothers, total, total_pages = await PlantMotherService.list_mothers(
        page=page,
        per_page=perPage,
        search=search,
        organization_id=current_user.organizationId,
    )
    return PaginatedResponse(
        data=mothers,
        meta=PaginationMeta(
            total=total, page=page, perPage=perPage, totalPages=total_pages
        ),
    )


@router.get(
    "/{plant_mother_id}",
    response_model=SuccessResponse[PlantMotherWithVarieties],
    summary="Get a mother plant by ID",
)
async def get_mother(
    plant_mother_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """
    Get a mother plant by ID, with its active varieties embedded
    (lightweight summary — plantDataId/varietyName/isActive only; fetch
    each variety's full record via GET /plant-data-enhanced/{plantDataId}
    if needed).
    """
    mother = await PlantMotherService.get_mother(plant_mother_id)
    return SuccessResponse(data=mother)


@router.patch(
    "/{plant_mother_id}",
    response_model=SuccessResponse[PlantMother],
    summary="Update a mother plant (product)",
)
async def update_mother(
    plant_mother_id: UUID,
    update_data: PlantMotherUpdate,
    current_user: CurrentUser = Depends(require_permission("agronomist")),
):
    """
    Update a mother plant's plantName/scientificName/plantType/isActive.

    Requires **agronomist** permission.

    **Cascade**: renaming plantName and/or scientificName pushes the new
    values down onto every one of this mother's varieties
    (plant_data_enhanced.plantName/scientificName) and onto the
    denormalized productName carried by blocks/block_archives that
    reference this product — so downstream display never freezes on a
    stale product name.
    """
    mother = await PlantMotherService.update_mother(plant_mother_id, update_data)
    return SuccessResponse(data=mother, message="Mother plant updated successfully")


@router.delete(
    "/{plant_mother_id}",
    response_model=SuccessResponse[dict],
    summary="Delete a mother plant (product)",
)
async def delete_mother(
    plant_mother_id: UUID,
    current_user: CurrentUser = Depends(require_permission("agronomist")),
):
    """
    Soft-delete a mother plant.

    Requires **agronomist** permission.

    **Guard**: refuses with 409 if the mother still has active varieties —
    remove or deactivate them first. This endpoint never cascade-deletes
    varieties.
    """
    await PlantMotherService.delete_mother(plant_mother_id)
    return SuccessResponse(
        data={"plantMotherId": str(plant_mother_id)},
        message="Mother plant deleted successfully",
    )


@router.get(
    "/{plant_mother_id}/varieties",
    response_model=SuccessResponse[List[PlantDataEnhanced]],
    summary="List active varieties under a mother plant",
)
async def list_varieties(
    plant_mother_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """
    List active varieties (full plant_data_enhanced records) belonging to
    a mother plant. Unpaginated, matching the
    `GET /plant-data-enhanced/active` dropdown-listing convention — a
    single mother is not expected to have more varieties than fit in one
    response.
    """
    varieties = await PlantMotherService.list_varieties(plant_mother_id)
    return SuccessResponse(data=varieties)


@router.post(
    "/{plant_mother_id}/varieties",
    response_model=SuccessResponse[PlantDataEnhanced],
    status_code=status.HTTP_201_CREATED,
    summary="Create a variety under a mother plant",
)
async def create_variety(
    plant_mother_id: UUID,
    variety_data: VarietyCreateForMother,
    current_user: CurrentUser = Depends(require_permission("agronomist")),
):
    """
    Create a new variety (cultivation recipe) under a mother plant.

    Requires **agronomist** permission.

    **Basic info inheritance**: `plantName`/`scientificName` are inherited
    from the mother identified by `plant_mother_id` — they are ignored if
    present in the request body. Only `varietyName` (required, unique
    within this mother) plus the detailed cultivation fields (growth cycle,
    yield, environmental/watering/soil/light requirements, fertigation
    schedule, etc. — same shape as `POST /plant-data-enhanced`) are taken
    from the request.

    **Validations**:
    - Mother plant must exist and not be soft-deleted
    - `varietyName` must be unique within this mother
    - Same detail-field validations as `POST /plant-data-enhanced`
      (growth cycle stage totals, temperature/humidity/pH ranges)
    """
    variety = await PlantMotherService.create_variety_for_mother(
        plant_mother_id,
        variety_data,
        UUID(current_user.userId),
        current_user.email,
    )
    return SuccessResponse(
        data=variety,
        message=f"Variety '{variety_data.varietyName}' created successfully",
    )
