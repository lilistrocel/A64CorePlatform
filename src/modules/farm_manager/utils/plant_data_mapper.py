"""
PlantData Migration Mapper

Provides utilities to convert between legacy PlantData and enhanced PlantDataEnhanced models.
Ensures backward compatibility during schema transition.
"""

from typing import Optional, List
from uuid import UUID

from ..models.plant_data import PlantData, PlantDataCreate, PlantDataUpdate
from ..models.plant_data_enhanced import (
    PlantDataEnhanced,
    PlantDataEnhancedCreate,
    PlantDataEnhancedUpdate,
    GrowthCycleDuration,
    YieldInfo,
    EnvironmentalRequirements,
    TemperatureRange,
    HumidityRange,
    WateringRequirements,
    WaterTypeEnum,
    ToleranceLevelEnum,
    SoilRequirements,
    PHRequirements,
    SoilTypeEnum,
    LightRequirements,
    LightTypeEnum,
    EconomicsAndLabor,
    AdditionalInformation,
    GrowthHabitEnum,
    SpacingRequirements,
    SupportTypeEnum,
    FarmTypeEnum,
)


class PlantDataMigrationMapper:
    """
    Bidirectional mapper between legacy PlantData and enhanced PlantDataEnhanced models.

    Handles default values and data transformation during migration.
    """

    @staticmethod
    def legacy_to_enhanced(legacy: PlantData) -> PlantDataEnhanced:
        """
        Convert legacy PlantData model to enhanced PlantDataEnhanced model.

        Args:
            legacy: Legacy PlantData object

        Returns:
            PlantDataEnhanced object with populated fields

        Notes:
            - Maps basic fields directly
            - Provides sensible defaults for new enhanced fields
            - Preserves all existing data
        """
        # Parse sunlight hours (e.g., "6-8" to min=6, max=8)
        min_hours = 6.0
        max_hours = 10.0
        optimal_hours = 8.0

        if legacy.sunlightHoursDaily:
            try:
                parts = legacy.sunlightHoursDaily.split("-")
                if len(parts) == 2:
                    min_hours = float(parts[0])
                    max_hours = float(parts[1])
                    optimal_hours = (min_hours + max_hours) / 2
                elif len(parts) == 1:
                    optimal_hours = float(parts[0])
                    min_hours = optimal_hours - 1
                    max_hours = optimal_hours + 1
            except (ValueError, IndexError):
                pass

        # Map plant type to farm type compatibility
        farm_types = []
        plant_type_lower = legacy.plantType.lower()
        if "crop" in plant_type_lower or "vegetable" in plant_type_lower:
            farm_types = [FarmTypeEnum.OPEN_FIELD, FarmTypeEnum.GREENHOUSE]
        elif "hydroponic" in plant_type_lower:
            farm_types = [FarmTypeEnum.HYDROPONIC, FarmTypeEnum.VERTICAL_FARM]
        else:
            farm_types = [FarmTypeEnum.OPEN_FIELD]

        # Determine growth habit from plant type
        growth_habit = GrowthHabitEnum.BUSH
        if "vine" in plant_type_lower or "climbing" in plant_type_lower:
            growth_habit = GrowthHabitEnum.VINE
        elif "tree" in plant_type_lower:
            growth_habit = GrowthHabitEnum.INDETERMINATE

        # Build enhanced model
        return PlantDataEnhanced(
            # Copy primary fields
            plantDataId=legacy.plantDataId,
            plantName=legacy.plantName,
            scientificName=legacy.scientificName or f"{legacy.plantName} sp.",
            farmTypeCompatibility=farm_types,

            # Growth cycle (simplified from single total to stages)
            growthCycle=GrowthCycleDuration(
                germinationDays=max(int(legacy.growthCycleDays * 0.05), 3),  # ~5% for germination
                vegetativeDays=int(legacy.growthCycleDays * 0.40),  # ~40% vegetative
                floweringDays=int(legacy.growthCycleDays * 0.15),  # ~15% flowering
                fruitingDays=int(legacy.growthCycleDays * 0.30),  # ~30% fruiting
                harvestDurationDays=int(legacy.growthCycleDays * 0.10),  # ~10% harvest
                totalCycleDays=legacy.growthCycleDays
            ),

            # Yield information
            yieldInfo=YieldInfo(
                yieldPerPlant=legacy.expectedYieldPerPlant,
                yieldUnit=legacy.yieldUnit,
                expectedWastePercentage=10.0  # Default 10% waste
            ),

            # Environmental requirements
            environmentalRequirements=EnvironmentalRequirements(
                temperature=TemperatureRange(
                    minCelsius=legacy.minTemperatureCelsius or 15.0,
                    maxCelsius=legacy.maxTemperatureCelsius or 30.0,
                    optimalCelsius=(
                        (legacy.minTemperatureCelsius or 15.0) +
                        (legacy.maxTemperatureCelsius or 30.0)
                    ) / 2
                ),
                humidity=HumidityRange(
                    minPercentage=50.0,
                    maxPercentage=80.0,
                    optimalPercentage=65.0
                ) if legacy.minTemperatureCelsius else None,
                co2RequirementPpm=None,
                airCirculation=None
            ),

            # Watering requirements
            wateringRequirements=WateringRequirements(
                frequencyDays=legacy.wateringFrequencyDays or 3,
                waterType=WaterTypeEnum.TAP,
                amountPerPlantLiters=None,
                droughtTolerance=ToleranceLevelEnum.MEDIUM,
                notes=None
            ),

            # Soil requirements
            soilRequirements=SoilRequirements(
                phRequirements=PHRequirements(
                    minPH=legacy.optimalPHMin or 6.0,
                    maxPH=legacy.optimalPHMax or 7.0,
                    optimalPH=(
                        (legacy.optimalPHMin or 6.0) +
                        (legacy.optimalPHMax or 7.0)
                    ) / 2
                ),
                soilTypes=[SoilTypeEnum.LOAMY],  # Default to loamy soil
                nutrientsRecommendations=None,
                ecRangeMs=None,
                tdsRangePpm=None,
                notes=None
            ),

            # Diseases and pests
            diseasesAndPests=[],  # Empty - needs manual population

            # Light requirements
            lightRequirements=LightRequirements(
                lightType=LightTypeEnum.FULL_SUN,  # Default assumption
                minHoursDaily=min_hours,
                maxHoursDaily=max_hours,
                optimalHoursDaily=optimal_hours,
                intensityLux=None,
                intensityPpfd=None,
                photoperiodSensitive=False,
                notes=None
            ),

            # Grading standards
            gradingStandards=[],  # Empty - needs manual population

            # Economics and labor
            economicsAndLabor=EconomicsAndLabor(
                averageMarketValuePerKg=None,
                currency="USD",
                totalManHoursPerPlant=0.5,  # Default estimate
                plantingHours=0.1,
                maintenanceHours=0.3,
                harvestingHours=0.1,
                notes=None
            ),

            # Additional information
            additionalInfo=AdditionalInformation(
                growthHabit=growth_habit,
                spacing=SpacingRequirements(
                    betweenPlantsCm=50.0,  # Default spacing
                    betweenRowsCm=75.0,
                    plantsPerSquareMeter=2.67
                ),
                supportRequirements=SupportTypeEnum.NONE,
                companionPlants=None,
                incompatiblePlants=None,
                notes=legacy.notes
            ),

            # Tags
            tags=legacy.tags,

            # Metadata
            dataVersion=legacy.dataVersion,
            createdBy=legacy.createdBy,
            createdByEmail=legacy.createdByEmail,
            createdAt=legacy.createdAt,
            updatedAt=legacy.updatedAt,
            deletedAt=None
        )

    @staticmethod
    def enhanced_to_legacy(enhanced: PlantDataEnhanced) -> PlantData:
        """
        Convert enhanced PlantDataEnhanced model to legacy PlantData model.

        Args:
            enhanced: Enhanced PlantDataEnhanced object

        Returns:
            PlantData object with simplified fields

        Notes:
            - Flattens complex nested structures
            - Loses detailed information (fertilizer schedules, pest management, etc.)
            - Primarily for backward compatibility with existing systems
        """
        # Convert sunlight hours back to string format
        sunlight_hours_str = f"{int(enhanced.lightRequirements.minHoursDaily)}-{int(enhanced.lightRequirements.maxHoursDaily)}"

        # Get first farm type as plant type (simplified)
        plant_type = enhanced.farmTypeCompatibility[0].value if enhanced.farmTypeCompatibility else "crop"

        return PlantData(
            plantDataId=enhanced.plantDataId,
            plantName=enhanced.plantName,
            scientificName=enhanced.scientificName,
            plantType=plant_type,
            growthCycleDays=enhanced.growthCycle.totalCycleDays,
            minTemperatureCelsius=enhanced.environmentalRequirements.temperature.minCelsius,
            maxTemperatureCelsius=enhanced.environmentalRequirements.temperature.maxCelsius,
            optimalPHMin=enhanced.soilRequirements.phRequirements.minPH,
            optimalPHMax=enhanced.soilRequirements.phRequirements.maxPH,
            wateringFrequencyDays=enhanced.wateringRequirements.frequencyDays,
            sunlightHoursDaily=sunlight_hours_str,
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

    @staticmethod
    def create_legacy_to_enhanced(legacy_create: PlantDataCreate) -> PlantDataEnhancedCreate:
        """
        Convert legacy PlantDataCreate to PlantDataEnhancedCreate.

        Args:
            legacy_create: Legacy create schema

        Returns:
            Enhanced create schema with default values
        """
        # This is a simplified conversion - recommend manual population of enhanced fields
        # For production use, consider requiring full enhanced schema for new entries

        # Parse sunlight hours
        min_hours = 6.0
        max_hours = 10.0
        optimal_hours = 8.0

        if legacy_create.sunlightHoursDaily:
            try:
                parts = legacy_create.sunlightHoursDaily.split("-")
                if len(parts) == 2:
                    min_hours = float(parts[0])
                    max_hours = float(parts[1])
                    optimal_hours = (min_hours + max_hours) / 2
            except (ValueError, IndexError):
                pass

        # Basic farm type mapping
        farm_types = [FarmTypeEnum.OPEN_FIELD, FarmTypeEnum.GREENHOUSE]

        return PlantDataEnhancedCreate(
            plantName=legacy_create.plantName,
            scientificName=legacy_create.scientificName or f"{legacy_create.plantName} sp.",
            farmTypeCompatibility=farm_types,
            growthCycle=GrowthCycleDuration(
                germinationDays=max(int(legacy_create.growthCycleDays * 0.05), 3),
                vegetativeDays=int(legacy_create.growthCycleDays * 0.40),
                floweringDays=int(legacy_create.growthCycleDays * 0.15),
                fruitingDays=int(legacy_create.growthCycleDays * 0.30),
                harvestDurationDays=int(legacy_create.growthCycleDays * 0.10),
                totalCycleDays=legacy_create.growthCycleDays
            ),
            yieldInfo=YieldInfo(
                yieldPerPlant=legacy_create.expectedYieldPerPlant,
                yieldUnit=legacy_create.yieldUnit,
                expectedWastePercentage=10.0
            ),
            environmentalRequirements=EnvironmentalRequirements(
                temperature=TemperatureRange(
                    minCelsius=legacy_create.minTemperatureCelsius or 15.0,
                    maxCelsius=legacy_create.maxTemperatureCelsius or 30.0,
                    optimalCelsius=(
                        (legacy_create.minTemperatureCelsius or 15.0) +
                        (legacy_create.maxTemperatureCelsius or 30.0)
                    ) / 2
                )
            ),
            wateringRequirements=WateringRequirements(
                frequencyDays=legacy_create.wateringFrequencyDays or 3,
                waterType=WaterTypeEnum.TAP,
                droughtTolerance=ToleranceLevelEnum.MEDIUM
            ),
            soilRequirements=SoilRequirements(
                phRequirements=PHRequirements(
                    minPH=legacy_create.optimalPHMin or 6.0,
                    maxPH=legacy_create.optimalPHMax or 7.0,
                    optimalPH=(
                        (legacy_create.optimalPHMin or 6.0) +
                        (legacy_create.optimalPHMax or 7.0)
                    ) / 2
                ),
                soilTypes=[SoilTypeEnum.LOAMY]
            ),
            lightRequirements=LightRequirements(
                lightType=LightTypeEnum.FULL_SUN,
                minHoursDaily=min_hours,
                maxHoursDaily=max_hours,
                optimalHoursDaily=optimal_hours,
                photoperiodSensitive=False
            ),
            economicsAndLabor=EconomicsAndLabor(
                currency="USD",
                totalManHoursPerPlant=0.5,
                plantingHours=0.1,
                maintenanceHours=0.3,
                harvestingHours=0.1
            ),
            additionalInfo=AdditionalInformation(
                growthHabit=GrowthHabitEnum.BUSH,
                spacing=SpacingRequirements(
                    betweenPlantsCm=50.0,
                    betweenRowsCm=75.0,
                    plantsPerSquareMeter=2.67
                ),
                supportRequirements=SupportTypeEnum.NONE,
                notes=legacy_create.notes
            ),
            tags=legacy_create.tags
        )
