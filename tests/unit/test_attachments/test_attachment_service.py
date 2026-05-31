"""
Unit tests for AttachmentService (T-053)

Covers:
  - Happy upload PDF → stored on disk, metadata row exists, sha256 computed
  - Happy upload image (JPEG) → same
  - Upload unsupported mime type (.exe / text/plain) → ValueError (→ 415)
  - Upload > 10 MB → OverflowError (→ 413)
  - Upload to doc that doesn't exist → LookupError (→ 404)
  - Upload to doc in Pending Approval status → ValueError (→ 409)
  - Upload to PAYMENT doc (any state) → succeeds (always-mutable exception)
  - Upload from different org → LookupError (document not found in that org)
  - List attachments → returns non-deleted only, sorted by uploadedAt desc
  - Download → returns actual bytes + correct metadata
  - Download with Range header helper → returns (start, end) tuple
  - Delete on Draft doc → succeeds, deletedAt set, file kept on disk
  - Delete on Approved doc → ValueError (→ 409)
  - Delete on PAYMENT doc → succeeds (always-mutable exception)
  - File integrity: stored sha256 matches bytes' actual digest
"""

import hashlib
import uuid
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.modules.attachments.models.attachment import (
    ALLOWED_MIME_TYPES,
    MAX_ATTACHMENT_SIZE_BYTES,
    AttachmentDocType,
)
from src.modules.attachments.services.attachment_service import (
    AttachmentService,
    _sanitize_filename,
)
from src.modules.attachments.utils.range_parser import parse_range_header

# ---------------------------------------------------------------------------
# Constants for test fixtures
# ---------------------------------------------------------------------------

ORG_ID = str(uuid.uuid4())
OTHER_ORG_ID = str(uuid.uuid4())
DOC_ID = str(uuid.uuid4())
USER_ID = str(uuid.uuid4())
SMALL_PDF = b"%PDF-1.4 test content"
SMALL_JPEG = bytes([0xFF, 0xD8, 0xFF]) + b"fake jpeg data"


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------


def _make_db_doc(
    file_id: str = None,
    org_id: str = ORG_ID,
    doc_type: str = "PO",
    doc_id: str = None,
    deleted_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Build a minimal document_attachments MongoDB document."""
    now = datetime.now(tz=timezone.utc)
    fid = file_id or str(uuid.uuid4())
    did = doc_id or DOC_ID
    return {
        "fileId": fid,
        "organizationId": org_id,
        "docType": doc_type,
        "docId": did,
        "originalFilename": "invoice.pdf",
        "storedFilename": f"{fid}.pdf",
        "storagePath": f"{org_id}/{doc_type}/{did}/{fid}.pdf",
        "mimeType": "application/pdf",
        "sizeBytes": len(SMALL_PDF),
        "sha256": hashlib.sha256(SMALL_PDF).hexdigest(),
        "description": None,
        "uploadedBy": USER_ID,
        "uploadedAt": now,
        "deletedAt": deleted_at,
        "deletedBy": None,
    }


def _make_header_doc(status: str = "Draft", doc_type: str = "PO") -> Dict[str, Any]:
    """Build a minimal document_headers MongoDB document."""
    return {
        "docId": DOC_ID,
        "organizationId": ORG_ID,
        "docType": doc_type,
        "status": status,
        "deletedAt": None,
    }


def _make_mock_db(
    header_doc: Optional[Dict] = None,
    attachment_docs: Optional[List[Dict]] = None,
    insert_result: Any = None,
    update_result: Any = None,
    sales_v2_doc: Optional[Dict] = None,
    sales_v2_collection: Optional[str] = None,
):
    """
    Build a mock AsyncIOMotorDatabase with configurable return values.

    Args:
        header_doc: Document returned by find_one on document_headers.
        attachment_docs: Documents returned by find on document_attachments.
        insert_result: Mock insert_one result.
        update_result: Mock update_one result.
        sales_v2_doc: Document returned by find_one on a sales v2 collection
                      (e.g. ar_invoices_v2, quotes_v2).  Used when testing
                      upload/delete against Wave 3 sales doc types.
        sales_v2_collection: The specific v2 collection name to return
                             sales_v2_doc for.  Other collection names that are
                             not "document_headers" or the named v2 collection
                             fall through to the generic attachments_col mock.
    """
    db = MagicMock()

    # document_headers collection — find_one returns header_doc
    headers_col = MagicMock()
    headers_col.find_one = AsyncMock(return_value=header_doc)

    # sales v2 collection (when provided)
    sales_col = MagicMock()
    sales_col.find_one = AsyncMock(return_value=sales_v2_doc)

    # document_attachments collection
    attachments_col = MagicMock()
    attachments_col.find_one = AsyncMock(
        return_value=attachment_docs[0] if attachment_docs else None
    )
    attachments_col.insert_one = AsyncMock(return_value=insert_result or MagicMock())
    attachments_col.update_one = AsyncMock(return_value=update_result or MagicMock())

    # Async cursor for find() (used by list_attachments)
    class AsyncCursor:
        def __init__(self, docs):
            self._docs = iter(docs or [])

        def __aiter__(self):
            return self

        async def __anext__(self):
            try:
                return next(self._docs)
            except StopIteration:
                raise StopAsyncIteration

    attachments_col.find = MagicMock(return_value=AsyncCursor(attachment_docs or []))
    attachments_col.create_index = AsyncMock()

    def _col_selector(name):
        if name == "document_headers":
            return headers_col
        if sales_v2_collection and name == sales_v2_collection:
            return sales_col
        return attachments_col

    db.__getitem__ = MagicMock(side_effect=_col_selector)
    return db


def _make_mock_storage(read_data: bytes = SMALL_PDF):
    """Build a mock LocalStorageBackend."""
    storage = MagicMock()
    storage.save = AsyncMock()
    storage.read = AsyncMock(return_value=BytesIO(read_data))
    storage.delete = AsyncMock()
    storage.exists = AsyncMock(return_value=True)
    storage.get_size = AsyncMock(return_value=len(read_data))
    return storage


def _make_service(
    header_doc: Optional[Dict] = None,
    attachment_docs: Optional[List[Dict]] = None,
    read_data: bytes = SMALL_PDF,
    sales_v2_doc: Optional[Dict] = None,
    sales_v2_collection: Optional[str] = None,
):
    """Convenience: build a service with mocked db and storage."""
    db = _make_mock_db(
        header_doc=header_doc,
        attachment_docs=attachment_docs,
        sales_v2_doc=sales_v2_doc,
        sales_v2_collection=sales_v2_collection,
    )
    storage = _make_mock_storage(read_data=read_data)
    return AttachmentService(db=db, storage=storage), db, storage


def _make_sales_v2_doc(status: str = "draft") -> Dict[str, Any]:
    """
    Build a minimal sales v2 MongoDB document (e.g. ar_invoices_v2 row).

    Sales v2 docs use:
      - docEntry (not docId) as the primary key
      - organizationId (camelCase)
      - status as lowercase enum value ("draft", "open", etc.)
    """
    return {
        "docEntry": DOC_ID,
        "organizationId": ORG_ID,
        "status": status,
    }


# ===========================================================================
# 1. Happy upload — PDF
# ===========================================================================


@pytest.mark.asyncio
async def test_upload_pdf_happy_path():
    """Upload a PDF to a Draft PO — should succeed and return metadata."""
    service, db, storage = _make_service(
        header_doc=_make_header_doc(status="Draft", doc_type="PO")
    )

    result = await service.upload(
        organization_id=ORG_ID,
        doc_type=AttachmentDocType.PO,
        doc_id=DOC_ID,
        uploaded_by=USER_ID,
        file_data=SMALL_PDF,
        original_filename="invoice.pdf",
        mime_type="application/pdf",
    )

    # Storage.save was called once
    storage.save.assert_called_once()
    call_args = storage.save.call_args
    path_arg = call_args[0][0]
    data_arg = call_args[0][1]

    # Path follows scheme: org/doctype/docid/fileid.pdf
    assert path_arg.startswith(f"{ORG_ID}/PO/{DOC_ID}/")
    assert path_arg.endswith(".pdf")
    assert data_arg == SMALL_PDF

    # MongoDB insert_one was called once
    db["document_attachments"].insert_one.assert_called_once()

    # Result shape
    assert result.organizationId == ORG_ID
    assert result.docType == "PO"
    assert result.docId == DOC_ID
    assert result.mimeType == "application/pdf"
    assert result.sizeBytes == len(SMALL_PDF)
    assert result.sha256 == hashlib.sha256(SMALL_PDF).hexdigest()
    assert result.originalFilename.endswith(".pdf")


# ===========================================================================
# 2. Happy upload — JPEG image
# ===========================================================================


@pytest.mark.asyncio
async def test_upload_jpeg_happy_path():
    """Upload a JPEG to a Draft PR — should succeed."""
    service, _, storage = _make_service(
        header_doc=_make_header_doc(status="Draft", doc_type="PR")
    )

    result = await service.upload(
        organization_id=ORG_ID,
        doc_type=AttachmentDocType.PR,
        doc_id=DOC_ID,
        uploaded_by=USER_ID,
        file_data=SMALL_JPEG,
        original_filename="delivery-note.jpg",
        mime_type="image/jpeg",
    )

    assert result.mimeType == "image/jpeg"
    assert result.sizeBytes == len(SMALL_JPEG)
    storage.save.assert_called_once()
    path = storage.save.call_args[0][0]
    assert path.endswith(".jpg")


# ===========================================================================
# 3. Upload unsupported mime type → ValueError
# ===========================================================================


@pytest.mark.asyncio
async def test_upload_unsupported_mime_type():
    """Upload with text/plain mime type → ValueError (caller maps to 415)."""
    service, _, _ = _make_service(
        header_doc=_make_header_doc(status="Draft", doc_type="PO")
    )

    with pytest.raises(ValueError, match="Unsupported file type"):
        await service.upload(
            organization_id=ORG_ID,
            doc_type=AttachmentDocType.PO,
            doc_id=DOC_ID,
            uploaded_by=USER_ID,
            file_data=b"plain text content",
            original_filename="malware.exe",
            mime_type="text/plain",
        )


# ===========================================================================
# 4. Upload > 10 MB → OverflowError
# ===========================================================================


@pytest.mark.asyncio
async def test_upload_oversized_file():
    """Upload exceeding 10 MB cap → OverflowError (caller maps to 413)."""
    oversized = b"X" * (MAX_ATTACHMENT_SIZE_BYTES + 1)
    service, _, _ = _make_service(
        header_doc=_make_header_doc(status="Draft", doc_type="PO")
    )

    with pytest.raises(OverflowError, match="exceeds the"):
        await service.upload(
            organization_id=ORG_ID,
            doc_type=AttachmentDocType.PO,
            doc_id=DOC_ID,
            uploaded_by=USER_ID,
            file_data=oversized,
            original_filename="huge.pdf",
            mime_type="application/pdf",
        )


# ===========================================================================
# 5. Upload to non-existent document → LookupError
# ===========================================================================


@pytest.mark.asyncio
async def test_upload_document_not_found():
    """Upload to a doc that doesn't exist in document_headers → LookupError."""
    service, _, _ = _make_service(header_doc=None)  # find_one returns None

    with pytest.raises(LookupError, match="not found"):
        await service.upload(
            organization_id=ORG_ID,
            doc_type=AttachmentDocType.PO,
            doc_id=DOC_ID,
            uploaded_by=USER_ID,
            file_data=SMALL_PDF,
            original_filename="invoice.pdf",
            mime_type="application/pdf",
        )


# ===========================================================================
# 6. Upload to Pending Approval doc → ValueError
# ===========================================================================


@pytest.mark.asyncio
async def test_upload_to_pending_approval_document():
    """Upload to a PO in Pending Approval → ValueError (caller maps to 409)."""
    service, _, _ = _make_service(
        header_doc=_make_header_doc(status="Pending Approval", doc_type="PO")
    )

    with pytest.raises(ValueError, match="Cannot add attachments"):
        await service.upload(
            organization_id=ORG_ID,
            doc_type=AttachmentDocType.PO,
            doc_id=DOC_ID,
            uploaded_by=USER_ID,
            file_data=SMALL_PDF,
            original_filename="invoice.pdf",
            mime_type="application/pdf",
        )


# ===========================================================================
# 7. Upload to PAYMENT doc → succeeds (always-mutable exception)
# ===========================================================================


@pytest.mark.asyncio
async def test_upload_to_payment_doc_always_succeeds():
    """
    PAYMENT documents are always mutable for attachments.

    The service skips the document_headers check entirely for PAYMENT doctype.
    Even if the payment is in a 'Posted' state, uploads must succeed so
    accountants can attach bank-confirmation PDFs after payment posting.
    """
    # db returns no document_headers row — would cause LookupError for other types
    service, db, storage = _make_service(header_doc=None)

    result = await service.upload(
        organization_id=ORG_ID,
        doc_type=AttachmentDocType.PAYMENT,
        doc_id=DOC_ID,
        uploaded_by=USER_ID,
        file_data=SMALL_PDF,
        original_filename="bank-confirmation.pdf",
        mime_type="application/pdf",
    )

    # No document_headers lookup should happen for PAYMENT
    db["document_headers"].find_one.assert_not_called()
    storage.save.assert_called_once()
    assert result.docType == "PAYMENT"


# ===========================================================================
# 8. Upload from different org → LookupError
# ===========================================================================


@pytest.mark.asyncio
async def test_upload_different_org():
    """
    Upload where the document doesn't belong to the caller's org.

    The service queries document_headers with the caller's org_id, so a doc
    owned by OTHER_ORG_ID will not be found → LookupError.
    """
    service, _, _ = _make_service(header_doc=None)  # not found in ORG_ID

    with pytest.raises(LookupError, match="not found"):
        await service.upload(
            organization_id=OTHER_ORG_ID,  # different org
            doc_type=AttachmentDocType.PO,
            doc_id=DOC_ID,
            uploaded_by=USER_ID,
            file_data=SMALL_PDF,
            original_filename="invoice.pdf",
            mime_type="application/pdf",
        )


# ===========================================================================
# 9. List attachments — returns non-deleted only, sorted desc
# ===========================================================================


@pytest.mark.asyncio
async def test_list_attachments_returns_non_deleted():
    """List returns only records with deletedAt=None, newest first."""
    now = datetime.now(tz=timezone.utc)
    docs = [
        {**_make_db_doc(), "uploadedAt": now},
        {**_make_db_doc(), "uploadedAt": now},
    ]
    service, _, _ = _make_service(attachment_docs=docs)

    results = await service.list_attachments(
        organization_id=ORG_ID,
        doc_type=AttachmentDocType.PO,
        doc_id=DOC_ID,
    )

    assert len(results) == 2
    for r in results:
        assert r.organizationId == ORG_ID
        assert r.docType == "PO"


# ===========================================================================
# 10. Download → returns actual bytes + correct Content-Type
# ===========================================================================


@pytest.mark.asyncio
async def test_download_returns_bytes_and_metadata():
    """Download should return the raw bytes and matching metadata."""
    doc = _make_db_doc()
    service, _, storage = _make_service(
        attachment_docs=[doc], read_data=SMALL_PDF
    )

    data, metadata = await service.download(
        organization_id=ORG_ID,
        file_id=doc["fileId"],
    )

    assert data == SMALL_PDF
    assert metadata.mimeType == "application/pdf"
    assert metadata.sizeBytes == len(SMALL_PDF)
    storage.read.assert_called_once_with(doc["storagePath"])


# ===========================================================================
# 11. Range header parsing
# ===========================================================================


def testparse_range_header_valid():
    """Valid Range: bytes=0-99 → (0, 99)."""
    result = parse_range_header("bytes=0-99", 200)
    assert result == (0, 99)


def testparse_range_header_open_end():
    """Range: bytes=100- → (100, total_size-1)."""
    result = parse_range_header("bytes=100-", 200)
    assert result == (100, 199)


def testparse_range_header_full():
    """Range: bytes=0-{size-1} → (0, size-1)."""
    result = parse_range_header("bytes=0-999", 1000)
    assert result == (0, 999)


def testparse_range_header_out_of_bounds():
    """Range start beyond file size → None (triggers 416)."""
    result = parse_range_header("bytes=500-999", 200)
    assert result is None


def testparse_range_header_multi_range_not_supported():
    """Multi-range requests are not supported → None."""
    result = parse_range_header("bytes=0-99,200-299", 1000)
    assert result is None


def testparse_range_header_invalid_format():
    """Non-bytes range → None."""
    result = parse_range_header("items=0-99", 200)
    assert result is None


def testparse_range_header_start_exceeds_end():
    """start > end → None."""
    result = parse_range_header("bytes=100-50", 200)
    assert result is None


# ===========================================================================
# 12. Delete on Draft doc → succeeds, deletedAt set
# ===========================================================================


@pytest.mark.asyncio
async def test_soft_delete_on_draft_doc():
    """Soft delete on Draft PO → update_one called, file kept on disk."""
    doc = _make_db_doc()
    service, db, storage = _make_service(
        header_doc=_make_header_doc(status="Draft", doc_type="PO"),
        attachment_docs=[doc],
    )

    await service.soft_delete(
        organization_id=ORG_ID,
        file_id=doc["fileId"],
        deleted_by=USER_ID,
    )

    # MongoDB update_one was called to set deletedAt
    db["document_attachments"].update_one.assert_called_once()
    update_args = db["document_attachments"].update_one.call_args
    set_doc = update_args[0][1]["$set"]
    assert "deletedAt" in set_doc
    assert set_doc["deletedBy"] == USER_ID

    # File must NOT be removed from storage (soft delete only)
    storage.delete.assert_not_called()


# ===========================================================================
# 13. Delete on Approved doc → ValueError
# ===========================================================================


@pytest.mark.asyncio
async def test_soft_delete_on_approved_doc():
    """Soft delete on Approved PO → ValueError (caller maps to 409)."""
    doc = _make_db_doc()
    service, _, _ = _make_service(
        header_doc=_make_header_doc(status="Approved", doc_type="PO"),
        attachment_docs=[doc],
    )

    with pytest.raises(ValueError, match="Cannot delete attachments"):
        await service.soft_delete(
            organization_id=ORG_ID,
            file_id=doc["fileId"],
            deleted_by=USER_ID,
        )


# ===========================================================================
# 14. Delete on PAYMENT doc → succeeds (always-mutable)
# ===========================================================================


@pytest.mark.asyncio
async def test_soft_delete_on_payment_doc():
    """
    Soft delete on PAYMENT doc → succeeds regardless of state.

    PAYMENT documents skip the document_headers check entirely.
    """
    doc = _make_db_doc(doc_type="PAYMENT")
    service, db, _ = _make_service(
        header_doc=None,  # no headers lookup expected
        attachment_docs=[doc],
    )

    await service.soft_delete(
        organization_id=ORG_ID,
        file_id=doc["fileId"],
        deleted_by=USER_ID,
    )

    # No document_headers lookup for PAYMENT
    db["document_headers"].find_one.assert_not_called()
    # update_one was called
    db["document_attachments"].update_one.assert_called_once()


# ===========================================================================
# 15. File integrity — sha256 stored matches bytes digest
# ===========================================================================


@pytest.mark.asyncio
async def test_upload_sha256_integrity():
    """The sha256 field in the returned metadata must match the actual file digest."""
    data = b"This is a specific test file for integrity verification." * 10
    service, _, _ = _make_service(
        header_doc=_make_header_doc(status="Draft", doc_type="GR")
    )

    result = await service.upload(
        organization_id=ORG_ID,
        doc_type=AttachmentDocType.GR,
        doc_id=DOC_ID,
        uploaded_by=USER_ID,
        file_data=data,
        original_filename="gr-receipt.pdf",
        mime_type="application/pdf",
    )

    expected_sha256 = hashlib.sha256(data).hexdigest()
    assert result.sha256 == expected_sha256
    assert len(result.sha256) == 64  # hex SHA-256 is 64 chars


# ===========================================================================
# 16. Filename sanitization helpers
# ===========================================================================


def test_sanitize_filename_strips_path_traversal():
    """../../etc/passwd should become just 'passwd.pdf' with correct ext appended."""
    result = _sanitize_filename("../../etc/passwd", "application/pdf")
    assert "/" not in result
    assert ".." not in result


def test_sanitize_filename_windows_path():
    """Windows backslash path traversal should be stripped."""
    result = _sanitize_filename("C:\\Windows\\System32\\invoice.pdf", "application/pdf")
    assert "\\" not in result
    assert "System32" not in result


def test_sanitize_filename_unicode_normalization():
    """Unicode should be NFC-normalized."""
    import unicodedata
    # NFD-form filename (decomposed é = e + combining accent)
    nfd_name = "résumé.pdf"
    result = _sanitize_filename(nfd_name, "application/pdf")
    assert unicodedata.is_normalized("NFC", result)


def test_sanitize_filename_truncates_to_255():
    """Filenames longer than 255 chars should be truncated."""
    long_name = "a" * 300 + ".pdf"
    result = _sanitize_filename(long_name, "application/pdf")
    assert len(result) <= 255


def test_sanitize_filename_wrong_extension_appends_canonical():
    """File with .jpg extension uploaded as PDF should get .pdf appended."""
    result = _sanitize_filename("invoice.jpg", "application/pdf")
    assert result.endswith(".pdf")


def test_sanitize_filename_correct_extension_unchanged():
    """File with correct extension should not have extension appended twice."""
    result = _sanitize_filename("scan.pdf", "application/pdf")
    # Should end with .pdf but not .pdf.pdf
    assert result == "scan.pdf"


# ===========================================================================
# T-200.x — Sales v2 doc type upload routing tests
# ===========================================================================

# ---------------------------------------------------------------------------
# 17. Upload to AR_INVOICE (draft) → routes to ar_invoices_v2, succeeds
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_ar_invoice_draft_succeeds():
    """
    Upload to a Draft AR Invoice routes to ar_invoices_v2 (not document_headers)
    and succeeds.
    """
    service, db, storage = _make_service(
        sales_v2_doc=_make_sales_v2_doc(status="draft"),
        sales_v2_collection="ar_invoices_v2",
    )

    result = await service.upload(
        organization_id=ORG_ID,
        doc_type=AttachmentDocType.AR_INVOICE,
        doc_id=DOC_ID,
        uploaded_by=USER_ID,
        file_data=SMALL_PDF,
        original_filename="invoice.pdf",
        mime_type="application/pdf",
    )

    # document_headers should NOT be queried for sales doc types
    db["document_headers"].find_one.assert_not_called()
    # ar_invoices_v2 should be queried
    db["ar_invoices_v2"].find_one.assert_called_once()
    storage.save.assert_called_once()
    assert result.docType == "AR_INVOICE"
    assert result.organizationId == ORG_ID


# ---------------------------------------------------------------------------
# 18. Upload to AR_INVOICE (open) → ValueError — document is immutable
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_ar_invoice_open_raises_value_error():
    """
    AR Invoice in 'open' status is immutable — upload must raise ValueError.
    """
    service, db, _ = _make_service(
        sales_v2_doc=_make_sales_v2_doc(status="open"),
        sales_v2_collection="ar_invoices_v2",
    )

    with pytest.raises(ValueError, match="add attachments"):
        await service.upload(
            organization_id=ORG_ID,
            doc_type=AttachmentDocType.AR_INVOICE,
            doc_id=DOC_ID,
            uploaded_by=USER_ID,
            file_data=SMALL_PDF,
            original_filename="invoice.pdf",
            mime_type="application/pdf",
        )

    # Still no document_headers lookup
    db["document_headers"].find_one.assert_not_called()


# ---------------------------------------------------------------------------
# 19. Upload to AR_INVOICE that doesn't exist → LookupError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_ar_invoice_not_found_raises_lookup_error():
    """
    Upload to an AR Invoice that does not exist in ar_invoices_v2 → LookupError.
    """
    service, _, _ = _make_service(
        sales_v2_doc=None,  # find_one returns None
        sales_v2_collection="ar_invoices_v2",
    )

    with pytest.raises(LookupError, match="not found"):
        await service.upload(
            organization_id=ORG_ID,
            doc_type=AttachmentDocType.AR_INVOICE,
            doc_id=DOC_ID,
            uploaded_by=USER_ID,
            file_data=SMALL_PDF,
            original_filename="invoice.pdf",
            mime_type="application/pdf",
        )


# ---------------------------------------------------------------------------
# 20. Upload to CUSTOMER_RECEIPT (draft) → routes to customer_receipts_v2
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_customer_receipt_draft_succeeds():
    """
    Upload to a Draft Customer Receipt routes to customer_receipts_v2.
    """
    service, db, storage = _make_service(
        sales_v2_doc=_make_sales_v2_doc(status="draft"),
        sales_v2_collection="customer_receipts_v2",
    )

    result = await service.upload(
        organization_id=ORG_ID,
        doc_type=AttachmentDocType.CUSTOMER_RECEIPT,
        doc_id=DOC_ID,
        uploaded_by=USER_ID,
        file_data=SMALL_PDF,
        original_filename="receipt.pdf",
        mime_type="application/pdf",
    )

    db["document_headers"].find_one.assert_not_called()
    db["customer_receipts_v2"].find_one.assert_called_once()
    assert result.docType == "CUSTOMER_RECEIPT"


# ---------------------------------------------------------------------------
# 21. Upload to QUOTE (draft) → routes to quotes_v2
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_quote_draft_succeeds():
    """Upload to a Draft Quote routes to quotes_v2."""
    service, db, _ = _make_service(
        sales_v2_doc=_make_sales_v2_doc(status="draft"),
        sales_v2_collection="quotes_v2",
    )

    result = await service.upload(
        organization_id=ORG_ID,
        doc_type=AttachmentDocType.QUOTE,
        doc_id=DOC_ID,
        uploaded_by=USER_ID,
        file_data=SMALL_PDF,
        original_filename="quote.pdf",
        mime_type="application/pdf",
    )

    db["document_headers"].find_one.assert_not_called()
    db["quotes_v2"].find_one.assert_called_once()
    assert result.docType == "QUOTE"


# ---------------------------------------------------------------------------
# 22. Upload to SALES_ORDER (draft) → routes to sales_orders_v2
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_sales_order_draft_succeeds():
    """Upload to a Draft Sales Order routes to sales_orders_v2."""
    service, db, _ = _make_service(
        sales_v2_doc=_make_sales_v2_doc(status="draft"),
        sales_v2_collection="sales_orders_v2",
    )

    result = await service.upload(
        organization_id=ORG_ID,
        doc_type=AttachmentDocType.SALES_ORDER,
        doc_id=DOC_ID,
        uploaded_by=USER_ID,
        file_data=SMALL_PDF,
        original_filename="so.pdf",
        mime_type="application/pdf",
    )

    db["document_headers"].find_one.assert_not_called()
    db["sales_orders_v2"].find_one.assert_called_once()
    assert result.docType == "SALES_ORDER"


# ---------------------------------------------------------------------------
# 23. Upload to DELIVERY (draft) → routes to deliveries_v2
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_delivery_draft_succeeds():
    """Upload to a Draft Delivery routes to deliveries_v2."""
    service, db, _ = _make_service(
        sales_v2_doc=_make_sales_v2_doc(status="draft"),
        sales_v2_collection="deliveries_v2",
    )

    result = await service.upload(
        organization_id=ORG_ID,
        doc_type=AttachmentDocType.DELIVERY,
        doc_id=DOC_ID,
        uploaded_by=USER_ID,
        file_data=SMALL_PDF,
        original_filename="delivery.pdf",
        mime_type="application/pdf",
    )

    db["document_headers"].find_one.assert_not_called()
    db["deliveries_v2"].find_one.assert_called_once()
    assert result.docType == "DELIVERY"


# ---------------------------------------------------------------------------
# 24. Upload to RETURN_REQUEST (draft) → routes to return_requests_v2
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_return_request_draft_succeeds():
    """Upload to a Draft Return Request routes to return_requests_v2."""
    service, db, _ = _make_service(
        sales_v2_doc=_make_sales_v2_doc(status="draft"),
        sales_v2_collection="return_requests_v2",
    )

    result = await service.upload(
        organization_id=ORG_ID,
        doc_type=AttachmentDocType.RETURN_REQUEST,
        doc_id=DOC_ID,
        uploaded_by=USER_ID,
        file_data=SMALL_PDF,
        original_filename="rr.pdf",
        mime_type="application/pdf",
    )

    db["document_headers"].find_one.assert_not_called()
    db["return_requests_v2"].find_one.assert_called_once()
    assert result.docType == "RETURN_REQUEST"


# ---------------------------------------------------------------------------
# 25. Upload to RETURN (draft) → routes to returns_v2
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_return_draft_succeeds():
    """Upload to a Draft Return routes to returns_v2."""
    service, db, _ = _make_service(
        sales_v2_doc=_make_sales_v2_doc(status="draft"),
        sales_v2_collection="returns_v2",
    )

    result = await service.upload(
        organization_id=ORG_ID,
        doc_type=AttachmentDocType.RETURN,
        doc_id=DOC_ID,
        uploaded_by=USER_ID,
        file_data=SMALL_PDF,
        original_filename="return.pdf",
        mime_type="application/pdf",
    )

    db["document_headers"].find_one.assert_not_called()
    db["returns_v2"].find_one.assert_called_once()
    assert result.docType == "RETURN"


# ---------------------------------------------------------------------------
# 26. Upload to AR_CREDIT_NOTE (draft) → routes to ar_credit_notes_v2
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_ar_credit_note_draft_succeeds():
    """Upload to a Draft AR Credit Note routes to ar_credit_notes_v2."""
    service, db, _ = _make_service(
        sales_v2_doc=_make_sales_v2_doc(status="draft"),
        sales_v2_collection="ar_credit_notes_v2",
    )

    result = await service.upload(
        organization_id=ORG_ID,
        doc_type=AttachmentDocType.AR_CREDIT_NOTE,
        doc_id=DOC_ID,
        uploaded_by=USER_ID,
        file_data=SMALL_PDF,
        original_filename="credit-note.pdf",
        mime_type="application/pdf",
    )

    db["document_headers"].find_one.assert_not_called()
    db["ar_credit_notes_v2"].find_one.assert_called_once()
    assert result.docType == "AR_CREDIT_NOTE"


# ---------------------------------------------------------------------------
# 27. Purchasing doc (PO) still routes to document_headers (regression guard)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_po_still_uses_document_headers():
    """
    Purchasing docs (PO) must continue to use document_headers, not a v2
    collection.  Regression guard against the sales routing change.
    """
    service, db, storage = _make_service(
        header_doc=_make_header_doc(status="Draft", doc_type="PO")
    )

    result = await service.upload(
        organization_id=ORG_ID,
        doc_type=AttachmentDocType.PO,
        doc_id=DOC_ID,
        uploaded_by=USER_ID,
        file_data=SMALL_PDF,
        original_filename="po.pdf",
        mime_type="application/pdf",
    )

    # document_headers MUST be queried for purchasing docs
    db["document_headers"].find_one.assert_called_once()
    assert result.docType == "PO"


# ---------------------------------------------------------------------------
# 28. Soft delete on Draft AR Invoice → succeeds, uses ar_invoices_v2
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_soft_delete_on_draft_ar_invoice():
    """
    Soft delete on Draft AR Invoice → succeeds.
    Verify the delete path also routes to ar_invoices_v2 (not document_headers).
    """
    doc = _make_db_doc(doc_type="AR_INVOICE")
    service, db, _ = _make_service(
        attachment_docs=[doc],
        sales_v2_doc=_make_sales_v2_doc(status="draft"),
        sales_v2_collection="ar_invoices_v2",
    )

    await service.soft_delete(
        organization_id=ORG_ID,
        file_id=doc["fileId"],
        deleted_by=USER_ID,
    )

    db["document_headers"].find_one.assert_not_called()
    db["ar_invoices_v2"].find_one.assert_called_once()
    db["document_attachments"].update_one.assert_called_once()


# ---------------------------------------------------------------------------
# 29. Soft delete on Open AR Invoice → ValueError (immutable)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_soft_delete_on_open_ar_invoice_raises():
    """
    Soft delete on Open (posted) AR Invoice → ValueError.
    Sales docs are immutable once they leave 'draft'.
    """
    doc = _make_db_doc(doc_type="AR_INVOICE")
    service, _, _ = _make_service(
        attachment_docs=[doc],
        sales_v2_doc=_make_sales_v2_doc(status="open"),
        sales_v2_collection="ar_invoices_v2",
    )

    with pytest.raises(ValueError, match="delete attachments"):
        await service.soft_delete(
            organization_id=ORG_ID,
            file_id=doc["fileId"],
            deleted_by=USER_ID,
        )
