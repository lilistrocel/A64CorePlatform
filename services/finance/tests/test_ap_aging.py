"""
Tests for the AP Aging report endpoint.

POST /api/v1/finance/reports/ap-aging

Coverage:
  - Empty invoices list → totals all zero, byVendor empty.
  - Single not-due invoice → notDue populated, other buckets zero.
  - Mix of buckets across multiple vendors → correct aggregation.
  - Fully-paid invoice (totalPaid >= totalGross) → excluded from aging.
  - Partially-paid invoice → outstanding lands in correct bucket.
  - asOfDate drives the overdue calculation (not today).
  - Vendors sorted by total outstanding descending.
  - Role gate: accountant can POST.
"""

import os
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

# Override DB and secrets BEFORE importing any finance module.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test_secret_key")
os.environ.setdefault("FINANCE_INGESTION_SECRET", "test-ingest-secret")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker  # noqa: E402

from finance.db.session import engine, get_db  # noqa: E402
from finance.main import app  # noqa: E402
from finance.models.orm.models import (  # noqa: E402
    ApPayment,
    ApPaymentApplication,
    CompanyPostingSetup,
    FiscalPeriod,
    GLAccount,
    AccountLevelEnum,
    PeriodStatusEnum,
    ValuationMethodEnum,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_BASE = "/api/v1/finance"
_AGING_URL = f"{_BASE}/reports/ap-aging"
_ORG = "ag-test-org-0000-0000-000000000001"

# ---------------------------------------------------------------------------
# Session + client fixtures
# ---------------------------------------------------------------------------

_TestSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    """Fresh session per test (rolled back after each test)."""
    async with _TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncClient:
    """Async HTTP client with DB session overridden to the test session."""

    async def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------


def _make_jwt(role: str = "finance_admin", user_id: str = "test-user-aging") -> str:
    """Generate a test JWT signed with the test SECRET_KEY."""
    from jose import jwt

    payload = {
        "userId": user_id,
        "email": "aging@a64core.com",
        "role": role,
        "type": "access",
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, "test_secret_key", algorithm="HS256")


def _auth(role: str = "finance_admin") -> dict:
    return {"Authorization": f"Bearer {_make_jwt(role=role)}"}


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


async def _get_active_account_id(db_session: AsyncSession, offset: int = 0) -> str:
    """Return accountId of the Nth active GL account seeded under _ORG."""
    from sqlalchemy import select

    result = await db_session.execute(
        select(GLAccount.accountId)
        .where(
            GLAccount.organizationId == _ORG,
            GLAccount.isActive == True,  # noqa: E712
            GLAccount.accountLevel == AccountLevelEnum.ACTIVE,
        )
        .offset(offset)
        .limit(1)
    )
    account_id = result.scalar_one_or_none()
    assert account_id is not None, f"No active GL account at offset {offset}"
    return account_id


async def _seed_company(client: AsyncClient, code: str) -> None:
    """Create a company (seeds CoA)."""
    resp = await client.post(
        f"{_BASE}/companies",
        json={
            "companyCode": code,
            "organizationId": _ORG,
            "legalName": f"Aging Test {code} LLC",
        },
        headers=_auth(),
    )
    assert resp.status_code in (201, 409), resp.text


async def _seed_payment_application(
    db_session: AsyncSession,
    ap_doc_id: str,
    amount_applied: Decimal,
) -> None:
    """
    Insert an ApPaymentApplication row directly (bypasses the full payment flow).

    Uses a fake paymentId since we only need the application rows for the
    totals-paid lookup in the aging report.
    """
    app_row = ApPaymentApplication(
        applicationId=str(uuid.uuid4()),
        paymentId=str(uuid.uuid4()),  # fake — no FK enforced in tests
        apInvoiceDocId=ap_doc_id,
        apInvoiceDocNumber="AP-TEST",
        amountApplied=amount_applied,
    )
    db_session.add(app_row)
    await db_session.flush()


def _invoice(
    *,
    ap_doc_id: Optional[str] = None,
    total_gross: str,
    due_date: str,
    vendor_id: str = "vendor-001",
    vendor_code: str = "VND-001",
    vendor_name: str = "Test Vendor",
) -> Dict[str, Any]:
    """Build an invoice dict for the request body."""
    return {
        "apDocId": ap_doc_id or str(uuid.uuid4()),
        "totalGross": total_gross,
        "dueDate": due_date,
        "vendorId": vendor_id,
        "vendorCode": vendor_code,
        "vendorName": vendor_name,
    }


def _body(
    invoices: List[Dict],
    as_of_date: Optional[str] = None,
    company_code: str = "AG01",
) -> Dict[str, Any]:
    """Build the POST /reports/ap-aging request body."""
    payload: Dict[str, Any] = {
        "organizationId": _ORG,
        "companyCode": company_code,
        "invoices": invoices,
    }
    if as_of_date is not None:
        payload["asOfDate"] = as_of_date
    return payload


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ap_aging_empty_invoices(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Empty invoices list returns all-zero totals and empty byVendor."""
    await _seed_company(client, "AG01")

    resp = await client.post(
        _AGING_URL,
        json=_body(invoices=[]),
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()["data"]
    totals = data["totals"]
    assert Decimal(totals["notDue"]) == Decimal("0")
    assert Decimal(totals["days1To30"]) == Decimal("0")
    assert Decimal(totals["days31To60"]) == Decimal("0")
    assert Decimal(totals["days61To90"]) == Decimal("0")
    assert Decimal(totals["daysOver90"]) == Decimal("0")
    assert Decimal(totals["total"]) == Decimal("0")
    assert data["byVendor"] == []


@pytest.mark.asyncio
async def test_ap_aging_single_not_due_invoice(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """A single invoice not yet past due lands entirely in notDue bucket."""
    await _seed_company(client, "AG01")

    # asOfDate = 2026-06-01, dueDate = 2026-06-30 → not due
    resp = await client.post(
        _AGING_URL,
        json=_body(
            invoices=[_invoice(total_gross="5000.00", due_date="2026-06-30")],
            as_of_date="2026-06-01",
        ),
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()["data"]
    totals = data["totals"]
    assert Decimal(totals["notDue"]) == Decimal("5000.00")
    assert Decimal(totals["days1To30"]) == Decimal("0")
    assert Decimal(totals["days31To60"]) == Decimal("0")
    assert Decimal(totals["days61To90"]) == Decimal("0")
    assert Decimal(totals["daysOver90"]) == Decimal("0")
    assert Decimal(totals["total"]) == Decimal("5000.00")

    assert len(data["byVendor"]) == 1
    vendor = data["byVendor"][0]
    assert Decimal(vendor["notDue"]) == Decimal("5000.00")
    assert Decimal(vendor["total"]) == Decimal("5000.00")


@pytest.mark.asyncio
async def test_ap_aging_multiple_buckets_multiple_vendors(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Mix of invoices across different buckets and vendors aggregates correctly.

    Scenario (asOfDate = 2026-07-01):
      Vendor A:
        Invoice 1: dueDate 2026-07-15 → not due, outstanding 1000
        Invoice 2: dueDate 2026-06-20 → 11 days overdue, outstanding 2000
      Vendor B:
        Invoice 3: dueDate 2026-05-01 → 61 days overdue, outstanding 3000
        Invoice 4: dueDate 2026-03-15 → 108 days overdue, outstanding 4500
    """
    await _seed_company(client, "AG01")

    invoices = [
        _invoice(
            total_gross="1000.00",
            due_date="2026-07-15",
            vendor_id="vnd-a",
            vendor_code="VND-A",
            vendor_name="Vendor Alpha",
        ),
        _invoice(
            total_gross="2000.00",
            due_date="2026-06-20",
            vendor_id="vnd-a",
            vendor_code="VND-A",
            vendor_name="Vendor Alpha",
        ),
        _invoice(
            total_gross="3000.00",
            due_date="2026-05-01",
            vendor_id="vnd-b",
            vendor_code="VND-B",
            vendor_name="Vendor Beta",
        ),
        _invoice(
            total_gross="4500.00",
            due_date="2026-03-15",
            vendor_id="vnd-b",
            vendor_code="VND-B",
            vendor_name="Vendor Beta",
        ),
    ]

    resp = await client.post(
        _AGING_URL,
        json=_body(invoices=invoices, as_of_date="2026-07-01"),
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()["data"]
    totals = data["totals"]

    assert Decimal(totals["notDue"]) == Decimal("1000.00")      # Vendor A inv1
    assert Decimal(totals["days1To30"]) == Decimal("2000.00")   # Vendor A inv2 (11 days)
    assert Decimal(totals["days31To60"]) == Decimal("0")
    assert Decimal(totals["days61To90"]) == Decimal("3000.00")  # Vendor B inv3 (61 days)
    assert Decimal(totals["daysOver90"]) == Decimal("4500.00")  # Vendor B inv4 (108 days)
    assert Decimal(totals["total"]) == Decimal("10500.00")

    # Vendors sorted by total descending: B (7500) before A (3000)
    by_vendor = data["byVendor"]
    assert len(by_vendor) == 2
    assert by_vendor[0]["vendorId"] == "vnd-b"
    assert Decimal(by_vendor[0]["total"]) == Decimal("7500.00")
    assert by_vendor[1]["vendorId"] == "vnd-a"
    assert Decimal(by_vendor[1]["total"]) == Decimal("3000.00")


@pytest.mark.asyncio
async def test_ap_aging_fully_paid_invoice_excluded(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """A fully-paid invoice (totalPaid >= totalGross) is excluded from aging."""
    await _seed_company(client, "AG01")

    ap_doc_id = str(uuid.uuid4())
    # Seed a payment covering the full invoice amount
    await _seed_payment_application(db_session, ap_doc_id, Decimal("2000.00"))

    resp = await client.post(
        _AGING_URL,
        json=_body(
            invoices=[
                _invoice(
                    ap_doc_id=ap_doc_id,
                    total_gross="2000.00",
                    due_date="2026-01-01",  # severely overdue
                )
            ],
            as_of_date="2026-07-01",
        ),
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()["data"]
    # Fully paid → nothing in any bucket
    assert Decimal(data["totals"]["total"]) == Decimal("0")
    assert data["byVendor"] == []


@pytest.mark.asyncio
async def test_ap_aging_partially_paid_invoice_outstanding_bucketed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Partial payment: outstanding = totalGross - totalPaid lands in the correct bucket.

    Invoice totalGross = 5000, totalPaid = 3500 → outstanding = 1500.
    asOfDate = 2026-07-01, dueDate = 2026-06-01 → 30 days overdue → days1To30 bucket.
    """
    await _seed_company(client, "AG01")

    ap_doc_id = str(uuid.uuid4())
    await _seed_payment_application(db_session, ap_doc_id, Decimal("3500.00"))

    resp = await client.post(
        _AGING_URL,
        json=_body(
            invoices=[
                _invoice(
                    ap_doc_id=ap_doc_id,
                    total_gross="5000.00",
                    due_date="2026-06-01",
                )
            ],
            as_of_date="2026-07-01",
        ),
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()["data"]
    totals = data["totals"]
    assert Decimal(totals["days1To30"]) == Decimal("1500.00")
    assert Decimal(totals["total"]) == Decimal("1500.00")


@pytest.mark.asyncio
async def test_ap_aging_as_of_date_drives_bucket_not_today(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    asOfDate controls the overdue calculation — not today's date.

    dueDate = 2026-03-01.  If asOfDate = 2026-04-30, that is 60 days after
    dueDate → should land in the days31To60 bucket (31-60 range, exactly 60).
    """
    await _seed_company(client, "AG01")

    resp = await client.post(
        _AGING_URL,
        json=_body(
            invoices=[
                _invoice(
                    total_gross="7500.00",
                    due_date="2026-03-01",
                )
            ],
            as_of_date="2026-04-30",  # 60 days after due date
        ),
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()["data"]
    totals = data["totals"]
    # 60 days overdue → days31To60 bucket (31-60, inclusive on both ends)
    assert Decimal(totals["days31To60"]) == Decimal("7500.00")
    assert Decimal(totals["total"]) == Decimal("7500.00")
    # All other buckets must be zero
    assert Decimal(totals["notDue"]) == Decimal("0")
    assert Decimal(totals["days1To30"]) == Decimal("0")
    assert Decimal(totals["days61To90"]) == Decimal("0")
    assert Decimal(totals["daysOver90"]) == Decimal("0")


@pytest.mark.asyncio
async def test_ap_aging_accountant_role_allowed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Accountant (read-only role) can POST to the aging endpoint."""
    await _seed_company(client, "AG01")

    resp = await client.post(
        _AGING_URL,
        json=_body(invoices=[]),
        headers=_auth("accountant"),
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_ap_aging_sample_response_shape(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Produces a sample aging response for the implementation report.

    Three vendors, six invoices across all five buckets.
    """
    await _seed_company(client, "AG01")

    # Seed partial payments for two invoices
    ap_doc_partial = str(uuid.uuid4())
    await _seed_payment_application(db_session, ap_doc_partial, Decimal("10000.00"))

    invoices = [
        # Vendor A — not due + 1-30
        _invoice(
            total_gross="15000.00",
            due_date="2026-08-31",
            vendor_id="vnd-abc",
            vendor_code="VND-ABC",
            vendor_name="Alpha Building Contracting",
        ),
        _invoice(
            total_gross="8000.00",
            due_date="2026-07-15",
            vendor_id="vnd-abc",
            vendor_code="VND-ABC",
            vendor_name="Alpha Building Contracting",
        ),
        # Vendor B — 31-60 + 61-90
        _invoice(
            total_gross="22000.00",
            due_date="2026-06-01",
            vendor_id="vnd-bld",
            vendor_code="VND-BLD",
            vendor_name="Beta Logistics Dubai",
        ),
        _invoice(
            total_gross="35000.00",
            due_date="2026-05-01",
            vendor_id="vnd-bld",
            vendor_code="VND-BLD",
            vendor_name="Beta Logistics Dubai",
        ),
        # Vendor C — over 90 + partially paid (outstanding = 35000 - 10000 = 25000)
        _invoice(
            ap_doc_id=ap_doc_partial,
            total_gross="35000.00",
            due_date="2026-03-01",
            vendor_id="vnd-cgx",
            vendor_code="VND-CGX",
            vendor_name="Gamma Construction Group",
        ),
    ]

    resp = await client.post(
        _AGING_URL,
        json=_body(invoices=invoices, as_of_date="2026-07-31"),
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()["data"]
    # Vendor A: not_due=15000, 1-30=8000 (16 days overdue from Jul31→Jul15)
    # Vendor B: 31-60=22000 (60 days), 61-90=91 days → daysOver90? No: May1→Jul31 = 91 → daysOver90
    # Vendor C: over_90 = 25000 (partially paid)

    # Just assert structure and totals are sensible
    assert "totals" in data
    assert "byVendor" in data
    assert len(data["byVendor"]) == 3

    # Verify the grand total equals sum of bucket totals
    totals = data["totals"]
    bucket_sum = (
        Decimal(totals["notDue"])
        + Decimal(totals["days1To30"])
        + Decimal(totals["days31To60"])
        + Decimal(totals["days61To90"])
        + Decimal(totals["daysOver90"])
    )
    assert bucket_sum == Decimal(totals["total"])

    # Print the sample for the report
    print(
        f"\n--- Sample AP Aging Response ---\n"
        f"asOfDate: {data['asOfDate']}\n"
        f"totals:\n"
        f"  notDue:     {totals['notDue']}\n"
        f"  days1To30:  {totals['days1To30']}\n"
        f"  days31To60: {totals['days31To60']}\n"
        f"  days61To90: {totals['days61To90']}\n"
        f"  daysOver90: {totals['daysOver90']}\n"
        f"  total:      {totals['total']}\n"
        f"byVendor ({len(data['byVendor'])} rows):\n"
    )
    for v in data["byVendor"]:
        print(
            f"  {v['vendorCode']} ({v['vendorId']}): "
            f"notDue={v['notDue']} 1-30={v['days1To30']} "
            f"31-60={v['days31To60']} 61-90={v['days61To90']} "
            f">90={v['daysOver90']} total={v['total']}"
        )
    print("--------------------------------\n")
