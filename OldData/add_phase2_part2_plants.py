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

# Phase 2 Part 2 Plants: Bell Pepper, Hot Chili, Long Red Chili, Cherry Tomato
phase2_part2_plants = [
    {
        "plantName": "Bell Pepper",
        "scientificName": "Capsicum annuum L.",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 10,
            "vegetativeDays": 42,
            "floweringDays": 21,
            "fruitingDays": 35,
            "harvestDurationDays": 30,
            "totalCycleDays": 105
        },
        "yieldInfo": {
            "yieldPerPlant": 4.0,
            "yieldUnit": "kg",
            "expectedWastePercentage": 15
        },
        "fertilizerSchedule": [
            {
                "stage": "preplant",
                "fertilizerType": "Balanced NPK fertilizer",
                "quantityPerPlant": 50,
                "quantityUnit": "grams",
                "frequencyDays": 0,
                "npkRatio": "10-10-10",
                "notes": "Pre-plant application, similar to tomatoes and eggplants"
            },
            {
                "stage": "vegetative",
                "fertilizerType": "Lower nitrogen fertilizer",
                "quantityPerPlant": 30,
                "quantityUnit": "grams",
                "frequencyDays": 21,
                "npkRatio": "5-10-10",
                "notes": "Higher P and K from start to encourage fruiting"
            },
            {
                "stage": "fruiting",
                "fertilizerType": "High potassium fertilizer",
                "quantityPerPlant": 40,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "8-16-16",
                "notes": "Critical: Higher K and P to encourage fruit over foliage. Reduce N to avoid excessive leaf growth."
            }
        ],
        "pesticideSchedule": [
            {
                "stage": "vegetative",
                "pesticideType": "Floating row covers (physical barrier)",
                "targetPest": "Aphids, thrips, whiteflies",
                "quantityPerPlant": 0,
                "quantityUnit": "none",
                "frequencyDays": 0,
                "safetyNotes": "Early season exclusion of pests. Remove for pollination.",
                "preharvestIntervalDays": 0
            },
            {
                "stage": "vegetative",
                "pesticideType": "Insecticidal soap or Neem oil",
                "targetPest": "Aphids, whiteflies, spider mites",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 14,
                "safetyNotes": "Organic solution. Apply early morning or evening.",
                "preharvestIntervalDays": 0
            },
            {
                "stage": "fruiting",
                "pesticideType": "Spinosad",
                "targetPest": "Thrips (vectors for Tomato Spotted Wilt Virus)",
                "quantityPerPlant": 3,
                "quantityUnit": "ml",
                "frequencyDays": 7,
                "safetyNotes": "Highly infectious virus prevention. Apply when thrips first detected.",
                "preharvestIntervalDays": 3
            }
        ],
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 21.0,
                "maxCelsius": 29.0,
                "optimalCelsius": 25.0
            },
            "humidity": {
                "minPercentage": 40,
                "maxPercentage": 70,
                "optimalPercentage": 55
            },
            "light": {
                "hoursPerDay": 15,
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
                "notes": "Good air circulation critical for disease prevention and pollination"
            }
        },
        "wateringRequirements": {
            "frequencyDays": 2,
            "amountPerPlant": 500,
            "amountUnit": "ml",
            "waterQuality": "Clean, pH 5.5-6.5",
            "droughtTolerance": "low"
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
                    "min": 1120,
                    "max": 1680
                },
                "ph": {
                    "min": 5.5,
                    "max": 6.5
                }
            }
        },
        "commonDiseasesAndPests": [
            {
                "name": "Thrips (Tomato Spotted Wilt Virus vector)",
                "scientificName": "Various species",
                "symptoms": "Silvery streaks on leaves, distorted growth, virus symptoms (bronzing, necrotic spots)",
                "prevention": "Row covers, reflective mulches, eliminate weeds, destroy infected plants immediately",
                "treatment": "Spinosad, insecticidal soap. No cure for virus - prevention critical.",
                "severity": "high"
            },
            {
                "name": "Phytophthora Root Rot",
                "scientificName": "Phytophthora capsici",
                "symptoms": "Wilting, root rot, crown rot, plant death",
                "prevention": "Well-drained soil/media, proper irrigation management, avoid overwatering",
                "treatment": "No effective chemical control - prevention and sanitation critical",
                "severity": "high"
            },
            {
                "name": "Bacterial Spot",
                "scientificName": "Xanthomonas spp.",
                "symptoms": "Small dark spots on leaves and fruit, defoliation",
                "prevention": "Disease-free seed, crop rotation, avoid overhead watering, copper sprays (preventive)",
                "treatment": "Copper-based bactericides (preventive only, not curative)",
                "severity": "high"
            },
            {
                "name": "Aphids",
                "scientificName": "Multiple species including Green Peach Aphid",
                "symptoms": "Curled leaves, sticky honeydew, virus vectors",
                "prevention": "Beneficial insects (ladybugs, lacewings), reflective mulches",
                "treatment": "Insecticidal soap, neem oil, strong water spray",
                "severity": "medium"
            },
            {
                "name": "Verticillium Wilt",
                "scientificName": "Verticillium spp.",
                "symptoms": "Yellowing, wilting, vascular discoloration",
                "prevention": "Resistant varieties, crop rotation, soil solarization",
                "treatment": "No cure - remove and destroy infected plants",
                "severity": "high"
            }
        ],
        "spacingAndSupport": {
            "plantSpacingCm": 50,
            "rowSpacingCm": 75,
            "plantsPerSqMeter": 3,
            "supportRequired": True,
            "supportType": "stakes or cages for heavy fruit load"
        },
        "companionPlanting": {
            "beneficialCompanions": ["Basil", "Carrots", "Onions", "Spinach", "Tomatoes", "Eggplant", "Oregano", "Parsley", "Marigolds", "Nasturtiums"],
            "incompatiblePlants": ["Beans", "Fennel", "Brassicas", "Potatoes"]
        },
        "qualityGrading": {
            "grades": [
                {
                    "grade": "A",
                    "description": "Green: Firm, glossy, 150-200g, no blemishes, thick walls. Colored (red/yellow/orange): Uniform color, 150-200g, sweet, thick walls",
                    "priceMultiplier": 1.0
                },
                {
                    "grade": "B",
                    "description": "Slight irregularities, 100-150g, minor surface marks acceptable, thinner walls OK",
                    "priceMultiplier": 0.7
                }
            ]
        },
        "economics": {
            "marketPricePerKg": 12.0,
            "laborHoursPerPlant": 1.2
        },
        "uaeAdaptations": {
            "growingSeason": "Warm season - February to May, September to November (similar to tomatoes)",
            "plantingMonths": ["February", "March", "April", "September", "October"],
            "harvestMonths": ["April", "May", "June", "July", "October", "November", "December"],
            "heatTolerance": "medium-high",
            "waterRequirement": "high",
            "greenhouseRecommended": True,
            "notes": "Greenhouse production strongly recommended for UAE to control temperature and extend season. Can grow outdoors in spring (Feb-May) and fall (Sep-Nov), but summer heat (>40C) causes blossom drop. Colored peppers (red/yellow/orange) require longer season and more controlled environment. Popular in local markets - colored peppers command premium price (AED 12-18/kg vs AED 8-10/kg for green). Climate control extends productive season significantly."
        }
    },
    {
        "plantName": "Chili Pepper - Hot",
        "scientificName": "Capsicum annuum var. acuminatum",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 10,
            "vegetativeDays": 35,
            "floweringDays": 21,
            "fruitingDays": 40,
            "harvestDurationDays": 75,
            "totalCycleDays": 105
        },
        "yieldInfo": {
            "yieldPerPlant": 2.0,
            "yieldUnit": "kg",
            "expectedWastePercentage": 10
        },
        "fertilizerSchedule": [
            {
                "stage": "vegetative",
                "fertilizerType": "High nitrogen fertilizer with micronutrients",
                "quantityPerPlant": 30,
                "quantityUnit": "grams",
                "frequencyDays": 21,
                "npkRatio": "10-5-10",
                "notes": "Ample N, low P, elevated K. Abundant Ca, Mg, Fe for strong vegetative growth"
            },
            {
                "stage": "fruiting",
                "fertilizerType": "High phosphorus and potassium",
                "quantityPerPlant": 35,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "5-10-15",
                "notes": "Reduce nitrogen, increase P-K. Controlled stress (slightly less water/nutrients) can increase capsaicin production"
            }
        ],
        "pesticideSchedule": [
            {
                "stage": "vegetative",
                "pesticideType": "Insecticidal soap or Neem oil",
                "targetPest": "Aphids, whiteflies",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 14,
                "safetyNotes": "Organic solution. Hot peppers generally more pest-resistant due to capsaicin.",
                "preharvestIntervalDays": 0
            },
            {
                "stage": "fruiting",
                "pesticideType": "Spinosad",
                "targetPest": "Thrips, pepper weevil",
                "quantityPerPlant": 3,
                "quantityUnit": "ml",
                "frequencyDays": 10,
                "safetyNotes": "Apply when pests first detected. Less frequent than sweet peppers.",
                "preharvestIntervalDays": 3
            }
        ],
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 21.0,
                "maxCelsius": 35.0,
                "optimalCelsius": 27.0
            },
            "humidity": {
                "minPercentage": 40,
                "maxPercentage": 70,
                "optimalPercentage": 55
            },
            "light": {
                "hoursPerDay": 15,
                "minLux": 30000,
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
                "notes": "Good ventilation essential for pollination and disease prevention"
            }
        },
        "wateringRequirements": {
            "frequencyDays": 3,
            "amountPerPlant": 400,
            "amountUnit": "ml",
            "waterQuality": "Clean, pH 5.8-6.3",
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
                    "min": 2.0,
                    "max": 3.5
                },
                "tds": {
                    "min": 1000,
                    "max": 1750
                },
                "ph": {
                    "min": 5.8,
                    "max": 6.3
                }
            }
        },
        "commonDiseasesAndPests": [
            {
                "name": "Aphids",
                "scientificName": "Multiple species",
                "symptoms": "Leaf curling, sticky honeydew, virus vectors",
                "prevention": "Beneficial insects, reflective mulches. Hot peppers more resistant than sweet.",
                "treatment": "Insecticidal soap, neem oil, strong water spray",
                "severity": "low-medium"
            },
            {
                "name": "Bacterial Spot",
                "scientificName": "Xanthomonas spp.",
                "symptoms": "Small dark spots on leaves and fruit",
                "prevention": "Disease-free seed, crop rotation, avoid overhead watering",
                "treatment": "Copper-based bactericides (preventive)",
                "severity": "medium"
            },
            {
                "name": "Pepper Weevil",
                "scientificName": "Anthonomus eugenii",
                "symptoms": "Punctured fruit, larvae inside peppers, fruit drop",
                "prevention": "Remove fallen fruit, destroy crop residue, insecticide rotation",
                "treatment": "Pyrethroid insecticides, spinosad",
                "severity": "medium"
            }
        ],
        "spacingAndSupport": {
            "plantSpacingCm": 45,
            "rowSpacingCm": 75,
            "plantsPerSqMeter": 3,
            "supportRequired": False,
            "supportType": "optional stakes for heavy fruit load"
        },
        "companionPlanting": {
            "beneficialCompanions": ["Basil", "Carrots", "Onions", "Tomatoes", "Oregano", "Marigolds"],
            "incompatiblePlants": ["Beans", "Fennel", "Brassicas", "Potatoes"]
        },
        "qualityGrading": {
            "grades": [
                {
                    "grade": "A",
                    "description": "Uniform size/color, firm, glossy, no damage, consistent heat level (2,500-50,000 Scoville)",
                    "priceMultiplier": 1.0
                },
                {
                    "grade": "B",
                    "description": "Size variation acceptable, minor blemishes OK, slightly uneven ripening",
                    "priceMultiplier": 0.75
                }
            ]
        },
        "economics": {
            "marketPricePerKg": 20.0,
            "laborHoursPerPlant": 0.8
        },
        "uaeAdaptations": {
            "growingSeason": "Warm season - March to June, September to November",
            "plantingMonths": ["March", "April", "May", "September", "October"],
            "harvestMonths": ["May", "June", "July", "August", "October", "November", "December"],
            "heatTolerance": "very high",
            "waterRequirement": "medium-high",
            "greenhouseRecommended": False,
            "notes": "EXCELLENT for UAE outdoor production! Hot peppers are more heat-tolerant than sweet peppers and thrive in desert conditions. Very popular in Middle Eastern and Asian cuisine. Hydroponics keep plants hydrated in hot/dry conditions. Controlled stress (slight under-watering) can increase capsaicin (heat) levels. High demand in local markets. Can successfully grow outdoors in UAE more than bell peppers. Varieties include jalapeño, serrano, cayenne, Thai chili."
        }
    },
    {
        "plantName": "Chili Pepper - Long Red",
        "scientificName": "Capsicum annuum (long cultivar)",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 10,
            "vegetativeDays": 35,
            "floweringDays": 21,
            "fruitingDays": 45,
            "harvestDurationDays": 75,
            "totalCycleDays": 110
        },
        "yieldInfo": {
            "yieldPerPlant": 3.0,
            "yieldUnit": "kg",
            "expectedWastePercentage": 10
        },
        "fertilizerSchedule": [
            {
                "stage": "vegetative",
                "fertilizerType": "High nitrogen with micronutrients",
                "quantityPerPlant": 30,
                "quantityUnit": "grams",
                "frequencyDays": 21,
                "npkRatio": "10-5-10",
                "notes": "Higher N for vegetative growth, Ca and Mg for strong stems"
            },
            {
                "stage": "fruiting",
                "fertilizerType": "High potassium fertilizer",
                "quantityPerPlant": 35,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "5-10-15",
                "notes": "Reduce N, increase P-K for long fruit development"
            }
        ],
        "pesticideSchedule": [
            {
                "stage": "vegetative",
                "pesticideType": "Neem oil or Insecticidal soap",
                "targetPest": "Aphids, whiteflies",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 14,
                "safetyNotes": "Organic solution. Capsaicin provides natural pest resistance.",
                "preharvestIntervalDays": 0
            },
            {
                "stage": "fruiting",
                "pesticideType": "Spinosad",
                "targetPest": "Thrips, pepper weevil",
                "quantityPerPlant": 3,
                "quantityUnit": "ml",
                "frequencyDays": 10,
                "safetyNotes": "Apply when pests detected. Generally pest-resistant variety.",
                "preharvestIntervalDays": 3
            }
        ],
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 21.0,
                "maxCelsius": 35.0,
                "optimalCelsius": 27.0
            },
            "humidity": {
                "minPercentage": 40,
                "maxPercentage": 70,
                "optimalPercentage": 55
            },
            "light": {
                "hoursPerDay": 15,
                "minLux": 30000,
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
                "notes": "Good air circulation for healthy fruit development"
            }
        },
        "wateringRequirements": {
            "frequencyDays": 3,
            "amountPerPlant": 400,
            "amountUnit": "ml",
            "waterQuality": "Clean, pH 5.8-6.3",
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
                    "min": 2.0,
                    "max": 3.5
                },
                "tds": {
                    "min": 1000,
                    "max": 1750
                },
                "ph": {
                    "min": 5.8,
                    "max": 6.3
                }
            }
        },
        "commonDiseasesAndPests": [
            {
                "name": "Aphids",
                "scientificName": "Multiple species",
                "symptoms": "Leaf curling, honeydew, virus vectors",
                "prevention": "Beneficial insects, natural capsaicin resistance",
                "treatment": "Insecticidal soap, neem oil",
                "severity": "low-medium"
            },
            {
                "name": "Bacterial Spot",
                "scientificName": "Xanthomonas spp.",
                "symptoms": "Dark spots on leaves and fruit",
                "prevention": "Disease-free seed, crop rotation, avoid overhead irrigation",
                "treatment": "Copper-based bactericides (preventive)",
                "severity": "medium"
            },
            {
                "name": "Spider Mites",
                "scientificName": "Tetranychus urticae",
                "symptoms": "Yellow stippling, fine webbing",
                "prevention": "Maintain humidity, avoid drought stress",
                "treatment": "Miticides, predatory mites, neem oil",
                "severity": "medium"
            }
        ],
        "spacingAndSupport": {
            "plantSpacingCm": 50,
            "rowSpacingCm": 75,
            "plantsPerSqMeter": 3,
            "supportRequired": False,
            "supportType": "optional stakes for heavy fruit branches"
        },
        "companionPlanting": {
            "beneficialCompanions": ["Basil", "Carrots", "Onions", "Tomatoes", "Oregano", "Marigolds"],
            "incompatiblePlants": ["Beans", "Fennel", "Brassicas", "Potatoes"]
        },
        "qualityGrading": {
            "grades": [
                {
                    "grade": "A",
                    "description": "Uniform length (10-15cm), bright red color, firm, no soft spots or damage",
                    "priceMultiplier": 1.0
                },
                {
                    "grade": "B",
                    "description": "Variable length, minor color variation, slight surface blemishes acceptable",
                    "priceMultiplier": 0.75
                }
            ]
        },
        "economics": {
            "marketPricePerKg": 16.0,
            "laborHoursPerPlant": 0.8
        },
        "uaeAdaptations": {
            "growingSeason": "Warm season - March to June, September to November",
            "plantingMonths": ["March", "April", "May", "September", "October"],
            "harvestMonths": ["May", "June", "July", "August", "October", "November", "December"],
            "heatTolerance": "very high",
            "waterRequirement": "medium-high",
            "greenhouseRecommended": False,
            "notes": "EXCELLENT for UAE! Long red chilies are traditional in Middle Eastern cuisine and very popular in local markets. Heat-tolerant and productive. Can dry on plant in hot climate for preserved product. High demand for both fresh (AED 12-20/kg) and dried (AED 40-60/kg) forms. Suitable for outdoor production spring through fall. Popular cayenne-type variety. Medium heat (2,500-30,000 Scoville). Essential ingredient in many regional dishes."
        }
    },
    {
        "plantName": "Tomato - Cherry",
        "scientificName": "Solanum lycopersicum var. cerasiforme",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 7,
            "vegetativeDays": 28,
            "floweringDays": 14,
            "fruitingDays": 35,
            "harvestDurationDays": 90,
            "totalCycleDays": 75
        },
        "yieldInfo": {
            "yieldPerPlant": 3.5,
            "yieldUnit": "kg",
            "expectedWastePercentage": 10
        },
        "fertilizerSchedule": [
            {
                "stage": "seedling",
                "fertilizerType": "All-purpose balanced fertilizer",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 1,
                "npkRatio": "20-20-20",
                "notes": "Jiffy pellets flood-irrigated with 1/4 strength fertilizer 3x daily. Constant 28C for germination."
            },
            {
                "stage": "vegetative",
                "fertilizerType": "Balanced fertilizer",
                "quantityPerPlant": 30,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "10-10-10",
                "notes": "After seedlings reach 3cm, reduce night temp to 20C. Continue balanced feeding."
            },
            {
                "stage": "flowering",
                "fertilizerType": "Tomato formula",
                "quantityPerPlant": 35,
                "quantityUnit": "grams",
                "frequencyDays": 14,
                "npkRatio": "18-18-21",
                "notes": "After flowers appear, switch to tomato formula or 5-10-10. Higher K for fruit development."
            }
        ],
        "pesticideSchedule": [
            {
                "stage": "vegetative",
                "pesticideType": "Insecticidal soap",
                "targetPest": "Aphids, whiteflies",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 14,
                "safetyNotes": "Organic solution. Safe for beneficial insects.",
                "preharvestIntervalDays": 0
            },
            {
                "stage": "fruiting",
                "pesticideType": "Bacillus thuringiensis (Bt)",
                "targetPest": "Tomato hornworm",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 10,
                "safetyNotes": "Organic biological control. Apply when caterpillars are small.",
                "preharvestIntervalDays": 0
            },
            {
                "stage": "fruiting",
                "pesticideType": "Copper fungicide",
                "targetPest": "Early blight, late blight",
                "quantityPerPlant": 5,
                "quantityUnit": "ml",
                "frequencyDays": 7,
                "safetyNotes": "Preventive application. Avoid overhead watering.",
                "preharvestIntervalDays": 1
            }
        ],
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 18.0,
                "maxCelsius": 29.0,
                "optimalCelsius": 24.0
            },
            "humidity": {
                "minPercentage": 50,
                "maxPercentage": 70,
                "optimalPercentage": 60
            },
            "light": {
                "hoursPerDay": 15,
                "minLux": 30000,
                "maxLux": 70000,
                "ppfd": "400-600 μmol/m²/s (DLI 20-30 mol/m²/day)",
                "photoperiodSensitivity": "day-neutral"
            },
            "co2": {
                "minPpm": 400,
                "optimalPpm": 800
            },
            "airCirculation": {
                "required": True,
                "notes": "Essential for pollination, disease prevention, and even fruit development"
            }
        },
        "wateringRequirements": {
            "frequencyDays": 2,
            "amountPerPlant": 600,
            "amountUnit": "ml",
            "waterQuality": "Clean, pH 5.8-6.5",
            "droughtTolerance": "low"
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
                    "max": 3.0
                },
                "tds": {
                    "min": 1000,
                    "max": 1500
                },
                "ph": {
                    "min": 5.8,
                    "max": 6.5
                }
            }
        },
        "commonDiseasesAndPests": [
            {
                "name": "Early Blight",
                "scientificName": "Alternaria solani",
                "symptoms": "Dark concentric rings on older leaves, yellowing, defoliation",
                "prevention": "Crop rotation, remove debris, avoid overhead watering, resistant varieties",
                "treatment": "Copper fungicides, chlorothalonil (preventive applications)",
                "severity": "high"
            },
            {
                "name": "Tomato Hornworm",
                "scientificName": "Manduca quinquemaculata",
                "symptoms": "Large green caterpillars, defoliation, fruit damage",
                "prevention": "Hand-picking, encourage parasitic wasps, Bt applications",
                "treatment": "Bacillus thuringiensis (Bt), spinosad",
                "severity": "medium"
            },
            {
                "name": "Whiteflies",
                "scientificName": "Bemisia tabaci",
                "symptoms": "Yellowing leaves, honeydew, sooty mold, virus vectors",
                "prevention": "Yellow sticky traps, reflective mulches, beneficial insects",
                "treatment": "Insecticidal soap, neem oil, horticultural oils",
                "severity": "medium-high"
            },
            {
                "name": "Blossom End Rot",
                "scientificName": "Physiological disorder - calcium deficiency",
                "symptoms": "Dark sunken spots on blossom end of fruit",
                "prevention": "Consistent watering, adequate calcium in solution, avoid fluctuations",
                "treatment": "Improve irrigation consistency, calcium supplementation",
                "severity": "medium"
            }
        ],
        "spacingAndSupport": {
            "plantSpacingCm": 60,
            "rowSpacingCm": 90,
            "plantsPerSqMeter": 2,
            "supportRequired": True,
            "supportType": "stakes, cages, or trellis (especially indeterminate varieties)"
        },
        "companionPlanting": {
            "beneficialCompanions": ["Basil", "Carrots", "Onions", "Marigolds", "Nasturtiums", "Asparagus", "Parsley"],
            "incompatiblePlants": ["Brassicas", "Fennel", "Potatoes", "Corn"]
        },
        "qualityGrading": {
            "grades": [
                {
                    "grade": "A",
                    "description": "Uniform size (15-25g), bright color, firm, no cracks, sweet flavor, premium quality",
                    "priceMultiplier": 1.0
                },
                {
                    "grade": "B",
                    "description": "Size variation 10-30g, minor surface cracks acceptable, good flavor",
                    "priceMultiplier": 0.75
                }
            ]
        },
        "economics": {
            "marketPricePerKg": 17.5,
            "laborHoursPerPlant": 1.0
        },
        "uaeAdaptations": {
            "growingSeason": "Cool to warm season - October to May (avoid extreme summer heat)",
            "plantingMonths": ["October", "November", "December", "January", "February", "March"],
            "harvestMonths": ["December", "January", "February", "March", "April", "May", "June"],
            "heatTolerance": "medium",
            "waterRequirement": "high",
            "greenhouseRecommended": True,
            "notes": "EXCELLENT for UAE greenhouse production! Cherry tomatoes are faster (60-90 days), more productive, and more heat-tolerant than large tomatoes. Continuous harvest over 7-8 months (210-250 days/year) in climate-controlled greenhouse. Very popular in local markets and restaurants - premium product. Hydroponic production ideal for water efficiency and disease control. Small fruit size reduces splitting issues in hot weather. Higher sugar content and better flavor than large tomatoes. Production duration: 3-4 kg per plant over season. Can produce year-round with proper climate control."
        }
    }
]

# Add the new plants
data['plants'].extend(phase2_part2_plants)

# Update metadata
data['metadata']['plants_completed'] = 13

# Save the updated JSON
with open('plants-from-old-db-enhanced.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"Successfully added 4 Phase 2 Part 2 plants to the JSON file!")
print(f"Total plants now: {len(data['plants'])}")
print(f"Metadata plants_completed: {data['metadata']['plants_completed']}")
print(f"\nPlants added:")
for plant in phase2_part2_plants:
    print(f"  - {plant['plantName']} ({plant['scientificName']})")
print(f"\n** PHASE 2 COMPLETE! ** All 9 fruiting vegetables researched and added.")
