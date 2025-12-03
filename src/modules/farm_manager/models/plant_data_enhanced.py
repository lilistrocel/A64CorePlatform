"""
Enhanced Plant Data Model

Comprehensive agronomic knowledge base for plant cultivation.
Maintains backward compatibility with existing plant_data.py schema.
"""

from datetime import datetime
from typing import Optional, List, Literal
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, field_validator
from enum import Enum

# Import spacing category from spacing_standards module
from .spacing_standards import SpacingCategory


# ==================== Enums and Type Definitions ====================

class FarmTypeEnum(str, Enum):
    """Supported farm types"""
    OPEN_FIELD = "open_field"
    HYDROPONIC = "hydroponic"
    GREENHOUSE = "greenhouse"
    VERTICAL_FARM = "vertical_farm"
    AQUAPONIC = "aquaponic"


class GrowthStageEnum(str, Enum):
    """Plant growth stages"""
    GERMINATION = "germination"
    VEGETATIVE = "vegetative"
    FLOWERING = "flowering"
    FRUITING = "fruiting"
    HARVEST = "harvest"


class ToleranceLevelEnum(str, Enum):
    """Generic tolerance levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class SeverityLevelEnum(str, Enum):
    """Severity levels for diseases/pests"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class LightTypeEnum(str, Enum):
    """Light type requirements"""
    FULL_SUN = "full_sun"
    PARTIAL_SHADE = "partial_shade"
    FULL_SHADE = "full_shade"
    FILTERED_LIGHT = "filtered_light"


class WaterTypeEnum(str, Enum):
    """Water type options"""
    TAP = "tap"
    FILTERED = "filtered"
    RO = "ro"  # Reverse Osmosis
    RAINWATER = "rainwater"
    DISTILLED = "distilled"


class SoilTypeEnum(str, Enum):
    """Soil type classifications"""
    LOAMY = "loamy"
    SANDY = "sandy"
    CLAY = "clay"
    SILTY = "silty"
    PEATY = "peaty"
    CHALKY = "chalky"


class GrowthHabitEnum(str, Enum):
    """Plant growth habit types"""
    DETERMINATE = "determinate"
    INDETERMINATE = "indeterminate"
    BUSH = "bush"
    VINE = "vine"
    CLIMBING = "climbing"
    SPREADING = "spreading"


class SupportTypeEnum(str, Enum):
    """Plant support requirements"""
    NONE = "none"
    TRELLIS = "trellis"
    STAKES = "stakes"
    CAGE = "cage"
    NET = "net"
    POLE = "pole"


# ==================== Sub-document Models ====================

class GrowthCycleDuration(BaseModel):
    """Detailed growth cycle breakdown"""
    germinationDays: int = Field(..., ge=0, description="Days for seed germination")
    vegetativeDays: int = Field(..., ge=0, description="Days of vegetative growth")
    floweringDays: int = Field(0, ge=0, description="Days of flowering stage (0 if not applicable)")
    fruitingDays: int = Field(0, ge=0, description="Days of fruiting stage (0 if not applicable)")
    harvestDurationDays: int = Field(..., ge=0, description="Duration of harvest period in days")
    totalCycleDays: int = Field(..., gt=0, description="Total growth cycle from seed to harvest")

    @field_validator('totalCycleDays')
    @classmethod
    def validate_total_cycle(cls, v, info):
        """Validate that total cycle matches sum of stages"""
        if info.data:
            calculated_total = (
                info.data.get('germinationDays', 0) +
                info.data.get('vegetativeDays', 0) +
                info.data.get('floweringDays', 0) +
                info.data.get('fruitingDays', 0) +
                info.data.get('harvestDurationDays', 0)
            )
            if calculated_total > 0 and v != calculated_total:
                # Allow manual override but warn in validation
                pass
        return v


class YieldInfo(BaseModel):
    """Yield and waste information"""
    yieldPerPlant: float = Field(..., gt=0, description="Expected yield per plant")
    yieldUnit: str = Field(..., description="Unit of measurement (kg, lbs, units, etc.)")
    expectedWastePercentage: float = Field(0, ge=0, le=100, description="Expected waste/loss percentage")


class TemperatureRange(BaseModel):
    """Temperature requirements"""
    minCelsius: float = Field(..., description="Minimum temperature in Celsius")
    maxCelsius: float = Field(..., description="Maximum temperature in Celsius")
    optimalCelsius: float = Field(..., description="Optimal temperature in Celsius")

    @field_validator('optimalCelsius')
    @classmethod
    def validate_optimal(cls, v, info):
        """Ensure optimal is within min-max range"""
        if info.data:
            min_temp = info.data.get('minCelsius')
            max_temp = info.data.get('maxCelsius')
            if min_temp is not None and max_temp is not None:
                if not (min_temp <= v <= max_temp):
                    raise ValueError(f"Optimal temperature must be between {min_temp} and {max_temp}")
        return v


class HumidityRange(BaseModel):
    """Humidity requirements"""
    minPercentage: float = Field(..., ge=0, le=100, description="Minimum humidity percentage")
    maxPercentage: float = Field(..., ge=0, le=100, description="Maximum humidity percentage")
    optimalPercentage: float = Field(..., ge=0, le=100, description="Optimal humidity percentage")


class EnvironmentalRequirements(BaseModel):
    """Complete environmental requirements"""
    temperature: TemperatureRange
    humidity: Optional[HumidityRange] = Field(None, description="Humidity requirements")
    co2RequirementPpm: Optional[int] = Field(None, ge=0, description="CO2 requirement in PPM (for greenhouse/indoor)")
    airCirculation: Optional[str] = Field(None, description="Air circulation requirements (e.g., 'moderate', 'high')")


class WateringRequirements(BaseModel):
    """Watering specifications"""
    frequencyDays: int = Field(..., gt=0, description="Days between watering")
    waterType: WaterTypeEnum = Field(WaterTypeEnum.TAP, description="Preferred water type")
    amountPerPlantLiters: Optional[float] = Field(None, gt=0, description="Water amount per plant per watering (liters)")
    droughtTolerance: ToleranceLevelEnum = Field(ToleranceLevelEnum.MEDIUM, description="Drought tolerance level")
    notes: Optional[str] = Field(None, description="Additional watering notes")


class PHRequirements(BaseModel):
    """pH range requirements"""
    minPH: float = Field(..., ge=0, le=14, description="Minimum pH")
    maxPH: float = Field(..., ge=0, le=14, description="Maximum pH")
    optimalPH: float = Field(..., ge=0, le=14, description="Optimal pH")


class SoilRequirements(BaseModel):
    """Soil and nutrient requirements"""
    phRequirements: PHRequirements
    soilTypes: List[SoilTypeEnum] = Field(..., description="Recommended soil types")
    nutrientsRecommendations: Optional[str] = Field(None, description="Soil nutrient recommendations (N, P, K, Ca, Mg, etc.)")
    ecRangeMs: Optional[str] = Field(None, description="EC range in mS/cm (for hydroponics, e.g., '1.5-2.5')")
    tdsRangePpm: Optional[str] = Field(None, description="TDS range in PPM (for hydroponics, e.g., '1000-1500')")
    notes: Optional[str] = Field(None, description="Additional soil requirements")


class DiseaseOrPest(BaseModel):
    """Disease or pest information"""
    name: str = Field(..., description="Disease or pest name")
    symptoms: str = Field(..., description="Visible symptoms")
    preventionMeasures: str = Field(..., description="Prevention strategies")
    treatmentOptions: str = Field(..., description="Treatment options")
    severity: SeverityLevelEnum = Field(..., description="Potential severity level")


class LightRequirements(BaseModel):
    """Light and photoperiod requirements"""
    lightType: LightTypeEnum = Field(..., description="Type of light required")
    minHoursDaily: float = Field(..., ge=0, le=24, description="Minimum daily light hours")
    maxHoursDaily: float = Field(..., ge=0, le=24, description="Maximum daily light hours")
    optimalHoursDaily: float = Field(..., ge=0, le=24, description="Optimal daily light hours")
    intensityLux: Optional[int] = Field(None, ge=0, description="Light intensity in Lux (for indoor)")
    intensityPpfd: Optional[int] = Field(None, ge=0, description="Light intensity in PPFD (for indoor)")
    photoperiodSensitive: bool = Field(False, description="Whether plant is photoperiod sensitive")
    notes: Optional[str] = Field(None, description="Additional light requirement notes")


class QualityGrade(BaseModel):
    """Quality grading standards"""
    gradeName: str = Field(..., description="Grade name (A, B, C, Premium, Standard, etc.)")
    sizeRequirements: Optional[str] = Field(None, description="Size requirements for this grade")
    colorRequirements: Optional[str] = Field(None, description="Color requirements for this grade")
    defectTolerance: Optional[str] = Field(None, description="Allowable defect tolerance")
    otherCriteria: Optional[str] = Field(None, description="Other quality criteria")
    priceMultiplier: Optional[float] = Field(None, ge=0, description="Price multiplier vs base grade (1.0 = base)")


class EconomicsAndLabor(BaseModel):
    """Economic and labor information"""
    averageMarketValuePerKg: Optional[float] = Field(None, gt=0, description="Average market value per kg")
    currency: str = Field("USD", description="Currency code (USD, EUR, etc.)")
    totalManHoursPerPlant: float = Field(..., ge=0, description="Total labor hours per plant (full lifecycle)")
    plantingHours: Optional[float] = Field(None, ge=0, description="Labor hours for planting per plant")
    maintenanceHours: Optional[float] = Field(None, ge=0, description="Labor hours for maintenance per plant")
    harvestingHours: Optional[float] = Field(None, ge=0, description="Labor hours for harvesting per plant")
    notes: Optional[str] = Field(None, description="Additional economic notes")


class SpacingRequirements(BaseModel):
    """Plant spacing requirements"""
    betweenPlantsCm: float = Field(..., gt=0, description="Spacing between plants in centimeters")
    betweenRowsCm: float = Field(..., gt=0, description="Spacing between rows in centimeters")
    plantsPerSquareMeter: Optional[float] = Field(None, gt=0, description="Calculated plants per square meter")


class AdditionalInformation(BaseModel):
    """Additional agronomic information"""
    growthHabit: GrowthHabitEnum = Field(..., description="Growth habit type")
    spacing: SpacingRequirements
    supportRequirements: SupportTypeEnum = Field(SupportTypeEnum.NONE, description="Support structure needed")
    companionPlants: Optional[List[str]] = Field(None, description="Beneficial companion plants")
    incompatiblePlants: Optional[List[str]] = Field(None, description="Plants to avoid planting nearby")
    notes: Optional[str] = Field(None, description="Additional cultivation notes")


# ==================== Main Plant Data Models ====================

class PlantDataEnhancedBase(BaseModel):
    """Enhanced base plant data fields with comprehensive agronomic information"""

    # ===== 1. Basic Information =====
    plantName: str = Field(..., min_length=1, max_length=200, description="Common plant name")
    scientificName: Optional[str] = Field(None, description="Scientific species name")
    farmTypeCompatibility: List[FarmTypeEnum] = Field(..., description="Compatible farm types")

    # ===== 2. Growth Cycle Durations =====
    growthCycle: GrowthCycleDuration = Field(..., description="Detailed growth cycle breakdown")

    # ===== 3. Yield & Waste =====
    yieldInfo: YieldInfo = Field(..., description="Yield and waste information")

    # ===== 4. Environmental Requirements =====
    environmentalRequirements: EnvironmentalRequirements = Field(..., description="Environmental conditions")

    # ===== 5. Watering Requirements =====
    wateringRequirements: WateringRequirements = Field(..., description="Watering specifications")

    # ===== 6. pH & Soil Requirements =====
    soilRequirements: SoilRequirements = Field(..., description="Soil and pH requirements")

    # ===== 7. Disease & Pest Management =====
    diseasesAndPests: List[DiseaseOrPest] = Field(
        default_factory=list,
        description="Known diseases and pests"
    )

    # ===== 8. Light Requirements =====
    lightRequirements: LightRequirements = Field(..., description="Light and photoperiod requirements")

    # ===== 9. Grading Standards =====
    gradingStandards: List[QualityGrade] = Field(
        default_factory=list,
        description="Quality grading standards"
    )

    # ===== 10. Economics & Labor =====
    economicsAndLabor: EconomicsAndLabor = Field(..., description="Economic and labor information")

    # ===== 11. Additional Information =====
    additionalInfo: AdditionalInformation = Field(..., description="Additional agronomic details")

    # ===== 12. Spacing Category =====
    spacingCategory: Optional[SpacingCategory] = Field(
        None,
        description="Spacing category for quick density calculations (xs, s, m, l, xl, bush, large_bush, small_tree, medium_tree, large_tree). Overrides additionalInfo.spacing.plantsPerSquareMeter if set."
    )

    # ===== 15. Data Attribution =====
    contributor: Optional[str] = Field(
        None,
        max_length=100,
        description="Name of the agronomist or contributor who provided this data"
    )
    targetRegion: Optional[str] = Field(
        None,
        max_length=100,
        description="Geographic region where this data was tested and is most applicable (e.g., 'UAE', 'Mediterranean')"
    )

    # ===== Search & Organization =====
    tags: Optional[List[str]] = Field(None, description="Search tags (vegetable, fruit, summer, etc.)")


class PlantDataEnhancedCreate(PlantDataEnhancedBase):
    """Schema for creating new enhanced plant data"""
    pass


class PlantDataEnhancedUpdate(BaseModel):
    """Schema for updating enhanced plant data - all fields optional"""
    plantName: Optional[str] = Field(None, min_length=1, max_length=200)
    scientificName: Optional[str] = None
    farmTypeCompatibility: Optional[List[FarmTypeEnum]] = None
    growthCycle: Optional[GrowthCycleDuration] = None
    yieldInfo: Optional[YieldInfo] = None
    environmentalRequirements: Optional[EnvironmentalRequirements] = None
    wateringRequirements: Optional[WateringRequirements] = None
    soilRequirements: Optional[SoilRequirements] = None
    diseasesAndPests: Optional[List[DiseaseOrPest]] = None
    lightRequirements: Optional[LightRequirements] = None
    gradingStandards: Optional[List[QualityGrade]] = None
    economicsAndLabor: Optional[EconomicsAndLabor] = None
    additionalInfo: Optional[AdditionalInformation] = None
    spacingCategory: Optional[SpacingCategory] = None
    contributor: Optional[str] = Field(None, max_length=100)
    targetRegion: Optional[str] = Field(None, max_length=100)
    tags: Optional[List[str]] = None
    isActive: Optional[bool] = Field(None, description="Whether this plant data is active and available for use")


class PlantDataEnhanced(PlantDataEnhancedBase):
    """Complete enhanced plant data model with metadata"""

    # Unique identifier (UUID for security)
    plantDataId: UUID = Field(default_factory=uuid4, description="Unique plant data identifier (UUID v4)")

    # Versioning (for freezing data when used in planting plans)
    dataVersion: int = Field(1, description="Data version number (increment on updates)")

    # Active status (only active plants shown in dropdowns for planting)
    isActive: bool = Field(True, description="Whether this plant data is active and available for use in planting")

    # Audit fields
    createdBy: UUID = Field(..., description="User ID who created this data")
    createdByEmail: str = Field(..., description="Email of creator for audit trail")
    createdAt: datetime = Field(default_factory=datetime.utcnow, description="Creation timestamp (UTC)")
    updatedAt: datetime = Field(default_factory=datetime.utcnow, description="Last update timestamp (UTC)")

    # Soft delete support
    deletedAt: Optional[datetime] = Field(None, description="Soft delete timestamp (UTC)")

    class Config:
        json_schema_extra = {
            "example": {
                "plantDataId": "d1234567-89ab-cdef-0123-456789abcdef",
                "plantName": "Tomato",
                "scientificName": "Solanum lycopersicum",
                "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
                "growthCycle": {
                    "germinationDays": 7,
                    "vegetativeDays": 30,
                    "floweringDays": 14,
                    "fruitingDays": 35,
                    "harvestDurationDays": 14,
                    "totalCycleDays": 100
                },
                "yieldInfo": {
                    "yieldPerPlant": 5.0,
                    "yieldUnit": "kg",
                    "expectedWastePercentage": 10
                },
                "dataVersion": 1,
                "createdBy": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "createdByEmail": "agronomist@example.com",
                "createdAt": "2025-01-10T10:00:00Z",
                "updatedAt": "2025-01-10T10:00:00Z",
                "deletedAt": None
            }
        }


# ==================== Backward Compatibility Layer ====================

class PlantDataLegacy(BaseModel):
    """
    Legacy plant data model for backward compatibility.
    Maps to the original plant_data.py structure.
    """
    plantDataId: UUID = Field(default_factory=uuid4)
    plantName: str
    scientificName: Optional[str] = None
    plantType: str
    growthCycleDays: int
    minTemperatureCelsius: Optional[float] = None
    maxTemperatureCelsius: Optional[float] = None
    optimalPHMin: Optional[float] = None
    optimalPHMax: Optional[float] = None
    wateringFrequencyDays: Optional[int] = None
    sunlightHoursDaily: Optional[str] = None
    expectedYieldPerPlant: float
    yieldUnit: str
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    dataVersion: int = 1
    createdBy: UUID
    createdByEmail: str
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    @classmethod
    def from_enhanced(cls, enhanced: PlantDataEnhanced) -> "PlantDataLegacy":
        """Convert enhanced model to legacy format"""
        return cls(
            plantDataId=enhanced.plantDataId,
            plantName=enhanced.plantName,
            scientificName=enhanced.scientificName,
            plantType=enhanced.farmTypeCompatibility[0] if enhanced.farmTypeCompatibility else "unknown",
            growthCycleDays=enhanced.growthCycle.totalCycleDays,
            minTemperatureCelsius=enhanced.environmentalRequirements.temperature.minCelsius,
            maxTemperatureCelsius=enhanced.environmentalRequirements.temperature.maxCelsius,
            optimalPHMin=enhanced.soilRequirements.phRequirements.minPH,
            optimalPHMax=enhanced.soilRequirements.phRequirements.maxPH,
            wateringFrequencyDays=enhanced.wateringRequirements.frequencyDays,
            sunlightHoursDaily=f"{enhanced.lightRequirements.minHoursDaily}-{enhanced.lightRequirements.maxHoursDaily}",
            expectedYieldPerPlant=enhanced.yieldInfo.yieldPerPlant,
            yieldUnit=enhanced.yieldInfo.yieldUnit,
            notes=enhanced.additionalInfo.notes,
            tags=enhanced.tags,
            dataVersion=enhanced.dataVersion,
            createdBy=enhanced.createdBy,
            createdByEmail=enhanced.createdByEmail,
            createdAt=enhanced.createdAt,
            updatedAt=enhanced.updatedAt
        )
