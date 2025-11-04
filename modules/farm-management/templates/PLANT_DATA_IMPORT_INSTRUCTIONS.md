# Plant Data Import Template - Instructions for Agronomists

## Overview
This CSV template allows you to bulk import plant cultivation data into the A64 Core Farm Management System. Fill out the template with your agronomic knowledge and import it through the Plant Data Library interface.

## Template File
**File:** `plant_data_import_template.csv`

## Field Descriptions

### Required Fields (Must be filled)

| Field | Description | Example | Notes |
|-------|-------------|---------|-------|
| **plantName** | Common name of the plant | "Tomato" | Max 200 characters |
| **plantType** | Category of plant | "Vegetable" | Options: Crop, Tree, Herb, Fruit, Vegetable, Ornamental, Medicinal |
| **growthCycleDays** | Days from planting to harvest | 90 | Must be greater than 0 |
| **expectedYieldPerPlant** | Expected yield per plant | 5.0 | Must be greater than 0 |
| **yieldUnit** | Unit of measurement for yield | "kg" | Common: kg, lbs, units, tons, grams |

### Optional Fields (Recommended for better planning)

| Field | Description | Example | Notes |
|-------|-------------|---------|-------|
| **scientificName** | Latin/scientific name | "Solanum lycopersicum" | Helps with precise identification |
| **minTemperatureCelsius** | Minimum growing temperature | 15 | In degrees Celsius |
| **maxTemperatureCelsius** | Maximum growing temperature | 30 | In degrees Celsius |
| **optimalPHMin** | Minimum optimal soil pH | 6.0 | Range: 0-14 |
| **optimalPHMax** | Maximum optimal soil pH | 6.8 | Range: 0-14 |
| **wateringFrequencyDays** | Days between watering | 3 | Based on normal conditions |
| **sunlightHoursDaily** | Daily sunlight requirement | "6-8" | Use format: "6-8" or single number |
| **fertilizationScheduleDays** | Days between fertilization | 14 | Helps schedule fertilizer application |
| **pesticideScheduleDays** | Days between pesticide application | 21 | Use 0 for no pesticide needed |
| **notes** | Additional cultivation notes | "Requires staking" | Any important growing tips |
| **tags** | Search tags (comma-separated) | "vegetable,summer,fruit" | Helps with filtering and search |

## Plant Type Options

Choose one of the following for the **plantType** field:
- **Crop** - Field crops (corn, wheat, rice, etc.)
- **Tree** - Fruit trees, nut trees, timber
- **Herb** - Culinary and medicinal herbs
- **Fruit** - Berry bushes, vines, small fruits
- **Vegetable** - Garden vegetables
- **Ornamental** - Decorative plants, flowers
- **Medicinal** - Plants grown for medicinal purposes

## CSV Formatting Guidelines

### 1. Text with Commas
If your text contains commas (like in notes or tags), enclose the entire field in quotes:
```csv
"Requires staking, prune suckers"
"vegetable,summer,fruit"
```

### 2. Empty Optional Fields
Leave optional fields empty if you don't have data:
```csv
Lettuce,Lactuca sativa,Vegetable,45,,,6.0,7.0,2,4-6,7,0,0.5,kg,"Cool season crop","vegetable,salad"
```

### 3. Decimal Numbers
Use a period (.) for decimal points:
```csv
5.0,6.8,0.25
```

### 4. Tags Format
Separate tags with commas, and enclose the entire tag list in quotes:
```csv
"vegetable,summer,fruit"
```

### 5. Temperature Ranges
For sunlight hours, use a hyphen:
```csv
6-8
```

## Common Examples

### Example 1: Simple Vegetable
```csv
Lettuce,Lactuca sativa,Vegetable,45,10,24,6.0,7.0,2,4-6,7,0,0.5,kg,"Grows best in cool weather","vegetable,salad,quick-growing"
```

### Example 2: Herb with Minimal Data
```csv
Basil,,Herb,60,,,,,2,6-8,,,0.25,kg,,
```

### Example 3: Perennial Crop
```csv
Rosemary,Rosmarinus officinalis,Herb,365,10,30,6.0,7.5,7,6-8,30,0,0.1,kg,"Perennial herb. Drought-tolerant once established","herb,perennial,drought-tolerant"
```

## How to Import

1. **Download the Template**
   - Click "📥 Download CSV Template" in the Plant Data Library
   - Open the template in Excel, Google Sheets, or any CSV editor

2. **Fill Out Your Data**
   - Keep the header row (first row) unchanged
   - Add your plant data in new rows
   - You can delete the example rows or keep them as reference

3. **Save as CSV**
   - Save the file as CSV (Comma delimited)
   - Ensure the filename ends with `.csv`

4. **Import to System**
   - In the Plant Data Library, click "Import CSV"
   - Select your filled template file
   - Review the import preview
   - Confirm import

## Validation Rules

The system will validate your data during import:

✅ **Will Accept:**
- All required fields filled correctly
- Valid plant types from the list
- Positive numbers for days, yields, and temperatures
- pH values between 0-14
- Properly formatted tags

❌ **Will Reject:**
- Missing required fields (plantName, plantType, growthCycleDays, expectedYieldPerPlant, yieldUnit)
- Negative values for days or yields
- Invalid plant types
- pH values outside 0-14 range
- Malformed CSV structure

## Tips for Best Results

1. **Start Small**: Test with 5-10 plants first to ensure formatting is correct

2. **Use Scientific Names**: Helps prevent confusion between plant varieties

3. **Be Realistic**: Base growth cycles and yields on your local climate and conditions

4. **Document Well**: Use the notes field to capture important cultivation details

5. **Tag Strategically**: Add searchable tags for quick filtering (e.g., "quick-growing", "drought-tolerant", "high-value")

6. **Keep It Updated**: You can always edit plant data after import through the Plant Data Library interface

## Common Issues and Solutions

### Issue: "Invalid plant type"
**Solution**: Use only the allowed plant types: Crop, Tree, Herb, Fruit, Vegetable, Ornamental, Medicinal

### Issue: "Growth cycle must be greater than 0"
**Solution**: Ensure growthCycleDays has a positive number (no zeros or negative values)

### Issue: "Invalid CSV format"
**Solution**: Make sure you saved as CSV (not Excel format) and didn't modify the header row

### Issue: "Tags not importing correctly"
**Solution**: Enclose the entire tag list in quotes: `"tag1,tag2,tag3"`

## Need Help?

If you encounter issues during import:
1. Check that your CSV file follows the format exactly
2. Verify all required fields are filled
3. Ensure numeric values are positive where required
4. Contact your system administrator with the specific error message

## Template Version
**Version:** 1.0.0
**Last Updated:** 2025-11-03
**Compatible with:** Farm Management Module v1.0.0
