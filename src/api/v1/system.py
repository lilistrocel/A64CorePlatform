"""
System Capability API (Wave 0 — T-059)

Tells the frontend which optional modules this tenant has access to and
whether the backing microservice is currently reachable. The frontend uses
the response to gate routes/sidebar entries and decide whether to degrade
purchasing dropdowns to free-text.

Endpoint:
    GET /api/v1/system/capabilities  (auth required, any role)
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ...core.cache.redis_cache import get_redis_cache
from ...middleware.auth import get_current_user
from ...models.user import UserResponse
from ...modules.finance_bridge.reachability import get_finance_reachability
from ...modules.finance_bridge.tenant_flag import is_finance_enabled_for_org
from ...services.database import mongodb

router = APIRouter(prefix="/system", tags=["System"])


# ─── Response models ─────────────────────────────────────────────────────


class FinanceModuleCapability(BaseModel):
    """Status of the finance module for the current tenant."""
    enabled: bool = Field(
        ...,
        description=(
            "Operator decision (per-tenant flag). When false the UI hides "
            "all finance entries even if the service is reachable."
        ),
    )
    reachable: bool = Field(
        ...,
        description=(
            "Health-ping result. When false the UI degrades dropdowns to "
            "free-text and shows an amber 'service starting up' banner."
        ),
    )
    version: Optional[str] = Field(
        None,
        description="Finance service version when reachable; null otherwise.",
    )


class ModuleCapabilities(BaseModel):
    """Per-tenant module-status map."""
    finance: FinanceModuleCapability


class CapabilitiesResponse(BaseModel):
    """Shape returned by GET /api/v1/system/capabilities."""
    tenantId: Optional[str] = Field(
        None,
        description=(
            "Organization (tenant) ID the response is scoped to. Null when "
            "the user is not yet assigned to an organization."
        ),
    )
    modules: ModuleCapabilities
    checkedAt: datetime


# ─── Builder (shared with auth/me) ───────────────────────────────────────


async def build_capabilities_response(
    user: UserResponse,
) -> CapabilitiesResponse:
    """
    Assemble the capability payload for the given user.

    Used by both `/api/v1/system/capabilities` and `/api/v1/auth/me` so the
    two endpoints can never drift.

    - Tenant id: `user.organizationId` (may be None for unassigned users).
    - Finance.enabled: per-tenant flag (defaults True if missing).
    - Finance.reachable + version: cached health ping (60s TTL by default).
    """
    db = mongodb.get_database()
    redis_cache = await get_redis_cache()
    redis_client = redis_cache._redis if redis_cache.is_available else None

    # Reachability is global (one finance deployment per stack), so we
    # compute it even when the tenant has finance disabled — the frontend
    # may still want to show a "service available, not enabled for you"
    # state somewhere. Cheap because the ping itself is cached.
    reachable, version = await get_finance_reachability(redis_client)

    if user.organizationId:
        finance_enabled = await is_finance_enabled_for_org(
            db, redis_client, user.organizationId
        )
    else:
        # Reason: no org context → default to enabled so super_admins
        # bootstrapping a fresh tenant see the finance UI.
        finance_enabled = True

    return CapabilitiesResponse(
        tenantId=user.organizationId,
        modules=ModuleCapabilities(
            finance=FinanceModuleCapability(
                enabled=finance_enabled,
                reachable=reachable,
                version=version if reachable else None,
            )
        ),
        checkedAt=datetime.now(tz=timezone.utc),
    )


# ─── Endpoint ────────────────────────────────────────────────────────────


@router.get(
    "/capabilities",
    response_model=CapabilitiesResponse,
    summary="Get module capabilities for current tenant",
    description=(
        "Returns the operator-controlled and runtime-detected status of "
        "each optional module for the authenticated user's tenant. Used "
        "by the frontend to gate routes / sidebar entries and to decide "
        "whether to degrade purchasing dropdowns to free-text input."
    ),
)
async def get_capabilities(
    current_user: UserResponse = Depends(get_current_user),
) -> CapabilitiesResponse:
    """
    GET /api/v1/system/capabilities

    Auth: any authenticated user (so the UI can decide what to render
    immediately after login).
    """
    return await build_capabilities_response(current_user)
