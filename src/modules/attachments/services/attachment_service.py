"""
Attachments Module — Business Logic Service

Handles the full lifecycle of document attachments:
  1. Upload validation (mime, size, org ownership, document mutability)
  2. SHA-256 computation
  3. Filename sanitization
  4. Storage via the injected StorageBackend
  5. MongoDB persistence (document_attachments collection)
  6. Listing (org-scoped, non-deleted, sorted by uploadedAt desc)
  7. Download (stream bytes from storage)
  8. Soft delete (sets deletedAt, keeps file on disk in v1)

Read-only enforcement
----------------------
When adding or deleting an attachment the service looks up the source
document in its owning collection to check its status.

Purchasing docs (PR/PO/GR/AP) live in document_headers and are checked
against _MUTABLE_STATUSES (currently only "Draft").

Wave 3 sales docs (AR_INVOICE, CUSTOMER_RECEIPT, QUOTE, SALES_ORDER,
DELIVERY, RETURN_REQUEST, RETURN, AR_CREDIT_NOTE) each live in their
own v2 collection (ar_invoices_v2, etc.) and use camelCase field names
(docEntry not docId, organizationId not organization_id). These docs are
mutable only when status == "draft" (lowercase, matching DocumentStatus enum).

PAYMENT exception:
  Vendor payments (PAYMENT doctype) live in the finance MySQL service
  (ap_payments table) and have no Draft state — they are immutable from
  creation.  Accountants must be able to attach bank-confirmation PDFs
  after the payment is posted, so PAYMENT attachments are ALWAYS mutable.
  This is by design and is a deliberate deviation from the PR/PO/GR/AP rule.

Cross-store check for PAYMENT:
  In v1 we skip the cross-store existence check for PAYMENT documents
  (the finance MySQL service is a separate process).  The attachment is
  created unconditionally against any docId supplied for PAYMENT type.
  Future work: add a finance service HTTP lookup when finance is stable.

Filename sanitization
----------------------
  - Strip Windows and Unix path separators
  - Normalize to Unicode NFC
  - Truncate to 255 characters
  - If the declared extension doesn't match the MIME type, append the
    canonical extension (e.g. a .jpg file with mime application/pdf
    becomes "invoice.jpg.pdf")
"""

import hashlib
import logging
import unicodedata
import uuid
from datetime import datetime, timezone
from os.path import basename
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.attachment import (
    ALLOWED_MIME_TYPES,
    CANONICAL_EXTENSION,
    IMMUTABLE_STATUSES,
    MAX_ATTACHMENT_SIZE_BYTES,
    AttachmentDocType,
    AttachmentMetadata,
)
from ..storage.base import StorageBackend

logger = logging.getLogger(__name__)

_COLLECTION = "document_attachments"
_HEADERS_COL = "document_headers"

# ---------------------------------------------------------------------------
# Sales v2 collection dispatch (T-200.x)
# ---------------------------------------------------------------------------

# Map from Wave 3 sales AttachmentDocType values to their owning MongoDB
# collection names.  These collections use camelCase field names and store
# the primary key as docEntry (not docId) plus organizationId (camelCase).
#
# T-928: each value here must independently match the collection the
# corresponding service in sales/services/*.py actually writes to — do not
# assume a mechanical "<doctype>_v2" naming rule; QUOTE is the one doc type
# that breaks it (quote_service.py writes `sales_quotes`, no `_v2` at all).
# Getting this wrong here previously made every add/delete attachment call
# against a Quote fail with a misleading "document not found" (LookupError
# from _assert_sales_v2_document_is_draft), because the lookup queried a
# collection ("quotes_v2") that has never existed.
_SALES_V2_COLLECTIONS: dict[str, str] = {
    AttachmentDocType.QUOTE.value: "sales_quotes",
    AttachmentDocType.SALES_ORDER.value: "sales_orders_v2",
    AttachmentDocType.DELIVERY.value: "deliveries_v2",
    AttachmentDocType.AR_INVOICE.value: "ar_invoices_v2",
    AttachmentDocType.CUSTOMER_RECEIPT.value: "customer_receipts_v2",
    AttachmentDocType.RETURN_REQUEST.value: "return_requests_v2",
    AttachmentDocType.RETURN.value: "returns_v2",
    AttachmentDocType.AR_CREDIT_NOTE.value: "ar_credit_notes_v2",
}

# ---------------------------------------------------------------------------
# Document status check
# ---------------------------------------------------------------------------

# Statuses that allow add/delete for PR/PO/GR/AP (not PAYMENT — see module docstring)
# Wave 3 sales docs use lowercase "draft" (DocumentStatus enum value).
_MUTABLE_STATUSES = frozenset({"Draft"})

# Sales v2 docs are mutable only when status == "draft" (lowercase).
_SALES_MUTABLE_STATUS = "draft"


class AttachmentService:
    """
    Core business logic for the document attachment system.

    Designed as a stateless service class: methods receive the MongoDB
    database and storage backend as explicit arguments so the service
    can be unit-tested without running FastAPI or MongoDB.

    Args:
        db: AsyncIOMotorDatabase pointing at the operational Mongo database.
        storage: StorageBackend instance (injected; LocalStorageBackend in v1).
    """

    def __init__(self, db: AsyncIOMotorDatabase, storage: StorageBackend) -> None:
        """
        Initialise the service.

        Args:
            db: Motor async database for document_attachments queries.
            storage: Storage backend for file I/O.
        """
        self._db = db
        self._storage = storage

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def upload(
        self,
        *,
        organization_id: str,
        doc_type: AttachmentDocType,
        doc_id: str,
        uploaded_by: str,
        file_data: bytes,
        original_filename: str,
        mime_type: str,
        description: Optional[str] = None,
    ) -> AttachmentMetadata:
        """
        Validate, store, and persist a new attachment.

        Args:
            organization_id: Caller's organisation UUID.
            doc_type: Document type enum value.
            doc_id: UUID of the parent document.
            uploaded_by: userId of the authenticated uploader.
            file_data: Raw file bytes (already read from the upload stream).
            original_filename: The filename supplied by the client.
            mime_type: The content-type declared by the client (we trust
                       FastAPI's parsed content-type header here; the
                       whitelist enforces safety).
            description: Optional free-text note (max 500 chars).

        Returns:
            AttachmentMetadata for the newly created attachment.

        Raises:
            ValueError: For mime/size/org/status violations (caller maps to HTTP).
            LookupError: If the source document is not found (caller → 404).
        """
        # Step 1: Validate mime type
        if mime_type not in ALLOWED_MIME_TYPES:
            raise ValueError(
                f"Unsupported file type: {mime_type!r}. "
                f"Allowed: {', '.join(sorted(ALLOWED_MIME_TYPES))}"
            )

        # Step 2: Validate file size
        size = len(file_data)
        if size > MAX_ATTACHMENT_SIZE_BYTES:
            raise OverflowError(
                f"File size {size} bytes exceeds the {MAX_ATTACHMENT_SIZE_BYTES} byte limit."
            )

        # Step 3: Sanitize filename
        safe_name = _sanitize_filename(original_filename, mime_type)

        # Step 4: Check document exists and is mutable (skip for PAYMENT)
        if doc_type != AttachmentDocType.PAYMENT:
            await self._assert_document_exists_and_is_draft(
                organization_id=organization_id,
                doc_type=doc_type,
                doc_id=doc_id,
                action="add attachments to",
            )

        # Step 5: Compute SHA-256
        sha256_hex = hashlib.sha256(file_data).hexdigest()

        # Step 6: Derive storage path
        file_id = str(uuid.uuid4())
        # Reason: use canonical extension derived from mime type so the stored
        # filename is always predictable regardless of client filename tricks.
        ext = CANONICAL_EXTENSION.get(mime_type, ".bin")
        stored_filename = f"{file_id}{ext}"
        storage_path = f"{organization_id}/{doc_type.value}/{doc_id}/{stored_filename}"

        # Step 7: Persist file
        await self._storage.save(storage_path, file_data)
        logger.info(
            "[Attachments] Stored file %s for %s/%s (org=%s, size=%d)",
            stored_filename,
            doc_type.value,
            doc_id,
            organization_id,
            size,
        )

        # Step 8: Insert MongoDB document
        now = datetime.now(tz=timezone.utc)
        doc = {
            "fileId": file_id,
            "organizationId": organization_id,
            "docType": doc_type.value,
            "docId": doc_id,
            "originalFilename": safe_name,
            "storedFilename": stored_filename,
            "storagePath": storage_path,
            "mimeType": mime_type,
            "sizeBytes": size,
            "sha256": sha256_hex,
            "description": description,
            "uploadedBy": uploaded_by,
            "uploadedAt": now,
            "deletedAt": None,
            "deletedBy": None,
        }
        await self._db[_COLLECTION].insert_one(doc)

        return AttachmentMetadata(
            fileId=file_id,
            organizationId=organization_id,
            docType=doc_type.value,  # type: ignore[arg-type]
            docId=doc_id,
            originalFilename=safe_name,
            mimeType=mime_type,
            sizeBytes=size,
            sha256=sha256_hex,
            description=description,
            uploadedBy=uploaded_by,
            uploadedAt=now,
        )

    async def list_attachments(
        self,
        *,
        organization_id: str,
        doc_type: AttachmentDocType,
        doc_id: str,
    ) -> list[AttachmentMetadata]:
        """
        Return all non-deleted attachments for a document, newest first.

        Args:
            organization_id: Caller's organisation UUID.
            doc_type: Document type.
            doc_id: Parent document UUID.

        Returns:
            List of AttachmentMetadata sorted by uploadedAt descending.
        """
        cursor = self._db[_COLLECTION].find(
            {
                "organizationId": organization_id,
                "docType": doc_type.value,
                "docId": doc_id,
                "deletedAt": None,
            },
            sort=[("uploadedAt", -1)],
        )
        results = []
        async for doc in cursor:
            results.append(_doc_to_metadata(doc))
        return results

    async def get_metadata(
        self,
        *,
        organization_id: str,
        file_id: str,
    ) -> AttachmentMetadata:
        """
        Return metadata for a single attachment by fileId.

        Args:
            organization_id: Caller's organisation UUID (org-scope isolation).
            file_id: Attachment UUID.

        Returns:
            AttachmentMetadata.

        Raises:
            LookupError: If the attachment is not found or belongs to a
                         different organisation.
        """
        doc = await self._db[_COLLECTION].find_one(
            {"fileId": file_id, "organizationId": organization_id, "deletedAt": None}
        )
        if not doc:
            raise LookupError(f"Attachment {file_id!r} not found")
        return _doc_to_metadata(doc)

    async def download(
        self,
        *,
        organization_id: str,
        file_id: str,
    ) -> tuple[bytes, AttachmentMetadata]:
        """
        Return the raw file bytes and its metadata.

        Args:
            organization_id: Caller's organisation UUID.
            file_id: Attachment UUID.

        Returns:
            Tuple of (raw_bytes, AttachmentMetadata).

        Raises:
            LookupError: If the attachment is not found.
            FileNotFoundError: If the file is missing from storage (corrupt state).
        """
        doc = await self._db[_COLLECTION].find_one(
            {"fileId": file_id, "organizationId": organization_id, "deletedAt": None}
        )
        if not doc:
            raise LookupError(f"Attachment {file_id!r} not found")

        stream = await self._storage.read(doc["storagePath"])
        data = stream.read()
        return data, _doc_to_metadata(doc)

    async def soft_delete(
        self,
        *,
        organization_id: str,
        file_id: str,
        deleted_by: str,
    ) -> None:
        """
        Soft-delete an attachment by setting deletedAt.

        The file is kept on disk (hard delete is deferred to a future
        compaction job).  The MongoDB record is updated atomically.

        Args:
            organization_id: Caller's organisation UUID.
            file_id: Attachment UUID to delete.
            deleted_by: userId of the authenticated deleter.

        Raises:
            LookupError: If the attachment is not found or already deleted.
            ValueError: If the source document is no longer in Draft status.
        """
        doc = await self._db[_COLLECTION].find_one(
            {"fileId": file_id, "organizationId": organization_id, "deletedAt": None}
        )
        if not doc:
            raise LookupError(f"Attachment {file_id!r} not found")

        # Step: Check document mutability (skip for PAYMENT — always mutable)
        doc_type = AttachmentDocType(doc["docType"])
        if doc_type != AttachmentDocType.PAYMENT:
            await self._assert_document_exists_and_is_draft(
                organization_id=organization_id,
                doc_type=doc_type,
                doc_id=doc["docId"],
                action="delete attachments from",
            )

        now = datetime.now(tz=timezone.utc)
        await self._db[_COLLECTION].update_one(
            {"fileId": file_id},
            {"$set": {"deletedAt": now, "deletedBy": deleted_by}},
        )
        logger.info(
            "[Attachments] Soft-deleted file %s (deleted_by=%s)", file_id, deleted_by
        )

    # ------------------------------------------------------------------
    # Index creation (called at startup)
    # ------------------------------------------------------------------

    async def ensure_indexes(self) -> None:
        """
        Create the compound index on document_attachments if it does not
        already exist.

        Index: (organizationId, docType, docId, deletedAt)
        This covers the primary list query pattern efficiently.

        Should be called once at application startup.
        """
        collection = self._db[_COLLECTION]
        await collection.create_index(
            [
                ("organizationId", 1),
                ("docType", 1),
                ("docId", 1),
                ("deletedAt", 1),
            ],
            name="ix_attachments_org_doc",
        )
        await collection.create_index(
            [("fileId", 1)],
            unique=True,
            name="ix_attachments_file_id",
        )
        logger.info("[Attachments] Indexes ensured on document_attachments")

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _assert_document_exists_and_is_draft(
        self,
        *,
        organization_id: str,
        doc_type: AttachmentDocType,
        doc_id: str,
        action: str,
    ) -> None:
        """
        Verify the source document exists in its owning collection and is mutable.

        Dispatches by doc_type:
          - Purchasing (PR/PO/GR/AP): queries document_headers using docId,
            organizationId, docType, deletedAt filter. Mutable when status is
            in _MUTABLE_STATUSES (currently {"Draft"}).
          - Wave 3 sales docs (AR_INVOICE, CUSTOMER_RECEIPT, QUOTE, etc.):
            queries the matching v2 collection using docEntry (not docId) and
            organizationId (camelCase). Mutable when status == "draft"
            (lowercase, matching DocumentStatus enum). These collections may
            not have a deletedAt field, so we do not filter on it.
          - PAYMENT docs never reach this method (caller skips them).

        Args:
            organization_id: Expected owner organisation.
            doc_type: Expected document type.
            doc_id: Document UUID to look up (docId for purchasing, docEntry
                    for sales v2).
            action: Human-readable verb for error messages ("add attachments to",
                    "delete attachments from").

        Raises:
            LookupError: If the document is not found in the owning collection.
            ValueError: If the document exists but is not in a mutable status.
        """
        # Reason: dispatch lookup to the correct collection and key schema
        if doc_type.value in _SALES_V2_COLLECTIONS:
            await self._assert_sales_v2_document_is_draft(
                organization_id=organization_id,
                doc_type=doc_type,
                doc_id=doc_id,
                action=action,
            )
        else:
            await self._assert_purchasing_document_is_draft(
                organization_id=organization_id,
                doc_type=doc_type,
                doc_id=doc_id,
                action=action,
            )

    async def _assert_purchasing_document_is_draft(
        self,
        *,
        organization_id: str,
        doc_type: AttachmentDocType,
        doc_id: str,
        action: str,
    ) -> None:
        """
        Check a purchasing document in document_headers.

        Purchasing docs (PR/PO/GR/AP) use:
          - collection: document_headers
          - key field: docId (snake or camel — the collection uses camelCase)
          - org field: organizationId
          - type field: docType
          - soft-delete field: deletedAt (must be None)

        Args:
            organization_id: Caller's organisation UUID.
            doc_type: PR, PO, GR, or AP.
            doc_id: Document primary key UUID.
            action: Error message verb.

        Raises:
            LookupError: Document not found.
            ValueError: Document not in Draft.
        """
        header = await self._db[_HEADERS_COL].find_one(
            {
                "docId": doc_id,
                "organizationId": organization_id,
                "docType": doc_type.value,
                "deletedAt": None,
            },
            projection={"status": 1},
        )
        if not header:
            raise LookupError(
                f"{doc_type.value} document {doc_id!r} not found in organisation {organization_id!r}"
            )

        status = header.get("status", "Unknown")
        if status not in _MUTABLE_STATUSES:
            raise ValueError(
                f"Cannot {action} a {status} document. "
                f"Documents become immutable once submitted for approval."
            )

    async def _assert_sales_v2_document_is_draft(
        self,
        *,
        organization_id: str,
        doc_type: AttachmentDocType,
        doc_id: str,
        action: str,
    ) -> None:
        """
        Check a Wave 3 sales document in the matching v2 collection.

        Sales v2 docs (ar_invoices_v2, quotes_v2, etc.) use:
          - collection: from _SALES_V2_COLLECTIONS mapping
          - key field: docEntry (NOT docId — sales v2 uses this name)
          - org field: organizationId (camelCase)
          - No deletedAt filter — sales v2 collections may omit this field

        A sales v2 doc is mutable only when status == "draft" (lowercase,
        matching the DocumentStatus Python enum value).

        Args:
            organization_id: Caller's organisation UUID.
            doc_type: One of the 8 Wave 3 sales doc types.
            doc_id: Document docEntry UUID.
            action: Error message verb.

        Raises:
            LookupError: Document not found in the v2 collection.
            ValueError: Document exists but status is not "draft".
        """
        collection_name = _SALES_V2_COLLECTIONS[doc_type.value]
        # Reason: sales v2 uses docEntry as primary key, organizationId in camelCase.
        # No deletedAt filter — v2 collections may not have this field.
        doc = await self._db[collection_name].find_one(
            {
                "docEntry": doc_id,
                "organizationId": organization_id,
            },
            projection={"status": 1},
        )
        if not doc:
            raise LookupError(
                f"{doc_type.value} document {doc_id!r} not found in organisation {organization_id!r}"
            )

        status = doc.get("status", "unknown")
        if status != _SALES_MUTABLE_STATUS:
            raise ValueError(
                f"Cannot {action} a {status!r} document. "
                f"Sales documents become immutable once posted (status must be 'draft')."
            )


# ---------------------------------------------------------------------------
# Private module-level helpers
# ---------------------------------------------------------------------------


def _sanitize_filename(original: str, mime_type: str) -> str:
    """
    Sanitize an uploaded filename for safe storage and display.

    Operations performed (in order):
    1. Strip Windows and Unix path separators using os.path.basename logic.
    2. Normalize Unicode to NFC (canonical decomposition / recomposition).
    3. Truncate to 255 characters.
    4. If the file's extension does not match the MIME type, append the
       canonical extension to prevent MIME sniffing confusion.

    Args:
        original: Raw filename from the client (e.g. "../../etc/passwd",
                  "invoice (1).PDF", "наклад.pdf").
        mime_type: The validated MIME type from the whitelist.

    Returns:
        Safe filename string (max 255 chars, correct extension).
    """
    # Reason: strip path separators on both platforms
    name = basename(original.replace("\\", "/"))

    # Reason: normalize Unicode to NFC for consistent storage/display
    name = unicodedata.normalize("NFC", name)

    # Reason: append canonical extension when declared extension conflicts
    canonical_ext = CANONICAL_EXTENSION.get(mime_type, "")
    if canonical_ext:
        suffix_lower = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if suffix_lower != canonical_ext.lower():
            name = name + canonical_ext

    # Reason: respect max_length=255 contract — truncate AFTER extension append
    # so the total length including the extension never exceeds 255 chars.
    if len(name) > 255:
        # Preserve the extension when truncating the stem
        if "." in name:
            stem, ext = name.rsplit(".", 1)
            ext_with_dot = "." + ext
            max_stem = 255 - len(ext_with_dot)
            name = (
                stem[:max_stem] + ext_with_dot if max_stem > 0 else ext_with_dot[:255]
            )
        else:
            name = name[:255]

    return name or "attachment"


def _doc_to_metadata(doc: dict) -> AttachmentMetadata:
    """
    Convert a raw MongoDB document to an AttachmentMetadata response model.

    Args:
        doc: Raw dict from motor query.

    Returns:
        AttachmentMetadata instance.
    """
    return AttachmentMetadata(
        fileId=doc["fileId"],
        organizationId=doc["organizationId"],
        docType=doc["docType"],
        docId=doc["docId"],
        originalFilename=doc["originalFilename"],
        mimeType=doc["mimeType"],
        sizeBytes=doc["sizeBytes"],
        sha256=doc["sha256"],
        description=doc.get("description"),
        uploadedBy=doc["uploadedBy"],
        uploadedAt=doc["uploadedAt"],
    )
