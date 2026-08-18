"""
Admin Audit Log — shared writer for user-targeted admin actions.

`admin_audit_log` already receives entries from several independent call
sites (deployment_settings_service.update(), the organizations.py
modules-update endpoint, admin.py's mfa_reset, the genetics cascade-purge /
orphan-sweep routes) — each one hand-builds the same document shape ad hoc.
This module exists so the *next* call sites (role changes, activation /
deactivation) reuse that shape instead of becoming a 5th copy-paste.

Document shape (matches every existing user-targeted entry, e.g. the
`mfa_reset` audit write in `api/v1/admin.py`):

    action: str              # dotted convention, e.g. "user.role.changed"
    targetUserId: str
    targetUserEmail: str | None
    performedBy: str         # actor userId (or "system:<name>" for
                              # server-initiated actions with no HTTP actor)
    performedByEmail: str
    performedByRole: str
    timestamp: datetime      # UTC, tz-aware
    details: dict            # action-specific before/after values

This is intentionally the *only* place that writes user-targeted admin
audit entries going forward — do not hand-roll another `insert_one` for a
new user action; add a call here instead.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from .database import mongodb

logger = logging.getLogger(__name__)


async def write_user_audit_log(
    action: str,
    target_user_id: str,
    target_user_email: Optional[str],
    performed_by: str,
    performed_by_email: str,
    performed_by_role: Any,
    details: Dict[str, Any],
) -> None:
    """
    Write one entry to `admin_audit_log` for a user-targeted admin action.

    Args:
        action: Dotted action name, e.g. "user.role.changed",
            "user.activated", "user.deactivated".
        target_user_id: userId of the user the action was performed on.
        target_user_email: Email of the target user, for a human-readable
            trail even if the account is later deleted.
        performed_by: userId of the actor. Use "system:<callable_name>"
            (e.g. "system:seed_admin") for server-initiated actions that
            have no authenticated HTTP caller.
        performed_by_email: Email of the actor (or "system" for
            server-initiated actions).
        performed_by_role: The actor's role — a `UserRole` enum member or
            its string value; normalized to a string before writing.
        details: Action-specific payload — at minimum a "before"/"after"
            pair so the change is reconstructable later.

    Raises:
        Nothing. A logging/DB failure here must never block the action it
        is auditing — errors are logged and swallowed, matching the
        best-effort posture of every other admin_audit_log writer in this
        codebase (none of them roll back the mutation if the audit insert
        fails).
    """
    role_value = (
        performed_by_role.value
        if hasattr(performed_by_role, "value")
        else performed_by_role
    )
    audit_entry = {
        "action": action,
        "targetUserId": target_user_id,
        "targetUserEmail": target_user_email,
        "performedBy": performed_by,
        "performedByEmail": performed_by_email,
        "performedByRole": role_value,
        "timestamp": datetime.now(timezone.utc),
        "details": details,
    }
    try:
        db = mongodb.get_database()
        await db.admin_audit_log.insert_one(audit_entry)
    except Exception:
        # Reason: an audit-log write failure must not surface as a failure
        # of the (already-committed) action it is recording.
        logger.error("Failed to write admin_audit_log entry: %s", audit_entry, exc_info=True)
