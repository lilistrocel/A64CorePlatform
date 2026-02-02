#!/usr/bin/env python3
"""
Plant Data Migration Script

Transforms the 39 enhanced plants from local JSON to match the production
PlantDataEnhanced Pydantic schema.

Required transformations:
1. Add missing required fields: lightRequirements, economicsAndLabor, additionalInfo
2. Add audit fields: createdBy, createdByEmail
3. Fix enum values: soilTypes (loam → loamy, sandy-loam → sandy, etc.)
4. Restructure nested objects to match schema
5. Transform field names to match Pydantic model
"""

import json
import sys
from datetime import datetime
from uuid import uuid4

# System user UUID for data migration
SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"
SYSTEM_USER_EMAIL = "system@a64platform.com"


def map_soil_type(soil_type: str) -> str:
    """Map soil type values to enum values"""
    mapping = {
        "loam": "loamy",
        "sandy-loam": "sandy",
        "sandy loam": "sandy",
        "well-drained": "loamy",  # Default well-drained to loamy
        "clay-loam": "clay",
        "silt-loam": "silty",
        "peat": "peaty",
        "chalk": "chalky",
        # Direct mappings (already correct)
        "loamy": "loamy",
        "sandy": "sandy",
        "clay": "clay",
        "silty": "silty",
        "peaty": "peaty",
        "chalky": "chalky"
    }

    soil_lower = soil_type.lower().strip()
    return mapping.get(soil_lower, "loamy")  # Default to loamy if unknown


def map_light_type(hours: float) -> str:
    """Map light hours to light type enum"""
    if hours >= 8:
        return "full_sun"
    elif hours >= 4:
        return "partial_shade"
    else:
        return "full_shade"


def map_growth_habit(plant_name: str) -> str:
    """Determine growth habit based on plant name (heuristic)"""
    name_lower = plant_name.lower()

    # Vine plants
    if any(word in name_lower for word in ["cucumber", "melon", "watermelon", "pumpkin", "squash", "gourd"]):
        return "vine"

    # Climbing plants
    if any(word in name_lower for word in ["bean", "pea", "tomato"]):
        return "climbing"

    # Spreading plants
    if any(word in name_lower for word in ["zucchini", "marrow"]):
        return "spreading"

    # Bush plants (most vegetables and herbs)
    return "bush"


def map_support_type(growth_habit: str, plant_name: str) -> str:
    """Determine support requirements based on growth habit"""
    name_lower = plant_name.lower()

    if growth_habit == "climbing":
        if "tomato" in name_lower:
            return "stakes"
        elif "bean" in name_lower or "pea" in name_lower:
            return "trellis"
        else:
            return "cage"
    elif growth_habit == "vine":
        return "trellis"
    else:
        return "none"


def transform_light_requirements(env_req: dict) -> dict:
    """Transform environmentalRequirements.light to lightRequirements schema"""
    light = env_req.get("light", {})
    light_hours = env_req.get("lightHours", {})

    # Try to get hours from different locations
    if "hoursPerDay" in light:
        hours_per_day = light.get("hoursPerDay", 12)
        min_hours = max(hours_per_day - 2, 0)
        max_hours = min(hours_per_day + 2, 24)
        optimal_hours = hours_per_day
    elif light_hours:
        min_hours = light_hours.get("min", 10)
        max_hours = light_hours.get("max", 14)
        optimal_hours = light_hours.get("optimal", 12)
        hours_per_day = optimal_hours
    else:
        # Defaults
        hours_per_day = 12
        min_hours = 10
        max_hours = 14
        optimal_hours = 12

    min_lux = light.get("minLux", 0)
    max_lux = light.get("maxLux", 50000)

    # Extract PPFD range if present
    ppfd_str = light.get("ppfd", "0")
    ppfd_value = 0
    if isinstance(ppfd_str, str) and "-" in ppfd_str:
        ppfd_parts = ppfd_str.split("-")
        ppfd_value = int(ppfd_parts[0].strip().replace("μmol/m²/s", "").strip())

    return {
        "lightType": map_light_type(optimal_hours),
        "minHoursDaily": min_hours,
        "maxHoursDaily": max_hours,
        "optimalHoursDaily": optimal_hours,
        "intensityLux": (min_lux + max_lux) // 2 if min_lux and max_lux else None,
        "intensityPpfd": ppfd_value if ppfd_value > 0 else None,
        "photoperiodSensitive": light.get("photoperiodSensitivity") == "short-day",
        "notes": f"Light requirement: {optimal_hours} hours/day"
    }


def transform_economics_and_labor(plant: dict) -> dict:
    """Create economicsAndLabor from available data"""
    economic_info = plant.get("economicInfo", {})

    # Extract market price
    market_price = economic_info.get("marketPrice", 0)
    price_unit = economic_info.get("priceUnit", "AED/kg")

    # Default labor estimates based on growth cycle
    growth_cycle_days = plant.get("growthCycle", {}).get("totalCycleDays", 60)

    # Rough labor estimates (can be refined later)
    total_hours = growth_cycle_days * 0.05  # 3 minutes per day average

    return {
        "averageMarketValuePerKg": market_price if market_price > 0 else None,
        "currency": "AED" if "AED" in price_unit else "USD",
        "totalManHoursPerPlant": round(total_hours, 2),
        "plantingHours": round(total_hours * 0.1, 2),
        "maintenanceHours": round(total_hours * 0.6, 2),
        "harvestingHours": round(total_hours * 0.3, 2),
        "notes": f"Market demand: {economic_info.get('marketDemand', 'medium')}"
    }


def transform_spacing_requirements(plant_name: str) -> dict:
    """Create spacing requirements based on plant type"""
    name_lower = plant_name.lower()

    # Spacing heuristics by plant type
    if any(word in name_lower for word in ["lettuce", "spinach", "rocket", "arugula"]):
        between_plants = 25
        between_rows = 30
    elif any(word in name_lower for word in ["basil", "herb"]):
        between_plants = 30
        between_rows = 40
    elif any(word in name_lower for word in ["tomato", "pepper", "eggplant"]):
        between_plants = 50
        between_rows = 75
    elif any(word in name_lower for word in ["cucumber", "zucchini", "squash"]):
        between_plants = 60
        between_rows = 100
    elif any(word in name_lower for word in ["melon", "watermelon", "pumpkin"]):
        between_plants = 100
        between_rows = 150
    else:
        # Default spacing
        between_plants = 40
        between_rows = 60

    # Calculate plants per square meter
    area_per_plant = (between_plants / 100) * (between_rows / 100)
    plants_per_sqm = round(1 / area_per_plant, 2) if area_per_plant > 0 else None

    return {
        "betweenPlantsCm": between_plants,
        "betweenRowsCm": between_rows,
        "plantsPerSquareMeter": plants_per_sqm
    }


def transform_additional_info(plant: dict) -> dict:
    """Create additionalInfo from plant data"""
    plant_name = plant.get("plantName", "")

    growth_habit = map_growth_habit(plant_name)
    support_type = map_support_type(growth_habit, plant_name)
    spacing = transform_spacing_requirements(plant_name)

    # Extract companion plants
    companion_data = plant.get("companionPlants", {})
    good_companions = companion_data.get("goodCompanions", [])
    bad_companions = companion_data.get("badCompanions", [])

    notes_parts = []
    if "uaeAdaptations" in plant:
        uae = plant["uaeAdaptations"]
        if "localRecommendations" in uae:
            notes_parts.append(uae["localRecommendations"])

    return {
        "growthHabit": growth_habit,
        "spacing": spacing,
        "supportRequirements": support_type,
        "companionPlants": good_companions if good_companions else None,
        "incompatiblePlants": bad_companions if bad_companions else None,
        "notes": " ".join(notes_parts) if notes_parts else None
    }


def transform_soil_requirements(plant: dict) -> dict:
    """Transform soilRequirements to match schema"""
    soil_req = plant.get("soilRequirements", {})

    # Transform pH
    ph_range = soil_req.get("phRange", {})
    ph_min = ph_range.get("min", 6.0)
    ph_max = ph_range.get("max", 7.0)
    ph_optimal = (ph_min + ph_max) / 2

    # Transform soil types
    raw_soil_types = soil_req.get("soilTypes", ["loamy"])
    mapped_soil_types = []
    for st in raw_soil_types:
        mapped = map_soil_type(st)
        if mapped not in mapped_soil_types:
            mapped_soil_types.append(mapped)

    # Ensure at least one soil type
    if not mapped_soil_types:
        mapped_soil_types = ["loamy"]

    # Extract EC and TDS for hydroponics
    hydroponics = soil_req.get("hydroponics", {})
    ec_range = hydroponics.get("ec", {})
    tds_range = hydroponics.get("tds", {})

    ec_str = None
    tds_str = None

    if ec_range:
        ec_min = ec_range.get("min", 0)
        ec_max = ec_range.get("max", 0)
        if ec_min > 0 and ec_max > 0:
            ec_str = f"{ec_min}-{ec_max}"

    if tds_range:
        tds_min = tds_range.get("min", 0)
        tds_max = tds_range.get("max", 0)
        if tds_min > 0 and tds_max > 0:
            tds_str = f"{tds_min}-{tds_max}"

    return {
        "phRequirements": {
            "minPH": ph_min,
            "maxPH": ph_max,
            "optimalPH": ph_optimal
        },
        "soilTypes": mapped_soil_types,
        "nutrientsRecommendations": soil_req.get("nutrientsRecommendations"),
        "ecRangeMs": ec_str,
        "tdsRangePpm": tds_str,
        "notes": None
    }


def transform_watering_requirements(plant: dict) -> dict:
    """Transform wateringRequirements to match schema"""
    watering = plant.get("wateringRequirements", {})

    freq_days = watering.get("frequencyDays", 3)
    amount = watering.get("amountPerPlant", 0)
    drought_tolerance = watering.get("droughtTolerance", 'medium').lower()

    # Map drought tolerance
    tolerance_map = {
        'very low': 'low',
        'very_low': 'low',
        'medium_low': 'medium',
        'medium_high': 'medium',
        'very high': 'high',
        'very_high': 'high'
    }

    mapped_tolerance = tolerance_map.get(drought_tolerance, drought_tolerance)
    if mapped_tolerance not in ['low', 'medium', 'high']:
        mapped_tolerance = 'medium'

    return {
        "frequencyDays": freq_days,
        "waterType": "filtered",  # Default to filtered
        "amountPerPlantLiters": amount / 1000 if amount > 0 else None,
        "droughtTolerance": mapped_tolerance,
        "notes": watering.get("waterQuality")
    }


def transform_diseases_and_pests(plant: dict) -> list:
    """Transform pest and disease data to match schema"""

    def map_severity(severity: str) -> str:
        """Map severity values to valid enum values"""
        severity_lower = severity.lower().strip() if severity else "medium"

        # Map variations to standard values
        severity_map = {
            "very low": "low",
            "very_low": "low",
            "low-medium": "low",
            "medium-low": "medium",
            "medium-high": "high",
            "high-medium": "high",
            "very high": "critical",
            "very_high": "critical",
            "severe": "critical",
            "extreme": "critical"
        }

        mapped = severity_map.get(severity_lower, severity_lower)

        # Ensure it's one of the valid values
        if mapped not in ['low', 'medium', 'high', 'critical']:
            return 'medium'  # Default

        return mapped

    result = []

    # Transform diseases
    diseases = plant.get("diseases", [])
    for disease in diseases:
        result.append({
            "name": disease.get("name", "Unknown"),
            "symptoms": disease.get("symptoms", ""),
            "preventionMeasures": disease.get("prevention", ""),
            "treatmentOptions": disease.get("organicControl", ""),
            "severity": map_severity(disease.get("severity", "medium"))
        })

    # Transform pests
    pests = plant.get("pests", [])
    for pest in pests:
        result.append({
            "name": pest.get("name", "Unknown"),
            "symptoms": f"Pest damage from {pest.get('name', 'pest')}",
            "preventionMeasures": pest.get("culturalPractices", ""),
            "treatmentOptions": f"Organic: {pest.get('organicControl', '')}. Biological: {pest.get('biologicalControl', '')}",
            "severity": map_severity(pest.get("severity", "medium"))
        })

    # Also check commonDiseasesAndPests
    common = plant.get("commonDiseasesAndPests", [])
    for item in common:
        result.append({
            "name": item.get("name", "Unknown"),
            "symptoms": item.get("symptoms", ""),
            "preventionMeasures": item.get("prevention", ""),
            "treatmentOptions": item.get("treatment", ""),
            "severity": map_severity(item.get("severity", "medium"))
        })

    return result


def fix_fertilizer_schedule(schedule) -> list:
    """Fix fertilizer schedule validation issues - handles both list and dict formats"""
    fixed = []

    # Handle dict format (e.g., {germinationStage: {...}, vegetativeStage: {...}})
    if isinstance(schedule, dict):
        stage_map_dict = {
            "germinationStage": "germination",
            "vegetativeStage": "vegetative",
            "floweringStage": "flowering",
            "fruitingStage": "fruiting",
            "harvestStage": "harvest"
        }

        for stage_key, stage_data in schedule.items():
            if not isinstance(stage_data, dict):
                continue

            mapped_stage = stage_map_dict.get(stage_key, "vegetative")
            npk = stage_data.get("npk", "5-5-5")
            frequency = stage_data.get("frequency", "weekly")

            # Convert frequency to days
            freq_days = 7 if frequency == "weekly" else 14

            fixed_item = {
                "stage": mapped_stage,
                "fertilizerType": f"NPK {npk}",
                "quantityPerPlant": 20,  # Default quantity
                "quantityUnit": "grams",
                "frequencyDays": freq_days,
                "npkRatio": npk,
                "notes": None
            }
            fixed.append(fixed_item)
        return fixed

    # Handle list format (original structure)
    if not isinstance(schedule, list):
        return []

    for item in schedule:
        if not isinstance(item, dict):
            continue

        # Map stage values
        stage = item.get("stage", "vegetative")
        stage_map = {
            "preplant": "germination",
            "pre-plant": "germination",
            "seedling": "germination",
            "growth": "vegetative",
            "bloom": "flowering",
            "fruit": "fruiting",
            "continuous": "harvest"
        }
        mapped_stage = stage_map.get(stage, stage)

        # Ensure frequencyDays > 0 (convert 0 to 1 for one-time applications)
        freq_days = item.get("frequencyDays", 14)
        if freq_days <= 0:
            freq_days = 1  # One-time application

        fixed_item = {
            "stage": mapped_stage,
            "fertilizerType": item.get("fertilizerType", "Unknown"),
            "quantityPerPlant": item.get("quantityPerPlant", 10),
            "quantityUnit": item.get("quantityUnit", "grams"),
            "frequencyDays": freq_days,
            "npkRatio": item.get("npkRatio"),
            "notes": item.get("notes")
        }
        fixed.append(fixed_item)
    return fixed


def fix_pesticide_schedule(schedule) -> list:
    """Fix pesticide schedule validation issues - handles both list and dict formats"""
    # If dict format, convert to empty list (most plants with dict format don't have detailed pesticide data)
    if isinstance(schedule, dict):
        return []

    # Handle list format
    if not isinstance(schedule, list):
        return []

    fixed = []
    for item in schedule:
        if not isinstance(item, dict):
            continue

        # Map stage values
        stage = item.get("stage", "vegetative")
        stage_map = {
            "preplant": "germination",
            "pre-plant": "germination",
            "seedling": "germination",
            "growth": "vegetative",
            "bloom": "flowering",
            "fruit": "fruiting",
            "continuous": "harvest"
        }
        mapped_stage = stage_map.get(stage, stage)

        # Ensure quantityPerPlant > 0
        quantity = item.get("quantityPerPlant", 1)
        if quantity <= 0:
            quantity = 1  # Minimum quantity

        # Ensure frequencyDays > 0
        freq_days = item.get("frequencyDays", 7)
        if freq_days <= 0:
            freq_days = 7  # Default weekly application

        fixed_item = {
            "stage": mapped_stage,
            "pesticideType": item.get("pesticideType", "Unknown"),
            "targetPest": item.get("targetPest"),
            "quantityPerPlant": quantity,
            "quantityUnit": item.get("quantityUnit", "ml"),
            "frequencyDays": freq_days,
            "safetyNotes": item.get("safetyNotes"),
            "preharvestIntervalDays": item.get("preharvestIntervalDays", 0)
        }
        fixed.append(fixed_item)
    return fixed


def transform_plant(plant: dict) -> dict:
    """Transform a single plant to match PlantDataEnhanced schema"""

    # Generate UUID for plant
    plant_id = str(uuid4())
    now = datetime.utcnow().isoformat()

    # Transform environmental requirements
    env_req = plant.get("environmentalRequirements", {})
    temp = env_req.get("temperature", {})
    humidity = env_req.get("humidity", {})

    transformed = {
        # Basic information
        "plantDataId": plant_id,
        "plantName": plant.get("plantName", "Unknown"),
        "scientificName": plant.get("scientificName", ""),
        "farmTypeCompatibility": plant.get("farmTypeCompatibility", ["open_field"]),

        # Growth cycle (already correct format)
        "growthCycle": plant.get("growthCycle", {
            "germinationDays": 7,
            "vegetativeDays": 30,
            "floweringDays": 0,
            "fruitingDays": 0,
            "harvestDurationDays": 14,
            "totalCycleDays": 51
        }),

        # Yield info (already correct format)
        "yieldInfo": plant.get("yieldInfo", {
            "yieldPerPlant": 1.0,
            "yieldUnit": "kg",
            "expectedWastePercentage": 10
        }),

        # Fertilizer schedule (FIX validation issues)
        "fertilizerSchedule": fix_fertilizer_schedule(plant.get("fertilizerSchedule", [])),

        # Pesticide schedule (FIX validation issues)
        "pesticideSchedule": fix_pesticide_schedule(plant.get("pesticideSchedule", [])),

        # Environmental requirements
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": temp.get("minCelsius", temp.get("min", 15)),
                "maxCelsius": temp.get("maxCelsius", temp.get("max", 30)),
                "optimalCelsius": temp.get("optimalCelsius", temp.get("optimal", 22))
            },
            "humidity": {
                "minPercentage": humidity.get("minPercentage", humidity.get("min", 40)),
                "maxPercentage": humidity.get("maxPercentage", humidity.get("max", 70)),
                "optimalPercentage": humidity.get("optimalPercentage", humidity.get("optimal", 55))
            } if humidity else None,
            "co2RequirementPpm": env_req.get("co2", {}).get("optimalPpm") if isinstance(env_req.get("co2"), dict) else env_req.get("co2", 800),
            "airCirculation": env_req.get("airCirculation", {}).get("notes") if isinstance(env_req.get("airCirculation"), dict) else "Moderate air circulation required"
        },

        # Watering requirements
        "wateringRequirements": transform_watering_requirements(plant),

        # Soil requirements
        "soilRequirements": transform_soil_requirements(plant),

        # Diseases and pests
        "diseasesAndPests": transform_diseases_and_pests(plant),

        # NEW REQUIRED FIELDS
        "lightRequirements": transform_light_requirements(env_req),
        "economicsAndLabor": transform_economics_and_labor(plant),
        "additionalInfo": transform_additional_info(plant),

        # Grading standards (optional, keep if exists)
        "gradingStandards": [],

        # Tags
        "tags": plant.get("tags", []),

        # Versioning
        "dataVersion": 1,

        # Audit fields
        "createdBy": SYSTEM_USER_ID,
        "createdByEmail": SYSTEM_USER_EMAIL,
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": None
    }

    return transformed


def main():
    """Main migration process"""

    print("=" * 70)
    print("PLANT DATA MIGRATION SCRIPT")
    print("=" * 70)
    print()

    # Load source JSON
    print("[+] Loading source JSON...")
    try:
        with open('plants-from-old-db-enhanced.json', 'r', encoding='utf-8') as f:
            data = json.load(f)

        plants = data.get('plants', [])
        print(f"[OK] Loaded {len(plants)} plants from JSON")
    except Exception as e:
        print(f"[ERROR] Error loading JSON: {e}")
        sys.exit(1)

    # Transform all plants
    print("\n[+] Transforming plants to match schema...")
    transformed_plants = []
    errors = []

    for i, plant in enumerate(plants, 1):
        plant_name = plant.get('plantName', f'Plant #{i}')
        try:
            transformed = transform_plant(plant)
            transformed_plants.append(transformed)
            print(f"  [OK] {i:2d}. {plant_name}")
        except Exception as e:
            error_msg = f"Error transforming {plant_name}: {e}"
            print(f"  [ERROR] {i:2d}. {error_msg}")
            errors.append(error_msg)

    print(f"\n[SUMMARY] Transformation Summary:")
    print(f"  [OK] Successfully transformed: {len(transformed_plants)}")
    print(f"  [ERROR] Errors: {len(errors)}")

    if errors:
        print("\n[WARNING] Errors encountered:")
        for error in errors:
            print(f"  - {error}")

    # Save transformed data
    if transformed_plants:
        output_file = 'plants-migrated-to-schema.json'
        print(f"\n[+] Saving transformed plants to {output_file}...")

        output_data = {
            "metadata": {
                "title": "Migrated Plant Data - Schema Compatible",
                "description": "39 plants transformed to match PlantDataEnhanced Pydantic schema",
                "schema_version": "plant_data_enhanced_v1_pydantic",
                "migration_date": datetime.utcnow().isoformat(),
                "total_plants": len(transformed_plants),
                "source_file": "plants-from-old-db-enhanced.json"
            },
            "plants": transformed_plants
        }

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)

        print(f"[OK] Saved {len(transformed_plants)} transformed plants")
        print(f"\n[OUTPUT] Output file: {output_file}")

    print("\n" + "=" * 70)
    print("MIGRATION COMPLETE!")
    print("=" * 70)
    print()
    print("Next steps:")
    print("1. Review the output file: plants-migrated-to-schema.json")
    print("2. Import to MongoDB: plant_data_enhanced collection")
    print("3. Restart farm-management API service")
    print("4. Test API endpoints")
    print()


if __name__ == "__main__":
    main()
