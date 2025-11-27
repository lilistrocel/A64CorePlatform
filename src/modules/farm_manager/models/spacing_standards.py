"""
Spacing Standards Model

Defines plant spacing categories and configurable density standards.
Used for automatic plant count calculations based on area.
"""

from datetime import datetime
from enum import Enum
from typing import Dict, Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


class SpacingCategory(str, Enum):
    """
    Plant spacing categories for density calculations.

    Each category represents a standard plant spacing pattern,
    with configurable density (plants per 100 m²).
    """
    XS = "xs"                    # Extra Small - microgreens, herbs, dense leafy greens
    S = "s"                      # Small - lettuce, spinach, leafy greens
    M = "m"                      # Medium - peppers, beans, smaller vegetables
    L = "l"                      # Large - tomatoes, eggplant, larger vegetables
    XL = "xl"                    # Extra Large - squash, melons, sprawling vines
    BUSH = "bush"                # Bush plants - blueberries, smaller fruiting bushes
    LARGE_BUSH = "large_bush"    # Large bushes - larger fruiting bushes
    SMALL_TREE = "small_tree"    # Small trees - citrus, dwarf fruit trees
    MEDIUM_TREE = "medium_tree"  # Medium trees - apple, mango, standard fruit trees
    LARGE_TREE = "large_tree"    # Large trees - date palm, coconut, large trees


# Default density values (plants per 100 m²)
# Based on standard agricultural spacing recommendations
DEFAULT_SPACING_DENSITIES: Dict[SpacingCategory, int] = {
    SpacingCategory.XS: 2500,           # ~20cm x 20cm spacing
    SpacingCategory.S: 1667,            # ~25cm x 25cm spacing (e.g., Lettuce at 16.67 plants/m²)
    SpacingCategory.M: 400,             # ~50cm x 50cm spacing
    SpacingCategory.L: 185,             # ~60cm x 90cm spacing (e.g., Tomato at 1.85 plants/m²)
    SpacingCategory.XL: 100,            # ~100cm x 100cm spacing
    SpacingCategory.BUSH: 50,           # ~140cm x 140cm spacing
    SpacingCategory.LARGE_BUSH: 25,     # ~200cm x 200cm spacing
    SpacingCategory.SMALL_TREE: 16,     # ~250cm x 250cm spacing
    SpacingCategory.MEDIUM_TREE: 10,    # ~300cm x 300cm spacing
    SpacingCategory.LARGE_TREE: 4,      # ~500cm x 500cm spacing
}


class SpacingDensity(BaseModel):
    """Single spacing density configuration"""
    category: SpacingCategory = Field(..., description="Spacing category")
    plantsPerHundredSqm: int = Field(..., gt=0, description="Number of plants per 100 m²")
    description: Optional[str] = Field(None, description="Optional description for this spacing")


class SpacingStandardsConfig(BaseModel):
    """
    System configuration for spacing standards.

    Stored in the system_config collection with configType='spacing_standards'.
    """
    configId: UUID = Field(default_factory=uuid4, description="Unique configuration identifier")
    configType: str = Field("spacing_standards", description="Configuration type identifier")

    # Density configurations for each category
    densities: Dict[str, int] = Field(
        default_factory=lambda: {cat.value: density for cat, density in DEFAULT_SPACING_DENSITIES.items()},
        description="Plants per 100 m² for each spacing category"
    )

    # Metadata
    updatedAt: datetime = Field(default_factory=datetime.utcnow, description="Last update timestamp")
    updatedBy: Optional[UUID] = Field(None, description="User who last updated")
    updatedByEmail: Optional[str] = Field(None, description="Email of user who last updated")

    class Config:
        json_schema_extra = {
            "example": {
                "configId": "c1234567-89ab-cdef-0123-456789abcdef",
                "configType": "spacing_standards",
                "densities": {
                    "xs": 2500,
                    "s": 1667,
                    "m": 400,
                    "l": 185,
                    "xl": 100,
                    "bush": 50,
                    "large_bush": 25,
                    "small_tree": 16,
                    "medium_tree": 10,
                    "large_tree": 4
                },
                "updatedAt": "2025-11-27T10:00:00Z",
                "updatedBy": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "updatedByEmail": "admin@example.com"
            }
        }


class SpacingStandardsUpdate(BaseModel):
    """Schema for updating spacing standards"""
    densities: Dict[str, int] = Field(
        ...,
        description="Plants per 100 m² for each spacing category"
    )


class SpacingStandardsResponse(BaseModel):
    """Response for spacing standards"""
    data: SpacingStandardsConfig
    message: Optional[str] = None


def calculate_plant_count(
    area_sqm: float,
    spacing_category: SpacingCategory,
    densities: Optional[Dict[str, int]] = None
) -> int:
    """
    Calculate the number of plants based on area and spacing category.

    Args:
        area_sqm: Area in square meters
        spacing_category: The spacing category of the plant
        densities: Optional custom density configuration. Uses defaults if not provided.

    Returns:
        Number of plants (rounded down to nearest integer)
    """
    if densities is None:
        densities = {cat.value: density for cat, density in DEFAULT_SPACING_DENSITIES.items()}

    plants_per_100sqm = densities.get(spacing_category.value, DEFAULT_SPACING_DENSITIES[spacing_category])

    # Calculate: (area_sqm / 100) * plants_per_100sqm
    plant_count = (area_sqm / 100) * plants_per_100sqm

    return max(1, int(plant_count))  # At least 1 plant


def convert_area_to_sqm(area: float, unit: str) -> float:
    """
    Convert area from various units to square meters.

    Args:
        area: Area value
        unit: Unit of measurement (sqm, hectares, acres)

    Returns:
        Area in square meters
    """
    unit_lower = unit.lower()

    if unit_lower in ('sqm', 'sq_m', 'square_meters', 'm2', 'm²'):
        return area
    elif unit_lower in ('hectares', 'ha', 'hectare'):
        return area * 10000  # 1 hectare = 10,000 m²
    elif unit_lower in ('acres', 'acre'):
        return area * 4046.86  # 1 acre ≈ 4,046.86 m²
    else:
        # Default to sqm if unknown unit
        return area


# Mapping from plant types to suggested spacing categories
# This helps auto-suggest a spacing category when creating plant data
PLANT_TYPE_SPACING_SUGGESTIONS: Dict[str, SpacingCategory] = {
    # Leafy greens
    "leafy_green": SpacingCategory.S,
    "leafy green": SpacingCategory.S,
    "lettuce": SpacingCategory.S,
    "spinach": SpacingCategory.S,

    # Herbs
    "herb": SpacingCategory.XS,
    "herbs": SpacingCategory.XS,
    "microgreen": SpacingCategory.XS,
    "microgreens": SpacingCategory.XS,

    # Vegetables
    "vegetable": SpacingCategory.M,
    "pepper": SpacingCategory.M,
    "bean": SpacingCategory.M,
    "crop": SpacingCategory.M,

    # Larger vegetables
    "tomato": SpacingCategory.L,
    "eggplant": SpacingCategory.L,

    # Vining/sprawling
    "squash": SpacingCategory.XL,
    "melon": SpacingCategory.XL,
    "cucumber": SpacingCategory.XL,

    # Berries
    "berry": SpacingCategory.BUSH,
    "blueberry": SpacingCategory.BUSH,
    "strawberry": SpacingCategory.S,  # Strawberries are more densely planted

    # Trees
    "citrus": SpacingCategory.SMALL_TREE,
    "fruit_tree": SpacingCategory.MEDIUM_TREE,
    "tree": SpacingCategory.MEDIUM_TREE,
    "palm": SpacingCategory.LARGE_TREE,
}


def suggest_spacing_category(plant_name: str, plant_type: Optional[str] = None) -> SpacingCategory:
    """
    Suggest a spacing category based on plant name or type.

    Args:
        plant_name: Name of the plant
        plant_type: Optional plant type

    Returns:
        Suggested SpacingCategory (defaults to M if no match)
    """
    # Check plant name first
    name_lower = plant_name.lower()
    for keyword, category in PLANT_TYPE_SPACING_SUGGESTIONS.items():
        if keyword in name_lower:
            return category

    # Check plant type if provided
    if plant_type:
        type_lower = plant_type.lower()
        for keyword, category in PLANT_TYPE_SPACING_SUGGESTIONS.items():
            if keyword in type_lower:
                return category

    # Default to Medium
    return SpacingCategory.M
