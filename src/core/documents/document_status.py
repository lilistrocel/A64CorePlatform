"""
A64 Core Platform — Document Status Enum + Transition Guard

Defines the shared ``DocumentStatus`` enum and the per-doc-type legal
transition table.  Both sales and purchasing documents share this status
vocabulary, though individual doc types only use a subset of states.

Status lifecycle (typical flow)
--------------------------------

    Draft  →  Open  →  PartlyClosed  →  Closed
                  ↘  Cancelled

Not all doc types use all states.  For example:
  - PR: Draft → Pending Approval → Approved | Rejected | Cancelled; no PartlyClosed.
  - GR: Draft → Open (posted); no PartlyClosed or Pending Approval.
  - DELIVERY: Open → PartlyClosed → Closed (when partially shipped then fully shipped).

The LEGAL_TRANSITIONS dict is the single source of truth for all allowed
transitions.  ``assert_legal_transition`` raises ``ValueError`` if a proposed
transition is not in the table — this prevents state-machine violations from
reaching the database.

Existing purchasing module compatibility
-----------------------------------------
The purchasing module's document_service.py uses its own ``_PR_TRANSITIONS``
and ``_PO_TRANSITIONS`` dicts (which use string literals like "Draft",
"Approved", etc. rather than this enum).  That code is NOT changed in this
task — the retrofit happens in Wave 4 Phase A.

For the new Wave 3 sales documents (Quote → SO → Delivery → AR Invoice),
``DocumentStatus`` and ``assert_legal_transition`` WILL be used from the start.

Note on "Pending Approval"
---------------------------
The purchasing module uses "Pending Approval" as a status value (mixed case,
with space).  The new shared enum uses ``PENDING_APPROVAL`` to be
Python-idiomatic.  When Wave 4 retrofits purchasing, the stored strings will
need to be mapped.  This is documented in
``Docs/4-Finance-Mod-docs/Document-Conventions.md``.
"""

from __future__ import annotations

from enum import Enum
from typing import Dict, FrozenSet


class DocumentStatus(str, Enum):
    """
    Shared document status vocabulary across all A64 document types.

    Values are stored as lowercase strings in MongoDB so that they are
    portable (no case sensitivity issues) and consistent across the platform.

    Attributes:
        DRAFT:           Document is being composed.  Not yet visible to
                         counterparties.  May be freely edited or deleted.
        PENDING_APPROVAL: Submitted for internal approval; awaiting a decision.
        OPEN:            Active document.  For purchasing: PO is sent to vendor.
                         For sales: SO confirmed by customer.
        PARTLY_CLOSED:   Some (but not all) quantity has been fulfilled
                         downstream.  E.g. a 100-unit SO with 60 units
                         delivered is PARTLY_CLOSED.
        CLOSED:          Fully fulfilled or manually closed.  No further
                         downstream documents can be created from it.
        CANCELLED:       Voided before it was fully processed.  Immutable.
    """

    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    OPEN = "open"
    PARTLY_CLOSED = "partly_closed"
    CLOSED = "closed"
    CANCELLED = "cancelled"


# Shorthand aliases used in the transition table below for readability.
_D = DocumentStatus.DRAFT
_PA = DocumentStatus.PENDING_APPROVAL
_O = DocumentStatus.OPEN
_PC = DocumentStatus.PARTLY_CLOSED
_CL = DocumentStatus.CLOSED
_CA = DocumentStatus.CANCELLED


# ---------------------------------------------------------------------------
# Legal transition table
#
# Format: { doc_type: { from_status: frozenset({allowed_to_status, ...}) } }
#
# A missing doc_type key means no transitions are defined (effectively all
# transitions are illegal until explicitly registered).
# ---------------------------------------------------------------------------

LEGAL_TRANSITIONS: Dict[str, Dict[DocumentStatus, FrozenSet[DocumentStatus]]] = {
    # -----------------------------------------------------------------------
    # Purchasing documents
    # -----------------------------------------------------------------------
    "PR": {
        _D:  frozenset({_PA, _O, _CA}),         # submit (→PA or →O if no approval gate) or cancel
        _PA: frozenset({_O, _CA}),               # approve (→O) or cancel
        _O:  frozenset({_CL, _CA}),              # close (PR→PO created) or cancel
        _CL: frozenset(),
        _CA: frozenset(),
    },
    "PO": {
        _D:  frozenset({_PA, _O, _CA}),          # submit
        _PA: frozenset({_O, _CA}),               # approve
        _O:  frozenset({_PC, _CL, _CA}),         # partial GR or full GR or cancel
        _PC: frozenset({_CL}),                   # final GR closes PO
        _CL: frozenset(),
        _CA: frozenset(),
    },
    "GR": {
        _D: frozenset({_O}),                     # post (Draft → Open means "Posted")
        _O: frozenset(),                         # terminal once posted
    },
    "AP_INVOICE": {
        _D:  frozenset({_PA}),                   # submit for approval
        _PA: frozenset({_O, _D}),                # approve (→Open=posted) or push back to Draft
        _O:  frozenset({_CL}),                   # payment closes the AP
        _CL: frozenset(),
        _CA: frozenset(),
    },
    "AP_CREDIT": {
        _D:  frozenset({_PA}),
        _PA: frozenset({_O, _D}),
        _O:  frozenset({_CL}),
        _CL: frozenset(),
    },
    # -----------------------------------------------------------------------
    # AP Down Payment Invoice (AP_DPI) — T-200.24 / Wave 4
    #
    # A DPI is a vendor-driven prepayment record.  The accountant creates it
    # when a vendor demands a deposit before delivering goods/services.  It is
    # a STANDALONE document (not chained from a PR/PO).
    #
    # Lifecycle:
    #   DRAFT    — being composed; freely editable; no financial impact.
    #   PENDING_APPROVAL → vendor deposit demand is submitted for approval.
    #   OPEN     — approved and "posted": the prepayment is recorded.
    #              Books a prepaid-asset / cash-out JE via outbox.
    #              The DPI may be partially consumed (PARTLY_CLOSED) as AP
    #              Invoices allocated against it are approved.
    #   PARTLY_CLOSED — some (but not all) of the DPI's gross has been
    #              consumed by AP Invoice allocations.
    #   CLOSED   — fully consumed (consumedAmount == totalGross ± tolerance)
    #              or manually closed.  Terminal; no further allocations.
    #   CANCELLED — voided before posting.  Terminal.
    #
    # Auto-transitions (triggered by AP Invoice approval / delete / cancel):
    #   OPEN         → PARTLY_CLOSED  when consumedAmount > 0 but < totalGross
    #   OPEN/PARTLY_CLOSED → CLOSED   when consumedAmount >= totalGross
    #   CLOSED       → PARTLY_CLOSED  when an AP Invoice consuming the DPI
    #                                  is deleted / cancelled (partial release)
    #   PARTLY_CLOSED → OPEN          when consumedAmount drops back to zero
    # -----------------------------------------------------------------------
    "AP_DPI": {
        _D:  frozenset({_PA, _CA}),          # submit for approval or cancel draft
        _PA: frozenset({_O, _D, _CA}),       # approve / reject (→ D) / cancel
        _O:  frozenset({_PC, _CL, _CA}),     # partial AP netting / full consumption / cancel
        _PC: frozenset({_CL, _CA}),          # full consumption from partial / cancel
        _CL: frozenset(),
        _CA: frozenset(),
    },
    # -----------------------------------------------------------------------
    # Sales documents
    # -----------------------------------------------------------------------
    "QUOTE": {
        _D:  frozenset({_O, _CL, _CA}),          # send to customer (→O), expire (→CL), cancel
        _O:  frozenset({_CL, _CA}),              # customer accepts (→CL=converted to SO), or cancel
        _CL: frozenset(),
        _CA: frozenset(),
    },
    "SO": {
        _D:  frozenset({_O, _CA}),               # confirm order
        _O:  frozenset({_PC, _CL, _CA}),         # partial delivery or full delivery or cancel
        _PC: frozenset({_CL, _CA}),              # final delivery or cancel
        _CL: frozenset(),
        _CA: frozenset(),
    },
    "DELIVERY": {
        _D:  frozenset({_O, _CA}),               # post / ship, or cancel draft
        _O:  frozenset({_PC, _CL, _CA}),         # partial return, terminal close, or cancel (T-100.8)
        _PC: frozenset({_CL, _CA}),              # final close or cancel
        _CL: frozenset(),
        _CA: frozenset(),
    },
    "AR_INVOICE": {
        _D:  frozenset({_PA, _O}),               # submit or auto-post
        _PA: frozenset({_O, _D}),
        _O:  frozenset({_PC, _CL}),              # partial payment or full payment
        _PC: frozenset({_CL}),
        _CL: frozenset(),
        _CA: frozenset(),
    },
    "AR_CREDIT": {
        _D:  frozenset({_O}),
        _O:  frozenset({_CL}),
        _CL: frozenset(),
    },
    # -----------------------------------------------------------------------
    # T-100.11 — Returns flow
    # -----------------------------------------------------------------------
    "RR": {
        _D:  frozenset({_O, _CA}),              # submit (→O) or cancel
        _O:  frozenset({_CL, _CA}),             # fully consumed (→CL) or cancel
        _CL: frozenset(),
        _CA: frozenset(),
    },
    "RTN": {
        _D:  frozenset({_O, _CA}),              # post return (→O) or cancel draft
        _O:  frozenset({_CL, _CA}),             # fully credited (→CL) or cancel
        _CL: frozenset(),
        _CA: frozenset(),
    },
    "ARC": {
        _D:  frozenset({_O, _CA}),              # post credit note (→O) or cancel draft
        _O:  frozenset({_CL, _CA}),             # terminal close or cancel (super_admin)
        _CL: frozenset(),
        _CA: frozenset(),
    },
    # -----------------------------------------------------------------------
    # Payments
    # -----------------------------------------------------------------------
    "IPAY": {
        _D:  frozenset({_O, _CA}),
        _O:  frozenset({_CL}),
        _CL: frozenset(),
        _CA: frozenset(),
    },
    "OPAY": {
        _D:  frozenset({_O, _CA}),
        _O:  frozenset({_CL}),
        _CL: frozenset(),
        _CA: frozenset(),
    },
}


def assert_legal_transition(
    doc_type: str,
    from_status: DocumentStatus,
    to_status: DocumentStatus,
) -> None:
    """
    Raise ValueError if the transition is not allowed for this document type.

    This is the sole gatekeeper for status machine enforcement in the new
    sales-document stack.  Call it before writing any status update to MongoDB.

    Args:
        doc_type:    Document type key, e.g. "SO", "QUOTE", "AR_INVOICE".
        from_status: Current status of the document.
        to_status:   Proposed new status.

    Raises:
        ValueError: If the transition is illegal or if doc_type is unknown.

    Example::

        assert_legal_transition("SO", DocumentStatus.OPEN, DocumentStatus.PARTLY_CLOSED)
        # Raises if SO-OPEN → SO-PARTLY_CLOSED is not in the table.
    """
    type_table = LEGAL_TRANSITIONS.get(doc_type)
    if type_table is None:
        raise ValueError(
            f"Unknown doc_type '{doc_type}'. "
            f"Register its transitions in LEGAL_TRANSITIONS in "
            f"src/core/documents/document_status.py."
        )

    allowed: FrozenSet[DocumentStatus] = type_table.get(from_status, frozenset())
    if to_status not in allowed:
        allowed_display = (
            ", ".join(s.value for s in sorted(allowed, key=lambda x: x.value))
            if allowed
            else "none (terminal state)"
        )
        raise ValueError(
            f"Illegal {doc_type} transition: {from_status.value} → {to_status.value}. "
            f"Allowed from '{from_status.value}': [{allowed_display}]"
        )


def get_allowed_transitions(
    doc_type: str,
    from_status: DocumentStatus,
) -> FrozenSet[DocumentStatus]:
    """
    Return the set of legal target statuses for a given doc_type and from_status.

    Returns an empty frozenset for terminal states or unknown transitions.

    Args:
        doc_type:    Document type key.
        from_status: Current status.

    Returns:
        FrozenSet of allowed target statuses.
    """
    type_table = LEGAL_TRANSITIONS.get(doc_type, {})
    return type_table.get(from_status, frozenset())
