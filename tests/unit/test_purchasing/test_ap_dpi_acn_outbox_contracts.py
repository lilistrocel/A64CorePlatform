"""
Unit tests proving the T-910 fix: ap_down_payment_posted / ap_credit_note_posted
are now registered in contracts/finance_events.py.EVENT_TYPE_REGISTRY, and the
new payload models validate against what the REAL producers actually build.

Background
----------
ap_down_payment_service._build_outbox_payload and
ap_credit_note_service._build_outbox_payload have always built a correctly
shaped dict for their respective events, but neither "ap_down_payment_posted"
nor "ap_credit_note_posted" was registered in EVENT_TYPE_REGISTRY. Every call
to OutboxWriter.publish() for these two event types raised ValueError inside
a broad `except Exception` in both services' transition_status(), so the
error was logged and swallowed -- the DPI/ACN approval succeeded but finance
received nothing.

This file does NOT touch the OutboxWriter/publish/try-except code (that is
deliberately left alone -- it already does the right thing once the payload
validates). It only proves that:
  1. Both event types are now registered.
  2. The REAL producer output validates against the newly-registered models
     without raising -- the actual proof that producer and contract now agree.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict

from contracts.finance_events import (
    ApCreditNotePostedPayload,
    ApDownPaymentPostedPayload,
    EVENT_TYPE_REGISTRY,
)
from src.modules.purchasing.services.ap_credit_note_service import (
    _build_outbox_payload as build_acn_outbox_payload,
)
from src.modules.purchasing.services.ap_down_payment_service import (
    _build_outbox_payload as build_dpi_outbox_payload,
)


ORG_ID = str(uuid.uuid4())
COMPANY_CODE = "1000"
USER_ID = str(uuid.uuid4())
VENDOR_ID = str(uuid.uuid4())
ITEM_ID = str(uuid.uuid4())
GR_LINE_ID = str(uuid.uuid4())
AP_INVOICE_ID = str(uuid.uuid4())


def _make_dpi_raw() -> Dict[str, Any]:
    """
    Representative raw ap_down_payments_v2 document, shaped exactly like
    what create_ap_down_payment / update_ap_down_payment persist to Mongo
    (see doc dict built in create_ap_down_payment, and _build_line_doc).

    Line 1: has a taxCode + non-zero tax amounts, and a real itemId.
    Line 2: taxCode is None (exempt-line shortcut) AND itemId is None
    (amount-only DPI line -- APDownPaymentLineCreate.item_id is
    Optional[str] = None, see models/document.py line 944).
    """
    now = datetime.now(tz=timezone.utc)
    return {
        "docId": str(uuid.uuid4()),
        "docNumber": "DPI-2026-0001",
        "docType": "AP_DPI",
        "organizationId": ORG_ID,
        "companyCode": COMPANY_CODE,
        "vendorId": VENDOR_ID,
        "vendorCode": "VEND-001",
        "vendorName": "Acme Supplies",
        "bpRefNo": "PO-REF-77",
        "docDate": now,
        "dueDate": None,
        "currency": "AED",
        "exchangeRate": 1.0,
        "paymentTermsId": None,
        "status": "pending_approval",
        "totals": {"net": 1000.0, "tax": 50.0, "gross": 1050.0},
        "consumedAmount": 0.0,
        "targetDocRefs": [],
        "journalMemo": None,
        "notes": None,
        "outboxEventId": None,
        "outboxEventEmittedAt": None,
        "lines": [
            {
                "lineId": str(uuid.uuid4()),
                "lineNumber": 1,
                "itemId": ITEM_ID,
                "itemCode": "ITM-001",
                "itemName": "Widget",
                "description": "Widget",
                "quantity": 1.0,
                "uom": "EA",
                "unitPrice": 952.38,
                "discountPercent": 0.0,
                "lineNet": 952.38,
                "taxCode": "S",
                "taxRate": 5.0,
                "lineTax": 47.62,
                "lineGross": 1000.0,
                "costCenterId": "CC-100",
                "notes": None,
            },
            {
                "lineId": str(uuid.uuid4()),
                "lineNumber": 2,
                # Reason: amount-only DPI line -- no itemId at all.
                "itemId": None,
                "itemCode": "",
                "itemName": None,
                "description": "Advance retainer",
                "quantity": 1.0,
                "uom": "EA",
                "unitPrice": 50.0,
                "discountPercent": 0.0,
                "lineNet": 50.0,
                # Reason: exempt line -- no taxCode.
                "taxCode": None,
                "taxRate": 0.0,
                "lineTax": 0.0,
                "lineGross": 50.0,
                "costCenterId": None,
                "notes": None,
            },
        ],
        "createdAt": now,
        "createdBy": USER_ID,
        "updatedAt": now,
        "updatedBy": USER_ID,
    }


def _make_acn_raw() -> Dict[str, Any]:
    """
    Representative raw ap_credit_notes_v2 document (from-AP-Invoice path,
    so baseInvoiceDocRef is populated), shaped like create_ap_credit_note_from_invoice
    persists it.

    Line 1: has a taxCode + non-zero tax amounts, and a grLineId (chained
    from a GR line, per APCreditNoteLineCreate.gr_line_id).
    Line 2: taxCode is None (exempt-line shortcut) and grLineId is None
    (direct correction line, not chained to a specific GR line).
    """
    now = datetime.now(tz=timezone.utc)
    return {
        "docId": str(uuid.uuid4()),
        "docNumber": "APC-2026-0001",
        "docType": "AP_CREDIT",
        "organizationId": ORG_ID,
        "companyCode": COMPANY_CODE,
        "vendorId": VENDOR_ID,
        "vendorCode": "VEND-001",
        "vendorName": "Acme Supplies",
        "bpRefNo": "PO-REF-77",
        "docDate": now,
        "creditDate": now,
        "dueDate": None,
        "currency": "AED",
        "exchangeRate": 1.0,
        "paymentTermsId": None,
        "status": "pending_approval",
        "totals": {"net": 200.0, "tax": 10.0, "gross": 210.0},
        "baseInvoiceDocRef": {
            "docType": "AP_INVOICE",
            "docId": AP_INVOICE_ID,
            "docNumber": "AP-2026-0003",
            "lineId": None,
        },
        "targetDocRefs": [],
        "journalMemo": None,
        "notes": None,
        "outboxEventId": None,
        "outboxEventEmittedAt": None,
        "lines": [
            {
                "lineId": str(uuid.uuid4()),
                "lineNumber": 1,
                "grLineId": GR_LINE_ID,
                "itemId": ITEM_ID,
                "itemCode": "ITM-001",
                "itemName": "Widget",
                "description": "Widget",
                "quantity": 2.0,
                "uom": "EA",
                "unitPrice": 95.24,
                "discountPercent": 0.0,
                "lineNet": 190.48,
                "taxCode": "S",
                "taxRate": 5.0,
                "lineTax": 9.52,
                "lineGross": 200.0,
                "costCenterId": "CC-100",
                "notes": None,
                "baseDocRef": None,
            },
            {
                "lineId": str(uuid.uuid4()),
                "lineNumber": 2,
                # Reason: not chained to a specific GR line.
                "grLineId": None,
                "itemId": ITEM_ID,
                "itemCode": "ITM-002",
                "itemName": "Gadget",
                "description": "Goodwill credit",
                "quantity": 1.0,
                "uom": "EA",
                "unitPrice": 10.0,
                "discountPercent": 0.0,
                "lineNet": 10.0,
                # Reason: exempt line -- no taxCode.
                "taxCode": None,
                "taxRate": 0.0,
                "lineTax": 0.0,
                "lineGross": 10.0,
                "costCenterId": None,
                "notes": None,
                "baseDocRef": None,
            },
        ],
        "createdAt": now,
        "createdBy": USER_ID,
        "updatedAt": now,
        "updatedBy": USER_ID,
    }


class TestApDownPaymentPostedContractRoundTrip:
    """Proves the DPI producer's outbox payload validates against the new contract."""

    def test_registered_in_event_type_registry(self) -> None:
        assert EVENT_TYPE_REGISTRY["ap_down_payment_posted"] is ApDownPaymentPostedPayload

    def test_real_producer_output_validates(self) -> None:
        dpi_raw = _make_dpi_raw()
        payload = build_dpi_outbox_payload(dpi_raw, event_type="ap_down_payment_posted")

        # This is the actual bug-fix proof: instantiating the REAL producer
        # output against the newly-registered contract must not raise.
        model = ApDownPaymentPostedPayload(**payload)

        assert str(model.dpiDocId) == dpi_raw["docId"]
        assert model.dpiDocNumber == "DPI-2026-0001"
        assert model.docDate == dpi_raw["docDate"].strftime("%Y-%m-%d")
        assert model.vendorId == VENDOR_ID
        assert model.exchangeRate == Decimal("1")
        assert model.totals["net"] == "1000.0"
        assert model.totals["gross"] == "1050.0"
        assert len(model.lines) == 2

        line_with_tax = model.lines[0]
        assert line_with_tax.taxCode == "S"
        assert line_with_tax.taxRate == Decimal("5.0")
        assert str(line_with_tax.itemId) == ITEM_ID

        amount_only_line = model.lines[1]
        assert amount_only_line.taxCode is None
        assert amount_only_line.itemId is None

    def test_missing_vendor_id_defaults_to_empty_string(self) -> None:
        """
        vendorId must be a plain str (not UUID) because the producer reads
        it via dpi_raw.get("vendorId", "") and can fall back to "". A UUID
        type would fail validation here -- this is the exact class of bug
        being fixed.
        """
        dpi_raw = _make_dpi_raw()
        del dpi_raw["vendorId"]
        payload = build_dpi_outbox_payload(dpi_raw, event_type="ap_down_payment_posted")
        assert payload["vendorId"] == ""

        model = ApDownPaymentPostedPayload(**payload)
        assert model.vendorId == ""


class TestApCreditNotePostedContractRoundTrip:
    """Proves the ACN producer's outbox payload validates against the new contract."""

    def test_registered_in_event_type_registry(self) -> None:
        assert EVENT_TYPE_REGISTRY["ap_credit_note_posted"] is ApCreditNotePostedPayload

    def test_real_producer_output_validates(self) -> None:
        acn_raw = _make_acn_raw()
        payload = build_acn_outbox_payload(acn_raw, event_type="ap_credit_note_posted")

        # This is the actual bug-fix proof: instantiating the REAL producer
        # output against the newly-registered contract must not raise.
        model = ApCreditNotePostedPayload(**payload)

        assert str(model.acnDocId) == acn_raw["docId"]
        assert model.acnDocNumber == "APC-2026-0001"
        assert model.docDate == acn_raw["docDate"].strftime("%Y-%m-%d")
        assert model.vendorId == VENDOR_ID
        assert model.baseApInvoiceDocId == AP_INVOICE_ID
        assert model.baseApInvoiceDocNumber == "AP-2026-0003"
        assert model.totals["gross"] == "210.0"
        assert model.originalEventId is None
        assert len(model.lines) == 2

        line_with_tax = model.lines[0]
        assert line_with_tax.taxCode == "S"
        assert str(line_with_tax.itemId) == ITEM_ID
        assert str(line_with_tax.grLineId) == GR_LINE_ID

        exempt_line = model.lines[1]
        assert exempt_line.taxCode is None
        assert exempt_line.grLineId is None

    def test_direct_create_path_defaults_base_invoice_refs_to_empty_string(self) -> None:
        """
        baseApInvoiceDocId/Number must be plain str (not UUID/Optional) with
        a "" default because a direct-create ACN (no source AP Invoice) has
        baseInvoiceDocRef = None, and the producer does
        `(base_invoice_ref.get("docId") or base_invoice_ref.get("doc_id", ""))`
        against `acn_raw.get("baseInvoiceDocRef") or {}` -- an empty dict on
        the direct path, yielding "".
        """
        acn_raw = _make_acn_raw()
        acn_raw["baseInvoiceDocRef"] = None
        payload = build_acn_outbox_payload(acn_raw, event_type="ap_credit_note_posted")
        assert payload["baseApInvoiceDocId"] == ""
        assert payload["baseApInvoiceDocNumber"] == ""

        model = ApCreditNotePostedPayload(**payload)
        assert model.baseApInvoiceDocId == ""
        assert model.baseApInvoiceDocNumber == ""

    def test_missing_vendor_id_defaults_to_empty_string(self) -> None:
        acn_raw = _make_acn_raw()
        del acn_raw["vendorId"]
        payload = build_acn_outbox_payload(acn_raw, event_type="ap_credit_note_posted")
        assert payload["vendorId"] == ""

        model = ApCreditNotePostedPayload(**payload)
        assert model.vendorId == ""
