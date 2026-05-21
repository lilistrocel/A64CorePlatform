"""
Unit tests for the Fertilizer Cost Calculator engine.

All tests are pure — no IO, no MongoDB, no network calls.
They exercise the private calculation helpers directly:
  1. _process_interval_rule  — applications formula + cycle truncation
  2. _process_custom_rule    — day-based filtering
  3. _accumulate_ingredient  — dosage × applications accumulation
  4. _convert_to_default_unit — g→kg, ml→L, cross-type rejection
  5. ChemicalsService.discover_from_plant_library — archive-aware discovery
  6. calculate_for_crops — archived chemical warning + null costs (async)

Run inside the Docker container:
    docker exec a64core-api-dev python -m pytest tests/unit/test_fertilizer_calculator.py -v

Or from the host with pytest installed:
    python -m pytest tests/unit/test_fertilizer_calculator.py -v
"""

from __future__ import annotations

import asyncio
import math
from datetime import datetime
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.modules.farm_manager.services.tools.fertilizer_calculator import (
    _process_interval_rule,
    _process_custom_rule,
    _accumulate_ingredient,
    _convert_to_default_unit,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_interval_rule(
    freq: int | None,
    active_start: int,
    active_end: int,
    ingredients: list,
    name: str = "Test Rule",
) -> dict:
    """Build a minimal interval-rule dict."""
    return {
        "type": "interval",
        "name": name,
        "frequencyDays": freq,
        "activeDayStart": active_start,
        "activeDayEnd": active_end,
        "ingredients": ingredients,
    }


def _make_ingredient(name: str, dosage: float, unit: str = "g") -> dict:
    return {"name": name, "dosagePerPoint": dosage, "unit": unit}


def _make_custom_app(day: int, ingredients: list) -> dict:
    return {"day": day, "ingredients": ingredients}


# ---------------------------------------------------------------------------
# _convert_to_default_unit
# ---------------------------------------------------------------------------

class TestConvertToDefaultUnit:
    """Unit tests for the unit-conversion helper."""

    def test_g_to_kg(self):
        """1000 g → 1.0 kg."""
        qty, unit, ok = _convert_to_default_unit(1000.0, "g", "kg")
        assert ok
        assert unit == "kg"
        assert math.isclose(qty, 1.0)

    def test_kg_to_kg(self):
        """5 kg → 5 kg (identity)."""
        qty, unit, ok = _convert_to_default_unit(5.0, "kg", "kg")
        assert ok
        assert unit == "kg"
        assert math.isclose(qty, 5.0)

    def test_ml_to_L(self):
        """500 ml → 0.5 L."""
        qty, unit, ok = _convert_to_default_unit(500.0, "ml", "L")
        assert ok
        assert unit == "L"
        assert math.isclose(qty, 0.5)

    def test_L_to_L(self):
        """2.5 L → 2.5 L (identity)."""
        qty, unit, ok = _convert_to_default_unit(2.5, "L", "L")
        assert ok
        assert unit == "L"
        assert math.isclose(qty, 2.5)

    def test_cross_type_g_to_L_rejected(self):
        """g → L is not a valid conversion (solid → liquid)."""
        qty, unit, ok = _convert_to_default_unit(100.0, "g", "L")
        assert not ok

    def test_cross_type_ml_to_kg_rejected(self):
        """ml → kg is not a valid conversion (liquid → solid)."""
        qty, unit, ok = _convert_to_default_unit(500.0, "ml", "kg")
        assert not ok

    def test_unknown_from_unit_rejected(self):
        """Unknown source unit falls back gracefully."""
        qty, unit, ok = _convert_to_default_unit(1.0, "oz", "kg")
        assert not ok

    def test_g_to_kg_small(self):
        """5 g → 0.005 kg."""
        qty, unit, ok = _convert_to_default_unit(5.0, "g", "kg")
        assert ok
        assert math.isclose(qty, 0.005, rel_tol=1e-9)


# ---------------------------------------------------------------------------
# _accumulate_ingredient
# ---------------------------------------------------------------------------

class TestAccumulateIngredient:
    """Unit tests for per-ingredient accumulation."""

    def test_first_accumulation(self):
        """First-time insert creates the accumulator entry."""
        accum: dict = {}
        ing = _make_ingredient("Urea", 10.0, "g")
        _accumulate_ingredient(ing, applications=3, accum=accum)
        assert "urea" in accum
        name, unit, qty = accum["urea"]
        assert name == "Urea"
        assert unit == "g"
        assert math.isclose(qty, 30.0)

    def test_second_accumulation_adds(self):
        """Second accumulation adds to existing qty."""
        accum: dict = {}
        ing = _make_ingredient("Cal Nitrate", 5.0, "g")
        _accumulate_ingredient(ing, applications=2, accum=accum)
        _accumulate_ingredient(ing, applications=3, accum=accum)
        _, _, qty = accum["cal nitrate"]
        assert math.isclose(qty, 25.0)  # (5*2) + (5*3)

    def test_blank_name_skipped(self):
        """Ingredients with blank names are skipped."""
        accum: dict = {}
        ing = {"name": "  ", "dosagePerPoint": 5.0, "unit": "g"}
        _accumulate_ingredient(ing, applications=1, accum=accum)
        assert len(accum) == 0

    def test_zero_dosage_accumulated(self):
        """Zero dosage is accumulated (not skipped)."""
        accum: dict = {}
        ing = _make_ingredient("Phosphoric Acid", 0.0, "ml")
        _accumulate_ingredient(ing, applications=10, accum=accum)
        _, _, qty = accum["phosphoric acid"]
        assert math.isclose(qty, 0.0)


# ---------------------------------------------------------------------------
# _process_interval_rule
# ---------------------------------------------------------------------------

class TestProcessIntervalRule:
    """Unit tests for the interval-rule processor."""

    def test_basic_applications(self):
        """
        activeDayStart=0, activeDayEnd=20, frequencyDays=7, cycle_days=100
        → floor((20 - 0) / 7) + 1 = floor(2.857) + 1 = 3
        """
        accum: dict = {}
        warnings: list = []
        rule = _make_interval_rule(
            freq=7, active_start=0, active_end=20,
            ingredients=[_make_ingredient("Urea", 10.0)],
        )
        _process_interval_rule(rule, effective_card_end=20, cycle_days=100, accum=accum, warnings=warnings)
        assert "urea" in accum
        assert math.isclose(accum["urea"][2], 30.0)  # 10 * 3

    def test_truncation_at_cycle_end(self):
        """
        activeDayEnd > cycle_days: clamp activeDayEnd to cycle_days.
        activeDayStart=0, activeDayEnd=100, frequencyDays=10, cycle_days=65
        → clamped_end = min(100, 65) = 65
        → floor((65 - 0) / 10) + 1 = floor(6.5) + 1 = 7
        """
        accum: dict = {}
        warnings: list = []
        rule = _make_interval_rule(
            freq=10, active_start=0, active_end=100,
            ingredients=[_make_ingredient("NPK", 5.0)],
        )
        _process_interval_rule(rule, effective_card_end=65, cycle_days=65, accum=accum, warnings=warnings)
        assert "npk" in accum
        assert math.isclose(accum["npk"][2], 35.0)  # 5 * 7

    def test_active_start_beyond_cycle_skips(self):
        """Rule activeDayStart > cycle_days → skip entirely."""
        accum: dict = {}
        warnings: list = []
        rule = _make_interval_rule(
            freq=7, active_start=200, active_end=300,
            ingredients=[_make_ingredient("Urea", 10.0)],
        )
        _process_interval_rule(rule, effective_card_end=65, cycle_days=65, accum=accum, warnings=warnings)
        assert len(accum) == 0

    def test_zero_frequency_appends_warning(self):
        """frequencyDays=0 appends a warning and skips the rule."""
        accum: dict = {}
        warnings: list = []
        rule = _make_interval_rule(
            freq=0, active_start=0, active_end=30,
            ingredients=[_make_ingredient("Urea", 10.0)],
            name="Bad Rule",
        )
        _process_interval_rule(rule, effective_card_end=30, cycle_days=100, accum=accum, warnings=warnings)
        assert len(accum) == 0
        assert any("Bad Rule" in w for w in warnings)

    def test_none_frequency_appends_warning(self):
        """frequencyDays=None appends a warning and skips the rule."""
        accum: dict = {}
        warnings: list = []
        rule = _make_interval_rule(
            freq=None, active_start=0, active_end=30,
            ingredients=[_make_ingredient("Urea", 10.0)],
            name="No Freq Rule",
        )
        _process_interval_rule(rule, effective_card_end=30, cycle_days=100, accum=accum, warnings=warnings)
        assert len(accum) == 0
        assert len(warnings) == 1

    def test_single_day_application(self):
        """
        activeDayStart=activeDayEnd=0, frequencyDays=1
        → floor((0 - 0) / 1) + 1 = 1 application
        """
        accum: dict = {}
        warnings: list = []
        rule = _make_interval_rule(
            freq=1, active_start=0, active_end=0,
            ingredients=[_make_ingredient("Urea", 8.0)],
        )
        _process_interval_rule(rule, effective_card_end=0, cycle_days=100, accum=accum, warnings=warnings)
        assert math.isclose(accum["urea"][2], 8.0)

    def test_applications_never_negative(self):
        """
        If activeDayStart > effective_card_end, applications should be 0
        (clamped by max(0, ...)).
        activeDayStart=50, activeDayEnd=10 (nonsense data)
        → span = 10 - 50 = -40 → floor(-40/7) + 1 = -4 → max(0, -4) = 0
        """
        accum: dict = {}
        warnings: list = []
        rule = _make_interval_rule(
            freq=7, active_start=50, active_end=10,
            ingredients=[_make_ingredient("Urea", 10.0)],
        )
        _process_interval_rule(rule, effective_card_end=10, cycle_days=100, accum=accum, warnings=warnings)
        assert len(accum) == 0

    def test_multiple_ingredients_in_rule(self):
        """All ingredients in a rule receive the same application count."""
        accum: dict = {}
        warnings: list = []
        rule = _make_interval_rule(
            freq=14, active_start=0, active_end=28,
            ingredients=[
                _make_ingredient("Urea", 10.0),
                _make_ingredient("Cal Nitrate", 5.0),
            ],
        )
        # floor((28 - 0) / 14) + 1 = 2 + 1 = 3 applications
        _process_interval_rule(rule, effective_card_end=28, cycle_days=100, accum=accum, warnings=warnings)
        assert math.isclose(accum["urea"][2], 30.0)
        assert math.isclose(accum["cal nitrate"][2], 15.0)


# ---------------------------------------------------------------------------
# _process_custom_rule
# ---------------------------------------------------------------------------

class TestProcessCustomRule:
    """Unit tests for the custom-rule processor."""

    def test_all_apps_within_cycle(self):
        """All applications within cycle_days are counted."""
        accum: dict = {}
        rule = {
            "type": "custom",
            "applications": [
                _make_custom_app(0, [_make_ingredient("Urea", 10.0)]),
                _make_custom_app(10, [_make_ingredient("Urea", 10.0)]),
                _make_custom_app(20, [_make_ingredient("Urea", 10.0)]),
            ],
        }
        _process_custom_rule(rule, cycle_days=30, accum=accum)
        assert math.isclose(accum["urea"][2], 30.0)

    def test_apps_beyond_cycle_excluded(self):
        """Applications on days > cycle_days are excluded."""
        accum: dict = {}
        rule = {
            "type": "custom",
            "applications": [
                _make_custom_app(5, [_make_ingredient("Urea", 10.0)]),
                _make_custom_app(50, [_make_ingredient("Urea", 10.0)]),   # beyond cycle
                _make_custom_app(100, [_make_ingredient("Urea", 10.0)]),  # beyond cycle
            ],
        }
        _process_custom_rule(rule, cycle_days=30, accum=accum)
        assert math.isclose(accum["urea"][2], 10.0)  # only day 5

    def test_empty_applications_no_accum(self):
        """Rule with no applications produces no accumulation."""
        accum: dict = {}
        rule = {"type": "custom", "applications": []}
        _process_custom_rule(rule, cycle_days=100, accum=accum)
        assert len(accum) == 0

    def test_app_exactly_on_cycle_boundary_included(self):
        """Application on exactly cycle_days day is included."""
        accum: dict = {}
        rule = {
            "type": "custom",
            "applications": [
                _make_custom_app(30, [_make_ingredient("Cal Nitrate", 7.0)]),
            ],
        }
        _process_custom_rule(rule, cycle_days=30, accum=accum)
        assert math.isclose(accum["cal nitrate"][2], 7.0)

    def test_multiple_ingredients_per_app(self):
        """Multiple ingredients in a single application are all accumulated."""
        accum: dict = {}
        rule = {
            "type": "custom",
            "applications": [
                _make_custom_app(5, [
                    _make_ingredient("Urea", 10.0),
                    _make_ingredient("MKP", 3.0, "ml"),
                ]),
            ],
        }
        _process_custom_rule(rule, cycle_days=30, accum=accum)
        assert math.isclose(accum["urea"][2], 10.0)
        assert math.isclose(accum["mkp"][2], 3.0)


# ---------------------------------------------------------------------------
# Archive-aware discover_from_plant_library
# ---------------------------------------------------------------------------

def _make_chem_doc(name: str, archived: bool = False, aliases: list = None) -> Dict[str, Any]:
    """Build a minimal fertilizer_chemicals document."""
    return {
        "chemicalId": str(uuid4()),
        "name": name,
        "aliases": aliases or [],
        "category": "macro_npk",
        "defaultUnit": "kg",
        "notes": None,
        "archivedAt": datetime.utcnow() if archived else None,
        "organizationId": str(uuid4()),
        "createdBy": str(uuid4()),
        "createdAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
    }


def _make_plant_doc(ingredient_name: str = "Urea") -> dict:
    """Build a minimal plant_data_enhanced document with one fertigation ingredient."""
    return {
        "_id": "x",
        "plantName": "Tomato",
        "fertigationSchedule": {
            "cards": [{
                "dayStart": 0,
                "dayEnd": 60,
                "rules": [{
                    "type": "interval",
                    "name": "Base",
                    "frequencyDays": 7,
                    "activeDayStart": 0,
                    "activeDayEnd": 60,
                    "ingredients": [
                        {"name": ingredient_name, "dosagePerPoint": 5.0, "unit": "g",
                         "category": "macro_npk"},
                    ],
                }],
            }],
        },
    }


def _mock_collection_for_discover(
    existing_chem_docs: list,
    plant_docs: list,
) -> tuple:
    """
    Return (chem_col, plant_col, db) mocks suitable for the discover service.

    existing_chem_docs: list of raw chemical dicts to return from the chemicals cursor.
    plant_docs: list of plant dicts to return from the plant_data_enhanced cursor.
    """
    # Chemicals collection: find → cursor → to_list returns existing docs
    chem_cursor = MagicMock()
    chem_cursor.sort = MagicMock(return_value=chem_cursor)
    chem_cursor.to_list = AsyncMock(return_value=existing_chem_docs)
    chem_col = MagicMock()
    chem_col.find = MagicMock(return_value=chem_cursor)
    chem_col.find_one = AsyncMock(return_value=None)  # no uniqueness conflict
    chem_col.insert_one = AsyncMock(return_value=MagicMock(inserted_id="abc"))

    # Plant collection
    plant_cursor = MagicMock()
    plant_cursor.to_list = AsyncMock(return_value=plant_docs)
    plant_col = MagicMock()
    plant_col.find = MagicMock(return_value=plant_cursor)

    db = MagicMock()
    db.plant_data_enhanced = plant_col
    db.fertilizer_chemicals = chem_col
    _col_map = {
        "fertilizer_chemicals": chem_col,
        "plant_data_enhanced": plant_col,
    }
    db.__getitem__ = MagicMock(side_effect=lambda n: _col_map.get(n, MagicMock()))

    return chem_col, plant_col, db


class TestDiscoverArchiveAware:
    """
    Tests for ChemicalsService.discover_from_plant_library archive-aware behaviour.

    These tests confirm:
    1. An ingredient matching an archived chemical is NOT auto-created.
    2. An ingredient matching an active chemical is skipped (already catalogued).
    3. An ingredient with an alias matching an archived chemical is NOT auto-created.
    4. A truly unknown ingredient IS auto-created (regression check).
    """

    def test_archived_name_not_auto_resurrected(self):
        """
        Discover skips a name that matches an archived chemical.

        Setup: one archived 'Urea' in the catalog, plant references 'Urea'.
        Expected: no new chemical inserted (insert_one never called).
        """
        from src.modules.farm_manager.services.tools.chemicals_service import ChemicalsService

        archived_urea = _make_chem_doc("Urea", archived=True)
        chem_col, plant_col, db = _mock_collection_for_discover(
            existing_chem_docs=[archived_urea],
            plant_docs=[_make_plant_doc("Urea")],
        )

        org_id = uuid4()
        user_id = uuid4()

        async def _run():
            with patch(
                "src.modules.farm_manager.services.tools.chemicals_repository.farm_db.get_database",
                return_value=db,
            ), patch(
                "src.modules.farm_manager.services.tools.chemicals_service.farm_db.get_database",
                return_value=db,
            ):
                result = await ChemicalsService.discover_from_plant_library(org_id, user_id)
            return result

        result = asyncio.get_event_loop().run_until_complete(_run())

        # No new chemical should be created
        assert result == []
        chem_col.insert_one.assert_not_called()

    def test_active_name_skipped(self):
        """
        Discover skips a name that matches an active chemical.
        """
        from src.modules.farm_manager.services.tools.chemicals_service import ChemicalsService

        active_urea = _make_chem_doc("Urea", archived=False)
        chem_col, plant_col, db = _mock_collection_for_discover(
            existing_chem_docs=[active_urea],
            plant_docs=[_make_plant_doc("Urea")],
        )

        org_id = uuid4()
        user_id = uuid4()

        async def _run():
            with patch(
                "src.modules.farm_manager.services.tools.chemicals_repository.farm_db.get_database",
                return_value=db,
            ), patch(
                "src.modules.farm_manager.services.tools.chemicals_service.farm_db.get_database",
                return_value=db,
            ):
                return await ChemicalsService.discover_from_plant_library(org_id, user_id)

        result = asyncio.get_event_loop().run_until_complete(_run())

        assert result == []
        chem_col.insert_one.assert_not_called()

    def test_archived_alias_not_auto_resurrected(self):
        """
        Discover skips a plant ingredient whose name matches an archived chemical's alias.
        """
        from src.modules.farm_manager.services.tools.chemicals_service import ChemicalsService

        # Archived chemical with alias 'Cal Nitrate'
        archived = _make_chem_doc("Calcium Nitrate", archived=True, aliases=["Cal Nitrate"])
        chem_col, plant_col, db = _mock_collection_for_discover(
            existing_chem_docs=[archived],
            plant_docs=[_make_plant_doc("Cal Nitrate")],
        )

        org_id = uuid4()
        user_id = uuid4()

        async def _run():
            with patch(
                "src.modules.farm_manager.services.tools.chemicals_repository.farm_db.get_database",
                return_value=db,
            ), patch(
                "src.modules.farm_manager.services.tools.chemicals_service.farm_db.get_database",
                return_value=db,
            ):
                return await ChemicalsService.discover_from_plant_library(org_id, user_id)

        result = asyncio.get_event_loop().run_until_complete(_run())

        assert result == []
        chem_col.insert_one.assert_not_called()

    def test_unknown_name_auto_created(self):
        """
        Regression: a truly unknown ingredient name is auto-created as a new active chemical.
        """
        from src.modules.farm_manager.services.tools.chemicals_service import ChemicalsService

        # Catalog is empty — no existing chemicals
        chem_col, plant_col, db = _mock_collection_for_discover(
            existing_chem_docs=[],
            plant_docs=[_make_plant_doc("BrandNewChem")],
        )

        org_id = uuid4()
        user_id = uuid4()

        async def _run():
            with patch(
                "src.modules.farm_manager.services.tools.chemicals_repository.farm_db.get_database",
                return_value=db,
            ), patch(
                "src.modules.farm_manager.services.tools.chemicals_service.farm_db.get_database",
                return_value=db,
            ):
                return await ChemicalsService.discover_from_plant_library(org_id, user_id)

        result = asyncio.get_event_loop().run_until_complete(_run())

        # One new chemical should be created
        assert len(result) == 1
        assert result[0].name == "BrandNewChem"
        chem_col.insert_one.assert_called_once()


# ---------------------------------------------------------------------------
# Archive-aware calculate_for_crops
# ---------------------------------------------------------------------------

class TestCalculateArchivedWarning:
    """
    Tests for archive-aware behaviour in calculate_for_crops.

    Confirmed:
    1. Archived chemical match → warning emitted, unitPrice/totalCost are None.
    2. Active chemical with matching alias resolves correctly (alias test).
    """

    def _build_calc_db(
        self,
        chem_docs: list,
        plant_docs: list,
        override_docs: list = None,
        inventory_docs: list = None,
    ) -> MagicMock:
        """Build a mock Motor database suitable for calculate_for_crops."""
        # Chemicals collection
        chem_cursor = MagicMock()
        chem_cursor.sort = MagicMock(return_value=chem_cursor)
        chem_cursor.to_list = AsyncMock(return_value=chem_docs)
        chem_col = MagicMock()
        chem_col.find = MagicMock(return_value=chem_cursor)
        chem_col.find_one = AsyncMock(return_value=None)

        # Plant data collection
        plant_cursor = MagicMock()
        plant_cursor.to_list = AsyncMock(return_value=plant_docs)
        plant_col = MagicMock()
        plant_col.find = MagicMock(return_value=plant_cursor)

        # Price overrides collection
        override_cursor = MagicMock()
        override_cursor.to_list = AsyncMock(return_value=override_docs or [])
        override_col = MagicMock()
        override_col.find = MagicMock(return_value=override_cursor)

        # Inventory collection
        inv_col = MagicMock()
        inv_col.find_one = AsyncMock(return_value=None)

        db = MagicMock()
        db.fertilizer_chemicals = chem_col
        db.plant_data_enhanced = plant_col
        db.fertilizer_price_overrides = override_col
        db.inventory_input = inv_col

        _col_map = {
            "fertilizer_chemicals": chem_col,
            "plant_data_enhanced": plant_col,
            "fertilizer_price_overrides": override_col,
            "inventory_input": inv_col,
        }
        db.__getitem__ = MagicMock(side_effect=lambda n: _col_map.get(n, MagicMock()))
        return db

    def test_archived_chemical_emits_warning_and_null_cost(self):
        """
        When an ingredient matches an archived chemical, the calculator:
        - emits an archived-match warning,
        - reports the ingredient with qty > 0 but unitPrice/totalCost == None.
        """
        from src.modules.farm_manager.models.tools.calculator_request import CalculateItem
        from src.modules.farm_manager.services.tools.fertilizer_calculator import calculate_for_crops

        plant_id = uuid4()
        org_id = uuid4()
        archived_urea = _make_chem_doc("Urea", archived=True)

        plant_doc = {
            "_id": "x",
            "plantDataId": str(plant_id),
            "plantName": "Tomato",
            "growthCycle": {"totalCycleDays": 60},
            "fertigationSchedule": {
                "cards": [{
                    "dayStart": 0,
                    "dayEnd": 60,
                    "rules": [{
                        "type": "interval",
                        "name": "Base",
                        "frequencyDays": 7,
                        "activeDayStart": 0,
                        "activeDayEnd": 60,
                        "ingredients": [
                            {"name": "Urea", "dosagePerPoint": 5.0, "unit": "g",
                             "category": "macro_npk"},
                        ],
                    }],
                }],
            },
        }

        db = self._build_calc_db(
            chem_docs=[archived_urea],
            plant_docs=[plant_doc],
        )

        async def _run():
            with patch(
                "src.modules.farm_manager.services.tools.fertilizer_calculator.farm_db.get_database",
                return_value=db,
            ), patch(
                "src.modules.farm_manager.services.tools.chemicals_repository.farm_db.get_database",
                return_value=db,
            ), patch(
                "src.modules.farm_manager.services.tools.chemicals_service.farm_db.get_database",
                return_value=db,
            ), patch(
                "src.modules.farm_manager.services.tools.price_book.farm_db.get_database",
                return_value=db,
            ):
                return await calculate_for_crops(
                    items=[CalculateItem(plantDataId=plant_id, points=10)],
                    organization_id=org_id,
                )

        result = asyncio.get_event_loop().run_until_complete(_run())

        # Warning must reference the archived chemical
        assert any("archived" in w.lower() and "Urea" in w for w in result.warnings), (
            f"Expected archived warning, got: {result.warnings}"
        )

        # Ingredient must have qty > 0 but null costs
        assert len(result.perCrop) == 1
        crop = result.perCrop[0]
        assert len(crop.ingredients) == 1
        ing = crop.ingredients[0]
        assert ing.qty > 0
        assert ing.unitPrice is None
        assert ing.totalCost is None
        assert crop.subtotalCost is None
        assert result.grandTotalCost is None

    def test_active_alias_resolves_correctly(self):
        """
        An active chemical referenced via its alias resolves to that chemical.
        The ingredient qty should be > 0 and chemicalId should be set.
        """
        from src.modules.farm_manager.models.tools.calculator_request import CalculateItem
        from src.modules.farm_manager.services.tools.fertilizer_calculator import calculate_for_crops

        plant_id = uuid4()
        org_id = uuid4()
        chem_id = uuid4()

        # Active chemical named "Calcium Nitrate" with alias "Cal Nitrate"
        active_chem = {
            "chemicalId": str(chem_id),
            "name": "Calcium Nitrate",
            "aliases": ["Cal Nitrate"],
            "category": "macro_npk",
            "defaultUnit": "kg",
            "notes": None,
            "archivedAt": None,
            "organizationId": str(org_id),
            "createdBy": str(uuid4()),
            "createdAt": datetime.utcnow().isoformat(),
            "updatedAt": datetime.utcnow().isoformat(),
        }

        plant_doc = {
            "_id": "y",
            "plantDataId": str(plant_id),
            "plantName": "Pepper",
            "growthCycle": {"totalCycleDays": 30},
            "fertigationSchedule": {
                "cards": [{
                    "dayStart": 0,
                    "dayEnd": 30,
                    "rules": [{
                        "type": "custom",
                        "applications": [
                            {"day": 10, "ingredients": [
                                {"name": "Cal Nitrate", "dosagePerPoint": 10.0, "unit": "g",
                                 "category": "macro_npk"},
                            ]},
                        ],
                    }],
                }],
            },
        }

        db = self._build_calc_db(
            chem_docs=[active_chem],
            plant_docs=[plant_doc],
        )

        async def _run():
            with patch(
                "src.modules.farm_manager.services.tools.fertilizer_calculator.farm_db.get_database",
                return_value=db,
            ), patch(
                "src.modules.farm_manager.services.tools.chemicals_repository.farm_db.get_database",
                return_value=db,
            ), patch(
                "src.modules.farm_manager.services.tools.chemicals_service.farm_db.get_database",
                return_value=db,
            ), patch(
                "src.modules.farm_manager.services.tools.price_book.farm_db.get_database",
                return_value=db,
            ):
                return await calculate_for_crops(
                    items=[CalculateItem(plantDataId=plant_id, points=5)],
                    organization_id=org_id,
                )

        result = asyncio.get_event_loop().run_until_complete(_run())

        # No archived warnings
        archived_warns = [w for w in result.warnings if "archived" in w.lower()]
        assert archived_warns == [], f"Unexpected archived warnings: {archived_warns}"

        # Ingredient should have a chemicalId (resolved via alias)
        assert len(result.perCrop) == 1
        crop = result.perCrop[0]
        assert len(crop.ingredients) == 1
        ing = crop.ingredients[0]
        assert ing.chemicalId == chem_id
        assert ing.qty > 0
