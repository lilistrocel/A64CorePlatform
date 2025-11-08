# UAE Popular Plants - Starter Data

## Overview

This directory contains curated starter data for the 20 most popular plants grown in the United Arab Emirates, compiled from official sources for use in the A64 Core Platform.

## Data Sources

All information has been verified through official and authoritative sources:

### Primary Sources

1. **UAE Ministry of Climate Change and Environment (MOCCAE)**
   - Official agricultural statistics and crop production data
   - Agriculture calendar for UAE planting seasons
   - National agriculture program data

2. **USDA PLANTS Database**
   - Botanical nomenclature and classification
   - Plant symbols and taxonomic information
   - Growth characteristics

3. **FAO (Food and Agriculture Organization)**
   - FAOSTAT database for UAE agriculture
   - Country profile for United Arab Emirates
   - Global crop production statistics

4. **GBIF (Global Biodiversity Information Facility)**
   - Scientific name verification
   - Taxonomic classification validation

5. **Peer-reviewed Botanical Literature**
   - Scientific classification verification
   - Growth habit and lifecycle information

## Files

### `uae-popular-plants.json` (Basic Dataset)

Basic botanical and growing information for 20 UAE plants:
- Complete botanical classification (family, genus, species, author)
- Common and scientific names
- USDA plant symbols where available
- Growth characteristics (habit, life cycle)
- UAE-specific growing information (seasons, planting/harvest months)
- Water and heat tolerance ratings
- Commercial importance ratings
- Detailed descriptions based on UAE agricultural context

**Use Case:** Plant identification, basic growing information, educational purposes

### `uae-popular-plants-enhanced.json` (Enhanced Dataset) ⭐ NEW

**Comprehensive agronomic data** ready for farm management system integration:
- **Growth Cycle Details:** Germination, vegetative, flowering, fruiting, harvest durations
- **Fertilizer Schedules:** Stage-specific NPK ratios, quantities, frequencies
- **Pest Management:** IPM strategies, biological controls, treatment options
- **Environmental Requirements:** Temperature, humidity, CO2, air circulation
- **Watering Specifications:** Frequency, amounts, water type, drought tolerance
- **Soil Requirements:** pH ranges, soil types, EC/TDS for hydroponics
- **Disease & Pest Database:** Symptoms, prevention, treatment, severity ratings
- **Light Requirements:** Hours, intensity (Lux/PPFD), photoperiod sensitivity
- **Quality Grading:** Grade standards, size/color requirements, price multipliers
- **Economics & Labor:** Market values, labor hours per plant lifecycle
- **Spacing & Support:** Plant/row spacing, plants per sq meter, support needs
- **Companion Planting:** Beneficial and incompatible plants

**Use Case:** Farm management systems, precision agriculture, commercial production planning

**Status:** Currently contains 5 fully documented plants (Tomato, Date Palm, Lettuce, Cucumber, Bell Pepper). Expansion to 20 plants in progress.

**See:** [README-ENHANCED.md](README-ENHANCED.md) for complete documentation

## Data Structure

```json
{
  "metadata": {
    "title": "Dataset title",
    "description": "Dataset description",
    "sources": ["List of official sources"],
    "region": "United Arab Emirates",
    "date_compiled": "YYYY-MM-DD",
    "total_plants": 20
  },
  "plants": [
    {
      "id": "Unique identifier",
      "common_name": "Common English name",
      "scientific_name": "Genus species [variety/subspecies]",
      "family": "Botanical family",
      "genus": "Genus name",
      "species": "Species epithet",
      "variety": "Variety (if applicable)",
      "subspecies": "Subspecies (if applicable)",
      "author": "Taxonomic author",
      "usda_symbol": "USDA plant code",
      "category": "Plant category/type",
      "native_to": "Native region",
      "growth_habit": "Growth form",
      "life_cycle": "Life cycle type",
      "uae_growing_season": "Growing season in UAE",
      "uae_planting_months": "Planting months in UAE",
      "uae_harvest_months": "Harvest months in UAE",
      "description": "Detailed description with UAE context",
      "water_requirement": "Water needs rating",
      "heat_tolerance": "Heat tolerance rating",
      "commercial_importance": "Commercial importance rating"
    }
  ]
}
```

## Plants Included (20 Total)

### Major Fruit Crops
1. **Date Palm** (Phoenix dactylifera) - Most significant crop, 4 million trees, 6% world production
2. **Mango** (Mangifera indica) - Major fruit crop
3. **Sweet Orange** (Citrus sinensis) - Major citrus production
4. **Cantaloupe** (Cucumis melo) - One of top 3 most important crops
5. **Watermelon** (Citrullus lanatus) - Summer fruit crop
6. **Strawberry** (Fragaria × ananassa) - Cool season fruit

### Major Vegetable Crops
7. **Tomato** (Solanum lycopersicum) - One of top 3 most important crops
8. **Cucumber** (Cucumis sativus) - Major vegetable, hydroponics
9. **Cabbage** (Brassica oleracea var. capitata) - Major vegetable
10. **Eggplant** (Solanum melongena) - Major vegetable
11. **Cauliflower** (Brassica oleracea var. botrytis) - Major vegetable
12. **Zucchini** (Cucurbita pepo) - Major vegetable (squash)
13. **Bell Pepper** (Capsicum annuum) - Widely grown, hydroponics

### Leafy Greens & Root Vegetables
14. **Lettuce** (Lactuca sativa) - Fast-growing, hydroponics
15. **Spinach** (Spinacia oleracea) - Cool season leafy green
16. **Kale** (Brassica oleracea var. sabellica) - Cool season leafy green
17. **Swiss Chard** (Beta vulgaris subsp. vulgaris) - Cool season leafy green
18. **Carrot** (Daucus carota) - Root vegetable
19. **Radish** (Raphanus sativus) - Fast-growing root vegetable
20. **Broccoli** (Brassica oleracea var. italica) - Cool season vegetable

## UAE Climate Context

### Growing Seasons
- **Cool Season** (October-March): Leafy greens, brassicas, root vegetables
- **Warm Season** (March-October): Heat-tolerant crops like dates, mangoes
- **Year-Round**: Date palms, citrus (with irrigation)

### Agricultural Practices
- 38,000 farms operating in UAE
- 156,000+ tonnes fresh produce annually
- 20%+ of country's fresh produce demand met locally
- Heavy use of hydroponics (saves up to 70% water)
- Focus on greenhouse technology and desert-adaptive farming

### Major Production Areas
- **Ras al-Khaimah**: Produces most vegetables
- **Throughout Emirates**: Date palm cultivation
- **Greenhouse/Hydroponics**: Increasing adoption for water conservation

## Usage Notes

1. **Planting Months**: Based on UAE agricultural calendar from MOCCAE
2. **Scientific Names**: Follow USDA PLANTS Database nomenclature
3. **Water Requirements**: Based on UAE's arid climate context
4. **Heat Tolerance**: Specific to UAE's desert environment
5. **Commercial Importance**: Based on UAE production volume and market significance

## Data Verification

All botanical names, taxonomic classifications, and agricultural data have been cross-referenced with multiple official sources to ensure accuracy. No data was assumed or fabricated - all information comes from authoritative sources including:

- UAE government agricultural statistics
- USDA botanical databases
- FAO agricultural data
- Peer-reviewed scientific literature
- Global biodiversity databases

## Updates

**Last Updated**: 2025-11-07
**Next Review**: Annually or when significant changes to UAE agriculture occur

## References

1. UAE Ministry of Climate Change and Environment - https://www.moccae.gov.ae/
2. USDA PLANTS Database - https://plants.usda.gov/
3. FAO Statistics (FAOSTAT) - https://www.fao.org/faostat/
4. GBIF - Global Biodiversity Information Facility - https://www.gbif.org/
5. UAE Official Government Portal - https://u.ae/en/information-and-services/environment-and-energy/agriculture

## License & Attribution

This data compilation is intended for use in the A64 Core Platform. Source data comes from public government databases and scientific literature. Please maintain attribution to original sources when using this data.
