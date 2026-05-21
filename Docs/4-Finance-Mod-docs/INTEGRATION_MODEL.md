# Finance ↔ Operation Integration Model

> **Status:** Draft design decision. Not yet implemented.
> **Date:** 2026-05-20.
> **Author:** Viet Anh.
> **Supersedes:** Section 2 "Architecture at a glance" of `FINANCE_MODULE_GUIDE.md` once approved.

This document is the design decision for how the Finance service and the Operation (main) service exchange documents and stay consistent. It defines what happens before approval, at approval, and after a finance event has been posted. It is a deliberate departure from the eager-mirror pattern that Phase 1B currently emits.

---

## 1. Problem

Operation owns the user-facing workflow documents: Purchase Request, Purchase Order, Goods Receipt, AP Invoice header, etc. Finance owns the books: Journal Entries, AP/AR sub-ledgers, payments, reports.

The integration question is **when, and in what form, finance learns about an operational document.** Three concrete failure modes drive this design:

1. **Edit drift.** Operation edits a doc after finance has already mirrored it.
2. **Delete drift.** Operation deletes a doc that finance has already referenced.
3. **Replay drift.** Operation re-opens a doc that finance has already posted against.

All three can corrupt the audit trail if not handled deliberately.

---

## 2. Options considered

### Option A — Eager mirror (current Phase 1B implementation)

Every operational state change emits an outbox event. The finance consumer materializes a finance-side copy on every event.

| Pros | Cons |
|---|---|
| Finance is fully self-sufficient, no read-through coupling | Mirrors created for docs that may be cancelled, wasted writes |
| Easy to reason about: "finance has its own copy" | Edit drift: mirror goes stale between events |
| Works offline (finance keeps going if Mongo is down) | Delete drift: orphaned mirrors |
| | Storage cost for drafts that never matter |

### Option B — Lazy reference only

Finance does not store anything until a finance-relevant event happens (typically approval). Pre-approval, finance UI reads operational docs by reference through Mongo at render time.

| Pros | Cons |
|---|---|
| Zero drift pre-approval (single source of truth) | Cross-store read coupling: finance UI breaks if Mongo down |
| No wasted writes for cancelled drafts | Latency: every list row requires a Mongo lookup |
| Clean separation: finance writes only what it owns | Does not address post-approval drift at all |
| | Violates module independence (finance now depends on Mongo at runtime) |

### Option C — Hybrid (proposed)

Lazy reference before approval; snapshot + materialize at approval; operational immutability after.

This is the decision. See section 3.

---

## 3. Decision: Hybrid

### 3.1 Lifecycle behavior

| Operational state | Finance behavior | What lives where |
|---|---|---|
| **Draft** | Finance ignores. No outbox event emitted. | Mongo only. |
| **Pending Approval** | Finance shows a thin "Incoming" preview by reading the operational doc through a `/finance/incoming/{docId}` endpoint that proxies to the main app. No materialization. | Mongo only. |
| **Approved** | Outbox event fires *once*. Finance consumer reads the doc, **snapshots all finance-relevant fields into its own MySQL store**, and creates the corresponding finance document (e.g., GR → JE; AP Invoice → JE + AP sub-ledger row). | Mongo + MySQL snapshot + MySQL finance doc. |
| **Sent / Closed / Received** | Operational state machine continues. Finance ignores unless a *new* finance event is implied (e.g., GR triggers inventory valuation JE). | Same. |
| **Cancelled before approval** | Finance never knew. No-op. | Mongo only. |
| **Cancelled after approval** | Not allowed via cancel. Must use Reverse-and-Replace (§ 4). | — |

### 3.2 The snapshot

The snapshot is the contract. At approval time, the consumer copies into MySQL:

- All header fields finance cares about (vendor, currency, totals, dates, terms, company code, tax code, project/cost-center references).
- All line fields finance cares about (item code, quantity, unit price, line net, tax, gross, account assignment).
- A frozen `operationDocVersion` (incremented on every operational edit).
- The `operationDocId` and `operationDocNumber` for cross-reference.

After snapshot, **finance never reads the operational doc again at runtime.** The snapshot is the audit-truth from finance's perspective. Reports, aging, postings — all run off MySQL alone.

### 3.3 Why this combination works

- **Before approval**: nothing to drift from — finance holds no copy.
- **At approval**: a deliberate, atomic moment where both sides agree on the truth and finance freezes it.
- **After approval**: operation cannot mutate the doc, so the snapshot can never go stale (§ 5).

---

## 4. Reverse-and-Replace pattern

The accounting-standard replacement for "let me edit this approved PO":

1. User opens the approved doc and clicks **Amend** (no Edit button).
2. System creates an **Amendment document** (PO-AMD or credit memo), pre-filled from the original.
3. User changes the fields that need correcting.
4. Amendment goes through its own approval flow.
5. On amendment approval, finance posts:
   - A reversal JE undoing the original posting.
   - A new JE for the amended values.
6. Both JEs reference each other; the audit trail shows the full history.

The original doc is **never modified**. It remains as the "first version of truth" forever. The amendment is the "second version."

This is how SAP B1, NetSuite, Oracle Fusion, and every other ERP designed for audit handles this. It's not negotiable for compliant accounting.

---

## 5. Immutability rules (operation side)

These rules live in the operational state machine and are enforced by the document service.

| State | Edit allowed? | Hard delete allowed? | Soft cancel allowed? |
|---|---|---|---|
| Draft | Yes | super_admin only, with audit | Yes (no audit trail consequences) |
| Pending Approval | No (must withdraw to Draft first) | No | Withdraw → back to Draft |
| Approved | **No** | **No** | **No** (must use Amend) |
| Sent / Closed / Received | **No** | **No** | **No** (must use Amend) |
| Cancelled (terminal) | No | No | Already cancelled |

**Hard-delete on Draft** is allowed only because finance has not been told about the doc yet. The moment a finance event fires, the doc is locked.

**Soft-cancel on Pending Approval** is allowed because finance has not posted anything against it.

**Withdraw to Draft** is allowed during Pending Approval. This is a state transition, not an edit — the doc keeps its number and history.

---

## 6. Code deltas required

### 6.4 Transactional outbox (Phase 2 — implemented 2026-05-20)

The consistency hole described in §9 is now closed.

**What changed:**

`OutboxWriter.publish` gained an optional `session: Optional[AsyncIOMotorClientSession]`
parameter.  When provided, the `finance_outbox` insert runs inside the caller's active
Motor transaction.  Default `None` keeps the existing behaviour (no session, no
transaction).

`DocumentService` gained a `_txn()` async context manager that opens a Motor session and
starts a multi-document transaction.  Every state-mutating method now wraps its writes
in `_txn()`:

```
async with self._txn() as session:
    await self._headers.update_one({...}, {...}, session=session)   # header update
    updated = await self._headers.find_one({...}, session=session)  # consistent read
    await self._emit_pr_event(updated, prev, code, session=session) # outbox insert
    # exit without exception → Motor commits both writes atomically
    # exit with exception    → Motor aborts both writes atomically
```

`_emit_pr_event` and `_emit_po_event` accept the session and forward it to
`OutboxWriter.publish`.  The `try/except` swallow that previously hid outbox failures
has been removed.  If the outbox write raises, the exception propagates and the
surrounding `_txn()` aborts, rolling back the header update.

Sequence-counter increments (`document_counters`) also run inside `_txn()` so the same
docNumber cannot be issued twice if a transaction aborts.

**Approval-engine calls stay outside the transaction** (resolved before `_txn()` is
entered) — see the module docstring in `document_service.py` for the full rationale.

The Phase 1 cron sweeper (`cron/scripts/outbox_reconciler.py`) remains the safety net
for any events that might be missed by external causes (crash between commit and observer),
but the primary path — "outbox write fails after header commits" — is now impossible.

Methods covered: `create_pr`, `submit_pr`, `approve_pr`, `reject_pr`, `cancel_pr`,
`create_po`, `update_pr` (lines replace), `create_po_from_pr` (PR close + PO create in
one transaction), `submit_po`, `approve_po`, `reject_po`, `cancel_po`, `send_po`,
`update_po` (lines replace).

### 6.1 Operation side (`src/modules/purchasing/`)

| Change | Where | Effort |
|---|---|---|
| Stop emitting outbox events on Draft → Pending Approval transitions | `services/document_service.py::submit_pr`, `submit_po` | Small |
| Emit outbox event only on `Approved` (and downstream finance events like GR) | Same | Small |
| Block edit on any non-Draft state | `services/document_service.py::update_*` — already partially enforced; audit and tighten | Small |
| Block delete on any non-Draft state | `services/document_service.py::delete_*` | Small |
| Add `Amend` action: creates new doc with `baseDocId = original.docId`, sets `amendmentReason` | New methods | Medium |
| Add `operationDocVersion` counter, increment on amendment chain | New field on header | Small |
| Add read-through endpoint for finance preview: `GET /api/v1/purchasing/finance-preview/{docId}` (service-to-service auth) | New endpoint | Small |

### 6.2 Finance side

| Change | Where | Effort |
|---|---|---|
| Add "Incoming" UI: list of Pending Approval docs via read-through proxy | New finance page | Medium |
| Consumer materializes snapshot at approval event only | `finance_consumer/handlers/*` | Medium |
| Drop any logic that mutates finance-side mirror on non-approval events | `finance_consumer/` | Small |
| Add Amendment handler: posts reversal + new JE | New handler | Medium |
| Add snapshot table per doc type: `ap_invoice_snapshots`, `po_snapshots`, etc. | New MySQL tables | Medium |

### 6.3 Outbox

The outbox itself stays. Eventing semantics change: fewer event types, each one represents a real finance-relevant transition rather than every state flip.

---

## 7. Failure modes and mitigations

| Failure | Mitigation |
|---|---|
| Operation tries to edit approved doc via direct DB write (bypassing API) | Mongo-level validation rule rejecting field changes on `status ∈ {Approved, Sent, Closed}`. Audit log on any super_admin override. |
| Finance is down when approval happens | Outbox event queued. Consumer retries with backoff. Operational doc still moves to Approved. User sees "finance posting pending" banner. |
| Finance posts twice (consumer retries after success) | Idempotency: `outbox_events_processed` table in MySQL keyed by event id. Already designed. |
| Snapshot fields drift from operational schema | Snapshot schema is versioned. Consumer validates payload against expected version; rejects unknown shapes to alert. |
| User insists on editing an approved doc | UX presents Amend flow. No "edit" path exists in the API for Approved+ states. |
| Operation hard-deletes a Draft that was briefly visible in finance preview | Acceptable — finance had no commitment. UI handles 404 gracefully. |
| **[CLOSED — Phase 2]** Header update committed but outbox write failed | ~~Silent drop~~ → **No longer possible.** Both writes share a Motor session transaction. If the outbox insert fails the transaction aborts, the header update rolls back, and the caller receives the exception. The cron sweeper (`outbox_reconciler.py`) remains as safety net for crash-between-commit scenarios. |

---

## 8. Open questions

1. **GR (Goods Receipt) lifecycle**: does GR itself need an Amend flow, or are receipt corrections always done via a reversal GR? *Recommendation:* reversal GR for partial corrections, Amend for header-level mistakes. To decide before GR phase.
2. **Multi-step approval**: when a doc has multiple approval steps (officer → manager → CFO), does the outbox emit only on final approval? *Yes.* Intermediate steps are operational, not finance-relevant.
3. **What counts as "finance-relevant" beyond approval?**: GR, AP Invoice receipt, payment recording, write-off. Each will be a separate event type. List to be finalized in Phase 2 design.
4. **Read-through endpoint auth**: service-to-service JWT, or shared secret + signed payload? *Lean toward service JWT* for consistency with the rest of the platform.
5. **Operational doc soft-delete vs cancel on Draft**: do we need both? *Probably not.* One terminal "Voided" state with audit is enough.

---

## 9. What this does NOT solve

Be honest about scope:

- This does not eliminate all drift — a malicious or buggy direct DB write on the operation side can still desync. The mitigation is access control and audit, not architecture.
- ~~This does not handle distributed-transaction failures where the operational doc is approved but the outbox write fails.~~ **Done — Phase 2 implemented (2026-05-20).** The operational write and the outbox row are now written in a single Motor multi-document transaction via `DocumentService._txn()`. If the outbox write fails the transaction aborts and the header update rolls back atomically. See §6.4 for full implementation details.
- This does not address what happens when finance is permanently uninstalled after it had been live. There needs to be a tear-down flow that either (a) freezes finance data in archive, or (b) is simply not supported. *Recommendation:* not supported initially; document it.

---

## 10. Decision summary

> Operation is the system of record for workflow documents. Finance is the system of record for accounting documents. They communicate via a deliberately minimal contract: an outbox event fires at the moment a doc crosses the operational-to-financial threshold (approval, receipt, payment), the finance consumer snapshots and materializes once, and from that point operation cannot mutate the underlying doc. Corrections happen through Amendment + reversal JE, not in-place edit.

This trades the convenience of "edit your PO" for audit integrity. That trade is the same one every audit-grade ERP makes.

---

## Appendix A — Diagram

```
┌───────────────── OPERATION (Mongo) ──────────────────┐
│                                                       │
│  Draft ──submit──▶ Pending Approval ──approve──┐     │
│   ▲                       │                    │     │
│   │                       │ withdraw           │     │
│   └───────────────────────┘                    │     │
│                                                ▼     │
│                                          ┌─────────┐ │
│                                          │ Approved│ │ ◀── IMMUTABLE
│                                          └────┬────┘ │
│                                               │      │
│   (Amendment path)                            │      │
│   New doc ◀── Amend ──── Approved/Sent ◀──────┘      │
│                                               │      │
│                                  outbox event │      │
└───────────────────────────────────────────────┼──────┘
                                                │
                                                ▼
┌───────────────── FINANCE (MySQL) ────────────────────┐
│                                                       │
│  Incoming preview (read-through, no storage)          │
│         ▲                                             │
│         │                                             │
│  ┌──────┴──────┐    consumer picks up event           │
│  │   GET op    │           │                          │
│  │ /finance-   │           ▼                          │
│  │  preview    │    snapshot → MySQL                  │
│  └─────────────┘           │                          │
│                            ▼                          │
│                     create finance doc                │
│                     (JE / AP Invoice / etc.)          │
│                            │                          │
│                            ▼                          │
│                    FROZEN — never re-reads op         │
│                                                       │
└───────────────────────────────────────────────────────┘
```
