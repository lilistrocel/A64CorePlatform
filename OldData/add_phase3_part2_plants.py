import json
import sys
import os

# Set up UTF-8 encoding for Windows
if sys.platform == "win32":
    os.system("chcp 65001 > nul")
    sys.stdout.reconfigure(encoding='utf-8')

# Load the existing JSON file
with open('plants-from-old-db-enhanced.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Phase 3 Part 2: Remaining 4 melons & squash
phase3_part2_plants = [
    {
        "plantName": "Apple Melon",
        "scientificName": "Cucumis melo L. var. dudaim",
        "farmTypeCompatibility": ["open_field", "greenhouse"],
        "growthCycle": {
            "germinationDays": 6,
            "vegetativeDays": 32,
            "floweringDays": 14,
            "fruitingDays": 43,
            "harvestDurationDays": 7,
            "totalCycleDays": 95
        },
        "yieldInfo": {
            "yieldPerPlant": 4.5,
            "yieldUnit": "kg",
            "expectedWastePercentage": 20
        },
        "fertilizerSchedule": [
            {
                "stage": "preplant",
                "fertilizerType": "Compost-enriched soil",
                "quantityPerPlant": 80,
                "quantityUnit": "grams",
                "frequencyDays": 0,
                "npkRatio": "N/A",
                "notes": "Similar to other Cucumis melo"
            },
            {
                "stage": "vegetative",
                "fertilizerType": "Balanced fertilizer",
                "quantityPerPlant": 25,
                "quantityUnit": "grams",
                "frequencyDays": 21,
                "npkRatio": "10-10-10",
                "notes": "Initially"
            },
            {
                "stage": "fruiting",
                "fertilizerType": "High P-K fertilizer",
                "quantityPerPlant": 30,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "5-10-10",
                "notes": "For fruit development"
            }
        ],
        "pesticideSchedule": [
            {
                "stage": "vegetative",
                "pesticideType": "Floating row covers",
                "targetPest": "Aphids, cucumber beetles",
                "quantityPerPlant": 0,
                "quantityUnit": "none",
                "frequencyDays": 0,
                "safetyNotes": "Remove for pollination.",
                "preharvestIntervalDays": 0
            },
            {
                "stage": "fruiting",
                "pesticideType": "Insecticidal soap",
                "targetPest": "Aphids, spider mites",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 14,
                "safetyNotes": "Organic solution.",
                "preharvestIntervalDays": 0
            }
        ],
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 18.0,
                "maxCelsius": 30.0,
                "optimalCelsius": 24.0
            },
            "humidity": {
                "minPercentage": 50,
                "maxPercentage": 70,
                "optimalPercentage": 60
            },
            "light": {
                "hoursPerDay": 8,
                "minLux": 35000,
                "maxLux": 75000,
                "ppfd": "500-700 μmol/m²/s",
                "photoperiodSensitivity": "day-neutral"
            },
            "co2": {
                "minPpm": 400,
                "optimalPpm": 800
            },
            "airCirculation": {
                "required": True,
                "notes": "Good air circulation for pollination"
            }
        },
        "wateringRequirements": {
            "frequencyDays": 3,
            "amountPerPlant": 1200,
            "amountUnit": "ml",
            "waterQuality": "Clean, pH 5.8-6.4",
            "droughtTolerance": "low"
        },
        "soilRequirements": {
            "phRange": {
                "min": 6.0,
                "max": 6.8
            },
            "soilTypes": ["loam", "sandy-loam", "well-drained"],
            "organicMatterPercentage": 5,
            "hydroponics": {
                "ec": {
                    "min": 1.5,
                    "max": 2.0
                },
                "tds": {
                    "min": 750,
                    "max": 1000
                },
                "ph": {
                    "min": 5.8,
                    "max": 6.4
                }
            }
        },
        "commonDiseasesAndPests": [
            {
                "name": "Aphids",
                "scientificName": "Multiple species",
                "symptoms": "Leaf curling, honeydew, virus vectors",
                "prevention": "Reflective mulches, beneficial insects",
                "treatment": "Insecticidal soap, neem oil",
                "severity": "medium"
            },
            {
                "name": "Powdery Mildew",
                "scientificName": "Podosphaera xanthii",
                "symptoms": "White powdery coating on leaves",
                "prevention": "Good air circulation",
                "treatment": "Sulfur fungicides",
                "severity": "medium"
            }
        ],
        "spacingAndSupport": {
            "plantSpacingCm": 60,
            "rowSpacingCm": 120,
            "plantsPerSqMeter": 1.4,
            "supportRequired": False,
            "supportType": "none (smaller plant than other melons)"
        },
        "companionPlanting": {
            "beneficialCompanions": ["Corn", "Radish", "Beans", "Marigolds"],
            "incompatiblePlants": ["Potatoes", "Other melons"]
        },
        "qualityGrading": {
            "grades": [
                {
                    "grade": "A",
                    "description": "Striped yellow/orange skin, very fragrant, 300-500g",
                    "priceMultiplier": 1.0
                },
                {
                    "grade": "B",
                    "description": "200-300g, minor marks acceptable",
                    "priceMultiplier": 0.75
                }
            ]
        },
        "economics": {
            "marketPricePerKg": 20.0,
            "laborHoursPerPlant": 0.3
        },
        "uaeAdaptations": {
            "growingSeason": "Warm season - March to June",
            "plantingMonths": ["March", "April", "May"],
            "harvestMonths": ["June", "July", "August"],
            "heatTolerance": "high",
            "waterRequirement": "medium-high",
            "greenhouseRecommended": False,
            "notes": "SPECIALTY CROP for UAE! Small ornamental fruits (200-500g) with apple-like appearance and fragrant aroma. Traditionally used for fragrance, young fruits edible. Novelty crop for specialty markets. Less common than other melons but growing interest. Compact plants suitable for smaller spaces. Unique product differentiation. Also known as Queen Anne melon or Pocket melon."
        }
    },
    {
        "plantName": "Ash Gourd (Winter Melon)",
        "scientificName": "Benincasa hispida (Thunb.) Cogn.",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 10,
            "vegetativeDays": 35,
            "floweringDays": 21,
            "fruitingDays": 60,
            "harvestDurationDays": 14,
            "totalCycleDays": 115
        },
        "yieldInfo": {
            "yieldPerPlant": 30.0,
            "yieldUnit": "kg",
            "expectedWastePercentage": 30
        },
        "fertilizerSchedule": [
            {
                "stage": "preplant",
                "fertilizerType": "All-purpose fertilizer with organic matter",
                "quantityPerPlant": 100,
                "quantityUnit": "grams",
                "frequencyDays": 0,
                "npkRatio": "10-10-10",
                "notes": "Rich, fertile soil essential"
            },
            {
                "stage": "vegetative",
                "fertilizerType": "Balanced fertilizer",
                "quantityPerPlant": 50,
                "quantityUnit": "grams",
                "frequencyDays": 18,
                "npkRatio": "10-10-10",
                "notes": "Every 2-3 weeks during growing season"
            },
            {
                "stage": "fruiting",
                "fertilizerType": "High P-K fertilizer with compost",
                "quantityPerPlant": 60,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "5-10-10",
                "notes": "Side-dress with compost when fruiting begins. Higher K and P encourages flowering/fruiting."
            }
        ],
        "pesticideSchedule": [
            {
                "stage": "vegetative",
                "pesticideType": "Fruit bagging or Pheromone traps",
                "targetPest": "Fruit fly (specific to ash gourd)",
                "quantityPerPlant": 0,
                "quantityUnit": "none",
                "frequencyDays": 0,
                "safetyNotes": "Preventive measure at early fruit set.",
                "preharvestIntervalDays": 0
            },
            {
                "stage": "fruiting",
                "pesticideType": "Insecticidal soap or Neem oil",
                "targetPest": "Aphids, spider mites",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 14,
                "safetyNotes": "Organic solution.",
                "preharvestIntervalDays": 0
            }
        ],
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 24.0,
                "maxCelsius": 35.0,
                "optimalCelsius": 28.0
            },
            "humidity": {
                "minPercentage": 60,
                "maxPercentage": 80,
                "optimalPercentage": 70
            },
            "light": {
                "hoursPerDay": 9,
                "minLux": 40000,
                "maxLux": 80000,
                "ppfd": "600-800 μmol/m²/s",
                "photoperiodSensitivity": "day-neutral"
            },
            "co2": {
                "minPpm": 400,
                "optimalPpm": 800
            },
            "airCirculation": {
                "required": True,
                "notes": "Good air circulation prevents disease"
            }
        },
        "wateringRequirements": {
            "frequencyDays": 3,
            "amountPerPlant": 2500,
            "amountUnit": "ml",
            "waterQuality": "Clean, pH 6.0-6.8",
            "droughtTolerance": "low"
        },
        "soilRequirements": {
            "phRange": {
                "min": 6.0,
                "max": 6.8
            },
            "soilTypes": ["loam", "well-drained", "fertile"],
            "organicMatterPercentage": 6,
            "hydroponics": {
                "ec": {
                    "min": 1.8,
                    "max": 2.5
                },
                "tds": {
                    "min": 900,
                    "max": 1250
                },
                "ph": {
                    "min": 6.0,
                    "max": 6.8
                }
            }
        },
        "commonDiseasesAndPests": [
            {
                "name": "Fruit Fly",
                "scientificName": "Various species",
                "symptoms": "Larvae in fruit, fruit drop, rotting",
                "prevention": "Fruit bagging, pheromone traps, sanitation",
                "treatment": "Insecticides at early fruit set, remove infected fruits",
                "severity": "high"
            },
            {
                "name": "Powdery Mildew",
                "scientificName": "Various species",
                "symptoms": "White powdery coating on leaves",
                "prevention": "Good air circulation, resistant varieties",
                "treatment": "Sulfur fungicides",
                "severity": "medium-high"
            },
            {
                "name": "Downy Mildew",
                "scientificName": "Pseudoperonospora cubensis",
                "symptoms": "Yellow patches on leaves, downy growth underneath",
                "prevention": "Avoid overhead watering, good spacing",
                "treatment": "Fungicides (preventive)",
                "severity": "medium"
            }
        ],
        "spacingAndSupport": {
            "plantSpacingCm": 150,
            "rowSpacingCm": 200,
            "plantsPerSqMeter": 0.3,
            "supportRequired": True,
            "supportType": "strong trellis for large fruits (5-20 kg each)"
        },
        "companionPlanting": {
            "beneficialCompanions": ["Corn", "Beans", "Radish", "Marigolds"],
            "incompatiblePlants": ["Potatoes"]
        },
        "qualityGrading": {
            "grades": [
                {
                    "grade": "A",
                    "description": "Large (10-20 kg), uniform shape, waxy coating intact, firm, no blemishes",
                    "priceMultiplier": 1.0
                },
                {
                    "grade": "B",
                    "description": "5-10 kg, minor surface marks, good firmness",
                    "priceMultiplier": 0.75
                }
            ]
        },
        "economics": {
            "marketPricePerKg": 5.5,
            "laborHoursPerPlant": 0.5
        },
        "uaeAdaptations": {
            "growingSeason": "Hot season - April to August",
            "plantingMonths": ["April", "May", "June"],
            "harvestMonths": ["July", "August", "September", "October"],
            "heatTolerance": "very high",
            "waterRequirement": "high",
            "greenhouseRecommended": False,
            "notes": "EXCELLENT for UAE summer! Tropical Asian vegetable that loves extreme heat (24-32C optimal). Very large fruits (5-20 kg) with exceptional storage life (6-12 months with waxy coating). Popular in Asian cuisine. Young fruits used like squash (45-60 days), mature fruits for curries/preserves (100-120 days). Requires strong support for heavy fruits. High yield per plant. Growing demand in Asian communities. Also known as Wax Gourd, White Pumpkin, Chinese Watermelon."
        }
    },
    {
        "plantName": "Butternut Squash",
        "scientificName": "Cucurbita moschata Duchesne",
        "farmTypeCompatibility": ["open_field", "greenhouse"],
        "growthCycle": {
            "germinationDays": 10,
            "vegetativeDays": 35,
            "floweringDays": 14,
            "fruitingDays": 55,
            "harvestDurationDays": 14,
            "totalCycleDays": 105
        },
        "yieldInfo": {
            "yieldPerPlant": 15.0,
            "yieldUnit": "kg",
            "expectedWastePercentage": 25
        },
        "fertilizerSchedule": [
            {
                "stage": "preplant",
                "fertilizerType": "Compost or aged manure",
                "quantityPerPlant": 100,
                "quantityUnit": "grams",
                "frequencyDays": 0,
                "npkRatio": "N/A",
                "notes": "Fertile, organically rich soil"
            },
            {
                "stage": "vegetative",
                "fertilizerType": "Balanced fertilizer",
                "quantityPerPlant": 40,
                "quantityUnit": "grams",
                "frequencyDays": 21,
                "npkRatio": "10-10-10",
                "notes": "At planting"
            },
            {
                "stage": "fruiting",
                "fertilizerType": "High P-K fertilizer",
                "quantityPerPlant": 50,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "5-10-10",
                "notes": "Side-dress when vines run and at fruit set"
            }
        ],
        "pesticideSchedule": [
            {
                "stage": "vegetative",
                "pesticideType": "Floating row covers",
                "targetPest": "Squash vine borer (C. moschata has greater resistance)",
                "quantityPerPlant": 0,
                "quantityUnit": "none",
                "frequencyDays": 0,
                "safetyNotes": "Row covers prevent egg-laying. C. moschata more resistant than other squashes.",
                "preharvestIntervalDays": 0
            },
            {
                "stage": "fruiting",
                "pesticideType": "Insecticides for young nymphs",
                "targetPest": "Squash bugs",
                "quantityPerPlant": 3,
                "quantityUnit": "ml",
                "frequencyDays": 10,
                "safetyNotes": "Must control early. Remove egg masses manually.",
                "preharvestIntervalDays": 3
            }
        ],
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 18.0,
                "maxCelsius": 32.0,
                "optimalCelsius": 25.0
            },
            "humidity": {
                "minPercentage": 50,
                "maxPercentage": 70,
                "optimalPercentage": 60
            },
            "light": {
                "hoursPerDay": 9,
                "minLux": 35000,
                "maxLux": 75000,
                "ppfd": "500-700 μmol/m²/s",
                "photoperiodSensitivity": "day-neutral"
            },
            "co2": {
                "minPpm": 400,
                "optimalPpm": 800
            },
            "airCirculation": {
                "required": True,
                "notes": "Good ventilation for pollination and disease prevention"
            }
        },
        "wateringRequirements": {
            "frequencyDays": 3,
            "amountPerPlant": 1800,
            "amountUnit": "ml",
            "waterQuality": "Clean, pH 6.0-6.8",
            "droughtTolerance": "medium"
        },
        "soilRequirements": {
            "phRange": {
                "min": 6.0,
                "max": 6.8
            },
            "soilTypes": ["loam", "well-drained", "fertile"],
            "organicMatterPercentage": 5,
            "hydroponics": {
                "ec": {
                    "min": 2.0,
                    "max": 2.5
                },
                "tds": {
                    "min": 1000,
                    "max": 1250
                },
                "ph": {
                    "min": 6.0,
                    "max": 6.8
                }
            }
        },
        "commonDiseasesAndPests": [
            {
                "name": "Squash Vine Borer",
                "scientificName": "Melittia cucurbitae",
                "symptoms": "Wilting vines, sawdust-like frass at stem base",
                "prevention": "Row covers, crop rotation. C. moschata has GREATER RESISTANCE than other squashes.",
                "treatment": "Cut stem to remove larvae, bury stem sections to re-root",
                "severity": "medium"
            },
            {
                "name": "Squash Bugs",
                "scientificName": "Anasa tristis",
                "symptoms": "Wilting, brown spots on leaves, feeding damage",
                "prevention": "Remove egg masses, trap crops, sanitation",
                "treatment": "Insecticides when young nymphs present. Must control early.",
                "severity": "medium"
            },
            {
                "name": "Powdery Mildew",
                "scientificName": "Podosphaera xanthii",
                "symptoms": "White powdery coating on leaves",
                "prevention": "Some resistance in C. moschata. Good air circulation.",
                "treatment": "Fungicides",
                "severity": "medium"
            }
        ],
        "spacingAndSupport": {
            "plantSpacingCm": 100,
            "rowSpacingCm": 200,
            "plantsPerSqMeter": 0.5,
            "supportRequired": False,
            "supportType": "none (vining habit)"
        },
        "companionPlanting": {
            "beneficialCompanions": ["Corn", "Beans", "Radish", "Marigolds", "Nasturtiums"],
            "incompatiblePlants": ["Potatoes"]
        },
        "qualityGrading": {
            "grades": [
                {
                    "grade": "A",
                    "description": "Uniform tan color, firm, heavy, no soft spots, 1-2 kg, long neck",
                    "priceMultiplier": 1.0
                },
                {
                    "grade": "B",
                    "description": "Minor surface blemishes, 0.8-1 kg or >2 kg",
                    "priceMultiplier": 0.75
                }
            ]
        },
        "economics": {
            "marketPricePerKg": 8.0,
            "laborHoursPerPlant": 0.4
        },
        "uaeAdaptations": {
            "growingSeason": "Warm season - March to June, September to November",
            "plantingMonths": ["March", "April", "May", "September", "October"],
            "harvestMonths": ["June", "July", "August", "November", "December", "January"],
            "heatTolerance": "high",
            "waterRequirement": "medium-high",
            "greenhouseRecommended": False,
            "notes": "GOOD for UAE! Butternut squash (C. moschata) is MORE heat-tolerant than other squashes, making it suitable for UAE climate. Greater disease and insect resistance than other Cucurbita species. Long storage life (3-6 months). Popular in modern UAE cuisine. Can grow spring and fall seasons. Plant when soil warms to 18C+. Excellent keeper for off-season sales."
        }
    },
    {
        "plantName": "Marrow",
        "scientificName": "Cucurbita pepo L. (marrow cultivar)",
        "farmTypeCompatibility": ["open_field", "greenhouse"],
        "growthCycle": {
            "germinationDays": 8,
            "vegetativeDays": 28,
            "floweringDays": 7,
            "fruitingDays": 30,
            "harvestDurationDays": 21,
            "totalCycleDays": 85
        },
        "yieldInfo": {
            "yieldPerPlant": 11.5,
            "yieldUnit": "kg",
            "expectedWastePercentage": 20
        },
        "fertilizerSchedule": [
            {
                "stage": "vegetative",
                "fertilizerType": "High N-P fertilizer",
                "quantityPerPlant": 25,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "8-16-36",
                "notes": "Similar to zucchini (same species). Start with higher N-P."
            },
            {
                "stage": "fruiting",
                "fertilizerType": "High potassium fertilizer",
                "quantityPerPlant": 30,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "5-10-20",
                "notes": "Increase K for fruit development"
            }
        ],
        "pesticideSchedule": [
            {
                "stage": "vegetative",
                "pesticideType": "Floating row covers",
                "targetPest": "Cucumber beetles, squash vine borers",
                "quantityPerPlant": 0,
                "quantityUnit": "none",
                "frequencyDays": 0,
                "safetyNotes": "Remove for pollination.",
                "preharvestIntervalDays": 0
            },
            {
                "stage": "fruiting",
                "pesticideType": "Insecticidal soap",
                "targetPest": "Aphids, squash bugs",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 14,
                "safetyNotes": "Organic solution. Apply in evening.",
                "preharvestIntervalDays": 0
            }
        ],
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 18.0,
                "maxCelsius": 27.0,
                "optimalCelsius": 23.0
            },
            "humidity": {
                "minPercentage": 50,
                "maxPercentage": 70,
                "optimalPercentage": 60
            },
            "light": {
                "hoursPerDay": 9,
                "minLux": 30000,
                "maxLux": 70000,
                "ppfd": "400-600 μmol/m²/s",
                "photoperiodSensitivity": "day-neutral"
            },
            "co2": {
                "minPpm": 400,
                "optimalPpm": 800
            },
            "airCirculation": {
                "required": True,
                "notes": "Good air circulation for pollination and disease prevention"
            }
        },
        "wateringRequirements": {
            "frequencyDays": 2,
            "amountPerPlant": 800,
            "amountUnit": "ml",
            "waterQuality": "Clean, pH 6.0-6.5",
            "droughtTolerance": "low"
        },
        "soilRequirements": {
            "phRange": {
                "min": 6.0,
                "max": 6.5
            },
            "soilTypes": ["loam", "well-drained", "fertile"],
            "organicMatterPercentage": 5,
            "hydroponics": {
                "ec": {
                    "min": 2.5,
                    "max": 3.5
                },
                "tds": {
                    "min": 1250,
                    "max": 1750
                },
                "ph": {
                    "min": 6.0,
                    "max": 6.5
                }
            }
        },
        "commonDiseasesAndPests": [
            {
                "name": "Powdery Mildew",
                "scientificName": "Podosphaera xanthii",
                "symptoms": "White powdery coating on leaves and stems",
                "prevention": "Good air circulation, resistant varieties",
                "treatment": "Fungicides, remove infected leaves",
                "severity": "high"
            },
            {
                "name": "Cucumber Beetles",
                "scientificName": "Striped and Spotted varieties",
                "symptoms": "Leaf damage, bacterial wilt transmission",
                "prevention": "Row covers, reflective mulch",
                "treatment": "Pyrethrins, neem oil (evening application)",
                "severity": "high"
            },
            {
                "name": "Squash Vine Borers",
                "scientificName": "Melittia cucurbitae",
                "symptoms": "Wilting vines, frass at stem base",
                "prevention": "Row covers, crop rotation",
                "treatment": "Cut stem to remove larvae",
                "severity": "high"
            }
        ],
        "spacingAndSupport": {
            "plantSpacingCm": 75,
            "rowSpacingCm": 120,
            "plantsPerSqMeter": 1.1,
            "supportRequired": False,
            "supportType": "none (bush types) or optional trellis (vining types)"
        },
        "companionPlanting": {
            "beneficialCompanions": ["Beans", "Corn", "Peas", "Radish", "Marigolds", "Nasturtiums"],
            "incompatiblePlants": ["Potatoes"]
        },
        "qualityGrading": {
            "grades": [
                {
                    "grade": "A",
                    "description": "Young marrow (15-20cm), firm, glossy, no damage. Mature marrow (30-40cm), firm, uniform color",
                    "priceMultiplier": 1.0
                },
                {
                    "grade": "B",
                    "description": "Size variation, minor surface marks acceptable",
                    "priceMultiplier": 0.75
                }
            ]
        },
        "economics": {
            "marketPricePerKg": 9.5,
            "laborHoursPerPlant": 0.5
        },
        "uaeAdaptations": {
            "growingSeason": "Cool to warm season - February to May, September to November",
            "plantingMonths": ["February", "March", "April", "September", "October"],
            "harvestMonths": ["April", "May", "June", "October", "November", "December"],
            "heatTolerance": "medium",
            "waterRequirement": "high",
            "greenhouseRecommended": True,
            "notes": "MODERATE for UAE. Similar requirements to zucchini - prefers cooler temperatures (18-27C optimal, struggles >35C). Greenhouse recommended for climate control. Can harvest young (like zucchini at 50-60 days) or let mature to large marrow (70-90 days). Popular in British/European cuisine, growing interest in UAE expatriate markets. Fast-growing spring and fall crop. Requires consistent moisture. Same species as zucchini."
        }
    }
]

# Add the remaining plants
data['plants'].extend(phase3_part2_plants)

# Update metadata
data['metadata']['plants_completed'] = 21

# Save the updated JSON
with open('plants-from-old-db-enhanced.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"Successfully added 4 remaining Phase 3 plants!")
print(f"Total plants now: {len(data['plants'])}")
print(f"Metadata plants_completed: {data['metadata']['plants_completed']}")
print(f"\nPlants added:")
for plant in phase3_part2_plants:
    print(f"  - {plant['plantName']} ({plant['scientificName']})")
print(f"\n*** PHASE 3 COMPLETE! *** All 8 melons & squash researched and added.")
print(f"\nOverall progress: 21/39 plants (54%)")
