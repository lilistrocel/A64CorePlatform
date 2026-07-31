"""
Unit tests for `OrganizationService.update_modules` — specifically the
`publicInfoPage` partial-update merge added to make
`PublicInfoPageConfig.enabled` an actually operable privacy switch.

Prior to this, `PATCH /api/v1/organizations/{orgId}/modules` only accepted
`financeEnabled`; `publicInfoPage.enabled` defaulted True with no way to
turn it off. These tests pin two things:

1. `enabled=False` (and any other single flag) can be set without
   resetting sibling `show*` flags to their model defaults — the merge
   case. A config that quietly resets neighbouring privacy flags on every
   unrelated PATCH would be worse than one that cannot be changed at all.
2. `financeEnabled` and `publicInfoPage` updates are independent — patching
   one never touches the other.
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from src.models.organization import PublicInfoPageConfig, PublicInfoPageConfigUpdate
from src.services.organization_service import OrganizationService


ORG_ID = "org-test-123"


def _base_doc(modules: dict) -> dict:
    return {
        "organizationId": ORG_ID,
        "name": "Test Org",
        "slug": "test-org",
        "industries": [],
        "logoUrl": None,
        "modules": modules,
        "isActive": True,
        "createdAt": datetime(2026, 1, 1),
        "updatedAt": datetime(2026, 1, 1),
    }


def _mock_collection(existing_doc: dict, updated_doc: dict) -> MagicMock:
    """
    A fake `db["organizations"]` collection.

    `find_one` is called twice by `update_modules`: once to load the
    pre-mutation document, once (only if a write happened) to reload after
    `update_one`. `side_effect` returns `existing_doc` then `updated_doc`
    on the two respective calls.
    """
    collection = MagicMock()
    collection.find_one = AsyncMock(side_effect=[existing_doc, updated_doc])
    collection.update_one = AsyncMock()
    return collection


def _patch_db(monkeypatch: pytest.MonkeyPatch, collection: MagicMock) -> None:
    db = MagicMock()
    db.__getitem__.return_value = collection
    monkeypatch.setattr(
        "src.services.organization_service.mongodb.get_database", lambda: db
    )


@pytest.mark.asyncio
async def test_enabled_false_merges_without_resetting_sibling_flags(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Patching only `enabled` must leave `showOperatorName` /
    `showMediumIngredients` / etc. exactly as stored — not reset to the
    `PublicInfoPageConfig` model defaults."""
    existing_modules = {
        "financeEnabled": True,
        "publicInfoPage": {
            "enabled": True,
            "showOperatorName": True,
            "showMediumIngredients": True,
            "showProtocolSteps": False,
            "showFacilityName": False,
        },
    }
    existing_doc = _base_doc(existing_modules)
    expected_merged_public_info = {
        "enabled": False,
        "showOperatorName": True,
        "showMediumIngredients": True,
        "showProtocolSteps": False,
        "showFacilityName": False,
    }
    updated_modules = {**existing_modules, "publicInfoPage": expected_merged_public_info}
    updated_doc = _base_doc(updated_modules)

    collection = _mock_collection(existing_doc, updated_doc)
    _patch_db(monkeypatch, collection)

    result = await OrganizationService.update_modules(
        organization_id=ORG_ID,
        financeEnabled=None,
        publicInfoPage=PublicInfoPageConfigUpdate(enabled=False),
    )

    # The write sent to Mongo carries the FULL merged object (not just the
    # patched key) — Mongo `$set` on `modules.publicInfoPage` replaces the
    # whole sub-document, so the merge must happen in Python first.
    collection.update_one.assert_awaited_once()
    set_payload = collection.update_one.await_args.args[1]["$set"]
    assert set_payload["modules.publicInfoPage"] == expected_merged_public_info
    assert "modules.financeEnabled" not in set_payload

    assert result.modules.publicInfoPage.enabled is False
    assert result.modules.publicInfoPage.showOperatorName is True
    assert result.modules.publicInfoPage.showMediumIngredients is True
    # financeEnabled untouched by a publicInfoPage-only patch
    assert result.modules.financeEnabled is True


@pytest.mark.asyncio
async def test_finance_enabled_patch_leaves_public_info_page_untouched(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The inverse: patching `financeEnabled` alone must not touch
    `publicInfoPage` at all — no `modules.publicInfoPage` key should even
    be sent to Mongo."""
    existing_modules = {
        "financeEnabled": True,
        "publicInfoPage": {
            "enabled": False,
            "showOperatorName": True,
            "showMediumIngredients": False,
            "showProtocolSteps": True,
            "showFacilityName": False,
        },
    }
    existing_doc = _base_doc(existing_modules)
    updated_modules = {**existing_modules, "financeEnabled": False}
    updated_doc = _base_doc(updated_modules)

    collection = _mock_collection(existing_doc, updated_doc)
    _patch_db(monkeypatch, collection)

    result = await OrganizationService.update_modules(
        organization_id=ORG_ID, financeEnabled=False, publicInfoPage=None
    )

    set_payload = collection.update_one.await_args.args[1]["$set"]
    assert set_payload["modules.financeEnabled"] is False
    assert "modules.publicInfoPage" not in set_payload

    assert result.modules.financeEnabled is False
    assert result.modules.publicInfoPage.enabled is False
    assert result.modules.publicInfoPage.showOperatorName is True
    assert result.modules.publicInfoPage.showProtocolSteps is True


@pytest.mark.asyncio
async def test_patch_against_legacy_doc_with_no_stored_public_info_page(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A tenant doc predating this field has no `modules.publicInfoPage`
    key at all. The merge must fall back to `PublicInfoPageConfig`'s own
    defaults for the untouched fields rather than raising or nulling them."""
    existing_doc = _base_doc({"financeEnabled": True})
    expected_merged_public_info = {
        "enabled": False,
        "showOperatorName": False,
        "showMediumIngredients": False,
        "showProtocolSteps": False,
        "showFacilityName": False,
    }
    updated_doc = _base_doc(
        {"financeEnabled": True, "publicInfoPage": expected_merged_public_info}
    )

    collection = _mock_collection(existing_doc, updated_doc)
    _patch_db(monkeypatch, collection)

    result = await OrganizationService.update_modules(
        organization_id=ORG_ID,
        financeEnabled=None,
        publicInfoPage=PublicInfoPageConfigUpdate(enabled=False),
    )

    set_payload = collection.update_one.await_args.args[1]["$set"]
    assert set_payload["modules.publicInfoPage"] == expected_merged_public_info
    assert result.modules.publicInfoPage.enabled is False


@pytest.mark.asyncio
async def test_empty_public_info_page_patch_is_a_noop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`PublicInfoPageConfigUpdate()` with every field left `None` (a
    caller sending `{"publicInfoPage": {}}`) must not touch the stored
    config or trigger a write for that key."""
    existing_doc = _base_doc(
        {
            "financeEnabled": True,
            "publicInfoPage": {
                "enabled": False,
                "showOperatorName": True,
                "showMediumIngredients": False,
                "showProtocolSteps": False,
                "showFacilityName": False,
            },
        }
    )
    collection = _mock_collection(existing_doc, existing_doc)
    _patch_db(monkeypatch, collection)

    await OrganizationService.update_modules(
        organization_id=ORG_ID,
        financeEnabled=None,
        publicInfoPage=PublicInfoPageConfigUpdate(),
    )

    # Nothing beyond updatedAt was set -> the "skip the write" branch fires.
    collection.update_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_organization_not_found_raises_404(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    collection = MagicMock()
    collection.find_one = AsyncMock(return_value=None)
    _patch_db(monkeypatch, collection)

    with pytest.raises(HTTPException) as exc_info:
        await OrganizationService.update_modules(
            organization_id="does-not-exist",
            financeEnabled=None,
            publicInfoPage=PublicInfoPageConfigUpdate(enabled=False),
        )
    assert exc_info.value.status_code == 404
