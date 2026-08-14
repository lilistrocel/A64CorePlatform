"""
Unit tests for the Plant Library CSV template + bulk import rework (T-915),
its required-fields-first / minimal-CSV follow-up (T-917), and the
growth-cycle-phase-columns + variety-modal-parity follow-up (T-918).

Covers `PlantDataEnhancedService.generate_csv_template` and
`PlantDataEnhancedService.import_from_csv` under the mother/variety data
model shipped by Plant Library Phases 1-3 (T-912/T-913/T-914): each CSV row
is a VARIETY, grouped under a find-or-created MOTHER by `plantName`.

`import_from_csv` reuses Phase 2 code directly rather than reimplementing
it — `PlantMotherRepository.get_by_name`/`.create` for mother find-or-create,
and `PlantMotherService.create_variety_for_mother` for variety creation (its
404/409 validation, basic-info inheritance, and detail-field validation).
These tests exercise that integration, not a reimplementation of it.

No live database — the same hand-rolled fake Motor-collection style as
tests/unit/test_farm_manager/test_plant_mother_api.py (find/find_one/
insert_one/update_one/update_many/count_documents), monkeypatching
farm_db.get_database. mongomock is not in requirements.txt.

Test cases:
    1. Two rows, same plantName, different varietyName -> 1 mother created,
       2 varieties created.
    2. A row whose plantName matches an already-existing (pre-seeded)
       mother -> mother reused (mothersReused increments, mothersCreated
       does not), 1 new variety added.
    3. A row whose (mother, varietyName) already exists as an active
       variety -> skipped as duplicate (rowsSkipped), no new variety
       created, no exception raised, other rows still process.
    4. A row missing varietyName and a row with an invalid plantType are
       both recorded in rowsFailed with correct row numbers, while a third
       valid row in the same CSV still imports successfully.
    5. generate_csv_template() emits the new header list — 9 required
       columns (marked "*") first, in order, then optional columns
       unmarked — and both example rows share plantName "Tomato" with
       distinct varietyName.
    6. A minimal CSV with ONLY the 9 required (marked) columns imports
       successfully; totalCycleDays == sum of the 5 phase columns; all
       documented defaults applied.
    7. The same minimal CSV with PLAIN (unmarked) headers imports
       identically (header normalization).
    8. Blank scientificName, blank yieldPerPlant, and yieldPerPlant <= 0
       each fail their row with a clear message; other rows still import.
    9. Blank plantType defaults the mother to 'crop' (no longer an error);
       an invalid non-blank plantType still fails the row.
    10. A blank growth-cycle phase column fails its row with a message
        naming the field; 0 is a legal value for an individual phase; all
        5 phases summing to 0 fails with a "total must be greater than 0"
        message.
    11. A CSV with every optional column filled builds humidity (nested in
        environmentalRequirements), lightRequirements (with a defaulted
        lightType), wateringRequirements (with waterAmountPerPlantLiters),
        economicsAndLabor, and seedsPerPlantingPoint.
"""

from __future__ import annotations

import csv
import io
import re
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from uuid import uuid4

import pytest

from src.modules.farm_manager.services.database import farm_db
from src.modules.farm_manager.services.plant_data.plant_data_enhanced_service import (
    PlantDataEnhancedService,
)
from src.modules.farm_manager.services.plant_data.plant_mother_repository import (
    PlantMotherRepository,
)
from src.modules.farm_manager.services.plant_data.plant_mother_service import (
    PlantMotherService,
)
from src.modules.farm_manager.models.plant_mother import PlantMotherCreate
from src.modules.farm_manager.models.plant_data_enhanced import (
    FarmTypeEnum,
    LightTypeEnum,
)


# ---------------------------------------------------------------------------
# Generic Motor-collection-shaped fake (mirrors test_plant_mother_api.py)
# ---------------------------------------------------------------------------


def _matches(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(doc, clause) for clause in expected):
                return False
            continue

        actual = doc.get(key)
        if isinstance(expected, dict):
            if "$ne" in expected and actual == expected["$ne"]:
                return False
            if "$regex" in expected:
                flags = re.IGNORECASE if expected.get("$options") == "i" else 0
                if not actual or not re.search(expected["$regex"], str(actual), flags):
                    return False
            if "$in" in expected and actual not in expected["$in"]:
                return False
        else:
            if actual != expected:
                return False
    return True


class _FakeCursor:
    def __init__(self, items: List[Dict[str, Any]]) -> None:
        self._items = items

    def sort(self, field: str, direction: int = 1) -> "_FakeCursor":
        self._items = sorted(
            self._items,
            key=lambda d: (d.get(field) is None, d.get(field)),
            reverse=(direction == -1),
        )
        return self

    def skip(self, n: int) -> "_FakeCursor":
        self._items = self._items[n:]
        return self

    def limit(self, n: int) -> "_FakeCursor":
        self._items = self._items[:n]
        return self

    async def to_list(self, length: Optional[int] = None) -> List[Dict[str, Any]]:
        return list(self._items)


class _FakeCollection:
    def __init__(self) -> None:
        self.docs: List[Dict[str, Any]] = []

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for doc in self.docs:
            if _matches(doc, query):
                return dict(doc)
        return None

    def find(self, query: Optional[Dict[str, Any]] = None) -> _FakeCursor:
        query = query or {}
        return _FakeCursor([dict(d) for d in self.docs if _matches(d, query)])

    async def insert_one(self, doc: Dict[str, Any]):
        self.docs.append(dict(doc))
        return SimpleNamespace(inserted_id="fake_id")

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any]):
        for doc in self.docs:
            if _matches(doc, query):
                self._apply(doc, update)
                return SimpleNamespace(matched_count=1, modified_count=1)
        return SimpleNamespace(matched_count=0, modified_count=0)

    async def update_many(self, query: Dict[str, Any], update: Dict[str, Any]):
        count = 0
        for doc in self.docs:
            if _matches(doc, query):
                self._apply(doc, update)
                count += 1
        return SimpleNamespace(matched_count=count, modified_count=count)

    async def count_documents(self, query: Dict[str, Any]) -> int:
        return sum(1 for d in self.docs if _matches(d, query))

    @staticmethod
    def _apply(doc: Dict[str, Any], update: Dict[str, Any]) -> None:
        if "$set" in update:
            doc.update(update["$set"])
        if "$push" in update:
            for k, v in update["$push"].items():
                doc.setdefault(k, []).append(v)


class _FakeDB:
    def __init__(self) -> None:
        self._collections: Dict[str, _FakeCollection] = {}

    def __getitem__(self, name: str) -> _FakeCollection:
        return self._collections.setdefault(name, _FakeCollection())

    def __getattr__(self, name: str) -> _FakeCollection:
        return self[name]


@pytest.fixture()
def fake_db(monkeypatch: pytest.MonkeyPatch) -> _FakeDB:
    db = _FakeDB()
    monkeypatch.setattr(farm_db, "get_database", lambda: db)
    return db


# ---------------------------------------------------------------------------
# CSV builder helper
# ---------------------------------------------------------------------------

_BASE_ROW = {
    "plantName": "Tomato",
    "scientificName": "Solanum lycopersicum",
    "varietyName": "Roma",
    "yieldPerPlant": "3.0",
    # 5 growth-cycle phase columns, all required. Sum = 90.
    "germinationDays": "10",
    "vegetativeDays": "40",
    "floweringDays": "20",
    "fruitingDays": "15",
    "harvestDurationDays": "5",
    "plantType": "vegetable",
    "farmTypeCompatibility": "greenhouse",
    "yieldUnit": "kg",
    "expectedWastePercentage": "5",
    # Distinct from the model default (1) so tests can tell it was actually
    # read from the CSV rather than defaulted.
    "seedsPerPlantingPoint": "2",
    "spacingCategory": "l",
    "minTemperatureCelsius": "15",
    "maxTemperatureCelsius": "30",
    "optimalTemperatureCelsius": "24",
    "humidityMin": "50",
    "humidityMax": "80",
    "humidityOptimal": "65",
    "minPH": "6.0",
    "maxPH": "6.8",
    "optimalPH": "6.5",
    "wateringFrequencyDays": "2",
    "waterAmountPerPlantLiters": "0.5",
    "dailyLightHoursMin": "6",
    "dailyLightHoursMax": "12",
    "dailyLightHoursOptimal": "8",
    "averageMarketValuePerKg": "3.5",
    "currency": "USD",
    "tags": "vegetable,fruit",
    "notes": "Test row",
}


def _build_csv(rows: List[Dict[str, Any]]) -> str:
    """Build a CSV string from a list of partial row overrides on _BASE_ROW."""
    fieldnames = list(_BASE_ROW.keys())
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for override in rows:
        row = dict(_BASE_ROW)
        row.update(override)
        writer.writerow(row)
    return output.getvalue()


_REQUIRED_FIELDS = [
    "plantName",
    "scientificName",
    "varietyName",
    "yieldPerPlant",
    "germinationDays",
    "vegetativeDays",
    "floweringDays",
    "fruitingDays",
    "harvestDurationDays",
]


def _build_minimal_csv(rows: List[Dict[str, str]], marked: bool = True) -> str:
    """
    Build a CSV containing ONLY the 9 hard-required columns.

    marked=True uses the template's marked headers ("plantName*" etc.);
    marked=False uses plain unmarked headers, to exercise header
    normalization (both must import identically).
    """
    header = [f"{f}*" for f in _REQUIRED_FIELDS] if marked else list(_REQUIRED_FIELDS)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(header)
    for row in rows:
        writer.writerow([row.get(f, "") for f in _REQUIRED_FIELDS])
    return output.getvalue()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestImportCollapsesToOneMother:
    @pytest.mark.asyncio
    async def test_two_varieties_same_mother(self, fake_db: _FakeDB):
        csv_content = _build_csv(
            [
                {"varietyName": "Roma"},
                {"varietyName": "Cherry"},
            ]
        )

        result = await PlantDataEnhancedService.import_from_csv(
            csv_content, uuid4(), "importer@example.com"
        )

        assert result["totalRows"] == 2
        assert result["mothersCreated"] == 1
        assert result["mothersReused"] == 1  # 2nd row reuses the cached mother
        assert result["varietiesCreated"] == 2
        assert result["rowsSkipped"] == []
        assert result["rowsFailed"] == []

        mothers, total, _ = await PlantMotherService.list_mothers()
        assert total == 1
        assert mothers[0].plantName == "Tomato"
        assert mothers[0].varietyCount == 2


class TestImportReusesExistingMother:
    @pytest.mark.asyncio
    async def test_reuses_preexisting_mother(self, fake_db: _FakeDB):
        existing_mother = await PlantMotherService.create_mother(
            PlantMotherCreate(
                plantName="Tomato",
                scientificName="Solanum lycopersicum",
                plantType="vegetable",
            ),
            uuid4(),
            "seed@example.com",
        )

        csv_content = _build_csv([{"varietyName": "Roma"}])

        result = await PlantDataEnhancedService.import_from_csv(
            csv_content, uuid4(), "importer@example.com"
        )

        assert result["mothersCreated"] == 0
        assert result["mothersReused"] == 1
        assert result["varietiesCreated"] == 1

        mothers, total, _ = await PlantMotherService.list_mothers()
        assert total == 1  # no duplicate mother created
        assert mothers[0].plantMotherId == existing_mother.plantMotherId
        assert mothers[0].varietyCount == 1


class TestImportSkipsDuplicateVariety:
    @pytest.mark.asyncio
    async def test_duplicate_variety_under_mother_skipped(self, fake_db: _FakeDB):
        # First import creates the mother + Roma variety.
        first = await PlantDataEnhancedService.import_from_csv(
            _build_csv([{"varietyName": "Roma"}]), uuid4(), "importer@example.com"
        )
        assert first["varietiesCreated"] == 1

        # Second CSV re-sends "Roma" (duplicate) plus a genuinely new "Cherry".
        csv_content = _build_csv(
            [
                {"varietyName": "Roma"},
                {"varietyName": "Cherry"},
            ]
        )
        result = await PlantDataEnhancedService.import_from_csv(
            csv_content, uuid4(), "importer@example.com"
        )

        assert result["mothersCreated"] == 0
        assert result["mothersReused"] == 2
        assert result["varietiesCreated"] == 1  # only Cherry
        assert len(result["rowsSkipped"]) == 1
        assert result["rowsSkipped"][0]["row"] == 2  # first data row
        assert result["rowsFailed"] == []

        mothers, _, _ = await PlantMotherService.list_mothers()
        assert mothers[0].varietyCount == 2  # Roma (from first import) + Cherry


class TestImportBadRowsDoNotAbortBatch:
    @pytest.mark.asyncio
    async def test_missing_variety_name_and_invalid_plant_type_recorded(
        self, fake_db: _FakeDB
    ):
        csv_content = _build_csv(
            [
                {"varietyName": ""},  # row 2: missing varietyName
                {"varietyName": "Beefsteak", "plantType": "not_a_real_type"},  # row 3
                {"varietyName": "Cherry"},  # row 4: valid
            ]
        )

        result = await PlantDataEnhancedService.import_from_csv(
            csv_content, uuid4(), "importer@example.com"
        )

        assert result["totalRows"] == 3
        assert result["varietiesCreated"] == 1  # row 4 still succeeded
        assert len(result["rowsFailed"]) == 2

        failed_rows = {f["row"] for f in result["rowsFailed"]}
        assert failed_rows == {2, 3}

        row2 = next(f for f in result["rowsFailed"] if f["row"] == 2)
        assert "varietyName" in row2["error"]

        row3 = next(f for f in result["rowsFailed"] if f["row"] == 3)
        assert "plantType" in row3["error"]

        # The valid row's mother was still created and the variety exists.
        mothers, total, _ = await PlantMotherService.list_mothers()
        assert total == 1
        assert mothers[0].varietyCount == 1


_MINIMAL_ROW = {
    "plantName": "Kale",
    "scientificName": "Brassica oleracea",
    "varietyName": "Curly",
    "yieldPerPlant": "1.5",
    "germinationDays": "5",
    "vegetativeDays": "20",
    "floweringDays": "10",
    "fruitingDays": "8",
    "harvestDurationDays": "2",  # sum = 45
}


class TestMinimalRequiredColumnsOnlyImports:
    """A CSV with ONLY the 9 hard-required columns must still import,
    with every optional field falling back to its documented default —
    the row becomes a "skeleton" variety the user completes via the UI."""

    @pytest.mark.asyncio
    async def test_marked_headers_minimal_csv_applies_all_defaults(
        self, fake_db: _FakeDB
    ):
        csv_content = _build_minimal_csv([_MINIMAL_ROW], marked=True)

        result = await PlantDataEnhancedService.import_from_csv(
            csv_content, uuid4(), "importer@example.com"
        )

        assert result["totalRows"] == 1
        assert result["mothersCreated"] == 1
        assert result["varietiesCreated"] == 1
        assert result["rowsFailed"] == []
        assert result["rowsSkipped"] == []

        mothers, total, _ = await PlantMotherService.list_mothers()
        assert total == 1
        assert mothers[0].plantType == "crop"  # default when plantType blank

        varieties = await PlantMotherService.list_varieties(
            mothers[0].plantMotherId
        )
        assert len(varieties) == 1
        variety = varieties[0]
        assert variety.farmTypeCompatibility == [FarmTypeEnum.OPEN_FIELD]
        assert variety.yieldInfo.yieldUnit == "kg"
        assert variety.yieldInfo.expectedWastePercentage == 0
        assert variety.yieldInfo.seedsPerPlantingPoint == 1  # default when blank
        # totalCycleDays is always the computed sum of the 5 required
        # phase columns — no placeholder needed now that they're required.
        assert variety.growthCycle.totalCycleDays == 45
        assert variety.growthCycle.germinationDays == 5
        assert variety.growthCycle.vegetativeDays == 20
        assert variety.growthCycle.floweringDays == 10
        assert variety.growthCycle.fruitingDays == 8
        assert variety.growthCycle.harvestDurationDays == 2
        assert variety.environmentalRequirements is None
        assert variety.soilRequirements is None
        assert variety.wateringRequirements is None
        assert variety.lightRequirements is None
        assert variety.economicsAndLabor is None
        assert variety.spacingCategory is None

    @pytest.mark.asyncio
    async def test_plain_unmarked_headers_minimal_csv_imports_identically(
        self, fake_db: _FakeDB
    ):
        csv_content = _build_minimal_csv([_MINIMAL_ROW], marked=False)

        result = await PlantDataEnhancedService.import_from_csv(
            csv_content, uuid4(), "importer@example.com"
        )

        assert result["mothersCreated"] == 1
        assert result["varietiesCreated"] == 1
        assert result["rowsFailed"] == []


class TestRequiredFieldValidation:
    @pytest.mark.asyncio
    async def test_blank_scientific_name_and_bad_yield_values_fail_with_clear_messages(
        self, fake_db: _FakeDB
    ):
        csv_content = _build_csv(
            [
                {"varietyName": "NoSciName", "scientificName": ""},  # row 2
                {"varietyName": "NoYield", "yieldPerPlant": ""},  # row 3
                {"varietyName": "ZeroYield", "yieldPerPlant": "0"},  # row 4
                {"varietyName": "NegativeYield", "yieldPerPlant": "-1"},  # row 5
                {"varietyName": "NotANumber", "yieldPerPlant": "abc"},  # row 6
                {"varietyName": "Good"},  # row 7: valid
            ]
        )

        result = await PlantDataEnhancedService.import_from_csv(
            csv_content, uuid4(), "importer@example.com"
        )

        assert result["totalRows"] == 6
        assert result["varietiesCreated"] == 1  # only "Good"
        assert len(result["rowsFailed"]) == 5

        errors_by_row = {f["row"]: f["error"] for f in result["rowsFailed"]}
        assert "scientificName" in errors_by_row[2]
        assert "yieldPerPlant" in errors_by_row[3]
        assert "yieldPerPlant" in errors_by_row[4]
        assert "yieldPerPlant" in errors_by_row[5]
        assert "yieldPerPlant" in errors_by_row[6]


class TestPlantTypeDefaultsToCropWhenBlank:
    @pytest.mark.asyncio
    async def test_blank_plant_type_creates_crop_mother(self, fake_db: _FakeDB):
        csv_content = _build_csv([{"plantType": ""}])

        result = await PlantDataEnhancedService.import_from_csv(
            csv_content, uuid4(), "importer@example.com"
        )

        assert result["varietiesCreated"] == 1
        assert result["rowsFailed"] == []

        mothers, total, _ = await PlantMotherService.list_mothers()
        assert total == 1
        assert mothers[0].plantType == "crop"

    @pytest.mark.asyncio
    async def test_invalid_non_blank_plant_type_still_fails(self, fake_db: _FakeDB):
        # A second, valid row is included so the batch doesn't raise 422
        # for being completely unusable (that behavior is unchanged and
        # not what this test is verifying).
        csv_content = _build_csv(
            [
                {"varietyName": "Beefsteak", "plantType": "not_a_real_type"},  # row 2
                {"varietyName": "Roma"},  # row 3: valid
            ]
        )

        result = await PlantDataEnhancedService.import_from_csv(
            csv_content, uuid4(), "importer@example.com"
        )

        assert result["varietiesCreated"] == 1
        assert len(result["rowsFailed"]) == 1
        assert result["rowsFailed"][0]["row"] == 2
        assert "plantType" in result["rowsFailed"][0]["error"]


class TestGrowthCyclePhaseValidation:
    @pytest.mark.asyncio
    async def test_blank_phase_column_fails_with_field_named_message(
        self, fake_db: _FakeDB
    ):
        csv_content = _build_csv(
            [
                {"varietyName": "MissingFlowering", "floweringDays": ""},  # row 2
                {"varietyName": "Good"},  # row 3: valid
            ]
        )

        result = await PlantDataEnhancedService.import_from_csv(
            csv_content, uuid4(), "importer@example.com"
        )

        assert result["varietiesCreated"] == 1
        assert len(result["rowsFailed"]) == 1
        assert result["rowsFailed"][0]["row"] == 2
        assert "floweringDays" in result["rowsFailed"][0]["error"]

    @pytest.mark.asyncio
    async def test_all_zero_phases_fail_with_total_must_be_greater_than_zero(
        self, fake_db: _FakeDB
    ):
        csv_content = _build_csv(
            [
                {
                    "varietyName": "ZeroCycle",
                    "germinationDays": "0",
                    "vegetativeDays": "0",
                    "floweringDays": "0",
                    "fruitingDays": "0",
                    "harvestDurationDays": "0",
                },  # row 2
                {"varietyName": "Good"},  # row 3: valid
            ]
        )

        result = await PlantDataEnhancedService.import_from_csv(
            csv_content, uuid4(), "importer@example.com"
        )

        assert result["varietiesCreated"] == 1
        assert len(result["rowsFailed"]) == 1
        assert result["rowsFailed"][0]["row"] == 2
        assert "greater than 0" in result["rowsFailed"][0]["error"]

    @pytest.mark.asyncio
    async def test_zero_is_a_valid_individual_phase_value(self, fake_db: _FakeDB):
        # Leafy greens: no flowering/fruiting stage, but the other 3 phases
        # still sum to > 0.
        csv_content = _build_csv(
            [
                {
                    "varietyName": "LeafyGreen",
                    "germinationDays": "5",
                    "vegetativeDays": "20",
                    "floweringDays": "0",
                    "fruitingDays": "0",
                    "harvestDurationDays": "5",
                }
            ]
        )

        result = await PlantDataEnhancedService.import_from_csv(
            csv_content, uuid4(), "importer@example.com"
        )

        assert result["varietiesCreated"] == 1
        assert result["rowsFailed"] == []

        mothers, _, _ = await PlantMotherService.list_mothers()
        varieties = await PlantMotherService.list_varieties(
            mothers[0].plantMotherId
        )
        assert varieties[0].growthCycle.totalCycleDays == 30
        assert varieties[0].growthCycle.floweringDays == 0
        assert varieties[0].growthCycle.fruitingDays == 0


class TestFullCsvBuildsAllNestedStructures:
    @pytest.mark.asyncio
    async def test_full_csv_builds_humidity_light_watering_economics(
        self, fake_db: _FakeDB
    ):
        # Unmodified _BASE_ROW — every optional column is filled.
        csv_content = _build_csv([{}])

        result = await PlantDataEnhancedService.import_from_csv(
            csv_content, uuid4(), "importer@example.com"
        )

        assert result["varietiesCreated"] == 1
        assert result["rowsFailed"] == []

        mothers, _, _ = await PlantMotherService.list_mothers()
        varieties = await PlantMotherService.list_varieties(
            mothers[0].plantMotherId
        )
        variety = varieties[0]

        # environmentalRequirements + nested humidity (HumidityRange)
        assert variety.environmentalRequirements is not None
        assert variety.environmentalRequirements.temperature.minCelsius == 15.0
        assert variety.environmentalRequirements.humidity is not None
        assert variety.environmentalRequirements.humidity.minPercentage == 50.0
        assert variety.environmentalRequirements.humidity.maxPercentage == 80.0
        assert variety.environmentalRequirements.humidity.optimalPercentage == 65.0

        # lightRequirements — no lightType column, so it's defaulted
        assert variety.lightRequirements is not None
        assert variety.lightRequirements.lightType == LightTypeEnum.FULL_SUN
        assert variety.lightRequirements.minHoursDaily == 6.0
        assert variety.lightRequirements.maxHoursDaily == 12.0
        assert variety.lightRequirements.optimalHoursDaily == 8.0

        # wateringRequirements — includes waterAmountPerPlantLiters
        assert variety.wateringRequirements is not None
        assert variety.wateringRequirements.frequencyDays == 2
        assert variety.wateringRequirements.amountPerPlantLiters == 0.5

        # economicsAndLabor
        assert variety.economicsAndLabor is not None
        assert variety.economicsAndLabor.averageMarketValuePerKg == 3.5
        assert variety.economicsAndLabor.currency == "USD"

        # seedsPerPlantingPoint (yieldInfo)
        assert variety.yieldInfo.seedsPerPlantingPoint == 2

    @pytest.mark.asyncio
    async def test_old_water_amount_header_spelling_still_tolerated(
        self, fake_db: _FakeDB
    ):
        # Pre-cleanup CSVs used "waterAmountPerPlant" (no unit in the
        # header name, and a separate now-removed "waterAmountUnit"
        # column). The header normalizer must still map the old spelling
        # onto amountPerPlantLiters so an existing CSV doesn't break.
        header = list(_REQUIRED_FIELDS) + ["waterAmountPerPlant"]
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(header)
        writer.writerow(
            [
                "Basil",
                "Ocimum basilicum",
                "Genovese",
                "0.2",
                "5",
                "15",
                "5",
                "5",
                "5",
                "0.75",
            ]
        )
        csv_content = output.getvalue()

        result = await PlantDataEnhancedService.import_from_csv(
            csv_content, uuid4(), "importer@example.com"
        )

        assert result["varietiesCreated"] == 1
        assert result["rowsFailed"] == []

        mothers, _, _ = await PlantMotherService.list_mothers()
        varieties = await PlantMotherService.list_varieties(
            mothers[0].plantMotherId
        )
        assert varieties[0].wateringRequirements is not None
        assert varieties[0].wateringRequirements.amountPerPlantLiters == 0.75


class TestGenerateCsvTemplate:
    def test_header_and_example_rows(self):
        csv_content = PlantDataEnhancedService.generate_csv_template()
        reader = csv.reader(io.StringIO(csv_content))
        rows = list(reader)

        header = rows[0]
        assert header == [
            "plantName*",
            "scientificName*",
            "varietyName*",
            "yieldPerPlant*",
            "germinationDays*",
            "vegetativeDays*",
            "floweringDays*",
            "fruitingDays*",
            "harvestDurationDays*",
            "plantType",
            "farmTypeCompatibility",
            "yieldUnit",
            "expectedWastePercentage",
            "seedsPerPlantingPoint",
            "spacingCategory",
            "minTemperatureCelsius",
            "maxTemperatureCelsius",
            "optimalTemperatureCelsius",
            "humidityMin",
            "humidityMax",
            "humidityOptimal",
            "minPH",
            "maxPH",
            "optimalPH",
            "wateringFrequencyDays",
            "waterAmountPerPlantLiters",
            "dailyLightHoursMin",
            "dailyLightHoursMax",
            "dailyLightHoursOptimal",
            "averageMarketValuePerKg",
            "currency",
            "tags",
            "notes",
        ]

        # The 9 required columns are marked "*" and come first; every
        # optional column that follows is unmarked.
        required = header[:9]
        optional = header[9:]
        assert all(h.endswith("*") for h in required)
        assert not any(h.endswith("*") for h in optional)

        # Two example rows, both plantName "Tomato", distinct varietyName.
        assert len(rows) == 3  # header + 2 example rows
        example_rows = rows[1:]
        plant_name_idx = header.index("plantName*")
        variety_name_idx = header.index("varietyName*")
        plant_type_idx = header.index("plantType")

        assert all(r[plant_name_idx] == "Tomato" for r in example_rows)
        variety_names = {r[variety_name_idx] for r in example_rows}
        assert len(variety_names) == 2  # distinct varietyName per row
        assert all(r[plant_type_idx] == "vegetable" for r in example_rows)

        # Both example rows' 5 phase columns sum to a valid, non-zero total.
        phase_idxs = [
            header.index(f"{f}*")
            for f in (
                "germinationDays",
                "vegetativeDays",
                "floweringDays",
                "fruitingDays",
                "harvestDurationDays",
            )
        ]
        for r in example_rows:
            total = sum(int(r[i]) for i in phase_idxs)
            assert total > 0
