"""
Genetics Repo Module - Medium API Routes

Recipes, prepared batches, and the additive readout that answers
"what did we grow on the medium containing X".
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel

from ...models.accession import Accession
from ...models.medium import (
    Batch,
    BatchCreate,
    BatchUpdate,
    Recipe,
    RecipeCreate,
    RecipeUpdate,
)
from ...services.medium.medium_service import MediumService
from ...utils.responses import (
    PaginatedResponse,
    PaginationMeta,
    SuccessResponse,
    paginate,
)

from src.modules.farm_manager.middleware.auth import (
    CurrentUser,
    get_current_active_user,
    require_permission,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class AdditiveReadout(BaseModel):
    """Material exposed to a given additive, with the batches responsible."""
    additive: str
    accessions: List[Accession]
    batches: List[Batch]
    meta: PaginationMeta


# ===========================================================================
# Recipes
# ===========================================================================

@router.post(
    "/recipes",
    response_model=SuccessResponse[Recipe],
    status_code=status.HTTP_201_CREATED,
    summary="Create a medium recipe",
    description="Register a formulation. Additives under test are kept separate from the base ingredients.",
)
async def create_recipe(
    payload: RecipeCreate,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[Recipe]:
    recipe = await MediumService.create_recipe(payload, current_user)
    return SuccessResponse(data=recipe, message="Recipe created successfully")


@router.get(
    "/recipes",
    response_model=PaginatedResponse[Recipe],
    summary="List medium recipes",
)
async def list_recipes(
    page: int = Query(1, ge=1),
    perPage: int = Query(20, ge=1, le=100),
    type_: Optional[str] = Query(None, alias="type"),
    additive: Optional[str] = Query(None, description="Recipes containing this additive"),
    search: Optional[str] = Query(None),
    activeOnly: bool = Query(False),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> PaginatedResponse[Recipe]:
    recipes, total = await MediumService.list_recipes(
        skip=(page - 1) * perPage,
        limit=perPage,
        medium_type=type_,
        search=search,
        additive=additive,
        active_only=activeOnly,
    )
    return PaginatedResponse(data=recipes, meta=paginate(total, page, perPage))


@router.get(
    "/recipes/{recipe_id}",
    response_model=SuccessResponse[Recipe],
    summary="Get a medium recipe",
)
async def get_recipe(
    recipe_id: str,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[Recipe]:
    recipe = await MediumService.get_recipe(recipe_id)
    return SuccessResponse(data=recipe)


@router.patch(
    "/recipes/{recipe_id}",
    response_model=SuccessResponse[Recipe],
    summary="Update a medium recipe",
    description=(
        "Changing the formulation (ingredients, additives, pH, sterilisation, "
        "type) bumps the recipe version. Batches already poured keep their own "
        "snapshot and are unaffected."
    ),
)
async def update_recipe(
    recipe_id: str,
    payload: RecipeUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[Recipe]:
    recipe = await MediumService.update_recipe(recipe_id, payload)
    return SuccessResponse(data=recipe, message="Recipe updated successfully")


# ===========================================================================
# Batches
# ===========================================================================

@router.post(
    "/batches",
    response_model=SuccessResponse[Batch],
    status_code=status.HTTP_201_CREATED,
    summary="Record a prepared batch",
    description="Log one actual pour or cook, snapshotting the recipe as it stands now.",
)
async def create_batch(
    payload: BatchCreate,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[Batch]:
    batch = await MediumService.create_batch(payload, current_user)
    return SuccessResponse(data=batch, message="Batch recorded successfully")


@router.get(
    "/batches",
    response_model=PaginatedResponse[Batch],
    summary="List prepared batches",
)
async def list_batches(
    page: int = Query(1, ge=1),
    perPage: int = Query(20, ge=1, le=100),
    recipeId: Optional[str] = Query(None),
    status_: Optional[str] = Query(None, alias="status"),
    additive: Optional[str] = Query(None, description="Batches whose snapshot contains this additive"),
    search: Optional[str] = Query(None, description="Match batch code"),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> PaginatedResponse[Batch]:
    batches, total = await MediumService.list_batches(
        skip=(page - 1) * perPage,
        limit=perPage,
        recipe_id=recipeId,
        status_filter=status_,
        additive=additive,
        search=search,
    )
    return PaginatedResponse(data=batches, meta=paginate(total, page, perPage))


@router.get(
    "/batches/{batch_id}",
    response_model=SuccessResponse[Batch],
    summary="Get a prepared batch",
)
async def get_batch(
    batch_id: str,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[Batch]:
    batch = await MediumService.get_batch(batch_id)
    return SuccessResponse(data=batch)


@router.patch(
    "/batches/{batch_id}",
    response_model=SuccessResponse[Batch],
    summary="Update a prepared batch",
    description="Record QC outcomes, status changes and corrections.",
)
async def update_batch(
    batch_id: str,
    payload: BatchUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[Batch]:
    batch = await MediumService.update_batch(batch_id, payload)
    return SuccessResponse(data=batch, message="Batch updated successfully")


# ===========================================================================
# Experiment readout
# ===========================================================================

@router.get(
    "/additives/{additive_name}/accessions",
    response_model=SuccessResponse[AdditiveReadout],
    summary="Material grown on a medium containing an additive",
    description=(
        "Walks additive -> batches -> accessions. Matches against batch "
        "snapshots rather than live recipes, so an additive since removed from "
        "a recipe still returns the material that was actually exposed to it."
    ),
)
async def accessions_by_additive(
    additive_name: str,
    page: int = Query(1, ge=1),
    perPage: int = Query(50, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[AdditiveReadout]:
    accessions, total, batches = await MediumService.find_accessions_by_additive(
        additive_name,
        skip=(page - 1) * perPage,
        limit=perPage,
    )
    return SuccessResponse(
        data=AdditiveReadout(
            additive=additive_name,
            accessions=accessions,
            batches=batches,
            meta=paginate(total, page, perPage),
        )
    )
