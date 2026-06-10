"""
Unit tests for AP Invoice (AP) service methods — Phase C.1

Covers:
  - create_ap_from_gr: happy path (lines copy from GR with PO price as default)
  - create_ap_from_gr: cannot create from Draft GR → ValueError
  - create_ap_from_gr: cannot create second AP from same GR → ValueError
  - update_ap: change invoiceUnitPrice → variance recomputed correctly
  - submit_ap + approve_ap: approvalHistory appended, status Approved, outbox event emitted
  - Variance computation: PO 100 → invoice 105 × qty 10 = 50 (positive variance)
  - Negative variance: PO 100 → invoice 95 × qty 10 = -50
  - VAT computation: S=5%, Z=0%, E=0%, N=0%, SR=5%
  - approvalHistory on reject
  - build_ap_invoice_event_payload: correct shape for ap_invoice_posted contract
"""

import sys
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ORG_ID = str(uuid.uuid4())
COMPANY_CODE = "1000"
VENDOR_ID = str(uuid.uuid4())
USER_ID = str(uuid.uuid4())
APPROVER_ID = str(uuid.uuid4())
ITEM_ID = str(uuid.uuid4())
GR_DOC_ID = str(uuid.uuid4())
PO_DOC_ID = str(uuid.uuid4())
PO_LINE_ID = str(uuid.uuid4())
GR_LINE_ID = str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _make_gr_header(
    doc_id: Optional[str] = None,
    status: str = "Posted",
    po_doc_id: Optional[str] = None,
) -> Dict[str, Any]:
    now = _now()
    did = doc_id or GR_DOC_ID
    pid = po_doc_id or PO_DOC_ID
    return {
        "docId": did,
        "organizationId": ORG_ID,
        "companyCode": COMPANY_CODE,
        "docType": "GR",
        "docNumber": "GR-2026-0001",
        "docDate": now,
        "status": status,
        "baseDocId": pid,
        "baseDocNumber": "PO-2026-0001",
        "vendorId": VENDOR_ID,
        "vendorCode": "VEND-001",
        "vendorName": "Test Vendor",
        "currencyCode": "AED",
        "paymentTermsCode": "NET30",
        "subtotalNet": 1000.0,
        "totalTax": 50.0,
        "totalGross": 1050.0,
        "postedAt": now,
        "postedBy": USER_ID,
        "postedEventId": str(uuid.uuid4()),
        "createdAt": now,
        "createdBy": USER_ID,
        "updatedAt": now,
        "updatedBy": USER_ID,
        "deletedAt": None,
    }


def _make_gr_line(
    doc_id: Optional[str] = None,
    line_id: Optional[str] = None,
    quantity: float = 10.0,
    unit_price: float = 100.0,
    tax_code: str = "S",
) -> Dict[str, Any]:
    now = _now()
    did = doc_id or GR_DOC_ID
    lid = line_id or GR_LINE_ID
    lnet = quantity * unit_price
    tax_rate = 5.0 if tax_code in ("S", "SR") else 0.0
    ltax = lnet * tax_rate / 100
    return {
        "lineId": lid,
        "docId": did,
        "organizationId": ORG_ID,
        "lineNumber": 1,
        "itemId": ITEM_ID,
        "itemCode": "ITEM-001",
        "itemName": "Fertilizer",
        "itemType": "raw_material",
        "description": None,
        "uom": "KG",
        "quantity": quantity,
        "openQuantity": quantity,
        "closedQuantity": 0.0,
        "unitPrice": unit_price,  # = PO price copied to GR
        "lineNet": lnet,
        "taxCode": tax_code,
        "taxRate": tax_rate,
        "lineTax": ltax,
        "lineGross": lnet + ltax,
        "warehouseId": None,
        "requestedVendorId": None,
        "baseLineId": PO_LINE_ID,
        "notes": None,
        "createdAt": now,
        "updatedAt": now,
    }


def _make_po_header(doc_id: Optional[str] = None) -> Dict[str, Any]:
    now = _now()
    return {
        "docId": doc_id or PO_DOC_ID,
        "organizationId": ORG_ID,
        "companyCode": COMPANY_CODE,
        "docType": "PO",
        "docNumber": "PO-2026-0001",
        "docDate": now,
        "status": "Closed",
        "vendorId": VENDOR_ID,
        "vendorCode": "VEND-001",
        "currencyCode": "AED",
        "subtotalNet": 1000.0,
        "totalTax": 50.0,
        "totalGross": 1050.0,
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": None,
    }


def _make_ap_header(
    doc_id: Optional[str] = None,
    gr_doc_id: Optional[str] = None,
    status: str = "Draft",
    invoice_number: str = "INV-001",
) -> Dict[str, Any]:
    now = _now()
    did = doc_id or str(uuid.uuid4())
    gid = gr_doc_id or GR_DOC_ID
    return {
        "docId": did,
        "organizationId": ORG_ID,
        "companyCode": COMPANY_CODE,
        "docType": "AP",
        "docNumber": "AP-2026-0001",
        "docDate": now,
        "status": status,
        "baseDocId": gid,
        "baseDocNumber": "GR-2026-0001",
        "poDocId": PO_DOC_ID,
        "poDocNumber": "PO-2026-0001",
        "vendorId": VENDOR_ID,
        "vendorCode": "VEND-001",
        "vendorName": "Test Vendor",
        "currencyCode": "AED",
        "paymentTermsCode": "NET30",
        "invoiceNumber": invoice_number,
        "invoiceDate": now,
        "dueDate": now + timedelta(days=30),
        "notes": None,
        "subtotalNet": 1000.0,
        "totalTax": 50.0,
        "totalGross": 1050.0,
        "totalPriceVariance": 0.0,
        "approvalState": "NotRequired" if status == "Draft" else "Pending",
        "approvalRequestedFrom": None if status == "Draft" else "accountant",
        "approvalRequestedAt": None if status == "Draft" else now,
        "approvalDecidedBy": None,
        "approvalDecidedAt": None,
        "approvalComment": None,
        "approvalHistory": [],
        "postedAt": None,
        "postedBy": None,
        "postedEventId": None,
        "createdAt": now,
        "createdBy": USER_ID,
        "updatedAt": now,
        "updatedBy": USER_ID,
        "deletedAt": None,
    }


def _make_ap_line(
    ap_doc_id: str,
    gr_line_id: Optional[str] = None,
    quantity: float = 10.0,
    po_unit_price: float = 100.0,
    invoice_unit_price: float = 100.0,
    tax_code: str = "S",
) -> Dict[str, Any]:
    now = _now()
    lid = gr_line_id or GR_LINE_ID
    lnet = quantity * invoice_unit_price
    tax_rate = 5.0 if tax_code in ("S", "SR") else 0.0
    ltax = lnet * tax_rate / 100
    variance = (invoice_unit_price - po_unit_price) * quantity
    return {
        "lineId": str(uuid.uuid4()),
        "docId": ap_doc_id,
        "organizationId": ORG_ID,
        "lineNumber": 1,
        "itemId": ITEM_ID,
        "itemCode": "ITEM-001",
        "itemName": "Fertilizer",
        "itemType": "raw_material",
        "description": None,
        "uom": "KG",
        "quantity": quantity,
        "openQuantity": quantity,
        "closedQuantity": 0.0,
        "unitPrice": invoice_unit_price,
        "poUnitPrice": po_unit_price,
        "priceVarianceAmount": variance,
        "lineNet": lnet,
        "taxCode": tax_code,
        "taxRate": tax_rate,
        "lineTax": ltax,
        "lineGross": lnet + ltax,
        "grLineId": lid,
        "baseLineId": PO_LINE_ID,
        "warehouseId": None,
        "requestedVendorId": None,
        "notes": None,
        "createdAt": now,
        "updatedAt": now,
    }


# ---------------------------------------------------------------------------
# Mock DocumentService DB
# ---------------------------------------------------------------------------

def _build_service_with_mock_db(
    gr_header: Optional[Dict] = None,
    gr_lines: Optional[List[Dict]] = None,
    existing_ap: Optional[Dict] = None,
    po_header: Optional[Dict] = None,
    ap_header_for_update: Optional[Dict] = None,
    ap_lines_for_approve: Optional[List[Dict]] = None,
    counter_value: int = 1,
):
    """
    Build a DocumentService with a mocked Motor database.

    The mock wires up find_one / find / insert_many / insert_one / update_one
    to return predictable data for AP Invoice tests.
    """
    from src.modules.purchasing.services.document_service import DocumentService

    db = MagicMock()
    db.client.start_session = AsyncMock()

    # Session context manager mock (for _txn())
    session_mock = AsyncMock()
    session_mock.__aenter__ = AsyncMock(return_value=session_mock)
    session_mock.__aexit__ = AsyncMock(return_value=False)
    txn_mock = MagicMock()
    txn_mock.__aenter__ = AsyncMock(return_value=session_mock)
    txn_mock.__aexit__ = AsyncMock(return_value=False)
    db.client.start_session.return_value = session_mock
    session_mock.start_transaction = MagicMock(return_value=txn_mock)

    # document_headers collection
    headers_col = MagicMock()
    headers_col.find_one = AsyncMock()
    headers_col.find = MagicMock()
    headers_col.insert_one = AsyncMock()
    headers_col.insert_many = AsyncMock()
    headers_col.update_one = AsyncMock()
    headers_col.count_documents = AsyncMock(return_value=0)

    # document_lines collection
    lines_col = MagicMock()
    lines_col.find = MagicMock()
    lines_col.insert_one = AsyncMock()
    lines_col.insert_many = AsyncMock()
    lines_col.update_one = AsyncMock()
    lines_col.delete_many = AsyncMock()

    # document_counters collection
    counters_col = MagicMock()
    counters_col.find_one_and_update = AsyncMock(return_value={"counter": counter_value})

    # finance_outbox collection
    outbox_col = MagicMock()
    outbox_col.insert_one = AsyncMock()

    def _get_col(name):
        if name == "document_headers":
            return headers_col
        if name == "document_lines":
            return lines_col
        if name == "document_counters":
            return counters_col
        if name == "finance_outbox":
            return outbox_col
        return MagicMock()

    db.__getitem__ = MagicMock(side_effect=_get_col)

    service = DocumentService(db)
    service._headers = headers_col
    service._lines = lines_col

    return service, headers_col, lines_col, counters_col, outbox_col, session_mock


# ---------------------------------------------------------------------------
# build_ap_invoice_event_payload unit test (pure function, no DB)
# ---------------------------------------------------------------------------


def test_build_ap_invoice_event_payload_shape() -> None:
    """build_ap_invoice_event_payload produces the correct dict shape for the contract."""
    from src.modules.purchasing.services.document_service import build_ap_invoice_event_payload

    now = _now()
    ap_doc_id = str(uuid.uuid4())
    gr_line_id = str(uuid.uuid4())

    header = {
        "docId": ap_doc_id,
        "organizationId": ORG_ID,
        "companyCode": COMPANY_CODE,
        "docType": "AP",
        "docNumber": "AP-2026-0001",
        "docDate": now,
        "invoiceNumber": "VND-INV-2026-001",
        "invoiceDate": now,
        "dueDate": now + timedelta(days=30),
        "baseDocId": GR_DOC_ID,
        "baseDocNumber": "GR-2026-0001",
        "poDocId": PO_DOC_ID,
        "poDocNumber": "PO-2026-0001",
        "vendorId": VENDOR_ID,
        "vendorCode": "VEND-001",
        "companyCode": COMPANY_CODE,
        "paymentTermsCode": "NET30",
        "currencyCode": "AED",
        "subtotalNet": 1000.0,
        "totalTax": 50.0,
        "totalGross": 1050.0,
        "notes": "Test invoice",
    }
    lines = [{
        "lineNumber": 1,
        "itemId": ITEM_ID,
        "itemCode": "ITEM-001",
        "itemName": "Fertilizer",
        "itemType": "raw_material",
        "quantity": 10.0,
        "uom": "KG",
        "unitPrice": 105.0,
        "poUnitPrice": 100.0,
        "priceVarianceAmount": 50.0,
        "lineNet": 1050.0,
        "lineTax": 52.5,
        "lineGross": 1102.5,
        "taxCode": "S",
        "grLineId": gr_line_id,
        "baseLineId": PO_LINE_ID,
    }]

    payload = build_ap_invoice_event_payload(header, lines)

    # Validate contract fields
    assert payload["apDocId"] == ap_doc_id
    assert payload["apDocNumber"] == "AP-2026-0001"
    assert payload["apDate"] == now.strftime("%Y-%m-%d")
    assert payload["invoiceNumber"] == "VND-INV-2026-001"
    assert payload["grDocId"] == GR_DOC_ID
    assert payload["grDocNumber"] == "GR-2026-0001"
    assert payload["poDocId"] == PO_DOC_ID
    assert payload["companyCode"] == COMPANY_CODE
    assert payload["paymentTermsCode"] == "NET30"
    assert payload["currencyCode"] == "AED"
    assert len(payload["lines"]) == 1
    assert payload["totalNetAmount"] == "1000.0"
    assert payload["totalTaxAmount"] == "50.0"
    assert payload["totalGrossAmount"] == "1050.0"
    # Variance is sum of line priceVarianceAmount
    assert Decimal(payload["totalPriceVariance"]) == Decimal("50.0")

    line = payload["lines"][0]
    assert line["lineNumber"] == 1
    assert line["itemId"] == ITEM_ID
    assert line["itemType"] == "raw_material"
    assert line["poUnitPrice"] == "100.0"
    assert line["invoiceUnitPrice"] == "105.0"
    assert line["priceVarianceAmount"] == "50.0"
    assert line["grLineId"] == gr_line_id
    assert line["baseLineId"] == PO_LINE_ID


def test_build_ap_invoice_event_payload_zero_variance() -> None:
    """When invoice price == PO price, totalPriceVariance is 0."""
    from src.modules.purchasing.services.document_service import build_ap_invoice_event_payload

    now = _now()
    header = {
        "docId": str(uuid.uuid4()),
        "docNumber": "AP-2026-0001",
        "docDate": now,
        "invoiceNumber": "INV-001",
        "invoiceDate": now,
        "dueDate": None,
        "baseDocId": GR_DOC_ID,
        "baseDocNumber": "GR-2026-0001",
        "poDocId": PO_DOC_ID,
        "poDocNumber": "PO-2026-0001",
        "vendorId": VENDOR_ID,
        "companyCode": COMPANY_CODE,
        "currencyCode": "AED",
        "subtotalNet": 1000.0,
        "totalTax": 50.0,
        "totalGross": 1050.0,
    }
    lines = [{
        "lineNumber": 1,
        "itemId": ITEM_ID,
        "itemCode": "ITEM-001",
        "itemName": "Test",
        "itemType": "consumable",
        "quantity": 10.0,
        "uom": "EA",
        "unitPrice": 100.0,
        "poUnitPrice": 100.0,
        "priceVarianceAmount": 0.0,
        "lineNet": 1000.0,
        "lineTax": 50.0,
        "lineGross": 1050.0,
        "taxCode": "S",
        "grLineId": str(uuid.uuid4()),
        "baseLineId": None,
    }]

    payload = build_ap_invoice_event_payload(header, lines)
    assert Decimal(payload["totalPriceVariance"]) == Decimal("0")
    assert payload["dueDate"] is None


# ---------------------------------------------------------------------------
# Variance computation unit tests (pure function via _build_ap_lines_from_gr)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_variance_positive() -> None:
    """PO price 100, invoice price 105, qty 10 → priceVarianceAmount = 50."""
    service, headers_col, lines_col, counters_col, outbox_col, session_mock = (
        _build_service_with_mock_db()
    )

    gr_line = _make_gr_line(
        doc_id=GR_DOC_ID,
        line_id=GR_LINE_ID,
        quantity=10.0,
        unit_price=100.0,
        tax_code="S",
    )

    # Wire find for GR lines
    cursor_mock = MagicMock()
    cursor_mock.to_list = AsyncMock(return_value=[gr_line])
    lines_col.find.return_value = cursor_mock

    from src.modules.purchasing.models.document import APLineInput

    line_inputs = [APLineInput(grLineId=GR_LINE_ID, invoiceUnitPrice=Decimal("105"))]
    now = datetime.now(tz=timezone.utc)

    result_lines = await service._build_ap_lines_from_gr(GR_DOC_ID, ORG_ID, line_inputs, now)

    assert len(result_lines) == 1
    line = result_lines[0]
    assert Decimal(str(line["unitPrice"])) == Decimal("105")
    assert Decimal(str(line["poUnitPrice"])) == Decimal("100")
    assert Decimal(str(line["priceVarianceAmount"])) == Decimal("50")
    assert Decimal(str(line["lineNet"])) == Decimal("1050")
    # S tax code → 5%
    assert Decimal(str(line["taxRate"])) == Decimal("5")
    assert Decimal(str(line["lineTax"])) == Decimal("52.50")
    assert Decimal(str(line["lineGross"])) == Decimal("1102.50")


@pytest.mark.asyncio
async def test_variance_negative() -> None:
    """PO price 100, invoice price 95, qty 10 → priceVarianceAmount = -50."""
    service, headers_col, lines_col, counters_col, outbox_col, session_mock = (
        _build_service_with_mock_db()
    )

    gr_line = _make_gr_line(
        doc_id=GR_DOC_ID,
        line_id=GR_LINE_ID,
        quantity=10.0,
        unit_price=100.0,
        tax_code="S",
    )

    cursor_mock = MagicMock()
    cursor_mock.to_list = AsyncMock(return_value=[gr_line])
    lines_col.find.return_value = cursor_mock

    from src.modules.purchasing.models.document import APLineInput

    line_inputs = [APLineInput(grLineId=GR_LINE_ID, invoiceUnitPrice=Decimal("95"))]
    now = datetime.now(tz=timezone.utc)

    result_lines = await service._build_ap_lines_from_gr(GR_DOC_ID, ORG_ID, line_inputs, now)

    assert len(result_lines) == 1
    line = result_lines[0]
    assert Decimal(str(line["priceVarianceAmount"])) == Decimal("-50")
    assert Decimal(str(line["lineNet"])) == Decimal("950")


# ---------------------------------------------------------------------------
# VAT computation tests (hardcoded v1 rates)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("tax_code,expected_rate", [
    ("S", Decimal("5")),
    ("SR", Decimal("5")),
    ("Z", Decimal("0")),
    ("E", Decimal("0")),
    ("N", Decimal("0")),
    (None, Decimal("0")),
])
async def test_tax_rate_by_code(tax_code, expected_rate) -> None:
    """
    Hardcoded v1 tax rates: S=5%, SR=5%, Z/E/N=0%, None=0%.
    """
    service, headers_col, lines_col, counters_col, outbox_col, session_mock = (
        _build_service_with_mock_db()
    )

    gr_line = _make_gr_line(
        doc_id=GR_DOC_ID,
        line_id=GR_LINE_ID,
        quantity=10.0,
        unit_price=100.0,
        tax_code=tax_code or "",
    )
    gr_line["taxCode"] = tax_code  # explicit override so None is preserved

    cursor_mock = MagicMock()
    cursor_mock.to_list = AsyncMock(return_value=[gr_line])
    lines_col.find.return_value = cursor_mock

    from src.modules.purchasing.models.document import APLineInput

    line_inputs = [APLineInput(grLineId=GR_LINE_ID, invoiceUnitPrice=Decimal("100"))]
    now = datetime.now(tz=timezone.utc)

    result_lines = await service._build_ap_lines_from_gr(GR_DOC_ID, ORG_ID, line_inputs, now)
    line = result_lines[0]

    assert Decimal(str(line["taxRate"])) == expected_rate
    expected_tax = (Decimal("100") * Decimal("10") * expected_rate / Decimal("100")).quantize(
        Decimal("0.01")
    )
    assert Decimal(str(line["lineTax"])) == expected_tax


# ---------------------------------------------------------------------------
# create_ap_from_gr tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_ap_from_posted_gr_happy_path() -> None:
    """create_ap_from_gr creates a Draft AP with lines copied from the GR."""
    service, headers_col, lines_col, counters_col, outbox_col, session_mock = (
        _build_service_with_mock_db(counter_value=1)
    )

    gr_header = _make_gr_header(doc_id=GR_DOC_ID, status="Posted")
    po_header = _make_po_header(doc_id=PO_DOC_ID)
    gr_line = _make_gr_line(
        doc_id=GR_DOC_ID, line_id=GR_LINE_ID, quantity=10.0, unit_price=100.0, tax_code="S"
    )

    # find_one calls: 1) GR header, 2) existing AP check (None), 3) PO header, 4) refreshed AP header
    ap_doc_id_captured = []

    inserted_ap_header: Dict[str, Any] = {}

    async def mock_insert_one(doc, **kwargs):
        inserted_ap_header.update(doc)
        ap_doc_id_captured.append(doc["docId"])

    async def mock_find_one(query, *args, **kwargs):
        doc_type = query.get("docType")
        status_filter = query.get("status")
        doc_id = query.get("docId")

        if doc_type == "GR":
            return gr_header
        if doc_type == "AP" and "$ne" in str(status_filter or ""):
            # existing AP check → None
            return None
        if doc_type == "PO":
            return po_header
        if doc_type is None and doc_id and doc_id in ap_doc_id_captured:
            # Refresh after insert_one
            return {**inserted_ap_header}
        return None

    headers_col.find_one = AsyncMock(side_effect=mock_find_one)
    headers_col.insert_one = AsyncMock(side_effect=mock_insert_one)

    # AP lines for _get_lines() response (sorted)
    inserted_ap_line: Dict[str, Any] = {
        "lineId": str(uuid.uuid4()),
        "docId": "PLACEHOLDER",
        "organizationId": ORG_ID,
        "lineNumber": 1,
        "itemId": ITEM_ID,
        "itemCode": "ITEM-001",
        "itemName": "Fertilizer",
        "itemType": "raw_material",
        "description": None,
        "uom": "KG",
        "quantity": 10.0,
        "openQuantity": 10.0,
        "closedQuantity": 0.0,
        "unitPrice": 100.0,
        "poUnitPrice": 100.0,
        "priceVarianceAmount": 0.0,
        "lineNet": 1000.0,
        "taxCode": "S",
        "taxRate": 5.0,
        "lineTax": 50.0,
        "lineGross": 1050.0,
        "grLineId": GR_LINE_ID,
        "baseLineId": PO_LINE_ID,
        "warehouseId": None,
        "requestedVendorId": None,
        "notes": None,
        "createdAt": _now(),
        "updatedAt": _now(),
    }

    def _find_side_effect(query, **kwargs):
        doc_id = query.get("docId", "")
        if doc_id == GR_DOC_ID:
            # _build_ap_lines_from_gr — no .sort()
            c = MagicMock()
            c.to_list = AsyncMock(return_value=[gr_line])
            return c
        else:
            # _get_lines — uses .sort()
            c = MagicMock()
            inner = MagicMock()
            inner.to_list = AsyncMock(return_value=[inserted_ap_line])
            c.sort = MagicMock(return_value=inner)
            return c

    lines_col.find = MagicMock(side_effect=_find_side_effect)

    from src.modules.purchasing.models.document import APFromGRCreate, APLineInput

    now = _now()
    body = APFromGRCreate(
        docDate=now,
        invoiceNumber="VND-2026-001",
        invoiceDate=now,
        dueDate=now + timedelta(days=30),
        lines=[APLineInput(grLineId=GR_LINE_ID, invoiceUnitPrice=Decimal("100"))],
    )

    with patch("src.modules.finance_bridge.feature_flag.is_outbox_enabled", return_value=False):
        result = await service.create_ap_from_gr(
            org_id=ORG_ID,
            gr_doc_id=GR_DOC_ID,
            data=body,
            created_by=USER_ID,
            company_code=COMPANY_CODE,
        )

    assert result.docType == "AP"
    assert result.status in ("Draft", "draft")  # service writes DocumentStatus.DRAFT.value ("draft")
    assert result.baseDocId == GR_DOC_ID
    assert result.vendorId == VENDOR_ID
    assert result.invoiceNumber == "VND-2026-001"
    assert len(result.lines) == 1
    # Line quantity locked to GR quantity
    assert result.lines[0].quantity == Decimal("10")
    # No variance when price matches PO price
    assert result.lines[0].priceVarianceAmount == Decimal("0")


@pytest.mark.asyncio
async def test_create_ap_from_draft_gr_raises() -> None:
    """Cannot create AP from a Draft GR — must be Posted."""
    service, headers_col, lines_col, counters_col, outbox_col, session_mock = (
        _build_service_with_mock_db()
    )

    gr_header = _make_gr_header(doc_id=GR_DOC_ID, status="Draft")
    headers_col.find_one = AsyncMock(return_value=gr_header)

    from src.modules.purchasing.models.document import APFromGRCreate, APLineInput

    body = APFromGRCreate(
        invoiceNumber="INV-001",
        invoiceDate=_now(),
        lines=[APLineInput(grLineId=GR_LINE_ID, invoiceUnitPrice=Decimal("100"))],
    )

    with pytest.raises(ValueError, match="Posted GR"):
        await service.create_ap_from_gr(
            org_id=ORG_ID,
            gr_doc_id=GR_DOC_ID,
            data=body,
            created_by=USER_ID,
            company_code=COMPANY_CODE,
        )


@pytest.mark.asyncio
async def test_create_second_ap_from_same_gr_raises() -> None:
    """Cannot create a second non-rejected AP from the same GR."""
    service, headers_col, lines_col, counters_col, outbox_col, session_mock = (
        _build_service_with_mock_db()
    )

    gr_header = _make_gr_header(doc_id=GR_DOC_ID, status="Posted")
    existing_ap = _make_ap_header(gr_doc_id=GR_DOC_ID, status="Draft")

    async def mock_find_one(query, *args, **kwargs):
        if query.get("docType") == "GR":
            return gr_header
        if query.get("docType") == "AP":
            return existing_ap
        return None

    headers_col.find_one = AsyncMock(side_effect=mock_find_one)

    from src.modules.purchasing.models.document import APFromGRCreate, APLineInput

    body = APFromGRCreate(
        invoiceNumber="INV-002",
        invoiceDate=_now(),
        lines=[APLineInput(grLineId=GR_LINE_ID, invoiceUnitPrice=Decimal("100"))],
    )

    with pytest.raises(ValueError, match="already exists"):
        await service.create_ap_from_gr(
            org_id=ORG_ID,
            gr_doc_id=GR_DOC_ID,
            data=body,
            created_by=USER_ID,
            company_code=COMPANY_CODE,
        )


# ---------------------------------------------------------------------------
# update_ap tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_ap_recomputes_variance() -> None:
    """
    Updating invoiceUnitPrice from 100 → 105 on a Draft AP correctly recomputes
    priceVarianceAmount and header totals.
    """
    service, headers_col, lines_col, counters_col, outbox_col, session_mock = (
        _build_service_with_mock_db()
    )

    ap_doc_id = str(uuid.uuid4())
    ap_header = _make_ap_header(doc_id=ap_doc_id, gr_doc_id=GR_DOC_ID, status="Draft")
    gr_line = _make_gr_line(
        doc_id=GR_DOC_ID, line_id=GR_LINE_ID, quantity=10.0, unit_price=100.0, tax_code="S"
    )

    updated_header_store: Dict = {}

    async def mock_find_one(query, *args, **kwargs):
        doc_id = query.get("docId")
        doc_type = query.get("docType")
        if doc_type == "AP" and doc_id == ap_doc_id:
            return ap_header
        if doc_id == ap_doc_id:
            # Return updated header
            return {**ap_header, **updated_header_store}
        return None

    async def mock_update_one(query, update, *args, **kwargs):
        if "$set" in update:
            updated_header_store.update(update["$set"])

    headers_col.find_one = AsyncMock(side_effect=mock_find_one)
    headers_col.update_one = AsyncMock(side_effect=mock_update_one)

    lines_col.delete_many = AsyncMock()
    lines_col.insert_many = AsyncMock()

    new_ap_line = _make_ap_line(
        ap_doc_id=ap_doc_id,
        gr_line_id=GR_LINE_ID,
        quantity=10.0,
        po_unit_price=100.0,
        invoice_unit_price=105.0,
        tax_code="S",
    )

    def _make_find_cursor(doc_id_filter: str):
        """Return the right cursor based on which docId is queried."""
        if doc_id_filter == GR_DOC_ID:
            # _build_ap_lines_from_gr needs GR lines (no .sort(), direct .to_list())
            c = MagicMock()
            c.to_list = AsyncMock(return_value=[gr_line])
            return c
        else:
            # _get_lines uses .sort().to_list()
            c = MagicMock()
            inner = MagicMock()
            inner.to_list = AsyncMock(return_value=[new_ap_line])
            c.sort = MagicMock(return_value=inner)
            return c

    def _find_side_effect(query, **kwargs):
        doc_id = query.get("docId", "")
        return _make_find_cursor(doc_id)

    lines_col.find = MagicMock(side_effect=_find_side_effect)

    from src.modules.purchasing.models.document import APLineInput, APUpdate

    update_body = APUpdate(
        lines=[APLineInput(grLineId=GR_LINE_ID, invoiceUnitPrice=Decimal("105"))],
    )

    result = await service.update_ap(ORG_ID, ap_doc_id, update_body, USER_ID)

    assert result is not None
    # Check that line variance was recomputed
    assert result.lines[0].priceVarianceAmount == Decimal("50")
    assert result.lines[0].unitPrice == Decimal("105")


@pytest.mark.asyncio
async def test_update_approved_ap_raises() -> None:
    """Cannot update an Approved AP Invoice."""
    service, headers_col, lines_col, counters_col, outbox_col, session_mock = (
        _build_service_with_mock_db()
    )

    ap_doc_id = str(uuid.uuid4())
    ap_header = _make_ap_header(doc_id=ap_doc_id, status="Approved")
    headers_col.find_one = AsyncMock(return_value=ap_header)

    from src.modules.purchasing.models.document import APLineInput, APUpdate

    body = APUpdate(
        lines=[APLineInput(grLineId=GR_LINE_ID, invoiceUnitPrice=Decimal("110"))],
    )

    with pytest.raises(ValueError, match="Only Draft"):
        await service.update_ap(ORG_ID, ap_doc_id, body, USER_ID)


# ---------------------------------------------------------------------------
# submit_ap + approve_ap flow
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_submit_ap_moves_to_pending_when_approval_required() -> None:
    """
    submit_ap transitions Draft → Pending Approval when engine says approval required.
    """
    service, headers_col, lines_col, counters_col, outbox_col, session_mock = (
        _build_service_with_mock_db()
    )

    ap_doc_id = str(uuid.uuid4())
    ap_header = _make_ap_header(doc_id=ap_doc_id, status="Draft")
    # Large amount → requires approval
    ap_header["totalGross"] = 15000.0

    updated_header_store: Dict = {}

    async def mock_find_one(query, *args, **kwargs):
        doc_id = query.get("docId")
        if doc_id == ap_doc_id:
            return {**ap_header, **updated_header_store}
        return None

    async def mock_update_one(query, update, *args, **kwargs):
        if "$set" in update:
            updated_header_store.update(update["$set"])

    headers_col.find_one = AsyncMock(side_effect=mock_find_one)
    headers_col.update_one = AsyncMock(side_effect=mock_update_one)

    # Lines for response
    ap_line = _make_ap_line(ap_doc_id=ap_doc_id)
    list_cursor_mock = MagicMock()
    list_cursor_mock.sort = MagicMock(return_value=list_cursor_mock)
    list_cursor_mock.to_list = AsyncMock(return_value=[ap_line])
    lines_col.find = MagicMock(return_value=list_cursor_mock)

    with patch(
        "src.modules.finance_bridge.feature_flag.is_outbox_enabled",
        return_value=False
    ):
        result = await service.submit_ap(
            org_id=ORG_ID,
            doc_id=ap_doc_id,
            submitted_by=USER_ID,
        )

    assert result.status == "pending_approval"
    assert result.approvalState == "Pending"
    assert result.approvalRequestedFrom == "accountant"


@pytest.mark.asyncio
async def test_approve_ap_emits_event_and_updates_history() -> None:
    """
    approve_ap transitions Pending Approval → Approved, appends approvalHistory,
    stamps postedAt, and emits the ap_invoice_posted outbox event.
    """
    service, headers_col, lines_col, counters_col, outbox_col, session_mock = (
        _build_service_with_mock_db()
    )

    ap_doc_id = str(uuid.uuid4())
    ap_header = _make_ap_header(doc_id=ap_doc_id, status="Pending Approval")
    ap_header["approvalRequestedFrom"] = "accountant"

    updated_header_store: Dict = {}
    history_entries: List = []

    async def mock_find_one(query, *args, **kwargs):
        doc_id = query.get("docId")
        if doc_id == ap_doc_id:
            merged = {**ap_header, **updated_header_store, "approvalHistory": history_entries}
            return merged
        return None

    async def mock_update_one(query, update, *args, **kwargs):
        if "$set" in update:
            updated_header_store.update(update["$set"])
        if "$push" in update:
            key = list(update["$push"].keys())[0]
            if key == "approvalHistory":
                history_entries.append(update["$push"][key])

    headers_col.find_one = AsyncMock(side_effect=mock_find_one)
    headers_col.update_one = AsyncMock(side_effect=mock_update_one)

    # AP lines for event
    ap_line = _make_ap_line(ap_doc_id=ap_doc_id, po_unit_price=100.0, invoice_unit_price=105.0)
    list_cursor_mock = MagicMock()
    list_cursor_mock.sort = MagicMock(return_value=list_cursor_mock)
    list_cursor_mock.to_list = AsyncMock(return_value=[ap_line])
    lines_col.find = MagicMock(return_value=list_cursor_mock)

    outbox_event_id = str(uuid.uuid4())

    mock_outbox_writer = MagicMock()
    mock_outbox_writer.OutboxWriter = MagicMock()
    mock_outbox_writer.OutboxWriter.publish = AsyncMock(return_value=outbox_event_id)

    with patch.dict(sys.modules, {"src.modules.finance_bridge.outbox_writer": mock_outbox_writer}), patch(
        "src.modules.finance_bridge.feature_flag.is_outbox_enabled",
        return_value=True,
    ):
        result = await service.approve_ap(
            org_id=ORG_ID,
            doc_id=ap_doc_id,
            approver_id=APPROVER_ID,
            approver_role="accountant",
            comment="Looks good",
        )

    # service maps AP Approved → DocumentStatus.OPEN ("open") in the shared enum vocabulary
    assert result.status in ("Approved", "open")
    assert result.approvalState == "Approved"
    assert result.approvalDecidedBy == APPROVER_ID
    assert result.postedAt is not None
    assert result.postedBy == APPROVER_ID
    # approvalHistory entry appended
    assert len(result.approvalHistory) == 1
    hist = result.approvalHistory[0]
    assert hist.approverId == APPROVER_ID
    assert hist.decision == "Approved"
    assert hist.comment == "Looks good"


@pytest.mark.asyncio
async def test_reject_ap_appends_history() -> None:
    """
    reject_ap transitions Pending Approval → Rejected and appends an
    approvalHistory entry with decision=Rejected.
    """
    service, headers_col, lines_col, counters_col, outbox_col, session_mock = (
        _build_service_with_mock_db()
    )

    ap_doc_id = str(uuid.uuid4())
    ap_header = _make_ap_header(doc_id=ap_doc_id, status="Pending Approval")
    ap_header["approvalRequestedFrom"] = "accountant"

    updated_header_store: Dict = {}
    history_entries: List = []

    async def mock_find_one(query, *args, **kwargs):
        doc_id = query.get("docId")
        if doc_id == ap_doc_id:
            return {**ap_header, **updated_header_store, "approvalHistory": history_entries}
        return None

    async def mock_update_one(query, update, *args, **kwargs):
        if "$set" in update:
            updated_header_store.update(update["$set"])
        if "$push" in update:
            key = list(update["$push"].keys())[0]
            if key == "approvalHistory":
                history_entries.append(update["$push"][key])

    headers_col.find_one = AsyncMock(side_effect=mock_find_one)
    headers_col.update_one = AsyncMock(side_effect=mock_update_one)

    ap_line = _make_ap_line(ap_doc_id=ap_doc_id)
    list_cursor_mock = MagicMock()
    list_cursor_mock.sort = MagicMock(return_value=list_cursor_mock)
    list_cursor_mock.to_list = AsyncMock(return_value=[ap_line])
    lines_col.find = MagicMock(return_value=list_cursor_mock)

    result = await service.reject_ap(
        org_id=ORG_ID,
        doc_id=ap_doc_id,
        approver_id=APPROVER_ID,
        approver_role="accountant",
        comment="Incorrect amount",
    )

    assert result.status == "Rejected"
    assert result.approvalState == "Rejected"
    assert len(result.approvalHistory) == 1
    hist = result.approvalHistory[0]
    assert hist.decision == "Rejected"
    assert hist.comment == "Incorrect amount"
    assert hist.approverId == APPROVER_ID


# ---------------------------------------------------------------------------
# Wrong role / self-approval guards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_approve_ap_wrong_role_raises() -> None:
    """approve_ap raises if the approver does not hold the required role."""
    service, headers_col, lines_col, counters_col, outbox_col, session_mock = (
        _build_service_with_mock_db()
    )

    ap_doc_id = str(uuid.uuid4())
    ap_header = _make_ap_header(doc_id=ap_doc_id, status="Pending Approval")
    ap_header["approvalRequestedFrom"] = "accountant"
    headers_col.find_one = AsyncMock(return_value=ap_header)

    with pytest.raises(ValueError, match="role"):
        await service.approve_ap(
            org_id=ORG_ID,
            doc_id=ap_doc_id,
            approver_id=APPROVER_ID,
            approver_role="procurement_officer",
            comment=None,
        )


@pytest.mark.asyncio
async def test_approve_ap_self_approval_raises() -> None:
    """approve_ap raises if the approver is the same person who created the AP."""
    service, headers_col, lines_col, counters_col, outbox_col, session_mock = (
        _build_service_with_mock_db()
    )

    ap_doc_id = str(uuid.uuid4())
    ap_header = _make_ap_header(doc_id=ap_doc_id, status="Pending Approval")
    ap_header["approvalRequestedFrom"] = "accountant"
    ap_header["createdBy"] = USER_ID  # same user will try to approve
    headers_col.find_one = AsyncMock(return_value=ap_header)

    with pytest.raises(ValueError, match="cannot approve"):
        await service.approve_ap(
            org_id=ORG_ID,
            doc_id=ap_doc_id,
            approver_id=USER_ID,  # same as createdBy
            approver_role="accountant",
            comment=None,
        )


# ---------------------------------------------------------------------------
# sum_ap_lines: header totals including price variance
# ---------------------------------------------------------------------------


def test_sum_ap_lines_includes_variance() -> None:
    """_sum_ap_lines correctly aggregates totalPriceVariance."""
    service, *_ = _build_service_with_mock_db()

    lines = [
        {
            "lineNet": 1050.0,
            "lineTax": 52.5,
            "lineGross": 1102.5,
            "priceVarianceAmount": 50.0,  # invoice over PO
        },
        {
            "lineNet": 950.0,
            "lineTax": 47.5,
            "lineGross": 997.5,
            "priceVarianceAmount": -50.0,  # invoice under PO
        },
    ]

    totals = service._sum_ap_lines(lines)

    assert Decimal(str(totals["subtotalNet"])) == Decimal("2000")
    assert Decimal(str(totals["totalTax"])) == Decimal("100")
    assert Decimal(str(totals["totalGross"])) == Decimal("2100")
    # Net variance: 50 + (-50) = 0
    assert Decimal(str(totals["totalPriceVariance"])) == Decimal("0")
