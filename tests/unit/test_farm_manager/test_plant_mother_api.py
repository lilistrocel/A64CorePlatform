"""
Unit tests for the Plant Library Phase 2 API layer:

- PlantMotherService (create/list/get/update/delete mother + create variety
  under a mother) — src/modules/farm_manager/services/plant_data/
  plant_mother_service.py
- The variety-update guard added to PlantDataEnhancedService.update_plant_data
  that rejects client-supplied plantName/scientificName/motherPlantId changes
  now that basic info is inherited from the mother.
- BlockRepository._resolve_product_ref / update_status — the planting
  product-stamp wiring that resolves a planted variety to its mother and
  sets block.productMotherId/productName atomically with the same write.

No live database — a small hand-rolled fake standing in for a Motor
database/collection (find_one/find/insert_one/update_one/update_many/
count_documents), following this codebase's existing convention for DB-free
unit tests (see tests/unit/test_genetics/test_line_purge.py) since
mongomock is not in requirements.txt. farm_db.get_database is monkeypatched
to return the fake for every test.

Test cases:
    1.  create_mother succeeds and persists
    2.  create_mother rejects a duplicate plantName (409)
    3.  list_mothers annotates each mother with an accurate varietyCount
    4.  create_variety_for_mother inherits plantName/scientificName from the
        mother and ignores client-supplied values for those fields
    5.  create_variety_for_mother rejects a duplicate varietyName under the
        same mother (409)
    6.  create_variety_for_mother 404s for an unknown mother
    7.  delete_mother is blocked (409) while active varieties exist
    8.  delete_mother succeeds once no active varieties remain
    9.  update_mother renaming plantName cascades to the variety's
        plantName/scientificName and to a referencing block's productName
    10. update_plant_data (existing variety-update endpoint) rejects a
        client-supplied plantName change
    11. update_plant_data rejects a client-supplied scientificName change
    12. update_plant_data still allows varietyName changes (not inherited info)
    13. BlockRepository._resolve_product_ref resolves a variety to its
        mother's (plantMotherId, plantName)
    14. _resolve_product_ref returns (None, None) + does not raise when the
        variety has no motherPlantId
    15. _resolve_product_ref returns (None, None) + does not raise when the
        motherPlantId doesn't resolve to an existing mother
    16. BlockRepository.update_status stamps productMotherId/productName on
        a PLANNED/GROWING transition, atomically with targetCrop
"""

from __future__ import annotations

import re
from datetime import datetime
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from src.modules.farm_manager.models.block import Block, BlockStatus
from src.modules.farm_manager.models.plant_data_enhanced import (
    PlantDataEnhancedUpdate,
)
from src.modules.farm_manager.models.plant_mother import (
    PlantMotherCreate,
    PlantMotherUpdate,
    VarietyCreateForMother,
)
from src.modules.farm_manager.services.database import farm_db
from src.modules.farm_manager.services.block.block_repository_new import (
    BlockRepository,
)
from src.modules.farm_manager.services.plant_data.plant_data_enhanced_repository import (
    PlantDataEnhancedRepository,
)
from src.modules.farm_manager.services.plant_data.plant_data_enhanced_service import (
    PlantDataEnhancedService,
)
from src.modules.farm_manager.services.plant_data.plant_mother_repository import (
    PlantMotherRepository,
)
from src.modules.farm_manager.services.plant_data.plant_mother_service import (
    PlantMotherService,
)


# ---------------------------------------------------------------------------
# Generic Motor-collection-shaped fake
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
            self._items, key=lambda d: (d.get(field) is None, d.get(field)),
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


class _FakeFarmingYearService:
    """
    Stand-in for FarmingYearService, whose __init__ eagerly grabs
    farm_db.get_database() and caches it on a module-level singleton — a
    real instance constructed inside a test would either touch a live DB or
    (worse) silently pin a stale fake db reference across tests, since the
    singleton persists for the whole pytest process. Sidestepped entirely
    here: BlockRepository.update_status's farmingYearPlanted bookkeeping is
    orthogonal to what these tests actually assert (the product-ref stamp).
    """

    async def get_farming_year_config(self):
        return SimpleNamespace(farmingYearStartMonth=1)

    def get_farming_year_for_date(self, reference_date, start_month):
        return reference_date.year


@pytest.fixture()
def patch_farming_year_service(monkeypatch: pytest.MonkeyPatch) -> None:
    import src.modules.farm_manager.services.farming_year_service as fy_module

    monkeypatch.setattr(
        fy_module, "get_farming_year_service", lambda: _FakeFarmingYearService()
    )


def _variety_payload(**overrides: Any) -> VarietyCreateForMother:
    data = dict(
        varietyName="Cherry",
        farmTypeCompatibility=["greenhouse"],
        growthCycle={"totalCycleDays": 60},
        yieldInfo={"yieldPerPlant": 1.5, "yieldUnit": "kg"},
    )
    data.update(overrides)
    return VarietyCreateForMother(**data)


# ---------------------------------------------------------------------------
# Mother CRUD
# ---------------------------------------------------------------------------


class TestCreateMother:
    @pytest.mark.asyncio
    async def test_create_mother_success(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Cabbage", plantType="vegetable"),
            uuid4(),
            "agronomist@example.com",
        )
        assert mother.plantName == "Cabbage"
        assert mother.plantType == "vegetable"
        stored = await PlantMotherRepository.get_by_id(mother.plantMotherId)
        assert stored is not None
        assert stored.plantName == "Cabbage"

    @pytest.mark.asyncio
    async def test_create_mother_duplicate_name_rejected(self, fake_db: _FakeDB):
        await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Cabbage"), uuid4(), "a@example.com"
        )
        with pytest.raises(HTTPException) as exc:
            await PlantMotherService.create_mother(
                PlantMotherCreate(plantName="Cabbage"), uuid4(), "b@example.com"
            )
        assert exc.value.status_code == 409


class TestListMothers:
    @pytest.mark.asyncio
    async def test_list_mothers_variety_count(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Cabbage"), uuid4(), "a@example.com"
        )
        other = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Lettuce"), uuid4(), "a@example.com"
        )

        await PlantMotherService.create_variety_for_mother(
            mother.plantMotherId,
            _variety_payload(varietyName="Cherry"),
            uuid4(),
            "a@example.com",
        )
        await PlantMotherService.create_variety_for_mother(
            mother.plantMotherId,
            _variety_payload(varietyName="Roma"),
            uuid4(),
            "a@example.com",
        )
        # `other` mother gets zero varieties.

        mothers, total, _ = await PlantMotherService.list_mothers()
        by_name = {m.plantName: m for m in mothers}

        assert total == 2
        assert by_name["Cabbage"].varietyCount == 2
        assert by_name["Lettuce"].varietyCount == 0


class TestCreateVarietyForMother:
    @pytest.mark.asyncio
    async def test_inherits_basic_info_and_ignores_client_values(
        self, fake_db: _FakeDB
    ):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Cabbage", scientificName="Brassica oleracea"),
            uuid4(),
            "a@example.com",
        )

        variety = await PlantMotherService.create_variety_for_mother(
            mother.plantMotherId,
            _variety_payload(
                varietyName="Red Cabbage",
                # Client attempts to override basic info — must be ignored.
                plantName="Something Else Entirely",
                scientificName="Fake sci name",
            ),
            uuid4(),
            "a@example.com",
        )

        assert variety.plantName == "Cabbage"
        assert variety.scientificName == "Brassica oleracea"
        assert variety.varietyName == "Red Cabbage"
        assert variety.motherPlantId == mother.plantMotherId

    @pytest.mark.asyncio
    async def test_duplicate_variety_name_under_same_mother_rejected(
        self, fake_db: _FakeDB
    ):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Cabbage"), uuid4(), "a@example.com"
        )
        await PlantMotherService.create_variety_for_mother(
            mother.plantMotherId, _variety_payload(varietyName="Cherry"), uuid4(), "a@example.com"
        )
        with pytest.raises(HTTPException) as exc:
            await PlantMotherService.create_variety_for_mother(
                mother.plantMotherId,
                _variety_payload(varietyName="Cherry"),
                uuid4(),
                "a@example.com",
            )
        assert exc.value.status_code == 409

    @pytest.mark.asyncio
    async def test_unknown_mother_404s(self, fake_db: _FakeDB):
        with pytest.raises(HTTPException) as exc:
            await PlantMotherService.create_variety_for_mother(
                uuid4(), _variety_payload(), uuid4(), "a@example.com"
            )
        assert exc.value.status_code == 404


class TestDeleteMother:
    @pytest.mark.asyncio
    async def test_blocked_while_active_varieties_exist(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Cabbage"), uuid4(), "a@example.com"
        )
        await PlantMotherService.create_variety_for_mother(
            mother.plantMotherId, _variety_payload(), uuid4(), "a@example.com"
        )

        with pytest.raises(HTTPException) as exc:
            await PlantMotherService.delete_mother(mother.plantMotherId)
        assert exc.value.status_code == 409

        # Still there — refused, not cascaded.
        assert await PlantMotherRepository.get_by_id(mother.plantMotherId) is not None

    @pytest.mark.asyncio
    async def test_succeeds_once_no_active_varieties(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Cabbage"), uuid4(), "a@example.com"
        )
        variety = await PlantMotherService.create_variety_for_mother(
            mother.plantMotherId, _variety_payload(), uuid4(), "a@example.com"
        )
        # Deactivate the only variety (not delete) — mirrors the guard's
        # documented resolution path ("deactivate or reassign them first").
        await PlantDataEnhancedRepository.update(
            variety.plantDataId,
            PlantDataEnhancedUpdate(isActive=False),
            increment_version=False,
        )

        await PlantMotherService.delete_mother(mother.plantMotherId)

        assert await PlantMotherRepository.get_by_id(mother.plantMotherId) is None


class TestUpdateMotherCascade:
    @pytest.mark.asyncio
    async def test_rename_cascades_to_variety_and_block(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Cabbage", scientificName="Old Sci Name"),
            uuid4(),
            "a@example.com",
        )
        variety = await PlantMotherService.create_variety_for_mother(
            mother.plantMotherId, _variety_payload(), uuid4(), "a@example.com"
        )

        # A block referencing this mother (as the planting stamp would set).
        block = Block(farmId=uuid4())
        block_doc = block.model_dump()
        block_doc["blockId"] = str(block_doc["blockId"])
        block_doc["farmId"] = str(block_doc["farmId"])
        block_doc["productMotherId"] = str(mother.plantMotherId)
        block_doc["productName"] = "Cabbage"
        fake_db["blocks"].docs.append(block_doc)

        await PlantMotherService.update_mother(
            mother.plantMotherId,
            PlantMotherUpdate(plantName="Savoy Cabbage", scientificName="New Sci Name"),
        )

        updated_variety = await PlantDataEnhancedRepository.get_by_id(
            variety.plantDataId
        )
        assert updated_variety.plantName == "Savoy Cabbage"
        assert updated_variety.scientificName == "New Sci Name"

        updated_block = await fake_db["blocks"].find_one(
            {"blockId": block_doc["blockId"]}
        )
        assert updated_block["productName"] == "Savoy Cabbage"


# ---------------------------------------------------------------------------
# Variety-update guard (existing plant-data-enhanced endpoint)
# ---------------------------------------------------------------------------


class TestVarietyUpdateGuard:
    @pytest.mark.asyncio
    async def test_rejects_plantname_change(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Cabbage"), uuid4(), "a@example.com"
        )
        variety = await PlantMotherService.create_variety_for_mother(
            mother.plantMotherId, _variety_payload(), uuid4(), "a@example.com"
        )

        with pytest.raises(HTTPException) as exc:
            await PlantDataEnhancedService.update_plant_data(
                variety.plantDataId,
                PlantDataEnhancedUpdate(plantName="Hacked Name"),
                uuid4(),
            )
        assert exc.value.status_code == 422

    @pytest.mark.asyncio
    async def test_rejects_scientificname_change(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Cabbage"), uuid4(), "a@example.com"
        )
        variety = await PlantMotherService.create_variety_for_mother(
            mother.plantMotherId, _variety_payload(), uuid4(), "a@example.com"
        )

        with pytest.raises(HTTPException) as exc:
            await PlantDataEnhancedService.update_plant_data(
                variety.plantDataId,
                PlantDataEnhancedUpdate(scientificName="Hacked Sci Name"),
                uuid4(),
            )
        assert exc.value.status_code == 422

    @pytest.mark.asyncio
    async def test_allows_varietyname_change(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Cabbage"), uuid4(), "a@example.com"
        )
        variety = await PlantMotherService.create_variety_for_mother(
            mother.plantMotherId, _variety_payload(varietyName="Cherry"), uuid4(), "a@example.com"
        )

        updated = await PlantDataEnhancedService.update_plant_data(
            variety.plantDataId,
            PlantDataEnhancedUpdate(varietyName="Cherry Red"),
            uuid4(),
        )
        assert updated.varietyName == "Cherry Red"
        # Basic info untouched.
        assert updated.plantName == "Cabbage"


# ---------------------------------------------------------------------------
# Planting product stamp
# ---------------------------------------------------------------------------


class TestResolveProductRef:
    @pytest.mark.asyncio
    async def test_resolves_variety_to_mother(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Cabbage"), uuid4(), "a@example.com"
        )
        variety = await PlantMotherService.create_variety_for_mother(
            mother.plantMotherId, _variety_payload(), uuid4(), "a@example.com"
        )

        mother_id, mother_name = await BlockRepository._resolve_product_ref(
            variety.plantDataId
        )
        assert mother_id == mother.plantMotherId
        assert mother_name == "Cabbage"

    @pytest.mark.asyncio
    async def test_variety_without_mother_returns_none(self, fake_db: _FakeDB):
        # A variety created via the standalone (non-mother-scoped) path has
        # no motherPlantId — mirrors pre-Phase-2 / pre-migration data.
        from src.modules.farm_manager.models.plant_data_enhanced import (
            PlantDataEnhancedCreate,
        )

        legacy_variety = await PlantDataEnhancedRepository.create(
            PlantDataEnhancedCreate(
                plantName="Standalone Plant",
                farmTypeCompatibility=["greenhouse"],
                growthCycle={"totalCycleDays": 30},
                yieldInfo={"yieldPerPlant": 1.0, "yieldUnit": "kg"},
            ),
            uuid4(),
            "a@example.com",
        )

        mother_id, mother_name = await BlockRepository._resolve_product_ref(
            legacy_variety.plantDataId
        )
        assert mother_id is None
        assert mother_name is None

    @pytest.mark.asyncio
    async def test_unresolvable_mother_returns_none(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Cabbage"), uuid4(), "a@example.com"
        )
        variety = await PlantMotherService.create_variety_for_mother(
            mother.plantMotherId, _variety_payload(), uuid4(), "a@example.com"
        )
        # Simulate the mother having since been hard-removed from the DB
        # (should not normally happen — soft delete only — but the resolver
        # must not crash even in that gap).
        fake_db["plant_mothers"].docs = [
            d
            for d in fake_db["plant_mothers"].docs
            if d["plantMotherId"] != str(mother.plantMotherId)
        ]

        mother_id, mother_name = await BlockRepository._resolve_product_ref(
            variety.plantDataId
        )
        assert mother_id is None
        assert mother_name is None


@pytest.mark.usefixtures("patch_farming_year_service")
class TestUpdateStatusStampsProductRef:
    @pytest.mark.asyncio
    async def test_planting_stamps_product_ref(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Cabbage"), uuid4(), "a@example.com"
        )
        variety = await PlantMotherService.create_variety_for_mother(
            mother.plantMotherId, _variety_payload(), uuid4(), "a@example.com"
        )

        block = Block(farmId=uuid4())
        block_doc = block.model_dump()
        block_doc["blockId"] = str(block_doc["blockId"])
        block_doc["farmId"] = str(block_doc["farmId"])
        fake_db["blocks"].docs.append(block_doc)

        updated_block = await BlockRepository.update_status(
            UUID(block_doc["blockId"]),
            BlockStatus.GROWING,
            uuid4(),
            "a@example.com",
            target_crop=variety.plantDataId,
            target_crop_name=variety.plantName,
            actual_plant_count=100,
        )

        assert updated_block is not None
        assert updated_block.targetCrop == variety.plantDataId
        assert updated_block.productMotherId == mother.plantMotherId
        assert updated_block.productName == "Cabbage"

    @pytest.mark.asyncio
    async def test_emptying_clears_product_ref(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Cabbage"), uuid4(), "a@example.com"
        )
        variety = await PlantMotherService.create_variety_for_mother(
            mother.plantMotherId, _variety_payload(), uuid4(), "a@example.com"
        )

        block = Block(farmId=uuid4())
        block_doc = block.model_dump()
        block_doc["blockId"] = str(block_doc["blockId"])
        block_doc["farmId"] = str(block_doc["farmId"])
        fake_db["blocks"].docs.append(block_doc)
        block_id = UUID(block_doc["blockId"])

        await BlockRepository.update_status(
            block_id,
            BlockStatus.GROWING,
            uuid4(),
            "a@example.com",
            target_crop=variety.plantDataId,
            target_crop_name=variety.plantName,
            actual_plant_count=100,
        )

        emptied = await BlockRepository.update_status(
            block_id, BlockStatus.CLEANING, uuid4(), "a@example.com"
        )
        emptied = await BlockRepository.update_status(
            block_id, BlockStatus.EMPTY, uuid4(), "a@example.com"
        )

        assert emptied.productMotherId is None
        assert emptied.productName is None
        assert emptied.targetCrop is None
