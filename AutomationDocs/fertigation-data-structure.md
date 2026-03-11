# Fertigation Data Structure - Automation Integration Guide

## Overview

This document describes the standardized fertigation data structure used by the A64 Core Platform. It is designed for automation systems (fertigation controllers, IoT schedulers, PLC integrators) to programmatically determine daily fertigation recipes for any block on any farm.

**Collection**: `plant_data_enhanced`
**Field**: `fertigationSchedule`
**Dosage unit**: Per **planting point** (drip irrigation point)

---

## Core Concepts

### Planting Point

A **planting point** is a physical location on the irrigation line (drip emitter) where one or more seeds/plants are placed. This is the unit of measurement for fertigation dosages because the irrigation infrastructure operates at the drip level.

Each plant data record has `yieldInfo.seedsPerPlantingPoint` which tells you how many seeds/plants exist at each point.

### Fertigation Card

A **card** represents a fertigation program for a specific growth stage. A plant can have multiple cards (one per stage). When a block transitions between growth stages, the automation system loads the corresponding card.

### Application Rule

A **rule** within a card defines when and what to apply. There are two types:

| Type | Use Case | How it works |
|------|----------|--------------|
| `interval` | Regular pattern | Apply ingredients every N days within a day range |
| `custom` | Irregular/variable | Apply specific ingredients on explicit days |

---

## Data Schema

### FertigationSchedule (top-level)

```json
{
  "fertigationSchedule": {
    "cards": [FertigationCard],
    "totalFertilizationDays": 70,
    "source": "legacy_migration"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `cards` | Array | List of fertigation cards, one per growth stage |
| `totalFertilizationDays` | Integer | Total days that require fertigation |
| `source` | String | `"legacy_migration"` or `"manual"` |

### FertigationCard

```json
{
  "cardName": "Full Cycle",
  "growthStage": "general",
  "dayStart": 1,
  "dayEnd": 90,
  "rules": [FertigationRule],
  "notes": "Optional notes",
  "isActive": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `cardName` | String | Human-readable label |
| `growthStage` | String | One of: `general`, `germination`, `vegetative`, `flowering`, `fruiting`, `harvest` |
| `dayStart` | Integer | First day this card is active (relative to planting date, day 0 = planting) |
| `dayEnd` | Integer | Last day this card is active |
| `rules` | Array | Application rules (see below) |
| `isActive` | Boolean | Whether this card is enabled |

### FertigationRule (type: "interval")

Used when ingredients follow a regular pattern.

```json
{
  "name": "Weekly Base Feed",
  "type": "interval",
  "frequencyDays": 7,
  "activeDayStart": 15,
  "activeDayEnd": 92,
  "ingredients": [
    {
      "name": "Cal Nitrate",
      "category": "calcium",
      "dosagePerPoint": 1.5,
      "unit": "g"
    },
    {
      "name": "Mg Sulfate",
      "category": "supplement",
      "dosagePerPoint": 1.2,
      "unit": "g"
    }
  ],
  "applications": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Human-readable rule name |
| `type` | String | `"interval"` |
| `frequencyDays` | Integer | Apply every N days |
| `activeDayStart` | Integer | First application day (relative to planting) |
| `activeDayEnd` | Integer | Last application day |
| `ingredients` | Array | Ingredients to mix and apply together |
| `applications` | null | Not used for interval type |

### FertigationRule (type: "custom")

Used when ingredients have irregular schedules or varying dosages.

```json
{
  "name": "Ferro (Custom)",
  "type": "custom",
  "frequencyDays": null,
  "activeDayStart": null,
  "activeDayEnd": null,
  "ingredients": null,
  "applications": [
    {
      "day": 15,
      "ingredients": [
        {"name": "Ferro", "category": "micronutrient", "dosagePerPoint": 0.13, "unit": "g"}
      ]
    },
    {
      "day": 22,
      "ingredients": [
        {"name": "Ferro", "category": "micronutrient", "dosagePerPoint": 0.09, "unit": "g"}
      ]
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | String | `"custom"` |
| `ingredients` | null | Not used for custom type |
| `applications` | Array | Explicit list of day/ingredient pairs |
| `applications[].day` | Integer | Day number (relative to planting) |
| `applications[].ingredients` | Array | What to apply on this specific day |

### FertigationIngredient

```json
{
  "name": "Cal Nitrate",
  "category": "calcium",
  "dosagePerPoint": 1.5,
  "unit": "g"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Ingredient name |
| `category` | String | One of: `macro_npk`, `potassium`, `calcium`, `micronutrient`, `supplement`, `other` |
| `dosagePerPoint` | Float | Amount per planting point per application |
| `unit` | String | Unit: `g`, `ml`, `kg`, `L` |

---

## Ingredient Categories

| Category | Examples | Purpose |
|----------|----------|---------|
| `macro_npk` | Urea, 28.14.14, 20.20.20, 12.61.0, MAP, MKP | Primary NPK nutrients |
| `potassium` | Potassium Sulfate, Potassium Nitrate, 0.0.60 | Potassium supplementation |
| `calcium` | Cal Nitrate, Calmin Bor | Calcium and boron |
| `micronutrient` | Chelated Micro, Ferro, MG+Zn | Trace elements |
| `supplement` | Amino Acids, Humic, Mg Sulfate, Phosphoric Acid | Growth enhancers |
| `other` | Any unlisted ingredient | Custom/new ingredients |

---

## Automation Integration

### Daily Recipe Calculation

The automation system runs this logic daily for each active block:

```python
def get_daily_recipe(block, plant_data):
    """
    Calculate today's fertigation recipe for a block.

    Args:
        block: Block document with plantedDate and currentState
        plant_data: Plant data enhanced document with fertigationSchedule

    Returns:
        List of {name, category, dosagePerPoint, unit} to mix and apply
    """
    if not plant_data.get("fertigationSchedule"):
        return []

    # Calculate current day (days since planting)
    current_day = (today - block["plantedDate"]).days

    # Find active card for current growth stage
    active_card = None
    for card in plant_data["fertigationSchedule"]["cards"]:
        if not card["isActive"]:
            continue
        if card["dayStart"] <= current_day <= card["dayEnd"]:
            active_card = card
            break

    if not active_card:
        return []

    # Evaluate each rule
    recipe = []
    for rule in active_card["rules"]:
        if rule["type"] == "interval":
            recipe += evaluate_interval_rule(rule, current_day)
        elif rule["type"] == "custom":
            recipe += evaluate_custom_rule(rule, current_day)

    return recipe


def evaluate_interval_rule(rule, current_day):
    """Check if today is an application day for an interval rule."""
    if current_day < rule["activeDayStart"]:
        return []
    if current_day > rule["activeDayEnd"]:
        return []

    days_since_start = current_day - rule["activeDayStart"]

    if days_since_start % rule["frequencyDays"] == 0:
        return rule["ingredients"]

    return []


def evaluate_custom_rule(rule, current_day):
    """Check if today has an explicit application in a custom rule."""
    for application in (rule.get("applications") or []):
        if application["day"] == current_day:
            return application["ingredients"]
    return []
```

### Scaling to Block Level

After getting the per-point recipe, scale to the full block:

```python
def calculate_block_fertigation(block, recipe):
    """
    Scale per-point recipe to full block quantities.

    Args:
        block: Block with totalPlantingPoints (number of drips)
        recipe: List of per-point ingredients from get_daily_recipe()

    Returns:
        List of {name, totalAmount, unit} for the full block
    """
    total_points = block["totalPlantingPoints"]  # e.g., 4000 drips

    block_recipe = []
    for ingredient in recipe:
        block_recipe.append({
            "name": ingredient["name"],
            "category": ingredient["category"],
            "totalAmount": round(ingredient["dosagePerPoint"] * total_points, 2),
            "unit": ingredient["unit"],
        })

    return block_recipe
```

### Example Output

For a Cucumber block with 4,000 planting points on Day 15:

```
Daily Fertigation Recipe - Day 15
Block: LW-07 (Cucumber)
Planting Points: 4,000

┌──────────────────────┬──────────┬──────────┬────────────┐
│ Ingredient           │ Category │ Per Pt   │ Total      │
├──────────────────────┼──────────┼──────────┼────────────┤
│ Potassium Sulfate    │ K        │ 0.67 g   │ 2,680 g    │
│ Potassium Nitrate    │ K        │ 2.22 g   │ 8,880 g    │
│ Cal Nitrate          │ Ca       │ 3.78 g   │ 15,120 g   │
│ Mg Sulfate           │ Supp     │ 1.56 g   │ 6,240 g    │
│ MKP                  │ NPK      │ 1.11 g   │ 4,440 g    │
│ Chelated Micro       │ Micro    │ 0.04 g   │ 160 g      │
│ Ferro                │ Micro    │ 0.13 g   │ 520 g      │
│ Phosphoric Acid      │ Supp     │ 0.22 g   │ 880 g      │
│ 20.20.20             │ NPK      │ 1.11 g   │ 4,440 g    │
│ Amino Acids          │ Supp     │ 0.13 g   │ 520 g      │
│ Humic                │ Supp     │ 0.11 g   │ 440 g      │
└──────────────────────┴──────────┴──────────┴────────────┘
```

---

## API Access

### Get Plant Data with Fertigation

```
GET /api/v1/farm/plant-data-enhanced/{plantDataId}
Authorization: Bearer <token>
```

Response includes `fertigationSchedule` with all cards and rules.

### Query Plants with Fertigation Data

```
GET /api/v1/farm/plant-data-enhanced?hasFertigation=true
```

---

## Growth Stages for Multi-Card Systems

For future implementation, plants can have multiple cards:

| Stage | Block State | Typical Card |
|-------|-------------|--------------|
| `germination` | Planted/Seeded | Light nutrients, establishment |
| `vegetative` | Growing | Nitrogen-heavy feed |
| `flowering` | Flowering | Phosphorus boost |
| `fruiting` | Fruiting | Potassium-heavy feed |
| `harvest` | Harvesting | Maintenance feed |
| `general` | Any/All | Full-cycle card (legacy) |

The `general` stage is a catch-all that applies when no stage-specific card exists. Legacy migrated data uses `general` cards.

---

## Notes for Integrators

1. **All dosages are per planting point** - multiply by block's total planting points for actual quantities
2. **Days are relative to planting date** - day 0 is the planting date of the block
3. **Multiple rules can fire on the same day** - collect all matching ingredients and mix together
4. **Custom rules have explicit day/dosage** - no calculation needed, just match the day
5. **Interval rules use modulo** - `(currentDay - activeDayStart) % frequencyDays == 0`
6. **isActive flag** - always check; disabled cards should be skipped
7. **Ingredient names are standardized** - typos from legacy data have been corrected
8. **Categories are for grouping/display** - the automation system should not filter by category
