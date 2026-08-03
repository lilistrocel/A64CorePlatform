"""
Deployment Settings Models

Request/response schemas for GET/PATCH /api/v1/admin/deployment-settings.
See services/deployment_settings_service.py for the env -> db -> unset
resolution these schemas surface, and for why CF_ACCESS_TEAM_DOMAIN /
CF_ACCESS_AUD are never exposed in full.
"""

from typing import Dict, Optional, Union

from pydantic import BaseModel, Field


class DeploymentSettingItem(BaseModel):
    """
    One resolved managed key.

    `value` is populated for every key except the two Cloudflare Access
    secrets. `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` instead populate
    `isSet` + `maskedHint` (last 4 characters only, e.g. "...ab12") — there
    is deliberately no way to retrieve their full value through this API.
    """

    source: str = Field(..., description="'env' | 'db' | 'unset'")
    editable: bool = Field(
        ..., description="False when source is 'env' — pinned, cannot be edited here"
    )
    value: Optional[Union[str, bool]] = Field(
        None, description="Effective value. Omitted for CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD."
    )
    isSet: Optional[bool] = Field(
        None,
        description="Only present for CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD — whether a value is configured",
    )
    maskedHint: Optional[str] = Field(
        None,
        description="Only present for CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD when isSet — last 4 chars only",
    )


class DeploymentSettingsResponse(BaseModel):
    """
    GET /api/v1/admin/deployment-settings, and the shape returned after a
    successful PATCH.
    """

    settings: Dict[str, DeploymentSettingItem]


class DeploymentSettingsPatchRequest(BaseModel):
    """
    PATCH /api/v1/admin/deployment-settings request body.

    `currentPassword` re-authenticates the acting super_admin — a hijacked
    session alone must not be able to repoint authentication (guardrail c
    in deployment_settings_service.update). `changes` carries only the keys
    being modified; sending an env-pinned key or an unknown key is a 409/422.
    """

    currentPassword: str = Field(..., min_length=1, description="Actor's current password")
    changes: Dict[str, Union[str, bool]] = Field(
        ..., description="Managed key -> new value; only the keys being changed"
    )
