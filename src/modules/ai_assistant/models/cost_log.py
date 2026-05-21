"""
AI Assistant — Cost log model.

Documents written to `ai_assistant_cost_log` MongoDB collection after each
successful API call to Claude. Used for cost monitoring and audit.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AssistantCostLog(BaseModel):
    """
    Cost tracking record for a single Claude API call.

    Pricing (Sonnet 4.6 as of May 2026):
      Input tokens:              $3.00 / 1M
      Output tokens:             $15.00 / 1M
      Cache write tokens:        $3.75 / 1M  (25% write surcharge)
      Cache read tokens:         $0.30 / 1M  (90% discount)
    """

    user_id: str
    conversation_id: str
    # Raw token counts from usage object
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0
    # Computed cost in USD
    cost_usd: float = 0.0
    # Number of tool-use calls in this turn
    tool_calls: int = 0
    model: str = "claude-sonnet-4-6"
    scope: str = "global"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # Optional: duration of the streaming call in seconds
    duration_seconds: Optional[float] = None
