"""
Tests for PM-feedback CoA fixes: Items 1, 10, 11, 12.

Covered assertions:
  - Item 12: 514000-004 Purchase Price Variance exists in DEFAULT_COA seed with
    correct shape (drawer=COST_OF_SALES, type=EXPENSE, parent=514000, isHeader=False).
  - Item 10: 617000-011 Rounding Differences exists in DEFAULT_COA seed with
    correct shape (drawer=OPERATING_COST, type=EXPENSE, parent=617000, isHeader=False).
  - Item 1:  223000-004 Goods Received Not Invoiced exists in DEFAULT_COA seed with
    correct shape (drawer=LIABILITIES, type=LIABILITY, parent=223000, isHeader=False).
             221000-002 is still in the seed (for completeness — it will be seeded
             as isActive=True, then the migration script deactivates it).
  - Item 11: CompanyPostingSetup ORM has defaultValuationMethod defaulting to
    MovingAverage; PUT endpoint accepts and persists the field; partial PUT that
    omits the field does not clobber the existing value.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from finance.db.seeds.default_coa import DEFAULT_COA
from finance.models.orm.models import AccountTypeEnum, DrawerEnum, ValuationMethodEnum

# Shortcuts used by the type-aware account helper below.
_D = DrawerEnum
_A = AccountTypeEnum

from .conftest import auth_headers

# ---------------------------------------------------------------------------
# Helper: quick lookup into DEFAULT_COA
# ---------------------------------------------------------------------------

_COA_MAP: dict[str, tuple] = {row[0]: row for row in DEFAULT_COA}
# Each tuple is: (accountNumber, accountName, drawer, accountType, parentNumber, isHeader)


def _coa(account_number: str) -> tuple | None:
    """Return the DEFAULT_COA tuple for account_number, or None."""
    return _COA_MAP.get(account_number)


# ---------------------------------------------------------------------------
# Seed shape tests (Items 12, 10, 1)
# ---------------------------------------------------------------------------


class TestSeedAccountShapes:
    """Verify the three new accounts exist in DEFAULT_COA with correct attributes."""

    def test_item12_purchase_price_variance_in_seed(self) -> None:
        """
        Item 12: 514000-004 Purchase Price Variance must be in the seed under
        the 514000 Inventory Adjustments header in COST_OF_SALES.
        """
        row = _coa("514000-004")
        assert row is not None, "514000-004 is missing from DEFAULT_COA"
        _, name, drawer, acct_type, parent, is_header = row
        assert name == "Purchase Price Variance"
        assert drawer == DrawerEnum.COST_OF_SALES, f"Expected COST_OF_SALES, got {drawer}"
        assert acct_type == AccountTypeEnum.EXPENSE, f"Expected EXPENSE, got {acct_type}"
        assert parent == "514000", f"Expected parent 514000, got {parent}"
        assert is_header is False, "514000-004 should be a leaf (isHeader=False)"

    def test_item10_rounding_differences_in_seed(self) -> None:
        """
        Item 10: 617000-011 Rounding Differences must be in the seed under
        the 617000 General & Administrative header in OPERATING_COST.
        """
        row = _coa("617000-011")
        assert row is not None, "617000-011 is missing from DEFAULT_COA"
        _, name, drawer, acct_type, parent, is_header = row
        assert name == "Rounding Differences"
        assert drawer == DrawerEnum.OPERATING_COST, f"Expected OPERATING_COST, got {drawer}"
        assert acct_type == AccountTypeEnum.EXPENSE, f"Expected EXPENSE, got {acct_type}"
        assert parent == "617000", f"Expected parent 617000, got {parent}"
        assert is_header is False, "617000-011 should be a leaf (isHeader=False)"

    def test_item1_grir_new_account_in_seed(self) -> None:
        """
        Item 1: 223000-004 Goods Received Not Invoiced must be in the seed under
        the 223000 Accruals & Deferred Income header in LIABILITIES.
        """
        row = _coa("223000-004")
        assert row is not None, "223000-004 is missing from DEFAULT_COA"
        _, name, drawer, acct_type, parent, is_header = row
        assert name == "Goods Received Not Invoiced"
        assert drawer == DrawerEnum.LIABILITIES, f"Expected LIABILITIES, got {drawer}"
        assert acct_type == AccountTypeEnum.LIABILITY, f"Expected LIABILITY, got {acct_type}"
        assert parent == "223000", f"Expected parent 223000, got {parent}"
        assert is_header is False, "223000-004 should be a leaf (isHeader=False)"

    def test_item1_old_grir_still_in_seed(self) -> None:
        """
        Item 1: 221000-002 must remain in the seed (historical JE integrity).
        It is seeded with isActive=True; the migration script deactivates it at
        runtime.  This test confirms the row was not deleted from the seed file.
        """
        row = _coa("221000-002")
        assert row is not None, (
            "221000-002 was removed from DEFAULT_COA — this breaks historical JE lookups. "
            "Mark it isActive=False via the migration script, do not delete the seed entry."
        )

    def test_514000_parent_header_in_seed(self) -> None:
        """514000 Inventory Adjustments must still be present as a header account."""
        row = _coa("514000")
        assert row is not None
        _, _, _, _, _, is_header = row
        assert is_header is True

    def test_617000_parent_header_in_seed(self) -> None:
        """617000 General & Administrative must still be present as a header account."""
        row = _coa("617000")
        assert row is not None
        _, _, _, _, _, is_header = row
        assert is_header is True

    def test_223000_parent_header_in_seed(self) -> None:
        """223000 Accruals & Deferred Income must still be present as a header account."""
        row = _coa("223000")
        assert row is not None
        _, _, _, _, _, is_header = row
        assert is_header is True

    def test_no_duplicate_account_numbers_in_seed(self) -> None:
        """No two rows in DEFAULT_COA may share the same accountNumber."""
        numbers = [row[0] for row in DEFAULT_COA]
        duplicates = {n for n in numbers if numbers.count(n) > 1}
        assert not duplicates, f"Duplicate accountNumbers in DEFAULT_COA: {duplicates}"


# ---------------------------------------------------------------------------
# Company Posting Setup — defaultValuationMethod (Item 11)
# ---------------------------------------------------------------------------

_ORG_VM = "org-valuation-method-test"
_CC_VM = "VM001"


async def _seed_company_vm(client: AsyncClient, code: str = _CC_VM) -> None:
    """Create a company (seeds CoA) for valuation method tests."""
    resp = await client.post(
        "/api/v1/finance/companies",
        json={
            "companyCode": code,
            "organizationId": _ORG_VM,
            "legalName": "Valuation Method Test LLC",
        },
        headers=auth_headers(),
    )
    assert resp.status_code in (201, 409)


async def _get_active_account_id_by_type(
    db_session: AsyncSession,
    organization_id: str,
    drawer: "DrawerEnum",
    account_type: "AccountTypeEnum",
) -> str:
    """Return the first active GL account ID matching (drawer, accountType).

    The posting-setup endpoint's T-063 type guard rejects accounts that don't
    satisfy the semantic requirement for a given field, so each field must be
    seeded with an account of the correct drawer/accountType.
    """
    from sqlalchemy import select

    from finance.models.orm.models import AccountLevelEnum, GLAccount

    result = await db_session.execute(
        select(GLAccount.accountId)
        .where(
            GLAccount.organizationId == organization_id,
            GLAccount.isActive == True,  # noqa: E712
            GLAccount.accountLevel == AccountLevelEnum.ACTIVE,
            GLAccount.drawer == drawer,
            GLAccount.accountType == account_type,
        )
        .limit(1)
    )
    acct_id = result.scalar_one_or_none()
    assert acct_id is not None, (
        f"No active {drawer.value}/{account_type.value} account found for org {organization_id}. "
        "Ensure the company was seeded (POST /companies) before calling this helper."
    )
    return acct_id


@pytest.mark.asyncio
async def test_item11_default_valuation_method_defaults_to_moving_average(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Item 11: After a PUT that does not include defaultValuationMethod, the
    response must show defaultValuationMethod='MovingAverage' (the server
    default from migration 010 / ORM default).

    Each posting-setup field requires an account of a specific semantic type
    (T-063 type guard).  Use the type-aware helper to pick the right accounts.
    """
    await _seed_company_vm(client, _CC_VM)

    # Each field requires a specific drawer/accountType combination.
    ap_id = await _get_active_account_id_by_type(db_session, _ORG_VM, _D.LIABILITIES, _A.LIABILITY)
    bank_id = await _get_active_account_id_by_type(db_session, _ORG_VM, _D.ASSETS, _A.ASSET)
    grir_id = await _get_active_account_id_by_type(db_session, _ORG_VM, _D.LIABILITIES, _A.LIABILITY)
    vat_id = await _get_active_account_id_by_type(db_session, _ORG_VM, _D.ASSETS, _A.ASSET)
    re_id = await _get_active_account_id_by_type(db_session, _ORG_VM, _D.EQUITY, _A.EQUITY)

    resp = await client.put(
        f"/api/v1/finance/companies/{_CC_VM}/posting-setup",
        params={"organization_id": _ORG_VM},
        json={
            "apControlAccountId": ap_id,
            "bankAccountId": bank_id,
            "grIrClearingAccountId": grir_id,
            "inputVatAccountId": vat_id,
            "retainedEarningsAccountId": re_id,
        },
        headers=auth_headers(),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert "defaultValuationMethod" in data, (
        "defaultValuationMethod missing from CompanyPostingSetupResponse"
    )
    assert data["defaultValuationMethod"] == ValuationMethodEnum.MOVING_AVERAGE.value, (
        f"Expected MovingAverage default, got {data['defaultValuationMethod']}"
    )


@pytest.mark.asyncio
async def test_item11_put_default_valuation_method_fifo(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Item 11: Explicitly setting defaultValuationMethod=FIFO via PUT persists
    and is returned in the response.
    """
    code = "VM_FIFO"
    await _seed_company_vm(client, code)
    # apControlAccountId requires LIABILITIES/LIABILITY (T-063 type guard).
    ap_id = await _get_active_account_id_by_type(db_session, _ORG_VM, _D.LIABILITIES, _A.LIABILITY)

    resp = await client.put(
        f"/api/v1/finance/companies/{code}/posting-setup",
        params={"organization_id": _ORG_VM},
        json={
            "apControlAccountId": ap_id,
            "defaultValuationMethod": "FIFO",
        },
        headers=auth_headers(),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["defaultValuationMethod"] == "FIFO"


@pytest.mark.asyncio
async def test_item11_partial_put_does_not_clobber_existing_valuation_method(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Item 11: A subsequent partial PUT that omits defaultValuationMethod must
    NOT overwrite the previously stored value with NULL.
    """
    code = "VM_PARTIAL"
    await _seed_company_vm(client, code)
    # apControlAccountId requires LIABILITIES/LIABILITY; bankAccountId requires ASSETS/ASSET.
    ap_id = await _get_active_account_id_by_type(db_session, _ORG_VM, _D.LIABILITIES, _A.LIABILITY)
    bank_id = await _get_active_account_id_by_type(db_session, _ORG_VM, _D.ASSETS, _A.ASSET)

    # First PUT — set FIFO explicitly
    first_resp = await client.put(
        f"/api/v1/finance/companies/{code}/posting-setup",
        params={"organization_id": _ORG_VM},
        json={
            "apControlAccountId": ap_id,
            "defaultValuationMethod": "FIFO",
        },
        headers=auth_headers(),
    )
    assert first_resp.status_code == 200
    assert first_resp.json()["data"]["defaultValuationMethod"] == "FIFO"

    # Second PUT — omits defaultValuationMethod entirely
    second_resp = await client.put(
        f"/api/v1/finance/companies/{code}/posting-setup",
        params={"organization_id": _ORG_VM},
        json={"bankAccountId": bank_id},
        headers=auth_headers(),
    )
    assert second_resp.status_code == 200, second_resp.text
    data = second_resp.json()["data"]
    # Reason: server must not overwrite FIFO with NULL when caller omits the field
    assert data["defaultValuationMethod"] == "FIFO", (
        f"Partial PUT clobbered defaultValuationMethod: expected FIFO, got {data['defaultValuationMethod']}"
    )


@pytest.mark.asyncio
async def test_item11_invalid_valuation_method_returns_422(
    client: AsyncClient,
) -> None:
    """
    Item 11: Sending an unknown valuationMethod value returns 422 (Pydantic
    enum validation rejects it before reaching the handler).
    """
    resp = await client.put(
        "/api/v1/finance/companies/VM_INVALID/posting-setup",
        params={"organization_id": _ORG_VM},
        json={"defaultValuationMethod": "NotAMethod"},
        headers=auth_headers(),
    )
    assert resp.status_code == 422
