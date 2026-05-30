"""
A64 Core Platform — Shared Document Infrastructure (Wave 3 Phase 0)

This package provides the foundational helpers that every sales and purchasing
document type will inherit from.  It is a pure library — no API endpoints, no
schema migrations, no dependency on any specific document module.

Modules
-------
document_links     — Base/target document linking (DocumentLinkRef, DocumentLineLinkMixin, write_back_target_ref)
open_quantity      — Open-quantity tracking and atomic increment (LineQuantityState, increment_consumed_qty)
doc_number         — Sequential document-number generator (next_doc_number)
bp_ref             — Business-partner reference-number mixin (BPReferenceMixin)
journal_memo       — Journal-memo mixin + formatter (JournalMemoMixin, format_journal_memo)
document_status    — Shared DocumentStatus enum + legal-transition guard (assert_legal_transition)
"""
