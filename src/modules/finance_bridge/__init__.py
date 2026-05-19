"""
Finance Bridge Module

Provides the outbox writer and repository for publishing finance domain
events from the main A64 app into the `finance_outbox` MongoDB collection.

The consumer worker (services/finance_consumer/) polls this collection and
POSTs events to the finance service ingestion endpoint.

This module is gated by the FINANCE_OUTBOX_ENABLED feature flag (default
False) so the main app continues to operate normally when the finance
service is not deployed.

Public API
----------
    from src.modules.finance_bridge.outbox_writer import OutboxWriter
    from src.modules.finance_bridge.feature_flag import is_outbox_enabled
"""
