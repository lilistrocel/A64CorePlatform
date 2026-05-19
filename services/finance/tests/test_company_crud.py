"""Tests for company code CRUD endpoints."""

import pytest
from httpx import AsyncClient

from .conftest import auth_headers


_ORG = "org-company-test"
_COMPANY = {
    "companyCode": "CC001",
    "organizationId": _ORG,
    "legalName": "Test Company LLC",
    "trn": "100123456700003",
    "fiscalYearStartMonth": 1,
    "fiscalYearStartDay": 1,
    "defaultCurrency": "AED",
}


@pytest.mark.asyncio
async def test_create_company(client: AsyncClient) -> None:
    """POST /companies should create a company and seed CoA."""
    response = await client.post(
        "/api/v1/finance/companies",
        json=_COMPANY,
        headers=auth_headers(),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["data"]["companyCode"] == "CC001"
    assert data["data"]["legalName"] == "Test Company LLC"
    # Message should mention seeded accounts
    assert "Seeded" in data["message"]


@pytest.mark.asyncio
async def test_create_company_duplicate_returns_409(client: AsyncClient) -> None:
    """Creating a duplicate company code should return 409."""
    # First creation
    await client.post(
        "/api/v1/finance/companies",
        json={**_COMPANY, "companyCode": "CC_DUP"},
        headers=auth_headers(),
    )
    # Second creation with same code
    response = await client.post(
        "/api/v1/finance/companies",
        json={**_COMPANY, "companyCode": "CC_DUP"},
        headers=auth_headers(),
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_list_companies(client: AsyncClient) -> None:
    """GET /companies should return a list."""
    # Ensure at least one company exists
    await client.post(
        "/api/v1/finance/companies",
        json={**_COMPANY, "companyCode": "CC_LIST"},
        headers=auth_headers(),
    )
    response = await client.get(
        "/api/v1/finance/companies",
        headers=auth_headers(role="auditor"),
    )
    assert response.status_code == 200
    assert isinstance(response.json()["data"], list)


@pytest.mark.asyncio
async def test_get_company_not_found(client: AsyncClient) -> None:
    """GET /companies/{code} for non-existent code should return 404."""
    response = await client.get(
        "/api/v1/finance/companies/NONEXIST",
        headers=auth_headers(),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_patch_company(client: AsyncClient) -> None:
    """PATCH /companies/{code} should update fields."""
    # Create first
    await client.post(
        "/api/v1/finance/companies",
        json={**_COMPANY, "companyCode": "CC_PAT"},
        headers=auth_headers(),
    )
    # Update legalName
    response = await client.patch(
        "/api/v1/finance/companies/CC_PAT",
        json={"legalName": "Updated Name LLC"},
        headers=auth_headers(),
    )
    assert response.status_code == 200
    assert response.json()["data"]["legalName"] == "Updated Name LLC"
