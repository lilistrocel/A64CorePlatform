# DevLog — Farm Manager: Cache-Key Isolation Fix + Farms-Visibility Review

## 1. Session Header
- **Date:** 2026-08-14
- **Session type:** Investigation + security fix
- **Focus area:** Farm Manager access control / response caching
- **Status:** Fixed, tested, **merged to `main`** (PR #4). Deploy = api restart.
- **Objective:** A user reported that a **moderator** saw no farms in Farm Manager until assigned to one, believing only super-admins see all farms. Verify the access model and fix whatever's wrong.

## 2. What We Accomplished
- **Verified the access model** (`src/modules/farm_manager/api/v1/farms.py::get_farms`): `super_admin` + `admin` → `get_all_farms` (every farm); everyone else (moderator, user) → `get_user_farms` → only farms where they're the single `managerId`. Farms have **one manager** (no team/assignment list). So a moderator seeing nothing until assigned is **working as coded** — confirmed with the user, kept **as-is**.
- **Found and fixed a real bug while investigating:** the `@cache_response` decorator (`src/core/cache/decorators.py`) built its cache key from query params only — `current_user` was explicitly filtered out — so the key was identical for every caller. The first caller's role/tenant-scoped response was then served to **every other caller** for the TTL window. Fix: `_generate_cache_key_from_args` now folds the caller's `userId` + `organizationId` into the hashed key. Added `tests/unit/test_cache_key_isolation.py` (5 cases, passing).

## 3. Bugs/Issues Discovered
- **[Fixed — Security, cross-user + cross-tenant data exposure]** User-agnostic cache key in `@cache_response`.
  - **File:** `src/core/cache/decorators.py`, `_generate_cache_key_from_args` (~line 113).
  - **Blast radius:** 5 cached endpoints — `farms.get_farms` (per-user/role), farm dashboard, sales dashboard ×2 (per-org), plant_data list (global, harmless).
  - **Failure scenario:** a moderator calls `GET /farms` → caches their empty list under `get_farms:<hash of page/perPage>`; a super_admin then calls it within 60s → receives the **cached empty list** instead of all farms (or the reverse — a moderator receiving an admin's full list). Sales/farm dashboards leaked figures **across organizations**.
  - **Root cause:** `current_user` was in the decorator's exclusion list, so the authenticated caller never contributed to the key.
  - **Fix:** include `userId` + `organizationId` (defensive `getattr`, so any `CurrentUser` shape works); genuinely-global endpoints (no `current_user` kwarg) still cache on params alone.
  - **Repro:** two users with different roles/orgs hit the same cached endpoint with identical query params inside the TTL.

## 4. What We Need To Do Next
1. **Deploy:** `docker restart <prefix>-api-1` (behind whatever's checked out on the box → `main`). No data/migration.
2. **Optional hardening:** audit other modules for `@cache_response` on per-user/per-org endpoints (now safe by default after this fix, but worth a pass).
3. **Not doing (by decision):** broaden moderator farm visibility — the single-manager model stays; moderators see only farms they manage.

## 5. Important Context for Next Session
- **Access model recap:** farm listing is role-gated in `get_farms`; only `super_admin`/`admin` see all farms; a farm has exactly one `managerId` (no multi-assignment). `admin`'s "all farms" is currently **not** org-scoped (sees all tenants) — noted, not changed.
- The cache fix is **behavior-preserving for authorization** — it does not change what any role is allowed to see; it only stops one caller's cached response reaching another.
- Merged to `main` via PR #4 (`fix/cache-key-user-isolation`).

## 6. Files Modified
- `src/core/cache/decorators.py` — per-user/per-org cache key.
- `tests/unit/test_cache_key_isolation.py` — new regression test (5 cases).

## 7. Session Metrics
- **Tests:** 5/5 cache-key isolation cases pass; verified live that different users/orgs produce different keys, same user stable, no-auth falls back to params.
- **Key achievement:** closed a cross-tenant data-leak in shared caching that also explained intermittently-confusing Farm Manager views, without changing the (intended) role-based visibility.
