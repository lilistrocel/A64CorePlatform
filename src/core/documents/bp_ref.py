"""
A64 Core Platform — Business Partner Reference Number Mixin

``bp_ref_no`` is the counterparty's reference number:

- For PURCHASING documents: the vendor's invoice number, quotation reference,
  or purchase order number as printed on their paperwork.
  (In SAP B1: ``NumAtCard`` field on AP documents.)

- For SALES documents: the customer's purchase order number, their internal
  reference, or any customer-supplied document number they want to correlate
  with.
  (In SAP B1: ``NumAtCard`` field on AR documents.)

This mixin adds the field to any Pydantic model that participates in the
document chain.  No validation is applied beyond a length cap — A64 stores
and displays the value as-is; format rules are the counterparty's concern.

Finance integration
-------------------
When the document generates a Journal Entry, ``bp_ref_no`` is included in the
JE memo line as the "Counterparty ref" segment (handled by ``format_journal_memo``
in ``journal_memo.py``).  The finance module indexes JEs by ``sourceDocNumber``
but finance operators use ``bp_ref_no`` for reconciliation matching.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class BPReferenceMixin(BaseModel):
    """
    Mixin that adds the counterparty's reference number to a document model.

    Include this mixin in your document header schema (both Create and
    Response variants) to carry the vendor invoice number or customer PO
    number through the document chain.

    Attributes:
        bp_ref_no: Counterparty's reference number.  Free-text, max 100 chars.
                   None when the counterparty has not provided a reference.
    """

    bp_ref_no: Optional[str] = Field(
        None,
        max_length=100,
        description=(
            "Counterparty's reference number — vendor invoice number for "
            "purchasing documents, customer PO number for sales documents. "
            "Stored as-is; no format validation is applied by A64."
        ),
    )
