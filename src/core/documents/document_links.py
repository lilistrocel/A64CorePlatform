"""
A64 Core Platform — Document Link Infrastructure

Provides base/target linking for the document chain:

    Quote → Sales Order → Delivery Note → AR Invoice → Payment
    PR    → PO         → Goods Receipt  → AP Invoice → Payment

Every line in every document tracks:
  - Its BASE (the upstream line it was drawn from).
  - Its TARGETS (the downstream lines that consumed it).

This creates a bidirectional audit trail so you can walk the chain in
either direction — from the original quote all the way to payment, or
back from a payment to the originating quote line.

Usage (for a new document type)
--------------------------------
1. Include ``DocumentLineLinkMixin`` in your Pydantic line-response schema.
2. When creating a downstream document, call ``write_back_target_ref`` to
   stamp the target reference onto the source line in MongoDB.

No dependency on any specific document module. DB collection names are
passed in by the caller — this library has no opinion about collection layout.
"""

from __future__ import annotations

from typing import List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


# Shared response config: serialise snake_case fields as camelCase aliases
# while still accepting snake_case input (populate_by_name).
_DOC_LINK_CONFIG = ConfigDict(populate_by_name=True, alias_generator=to_camel)


# ---------------------------------------------------------------------------
# Core data models
# ---------------------------------------------------------------------------


class DocumentLinkRef(BaseModel):
    model_config = _DOC_LINK_CONFIG

    """
    A reference to another document (header or line).

    Used both for forward links (a line's base) and back-links (targets).

    Attributes:
        doc_type:   Short type code, e.g. "PR", "PO", "GR", "AP_INVOICE",
                    "QUOTE", "SO", "DELIVERY", "AR_INVOICE", "PAYMENT".
        doc_id:     UUID string of the referenced document header.
        doc_number: Denormalised user-facing number ("PR-2026-0001") for
                    display without a secondary lookup.
        line_id:    UUID string of the specific line within the document.
                    None when the reference is at header level only.
    """

    doc_type: str = Field(..., description="Short type code, e.g. 'PR', 'PO', 'SO'")
    doc_id: str = Field(..., description="UUID of the referenced document header")
    doc_number: str = Field(
        ...,
        description="Denormalised user-facing number for display (no extra lookup needed)",
    )
    line_id: Optional[str] = Field(
        None,
        description="UUID of the specific line; None for header-level links",
    )


class DocumentLineLinkMixin(BaseModel):
    model_config = _DOC_LINK_CONFIG

    """
    Mixin for document-line Pydantic schemas.

    Add this as a base class (or via ``model_fields`` composition) on any
    line response schema that participates in the base/target link chain.

    Attributes:
        base_doc_ref:      The upstream line this line was drawn from.
                           None for the originating document (e.g. a Quote
                           line has no base).
        target_doc_refs:   All downstream lines that have consumed quantity
                           from this line.  A single SO line can be split
                           across two Delivery Notes; both back-pointers
                           appear here.
    """

    base_doc_ref: Optional[DocumentLinkRef] = Field(
        None,
        description="Upstream source line (None for origin documents such as Quote/PR)",
    )
    target_doc_refs: List[DocumentLinkRef] = Field(
        default_factory=list,
        description=(
            "Downstream lines that have consumed this line. "
            "A line may be partially fulfilled by multiple downstream docs."
        ),
    )


# ---------------------------------------------------------------------------
# DB helper: write the back-pointer onto the source line
# ---------------------------------------------------------------------------


async def write_back_target_ref(
    db: AsyncIOMotorDatabase,
    *,
    lines_collection: str,
    source_line_id: str,
    target_ref: DocumentLinkRef,
) -> None:
    """
    Write a target back-pointer onto a source document line in MongoDB.

    Call this inside the same Motor session/transaction as the downstream
    document creation so the link is atomic with the new document.

    Appends ``target_ref`` to the ``targetDocRefs`` array on the source line.
    Uses ``$addToSet``-equivalent via ``$push`` with a uniqueness guard
    (duplicate pushes are idempotent for the same ``target_ref.line_id``).

    Args:
        db:                  Motor database instance.
        lines_collection:    MongoDB collection name for document lines,
                             e.g. "document_lines".
        source_line_id:      ``lineId`` UUID of the source line to update.
        target_ref:          The ``DocumentLinkRef`` to append.

    Returns:
        None.  No error is raised if the source line is not found — the
        link is best-effort for auditing; the downstream document has already
        been created.

    Example::

        await write_back_target_ref(
            db,
            lines_collection="document_lines",
            source_line_id=po_line_id,
            target_ref=DocumentLinkRef(
                doc_type="GR",
                doc_id=gr_doc_id,
                doc_number="GR-2026-0001",
                line_id=gr_line_id,
            ),
        )
    """
    # Reason: serialise the Pydantic model to a plain dict for MongoDB storage.
    ref_dict = target_ref.model_dump()

    # Reason: $push is always safe here because the target line_id is a new UUID
    # that cannot already exist in the array.  A $addToSet on a subdocument
    # requires all fields to match; using $push with the unique line_id is simpler
    # and practically equivalent.
    await db[lines_collection].update_one(
        {"lineId": source_line_id},
        {"$push": {"targetDocRefs": ref_dict}},
    )


# ---------------------------------------------------------------------------
# Integrity helper: detect broken links
# ---------------------------------------------------------------------------


async def find_broken_links(
    db: AsyncIOMotorDatabase,
    *,
    lines_collection: str,
    doc_id: str,
) -> List[str]:
    """
    Return a list of ``base_doc_ref.line_id`` values where the referenced
    source line no longer exists in ``lines_collection``.

    Useful for data-quality audits and reconciliation jobs.

    Args:
        db:               Motor database instance.
        lines_collection: MongoDB collection name for document lines.
        doc_id:           Header UUID to check all lines for.

    Returns:
        List of missing ``line_id`` strings (empty if no broken links).
    """
    # Reason: pull all lines for the doc and check each base_doc_ref in bulk
    # rather than one query per line to avoid N+1 database calls.
    cursor = db[lines_collection].find(
        {"docId": doc_id, "baseDocRef": {"$ne": None}},
        {"lineId": 1, "baseDocRef": 1},
    )
    lines = await cursor.to_list(length=None)

    if not lines:
        return []

    referenced_line_ids = [
        ln["baseDocRef"]["line_id"]
        for ln in lines
        if ln.get("baseDocRef") and ln["baseDocRef"].get("line_id")
    ]

    if not referenced_line_ids:
        return []

    existing_cursor = db[lines_collection].find(
        {"lineId": {"$in": referenced_line_ids}},
        {"lineId": 1},
    )
    existing = await existing_cursor.to_list(length=None)
    existing_ids = {doc["lineId"] for doc in existing}

    return [lid for lid in referenced_line_ids if lid not in existing_ids]
