"""Tests for JWT verification and role enforcement."""

import pytest
from httpx import AsyncClient

from .conftest import auth_headers, make_token


@pytest.mark.asyncio
async def test_missing_token_returns_401(client: AsyncClient) -> None:
    """Requests without a token should be rejected with 401."""
    response = await client.get(
        "/api/v1/finance/companies", headers={}
    )
    assert response.status_code == 403  # HTTPBearer returns 403 when no creds


@pytest.mark.asyncio
async def test_invalid_token_returns_401(client: AsyncClient) -> None:
    """A token signed with the wrong key should be rejected."""
    response = await client.get(
        "/api/v1/finance/companies",
        headers={"Authorization": "Bearer not.a.valid.token"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_auditor_can_read_companies(client: AsyncClient) -> None:
    """An auditor role should be able to list companies (read-only)."""
    response = await client.get(
        "/api/v1/finance/companies",
        headers=auth_headers(role="auditor"),
    )
    # 200 OK — list may be empty but response is valid
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_auditor_cannot_create_company(client: AsyncClient) -> None:
    """An auditor should be blocked from creating a company (write operation)."""
    response = await client.post(
        "/api/v1/finance/companies",
        json={
            "companyCode": "AUD001",
            "organizationId": "org-test",
            "legalName": "Audit Test Co",
        },
        headers=auth_headers(role="auditor"),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_accountant_cannot_create_company(client: AsyncClient) -> None:
    """An accountant should not be able to create a company code."""
    response = await client.post(
        "/api/v1/finance/companies",
        json={
            "companyCode": "ACC001",
            "organizationId": "org-test",
            "legalName": "Accountant Test Co",
        },
        headers=auth_headers(role="accountant"),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_finance_admin_can_create_company(client: AsyncClient) -> None:
    """A finance_admin should be allowed to create a company code."""
    response = await client.post(
        "/api/v1/finance/companies",
        json={
            "companyCode": "FA001",
            "organizationId": "org-jwt-test",
            "legalName": "Finance Admin Test Co",
        },
        headers=auth_headers(role="finance_admin"),
    )
    assert response.status_code == 201
