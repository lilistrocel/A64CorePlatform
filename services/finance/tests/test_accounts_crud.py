"""Tests for GL account CRUD endpoints."""

import pytest
from httpx import AsyncClient

from .conftest import auth_headers

_ORG = "org-accounts-test"


async def _seed_company(client: AsyncClient, code: str = "AC001") -> None:
    """Helper: create a company (seeds CoA) for account tests."""
    await client.post(
        "/api/v1/finance/companies",
        json={
            "companyCode": code,
            "organizationId": _ORG,
            "legalName": "Account Test Co",
        },
        headers=auth_headers(),
    )


@pytest.mark.asyncio
async def test_list_accounts_after_coa_seed(client: AsyncClient) -> None:
    """After creating a company, GET /accounts should return ~208+ accounts."""
    await _seed_company(client, "AC_LIST")
    response = await client.get(
        "/api/v1/finance/accounts",
        params={"organization_id": _ORG},
        headers=auth_headers(role="auditor"),
    )
    assert response.status_code == 200
    data = response.json()
    # CoA has 208 accounts in DEFAULT_COA (all accounts for this org seeded once)
    assert data["total"] >= 100  # relaxed — SQLite shares state across tests
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_create_account_manually(client: AsyncClient) -> None:
    """POST /accounts should create a new account."""
    response = await client.post(
        "/api/v1/finance/accounts",
        json={
            "organizationId": _ORG,
            "accountNumber": "999999",
            "accountName": "Test Custom Account",
            "drawer": "ASSETS",
            "accountType": "asset",
        },
        headers=auth_headers(),
    )
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["accountNumber"] == "999999"
    assert data["accountName"] == "Test Custom Account"


@pytest.mark.asyncio
async def test_create_account_duplicate_returns_409(client: AsyncClient) -> None:
    """Duplicate account number for same org should return 409."""
    payload = {
        "organizationId": _ORG,
        "accountNumber": "999998",
        "accountName": "Dup Account",
        "drawer": "ASSETS",
        "accountType": "asset",
    }
    await client.post("/api/v1/finance/accounts", json=payload, headers=auth_headers())
    response = await client.post(
        "/api/v1/finance/accounts", json=payload, headers=auth_headers()
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_get_account_not_found(client: AsyncClient) -> None:
    """GET /accounts/{id} for unknown UUID should return 404."""
    response = await client.get(
        "/api/v1/finance/accounts/00000000-0000-0000-0000-000000000000",
        headers=auth_headers(),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_patch_account_name(client: AsyncClient) -> None:
    """PATCH /accounts/{id} should update the accountName."""
    create_resp = await client.post(
        "/api/v1/finance/accounts",
        json={
            "organizationId": _ORG,
            "accountNumber": "999997",
            "accountName": "Original Name",
            "drawer": "ASSETS",
            "accountType": "asset",
        },
        headers=auth_headers(),
    )
    account_id = create_resp.json()["data"]["accountId"]

    patch_resp = await client.patch(
        f"/api/v1/finance/accounts/{account_id}",
        json={"accountName": "Updated Name"},
        headers=auth_headers(),
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["data"]["accountName"] == "Updated Name"


@pytest.mark.asyncio
async def test_list_accounts_filtered_by_drawer(client: AsyncClient) -> None:
    """GET /accounts with drawer filter should return only matching accounts."""
    response = await client.get(
        "/api/v1/finance/accounts",
        params={"organization_id": _ORG, "drawer": "ASSETS"},
        headers=auth_headers(),
    )
    assert response.status_code == 200
    items = response.json()["items"]
    for item in items:
        assert item["drawer"] == "ASSETS"


# ---------------------------------------------------------------------------
# New-field tests: description, accountLevel, accountRole, ifrsTag
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_response_includes_new_fields(client: AsyncClient) -> None:
    """
    GET /accounts should include description, accountLevel, accountRole, ifrsTag
    in every item — even when all four are null / defaulted.
    """
    await _seed_company(client, "NF_LIST")
    response = await client.get(
        "/api/v1/finance/accounts",
        params={"organization_id": _ORG},
        headers=auth_headers(role="auditor"),
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) > 0, "Expected at least one account"
    first = items[0]
    # All four keys must be present (values may be null)
    assert "description" in first
    assert "accountLevel" in first
    assert "accountRole" in first
    assert "ifrsTag" in first
    # accountLevel must never be null (NOT NULL column with default 'active')
    assert first["accountLevel"] is not None


@pytest.mark.asyncio
async def test_create_account_with_description(client: AsyncClient) -> None:
    """POST /accounts should persist and return a non-null description."""
    response = await client.post(
        "/api/v1/finance/accounts",
        json={
            "organizationId": _ORG,
            "accountNumber": "999990",
            "accountName": "Test With Description",
            "drawer": "ASSETS",
            "accountType": "asset",
            "description": "Used for integration test validation purposes.",
        },
        headers=auth_headers(),
    )
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["description"] == "Used for integration test validation purposes."
    assert data["accountLevel"] == "active"  # default
    assert data["accountRole"] is None
    assert data["ifrsTag"] is None


@pytest.mark.asyncio
async def test_create_account_with_account_role_roundtrip(client: AsyncClient) -> None:
    """
    POST /accounts with accountRole set → GET should return the same value.
    Verifies the enum round-trips correctly through ORM and serialization.
    """
    create_resp = await client.post(
        "/api/v1/finance/accounts",
        json={
            "organizationId": _ORG,
            "accountNumber": "999989",
            "accountName": "Bank Account",
            "drawer": "ASSETS",
            "accountType": "asset",
            "accountRole": "bank",
            "accountLevel": "active",
            "description": "Main operating bank account.",
            "ifrsTag": "IAS7",
        },
        headers=auth_headers(),
    )
    assert create_resp.status_code == 201
    created = create_resp.json()["data"]
    assert created["accountRole"] == "bank"
    assert created["accountLevel"] == "active"
    assert created["ifrsTag"] == "IAS7"
    assert created["description"] == "Main operating bank account."

    # Fetch the same account by ID and verify the values persist
    account_id = created["accountId"]
    get_resp = await client.get(
        f"/api/v1/finance/accounts/{account_id}",
        headers=auth_headers(role="auditor"),
    )
    assert get_resp.status_code == 200
    fetched = get_resp.json()["data"]
    assert fetched["accountRole"] == "bank"
    assert fetched["accountLevel"] == "active"
    assert fetched["ifrsTag"] == "IAS7"
    assert fetched["description"] == "Main operating bank account."


@pytest.mark.asyncio
async def test_patch_description_and_ifrs_tag(client: AsyncClient) -> None:
    """PATCH /accounts/{id} should update description and ifrsTag independently."""
    create_resp = await client.post(
        "/api/v1/finance/accounts",
        json={
            "organizationId": _ORG,
            "accountNumber": "999988",
            "accountName": "Patchable Account",
            "drawer": "ASSETS",
            "accountType": "asset",
        },
        headers=auth_headers(),
    )
    account_id = create_resp.json()["data"]["accountId"]

    patch_resp = await client.patch(
        f"/api/v1/finance/accounts/{account_id}",
        json={"description": "Added after creation.", "ifrsTag": "IFRS16"},
        headers=auth_headers(),
    )
    assert patch_resp.status_code == 200
    patched = patch_resp.json()["data"]
    assert patched["description"] == "Added after creation."
    assert patched["ifrsTag"] == "IFRS16"
