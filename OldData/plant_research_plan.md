# Plant Data Research Plan
## Old Database → New Enhanced Format

### Objective
Create comprehensive enhanced plant data for all 41 unique plants found in the old Supabase database, following the structure in `data/starter-data/plants/uae-popular-plants-enhanced.json`.

### Approach: Hybrid Variety Management

**Merge these varieties:**
- Bell Peppers (Green, Red, Yellow) → Single "Bell Pepper" with color variations
- Zucchini (Green, Yellow) → Single "Zucchini" with color variations
- Lettuce colors within same type (e.g., Lollo Bionda/Rosso) → Note color in description

**Keep separate:**
- Different lettuce types (Boston, Romaine, Iceberg, Oakleaf, Frisee, Radicchio) - genuinely different cultivars
- Tomato types (Regular, Cherry) - different growing characteristics
- Melon types (Honeydew, Rock/Cantaloupe, Watermelon, Sweet) - different species
- Bean types (Green Bean vs Long Bean) - different varieties
- Chili types (by heat level)

### Final Plant List (after merging): ~32 plants

#### Category 1: Leafy Greens & Herbs (10 plants)
1. **Basil** (Ocimum basilicum)
2. **Kangkong** / Water Spinach (Ipomoea aquatica)
3. **Lettuce - Boston** (Lactuca sativa var. capitata)
4. **Lettuce - Frisee** (Lactuca sativa var. crispa)
5. **Lettuce - Iceberg** (Lactuca sativa var. capitata)
6. **Lettuce - Lollo** (Lactuca sativa var. crispa) - covers Bionda/Rosso
7. **Lettuce - Oakleaf** (Lactuca sativa var. crispa)
8. **Lettuce - Radicchio** (Cichorium intybus var. foliosum)
9. **Lettuce - Romaine** (Lactuca sativa var. longifolia)
10. **Mulukhiyah** / Jute Mallow (Corchorus olitorius)
11. **Rocket** / Arugula (Eruca vesicaria)
12. **Spinach** - Baby (Spinacia oleracea)
13. **Zaatar** (Origanum syriacum)

#### Category 2: Fruiting Vegetables (9 plants)
14. **Bell Pepper** (Capsicum annuum) - Green/Red/Yellow variations
15. **Chili Pepper - Hot** (Capsicum annuum var. acuminatum)
16. **Chili Pepper - Long Red** (Capsicum annuum)
17. **Cucumber** (Cucumis sativus)
18. **Eggplant** (Solanum melongena)
19. **Okra** (Abelmoschus esculentus)
20. **Tomato - Regular** (Solanum lycopersicum)
21. **Tomato - Cherry** (Solanum lycopersicum var. cerasiforme)
22. **Zucchini** (Cucurbita pepo) - Green/Yellow variations

#### Category 3: Melons & Squash (7 plants)
23. **Apple Melon** (Cucumis melo var. dudaim)
24. **Ash Gourd** / Winter Melon (Benincasa hispida)
25. **Butternut Squash** (Cucurbita moschata)
26. **Honeydew Melon** (Cucumis melo var. inodorus)
27. **Marrow** (Cucurbita pepo)
28. **Rock Melon** / Cantaloupe (Cucumis melo var. cantalupensis)
29. **Sweet Melon** (Cucumis melo)
30. **Watermelon** (Citrullus lanatus)

#### Category 4: Other Vegetables (6 plants)
31. **Bean - Green** (Phaseolus vulgaris)
32. **Bean - Long** / Yard Long Bean (Vigna unguiculata subsp. sesquipedalis)
33. **Cabbage** - Round (Brassica oleracea var. capitata)
34. **Cauliflower** (Brassica oleracea var. botrytis)
35. **Celery** (Apium graveolens)
36. **Corn** - Sweet (Zea mays var. saccharata)
37. **Drumstick** / Moringa (Moringa oleifera)
38. **Fennel** (Foeniculum vulgare)
39. **Onion - Red** (Allium cepa)

**Total: 39 unique plants**

### Data Sources for Research

1. **USDA PLANTS Database** (https://plants.usda.gov/)
   - Botanical nomenclature
   - Scientific classification
   - Growth characteristics

2. **FAO Resources**
   - FAOSTAT database
   - Crop water requirements
   - Production data

3. **UAE MOCCAE**
   - UAE-specific growing calendars
   - Regional adaptations

4. **Extension Services**
   - NC State, Penn State, UC Davis, University of Florida
   - Growing guides
   - Pest management (IPM)
   - Fertilizer schedules

### Data Structure to Collect

For each plant, research and document:

#### Basic Information
- `plantName` - Common name
- `scientificName` - Full scientific name with author
- `farmTypeCompatibility` - [open_field, greenhouse, hydroponic]

#### Growth Cycle
- `germinationDays`
- `vegetativeDays`
- `floweringDays`
- `fruitingDays`
- `harvestDurationDays`
- `totalCycleDays`

#### Yield Information
- `yieldPerPlant` (kg)
- `yieldUnit`
- `expectedWastePercentage`

#### Fertilizer Schedule (by stage)
- Stage, Type, Quantity, Frequency, NPK ratio, Notes

#### Pesticide Schedule (IPM)
- Stage, Type, Target pest, Quantity, Frequency, Safety notes, PHI

#### Environmental Requirements
- Temperature (min/max/optimal)
- Humidity (min/max/optimal)
- Light (hoursPerDay, minLux, maxLux, PPFD)
- CO2, Air circulation

#### Watering Requirements
- Frequency, amount per plant, water quality, drought tolerance

#### Soil Requirements
- pH range, soil types, organic matter, EC/TDS for hydroponics

#### Common Diseases & Pests
- Disease/pest name, symptoms, prevention, treatment, severity

#### Spacing & Support
- Plant spacing, row spacing, plants per sq meter, support requirements

#### Companion Planting
- Beneficial companions
- Incompatible plants

#### Quality Grading
- Grade standards (A, B, C)
- Size/weight/color requirements
- Price multipliers

#### Economics
- Market price per kg
- Labor hours per plant lifecycle

### Workflow

1. **Research Phase** (per plant)
   - Search USDA PLANTS for botanical info
   - Search FAO for crop data
   - Search extension services for growing guides
   - Compile data following the enhanced schema

2. **Documentation Phase**
   - Create structured JSON entry
   - Verify all required fields
   - Add UAE-specific adaptations

3. **Quality Check**
   - Cross-reference multiple sources
   - Ensure data completeness
   - Validate scientific names

### Output Files

1. `OldData/plants-from-old-db-enhanced.json` - Complete enhanced dataset
2. `OldData/plant-research-sources.md` - Source citations for each plant
3. `OldData/migration-mapping.md` - How old DB plant names map to new enhanced data

### Next Steps

1. Start with Category 1 (Leafy Greens) - most common in UAE agriculture
2. Use existing Lettuce data as template
3. Research 2-3 plants at a time for efficiency
4. Build comprehensive dataset progressively
