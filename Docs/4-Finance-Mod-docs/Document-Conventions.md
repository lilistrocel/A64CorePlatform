# A64 Document Conventions

> **Status:** Active — Wave 3 Phase 0 (T-100.1)  
> **Applies to:** All new Wave 3 (Sales) and Wave 4 (Purchasing parity) documents.  
> **Library location:** `src/core/documents/`  
> **Last updated:** 2026-05-29

---

## Overview

Every A64 sales and purchasing document inherits from a shared set of patterns
defined in `src/core/documents/`.  This document is the canonical reference for
those patterns.  Read this before implementing any new document type.

---

## Pattern 1 — Base/Target Document Linking

**Module:** `src/core/documents/document_links.py`  
**Classes:** `DocumentLinkRef`, `DocumentLineLinkMixin`  
**Helper:** `write_back_target_ref()`

### Concept

Every line of every document can optionally trace back to the upstream line it
was drawn from (`base_doc_ref`) and forward to every downstream line that
consumed from it (`target_doc_refs`).  This creates a bidirectional audit chain:

```
Quote → Sales Order → Delivery Note → AR Invoice → Payment
PR    → PO         → Goods Receipt  → AP Invoice → Payment
```

### How a link is established

1. When creating a downstream document, set `base_doc_ref` on each new line
   to point at the upstream source line.
2. Call `write_back_target_ref()` to stamp the back-pointer onto the source line.
   Do this inside the same Motor session/transaction as the document creation.

### Example

```python
from src.core.documents.document_links import DocumentLinkRef, write_back_target_ref

# When creating a Delivery line from an SO line:
await write_back_target_ref(
    db,
    lines_collection="document_lines",
    source_line_id=so_line_id,
    target_ref=DocumentLinkRef(
        doc_type="DELIVERY",
        doc_id=dn_doc_id,
        doc_number="DN-2026-0001",
        line_id=dn_line_id,
    ),
)
```

### MongoDB storage fields

| Field | Type | Description |
|-------|------|-------------|
| `baseDocRef` | object or null | The upstream source (doc_type, doc_id, doc_number, line_id) |
| `targetDocRefs` | array | All downstream back-pointers |

### Multi-target scenario

A single SO line split across two Delivery Notes results in two entries in
`targetDocRefs`.  Both Delivery lines point back to the same SO line via
`baseDocRef`.

---

## Pattern 2 — Open Quantity Tracking

**Module:** `src/core/documents/open_quantity.py`  
**Class:** `LineQuantityState`  
**Helper:** `increment_consumed_qty()`

### Concept

Every line tracks how much of its original committed quantity has been consumed
downstream.  This prevents over-fulfilment and enables partial-closure detection.

```
ordered_qty = 100
consumed_qty = 60      (60 delivered so far)
open_qty = 40          (40 still to deliver)
is_closed = False
```

### MongoDB storage fields

| Field | Type | Description |
|-------|------|-------------|
| `quantity` | float | Original ordered quantity (immutable after creation) |
| `openQuantity` | float | Remaining quantity (= quantity − closedQuantity) |
| `closedQuantity` | float | Cumulative quantity consumed by downstream docs |

These field names match the existing `document_lines` collection used by the
purchasing module.

### Atomic increment

`increment_consumed_qty()` uses MongoDB's `findAndModify` with a filter that
includes `openQuantity >= (delta - tolerance)`.  If the filter fails (another
concurrent writer already consumed the remaining qty), the function raises
`ValueError("open quantity would go negative")`.

### Rounding tolerance

Quantities differing by less than `0.0001` are treated as equal.  A line with
`open_qty = 0.00009` is considered closed.

### Example

```python
from src.core.documents.open_quantity import increment_consumed_qty
from decimal import Decimal

state = await increment_consumed_qty(
    db,
    lines_collection="document_lines",
    source_line_id=po_line_id,
    delta=Decimal("30"),
    session=mongo_session,  # participates in the transaction
)
print(state.open_qty)   # 70 (if ordered was 100)
print(state.is_closed)  # False
```

---

## Pattern 3 — Document Numbers (DocNum)

**Module:** `src/core/documents/doc_number.py`  
**Helper:** `next_doc_number()`  
**Registry:** `DOC_TYPE_PREFIXES`

### Format

```
{PREFIX}-{YYYY}-{NNNN}
```

Examples: `PR-2026-0001`, `SO-2026-0042`, `ARI-2026-0007`

### Doc-type → prefix mapping

| Doc Type | Prefix | Description |
|----------|--------|-------------|
| `PR` | `PR` | Purchase Request |
| `PO` | `PO` | Purchase Order |
| `GR` | `GR` | Goods Receipt (Purchase) |
| `AP_INVOICE` | `API` | AP Invoice |
| `AP_CREDIT` | `APC` | AP Credit Note |
| `QUOTE` | `SQ` | Sales Quotation |
| `SO` | `SO` | Sales Order |
| `DELIVERY` | `DN` | Delivery Note |
| `AR_INVOICE` | `ARI` | AR Invoice |
| `AR_CREDIT` | `ARC` | AR Credit Note |
| `RES` | `RES` | Inventory Reservation |
| `BLA` | `BLA` | Blanket Agreement |
| `RR` | `RR` | Return Request (from customer) |
| `RTN` | `RTN` | Return Note (goods physically returned) |
| `IPAY` | `IPAY` | Incoming Payment (vendor payment out) |
| `OPAY` | `OPAY` | Outgoing Payment (customer payment in) |
| `DPI` | `DPI` | Down Payment Invoice (AP) |
| `JE` | `JE` | Journal Entry (finance microservice) |
| `PAY` | `PAY` | AP Payment (finance microservice) |

### Implementation notes

- Counter key in `document_counters` collection: `{company_code}:{doc_type}:{year}`
- The counter increment participates in the Motor session/transaction; if the
  transaction aborts, the counter rolls back (no sequence gaps from failed inserts).
- This mirrors the existing `_next_doc_number` in
  `src/modules/purchasing/services/document_service.py` and generalises it for all types.

### How to add a new document type

1. Add an entry to `DOC_TYPE_PREFIXES` in `src/core/documents/doc_number.py`.
2. Add transition rules to `LEGAL_TRANSITIONS` in `src/core/documents/document_status.py`.
3. Update this table in `Docs/4-Finance-Mod-docs/Document-Conventions.md`.
4. If the document generates JEs, add to the finance event contract in
   `services/finance/src/finance/contracts/finance_events.py`.

---

## Pattern 4 — Business Partner Reference Number

**Module:** `src/core/documents/bp_ref.py`  
**Mixin:** `BPReferenceMixin`

### Concept

The counterparty's reference number.  Not A64's document number — the other
party's internal reference that they put on their documents.

- **Purchasing:** Vendor invoice number (`"INV-2026-9999"`), vendor PO number.
  (SAP B1 equivalent: `NumAtCard` on AP documents.)
- **Sales:** Customer's purchase order number (`"CUST-PO-8888"`), customer's
  internal reference.
  (SAP B1 equivalent: `NumAtCard` on AR documents.)

### Usage

```python
from src.core.documents.bp_ref import BPReferenceMixin

class APInvoiceCreate(BPReferenceMixin, BaseModel):
    ...  # bp_ref_no is now available
```

### Notes

- Max 100 characters.  No format validation — A64 stores and displays as-is.
- Used in `format_journal_memo()` to include the counterparty ref in the JE memo.

---

## Pattern 5 — Journal Memo

**Module:** `src/core/documents/journal_memo.py`  
**Mixin:** `JournalMemoMixin`  
**Function:** `format_journal_memo()`

### Concept

When a document triggers a Journal Entry, a human-readable memo is passed to
the JE.  Finance operators see this before opening the source document.

### Composed memo format

```
{doc_type} {doc_number} · {bp_label}#{bp_ref} · {freetext}
```

Examples:
- `AR Invoice ARI-2026-0042 · Cust PO #PO-CUST-88 · early delivery`
- `AP Invoice API-2026-0007 · Vendor Inv #INV-999`
- `GR GR-2026-0003`

### Truncation rules (200-char limit)

1. Drop freetext first.
2. Drop bp_ref second.
3. Truncate base (`{doc_type} {doc_number}`) as last resort (almost never needed).

### Usage

```python
from src.core.documents.journal_memo import format_journal_memo

memo = format_journal_memo(
    doc_type="AR Invoice",
    doc_number="ARI-2026-0042",
    bp_ref="PO-CUST-88",
    freetext=invoice.journal_memo,
)
# Pass `memo` to the outbox event payload as the JE narration.
```

---

## Pattern 6 — Document Status Lifecycle

**Module:** `src/core/documents/document_status.py`  
**Enum:** `DocumentStatus`  
**Guard:** `assert_legal_transition()`

### Status values

| Value | Meaning |
|-------|---------|
| `draft` | Being composed; not yet submitted |
| `pending_approval` | Submitted; awaiting internal approval |
| `open` | Active; sent to counterparty / confirmed |
| `partly_closed` | Partially fulfilled downstream |
| `closed` | Fully fulfilled or manually closed |
| `cancelled` | Voided; immutable |

### Lifecycle diagrams

**Purchase Request (PR)**
```
Draft → Pending Approval → Open → Closed
      → Open (if no approval gate)
      → Cancelled (from Draft or Pending Approval)
```

**Purchase Order (PO)**
```
Draft → Pending Approval → Open → Partly Closed → Closed
      → Open (if no approval gate)
      → Cancelled (from Draft, Pending Approval, or Open)
```

**Goods Receipt (GR)**
```
Draft → Open  (post = immutable)
```

**AP Invoice**
```
Draft → Pending Approval → Open (posted) → Closed
                         → Draft (pushed back)
```

**Sales Quotation (QUOTE)**
```
Draft → Open (sent to customer) → Closed (converted to SO)
                                → Cancelled
```

**Sales Order (SO)**
```
Draft → Open → Partly Closed → Closed
             → Cancelled
```

**Delivery Note (DELIVERY)**
```
Draft → Open → Partly Closed → Closed
```

**AR Invoice**
```
Draft → Pending Approval → Open → Partly Closed → Closed
      → Open (if no approval gate)
```

### Usage

```python
from src.core.documents.document_status import DocumentStatus, assert_legal_transition

# Before updating a document's status:
assert_legal_transition("SO", DocumentStatus.OPEN, DocumentStatus.PARTLY_CLOSED)
# Raises ValueError if the transition is illegal.
```

### Compatibility note — Purchasing module

The existing purchasing module (`src/modules/purchasing/`) uses string literals
(`"Draft"`, `"Pending Approval"`, etc.) not this enum.  The retrofit to use
`DocumentStatus` is Wave 4 Phase A work.  Until then, the mapping is:

| Existing string | DocumentStatus equivalent |
|-----------------|--------------------------|
| `"Draft"` | `DocumentStatus.DRAFT` |
| `"Pending Approval"` | `DocumentStatus.PENDING_APPROVAL` |
| `"Open"` / `"Approved"` | `DocumentStatus.OPEN` |
| `"Partially Received"` | `DocumentStatus.PARTLY_CLOSED` |
| `"Received"` / `"Closed"` | `DocumentStatus.CLOSED` |
| `"Cancelled"` | `DocumentStatus.CANCELLED` |

---

## How to Add a New Document Type

1. **Register the prefix** — Add `"MY_DOC": "MD"` to `DOC_TYPE_PREFIXES` in
   `src/core/documents/doc_number.py`.

2. **Register transitions** — Add the transition rules to `LEGAL_TRANSITIONS`
   in `src/core/documents/document_status.py`.

3. **Create the Pydantic models** — Include the relevant mixins:
   - `BPReferenceMixin` if the document has a counterparty reference.
   - `JournalMemoMixin` if the document generates a JE.
   - `DocumentLineLinkMixin` on each line schema.

4. **Call the helpers** from your service layer:
   - `next_doc_number()` during document creation.
   - `assert_legal_transition()` before every status update.
   - `increment_consumed_qty()` when a downstream document consumes this line.
   - `write_back_target_ref()` to stamp the back-pointer on the source line.

5. **Write tests** — Mirror the style in
   `src/core/documents/tests/test_document_infrastructure.py`.

6. **Update this file** — Add the prefix to the mapping table in Pattern 3
   and a lifecycle diagram in Pattern 6.

---

---

## Standard Control Accounts

These accounts are seeded for every organisation by `seed_loader.seed_chart_of_accounts()`
and are present in `services/finance/src/finance/db/seeds/default_coa.py`.
They serve as the default posting targets for the finance JE handlers.
All are `drawer=ASSETS` or `drawer=LIABILITIES` as shown, `isActive=True`,
and — where marked with * — `isControlAccount=True`.

| Account Number | Name | Drawer | Purpose |
|---------------|------|--------|---------|
| `124000` | Trade Receivables | ASSETS | Header group for all receivables accounts |
| `124000-001` * | Trade Receivables - Customers | ASSETS | **Default AR control account.** Debited by every AR Invoice JE.  Referenced by `customer_finance_ext.arControlAccountId` (per-customer override) and `CompanyPostingSetup.arControlAccountId` (company default). |
| `124000-002` | Allowance for Doubtful Debts | ASSETS | Bad-debt provision offset against 124000-001 |
| `124000-003` | Credit Notes Receivable | ASSETS | AR Credit Notes before netting |
| `221000-001` * | Trade Payables - Suppliers | LIABILITIES | **Default AP control account.** Credited by every AP Invoice JE. Referenced by `vendor.reconciliationAccountId` and `CompanyPostingSetup.apControlAccountId`. |
| `223000-004` | Goods Received Not Invoiced | LIABILITIES | **GR/IR clearing account.** Debited on AP Invoice post to clear the GRNI liability raised at Goods Receipt. Referenced by `CompanyPostingSetup.grIrClearingAccountId`. |
| `126000-002` | Cash at Bank - AED Operating | ASSETS | **Default cash/bank account.** Referenced by `CompanyPostingSetup.bankAccountId` for AP payment JEs. |
| `617000-011` | Rounding Differences | OPERATING_COST | Absorbs sub-cent rounding deltas to keep JEs balanced. Referenced by `CompanyPostingSetup.roundingAccountId`. |
| `122000-001` | Input VAT Recoverable | ASSETS | Debited for all standard-rated purchase VAT lines. |
| `222000-001` | Output VAT Payable | LIABILITIES | Credited for all standard-rated sales VAT lines. |
| `222000-002` | Reverse Charge VAT Output | LIABILITIES | Output leg of UAE reverse-charge (SR tax code). |
| `312000-001` | Retained Earnings - Prior Years | EQUITY | Period-close closing JE target for rolled-forward P/(L). Referenced by `CompanyPostingSetup.retainedEarningsAccountId`. |

### How to resolve the AR control account at posting time

The AR Invoice JE handler must resolve the DR account in this priority order:

1. `customer_finance_ext.arControlAccountId` (per-customer override — nullable).
2. `CompanyPostingSetup.arControlAccountId` (company-level default — nullable).
3. Look up `124000-001` by `accountNumber` for the organisation (always present after seed).

Step 3 is the guaranteed fallback.  Any code that posts AR JEs **must** implement
all three steps in order so that organisations without explicit posting setup still
post to the correct GL.

---

## `_handle_sales_invoice_posted` behaviour (T-100.9b)

Implemented in `services/finance/src/finance/api/v1/events.py`.

### Journal Entry structure

| Line | Account | Direction | Amount | Source |
|------|---------|-----------|--------|--------|
| 1 | AR Control (3-tier resolution) | DR | `totals.gross` | Resolved per chain above |
| 2..N | Revenue (one per invoice line) | CR | `line.lineNet` | `line.revenueAccountId` (snapshotted) |
| last | Output VAT (combined, one per invoice) | CR | `totals.tax` | `setup.outputVatAccountId` |

**Output VAT line:** A single combined CR line is posted for the entire invoice regardless of how many lines carry tax.  The description embeds the `taxDate` (UAE VAT tax-point date) for FTA audit traceability.  This line is **skipped entirely** when `totals.tax == 0` (zero-rated or exempt invoices).  Multi-rate Output VAT grouping per tax-code is a known limitation (tracked as T-100.9.2).

**Revenue lines:** One CR line per invoice line, tagged with `line.costCenterId` for cost-centre reporting.  `referenceLineId` carries the invoice line number for sub-ledger linkage.

**AR sub-ledger linkage:** The DR AR line stores `customerId` in `referenceLineId` (free-form, no FK) until a dedicated AR sub-ledger table ships.

### Validation order

1. Resolve posting setup — 400 if missing.
2. `setup.outputVatAccountId` must be configured when `totals.tax > 0`.
3. Resolve AR control account (3-tier chain above) — validate active, non-header, ASSETS/asset.
4. For every revenue line: validate `revenueAccountId` is active, non-header, REVENUE/revenue.
5. Resolve fiscal period for `docDate`.
6. Assert DR == CR within 0.01 tolerance (rounding guard).

### Cancellation (`_handle_sales_invoice_cancelled`)

Finds the original `sales_invoice_posted` JE by `sourceEventId == payload.originalEventId` and posts a reversing entry (DR↔CR swap).  The original JE remains `posted` — both JEs live on the books and net to zero.  Reversal is dated **today** (no backdating).

Idempotency: if a reversal JE already exists with `sourceEventType = 'sales_invoice_cancelled'` and `sourceDocNumber = original.jeNumber`, the handler returns silently without a second reversal.

### Known limitations (follow-up tasks)

- **T-100.9.1** — Down payment netting: `totals.downPaymentApplied` is expected to be 0 in v1.  Netting against a DP liability account is deferred.
- **T-100.9.2** — Multi-rate Output VAT: currently one combined CR line per invoice.  For multi-rate UAE VAT scenarios (future: 0%, 5%, exempt on same invoice), group by tax-code to emit a separate line per rate.

---

## `_handle_customer_payment_received` behaviour (T-100.10.1)

Implemented in `services/finance/src/finance/api/v1/events.py`.

### Journal Entry structure

| Line | Account | Direction | Amount | Source |
|------|---------|-----------|--------|--------|
| 1 | Bank / Cash account | DR | `amountReceived` | `payload.bankAccountId` (validated) |
| 2 | AR Control (3-tier resolution) | CR | `amountReceived` | Resolved per chain above |

Single 2-line JE per Receipt regardless of allocation count.  Allocation detail lives in the operations sub-ledger; the finance ledger records only the net cash movement.

Bank account validation: `_validate_bank_account_or_raise` enforces `ASSETS/asset/active/non-header` for any account used as the DR side of an incoming payment or CR side of an outgoing payment.

### Validation order

1. Validate `bankAccountId` — must be active, non-header, `drawer=ASSETS`, `accountType=asset`.
2. Resolve posting setup — 400 if missing.
3. Resolve AR control account (3-tier chain) — validate active, non-header, ASSETS/asset.
4. Resolve fiscal period for `docDate`.

### Cancellation (`_handle_customer_payment_cancelled`)

Finds the original `customer_payment_received` JE by `sourceEventId == payload.originalEventId` and posts a reversing entry (DR↔CR swap).  The original JE remains `posted`.  Reversal is dated **today** (no backdating).

Idempotency: if a reversal JE already exists with `sourceEventType = 'customer_payment_cancelled'` and `sourceDocNumber = original.jeNumber`, the handler returns silently without a second reversal.

---

*This document is part of the T-100 Wave 3 Sales Redesign initiative.*  
*Maintained by the A64 backend team.  Questions: contact Viet Anh.*
