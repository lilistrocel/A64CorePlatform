# UAE Popular Plants - Enhanced Agronomic Data

## Overview

This directory contains **comprehensive agronomic data** for popular plants grown in the United Arab Emirates. The enhanced dataset goes far beyond basic plant information to include detailed cultivation requirements, fertilizer schedules, pest management strategies, environmental parameters, and economic data.

This data is designed to be imported into the `plant_data_enhanced` collection of the A64 Core Platform farm management system.

## Files

### `uae-popular-plants-enhanced.json`

Comprehensive JSON file containing detailed agricultural data for UAE crops, featuring **all 20 fully documented plants** from the most popular crops grown in the UAE.

**Included Plants (All Fully Documented):**

**Solanaceae Family (4 plants):**
1. **Tomato** (Solanum lycopersicum) - High-value commercial vegetable
2. **Bell Pepper** (Capsicum annuum) - High-value commercial vegetable
3. **Eggplant** (Solanum melongena) - Popular warm-season crop

**Brassicaceae Family (5 plants):**
4. **Cabbage** (Brassica oleracea var. capitata) - Cool-season vegetable
5. **Cauliflower** (Brassica oleracea var. botrytis) - Premium cool-season crop
6. **Broccoli** (Brassica oleracea var. italica) - Nutritious cool-season vegetable
7. **Kale** (Brassica oleracea var. sabellica) - Superfood leafy green

**Cucurbitaceae Family (4 plants):**
8. **Cucumber** (Cucumis sativus) - Popular greenhouse crop
9. **Zucchini** (Cucurbita pepo) - Fast-growing summer squash
10. **Watermelon** (Citrullus lanatus) - Refreshing summer fruit
11. **Cantaloupe** (Cucumis melo var. cantalupensis) - Sweet aromatic melon

**Leafy Greens (3 plants):**
12. **Lettuce** (Lactuca sativa) - Fast-growing hydroponic crop
13. **Spinach** (Spinacia oleracea) - Nutritious cool-season leafy green
14. **Swiss Chard** (Beta vulgaris subsp. vulgaris) - Colorful productive leafy green

**Root Vegetables (2 plants):**
15. **Carrot** (Daucus carota subsp. sativus) - Popular root vegetable
16. **Radish** (Raphanus sativus) - Fast-growing crunchy root

**Fruit Trees (3 plants):**
17. **Date Palm** (Phoenix dactylifera) - UAE's most significant crop
18. **Mango** (Mangifera indica) - Premium tropical fruit tree
19. **Sweet Orange** (Citrus sinensis) - Popular citrus fruit

**Berries (1 plant):**
20. **Strawberry** (Fragaria × ananassa) - High-value berry crop

## Data Structure

### Schema Compliance

This dataset complies with the `PlantDataEnhanced` schema defined in:
`modules/farm-management/src/models/plant_data_enhanced.py`

### Complete Field Categories

#### 1. **Basic Information**
- Common name, scientific name
- Farm type compatibility (open field, greenhouse, hydroponic, vertical farm)

#### 2. **Growth Cycle Durations**
- Germination days
- Vegetative growth days
- Flowering days (if applicable)
- Fruiting days (if applicable)
- Harvest duration days
- Total cycle days

#### 3. **Yield & Waste Information**
- Expected yield per plant
- Yield unit (kg, lbs, units)
- Expected waste percentage

#### 4. **Fertilizer Schedule**
Multiple fertilizer applications per growth stage including:
- Growth stage (germination, vegetative, flowering, fruiting, harvest)
- Fertilizer type/name
- Quantity per plant per application
- Quantity unit (grams, ml, oz)
- Application frequency (days between applications)
- NPK ratio (e.g., "10-10-10", "5-10-10")
- Application notes

#### 5. **Pesticide Schedule**
IPM-based pest management including:
- Growth stage for application
- Pesticide type/name (preference for organic/biological controls)
- Target pest or disease
- Quantity per plant per application
- Application frequency
- Safety notes and precautions
- Pre-harvest interval (days before harvest to stop application)

#### 6. **Environmental Requirements**
- **Temperature Range:**
  - Minimum temperature (°C)
  - Maximum temperature (°C)
  - Optimal temperature (°C)
- **Humidity Range:**
  - Minimum humidity (%)
  - Maximum humidity (%)
  - Optimal humidity (%)
- CO2 requirement (PPM for greenhouse/indoor)
- Air circulation requirements

#### 7. **Watering Requirements**
- Frequency (days between watering)
- Water type (tap, filtered, RO, rainwater, distilled)
- Amount per plant per watering (liters)
- Drought tolerance level (low, medium, high)
- Watering notes

#### 8. **Soil & pH Requirements**
- **pH Requirements:**
  - Minimum pH
  - Maximum pH
  - Optimal pH
- Recommended soil types (loamy, sandy, clay, silty, peaty, chalky)
- Nutrient recommendations (N, P, K, Ca, Mg, etc.)
- EC range (mS/cm for hydroponics)
- TDS range (PPM for hydroponics)
- Additional soil notes

#### 9. **Diseases & Pest Management**
For each disease/pest:
- Name (common and scientific)
- Visible symptoms
- Prevention measures (cultural, biological, mechanical)
- Treatment options (chemical, biological, organic)
- Severity level (low, medium, high, critical)

#### 10. **Light Requirements**
- Light type (full sun, partial shade, full shade, filtered light)
- Minimum daily hours
- Maximum daily hours
- Optimal daily hours
- Light intensity (Lux for general, PPFD for indoor)
- Photoperiod sensitivity (true/false)
- Light requirement notes

#### 11. **Quality Grading Standards**
Multiple grade levels including:
- Grade name (A/Premium, B/Standard, C/Processing)
- Size requirements for grade
- Color requirements
- Defect tolerance
- Other quality criteria
- Price multiplier (vs base grade)

#### 12. **Economics & Labor**
- Average market value per kg
- Currency code
- Total man-hours per plant (full lifecycle)
- Planting hours per plant
- Maintenance hours per plant
- Harvesting hours per plant
- Economic notes

#### 13. **Additional Agronomic Information**
- Growth habit (determinate, indeterminate, bush, vine, climbing, spreading)
- **Spacing requirements:**
  - Between plants (cm)
  - Between rows (cm)
  - Plants per square meter (calculated)
- Support requirements (none, trellis, stakes, cage, net, pole)
- Companion plants (beneficial)
- Incompatible plants (avoid planting nearby)
- Additional cultivation notes

#### 14. **Search & Organization**
- Tags (vegetable, fruit, summer, winter, hydroponic, commercial, etc.)

## Data Sources

All information verified through official agricultural sources:

### Official Government & International Organizations
1. **UAE Ministry of Climate Change and Environment (MOCCAE)**
   - Agricultural statistics and crop production data
   - UAE agriculture calendar
   - National agriculture programs

2. **FAO (Food and Agriculture Organization)**
   - FAO Irrigation and Drainage Paper 56 (Crop Evapotranspiration)
   - Crop water requirements
   - Date palm cultivation guidelines

3. **USDA (United States Department of Agriculture)**
   - USDA PLANTS Database
   - USDA ARS Research papers
   - Plant nomenclature and classification

### University Extension Services
4. **NC State Extension**
   - IPM for tomatoes
   - Vegetable production guides
   - Pest management strategies

5. **Penn State Extension**
   - Tomato production from seedlings to fruit
   - Heat stress and tomatoes
   - Home garden pest management

6. **University of Maryland Extension**
   - Fertilizing vegetables
   - Vegetable gardening guides

7. **University of Florida IFAS Extension**
   - Calculating fertilizer rates
   - Tomato insect pest management

8. **UC Davis IPM Program**
   - Integrated Pest Management for vegetables
   - Disease and pest identification
   - Treatment recommendations

### Scientific Literature
9. **Peer-reviewed Agricultural Journals**
   - Growth cycle research
   - Environmental parameter studies
   - IPM effectiveness studies

## Usage Guide

### Importing into Database

This JSON structure is ready to be imported into MongoDB `plant_data_enhanced` collection:

```bash
# MongoDB import command
mongoimport --uri="mongodb://localhost:27017/a64core_db" \
  --collection=plant_data_enhanced \
  --file=data/starter-data/plants/uae-popular-plants-enhanced.json \
  --jsonArray
```

### Field Mapping Notes

- **UUID Fields:** System will generate `plantDataId` on import
- **Audit Fields:** Set `createdBy`, `createdByEmail`, `createdAt`, `updatedAt` during import
- **Versioning:** Start with `dataVersion: 1`
- **Soft Delete:** `deletedAt` should be `null` for active records

### API Integration

Once imported, this data will be accessible through:
- `/api/v1/farm/plant-data-enhanced` - Get all enhanced plant data
- `/api/v1/farm/plant-data-enhanced/{plantDataId}` - Get specific plant
- Search, filter, and pagination support

### Validation

All data complies with Pydantic validation rules defined in `plant_data_enhanced.py`:
- ✅ Temperature ranges validated (min ≤ optimal ≤ max)
- ✅ pH ranges validated (0-14 scale)
- ✅ Humidity percentages validated (0-100)
- ✅ Growth cycle days calculated and validated
- ✅ Enum values validated (farm types, growth stages, tolerance levels)

## UAE-Specific Considerations

### Climate Adaptations
- **Extreme Heat:** Many crops require shade or greenhouse protection in UAE summer (May-September)
- **Growing Seasons:**
  - Cool season crops: October-March
  - Warm season crops: Year-round with climate control
- **Water Scarcity:** Drip irrigation and hydroponics preferred
- **High Salinity:** EC and TDS ranges adjusted for UAE conditions

### Commercial Production
- **Hydroponics:** Popular for leafy greens, tomatoes, cucumbers (saves 70% water)
- **Greenhouses:** Essential for extending seasons and protecting from extreme heat
- **Date Palms:** 4 million trees, 6% of world production
- **Local Food Security:** Target 20%+ local production for vegetables

### Integrated Pest Management (IPM)
All pest management strategies prioritize:
1. **Cultural controls** (crop rotation, sanitation, resistant varieties)
2. **Biological controls** (beneficial insects, Bt, natural predators)
3. **Mechanical controls** (hand-picking, traps, barriers)
4. **Chemical controls** (last resort, organic options preferred)

## Data Quality Standards

### Verification Process
1. ✅ Cross-referenced multiple official sources
2. ✅ Validated against university extension guidelines
3. ✅ Compared with FAO and USDA standards
4. ✅ Adjusted for UAE climate conditions
5. ✅ Reviewed by agronomic literature

### Update Schedule
- **Quarterly Reviews:** Check for updated agricultural research
- **Seasonal Adjustments:** Update based on UAE farmer feedback
- **New Varieties:** Add improved cultivars as they become available
- **Pest/Disease Updates:** Monitor for emerging threats

## Contributing

To add or update plant data:

1. **Research Requirements:**
   - Use official sources (government ag departments, universities, FAO)
   - Verify data across multiple sources
   - Include UAE-specific adaptations

2. **Data Format:**
   - Follow exact JSON schema from `plant_data_enhanced.py`
   - Include all required fields
   - Add comprehensive notes

3. **Quality Checklist:**
   - [ ] Scientific name verified (USDA PLANTS Database)
   - [ ] Growth cycle days validated with research
   - [ ] Fertilizer recommendations from extension services
   - [ ] Pest/disease info from IPM programs
   - [ ] Environmental ranges from scientific literature
   - [ ] Economic data from market sources
   - [ ] UAE climate considerations noted

## Future Expansion

### Phase 1: Complete Top 20 ✅ COMPLETED (2025-11-07)
All 20 UAE popular plants with full documentation - COMPLETED!

### Phase 2: Regional Varieties (Target: Q2 2026)
Add regional date palm varieties, local cultivars

### Phase 3: Export Crops (Target: Q3 2026)
Add crops for UAE export markets

### Phase 4: Experimental Crops (Target: Q4 2026)
Add emerging crops (quinoa, vertical farming crops)

## License & Attribution

This data compilation is for use in the A64 Core Platform. Source data comes from:
- Public government agricultural databases
- University extension publications (generally public domain)
- FAO publications (Creative Commons)
- USDA databases (public domain)

Please maintain attribution to original sources when using this data.

## Support

For questions about this data:
- **Technical Issues:** Check schema validation in `plant_data_enhanced.py`
- **Data Accuracy:** Refer to listed sources for verification
- **UAE Adaptations:** Consult MOCCAE agriculture guidelines
- **Import Issues:** Check MongoDB import logs

## Version History

**v2.0 (2025-11-07)** ✅ CURRENT
- **COMPLETE DATASET:** All 20 UAE popular plants fully documented
- Added 15 new plants with comprehensive data:
  - Brassicas: Eggplant, Cabbage, Cauliflower, Broccoli, Kale
  - Cucurbits: Zucchini, Watermelon, Cantaloupe
  - Leafy Greens: Spinach, Swiss Chard
  - Root Vegetables: Carrot, Radish
  - Fruit Trees: Mango, Sweet Orange
  - Berries: Strawberry
- Enterprise-grade data from official sources (FAO, USDA, University Extensions)
- IPM-based pest management strategies
- Complete fertilizer schedules by growth stage
- Environmental requirements and economic data
- Ready for production database import
- File size: 171.9 KB, 4,052 lines of verified agricultural data

**v1.0 (2025-11-07)**
- Initial release with 5 fully documented plants
- Tomato, Date Palm, Lettuce, Cucumber, Bell Pepper
- Complete agronomic data from official sources
- JSON schema validation completed
