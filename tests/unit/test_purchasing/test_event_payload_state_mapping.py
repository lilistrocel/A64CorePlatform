"""
Unit tests pinning the stored-status -> finance-event display-status mapping
(Wave 4 regression fix).

Background
----------
wave4_purchasing_status_migration.py (T-200.21) rewrote document_headers.status
from legacy TitleCase strings to the shared DocumentStatus lowercase_snake
vocabulary ("draft", "pending_approval", "open", "partly_closed", "closed",
"cancelled"), while purchasing-internal states with no shared equivalent
("Rejected", "Sent", "Partially Received", "Received") were deliberately left
unchanged. build_pr_event_payload / build_po_event_payload previously passed
header["status"] straight through into the payload's `state` field, but the
finance event contracts (contracts/finance_events.py) still declare `state`
as a Literal in the legacy TitleCase DISPLAY vocabulary. Creating a PO stored
status "draft" therefore raised:

    1 validation error for PurchaseOrderStateChangedPayload
    state: Input should be 'Draft','Pending Approval','Open', ...

These tests pin the stored -> display mapping the fix introduces
(map_pr_state_for_event / map_po_state_for_event) and additionally validate
the resulting payload dict against the ACTUAL contract Pydantic model, so the
test fails if the mapping and the contract's Literal ever drift apart again.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Optional

import pytest


ORG_ID = str(uuid.uuid4())
COMPANY_CODE = "1000"
USER_ID = str(uuid.uuid4())
VENDOR_ID = str(uuid.uuid4())


def _make_pr_header(status: str) -> Dict[str, Any]:
    now = datetime.now(tz=timezone.utc)
    return {
        "docId": str(uuid.uuid4()),
        "docNumber": "PR-2026-0001",
        "status": status,
        "organizationId": ORG_ID,
        "companyCode": COMPANY_CODE,
        "requestedBy": USER_ID,
        "createdBy": USER_ID,
        "requestedDate": now,
        "docDate": now,
        "department": "Farm",
        "urgency": "normal",
        "totalGross": 1000,
        "currencyCode": "AED",
        "notes": None,
        "approvalRequestedFrom": None,
        "approvalDecidedBy": None,
        "approvalComment": None,
        "approvalHistory": [],
    }


def _make_po_header(status: str) -> Dict[str, Any]:
    now = datetime.now(tz=timezone.utc)
    return {
        "docId": str(uuid.uuid4()),
        "docNumber": "PO-2026-0001",
        "status": status,
        "organizationId": ORG_ID,
        "companyCode": COMPANY_CODE,
        "vendorId": VENDOR_ID,
        "vendorCode": "VEND-001",
        "issuedBy": USER_ID,
        "createdBy": USER_ID,
        "issuedDate": now,
        "docDate": now,
        "expectedDeliveryDate": None,
        "paymentTermsCode": None,
        "dueDate": None,
        "baseDocId": None,
        "subtotalNet": 900,
        "totalTax": 45,
        "totalGross": 945,
        "currencyCode": "AED",
        "notes": None,
        "approvalHistory": [],
    }


# ---------------------------------------------------------------------------
# map_pr_state_for_event / map_po_state_for_event — direct unit pins
# ---------------------------------------------------------------------------


class TestMapPrStateForEvent:
    def test_open_maps_to_approved(self) -> None:
        """PR semantic: shared 'open' displays as 'Approved'."""
        from src.modules.purchasing.services.document_service import (
            map_pr_state_for_event,
        )

        assert map_pr_state_for_event("open") == "Approved"

    @pytest.mark.parametrize(
        "stored,display",
        [
            ("draft", "Draft"),
            ("pending_approval", "Pending Approval"),
            ("closed", "Closed"),
            ("cancelled", "Cancelled"),
            ("Rejected", "Rejected"),
        ],
    )
    def test_full_table(self, stored: str, display: str) -> None:
        from src.modules.purchasing.services.document_service import (
            map_pr_state_for_event,
        )

        assert map_pr_state_for_event(stored) == display

    def test_unknown_status_raises(self) -> None:
        """An unmapped stored value must fail loudly, never pass through raw."""
        from src.modules.purchasing.services.document_service import (
            map_pr_state_for_event,
        )

        with pytest.raises(ValueError):
            map_pr_state_for_event("some_unknown_status")


class TestMapPoStateForEvent:
    def test_open_maps_to_open(self) -> None:
        """PO semantic: shared 'open' displays as 'Open' (NOT 'Approved' — the
        PR mapping is different for the same stored value)."""
        from src.modules.purchasing.services.document_service import (
            map_po_state_for_event,
        )

        assert map_po_state_for_event("open") == "Open"

    @pytest.mark.parametrize(
        "stored,display",
        [
            ("draft", "Draft"),
            ("pending_approval", "Pending Approval"),
            ("partly_closed", "Partially Received"),
            ("closed", "Closed"),
            ("cancelled", "Cancelled"),
            ("Sent", "Sent"),
            ("Partially Received", "Partially Received"),
            ("Received", "Received"),
            ("Rejected", "Rejected"),
        ],
    )
    def test_full_table(self, stored: str, display: str) -> None:
        from src.modules.purchasing.services.document_service import (
            map_po_state_for_event,
        )

        assert map_po_state_for_event(stored) == display

    def test_unknown_status_raises(self) -> None:
        from src.modules.purchasing.services.document_service import (
            map_po_state_for_event,
        )

        with pytest.raises(ValueError):
            map_po_state_for_event("some_unknown_status")


# ---------------------------------------------------------------------------
# build_pr_event_payload / build_po_event_payload — mapping applied end-to-end
# ---------------------------------------------------------------------------


class TestBuildPrEventPayloadStateMapping:
    def test_open_maps_to_approved(self) -> None:
        from src.modules.purchasing.services.document_service import (
            build_pr_event_payload,
        )

        header = _make_pr_header(status="open")
        payload = build_pr_event_payload(header, previous_state=None, company_code=COMPANY_CODE)

        assert payload["state"] == "Approved"

    def test_previous_state_is_mapped_when_present(self) -> None:
        """previousState is Optional[str] in the contract (not Literal-
        validated), but is mapped for vocabulary consistency with `state`."""
        from src.modules.purchasing.services.document_service import (
            build_pr_event_payload,
        )

        header = _make_pr_header(status="closed")
        payload = build_pr_event_payload(
            header, previous_state="open", company_code=COMPANY_CODE
        )

        assert payload["state"] == "Closed"
        assert payload["previousState"] == "Approved"

    def test_previous_state_none_stays_none(self) -> None:
        from src.modules.purchasing.services.document_service import (
            build_pr_event_payload,
        )

        header = _make_pr_header(status="draft")
        payload = build_pr_event_payload(header, previous_state=None, company_code=COMPANY_CODE)

        assert payload["previousState"] is None


class TestBuildPoEventPayloadStateMapping:
    @pytest.mark.parametrize(
        "stored,expected_display",
        [
            ("draft", "Draft"),
            ("partly_closed", "Partially Received"),
            ("closed", "Closed"),
            ("Rejected", "Rejected"),
            ("Sent", "Sent"),
        ],
    )
    def test_state_mapping(self, stored: str, expected_display: str) -> None:
        from src.modules.purchasing.services.document_service import (
            build_po_event_payload,
        )

        header = _make_po_header(status=stored)
        payload = build_po_event_payload(header, previous_state=None, company_code=COMPANY_CODE)

        assert payload["state"] == expected_display

    def test_previous_state_is_mapped_when_present(self) -> None:
        from src.modules.purchasing.services.document_service import (
            build_po_event_payload,
        )

        header = _make_po_header(status="closed")
        payload = build_po_event_payload(
            header, previous_state="open", company_code=COMPANY_CODE
        )

        assert payload["state"] == "Closed"
        assert payload["previousState"] == "Open"


# ---------------------------------------------------------------------------
# Contract-validation guard — fails if the mapping and the Literal ever drift
# ---------------------------------------------------------------------------


class TestPayloadValidatesAgainstActualContract:
    """
    Instantiates the REAL contract Pydantic models with the payload dicts
    produced by the builders. If contracts/finance_events.py's Literal is
    ever narrowed/renamed without updating the mapping tables (or vice
    versa), these tests fail with a Pydantic ValidationError instead of the
    drift going unnoticed until a live PO/PR create crashes again.
    """

    @pytest.mark.parametrize(
        "stored",
        ["draft", "pending_approval", "open", "closed", "cancelled", "Rejected"],
    )
    def test_pr_payload_validates(self, stored: str) -> None:
        from contracts.finance_events import PurchaseRequestStateChangedPayload
        from src.modules.purchasing.services.document_service import (
            build_pr_event_payload,
        )

        header = _make_pr_header(status=stored)
        payload = build_pr_event_payload(header, previous_state=None, company_code=COMPANY_CODE)

        # Raises pydantic.ValidationError on drift — that IS the assertion.
        PurchaseRequestStateChangedPayload(**payload)

    @pytest.mark.parametrize(
        "stored",
        [
            "draft",
            "pending_approval",
            "open",
            "partly_closed",
            "closed",
            "cancelled",
            "Sent",
            "Partially Received",
            "Received",
            "Rejected",
        ],
    )
    def test_po_payload_validates(self, stored: str) -> None:
        from contracts.finance_events import PurchaseOrderStateChangedPayload
        from src.modules.purchasing.services.document_service import (
            build_po_event_payload,
        )

        header = _make_po_header(status=stored)
        payload = build_po_event_payload(header, previous_state=None, company_code=COMPANY_CODE)

        # Raises pydantic.ValidationError on drift — that IS the assertion.
        PurchaseOrderStateChangedPayload(**payload)

    def test_the_originally_reported_crash_is_fixed(self) -> None:
        """
        Regression pin for the exact bug report: creating a new PO stores
        status "draft" and previously crashed with:

            1 validation error for PurchaseOrderStateChangedPayload
            state: Input should be 'Draft','Pending Approval','Open', ...
            [input_value='draft']
        """
        from contracts.finance_events import PurchaseOrderStateChangedPayload
        from src.modules.purchasing.services.document_service import (
            build_po_event_payload,
        )

        header = _make_po_header(status="draft")
        payload = build_po_event_payload(header, previous_state=None, company_code=COMPANY_CODE)

        assert payload["state"] == "Draft"
        PurchaseOrderStateChangedPayload(**payload)
