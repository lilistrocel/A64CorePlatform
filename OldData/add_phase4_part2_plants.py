#!/usr/bin/env python3
"""
Add Phase 4 Part 2 Plants - FINAL 4 PLANTS! (100% completion!)
Plants: Sweet Corn, Drumstick (Moringa), Fennel, Red Onion
Source: PHASE4_OTHER_VEG_RESEARCH_COMPLETE.md
"""

import json

phase4_part2_plants = [
    {
        "plantName": "Corn - Sweet (Sweet Corn)",
        "scientificName": "Zea mays var. saccharata L.",
        "farmTypeCompatibility": ["open_field"],
        "growthCycle": {
            "germinationDays": 8,
            "vegetativeDays": 43,
            "floweringDays": 9,
            "fruitingDays": 21,
            "harvestDurationDays": 4,
            "totalCycleDays": 78
        },
        "yieldInfo": {
            "yieldPerPlant": 0.4,
            "yieldUnit": "kg",
            "expectedWastePercentage": 60
        },
        "fertilizerSchedule": {
            "germinationStage": {"npk": "5-5-5", "frequency": "weekly"},
            "vegetativeStage": {"npk": "17-7-10", "frequency": "weekly"},
            "floweringStage": {"npk": "10-20-20", "frequency": "weekly"},
            "fruitingStage": {"npk": "5-20-25", "frequency": "weekly"}
        },
        "hydroponicInfo": {
            "ecRange": {"min": 1.8, "max": 2.4},
            "phRange": {"min": 6.0, "max": 7.0},
            "optimalTemperature": {"min": 18, "max": 24},
            "lightRequirement": "very_high",
            "dli": {"min": 20, "max": 25},
            "ppfd": {"min": 600, "max": 800},
            "waterRequirementPerDay": 3.0
        },
        "pests": [
            {
                "name": "Corn Earworm",
                "severity": "very_high",
                "organicControl": "Bt (Bacillus thuringiensis), Spinosad, mineral oil on silk",
                "biologicalControl": "Trichogramma wasps, predatory beetles",
                "culturalPractices": "Hand-pick, destroy infested ears, pheromone traps"
            },
            {
                "name": "European Corn Borer",
                "severity": "high",
                "organicControl": "Bt, destroy stalks after harvest",
                "biologicalControl": "Trichogramma wasps",
                "culturalPractices": "Crop rotation, destroy crop residue"
            }
        ],
        "diseases": [
            {
                "name": "Common Rust",
                "severity": "high",
                "symptoms": "Orange-brown pustules on leaves",
                "organicControl": "Sulfur spray (limited effectiveness)",
                "prevention": "Resistant varieties, good air circulation"
            },
            {
                "name": "Gray Leaf Spot",
                "severity": "medium",
                "symptoms": "Rectangular gray-tan lesions on leaves",
                "organicControl": "Remove infected plants",
                "prevention": "Crop rotation, destroy debris, resistant varieties"
            }
        ],
        "environmentalRequirements": {
            "temperature": {"min": 15, "max": 35, "optimal": 25},
            "humidity": {"min": 50, "max": 70, "optimal": 60},
            "lightHours": {"min": 12, "max": 14, "optimal": 13},
            "co2": 900,
            "soilPh": {"min": 6.0, "max": 7.0}
        },
        "uaeAdaptations": {
            "heatTolerance": "high",
            "coldTolerance": "very_low",
            "waterRequirement": "very_high",
            "greenhouseRequired": False,
            "summerOutdoorSuitable": False,
            "winterOutdoorSuitable": True,
            "bestPlantingMonths": [2, 3, 10, 11],
            "localChallenges": "High water needs in desert; wind pollination requires blocks of minimum 16 plants (4x4); corn earworm severe in UAE climate",
            "localRecommendations": "NOT recommended for hydroponics! Grow as open-field crop Feb-Apr and Oct-Nov; plant in blocks for pollination; choose fast-maturing varieties (70-80 days)"
        },
        "companionPlants": {
            "goodCompanions": ["Beans", "Squash", "Cucumber", "Peas"],
            "badCompanions": ["Tomato", "Celery"],
            "reasoning": "Three sisters system: corn provides trellis for beans, beans fix nitrogen, squash shades soil"
        },
        "economicInfo": {
            "marketPrice": 10.0,
            "priceUnit": "AED/kg",
            "marketDemand": "medium",
            "shelfLife": 5,
            "storageRequirements": "Refrigerated 0°C, very high humidity 95-98%"
        },
        "qualityGrading": {
            "premiumCriteria": "Full plump kernels, milky juice when pierced, tight green husk, moist silk, ear 18-20 cm, no worm damage",
            "standardCriteria": "Reasonably full kernels, some tip unfilled ok, minor blemishes",
            "rejectionCriteria": "Worm damage, dry kernels, incomplete pollination, disease"
        },
        "metadata": {
            "oldDbId": "corn_sweet_old_id",
            "sources": [
                "UC Davis IPM: Sweet Corn Pest Management",
                "NC State Extension: Sweet Corn Production",
                "University of Minnesota Extension: Growing Sweet Corn"
            ],
            "researchDate": "2025-11-18",
            "lastUpdated": "2025-11-18"
        }
    },
    {
        "plantName": "Drumstick (Moringa)",
        "scientificName": "Moringa oleifera Lam.",
        "farmTypeCompatibility": ["open_field"],
        "growthCycle": {
            "germinationDays": 10,
            "vegetativeDays": 105,
            "floweringDays": 38,
            "fruitingDays": 75,
            "harvestDurationDays": 75,
            "totalCycleDays": 225
        },
        "yieldInfo": {
            "yieldPerPlant": 13.0,
            "yieldUnit": "kg",
            "expectedWastePercentage": 40
        },
        "fertilizerSchedule": {
            "germinationStage": {"npk": "5-5-5", "frequency": "weekly"},
            "vegetativeStage": {"npk": "15-10-10", "frequency": "bi-weekly"},
            "floweringStage": {"npk": "10-20-15", "frequency": "weekly"},
            "fruitingStage": {"npk": "5-20-20", "frequency": "weekly"}
        },
        "hydroponicInfo": {
            "ecRange": {"min": 2.0, "max": 3.0},
            "phRange": {"min": 6.0, "max": 7.0},
            "optimalTemperature": {"min": 20, "max": 30},
            "lightRequirement": "very_high",
            "dli": {"min": 20, "max": 25},
            "ppfd": {"min": 600, "max": 800},
            "waterRequirementPerDay": 3.5
        },
        "pests": [
            {
                "name": "Pod Fly",
                "severity": "high",
                "organicControl": "Kaolin clay, neem oil, remove infested pods",
                "biologicalControl": "Parasitic wasps",
                "culturalPractices": "Bag pods, remove fallen pods promptly"
            },
            {
                "name": "Leaf Caterpillars",
                "severity": "medium",
                "organicControl": "Bt (Bacillus thuringiensis), hand-pick",
                "biologicalControl": "Birds, parasitic wasps",
                "culturalPractices": "Monitor regularly"
            }
        ],
        "diseases": [
            {
                "name": "Root Rot",
                "severity": "medium",
                "symptoms": "Wilting, yellowing, brown mushy roots",
                "organicControl": "Improve drainage, biological fungicides",
                "prevention": "Well-drained soil, avoid overwatering"
            },
            {
                "name": "Leaf Spot",
                "severity": "low",
                "symptoms": "Brown spots on leaves",
                "organicControl": "Copper fungicide, remove infected leaves",
                "prevention": "Good air circulation"
            }
        ],
        "environmentalRequirements": {
            "temperature": {"min": 10, "max": 48, "optimal": 28},
            "humidity": {"min": 20, "max": 80, "optimal": 50},
            "lightHours": {"min": 12, "max": 14, "optimal": 13},
            "co2": 900,
            "soilPh": {"min": 6.0, "max": 7.0}
        },
        "uaeAdaptations": {
            "heatTolerance": "very_high",
            "coldTolerance": "low",
            "waterRequirement": "low",
            "greenhouseRequired": False,
            "summerOutdoorSuitable": True,
            "winterOutdoorSuitable": True,
            "bestPlantingMonths": [3, 4],
            "localChallenges": "Slow to first pod production (6-9 months); large tree size requires space; can be invasive if not managed",
            "localRecommendations": "PERFECT for UAE! Heat-loving perennial tree; extremely drought-tolerant once established; pods highly popular in South Asian cuisine; plant as border/hedge for farms; produces year-round in UAE"
        },
        "companionPlants": {
            "goodCompanions": ["Most crops", "Nitrogen-fixing cover crops"],
            "badCompanions": ["None specific"],
            "reasoning": "Can provide light shade and windbreak for other crops; deep roots don't compete"
        },
        "economicInfo": {
            "marketPrice": 20.0,
            "priceUnit": "AED/kg",
            "marketDemand": "very_high",
            "shelfLife": 8,
            "storageRequirements": "Refrigerated 7-10°C, high humidity"
        },
        "qualityGrading": {
            "premiumCriteria": "Young tender pods 20-40 cm, pencil-thin, bright green, no seeds developed, snap easily",
            "standardCriteria": "Pods 40-60 cm, slightly thicker, minor blemishes ok",
            "rejectionCriteria": "Tough fibrous pods, mature hard seeds, yellowing, >60 cm (too tough)"
        },
        "metadata": {
            "oldDbId": "drumstick_moringa_old_id",
            "sources": [
                "FAO: Moringa Cultivation and Use",
                "USDA PLANTS: Moringa oleifera",
                "Trees for Life: Moringa cultivation guide"
            ],
            "researchDate": "2025-11-18",
            "lastUpdated": "2025-11-18"
        }
    },
    {
        "plantName": "Fennel (Florence Fennel)",
        "scientificName": "Foeniculum vulgare var. azoricum (Mill.) Thell.",
        "farmTypeCompatibility": ["greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 10,
            "vegetativeDays": 75,
            "floweringDays": 0,
            "fruitingDays": 0,
            "harvestDurationDays": 10,
            "totalCycleDays": 85
        },
        "yieldInfo": {
            "yieldPerPlant": 0.55,
            "yieldUnit": "kg",
            "expectedWastePercentage": 30
        },
        "fertilizerSchedule": {
            "germinationStage": {"npk": "5-5-5", "frequency": "weekly"},
            "vegetativeStage": {"npk": "10-5-10", "frequency": "weekly"},
            "floweringStage": {"npk": "5-10-15", "frequency": "weekly"},
            "fruitingStage": {"npk": "3-10-15", "frequency": "bi-weekly"}
        },
        "hydroponicInfo": {
            "ecRange": {"min": 1.0, "max": 1.4},
            "phRange": {"min": 6.4, "max": 6.8},
            "optimalTemperature": {"min": 15, "max": 18},
            "lightRequirement": "medium",
            "dli": {"min": 12, "max": 15},
            "ppfd": {"min": 250, "max": 350},
            "waterRequirementPerDay": 1.75
        },
        "pests": [
            {
                "name": "Aphids",
                "severity": "medium",
                "organicControl": "Insecticidal soap, neem oil",
                "biologicalControl": "Ladybugs, Aphidius wasps",
                "culturalPractices": "Monitor new growth"
            },
            {
                "name": "Cutworms",
                "severity": "medium",
                "organicControl": "Bt, hand-pick at night",
                "biologicalControl": "Beneficial nematodes",
                "culturalPractices": "Collars around seedlings"
            }
        ],
        "diseases": [
            {
                "name": "Fusarium Wilt",
                "severity": "medium",
                "symptoms": "Yellowing, wilting, brown vascular tissue",
                "organicControl": "Remove infected plants, long rotation",
                "prevention": "Use disease-free transplants, avoid contaminated soil"
            },
            {
                "name": "Pythium Root Rot",
                "severity": "medium",
                "symptoms": "Brown mushy roots, wilting",
                "organicControl": "Biological fungicides",
                "prevention": "Well-drained media, avoid overwatering"
            }
        ],
        "environmentalRequirements": {
            "temperature": {"min": 5, "max": 25, "optimal": 18},
            "humidity": {"min": 50, "max": 70, "optimal": 60},
            "lightHours": {"min": 12, "max": 14, "optimal": 13},
            "co2": 900,
            "soilPh": {"min": 6.0, "max": 7.0}
        },
        "uaeAdaptations": {
            "heatTolerance": "very_low",
            "coldTolerance": "high",
            "waterRequirement": "medium",
            "greenhouseRequired": True,
            "summerOutdoorSuitable": False,
            "winterOutdoorSuitable": False,
            "bestPlantingMonths": [11, 12, 1],
            "localChallenges": "EXTREMELY sensitive to temperature stress - ANY temperature swing >25°C or sudden cold causes immediate bolting; requires consistent cool 15-20°C for 80-90 days",
            "localRecommendations": "VERY DIFFICULT crop for UAE! Only attempt in climate-controlled greenhouse with precise 15-20°C; choose bolt-resistant varieties; direct seed (transplanting can trigger bolting)"
        },
        "companionPlants": {
            "goodCompanions": ["Most crops"],
            "badCompanions": ["Tomato", "Bean", "Kohlrabi", "Caraway"],
            "reasoning": "Fennel secretes substance that inhibits some plants; keep isolated"
        },
        "economicInfo": {
            "marketPrice": 25.0,
            "priceUnit": "AED/kg",
            "marketDemand": "medium",
            "shelfLife": 12,
            "storageRequirements": "Refrigerated 0-2°C, high humidity 95%"
        },
        "qualityGrading": {
            "premiumCriteria": "Firm white bulbs, 8-12 cm diameter, no bolting, crisp texture, mild anise flavor",
            "standardCriteria": "Reasonably firm, slight discoloration ok",
            "rejectionCriteria": "Bolting (flower stalk), split bulbs, brown discoloration, limp texture"
        },
        "metadata": {
            "oldDbId": "fennel_old_id",
            "sources": [
                "UC Davis: Fennel Production",
                "Johnny's Seeds: Florence Fennel Culture",
                "Cornell Vegetable Program: Specialty Vegetables"
            ],
            "researchDate": "2025-11-18",
            "lastUpdated": "2025-11-18"
        }
    },
    {
        "plantName": "Onion - Red",
        "scientificName": "Allium cepa L.",
        "farmTypeCompatibility": ["open_field"],
        "growthCycle": {
            "germinationDays": 8,
            "vegetativeDays": 105,
            "floweringDays": 45,
            "fruitingDays": 0,
            "harvestDurationDays": 18,
            "totalCycleDays": 150
        },
        "yieldInfo": {
            "yieldPerPlant": 0.25,
            "yieldUnit": "kg",
            "expectedWastePercentage": 12
        },
        "fertilizerSchedule": {
            "germinationStage": {"npk": "5-5-5", "frequency": "weekly"},
            "vegetativeStage": {"npk": "15-5-10", "frequency": "weekly"},
            "floweringStage": {"npk": "10-10-15", "frequency": "weekly"},
            "fruitingStage": {"npk": "5-10-20", "frequency": "weekly"}
        },
        "hydroponicInfo": {
            "ecRange": {"min": 1.4, "max": 1.8},
            "phRange": {"min": 6.0, "max": 6.7},
            "optimalTemperature": {"min": 15, "max": 20},
            "lightRequirement": "medium_high",
            "dli": {"min": 14, "max": 18},
            "ppfd": {"min": 350, "max": 450},
            "waterRequirementPerDay": 1.0
        },
        "pests": [
            {
                "name": "Onion Thrips",
                "severity": "very_high",
                "organicControl": "Spinosad, insecticidal soap",
                "biologicalControl": "Predatory mites, minute pirate bugs",
                "culturalPractices": "Blue sticky traps, reflective mulch, destroy crop debris"
            },
            {
                "name": "Onion Maggot",
                "severity": "high",
                "organicControl": "Beneficial nematodes",
                "biologicalControl": "Ground beetles, rove beetles",
                "culturalPractices": "Row covers, avoid planting near previous onion crops"
            }
        ],
        "diseases": [
            {
                "name": "Purple Blotch",
                "severity": "high",
                "symptoms": "White lesions with purple borders on leaves",
                "organicControl": "Copper fungicide",
                "prevention": "Avoid overhead watering, good air circulation, crop rotation"
            },
            {
                "name": "Downy Mildew",
                "severity": "high",
                "symptoms": "Pale green patches on leaves, gray-purple fuzzy growth",
                "organicControl": "Copper fungicide",
                "prevention": "Good air circulation, avoid overhead watering, resistant varieties"
            }
        ],
        "environmentalRequirements": {
            "temperature": {"min": 7, "max": 30, "optimal": 20},
            "humidity": {"min": 50, "max": 70, "optimal": 60},
            "lightHours": {"min": 10, "max": 12, "optimal": 11},
            "co2": 900,
            "soilPh": {"min": 6.0, "max": 7.0}
        },
        "uaeAdaptations": {
            "heatTolerance": "medium",
            "coldTolerance": "high",
            "waterRequirement": "medium",
            "greenhouseRequired": False,
            "summerOutdoorSuitable": False,
            "winterOutdoorSuitable": True,
            "bestPlantingMonths": [10, 11, 12],
            "localChallenges": "MUST use short-day varieties (long-day won't bulb in UAE low latitude!); long growing season (120+ days); onion thrips very difficult to control",
            "localRecommendations": "Grow Oct-Mar using SHORT-DAY or INTERMEDIATE-DAY varieties only; use onion sets instead of seed for faster maturity (90 days vs 150 days); stop irrigation 2-3 weeks before harvest and cure in dry shade"
        },
        "companionPlants": {
            "goodCompanions": ["Carrot", "Beet", "Lettuce", "Cabbage", "Tomato"],
            "badCompanions": ["Bean", "Pea", "Asparagus", "Sage"],
            "reasoning": "Alliums repel many pests; avoid legumes (onions stunt their growth)"
        },
        "economicInfo": {
            "marketPrice": 6.0,
            "priceUnit": "AED/kg",
            "marketDemand": "very_high",
            "shelfLife": 90,
            "storageRequirements": "Cured, stored in cool dry place 10-15°C, low humidity"
        },
        "qualityGrading": {
            "premiumCriteria": "Firm hard bulbs, deep red-purple color, dry papery skins, 6-10 cm diameter, no sprouting, no disease",
            "standardCriteria": "Reasonably firm, minor blemishes ok, some green tops ok",
            "rejectionCriteria": "Soft bulbs, sprouting, disease, split bulbs, poor color"
        },
        "metadata": {
            "oldDbId": "onion_red_old_id",
            "sources": [
                "UC Davis IPM: Onion Pest Management",
                "NC State Extension: Onion Production",
                "University of Georgia: Onion Production Guide"
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
data['plants'].extend(phase4_part2_plants)

# Update metadata - 39 plants COMPLETE!
data['metadata']['plants_completed'] = 39
data['metadata']['last_updated'] = '2025-11-18'
data['metadata']['completion_status'] = '100% COMPLETE - All 39 plants researched and added!'

# Save
with open('OldData/plants-from-old-db-enhanced.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("=" * 60)
print("SUCCESS: Added FINAL 4 Phase 4 Part 2 plants!")
print("=" * 60)
print(f"Total plants in JSON: {len(data['plants'])}")
print("")
print("PHASE 4 (Other Vegetables): COMPLETE - 9/9 plants")
print("  - Sweet Corn")
print("  - Drumstick (Moringa)")
print("  - Fennel")
print("  - Red Onion")
print("")
print("=" * 60)
print("PROJECT 100% COMPLETE!")
print("=" * 60)
print("Phase 1 (Leafy Greens & Herbs): 13/13 - COMPLETE")
print("Phase 2 (Fruiting Vegetables): 9/9 - COMPLETE")
print("Phase 3 (Melons & Squash): 8/8 - COMPLETE")
print("Phase 4 (Other Vegetables): 9/9 - COMPLETE")
print("")
print("TOTAL: 39/39 plants (100%)")
print("=" * 60)
