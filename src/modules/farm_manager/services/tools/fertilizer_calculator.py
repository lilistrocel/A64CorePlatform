"""
Fertilizer Calculator

Pure calculation engine for the Fertilizer Cost Calculator tool.

Given a list of (plantDataId, points) entries and an organisation, this service:
1. Loads plant_data_enhanced documents.
2. Walks each plant's fertigationSchedule to sum per-point ingredient quantities
   over the full growth cycle.
3. Auto-discovers any unknown ingredient names into the chemical catalog
   (archive-aware: archived chemical names are NOT auto-recreated).
4. Maps ingredient names to FertilizerChemical entries.
5. Resolves prices via PriceBook.
6. Returns a CalculateResponse with per-crop breakdown + grand total.

Archive-aware behaviour:
- If an ingredient name matches an ARCHIVED chemical, the qty is still reported
  but unitPrice and totalCost are returned as None, and a warning is added.
  The archived chemical is NOT auto-created.
"""

import math
from typing import Dict, List, Optional, Set, Tuple
from uuid import UUID
import logging

from ...services.database import farm_db
from ...models.plant_data_enhanced import (
    FertigationRuleTypeEnum,
)
from ...models.tools.calculator_request import (
    CalculateItem,
    CalculateResponse,
    CropResult,
    IngredientResult,
)
from ...models.tools.fertilizer_chemical import FertilizerChemical
from .chemicals_repository import ChemicalsRepository
from .chemicals_service import ArchivedChemicalMatch, ChemicalsService
from .price_book import PriceBook

logger = logging.getLogger(__name__)

# Supported unit-to-defaultUnit conversions (do NOT cross solid ↔ liquid)
_UNIT_CONVERSIONS: Dict[str, Tuple[str, float]] = {
    "g":  ("kg", 1 / 1000),
    "kg": ("kg", 1.0),
    "ml": ("L",  1 / 1000),
    "L":  ("L",  1.0),
}


async def calculate_for_crops(
    items: List[CalculateItem],
    organization_id: UUID,
) -> CalculateResponse:
    """
    Main entry point for the calculator.

    Args:
        items: List of crop + points entries to calculate.
        organization_id: Organisation scope for chemical lookup and pricing.

    Returns:
        CalculateResponse with per-crop breakdown and grand total.
    """
    db = farm_db.get_database()
    warnings: List[str] = []

    # ------------------------------------------------------------------
    # Load all required plant docs in one batch
    # ------------------------------------------------------------------
    plant_ids = [str(item.plantDataId) for item in items]
    cursor = db.plant_data_enhanced.find(
        {"plantDataId": {"$in": plant_ids}, "deletedAt": None}
    )
    plant_docs = await cursor.to_list(length=None)
    plant_by_id: Dict[str, dict] = {d["plantDataId"]: d for d in plant_docs}

    # ------------------------------------------------------------------
    # Phase 1: Calculate per-point quantities for each item
    # ------------------------------------------------------------------
    # ingredient_name_lower → {chemicalId or None, qty_in_schedule_unit, unit, display_name}
    # We collect all unique ingredient names across all items for bulk discovery.
    all_ingredient_names: Dict[str, Tuple[str, str]] = {}  # lower → (original, unit)
    per_crop_raw: List[dict] = []  # intermediate before pricing

    for item in items:
        pid = str(item.plantDataId)
        plant = plant_by_id.get(pid)

        if plant is None:
            warnings.append(f"Plant data not found for plantDataId={pid} — skipped")
            continue

        plant_name = plant.get("plantName", pid)
        growth_cycle = plant.get("growthCycle") or {}
        cycle_days = growth_cycle.get("totalCycleDays") or plant.get("growthCycleDays") or 0

        if not cycle_days:
            warnings.append(
                f"growthCycleDays is 0 or None for '{plant_name}' — skipped"
            )
            continue

        fertigation = plant.get("fertigationSchedule")
        if not fertigation or not fertigation.get("cards"):
            warnings.append(f"No fertigation schedule defined for '{plant_name}'")
            # Still return the crop entry with empty ingredients
            per_crop_raw.append({
                "plantDataId": item.plantDataId,
                "plantName": plant_name,
                "points": item.points,
                "cycleDays": cycle_days,
                "ingredients_raw": {},  # name_lower → {name, unit, qty_per_point}
            })
            continue

        # Accumulate per-point quantities: name_lower → (display_name, unit, qty_per_point)
        accum: Dict[str, List] = {}  # name_lower → [display_name, unit, qty_per_point]

        for card in fertigation.get("cards", []):
            card_day_start = card.get("dayStart", 0)
            card_day_end = card.get("dayEnd", 0)

            # Reason: skip cards that start after the cycle ends
            if card_day_start > cycle_days:
                continue

            # Clamp card end to cycle_days
            effective_card_end = min(card_day_end, cycle_days)

            for rule in card.get("rules", []):
                rule_type = rule.get("type", "")

                if rule_type == FertigationRuleTypeEnum.INTERVAL.value:
                    _process_interval_rule(
                        rule, effective_card_end, cycle_days, accum, warnings
                    )
                elif rule_type == FertigationRuleTypeEnum.CUSTOM.value:
                    _process_custom_rule(rule, cycle_days, accum)

        # Collect ingredient names for discovery
        for name_lower, entry in accum.items():
            if name_lower not in all_ingredient_names:
                all_ingredient_names[name_lower] = (entry[0], entry[1])

        per_crop_raw.append({
            "plantDataId": item.plantDataId,
            "plantName": plant_name,
            "points": item.points,
            "cycleDays": cycle_days,
            "ingredients_raw": accum,  # name_lower → [display_name, unit, qty_per_point]
        })

    # ------------------------------------------------------------------
    # Phase 2: Archive-aware chemical resolution
    # ------------------------------------------------------------------
    # Build two lookups:
    #   active_by_name  → name_lower: FertilizerChemical   (use for pricing)
    #   archived_by_name → name_lower: ArchivedChemicalMatch  (emit warning, cost=None)
    active_by_name, archived_by_name = await ChemicalsService.build_chemical_lookup(
        organization_id
    )

    # Determine which ingredient names are truly unknown (not in either lookup)
    # Reason: only auto-discover genuinely new names; archived matches must NOT be re-created.
    truly_unknown = {
        k for k in all_ingredient_names
        if k not in active_by_name and k not in archived_by_name
    }

    newly_discovered: List[FertilizerChemical] = []
    if truly_unknown:
        # Reason: trigger full discovery scan; it is archive-aware and will skip archived names
        newly_discovered = await ChemicalsService.discover_from_plant_library(
            organization_id=organization_id,
            created_by=UUID("00000000-0000-0000-0000-000000000001"),  # system user sentinel
        )
        # Reload active lookup after discovery to include any freshly inserted chemicals
        active_by_name, archived_by_name = await ChemicalsService.build_chemical_lookup(
            organization_id
        )

    # Alias conflict warnings for active chemicals
    for c in sorted(
        [c for c in await ChemicalsRepository.list_all(organization_id, include_archived=False)],
        key=lambda x: str(x.chemicalId),
    ):
        for a in c.aliases:
            a_key = a.strip().lower()
            existing = active_by_name.get(a_key)
            if existing and existing.chemicalId != c.chemicalId:
                warnings.append(
                    f"Ingredient name '{a}' matches multiple chemicals "
                    f"(using first match by ID order)"
                )

    # Keep backward-compat alias: chemical_by_name used in Phase 3
    chemical_by_name: Dict[str, FertilizerChemical] = active_by_name

    # ------------------------------------------------------------------
    # Phase 3: Build per-crop results and collect chemicals to price
    # ------------------------------------------------------------------
    chemicals_to_price: Dict[str, FertilizerChemical] = {}
    per_crop_results: List[CropResult] = []

    for crop_data in per_crop_raw:
        ingredients_raw = crop_data["ingredients_raw"]
        points = crop_data["points"]
        ingredients: List[IngredientResult] = []

        # Aggregate by chemicalId (multiple schedule names may map to same chemical)
        # chem_key → {chemical, qty, unit}
        chem_accum: Dict[str, dict] = {}

        # Track which archived matches we've warned about in this crop to avoid duplicate warnings
        archived_warned: Set[str] = set()

        for name_lower, (display_name, sched_unit, qty_per_point) in ingredients_raw.items():
            chemical = chemical_by_name.get(name_lower)
            total_qty_in_sched_unit = qty_per_point * points

            if chemical is None:
                # Check if the name matches an archived chemical
                archived_match = archived_by_name.get(name_lower)
                if archived_match is not None:
                    # Reason: archived match — report qty but leave costs as None so the
                    # user knows the chemical exists but is archived.
                    warn_key = f"{archived_match.canonical_name}|{crop_data['plantName']}"
                    if warn_key not in archived_warned:
                        warnings.append(
                            f"Ingredient '{display_name}' in '{crop_data['plantName']}' "
                            f"references archived chemical '{archived_match.canonical_name}' "
                            f"— restore the chemical or update the plant's fertigation schedule."
                        )
                        archived_warned.add(warn_key)
                    ingredients.append(IngredientResult(
                        chemicalId=None,
                        name=display_name,
                        qty=round(total_qty_in_sched_unit, 6),
                        unit=sched_unit,
                        unitPrice=None,
                        totalCost=None,
                    ))
                else:
                    # Truly unknown chemical — no match at all
                    ingredients.append(IngredientResult(
                        chemicalId=None,
                        name=display_name,
                        qty=round(total_qty_in_sched_unit, 6),
                        unit=sched_unit,
                        unitPrice=None,
                        totalCost=None,
                    ))
                continue

            # Convert to chemical.defaultUnit
            converted_qty, converted_unit, conversion_ok = _convert_to_default_unit(
                total_qty_in_sched_unit, sched_unit, chemical.defaultUnit
            )
            if not conversion_ok:
                warnings.append(
                    f"Unit mismatch: schedule uses '{sched_unit}' for '{display_name}' "
                    f"but chemical '{chemical.name}' is priced in '{chemical.defaultUnit}' "
                    f"— quantities reported in schedule unit, cost not calculated"
                )
                ingredients.append(IngredientResult(
                    chemicalId=chemical.chemicalId,
                    name=display_name,
                    qty=round(total_qty_in_sched_unit, 6),
                    unit=sched_unit,
                    unitPrice=None,
                    totalCost=None,
                ))
                continue

            chem_key = str(chemical.chemicalId)
            if chem_key not in chem_accum:
                chem_accum[chem_key] = {
                    "chemical": chemical,
                    "qty": 0.0,
                    "unit": converted_unit,
                    "names": [],
                }
            chem_accum[chem_key]["qty"] += converted_qty
            chem_accum[chem_key]["names"].append(display_name)

            chemicals_to_price[chem_key] = chemical

        # Build ingredient results from aggregated chem_accum
        for chem_key, agg in chem_accum.items():
            chem = agg["chemical"]
            name_str = " / ".join(dict.fromkeys(agg["names"]))  # deduplicate order-preserving
            ingredients.append(IngredientResult(
                chemicalId=chem.chemicalId,
                name=name_str,
                qty=round(agg["qty"], 6),
                unit=agg["unit"],
                unitPrice=None,   # filled in Phase 4
                totalCost=None,   # filled in Phase 4
            ))

        per_crop_results.append(CropResult(
            plantDataId=crop_data["plantDataId"],
            plantName=crop_data["plantName"],
            points=points,
            cycleDays=crop_data["cycleDays"],
            ingredients=ingredients,
        ))

    # ------------------------------------------------------------------
    # Phase 4: Resolve prices and compute costs
    # ------------------------------------------------------------------
    if chemicals_to_price:
        prices = await PriceBook.resolve_prices(
            list(chemicals_to_price.values()),
            organization_id,
        )
    else:
        prices = {}

    grand_total: Optional[float] = 0.0
    any_missing_price = False

    for crop_result in per_crop_results:
        subtotal: Optional[float] = 0.0
        crop_missing = False

        for ing in crop_result.ingredients:
            if ing.chemicalId is None:
                # Reason: unmatched ingredient — cannot price
                any_missing_price = True
                crop_missing = True
                continue

            chem_key = str(ing.chemicalId)
            resolved = prices.get(chem_key)
            if resolved and resolved.price is not None:
                ing.unitPrice = resolved.price
                ing.totalCost = round(resolved.price * ing.qty, 4)
                if subtotal is not None:
                    subtotal += ing.totalCost
            else:
                any_missing_price = True
                crop_missing = True

        if crop_missing:
            crop_result.subtotalCost = None
            grand_total = None
        else:
            crop_result.subtotalCost = round(subtotal, 4) if subtotal is not None else None
            if grand_total is not None and crop_result.subtotalCost is not None:
                grand_total += crop_result.subtotalCost

    if any_missing_price:
        grand_total = None
        warnings.append(
            "One or more chemicals have no price set — "
            "total costs are incomplete. Update prices via the Price Book."
        )

    return CalculateResponse(
        perCrop=per_crop_results,
        grandTotalCost=round(grand_total, 4) if grand_total is not None else None,
        warnings=warnings,
        discoveredChemicals=[c.model_dump(mode="json") for c in newly_discovered],
    )


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _process_interval_rule(
    rule: dict,
    effective_card_end: int,
    cycle_days: int,
    accum: Dict[str, List],
    warnings: List[str],
) -> None:
    """
    Process an INTERVAL-type fertigation rule and accumulate per-point quantities.

    Formula:
        applications = floor((min(activeDayEnd, cycle_days) - activeDayStart) / frequencyDays) + 1
        clamped to ≥ 0.

    Args:
        rule: Raw rule dict from MongoDB.
        effective_card_end: Card dayEnd clamped to cycle_days.
        cycle_days: Full growth cycle in days.
        accum: Per-ingredient accumulator.
        warnings: Warning list to append to.
    """
    freq = rule.get("frequencyDays")
    active_start = rule.get("activeDayStart", 0) or 0
    active_end = rule.get("activeDayEnd", effective_card_end)
    if active_end is None:
        active_end = effective_card_end

    # Reason: skip rule if it starts after the cycle ends
    if active_start > cycle_days:
        return

    if not freq:
        rule_name = rule.get("name", "<unnamed>")
        warnings.append(
            f"Interval rule '{rule_name}' has frequencyDays=0 or None — skipped"
        )
        return

    # Clamp activeDayEnd to cycle_days
    clamped_end = min(active_end, cycle_days)
    span = clamped_end - active_start
    applications = max(0, math.floor(span / freq) + 1)

    if applications <= 0:
        return

    for ing in (rule.get("ingredients") or []):
        _accumulate_ingredient(ing, applications, accum)


def _process_custom_rule(
    rule: dict,
    cycle_days: int,
    accum: Dict[str, List],
) -> None:
    """
    Process a CUSTOM-type fertigation rule and accumulate per-point quantities.

    Only applications where day <= cycle_days are counted.

    Args:
        rule: Raw rule dict from MongoDB.
        cycle_days: Full growth cycle in days.
        accum: Per-ingredient accumulator.
    """
    for app in (rule.get("applications") or []):
        app_day = app.get("day", 0) or 0
        if app_day > cycle_days:
            continue
        for ing in (app.get("ingredients") or []):
            _accumulate_ingredient(ing, 1, accum)


def _accumulate_ingredient(
    ing: dict,
    applications: int,
    accum: Dict[str, List],
) -> None:
    """
    Add ingredient contribution to the accumulator.

    Args:
        ing: Raw ingredient dict.
        applications: Number of times this ingredient is applied.
        accum: Dict keyed by ingredient name lower-case; each value is
               [display_name, unit, qty_per_point].
    """
    name = (ing.get("name") or "").strip()
    if not name:
        return
    key = name.lower()
    dosage = float(ing.get("dosagePerPoint") or 0)
    unit = (ing.get("unit") or "g").strip()
    contribution = dosage * applications

    if key not in accum:
        accum[key] = [name, unit, 0.0]
    accum[key][2] += contribution


def _convert_to_default_unit(
    qty: float,
    from_unit: str,
    default_unit: str,
) -> Tuple[float, str, bool]:
    """
    Convert a quantity from a schedule unit to a chemical's default unit.

    Only these conversions are valid:
    - g   → kg  (÷ 1000)
    - kg  → kg  (× 1)
    - ml  → L   (÷ 1000)
    - L   → L   (× 1)

    Crossing solid ↔ liquid is NOT allowed.

    Args:
        qty: Quantity in from_unit.
        from_unit: Source unit (g, kg, ml, L).
        default_unit: Target unit (kg or L).

    Returns:
        (converted_qty, target_unit, conversion_ok)
    """
    conv = _UNIT_CONVERSIONS.get(from_unit)
    if conv is None:
        return qty, from_unit, False

    target, factor = conv
    if target != default_unit:
        # Reason: cross-type conversion (e.g., g → L) is not supported
        return qty, from_unit, False

    return qty * factor, target, True
