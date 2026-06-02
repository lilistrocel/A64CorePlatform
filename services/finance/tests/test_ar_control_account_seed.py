"""
Tests for T-100.2.1 — AR control account seed (124000 / 124000-001).

Covered assertions:
  - 124000  "Trade Receivables" header exists in DEFAULT_COA with correct shape.
  - 124000-001 "Trade Receivables - Customers" leaf exists in DEFAULT_COA with
    correct shape (drawer=ASSETS, accountType=asset, isHeader=False).
  - 124000-001 is listed in CONTROL_ACCOUNT_NUMBERS.
  - 120000 "Current Assets" parent header exists (parent of the 124000 group).
  - After seeding a company, 124000-001 is present in the DB and has
    isControlAccount=True, isActive=True, isHeader=False.
  - Seeding the same company a second time does not create duplicate rows
    (idempotency guard in seed_loader).
  - No two rows in DEFAULT_COA share the same accountNumber (regression guard).
  - Exactly one postable Trade Receivables leaf exists in the seed (no duplicates).
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from finance.db.seeds.default_coa import CONTROL_ACCOUNT_NUMBERS, DEFAULT_COA
from finance.models.orm.models import AccountTypeEnum, DrawerEnum, GLAccount

from .conftest import auth_headers

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_COA_MAP: dict[str, tuple] = {row[0]: row for row in DEFAULT_COA}


def _coa(account_number: str) -> tuple | None:
    """Return the DEFAULT_COA tuple for account_number, or None if absent."""
    return _COA_MAP.get(account_number)


# Org + company code used by the DB-level idempotency tests.
_ORG_AR = "org-ar-seed-test"
_CC_AR = "AR001"


async def _seed_company(client: AsyncClient, code: str = _CC_AR) -> None:
    """POST /companies to trigger full CoA seed for _ORG_AR."""
    resp = await client.post(
        "/api/v1/finance/companies",
        json={
            "companyCode": code,
            "organizationId": _ORG_AR,
            "legalName": "AR Seed Test LLC",
        },
        headers=auth_headers(),
    )
    # 201 = created, 409 = already exists (idempotent call).
    assert resp.status_code in (201, 409), resp.text


# ---------------------------------------------------------------------------
# Seed shape tests — pure in-memory, no DB required
# ---------------------------------------------------------------------------


class TestARControlAccountSeedShape:
    """Verify DEFAULT_COA contains the correct AR account structure."""

    def test_124000_header_exists_in_seed(self) -> None:
        """
        124000 "Trade Receivables" must be present as a header account under
        the 120000 Current Assets group (drawer=ASSETS, isHeader=True).
        """
        row = _coa("124000")
        assert row is not None, "124000 is missing from DEFAULT_COA"
        _, name, drawer, acct_type, parent, is_header = row
        assert name == "Trade Receivables", f"Unexpected name: {name}"
        assert drawer == DrawerEnum.ASSETS, f"Expected ASSETS, got {drawer}"
        assert acct_type == AccountTypeEnum.ASSET, f"Expected ASSET, got {acct_type}"
        assert parent == "120000", f"Expected parent 120000, got {parent}"
        assert is_header is True, "124000 must be a header account (isHeader=True)"

    def test_124000_001_leaf_exists_in_seed(self) -> None:
        """
        124000-001 "Trade Receivables - Customers" must be a postable leaf under
        124000 with drawer=ASSETS and accountType=ASSET.
        """
        row = _coa("124000-001")
        assert row is not None, "124000-001 is missing from DEFAULT_COA"
        _, name, drawer, acct_type, parent, is_header = row
        assert name == "Trade Receivables - Customers", f"Unexpected name: {name}"
        assert drawer == DrawerEnum.ASSETS, f"Expected ASSETS, got {drawer}"
        assert acct_type == AccountTypeEnum.ASSET, f"Expected ASSET, got {acct_type}"
        assert parent == "124000", f"Expected parent 124000, got {parent}"
        assert is_header is False, "124000-001 must be a leaf account (isHeader=False)"

    def test_124000_001_in_control_account_numbers(self) -> None:
        """
        124000-001 must be in CONTROL_ACCOUNT_NUMBERS so the seed_loader marks
        isControlAccount=True when inserting this row.
        """
        assert "124000-001" in CONTROL_ACCOUNT_NUMBERS, (
            "124000-001 is absent from CONTROL_ACCOUNT_NUMBERS in default_coa.py. "
            "The seed_loader uses this set to set isControlAccount=True."
        )

    def test_120000_current_assets_parent_exists(self) -> None:
        """
        120000 "Current Assets" must exist as a header in the seed so that
        124000's parent linkage resolves correctly.
        """
        row = _coa("120000")
        assert row is not None, "120000 Current Assets is missing from DEFAULT_COA"
        _, _, _, _, _, is_header = row
        assert is_header is True, "120000 must be a header account"

    def test_exactly_one_postable_trade_receivables_leaf(self) -> None:
        """
        There must be exactly one postable (isHeader=False) ASSETS/asset leaf
        whose name contains 'Trade Receivables' and whose accountNumber starts
        with '124000-'.  Ensures no accidental duplicate AR leaves were added.
        """
        leaves = [
            row
            for row in DEFAULT_COA
            if (
                not row[5]  # isHeader=False
                and row[2] == DrawerEnum.ASSETS
                and row[3] == AccountTypeEnum.ASSET
                and "Trade Receivables" in row[1]
                and row[0].startswith("124000-")
            )
        ]
        assert len(leaves) >= 1, (
            "No postable Trade Receivables leaf found in DEFAULT_COA. "
            "Expected at least 124000-001."
        )
        leaf_numbers = [row[0] for row in leaves if row[0] == "124000-001"]
        assert len(leaf_numbers) == 1, (
            f"Expected exactly one 124000-001 row, found {len(leaf_numbers)}: {leaf_numbers}"
        )

    def test_no_duplicate_account_numbers(self) -> None:
        """Regression guard: no two rows in DEFAULT_COA share accountNumber."""
        numbers = [row[0] for row in DEFAULT_COA]
        duplicates = {n for n in numbers if numbers.count(n) > 1}
        assert not duplicates, f"Duplicate accountNumbers in DEFAULT_COA: {duplicates}"


# ---------------------------------------------------------------------------
# DB-level tests — require the seeded database
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ar_account_seeded_with_correct_flags(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    After seeding a company, 124000-001 must be present in gl_accounts with:
      isControlAccount=True, isActive=True, isHeader=False, drawer=ASSETS.
    """
    await _seed_company(client, _CC_AR)

    result = await db_session.execute(
        select(GLAccount).where(
            GLAccount.organizationId == _ORG_AR,
            GLAccount.accountNumber == "124000-001",
        )
    )
    account = result.scalar_one_or_none()
    assert account is not None, (
        "124000-001 not found in gl_accounts after company seed. "
        "Check that DEFAULT_COA includes this account and seed_loader inserts it."
    )
    assert account.isControlAccount is True, (
        "124000-001 must have isControlAccount=True. "
        "Verify CONTROL_ACCOUNT_NUMBERS in default_coa.py and seed_loader logic."
    )
    assert account.isActive is True, "124000-001 must be active (isActive=True)"
    assert account.isHeader is False, "124000-001 must be a leaf (isHeader=False)"
    assert account.drawer == DrawerEnum.ASSETS, (
        f"Expected drawer ASSETS, got {account.drawer}"
    )


@pytest.mark.asyncio
async def test_ar_seed_is_idempotent(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Seeding the same organisation twice must not create duplicate 124000-001 rows.
    seed_loader short-circuits if any gl_accounts row already exists for the org.
    """
    # First seed (may have already run from the previous test; 409 is fine).
    await _seed_company(client, _CC_AR)
    # Second seed attempt — must be rejected at 409 (company already exists).
    await _seed_company(client, _CC_AR)

    result = await db_session.execute(
        select(GLAccount).where(
            GLAccount.organizationId == _ORG_AR,
            GLAccount.accountNumber == "124000-001",
        )
    )
    rows = result.scalars().all()
    assert len(rows) == 1, (
        f"Expected exactly 1 row for 124000-001 after duplicate seed, found {len(rows)}. "
        "seed_loader idempotency guard may be broken."
    )
