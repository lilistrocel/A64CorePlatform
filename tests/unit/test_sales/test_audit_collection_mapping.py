"""
Unit tests for the Wave 3 sales doc-type -> collection dispatch tables
(T-928).

The bug: two independent dispatch tables map ``AttachmentDocType``/doc-type
strings to MongoDB collection names —

  * ``_SALES_V2_COLLECTIONS`` in
    ``src/modules/attachments/services/attachment_service.py`` (used by
    ``_assert_sales_v2_document_is_draft`` to gate attach/delete)
  * ``_SALES_AUDIT_COLLECTIONS`` in
    ``src/modules/sales/api/v1/audit.py`` (used by
    ``GET /api/v1/sales/audit``)

Both had ``QUOTE`` pointing at a collection that has never existed
(``quotes_v2`` / ``quotes_v2_audit``) instead of the collections
``quote_service.py`` actually writes to (``sales_quotes`` /
``sales_quotes_audit``). Effect: the Quote detail page's Audit History
button always returned empty, and attaching or deleting a file on any Quote
always failed with a misleading "document not found" (LookupError).

The other 7 Wave 3 doc types (AR_INVOICE, CUSTOMER_RECEIPT, SALES_ORDER,
DELIVERY, RETURN_REQUEST, RETURN, AR_CREDIT_NOTE) were already correct in
both tables — confirmed here against the collection constants each writer
service actually defines, not by assumption.

Test cases:
    1.  QUOTE resolves to "sales_quotes" in _SALES_V2_COLLECTIONS.
    2.  QUOTE resolves to "sales_quotes_audit" in _SALES_AUDIT_COLLECTIONS.
    3.  Guard: every value in _SALES_V2_COLLECTIONS matches the primary
        collection constant the corresponding service module actually
        defines — so a future typo here cannot silently return empty/404
        without failing this test.
    4.  Guard: every value in _SALES_AUDIT_COLLECTIONS matches the
        ``_AUDIT_COL`` constant the corresponding service module actually
        defines.
    5.  Both tables cover exactly the same 8 doc types (no orphaned or
        missing entries between the attachment and audit dispatch tables).
"""

from __future__ import annotations

import pytest

from src.modules.attachments.models.attachment import AttachmentDocType
from src.modules.attachments.services.attachment_service import (
    _SALES_V2_COLLECTIONS,
)
from src.modules.sales.api.v1.audit import _SALES_AUDIT_COLLECTIONS
from src.modules.sales.services import (
    ar_credit_note_service,
    ar_invoice_service,
    customer_receipt_service,
    delivery_service,
    quote_service,
    return_request_service,
    rtn_service,
    sales_order_service,
)

# doc type -> (writer service module, primary-collection attr, audit-collection attr)
_GROUND_TRUTH = {
    "AR_INVOICE": (ar_invoice_service, "_ARI_COL", "_AUDIT_COL"),
    "CUSTOMER_RECEIPT": (customer_receipt_service, "_CR_COL", "_AUDIT_COL"),
    "QUOTE": (quote_service, "_QUOTES_COL", "_AUDIT_COL"),
    "SALES_ORDER": (sales_order_service, "_SO_COL", "_AUDIT_COL"),
    "DELIVERY": (delivery_service, "_DN_COL", "_AUDIT_COL"),
    "RETURN_REQUEST": (return_request_service, "_RR_COL", "_AUDIT_COL"),
    "RETURN": (rtn_service, "_RTN_COL", "_AUDIT_COL"),
    "AR_CREDIT_NOTE": (ar_credit_note_service, "_ARC_COL", "_AUDIT_COL"),
}


# ---------------------------------------------------------------------------
# 1 & 2. The QUOTE fix itself
# ---------------------------------------------------------------------------


def test_quote_resolves_to_sales_quotes_in_attachment_dispatch():
    assert _SALES_V2_COLLECTIONS[AttachmentDocType.QUOTE.value] == "sales_quotes"


def test_quote_resolves_to_sales_quotes_audit_in_audit_dispatch():
    assert _SALES_AUDIT_COLLECTIONS["QUOTE"] == "sales_quotes_audit"


# ---------------------------------------------------------------------------
# 3 & 4. Guard: every entry actually matches what its service writes to.
#         This is the regression test — it is what would have caught the
#         original QUOTE typo, and prevents this class of bug recurring for
#         any of the 8 doc types (not just QUOTE).
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("doc_type", sorted(_GROUND_TRUTH))
def test_attachment_dispatch_matches_actual_writer_collection(doc_type):
    module, primary_attr, _audit_attr = _GROUND_TRUTH[doc_type]
    expected = getattr(module, primary_attr)
    assert _SALES_V2_COLLECTIONS[doc_type] == expected, (
        f"_SALES_V2_COLLECTIONS[{doc_type!r}] = "
        f"{_SALES_V2_COLLECTIONS[doc_type]!r}, but "
        f"{module.__name__}.{primary_attr} = {expected!r}"
    )


@pytest.mark.parametrize("doc_type", sorted(_GROUND_TRUTH))
def test_audit_dispatch_matches_actual_writer_audit_collection(doc_type):
    module, _primary_attr, audit_attr = _GROUND_TRUTH[doc_type]
    expected = getattr(module, audit_attr)
    assert _SALES_AUDIT_COLLECTIONS[doc_type] == expected, (
        f"_SALES_AUDIT_COLLECTIONS[{doc_type!r}] = "
        f"{_SALES_AUDIT_COLLECTIONS[doc_type]!r}, but "
        f"{module.__name__}.{audit_attr} = {expected!r}"
    )


# ---------------------------------------------------------------------------
# 5. Both tables cover the same 8 doc types
# ---------------------------------------------------------------------------


def test_both_dispatch_tables_cover_the_same_eight_doc_types():
    attachment_types = {
        dt.value for dt in AttachmentDocType if dt.value in _SALES_V2_COLLECTIONS
    }
    assert set(_SALES_V2_COLLECTIONS) == attachment_types
    assert (
        set(_SALES_AUDIT_COLLECTIONS)
        == set(_SALES_V2_COLLECTIONS)
        == set(_GROUND_TRUTH)
    )
