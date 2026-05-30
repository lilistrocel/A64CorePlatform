"""
A64 Core Platform — Document Number Generator

Generates sequential, human-readable document numbers of the form:

    {PREFIX}-{YYYY}-{NNNN}

Examples:
    PR-2026-0001    Purchase Request
    PO-2026-0042    Purchase Order
    GR-2026-0007    Goods Receipt
    API-2026-0003   AP Invoice
    SQ-2026-0001    Sales Quotation
    SO-2026-0015    Sales Order
    DN-2026-0002    Delivery Note
    ARI-2026-0008   AR Invoice
    ARC-2026-0001   AR Credit Note

Implementation
--------------
Uses MongoDB ``findAndModify`` (Motor's ``find_one_and_update``) on a
``document_counters`` collection with ``upsert=True``.  The counter key is::

    {company_code}:{doc_type}:{fiscal_year}

The counter increment and the downstream document insert should share the
same Motor session/transaction so the counter rollback is automatic if the
document creation fails.  (This mirrors the pattern in the existing
``_next_doc_number`` in ``src/modules/purchasing/services/document_service.py``
— this module generalises it for all document types.)

Doc-type → prefix mapping
--------------------------
See ``DOC_TYPE_PREFIXES`` dict.  When adding a new document type, add an
entry here and document it in ``Docs/4-Finance-Mod-docs/Document-Conventions.md``.

Audit helper
------------
``assert_no_gaps`` is a diagnostic helper for auditors: given a doc type and
year it returns a list of missing sequence numbers.  This is intentionally
read-only and carries no production side-effects.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase

# ---------------------------------------------------------------------------
# Doc-type → prefix mapping (single source of truth)
# ---------------------------------------------------------------------------

# Reason: centralised mapping prevents prefix drift across modules.
# Every future document type that uses next_doc_number MUST add an entry here.
DOC_TYPE_PREFIXES: dict[str, str] = {
    # Purchasing
    "PR": "PR",        # Purchase Request
    "PO": "PO",        # Purchase Order
    "GR": "GR",        # Goods Receipt (Purchase)
    "AP_INVOICE": "API",   # AP Invoice
    "AP_CREDIT": "APC",    # AP Credit Note
    "IPAY": "IPAY",    # Incoming Payment (vendor payment out)
    "OPAY": "OPAY",    # Outgoing Payment (customer payment in)
    "DPI": "DPI",      # Down Payment Invoice (AP)
    # Sales
    "QUOTE": "SQ",     # Sales Quotation
    "SO": "SO",        # Sales Order
    "DELIVERY": "DN",  # Delivery Note
    "AR_INVOICE": "ARI",   # AR Invoice
    "AR_CREDIT": "ARC",    # AR Credit Note
    # Reservations / Transfers
    "RES": "RES",      # Inventory Reservation
    "BLA": "BLA",      # Blanket Agreement
    "RR": "RR",        # Return Request (from customer)
    "RTN": "RTN",      # Return Note (goods physically returned)
    "ARC": "ARC",      # AR Credit Note (financial reversal of AR Invoice)
    # Finance (handled by finance microservice; included for convention reference)
    "JE": "JE",        # Journal Entry
    "PAY": "PAY",      # AP Payment
}

_COUNTERS_COLLECTION = "document_counters"


def _prefix_for(doc_type: str) -> str:
    """
    Return the prefix string for a given document type code.

    Args:
        doc_type: Document type string, e.g. "PR", "SO", "AR_INVOICE".

    Returns:
        Prefix string, e.g. "PR", "SO", "ARI".

    Raises:
        ValueError: If doc_type is not registered in DOC_TYPE_PREFIXES.
    """
    prefix = DOC_TYPE_PREFIXES.get(doc_type)
    if prefix is None:
        raise ValueError(
            f"Unknown doc_type '{doc_type}'. "
            f"Register it in DOC_TYPE_PREFIXES in src/core/documents/doc_number.py."
        )
    return prefix


async def next_doc_number(
    db: AsyncIOMotorDatabase,
    *,
    doc_type: str,
    org_id: str,
    company_code: Optional[str] = None,
    fiscal_year: Optional[int] = None,
    session: Optional[AsyncIOMotorClientSession] = None,
) -> str:
    """
    Generate the next sequential document number for a given type.

    The counter key is ``{company_code}:{doc_type}:{fiscal_year}`` where
    ``company_code`` defaults to ``org_id`` if not supplied, and
    ``fiscal_year`` defaults to the current UTC year.

    Pass ``session`` to make the counter increment participate in the
    caller's Motor transaction — if the transaction aborts, the counter is
    rolled back automatically, preventing sequence gaps from failed inserts.

    Args:
        db:           Motor database instance.
        doc_type:     Document type key, e.g. "PR", "SO", "AR_INVOICE".
                      Must be registered in ``DOC_TYPE_PREFIXES``.
        org_id:       Organisation UUID (used as a fallback company_code scope).
        company_code: Finance company code (e.g. "1000").  Defaults to org_id.
        fiscal_year:  Four-digit year for the counter.  Defaults to current UTC year.
        session:      Optional Motor session for transaction participation.

    Returns:
        Formatted document number, e.g. "PR-2026-0001".

    Raises:
        ValueError: If ``doc_type`` is not registered.

    Example::

        doc_num = await next_doc_number(
            db, doc_type="SO", org_id=org_id, company_code="A001", session=session
        )
        # Returns "SO-2026-0001"
    """
    prefix = _prefix_for(doc_type)
    year = fiscal_year or datetime.now(tz=timezone.utc).year
    scope = company_code or org_id
    counter_key = f"{scope}:{doc_type}:{year}"

    result = await db[_COUNTERS_COLLECTION].find_one_and_update(
        {"_id": counter_key},
        {"$inc": {"counter": 1}},
        upsert=True,
        return_document=True,
        session=session,
    )
    seq: int = result["counter"]
    return f"{prefix}-{year}-{seq:04d}"


# ---------------------------------------------------------------------------
# Audit helper: detect gaps in the sequence
# ---------------------------------------------------------------------------


async def assert_no_gaps(
    db: AsyncIOMotorDatabase,
    *,
    doc_type: str,
    fiscal_year: int,
    org_id: str,
    company_code: Optional[str] = None,
    headers_collection: str = "document_headers",
) -> List[int]:
    """
    Return a list of missing sequence numbers for a doc type and year.

    Reads all document numbers of the given type from ``headers_collection``
    and identifies gaps in the 1-based sequence.

    This is a read-only audit helper; it never writes to the database.

    Args:
        db:                  Motor database instance.
        doc_type:            Document type key, e.g. "PR".
        fiscal_year:         Four-digit year to check.
        org_id:              Organisation UUID for scoping the query.
        company_code:        Finance company code scope (optional).
        headers_collection:  Collection name for document headers.

    Returns:
        List of missing sequence integers (empty if no gaps detected).

    Example::

        gaps = await assert_no_gaps(db, doc_type="PO", fiscal_year=2026, org_id=oid)
        # Returns [] or [3, 7] if PO-2026-0003 and PO-2026-0007 are missing.
    """
    prefix = _prefix_for(doc_type)
    year_str = str(fiscal_year)
    doc_number_prefix = f"{prefix}-{year_str}-"

    cursor = db[headers_collection].find(
        {
            "organizationId": org_id,
            "docType": doc_type,
            "docNumber": {"$regex": f"^{doc_number_prefix}"},
            "deletedAt": None,
        },
        {"docNumber": 1},
    )
    docs = await cursor.to_list(length=None)

    seen: set[int] = set()
    for doc in docs:
        number_str: str = doc["docNumber"]
        suffix = number_str[len(doc_number_prefix):]
        try:
            seen.add(int(suffix))
        except ValueError:
            # Reason: skip non-numeric suffixes (should never occur with our format)
            pass

    if not seen:
        return []

    max_seq = max(seen)
    return [n for n in range(1, max_seq + 1) if n not in seen]
