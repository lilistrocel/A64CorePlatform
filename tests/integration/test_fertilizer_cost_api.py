"""
Integration tests for the Fertilizer Cost Calculator API.

These tests use mocked MongoDB and auth to verify endpoint behaviour without
requiring a live database.  All collections are patched via unittest.mock.

Scenarios:
  1.  GET  /tools/chemicals — empty catalog
  2.  POST /tools/chemicals — create a chemical
  3.  POST /tools/chemicals — duplicate name returns 409
  4.  PATCH /tools/chemicals/{id} — update name
  5.  DELETE /tools/chemicals/{id} — archive when no dependents
  6.  DELETE /tools/chemicals/{id}?force=false with dependents → 409
  7.  POST /tools/chemicals/discover — returns newly discovered list
  8.  GET  /tools/fertilizer-cost/prices — empty when no chemicals
  9.  PATCH /tools/fertilizer-cost/prices/{id} — upsert override
  10. DELETE /tools/fertilizer-cost/prices/{id} — remove override
  11. POST /tools/fertilizer-cost/calculate — basic calculation
  12. POST /tools/fertilizer-cost/lists — create saved list
  13. GET  /tools/fertilizer-cost/lists — list saved lists
  14. DELETE /tools/fertilizer-cost/lists/{id} — delete list
  15. POST /tools/fertilizer-cost/calculate — archived chemical warning + null cost
  16. POST /tools/chemicals/discover — non-admin/non-agronomist user gets 403
  17. PATCH /tools/chemicals/{id} — unarchive via archivedAt=null

Run inside Docker:
    docker exec a64core-api-dev python -m pytest tests/integration/test_fertilizer_cost_api.py -v

Or from a local virtualenv with PYTHONPATH pointing to the repo root:
    python -m pytest tests/integration/test_fertilizer_cost_api.py -v
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# App fixture — build a minimal FastAPI app with only the tools routers
# ---------------------------------------------------------------------------

from src.api.v1.tools.chemicals import router as chemicals_router
from src.api.v1.tools.fertilizer_cost import router as fertilizer_router
from src.modules.farm_manager.middleware.auth import CurrentUser

_ORG_ID = uuid4()
_USER_ID = uuid4()
_CHEMICAL_ID = uuid4()
_LIST_ID = uuid4()


def _mock_current_user() -> CurrentUser:
    """Return a mock admin user with a known organisationId."""
    return CurrentUser(
        userId=str(_USER_ID),
        email="test@example.com",
        firstName="Test",
        lastName="User",
        role="admin",
        isActive=True,
        isEmailVerified=True,
        organizationId=str(_ORG_ID),
    )


def _build_app() -> FastAPI:
    """Build a minimal test app with tools routers and auth overrides."""
    from src.modules.farm_manager.middleware.auth import (
        get_current_active_user,
        require_permission,
    )

    app = FastAPI()
    app.include_router(chemicals_router, prefix="/tools")
    app.include_router(fertilizer_router, prefix="/tools")

    app.dependency_overrides[get_current_active_user] = _mock_current_user
    for perm in ("agronomist", "farm.manage", "farm.operate", "admin"):
        app.dependency_overrides[require_permission(perm)] = _mock_current_user

    return app


@pytest.fixture(scope="module")
def client():
    app = _build_app()
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Chemical document fixture
# ---------------------------------------------------------------------------

def _chem_doc(
    chemical_id: UUID = None,
    name: str = "Urea",
    archived: bool = False,
) -> Dict[str, Any]:
    return {
        "_id": "mongo_internal_id",
        "chemicalId": str(chemical_id or _CHEMICAL_ID),
        "name": name,
        "aliases": [],
        "category": "macro_npk",
        "defaultUnit": "kg",
        "notes": None,
        "archivedAt": datetime.utcnow().isoformat() if archived else None,
        "organizationId": str(_ORG_ID),
        "createdBy": str(_USER_ID),
        "createdAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
    }


# ---------------------------------------------------------------------------
# Mocked collection helper
# ---------------------------------------------------------------------------

def _mock_collection(
    find_one_result=None,
    find_results=None,
    insert_one_result=None,
    find_one_and_update_result=None,
    delete_one_result=None,
    update_one_result=None,
    insert_many_result=None,
    count_documents_result: int = 0,
):
    """Return a MagicMock that behaves like a Motor collection."""
    col = MagicMock()

    # find_one
    col.find_one = AsyncMock(return_value=find_one_result)

    # find (cursor)
    cursor = MagicMock()
    cursor.sort = MagicMock(return_value=cursor)
    cursor.to_list = AsyncMock(return_value=find_results or [])
    col.find = MagicMock(return_value=cursor)

    # insert_one
    ins_result = MagicMock()
    ins_result.inserted_id = "some_id"
    col.insert_one = AsyncMock(return_value=ins_result)

    # insert_many
    col.insert_many = AsyncMock(return_value=MagicMock())

    # find_one_and_update
    col.find_one_and_update = AsyncMock(return_value=find_one_and_update_result)

    # update_one
    col.update_one = AsyncMock(return_value=MagicMock(modified_count=1))

    # delete_one
    del_result = MagicMock()
    del_result.deleted_count = 1 if delete_one_result is None else delete_one_result
    col.delete_one = AsyncMock(return_value=del_result)

    # count_documents
    col.count_documents = AsyncMock(return_value=count_documents_result)

    return col


def _mock_db(
    chemicals=None,
    overrides=None,
    calc_lists=None,
    plant_data=None,
    inventory_input=None,
    users=None,
) -> MagicMock:
    """
    Build a mock Motor database with the collections we need.

    Both attribute access (db.collection_name) and dict-style access
    (db["collection_name"]) are wired to the same mock object so that
    repository code that uses either pattern gets the correct AsyncMock.
    """
    _chemicals = chemicals or _mock_collection()
    _overrides = overrides or _mock_collection()
    _calc_lists = calc_lists or _mock_collection()
    _plant_data = plant_data or _mock_collection()
    _inventory_input = inventory_input or _mock_collection()
    _users = users or _mock_collection()

    db = MagicMock()
    db.fertilizer_chemicals = _chemicals
    db.fertilizer_price_overrides = _overrides
    db.fertilizer_calculation_lists = _calc_lists
    db.plant_data_enhanced = _plant_data
    db.inventory_input = _inventory_input
    db.users = _users

    # Reason: repository code uses db[COLLECTION] syntax which hits __getitem__
    _col_map = {
        "fertilizer_chemicals": _chemicals,
        "fertilizer_price_overrides": _overrides,
        "fertilizer_calculation_lists": _calc_lists,
        "plant_data_enhanced": _plant_data,
        "inventory_input": _inventory_input,
        "users": _users,
    }
    db.__getitem__ = MagicMock(side_effect=lambda name: _col_map.get(name, _mock_collection()))

    return db


# ---------------------------------------------------------------------------
# Test 1: GET /tools/chemicals — empty catalog
# ---------------------------------------------------------------------------

def test_list_chemicals_empty(client):
    db = _mock_db(chemicals=_mock_collection(find_results=[]))
    with patch(
        "src.modules.farm_manager.services.tools.chemicals_repository.farm_db.get_database",
        return_value=db,
    ):
        resp = client.get("/tools/chemicals")
    assert resp.status_code == 200
    assert resp.json()["data"] == []


# ---------------------------------------------------------------------------
# Test 2: POST /tools/chemicals — create a chemical
# ---------------------------------------------------------------------------

def test_create_chemical(client):
    chem_doc = _chem_doc()
    db = _mock_db(chemicals=_mock_collection(
        find_one_result=None,       # no duplicate
        find_one_and_update_result=None,
    ))
    with patch(
        "src.modules.farm_manager.services.tools.chemicals_repository.farm_db.get_database",
        return_value=db,
    ):
        resp = client.post("/tools/chemicals", json={
            "name": "Urea",
            "aliases": [],
            "category": "macro_npk",
            "defaultUnit": "kg",
        })
    # Because insert_one returns successfully, should be 201
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["name"] == "Urea"
    assert data["defaultUnit"] == "kg"


# ---------------------------------------------------------------------------
# Test 3: POST /tools/chemicals — duplicate returns 409
# ---------------------------------------------------------------------------

def test_create_chemical_duplicate_returns_409(client):
    db = _mock_db(chemicals=_mock_collection(
        find_one_result=_chem_doc()  # simulate existing record
    ))
    with patch(
        "src.modules.farm_manager.services.tools.chemicals_repository.farm_db.get_database",
        return_value=db,
    ):
        resp = client.post("/tools/chemicals", json={
            "name": "Urea",
            "aliases": [],
            "category": "macro_npk",
            "defaultUnit": "kg",
        })
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Test 4: PATCH /tools/chemicals/{id} — update
# ---------------------------------------------------------------------------

def test_update_chemical(client):
    updated_doc = _chem_doc(name="Urea 46%")
    db = _mock_db(chemicals=_mock_collection(
        find_one_result=None,           # no name conflict
        find_one_and_update_result=updated_doc,
    ))
    with patch(
        "src.modules.farm_manager.services.tools.chemicals_repository.farm_db.get_database",
        return_value=db,
    ):
        resp = client.patch(
            f"/tools/chemicals/{_CHEMICAL_ID}",
            json={"name": "Urea 46%"},
        )
    assert resp.status_code == 200
    assert resp.json()["data"]["name"] == "Urea 46%"


# ---------------------------------------------------------------------------
# Test 5: DELETE /tools/chemicals/{id} — archive when no dependents
# ---------------------------------------------------------------------------

def test_archive_chemical_no_dependents(client):
    archived_doc = _chem_doc(archived=True)
    # No plants reference this chemical
    db = _mock_db(chemicals=_mock_collection(
        find_one_result=_chem_doc(),               # for get_by_id
        find_results=[],                           # check_dependents returns empty
        find_one_and_update_result=archived_doc,
    ))

    with patch(
        "src.modules.farm_manager.services.tools.chemicals_repository.farm_db.get_database",
        return_value=db,
    ):
        resp = client.delete(f"/tools/chemicals/{_CHEMICAL_ID}")
    assert resp.status_code == 200
    assert resp.json()["data"]["archivedAt"] is not None


# ---------------------------------------------------------------------------
# Test 6: DELETE with dependents and no force → 409
# ---------------------------------------------------------------------------

def test_archive_chemical_with_dependents_returns_409(client):
    """
    check_dependents:
    1. Calls get_by_id → db[CHEMICALS_COLLECTION].find_one → returns the chemical doc
    2. Calls db[PLANT_COLLECTION].find → returns a cursor with one plant doc
    → API should respond 409 with the dependent plant in the detail
    """
    plant_dep = {"plantDataId": str(uuid4()), "plantName": "Tomato"}

    # Chemicals collection — find_one returns the chemical for get_by_id
    chem_col = _mock_collection(find_one_result=_chem_doc())

    # Plant collection — find returns a cursor with one dependent plant
    dep_cursor = MagicMock()
    dep_cursor.to_list = AsyncMock(return_value=[
        {"plantDataId": plant_dep["plantDataId"], "plantName": plant_dep["plantName"]}
    ])
    plant_col = MagicMock()
    plant_col.find = MagicMock(return_value=dep_cursor)

    db = _mock_db(chemicals=chem_col, plant_data=plant_col)
    with patch(
        "src.modules.farm_manager.services.tools.chemicals_repository.farm_db.get_database",
        return_value=db,
    ):
        resp = client.delete(f"/tools/chemicals/{_CHEMICAL_ID}?force=false")
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert "dependents" in str(detail)


# ---------------------------------------------------------------------------
# Test 7: POST /tools/chemicals/discover
# ---------------------------------------------------------------------------

def test_discover_chemicals(client):
    # plant library has one plant with a fertigation schedule
    plant_doc = {
        "_id": "x",
        "plantName": "Tomato",
        "fertigationSchedule": {
            "cards": [{
                "dayStart": 0,
                "dayEnd": 60,
                "cardName": "Full Cycle",
                "growthStage": "general",
                "rules": [{
                    "type": "interval",
                    "name": "Base",
                    "frequencyDays": 7,
                    "activeDayStart": 0,
                    "activeDayEnd": 60,
                    "ingredients": [{"name": "NewChem", "dosagePerPoint": 5.0, "unit": "g", "category": "macro_npk"}],
                }],
            }],
        },
    }
    plant_cursor = MagicMock()
    plant_cursor.to_list = AsyncMock(return_value=[plant_doc])

    # existing chemicals — empty → NewChem will be discovered
    list_cursor = MagicMock()
    list_cursor.sort = MagicMock(return_value=list_cursor)
    list_cursor.to_list = AsyncMock(return_value=[])

    chem_col = MagicMock()
    chem_col.find = MagicMock(return_value=list_cursor)
    chem_col.find_one = AsyncMock(return_value=None)  # no duplicate check hit
    chem_col.insert_one = AsyncMock(return_value=MagicMock(inserted_id="abc"))

    plant_col = MagicMock()
    plant_col.find = MagicMock(return_value=plant_cursor)

    db = _mock_db(chemicals=chem_col, plant_data=plant_col)
    with patch(
        "src.modules.farm_manager.services.tools.chemicals_repository.farm_db.get_database",
        return_value=db,
    ), patch(
        "src.modules.farm_manager.services.tools.chemicals_service.farm_db.get_database",
        return_value=db,
    ):
        resp = client.post("/tools/chemicals/discover")
    assert resp.status_code == 200
    discovered = resp.json()["data"]
    assert any(c["name"] == "NewChem" for c in discovered)


# ---------------------------------------------------------------------------
# Test 8: GET /tools/fertilizer-cost/prices — empty
# ---------------------------------------------------------------------------

def test_get_prices_empty(client):
    chem_list_cursor = MagicMock()
    chem_list_cursor.sort = MagicMock(return_value=chem_list_cursor)
    chem_list_cursor.to_list = AsyncMock(return_value=[])
    chem_col = MagicMock()
    chem_col.find = MagicMock(return_value=chem_list_cursor)

    override_cursor = MagicMock()
    override_cursor.to_list = AsyncMock(return_value=[])
    override_col = MagicMock()
    override_col.find = MagicMock(return_value=override_cursor)

    db = _mock_db(chemicals=chem_col, overrides=override_col)
    with patch(
        "src.modules.farm_manager.services.tools.chemicals_repository.farm_db.get_database",
        return_value=db,
    ), patch(
        "src.modules.farm_manager.services.tools.price_book.farm_db.get_database",
        return_value=db,
    ):
        resp = client.get("/tools/fertilizer-cost/prices")
    assert resp.status_code == 200
    assert resp.json()["data"] == []


# ---------------------------------------------------------------------------
# Test 9: PATCH /tools/fertilizer-cost/prices/{id} — upsert
# ---------------------------------------------------------------------------

def test_upsert_price_override(client):
    override_doc = {
        "overrideId": str(uuid4()),
        "chemicalId": str(_CHEMICAL_ID),
        "price": 12.5,
        "organizationId": str(_ORG_ID),
        "updatedBy": str(_USER_ID),
        "updatedAt": datetime.utcnow().isoformat(),
    }
    chem_col = _mock_collection(find_one_result=_chem_doc())
    override_col = _mock_collection(find_one_and_update_result=override_doc)
    db = _mock_db(chemicals=chem_col, overrides=override_col)

    with patch(
        "src.modules.farm_manager.services.tools.chemicals_repository.farm_db.get_database",
        return_value=db,
    ), patch(
        "src.api.v1.tools.fertilizer_cost.farm_db.get_database",
        return_value=db,
    ):
        resp = client.patch(
            f"/tools/fertilizer-cost/prices/{_CHEMICAL_ID}",
            json={"price": 12.5},
        )
    assert resp.status_code == 200
    assert resp.json()["data"]["price"] == 12.5


# ---------------------------------------------------------------------------
# Test 10: DELETE /tools/fertilizer-cost/prices/{id}
# ---------------------------------------------------------------------------

def test_delete_price_override(client):
    del_result = MagicMock()
    del_result.deleted_count = 1
    override_col = MagicMock()
    override_col.delete_one = AsyncMock(return_value=del_result)
    db = _mock_db(overrides=override_col)

    with patch(
        "src.api.v1.tools.fertilizer_cost.farm_db.get_database",
        return_value=db,
    ):
        resp = client.delete(f"/tools/fertilizer-cost/prices/{_CHEMICAL_ID}")
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Test 11: POST /tools/fertilizer-cost/calculate — basic calculation
# ---------------------------------------------------------------------------

def test_calculate_basic(client):
    """A plant with an interval rule should produce a non-zero quantity."""
    plant_id = uuid4()
    plant_doc = {
        "_id": "x",
        "plantDataId": str(plant_id),
        "plantName": "Tomato",
        "growthCycle": {"totalCycleDays": 60},
        "fertigationSchedule": {
            "cards": [{
                "dayStart": 0,
                "dayEnd": 60,
                "cardName": "Full Cycle",
                "growthStage": "general",
                "isActive": True,
                "rules": [{
                    "type": "interval",
                    "name": "Base Feed",
                    "frequencyDays": 7,
                    "activeDayStart": 0,
                    "activeDayEnd": 60,
                    "ingredients": [{
                        "name": "Urea",
                        "dosagePerPoint": 5.0,
                        "unit": "g",
                        "category": "macro_npk",
                    }],
                }],
            }],
        },
    }

    plant_cursor = MagicMock()
    plant_cursor.to_list = AsyncMock(return_value=[plant_doc])
    plant_col = MagicMock()
    plant_col.find = MagicMock(return_value=plant_cursor)

    # Existing chemicals — Urea already catalogued
    urea_doc = _chem_doc(name="Urea")
    chem_list_cursor = MagicMock()
    chem_list_cursor.sort = MagicMock(return_value=chem_list_cursor)
    chem_list_cursor.to_list = AsyncMock(return_value=[urea_doc])
    chem_col = MagicMock()
    chem_col.find = MagicMock(return_value=chem_list_cursor)
    chem_col.find_one = AsyncMock(return_value=None)  # no conflicts

    # Prices — no override, no inventory
    override_cursor = MagicMock()
    override_cursor.to_list = AsyncMock(return_value=[])
    override_col = MagicMock()
    override_col.find = MagicMock(return_value=override_cursor)

    inv_col = _mock_collection(find_one_result=None)

    db = _mock_db(
        chemicals=chem_col,
        overrides=override_col,
        plant_data=plant_col,
        inventory_input=inv_col,
    )

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
        resp = client.post(
            "/tools/fertilizer-cost/calculate",
            json={"items": [{"plantDataId": str(plant_id), "points": 100}]},
        )

    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data["perCrop"]) == 1
    crop = data["perCrop"][0]
    assert crop["plantName"] == "Tomato"
    assert len(crop["ingredients"]) == 1
    ing = crop["ingredients"][0]
    assert ing["name"] == "Urea"
    # floor((60 - 0) / 7) + 1 = 8+1 = 9 applications, 5g * 9 * 100 points = 4500g = 4.5kg
    assert ing["unit"] == "kg"
    assert abs(ing["qty"] - 4.5) < 0.01


# ---------------------------------------------------------------------------
# Test 12 & 13: Saved lists CRUD
# ---------------------------------------------------------------------------

def test_create_and_list_saved_list(client):
    list_doc = {
        "listId": str(_LIST_ID),
        "name": "My Test List",
        "items": [],
        "organizationId": str(_ORG_ID),
        "createdBy": str(_USER_ID),
        "createdAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
    }
    list_cursor = MagicMock()
    list_cursor.sort = MagicMock(return_value=list_cursor)
    list_cursor.to_list = AsyncMock(return_value=[list_doc])
    lists_col = MagicMock()
    lists_col.find = MagicMock(return_value=list_cursor)
    lists_col.insert_one = AsyncMock(return_value=MagicMock(inserted_id="x"))

    db = _mock_db(calc_lists=lists_col)

    with patch(
        "src.modules.farm_manager.services.tools.calculation_lists_repository.farm_db.get_database",
        return_value=db,
    ):
        # Create
        resp_create = client.post("/tools/fertilizer-cost/lists", json={
            "name": "My Test List",
            "items": [],
        })
        assert resp_create.status_code == 201

        # List
        resp_list = client.get("/tools/fertilizer-cost/lists")
        assert resp_list.status_code == 200
        lists = resp_list.json()["data"]
        assert any(item["name"] == "My Test List" for item in lists)


# ---------------------------------------------------------------------------
# Test 14: DELETE /tools/fertilizer-cost/lists/{id}
# ---------------------------------------------------------------------------

def test_delete_saved_list(client):
    del_result = MagicMock()
    del_result.deleted_count = 1
    lists_col = MagicMock()
    lists_col.delete_one = AsyncMock(return_value=del_result)

    db = _mock_db(calc_lists=lists_col)

    with patch(
        "src.modules.farm_manager.services.tools.calculation_lists_repository.farm_db.get_database",
        return_value=db,
    ):
        resp = client.delete(f"/tools/fertilizer-cost/lists/{_LIST_ID}")
    assert resp.status_code == 200
    assert resp.json()["data"]["deleted"] is True


# ---------------------------------------------------------------------------
# Test 15: POST /tools/fertilizer-cost/calculate — archived chemical warning
# ---------------------------------------------------------------------------

def test_calculate_archived_chemical_warning(client):
    """
    When the requested crop references an archived chemical by name, the calculator
    should:
    - include the ingredient with qty > 0 but unitPrice/totalCost == None
    - emit an archived-match warning
    - NOT include the archived chemical in discoveredChemicals
    - return grandTotalCost == None
    """
    plant_id = uuid4()

    # Archived chemical doc
    archived_chem_doc = {
        **_chem_doc(name="ArchivedChem", archived=True),
        "chemicalId": str(uuid4()),
    }

    plant_doc = {
        "_id": "x",
        "plantDataId": str(plant_id),
        "plantName": "Lettuce",
        "growthCycle": {"totalCycleDays": 30},
        "fertigationSchedule": {
            "cards": [{
                "dayStart": 0,
                "dayEnd": 30,
                "cardName": "Full Cycle",
                "growthStage": "general",
                "isActive": True,
                "rules": [{
                    "type": "custom",
                    "applications": [
                        {"day": 5, "ingredients": [{
                            "name": "ArchivedChem",
                            "dosagePerPoint": 3.0,
                            "unit": "g",
                            "category": "macro_npk",
                        }]},
                    ],
                }],
            }],
        },
    }

    plant_cursor = MagicMock()
    plant_cursor.to_list = AsyncMock(return_value=[plant_doc])
    plant_col = MagicMock()
    plant_col.find = MagicMock(return_value=plant_cursor)

    # Chemicals catalog contains only the archived doc
    chem_list_cursor = MagicMock()
    chem_list_cursor.sort = MagicMock(return_value=chem_list_cursor)
    chem_list_cursor.to_list = AsyncMock(return_value=[archived_chem_doc])
    chem_col = MagicMock()
    chem_col.find = MagicMock(return_value=chem_list_cursor)
    chem_col.find_one = AsyncMock(return_value=None)

    override_cursor = MagicMock()
    override_cursor.to_list = AsyncMock(return_value=[])
    override_col = MagicMock()
    override_col.find = MagicMock(return_value=override_cursor)

    inv_col = _mock_collection(find_one_result=None)

    db = _mock_db(
        chemicals=chem_col,
        overrides=override_col,
        plant_data=plant_col,
        inventory_input=inv_col,
    )

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
        resp = client.post(
            "/tools/fertilizer-cost/calculate",
            json={"items": [{"plantDataId": str(plant_id), "points": 10}]},
        )

    assert resp.status_code == 200
    data = resp.json()["data"]

    # Grand total must be None (incomplete costs)
    assert data["grandTotalCost"] is None

    # Archived warning must be emitted
    archived_warnings = [w for w in data["warnings"] if "archived" in w.lower()]
    assert archived_warnings, f"Expected archived warning, got: {data['warnings']}"

    # Ingredient should have qty > 0 but null costs
    assert len(data["perCrop"]) == 1
    crop = data["perCrop"][0]
    assert len(crop["ingredients"]) == 1
    ing = crop["ingredients"][0]
    assert ing["qty"] > 0
    assert ing["unitPrice"] is None
    assert ing["totalCost"] is None

    # No auto-discovered chemicals (archived not re-created)
    assert data["discoveredChemicals"] == []


# ---------------------------------------------------------------------------
# Test 16: POST /tools/chemicals/discover — non-admin/agronomist gets 403
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client_regular_user():
    """Build a test client authenticated as a regular 'user' role."""
    from src.modules.farm_manager.middleware.auth import (
        get_current_active_user,
        require_permission,
    )

    def _mock_regular_user():
        return CurrentUser(
            userId=str(uuid4()),
            email="user@example.com",
            firstName="Regular",
            lastName="User",
            role="user",  # not admin / moderator — should be denied discover
            isActive=True,
            isEmailVerified=True,
            organizationId=str(_ORG_ID),
        )

    app = FastAPI()
    app.include_router(chemicals_router, prefix="/tools")

    # Only override get_current_active_user; do NOT override require_permission
    # so the role check runs properly.
    app.dependency_overrides[get_current_active_user] = _mock_regular_user

    with TestClient(app) as c:
        yield c


def test_discover_requires_admin_or_agronomist_role(client_regular_user):
    """
    A user with role='user' (not admin/super_admin/moderator) must receive 403
    when calling POST /chemicals/discover.
    """
    resp = client_regular_user.post("/tools/chemicals/discover")
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Test 17: PATCH /tools/chemicals/{id} — unarchive via archivedAt=null
# ---------------------------------------------------------------------------

def test_unarchive_chemical_via_patch(client):
    """
    PATCH /{id} with archivedAt=null (explicitly provided) should call the
    repository update and return the unarchived chemical.
    """
    restored_doc = _chem_doc(archived=False)  # archivedAt == None
    db = _mock_db(chemicals=_mock_collection(
        find_one_result=None,                       # no name conflict
        find_one_and_update_result=restored_doc,
    ))
    with patch(
        "src.modules.farm_manager.services.tools.chemicals_repository.farm_db.get_database",
        return_value=db,
    ):
        resp = client.patch(
            f"/tools/chemicals/{_CHEMICAL_ID}",
            json={"archivedAt": None},
        )
    assert resp.status_code == 200
    assert resp.json()["data"]["archivedAt"] is None
