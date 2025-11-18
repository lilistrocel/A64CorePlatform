import json

# Load existing data
with open('plants-from-old-db-enhanced.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# New plants to add
new_plants = [
    {
      "plantName": "Lettuce - Iceberg",
      "scientificName": "Lactuca sativa var. capitata (Crisphead)",
      "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],

      "growthCycle": {
        "germinationDays": 8,
        "vegetativeDays": 60,
        "floweringDays": 0,
        "fruitingDays": 0,
        "harvestDurationDays": 7,
        "totalCycleDays": 75
      },

      "yieldInfo": {
        "yieldPerPlant": 0.35,
        "yieldUnit": "kg",
        "expectedWastePercentage": 15
      },

      "fertilizerSchedule": [
        {
          "stage": "vegetative",
          "fertilizerType": "Balanced NPK",
          "quantityPerPlant": 20,
          "quantityUnit": "grams",
          "frequencyDays": 21,
          "npkRatio": "8-15-36",
          "notes": "Commercial hydroponic formula with calcium nitrate (15.5-0-0) as Part B"
        }
      ],

      "pesticideSchedule": [
        {
          "stage": "vegetative",
          "pesticideType": "Insecticidal soap",
          "targetPest": "Aphids",
          "quantityPerPlant": 5,
          "quantityUnit": "ml",
          "frequencyDays": 14,
          "safetyNotes": "Organic solution. Introduce natural predators (lady beetles, lacewings).",
          "preharvestIntervalDays": 0
        },
        {
          "stage": "vegetative",
          "pesticideType": "Floating row covers (physical barrier)",
          "targetPest": "Leafhoppers, thrips, whiteflies, aphids (virus vectors)",
          "quantityPerPlant": 0,
          "quantityUnit": "none",
          "frequencyDays": 0,
          "safetyNotes": "Excellent barrier to pests that vector diseases",
          "preharvestIntervalDays": 0
        }
      ],

      "environmentalRequirements": {
        "temperature": {
          "minCelsius": 13.0,
          "maxCelsius": 21.0,
          "optimalCelsius": 17.0
        },
        "humidity": {
          "minPercentage": 50,
          "maxPercentage": 70,
          "optimalPercentage": 60
        },
        "light": {
          "hoursPerDay": 14,
          "minLux": 15000,
          "maxLux": 45000,
          "ppfd": "250-400 μmol/m²/s",
          "photoperiodSensitivity": "long-day"
        },
        "co2": {
          "minPpm": 400,
          "optimalPpm": 800
        },
        "airCirculation": {
          "required": True,
          "notes": "Good air circulation essential to prevent tipburn and fungal diseases"
        }
      },

      "wateringRequirements": {
        "frequencyDays": 2,
        "amountPerPlant": 300,
        "amountUnit": "ml",
        "waterQuality": "Clean, pH 5.8-6.4",
        "droughtTolerance": "low"
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
            "min": 1.2,
            "max": 1.8
          },
          "tds": {
            "min": 600,
            "max": 900
          },
          "ph": {
            "min": 5.8,
            "max": 6.0
          }
        }
      },

      "commonDiseasesAndPests": [
        {
          "name": "Downy Mildew",
          "scientificName": "Bremia lactucae",
          "symptoms": "Yellow or pale green patches on upper leaf surfaces, grayish downy growth underneath",
          "prevention": "Crop rotation, sanitation, use resistant cultivars, avoid overhead watering",
          "treatment": "Maneb every 7-10 days, copper-based fungicides",
          "severity": "high"
        },
        {
          "name": "Lettuce Drop",
          "scientificName": "Sclerotinia sclerotiorum and S. minor",
          "symptoms": "Sudden wilting and collapse of plants, white cottony fungal growth",
          "prevention": "Crop rotation with Brassica crops, sanitation, avoid excessive irrigation",
          "treatment": "Contans (Coniothyrium minitans) at planting and post-thinning can reduce incidence by 50%",
          "severity": "high"
        },
        {
          "name": "Tipburn",
          "scientificName": "Physiological disorder",
          "symptoms": "Brown edges on inner leaves, calcium deficiency in rapidly expanding tissue",
          "prevention": "Use resistant cultivars, avoid water stress, maintain consistent watering and calcium levels",
          "treatment": "Improve irrigation management, foliar calcium sprays",
          "severity": "medium"
        },
        {
          "name": "Aphids",
          "scientificName": "Multiple species",
          "symptoms": "Leaf curling, honeydew deposits, virus vectors (lettuce mosaic)",
          "prevention": "Floating row covers, beneficial insects, remove infested plants promptly",
          "treatment": "Insecticidal soap, neem oil, imidacloprid for root aphids",
          "severity": "medium"
        }
      ],

      "spacingAndSupport": {
        "plantSpacingCm": 30,
        "rowSpacingCm": 40,
        "plantsPerSqMeter": 9,
        "supportRequired": False,
        "supportType": "none"
      },

      "companionPlanting": {
        "beneficialCompanions": ["Carrot", "Radish", "Strawberry", "Cucumber", "Onion"],
        "incompatiblePlants": ["Celery", "Cabbage", "Parsley"]
      },

      "qualityGrading": {
        "grades": [
          {
            "grade": "A",
            "description": "Firm, tightly closed heads, crisp leaves, no tipburn or disease, 350g+",
            "priceMultiplier": 1.0
          },
          {
            "grade": "B",
            "description": "Slightly loose heads, minor tipburn acceptable, 250-350g",
            "priceMultiplier": 0.7
          }
        ]
      },

      "economics": {
        "marketPricePerKg": 12.0,
        "laborHoursPerPlant": 0.4
      },

      "uaeAdaptations": {
        "growingSeason": "Cool season only - November to March. Unsuitable for UAE summer.",
        "plantingMonths": ["November", "December", "January", "February"],
        "harvestMonths": ["January", "February", "March", "April"],
        "heatTolerance": "very low",
        "waterRequirement": "high",
        "greenhouseRecommended": True,
        "notes": "Requires cool temperatures and bolts quickly in heat. Climate-controlled greenhouse essential for UAE production. Not typically recommended for hydroponics but can be grown successfully. Tipburn risk high in UAE summer."
      }
    },
    {
      "plantName": "Lettuce - Romaine",
      "scientificName": "Lactuca sativa var. longifolia (Cos)",
      "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],

      "growthCycle": {
        "germinationDays": 7,
        "vegetativeDays": 21,
        "floweringDays": 0,
        "fruitingDays": 0,
        "harvestDurationDays": 7,
        "totalCycleDays": 35
      },

      "yieldInfo": {
        "yieldPerPlant": 0.25,
        "yieldUnit": "kg",
        "expectedWastePercentage": 12
      },

      "fertilizerSchedule": [
        {
          "stage": "germination",
          "fertilizerType": "Balanced nutrient solution",
          "quantityPerPlant": 0,
          "quantityUnit": "ml",
          "frequencyDays": 1,
          "npkRatio": "N/A",
          "notes": "Specific nutrient solution: 130 mg/L N-NO3, 11 mg/L N-NH4, 40 mg/L P, 180 mg/L K, 200 mg/L Ca, 35 mg/L Mg"
        },
        {
          "stage": "vegetative",
          "fertilizerType": "Growth formula",
          "quantityPerPlant": 15,
          "quantityUnit": "ml",
          "frequencyDays": 7,
          "npkRatio": "3-1-5",
          "notes": "Higher nitrogen for leaf growth"
        }
      ],

      "pesticideSchedule": [
        {
          "stage": "vegetative",
          "pesticideType": "Insecticidal soap",
          "targetPest": "Aphids",
          "quantityPerPlant": 5,
          "quantityUnit": "ml",
          "frequencyDays": 14,
          "safetyNotes": "Organic solution. Safe for beneficial insects.",
          "preharvestIntervalDays": 0
        },
        {
          "stage": "vegetative",
          "pesticideType": "Floating row covers",
          "targetPest": "Various insects and disease vectors",
          "quantityPerPlant": 0,
          "quantityUnit": "none",
          "frequencyDays": 0,
          "safetyNotes": "Physical barrier, no chemical residue",
          "preharvestIntervalDays": 0
        }
      ],

      "environmentalRequirements": {
        "temperature": {
          "minCelsius": 15.0,
          "maxCelsius": 21.0,
          "optimalCelsius": 18.0
        },
        "humidity": {
          "minPercentage": 50,
          "maxPercentage": 70,
          "optimalPercentage": 60
        },
        "light": {
          "hoursPerDay": 16,
          "minLux": 15000,
          "maxLux": 50000,
          "ppfd": "250-400 μmol/m²/s",
          "photoperiodSensitivity": "long-day"
        },
        "co2": {
          "minPpm": 400,
          "optimalPpm": 800
        },
        "airCirculation": {
          "required": True,
          "notes": "Good airflow prevents diseases and promotes even growth"
        }
      },

      "wateringRequirements": {
        "frequencyDays": 2,
        "amountPerPlant": 250,
        "amountUnit": "ml",
        "waterQuality": "Clean, pH 5.8-6.4, 20-25°C",
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
            "min": 0.8,
            "max": 1.2
          },
          "tds": {
            "min": 400,
            "max": 600
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
          "scientificName": "Bremia lactucae",
          "symptoms": "Yellow patches on leaves, downy gray growth on undersides",
          "prevention": "Use resistant cultivars, good air circulation, avoid overhead watering",
          "treatment": "Copper-based fungicides, remove infected plants",
          "severity": "high"
        },
        {
          "name": "Aphids",
          "scientificName": "Multiple species",
          "symptoms": "Curled leaves, sticky honeydew, stunted growth",
          "prevention": "Beneficial insects, row covers, regular monitoring",
          "treatment": "Insecticidal soap, neem oil, strong water spray",
          "severity": "medium"
        },
        {
          "name": "Tipburn",
          "scientificName": "Physiological disorder",
          "symptoms": "Brown leaf margins, calcium deficiency",
          "prevention": "Consistent watering, calcium supplementation, resistant varieties",
          "treatment": "Improve irrigation, foliar calcium",
          "severity": "medium"
        }
      ],

      "spacingAndSupport": {
        "plantSpacingCm": 25,
        "rowSpacingCm": 35,
        "plantsPerSqMeter": 12,
        "supportRequired": False,
        "supportType": "none"
      },

      "companionPlanting": {
        "beneficialCompanions": ["Carrot", "Radish", "Strawberry", "Beet", "Onion", "Cucumber"],
        "incompatiblePlants": ["Celery", "Parsley"]
      },

      "qualityGrading": {
        "grades": [
          {
            "grade": "A",
            "description": "Tall, upright heads, crisp dark green leaves, no tipburn, 250g+",
            "priceMultiplier": 1.0
          },
          {
            "grade": "B",
            "description": "Shorter heads, lighter green, minor tipburn acceptable, 150-250g",
            "priceMultiplier": 0.75
          }
        ]
      },

      "economics": {
        "marketPricePerKg": 15.0,
        "laborHoursPerPlant": 0.3
      },

      "uaeAdaptations": {
        "growingSeason": "Cool season - November to March. Fast-growing, ideal for succession planting.",
        "plantingMonths": ["November", "December", "January", "February"],
        "harvestMonths": ["December", "January", "February", "March", "April"],
        "heatTolerance": "low",
        "waterRequirement": "medium-high",
        "greenhouseRecommended": True,
        "notes": "Excellent for UAE hydroponics. Fast growth cycle allows multiple harvests per season. Very popular in commercial production. Less prone to tipburn than Iceberg."
      }
    },
    {
      "plantName": "Kangkong (Water Spinach)",
      "scientificName": "Ipomoea aquatica",
      "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic", "aquaponics"],

      "growthCycle": {
        "germinationDays": 10,
        "vegetativeDays": 30,
        "floweringDays": 0,
        "fruitingDays": 0,
        "harvestDurationDays": 30,
        "totalCycleDays": 70
      },

      "yieldInfo": {
        "yieldPerPlant": 0.20,
        "yieldUnit": "kg",
        "expectedWastePercentage": 10
      },

      "fertilizerSchedule": [
        {
          "stage": "vegetative",
          "fertilizerType": "High nitrogen fertilizer",
          "quantityPerPlant": 25,
          "quantityUnit": "grams",
          "frequencyDays": 14,
          "npkRatio": "20-10-10",
          "notes": "Apply after each harvest to encourage regrowth"
        }
      ],

      "pesticideSchedule": [
        {
          "stage": "vegetative",
          "pesticideType": "Neem oil",
          "targetPest": "Aphids, whiteflies",
          "quantityPerPlant": 5,
          "quantityUnit": "ml",
          "frequencyDays": 14,
          "safetyNotes": "Organic solution. Apply in evening.",
          "preharvestIntervalDays": 1
        }
      ],

      "environmentalRequirements": {
        "temperature": {
          "minCelsius": 20.0,
          "maxCelsius": 35.0,
          "optimalCelsius": 28.0
        },
        "humidity": {
          "minPercentage": 60,
          "maxPercentage": 90,
          "optimalPercentage": 75
        },
        "light": {
          "hoursPerDay": 14,
          "minLux": 20000,
          "maxLux": 60000,
          "ppfd": "300-500 μmol/m²/s",
          "photoperiodSensitivity": "day-neutral"
        },
        "co2": {
          "minPpm": 400,
          "optimalPpm": 800
        },
        "airCirculation": {
          "required": True,
          "notes": "Good ventilation in humid conditions prevents fungal diseases"
        }
      },

      "wateringRequirements": {
        "frequencyDays": 1,
        "amountPerPlant": 400,
        "amountUnit": "ml",
        "waterQuality": "Can tolerate lower quality water, semi-aquatic plant",
        "droughtTolerance": "very low"
      },

      "soilRequirements": {
        "phRange": {
          "min": 5.5,
          "max": 7.0
        },
        "soilTypes": ["wet", "boggy", "aquatic", "loam"],
        "organicMatterPercentage": 8,
        "hydroponics": {
          "ec": {
            "min": 1.5,
            "max": 2.5
          },
          "tds": {
            "min": 750,
            "max": 1250
          },
          "ph": {
            "min": 5.5,
            "max": 6.5
          }
        }
      },

      "commonDiseasesAndPests": [
        {
          "name": "Leaf Spot",
          "scientificName": "Various fungal pathogens",
          "symptoms": "Brown or black spots on leaves",
          "prevention": "Avoid overhead watering, good air circulation, remove infected leaves",
          "treatment": "Copper-based fungicides, improve drainage",
          "severity": "medium"
        },
        {
          "name": "Aphids",
          "scientificName": "Multiple species",
          "symptoms": "Curled leaves, sticky honeydew",
          "prevention": "Beneficial insects, regular monitoring",
          "treatment": "Insecticidal soap, neem oil",
          "severity": "low"
        }
      ],

      "spacingAndSupport": {
        "plantSpacingCm": 20,
        "rowSpacingCm": 30,
        "plantsPerSqMeter": 16,
        "supportRequired": False,
        "supportType": "none"
      },

      "companionPlanting": {
        "beneficialCompanions": ["Rice", "Taro", "Lotus", "Fish (in aquaponics)"],
        "incompatiblePlants": []
      },

      "qualityGrading": {
        "grades": [
          {
            "grade": "A",
            "description": "Young tender shoots and leaves, bright green, no yellowing, 15-20cm length",
            "priceMultiplier": 1.0
          },
          {
            "grade": "B",
            "description": "Older leaves, some yellowing acceptable, longer stems",
            "priceMultiplier": 0.6
          }
        ]
      },

      "economics": {
        "marketPricePerKg": 20.0,
        "laborHoursPerPlant": 0.4
      },

      "uaeAdaptations": {
        "growingSeason": "Warm season - March to October. Thrives in UAE summer heat.",
        "plantingMonths": ["March", "April", "May", "June", "July", "August"],
        "harvestMonths": ["April", "May", "June", "July", "August", "September", "October"],
        "heatTolerance": "very high",
        "waterRequirement": "very high",
        "greenhouseRecommended": False,
        "notes": "EXCELLENT for UAE summer production when most leafy greens fail. Loves heat and humidity. Ideal for hydroponic/aquaponic systems. Cut-and-come-again harvest (2-3 cuttings). Very popular in Asian communities. WARNING: Check local regulations - considered invasive in some regions."
      }
    }
]

# Add new plants to the existing data
data['plants'].extend(new_plants)

# Save updated data
with open('plants-from-old-db-enhanced.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"Successfully added {len(new_plants)} plants")
print(f"Total plants now: {len(data['plants'])}")
print("\nPlants added:")
for plant in new_plants:
    print(f"  - {plant['plantName']}")
