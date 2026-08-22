"""
Unit tests for the Plant Library product extension Stage 3 multi-line
harvest submission — HarvestService.submit_harvest_batch (see
src/modules/farm_manager/services/block/harvest_service.py) and its routing
per Docs/2-Working-Progress/plant-library-product-extension-design.md §3/§5.

No live database — a small hand-rolled fake standing in for a Motor
database/collection, following this codebase's existing convention for
DB-free unit tests (see tests/unit/test_farm_manager/test_plant_mother_api.py
and tests/unit/test_genetics/test_line_purge.py) since mongomock is not in
requirements.txt. Extends that convention with:

- dotted-path $set/$inc support in _apply (BlockRepository.increment_kpi
  writes "kpi.actualYieldKg"/"kpi.totalHarvests" via $inc), and
- a minimal .aggregate() supporting exactly the $match + $group shape
  HarvestRepository.get_total_quantity_for_block uses, so the "legacy null
  rows still sum unchanged" test exercises the real aggregation pipeline
  rather than asserting on stored-document shape alone.

Test cases:
    Routing (design doc §3 / §3.1 — the single most important invariant:
    process/waste lines must NEVER become block_harvests rows):
    1.  A mixed 3-line submission (sellable + process + waste) routes each
        line to its correct destination collection, all three lines share
        exactly one server-generated harvestBatchId, and — critically —
        exactly ONE block_harvests row exists afterward (the sellable
        line), never three.
    2.  The sellable line's block_harvests row carries productId/
        productName/harvestBatchId; the process line's processing_inventory
        row and waste line's inventory_waste row carry the same
        productId/harvestBatchId.

    Grade validation (required for sellable/process, rejected for waste):
    3.  A sellable line with no qualityGrade is rejected (400).
    4.  A process line with no qualityGrade is rejected (400).
    5.  A waste line that supplies a qualityGrade is rejected (400) — the
        chosen behavior (reject, not silently ignore) per the design doc's
        "pick one, document which, and be consistent" instruction.
    6.  A waste line with no qualityGrade succeeds (covered by test 1, the
        mixed-batch happy path, whose waste line omits qualityGrade).

    Product/mother resolution:
    7.  A line referencing a productId that does not belong to the block's
        mother is rejected (400).
    8.  A line referencing an inactive product is rejected (400).

    Yield regression:
    9.  A legacy block_harvests row with no productId (simulating one of
        the 13,947 pre-existing rows) still sums into
        HarvestRepository.get_total_quantity_for_block alongside a new
        productId-carrying row from submit_harvest_batch — same field, same
        aggregation, unchanged behavior.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from src.modules.farm_manager.models.block import Block
from src.modules.farm_manager.models.block_harvest import (
    BlockHarvestCreate,
    HarvestBatchLineCreate,
    HarvestBatchSubmitRequest,
    QualityGrade,
)
from src.modules.farm_manager.models.plant_mother import (
    PlantProduct,
    PlantMotherCreate,
    ProductCategory,
    ProductUnit,
)
from src.modules.farm_manager.services.database import farm_db
from src.modules.farm_manager.services.block.harvest_repository import (
    HarvestRepository,
)
from src.modules.farm_manager.services.block.harvest_service import HarvestService
from src.modules.farm_manager.services.plant_data.plant_mother_repository import (
    PlantMotherRepository,
)

# ---------------------------------------------------------------------------
# Generic Motor-collection-shaped fake (extends the test_plant_mother_api.py
# convention with dotted-path $set/$inc and a minimal .aggregate()).
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
            if "$gte" in expected and (actual is None or actual < expected["$gte"]):
                return False
            if "$lte" in expected and (actual is None or actual > expected["$lte"]):
                return False
        else:
            if actual != expected:
                return False
    return True


def _get_dotted(doc: Dict[str, Any], dotted_key: str) -> Any:
    cur: Any = doc
    for part in dotted_key.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _set_dotted(doc: Dict[str, Any], dotted_key: str, value: Any) -> None:
    parts = dotted_key.split(".")
    cur = doc
    for part in parts[:-1]:
        cur = cur.setdefault(part, {})
    cur[parts[-1]] = value


def _inc_dotted(doc: Dict[str, Any], dotted_key: str, amount: Any) -> None:
    parts = dotted_key.split(".")
    cur = doc
    for part in parts[:-1]:
        cur = cur.setdefault(part, {})
    cur[parts[-1]] = cur.get(parts[-1], 0) + amount


def _resolve_group_id(doc: Dict[str, Any], id_expr: Any) -> Any:
    if isinstance(id_expr, str) and id_expr.startswith("$"):
        return _get_dotted(doc, id_expr[1:])
    return id_expr


def _resolve_accumulator_value(doc: Dict[str, Any], expr: Any) -> Any:
    """Resolves a `$sum`/`$min`/`$max` operand — a field ref ("$x") or a literal."""
    if isinstance(expr, str) and expr.startswith("$"):
        return _get_dotted(doc, expr[1:])
    return expr


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

    def aggregate(self, pipeline: List[Dict[str, Any]]) -> _FakeCursor:
        """
        Minimal aggregation: supports exactly the $match + $group shape
        HarvestRepository.get_total_quantity_for_block/get_block_summary
        use — $group accumulators limited to $sum/$min/$max of a field ref
        or literal. Sufficient for the yield-regression test; anything
        fancier (e.g. $cond inside $sum) is out of scope here.
        """
        docs = [dict(d) for d in self.docs]
        for stage in pipeline:
            if "$match" in stage:
                docs = [d for d in docs if _matches(d, stage["$match"])]
            elif "$group" in stage:
                group_spec = stage["$group"]
                groups: Dict[Any, List[Dict[str, Any]]] = {}
                for d in docs:
                    key = _resolve_group_id(d, group_spec["_id"])
                    groups.setdefault(key, []).append(d)

                new_docs = []
                for key, items in groups.items():
                    result: Dict[str, Any] = {"_id": key}
                    for out_field, accumulator in group_spec.items():
                        if out_field == "_id":
                            continue
                        ((op, operand),) = accumulator.items()
                        values = [_resolve_accumulator_value(d, operand) for d in items]
                        if op == "$sum":
                            result[out_field] = sum(
                                v if isinstance(v, (int, float)) else 0
                                for v in (values if operand != 1 else [1] * len(items))
                            )
                        elif op == "$min":
                            values = [v for v in values if v is not None]
                            result[out_field] = min(values) if values else None
                        elif op == "$max":
                            values = [v for v in values if v is not None]
                            result[out_field] = max(values) if values else None
                        else:
                            raise NotImplementedError(f"Unsupported accumulator: {op}")
                    new_docs.append(result)
                docs = new_docs
            else:
                raise NotImplementedError(f"Unsupported aggregation stage: {stage}")
        return _FakeCursor(docs)

    @staticmethod
    def _apply(doc: Dict[str, Any], update: Dict[str, Any]) -> None:
        if "$set" in update:
            for k, v in update["$set"].items():
                _set_dotted(doc, k, v)
        if "$inc" in update:
            for k, v in update["$inc"].items():
                _inc_dotted(doc, k, v)
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
# Fixture data — a mother with one product per category, and a block
# planted with it.
# ---------------------------------------------------------------------------


class _Fixture:
    def __init__(self) -> None:
        self.org_id = str(uuid4())
        self.farm_id = uuid4()
        self.block_id = uuid4()
        self.user_id = uuid4()
        self.sellable_product = PlantProduct(
            name="Green Capsicum",
            unit=ProductUnit.KG,
            category=ProductCategory.SELLABLE,
        )
        self.process_product = PlantProduct(
            name="Capsicum Puree", unit=ProductUnit.KG, category=ProductCategory.PROCESS
        )
        self.waste_product = PlantProduct(
            name="Capsicum Trim", unit=ProductUnit.KG, category=ProductCategory.WASTE
        )
        self.inactive_product = PlantProduct(
            name="Discontinued Capsicum",
            unit=ProductUnit.KG,
            category=ProductCategory.SELLABLE,
            isActive=False,
        )


async def _seed_mother_and_block(fixture: _Fixture):
    mother = await PlantMotherRepository.create(
        PlantMotherCreate(plantName="Capsicum"),
        created_by=fixture.user_id,
        created_by_email="agronomist@example.com",
        organization_id=fixture.org_id,
        products=[
            fixture.sellable_product,
            fixture.process_product,
            fixture.waste_product,
            fixture.inactive_product,
        ],
    )

    block = Block(
        blockId=fixture.block_id,
        farmId=fixture.farm_id,
        blockCode="F001-001",
        organizationId=fixture.org_id,
        productMotherId=mother.plantMotherId,
        productName=mother.plantName,
        targetCropName="Capsicum - Green Variety",
    )
    block_doc = block.model_dump()
    block_doc["blockId"] = str(block_doc["blockId"])
    block_doc["farmId"] = str(block_doc["farmId"])
    block_doc["productMotherId"] = str(block_doc["productMotherId"])
    farm_db.get_database()["blocks"].docs.append(block_doc)

    return mother, block


def _mixed_request(fixture: _Fixture) -> HarvestBatchSubmitRequest:
    return HarvestBatchSubmitRequest(
        harvestDate=datetime(2026, 8, 19, 8, 0, tzinfo=timezone.utc),
        lines=[
            HarvestBatchLineCreate(
                productId=fixture.sellable_product.productId,
                quantity=40.0,
                qualityGrade=QualityGrade.A,
            ),
            HarvestBatchLineCreate(
                productId=fixture.process_product.productId,
                quantity=15.0,
                qualityGrade=QualityGrade.B,
            ),
            HarvestBatchLineCreate(
                productId=fixture.waste_product.productId,
                quantity=5.0,
            ),
        ],
    )


# ---------------------------------------------------------------------------
# Routing
# ---------------------------------------------------------------------------


class TestSubmitHarvestBatchRouting:
    @pytest.mark.asyncio
    async def test_mixed_batch_routes_each_line_and_shares_one_batch_id(
        self, fake_db: _FakeDB
    ):
        fixture = _Fixture()
        await _seed_mother_and_block(fixture)

        response = await HarvestService.submit_harvest_batch(
            fixture.farm_id,
            fixture.block_id,
            _mixed_request(fixture),
            fixture.user_id,
            "farmer@example.com",
        )

        # One harvestBatchId, server-generated (never echoing anything
        # client-supplied — there is no such field on the request).
        assert response.harvestBatchId is not None

        destinations = {line.productId: line.destination for line in response.lines}
        assert destinations[fixture.sellable_product.productId] == "block_harvests"
        assert destinations[fixture.process_product.productId] == "processing_inventory"
        assert destinations[fixture.waste_product.productId] == "inventory_waste"

        # THE invariant (design doc §3.1): process/waste must NEVER produce
        # a block_harvests row. Exactly one exists — the sellable line.
        harvest_docs = fake_db["block_harvests"].docs
        assert len(harvest_docs) == 1
        assert harvest_docs[0]["productId"] == str(fixture.sellable_product.productId)
        assert harvest_docs[0]["harvestBatchId"] == str(response.harvestBatchId)
        assert harvest_docs[0]["productName"] == "Green Capsicum"
        assert harvest_docs[0]["quantityKg"] == 40.0

        process_docs = fake_db["processing_inventory"].docs
        assert len(process_docs) == 1
        assert process_docs[0]["productId"] == str(fixture.process_product.productId)
        assert process_docs[0]["harvestBatchId"] == str(response.harvestBatchId)
        assert process_docs[0]["productName"] == "Capsicum Puree"
        assert process_docs[0]["quantity"] == 15.0
        assert process_docs[0]["qualityGrade"] == "B"

        waste_docs = fake_db["inventory_waste"].docs
        assert len(waste_docs) == 1
        assert waste_docs[0]["productId"] == str(fixture.waste_product.productId)
        assert waste_docs[0]["harvestBatchId"] == str(response.harvestBatchId)
        assert waste_docs[0]["plantName"] == "Capsicum Trim"
        assert waste_docs[0]["quantity"] == 5.0
        assert waste_docs[0]["originalGrade"] is None
        assert waste_docs[0]["sourceType"] == "harvest"
        assert waste_docs[0]["sourceBlockId"] == str(fixture.block_id)

        # Sellable routing also created the usual inventory_harvest FIFO
        # batch, exactly like the single-line endpoint already does —
        # nothing about that path changed.
        assert len(fake_db["inventory_harvest"].docs) == 1
        assert fake_db["inventory_harvest"].docs[0]["plantName"] == "Green Capsicum"

    @pytest.mark.asyncio
    async def test_sellable_line_without_grade_rejected(self, fake_db: _FakeDB):
        fixture = _Fixture()
        await _seed_mother_and_block(fixture)

        request = HarvestBatchSubmitRequest(
            harvestDate=datetime(2026, 8, 19, tzinfo=timezone.utc),
            lines=[
                HarvestBatchLineCreate(
                    productId=fixture.sellable_product.productId, quantity=10.0
                )
            ],
        )
        with pytest.raises(HTTPException) as exc:
            await HarvestService.submit_harvest_batch(
                fixture.farm_id, fixture.block_id, request, fixture.user_id, "a@x.com"
            )
        assert exc.value.status_code == 400
        assert len(fake_db["block_harvests"].docs) == 0

    @pytest.mark.asyncio
    async def test_process_line_without_grade_rejected(self, fake_db: _FakeDB):
        fixture = _Fixture()
        await _seed_mother_and_block(fixture)

        request = HarvestBatchSubmitRequest(
            harvestDate=datetime(2026, 8, 19, tzinfo=timezone.utc),
            lines=[
                HarvestBatchLineCreate(
                    productId=fixture.process_product.productId, quantity=10.0
                )
            ],
        )
        with pytest.raises(HTTPException) as exc:
            await HarvestService.submit_harvest_batch(
                fixture.farm_id, fixture.block_id, request, fixture.user_id, "a@x.com"
            )
        assert exc.value.status_code == 400
        assert len(fake_db["processing_inventory"].docs) == 0

    @pytest.mark.asyncio
    async def test_waste_line_with_grade_rejected(self, fake_db: _FakeDB):
        fixture = _Fixture()
        await _seed_mother_and_block(fixture)

        request = HarvestBatchSubmitRequest(
            harvestDate=datetime(2026, 8, 19, tzinfo=timezone.utc),
            lines=[
                HarvestBatchLineCreate(
                    productId=fixture.waste_product.productId,
                    quantity=10.0,
                    qualityGrade=QualityGrade.A,
                )
            ],
        )
        with pytest.raises(HTTPException) as exc:
            await HarvestService.submit_harvest_batch(
                fixture.farm_id, fixture.block_id, request, fixture.user_id, "a@x.com"
            )
        assert exc.value.status_code == 400
        assert len(fake_db["inventory_waste"].docs) == 0

    @pytest.mark.asyncio
    async def test_product_not_on_mother_rejected(self, fake_db: _FakeDB):
        fixture = _Fixture()
        await _seed_mother_and_block(fixture)

        foreign_product_id = uuid4()
        request = HarvestBatchSubmitRequest(
            harvestDate=datetime(2026, 8, 19, tzinfo=timezone.utc),
            lines=[
                HarvestBatchLineCreate(
                    productId=foreign_product_id,
                    quantity=10.0,
                    qualityGrade=QualityGrade.A,
                )
            ],
        )
        with pytest.raises(HTTPException) as exc:
            await HarvestService.submit_harvest_batch(
                fixture.farm_id, fixture.block_id, request, fixture.user_id, "a@x.com"
            )
        assert exc.value.status_code == 400
        assert "does not belong" in exc.value.detail

    @pytest.mark.asyncio
    async def test_inactive_product_rejected(self, fake_db: _FakeDB):
        fixture = _Fixture()
        await _seed_mother_and_block(fixture)

        request = HarvestBatchSubmitRequest(
            harvestDate=datetime(2026, 8, 19, tzinfo=timezone.utc),
            lines=[
                HarvestBatchLineCreate(
                    productId=fixture.inactive_product.productId,
                    quantity=10.0,
                    qualityGrade=QualityGrade.A,
                )
            ],
        )
        with pytest.raises(HTTPException) as exc:
            await HarvestService.submit_harvest_batch(
                fixture.farm_id, fixture.block_id, request, fixture.user_id, "a@x.com"
            )
        assert exc.value.status_code == 400
        assert "inactive" in exc.value.detail

    @pytest.mark.asyncio
    async def test_no_lines_partially_routed_when_one_line_invalid(
        self, fake_db: _FakeDB
    ):
        """A bad line rejects the WHOLE submission — no partial writes."""
        fixture = _Fixture()
        await _seed_mother_and_block(fixture)

        request = HarvestBatchSubmitRequest(
            harvestDate=datetime(2026, 8, 19, tzinfo=timezone.utc),
            lines=[
                HarvestBatchLineCreate(
                    productId=fixture.sellable_product.productId,
                    quantity=10.0,
                    qualityGrade=QualityGrade.A,
                ),
                HarvestBatchLineCreate(
                    productId=uuid4(),  # not on this mother
                    quantity=5.0,
                    qualityGrade=QualityGrade.A,
                ),
            ],
        )
        with pytest.raises(HTTPException):
            await HarvestService.submit_harvest_batch(
                fixture.farm_id, fixture.block_id, request, fixture.user_id, "a@x.com"
            )
        assert len(fake_db["block_harvests"].docs) == 0


# ---------------------------------------------------------------------------
# Yield regression
# ---------------------------------------------------------------------------


class TestLegacyYieldUnaffected:
    @pytest.mark.asyncio
    async def test_legacy_null_product_rows_still_sum_into_yield(
        self, fake_db: _FakeDB
    ):
        fixture = _Fixture()
        await _seed_mother_and_block(fixture)

        # A pre-existing legacy row: no productId/productName/harvestBatchId
        # at all (mirrors the 13,947 real rows that predate this field).
        fake_db["block_harvests"].docs.append(
            {
                "harvestId": str(uuid4()),
                "blockId": str(fixture.block_id),
                "farmId": str(fixture.farm_id),
                "harvestDate": datetime(2026, 1, 1, tzinfo=timezone.utc),
                "quantityKg": 10.0,
                "qualityGrade": "A",
                "recordedBy": str(fixture.user_id),
                "recordedByEmail": "legacy@example.com",
            }
        )

        request = HarvestBatchSubmitRequest(
            harvestDate=datetime(2026, 8, 19, tzinfo=timezone.utc),
            lines=[
                HarvestBatchLineCreate(
                    productId=fixture.sellable_product.productId,
                    quantity=6.5,
                    qualityGrade=QualityGrade.B,
                )
            ],
        )
        await HarvestService.submit_harvest_batch(
            fixture.farm_id, fixture.block_id, request, fixture.user_id, "a@x.com"
        )

        # Two rows now exist (one null-product legacy row, one new
        # productId-carrying row) and BOTH sum via the SAME field/pipeline —
        # no category filter, no special-casing of either shape.
        assert len(fake_db["block_harvests"].docs) == 2
        total = await HarvestRepository.get_total_quantity_for_block(fixture.block_id)
        assert total == pytest.approx(16.5)


# ---------------------------------------------------------------------------
# Existing single-line endpoint must keep working unchanged
# ---------------------------------------------------------------------------


class TestSingleHarvestEndpointUnaffected:
    @pytest.mark.asyncio
    async def test_record_harvest_without_product_fields_still_works(
        self, fake_db: _FakeDB
    ):
        """
        The pre-existing single-harvest endpoint's request body
        (BlockHarvestCreate) has no product field and never will — calling
        HarvestService.record_harvest exactly as that endpoint always has
        (no product_id/product_name/harvest_batch_id kwargs) must keep
        producing a row with all three null, same as any legacy row.
        """
        fixture = _Fixture()
        _, block = await _seed_mother_and_block(fixture)

        harvest_data = BlockHarvestCreate(
            blockId=fixture.block_id,
            harvestDate=datetime(2026, 8, 19, tzinfo=timezone.utc),
            quantityKg=12.0,
            qualityGrade=QualityGrade.A,
        )
        harvest = await HarvestService.record_harvest(
            harvest_data, fixture.user_id, "farmer@example.com"
        )

        assert harvest.productId is None
        assert harvest.productName is None
        assert harvest.harvestBatchId is None
        assert harvest.quantityKg == 12.0

        # Bug fix (design doc §9 #1): inventory_harvest.plantName now falls
        # back to the block's PRODUCT name (mother), not the variety name,
        # even on this unchanged call path.
        assert fake_db["inventory_harvest"].docs[0]["plantName"] == "Capsicum"
