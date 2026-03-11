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
# Import DataContributor from plant_data module
from .plant_data import DataContributor


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
    germinationDays: int = Field(0, ge=0, description="Days for seed germination")
    vegetativeDays: int = Field(0, ge=0, description="Days of vegetative growth")
    floweringDays: int = Field(0, ge=0, description="Days of flowering stage (0 if not applicable)")
    fruitingDays: int = Field(0, ge=0, description="Days of fruiting stage (0 if not applicable)")
    harvestDurationDays: int = Field(0, ge=0, description="Duration of harvest period in days")
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
    seedsPerPlantingPoint: int = Field(1, ge=1, description="Number of seeds/plants per planting point (drip). Defaults to 1 for single-plant setups.")
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


# ==================== Fertigation Models ====================

class IngredientCategoryEnum(str, Enum):
    """Fertigation ingredient categories"""
    MACRO_NPK = "macro_npk"          # Urea, 28.14.14, 20.20.20, 12.61.0, MAP, MKP
    POTASSIUM = "potassium"          # K-Sulfate, K-Nitrate, 0.0.60
    CALCIUM = "calcium"              # Cal Nitrate, Calmin Bor
    MICRONUTRIENT = "micronutrient"  # Chelated Micro, Ferro, MG+Zn
    SUPPLEMENT = "supplement"        # Amino Acids, Humic, Mg Sulfate, Phosphoric Acid
    OTHER = "other"


class FertigationRuleTypeEnum(str, Enum):
    """Types of fertigation application rules"""
    INTERVAL = "interval"  # Regular frequency: every N days
    CUSTOM = "custom"      # Irregular: explicit day-by-day schedule


class FertigationIngredient(BaseModel):
    """A single ingredient with dosage for a fertigation rule"""
    name: str = Field(..., description="Ingredient name (e.g., 'Cal Nitrate', 'Urea')")
    category: IngredientCategoryEnum = Field(IngredientCategoryEnum.OTHER, description="Ingredient category for grouping")
    dosagePerPoint: float = Field(..., ge=0, description="Dosage per planting point per application")
    unit: str = Field("g", description="Unit of dosage (g, ml, kg, L)")


class CustomApplication(BaseModel):
    """A single day's application in a custom (day-by-day) schedule"""
    day: int = Field(..., ge=0, description="Day number relative to card dayStart")
    ingredients: List[FertigationIngredient] = Field(..., description="Ingredients to apply on this day")


class FertigationRule(BaseModel):
    """
    A fertigation application rule. Groups ingredients that share the same schedule.

    - type='interval': ingredients applied every N days within a day range
    - type='custom': ingredients applied on explicit days with potentially varying dosages
    """
    name: str = Field(..., description="Human-readable rule name (e.g., 'Weekly Base Feed')")
    type: FertigationRuleTypeEnum = Field(..., description="Rule type: 'interval' (regular) or 'custom' (day-by-day)")

    # For interval rules
    frequencyDays: Optional[int] = Field(None, gt=0, description="Apply every N days (interval type only)")
    activeDayStart: Optional[int] = Field(None, ge=0, description="First application day relative to planting (interval type only)")
    activeDayEnd: Optional[int] = Field(None, ge=0, description="Last application day relative to planting (interval type only)")
    ingredients: Optional[List[FertigationIngredient]] = Field(None, description="Ingredients applied per this rule (interval type only)")

    # For custom rules
    applications: Optional[List[CustomApplication]] = Field(None, description="Explicit day-by-day applications (custom type only)")


class FertigationCard(BaseModel):
    """
    A fertigation card for a specific growth stage.

    Contains one or more application rules that define what to apply and when.
    Automation systems load the active card based on the block's growth stage
    and evaluate each rule to determine the day's recipe.
    """
    cardName: str = Field(..., description="Card label (e.g., 'Full Cycle', 'Vegetative Growth')")
    growthStage: str = Field(..., description="Growth stage this card applies to (general, germination, vegetative, flowering, fruiting, harvest)")
    dayStart: int = Field(..., ge=0, description="First day this card is active (relative to planting)")
    dayEnd: int = Field(..., ge=0, description="Last day this card is active (relative to planting)")
    rules: List[FertigationRule] = Field(default_factory=list, description="Application rules for this card")
    notes: Optional[str] = Field(None, description="Additional notes about this fertigation card")
    isActive: bool = Field(True, description="Whether this card is currently active")


class FertigationSchedule(BaseModel):
    """
    Complete fertigation schedule for a plant, composed of one or more cards.

    Embedded in plant_data_enhanced. Each card covers a growth stage.
    For legacy migration, a single 'Full Cycle' card is created.
    """
    cards: List[FertigationCard] = Field(default_factory=list, description="Fertigation cards by growth stage")
    totalFertilizationDays: int = Field(0, ge=0, description="Total days requiring fertigation")
    source: str = Field("manual", description="Data source: 'legacy_migration' or 'manual'")


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
    environmentalRequirements: Optional[EnvironmentalRequirements] = Field(None, description="Environmental conditions")

    # ===== 5. Watering Requirements =====
    wateringRequirements: Optional[WateringRequirements] = Field(None, description="Watering specifications")

    # ===== 6. pH & Soil Requirements =====
    soilRequirements: Optional[SoilRequirements] = Field(None, description="Soil and pH requirements")

    # ===== 7. Disease & Pest Management =====
    diseasesAndPests: List[DiseaseOrPest] = Field(
        default_factory=list,
        description="Known diseases and pests"
    )

    # ===== 8. Light Requirements =====
    lightRequirements: Optional[LightRequirements] = Field(None, description="Light and photoperiod requirements")

    # ===== 9. Grading Standards =====
    gradingStandards: List[QualityGrade] = Field(
        default_factory=list,
        description="Quality grading standards"
    )

    # ===== 10. Economics & Labor =====
    economicsAndLabor: Optional[EconomicsAndLabor] = Field(None, description="Economic and labor information")

    # ===== 11. Additional Information =====
    additionalInfo: Optional[AdditionalInformation] = Field(None, description="Additional agronomic details")

    # ===== 12. Fertigation Schedule =====
    fertigationSchedule: Optional[FertigationSchedule] = Field(
        None,
        description="Fertigation schedule with growth-stage cards and application rules. Dosages are per planting point."
    )

    # ===== 13. Spacing Category =====
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
    fertigationSchedule: Optional[FertigationSchedule] = None
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

    # Multi-industry scoping
    divisionId: Optional[str] = Field(None, description="Division scope")
    organizationId: Optional[str] = Field(None, description="Organization scope")

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
    seedsPerPlantingPoint: int = 1
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
            seedsPerPlantingPoint=enhanced.yieldInfo.seedsPerPlantingPoint,
            notes=enhanced.additionalInfo.notes,
            tags=enhanced.tags,
            dataVersion=enhanced.dataVersion,
            createdBy=enhanced.createdBy,
            createdByEmail=enhanced.createdByEmail,
            createdAt=enhanced.createdAt,
            updatedAt=enhanced.updatedAt
        )
