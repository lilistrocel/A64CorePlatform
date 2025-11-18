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

# Phase 3 Plants: Melons & Squash (8 plants)
phase3_plants = [
    {
        "plantName": "Watermelon",
        "scientificName": "Citrullus lanatus (Thunb.) Matsum. & Nakai",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 8,
            "vegetativeDays": 30,
            "floweringDays": 14,
            "fruitingDays": 38,
            "harvestDurationDays": 14,
            "totalCycleDays": 95
        },
        "yieldInfo": {
            "yieldPerPlant": 20.0,
            "yieldUnit": "kg",
            "expectedWastePercentage": 45
        },
        "fertilizerSchedule": [
            {
                "stage": "preplant",
                "fertilizerType": "Balanced NPK",
                "quantityPerPlant": 80,
                "quantityUnit": "grams",
                "frequencyDays": 0,
                "npkRatio": "5-10-10",
                "notes": "Soil-based: 80-100 kg/ha N, 25-60 kg/ha P, 35-80 kg/ha K"
            },
            {
                "stage": "vegetative",
                "fertilizerType": "Side-dress application",
                "quantityPerPlant": 40,
                "quantityUnit": "grams",
                "frequencyDays": 21,
                "npkRatio": "5-10-10",
                "notes": "Apply when vines begin to run"
            },
            {
                "stage": "flowering",
                "fertilizerType": "High potassium fertilizer",
                "quantityPerPlant": 50,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "5-10-15",
                "notes": "Increase K for sugar content. Hydroponic: NPK 18-18-18+TE at 500 ppm, change every 2-3 weeks"
            }
        ],
        "pesticideSchedule": [
            {
                "stage": "vegetative",
                "pesticideType": "Floating row covers",
                "targetPest": "Cucumber beetles",
                "quantityPerPlant": 0,
                "quantityUnit": "none",
                "frequencyDays": 0,
                "safetyNotes": "Remove for pollination. Prevents bacterial wilt transmission.",
                "preharvestIntervalDays": 0
            },
            {
                "stage": "fruiting",
                "pesticideType": "Insecticidal soap or Neem oil",
                "targetPest": "Aphids",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 14,
                "safetyNotes": "Organic solution. Apply in evening.",
                "preharvestIntervalDays": 0
            },
            {
                "stage": "fruiting",
                "pesticideType": "Chlorothalonil or Copper fungicide",
                "targetPest": "Anthracnose, fungal diseases",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 7,
                "safetyNotes": "Preventive application. Avoid overhead watering.",
                "preharvestIntervalDays": 3
            }
        ],
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 22.0,
                "maxCelsius": 35.0,
                "optimalCelsius": 26.0
            },
            "humidity": {
                "minPercentage": 50,
                "maxPercentage": 70,
                "optimalPercentage": 60
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
                "notes": "Good air circulation reduces disease pressure"
            }
        },
        "wateringRequirements": {
            "frequencyDays": 3,
            "amountPerPlant": 2000,
            "amountUnit": "ml",
            "waterQuality": "Clean, pH 5.8-6.4. Moderately sensitive to salinity (ECe threshold 2.5 mmhos/cm)",
            "droughtTolerance": "low"
        },
        "soilRequirements": {
            "phRange": {
                "min": 6.0,
                "max": 6.8
            },
            "soilTypes": ["sandy-loam", "loam", "well-drained"],
            "organicMatterPercentage": 4,
            "hydroponics": {
                "ec": {
                    "min": 1.2,
                    "max": 1.5
                },
                "tds": {
                    "min": 600,
                    "max": 750
                },
                "ph": {
                    "min": 5.8,
                    "max": 6.4
                }
            }
        },
        "commonDiseasesAndPests": [
            {
                "name": "Cucumber Beetles",
                "scientificName": "Striped and Spotted varieties",
                "symptoms": "Leaf damage, transmit bacterial wilt, stunted growth",
                "prevention": "Row covers, reflective mulches, crop rotation",
                "treatment": "Pyrethrin, neem oil (evening application to protect pollinators)",
                "severity": "high"
            },
            {
                "name": "Anthracnose",
                "scientificName": "Colletotrichum species",
                "symptoms": "Sunken lesions on fruit, leaf spots, fruit rot",
                "prevention": "Crop rotation, resistant varieties, avoid overhead watering",
                "treatment": "Chlorothalonil, copper-based fungicides",
                "severity": "high"
            },
            {
                "name": "Fusarium Wilt",
                "scientificName": "Fusarium oxysporum",
                "symptoms": "Wilting vines, yellowing, vascular discoloration",
                "prevention": "Resistant varieties, crop rotation, soil solarization",
                "treatment": "No cure - prevention critical, remove infected plants",
                "severity": "high"
            },
            {
                "name": "Powdery Mildew",
                "scientificName": "Various species",
                "symptoms": "White powdery coating on leaves",
                "prevention": "Good air circulation, resistant varieties",
                "treatment": "Sulfur fungicides, potassium bicarbonate",
                "severity": "medium-high"
            }
        ],
        "spacingAndSupport": {
            "plantSpacingCm": 120,
            "rowSpacingCm": 200,
            "plantsPerSqMeter": 0.5,
            "supportRequired": False,
            "supportType": "none (ground vining)"
        },
        "companionPlanting": {
            "beneficialCompanions": ["Radish", "Corn", "Beans", "Marigolds", "Nasturtiums"],
            "incompatiblePlants": ["Potatoes", "Other cucurbits"]
        },
        "qualityGrading": {
            "grades": [
                {
                    "grade": "A",
                    "description": "Uniform shape, symmetrical, firm, heavy for size, yellow ground spot, hollow sound when tapped, 5-10 kg",
                    "priceMultiplier": 1.0
                },
                {
                    "grade": "B",
                    "description": "Slight irregularities, 3-5 kg or >10 kg, minor surface marks OK",
                    "priceMultiplier": 0.7
                }
            ]
        },
        "economics": {
            "marketPricePerKg": 4.5,
            "laborHoursPerPlant": 0.3
        },
        "uaeAdaptations": {
            "growingSeason": "Hot season - March to July (loves heat!)",
            "plantingMonths": ["March", "April", "May"],
            "harvestMonths": ["June", "July", "August", "September"],
            "heatTolerance": "very high",
            "waterRequirement": "high",
            "greenhouseRecommended": False,
            "notes": "EXCELLENT for UAE! Native to dry tropical Africa, watermelon thrives in hot, dry desert climate (22-30C optimal). Fruits grown in hot, dry UAE conditions have higher sugar content (11% vs 8% in humid climates). Requires abundant groundwater/irrigation. Very popular in UAE markets. Can tolerate moderate salinity. Plant in spring for summer harvest. High market demand, premium prices for quality fruit."
        }
    },
    {
        "plantName": "Rock Melon (Cantaloupe)",
        "scientificName": "Cucumis melo L. var. cantalupensis",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 6,
            "vegetativeDays": 28,
            "floweringDays": 14,
            "fruitingDays": 38,
            "harvestDurationDays": 10,
            "totalCycleDays": 90
        },
        "yieldInfo": {
            "yieldPerPlant": 10.0,
            "yieldUnit": "kg",
            "expectedWastePercentage": 40
        },
        "fertilizerSchedule": [
            {
                "stage": "vegetative",
                "fertilizerType": "Balanced fertilizer",
                "quantityPerPlant": 30,
                "quantityUnit": "grams",
                "frequencyDays": 21,
                "npkRatio": "10-10-10",
                "notes": "After plants reach 4+ inches"
            },
            {
                "stage": "flowering",
                "fertilizerType": "High P-K fertilizer",
                "quantityPerPlant": 40,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "5-10-10",
                "notes": "Switch after flowering for fruit development. Side-dress at vine running and fruit set."
            }
        ],
        "pesticideSchedule": [
            {
                "stage": "vegetative",
                "pesticideType": "Floating row covers",
                "targetPest": "Aphids, cucumber beetles (virus and bacterial wilt vectors)",
                "quantityPerPlant": 0,
                "quantityUnit": "none",
                "frequencyDays": 0,
                "safetyNotes": "Remove for pollination. Critical for virus prevention.",
                "preharvestIntervalDays": 0
            },
            {
                "stage": "fruiting",
                "pesticideType": "Insecticidal soap",
                "targetPest": "Aphids, spider mites",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 14,
                "safetyNotes": "Organic solution. Aphids vector CMV and other viruses.",
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
                "notes": "Critical for disease prevention and pollination"
            }
        },
        "wateringRequirements": {
            "frequencyDays": 3,
            "amountPerPlant": 1500,
            "amountUnit": "ml",
            "waterQuality": "Clean, pH 5.8-6.4",
            "droughtTolerance": "low"
        },
        "soilRequirements": {
            "phRange": {
                "min": 6.0,
                "max": 6.8
            },
            "soilTypes": ["sandy-loam", "loam", "well-drained"],
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
                "name": "Aphids (CMV vectors)",
                "scientificName": "Multiple species",
                "symptoms": "Curled leaves, honeydew, transmit Cucumber Mosaic Virus",
                "prevention": "Row covers, reflective mulches, virus-free transplants, destroy infected plants immediately",
                "treatment": "Insecticidal soap, systemic insecticides for severe cases",
                "severity": "high"
            },
            {
                "name": "Cucumber Beetles",
                "scientificName": "Striped and Spotted varieties",
                "symptoms": "Leaf damage, bacterial wilt transmission",
                "prevention": "Row covers (remove for pollination), trap crops",
                "treatment": "Pyrethrins, neem oil",
                "severity": "high"
            },
            {
                "name": "Fusarium Wilt",
                "scientificName": "Fusarium oxysporum f. sp. melonis",
                "symptoms": "Wilting, yellowing, vascular browning",
                "prevention": "Resistant varieties (many available), crop rotation, soil solarization",
                "treatment": "No cure - remove infected plants",
                "severity": "high"
            },
            {
                "name": "Powdery Mildew",
                "scientificName": "Podosphaera xanthii",
                "symptoms": "White powdery coating on leaves",
                "prevention": "Resistant varieties available, good air circulation",
                "treatment": "Fungicides, sulfur sprays",
                "severity": "medium-high"
            }
        ],
        "spacingAndSupport": {
            "plantSpacingCm": 75,
            "rowSpacingCm": 150,
            "plantsPerSqMeter": 1,
            "supportRequired": False,
            "supportType": "optional trellis in greenhouse"
        },
        "companionPlanting": {
            "beneficialCompanions": ["Corn", "Radish", "Beans", "Marigolds", "Nasturtiums", "Sunflowers"],
            "incompatiblePlants": ["Potatoes", "Other melons"]
        },
        "qualityGrading": {
            "grades": [
                {
                    "grade": "A",
                    "description": "Full slip (separates from stem cleanly), strong aroma, firm flesh, good netting, 1-2 kg",
                    "priceMultiplier": 1.0
                },
                {
                    "grade": "B",
                    "description": "Half-slip acceptable, minor netting irregularities, 0.8-1 kg or >2 kg",
                    "priceMultiplier": 0.75
                }
            ]
        },
        "economics": {
            "marketPricePerKg": 8.0,
            "laborHoursPerPlant": 0.4
        },
        "uaeAdaptations": {
            "growingSeason": "Warm season - March to June",
            "plantingMonths": ["March", "April", "May"],
            "harvestMonths": ["May", "June", "July", "August"],
            "heatTolerance": "high",
            "waterRequirement": "high",
            "greenhouseRecommended": False,
            "notes": "GOOD for UAE spring/summer production! Heat-loving crop that thrives in desert conditions with irrigation. Popular in local and export markets. Sweet, aromatic fruit. Greenhouse production can extend season and improve quality control. Resistant varieties available for common diseases (Fusarium wilt, powdery mildew). Well-suited for drip irrigation systems."
        }
    },
    {
        "plantName": "Honeydew Melon",
        "scientificName": "Cucumis melo L. var. inodorus",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 6,
            "vegetativeDays": 35,
            "floweringDays": 14,
            "fruitingDays": 45,
            "harvestDurationDays": 10,
            "totalCycleDays": 105
        },
        "yieldInfo": {
            "yieldPerPlant": 12.5,
            "yieldUnit": "kg",
            "expectedWastePercentage": 35
        },
        "fertilizerSchedule": [
            {
                "stage": "preplant",
                "fertilizerType": "Compost or well-rotted manure",
                "quantityPerPlant": 100,
                "quantityUnit": "grams",
                "frequencyDays": 0,
                "npkRatio": "N/A",
                "notes": "Incorporate into soil before planting"
            },
            {
                "stage": "vegetative",
                "fertilizerType": "Balanced fertilizer",
                "quantityPerPlant": 30,
                "quantityUnit": "grams",
                "frequencyDays": 21,
                "npkRatio": "10-10-10",
                "notes": "When vines begin to run"
            },
            {
                "stage": "fruiting",
                "fertilizerType": "High P-K fertilizer",
                "quantityPerPlant": 40,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "5-10-10",
                "notes": "Additional feeding at fruit set"
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
                "pesticideType": "Fungicide (Chlorothalonil or Copper)",
                "targetPest": "Downy mildew, anthracnose",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 7,
                "safetyNotes": "Honeydew more susceptible to downy mildew than cantaloupe. Preventive sprays critical.",
                "preharvestIntervalDays": 3
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
                "notes": "Essential for disease prevention"
            }
        },
        "wateringRequirements": {
            "frequencyDays": 3,
            "amountPerPlant": 1600,
            "amountUnit": "ml",
            "waterQuality": "Clean, pH 5.8-6.4",
            "droughtTolerance": "low"
        },
        "soilRequirements": {
            "phRange": {
                "min": 6.0,
                "max": 6.8
            },
            "soilTypes": ["sandy-loam", "loam", "well-drained"],
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
                "name": "Downy Mildew",
                "scientificName": "Pseudoperonospora cubensis",
                "symptoms": "Yellow patches on upper leaf surface, purple-gray growth on underside",
                "prevention": "Avoid overhead watering, good air circulation, resistant varieties",
                "treatment": "Fungicides (apply preventively), remove infected leaves",
                "severity": "high"
            },
            {
                "name": "Anthracnose",
                "scientificName": "Colletotrichum species",
                "symptoms": "Sunken lesions on fruit, leaf spots",
                "prevention": "Crop rotation, avoid overhead watering",
                "treatment": "Chlorothalonil, copper fungicides",
                "severity": "high"
            },
            {
                "name": "Aphids",
                "scientificName": "Multiple species",
                "symptoms": "Virus vectors, leaf curling",
                "prevention": "Row covers, reflective mulches",
                "treatment": "Insecticidal soap, neem oil",
                "severity": "medium-high"
            }
        ],
        "spacingAndSupport": {
            "plantSpacingCm": 90,
            "rowSpacingCm": 160,
            "plantsPerSqMeter": 0.7,
            "supportRequired": False,
            "supportType": "none"
        },
        "companionPlanting": {
            "beneficialCompanions": ["Corn", "Radish", "Beans", "Marigolds", "Nasturtiums"],
            "incompatiblePlants": ["Potatoes", "Other melons"]
        },
        "qualityGrading": {
            "grades": [
                {
                    "grade": "A",
                    "description": "Creamy-yellow smooth skin, firm, heavy, sweet aroma at stem end, 2-3 kg",
                    "priceMultiplier": 1.0
                },
                {
                    "grade": "B",
                    "description": "Slight discoloration acceptable, 1.5-2 kg or >3 kg",
                    "priceMultiplier": 0.75
                }
            ]
        },
        "economics": {
            "marketPricePerKg": 10.0,
            "laborHoursPerPlant": 0.4
        },
        "uaeAdaptations": {
            "growingSeason": "Warm season - March to June",
            "plantingMonths": ["March", "April", "May"],
            "harvestMonths": ["June", "July", "August", "September"],
            "heatTolerance": "medium-high",
            "waterRequirement": "high",
            "greenhouseRecommended": True,
            "notes": "MODERATE for UAE. Longer season than cantaloupe (80-110 days). Requires consistent moisture and protection from extreme heat (>35C). Greenhouse recommended for summer production. Sweet, smooth-textured fruit. Good storage life (2-3 weeks). Popular in premium markets. More vulnerable to downy mildew than cantaloupe - preventive fungicide program essential."
        }
    },
    {
        "plantName": "Sweet Melon",
        "scientificName": "Cucumis melo L.",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 6,
            "vegetativeDays": 30,
            "floweringDays": 14,
            "fruitingDays": 40,
            "harvestDurationDays": 10,
            "totalCycleDays": 90
        },
        "yieldInfo": {
            "yieldPerPlant": 10.0,
            "yieldUnit": "kg",
            "expectedWastePercentage": 38
        },
        "fertilizerSchedule": [
            {
                "stage": "preplant",
                "fertilizerType": "Compost or aged manure",
                "quantityPerPlant": 100,
                "quantityUnit": "grams",
                "frequencyDays": 0,
                "npkRatio": "N/A",
                "notes": "Well-fertilized soil rich in nutrients"
            },
            {
                "stage": "vegetative",
                "fertilizerType": "Balanced fertilizer",
                "quantityPerPlant": 30,
                "quantityUnit": "grams",
                "frequencyDays": 21,
                "npkRatio": "10-10-10",
                "notes": "At planting"
            },
            {
                "stage": "fruiting",
                "fertilizerType": "High P-K fertilizer",
                "quantityPerPlant": 40,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "5-10-10",
                "notes": "Side-dress at vine running and fruit set"
            }
        ],
        "pesticideSchedule": [
            {
                "stage": "vegetative",
                "pesticideType": "Floating row covers",
                "targetPest": "Aphids, cucumber beetles, flea beetles",
                "quantityPerPlant": 0,
                "quantityUnit": "none",
                "frequencyDays": 0,
                "safetyNotes": "Remove for pollination.",
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
                "notes": "Good air circulation for pollination and disease prevention"
            }
        },
        "wateringRequirements": {
            "frequencyDays": 3,
            "amountPerPlant": 1500,
            "amountUnit": "ml",
            "waterQuality": "Clean, pH 5.8-6.4",
            "droughtTolerance": "low"
        },
        "soilRequirements": {
            "phRange": {
                "min": 6.0,
                "max": 6.8
            },
            "soilTypes": ["sandy-loam", "loam", "well-drained"],
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
                "severity": "medium-high"
            },
            {
                "name": "Powdery Mildew",
                "scientificName": "Podosphaera xanthii",
                "symptoms": "White powdery coating on leaves",
                "prevention": "Good air circulation, resistant varieties",
                "treatment": "Sulfur fungicides",
                "severity": "medium-high"
            },
            {
                "name": "Fusarium Wilt",
                "scientificName": "Fusarium oxysporum",
                "symptoms": "Wilting, yellowing, vascular discoloration",
                "prevention": "Resistant varieties, crop rotation",
                "treatment": "No cure - remove infected plants",
                "severity": "high"
            }
        ],
        "spacingAndSupport": {
            "plantSpacingCm": 75,
            "rowSpacingCm": 150,
            "plantsPerSqMeter": 1,
            "supportRequired": False,
            "supportType": "none"
        },
        "companionPlanting": {
            "beneficialCompanions": ["Corn", "Radish", "Beans", "Marigolds", "Nasturtiums"],
            "incompatiblePlants": ["Potatoes", "Other melons"]
        },
        "qualityGrading": {
            "grades": [
                {
                    "grade": "A",
                    "description": "Sweet flavor, firm flesh, good aroma, uniform color, 1-3 kg depending on variety",
                    "priceMultiplier": 1.0
                },
                {
                    "grade": "B",
                    "description": "Slight blemishes acceptable, minor shape irregularities",
                    "priceMultiplier": 0.75
                }
            ]
        },
        "economics": {
            "marketPricePerKg": 6.5,
            "laborHoursPerPlant": 0.4
        },
        "uaeAdaptations": {
            "growingSeason": "Warm season - March to June",
            "plantingMonths": ["March", "April", "May"],
            "harvestMonths": ["May", "June", "July", "August"],
            "heatTolerance": "high",
            "waterRequirement": "high",
            "greenhouseRecommended": False,
            "notes": "GOOD for UAE production! General sweet melon varieties adapt well to warm desert climate. Popular in Middle Eastern markets. Various cultivars available with different flavors/colors. Good for fresh consumption and export. Drip irrigation essential for water efficiency. Similar growing requirements to cantaloupe."
        }
    }
]

# Continue adding remaining 4 plants in next part...
print("Adding first 4 Phase 3 plants...")
data['plants'].extend(phase3_plants)

# Save progress
with open('plants-from-old-db-enhanced.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"First 4 plants added! Total plants now: {len(data['plants'])}")
print("Creating part 2 with remaining 4 plants...")
