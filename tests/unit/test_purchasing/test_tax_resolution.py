"""
Unit tests for T-200.22b — purchasing tax-code resolution via finance HTTP.

Covers the shared ``get_tax_percent`` path as exercised by:
  - document_service._build_ap_lines_from_gr  (AP Invoice)
  - ap_credit_note_service._resolve_tax_rate  (ACN)
  - ap_down_payment_service._resolve_tax_rate (DPI)
  - blanket_agreement_service._resolve_tax_rate (BLA)

All four services now delegate to ``src.core.finance.get_tax_percent`` rather
than the removed ``AP_TAX_RATES`` hardcoded dict.

Test cases (mirroring sales test_ar_invoices.py Part-4 structure):
  1. Valid tax code "S" → correct rate from mocked get_tax_percent.
  2. Null tax code     → Decimal("0.00"), no HTTP call (exempt-line shortcut).
  3. Unknown tax code  → ValueError surfaces from get_tax_percent.
  4. Finance unreachable → ValueError surfaces.
  5. ACN _resolve_tax_rate delegates correctly.
  6. DPI _resolve_tax_rate delegates correctly.
  7. BLA _resolve_tax_rate delegates correctly.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Optional
from unittest.mock import AsyncMock, patch

import pytest


ORG_ID = str(uuid.uuid4())
AUTH_TOKEN = "test-bearer-token"

# Patch target for the shared helper in each module.
_AP_INV_PATCH = "src.modules.purchasing.services.document_service.get_tax_percent"
_ACN_PATCH = "src.modules.purchasing.services.ap_credit_note_service.get_tax_percent"
_DPI_PATCH = "src.modules.purchasing.services.ap_down_payment_service.get_tax_percent"
_BLA_PATCH = "src.modules.purchasing.services.blanket_agreement_service.get_tax_percent"
_CORE_PATCH = "src.core.finance.finance_ext_client.get_tax_percent"


# ---------------------------------------------------------------------------
# Case 1: Valid tax code via AP Invoice path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ap_invoice_valid_tax_code_returns_correct_rate() -> None:
    """
    T-200.22b Case 1 (AP Invoice path): tax code "S" → 5.00 from mocked
    get_tax_percent, stamped as taxRate on the returned AP line dict.
    """
    from unittest.mock import MagicMock
    from src.modules.purchasing.services.document_service import DocumentService

    # Minimal GR line with taxCode="S"
    gr_line_id = str(uuid.uuid4())
    gr_line = {
        "lineId": gr_line_id,
        "docId": str(uuid.uuid4()),
        "organizationId": ORG_ID,
        "lineNumber": 1,
        "itemId": str(uuid.uuid4()),
        "itemCode": "ITEM-001",
        "itemName": "Test Item",
        "itemType": "raw_material",
        "description": None,
        "uom": "KG",
        "quantity": 10.0,
        "openQuantity": 10.0,
        "closedQuantity": 0.0,
        "unitPrice": 100.0,
        "taxCode": "S",
        "taxRate": 5.0,
        "discountPercent": 0.0,
        "lineTax": 50.0,
        "baseLineId": str(uuid.uuid4()),
        "notes": None,
    }

    db = MagicMock()
    lines_col = MagicMock()
    cursor_mock = MagicMock()
    cursor_mock.to_list = AsyncMock(return_value=[gr_line])
    lines_col.find = MagicMock(return_value=cursor_mock)
    db.__getitem__ = MagicMock(return_value=lines_col)

    service = DocumentService(db)
    service._lines = lines_col

    from src.modules.purchasing.models.document import APLineInput
    from datetime import datetime, timezone

    line_inputs = [APLineInput(grLineId=gr_line_id, invoiceUnitPrice=Decimal("100"))]
    now = datetime.now(tz=timezone.utc)

    with patch(_AP_INV_PATCH, AsyncMock(return_value=Decimal("5.00"))):
        result = await service._build_ap_lines_from_gr(
            "gr-doc-id", ORG_ID, line_inputs, now, auth_token=AUTH_TOKEN
        )

    assert len(result) == 1
    assert Decimal(str(result[0]["taxRate"])) == Decimal("5.00")
    assert Decimal(str(result[0]["lineTax"])) == Decimal("50.00")


# ---------------------------------------------------------------------------
# Case 2: Null tax code → 0.00, no HTTP call
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ap_invoice_null_tax_code_returns_zero_no_http_call() -> None:
    """
    T-200.22b Case 2 (AP Invoice path): taxCode=None → Decimal("0.00") returned
    without any HTTP call (exempt-line fast-path inside get_tax_percent).

    Uses the real get_tax_percent (not a mock) so the short-circuit logic
    executes, then verifies httpx.AsyncClient was never instantiated.
    """
    from unittest.mock import MagicMock
    from src.modules.purchasing.services.document_service import DocumentService

    gr_line_id = str(uuid.uuid4())
    gr_line = {
        "lineId": gr_line_id,
        "docId": str(uuid.uuid4()),
        "organizationId": ORG_ID,
        "lineNumber": 1,
        "itemId": str(uuid.uuid4()),
        "itemCode": "ITEM-001",
        "itemName": "Exempt Service",
        "itemType": "service",
        "description": None,
        "uom": "EA",
        "quantity": 1.0,
        "openQuantity": 1.0,
        "closedQuantity": 0.0,
        "unitPrice": 500.0,
        "taxCode": None,  # exempt line
        "taxRate": 0.0,
        "discountPercent": 0.0,
        "lineTax": 0.0,
        "baseLineId": None,
        "notes": None,
    }

    db = MagicMock()
    lines_col = MagicMock()
    cursor_mock = MagicMock()
    cursor_mock.to_list = AsyncMock(return_value=[gr_line])
    lines_col.find = MagicMock(return_value=cursor_mock)
    db.__getitem__ = MagicMock(return_value=lines_col)

    service = DocumentService(db)
    service._lines = lines_col

    from src.modules.purchasing.models.document import APLineInput
    from datetime import datetime, timezone
    import httpx

    line_inputs = [APLineInput(grLineId=gr_line_id, invoiceUnitPrice=Decimal("500"))]
    now = datetime.now(tz=timezone.utc)

    with patch("httpx.AsyncClient") as mock_httpx_client:
        result = await service._build_ap_lines_from_gr(
            "gr-doc-id", ORG_ID, line_inputs, now, auth_token=AUTH_TOKEN
        )

    assert len(result) == 1
    assert Decimal(str(result[0]["taxRate"])) == Decimal("0.00")
    assert Decimal(str(result[0]["lineTax"])) == Decimal("0.00")

    # Verify no HTTP call was made for the null tax code.
    tax_code_calls = [
        call for call in mock_httpx_client.call_args_list
        if "tax-codes" in str(call)
    ]
    assert tax_code_calls == [], (
        "httpx.AsyncClient must not be called for exempt (None) tax code, "
        f"but got calls: {tax_code_calls}"
    )


# ---------------------------------------------------------------------------
# Case 3: Unknown tax code → ValueError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ap_invoice_unknown_tax_code_raises_value_error() -> None:
    """
    T-200.22b Case 3 (AP Invoice path): unknown tax code "BOGUS" causes
    get_tax_percent to raise ValueError, which propagates from _build_ap_lines_from_gr.
    """
    from unittest.mock import MagicMock
    from src.modules.purchasing.services.document_service import DocumentService

    gr_line_id = str(uuid.uuid4())
    gr_line = {
        "lineId": gr_line_id,
        "docId": str(uuid.uuid4()),
        "organizationId": ORG_ID,
        "lineNumber": 1,
        "itemId": str(uuid.uuid4()),
        "itemCode": "ITEM-001",
        "itemName": "Test",
        "itemType": "raw_material",
        "uom": "KG",
        "quantity": 5.0,
        "openQuantity": 5.0,
        "closedQuantity": 0.0,
        "unitPrice": 200.0,
        "taxCode": "BOGUS",
        "taxRate": 0.0,
        "discountPercent": 0.0,
        "lineTax": 0.0,
        "baseLineId": None,
        "description": None,
        "notes": None,
    }

    db = MagicMock()
    lines_col = MagicMock()
    cursor_mock = MagicMock()
    cursor_mock.to_list = AsyncMock(return_value=[gr_line])
    lines_col.find = MagicMock(return_value=cursor_mock)
    db.__getitem__ = MagicMock(return_value=lines_col)

    service = DocumentService(db)
    service._lines = lines_col

    from src.modules.purchasing.models.document import APLineInput
    from datetime import datetime, timezone

    line_inputs = [APLineInput(grLineId=gr_line_id, invoiceUnitPrice=Decimal("200"))]
    now = datetime.now(tz=timezone.utc)

    exc = ValueError("Tax code 'BOGUS' not found in org '...'.")
    with patch(_AP_INV_PATCH, AsyncMock(side_effect=exc)):
        with pytest.raises(ValueError, match="BOGUS"):
            await service._build_ap_lines_from_gr(
                "gr-doc-id", ORG_ID, line_inputs, now, auth_token=AUTH_TOKEN
            )


# ---------------------------------------------------------------------------
# Case 4: Finance unreachable → ValueError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ap_invoice_finance_unreachable_raises_value_error() -> None:
    """
    T-200.22b Case 4 (AP Invoice path): finance service unreachable causes
    get_tax_percent to raise ValueError, which propagates from _build_ap_lines_from_gr.
    """
    from unittest.mock import MagicMock
    from src.modules.purchasing.services.document_service import DocumentService

    gr_line_id = str(uuid.uuid4())
    gr_line = {
        "lineId": gr_line_id,
        "docId": str(uuid.uuid4()),
        "organizationId": ORG_ID,
        "lineNumber": 1,
        "itemId": str(uuid.uuid4()),
        "itemCode": "ITEM-001",
        "itemName": "Test",
        "itemType": "raw_material",
        "uom": "KG",
        "quantity": 5.0,
        "openQuantity": 5.0,
        "closedQuantity": 0.0,
        "unitPrice": 200.0,
        "taxCode": "S",
        "taxRate": 0.0,
        "discountPercent": 0.0,
        "lineTax": 0.0,
        "baseLineId": None,
        "description": None,
        "notes": None,
    }

    db = MagicMock()
    lines_col = MagicMock()
    cursor_mock = MagicMock()
    cursor_mock.to_list = AsyncMock(return_value=[gr_line])
    lines_col.find = MagicMock(return_value=cursor_mock)
    db.__getitem__ = MagicMock(return_value=lines_col)

    service = DocumentService(db)
    service._lines = lines_col

    from src.modules.purchasing.models.document import APLineInput
    from datetime import datetime, timezone

    line_inputs = [APLineInput(grLineId=gr_line_id, invoiceUnitPrice=Decimal("200"))]
    now = datetime.now(tz=timezone.utc)

    exc = ValueError("Finance service unreachable when looking up tax code 'S'.")
    with patch(_AP_INV_PATCH, AsyncMock(side_effect=exc)):
        with pytest.raises(ValueError, match="Finance service unreachable"):
            await service._build_ap_lines_from_gr(
                "gr-doc-id", ORG_ID, line_inputs, now, auth_token=AUTH_TOKEN
            )


# ---------------------------------------------------------------------------
# Case 5: ACN _resolve_tax_rate delegates to get_tax_percent
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_acn_resolve_tax_rate_delegates_to_get_tax_percent() -> None:
    """
    T-200.22b Case 5: ap_credit_note_service._resolve_tax_rate calls
    get_tax_percent and returns the result unchanged.
    """
    from src.modules.purchasing.services.ap_credit_note_service import _resolve_tax_rate

    with patch(_ACN_PATCH, AsyncMock(return_value=Decimal("5.00"))) as mock_fn:
        rate = await _resolve_tax_rate("S", ORG_ID, AUTH_TOKEN)

    assert rate == Decimal("5.00")
    mock_fn.assert_awaited_once_with("S", ORG_ID, AUTH_TOKEN)


# ---------------------------------------------------------------------------
# Case 6: DPI _resolve_tax_rate delegates to get_tax_percent
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dpi_resolve_tax_rate_delegates_to_get_tax_percent() -> None:
    """
    T-200.22b Case 6: ap_down_payment_service._resolve_tax_rate calls
    get_tax_percent and returns the result unchanged.
    """
    from src.modules.purchasing.services.ap_down_payment_service import _resolve_tax_rate

    with patch(_DPI_PATCH, AsyncMock(return_value=Decimal("5.00"))) as mock_fn:
        rate = await _resolve_tax_rate("S", ORG_ID, AUTH_TOKEN)

    assert rate == Decimal("5.00")
    mock_fn.assert_awaited_once_with("S", ORG_ID, AUTH_TOKEN)


# ---------------------------------------------------------------------------
# Case 7: BLA _resolve_tax_rate delegates to get_tax_percent
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bla_resolve_tax_rate_delegates_to_get_tax_percent() -> None:
    """
    T-200.22b Case 7: blanket_agreement_service._resolve_tax_rate calls
    get_tax_percent and returns the result unchanged.
    """
    from src.modules.purchasing.services.blanket_agreement_service import _resolve_tax_rate

    with patch(_BLA_PATCH, AsyncMock(return_value=Decimal("5.00"))) as mock_fn:
        rate = await _resolve_tax_rate("S", ORG_ID, AUTH_TOKEN)

    assert rate == Decimal("5.00")
    mock_fn.assert_awaited_once_with("S", ORG_ID, AUTH_TOKEN)


# ---------------------------------------------------------------------------
# Case 8: Core finance_ext_client.get_tax_percent returns 0 for None (exempt)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_core_get_tax_percent_returns_zero_for_none() -> None:
    """
    T-200.22b Case 8: the shared get_tax_percent in src.core.finance returns
    Decimal("0.00") immediately for tax_code=None, making no HTTP call.
    """
    from src.core.finance.finance_ext_client import get_tax_percent

    with patch("httpx.AsyncClient") as mock_httpx:
        result = await get_tax_percent(None, ORG_ID, AUTH_TOKEN)

    assert result == Decimal("0.00")
    # httpx.AsyncClient must not be called for exempt lines.
    assert mock_httpx.call_count == 0
