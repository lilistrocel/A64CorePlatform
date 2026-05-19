"""
Finance Consumer Worker

Long-lived Python process that polls the `finance_outbox` MongoDB collection
and delivers events to the finance service ingestion endpoint.

Entry point: python -m consumer.main
"""
