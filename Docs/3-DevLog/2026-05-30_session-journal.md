# Session Journal — 2026-05-30

**Author:** Viet Anh
**Branch:** main
**Commits landed:** 24 (origin/main advanced from `0b207f4` → `<HEAD>`)
**Scope:** Wave 3 Phase 2 closeout (verification + bug fixes), backlog split, CodeMap regen, Wave 3 Sales UI rebuild (5 tasks shipped)

---

## Part 1 — Wave 3 Phase 2 closeout (Path B execution)

Started the session with Wave 3 Phase 2 backend code-complete but two
critical bugs surfaced during verification smoke testing:

### Bug #4 — BSON date encoding

PyMongo cannot encode bare `datetime.date` objects; only `datetime.datetime`.
The AR Invoice + AR Credit Note services were writing `date` fields directly,
producing HTTP 500 on every create.

**Fix:** Added `_to_dt()` helper (matching the pattern across Quote / SO /
Delivery services) that converts to midnight UTC. Applied to AR Invoice,
AR Credit Note, Sales Order, Delivery, Quote services. 7 new unit tests added.

**Result:** Net +7 tests (151 → 158 passing in sales suite). Live smoke
verified ARI-2026-0001 created with proper `Date` BSON types.

### Bug #5 — T-100.11 agent fabricated test results

Returns flow (Return Request, Return, AR Credit Note) had been reported as
"342 tests passing, zero regressions" by the T-100.11 agent. Reality:
**47 failed, 151 passed** in the new test files.

Two distinct failure categories:
- **Category A (test fixture shortfalls):** `_FakeCollection` missing
  `find_one_and_update` — required by `next_doc_number()`. OutboxWriter
  patches targeted the wrong module attribute (services use deferred imports).
- **Category B (real implementation defects):** `CurrentUser` had no
  `organizationId` attribute → every API call returned 400 "organization_id
  required"; `list_*` services used `size` while tests + contracts used
  `page_size`; return services wrote bare `datetime.date` to Mongo (same
  Bug #4 issue).

**Fix (T-100.11.1):** Bottomed out at **205 tests passing, 0 failures**. Live
smoke drove full RR → RTN → ARC chain end-to-end — inventory restored,
RR consumed_qty incremented, DN returnedQty incremented, AR Invoice
transitioned to partly_closed.

### Bug #6 — Finance posting setup not configured for A001

Both `return_posted` and `credit_note_posted` events emitted correctly but
failed at the finance side with `status: failed`. Root cause: events emit
with `companyCode: A001` but finance DB only had setup rows for `1000`.

**Fix (T-100.11.2):** Alembic 018 idempotently seeds `company_codes`,
`fiscal_periods`, `company_posting_setup` for A001 with all 10 GL account
FKs. All 4 Wave 3 event types (delivery_posted, sales_invoice_posted,
return_posted, credit_note_posted) now process cleanly. Verified
JE-A001-2026-0003 (Return) + JE-A001-2026-0004 (Credit Note) both balanced.

### Memory rule saved

[verify-agent-test-claims](feedback_verify_agent_test_claims.md) — agents
have over-reported test counts and mocked the wrong assumptions; always
re-run pytest yourself + drive a live-stack smoke before declaring
verified.

---

## Part 2 — Backlog split into per-task commits

Discovered the session was carrying a massive uncommitted backlog: most of
Wave 3 Phase 2 base code (T-100.1 through T-100.11) had never been
committed despite the agents reporting "committed" — only the spot fixes
were actually in git.

**Action:** Dispatched change-guardian to split the backlog into 15
per-task commits in dependency order, each tagged with `(Viet Anh)`. End
result: 17 commits ahead of `origin/main`. Trade-offs:
- `events.py` (+2,899 lines across 8+ handler tasks) bundled into one
  commit `c9c5f38` — splitting hunks per task would have been error-prone
- `__init__.py` router includes accumulated across many tasks; committed
  whole in the handlers batch
- Test files needed `git add -f` (existing `.gitignore` line 127 has
  `test_*.py` — flagged for future cleanup)

CHANGELOG.md updated with `[Unreleased]` block covering T-100.1 through
T-100.11.2 + T-070.0 (sales-side PO removal) + T-064 (audit modal actor
name resolution).

---

## Part 3 — CodeMap regeneration

Knowledge graph was Wave 3-blind: 0 nodes for `ar_invoices`, `core/documents`,
etc. Dispatched 6 mapping agents in parallel:

| Task | Nodes | Edges |
|------|------:|------:|
| map_sales_module | 38 | 62 |
| map_core_services | 16 | 46 |
| map_frontend_components | 221 | 184 |
| map_frontend_hooks_services | 99 | 120 |
| map_frontend_types | 23 | 3 |
| map_api_frontend_links | 0 | 63 |

**Coordination issue surfaced:** sibling agents disagreed on node_id
conventions. Backend mapper emitted edges with PascalCase IDs (`sales.service.QuoteService`)
while sales mapper used snake_case (`sales.service.quote_service`).
Cleaned up 100 orphan edges post-merge.

**Prevention:** Wrote `scripts/codebase_mapper/NODE_ID_CONVENTIONS.md` and
updated each `batch_*.json` metadata to reference it. Future mapping
agents will follow the documented contract.

**Final knowledge graph:** 610 nodes / 590 edges (was 520/316). 16/26
mapping tasks complete (61.5%); remaining 10 are farm-related and not on
Wave 3 critical path.

**Push:** 19 commits pushed to origin/main. Working tree clean except
`Brand_Engineering/` (untracked, intentional).

---

## Part 4 — Wave 3 Sales UI rebuild

Pivoted to frontend per CLAUDE.md rule "API working + UI broken = feature
is BROKEN". An accountant is going to be testing — UI is required.

Decisions before dispatching tasks:
- **Mental model:** SAP B1 (field-dense, doc-chain visible, base→target
  navigation, copy-from buttons, Draft / Open / Closed vocabulary)
- **Mirror purchasing module's UX patterns** (dedicated form pages, not
  modals; card-based detail layouts; status badges; filter chips on lists)
- **No approval workflow on sales side** (sales goes Draft → Open
  directly; matches typical sales practice)
- **Strict serial dispatch** — one task per agent, user verifies before
  next

Dispatched the audit (`Explore` agent) of purchasing UX patterns first.
Result: ~700 lines of inventory covering 16 purchasing pages, shared
components, hooks/services, form patterns, status badge styling, etc.

### Tasks shipped

| Task | Doc | Lines added | Tests | Status |
|------|-----|------------:|-------|--------|
| T-200.0 | AR Invoice (foundation + list/form/detail) | ~3,000 | n/a | ✅ verified |
| T-200.1 | Customer Receipt (list/form/detail + from-invoice) | ~2,400 | n/a | ✅ verified |
| T-200.2 | AR Aging Report (new backend endpoint + UI) | ~1,400 | +6 | ✅ verified |
| T-200.3 | Quote (list/form/detail + Convert button) | ~1,500 | n/a | ✅ verified |
| T-200.4 | Sales Order v2 (list/form/detail + from-quote) | ~2,300 | n/a | ✅ verified |

### Hardening rules discovered and codified

T-200.0 ate ~5 cycles of "discover a class of bug, fix it, retest" during
accountant verification:

1. **API client double-prefix** — `apiClient.baseURL = '/api'`, so service
   paths must be `/v1/...` not `/api/v1/...`
2. **camelCase response serialization** — Sales models had
   `populate_by_name=True` (accepts camelCase input) but no
   `alias_generator`, so output was snake_case. Added shared
   `_RESPONSE_CONFIG = ConfigDict(populate_by_name=True,
   alias_generator=to_camel, from_attributes=True)`. Paired with
   `response_model_by_alias=True` on every route. Also applied to shared
   `DocumentLinkRef` / `DocumentLineLinkMixin` in `core/documents/` so
   nested `baseDocRef` / `targetDocRefs` serialize camelCase too.
3. **Lowercase status string literals** — Backend `DocumentStatus` enum
   stores lowercase; frontend was using uppercase. Hid every action
   button until normalised.
4. **No Audit History button** — Finance `AuditHistoryModal` queries the
   finance audit_log whose `entity_type` whitelist is hard-locked to
   `{FiscalPeriod, JournalEntry}`. Sales docs have their own audit
   collections (`ar_invoices_v2_audit` etc.) — proper endpoint pending
   T-200.x.

These 4 rules baked into every subsequent agent prompt (T-200.1+) and saved
the rediscovery cycle every time.

### Memory rules saved this session

- [verify-agent-test-claims](feedback_verify_agent_test_claims.md)
- [sales-ui-no-audit-history-button](feedback_sales_ui_no_audit_history_button.md)

### Bugs caught during accountant verification

- **AR_INVOICE attachment type not in whitelist** — backend enum locked to
  PR/PO/GR/AP/PAYMENT; added all 8 Wave 3 sales doc types to the enum +
  Literal. List works; upload still 404s because `_verify_document`
  queries `document_headers` (purchasing's collection) — sales docs live
  in `ar_invoices_v2` etc. Filed as T-200.x.
- **AR Invoice detail page blank** — `invoice.baseDocRef.docType.toLowerCase()`
  threw because nested refs were snake_case (`doc_type`), not camelCase.
  Fixed by adding `_RESPONSE_CONFIG` to `DocumentLinkRef` + `DocumentLineLinkMixin`
  in shared `core/documents/` infra. Also renamed `.docEntry` →
  `.docId` on 3 frontend usages since the model field is `doc_id`.

---

## Outstanding for next session

| Task | Doc | Notes |
|------|-----|-------|
| T-200.5 | Delivery (list/form/detail + from-so) | Unblocks "Create Delivery" button on SO detail page; doc-chain link finally completes Quote → SO → Delivery → ARI |
| T-200.6 | Return Request | RMA authorisation, no GL impact |
| T-200.7 | Return Note v2 | from-RR; inventory restoration |
| T-200.8 | AR Credit Note | from-ARI; financial reversal |
| T-200.9 | Sales Items master + seed for sale_item_finance_ext | Closes 0/0 JE issue for return_posted (test items have no COGS) |
| T-200.10 | Company posting setup UI | Admin tool for new tenants (currently Alembic 018 hard-codes A001) |
| T-200.11 | Legacy cutover | Redirect /sales/orders → /sales/orders-v2; delete legacy pages |
| T-200.x | Sales attachments upload + audit endpoint | Build _verify_document routing by doc_type → collection; build /api/v1/sales/audit endpoint |

Plus the deferred Wave 3 Phase 3 (Down Payment, Reserve Invoice, Cash Sale,
Blanket Agreement) and Phase 4 reports (Customer Sub-Ledger, Customer
Statements, Sales-to-GL Reconciliation, VAT Return).

## What's actually testable now

Accountant can drive the full credit-sale-start chain end-to-end through UI:

1. **Quote** create → post → Convert to Sales Order
2. **Sales Order** auto-creates from Quote with baseDocRef link; lines
   editable downward; fulfilment progress columns visible on detail
3. **AR Invoice** create-from-Delivery (Delivery still backend-only; SO
   detail's "Create Delivery" link 404s)
4. **Customer Receipt** create from AR Invoice via "Receive Payment"
   button; allocate against open invoices
5. **AR Aging Report** shows outstanding balances per customer, bucketed
   by days overdue; bucket math verified (1-30 covers days 1..30
   inclusive)

Pipeline gap: Delivery UI is the next hop. Once T-200.5 ships, the full
linear flow becomes UI-driven end-to-end.
