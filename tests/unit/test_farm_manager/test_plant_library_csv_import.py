"""
Unit tests for the Plant Library CSV template + bulk import rework (T-915).

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
    5. generate_csv_template() emits the exact new header list, in order,
       and both example rows share plantName "Tomato" with distinct
       varietyName.
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
    "plantType": "vegetable",
    "varietyName": "Roma",
    "farmTypeCompatibility": "greenhouse",
    "growthCycleDays": "90",
    "minTemperatureCelsius": "15",
    "maxTemperatureCelsius": "30",
    "optimalTemperatureCelsius": "24",
    "minPH": "6.0",
    "maxPH": "6.8",
    "optimalPH": "6.5",
    "wateringFrequencyDays": "2",
    "yieldPerPlant": "3.0",
    "yieldUnit": "kg",
    "expectedWastePercentage": "5",
    "spacingCategory": "l",
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


class TestGenerateCsvTemplate:
    def test_header_and_example_rows(self):
        csv_content = PlantDataEnhancedService.generate_csv_template()
        reader = csv.reader(io.StringIO(csv_content))
        rows = list(reader)

        header = rows[0]
        assert header == [
            "plantName",
            "scientificName",
            "plantType",
            "varietyName",
            "farmTypeCompatibility",
            "growthCycleDays",
            "minTemperatureCelsius",
            "maxTemperatureCelsius",
            "optimalTemperatureCelsius",
            "minPH",
            "maxPH",
            "optimalPH",
            "wateringFrequencyDays",
            "yieldPerPlant",
            "yieldUnit",
            "expectedWastePercentage",
            "spacingCategory",
            "tags",
            "notes",
        ]

        # Two example rows, both plantName "Tomato", distinct varietyName.
        assert len(rows) == 3  # header + 2 example rows
        example_rows = rows[1:]
        plant_name_idx = header.index("plantName")
        variety_name_idx = header.index("varietyName")
        plant_type_idx = header.index("plantType")

        assert all(r[plant_name_idx] == "Tomato" for r in example_rows)
        variety_names = {r[variety_name_idx] for r in example_rows}
        assert len(variety_names) == 2  # distinct varietyName per row
        assert all(r[plant_type_idx] == "vegetable" for r in example_rows)
