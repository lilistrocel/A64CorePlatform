"""
Audit Log API — Read-Only List Endpoint

GET /api/v1/finance/audit-log

Returns a paginated, scoped list of audit_log rows for a given entity.
Only supports reading; writes are append-only side-effects of other handlers
(period close/reopen, manual JE posting, etc.).

Permissions:
  GET: accountant, finance_admin, auditor, finance_reviewer, super_admin, admin
  (read-only access to audit data is standard for reviewers and auditors)

Actor resolution: returns actorUserId only. The frontend resolves display
names via its existing user-fetch hooks — no cross-service call to the ops
backend is introduced here.
"""

import logging
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...middleware.auth import TokenPayload, require_roles
from ...models.orm.models import AuditLog
from ...models.schemas.common import PaginatedResponse
from ...utils.responses import paginated

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Audit Log"])

# ---------------------------------------------------------------------------
# Role constants
# ---------------------------------------------------------------------------

_READ_ROLES = (
    "accountant",
    "finance_admin",
    "finance_reviewer",
    "auditor",
    "super_admin",
    "admin",
)

# ---------------------------------------------------------------------------
# Entity type allow-list
#
# Only entity types that are actually written to audit_log by the finance
# service are permitted. This prevents callers from probing for arbitrary
# entity data and also makes the allow-list self-documenting.
#
# Sources verified in codebase (2026-05-29):
#   FiscalPeriod  — periods.py (CLOSE, REOPEN actions)
#   JournalEntry  — journal_entries.py (manual_je_posted action)
# ---------------------------------------------------------------------------

_ALLOWED_ENTITY_TYPES = frozenset(
    {
        "FiscalPeriod",
        "JournalEntry",
    }
)

# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------


class AuditLogEntry(BaseModel):
    """A single audit log event row, as returned by the list endpoint."""

    auditLogId: str = Field(..., description="Primary key UUID of the audit_log row.")
    action: str = Field(
        ...,
        description=(
            "The action that was performed, e.g. CLOSE, REOPEN, manual_je_posted."
        ),
    )
    entityType: str = Field(..., description="Type of the audited entity.")
    entityId: str = Field(..., description="UUID of the audited entity.")
    organizationId: str = Field(..., description="Organisation scope.")
    actorUserId: str = Field(
        ...,
        description=(
            "UUID of the user who performed the action. "
            "Resolve to display name via the ops /api/v1/admin/users endpoint."
        ),
    )
    beforeJson: Optional[dict] = Field(
        None,
        description="Entity state snapshot before the action (may be null).",
    )
    afterJson: Optional[dict] = Field(
        None,
        description="Entity state snapshot after the action (may be null).",
    )
    timestamp: datetime = Field(..., description="When the action was recorded (UTC).")

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.get(
    "/audit-log",
    response_model=PaginatedResponse[AuditLogEntry],
    summary="List audit log events",
    description=(
        "Return a paginated list of audit_log events for a specific entity. "
        "`organization_id`, `entity_type`, and `entity_id` are all required. "
        "Results are ordered newest first (timestamp DESC). "
        "Cross-org access is silently filtered — a request scoped to org A will "
        "never surface rows that belong to org B."
    ),
)
async def list_audit_log(
    organization_id: str = Query(..., description="Required — org scope."),
    entity_type: str = Query(
        ...,
        description=(
            "Required — entity type to filter on. "
            f"Allowed values: {sorted(_ALLOWED_ENTITY_TYPES)}."
        ),
    ),
    entity_id: str = Query(..., description="Required — UUID of the entity."),
    action: Optional[str] = Query(
        None,
        description=(
            "Optional — filter to a specific action, e.g. 'CLOSE', 'REOPEN', "
            "'manual_je_posted'."
        ),
    ),
    page: int = Query(1, ge=1, description="Page number (1-based)."),
    size: int = Query(
        200,
        ge=1,
        le=500,
        description="Items per page (default 200, max 500).",
    ),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> PaginatedResponse[AuditLogEntry]:
    """
    List audit log events for a specific entity.

    Cross-org isolation is enforced at the query level — every filter clause
    includes `organizationId == organization_id`. A caller scoped to org A
    will never receive rows for org B even if they supply org B's entity_id.
    We return an empty list rather than 403 to avoid disclosing entity
    existence to unauthorised callers.

    Args:
        organization_id: Required org scope.
        entity_type: Entity type (must be in the allow-list).
        entity_id: UUID of the entity being audited.
        action: Optional action filter (CLOSE, REOPEN, manual_je_posted, etc.).
        page: Page number (1-based).
        size: Items per page (1–500).
        db: Async DB session.
        _current_user: Authenticated user (any read-permitted role).

    Returns:
        Paginated AuditLogEntry items ordered newest-first.

    Raises:
        HTTPException 422: If entity_type is not in the allow-list.
    """
    # Reason: validate entity_type against an explicit allow-list to prevent
    # callers from probing for arbitrary entity data or injecting unexpected
    # values into filter predicates.
    if entity_type not in _ALLOWED_ENTITY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"entity_type '{entity_type}' is not permitted. "
                f"Allowed values: {sorted(_ALLOWED_ENTITY_TYPES)}."
            ),
        )

    # Base filter: org + entity type + entity id — all three required.
    # Reason: always include organizationId so rows from other orgs are
    # never returned regardless of what entity_id the caller provides.
    base_filter = [
        AuditLog.organizationId == organization_id,
        AuditLog.entityType == entity_type,
        AuditLog.entityId == entity_id,
    ]

    if action is not None:
        base_filter.append(AuditLog.action == action)

    # Count total matching rows for pagination metadata.
    from sqlalchemy import func

    count_result = await db.scalar(
        select(func.count()).select_from(AuditLog).where(*base_filter)
    )
    total = count_result or 0

    # Fetch the current page, newest first.
    offset = (page - 1) * size
    rows_result = await db.execute(
        select(AuditLog)
        .where(*base_filter)
        .order_by(AuditLog.timestamp.desc())
        .offset(offset)
        .limit(size)
    )
    rows = rows_result.scalars().all()

    items = [
        AuditLogEntry(
            auditLogId=row.auditId,
            action=row.action,
            entityType=row.entityType,
            entityId=row.entityId,
            organizationId=row.organizationId,
            actorUserId=row.actorUserId,
            beforeJson=row.beforeJson,
            afterJson=row.afterJson,
            timestamp=row.timestamp,
        )
        for row in rows
    ]

    logger.debug(
        "[Finance/AuditLog] list org=%s entityType=%s entityId=%s action=%s "
        "page=%d size=%d → %d rows (total=%d)",
        organization_id,
        entity_type,
        entity_id,
        action,
        page,
        size,
        len(items),
        total,
    )

    return paginated(items=items, total=total, page=page, size=size)
