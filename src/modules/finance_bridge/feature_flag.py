"""
Finance Outbox Feature Flag

Controls whether OutboxWriter.publish() is active or a no-op.

Set the environment variable FINANCE_OUTBOX_ENABLED=true to activate the
outbox bridge.  When the variable is absent or set to any other value the
writer silently returns without writing anything, keeping the main app safe
when the finance service is not deployed.
"""

import os


def is_outbox_enabled() -> bool:
    """
    Return True if the finance outbox bridge is enabled.

    Reads the FINANCE_OUTBOX_ENABLED environment variable.
    Accepted truthy values (case-insensitive): "true", "1", "yes".

    Returns:
        bool: True if the outbox is enabled, False otherwise.
    """
    value = os.getenv("FINANCE_OUTBOX_ENABLED", "false").strip().lower()
    return value in ("true", "1", "yes")
