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

Plant Library product extension Stage 1 (products[] embedded in
PlantMother — see
Docs/2-Working-Progress/plant-library-product-extension-design.md):
    17. add_product succeeds and persists, defaulting unit to kg
    18. add_product rejects a case-insensitive duplicate name (409)
    19. add_product 404s for an unknown mother
    20. PlantProductCreate rejects an unknown category (422 / ValidationError)
    21. list_products returns all products by default
    22. list_products(active_only=True) filters out deactivated products
    23. list_products 404s for an unknown mother
    24. update_product changes name/category/isActive
    25. update_product rejects renaming onto a sibling's name, case-insensitive (409)
    26. update_product 404s for an unknown product / unknown mother
    27. deactivate_product sets isActive=False without removing the entry
    28. deactivate_product is idempotent
    29. deactivate_product 404s for an unknown product

"At least one active sellable product" invariant (new platform invariant —
every mother must always keep >=1 active sellable product, so its harvest
can be recorded):
    30. create_mother with no products auto-seeds a default sellable product
        named after plantName, with the deterministic uuid5 id
    31. create_mother with only waste/process products supplied still
        auto-seeds a sellable (on top of the supplied ones)
    32. create_mother with a sellable product already supplied does NOT
        auto-seed an extra one
    33. deactivate_product (DELETE) on the last active sellable product 409s
    34. update_product changing category away from sellable on the last
        active sellable product 409s
    35. update_product(isActive=False) on the last active sellable product
        409s (same guard as the DELETE route, both funnel through
        update_product)
    36. deactivating a non-last active sellable product succeeds
    37. deactivating a waste/process product always succeeds regardless of
        sellable state
    38. renaming the last active sellable product succeeds (renaming never
        trips the invariant)
"""

from __future__ import annotations

import re
from datetime import datetime
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4, uuid5, NAMESPACE_OID

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from src.modules.farm_manager.models.block import Block, BlockStatus
from src.modules.farm_manager.models.plant_data_enhanced import (
    PlantDataEnhancedUpdate,
)
from src.modules.farm_manager.models.plant_mother import (
    PlantMother,
    PlantMotherCreate,
    PlantMotherUpdate,
    VarietyCreateForMother,
    PlantProductCreate,
    PlantProductUpdate,
    ProductCategory,
    ProductUnit,
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


# ---------------------------------------------------------------------------
# Plant Library product extension Stage 1 — products[] CRUD
# ---------------------------------------------------------------------------


async def _make_mother(fake_db: _FakeDB, plant_name: str = "Capsicum") -> PlantMother:
    """
    Deliberately bypasses `PlantMotherService.create_mother` and its
    "at least one active sellable product" auto-seeding (see
    `TestActiveSellableInvariant` below for tests of that behavior) by
    writing straight through the repository — a dumb writer with no
    invariant enforcement, same path the CSV importer uses to find-or-create
    a mother (plant_data_enhanced_service.py). This keeps every existing
    Stage-1 product-CRUD test below starting from a clean `products == []`
    mother, so their counts/indices stay about only the product(s) each
    test itself adds.
    """
    return await PlantMotherRepository.create(
        PlantMotherCreate(plantName=plant_name),
        created_by=uuid4(),
        created_by_email="a@example.com",
    )


class TestAddProduct:
    @pytest.mark.asyncio
    async def test_add_product_success_defaults_unit_kg(self, fake_db: _FakeDB):
        mother = await _make_mother(fake_db)

        product = await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Green Capsicum", category=ProductCategory.SELLABLE),
        )

        assert product.name == "Green Capsicum"
        assert product.category == ProductCategory.SELLABLE
        assert product.unit == ProductUnit.KG
        assert product.isActive is True

        stored = await PlantMotherRepository.get_by_id(mother.plantMotherId)
        assert len(stored.products) == 1
        assert stored.products[0].productId == product.productId

    @pytest.mark.asyncio
    async def test_add_product_duplicate_name_case_insensitive_rejected(
        self, fake_db: _FakeDB
    ):
        mother = await _make_mother(fake_db)
        await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Green Capsicum", category=ProductCategory.SELLABLE),
        )

        with pytest.raises(HTTPException) as exc:
            await PlantMotherService.add_product(
                mother.plantMotherId,
                PlantProductCreate(
                    name="green capsicum", category=ProductCategory.SELLABLE
                ),
            )
        assert exc.value.status_code == 409

        stored = await PlantMotherRepository.get_by_id(mother.plantMotherId)
        assert len(stored.products) == 1

    @pytest.mark.asyncio
    async def test_add_product_unknown_mother_404s(self, fake_db: _FakeDB):
        with pytest.raises(HTTPException) as exc:
            await PlantMotherService.add_product(
                uuid4(),
                PlantProductCreate(name="Waste Trim", category=ProductCategory.WASTE),
            )
        assert exc.value.status_code == 404

    def test_unknown_category_rejected_by_enum(self):
        with pytest.raises(ValidationError):
            PlantProductCreate(name="Mystery", category="not-a-real-category")

    def test_unknown_unit_rejected_by_enum(self):
        with pytest.raises(ValidationError):
            PlantProductCreate(
                name="Mystery", category=ProductCategory.SELLABLE, unit="litre"
            )


class TestListProducts:
    @pytest.mark.asyncio
    async def test_lists_all_products_by_default(self, fake_db: _FakeDB):
        mother = await _make_mother(fake_db)
        await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Green Capsicum", category=ProductCategory.SELLABLE),
        )
        added_waste = await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Capsicum Trim", category=ProductCategory.WASTE),
        )
        await PlantMotherService.deactivate_product(
            mother.plantMotherId, added_waste.productId
        )

        products = await PlantMotherService.list_products(mother.plantMotherId)
        assert len(products) == 2

    @pytest.mark.asyncio
    async def test_active_only_filters_deactivated(self, fake_db: _FakeDB):
        mother = await _make_mother(fake_db)
        await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Green Capsicum", category=ProductCategory.SELLABLE),
        )
        inactive = await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Capsicum Trim", category=ProductCategory.WASTE),
        )
        await PlantMotherService.deactivate_product(
            mother.plantMotherId, inactive.productId
        )

        products = await PlantMotherService.list_products(
            mother.plantMotherId, active_only=True
        )
        assert len(products) == 1
        assert products[0].name == "Green Capsicum"

    @pytest.mark.asyncio
    async def test_unknown_mother_404s(self, fake_db: _FakeDB):
        with pytest.raises(HTTPException) as exc:
            await PlantMotherService.list_products(uuid4())
        assert exc.value.status_code == 404


class TestUpdateProduct:
    @pytest.mark.asyncio
    async def test_updates_name_category_and_isActive(self, fake_db: _FakeDB):
        mother = await _make_mother(fake_db)
        # A second active sellable product so recategorising/deactivating
        # "Green Capsicum" below doesn't trip the "at least one active
        # sellable product" invariant — that guard has its own dedicated
        # tests in TestActiveSellableInvariantGuard; this test is about the
        # general field-update mechanics.
        await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Red Capsicum", category=ProductCategory.SELLABLE),
        )
        product = await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Green Capsicum", category=ProductCategory.SELLABLE),
        )

        updated = await PlantMotherService.update_product(
            mother.plantMotherId,
            product.productId,
            PlantProductUpdate(
                name="Green Bell Pepper",
                category=ProductCategory.PROCESS,
                isActive=False,
            ),
        )

        assert updated.name == "Green Bell Pepper"
        assert updated.category == ProductCategory.PROCESS
        assert updated.isActive is False
        # Identity is stable across an update.
        assert updated.productId == product.productId

        stored = await PlantMotherRepository.get_by_id(mother.plantMotherId)
        by_id = {p.productId: p for p in stored.products}
        assert by_id[product.productId].name == "Green Bell Pepper"

    @pytest.mark.asyncio
    async def test_rename_onto_sibling_name_case_insensitive_rejected(
        self, fake_db: _FakeDB
    ):
        mother = await _make_mother(fake_db)
        await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Green Capsicum", category=ProductCategory.SELLABLE),
        )
        red = await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Red Capsicum", category=ProductCategory.SELLABLE),
        )

        with pytest.raises(HTTPException) as exc:
            await PlantMotherService.update_product(
                mother.plantMotherId,
                red.productId,
                PlantProductUpdate(name="green capsicum"),
            )
        assert exc.value.status_code == 409

        # Unchanged.
        stored = await PlantMotherRepository.get_by_id(mother.plantMotherId)
        by_id = {p.productId: p for p in stored.products}
        assert by_id[red.productId].name == "Red Capsicum"

    @pytest.mark.asyncio
    async def test_renaming_to_own_current_name_is_not_a_clash(self, fake_db: _FakeDB):
        mother = await _make_mother(fake_db)
        # Second active sellable so recategorising "Green Capsicum" away
        # from sellable below doesn't trip the invariant guard (see the
        # comment in test_updates_name_category_and_isActive above).
        await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Red Capsicum", category=ProductCategory.SELLABLE),
        )
        product = await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Green Capsicum", category=ProductCategory.SELLABLE),
        )

        updated = await PlantMotherService.update_product(
            mother.plantMotherId,
            product.productId,
            PlantProductUpdate(name="Green Capsicum", category=ProductCategory.PROCESS),
        )
        assert updated.name == "Green Capsicum"
        assert updated.category == ProductCategory.PROCESS

    @pytest.mark.asyncio
    async def test_unknown_product_404s(self, fake_db: _FakeDB):
        mother = await _make_mother(fake_db)
        with pytest.raises(HTTPException) as exc:
            await PlantMotherService.update_product(
                mother.plantMotherId, uuid4(), PlantProductUpdate(name="Ghost")
            )
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_unknown_mother_404s(self, fake_db: _FakeDB):
        with pytest.raises(HTTPException) as exc:
            await PlantMotherService.update_product(
                uuid4(), uuid4(), PlantProductUpdate(name="Ghost")
            )
        assert exc.value.status_code == 404


class TestDeactivateProduct:
    @pytest.mark.asyncio
    async def test_deactivate_sets_inactive_without_removing(self, fake_db: _FakeDB):
        mother = await _make_mother(fake_db)
        # Second active sellable so deactivating "Green Capsicum" below
        # doesn't trip the "at least one active sellable product" invariant
        # (dedicated tests for that guard live in
        # TestActiveSellableInvariantGuard) — this test is about
        # deactivate-not-remove mechanics.
        await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Red Capsicum", category=ProductCategory.SELLABLE),
        )
        product = await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Green Capsicum", category=ProductCategory.SELLABLE),
        )

        result = await PlantMotherService.deactivate_product(
            mother.plantMotherId, product.productId
        )
        assert result.isActive is False

        stored = await PlantMotherRepository.get_by_id(mother.plantMotherId)
        assert len(stored.products) == 2
        by_id = {p.productId: p for p in stored.products}
        assert by_id[product.productId].isActive is False

    @pytest.mark.asyncio
    async def test_deactivate_is_idempotent(self, fake_db: _FakeDB):
        mother = await _make_mother(fake_db)
        # Second active sellable — same reasoning as the test above.
        await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Red Capsicum", category=ProductCategory.SELLABLE),
        )
        product = await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Green Capsicum", category=ProductCategory.SELLABLE),
        )

        await PlantMotherService.deactivate_product(
            mother.plantMotherId, product.productId
        )
        result = await PlantMotherService.deactivate_product(
            mother.plantMotherId, product.productId
        )
        assert result.isActive is False

    @pytest.mark.asyncio
    async def test_unknown_product_404s(self, fake_db: _FakeDB):
        mother = await _make_mother(fake_db)
        with pytest.raises(HTTPException) as exc:
            await PlantMotherService.deactivate_product(mother.plantMotherId, uuid4())
        assert exc.value.status_code == 404

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


# ---------------------------------------------------------------------------
# "At least one active sellable product" invariant
# ---------------------------------------------------------------------------
#
# Unlike the Stage-1 CRUD tests above (which use `_make_mother` to bypass
# this on purpose), these tests go through the real
# `PlantMotherService.create_mother` so the auto-seed/guard behavior is
# actually exercised.


class TestCreateAutoSeedsDefaultSellable:
    @pytest.mark.asyncio
    async def test_no_products_supplied_auto_seeds_sellable(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Okra"), uuid4(), "a@example.com"
        )

        assert len(mother.products) == 1
        product = mother.products[0]
        assert product.name == "Okra"
        assert product.category == ProductCategory.SELLABLE
        assert product.unit == ProductUnit.KG
        assert product.isActive is True
        # Deterministic id — same scheme as the seeding migration's
        # product_id_for_mother, so either write path yields the same id.
        assert product.productId == uuid5(NAMESPACE_OID, str(mother.plantMotherId))

        stored = await PlantMotherRepository.get_by_id(mother.plantMotherId)
        assert len(stored.products) == 1
        assert stored.products[0].productId == product.productId

    @pytest.mark.asyncio
    async def test_only_waste_and_process_supplied_still_auto_seeds_sellable(
        self, fake_db: _FakeDB
    ):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(
                plantName="Okra",
                products=[
                    PlantProductCreate(name="Okra Trim", category=ProductCategory.WASTE),
                    PlantProductCreate(
                        name="Okra Puree", category=ProductCategory.PROCESS
                    ),
                ],
            ),
            uuid4(),
            "a@example.com",
        )

        assert len(mother.products) == 3
        by_category = {p.category: p for p in mother.products if p.category == ProductCategory.SELLABLE}
        assert len(by_category) == 1
        sellable = by_category[ProductCategory.SELLABLE]
        assert sellable.name == "Okra"
        assert sellable.isActive is True
        assert sellable.productId == uuid5(NAMESPACE_OID, str(mother.plantMotherId))

        names = {p.name for p in mother.products}
        assert names == {"Okra", "Okra Trim", "Okra Puree"}

    @pytest.mark.asyncio
    async def test_sellable_already_supplied_does_not_auto_seed(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(
                plantName="Okra",
                products=[
                    PlantProductCreate(name="Fresh Okra", category=ProductCategory.SELLABLE)
                ],
            ),
            uuid4(),
            "a@example.com",
        )

        assert len(mother.products) == 1
        assert mother.products[0].name == "Fresh Okra"


class TestActiveSellableInvariantGuard:
    @pytest.mark.asyncio
    async def test_deactivate_last_sellable_via_delete_route_409s(
        self, fake_db: _FakeDB
    ):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Okra"), uuid4(), "a@example.com"
        )
        last_sellable = mother.products[0]

        with pytest.raises(HTTPException) as exc:
            await PlantMotherService.deactivate_product(
                mother.plantMotherId, last_sellable.productId
            )
        assert exc.value.status_code == 409
        assert "active sellable" in exc.value.detail

        stored = await PlantMotherRepository.get_by_id(mother.plantMotherId)
        assert stored.products[0].isActive is True

    @pytest.mark.asyncio
    async def test_recategorising_last_sellable_away_from_sellable_409s(
        self, fake_db: _FakeDB
    ):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Okra"), uuid4(), "a@example.com"
        )
        last_sellable = mother.products[0]

        with pytest.raises(HTTPException) as exc:
            await PlantMotherService.update_product(
                mother.plantMotherId,
                last_sellable.productId,
                PlantProductUpdate(category=ProductCategory.PROCESS),
            )
        assert exc.value.status_code == 409
        assert "active sellable" in exc.value.detail

        stored = await PlantMotherRepository.get_by_id(mother.plantMotherId)
        assert stored.products[0].category == ProductCategory.SELLABLE

    @pytest.mark.asyncio
    async def test_patch_isactive_false_on_last_sellable_409s(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Okra"), uuid4(), "a@example.com"
        )
        last_sellable = mother.products[0]

        with pytest.raises(HTTPException) as exc:
            await PlantMotherService.update_product(
                mother.plantMotherId,
                last_sellable.productId,
                PlantProductUpdate(isActive=False),
            )
        assert exc.value.status_code == 409
        assert "active sellable" in exc.value.detail

    @pytest.mark.asyncio
    async def test_deactivating_a_non_last_sellable_succeeds(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Okra"), uuid4(), "a@example.com"
        )
        second_sellable = await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Baby Okra", category=ProductCategory.SELLABLE),
        )

        result = await PlantMotherService.deactivate_product(
            mother.plantMotherId, second_sellable.productId
        )
        assert result.isActive is False

        stored = await PlantMotherRepository.get_by_id(mother.plantMotherId)
        by_id = {p.productId: p for p in stored.products}
        assert by_id[mother.products[0].productId].isActive is True
        assert by_id[second_sellable.productId].isActive is False

    @pytest.mark.asyncio
    async def test_deactivating_waste_or_process_always_succeeds(
        self, fake_db: _FakeDB
    ):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Okra"), uuid4(), "a@example.com"
        )
        waste = await PlantMotherService.add_product(
            mother.plantMotherId,
            PlantProductCreate(name="Okra Trim", category=ProductCategory.WASTE),
        )

        # Only sellable is the auto-seeded default, yet deactivating a
        # waste/process product is never blocked by this invariant.
        result = await PlantMotherService.deactivate_product(
            mother.plantMotherId, waste.productId
        )
        assert result.isActive is False

    @pytest.mark.asyncio
    async def test_renaming_last_sellable_succeeds(self, fake_db: _FakeDB):
        mother = await PlantMotherService.create_mother(
            PlantMotherCreate(plantName="Okra"), uuid4(), "a@example.com"
        )
        last_sellable = mother.products[0]

        updated = await PlantMotherService.update_product(
            mother.plantMotherId,
            last_sellable.productId,
            PlantProductUpdate(name="Fresh Okra"),
        )
        assert updated.name == "Fresh Okra"
        assert updated.category == ProductCategory.SELLABLE
        assert updated.isActive is True
