"""
Tests for Phase C.5 — _handle_ap_invoice_posted posting handler.

Covers:
  - Happy path zero variance: invoiceUnitPrice == poUnitPrice → JE has
    DR GR/IR + DR VAT + CR AP, no variance line, balances.
  - Positive variance: invoice > PO → 4-line JE with DR PPV line.
  - Negative variance: invoice < PO → 4-line JE with CR PPV line.
  - Zero VAT (taxCode Z/E/N): no DR Input VAT line produced.
  - Missing posting setup → 400.
  - Missing apControlAccountId → 400.
  - Variance > 0 but purchasePriceVarianceAccountId is null → 400.
  - Variance = 0 and purchasePriceVarianceAccountId null → 200 (no PPV line needed).
  - JE totalDebit == totalCredit in every case (balance invariant).
  - referenceLineId on AP Control CR line equals vendorId (sub-ledger prep).

  PM item 2 — tax-point rule (UAE VAT Article 25):
  - dateOfSupply earlier than invoiceDate → VAT line description shows dateOfSupply
  - invoiceDate earlier than dateOfSupply → VAT line description shows invoiceDate

  PM item 3 — reverse-charge VAT mechanism:
  - All-standard-tax invoice → existing behaviour unchanged.
  - All-reverse-charge invoice → DR Input VAT + CR Output VAT same amount,
    DR GR/IR for expectedNet, CR AP for lineNet only. JE balanced.
  - Mixed invoice (some S, some SR) → partial RC, AP credit computed per-line.
  - Reverse-charge with outputVatAccountId null → 400.

Accounting balance proof (from handler docstring):
  Standard (all S):  DR = expectedNet + v + tax;  CR = gross + |v| or 0  ✓
  All RC (all SR):   DR = expectedNet + tax;
                     CR = net (AP) + tax (Output VAT) ✓
  Mixed:             Proof holds per-line aggregation.
"""

import os
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

# Override DB and secrets BEFORE importing any finance module.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test_secret_key")
os.environ["FINANCE_INGESTION_SECRET"] = "test-ingest-secret"

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker  # noqa: E402

from finance.db.session import engine, get_db  # noqa: E402
from finance.main import app  # noqa: E402
from finance.models.orm.models import (  # noqa: E402
    AccountLevelEnum,
    CompanyPostingSetup,
    FiscalPeriod,
    GLAccount,
    JournalEntry,
    JournalEntryLine,
    PeriodStatusEnum,
    TaxCode,
    ValuationMethodEnum,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_INGEST_URL = "/api/v1/finance/events/ingest"
_VALID_SECRET = "test-ingest-secret"
# Reason: fixed UUID keeps tests consistent across module; stored as string.
_ORG_UUID = "b0000000-0000-4000-8000-000000000002"
_ORG = _ORG_UUID


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
# Seed helpers
# ---------------------------------------------------------------------------


def _make_jwt(role: str = "finance_admin") -> str:
    """Generate a test JWT signed with the test SECRET_KEY."""
    from datetime import timedelta

    from jose import jwt

    payload = {
        "userId": "test-user-ap",
        "email": "test@a64core.com",
        "role": role,
        "type": "access",
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, "test_secret_key", algorithm="HS256")


async def _seed_company(client: AsyncClient, code: str) -> None:
    """Create a company (seeds CoA)."""
    resp = await client.post(
        "/api/v1/finance/companies",
        json={
            "companyCode": code,
            "organizationId": _ORG,
            "legalName": f"AP Test Company {code} LLC",
        },
        headers={"Authorization": "Bearer " + _make_jwt()},
    )
    assert resp.status_code in (201, 409), resp.text


async def _get_active_account_id(
    db_session: AsyncSession,
    organization_id: str,
    offset: int = 0,
) -> str:
    """Return the accountId of an active GL account (with optional offset)."""
    result = await db_session.execute(
        select(GLAccount.accountId)
        .where(
            GLAccount.organizationId == organization_id,
            GLAccount.isActive == True,  # noqa: E712
            GLAccount.accountLevel == AccountLevelEnum.ACTIVE,
        )
        .offset(offset)
        .limit(1)
    )
    account_id = result.scalar_one_or_none()
    assert account_id is not None, (
        f"No active GL account at offset {offset} — CoA seed must run first"
    )
    return account_id


async def _seed_posting_setup(
    db_session: AsyncSession,
    organization_id: str,
    company_code: str,
    ap_control_id: Optional[str] = "USE_REAL",
    grIr_id: Optional[str] = "USE_REAL",
    input_vat_id: Optional[str] = "USE_REAL",
    ppv_id: Optional[str] = "USE_REAL",
    output_vat_id: Optional[str] = "USE_REAL",
) -> CompanyPostingSetup:
    """
    Insert a CompanyPostingSetup row.

    Pass "USE_REAL" to auto-resolve an active GL account; pass None to leave
    the field null (simulates unconfigured state); pass an explicit ID to use it.

    Args:
        ap_control_id:  "USE_REAL" → auto-pick offset=0; None → null.
        grIr_id:        "USE_REAL" → auto-pick offset=1; None → null.
        input_vat_id:   "USE_REAL" → auto-pick offset=2; None → null.
        ppv_id:         "USE_REAL" → auto-pick offset=3; None → null.
        output_vat_id:  "USE_REAL" → auto-pick offset=4; None → null.
    """
    if ap_control_id == "USE_REAL":
        ap_control_id = await _get_active_account_id(db_session, organization_id, offset=0)
    if grIr_id == "USE_REAL":
        grIr_id = await _get_active_account_id(db_session, organization_id, offset=1)
    if input_vat_id == "USE_REAL":
        input_vat_id = await _get_active_account_id(db_session, organization_id, offset=2)
    if ppv_id == "USE_REAL":
        ppv_id = await _get_active_account_id(db_session, organization_id, offset=3)
    if output_vat_id == "USE_REAL":
        output_vat_id = await _get_active_account_id(db_session, organization_id, offset=4)

    setup = CompanyPostingSetup(
        setupId=str(uuid.uuid4()),
        organizationId=organization_id,
        companyCode=company_code,
        apControlAccountId=ap_control_id,
        grIrClearingAccountId=grIr_id,
        inputVatAccountId=input_vat_id,
        outputVatAccountId=output_vat_id,
        purchasePriceVarianceAccountId=ppv_id,
        isComplete=(ap_control_id is not None and grIr_id is not None),
    )
    db_session.add(setup)
    await db_session.flush()
    return setup


async def _seed_fiscal_period(
    db_session: AsyncSession,
    company_code: str,
    start: date = date(2026, 1, 1),
    end: date = date(2026, 12, 31),
    status: PeriodStatusEnum = PeriodStatusEnum.OPEN,
) -> str:
    """Insert a fiscal period and return its periodId."""
    period = FiscalPeriod(
        periodId=str(uuid.uuid4()),
        companyCode=company_code,
        fiscalYear=start.year,
        periodNumber=1,
        startDate=start,
        endDate=end,
        status=status,
    )
    db_session.add(period)
    await db_session.flush()
    return period.periodId


def _make_ap_line(
    line_number: int = 1,
    item_id: Optional[str] = None,
    item_code: str = "FERT-001",
    quantity: str = "10.000",
    po_unit_price: str = "100.00",
    invoice_unit_price: str = "100.00",
    tax_code: str = "S",
    tax_rate: str = "0.05",
) -> Dict[str, Any]:
    """
    Build an ApInvoiceLine dict.

    Computes lineNet, lineTax, lineGross, priceVarianceAmount automatically from
    the provided prices so tests stay arithmetically honest.
    """
    qty = Decimal(quantity)
    po_price = Decimal(po_unit_price)
    inv_price = Decimal(invoice_unit_price)
    rate = Decimal(tax_rate)

    line_net = (qty * inv_price).quantize(Decimal("0.01"))
    line_tax = (line_net * rate).quantize(Decimal("0.01"))
    line_gross = line_net + line_tax
    variance = ((inv_price - po_price) * qty).quantize(Decimal("0.01"))

    return {
        "lineNumber": line_number,
        "itemId": item_id or str(uuid.uuid4()),
        "itemCode": item_code,
        "itemName": f"Item {item_code}",
        "itemType": "raw_material",
        "quantity": str(qty),
        "uom": "KG",
        "poUnitPrice": str(po_price),
        "invoiceUnitPrice": str(inv_price),
        "priceVarianceAmount": str(variance),
        "lineNet": str(line_net),
        "lineTax": str(line_tax),
        "lineGross": str(line_gross),
        "taxCode": tax_code,
        "grLineId": str(uuid.uuid4()),
        "baseLineId": str(uuid.uuid4()),
    }


def _make_ap_event(
    organization_id: str = _ORG_UUID,
    company_code: str = "AP01",
    ap_date: str = "2026-06-15",
    lines: Optional[List[Dict[str, Any]]] = None,
    event_id: Optional[str] = None,
    vendor_id: Optional[str] = None,
    vendor_code: str = "VND-001",
    invoice_number: str = "INV-2026-001",
    invoice_date: str = "2026-06-14",
    date_of_supply: str = "2026-06-10",
    gr_doc_number: str = "GR-2026-0001",
) -> Dict[str, Any]:
    """
    Return a valid ap_invoice_posted event dict.

    Totals are computed from lines so the event is arithmetically consistent.

    Args:
        date_of_supply: ISO date for UAE VAT Article 25 tax-point rule (GR date).
        invoice_date: The vendor's invoice date.  tax_point = min(date_of_supply,
            invoice_date).
    """
    if lines is None:
        lines = [_make_ap_line()]

    vendor_id = vendor_id or str(uuid.uuid4())
    total_net = sum(Decimal(str(ln["lineNet"])) for ln in lines)
    total_tax = sum(Decimal(str(ln["lineTax"])) for ln in lines)
    total_gross = sum(Decimal(str(ln["lineGross"])) for ln in lines)
    total_variance = sum(Decimal(str(ln["priceVarianceAmount"])) for ln in lines)

    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "ap_invoice_posted",
        "organizationId": organization_id,
        "companyCode": company_code,
        "occurredAt": datetime.utcnow().isoformat(),
        "sourceUserId": str(uuid.uuid4()),
        "payload": {
            "apDocId": str(uuid.uuid4()),
            "apDocNumber": f"AP-2026-{uuid.uuid4().hex[:4].upper()}",
            "apDate": ap_date,
            "invoiceNumber": invoice_number,
            "invoiceDate": invoice_date,
            "dueDate": "2026-07-14",
            # Reason: UAE VAT Article 25 tax-point field. Default is earlier than
            # invoiceDate so most tests verify the tax point resolves to dateOfSupply.
            "dateOfSupply": date_of_supply,
            "grDocId": str(uuid.uuid4()),
            "grDocNumber": gr_doc_number,
            "poDocId": str(uuid.uuid4()),
            "poDocNumber": "PO-2026-0001",
            "vendorId": vendor_id,
            "vendorCode": vendor_code,
            "companyCode": company_code,
            "paymentTermsCode": "NET30",
            "lines": lines,
            "currencyCode": "AED",
            "totalNetAmount": str(total_net),
            "totalTaxAmount": str(total_tax),
            "totalGrossAmount": str(total_gross),
            "totalPriceVariance": str(total_variance),
        },
    }


# ---------------------------------------------------------------------------
# Full-setup fixture factory
# ---------------------------------------------------------------------------


async def _seed_tax_code(
    db_session: AsyncSession,
    organization_id: str,
    tax_code: str,
    is_reverse_charge: bool = False,
    rate: str = "5.00",
    input_account_id: Optional[str] = None,
    output_account_id: Optional[str] = None,
) -> None:
    """
    Insert a TaxCode row for tests that exercise reverse-charge behaviour.

    The finance handler queries tax_codes by (organizationId, taxCode) to
    determine the isReverseCharge flag for each invoice line.

    Args:
        db_session: Active test session.
        organization_id: Organisation scope for the tax code.
        tax_code: The tax code string (e.g. 'S', 'SR').
        is_reverse_charge: Whether this code uses reverse-charge self-accounting.
        rate: Tax rate percentage string.
        input_account_id: Optional GL account for input tax.
        output_account_id: Optional GL account for output tax.
    """
    existing = await db_session.scalar(
        select(TaxCode.taxCode).where(
            TaxCode.organizationId == organization_id,
            TaxCode.taxCode == tax_code,
        )
    )
    if existing:
        return  # Idempotent — already seeded
    tc = TaxCode(
        organizationId=organization_id,
        taxCode=tax_code,
        description=f"Test tax code {tax_code}",
        rate=Decimal(rate),
        inputTaxAccountId=input_account_id,
        outputTaxAccountId=output_account_id,
        isReverseCharge=is_reverse_charge,
        isActive=True,
    )
    db_session.add(tc)
    await db_session.flush()


async def _setup_standard(
    client: AsyncClient,
    db_session: AsyncSession,
    company_code: str,
    ppv_id: Optional[str] = "USE_REAL",
    output_vat_id: Optional[str] = "USE_REAL",
) -> Dict[str, str]:
    """
    Seed company, posting setup (all 5 accounts), and a fiscal period.

    Returns dict with keys: ap_control_id, grIr_id, input_vat_id, ppv_id,
    output_vat_id.
    """
    await _seed_company(client, code=company_code)

    ap_control_id = await _get_active_account_id(db_session, _ORG, offset=0)
    grIr_id = await _get_active_account_id(db_session, _ORG, offset=1)
    input_vat_id = await _get_active_account_id(db_session, _ORG, offset=2)

    real_ppv_id: Optional[str] = None
    if ppv_id == "USE_REAL":
        real_ppv_id = await _get_active_account_id(db_session, _ORG, offset=3)
    else:
        real_ppv_id = ppv_id  # None or explicit

    real_output_vat_id: Optional[str] = None
    if output_vat_id == "USE_REAL":
        real_output_vat_id = await _get_active_account_id(db_session, _ORG, offset=4)
    else:
        real_output_vat_id = output_vat_id  # None or explicit

    await _seed_posting_setup(
        db_session,
        _ORG,
        company_code,
        ap_control_id=ap_control_id,
        grIr_id=grIr_id,
        input_vat_id=input_vat_id,
        ppv_id=real_ppv_id,
        output_vat_id=real_output_vat_id,
    )
    await _seed_fiscal_period(db_session, company_code)

    return {
        "ap_control_id": ap_control_id,
        "grIr_id": grIr_id,
        "input_vat_id": input_vat_id,
        "ppv_id": real_ppv_id,
        "output_vat_id": real_output_vat_id,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_zero_variance(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Happy path: invoiceUnitPrice == poUnitPrice → no variance.

    Expected JE (3 lines):
      L1  DR  GR/IR Clearing  1000.00
      L2  DR  Input VAT         50.00
      L3  CR  AP Control      1050.00

    totalDebit == totalCredit == 1050.00.
    No variance line.
    """
    accts = await _setup_standard(client, db_session, "AP01")

    vendor_id = str(uuid.uuid4())
    # zero variance: po_price == invoice_price
    line = _make_ap_line(
        line_number=1,
        po_unit_price="100.00",
        invoice_unit_price="100.00",
        quantity="10.000",
        tax_rate="0.05",
    )
    event = _make_ap_event(
        company_code="AP01",
        vendor_id=vendor_id,
        lines=[line],
    )

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "processed"

    # Fetch JE header
    je_result = await db_session.execute(
        select(JournalEntry).where(
            JournalEntry.sourceEventId == event["eventId"]
        )
    )
    je = je_result.scalar_one_or_none()
    assert je is not None, "JournalEntry must be created"
    assert je.sourceEventType == "ap_invoice_posted"
    assert je.status.value == "posted"
    assert je.jeNumber.startswith("JE-AP01-2026-")

    # Balance invariant
    assert je.totalDebit == je.totalCredit, (
        f"JE not balanced: DR={je.totalDebit} CR={je.totalCredit}"
    )
    assert float(je.totalDebit) == 1050.0, f"Expected 1050.0 got {je.totalDebit}"

    # Fetch lines
    lines_result = await db_session.execute(
        select(JournalEntryLine)
        .where(JournalEntryLine.jeId == je.jeId)
        .order_by(JournalEntryLine.lineNumber)
    )
    je_lines = lines_result.scalars().all()
    assert len(je_lines) == 3, f"Expected 3 lines (no variance), got {len(je_lines)}"

    dr_lines = [l for l in je_lines if l.debit is not None]
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(dr_lines) == 2  # GR/IR + VAT
    assert len(cr_lines) == 1  # AP Control

    # GR/IR DR line
    grIr_line = next(l for l in dr_lines if l.accountId == accts["grIr_id"])
    assert float(grIr_line.debit) == 1000.0

    # Input VAT DR line
    vat_line = next(l for l in dr_lines if l.accountId == accts["input_vat_id"])
    assert float(vat_line.debit) == 50.0
    # Reason: dateOfSupply (2026-06-10) is earlier than invoiceDate (2026-06-14)
    # so the tax-point description should show 2026-06-10.
    assert vat_line.description is not None
    assert "2026-06-10" in vat_line.description, (
        f"VAT line description should carry tax-point date 2026-06-10, got: "
        f"{vat_line.description!r}"
    )

    # AP Control CR line
    ap_line = cr_lines[0]
    assert ap_line.accountId == accts["ap_control_id"]
    assert float(ap_line.credit) == 1050.0

    # referenceLineId on CR line == vendorId (sub-ledger prep)
    assert ap_line.referenceLineId == vendor_id


@pytest.mark.asyncio
async def test_positive_variance_dr_ppv_line(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Positive variance: invoiceUnitPrice > poUnitPrice → vendor over-billed.

    Setup: qty=10, poUnitPrice=100, invoiceUnitPrice=105, tax=5%
      lineNet       = 10 * 105 = 1050
      lineTax       = 1050 * 0.05 = 52.50
      lineGross     = 1102.50
      priceVariance = (105 - 100) * 10 = 50

    JE (4 lines):
      L1  DR  GR/IR Clearing  1000.00   (expectedNet = 1050 - 50 = 1000)
      L2  DR  Input VAT         52.50
      L3  DR  PPV               50.00   (positive variance = extra expense)
      L4  CR  AP Control      1102.50

    Balanced: 1000 + 52.50 + 50 = 1102.50 = CR  ✓
    """
    accts = await _setup_standard(client, db_session, "AP02")

    line = _make_ap_line(
        po_unit_price="100.00",
        invoice_unit_price="105.00",
        quantity="10.000",
        tax_rate="0.05",
    )
    event = _make_ap_event(company_code="AP02", lines=[line])

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text

    je_result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = je_result.scalar_one()

    # Balance invariant
    assert je.totalDebit == je.totalCredit, (
        f"JE not balanced: DR={je.totalDebit} CR={je.totalCredit}"
    )
    assert float(je.totalCredit) == pytest.approx(1102.50, abs=0.01)

    lines_result = await db_session.execute(
        select(JournalEntryLine)
        .where(JournalEntryLine.jeId == je.jeId)
        .order_by(JournalEntryLine.lineNumber)
    )
    je_lines = lines_result.scalars().all()
    assert len(je_lines) == 4, f"Expected 4 lines (positive variance), got {len(je_lines)}"

    dr_lines = [l for l in je_lines if l.debit is not None]
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(dr_lines) == 3  # GR/IR + VAT + PPV
    assert len(cr_lines) == 1  # AP Control

    # GR/IR DR = expectedNet = invoiceNet - variance = 1050 - 50 = 1000
    grIr_line = next(l for l in dr_lines if l.accountId == accts["grIr_id"])
    assert float(grIr_line.debit) == pytest.approx(1000.0, abs=0.01)

    # PPV DR = 50 (positive variance is an expense)
    ppv_dr = next(l for l in dr_lines if l.accountId == accts["ppv_id"])
    assert float(ppv_dr.debit) == pytest.approx(50.0, abs=0.01)

    # AP Control CR = lineGross = 1102.50
    assert float(cr_lines[0].credit) == pytest.approx(1102.50, abs=0.01)


@pytest.mark.asyncio
async def test_negative_variance_cr_ppv_line(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Negative variance: invoiceUnitPrice < poUnitPrice → vendor under-billed.

    Setup: qty=10, poUnitPrice=100, invoiceUnitPrice=95, tax=5%
      lineNet       = 10 * 95 = 950
      lineTax       = 950 * 0.05 = 47.50
      lineGross     = 997.50
      priceVariance = (95 - 100) * 10 = -50

    JE (4 lines):
      L1  DR  GR/IR Clearing  1000.00   (expectedNet = 950 - (-50) = 1000)
      L2  DR  Input VAT         47.50
      L3  CR  PPV               50.00   (negative variance = gain, so CR)
      L4  CR  AP Control       997.50

    Balanced: 1047.50 = 997.50 + 50 = 1047.50  ✓
    """
    accts = await _setup_standard(client, db_session, "AP03")

    line = _make_ap_line(
        po_unit_price="100.00",
        invoice_unit_price="95.00",
        quantity="10.000",
        tax_rate="0.05",
    )
    event = _make_ap_event(company_code="AP03", lines=[line])

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text

    je_result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = je_result.scalar_one()

    # Balance invariant
    assert je.totalDebit == je.totalCredit, (
        f"JE not balanced: DR={je.totalDebit} CR={je.totalCredit}"
    )
    assert float(je.totalDebit) == pytest.approx(1047.50, abs=0.01)

    lines_result = await db_session.execute(
        select(JournalEntryLine)
        .where(JournalEntryLine.jeId == je.jeId)
        .order_by(JournalEntryLine.lineNumber)
    )
    je_lines = lines_result.scalars().all()
    assert len(je_lines) == 4, f"Expected 4 lines (negative variance), got {len(je_lines)}"

    dr_lines = [l for l in je_lines if l.debit is not None]
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(dr_lines) == 2   # GR/IR + VAT  (no DR for negative variance)
    assert len(cr_lines) == 2   # PPV CR + AP Control CR

    # GR/IR DR = expectedNet = 950 - (-50) = 1000
    grIr_line = next(l for l in dr_lines if l.accountId == accts["grIr_id"])
    assert float(grIr_line.debit) == pytest.approx(1000.0, abs=0.01)

    # PPV CR = |variance| = 50
    ppv_cr = next(l for l in cr_lines if l.accountId == accts["ppv_id"])
    assert float(ppv_cr.credit) == pytest.approx(50.0, abs=0.01)

    # AP Control CR = lineGross = 997.50
    ap_cr = next(l for l in cr_lines if l.accountId == accts["ap_control_id"])
    assert float(ap_cr.credit) == pytest.approx(997.50, abs=0.01)


@pytest.mark.asyncio
async def test_zero_vat_no_input_vat_line(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Zero-rated invoice (tax_rate=0): no Input VAT DR line.

    JE shape (2 lines, zero variance):
      L1  DR  GR/IR Clearing  500.00
      L2  CR  AP Control      500.00
    """
    accts = await _setup_standard(client, db_session, "AP04")

    # Zero tax rate
    line = _make_ap_line(
        po_unit_price="50.00",
        invoice_unit_price="50.00",
        quantity="10.000",
        tax_code="Z",
        tax_rate="0.00",
    )
    event = _make_ap_event(company_code="AP04", lines=[line])

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text

    je_result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = je_result.scalar_one()

    # Balance invariant
    assert je.totalDebit == je.totalCredit

    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()
    # Only 2 lines: GR/IR DR + AP CR (no VAT line, no variance line)
    assert len(je_lines) == 2, (
        f"Expected 2 lines (zero VAT, zero variance), got {len(je_lines)}"
    )

    dr_lines = [l for l in je_lines if l.debit is not None]
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(dr_lines) == 1
    assert len(cr_lines) == 1

    # No Input VAT account
    account_ids = {l.accountId for l in je_lines}
    assert accts["input_vat_id"] not in account_ids, (
        "Input VAT account must NOT appear in a zero-rated invoice JE"
    )

    assert float(dr_lines[0].debit) == pytest.approx(500.0, abs=0.01)
    assert float(cr_lines[0].credit) == pytest.approx(500.0, abs=0.01)


@pytest.mark.asyncio
async def test_missing_posting_setup_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    No posting setup row for the company → 400 with descriptive message.
    No JE should be created.
    """
    await _seed_company(client, code="AP05")
    # Deliberately do NOT seed a posting setup for AP05
    await _seed_fiscal_period(db_session, "AP05")

    event = _make_ap_event(company_code="AP05")
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 400, resp.text
    assert "posting setup not configured" in resp.json()["detail"].lower()
    assert "AP05" in resp.json()["detail"]

    je_count = await db_session.execute(
        select(func.count()).select_from(JournalEntry).where(
            JournalEntry.sourceEventId == event["eventId"]
        )
    )
    assert je_count.scalar() == 0


@pytest.mark.asyncio
async def test_missing_ap_control_account_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Posting setup exists but apControlAccountId is null → 400.
    No JE should be created.
    """
    await _seed_company(client, code="AP06")
    # Seed setup with apControlAccountId=None
    await _seed_posting_setup(
        db_session,
        _ORG,
        "AP06",
        ap_control_id=None,
        grIr_id="USE_REAL",
        input_vat_id="USE_REAL",
        ppv_id="USE_REAL",
    )
    await _seed_fiscal_period(db_session, "AP06")

    event = _make_ap_event(company_code="AP06")
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "apControlAccountId" in detail or "AP Control" in detail

    je_count = await db_session.execute(
        select(func.count()).select_from(JournalEntry).where(
            JournalEntry.sourceEventId == event["eventId"]
        )
    )
    assert je_count.scalar() == 0


@pytest.mark.asyncio
async def test_positive_variance_no_ppv_account_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Invoice has positive variance but purchasePriceVarianceAccountId is null → 400.

    This is a permanent failure: the handler must refuse rather than silently
    swallow the variance against a null account.
    """
    await _seed_company(client, code="AP07")
    # Seed setup with ppv_id=None
    await _seed_posting_setup(
        db_session,
        _ORG,
        "AP07",
        ap_control_id="USE_REAL",
        grIr_id="USE_REAL",
        input_vat_id="USE_REAL",
        ppv_id=None,
    )
    await _seed_fiscal_period(db_session, "AP07")

    # Positive variance line: invoiceUnitPrice > poUnitPrice
    line = _make_ap_line(
        po_unit_price="100.00",
        invoice_unit_price="110.00",
        quantity="5.000",
    )
    event = _make_ap_event(company_code="AP07", lines=[line])

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "purchasePriceVarianceAccountId" in detail or "Price Variance" in detail

    je_count = await db_session.execute(
        select(func.count()).select_from(JournalEntry).where(
            JournalEntry.sourceEventId == event["eventId"]
        )
    )
    assert je_count.scalar() == 0


@pytest.mark.asyncio
async def test_zero_variance_null_ppv_account_succeeds(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Zero-variance invoice with purchasePriceVarianceAccountId null → 200.

    When no variance line is needed, the PPV account does not need to be
    configured.  The handler must not reject this case.
    """
    await _seed_company(client, code="AP08")
    await _seed_posting_setup(
        db_session,
        _ORG,
        "AP08",
        ap_control_id="USE_REAL",
        grIr_id="USE_REAL",
        input_vat_id="USE_REAL",
        ppv_id=None,  # null — no PPV account configured
    )
    await _seed_fiscal_period(db_session, "AP08")

    # Zero variance
    line = _make_ap_line(
        po_unit_price="80.00",
        invoice_unit_price="80.00",
        quantity="3.000",
        tax_rate="0.05",
    )
    event = _make_ap_event(company_code="AP08", lines=[line])

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "processed"

    je_result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = je_result.scalar_one_or_none()
    assert je is not None
    # Balance invariant
    assert je.totalDebit == je.totalCredit


@pytest.mark.asyncio
async def test_je_balance_invariant_multi_line(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Multi-line AP invoice with mixed items — totalDebit must equal totalCredit.

    Two lines: one with positive variance, one with negative variance.
    The handler aggregates totalPriceVariance from the payload; this test
    confirms the header balance holds when individual line variances partially
    cancel.

    Note: We send pre-built totals in the payload because the handler uses
    payload-level aggregates (totalNetAmount, totalTaxAmount, totalGrossAmount,
    totalPriceVariance) rather than re-summing lines.

    Setup (all prices include 5% VAT):
      Line 1: qty=10, po=100, inv=105  → lineNet=1050, lineTax=52.50, lineGross=1102.50, var=+50
      Line 2: qty=5,  po=80,  inv=70   → lineNet=350,  lineTax=17.50, lineGross=367.50,  var=-50
      totalNet=1400, totalTax=70, totalGross=1470, totalVariance=0

    With totalVariance=0 and totals consistent:
      JE (3 lines): DR GR/IR 1400 + DR VAT 70 = CR AP 1470  ✓
    """
    accts = await _setup_standard(client, db_session, "AP09")

    lines = [
        _make_ap_line(
            line_number=1,
            item_code="ITEM-A",
            po_unit_price="100.00",
            invoice_unit_price="105.00",
            quantity="10.000",
            tax_rate="0.05",
        ),
        _make_ap_line(
            line_number=2,
            item_code="ITEM-B",
            po_unit_price="80.00",
            invoice_unit_price="70.00",
            quantity="5.000",
            tax_rate="0.05",
        ),
    ]
    event = _make_ap_event(company_code="AP09", lines=lines)

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text

    je_result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = je_result.scalar_one()
    assert je.totalDebit == je.totalCredit, (
        f"JE not balanced: DR={je.totalDebit} CR={je.totalCredit}"
    )
    # totalVariance = 0, so no PPV line
    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()
    # GR/IR DR + VAT DR + AP CR = 3 lines (no variance because it sums to 0)
    assert len(je_lines) == 3


@pytest.mark.asyncio
async def test_reference_line_id_on_ap_cr_equals_vendor_id(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    The AP Control CR line must carry referenceLineId == vendorId.

    This preserves the sub-ledger link even before a dedicated AP sub-ledger
    table exists.  Verified both on the JE line and through the event round-trip.
    """
    await _setup_standard(client, db_session, "AP10")

    vendor_id = str(uuid.uuid4())
    line = _make_ap_line(
        po_unit_price="200.00",
        invoice_unit_price="200.00",
        quantity="2.000",
        tax_rate="0.05",
    )
    event = _make_ap_event(
        company_code="AP10",
        vendor_id=vendor_id,
        lines=[line],
    )

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text

    # Find the AP Control CR line and check its referenceLineId
    je_result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = je_result.scalar_one()

    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()

    cr_lines = [l for l in je_lines if l.credit is not None]
    # There is only one CR line (AP Control) since zero variance + VAT present
    assert len(cr_lines) == 1
    ap_cr = cr_lines[0]
    assert ap_cr.referenceLineId == vendor_id, (
        f"AP Control CR line referenceLineId should be vendorId={vendor_id}, "
        f"got {ap_cr.referenceLineId}"
    )


@pytest.mark.asyncio
async def test_idempotency_second_event_already_processed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Sending the same eventId twice returns already_processed on the second call.
    Only one JE should exist.
    """
    await _setup_standard(client, db_session, "AP11")

    line = _make_ap_line(
        po_unit_price="50.00",
        invoice_unit_price="50.00",
        quantity="4.000",
        tax_rate="0.05",
    )
    event_id = str(uuid.uuid4())
    event = _make_ap_event(
        company_code="AP11",
        event_id=event_id,
        lines=[line],
    )

    # First call
    resp1 = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp1.status_code == 200, resp1.text
    assert resp1.json()["status"] == "processed"

    # Second call — same eventId
    resp2 = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp2.status_code == 200, resp2.text
    assert resp2.json()["status"] == "already_processed"

    # Only one JE should exist
    je_count = await db_session.execute(
        select(func.count()).select_from(JournalEntry).where(
            JournalEntry.sourceEventId == event_id
        )
    )
    assert je_count.scalar() == 1


# ---------------------------------------------------------------------------
# PM item 2 — UAE VAT Article 25 tax-point tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tax_point_date_of_supply_earlier(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    dateOfSupply earlier than invoiceDate → tax-point description shows dateOfSupply.

    Setup: dateOfSupply=2026-06-05, invoiceDate=2026-06-14
    → tax_point_date = 2026-06-05 (the GR arrival date)
    """
    await _setup_standard(client, db_session, "AP12")

    line = _make_ap_line(
        po_unit_price="100.00",
        invoice_unit_price="100.00",
        quantity="5.000",
        tax_rate="0.05",
    )
    event = _make_ap_event(
        company_code="AP12",
        lines=[line],
        date_of_supply="2026-06-05",   # earlier
        invoice_date="2026-06-14",
    )

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text

    je_result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = je_result.scalar_one()

    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()

    vat_lines = [l for l in je_lines if l.debit is not None and l.credit is None
                 and l.description and "VAT" in l.description]
    assert len(vat_lines) == 1, "Expected exactly one Input VAT DR line"
    assert "2026-06-05" in vat_lines[0].description, (
        f"Tax-point date should be 2026-06-05 (dateOfSupply is earlier), "
        f"got: {vat_lines[0].description!r}"
    )
    assert "2026-06-14" not in vat_lines[0].description, (
        f"invoiceDate must not appear in description when dateOfSupply is earlier"
    )


@pytest.mark.asyncio
async def test_tax_point_invoice_date_earlier(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    invoiceDate earlier than dateOfSupply → tax-point description shows invoiceDate.

    Setup: invoiceDate=2026-06-01, dateOfSupply=2026-06-10
    → tax_point_date = 2026-06-01 (the vendor's invoice date)
    """
    await _setup_standard(client, db_session, "AP13")

    line = _make_ap_line(
        po_unit_price="80.00",
        invoice_unit_price="80.00",
        quantity="3.000",
        tax_rate="0.05",
    )
    event = _make_ap_event(
        company_code="AP13",
        lines=[line],
        date_of_supply="2026-06-10",   # later
        invoice_date="2026-06-01",     # earlier
    )

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text

    je_result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = je_result.scalar_one()

    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()

    vat_lines = [l for l in je_lines if l.debit is not None and l.credit is None
                 and l.description and "VAT" in l.description]
    assert len(vat_lines) == 1, "Expected exactly one Input VAT DR line"
    assert "2026-06-01" in vat_lines[0].description, (
        f"Tax-point date should be 2026-06-01 (invoiceDate is earlier), "
        f"got: {vat_lines[0].description!r}"
    )


# ---------------------------------------------------------------------------
# PM item 3 — Reverse-charge VAT mechanism tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_all_reverse_charge_je_structure(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    All-reverse-charge invoice: JE must have DR Input VAT + CR Output VAT
    for the same amount, DR GR/IR for expectedNet, CR AP for lineNet only.
    JE must balance.

    Setup: 1 line, taxCode=SR, qty=10, invoicePrice=100, tax=5%
      lineNet   = 1000.00
      lineTax   = 50.00
      lineGross = 1050.00  (not used for AP credit on RC lines)

    Expected JE (no variance, all-RC):
      L1  DR  GR/IR Clearing    1000.00   (expectedNet = 1000 - 0 = 1000)
      L2  DR  Input VAT           50.00
      L3  CR  Output VAT          50.00   (reverse-charge self-accounting)
      L4  CR  AP Control        1000.00   (lineNet only — vendor didn't bill VAT)

    DR total = 1000 + 50 = 1050
    CR total = 50 + 1000 = 1050  ✓

    Sample JE lines (for the report):
      line 1  DR  GR/IR Clearing   1000.00
      line 2  DR  Input VAT          50.00  description: "Input VAT — tax point ..."
      line 3  CR  Output VAT         50.00  description: "Reverse-charge Output VAT ..."
      line 4  CR  AP Control       1000.00  referenceLineId = vendorId
    """
    accts = await _setup_standard(client, db_session, "AP14")

    # Seed the SR tax code as reverse-charge
    await _seed_tax_code(
        db_session,
        _ORG,
        tax_code="SR",
        is_reverse_charge=True,
    )

    vendor_id = str(uuid.uuid4())
    line = _make_ap_line(
        line_number=1,
        item_code="SVC-001",
        quantity="10.000",
        po_unit_price="100.00",
        invoice_unit_price="100.00",
        tax_code="SR",
        tax_rate="0.05",
    )
    event = _make_ap_event(
        company_code="AP14",
        vendor_id=vendor_id,
        lines=[line],
        date_of_supply="2026-06-05",
        invoice_date="2026-06-10",
    )

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "processed"

    je_result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = je_result.scalar_one()

    # Balance invariant
    assert je.totalDebit == je.totalCredit, (
        f"JE not balanced: DR={je.totalDebit} CR={je.totalCredit}"
    )
    assert float(je.totalDebit) == pytest.approx(1050.0, abs=0.01)

    lines_result = await db_session.execute(
        select(JournalEntryLine)
        .where(JournalEntryLine.jeId == je.jeId)
        .order_by(JournalEntryLine.lineNumber)
    )
    je_lines = lines_result.scalars().all()

    # Expect exactly 4 lines: DR GR/IR + DR Input VAT + CR Output VAT + CR AP
    assert len(je_lines) == 4, (
        f"Expected 4 lines for all-RC invoice, got {len(je_lines)}: "
        + str([(l.lineNumber, l.debit, l.credit, l.description) for l in je_lines])
    )

    dr_lines = [l for l in je_lines if l.debit is not None]
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(dr_lines) == 2, f"Expected 2 DR lines, got {len(dr_lines)}"
    assert len(cr_lines) == 2, f"Expected 2 CR lines, got {len(cr_lines)}"

    # DR GR/IR = 1000
    grIr_line = next(l for l in dr_lines if l.accountId == accts["grIr_id"])
    assert float(grIr_line.debit) == pytest.approx(1000.0, abs=0.01)

    # DR Input VAT = 50
    vat_dr = next(l for l in dr_lines if l.accountId == accts["input_vat_id"])
    assert float(vat_dr.debit) == pytest.approx(50.0, abs=0.01)

    # CR Output VAT = 50 (same amount as Input VAT — self-accounting)
    vat_cr = next(l for l in cr_lines if l.accountId == accts["output_vat_id"])
    assert float(vat_cr.credit) == pytest.approx(50.0, abs=0.01)
    assert "Reverse-charge" in vat_cr.description

    # CR AP Control = lineNet only = 1000 (NOT 1050 lineGross)
    ap_cr = next(l for l in cr_lines if l.accountId == accts["ap_control_id"])
    assert float(ap_cr.credit) == pytest.approx(1000.0, abs=0.01), (
        "AP credit for reverse-charge lines must be lineNet (1000), not lineGross (1050)"
    )
    assert ap_cr.referenceLineId == vendor_id


@pytest.mark.asyncio
async def test_mixed_standard_and_reverse_charge(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Mixed invoice: one S line + one SR line.

    Line 1 (S):  qty=10, price=100, tax=5%  → lineNet=1000, lineTax=50, lineGross=1050
    Line 2 (SR): qty=5,  price=200, tax=5%  → lineNet=1000, lineTax=50, lineGross=1050

    total_net   = 2000
    total_tax   = 100
    total_gross = 2100

    expectedNet = 2000 - 0 = 2000

    Per-line AP credit:
      Line 1 (S):  1050 (lineGross)
      Line 2 (SR): 1000 (lineNet only)
    total_ap_credit = 2050

    total_cr_output_vat = 50 (only SR line)

    DR side: 2000 (GR/IR) + 100 (Input VAT) = 2100
    CR side: 2050 (AP) + 50 (Output VAT) = 2100  ✓
    """
    accts = await _setup_standard(client, db_session, "AP15")

    await _seed_tax_code(db_session, _ORG, tax_code="S", is_reverse_charge=False)
    await _seed_tax_code(db_session, _ORG, tax_code="SR", is_reverse_charge=True)

    line_s = _make_ap_line(
        line_number=1,
        item_code="FERT-001",
        quantity="10.000",
        po_unit_price="100.00",
        invoice_unit_price="100.00",
        tax_code="S",
        tax_rate="0.05",
    )
    line_sr = _make_ap_line(
        line_number=2,
        item_code="SVC-001",
        quantity="5.000",
        po_unit_price="200.00",
        invoice_unit_price="200.00",
        tax_code="SR",
        tax_rate="0.05",
    )
    event = _make_ap_event(
        company_code="AP15",
        lines=[line_s, line_sr],
        date_of_supply="2026-06-08",
        invoice_date="2026-06-14",
    )

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text

    je_result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = je_result.scalar_one()

    # Balance invariant
    assert je.totalDebit == je.totalCredit, (
        f"Mixed JE not balanced: DR={je.totalDebit} CR={je.totalCredit}"
    )
    assert float(je.totalDebit) == pytest.approx(2100.0, abs=0.01)

    lines_result = await db_session.execute(
        select(JournalEntryLine)
        .where(JournalEntryLine.jeId == je.jeId)
        .order_by(JournalEntryLine.lineNumber)
    )
    je_lines = lines_result.scalars().all()

    # Expect 4 lines: DR GR/IR + DR Input VAT + CR Output VAT + CR AP
    assert len(je_lines) == 4, (
        f"Expected 4 lines for mixed S+SR invoice, got {len(je_lines)}"
    )

    dr_lines = [l for l in je_lines if l.debit is not None]
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(dr_lines) == 2
    assert len(cr_lines) == 2

    # DR Input VAT = 100 (all lines contribute)
    vat_dr = next(l for l in dr_lines if l.accountId == accts["input_vat_id"])
    assert float(vat_dr.debit) == pytest.approx(100.0, abs=0.01)

    # CR Output VAT = 50 (SR line only)
    vat_cr = next(l for l in cr_lines if l.accountId == accts["output_vat_id"])
    assert float(vat_cr.credit) == pytest.approx(50.0, abs=0.01)

    # CR AP = 1050 (S lineGross) + 1000 (SR lineNet) = 2050
    ap_cr = next(l for l in cr_lines if l.accountId == accts["ap_control_id"])
    assert float(ap_cr.credit) == pytest.approx(2050.0, abs=0.01), (
        "AP credit must be per-line: lineGross for S, lineNet for SR"
    )


@pytest.mark.asyncio
async def test_reverse_charge_null_output_vat_account_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Reverse-charge tax code but outputVatAccountId is null → 400.

    The handler must reject rather than silently drop the Output VAT leg.
    """
    await _setup_standard(
        client,
        db_session,
        "AP16",
        output_vat_id=None,  # null — not configured
    )

    await _seed_tax_code(db_session, _ORG, tax_code="SR", is_reverse_charge=True)

    line = _make_ap_line(
        tax_code="SR",
        po_unit_price="100.00",
        invoice_unit_price="100.00",
        quantity="3.000",
        tax_rate="0.05",
    )
    event = _make_ap_event(company_code="AP16", lines=[line])

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "outputVatAccountId" in detail or "Output VAT" in detail or "reverse-charge" in detail.lower()

    je_count = await db_session.execute(
        select(func.count()).select_from(JournalEntry).where(
            JournalEntry.sourceEventId == event["eventId"]
        )
    )
    assert je_count.scalar() == 0, "No JE must be created when output VAT account is missing"
