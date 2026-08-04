"""
Tests for src/core/documents shared document infrastructure.

Covers all 6 modules: document_links, open_quantity, doc_number,
bp_ref, journal_memo, document_status.

Uses pytest-asyncio with mongomock-motor (or plain MagicMock for
pure-Python helpers) so no live MongoDB is required.

Run with:
    pytest src/core/documents/tests/test_document_infrastructure.py -v

All async tests use anyio as the backend (pytest-anyio / anyio[trio] not
required; plain asyncio works).
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

# ---------------------------------------------------------------------------
# Import the modules under test (relative to project root via PYTHONPATH=src)
# ---------------------------------------------------------------------------

from src.core.documents.bp_ref import BPReferenceMixin
from src.core.documents.doc_number import (
    DOC_TYPE_PREFIXES,
    assert_no_gaps,
    next_doc_number,
    _prefix_for,
)
from src.core.documents.document_links import (
    DocumentLinkRef,
    DocumentLineLinkMixin,
    find_broken_links,
    write_back_target_ref,
)
from src.core.documents.document_status import (
    DocumentStatus,
    LEGAL_TRANSITIONS,
    assert_legal_transition,
    get_allowed_transitions,
)
from src.core.documents.journal_memo import (
    JournalMemoMixin,
    format_journal_memo,
)
from src.core.documents.open_quantity import (
    LineQuantityState,
    _ROUNDING_TOLERANCE,
    increment_consumed_qty,
    get_quantity_state,
)

# ===========================================================================
# Helpers: build a minimal in-memory fake Motor DB for async tests
# ===========================================================================


class _FakeCollection:
    """Minimal fake Motor collection backed by an in-memory list."""

    def __init__(self) -> None:
        self._docs: List[Dict[str, Any]] = []

    async def find_one(self, query: Dict[str, Any], *args: Any, **kwargs: Any) -> Any:
        for doc in self._docs:
            if _matches(doc, query):
                return doc
        return None

    def find(
        self, query: Dict[str, Any] = None, *args: Any, **kwargs: Any
    ) -> "_FakeCursor":
        query = query or {}
        return _FakeCursor([d for d in self._docs if _matches(d, query)])

    async def find_one_and_update(
        self, query: Dict[str, Any], update: Dict[str, Any], **kwargs: Any
    ) -> Any:
        upsert = kwargs.get("upsert", False)
        for doc in self._docs:
            if _matches(doc, query):
                _apply_update(doc, update)
                return doc
        if upsert:
            new_doc: Dict[str, Any] = {}
            _id_field = query.get("_id") or query.get("lineId")
            if "_id" in query:
                new_doc["_id"] = query["_id"]
            if "lineId" in query:
                new_doc["lineId"] = query["lineId"]
            _apply_update(new_doc, update)
            self._docs.append(new_doc)
            return new_doc
        return None

    async def update_one(
        self, query: Dict[str, Any], update: Dict[str, Any], **kwargs: Any
    ) -> None:
        for doc in self._docs:
            if _matches(doc, query):
                _apply_update(doc, update)
                return

    async def insert_one(self, doc: Dict[str, Any], **kwargs: Any) -> None:
        self._docs.append(doc)

    def _add(self, doc: Dict[str, Any]) -> None:
        """Test helper: add a document directly."""
        self._docs.append(doc)


class _FakeCursor:
    def __init__(self, docs: List[Dict[str, Any]]) -> None:
        self._docs = docs

    async def to_list(self, length: Any = None) -> List[Dict[str, Any]]:
        return self._docs


class _FakeDB:
    """Minimal fake Motor database."""

    def __init__(self) -> None:
        self._collections: Dict[str, _FakeCollection] = {}

    def __getitem__(self, name: str) -> _FakeCollection:
        if name not in self._collections:
            self._collections[name] = _FakeCollection()
        return self._collections[name]


def _matches(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    """Simplistic query matcher for our test fake (supports equality + $gte + $ne + $in + $regex)."""
    for key, val in query.items():
        doc_val = doc.get(key)
        if isinstance(val, dict):
            for op, operand in val.items():
                if op == "$gte" and not (doc_val is not None and doc_val >= operand):
                    return False
                elif op == "$ne" and doc_val == operand:
                    return False
                elif op == "$in" and doc_val not in operand:
                    return False
                elif op == "$regex" and (
                    doc_val is None
                    # Reason: strip leading '^' anchor since _matches does a plain
                    # substring check, not a real regex engine. The anchor is never
                    # meaningful in our in-memory fake — prefix matching is sufficient.
                    or operand.lstrip("^") not in str(doc_val)
                ):
                    return False
        else:
            if doc_val != val:
                return False
    return True


def _apply_update(doc: Dict[str, Any], update: Dict[str, Any]) -> None:
    """Apply a minimal subset of MongoDB update operators."""
    if "$set" in update:
        doc.update(update["$set"])
    if "$inc" in update:
        for field, delta in update["$inc"].items():
            doc[field] = doc.get(field, 0) + delta
    if "$push" in update:
        for field, val in update["$push"].items():
            if field not in doc:
                doc[field] = []
            doc[field].append(val)


# ===========================================================================
# Module 1 — document_links
# ===========================================================================


class TestDocumentLinkRef:
    def test_forward_link_fields(self) -> None:
        """DocumentLinkRef holds all four fields."""
        ref = DocumentLinkRef(
            doc_type="PO",
            doc_id="uuid-1",
            doc_number="PO-2026-0001",
            line_id="line-uuid-1",
        )
        assert ref.doc_type == "PO"
        assert ref.line_id == "line-uuid-1"

    def test_header_level_link_has_no_line_id(self) -> None:
        """line_id is optional; a header-level reference has no line_id."""
        ref = DocumentLinkRef(
            doc_type="GR",
            doc_id="hdr-uuid",
            doc_number="GR-2026-0001",
        )
        assert ref.line_id is None


class TestDocumentLineLinkMixin:
    def test_default_empty_targets(self) -> None:
        """A fresh mixin has no base and an empty target list."""

        class MyLine(DocumentLineLinkMixin):
            pass

        line = MyLine()
        assert line.base_doc_ref is None
        assert line.target_doc_refs == []

    def test_can_set_base_ref(self) -> None:
        """Setting base_doc_ref works as expected."""

        class MyLine(DocumentLineLinkMixin):
            pass

        ref = DocumentLinkRef(
            doc_type="SO",
            doc_id="so-uuid",
            doc_number="SO-2026-0001",
            line_id="so-line-1",
        )
        line = MyLine(base_doc_ref=ref)
        assert line.base_doc_ref is not None
        assert line.base_doc_ref.doc_type == "SO"

    def test_multiple_target_refs(self) -> None:
        """A line may have multiple downstream targets (split fulfillment)."""

        class MyLine(DocumentLineLinkMixin):
            pass

        refs = [
            DocumentLinkRef(
                doc_type="DN", doc_id="dn-1", doc_number="DN-2026-0001", line_id="l1"
            ),
            DocumentLinkRef(
                doc_type="DN", doc_id="dn-2", doc_number="DN-2026-0002", line_id="l2"
            ),
        ]
        line = MyLine(target_doc_refs=refs)
        assert len(line.target_doc_refs) == 2


@pytest.mark.asyncio
async def test_write_back_target_ref_appends_to_array() -> None:
    """write_back_target_ref appends the target ref to the source line's targetDocRefs."""
    db = _FakeDB()
    source_line_id = str(uuid.uuid4())
    db["document_lines"]._add({"lineId": source_line_id, "targetDocRefs": []})

    target_ref = DocumentLinkRef(
        doc_type="GR",
        doc_id="gr-uuid",
        doc_number="GR-2026-0001",
        line_id="gr-line-1",
    )
    await write_back_target_ref(
        db,  # type: ignore[arg-type]
        lines_collection="document_lines",
        source_line_id=source_line_id,
        target_ref=target_ref,
    )

    line = await db["document_lines"].find_one({"lineId": source_line_id})
    assert line is not None
    assert len(line["targetDocRefs"]) == 1
    assert line["targetDocRefs"][0]["doc_type"] == "GR"


@pytest.mark.asyncio
async def test_write_back_target_ref_second_downstream() -> None:
    """A second write_back_target_ref call appends to the existing array (multi-target case)."""
    db = _FakeDB()
    source_line_id = str(uuid.uuid4())
    db["document_lines"]._add({"lineId": source_line_id, "targetDocRefs": []})

    for dn_number in ("DN-2026-0001", "DN-2026-0002"):
        await write_back_target_ref(
            db,  # type: ignore[arg-type]
            lines_collection="document_lines",
            source_line_id=source_line_id,
            target_ref=DocumentLinkRef(
                doc_type="DN",
                doc_id=str(uuid.uuid4()),
                doc_number=dn_number,
                line_id=str(uuid.uuid4()),
            ),
        )

    line = await db["document_lines"].find_one({"lineId": source_line_id})
    assert line is not None
    assert len(line["targetDocRefs"]) == 2


@pytest.mark.asyncio
async def test_find_broken_links_returns_empty_when_source_exists() -> None:
    """find_broken_links returns [] when all base_doc_ref sources exist."""
    db = _FakeDB()
    src_line_id = str(uuid.uuid4())
    target_line_id = str(uuid.uuid4())

    # Source line exists
    db["document_lines"]._add({"lineId": src_line_id})
    # Target doc line that references the source
    db["document_lines"]._add(
        {
            "docId": "dn-doc-1",
            "lineId": target_line_id,
            "baseDocRef": {
                "doc_type": "SO",
                "doc_id": "so-1",
                "doc_number": "SO-2026-0001",
                "line_id": src_line_id,
            },
        }
    )

    broken = await find_broken_links(db, lines_collection="document_lines", doc_id="dn-doc-1")  # type: ignore[arg-type]
    assert broken == []


@pytest.mark.asyncio
async def test_find_broken_links_detects_missing_source() -> None:
    """find_broken_links returns the missing line_id when the source is gone."""
    db = _FakeDB()
    missing_line_id = str(uuid.uuid4())
    target_line_id = str(uuid.uuid4())

    db["document_lines"]._add(
        {
            "docId": "dn-doc-2",
            "lineId": target_line_id,
            "baseDocRef": {
                "doc_type": "SO",
                "doc_id": "so-2",
                "doc_number": "SO-2026-0002",
                "line_id": missing_line_id,
            },
        }
    )

    broken = await find_broken_links(db, lines_collection="document_lines", doc_id="dn-doc-2")  # type: ignore[arg-type]
    assert missing_line_id in broken


# ===========================================================================
# Module 2 — open_quantity
# ===========================================================================


class TestLineQuantityState:
    def test_open_qty_derived_correctly(self) -> None:
        """open_qty = ordered_qty - consumed_qty."""
        state = LineQuantityState(
            ordered_qty=Decimal("100"), consumed_qty=Decimal("40")
        )
        assert state.open_qty == Decimal("60")

    def test_is_closed_when_fully_consumed(self) -> None:
        """is_closed is True when consumed_qty equals ordered_qty."""
        state = LineQuantityState(ordered_qty=Decimal("50"), consumed_qty=Decimal("50"))
        assert state.is_closed is True

    def test_is_closed_within_tolerance(self) -> None:
        """is_closed handles floating-point rounding: 99.9999 consumed of 100 is closed."""
        state = LineQuantityState(
            ordered_qty=Decimal("100"),
            consumed_qty=Decimal("99.9999"),
        )
        assert state.is_closed is True

    def test_is_not_closed_when_open(self) -> None:
        """is_closed is False when meaningful open qty remains."""
        state = LineQuantityState(
            ordered_qty=Decimal("100"), consumed_qty=Decimal("60")
        )
        assert state.is_closed is False

    def test_is_over_consumed_flag(self) -> None:
        """is_over_consumed is True when consumed > ordered + tolerance."""
        state = LineQuantityState(
            ordered_qty=Decimal("10"), consumed_qty=Decimal("10.5")
        )
        assert state.is_over_consumed is True

    def test_is_not_over_consumed_within_tolerance(self) -> None:
        """is_over_consumed is False for rounding-tolerance amounts."""
        state = LineQuantityState(
            ordered_qty=Decimal("10"),
            consumed_qty=Decimal("10") + _ROUNDING_TOLERANCE / 2,
        )
        assert state.is_over_consumed is False


@pytest.mark.asyncio
async def test_increment_consumed_qty_basic() -> None:
    """increment_consumed_qty decrements openQuantity and increments closedQuantity."""
    db = _FakeDB()
    line_id = str(uuid.uuid4())
    db["document_lines"]._add(
        {
            "lineId": line_id,
            "quantity": 100.0,
            "openQuantity": 100.0,
            "closedQuantity": 0.0,
        }
    )

    state = await increment_consumed_qty(
        db,  # type: ignore[arg-type]
        lines_collection="document_lines",
        source_line_id=line_id,
        delta=Decimal("30"),
    )

    assert state.consumed_qty == Decimal("30")
    assert state.open_qty == Decimal("70")
    assert not state.is_closed


@pytest.mark.asyncio
async def test_increment_consumed_qty_partial_closure() -> None:
    """Two partial increments update state correctly; line becomes closed after second."""
    db = _FakeDB()
    line_id = str(uuid.uuid4())
    db["document_lines"]._add(
        {
            "lineId": line_id,
            "quantity": 50.0,
            "openQuantity": 50.0,
            "closedQuantity": 0.0,
        }
    )

    await increment_consumed_qty(
        db,  # type: ignore[arg-type]
        lines_collection="document_lines",
        source_line_id=line_id,
        delta=Decimal("20"),
    )
    state = await increment_consumed_qty(
        db,  # type: ignore[arg-type]
        lines_collection="document_lines",
        source_line_id=line_id,
        delta=Decimal("30"),
    )

    assert state.is_closed


@pytest.mark.asyncio
async def test_increment_consumed_qty_over_consumption_raises() -> None:
    """increment_consumed_qty raises ValueError when delta exceeds open quantity."""
    db = _FakeDB()
    line_id = str(uuid.uuid4())
    db["document_lines"]._add(
        {
            "lineId": line_id,
            "quantity": 10.0,
            "openQuantity": 5.0,
            "closedQuantity": 5.0,
        }
    )

    with pytest.raises(ValueError, match="open quantity would go negative"):
        await increment_consumed_qty(
            db,  # type: ignore[arg-type]
            lines_collection="document_lines",
            source_line_id=line_id,
            delta=Decimal("6"),
        )


@pytest.mark.asyncio
async def test_increment_consumed_qty_not_found_raises() -> None:
    """increment_consumed_qty raises ValueError when the source line does not exist."""
    db = _FakeDB()

    with pytest.raises(ValueError, match="not found"):
        await increment_consumed_qty(
            db,  # type: ignore[arg-type]
            lines_collection="document_lines",
            source_line_id="nonexistent-line",
            delta=Decimal("1"),
        )


@pytest.mark.asyncio
async def test_increment_consumed_qty_zero_delta_raises() -> None:
    """increment_consumed_qty raises ValueError for delta <= 0."""
    db = _FakeDB()

    with pytest.raises(ValueError, match="delta must be positive"):
        await increment_consumed_qty(
            db,  # type: ignore[arg-type]
            lines_collection="document_lines",
            source_line_id="any-line",
            delta=Decimal("0"),
        )


# ===========================================================================
# Module 3 — doc_number
# ===========================================================================


class TestDocTypePrefixes:
    def test_pr_prefix(self) -> None:
        assert _prefix_for("PR") == "PR"

    def test_ar_invoice_prefix(self) -> None:
        assert _prefix_for("AR_INVOICE") == "ARI"

    def test_ap_invoice_prefix(self) -> None:
        assert _prefix_for("AP_INVOICE") == "API"

    def test_sales_order_prefix(self) -> None:
        assert _prefix_for("SO") == "SO"

    def test_delivery_prefix(self) -> None:
        assert _prefix_for("DELIVERY") == "DN"

    def test_unknown_doc_type_raises(self) -> None:
        with pytest.raises(ValueError, match="Unknown doc_type"):
            _prefix_for("UNKNOWN_TYPE")


@pytest.mark.asyncio
async def test_next_doc_number_sequential() -> None:
    """next_doc_number returns sequential numbers for the same doc_type+year."""
    db = _FakeDB()

    n1 = await next_doc_number(db, doc_type="SO", org_id="org-1", fiscal_year=2026)  # type: ignore[arg-type]
    n2 = await next_doc_number(db, doc_type="SO", org_id="org-1", fiscal_year=2026)  # type: ignore[arg-type]
    n3 = await next_doc_number(db, doc_type="SO", org_id="org-1", fiscal_year=2026)  # type: ignore[arg-type]

    assert n1 == "SO-2026-0001"
    assert n2 == "SO-2026-0002"
    assert n3 == "SO-2026-0003"


@pytest.mark.asyncio
async def test_next_doc_number_year_rollover() -> None:
    """next_doc_number restarts at 0001 for a new fiscal year."""
    db = _FakeDB()

    n_2025 = await next_doc_number(db, doc_type="PR", org_id="org-1", fiscal_year=2025)  # type: ignore[arg-type]
    n_2026 = await next_doc_number(db, doc_type="PR", org_id="org-1", fiscal_year=2026)  # type: ignore[arg-type]

    assert n_2025 == "PR-2025-0001"
    assert n_2026 == "PR-2026-0001"


@pytest.mark.asyncio
async def test_next_doc_number_different_types_independent() -> None:
    """next_doc_number counters are independent across doc types."""
    db = _FakeDB()

    so = await next_doc_number(db, doc_type="SO", org_id="org-1", fiscal_year=2026)  # type: ignore[arg-type]
    pr = await next_doc_number(db, doc_type="PR", org_id="org-1", fiscal_year=2026)  # type: ignore[arg-type]

    assert so == "SO-2026-0001"
    assert pr == "PR-2026-0001"


@pytest.mark.asyncio
async def test_assert_no_gaps_returns_empty_when_complete() -> None:
    """assert_no_gaps returns [] when there are no missing numbers."""
    db = _FakeDB()
    col = db["document_headers"]
    for i in range(1, 4):
        col._add(
            {
                "organizationId": "org-1",
                "docType": "PO",
                "docNumber": f"PO-2026-{i:04d}",
                "deletedAt": None,
            }
        )

    gaps = await assert_no_gaps(  # type: ignore[arg-type]
        db,
        doc_type="PO",
        fiscal_year=2026,
        org_id="org-1",
        headers_collection="document_headers",
    )
    assert gaps == []


@pytest.mark.asyncio
async def test_assert_no_gaps_detects_missing_number() -> None:
    """assert_no_gaps returns [3] when PO-2026-0003 is missing."""
    db = _FakeDB()
    col = db["document_headers"]
    for i in (1, 2, 4):
        col._add(
            {
                "organizationId": "org-1",
                "docType": "PO",
                "docNumber": f"PO-2026-{i:04d}",
                "deletedAt": None,
            }
        )

    gaps = await assert_no_gaps(  # type: ignore[arg-type]
        db,
        doc_type="PO",
        fiscal_year=2026,
        org_id="org-1",
        headers_collection="document_headers",
    )
    assert 3 in gaps


# ===========================================================================
# Module 4 — bp_ref
# ===========================================================================


class TestBPReferenceMixin:
    def test_default_none(self) -> None:
        """bp_ref_no defaults to None."""

        class MyDoc(BPReferenceMixin):
            pass

        doc = MyDoc()
        assert doc.bp_ref_no is None

    def test_accepts_vendor_invoice_number(self) -> None:
        """bp_ref_no stores a vendor invoice number without modification."""

        class MyDoc(BPReferenceMixin):
            pass

        doc = MyDoc(bp_ref_no="INV-2026-9999")
        assert doc.bp_ref_no == "INV-2026-9999"

    def test_max_length_enforced(self) -> None:
        """bp_ref_no rejects strings longer than 100 characters."""
        from pydantic import ValidationError

        class MyDoc(BPReferenceMixin):
            pass

        with pytest.raises(ValidationError):
            MyDoc(bp_ref_no="X" * 101)

    def test_accepts_customer_po_number(self) -> None:
        """bp_ref_no can store a customer PO number."""

        class MyDoc(BPReferenceMixin):
            pass

        doc = MyDoc(bp_ref_no="CUST-PO-8888")
        assert doc.bp_ref_no == "CUST-PO-8888"


# ===========================================================================
# Module 5 — journal_memo
# ===========================================================================


class TestJournalMemoMixin:
    def test_default_none(self) -> None:
        """journal_memo defaults to None."""

        class MyDoc(JournalMemoMixin):
            pass

        doc = MyDoc()
        assert doc.journal_memo is None

    def test_stores_freetext(self) -> None:
        """journal_memo stores user-supplied text."""

        class MyDoc(JournalMemoMixin):
            pass

        doc = MyDoc(journal_memo="Urgent delivery adjustment")
        assert doc.journal_memo == "Urgent delivery adjustment"


class TestFormatJournalMemo:
    def test_minimal_no_refs(self) -> None:
        """Without bp_ref or freetext, only type+number appears."""
        memo = format_journal_memo("GR", "GR-2026-0003")
        assert memo == "GR GR-2026-0003"

    def test_ap_side_uses_vendor_label(self) -> None:
        """AP Invoice bp_ref is labeled 'Vendor Inv #'."""
        memo = format_journal_memo("AP Invoice", "API-2026-0007", bp_ref="INV-999")
        assert "Vendor Inv #INV-999" in memo

    def test_ar_side_uses_customer_label(self) -> None:
        """AR Invoice bp_ref is labeled 'Cust PO #'."""
        memo = format_journal_memo("AR Invoice", "ARI-2026-0042", bp_ref="PO-CUST-88")
        assert "Cust PO #PO-CUST-88" in memo

    def test_full_memo_all_segments(self) -> None:
        """All four segments compose correctly."""
        memo = format_journal_memo(
            "AR Invoice",
            "ARI-2026-0042",
            bp_ref="PO-CUST-88",
            freetext="early delivery",
        )
        assert "ARI-2026-0042" in memo
        assert "Cust PO #PO-CUST-88" in memo
        assert "early delivery" in memo

    def test_memo_max_length_not_exceeded(self) -> None:
        """format_journal_memo never returns a string longer than 200 chars."""
        long_free = "A" * 300
        memo = format_journal_memo(
            "AR Invoice", "ARI-2026-0001", bp_ref="REF-1234567890", freetext=long_free
        )
        assert len(memo) <= 200

    def test_separator_present(self) -> None:
        """Segments are joined with ' · ' (middle dot)."""
        memo = format_journal_memo("GR", "GR-2026-0001", bp_ref="PO-123")
        assert " · " in memo


# ===========================================================================
# Module 6 — document_status
# ===========================================================================


class TestDocumentStatus:
    def test_enum_values_are_lowercase_strings(self) -> None:
        """DocumentStatus values are lowercase for MongoDB storage."""
        assert DocumentStatus.DRAFT.value == "draft"
        assert DocumentStatus.PARTLY_CLOSED.value == "partly_closed"
        assert DocumentStatus.CANCELLED.value == "cancelled"

    def test_str_enum_usable_as_string(self) -> None:
        """DocumentStatus inherits str so it can be used directly as a string."""
        assert DocumentStatus.OPEN == "open"


class TestAssertLegalTransition:
    def test_so_open_to_partly_closed_is_legal(self) -> None:
        """SO: Open → PartlyClosed is allowed."""
        assert_legal_transition("SO", DocumentStatus.OPEN, DocumentStatus.PARTLY_CLOSED)

    def test_so_draft_to_closed_is_illegal(self) -> None:
        """SO: Draft → Closed is not allowed (must go through Open)."""
        with pytest.raises(ValueError, match="Illegal SO transition"):
            assert_legal_transition("SO", DocumentStatus.DRAFT, DocumentStatus.CLOSED)

    def test_pr_draft_to_pending_approval_is_legal(self) -> None:
        """PR: Draft → PendingApproval is allowed."""
        assert_legal_transition(
            "PR", DocumentStatus.DRAFT, DocumentStatus.PENDING_APPROVAL
        )

    def test_pr_closed_to_anything_is_illegal(self) -> None:
        """PR: Closed is a terminal state."""
        with pytest.raises(ValueError, match="terminal state"):
            assert_legal_transition("PR", DocumentStatus.CLOSED, DocumentStatus.OPEN)

    def test_quote_open_to_cancelled_is_legal(self) -> None:
        """QUOTE: Open → Cancelled is allowed."""
        assert_legal_transition("QUOTE", DocumentStatus.OPEN, DocumentStatus.CANCELLED)

    def test_unknown_doc_type_raises(self) -> None:
        """assert_legal_transition raises ValueError for unknown doc types."""
        with pytest.raises(ValueError, match="Unknown doc_type"):
            assert_legal_transition(
                "UNKNOWN", DocumentStatus.DRAFT, DocumentStatus.OPEN
            )

    def test_delivery_open_to_partly_closed(self) -> None:
        """DELIVERY: Open → PartlyClosed is allowed."""
        assert_legal_transition(
            "DELIVERY", DocumentStatus.OPEN, DocumentStatus.PARTLY_CLOSED
        )

    def test_ar_invoice_partly_closed_to_closed(self) -> None:
        """AR_INVOICE: PartlyClosed → Closed is allowed (full payment received)."""
        assert_legal_transition(
            "AR_INVOICE", DocumentStatus.PARTLY_CLOSED, DocumentStatus.CLOSED
        )

    def test_gr_draft_to_open_is_legal(self) -> None:
        """GR: Draft → Open (post) is allowed."""
        assert_legal_transition("GR", DocumentStatus.DRAFT, DocumentStatus.OPEN)

    def test_gr_open_to_anything_is_illegal(self) -> None:
        """GR: Open is terminal (posted GRs are immutable)."""
        with pytest.raises(ValueError):
            assert_legal_transition("GR", DocumentStatus.OPEN, DocumentStatus.CLOSED)


class TestGetAllowedTransitions:
    def test_so_draft_allowed(self) -> None:
        """SO: Draft allows Open and Cancelled."""
        allowed = get_allowed_transitions("SO", DocumentStatus.DRAFT)
        assert DocumentStatus.OPEN in allowed
        assert DocumentStatus.CANCELLED in allowed

    def test_gr_open_is_empty(self) -> None:
        """GR: Open has no allowed transitions."""
        allowed = get_allowed_transitions("GR", DocumentStatus.OPEN)
        assert len(allowed) == 0

    def test_unknown_type_returns_empty(self) -> None:
        """Unknown doc type returns empty frozenset (no crash)."""
        allowed = get_allowed_transitions("NONEXISTENT", DocumentStatus.DRAFT)
        assert len(allowed) == 0


# ===========================================================================
# Cross-module integration: link + quantity increment together
# ===========================================================================


@pytest.mark.asyncio
async def test_so_line_to_delivery_integration() -> None:
    """
    Integration test: SO line has quantity consumed by a Delivery line,
    and the back-pointer is written to the SO line.

    Simulates: create Delivery from SO → increment SO line qty → write backref.
    """
    db = _FakeDB()
    so_line_id = str(uuid.uuid4())
    dn_line_id = str(uuid.uuid4())

    # Set up SO line with 100 units
    db["document_lines"]._add(
        {
            "lineId": so_line_id,
            "docId": "so-doc-1",
            "quantity": 100.0,
            "openQuantity": 100.0,
            "closedQuantity": 0.0,
            "targetDocRefs": [],
        }
    )

    # Delivery consumes 60 units
    state = await increment_consumed_qty(
        db,  # type: ignore[arg-type]
        lines_collection="document_lines",
        source_line_id=so_line_id,
        delta=Decimal("60"),
    )
    assert not state.is_closed

    # Write back-pointer from SO line to Delivery line
    await write_back_target_ref(
        db,  # type: ignore[arg-type]
        lines_collection="document_lines",
        source_line_id=so_line_id,
        target_ref=DocumentLinkRef(
            doc_type="DELIVERY",
            doc_id="dn-doc-1",
            doc_number="DN-2026-0001",
            line_id=dn_line_id,
        ),
    )

    # Verify SO line state
    so_line = await db["document_lines"].find_one({"lineId": so_line_id})
    assert so_line is not None
    assert so_line["openQuantity"] == pytest.approx(40.0)
    assert len(so_line["targetDocRefs"]) == 1
    assert so_line["targetDocRefs"][0]["doc_type"] == "DELIVERY"

    # Validate status: SO should still be PARTLY_CLOSED territory
    assert_legal_transition("SO", DocumentStatus.OPEN, DocumentStatus.PARTLY_CLOSED)
