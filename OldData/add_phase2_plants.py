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

# Phase 2 Plants to add: Eggplant, Okra, Zucchini
phase2_plants = [
    {
        "plantName": "Eggplant",
        "scientificName": "Solanum melongena L.",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 9,
            "vegetativeDays": 42,
            "floweringDays": 21,
            "fruitingDays": 28,
            "harvestDurationDays": 21,
            "totalCycleDays": 110
        },
        "yieldInfo": {
            "yieldPerPlant": 5.0,
            "yieldUnit": "kg",
            "expectedWastePercentage": 15
        },
        "fertilizerSchedule": [
            {
                "stage": "preplant",
                "fertilizerType": "Complete NPK fertilizer",
                "quantityPerPlant": 100,
                "quantityUnit": "grams",
                "frequencyDays": 0,
                "npkRatio": "5-5-5",
                "notes": "Pre-plant: 75-120 lb N/acre, 100-150 lb P2O5/acre, 50-150 lb K2O/acre, 20-30 lb S/acre"
            },
            {
                "stage": "flowering",
                "fertilizerType": "Nitrogen side-dress",
                "quantityPerPlant": 40,
                "quantityUnit": "grams",
                "frequencyDays": 0,
                "npkRatio": "21-0-0",
                "notes": "Side-dress 30-50 lb N/acre after first flowers set"
            },
            {
                "stage": "fruiting",
                "fertilizerType": "High potassium fertilizer",
                "quantityPerPlant": 30,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "5-10-15",
                "notes": "Increase potassium for fruit development, similar to tomatoes"
            }
        ],
        "pesticideSchedule": [
            {
                "stage": "vegetative",
                "pesticideType": "Floating row covers (physical barrier)",
                "targetPest": "Flea beetles",
                "quantityPerPlant": 0,
                "quantityUnit": "none",
                "frequencyDays": 0,
                "safetyNotes": "Install on young plants. Most effective prevention for flea beetles.",
                "preharvestIntervalDays": 0
            },
            {
                "stage": "vegetative",
                "pesticideType": "Spinosad or Permethrin",
                "targetPest": "Flea beetles",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 7,
                "safetyNotes": "If row covers not used. Follow label instructions.",
                "preharvestIntervalDays": 3
            },
            {
                "stage": "fruiting",
                "pesticideType": "Insecticidal soap or Neem oil",
                "targetPest": "Aphids, spider mites",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 14,
                "safetyNotes": "Organic solution. Apply in evening.",
                "preharvestIntervalDays": 0
            }
        ],
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 21.0,
                "maxCelsius": 32.0,
                "optimalCelsius": 26.0
            },
            "humidity": {
                "minPercentage": 40,
                "maxPercentage": 70,
                "optimalPercentage": 50
            },
            "light": {
                "hoursPerDay": 14,
                "minLux": 25000,
                "maxLux": 60000,
                "ppfd": "400-600 μmol/m²/s (DLI 20-30 mol/m²/day)",
                "photoperiodSensitivity": "day-neutral"
            },
            "co2": {
                "minPpm": 400,
                "optimalPpm": 800
            },
            "airCirculation": {
                "required": True,
                "notes": "Good air circulation prevents diseases and aids pollination"
            }
        },
        "wateringRequirements": {
            "frequencyDays": 2,
            "amountPerPlant": 500,
            "amountUnit": "ml",
            "waterQuality": "Clean, pH 5.5-6.5",
            "droughtTolerance": "medium"
        },
        "soilRequirements": {
            "phRange": {
                "min": 6.0,
                "max": 7.0
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
                    "min": 5.5,
                    "max": 6.5
                }
            }
        },
        "commonDiseasesAndPests": [
            {
                "name": "Flea Beetles",
                "scientificName": "Various species",
                "symptoms": "Small shot-holes in leaves, tiny black beetles jumping when disturbed",
                "prevention": "Floating row covers on young plants, remove plant debris",
                "treatment": "Spinosad, permethrin, carbaryl. Apply when beetles first appear.",
                "severity": "high"
            },
            {
                "name": "Verticillium Wilt",
                "scientificName": "Verticillium spp.",
                "symptoms": "Wilting, yellowing leaves, vascular discoloration",
                "prevention": "Use resistant varieties, crop rotation, avoid planting in infected soil",
                "treatment": "No cure - remove and destroy infected plants",
                "severity": "high"
            },
            {
                "name": "Blossom End Rot",
                "scientificName": "Physiological disorder - calcium deficiency",
                "symptoms": "Dark sunken spots on blossom end of fruit",
                "prevention": "Consistent moisture, adequate calcium in soil/solution",
                "treatment": "Improve irrigation consistency, foliar calcium sprays",
                "severity": "medium"
            },
            {
                "name": "Aphids",
                "scientificName": "Multiple species",
                "symptoms": "Leaf curling, honeydew, sooty mold, virus vectors",
                "prevention": "Beneficial insects (parasitic wasps, lacewings), avoid excess nitrogen",
                "treatment": "Insecticidal soap, neem oil, strong water spray",
                "severity": "medium"
            }
        ],
        "spacingAndSupport": {
            "plantSpacingCm": 45,
            "rowSpacingCm": 75,
            "plantsPerSqMeter": 3,
            "supportRequired": True,
            "supportType": "stake or cage for fruit support"
        },
        "companionPlanting": {
            "beneficialCompanions": ["Beans", "Marigold", "Peas", "Spinach", "Thyme"],
            "incompatiblePlants": ["Peppers", "Potatoes", "Tomatoes"]
        },
        "qualityGrading": {
            "grades": [
                {
                    "grade": "A",
                    "description": "Firm, glossy skin, uniform color, 300-400g, no blemishes or damage",
                    "priceMultiplier": 1.0
                },
                {
                    "grade": "B",
                    "description": "Slight dullness acceptable, 200-300g, minor surface marks OK",
                    "priceMultiplier": 0.7
                }
            ]
        },
        "economics": {
            "marketPricePerKg": 10.0,
            "laborHoursPerPlant": 1.5
        },
        "uaeAdaptations": {
            "growingSeason": "Warm season - March to October. Heat-loving crop.",
            "plantingMonths": ["March", "April", "May"],
            "harvestMonths": ["June", "July", "August", "September", "October"],
            "heatTolerance": "high",
            "waterRequirement": "high",
            "greenhouseRecommended": False,
            "notes": "Excellent for UAE! Heat-loving crop that thrives in summer (75-95F). Popular in Middle Eastern and Asian cuisine. Requires consistent watering in desert climate. Well-suited for greenhouse or outdoor with shade cloth in extreme heat (>40C). Commercial yield: 121 t/ha with optimal fertilization."
        }
    },
    {
        "plantName": "Okra",
        "scientificName": "Abelmoschus esculentus",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 10,
            "vegetativeDays": 28,
            "floweringDays": 12,
            "fruitingDays": 10,
            "harvestDurationDays": 30,
            "totalCycleDays": 65
        },
        "yieldInfo": {
            "yieldPerPlant": 2.5,
            "yieldUnit": "kg",
            "expectedWastePercentage": 10
        },
        "fertilizerSchedule": [
            {
                "stage": "vegetative",
                "fertilizerType": "Initial NPK",
                "quantityPerPlant": 15,
                "quantityUnit": "grams",
                "frequencyDays": 30,
                "npkRatio": "5-10-10",
                "notes": "First 4-6 weeks of growth"
            },
            {
                "stage": "flowering",
                "fertilizerType": "High potassium fertilizer",
                "quantityPerPlant": 20,
                "quantityUnit": "grams",
                "frequencyDays": 30,
                "npkRatio": "4-0-8",
                "notes": "1:2 N:K ratio encourages flowering. Examples: 4-0-8, 5-0-10, 10-0-20"
            },
            {
                "stage": "fruiting",
                "fertilizerType": "Complete fertilizer with micronutrients",
                "quantityPerPlant": 25,
                "quantityUnit": "grams",
                "frequencyDays": 21,
                "npkRatio": "10-10-10",
                "notes": "UAE optimal: N 18.2-27.3 kg/acre, P 22.8-36.4 kg/acre, K 109.2-182 kg/acre, S 9.1-18.2 kg/acre, Zn 0.9-2.7 kg/acre"
            }
        ],
        "pesticideSchedule": [
            {
                "stage": "vegetative",
                "pesticideType": "Neem oil or Insecticidal soap",
                "targetPest": "Aphids (cotton aphid most common)",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 14,
                "safetyNotes": "Organic solution. Safe for beneficial insects.",
                "preharvestIntervalDays": 0
            },
            {
                "stage": "vegetative",
                "pesticideType": "Sulfur fungicide or Neem oil",
                "targetPest": "Powdery mildew (Golovinomyces cichoracearum)",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 7,
                "safetyNotes": "Preventive application. Good air circulation essential.",
                "preharvestIntervalDays": 1
            },
            {
                "stage": "vegetative",
                "pesticideType": "Pyrethrin spray",
                "targetPest": "Flea beetles",
                "quantityPerPlant": 3,
                "quantityUnit": "ml",
                "frequencyDays": 14,
                "safetyNotes": "Row covers are more effective. Apply if severe infestation.",
                "preharvestIntervalDays": 0
            }
        ],
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 24.0,
                "maxCelsius": 35.0,
                "optimalCelsius": 30.0
            },
            "humidity": {
                "minPercentage": 50,
                "maxPercentage": 70,
                "optimalPercentage": 60
            },
            "light": {
                "hoursPerDay": 14,
                "minLux": 30000,
                "maxLux": 70000,
                "ppfd": "500-800 μmol/m²/s",
                "photoperiodSensitivity": "day-neutral"
            },
            "co2": {
                "minPpm": 400,
                "optimalPpm": 800
            },
            "airCirculation": {
                "required": True,
                "notes": "Excellent air circulation critical to prevent powdery mildew"
            }
        },
        "wateringRequirements": {
            "frequencyDays": 3,
            "amountPerPlant": 400,
            "amountUnit": "ml",
            "waterQuality": "Clean, pH 6.0-6.5",
            "droughtTolerance": "medium"
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
                    "min": 2.0,
                    "max": 2.4
                },
                "tds": {
                    "min": 1400,
                    "max": 1680
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
                "scientificName": "Golovinomyces cichoracearum",
                "symptoms": "White powdery spots on leaves and stems",
                "prevention": "Good air circulation, avoid overhead watering, resistant varieties",
                "treatment": "Sulfur fungicides, neem oil, remove infected leaves",
                "severity": "high"
            },
            {
                "name": "Aphids",
                "scientificName": "Multiple species (cotton aphid most common)",
                "symptoms": "Curled leaves, sticky honeydew, stunted growth",
                "prevention": "Beneficial insects, regular monitoring, avoid excess nitrogen",
                "treatment": "Neem oil, insecticidal soap, strong water spray",
                "severity": "medium"
            },
            {
                "name": "Flea Beetles",
                "scientificName": "Various species",
                "symptoms": "Small holes in leaves, tiny jumping beetles",
                "prevention": "Row covers, remove plant debris, crop rotation",
                "treatment": "Pyrethrin sprays, diatomaceous earth",
                "severity": "medium"
            }
        ],
        "spacingAndSupport": {
            "plantSpacingCm": 38,
            "rowSpacingCm": 90,
            "plantsPerSqMeter": 3,
            "supportRequired": False,
            "supportType": "none (self-supporting)"
        },
        "companionPlanting": {
            "beneficialCompanions": ["Peppers", "Cucumbers", "Melons", "Basil"],
            "incompatiblePlants": []
        },
        "qualityGrading": {
            "grades": [
                {
                    "grade": "A",
                    "description": "3-5 inches long, tender, bright green, no damage or fibrous texture",
                    "priceMultiplier": 1.0
                },
                {
                    "grade": "B",
                    "description": "5-7 inches, slightly tougher, minor blemishes acceptable",
                    "priceMultiplier": 0.7
                }
            ]
        },
        "economics": {
            "marketPricePerKg": 12.5,
            "laborHoursPerPlant": 0.8
        },
        "uaeAdaptations": {
            "growingSeason": "PERFECT FOR UAE SUMMER! May to November. Traditional crop.",
            "plantingMonths": ["April", "May", "June", "July"],
            "harvestMonths": ["May", "June", "July", "August", "September", "October", "November"],
            "heatTolerance": "very high",
            "waterRequirement": "medium-high",
            "greenhouseRecommended": False,
            "notes": "EXCELLENT for UAE summer production! Traditional Middle Eastern vegetable (bamia) with strong local demand. Extremely heat-tolerant (75-95F optimal). Harvest every 2 days for continuous production. Very fast ROI. Popular in local cuisine (bamia stew). Can be grown hydroponically for water efficiency. Widely grown in UAE, Abu Dhabi, Dubai."
        }
    },
    {
        "plantName": "Zucchini",
        "scientificName": "Cucurbita pepo L.",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 10,
            "vegetativeDays": 28,
            "floweringDays": 7,
            "fruitingDays": 10,
            "harvestDurationDays": 30,
            "totalCycleDays": 60
        },
        "yieldInfo": {
            "yieldPerPlant": 4.0,
            "yieldUnit": "kg",
            "expectedWastePercentage": 15
        },
        "fertilizerSchedule": [
            {
                "stage": "vegetative",
                "fertilizerType": "High N-P fertilizer",
                "quantityPerPlant": 25,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "8-16-36",
                "notes": "Start with high nitrogen and phosphorus at beginning of cycle"
            },
            {
                "stage": "fruiting",
                "fertilizerType": "High potassium fertilizer",
                "quantityPerPlant": 30,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "5-10-20",
                "notes": "Gradually increase K to maximum by harvest. Emphasize potassium for fruit development."
            }
        ],
        "pesticideSchedule": [
            {
                "stage": "vegetative",
                "pesticideType": "Floating row covers (physical barrier)",
                "targetPest": "Cucumber beetles, squash vine borers",
                "quantityPerPlant": 0,
                "quantityUnit": "none",
                "frequencyDays": 0,
                "safetyNotes": "Install at planting. Remove when flowering for pollination.",
                "preharvestIntervalDays": 0
            },
            {
                "stage": "flowering",
                "pesticideType": "Pyrethrins or Neem oil",
                "targetPest": "Cucumber beetles, aphids",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 7,
                "safetyNotes": "Apply in late evening to protect pollinators. Remove row covers first.",
                "preharvestIntervalDays": 1
            },
            {
                "stage": "fruiting",
                "pesticideType": "Insecticidal soap",
                "targetPest": "Aphids",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 14,
                "safetyNotes": "Organic solution. Reflective mulches help deter aphids.",
                "preharvestIntervalDays": 0
            }
        ],
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 18.0,
                "maxCelsius": 27.0,
                "optimalCelsius": 24.0
            },
            "humidity": {
                "minPercentage": 50,
                "maxPercentage": 70,
                "optimalPercentage": 60
            },
            "light": {
                "hoursPerDay": 14,
                "minLux": 30000,
                "maxLux": 60000,
                "ppfd": "400-600 μmol/m²/s (similar to tomato/cucumber)",
                "photoperiodSensitivity": "day-neutral"
            },
            "co2": {
                "minPpm": 400,
                "optimalPpm": 800
            },
            "airCirculation": {
                "required": True,
                "notes": "Good air circulation essential to prevent powdery mildew"
            }
        },
        "wateringRequirements": {
            "frequencyDays": 2,
            "amountPerPlant": 600,
            "amountUnit": "ml",
            "waterQuality": "Clean, pH 6.0-6.5",
            "droughtTolerance": "low"
        },
        "soilRequirements": {
            "phRange": {
                "min": 6.0,
                "max": 7.5
            },
            "soilTypes": ["loam", "well-drained", "fertile"],
            "organicMatterPercentage": 5,
            "hydroponics": {
                "ec": {
                    "min": 2.5,
                    "max": 4.0
                },
                "tds": {
                    "min": 1250,
                    "max": 2000
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
                "scientificName": "Various species",
                "symptoms": "White powdery spots on leaves and stems",
                "prevention": "Good air circulation, resistant varieties, avoid overhead watering",
                "treatment": "Fungicides, remove infected leaves, improve air flow",
                "severity": "high"
            },
            {
                "name": "Cucumber Beetles",
                "scientificName": "Spotted (12 black spots) and Striped (3 black stripes)",
                "symptoms": "Leaf damage, wilting (transmit bacterial wilt), stunted growth",
                "prevention": "Row covers, reflective mulch, crop rotation",
                "treatment": "Pyrethrins, neem oil (apply in evening)",
                "severity": "high"
            },
            {
                "name": "Squash Vine Borers",
                "scientificName": "Melittia cucurbitae",
                "symptoms": "Wilting vines, sawdust-like frass at stem base, sudden plant collapse",
                "prevention": "Row covers, crop rotation, remove plant debris",
                "treatment": "Cut open stem to remove larvae, bury affected stem sections to re-root",
                "severity": "high"
            },
            {
                "name": "Aphids",
                "scientificName": "Multiple species",
                "symptoms": "Leaf curling, yellowing, honeydew, virus transmission",
                "prevention": "Reflective mulches, beneficial insects (lady beetles, lacewings)",
                "treatment": "Insecticidal soap, neem oil, strong water spray",
                "severity": "medium"
            }
        ],
        "spacingAndSupport": {
            "plantSpacingCm": 60,
            "rowSpacingCm": 90,
            "plantsPerSqMeter": 2,
            "supportRequired": False,
            "supportType": "optional trellis for vertical growing (greenhouse)"
        },
        "companionPlanting": {
            "beneficialCompanions": ["Beans", "Corn", "Peas", "Radish", "Marigold", "Nasturtium"],
            "incompatiblePlants": ["Potatoes"]
        },
        "qualityGrading": {
            "grades": [
                {
                    "grade": "A",
                    "description": "6-8 inches (15-20cm), firm, glossy skin, uniform green or yellow color, no damage",
                    "priceMultiplier": 1.0
                },
                {
                    "grade": "B",
                    "description": "8-10 inches, slight surface marks acceptable, good firmness maintained",
                    "priceMultiplier": 0.75
                }
            ]
        },
        "economics": {
            "marketPricePerKg": 10.0,
            "laborHoursPerPlant": 0.6
        },
        "uaeAdaptations": {
            "growingSeason": "Cool to warm season - February to May, September to November",
            "plantingMonths": ["February", "March", "April", "September", "October"],
            "harvestMonths": ["March", "April", "May", "June", "October", "November", "December"],
            "heatTolerance": "medium",
            "waterRequirement": "high",
            "greenhouseRecommended": True,
            "notes": "Greenhouse production recommended for UAE due to heat sensitivity (prefers 70-80F, struggles >95F). Very fast-growing and productive. Harvest at 6-8 inches for best quality. Popular in local markets. Climate control essential for summer production. Training system in greenhouse improves yields. Commercial greenhouse: 30-35 tons/acre."
        }
    }
]

# Add the new plants
data['plants'].extend(phase2_plants)

# Save the updated JSON
with open('plants-from-old-db-enhanced.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"Successfully added 3 Phase 2 plants to the JSON file!")
print(f"Total plants now: {len(data['plants'])}")
print(f"Plants added:")
for plant in phase2_plants:
    print(f"  - {plant['plantName']} ({plant['scientificName']})")
