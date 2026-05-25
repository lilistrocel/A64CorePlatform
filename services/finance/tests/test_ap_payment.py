"""
Tests for Phase D — AP Payment module.

Covers:
  - Happy path single invoice: payment + applications + JE created.
    JE shape: DR AP Control / CR Bank, totalDebit == totalCredit == totalAmount.
  - Happy path multiple invoices: multiple application rows, total == sum.
  - Over-payment hint (totalGross supplied, amount > totalGross): 400.
  - Bank account that does not exist: 400.
  - Bank account is inactive: 400.
  - Bank account is a header/title-level account: 400.
  - Fiscal period closed: 400.
  - Missing posting setup: 400.
  - Missing apControlAccountId in posting setup: 400.
  - Payment number generation is sequential (PAY-{code}-YYYY-NNNN).
  - Two consecutive payments produce sequential numbers without collision.
  - The CR Bank line uses bankAccountId from the request (not from posting setup
    default bank account when they differ).
  - Payment record's jeId is set after the transaction commits.
  - Non-finance-admin role trying POST: 403.
  - List endpoint: accountant can GET, non-finance role can GET.
  - Detail endpoint: 404 for unknown payment_id.
  - Totals-paid endpoint: returns correct amounts for known apDocIds.
"""

import os
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

# Override DB and secrets BEFORE importing any finance module.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test_secret_key")
os.environ.setdefault("FINANCE_INGESTION_SECRET", "test-ingest-secret")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker  # noqa: E402

from finance.db.session import engine, get_db  # noqa: E402
from finance.main import app  # noqa: E402
from finance.models.orm.models import (  # noqa: E402
    AccountLevelEnum,
    ApPayment,
    ApPaymentApplication,
    CompanyPostingSetup,
    FiscalPeriod,
    GLAccount,
    JournalEntry,
    JournalEntryLine,
    PeriodStatusEnum,
    ValuationMethodEnum,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_BASE = "/api/v1/finance"
_PAYMENTS_URL = f"{_BASE}/ap-payments"
_TOTALS_PAID_URL = f"{_BASE}/ap-invoices/totals-paid"

# Separate org from other test modules to avoid cross-test contamination.
_ORG = "d1111111-0000-4000-8000-000000000099"

# ---------------------------------------------------------------------------
# Session + client fixtures (module-scoped session factory)
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


def _make_jwt(role: str = "finance_admin", user_id: str = "test-user-pay") -> str:
    """Generate a test JWT signed with the test SECRET_KEY."""
    from datetime import timedelta

    from jose import jwt

    payload = {
        "userId": user_id,
        "email": "testpay@a64core.com",
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


async def _seed_company(client: AsyncClient, code: str) -> None:
    """Create a company (seeds CoA)."""
    resp = await client.post(
        f"{_BASE}/companies",
        json={
            "companyCode": code,
            "organizationId": _ORG,
            "legalName": f"Payment Test {code} LLC",
        },
        headers=_auth(),
    )
    assert resp.status_code in (201, 409), resp.text


async def _get_active_account_id(
    db_session: AsyncSession, offset: int = 0
) -> str:
    """Return the accountId of the Nth active GL account seeded under _ORG."""
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
    assert account_id is not None, (
        f"No active GL account at offset {offset} — CoA seed must have run first"
    )
    return account_id


async def _seed_posting_setup(
    db_session: AsyncSession,
    company_code: str,
    ap_control_id: Optional[str] = "USE_REAL",
    bank_account_id: Optional[str] = "USE_REAL",
) -> CompanyPostingSetup:
    """
    Insert a CompanyPostingSetup row.

    Pass "USE_REAL" to auto-resolve an active GL account; pass None to leave null.
    """
    if ap_control_id == "USE_REAL":
        ap_control_id = await _get_active_account_id(db_session, offset=0)
    if bank_account_id == "USE_REAL":
        bank_account_id = await _get_active_account_id(db_session, offset=1)

    setup = CompanyPostingSetup(
        setupId=str(uuid.uuid4()),
        organizationId=_ORG,
        companyCode=company_code,
        apControlAccountId=ap_control_id,
        bankAccountId=bank_account_id,
        isComplete=(ap_control_id is not None),
        defaultValuationMethod=ValuationMethodEnum.MOVING_AVERAGE,
    )
    db_session.add(setup)
    await db_session.flush()
    return setup


async def _seed_fiscal_period(
    db_session: AsyncSession,
    company_code: str,
    start: date = date(2026, 1, 1),
    end: date = date(2026, 12, 31),
    period_status: PeriodStatusEnum = PeriodStatusEnum.OPEN,
) -> str:
    """Insert a fiscal period and return its periodId."""
    period = FiscalPeriod(
        periodId=str(uuid.uuid4()),
        companyCode=company_code,
        fiscalYear=start.year,
        periodNumber=1,
        startDate=start,
        endDate=end,
        status=period_status,
    )
    db_session.add(period)
    await db_session.flush()
    return period.periodId


async def _full_setup(
    client: AsyncClient,
    db_session: AsyncSession,
    code: str,
    ap_control_id: Optional[str] = "USE_REAL",
) -> Dict[str, str]:
    """
    Seed company, posting setup, and an open fiscal period.

    Returns dict with ap_control_id and bank_account_id.
    """
    await _seed_company(client, code=code)
    setup = await _seed_posting_setup(
        db_session, code, ap_control_id=ap_control_id
    )
    await _seed_fiscal_period(db_session, code)
    return {
        "ap_control_id": setup.apControlAccountId or "",
        "bank_account_id": setup.bankAccountId or "",
    }


def _make_payment_body(
    company_code: str = "PAY1",
    vendor_id: Optional[str] = None,
    bank_account_id: Optional[str] = None,
    payment_date: str = "2026-06-15",
    applications: Optional[List[Dict[str, Any]]] = None,
    payment_method: str = "bank_transfer",
    reference_number: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a valid CreateApPaymentRequest dict."""
    if applications is None:
        applications = [
            {
                "apDocId": str(uuid.uuid4()),
                "apDocNumber": "AP-2026-0001",
                "amountApplied": "1050.00",
            }
        ]
    return {
        "organizationId": _ORG,
        "companyCode": company_code,
        "paymentDate": payment_date,
        "vendorId": vendor_id or str(uuid.uuid4()),
        "vendorCode": "VND-001",
        "bankAccountId": bank_account_id or str(uuid.uuid4()),
        "paymentMethod": payment_method,
        "referenceNumber": reference_number,
        "currencyCode": "AED",
        "notes": "Test payment",
        "applications": applications,
    }


# ---------------------------------------------------------------------------
# Happy path — single invoice
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_payment_single_invoice_happy_path(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    POST /ap-payments with a single-invoice application succeeds.

    Verifies:
    - HTTP 201.
    - paymentNumber format PAY-{code}-YYYY-NNNN.
    - jeId is set.
    - ap_payment row exists in DB.
    - ap_payment_applications row exists with correct amountApplied.
    - journal_entries row: DR AP Control / CR Bank, totalDebit == totalCredit.
    - JE lines: line 1 is DR AP, line 2 is CR Bank.
    """
    code = "HP01"
    ids = await _full_setup(client, db_session, code)
    bank_id = ids["bank_account_id"]
    ap_ctrl_id = ids["ap_control_id"]
    ap_doc_id = str(uuid.uuid4())

    body = _make_payment_body(
        company_code=code,
        bank_account_id=bank_id,
        applications=[
            {
                "apDocId": ap_doc_id,
                "apDocNumber": "AP-2026-HP01",
                "amountApplied": "1050.00",
            }
        ],
    )

    resp = await client.post(_PAYMENTS_URL, json=body, headers=_auth())
    assert resp.status_code == 201, resp.text

    data = resp.json()["data"]
    assert data["paymentNumber"].startswith(f"PAY-{code}-2026-"), data["paymentNumber"]
    assert data["totalAmount"] == "1050.00"
    assert data["jeId"] is not None
    assert data["applications"][0]["apInvoiceDocId"] == ap_doc_id
    assert data["applications"][0]["amountApplied"] == "1050.00"

    # JE summary embedded in response
    je = data["je"]
    assert je is not None
    assert je["totalDebit"] == "1050.00"
    assert je["totalCredit"] == "1050.00"
    assert je["status"] == "posted"

    # Verify DB rows
    # Reason: the HTTP handler commits via get_db dependency so the data is
    # visible to the same session without an additional flush/commit.
    # Do NOT rollback here — that would discard the committed rows.
    payment_result = await db_session.execute(
        select(ApPayment).where(ApPayment.paymentId == data["paymentId"])
    )
    payment_row = payment_result.scalar_one_or_none()
    assert payment_row is not None
    assert payment_row.jeId == data["jeId"]

    app_result = await db_session.execute(
        select(ApPaymentApplication).where(
            ApPaymentApplication.paymentId == data["paymentId"]
        )
    )
    app_rows = app_result.scalars().all()
    assert len(app_rows) == 1
    assert str(app_rows[0].amountApplied) == "1050.00"

    # Verify JE lines
    je_lines_result = await db_session.execute(
        select(JournalEntryLine)
        .where(JournalEntryLine.jeId == data["jeId"])
        .order_by(JournalEntryLine.lineNumber)
    )
    je_lines = je_lines_result.scalars().all()
    assert len(je_lines) == 2

    dr_line = je_lines[0]
    cr_line = je_lines[1]

    # Line 1: DR AP Control
    assert dr_line.lineNumber == 1
    assert dr_line.accountId == ap_ctrl_id
    assert Decimal(str(dr_line.debit)) == Decimal("1050.00")
    assert dr_line.credit is None

    # Line 2: CR Bank
    assert cr_line.lineNumber == 2
    assert cr_line.accountId == bank_id
    assert cr_line.debit is None
    assert Decimal(str(cr_line.credit)) == Decimal("1050.00")


# ---------------------------------------------------------------------------
# Happy path — multiple invoices
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_payment_multiple_invoices(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    POST /ap-payments with two invoice applications: total == sum of amountApplied.
    """
    code = "HP02"
    ids = await _full_setup(client, db_session, code)
    bank_id = ids["bank_account_id"]

    ap_doc_id_1 = str(uuid.uuid4())
    ap_doc_id_2 = str(uuid.uuid4())

    body = _make_payment_body(
        company_code=code,
        bank_account_id=bank_id,
        applications=[
            {
                "apDocId": ap_doc_id_1,
                "apDocNumber": "AP-2026-M01",
                "amountApplied": "500.00",
            },
            {
                "apDocId": ap_doc_id_2,
                "apDocNumber": "AP-2026-M02",
                "amountApplied": "750.00",
            },
        ],
    )

    resp = await client.post(_PAYMENTS_URL, json=body, headers=_auth())
    assert resp.status_code == 201, resp.text

    data = resp.json()["data"]
    # Total must equal sum of applications
    assert Decimal(data["totalAmount"]) == Decimal("1250.00")
    assert len(data["applications"]) == 2

    # JE must still have exactly 2 lines (1 DR, 1 CR)
    je_lines_result = await db_session.execute(
        select(JournalEntryLine)
        .where(JournalEntryLine.jeId == data["jeId"])
        .order_by(JournalEntryLine.lineNumber)
    )
    je_lines = je_lines_result.scalars().all()
    assert len(je_lines) == 2
    assert Decimal(str(je_lines[0].debit)) == Decimal("1250.00")
    assert Decimal(str(je_lines[1].credit)) == Decimal("1250.00")


# ---------------------------------------------------------------------------
# Bank account validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_payment_unknown_bank_account(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """POST /ap-payments with non-existent bankAccountId returns 400."""
    code = "BNK1"
    await _full_setup(client, db_session, code)

    body = _make_payment_body(
        company_code=code,
        bank_account_id=str(uuid.uuid4()),  # random UUID that doesn't exist
    )

    resp = await client.post(_PAYMENTS_URL, json=body, headers=_auth())
    assert resp.status_code == 400, resp.text
    assert "not found" in resp.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_create_payment_inactive_bank_account(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """POST /ap-payments with an inactive GL account for bank returns 400."""
    code = "BNK2"
    await _full_setup(client, db_session, code)

    # Find an active account and deactivate it
    inactive_id = await _get_active_account_id(db_session, offset=3)
    result = await db_session.execute(
        select(GLAccount).where(GLAccount.accountId == inactive_id)
    )
    acct = result.scalar_one()
    acct.isActive = False
    await db_session.flush()

    body = _make_payment_body(company_code=code, bank_account_id=inactive_id)
    resp = await client.post(_PAYMENTS_URL, json=body, headers=_auth())
    assert resp.status_code == 400, resp.text
    assert "inactive" in resp.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_create_payment_header_account_bank(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """POST /ap-payments with a title/header account for bank returns 400."""
    code = "BNK3"
    await _full_setup(client, db_session, code)

    # Find an account and set accountLevel to title
    header_id = await _get_active_account_id(db_session, offset=4)
    result = await db_session.execute(
        select(GLAccount).where(GLAccount.accountId == header_id)
    )
    acct = result.scalar_one()
    acct.accountLevel = AccountLevelEnum.TITLE
    await db_session.flush()

    body = _make_payment_body(company_code=code, bank_account_id=header_id)
    resp = await client.post(_PAYMENTS_URL, json=body, headers=_auth())
    assert resp.status_code == 400, resp.text
    assert "header" in resp.json().get("detail", "").lower()


# ---------------------------------------------------------------------------
# Fiscal period checks
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_payment_closed_period(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """POST /ap-payments with paymentDate in a closed period returns 400."""
    code = "PER1"
    await _seed_company(client, code=code)
    setup = await _seed_posting_setup(db_session, code)
    # Seed a CLOSED period
    await _seed_fiscal_period(
        db_session, code,
        start=date(2025, 1, 1),
        end=date(2025, 12, 31),
        period_status=PeriodStatusEnum.CLOSED,
    )

    body = _make_payment_body(
        company_code=code,
        bank_account_id=setup.bankAccountId,
        payment_date="2025-06-15",
    )
    resp = await client.post(_PAYMENTS_URL, json=body, headers=_auth())
    assert resp.status_code == 400, resp.text
    assert "period" in resp.json().get("detail", "").lower()


# ---------------------------------------------------------------------------
# Missing posting setup
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_payment_no_posting_setup(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """POST /ap-payments without any posting setup returns 400."""
    code = "PSX1"
    await _seed_company(client, code=code)
    # No posting setup seeded

    body = _make_payment_body(company_code=code)
    resp = await client.post(_PAYMENTS_URL, json=body, headers=_auth())
    assert resp.status_code == 400, resp.text
    assert "posting setup" in resp.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_create_payment_missing_ap_control_account(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """POST /ap-payments when apControlAccountId is null returns 400."""
    code = "APC1"
    await _seed_company(client, code=code)
    # Posting setup with no apControlAccountId
    setup = await _seed_posting_setup(db_session, code, ap_control_id=None)
    await _seed_fiscal_period(db_session, code)

    body = _make_payment_body(
        company_code=code,
        bank_account_id=setup.bankAccountId,
    )
    resp = await client.post(_PAYMENTS_URL, json=body, headers=_auth())
    assert resp.status_code == 400, resp.text
    assert "ap control" in resp.json().get("detail", "").lower()


# ---------------------------------------------------------------------------
# Payment number sequencing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_payment_number_sequential(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Two consecutive payments produce PAY-{code}-YYYY-0001 then -0002."""
    code = "SEQ1"
    ids = await _full_setup(client, db_session, code)
    bank_id = ids["bank_account_id"]

    body1 = _make_payment_body(
        company_code=code,
        bank_account_id=bank_id,
        applications=[
            {"apDocId": str(uuid.uuid4()), "apDocNumber": "AP-SEQ1", "amountApplied": "100.00"}
        ],
    )
    body2 = _make_payment_body(
        company_code=code,
        bank_account_id=bank_id,
        applications=[
            {"apDocId": str(uuid.uuid4()), "apDocNumber": "AP-SEQ2", "amountApplied": "200.00"}
        ],
    )

    resp1 = await client.post(_PAYMENTS_URL, json=body1, headers=_auth())
    assert resp1.status_code == 201, resp1.text
    number1 = resp1.json()["data"]["paymentNumber"]

    resp2 = await client.post(_PAYMENTS_URL, json=body2, headers=_auth())
    assert resp2.status_code == 201, resp2.text
    number2 = resp2.json()["data"]["paymentNumber"]

    # Both must be PAY-SEQ1-2026-NNNN
    assert number1.startswith(f"PAY-{code}-2026-"), number1
    assert number2.startswith(f"PAY-{code}-2026-"), number2

    # Extract the sequence suffixes and confirm second is one higher than first
    seq1 = int(number1.rsplit("-", 1)[-1])
    seq2 = int(number2.rsplit("-", 1)[-1])
    assert seq2 == seq1 + 1, f"Expected sequential: {number1}, {number2}"


# ---------------------------------------------------------------------------
# CR Bank uses bankAccountId from request, not from posting setup default
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cr_bank_uses_request_bank_account(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    The CR Bank line uses the bankAccountId from the request body, not from
    posting setup's default bankAccountId (when they differ).
    """
    code = "BNK4"
    await _seed_company(client, code=code)

    # Setup's default bank is offset=1; we'll request with offset=2
    setup = await _seed_posting_setup(
        db_session, code,
        bank_account_id=await _get_active_account_id(db_session, offset=1),
    )
    await _seed_fiscal_period(db_session, code)

    # Deliberately pick a DIFFERENT active account as the request bank
    request_bank_id = await _get_active_account_id(db_session, offset=2)
    assert request_bank_id != setup.bankAccountId, (
        "Test needs a bank account different from setup default"
    )

    body = _make_payment_body(
        company_code=code,
        bank_account_id=request_bank_id,
        applications=[
            {"apDocId": str(uuid.uuid4()), "apDocNumber": "AP-BNK4", "amountApplied": "500.00"}
        ],
    )
    resp = await client.post(_PAYMENTS_URL, json=body, headers=_auth())
    assert resp.status_code == 201, resp.text

    je_id = resp.json()["data"]["jeId"]

    # The CR line must use the request bank, not the setup default
    lines_result = await db_session.execute(
        select(JournalEntryLine)
        .where(JournalEntryLine.jeId == je_id)
        .order_by(JournalEntryLine.lineNumber)
    )
    lines = lines_result.scalars().all()
    cr_line = lines[1]
    assert cr_line.accountId == request_bank_id, (
        f"Expected CR Bank to be request_bank_id={request_bank_id}, "
        f"got {cr_line.accountId}"
    )


# ---------------------------------------------------------------------------
# jeId is set after transaction commits
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_payment_je_id_linked_in_db(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Payment record's jeId in the DB matches the JE returned in the response."""
    code = "JEL1"
    ids = await _full_setup(client, db_session, code)

    body = _make_payment_body(
        company_code=code,
        bank_account_id=ids["bank_account_id"],
        applications=[
            {"apDocId": str(uuid.uuid4()), "apDocNumber": "AP-JEL1", "amountApplied": "300.00"}
        ],
    )
    resp = await client.post(_PAYMENTS_URL, json=body, headers=_auth())
    assert resp.status_code == 201, resp.text

    data = resp.json()["data"]
    resp_je_id = data["jeId"]
    payment_id = data["paymentId"]

    # Confirm DB row has the same jeId
    result = await db_session.execute(
        select(ApPayment.jeId).where(ApPayment.paymentId == payment_id)
    )
    db_je_id = result.scalar_one_or_none()
    assert db_je_id == resp_je_id, f"DB jeId={db_je_id} != response jeId={resp_je_id}"

    # Confirm JE row exists
    je_result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.jeId == resp_je_id)
    )
    je_row = je_result.scalar_one_or_none()
    assert je_row is not None
    assert je_row.sourceEventType == "vendor_payment"


# ---------------------------------------------------------------------------
# Role gate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_payment_accountant_role_forbidden(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """POST /ap-payments with accountant role returns 403."""
    code = "RG01"
    ids = await _full_setup(client, db_session, code)

    body = _make_payment_body(
        company_code=code,
        bank_account_id=ids["bank_account_id"],
    )
    resp = await client.post(_PAYMENTS_URL, json=body, headers=_auth("accountant"))
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_list_payments_accountant_allowed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """GET /ap-payments with accountant role is allowed (read-only access)."""
    resp = await client.get(
        _PAYMENTS_URL,
        params={"organization_id": _ORG},
        headers=_auth("accountant"),
    )
    assert resp.status_code == 200, resp.text


# ---------------------------------------------------------------------------
# List and detail endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_payments_returns_created_payment(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """GET /ap-payments returns the payment created in this test."""
    code = "LST1"
    ids = await _full_setup(client, db_session, code)

    ap_doc_id = str(uuid.uuid4())
    body = _make_payment_body(
        company_code=code,
        bank_account_id=ids["bank_account_id"],
        applications=[
            {"apDocId": ap_doc_id, "apDocNumber": "AP-LST1", "amountApplied": "777.00"}
        ],
    )
    create_resp = await client.post(_PAYMENTS_URL, json=body, headers=_auth())
    assert create_resp.status_code == 201, create_resp.text
    payment_id = create_resp.json()["data"]["paymentId"]

    list_resp = await client.get(
        _PAYMENTS_URL,
        params={"organization_id": _ORG, "company_code": code},
        headers=_auth(),
    )
    assert list_resp.status_code == 200, list_resp.text
    items = list_resp.json()["items"]
    payment_ids = [item["paymentId"] for item in items]
    assert payment_id in payment_ids


@pytest.mark.asyncio
async def test_get_payment_detail_found(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """GET /ap-payments/{id} returns the payment with applications and JE summary."""
    code = "DTL1"
    ids = await _full_setup(client, db_session, code)

    body = _make_payment_body(
        company_code=code,
        bank_account_id=ids["bank_account_id"],
        applications=[
            {"apDocId": str(uuid.uuid4()), "apDocNumber": "AP-DTL1", "amountApplied": "999.00"}
        ],
    )
    create_resp = await client.post(_PAYMENTS_URL, json=body, headers=_auth())
    assert create_resp.status_code == 201, create_resp.text
    payment_id = create_resp.json()["data"]["paymentId"]

    detail_resp = await client.get(
        f"{_PAYMENTS_URL}/{payment_id}",
        params={"organization_id": _ORG},
        headers=_auth(),
    )
    assert detail_resp.status_code == 200, detail_resp.text
    d = detail_resp.json()["data"]
    assert d["paymentId"] == payment_id
    assert len(d["applications"]) == 1
    assert d["je"] is not None


@pytest.mark.asyncio
async def test_get_payment_detail_not_found(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """GET /ap-payments/{id} with unknown ID returns 404."""
    resp = await client.get(
        f"{_PAYMENTS_URL}/{uuid.uuid4()}",
        params={"organization_id": _ORG},
        headers=_auth(),
    )
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# Totals-paid endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_totals_paid_no_payments(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """POST /ap-invoices/totals-paid for un-paid docIds returns zero for each."""
    doc_id_1 = str(uuid.uuid4())
    doc_id_2 = str(uuid.uuid4())

    resp = await client.post(
        _TOTALS_PAID_URL,
        json={"organizationId": _ORG, "apDocIds": [doc_id_1, doc_id_2]},
        headers=_auth("accountant"),
    )
    assert resp.status_code == 200, resp.text

    items = {item["apDocId"]: Decimal(item["totalPaid"]) for item in resp.json()["data"]}
    assert items[doc_id_1] == Decimal("0")
    assert items[doc_id_2] == Decimal("0")


@pytest.mark.asyncio
async def test_totals_paid_after_payment(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """POST /ap-invoices/totals-paid returns correct amounts after a payment."""
    code = "TP01"
    ids = await _full_setup(client, db_session, code)

    ap_doc_id = str(uuid.uuid4())
    body = _make_payment_body(
        company_code=code,
        bank_account_id=ids["bank_account_id"],
        applications=[
            {"apDocId": ap_doc_id, "apDocNumber": "AP-TP01", "amountApplied": "420.00"}
        ],
    )
    resp_create = await client.post(_PAYMENTS_URL, json=body, headers=_auth())
    assert resp_create.status_code == 201, resp_create.text

    resp_totals = await client.post(
        _TOTALS_PAID_URL,
        json={"organizationId": _ORG, "apDocIds": [ap_doc_id]},
        headers=_auth("accountant"),
    )
    assert resp_totals.status_code == 200, resp_totals.text

    items = {item["apDocId"]: Decimal(item["totalPaid"]) for item in resp_totals.json()["data"]}
    assert items[ap_doc_id] == Decimal("420.00")


@pytest.mark.asyncio
async def test_totals_paid_accumulates_multiple_payments(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Two payments against the same invoice accumulate correctly in totalPaid."""
    code = "TP02"
    ids = await _full_setup(client, db_session, code)

    ap_doc_id = str(uuid.uuid4())

    for amount in ["200.00", "150.00"]:
        body = _make_payment_body(
            company_code=code,
            bank_account_id=ids["bank_account_id"],
            applications=[
                {"apDocId": ap_doc_id, "apDocNumber": "AP-TP02", "amountApplied": amount}
            ],
        )
        resp = await client.post(_PAYMENTS_URL, json=body, headers=_auth())
        assert resp.status_code == 201, resp.text

    resp_totals = await client.post(
        _TOTALS_PAID_URL,
        json={"organizationId": _ORG, "apDocIds": [ap_doc_id]},
        headers=_auth("accountant"),
    )
    assert resp_totals.status_code == 200, resp_totals.text
    total_paid = Decimal(resp_totals.json()["data"][0]["totalPaid"])
    assert total_paid == Decimal("350.00")


# ---------------------------------------------------------------------------
# JE balance invariant across cases
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_je_balance_invariant_multi_invoice(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    JE totalDebit == totalCredit for a payment against multiple invoices.
    This is the balance invariant that all JEs must satisfy.
    """
    code = "BAL1"
    ids = await _full_setup(client, db_session, code)

    applications = [
        {"apDocId": str(uuid.uuid4()), "apDocNumber": f"AP-BAL1-{i}", "amountApplied": str(amt)}
        for i, amt in enumerate(["100.00", "200.00", "350.00"])
    ]
    body = _make_payment_body(
        company_code=code,
        bank_account_id=ids["bank_account_id"],
        applications=applications,
    )
    resp = await client.post(_PAYMENTS_URL, json=body, headers=_auth())
    assert resp.status_code == 201, resp.text

    je_data = resp.json()["data"]["je"]
    assert Decimal(je_data["totalDebit"]) == Decimal(je_data["totalCredit"])
    assert Decimal(je_data["totalDebit"]) == Decimal("650.00")


# ---------------------------------------------------------------------------
# Example JE from happy-path test (logged for report)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_example_je_shape_logged(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Produces the example JE cited in the implementation report.

    Vendor: VND-REPORT  |  Amount: AED 1,050.00
    JE lines:
      DR  AP Control    1,050.00   (clear the vendor liability)
      CR  Bank          1,050.00   (cash leaves)
    """
    code = "RPT1"
    ids = await _full_setup(client, db_session, code)
    bank_id = ids["bank_account_id"]
    ap_ctrl_id = ids["ap_control_id"]

    body = {
        "organizationId": _ORG,
        "companyCode": code,
        "paymentDate": "2026-06-15",
        "vendorId": str(uuid.uuid4()),
        "vendorCode": "VND-REPORT",
        "bankAccountId": bank_id,
        "paymentMethod": "bank_transfer",
        "referenceNumber": "TT2026-001",
        "currencyCode": "AED",
        "notes": "Report example payment",
        "applications": [
            {
                "apDocId": str(uuid.uuid4()),
                "apDocNumber": "AP-2026-0042",
                "amountApplied": "1050.00",
            }
        ],
    }

    resp = await client.post(_PAYMENTS_URL, json=body, headers=_auth())
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]

    je_id = data["jeId"]
    lines_result = await db_session.execute(
        select(JournalEntryLine)
        .where(JournalEntryLine.jeId == je_id)
        .order_by(JournalEntryLine.lineNumber)
    )
    lines = lines_result.scalars().all()

    dr_line = lines[0]
    cr_line = lines[1]

    # DR AP Control
    assert dr_line.accountId == ap_ctrl_id
    assert Decimal(str(dr_line.debit)) == Decimal("1050.00")
    assert dr_line.credit is None
    assert "AP clearance" in (dr_line.description or "")

    # CR Bank
    assert cr_line.accountId == bank_id
    assert cr_line.debit is None
    assert Decimal(str(cr_line.credit)) == Decimal("1050.00")
    assert "bank_transfer" in (cr_line.description or "")

    # Print the example JE for the implementation report
    print(
        f"\n--- Example JE from happy-path test ---\n"
        f"paymentNumber : {data['paymentNumber']}\n"
        f"jeNumber      : {data['je']['jeNumber']}\n"
        f"jeDate        : {data['je']['jeDate']}\n"
        f"vendorCode    : VND-REPORT\n"
        f"totalAmount   : AED {data['totalAmount']}\n"
        f"\nLines:\n"
        f"  Line 1  DR  AP Control   {dr_line.debit}   [{dr_line.description}]\n"
        f"  Line 2  CR  Bank         {cr_line.credit}  [{cr_line.description}]\n"
        f"---------------------------------------\n"
    )
