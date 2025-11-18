#!/usr/bin/env python3
"""
Add Phase 1 Remaining Plants (7 leafy greens & herbs)
Plants: Lettuce-Boston, Lettuce-Frisee, Lettuce-Lollo, Lettuce-Oakleaf,
        Lettuce-Radicchio, Mulukhiyah, Zaatar
Source: PHASE1_REMAINING_RESEARCH_COMPLETE.md
"""

import json

phase1_remaining_plants = [
    {
        "plantName": "Lettuce - Boston",
        "scientificName": "Lactuca sativa var. capitata L.",
        "farmTypeCompatibility": ["greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 7,
            "vegetativeDays": 35,
            "floweringDays": 0,
            "fruitingDays": 0,
            "harvestDurationDays": 14,
            "totalCycleDays": 49
        },
        "yieldInfo": {
            "yieldPerPlant": 0.35,
            "yieldUnit": "kg",
            "expectedWastePercentage": 15
        },
        "fertilizerSchedule": {
            "germinationStage": {"npk": "5-5-5", "frequency": "weekly"},
            "vegetativeStage": {"npk": "10-5-7", "frequency": "weekly"},
            "floweringStage": {"npk": "0-0-0", "frequency": "none"},
            "fruitingStage": {"npk": "0-0-0", "frequency": "none"}
        },
        "hydroponicInfo": {
            "ecRange": {"min": 1.2, "max": 1.8},
            "phRange": {"min": 5.5, "max": 6.5},
            "optimalTemperature": {"min": 15, "max": 20},
            "lightRequirement": "medium",
            "dli": {"min": 12, "max": 16},
            "ppfd": {"min": 200, "max": 300},
            "waterRequirementPerDay": 0.5
        },
        "pests": [
            {
                "name": "Aphids",
                "severity": "medium",
                "organicControl": "Insecticidal soap, neem oil, ladybugs",
                "biologicalControl": "Aphidius wasps, lacewings",
                "culturalPractices": "Monitor undersides of leaves, remove infested leaves"
            },
            {
                "name": "Thrips",
                "severity": "medium",
                "organicControl": "Spinosad, insecticidal soap",
                "biologicalControl": "Predatory mites (Amblyseius swirskii)",
                "culturalPractices": "Yellow sticky traps, maintain airflow"
            }
        ],
        "diseases": [
            {
                "name": "Downy Mildew",
                "severity": "high",
                "symptoms": "Yellow patches on upper leaf surface, grayish mold underneath",
                "organicControl": "Copper fungicides, remove infected plants",
                "prevention": "Reduce humidity, increase air circulation, avoid overhead watering"
            },
            {
                "name": "Bottom Rot",
                "severity": "medium",
                "symptoms": "Brown mushy rot at base of head touching ground/water",
                "organicControl": "Remove infected plants, improve drainage",
                "prevention": "Prevent leaf contact with nutrient solution, good air circulation"
            }
        ],
        "environmentalRequirements": {
            "temperature": {"min": 15, "max": 22, "optimal": 18},
            "humidity": {"min": 50, "max": 70, "optimal": 60},
            "lightHours": {"min": 12, "max": 14, "optimal": 12},
            "co2": 800,
            "soilPh": {"min": 6.0, "max": 7.0}
        },
        "uaeAdaptations": {
            "heatTolerance": "very_low",
            "coldTolerance": "medium",
            "waterRequirement": "medium",
            "greenhouseRequired": True,
            "summerOutdoorSuitable": False,
            "winterOutdoorSuitable": True,
            "bestPlantingMonths": [11, 12, 1, 2, 3],
            "localChallenges": "Cannot tolerate UAE summer heat >28°C; requires greenhouse climate control year-round for consistent production",
            "localRecommendations": "Grow Nov-Mar outdoors or year-round in climate-controlled greenhouse; popular butterhead variety for local market"
        },
        "companionPlants": {
            "goodCompanions": ["Radish", "Onion", "Carrot", "Beet"],
            "badCompanions": ["Cabbage", "Broccoli", "Cauliflower"],
            "reasoning": "Benefits from root vegetables; avoid brassicas due to similar pest susceptibility"
        },
        "economicInfo": {
            "marketPrice": 12.0,
            "priceUnit": "AED/kg",
            "marketDemand": "high",
            "shelfLife": 7,
            "storageRequirements": "Refrigerated 2-4°C, high humidity 95-98%"
        },
        "qualityGrading": {
            "premiumCriteria": "Tight compact heads, tender leaves, no tip burn, uniform color",
            "standardCriteria": "Reasonably compact heads, some minor imperfections acceptable",
            "rejectionCriteria": "Bolting, severe tip burn, disease, insect damage"
        },
        "metadata": {
            "oldDbId": "lettuce_boston_old_id",
            "sources": [
                "UC Davis: Lettuce Production Guide",
                "NC State Extension: Butterhead Lettuce Culture",
                "Cornell CEA: Hydroponic Lettuce Production"
            ],
            "researchDate": "2025-11-18",
            "lastUpdated": "2025-11-18"
        }
    },
    {
        "plantName": "Lettuce - Frisee",
        "scientificName": "Cichorium endivia var. crispum Lam.",
        "farmTypeCompatibility": ["greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 7,
            "vegetativeDays": 42,
            "floweringDays": 0,
            "fruitingDays": 0,
            "harvestDurationDays": 21,
            "totalCycleDays": 63
        },
        "yieldInfo": {
            "yieldPerPlant": 0.4,
            "yieldUnit": "kg",
            "expectedWastePercentage": 20
        },
        "fertilizerSchedule": {
            "germinationStage": {"npk": "5-5-5", "frequency": "weekly"},
            "vegetativeStage": {"npk": "10-5-7", "frequency": "weekly"},
            "floweringStage": {"npk": "0-0-0", "frequency": "none"},
            "fruitingStage": {"npk": "0-0-0", "frequency": "none"}
        },
        "hydroponicInfo": {
            "ecRange": {"min": 1.4, "max": 2.0},
            "phRange": {"min": 5.5, "max": 6.5},
            "optimalTemperature": {"min": 15, "max": 20},
            "lightRequirement": "medium",
            "dli": {"min": 12, "max": 16},
            "ppfd": {"min": 200, "max": 300},
            "waterRequirementPerDay": 0.5
        },
        "pests": [
            {
                "name": "Aphids",
                "severity": "medium",
                "organicControl": "Insecticidal soap, neem oil",
                "biologicalControl": "Aphidius wasps, ladybugs",
                "culturalPractices": "Monitor regularly, remove infested leaves"
            },
            {
                "name": "Leafminers",
                "severity": "medium",
                "organicControl": "Spinosad spray, remove affected leaves",
                "biologicalControl": "Parasitic wasps (Diglyphus isaea)",
                "culturalPractices": "Yellow sticky traps, destroy mined leaves"
            }
        ],
        "diseases": [
            {
                "name": "Bottom Rot (Rhizoctonia)",
                "severity": "medium",
                "symptoms": "Brown rot at base of plant",
                "organicControl": "Remove infected plants, biological fungicides",
                "prevention": "Avoid water contact with leaves, good drainage, air circulation"
            },
            {
                "name": "Tip Burn",
                "severity": "low",
                "symptoms": "Brown edges on inner leaves",
                "organicControl": "Foliar calcium spray",
                "prevention": "Maintain consistent watering, ensure adequate calcium, control temperature"
            }
        ],
        "environmentalRequirements": {
            "temperature": {"min": 15, "max": 22, "optimal": 18},
            "humidity": {"min": 50, "max": 70, "optimal": 60},
            "lightHours": {"min": 12, "max": 14, "optimal": 12},
            "co2": 800,
            "soilPh": {"min": 5.8, "max": 6.5}
        },
        "uaeAdaptations": {
            "heatTolerance": "very_low",
            "coldTolerance": "medium",
            "waterRequirement": "medium",
            "greenhouseRequired": True,
            "summerOutdoorSuitable": False,
            "winterOutdoorSuitable": True,
            "bestPlantingMonths": [11, 12, 1, 2],
            "localChallenges": "Bolts rapidly in heat; requires cool temperatures <22°C; slightly bitter flavor intensifies in heat",
            "localRecommendations": "Premium specialty green for UAE market; grow in climate-controlled greenhouse or winter months only; blanch center for milder flavor"
        },
        "companionPlants": {
            "goodCompanions": ["Radish", "Carrot", "Onion"],
            "badCompanions": ["None specific"],
            "reasoning": "Compatible with most vegetables; benefits from root crops"
        },
        "economicInfo": {
            "marketPrice": 18.0,
            "priceUnit": "AED/kg",
            "marketDemand": "medium",
            "shelfLife": 7,
            "storageRequirements": "Refrigerated 2-4°C, high humidity 95-98%"
        },
        "qualityGrading": {
            "premiumCriteria": "Curly narrow leaves, crisp texture, light yellow-green center (blanched), no bitterness",
            "standardCriteria": "Good curl, some darker green acceptable, mild bitterness ok",
            "rejectionCriteria": "Bolting, severe bitterness, brown rot, wilted leaves"
        },
        "metadata": {
            "oldDbId": "lettuce_frisee_old_id",
            "sources": [
                "UC Davis: Endive and Escarole Production",
                "Penn State Extension: Endive Growing Guide",
                "Johnny's Selected Seeds: Frisee Culture"
            ],
            "researchDate": "2025-11-18",
            "lastUpdated": "2025-11-18"
        }
    },
    {
        "plantName": "Lettuce - Lollo",
        "scientificName": "Lactuca sativa var. crispa L.",
        "farmTypeCompatibility": ["greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 7,
            "vegetativeDays": 35,
            "floweringDays": 0,
            "fruitingDays": 0,
            "harvestDurationDays": 21,
            "totalCycleDays": 56
        },
        "yieldInfo": {
            "yieldPerPlant": 0.3,
            "yieldUnit": "kg",
            "expectedWastePercentage": 15
        },
        "fertilizerSchedule": {
            "germinationStage": {"npk": "5-5-5", "frequency": "weekly"},
            "vegetativeStage": {"npk": "10-5-7", "frequency": "weekly"},
            "floweringStage": {"npk": "0-0-0", "frequency": "none"},
            "fruitingStage": {"npk": "0-0-0", "frequency": "none"}
        },
        "hydroponicInfo": {
            "ecRange": {"min": 1.2, "max": 1.8},
            "phRange": {"min": 5.5, "max": 6.5},
            "optimalTemperature": {"min": 15, "max": 20},
            "lightRequirement": "medium",
            "dli": {"min": 12, "max": 16},
            "ppfd": {"min": 200, "max": 300},
            "waterRequirementPerDay": 0.5
        },
        "pests": [
            {
                "name": "Aphids",
                "severity": "medium",
                "organicControl": "Insecticidal soap, neem oil",
                "biologicalControl": "Aphidius wasps, ladybugs",
                "culturalPractices": "Monitor curly leaves carefully, spray undersides"
            },
            {
                "name": "Thrips",
                "severity": "low",
                "organicControl": "Spinosad, insecticidal soap",
                "biologicalControl": "Predatory mites",
                "culturalPractices": "Yellow sticky traps, maintain humidity"
            }
        ],
        "diseases": [
            {
                "name": "Downy Mildew",
                "severity": "high",
                "symptoms": "Yellow patches, grayish mold on undersides",
                "organicControl": "Copper fungicides, resistant varieties",
                "prevention": "Reduce humidity, increase airflow, avoid overhead irrigation"
            },
            {
                "name": "Tip Burn",
                "severity": "medium",
                "symptoms": "Brown edges on frilly leaf margins",
                "organicControl": "Foliar calcium spray",
                "prevention": "Consistent watering, adequate calcium, avoid temperature stress"
            }
        ],
        "environmentalRequirements": {
            "temperature": {"min": 15, "max": 22, "optimal": 18},
            "humidity": {"min": 50, "max": 70, "optimal": 60},
            "lightHours": {"min": 12, "max": 14, "optimal": 12},
            "co2": 800,
            "soilPh": {"min": 6.0, "max": 7.0}
        },
        "uaeAdaptations": {
            "heatTolerance": "very_low",
            "coldTolerance": "medium",
            "waterRequirement": "medium",
            "greenhouseRequired": True,
            "summerOutdoorSuitable": False,
            "winterOutdoorSuitable": True,
            "bestPlantingMonths": [11, 12, 1, 2, 3],
            "localChallenges": "Very heat-sensitive; bolts quickly >25°C; frilly leaves prone to tip burn in stress",
            "localRecommendations": "Decorative lettuce for salad mixes; two varieties: Lollo Bionda (green) and Lollo Rosso (red/purple); grow in greenhouse or winter only; popular in UAE restaurants"
        },
        "companionPlants": {
            "goodCompanions": ["Radish", "Carrot", "Onion", "Beet"],
            "badCompanions": ["Cabbage", "Broccoli"],
            "reasoning": "Compatible with most vegetables; avoid brassicas"
        },
        "economicInfo": {
            "marketPrice": 15.0,
            "priceUnit": "AED/kg",
            "marketDemand": "high",
            "shelfLife": 7,
            "storageRequirements": "Refrigerated 2-4°C, high humidity 95-98%"
        },
        "qualityGrading": {
            "premiumCriteria": "Intensely frilly leaves, vibrant color (green or red), crisp texture, no tip burn",
            "standardCriteria": "Good frill, acceptable color, minor imperfections ok",
            "rejectionCriteria": "Bolting, severe tip burn, wilted leaves, color fading"
        },
        "metadata": {
            "oldDbId": "lettuce_lollo_old_id",
            "sources": [
                "UC Davis: Loose-Leaf Lettuce Production",
                "Johnny's Selected Seeds: Lollo Varieties",
                "Cornell CEA: Hydroponic Lettuce"
            ],
            "researchDate": "2025-11-18",
            "lastUpdated": "2025-11-18"
        }
    },
    {
        "plantName": "Lettuce - Oakleaf",
        "scientificName": "Lactuca sativa var. crispa L.",
        "farmTypeCompatibility": ["greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 7,
            "vegetativeDays": 35,
            "floweringDays": 0,
            "fruitingDays": 0,
            "harvestDurationDays": 21,
            "totalCycleDays": 56
        },
        "yieldInfo": {
            "yieldPerPlant": 0.35,
            "yieldUnit": "kg",
            "expectedWastePercentage": 15
        },
        "fertilizerSchedule": {
            "germinationStage": {"npk": "5-5-5", "frequency": "weekly"},
            "vegetativeStage": {"npk": "10-5-7", "frequency": "weekly"},
            "floweringStage": {"npk": "0-0-0", "frequency": "none"},
            "fruitingStage": {"npk": "0-0-0", "frequency": "none"}
        },
        "hydroponicInfo": {
            "ecRange": {"min": 1.2, "max": 1.8},
            "phRange": {"min": 5.5, "max": 6.5},
            "optimalTemperature": {"min": 15, "max": 20},
            "lightRequirement": "medium",
            "dli": {"min": 12, "max": 16},
            "ppfd": {"min": 200, "max": 300},
            "waterRequirementPerDay": 0.5
        },
        "pests": [
            {
                "name": "Aphids",
                "severity": "medium",
                "organicControl": "Insecticidal soap, neem oil",
                "biologicalControl": "Aphidius wasps, ladybugs",
                "culturalPractices": "Monitor regularly, remove infested leaves"
            },
            {
                "name": "Slugs",
                "severity": "low",
                "organicControl": "Iron phosphate bait, beer traps",
                "biologicalControl": "None specific",
                "culturalPractices": "Remove hiding places, hand-pick at night"
            }
        ],
        "diseases": [
            {
                "name": "Downy Mildew",
                "severity": "high",
                "symptoms": "Yellow angular patches on upper surface, white-gray mold underneath",
                "organicControl": "Copper fungicides, resistant varieties",
                "prevention": "Reduce humidity, increase air circulation, avoid wetting foliage"
            },
            {
                "name": "Bottom Rot",
                "severity": "medium",
                "symptoms": "Brown mushy rot at base of plant",
                "organicControl": "Remove infected plants, improve drainage",
                "prevention": "Avoid leaf contact with water/soil, good airflow"
            }
        ],
        "environmentalRequirements": {
            "temperature": {"min": 15, "max": 22, "optimal": 18},
            "humidity": {"min": 50, "max": 70, "optimal": 60},
            "lightHours": {"min": 12, "max": 14, "optimal": 12},
            "co2": 800,
            "soilPh": {"min": 6.0, "max": 7.0}
        },
        "uaeAdaptations": {
            "heatTolerance": "very_low",
            "coldTolerance": "medium",
            "waterRequirement": "medium",
            "greenhouseRequired": True,
            "summerOutdoorSuitable": False,
            "winterOutdoorSuitable": True,
            "bestPlantingMonths": [11, 12, 1, 2, 3],
            "localChallenges": "Cannot tolerate UAE heat; bolts rapidly >25°C; requires consistent cool temperatures",
            "localRecommendations": "Attractive loose-leaf variety with oak-shaped leaves; available in green and red; popular for salad mixes in UAE; grow Nov-Mar outdoors or year-round in greenhouse"
        },
        "companionPlants": {
            "goodCompanions": ["Radish", "Carrot", "Onion", "Beet"],
            "badCompanions": ["Cabbage", "Broccoli"],
            "reasoning": "Compatible with root vegetables; avoid brassicas with similar pests"
        },
        "economicInfo": {
            "marketPrice": 14.0,
            "priceUnit": "AED/kg",
            "marketDemand": "high",
            "shelfLife": 7,
            "storageRequirements": "Refrigerated 2-4°C, high humidity 95-98%"
        },
        "qualityGrading": {
            "premiumCriteria": "Oak-shaped lobed leaves, tender texture, vibrant color, no tip burn",
            "standardCriteria": "Good leaf shape, acceptable color, minor imperfections ok",
            "rejectionCriteria": "Bolting, severe tip burn, wilted leaves, insect damage"
        },
        "metadata": {
            "oldDbId": "lettuce_oakleaf_old_id",
            "sources": [
                "UC Davis: Lettuce Production Manual",
                "NC State Extension: Oakleaf Lettuce",
                "Johnny's Selected Seeds: Oak Leaf Varieties"
            ],
            "researchDate": "2025-11-18",
            "lastUpdated": "2025-11-18"
        }
    },
    {
        "plantName": "Lettuce - Radicchio",
        "scientificName": "Cichorium intybus var. foliosum Hegi",
        "farmTypeCompatibility": ["greenhouse", "hydroponic", "open_field"],
        "growthCycle": {
            "germinationDays": 10,
            "vegetativeDays": 70,
            "floweringDays": 0,
            "fruitingDays": 0,
            "harvestDurationDays": 21,
            "totalCycleDays": 91
        },
        "yieldInfo": {
            "yieldPerPlant": 0.4,
            "yieldUnit": "kg",
            "expectedWastePercentage": 20
        },
        "fertilizerSchedule": {
            "germinationStage": {"npk": "5-5-5", "frequency": "weekly"},
            "vegetativeStage": {"npk": "10-5-7", "frequency": "weekly"},
            "floweringStage": {"npk": "0-0-0", "frequency": "none"},
            "fruitingStage": {"npk": "0-0-0", "frequency": "none"}
        },
        "hydroponicInfo": {
            "ecRange": {"min": 1.6, "max": 2.2},
            "phRange": {"min": 5.5, "max": 6.5},
            "optimalTemperature": {"min": 12, "max": 18},
            "lightRequirement": "medium",
            "dli": {"min": 12, "max": 16},
            "ppfd": {"min": 200, "max": 300},
            "waterRequirementPerDay": 0.6
        },
        "pests": [
            {
                "name": "Aphids",
                "severity": "medium",
                "organicControl": "Insecticidal soap, neem oil",
                "biologicalControl": "Aphidius wasps, ladybugs",
                "culturalPractices": "Monitor tight heads carefully, spray if needed"
            },
            {
                "name": "Flea Beetles",
                "severity": "low",
                "organicControl": "Neem oil, kaolin clay",
                "biologicalControl": "None specific",
                "culturalPractices": "Row covers, trap crops"
            }
        ],
        "diseases": [
            {
                "name": "Bottom Rot (Rhizoctonia)",
                "severity": "medium",
                "symptoms": "Brown rot at base of head",
                "organicControl": "Remove infected plants, biological fungicides",
                "prevention": "Good drainage, avoid water contact with leaves, air circulation"
            },
            {
                "name": "Tip Burn",
                "severity": "low",
                "symptoms": "Brown edges on inner leaves",
                "organicControl": "Foliar calcium spray",
                "prevention": "Consistent watering, adequate calcium, temperature control"
            }
        ],
        "environmentalRequirements": {
            "temperature": {"min": 10, "max": 20, "optimal": 15},
            "humidity": {"min": 50, "max": 70, "optimal": 60},
            "lightHours": {"min": 12, "max": 14, "optimal": 12},
            "co2": 800,
            "soilPh": {"min": 6.0, "max": 6.8}
        },
        "uaeAdaptations": {
            "heatTolerance": "low",
            "coldTolerance": "high",
            "waterRequirement": "medium",
            "greenhouseRequired": True,
            "summerOutdoorSuitable": False,
            "winterOutdoorSuitable": True,
            "bestPlantingMonths": [11, 12, 1],
            "localChallenges": "Requires cool temperatures AND cold exposure to develop red color; long maturity time (90+ days); bitter flavor can be intense",
            "localRecommendations": "Premium specialty crop for UAE market; Italian chicory with deep red/purple leaves; needs cool nights to develop color; grow in climate-controlled greenhouse Dec-Feb; popular in restaurants; bitter flavor mellows when grilled"
        },
        "companionPlants": {
            "goodCompanions": ["Onion", "Carrot", "Radish"],
            "badCompanions": ["None specific"],
            "reasoning": "Compatible with most vegetables; benefits from root crops"
        },
        "economicInfo": {
            "marketPrice": 25.0,
            "priceUnit": "AED/kg",
            "marketDemand": "medium",
            "shelfLife": 14,
            "storageRequirements": "Refrigerated 2-4°C, high humidity 95-98%"
        },
        "qualityGrading": {
            "premiumCriteria": "Tight compact heads, deep red/purple color, white ribs, crisp texture, no tip burn",
            "standardCriteria": "Reasonably compact, good color, minor imperfections ok",
            "rejectionCriteria": "Loose heads, poor color development, severe bitterness, disease, bolting"
        },
        "metadata": {
            "oldDbId": "lettuce_radicchio_old_id",
            "sources": [
                "UC Davis: Radicchio Production Guide",
                "Cornell Vegetable Program: Radicchio Culture",
                "Penn State Extension: Growing Radicchio"
            ],
            "researchDate": "2025-11-18",
            "lastUpdated": "2025-11-18"
        }
    },
    {
        "plantName": "Mulukhiyah (Jute Mallow)",
        "scientificName": "Corchorus olitorius L.",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 7,
            "vegetativeDays": 42,
            "floweringDays": 0,
            "fruitingDays": 0,
            "harvestDurationDays": 60,
            "totalCycleDays": 102
        },
        "yieldInfo": {
            "yieldPerPlant": 1.5,
            "yieldUnit": "kg",
            "expectedWastePercentage": 25
        },
        "fertilizerSchedule": {
            "germinationStage": {"npk": "5-5-5", "frequency": "weekly"},
            "vegetativeStage": {"npk": "10-10-10", "frequency": "bi-weekly"},
            "floweringStage": {"npk": "0-0-0", "frequency": "none"},
            "fruitingStage": {"npk": "0-0-0", "frequency": "none"}
        },
        "hydroponicInfo": {
            "ecRange": {"min": 1.8, "max": 2.4},
            "phRange": {"min": 6.0, "max": 7.0},
            "optimalTemperature": {"min": 25, "max": 35},
            "lightRequirement": "high",
            "dli": {"min": 16, "max": 20},
            "ppfd": {"min": 400, "max": 600},
            "waterRequirementPerDay": 2.0
        },
        "pests": [
            {
                "name": "Flea Beetles",
                "severity": "medium",
                "organicControl": "Neem oil, kaolin clay spray",
                "biologicalControl": "None specific",
                "culturalPractices": "Row covers on young plants, trap crops"
            },
            {
                "name": "Aphids",
                "severity": "low",
                "organicControl": "Insecticidal soap, neem oil",
                "biologicalControl": "Ladybugs, lacewings",
                "culturalPractices": "Monitor growing tips, strong water spray"
            }
        ],
        "diseases": [
            {
                "name": "Cercospora Leaf Spot",
                "severity": "medium",
                "symptoms": "Brown spots with yellow halos on leaves",
                "organicControl": "Copper fungicide, remove infected leaves",
                "prevention": "Avoid overhead watering, good air circulation, crop rotation"
            },
            {
                "name": "Root Rot",
                "severity": "low",
                "symptoms": "Wilting despite adequate water, brown roots",
                "organicControl": "Improve drainage, biological fungicides",
                "prevention": "Well-draining soil, avoid overwatering"
            }
        ],
        "environmentalRequirements": {
            "temperature": {"min": 20, "max": 40, "optimal": 30},
            "humidity": {"min": 40, "max": 80, "optimal": 60},
            "lightHours": {"min": 12, "max": 14, "optimal": 13},
            "co2": 1000,
            "soilPh": {"min": 6.0, "max": 7.5}
        },
        "uaeAdaptations": {
            "heatTolerance": "very_high",
            "coldTolerance": "very_low",
            "waterRequirement": "high",
            "greenhouseRequired": False,
            "summerOutdoorSuitable": True,
            "winterOutdoorSuitable": False,
            "bestPlantingMonths": [4, 5, 6, 7, 8, 9],
            "localChallenges": "Damaged by cold temperatures <15°C; high water requirements in summer heat",
            "localRecommendations": "THE SUMMER LEAFY GREEN FOR UAE! Thrives in heat when other greens fail; traditional Middle Eastern vegetable with HIGH local demand; multiple harvests (cut-and-come-again); plant Apr-Oct outdoors; excellent for UAE commercial production"
        },
        "companionPlants": {
            "goodCompanions": ["Okra", "Eggplant", "Pepper", "Tomato"],
            "badCompanions": ["None specific"],
            "reasoning": "Compatible with other heat-loving crops; benefits from warm-season vegetables"
        },
        "economicInfo": {
            "marketPrice": 8.0,
            "priceUnit": "AED/kg",
            "marketDemand": "very_high",
            "shelfLife": 3,
            "storageRequirements": "Refrigerated 5-7°C, high humidity; best used fresh within 3 days"
        },
        "qualityGrading": {
            "premiumCriteria": "Young tender leaves, bright green color, stems <5mm thick, no flowers",
            "standardCriteria": "Good leaf quality, acceptable stem thickness, fresh appearance",
            "rejectionCriteria": "Flowering, tough woody stems, yellowing leaves, wilted"
        },
        "metadata": {
            "oldDbId": "mulukhiyah_old_id",
            "sources": [
                "FAO: Corchorus olitorius Production",
                "AVRDC: Jute Mallow Cultivation",
                "Middle East Agricultural Research: Traditional Leafy Vegetables"
            ],
            "researchDate": "2025-11-18",
            "lastUpdated": "2025-11-18"
        }
    },
    {
        "plantName": "Zaatar (Syrian Oregano)",
        "scientificName": "Origanum syriacum L.",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 14,
            "vegetativeDays": 60,
            "floweringDays": 30,
            "fruitingDays": 0,
            "harvestDurationDays": 180,
            "totalCycleDays": 270
        },
        "yieldInfo": {
            "yieldPerPlant": 2.0,
            "yieldUnit": "kg",
            "expectedWastePercentage": 20
        },
        "fertilizerSchedule": {
            "germinationStage": {"npk": "5-5-5", "frequency": "weekly"},
            "vegetativeStage": {"npk": "10-5-7", "frequency": "bi-weekly"},
            "floweringStage": {"npk": "5-10-10", "frequency": "monthly"},
            "fruitingStage": {"npk": "0-0-0", "frequency": "none"}
        },
        "hydroponicInfo": {
            "ecRange": {"min": 1.2, "max": 1.8},
            "phRange": {"min": 6.0, "max": 7.5},
            "optimalTemperature": {"min": 20, "max": 30},
            "lightRequirement": "high",
            "dli": {"min": 14, "max": 18},
            "ppfd": {"min": 350, "max": 500},
            "waterRequirementPerDay": 1.0
        },
        "pests": [
            {
                "name": "Spider Mites",
                "severity": "medium",
                "organicControl": "Insecticidal soap, neem oil, strong water spray",
                "biologicalControl": "Predatory mites (Phytoseiulus persimilis)",
                "culturalPractices": "Increase humidity, remove infested leaves"
            },
            {
                "name": "Aphids",
                "severity": "low",
                "organicControl": "Insecticidal soap, neem oil",
                "biologicalControl": "Ladybugs, lacewings",
                "culturalPractices": "Monitor growing tips and flower buds"
            }
        ],
        "diseases": [
            {
                "name": "Root Rot (Pythium)",
                "severity": "medium",
                "symptoms": "Wilting, yellowing despite adequate water, brown mushy roots",
                "organicControl": "Improve drainage, biological fungicides",
                "prevention": "Well-draining soil, avoid overwatering, good air circulation"
            },
            {
                "name": "Powdery Mildew",
                "severity": "low",
                "symptoms": "White powdery coating on leaves",
                "organicControl": "Sulfur spray, potassium bicarbonate, milk spray",
                "prevention": "Good air circulation, avoid overhead watering, reduce humidity"
            }
        ],
        "environmentalRequirements": {
            "temperature": {"min": 15, "max": 35, "optimal": 25},
            "humidity": {"min": 30, "max": 60, "optimal": 45},
            "lightHours": {"min": 10, "max": 14, "optimal": 12},
            "co2": 800,
            "soilPh": {"min": 6.5, "max": 8.0}
        },
        "uaeAdaptations": {
            "heatTolerance": "high",
            "coldTolerance": "medium",
            "waterRequirement": "low",
            "greenhouseRequired": False,
            "summerOutdoorSuitable": True,
            "winterOutdoorSuitable": True,
            "bestPlantingMonths": [10, 11, 12, 1, 2, 3],
            "localChallenges": "Slow initial growth; requires well-drained soil to prevent root rot in summer irrigation",
            "localRecommendations": "PERFECT FOR UAE! Perennial herb with year-round production; drought-tolerant once established; traditional Middle Eastern herb with VERY HIGH local demand; plant Oct-Mar for establishment; multiple harvests annually; excellent for commercial herb production"
        },
        "companionPlants": {
            "goodCompanions": ["Rosemary", "Sage", "Thyme", "Lavender", "Tomato"],
            "badCompanions": ["None specific"],
            "reasoning": "Compatible with other Mediterranean herbs; aromatic oils may deter pests"
        },
        "economicInfo": {
            "marketPrice": 40.0,
            "priceUnit": "AED/kg",
            "marketDemand": "very_high",
            "shelfLife": 7,
            "storageRequirements": "Refrigerated 2-4°C OR dried for long-term storage; fresh bunches in high humidity"
        },
        "qualityGrading": {
            "premiumCriteria": "Aromatic leaves, no flowers, bright green-gray color, tender stems, strong flavor",
            "standardCriteria": "Good aroma, some flowers acceptable, fresh appearance",
            "rejectionCriteria": "Woody stems, yellowing, disease, weak aroma, excessive flowering"
        },
        "metadata": {
            "oldDbId": "zaatar_old_id",
            "sources": [
                "ICARDA: Middle Eastern Herb Production",
                "Missouri Botanical Garden: Origanum Species",
                "Royal Botanic Gardens Kew: Zaatar Conservation"
            ],
            "researchDate": "2025-11-18",
            "lastUpdated": "2025-11-18"
        }
    }
]

# Load existing JSON
with open('OldData/plants-from-old-db-enhanced.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Add new plants
data['plants'].extend(phase1_remaining_plants)

# Update metadata
data['metadata']['plants_completed'] = 28
data['metadata']['last_updated'] = '2025-11-18'

# Save
with open('OldData/plants-from-old-db-enhanced.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("SUCCESS: Added 7 Phase 1 remaining plants successfully!")
print(f"Total plants in JSON: {len(data['plants'])}")
print("Phase 1 (Leafy Greens & Herbs): COMPLETE - 13/13 plants")
print("Overall progress: 28/39 plants (72%)")
