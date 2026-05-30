"""
A64 Core Platform — Journal Memo Mixin + Formatter

When a document generates a Journal Entry (JE), the JE receives a
``memo`` / ``narration`` field that describes the posting in human-readable
terms.  Finance operators drilling down from the General Ledger see this
memo before clicking into the JE detail — it is the first context signal
they have.

A well-structured memo looks like:

    "AR Invoice ARI-2026-0042 · Cust PO #ABC123 · early delivery"
    "AP Invoice API-2026-0007 · Vendor Inv #INV-999 · partial receipt"
    "GR GR-2026-0003 · PO #PO-2026-0001"
    "SO SO-2026-0015 · Cust PO #PO-CUST-88 · rush order"

Conventions
-----------
- Maximum length: 200 characters (aligns with SAP B1's ``JrnlMemo`` field).
- Separator: " · " (middle dot with spaces — readable without being a
  structural character that might confuse importers).
- Truncation: if the composed memo exceeds 200 chars, freetext is
  shortened first, then bp_ref, then doc_number.  doc_type is never omitted.
- The ``JournalMemoMixin`` adds the raw free-text field ``journal_memo`` to
  any document model; ``format_journal_memo`` builds the composed string.

Finance service integration
---------------------------
When the purchasing module emits an outbox event for the finance service to
create a JE, it should pass ``format_journal_memo(...)`` as the JE memo.
This is future work for Wave 4 Phase A retrofits; for now the function is
available and tested.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

_SEP = " · "   # " · "  (U+00B7 MIDDLE DOT)
_MAX_MEMO_LEN = 200


class JournalMemoMixin(BaseModel):
    """
    Mixin that adds the free-text journal memo field to a document model.

    The raw ``journal_memo`` string is stored on the document header as
    entered by the user.  It is composed into the final JE memo by
    ``format_journal_memo``.

    Attributes:
        journal_memo: Free-text description, max 200 chars.  Passed through
                      to the resulting Journal Entry for finance drill-down.
    """

    journal_memo: Optional[str] = Field(
        None,
        max_length=200,
        description=(
            "Free text passed through to the resulting Journal Entry so "
            "finance can identify the posting context without opening the "
            "source document."
        ),
    )


def format_journal_memo(
    doc_type: str,
    doc_number: str,
    bp_ref: Optional[str] = None,
    freetext: Optional[str] = None,
) -> str:
    """
    Compose a standardised Journal Entry memo string.

    The resulting string never exceeds 200 characters.  Segments are joined
    with " · " (middle dot) and truncated in order of decreasing importance:
    freetext first, bp_ref second, doc_number last.  The doc_type is always
    preserved.

    Args:
        doc_type:   Short document type label, e.g. "AR Invoice", "GR",
                    "Sales Order".  Should be the human-readable form,
                    not the code (use "AR Invoice" not "ARI").
        doc_number: User-facing document number, e.g. "ARI-2026-0042".
        bp_ref:     Counterparty's reference number (vendor invoice no /
                    customer PO no).  None if not available.
        freetext:   Free-form note from the user (``journal_memo`` field).
                    None if not provided.

    Returns:
        Composed memo string, max 200 characters.

    Examples::

        >>> format_journal_memo("AR Invoice", "ARI-2026-0042", "PO-CUST-88", "early delivery")
        'AR Invoice ARI-2026-0042 · Cust PO #PO-CUST-88 · early delivery'

        >>> format_journal_memo("GR", "GR-2026-0003")
        'GR GR-2026-0003'

        >>> format_journal_memo("AP Invoice", "API-2026-0007", "INV-999")
        'AP Invoice API-2026-0007 · Vendor Inv #INV-999'
    """
    # Reason: determine the bp_ref label prefix based on the document type keyword
    # to distinguish vendor invoices from customer PO numbers contextually.
    is_ap_side = any(
        kw in doc_type.upper()
        for kw in ("AP ", "GR", "PURCH", "PO", "PR", "VENDOR")
    )
    bp_label = "Vendor Inv #" if is_ap_side else "Cust PO #"

    # Build segments — base is always "{doc_type} {doc_number}"
    base = f"{doc_type} {doc_number}"
    bp_segment = f"{bp_label}{bp_ref}" if bp_ref else None
    free_segment = freetext if freetext else None

    # Compose with available segments (truncate to fit _MAX_MEMO_LEN)
    segments = [base]
    if bp_segment:
        segments.append(bp_segment)
    if free_segment:
        segments.append(free_segment)

    memo = _SEP.join(segments)

    if len(memo) <= _MAX_MEMO_LEN:
        return memo

    # Truncation pass: drop/shorten freetext first, then bp_ref
    if free_segment:
        segments_no_free = [base]
        if bp_segment:
            segments_no_free.append(bp_segment)
        candidate = _SEP.join(segments_no_free)
        if len(candidate) <= _MAX_MEMO_LEN:
            return candidate

        # Also try with truncated freetext
        available = _MAX_MEMO_LEN - len(candidate) - len(_SEP)
        if available > 3:
            truncated_free = free_segment[: available - 3] + "..."
            return _SEP.join(segments_no_free + [truncated_free])

    if bp_segment:
        candidate = base
        if len(candidate) <= _MAX_MEMO_LEN:
            return candidate

    # Last resort: truncate base (should never happen with sane doc_type/number)
    return base[:_MAX_MEMO_LEN]
