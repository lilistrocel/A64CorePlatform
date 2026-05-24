"""
Unit tests for T-057-1a (Wave 1a): per-line discountPercent and costCenterId.

Covers the pure-function pieces that don't need a Mongo mock:
  - `_compute_line_totals` applies the discount factor and persists both fields.
  - `_line_to_response` round-trips both fields back into DocumentLineResponse.
  - `build_ap_invoice_event_payload` propagates costCenterId per line.
  - The PR-line-dict shape persisted to Mongo (asserted via _compute_line_totals)
    carries discountPercent + costCenterId so downstream GR / AP builders can
    inherit them.

Cost-center JE tagging on the finance handler side is covered separately in
services/finance/tests/test_posting_ap_invoice_cost_center.py.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from src.modules.purchasing.models.document import DocumentLineCreate
from src.modules.purchasing.services.document_service import (
    _compute_line_totals,
    _line_to_response,
    build_ap_invoice_event_payload,
)


def _line_input(
    qty: str = "10",
    price: str = "100",
    disc: str = "0",
    cc: str | None = None,
    tax_code: str | None = "S",
) -> DocumentLineCreate:
    return DocumentLineCreate(
        itemId=str(uuid.uuid4()),
        uom="KG",
        quantity=Decimal(qty),
        unitPrice=Decimal(price),
        discountPercent=Decimal(disc),
        costCenterId=cc,
        taxCode=tax_code,
    )


# ---------------------------------------------------------------------------
# _compute_line_totals
# ---------------------------------------------------------------------------


def test_compute_line_totals_zero_discount_matches_prior_behaviour() -> None:
    """Discount of 0 must produce the same lineNet/Tax/Gross as before."""
    line = _line_input(qty="10", price="100", disc="0", tax_code="S")
    out = _compute_line_totals(line, item_code="X", item_name="X")

    assert out["discountPercent"] == 0.0
    assert out["costCenterId"] is None
    assert out["lineNet"] == 1000.00
    assert out["lineTax"] == 50.00  # 5% of 1000
    assert out["lineGross"] == 1050.00


def test_compute_line_totals_ten_percent_discount_reduces_all_totals() -> None:
    """10% discount: lineNet, lineTax, lineGross all scaled by 0.9."""
    line = _line_input(qty="10", price="100", disc="10", tax_code="S")
    out = _compute_line_totals(line, item_code="X", item_name="X")

    assert out["discountPercent"] == 10.0
    assert out["lineNet"] == 900.00          # 10 * 100 * 0.9
    assert out["lineTax"] == 45.00           # 5% of 900
    assert out["lineGross"] == 945.00


def test_compute_line_totals_persists_cost_center_id() -> None:
    """costCenterId must round-trip into the persisted line dict."""
    line = _line_input(cc="CC-WAREHOUSE-A")
    out = _compute_line_totals(line, item_code="X", item_name="X")
    assert out["costCenterId"] == "CC-WAREHOUSE-A"


def test_compute_line_totals_no_tax_code_zero_tax_with_discount() -> None:
    """Discount still applies when no taxCode is set (lineTax = 0)."""
    line = _line_input(qty="5", price="200", disc="25", tax_code=None)
    out = _compute_line_totals(line, item_code="X", item_name="X")

    assert out["lineNet"] == 750.00          # 5 * 200 * 0.75
    assert out["lineTax"] == 0.0
    assert out["lineGross"] == 750.00


# ---------------------------------------------------------------------------
# _line_to_response
# ---------------------------------------------------------------------------


def test_line_to_response_round_trips_discount_and_cost_center() -> None:
    """A persisted line doc with the new fields surfaces them on the response."""
    now = datetime.now(tz=timezone.utc)
    doc = {
        "lineId": str(uuid.uuid4()),
        "docId": str(uuid.uuid4()),
        "organizationId": str(uuid.uuid4()),
        "lineNumber": 1,
        "itemId": str(uuid.uuid4()),
        "itemCode": "X",
        "itemName": "X",
        "uom": "KG",
        "quantity": 10.0,
        "openQuantity": 10.0,
        "closedQuantity": 0.0,
        "unitPrice": 100.0,
        "discountPercent": 15.0,
        "lineNet": 850.0,
        "taxCode": "S",
        "taxRate": 5.0,
        "lineTax": 42.50,
        "lineGross": 892.50,
        "costCenterId": "CC-OPS-01",
        "createdAt": now,
        "updatedAt": now,
    }
    resp = _line_to_response(doc)
    assert resp.discountPercent == Decimal("15")
    assert resp.costCenterId == "CC-OPS-01"
    assert resp.lineNet == Decimal("850")


def test_line_to_response_defaults_missing_fields_to_zero_and_none() -> None:
    """Old line docs lacking the new fields default safely."""
    now = datetime.now(tz=timezone.utc)
    doc = {
        "lineId": str(uuid.uuid4()),
        "docId": str(uuid.uuid4()),
        "organizationId": str(uuid.uuid4()),
        "lineNumber": 1,
        "itemId": str(uuid.uuid4()),
        "itemCode": "X",
        "itemName": "X",
        "uom": "KG",
        "quantity": 1.0,
        "openQuantity": 1.0,
        "closedQuantity": 0.0,
        "unitPrice": 100.0,
        "lineNet": 100.0,
        "taxCode": None,
        "taxRate": 0.0,
        "lineTax": 0.0,
        "lineGross": 100.0,
        "createdAt": now,
        "updatedAt": now,
    }
    resp = _line_to_response(doc)
    assert resp.discountPercent == Decimal("0")
    assert resp.costCenterId is None


# ---------------------------------------------------------------------------
# build_ap_invoice_event_payload
# ---------------------------------------------------------------------------


def test_ap_event_payload_propagates_cost_center_id_per_line() -> None:
    """costCenterId on stored AP line dicts must surface in the event payload
    so the finance handler can tag JE lines per cost centre."""
    now = datetime.now(tz=timezone.utc)
    header = {
        "docId": str(uuid.uuid4()),
        "docNumber": "AP-2026-0001",
        "docDate": now,
        "invoiceDate": now,
        "dueDate": None,
        "baseDocId": str(uuid.uuid4()),
        "baseDocNumber": "GR-2026-0001",
        "vendorId": str(uuid.uuid4()),
        "companyCode": "1000",
        "invoiceNumber": "INV-001",
        "subtotalNet": 1800,
        "totalTax": 90,
        "totalGross": 1890,
    }
    lines = [
        {
            "lineNumber": 1,
            "itemId": str(uuid.uuid4()),
            "itemCode": "X1",
            "itemName": "X1",
            "itemType": "raw_material",
            "quantity": 10,
            "uom": "KG",
            "unitPrice": 90,
            "poUnitPrice": 100,
            "priceVarianceAmount": -100,
            "lineNet": 900,
            "lineTax": 45,
            "lineGross": 945,
            "taxCode": "S",
            "costCenterId": "CC-WAREHOUSE-A",
            "grLineId": str(uuid.uuid4()),
            "baseLineId": str(uuid.uuid4()),
        },
        {
            "lineNumber": 2,
            "itemId": str(uuid.uuid4()),
            "itemCode": "X2",
            "itemName": "X2",
            "itemType": "raw_material",
            "quantity": 10,
            "uom": "KG",
            "unitPrice": 90,
            "poUnitPrice": 90,
            "priceVarianceAmount": 0,
            "lineNet": 900,
            "lineTax": 45,
            "lineGross": 945,
            "taxCode": "S",
            "costCenterId": None,
            "grLineId": str(uuid.uuid4()),
            "baseLineId": str(uuid.uuid4()),
        },
    ]
    payload = build_ap_invoice_event_payload(header, lines)

    assert payload["lines"][0]["costCenterId"] == "CC-WAREHOUSE-A"
    assert payload["lines"][1]["costCenterId"] is None
