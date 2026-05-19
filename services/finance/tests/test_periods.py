"""Tests for fiscal period endpoints."""

import pytest
from httpx import AsyncClient

from .conftest import auth_headers

_ORG = "org-periods-test"
_COMPANY_CODE = "PC001"


async def _ensure_company(client: AsyncClient) -> None:
    """Idempotent helper — create company if not already present."""
    resp = await client.get(
        f"/api/v1/finance/companies/{_COMPANY_CODE}",
        headers=auth_headers(),
    )
    if resp.status_code == 404:
        await client.post(
            "/api/v1/finance/companies",
            json={
                "companyCode": _COMPANY_CODE,
                "organizationId": _ORG,
                "legalName": "Period Test Co",
            },
            headers=auth_headers(),
        )


@pytest.mark.asyncio
async def test_create_period(client: AsyncClient) -> None:
    """POST /periods should create a fiscal period."""
    await _ensure_company(client)
    response = await client.post(
        "/api/v1/finance/periods",
        json={
            "companyCode": _COMPANY_CODE,
            "fiscalYear": 2026,
            "periodNumber": 1,
            "startDate": "2026-01-01",
            "endDate": "2026-01-31",
        },
        headers=auth_headers(),
    )
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["status"] == "open"
    assert data["periodNumber"] == 1


@pytest.mark.asyncio
async def test_create_duplicate_period_returns_409(client: AsyncClient) -> None:
    """Duplicate (companyCode, fiscalYear, periodNumber) should return 409."""
    await _ensure_company(client)
    payload = {
        "companyCode": _COMPANY_CODE,
        "fiscalYear": 2026,
        "periodNumber": 2,
        "startDate": "2026-02-01",
        "endDate": "2026-02-28",
    }
    await client.post("/api/v1/finance/periods", json=payload, headers=auth_headers())
    resp = await client.post(
        "/api/v1/finance/periods", json=payload, headers=auth_headers()
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_close_and_reopen_period(client: AsyncClient) -> None:
    """Period should close and reopen correctly."""
    await _ensure_company(client)
    create_resp = await client.post(
        "/api/v1/finance/periods",
        json={
            "companyCode": _COMPANY_CODE,
            "fiscalYear": 2026,
            "periodNumber": 3,
            "startDate": "2026-03-01",
            "endDate": "2026-03-31",
        },
        headers=auth_headers(),
    )
    period_id = create_resp.json()["data"]["periodId"]

    # Close it
    close_resp = await client.patch(
        f"/api/v1/finance/periods/{period_id}/close",
        headers=auth_headers(),
    )
    assert close_resp.status_code == 200
    assert close_resp.json()["data"]["status"] == "closed"

    # Reopen it
    reopen_resp = await client.patch(
        f"/api/v1/finance/periods/{period_id}/reopen",
        headers=auth_headers(),
    )
    assert reopen_resp.status_code == 200
    assert reopen_resp.json()["data"]["status"] == "open"


@pytest.mark.asyncio
async def test_close_already_closed_period_returns_409(client: AsyncClient) -> None:
    """Closing an already-closed period should return 409."""
    await _ensure_company(client)
    create_resp = await client.post(
        "/api/v1/finance/periods",
        json={
            "companyCode": _COMPANY_CODE,
            "fiscalYear": 2026,
            "periodNumber": 4,
            "startDate": "2026-04-01",
            "endDate": "2026-04-30",
        },
        headers=auth_headers(),
    )
    period_id = create_resp.json()["data"]["periodId"]

    await client.patch(
        f"/api/v1/finance/periods/{period_id}/close", headers=auth_headers()
    )
    resp = await client.patch(
        f"/api/v1/finance/periods/{period_id}/close", headers=auth_headers()
    )
    assert resp.status_code == 409
