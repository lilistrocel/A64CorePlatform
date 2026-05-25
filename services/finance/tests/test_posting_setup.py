"""Tests for Company Posting Setup GET/PUT endpoints."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from .conftest import auth_headers

_ORG = "org-ps-test"
_COMPANY_CODE = "PS001"


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


async def _seed_company(client: AsyncClient, code: str = _COMPANY_CODE) -> None:
    """Create a company (seeds CoA)."""
    resp = await client.post(
        "/api/v1/finance/companies",
        json={
            "companyCode": code,
            "organizationId": _ORG,
            "legalName": "Posting Setup Test LLC",
        },
        headers=auth_headers(),
    )
    assert resp.status_code in (201, 409)


async def _get_account_for_field(
    db_session: AsyncSession,
    organization_id: str,
    field_name: str,
) -> str:
    """
    Return an active 'active'-level GL account ID whose drawer/accountType
    matches the semantic requirements for the given posting-setup field
    (T-063.A).

    Picks the first seeded account of the correct type — CoA seeding always
    includes accounts for every drawer so this should never return None.

    Args:
        db_session: Test DB session.
        organization_id: Org scope.
        field_name: Posting-setup field name.

    Returns:
        Account UUID string.

    Raises:
        AssertionError: If no matching account is found (CoA seed failure).
    """
    from sqlalchemy import select

    from finance.models.orm.models import AccountLevelEnum, AccountTypeEnum, DrawerEnum, GLAccount

    _FIELD_TYPES: dict[str, tuple[DrawerEnum, AccountTypeEnum]] = {
        "apControlAccountId":             (DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY),
        "arControlAccountId":             (DrawerEnum.ASSETS,      AccountTypeEnum.ASSET),
        "bankAccountId":                  (DrawerEnum.ASSETS,      AccountTypeEnum.ASSET),
        "cashAccountId":                  (DrawerEnum.ASSETS,      AccountTypeEnum.ASSET),
        "grIrClearingAccountId":          (DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY),
        "inputVatAccountId":              (DrawerEnum.ASSETS,      AccountTypeEnum.ASSET),
        "outputVatAccountId":             (DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY),
        "retainedEarningsAccountId":      (DrawerEnum.EQUITY,      AccountTypeEnum.EQUITY),
        "purchasePriceVarianceAccountId": (DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE),
        "roundingAccountId":              (DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE),
    }
    drawer, acct_type = _FIELD_TYPES[field_name]
    result = await db_session.execute(
        select(GLAccount.accountId)
        .where(
            GLAccount.organizationId == organization_id,
            GLAccount.isActive == True,  # noqa: E712
            GLAccount.accountLevel == AccountLevelEnum.ACTIVE,
            GLAccount.isHeader == False,  # noqa: E712
            GLAccount.drawer == drawer,
            GLAccount.accountType == acct_type,
        )
        .limit(1)
    )
    account_id = result.scalar_one_or_none()
    assert account_id is not None, (
        f"No active {drawer.value}/{acct_type.value} account found for field "
        f"'{field_name}' — CoA seed must run first"
    )
    return account_id


async def _get_title_account_id(
    db_session: AsyncSession, organization_id: str
) -> str | None:
    """Return a 'title'-level account ID if any exists in the CoA."""
    from sqlalchemy import select

    from finance.models.orm.models import AccountLevelEnum, GLAccount

    result = await db_session.execute(
        select(GLAccount.accountId)
        .where(
            GLAccount.organizationId == organization_id,
            GLAccount.accountLevel == AccountLevelEnum.TITLE,
        )
        .limit(1)
    )
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_posting_setup_before_any_put_returns_404(
    client: AsyncClient,
) -> None:
    """GET posting-setup before any configuration returns 404."""
    # Use a company code that has never had posting setup configured.
    resp = await client.get(
        "/api/v1/finance/companies/NEVER_CONFIGURED/posting-setup",
        params={"organization_id": _ORG},
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_put_posting_setup_all_required_fields_sets_is_complete_true(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    PUTting setup with all five required fields present → isComplete=True.
    Each field receives a type-correct account (T-063.A requirement).
    """
    await _seed_company(client)
    ap_id   = await _get_account_for_field(db_session, _ORG, "apControlAccountId")
    bank_id = await _get_account_for_field(db_session, _ORG, "bankAccountId")
    grir_id = await _get_account_for_field(db_session, _ORG, "grIrClearingAccountId")
    vat_id  = await _get_account_for_field(db_session, _ORG, "inputVatAccountId")
    re_id   = await _get_account_for_field(db_session, _ORG, "retainedEarningsAccountId")

    payload = {
        "apControlAccountId":        ap_id,
        "bankAccountId":             bank_id,
        "grIrClearingAccountId":     grir_id,
        "inputVatAccountId":         vat_id,
        "retainedEarningsAccountId": re_id,
    }

    resp = await client.put(
        f"/api/v1/finance/companies/{_COMPANY_CODE}/posting-setup",
        params={"organization_id": _ORG},
        json=payload,
        headers=auth_headers(),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["isComplete"] is True
    assert data["companyCode"] == _COMPANY_CODE
    assert data["organizationId"] == _ORG
    assert data["apControlAccountId"]        == ap_id
    assert data["bankAccountId"]             == bank_id
    assert data["grIrClearingAccountId"]     == grir_id
    assert data["inputVatAccountId"]         == vat_id
    assert data["retainedEarningsAccountId"] == re_id
    assert data["updatedBy"] is not None


@pytest.mark.asyncio
async def test_put_posting_setup_partial_required_fields_sets_is_complete_false(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    PUTting setup with only some required fields → isComplete=False.
    Only apControlAccountId and bankAccountId are set; the other three are omitted.
    Each field receives a type-correct account (T-063.A requirement).
    """
    await _seed_company(client)
    ap_id   = await _get_account_for_field(db_session, _ORG, "apControlAccountId")
    bank_id = await _get_account_for_field(db_session, _ORG, "bankAccountId")

    resp = await client.put(
        "/api/v1/finance/companies/PS001_PARTIAL/posting-setup",
        params={"organization_id": _ORG},
        json={
            "apControlAccountId": ap_id,
            "bankAccountId":      bank_id,
        },
        headers=auth_headers(),
    )
    # 404 on company check is NOT performed in the endpoint — it accepts any
    # companyCode string.  This test focuses on isComplete logic.
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["isComplete"] is False
    assert data["apControlAccountId"] == ap_id
    assert data["bankAccountId"]      == bank_id
    assert data["grIrClearingAccountId"]     is None
    assert data["inputVatAccountId"]         is None
    assert data["retainedEarningsAccountId"] is None


@pytest.mark.asyncio
async def test_put_posting_setup_nonexistent_account_id_returns_422(
    client: AsyncClient,
) -> None:
    """
    PUTting setup with a non-existent accountId → 422 with field error.
    """
    fake_account_id = str(uuid.uuid4())
    resp = await client.put(
        f"/api/v1/finance/companies/{_COMPANY_CODE}/posting-setup",
        params={"organization_id": _ORG},
        json={"apControlAccountId": fake_account_id},
        headers=auth_headers(),
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert "apControlAccountId" in detail
    assert fake_account_id in detail


@pytest.mark.asyncio
async def test_put_posting_setup_title_level_account_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    PUTting setup with a 'title'-level account → 422 (cannot post to title accounts).
    """
    await _seed_company(client)
    title_id = await _get_title_account_id(db_session, _ORG)
    if title_id is None:
        pytest.skip("No title-level account in seeded CoA for this test run")

    resp = await client.put(
        f"/api/v1/finance/companies/{_COMPANY_CODE}/posting-setup",
        params={"organization_id": _ORG},
        json={"apControlAccountId": title_id},
        headers=auth_headers(),
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert "title" in detail.lower() or "active" in detail.lower()


@pytest.mark.asyncio
async def test_get_posting_setup_returns_existing_row(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    After a successful PUT, GET should return the same row.
    Each field receives a type-correct account (T-063.A requirement).
    """
    await _seed_company(client)
    ap_id   = await _get_account_for_field(db_session, _ORG, "apControlAccountId")
    bank_id = await _get_account_for_field(db_session, _ORG, "bankAccountId")
    grir_id = await _get_account_for_field(db_session, _ORG, "grIrClearingAccountId")
    vat_id  = await _get_account_for_field(db_session, _ORG, "inputVatAccountId")
    re_id   = await _get_account_for_field(db_session, _ORG, "retainedEarningsAccountId")

    payload = {
        "apControlAccountId":        ap_id,
        "bankAccountId":             bank_id,
        "grIrClearingAccountId":     grir_id,
        "inputVatAccountId":         vat_id,
        "retainedEarningsAccountId": re_id,
    }

    put_resp = await client.put(
        f"/api/v1/finance/companies/{_COMPANY_CODE}/posting-setup",
        params={"organization_id": _ORG},
        json=payload,
        headers=auth_headers(),
    )
    assert put_resp.status_code == 200

    get_resp = await client.get(
        f"/api/v1/finance/companies/{_COMPANY_CODE}/posting-setup",
        params={"organization_id": _ORG},
        headers=auth_headers(role="auditor"),
    )
    assert get_resp.status_code == 200
    data = get_resp.json()["data"]
    assert data["isComplete"] is True
    assert data["apControlAccountId"] == ap_id


@pytest.mark.asyncio
async def test_put_posting_setup_upserts_on_second_call(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    A second PUT for the same (org, company) updates the existing row rather than
    creating a duplicate (UNIQUE constraint must not fire).
    Each field receives a type-correct account (T-063.A requirement).
    """
    await _seed_company(client)
    ap_id   = await _get_account_for_field(db_session, _ORG, "apControlAccountId")
    bank_id = await _get_account_for_field(db_session, _ORG, "bankAccountId")
    grir_id = await _get_account_for_field(db_session, _ORG, "grIrClearingAccountId")
    vat_id  = await _get_account_for_field(db_session, _ORG, "inputVatAccountId")
    re_id   = await _get_account_for_field(db_session, _ORG, "retainedEarningsAccountId")

    # First PUT — partial (single field)
    first_resp = await client.put(
        "/api/v1/finance/companies/PS001_UPSERT/posting-setup",
        params={"organization_id": _ORG},
        json={"apControlAccountId": ap_id},
        headers=auth_headers(),
    )
    assert first_resp.status_code == 200
    first_setup_id = first_resp.json()["data"]["setupId"]

    # Second PUT — adds more fields (unchanged ap_id satisfies no-op skip in guard)
    second_resp = await client.put(
        "/api/v1/finance/companies/PS001_UPSERT/posting-setup",
        params={"organization_id": _ORG},
        json={
            "apControlAccountId":        ap_id,
            "bankAccountId":             bank_id,
            "grIrClearingAccountId":     grir_id,
            "inputVatAccountId":         vat_id,
            "retainedEarningsAccountId": re_id,
        },
        headers=auth_headers(),
    )
    assert second_resp.status_code == 200
    second_data = second_resp.json()["data"]
    # Same row (setupId unchanged), now complete
    assert second_data["setupId"] == first_setup_id
    assert second_data["isComplete"] is True
