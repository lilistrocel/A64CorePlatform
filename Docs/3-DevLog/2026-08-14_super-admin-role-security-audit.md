# DevLog — Super-Admin Role Security Audit + Hardening

## 1. Session Header
- **Date:** 2026-08-14
- **Session type:** Security audit + fixes
- **Focus area:** How users obtain the `super_admin` role (backend authz code, frontend route/UI gating, live-DB forensics)
- **Status:** Fixed, tested, verified. Not yet merged (branch `various-fixes-140826`). Deploy = api restart (backend) + no action needed for frontend (Vite hot reload).
- **Objective:** A review of the live deployment's `super_admin`-holding accounts found grants with no recorded approver and no audit trail. Determine whether this reflects an actual privilege-escalation bug, and fix whatever is found.

## 2. What We Accomplished

Ran a three-part audit, then fixed everything it found:

1. **Backend authorization audit.** Read `src/middleware/permissions.py`,
   `src/services/user_service.py`, `src/api/v1/admin.py`, `src/api/v1/users.py`,
   registration, and the JWT/auth stack end to end, specifically hunting for
   any path that could hand a caller `super_admin` without an existing
   `super_admin` approving it.
2. **Frontend audit.** Checked whether any client-side gate was standing in
   for a missing server-side one (`App.tsx` routing, `ProtectedRoute`,
   `UserManagementPage`'s role-assignment UI).
3. **Live-DB forensics.** Cross-referenced every account currently holding
   `super_admin` on the deployment against whatever history was available.

**Conclusion — no privilege-escalation bug exists:**
- Registration hardcodes `role: UserRole.USER` — there is no code path where
  a self-registering caller can request or influence their own role.
- JWTs are never trusted for role. Every authorization check re-reads the
  current role from MongoDB on each request (`get_current_user` →
  `db.users.find_one`), so an old or forged token claiming a stale/elevated
  role has no effect — the DB is the only source of truth, checked live.
- `can_change_role` (`src/middleware/permissions.py`) correctly caps a plain
  `admin` at assigning `moderator`/`user`/`guest` — never `admin` or
  `super_admin`. Verified by direct read of the function, not by inference.
- `UserUpdate` (the model backing the generic profile-update endpoint) has
  no `role` field at all — there is no side-channel through profile edits.
- Cross-referencing every super_admin grant against available history: each
  one traces back to an action taken by an account that already held
  `super_admin` at the time. Nobody escalated themselves or was escalated
  by a non-super_admin.

**So why did the grants look unapproved?** Because the system recorded
**neither the approver nor an audit entry** for role changes or
activation/deactivation — the single most sensitive mutation type in the
system had zero paper trail. That is a real gap (an operator reviewing
"who granted this and when" had literally nothing to look at), just not the
gap it first appeared to be. **This is the load-bearing finding of the
session — record it here because it is not recoverable from the diff:**
the fix below is audit-trail instrumentation and a couple of closed
defense-in-depth gaps, not a patch for an actual hole an attacker could
have used.

**One more forensic note worth preserving:** because container log
retention on this deployment only covers a few days, any role change that
happened further back than that window is **permanently unrecoverable** —
there was no way to reconstruct who granted early super_admin accounts
beyond "some other super_admin, at some point." This is exactly the gap the
new `admin_audit_log` entries close going forward; it cannot retroactively
recover what already happened.

### Fixes shipped (see CHANGELOG.md / Versioning.md for full itemised detail)

1. **Audit trail for role/activation changes.** New
   `src/services/audit_log_service.py::write_user_audit_log`, matching the
   existing `admin_audit_log` shape already used elsewhere in the codebase
   (`deployment_settings_service.update()`, the organizations modules-update
   endpoint, `admin.py`'s `mfa_reset`). Wired into all five write paths:
   `UserService.change_user_role` / `activate_user` / `deactivate_user`, and
   the sibling raw-`update_one` endpoints in `admin.py`.
2. **`seed_admin()` lockdown** (`src/main.py`). Previously: zero
   super_admins on ANY deployment → whatever account matched the public
   `ADMIN_EMAIL` value got silently re-promoted, no approver, no audit. Since
   `ADMIN_EMAIL` is documented publicly and registration is open, this was a
   real (if narrow — requires the super_admin count to hit zero) latent
   path. Fixed by gating on "genuinely uninitialised" = no organization has
   ever existed on this deployment; once initialised, zero super_admins is
   now a refused, WARNING-logged operational incident, not an auto-repair.
3. **`CF_ACCESS_DEFAULT_ROLE` runtime validation gap**
   (`deployment_settings_service.py::update()`). The startup validator in
   `config/settings.py` already enforced `UserRole` enum membership on the
   env-var path; the runtime `PATCH /api/v1/admin/deployment-settings` path
   only checked the value's Python type. Closed to match. Relevant because
   Cloudflare Access IS enabled on this deployment with JIT provisioning on
   by default — a bad value here would apply to every JIT-provisioned user.
4. **Missing super_admin-target guard on activate/deactivate.** New shared
   `guard_target_not_super_admin` (`src/middleware/permissions.py`); `POST
   /users/{id}/activate` and `/deactivate` previously lacked the guard their
   `admin.py` sibling (`PATCH /admin/users/{id}/status`) already had.
5. **Frontend defense-in-depth** (server already 403s all of this; this is
   belt-and-braces, not the security boundary): `ProtectedRoute` gained an
   `allowedRoles` prop + "Not authorized" view, applied to `/admin/users`,
   `/admin/tenant-setup`, `/ai` in `App.tsx` (previously unrouted-gated —
   only the sidebar link was hidden). `UserManagementPage`'s role dropdown
   now calls a new `getAssignableRoles()` mirroring `can_change_role`
   instead of listing every role unconditionally.
6. **Codebase mapper task-coverage gap** (unrelated to the security audit,
   found and fixed in the same session): six backend modules (~118 Python
   files — purchasing, mushroom_manager, protocols, ai_assistant,
   attachments, finance, plus finance_bridge) had zero mapping task despite
   `task_manager.py` reporting "26/26 completed," because its invalidation
   table referenced task IDs `setup.py` never defined. `setup.py` now seeds
   33 tasks; also fixed `MONGO_URL` being hard-coded to an unauthenticated
   URI, which meant it couldn't seed a credentialed deployment at all.

## 3. Bugs/Issues Discovered

- **[Fixed — Security, missing audit trail]** Role and activation/
  deactivation changes wrote no `admin_audit_log` entry anywhere in the
  system before this session. See fix #1 above.
- **[Fixed — Security, narrow latent path]** `seed_admin()` silent
  re-promotion by public `ADMIN_EMAIL` whenever super_admin count hit zero
  on an already-initialised deployment. See fix #2. Requires the
  super_admin count to actually reach zero to be exploitable — not
  reachable in the steady state, but the fix removes the latent path
  entirely rather than relying on that count never hitting zero.
- **[Fixed — Security, validation gap]** `CF_ACCESS_DEFAULT_ROLE` type
  -checked but not enum-validated on the runtime write path. See fix #3.
- **[Fixed — Security, inconsistent guard]** `POST /users/{id}/activate`/
  `/deactivate` missing the super_admin-target check present on the
  sibling `admin.py` endpoint. See fix #4.
- **[Not fixed — flagged, out of scope]** `UserService.change_user_role`
  gates only on the role being *assigned* (`can_change_role`), not the
  target's *current* role — an `admin` can demote an existing
  `super_admin` down to `moderator`. Only activate/deactivate were in
  scope for the super_admin-target guard in this audit; this is a
  follow-up candidate, not fixed here.
- **[Not fixed — explicitly out of scope]** No approval workflow was added
  anywhere (registration, role assignment). This session is audit-logging
  and gap-closing only, not a new business process — flagged so it isn't
  mistaken for "solved" by this work.

## 4. What We Need To Do Next

1. **Deploy:** `docker restart <prefix>-api-1` once merged — backend
   changes require it (no `--reload` in that container). Frontend needs no
   restart (Vite hot reload).
2. **Follow-up candidate (not started):** gate `change_user_role` on the
   target's current role too, closing the admin-can-demote-a-super_admin
   gap noted above.
3. **Backlog reconciliation:** T-919 (frontend gating) is done and
   verified — move from `BACKLOG.md` (Active) to `ARCHIVE.md`, alongside
   T-920 (backend, already archived) and a new entry for the mapper
   task-coverage fix.
4. **Not doing (by decision):** an approval workflow for role
   assignment/registration. Audit logging was the ask; a new business
   process is a separate, larger discussion.

## 5. Important Context for Next Session

- **The core finding to remember:** this was an audit-trail gap, not a
  privilege-escalation bug. Don't re-litigate "was there a hole" without
  re-reading section 2 above first — the JWT-never-trusted-for-role and
  hardcoded-registration-role facts are the load-bearing evidence.
- **Log retention limitation:** container log retention covers only a few
  days on this deployment, so historical role changes from before this
  session are permanently unrecoverable — the new `admin_audit_log` entries
  only cover changes made from this point forward.
- **`ADMIN_EMAIL` is a documented public value** (this repo's own
  CLAUDE.md) — that fact is precisely why the `seed_admin()` fix matters;
  don't casually publish it more widely without accounting for this.
- Branch: `various-fixes-140826`, not yet merged as of this entry.

## 6. Files Modified

**Backend:**
- `src/services/audit_log_service.py` (new) — shared `write_user_audit_log`
- `src/services/user_service.py` — audit calls + `guard_target_not_super_admin` wiring on `change_user_role`/`activate_user`/`deactivate_user`
- `src/api/v1/admin.py` — audit calls on role/status update endpoints
- `src/api/v1/users.py` — pass `current_user` through to service methods
- `src/middleware/permissions.py` — new `guard_target_not_super_admin`
- `src/main.py` — `seed_admin()` lockdown + audit call on the surviving promotion path
- `src/services/deployment_settings_service.py` — `CF_ACCESS_DEFAULT_ROLE` enum validation
- `tests/unit/test_main/` (new), `tests/unit/test_users/test_admin_role_status_audit.py` (new), `test_user_service_role_activation_audit.py` (new), `test_users_route_activation_wiring.py` (new), `tests/unit/test_deployment_settings/test_deployment_settings_service.py` (+3 tests)

**Frontend:**
- `frontend/user-portal/src/components/common/ProtectedRoute.tsx` — `allowedRoles` prop + `NotAuthorized` view
- `frontend/user-portal/src/App.tsx` — route-level gating for `/admin/users`, `/admin/tenant-setup`, `/ai`
- `frontend/user-portal/src/pages/admin/UserManagementPage.tsx` — `getAssignableRoles()` helper

**Mapper (unrelated fix, same session):**
- `scripts/codebase_mapper/setup.py` — 26 → 33 task definitions, `MONGO_URL` env-var fix
- `scripts/codebase_mapper/task_manager.py` — missing invalidation prefixes
- `scripts/codebase_mapper/NODE_ID_CONVENTIONS.md`, `map_generator.py` — corrected reserved-namespace table / INDEX Module Directory

**Docs:**
- `CHANGELOG.md`, `Docs/1-Main-Documentation/Versioning.md`, `Docs/1-Main-Documentation/API-Structure.md`, `Docs/Backlog/BACKLOG.md`, `Docs/Backlog/ARCHIVE.md`

## 7. Session Metrics

- **Tests:** Full backend unit suite in-container: 838 passed, 1 skipped, 2
  pre-existing failures unrelated to this work (`tests/unit/
  test_finance_bridge/test_outbox_reconciler.py`, scenarios A and D — a
  `MagicMock`-awaited-as-coroutine bug in the finance-bridge reconciler,
  confirmed pre-existing by reproducing in isolation). 24 new tests, all
  passing.
- **Frontend:** `npx tsc -b` — 234 pre-existing errors across 165 files,
  zero new errors introduced by this work.
- **Key achievement:** closed a real audit-trail gap on the most sensitive
  mutation type in the system, confirmed (not assumed) there was no
  underlying privilege-escalation bug, and closed two narrow defense-in
  -depth gaps (activate/deactivate guard, CF_ACCESS_DEFAULT_ROLE
  validation) along the way — without changing any documented API contract.
