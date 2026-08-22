# DevLog — Label Printing, CodeMap Recovery, and Four Auth/Data Defects

## 1. Session Header
- **Date:** 2026-08-21 (index migration executed 2026-08-22)
- **Session type:** Feature + infrastructure recovery + defect fixes
- **Focus area:** Genetics label printing, CodeMaps, Cloudflare Access login
- **Status:** All work committed and pushed on `feat/genetics-label-printing`.
- **Objective:** Ship network label printing for genetics vessels; then, on
  request, regenerate the CodeMaps — which surfaced eleven defects, four of
  which were fixed in the same session.

## 2. What We Accomplished

**T-925 — Brother QL-800 network printing.** Genetics vessel labels now spool
straight to a networked printer instead of only downloading a PDF. The label
artwork is untouched: this reuses T-804's existing PDF generator verbatim and
only adds a delivery path, which is why all 297 pre-existing genetics tests
still pass unchanged. New `POST .../labels/print` (tape `62x15` default,
`genetics.edit`, raises `labelledVesselCount` only after a confirmed print) and
`GET /genetics/printer/health` (always 200 so the UI renders state). Printer
config lives in the existing deployment-settings mechanism as three keys, with
the API key masked in both the settings response and the audit log. Verified on
real hardware: one label printed, job 13, `fits_natively: true` at 696 dots.

**T-926 — CodeMaps regenerated, and the reason they rotted fixed.** Graph went
822 nodes/1008 edges to 1214/2578. Two root causes, both recorded wrongly
before:
- The backlog said regeneration was "blocked on working credentials". It was
  not. There is no auth problem — the mapper needs `directConnection=true`
  because Mongo advertises the internal hostname `mongodb` as a replica set.
  Passing `MONGO_ROOT_*` is what produced the misleading `AuthenticationFailed`
  that sent the original diagnosis down the wrong path.
- `rerun.sh` silently no-opped for **7 modules**. `FILE_TO_TASK_MAP` referenced
  task ids `setup.py` never seeded, and `cmd_reseed` matches on
  `status: "completed"`, so a non-existent task matched nothing and the run
  still reported success. `mushroom_manager` (0 → 33 nodes) and `ai_assistant`
  (0 → 12) had therefore never been mapped at all.

**T-927 — a live authorisation bypass.** farm_manager's `require_permission`
was an if/elif chain over four strings with no `else`, so any unrecognised
string returned `current_user` unchecked. `"admin.manage"` was never a branch
and guards three admin-only weather-cache endpoints, which were reachable by
any authenticated user. Replaced with the fail-closed `PERMISSION_ROLES`
lookup genetics and protocols already used.

**T-928 — Quote documents pointed at a collection that never existed.** Two
sites mapped QUOTE to `quotes_v2*` while the writer uses `sales_quotes`. Effect
one: Quote audit history always returned empty. Effect two, worse and
previously unreported: `_assert_sales_v2_document_is_draft` found nothing and
raised `LookupError`, so uploading or deleting an attachment on any Quote
always failed with a misleading "document not found".

**T-938 — Cloudflare Access login 500 on any soft-deleted email.** Reported as
three separate problems: "the PIN says it's already used", "users cannot
register", "registered users don't appear in the database". One root cause, and
Cloudflare was never at fault.

## 3. Bugs/Issues Discovered

- **[Fixed] T-938 root cause.** `users.email_1` was a full unique index with no
  partial filter, while user deletion is a *soft* delete leaving the document
  in place holding the email. `login_via_cf_access` filtered its lookup to
  `deletedAt: None`, so a soft-deleted user looked unknown, fell into JIT
  provisioning, and called `insert_one` on a guarded email —
  `DuplicateKeyError` escaped as an unhandled 500. 30 occurrences in retained
  logs. **The PIN symptom was downstream:** the user enters the code,
  Cloudflare accepts and consumes it, our app 500s, they retry the same code,
  and Cloudflare correctly reports it already used. Chasing this as a
  Cloudflare problem would have been a dead end.
- **[Fixed] Boot-time landmine that would have silently undone the fix.**
  `services/database.py`'s `_create_indexes` runs every boot and recreated the
  plain `email_1`. The first api restart after the migration would have
  restored the broken index with no error, looking exactly like the fix had
  failed. Now creates the partial index under an explicit name.
- **[Fixed] SPA admin pages 404'd on refresh.** `/admin/users` and
  `/admin/tenant-setup` returned FastAPI's `{"detail":"Not Found"}` on a full
  page load. nginx's `location /admin/` sent the prefix to the API for the
  legacy static panel; the React SPA also owns those paths. Client-side
  navigation worked, refresh did not. The fix (`443ecde`) had been written
  **2026-08-05 and sat unmerged for over two weeks** while people hit the bug.
- **[Filed, not fixed] T-929..T-937** — see BACKLOG.md. Highlights:
  `src/utils/email.py` returns `True` unconditionally outside development, so
  verification and password-reset mail silently fails on any production
  deployment; every Wave 3 sales collection has zero indexes, so document
  number uniqueness is application-enforced only; the middleware pipeline order
  is documented backwards, making 429s invisible to `/api/metrics`; two
  frontend calls hit routes that do not exist.
- **[Corrected] The backlog's "6 pre-existing test failures".** Four were never
  real — they fail only on the host, where `anthropic` is not installed, and
  pass in the container. Whoever recorded them ran pytest on the host.

## 4. What We Need To Do Next
1. Activate the two restored accounts in **User Management → Pending**
   (`khaledhardan@outlook.com`, `khaledmusic229@gmail.com`). Note the second
   becomes **super_admin** on activation.
2. Decide on T-927's siblings: `finance`, `hr`, `logistics`, `crm`, `sales`,
   `marketing` still use the fail-open if/elif shape. None has a live hole
   today — every string in use is handled — but each is one typo from the same
   bug.
3. Map the 4 remaining modules (`purchasing`, `finance`, `protocols`,
   `attachments`). Their tasks are now seeded, so `rerun.sh` will pick them up
   instead of skipping silently. Most of the residual 112 dangling edges are
   theirs.
4. T-929 (silent email failure) is the most user-visible of the unfixed items
   on any non-development deployment.

## 5. Important Context for Next Session

- **`hardan@agrinovame.com` is deliberately still soft-deleted.** It is not
  orphaned — it has 26 real references including four audit trails. Purging it
  would have destroyed the record of who created real sales and purchasing
  documents. After the index migration it can re-register a fresh account while
  the old record keeps its attribution.
- **Eight genuinely orphaned accounts were hard-purged** after a per-user
  reference check proved zero business or audit references, plus their leftover
  `mfa_pending_tokens`/`refresh_tokens`. Verified afterwards: zero remaining
  references to any purged user.
- **A trap for anyone regenerating CodeMaps:** re-running a stale
  `batch_*.json` from `scripts/codebase_mapper/` rolls the graph BACKWARDS,
  because `knowledge_store`'s `$set` replaces whole node documents. One agent
  hit this and clobbered three good descriptions before catching it via a
  pre-run snapshot. Only ever write node docs read live from Mongo.
- **nginx config is a single-file bind mount.** `nginx -s reload` reports
  success and does nothing after an edit, because the edit replaces the inode.
  Only `--force-recreate` re-establishes the mount.

## 6. Files Modified (high level)
- **Backend:** `genetics/api/v1/labels.py` + new `printer.py`, new
  `services/label_printer_service.py`, `services/deployment_settings_service.py`,
  `config/settings.py`, `models/deployment_settings.py`, `api/v1/admin.py`,
  `farm_manager/middleware/auth.py`, `genetics/middleware/auth.py`,
  `sales/api/v1/audit.py`, `attachments/services/attachment_service.py`,
  `services/auth_service.py`, `services/database.py`, `main.py`
- **Frontend:** `PrintLabelsModal.tsx`, `DeploymentSettingsCard.tsx`,
  `geneticsApi.ts`, `useGenetics.ts`, `types/genetics.ts`
- **Infra:** `nginx/nginx.dev.conf`, `nginx/nginx.prod.conf`
- **Migrations:** `scripts/migrations/t938_partial_unique_email_index.py`
- **Docs:** all five CodeMaps + INDEX, `NODE_ID_CONVENTIONS.md`, CHANGELOG,
  BACKLOG, ARCHIVE, ADMIN_ACCESS.md

## 7. Session Metrics
- Commits: 5 on `feat/genetics-label-printing`
- Tests: 913 → **962 passed** in-container, 2 pre-existing failures unchanged
- Knowledge graph: 822 → 1214 nodes, 1008 → 2578 edges; dangling 141 → 112
- Defects found by mapping: 11 filed (T-927..T-937), 4 fixed this session
- Database operations: 2 accounts restored, 8 purged, 1 index migration
  executed — all with verified backups in place first
