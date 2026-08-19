"""
Unit tests for `seed_admin()` in `src/main.py` — security audit Fix 2.

Background: `seed_admin()` runs unconditionally on every startup
(`startup_event()`) whenever zero `super_admin` users currently exist. The
previous implementation, on finding an existing account matching
`settings.ADMIN_EMAIL`, silently promoted it to `super_admin` — no
approver, no audit entry, no distinction between a genuine first-boot
account and a pre-existing one this process never created. Since
`ADMIN_EMAIL` is documented publicly (this repo's own CLAUDE.md) and
registration is open, anyone could pre-register that address as an
ordinary "user" and get auto-promoted the next time the super_admin count
happened to hit zero on a restart.

The fix: "genuinely uninitialised" = no organization has ever been created
on this deployment (`seed_admin` is the only place that happens, and it
runs before the app accepts HTTP traffic). Only in that state may this
function create or promote an account; any promotion is always
audit-logged and logged at WARNING, never silent. On an already-
initialised deployment (an organization exists), zero super_admins is
treated as an operational incident requiring an explicit operator action —
never auto-repaired.

No live database: `db.users` / `db.organizations` / `db.divisions` are
hand-built AsyncMock collections. `write_user_audit_log` and `hash_password`
are monkeypatched at the `src.main` module level (the names `main.py`
imported them under), following the "mock the module's own imported names"
approach used throughout this test suite.
"""

from __future__ import annotations

from typing import Any, Dict, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest

import src.main as main_module

ADMIN_EMAIL = "admin@a64platform.com"
ADMIN_PASSWORD = "SuperAdmin123!"


def _make_fake_db(
    super_admin_doc: Optional[Dict[str, Any]] = None,
    admin_email_user_doc: Optional[Dict[str, Any]] = None,
    org_doc: Optional[Dict[str, Any]] = None,
) -> MagicMock:
    """
    `db.users.find_one` is called with two different filters in
    `seed_admin()` — {"role": "super_admin"} first, then {"email":
    ADMIN_EMAIL} — so route by filter shape rather than call order.
    """

    async def _users_find_one(filter_: Dict[str, Any]):
        if "role" in filter_:
            return super_admin_doc
        if "email" in filter_:
            return admin_email_user_doc
        return None

    db = MagicMock()
    db.users = MagicMock()
    db.users.find_one = AsyncMock(side_effect=_users_find_one)
    db.users.update_one = AsyncMock()
    db.users.insert_one = AsyncMock()

    db.organizations = MagicMock()
    db.organizations.find_one = AsyncMock(return_value=org_doc)
    db.organizations.insert_one = AsyncMock()

    db.divisions = MagicMock()
    db.divisions.find_one = AsyncMock(return_value=None)
    db.divisions.insert_one = AsyncMock()

    return db


def _patch_common(monkeypatch: pytest.MonkeyPatch, db: MagicMock) -> None:
    monkeypatch.setattr(main_module.mongodb, "get_database", lambda: db)
    monkeypatch.setattr(main_module.settings, "ADMIN_EMAIL", ADMIN_EMAIL)
    monkeypatch.setattr(main_module.settings, "ADMIN_PASSWORD", ADMIN_PASSWORD)
    monkeypatch.setattr(main_module, "hash_password", lambda pw: f"hashed:{pw}")
    monkeypatch.setattr(main_module, "write_user_audit_log", AsyncMock())


# ---------------------------------------------------------------------------
# Dormant branch — already has a super_admin
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_noop_when_a_super_admin_already_exists(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _make_fake_db(super_admin_doc={"email": "existing-super@example.com"})
    _patch_common(monkeypatch, db)

    await main_module.seed_admin()

    db.users.update_one.assert_not_awaited()
    db.users.insert_one.assert_not_awaited()
    main_module.write_user_audit_log.assert_not_awaited()


# ---------------------------------------------------------------------------
# Genuine first boot — no org, no existing user: full bootstrap preserved
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fresh_deployment_creates_org_division_and_admin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = _make_fake_db(super_admin_doc=None, admin_email_user_doc=None, org_doc=None)
    _patch_common(monkeypatch, db)

    await main_module.seed_admin()

    db.organizations.insert_one.assert_awaited_once()
    db.divisions.insert_one.assert_awaited_once()
    db.users.insert_one.assert_awaited_once()
    (created_user,), _ = db.users.insert_one.await_args
    assert created_user["email"] == ADMIN_EMAIL
    assert created_user["role"] == "super_admin"
    # A brand-new account is created, not promoted — no update_one, no
    # promotion audit entry for this path.
    db.users.update_one.assert_not_awaited()
    main_module.write_user_audit_log.assert_not_awaited()


# ---------------------------------------------------------------------------
# Genuine first boot, but a registration raced the startup call —
# promotion still allowed, but never silent (Fix 2's core requirement)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fresh_deployment_promotes_racing_registration_and_audits_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    racing_user = {"userId": "user-race-1", "email": ADMIN_EMAIL, "role": "user"}
    db = _make_fake_db(
        super_admin_doc=None, admin_email_user_doc=racing_user, org_doc=None
    )
    _patch_common(monkeypatch, db)

    await main_module.seed_admin()

    db.users.update_one.assert_awaited_once()
    (filter_, update_spec), _ = db.users.update_one.await_args
    assert filter_ == {"email": ADMIN_EMAIL}
    assert update_spec["$set"]["role"] == "super_admin"

    # Must never be silent: audit-logged via Fix 1's mechanism.
    main_module.write_user_audit_log.assert_awaited_once()
    _, kwargs = main_module.write_user_audit_log.await_args
    assert kwargs["target_user_id"] == "user-race-1"
    assert kwargs["target_user_email"] == ADMIN_EMAIL
    assert kwargs["details"]["after"] == "super_admin"

    # No org/division fabricated in the promote branch (unchanged from the
    # pre-fix behaviour of this branch).
    db.organizations.insert_one.assert_not_awaited()
    db.users.insert_one.assert_not_awaited()


# ---------------------------------------------------------------------------
# Already-initialised deployment (an org exists) — the attack this fix
# closes: must NEVER silently promote a pre-existing account
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_initialised_deployment_does_not_promote_preexisting_admin_email_account(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    preexisting_user = {
        "userId": "user-attacker-or-legit-1",
        "email": ADMIN_EMAIL,
        "role": "user",
    }
    db = _make_fake_db(
        super_admin_doc=None,
        admin_email_user_doc=preexisting_user,
        org_doc={"organizationId": "org-1"},
    )
    _patch_common(monkeypatch, db)

    with caplog.at_level("WARNING"):
        await main_module.seed_admin()

    # The core assertion: no silent elevation of an account this process
    # did not create.
    db.users.update_one.assert_not_awaited()
    db.users.insert_one.assert_not_awaited()
    main_module.write_user_audit_log.assert_not_awaited()
    assert any("will NOT be auto-promoted" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_initialised_deployment_with_no_admin_email_account_does_not_auto_create(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    db = _make_fake_db(
        super_admin_doc=None,
        admin_email_user_doc=None,
        org_doc={"organizationId": "org-1"},
    )
    _patch_common(monkeypatch, db)

    with caplog.at_level("WARNING"):
        await main_module.seed_admin()

    db.users.insert_one.assert_not_awaited()
    db.organizations.insert_one.assert_not_awaited()
    main_module.write_user_audit_log.assert_not_awaited()
    assert any("Refusing to auto-create" in r.message for r in caplog.records)
