"""
Tests for Phase A.4 — purchase_item_finance_ext GL account mapping.

Covers:
    1. purchase_item_changed event with itemType=raw_material → ext row created
       with auto-assigned inventoryAccountId (account 121000-002 from seeded CoA).
    2. purchase_item_changed event with itemType=service → inventoryAccountId stays null.
    3. PATCH inventoryAccountId to a valid active leaf account → 200, persisted.
    4. PATCH inventoryAccountId to a title-level account → 422.
    5. PATCH inventoryAccountId to an account from a different org → 422.
    6. PATCH to clear (set to null) → 200, field is null.
"""

import os
import uuid
from datetime import datetime
from typing import Any, Dict

# Override DB and secrets BEFORE importing any finance module.
# conftest.py (loaded first) sets DATABASE_URL, SECRET_KEY, and
# FINANCE_INGESTION_SECRET to "test-ingest-secret" before any finance module
# is imported.  The setdefault calls below are no-ops when running as part of
# the full suite (conftest already set them), but they ensure this file also
# works correctly when run in isolation.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test_secret_key")
os.environ.setdefault("FINANCE_INGESTION_SECRET", "test-ingest-secret")

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from finance.db.session import engine, get_db
from finance.main import app
from finance.models.orm.models import (
    AccountLevelEnum,
    GLAccount,
    PurchaseItemFinanceExt,
)

from .conftest import auth_headers

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_INGEST_URL = "/api/v1/finance/events/ingest"
# Reason: must match the Settings singleton default (see comment at module top).
_VALID_SECRET = "test-ingest-secret"
# Reason: BaseFinanceEvent.organizationId is typed as UUID so the event payload
# must use a valid UUID string; non-UUID strings are rejected as 422 by FastAPI.
# The master-data endpoints accept arbitrary strings for organization_id (Query param),
# so _ORG_STR (non-UUID) is used for those; _ORG_UUID for event envelopes.
_ORG_UUID = "a1b2c3d4-0001-4001-8001-000000000001"
_ORG = _ORG_UUID   # alias used by master-data endpoints (accepts any string)
_COMPANY = "ITEM001"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _item_changed_event(
    org_id: str,
    item_id: str,
    item_code: str,
    item_name: str,
    item_type: str,
    event_id: str | None = None,
) -> Dict[str, Any]:
    """Build a purchase_item_changed event envelope."""
    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "purchase_item_changed",
        "organizationId": org_id,
        "companyCode": _COMPANY,
        "occurredAt": datetime.utcnow().isoformat(),
        "sourceUserId": str(uuid.uuid4()),
        "payload": {
            "itemId": item_id,
            "itemCode": item_code,
            "name": item_name,
            "itemType": item_type,
            "uom": "KG",
            "isActive": True,
            "isDeleted": False,
        },
    }


async def _seed_company(client: AsyncClient, org_id: str = _ORG) -> None:
    """Create a company (which seeds the default CoA for this org)."""
    resp = await client.post(
        "/api/v1/finance/companies",
        json={
            "companyCode": _COMPANY,
            "organizationId": org_id,
            "legalName": "Item Ext Test LLC",
        },
        headers=auth_headers(),
    )
    # 409 is acceptable — company already exists from a previous test in this session
    assert resp.status_code in (201, 409), resp.text


async def _get_active_account_id(
    db_session: AsyncSession, org_id: str
) -> str:
    """
    Return a single active leaf-level GL account ID for the org.

    Args:
        db_session: Test database session.
        org_id: Organisation to scope the lookup.

    Returns:
        accountId string.
    """
    result = await db_session.execute(
        select(GLAccount.accountId)
        .where(
            GLAccount.organizationId == org_id,
            GLAccount.isActive == True,  # noqa: E712
            GLAccount.accountLevel == AccountLevelEnum.ACTIVE,
        )
        .limit(1)
    )
    account_id = result.scalar_one_or_none()
    assert account_id is not None, (
        "Expected at least one active leaf account — CoA seed must run first"
    )
    return account_id


async def _get_title_account_id(
    db_session: AsyncSession, org_id: str
) -> str | None:
    """Return a title-level account ID or None if none exists."""
    result = await db_session.execute(
        select(GLAccount.accountId)
        .where(
            GLAccount.organizationId == org_id,
            GLAccount.accountLevel == AccountLevelEnum.TITLE,
        )
        .limit(1)
    )
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Test 1: raw_material event → auto-assigned inventoryAccountId
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_raw_material_event_auto_assigns_inventory_account(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Sending a purchase_item_changed event with itemType=raw_material should
    create an ext row with inventoryAccountId set to the 121000-002 account
    (Raw Materials - Fertilisers) if it exists in the seeded CoA.
    """
    await _seed_company(client)
    item_id = str(uuid.uuid4())

    # Verify 121000-002 exists in the seeded CoA for this org
    acct_result = await db_session.execute(
        select(GLAccount).where(
            GLAccount.organizationId == _ORG,
            GLAccount.accountNumber == "121000-002",
        )
    )
    acct = acct_result.scalar_one_or_none()
    if acct is None:
        pytest.skip(
            "Account 121000-002 not present in seeded CoA for this test run"
        )

    event = _item_changed_event(
        org_id=_ORG,
        item_id=item_id,
        item_code="FERT-001",
        item_name="Nitrogen Fertiliser",
        item_type="raw_material",
    )
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "processed"

    # Verify ext row was created with inventoryAccountId = 121000-002's accountId
    row_result = await db_session.execute(
        select(PurchaseItemFinanceExt).where(
            PurchaseItemFinanceExt.organizationId == _ORG,
            PurchaseItemFinanceExt.itemId == item_id,
        )
    )
    row = row_result.scalar_one_or_none()
    assert row is not None, "Ext row must be created on purchase_item_changed"
    assert row.inventoryAccountId == acct.accountId, (
        f"Expected inventoryAccountId={acct.accountId} (121000-002), "
        f"got {row.inventoryAccountId}"
    )
    assert row.itemCode == "FERT-001"
    assert row.itemName == "Nitrogen Fertiliser"
    assert row.itemType is not None
    assert row.itemType.value == "raw_material"


# ---------------------------------------------------------------------------
# Test 2: service event → inventoryAccountId stays null
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_service_event_leaves_inventory_account_null(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Sending a purchase_item_changed event with itemType=service should create
    an ext row with inventoryAccountId=null (services don't go to inventory).
    """
    await _seed_company(client)
    item_id = str(uuid.uuid4())

    event = _item_changed_event(
        org_id=_ORG,
        item_id=item_id,
        item_code="SVC-001",
        item_name="Consulting Service",
        item_type="service",
    )
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "processed"

    row_result = await db_session.execute(
        select(PurchaseItemFinanceExt).where(
            PurchaseItemFinanceExt.organizationId == _ORG,
            PurchaseItemFinanceExt.itemId == item_id,
        )
    )
    row = row_result.scalar_one_or_none()
    assert row is not None, "Ext row must be created on purchase_item_changed"
    assert row.inventoryAccountId is None, (
        "inventoryAccountId must be null for service items"
    )
    assert row.itemType is not None
    assert row.itemType.value == "service"


# ---------------------------------------------------------------------------
# Test 3: PATCH inventoryAccountId to a valid active leaf account → 200
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_inventory_account_valid_active_leaf(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    PATCH /purchase-items/{item_id}?organization_id=... with a valid active leaf
    account ID should return 200 and persist the new accountId.
    """
    await _seed_company(client)
    item_id = str(uuid.uuid4())

    # Create the ext row via event first
    event = _item_changed_event(
        org_id=_ORG,
        item_id=item_id,
        item_code="CONS-001",
        item_name="Packaging Material",
        item_type="consumable",
    )
    ingest_resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert ingest_resp.status_code == 200, ingest_resp.text

    account_id = await _get_active_account_id(db_session, _ORG)

    resp = await client.patch(
        f"/api/v1/finance/master-data/purchase-items/{item_id}",
        params={"organization_id": _ORG},
        json={"inventoryAccountId": account_id},
        headers=auth_headers(),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["inventoryAccountId"] == account_id
    assert data["itemId"] == item_id


# ---------------------------------------------------------------------------
# Test 4: PATCH inventoryAccountId to a title account → 422
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_inventory_account_title_level_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    PATCH with a title-level account ID should return 422 — only active leaf
    accounts may be assigned for posting.
    """
    await _seed_company(client)
    title_id = await _get_title_account_id(db_session, _ORG)
    if title_id is None:
        pytest.skip("No title-level account in seeded CoA for this test run")

    item_id = str(uuid.uuid4())
    event = _item_changed_event(
        org_id=_ORG,
        item_id=item_id,
        item_code="RAW-TITLE-TEST",
        item_name="Title Test Item",
        item_type="raw_material",
    )
    await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )

    resp = await client.patch(
        f"/api/v1/finance/master-data/purchase-items/{item_id}",
        params={"organization_id": _ORG},
        json={"inventoryAccountId": title_id},
        headers=auth_headers(),
    )
    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    # Reason: detail must mention the problem (title/active) so callers can diagnose
    assert "title" in detail.lower() or "active" in detail.lower(), (
        f"Expected 'title' or 'active' in error detail, got: {detail}"
    )


# ---------------------------------------------------------------------------
# Test 5: PATCH inventoryAccountId to an account from a different org → 422
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_inventory_account_wrong_org_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    PATCH with an account that belongs to a different organisation should
    return 422 — accounts are org-scoped.
    """
    await _seed_company(client)

    # Create a second org with its own CoA
    other_org = "org-other-" + str(uuid.uuid4())[:8]
    other_company = "OTH001"
    other_resp = await client.post(
        "/api/v1/finance/companies",
        json={
            "companyCode": other_company,
            "organizationId": other_org,
            "legalName": "Other Org LLC",
        },
        headers=auth_headers(),
    )
    assert other_resp.status_code in (201, 409), other_resp.text

    # Get an active leaf account from the OTHER org
    other_account_id = await _get_active_account_id(db_session, other_org)

    item_id = str(uuid.uuid4())
    event = _item_changed_event(
        org_id=_ORG,
        item_id=item_id,
        item_code="CROSS-ORG-TEST",
        item_name="Cross Org Test Item",
        item_type="consumable",
    )
    await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )

    # Attempt PATCH with an account from the other org
    resp = await client.patch(
        f"/api/v1/finance/master-data/purchase-items/{item_id}",
        params={"organization_id": _ORG},
        json={"inventoryAccountId": other_account_id},
        headers=auth_headers(),
    )
    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert other_account_id in detail or "not found" in detail.lower(), (
        f"Expected account ID or 'not found' in error detail, got: {detail}"
    )


# ---------------------------------------------------------------------------
# Test 6: PATCH to clear (set to null) → 200, field is null
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_clear_inventory_account_to_null(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    PATCH with inventoryAccountId=null should clear the field → 200, null persisted.
    """
    await _seed_company(client)
    item_id = str(uuid.uuid4())

    # First set an account via event auto-assign (raw_material)
    event = _item_changed_event(
        org_id=_ORG,
        item_id=item_id,
        item_code="NULL-CLEAR-TEST",
        item_name="Clear Test Item",
        item_type="raw_material",
    )
    await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )

    # Now clear it via PATCH
    resp = await client.patch(
        f"/api/v1/finance/master-data/purchase-items/{item_id}",
        params={"organization_id": _ORG},
        json={"inventoryAccountId": None},
        headers=auth_headers(),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["inventoryAccountId"] is None, (
        "inventoryAccountId must be null after PATCH with null value"
    )
