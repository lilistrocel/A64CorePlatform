"""
Attachments Module — Pydantic Schemas

Defines the response schema for attachment metadata returned to API consumers.
The MongoDB document shape (including deletedAt, deletedBy) is an implementation
detail — only non-deleted fields appear in the public API response.

Doc type enumeration
---------------------
AttachmentDocType mirrors the five P2P document types.  It is a Python enum
(not just a Literal) so it can be used in URL path validation via FastAPI's
enum path parameter support and in MongoDB query filters.
"""

from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class AttachmentDocType(str, Enum):
    """
    Valid document types that can have attachments.

    Purchasing docs live in document_headers; Wave 3 sales docs live in
    their own v2 collections (ar_invoices_v2, etc.). The list endpoint
    queries the attachments collection directly so any doc_type works;
    the upload endpoint still calls _verify_document against
    document_headers — sales upload support is the responsibility of a
    follow-up task (T-200.x).
    """

    # Purchasing
    PR = "PR"
    PO = "PO"
    GR = "GR"
    AP = "AP"
    PAYMENT = "PAYMENT"
    # Sales Wave 3 (T-200.0+) — list-only until upload support lands
    QUOTE = "QUOTE"
    SALES_ORDER = "SALES_ORDER"
    DELIVERY = "DELIVERY"
    AR_INVOICE = "AR_INVOICE"
    CUSTOMER_RECEIPT = "CUSTOMER_RECEIPT"
    RETURN_REQUEST = "RETURN_REQUEST"
    RETURN = "RETURN"
    AR_CREDIT_NOTE = "AR_CREDIT_NOTE"


# ---------------------------------------------------------------------------
# Allowed MIME types (whitelist)
# ---------------------------------------------------------------------------

ALLOWED_MIME_TYPES: frozenset = frozenset(
    {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
    }
)
"""
Mime types accepted by the upload endpoint.

Restricted to document-scan formats only.  Binary executables, office
documents, and archives are all rejected regardless of extension.
"""

# ---------------------------------------------------------------------------
# File size cap
# ---------------------------------------------------------------------------

MAX_ATTACHMENT_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB
"""Maximum allowed upload size. Requests exceeding this return HTTP 413."""

# ---------------------------------------------------------------------------
# Canonical extension mapping (mime → extension)
# Used when the file's declared extension doesn't match its mime type.
# ---------------------------------------------------------------------------

CANONICAL_EXTENSION: dict = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


# ---------------------------------------------------------------------------
# Statuses that make a document immutable for attachments
# ---------------------------------------------------------------------------

IMMUTABLE_STATUSES: frozenset = frozenset(
    {
        "Pending Approval",
        "Approved",
        "Posted",
        "Sent",
        "Open",
        "Partially Received",
        "Received",
        "Closed",
        "Rejected",
        "Cancelled",
    }
)
"""
Document statuses after which attachment uploads and deletes are rejected.

Rule: Once a document leaves Draft it is locked for attachment changes.
Exception: PAYMENT documents are always mutable (see API endpoint comments).

Note: 'Open', 'Sent', 'Partially Received', 'Received' are PO statuses that
appear after a PO leaves Draft.  They are included here so the rule applies
uniformly to all doc types without per-doctype branching.
"""


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------


class AttachmentMetadata(BaseModel):
    """
    Public response schema for a document attachment.

    Returned by all attachment endpoints.  Internal fields (deletedAt,
    deletedBy, storedFilename, storage path) are intentionally excluded.

    Attributes:
        fileId: UUID of this attachment record.
        organizationId: Organisation that owns this attachment.
        docType: One of PR, PO, GR, AP, PAYMENT.
        docId: UUID of the parent document.
        originalFilename: Sanitized original filename from the upload.
        mimeType: Detected/validated MIME type.
        sizeBytes: File size in bytes.
        sha256: Hex-encoded SHA-256 digest of the stored file content.
        description: Optional human note supplied at upload time.
        uploadedBy: userId of the uploader.
        uploadedAt: UTC timestamp when the file was stored.
    """

    fileId: str
    organizationId: str
    docType: Literal[
        "PR",
        "PO",
        "GR",
        "AP",
        "PAYMENT",
        "QUOTE",
        "SALES_ORDER",
        "DELIVERY",
        "AR_INVOICE",
        "CUSTOMER_RECEIPT",
        "RETURN_REQUEST",
        "RETURN",
        "AR_CREDIT_NOTE",
    ]
    docId: str
    originalFilename: str
    mimeType: str
    sizeBytes: int
    sha256: str
    description: Optional[str] = None
    uploadedBy: str
    uploadedAt: datetime
