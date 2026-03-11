"""
Industries API Endpoints

Provides metadata about supported industry types and their associated
modules. This powers the frontend industry selector and module routing.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any

from ...models.division import IndustryType
from ...models.user import UserResponse
from ...middleware.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/industries", tags=["Industries"])

# Reason: static metadata about each industry type — no database lookup required.
# When the plugin manifest is extended with industryType fields (Phase 1.5),
# this can be enriched dynamically from the plugin registry.
_INDUSTRY_METADATA: Dict[str, Dict[str, Any]] = {
    IndustryType.VEGETABLE_FRUITS: {
        "industryType": IndustryType.VEGETABLE_FRUITS,
        "label": "Vegetable & Fruits Farming",
        "description": "Multi-crop block management for vegetable and fruit operations.",
        "icon": "leaf",
    },
    IndustryType.MUSHROOM: {
        "industryType": IndustryType.MUSHROOM,
        "label": "Mushroom Farming",
        "description": "Controlled-environment mushroom cultivation and harvest tracking.",
        "icon": "mushroom",
    },
}


@router.get(
    "/",
    response_model=List[Dict[str, Any]],
    status_code=status.HTTP_200_OK,
    summary="List all industry types",
    description="Returns all supported industry types with display metadata.",
)
async def list_industries(
    current_user: UserResponse = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """
    Retrieve all available industry types.

    **Authentication:** Required (Bearer token)

    **Returns:**
    - 200: List of industry type objects with label, description, and icon

    **Example Response:**
    ```json
    [
      {
        "industryType": "vegetable_fruits",
        "label": "Vegetable & Fruits Farming",
        "description": "...",
        "icon": "leaf"
      },
      ...
    ]
    ```
    """
    return list(_INDUSTRY_METADATA.values())


@router.get(
    "/{industry_type}/modules",
    response_model=List[Dict[str, Any]],
    status_code=status.HTTP_200_OK,
    summary="Get modules for an industry type",
    description=(
        "Returns the plugin modules registered for the specified industry type. "
        "Currently returns all loaded modules until manifest extension (Phase 1.5) "
        "adds industry scoping to the plugin registry."
    ),
)
async def get_modules_for_industry(
    industry_type: IndustryType,
    current_user: UserResponse = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """
    Get modules available for a specific industry type.

    **Authentication:** Required (Bearer token)

    **Path Parameters:**
    - industry_type: One of the IndustryType enum values
      (e.g., 'vegetable_fruits', 'mushroom')

    **Returns:**
    - 200: List of module metadata objects
    - 404: Unknown industry type (handled by FastAPI enum validation)

    **Note:** Full industry-scoped module filtering will be available after
    Phase 1.5 extends the plugin manifest with industryType fields.
    Until then, this endpoint returns all loaded modules as a safe fallback.
    """
    # Reason: validate the industry type before attempting module lookup
    if industry_type not in _INDUSTRY_METADATA:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown industry type: '{industry_type}'.",
        )

    modules = _get_loaded_modules(industry_type)
    logger.debug(
        f"Returning {len(modules)} modules for industry '{industry_type}'"
    )
    return modules


def _get_loaded_modules(industry_type: IndustryType) -> List[Dict[str, Any]]:
    """
    Retrieve loaded plugin modules, optionally filtered by industry type.

    This function queries the plugin manager for currently installed modules.
    Industry-level filtering is a no-op until Phase 1.5 adds industryType to
    the plugin manifest — at that point, replace the filter stub below.

    Args:
        industry_type: The industry type to filter by (reserved for Phase 1.5).

    Returns:
        List of module metadata dicts safe for JSON serialisation.
    """
    try:
        # Reason: import here to avoid circular imports at module load time;
        # the plugin system initialises after the API router is registered.
        from ...core.plugin_system import get_plugin_manager

        pm = get_plugin_manager()
        matching = pm.get_modules_for_industry(industry_type)
        result = []
        for name, manifest in matching.items():
            result.append({
                "module_name": manifest.module_name,
                "display_name": manifest.display_name,
                "version": manifest.version,
                "description": manifest.description,
                "route_prefix": manifest.route_prefix,
                "industries": manifest.industries,
                "industry_mode": manifest.industry_mode,
            })
        return result
    except Exception as exc:
        # Reason: plugin manager may not be available in all environments (tests, etc.);
        # return an empty list rather than a 500 so the UI degrades gracefully.
        logger.warning(
            f"Could not retrieve modules from plugin manager: {exc}. "
            "Returning empty module list."
        )
        return []
