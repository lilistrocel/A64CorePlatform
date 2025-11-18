#!/usr/bin/env python3
"""
Add Phase 4 Part 1 Plants (5 vegetables)
Plants: Green Bean, Yard Long Bean, Cabbage, Cauliflower, Celery
Source: PHASE4_OTHER_VEG_RESEARCH_COMPLETE.md
"""

import json

phase4_part1_plants = [
    {
        "plantName": "Bean - Green (Bush Bean)",
        "scientificName": "Phaseolus vulgaris L.",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 10,
            "vegetativeDays": 25,
            "floweringDays": 9,
            "fruitingDays": 18,
            "harvestDurationDays": 18,
            "totalCycleDays": 63
        },
        "yieldInfo": {
            "yieldPerPlant": 0.75,
            "yieldUnit": "kg",
            "expectedWastePercentage": 10
        },
        "fertilizerSchedule": {
            "germinationStage": {"npk": "5-5-5", "frequency": "weekly"},
            "vegetativeStage": {"npk": "10-10-10", "frequency": "weekly"},
            "floweringStage": {"npk": "5-15-15", "frequency": "weekly"},
            "fruitingStage": {"npk": "5-20-20", "frequency": "weekly"}
        },
        "hydroponicInfo": {
            "ecRange": {"min": 2.0, "max": 4.0},
            "phRange": {"min": 6.0, "max": 6.5},
            "optimalTemperature": {"min": 18, "max": 24},
            "lightRequirement": "high",
            "dli": {"min": 14, "max": 18},
            "ppfd": {"min": 400, "max": 600},
            "waterRequirementPerDay": 1.75
        },
        "pests": [
            {
                "name": "Aphids",
                "severity": "medium",
                "organicControl": "Insecticidal soap, neem oil",
                "biologicalControl": "Ladybugs, lacewings, Aphidius wasps",
                "culturalPractices": "Remove infested plants, control ants"
            },
            {
                "name": "Spider Mites",
                "severity": "medium",
                "organicControl": "Strong water spray, insecticidal soap",
                "biologicalControl": "Predatory mites (Phytoseiulus persimilis)",
                "culturalPractices": "Increase humidity, avoid water stress"
            }
        ],
        "diseases": [
            {
                "name": "Bean Common Mosaic Virus",
                "severity": "high",
                "symptoms": "Mottled yellow-green leaves, stunted growth",
                "organicControl": "Remove infected plants immediately",
                "prevention": "Use certified virus-free seed, control aphids early, avoid touching wet plants"
            },
            {
                "name": "Powdery Mildew",
                "severity": "medium",
                "symptoms": "White powdery coating on leaves",
                "organicControl": "Sulfur spray, potassium bicarbonate",
                "prevention": "Good air circulation, avoid overhead watering"
            }
        ],
        "environmentalRequirements": {
            "temperature": {"min": 15, "max": 32, "optimal": 24},
            "humidity": {"min": 50, "max": 70, "optimal": 60},
            "lightHours": {"min": 12, "max": 14, "optimal": 13},
            "co2": 900,
            "soilPh": {"min": 6.0, "max": 7.0}
        },
        "uaeAdaptations": {
            "heatTolerance": "medium",
            "coldTolerance": "very_low",
            "waterRequirement": "medium_high",
            "greenhouseRequired": True,
            "summerOutdoorSuitable": False,
            "winterOutdoorSuitable": True,
            "bestPlantingMonths": [10, 11, 12, 1, 2, 3],
            "localChallenges": "Summer heat >35°C causes flower drop and poor pod set; requires shade or greenhouse cooling",
            "localRecommendations": "Grow Oct-Apr outdoors for best yields; fast crop (60 days); nitrogen-fixing reduces fertilizer costs; popular vegetable with steady local demand"
        },
        "companionPlants": {
            "goodCompanions": ["Corn", "Celery", "Cucumber", "Potato", "Carrot", "Radish"],
            "badCompanions": ["Onion", "Garlic", "Fennel"],
            "reasoning": "Legumes fix nitrogen benefiting heavy feeders; alliums stunt bean growth"
        },
        "economicInfo": {
            "marketPrice": 12.5,
            "priceUnit": "AED/kg",
            "marketDemand": "high",
            "shelfLife": 8,
            "storageRequirements": "Refrigerated 7°C, high humidity 95%"
        },
        "qualityGrading": {
            "premiumCriteria": "Straight pods 10-15 cm, tender, bright green, no seeds visible, crisp snap",
            "standardCriteria": "Good pod shape, minor blemishes ok, slightly larger seeds ok",
            "rejectionCriteria": "Tough fibrous pods, bulging seeds, yellowing, disease"
        },
        "metadata": {
            "oldDbId": "bean_green_old_id",
            "sources": [
                "UC Davis IPM: Bean Pest Management",
                "NC State Extension: Bush Bean Production",
                "USDA PLANTS: Phaseolus vulgaris"
            ],
            "researchDate": "2025-11-18",
            "lastUpdated": "2025-11-18"
        }
    },
    {
        "plantName": "Bean - Long (Yard Long Bean)",
        "scientificName": "Vigna unguiculata subsp. sesquipedalis (L.) Verdc.",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 8,
            "vegetativeDays": 32,
            "floweringDays": 12,
            "fruitingDays": 25,
            "harvestDurationDays": 38,
            "totalCycleDays": 80
        },
        "yieldInfo": {
            "yieldPerPlant": 2.75,
            "yieldUnit": "kg",
            "expectedWastePercentage": 10
        },
        "fertilizerSchedule": {
            "germinationStage": {"npk": "5-5-5", "frequency": "weekly"},
            "vegetativeStage": {"npk": "10-10-10", "frequency": "bi-weekly"},
            "floweringStage": {"npk": "5-15-15", "frequency": "weekly"},
            "fruitingStage": {"npk": "5-20-20", "frequency": "weekly"}
        },
        "hydroponicInfo": {
            "ecRange": {"min": 2.0, "max": 3.5},
            "phRange": {"min": 5.5, "max": 6.5},
            "optimalTemperature": {"min": 22, "max": 28},
            "lightRequirement": "high",
            "dli": {"min": 16, "max": 20},
            "ppfd": {"min": 450, "max": 650},
            "waterRequirementPerDay": 2.5
        },
        "pests": [
            {
                "name": "Pod Borers",
                "severity": "high",
                "organicControl": "Bt (Bacillus thuringiensis), neem oil",
                "biologicalControl": "Trichogramma wasps",
                "culturalPractices": "Remove infested pods, pheromone traps"
            },
            {
                "name": "Aphids",
                "severity": "medium",
                "organicControl": "Insecticidal soap, neem oil",
                "biologicalControl": "Ladybugs, lacewings",
                "culturalPractices": "Monitor new growth"
            }
        ],
        "diseases": [
            {
                "name": "Rust",
                "severity": "medium",
                "symptoms": "Orange-brown pustules on leaves",
                "organicControl": "Sulfur spray, copper fungicide",
                "prevention": "Good air circulation, avoid overhead watering"
            },
            {
                "name": "Anthracnose",
                "severity": "medium",
                "symptoms": "Dark sunken lesions on pods and stems",
                "organicControl": "Copper fungicide, remove infected plants",
                "prevention": "Use disease-free seed, avoid working with wet plants"
            }
        ],
        "environmentalRequirements": {
            "temperature": {"min": 20, "max": 38, "optimal": 30},
            "humidity": {"min": 50, "max": 80, "optimal": 65},
            "lightHours": {"min": 12, "max": 14, "optimal": 13},
            "co2": 900,
            "soilPh": {"min": 5.5, "max": 7.0}
        },
        "uaeAdaptations": {
            "heatTolerance": "very_high",
            "coldTolerance": "very_low",
            "waterRequirement": "high",
            "greenhouseRequired": False,
            "summerOutdoorSuitable": True,
            "winterOutdoorSuitable": False,
            "bestPlantingMonths": [3, 4, 5, 6, 7, 8, 9],
            "localChallenges": "Requires tall trellis (2-3 m); pods must be harvested young (30-40 cm) before they get tough",
            "localRecommendations": "PERFECT for UAE summer production when other beans fail! Heat-loving tropical bean; highly popular in Asian cuisine with large UAE demand; continuous harvest for 6-8 weeks"
        },
        "companionPlants": {
            "goodCompanions": ["Corn", "Cucumber", "Eggplant", "Radish"],
            "badCompanions": ["Onion", "Garlic", "Fennel"],
            "reasoning": "Benefits from tall support crops; alliums inhibit growth"
        },
        "economicInfo": {
            "marketPrice": 15.0,
            "priceUnit": "AED/kg",
            "marketDemand": "very_high",
            "shelfLife": 8,
            "storageRequirements": "Refrigerated 7-10°C, high humidity 95%"
        },
        "qualityGrading": {
            "premiumCriteria": "Long pods 30-40 cm, pencil-thin, tender, bright green, no seeds visible, crisp",
            "standardCriteria": "Pods 40-50 cm, slightly thicker, minor blemishes ok",
            "rejectionCriteria": "Tough fibrous pods, bulging seeds, yellowing, >50 cm (too tough)"
        },
        "metadata": {
            "oldDbId": "bean_long_old_id",
            "sources": [
                "USDA PLANTS: Vigna unguiculata",
                "NC State Extension: Asparagus Bean",
                "Epic Gardening: Yardlong Bean Guide"
            ],
            "researchDate": "2025-11-18",
            "lastUpdated": "2025-11-18"
        }
    },
    {
        "plantName": "Cabbage - Round (Green Cabbage)",
        "scientificName": "Brassica oleracea var. capitata L.",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 8,
            "vegetativeDays": 70,
            "floweringDays": 0,
            "fruitingDays": 0,
            "harvestDurationDays": 10,
            "totalCycleDays": 85
        },
        "yieldInfo": {
            "yieldPerPlant": 1.75,
            "yieldUnit": "kg",
            "expectedWastePercentage": 20
        },
        "fertilizerSchedule": {
            "germinationStage": {"npk": "5-5-5", "frequency": "weekly"},
            "vegetativeStage": {"npk": "15-5-10", "frequency": "weekly"},
            "floweringStage": {"npk": "10-10-15", "frequency": "weekly"},
            "fruitingStage": {"npk": "5-10-15", "frequency": "bi-weekly"}
        },
        "hydroponicInfo": {
            "ecRange": {"min": 2.5, "max": 3.0},
            "phRange": {"min": 6.0, "max": 6.5},
            "optimalTemperature": {"min": 16, "max": 20},
            "lightRequirement": "medium_high",
            "dli": {"min": 14, "max": 17},
            "ppfd": {"min": 300, "max": 450},
            "waterRequirementPerDay": 2.5
        },
        "pests": [
            {
                "name": "Cabbage Aphid",
                "severity": "high",
                "organicControl": "Insecticidal soap, neem oil, pyrethrin",
                "biologicalControl": "Ladybugs, lacewings, Aphidius wasps",
                "culturalPractices": "Remove infested plants, reflective mulch"
            },
            {
                "name": "Cabbage Looper",
                "severity": "high",
                "organicControl": "Bt (Bacillus thuringiensis), Spinosad",
                "biologicalControl": "Trichogramma wasps, parasitic flies",
                "culturalPractices": "Row covers, hand-pick larvae"
            }
        ],
        "diseases": [
            {
                "name": "Clubroot",
                "severity": "very_high",
                "symptoms": "Swollen distorted roots, wilting, stunted growth",
                "organicControl": "Raise pH to 7.2+, remove infected plants",
                "prevention": "Use disease-free transplants, long crop rotation (7+ years), lime soil"
            },
            {
                "name": "Black Rot",
                "severity": "high",
                "symptoms": "V-shaped yellow lesions from leaf margins, black veins",
                "organicControl": "Copper fungicide, remove infected plants",
                "prevention": "Use clean seed, avoid overhead watering, destroy crop debris"
            }
        ],
        "environmentalRequirements": {
            "temperature": {"min": 5, "max": 25, "optimal": 18},
            "humidity": {"min": 50, "max": 70, "optimal": 60},
            "lightHours": {"min": 12, "max": 16, "optimal": 14},
            "co2": 900,
            "soilPh": {"min": 6.0, "max": 7.5}
        },
        "uaeAdaptations": {
            "heatTolerance": "very_low",
            "coldTolerance": "high",
            "waterRequirement": "high",
            "greenhouseRequired": True,
            "summerOutdoorSuitable": False,
            "winterOutdoorSuitable": True,
            "bestPlantingMonths": [10, 11, 12, 1, 2],
            "localChallenges": "Requires cool temperatures; UAE summer too hot; clubroot risk in contaminated media; heavy feeder needing high nitrogen",
            "localRecommendations": "Grow only Nov-Mar outdoors or year-round in climate-controlled greenhouse (16-20°C); choose fast-maturing varieties (70-80 days) for UAE winter window"
        },
        "companionPlants": {
            "goodCompanions": ["Onion", "Celery", "Beet", "Potato", "Dill"],
            "badCompanions": ["Strawberry", "Tomato", "Pole Beans"],
            "reasoning": "Aromatic herbs repel cabbage pests; avoid heavy feeders competing for nutrients"
        },
        "economicInfo": {
            "marketPrice": 5.0,
            "priceUnit": "AED/kg",
            "marketDemand": "high",
            "shelfLife": 75,
            "storageRequirements": "Refrigerated 0-2°C, very high humidity 95-98%"
        },
        "qualityGrading": {
            "premiumCriteria": "Tight solid heads 1.5-2.5 kg, uniform green color, no splits, crisp texture",
            "standardCriteria": "Reasonably tight heads, minor outer leaf damage ok",
            "rejectionCriteria": "Loose heads, splitting, yellowing, insect damage, disease"
        },
        "metadata": {
            "oldDbId": "cabbage_round_old_id",
            "sources": [
                "UC Davis IPM: Cabbage Pest Management",
                "NC State Extension: Cabbage Production",
                "Cornell Vegetable Program: Brassica Culture"
            ],
            "researchDate": "2025-11-18",
            "lastUpdated": "2025-11-18"
        }
    },
    {
        "plantName": "Cauliflower",
        "scientificName": "Brassica oleracea var. botrytis L.",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 8,
            "vegetativeDays": 60,
            "floweringDays": 25,
            "fruitingDays": 0,
            "harvestDurationDays": 5,
            "totalCycleDays": 88
        },
        "yieldInfo": {
            "yieldPerPlant": 1.15,
            "yieldUnit": "kg",
            "expectedWastePercentage": 40
        },
        "fertilizerSchedule": {
            "germinationStage": {"npk": "5-5-5", "frequency": "weekly"},
            "vegetativeStage": {"npk": "15-5-10", "frequency": "weekly"},
            "floweringStage": {"npk": "10-10-15", "frequency": "weekly"},
            "fruitingStage": {"npk": "5-15-20", "frequency": "weekly"}
        },
        "hydroponicInfo": {
            "ecRange": {"min": 2.5, "max": 3.0},
            "phRange": {"min": 6.0, "max": 7.0},
            "optimalTemperature": {"min": 16, "max": 20},
            "lightRequirement": "medium_high",
            "dli": {"min": 14, "max": 17},
            "ppfd": {"min": 300, "max": 450},
            "waterRequirementPerDay": 3.0
        },
        "pests": [
            {
                "name": "Cabbage Aphid",
                "severity": "high",
                "organicControl": "Insecticidal soap, neem oil",
                "biologicalControl": "Ladybugs, Aphidius wasps",
                "culturalPractices": "Monitor regularly, remove infested leaves"
            },
            {
                "name": "Cabbage Looper",
                "severity": "high",
                "organicControl": "Bt (Bacillus thuringiensis), Spinosad",
                "biologicalControl": "Trichogramma wasps",
                "culturalPractices": "Row covers, inspect for eggs"
            }
        ],
        "diseases": [
            {
                "name": "Clubroot",
                "severity": "very_high",
                "symptoms": "Swollen roots, stunted plants, wilting",
                "organicControl": "Raise pH to 7.2+, long rotation",
                "prevention": "Clean media, avoid contaminated soil"
            },
            {
                "name": "Black Rot",
                "severity": "high",
                "symptoms": "V-shaped yellow lesions, black veins, curd discoloration",
                "organicControl": "Copper fungicide, remove infected plants",
                "prevention": "Clean seed, avoid overhead watering"
            }
        ],
        "environmentalRequirements": {
            "temperature": {"min": 5, "max": 24, "optimal": 16},
            "humidity": {"min": 50, "max": 70, "optimal": 60},
            "lightHours": {"min": 12, "max": 16, "optimal": 14},
            "co2": 900,
            "soilPh": {"min": 6.5, "max": 7.5}
        },
        "uaeAdaptations": {
            "heatTolerance": "very_low",
            "coldTolerance": "high",
            "waterRequirement": "very_high",
            "greenhouseRequired": True,
            "summerOutdoorSuitable": False,
            "winterOutdoorSuitable": False,
            "bestPlantingMonths": [11, 12, 1],
            "localChallenges": "MOST DIFFICULT brassica! Temperature swings cause buttoning (tiny heads), uneven temps cause ricey/fuzzy curds, high heat prevents curd formation; requires precise 15-20°C range",
            "localRecommendations": "Only for experienced growers with climate-controlled greenhouses; choose fast-maturing varieties (60-70 days); self-blanching white varieties; popular in UAE but challenging to grow"
        },
        "companionPlants": {
            "goodCompanions": ["Onion", "Celery", "Beet", "Dill"],
            "badCompanions": ["Strawberry", "Tomato"],
            "reasoning": "Aromatic herbs deter pests; avoid heavy feeders"
        },
        "economicInfo": {
            "marketPrice": 10.0,
            "priceUnit": "AED/kg",
            "marketDemand": "very_high",
            "shelfLife": 17,
            "storageRequirements": "Refrigerated 0-2°C, high humidity 95%, plastic film"
        },
        "qualityGrading": {
            "premiumCriteria": "Tight compact white curd, 15-20 cm diameter, no discoloration, no ricey/fuzzy texture, clean",
            "standardCriteria": "Slight yellowing ok, minor blemishes, reasonably compact",
            "rejectionCriteria": "Ricey/fuzzy curd, severe discoloration, insect damage, disease, loose curd"
        },
        "metadata": {
            "oldDbId": "cauliflower_old_id",
            "sources": [
                "UC Davis IPM: Cauliflower Pest Management",
                "Cornell Vegetable Program: Cauliflower Culture",
                "Johnny's Seeds: Temperature management"
            ],
            "researchDate": "2025-11-18",
            "lastUpdated": "2025-11-18"
        }
    },
    {
        "plantName": "Celery",
        "scientificName": "Apium graveolens L.",
        "farmTypeCompatibility": ["greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 18,
            "vegetativeDays": 105,
            "floweringDays": 0,
            "fruitingDays": 0,
            "harvestDurationDays": 10,
            "totalCycleDays": 125
        },
        "yieldInfo": {
            "yieldPerPlant": 1.0,
            "yieldUnit": "kg",
            "expectedWastePercentage": 30
        },
        "fertilizerSchedule": {
            "germinationStage": {"npk": "5-5-5", "frequency": "weekly"},
            "vegetativeStage": {"npk": "12-5-8", "frequency": "weekly"},
            "floweringStage": {"npk": "15-5-10", "frequency": "weekly"},
            "fruitingStage": {"npk": "10-10-15", "frequency": "weekly"}
        },
        "hydroponicInfo": {
            "ecRange": {"min": 1.8, "max": 2.4},
            "phRange": {"min": 6.0, "max": 6.5},
            "optimalTemperature": {"min": 16, "max": 20},
            "lightRequirement": "medium",
            "dli": {"min": 12, "max": 16},
            "ppfd": {"min": 250, "max": 400},
            "waterRequirementPerDay": 2.5
        },
        "pests": [
            {
                "name": "Celery Aphid",
                "severity": "high",
                "organicControl": "Insecticidal soap, neem oil",
                "biologicalControl": "Aphidius wasps, ladybugs",
                "culturalPractices": "Yellow sticky traps, remove infested plants early"
            },
            {
                "name": "Celery Leafminer",
                "severity": "high",
                "organicControl": "Spinosad, remove mined leaves",
                "biologicalControl": "Parasitic wasps (Diglyphus isaea)",
                "culturalPractices": "Yellow sticky traps, destroy infested leaves"
            }
        ],
        "diseases": [
            {
                "name": "Late Blight",
                "severity": "high",
                "symptoms": "Small brown spots with yellow halos on leaves",
                "organicControl": "Copper fungicide, remove infected plants",
                "prevention": "Avoid overhead watering, good air circulation, certified seed"
            },
            {
                "name": "Black Heart",
                "severity": "medium",
                "symptoms": "Black dead tissue in center of plant (calcium deficiency)",
                "organicControl": "Foliar calcium spray, calcium nitrate",
                "prevention": "Consistent watering, adequate calcium in nutrient solution"
            }
        ],
        "environmentalRequirements": {
            "temperature": {"min": 10, "max": 24, "optimal": 18},
            "humidity": {"min": 60, "max": 80, "optimal": 70},
            "lightHours": {"min": 14, "max": 16, "optimal": 15},
            "co2": 900,
            "soilPh": {"min": 6.0, "max": 7.0}
        },
        "uaeAdaptations": {
            "heatTolerance": "very_low",
            "coldTolerance": "medium",
            "waterRequirement": "very_high",
            "greenhouseRequired": True,
            "summerOutdoorSuitable": False,
            "winterOutdoorSuitable": False,
            "bestPlantingMonths": [11, 12, 1],
            "localChallenges": "VERY LONG growth cycle (120+ days) difficult in UAE short cool season; extremely sensitive to water stress; bolts quickly when temps rise",
            "localRecommendations": "DIFFICULT crop for UAE! Only attempt in climate-controlled greenhouse with 16-20°C year-round; choose faster varieties (100-110 days); very high water needs"
        },
        "companionPlants": {
            "goodCompanions": ["Cabbage", "Cauliflower", "Leek", "Tomato", "Bush Beans"],
            "badCompanions": ["Corn", "Aster flowers"],
            "reasoning": "Benefits from brassicas; avoid crops that attract similar pests"
        },
        "economicInfo": {
            "marketPrice": 17.5,
            "priceUnit": "AED/kg",
            "marketDemand": "high",
            "shelfLife": 17,
            "storageRequirements": "Refrigerated 0-2°C, very high humidity 95-98%, plastic bag"
        },
        "qualityGrading": {
            "premiumCriteria": "Crisp thick stalks, light green color, tight bunch, no stringiness, no black heart, 30-40 cm tall",
            "standardCriteria": "Reasonably crisp, some stringiness ok, minor blemishes",
            "rejectionCriteria": "Limp/wilted stalks, severe stringiness, black heart, disease, brown discoloration"
        },
        "metadata": {
            "oldDbId": "celery_old_id",
            "sources": [
                "UC Davis IPM: Celery Pest Management",
                "Cornell Vegetable Program: Celery Production",
                "NC State Extension: Celery Culture"
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
data['plants'].extend(phase4_part1_plants)

# Update metadata
data['metadata']['plants_completed'] = 33
data['metadata']['last_updated'] = '2025-11-18'

# Save
with open('OldData/plants-from-old-db-enhanced.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("SUCCESS: Added 5 Phase 4 Part 1 plants successfully!")
print(f"Total plants in JSON: {len(data['plants'])}")
print("Phase 4 Part 1 (Green Bean, Yard Long Bean, Cabbage, Cauliflower, Celery): COMPLETE")
print("Overall progress: 33/39 plants (85%)")
