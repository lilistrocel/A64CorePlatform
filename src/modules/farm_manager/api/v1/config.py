"""
Farm Management Module - Configuration API

Endpoints for managing system configuration including spacing standards.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional
from uuid import UUID
from datetime import datetime

from ...middleware.auth import get_current_user, CurrentUser

from ...models.spacing_standards import (
    SpacingCategory,
    SpacingStandardsConfig,
    SpacingStandardsUpdate,
    SpacingStandardsResponse,
    DEFAULT_SPACING_DENSITIES,
    calculate_plant_count,
    convert_area_to_sqm,
)
from ...services.config_service import ConfigService

router = APIRouter(prefix="/config")


# ==================== Spacing Standards Endpoints ====================

@router.get(
    "/spacing-standards",
    response_model=SpacingStandardsResponse,
    summary="Get spacing standards configuration",
    description="Retrieve the current spacing standards configuration with plant densities per category."
)
async def get_spacing_standards(
    current_user: CurrentUser = Depends(get_current_user)
):
    """Get the current spacing standards configuration."""
    config_service = ConfigService()
    config = await config_service.get_spacing_standards()
    return SpacingStandardsResponse(data=config)


@router.put(
    "/spacing-standards",
    response_model=SpacingStandardsResponse,
    summary="Update spacing standards configuration",
    description="Update the spacing standards configuration. Requires admin privileges."
)
async def update_spacing_standards(
    update_data: SpacingStandardsUpdate,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Update spacing standards configuration.

    Only users with admin or super_admin role can update this configuration.
    """
    # Check for admin privileges
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can update spacing standards"
        )

    # Validate all spacing categories are present
    valid_categories = {cat.value for cat in SpacingCategory}
    provided_categories = set(update_data.densities.keys())

    missing = valid_categories - provided_categories
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing spacing categories: {', '.join(missing)}"
        )

    extra = provided_categories - valid_categories
    if extra:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid spacing categories: {', '.join(extra)}"
        )

    # Validate all densities are positive integers
    for category, density in update_data.densities.items():
        if not isinstance(density, int) or density <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Density for '{category}' must be a positive integer"
            )

    config_service = ConfigService()
    config = await config_service.update_spacing_standards(
        densities=update_data.densities,
        user_id=UUID(current_user.userId),
        user_email=current_user.email
    )

    return SpacingStandardsResponse(
        data=config,
        message="Spacing standards updated successfully"
    )


@router.post(
    "/spacing-standards/reset",
    response_model=SpacingStandardsResponse,
    summary="Reset spacing standards to defaults",
    description="Reset spacing standards configuration to default values. Requires admin privileges."
)
async def reset_spacing_standards(
    current_user: CurrentUser = Depends(get_current_user)
):
    """Reset spacing standards to default values."""
    # Check for admin privileges
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can reset spacing standards"
        )

    config_service = ConfigService()
    config = await config_service.reset_spacing_standards(
        user_id=UUID(current_user.userId),
        user_email=current_user.email
    )

    return SpacingStandardsResponse(
        data=config,
        message="Spacing standards reset to defaults"
    )


# ==================== Plant Count Calculator Endpoint ====================

@router.get(
    "/calculate-plants",
    summary="Calculate plant count from area and spacing category",
    description="Utility endpoint to calculate the number of plants based on area and spacing category."
)
async def calculate_plants(
    area: float,
    area_unit: str = "sqm",
    spacing_category: SpacingCategory = SpacingCategory.M,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Calculate the recommended number of plants for a given area.

    Args:
        area: Area value
        area_unit: Unit of area (sqm, hectares, acres)
        spacing_category: Spacing category of the plant

    Returns:
        Recommended plant count and calculation details
    """
    # Get current spacing standards
    config_service = ConfigService()
    config = await config_service.get_spacing_standards()

    # Convert area to square meters
    area_sqm = convert_area_to_sqm(area, area_unit)

    # Calculate plant count
    plant_count = calculate_plant_count(area_sqm, spacing_category, config.densities)

    # Get density for this category
    density = config.densities.get(spacing_category.value, DEFAULT_SPACING_DENSITIES[spacing_category])

    return {
        "plantCount": plant_count,
        "area": area,
        "areaUnit": area_unit,
        "areaSqm": area_sqm,
        "spacingCategory": spacing_category.value,
        "plantsPerHundredSqm": density,
        "calculation": f"({area_sqm:.2f} / 100) × {density} = {plant_count}"
    }


# ==================== Spacing Categories Reference Endpoint ====================

@router.get(
    "/spacing-categories",
    summary="Get all spacing categories with descriptions",
    description="Get a list of all spacing categories with their default densities and descriptions."
)
async def get_spacing_categories(
    current_user: CurrentUser = Depends(get_current_user)
):
    """Get all spacing categories with their default values and descriptions."""
    # Get current configuration
    config_service = ConfigService()
    config = await config_service.get_spacing_standards()

    categories = []
    descriptions = {
        SpacingCategory.XS: "Extra Small - microgreens, herbs, dense leafy greens (~20cm × 20cm)",
        SpacingCategory.S: "Small - lettuce, spinach, leafy greens (~25cm × 25cm)",
        SpacingCategory.M: "Medium - peppers, beans, smaller vegetables (~50cm × 50cm)",
        SpacingCategory.L: "Large - tomatoes, eggplant, larger vegetables (~60cm × 90cm)",
        SpacingCategory.XL: "Extra Large - squash, melons, sprawling vines (~100cm × 100cm)",
        SpacingCategory.BUSH: "Bush - blueberries, smaller fruiting bushes (~140cm × 140cm)",
        SpacingCategory.LARGE_BUSH: "Large Bush - larger fruiting bushes (~200cm × 200cm)",
        SpacingCategory.SMALL_TREE: "Small Tree - citrus, dwarf fruit trees (~250cm × 250cm)",
        SpacingCategory.MEDIUM_TREE: "Medium Tree - apple, mango, standard fruit trees (~300cm × 300cm)",
        SpacingCategory.LARGE_TREE: "Large Tree - date palm, coconut, large trees (~500cm × 500cm)",
    }

    for cat in SpacingCategory:
        current_density = config.densities.get(cat.value, DEFAULT_SPACING_DENSITIES[cat])
        default_density = DEFAULT_SPACING_DENSITIES[cat]

        categories.append({
            "value": cat.value,
            "name": cat.name,
            "description": descriptions.get(cat, ""),
            "currentDensity": current_density,
            "defaultDensity": default_density,
            "isModified": current_density != default_density
        })

    return {
        "categories": categories,
        "lastUpdated": config.updatedAt.isoformat() if config.updatedAt else None,
        "updatedBy": config.updatedByEmail
    }
