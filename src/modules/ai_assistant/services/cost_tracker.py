"""
AI Assistant — Cost Tracker

Computes the USD cost of a Claude API call from usage counters and persists
the record to the `ai_assistant_cost_log` MongoDB collection.

Pricing for claude-sonnet-4-6 (May 2026):
  Input:        $3.00 / 1M tokens
  Output:       $15.00 / 1M tokens
  Cache write:  $3.75 / 1M tokens  (input * 1.25)
  Cache read:   $0.30 / 1M tokens  (input * 0.10)
"""

import logging
from datetime import datetime
from typing import Optional

from src.services.database import mongodb

from ..models.cost_log import AssistantCostLog

logger = logging.getLogger(__name__)

# Price per token in USD (Sonnet 4.6 rates)
_INPUT_PRICE_PER_TOKEN = 3.00 / 1_000_000
_OUTPUT_PRICE_PER_TOKEN = 15.00 / 1_000_000
_CACHE_WRITE_PRICE_PER_TOKEN = 3.75 / 1_000_000
_CACHE_READ_PRICE_PER_TOKEN = 0.30 / 1_000_000


def _compute_cost(
    input_tokens: int,
    output_tokens: int,
    cache_creation_tokens: int,
    cache_read_tokens: int,
) -> float:
    """
    Compute the USD cost of a single Claude API call.

    Args:
        input_tokens:          Uncached input tokens billed at full rate.
        output_tokens:         Generated output tokens.
        cache_creation_tokens: Tokens written to the prompt cache this turn.
        cache_read_tokens:     Tokens served from the prompt cache.

    Returns:
        Estimated cost in USD, rounded to 8 decimal places.
    """
    cost = (
        input_tokens * _INPUT_PRICE_PER_TOKEN
        + output_tokens * _OUTPUT_PRICE_PER_TOKEN
        + cache_creation_tokens * _CACHE_WRITE_PRICE_PER_TOKEN
        + cache_read_tokens * _CACHE_READ_PRICE_PER_TOKEN
    )
    return round(cost, 8)


class CostTracker:
    """
    Writes cost log records to MongoDB and exposes a compute helper.

    This class is stateless — a single shared instance is safe to use
    across concurrent requests.
    """

    async def record(
        self,
        user_id: str,
        conversation_id: str,
        input_tokens: int,
        output_tokens: int,
        cache_creation_tokens: int,
        cache_read_tokens: int,
        tool_calls: int = 0,
        model: str = "claude-sonnet-4-6",
        scope: str = "global",
        duration_seconds: Optional[float] = None,
    ) -> float:
        """
        Compute cost and persist a cost log document to MongoDB.

        Args:
            user_id:               Authenticated user ID.
            conversation_id:       Active conversation ID.
            input_tokens:          Uncached input tokens.
            output_tokens:         Output tokens generated.
            cache_creation_tokens: Tokens written to cache.
            cache_read_tokens:     Tokens read from cache.
            tool_calls:            Number of tool-use calls in this turn.
            model:                 Model ID string.
            scope:                 Context scope (block/farm/global).
            duration_seconds:      Wall-clock streaming duration.

        Returns:
            Computed cost in USD.
        """
        cost = _compute_cost(
            input_tokens,
            output_tokens,
            cache_creation_tokens,
            cache_read_tokens,
        )

        log = AssistantCostLog(
            user_id=user_id,
            conversation_id=conversation_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_creation_tokens=cache_creation_tokens,
            cache_read_tokens=cache_read_tokens,
            cost_usd=cost,
            tool_calls=tool_calls,
            model=model,
            scope=scope,
            created_at=datetime.utcnow(),
            duration_seconds=duration_seconds,
        )

        try:
            db = mongodb.get_database()
            await db.ai_assistant_cost_log.insert_one(log.model_dump())
        except Exception as exc:
            # Reason: Cost logging must never interrupt the user's chat session.
            # Log the error server-side and continue.
            logger.error(
                "Failed to persist cost log: %s",
                exc,
                exc_info=True,
            )

        return cost

    def compute(
        self,
        input_tokens: int,
        output_tokens: int,
        cache_creation_tokens: int,
        cache_read_tokens: int,
    ) -> float:
        """
        Compute cost without writing to the database (useful in tests).

        Args:
            input_tokens:          Uncached input tokens.
            output_tokens:         Output tokens generated.
            cache_creation_tokens: Tokens written to cache.
            cache_read_tokens:     Tokens read from cache.

        Returns:
            Estimated cost in USD.
        """
        return _compute_cost(
            input_tokens,
            output_tokens,
            cache_creation_tokens,
            cache_read_tokens,
        )


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_cost_tracker: Optional[CostTracker] = None


def get_cost_tracker() -> CostTracker:
    """
    Return the shared CostTracker singleton.

    Returns:
        CostTracker instance.
    """
    global _cost_tracker
    if _cost_tracker is None:
        _cost_tracker = CostTracker()
    return _cost_tracker
