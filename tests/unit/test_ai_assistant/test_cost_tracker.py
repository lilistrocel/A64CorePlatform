"""
Unit tests for ai_assistant.services.cost_tracker.

Tests:
  - Cost computation formulas for each token type.
  - Zero-token edge case.
  - record() writes to MongoDB and returns the computed cost.
  - record() swallows DB errors gracefully (cost logging must never crash chat).
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# _compute_cost (private function) — tested via CostTracker.compute()
# ---------------------------------------------------------------------------


def test_compute_cost_output_only():
    """Pure output tokens should be priced at $15/1M."""
    from src.modules.ai_assistant.services.cost_tracker import CostTracker

    tracker = CostTracker()
    cost = tracker.compute(
        input_tokens=0,
        output_tokens=1_000_000,
        cache_creation_tokens=0,
        cache_read_tokens=0,
    )
    assert abs(cost - 15.0) < 1e-6


def test_compute_cost_input_only():
    """Pure uncached input tokens should be priced at $3/1M."""
    from src.modules.ai_assistant.services.cost_tracker import CostTracker

    tracker = CostTracker()
    cost = tracker.compute(
        input_tokens=1_000_000,
        output_tokens=0,
        cache_creation_tokens=0,
        cache_read_tokens=0,
    )
    assert abs(cost - 3.0) < 1e-6


def test_compute_cost_cache_write():
    """Cache write tokens should be priced at $3.75/1M (25% surcharge)."""
    from src.modules.ai_assistant.services.cost_tracker import CostTracker

    tracker = CostTracker()
    cost = tracker.compute(
        input_tokens=0,
        output_tokens=0,
        cache_creation_tokens=1_000_000,
        cache_read_tokens=0,
    )
    assert abs(cost - 3.75) < 1e-6


def test_compute_cost_cache_read():
    """Cache read tokens should be priced at $0.30/1M (90% discount from input)."""
    from src.modules.ai_assistant.services.cost_tracker import CostTracker

    tracker = CostTracker()
    cost = tracker.compute(
        input_tokens=0,
        output_tokens=0,
        cache_creation_tokens=0,
        cache_read_tokens=1_000_000,
    )
    assert abs(cost - 0.30) < 1e-6


def test_compute_cost_zero():
    """All-zero tokens should produce zero cost."""
    from src.modules.ai_assistant.services.cost_tracker import CostTracker

    tracker = CostTracker()
    cost = tracker.compute(0, 0, 0, 0)
    assert cost == 0.0


def test_compute_cost_mixed():
    """Mixed token scenario should sum each component correctly."""
    from src.modules.ai_assistant.services.cost_tracker import CostTracker

    tracker = CostTracker()
    # 1k input ($0.003) + 500 output ($0.0075) + 200 cache write ($0.00075)
    # + 100 cache read ($0.00003) = $0.01128
    cost = tracker.compute(
        input_tokens=1000,
        output_tokens=500,
        cache_creation_tokens=200,
        cache_read_tokens=100,
    )
    expected = (
        1000 * 3.0 / 1_000_000
        + 500 * 15.0 / 1_000_000
        + 200 * 3.75 / 1_000_000
        + 100 * 0.30 / 1_000_000
    )
    assert abs(cost - expected) < 1e-10


# ---------------------------------------------------------------------------
# CostTracker.record() — writes to MongoDB
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_record_inserts_document():
    """record() should insert a document into ai_assistant_cost_log."""
    from src.modules.ai_assistant.services.cost_tracker import CostTracker

    mock_collection = AsyncMock()
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)
    mock_db.ai_assistant_cost_log = mock_collection

    tracker = CostTracker()

    with patch("src.modules.ai_assistant.services.cost_tracker.mongodb") as mock_mongodb:
        mock_mongodb.get_database.return_value = mock_db

        cost = await tracker.record(
            user_id="user-1",
            conversation_id="conv-1",
            input_tokens=1000,
            output_tokens=500,
            cache_creation_tokens=0,
            cache_read_tokens=0,
        )

    assert cost > 0
    mock_collection.insert_one.assert_awaited_once()
    inserted = mock_collection.insert_one.call_args[0][0]
    assert inserted["user_id"] == "user-1"
    assert inserted["conversation_id"] == "conv-1"
    assert inserted["input_tokens"] == 1000


@pytest.mark.asyncio
async def test_record_swallows_db_error():
    """record() must not raise when MongoDB write fails."""
    from src.modules.ai_assistant.services.cost_tracker import CostTracker

    tracker = CostTracker()

    with patch("src.modules.ai_assistant.services.cost_tracker.mongodb") as mock_mongodb:
        mock_mongodb.get_database.side_effect = Exception("DB down")

        # Should NOT raise — cost logging is non-critical
        cost = await tracker.record(
            user_id="user-1",
            conversation_id="conv-1",
            input_tokens=100,
            output_tokens=50,
            cache_creation_tokens=0,
            cache_read_tokens=0,
        )

    assert cost > 0
