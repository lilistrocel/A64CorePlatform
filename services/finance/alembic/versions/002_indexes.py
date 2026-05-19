"""Add covering indexes for common query patterns

Revision ID: 002
Revises: 001
Create Date: 2026-05-19 00:00:01.000000

Extra indexes for write-path performance and common read patterns.
Migration 001 adds the primary indexes; this migration adds covering indexes
that surface during high-volume inserts (e.g. CoA seed) and common queries.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # gl_accounts: speed up drawer-filtered CoA listing
    op.create_index(
        "ix_gl_accounts_org_drawer",
        "gl_accounts",
        ["organizationId", "drawer"],
    )
    # gl_accounts: fast parent-child tree traversal
    op.create_index(
        "ix_gl_accounts_parentAccountId",
        "gl_accounts",
        ["parentAccountId"],
    )
    # gl_accounts: fast active-account lookup
    op.create_index(
        "ix_gl_accounts_org_active",
        "gl_accounts",
        ["organizationId", "isActive"],
    )

    # fiscal_periods: fast open-period lookup (most common query)
    op.create_index(
        "ix_fiscal_periods_company_status",
        "fiscal_periods",
        ["companyCode", "status"],
    )

    # vendors: fast org-active combined filter
    op.create_index(
        "ix_vendors_org_active",
        "vendors",
        ["organizationId", "isActive"],
    )

    # audit_log: fast actor lookup for compliance queries
    op.create_index(
        "ix_audit_log_actor",
        "audit_log",
        ["actorUserId", "timestamp"],
    )
    # audit_log: fast entity-type + entity-id lookup
    op.create_index(
        "ix_audit_log_entity",
        "audit_log",
        ["entityType", "entityId"],
    )


def downgrade() -> None:
    op.drop_index("ix_audit_log_entity", "audit_log")
    op.drop_index("ix_audit_log_actor", "audit_log")
    op.drop_index("ix_vendors_org_active", "vendors")
    op.drop_index("ix_fiscal_periods_company_status", "fiscal_periods")
    op.drop_index("ix_gl_accounts_org_active", "gl_accounts")
    op.drop_index("ix_gl_accounts_parentAccountId", "gl_accounts")
    op.drop_index("ix_gl_accounts_org_drawer", "gl_accounts")
