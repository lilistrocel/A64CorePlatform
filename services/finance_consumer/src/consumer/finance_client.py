"""
Finance HTTP Client

Sends events to the finance service ingestion endpoint with exponential
backoff retry on transient failures.

Service-to-service auth uses the X-Service-Secret header (shared secret)
rather than a JWT — this call never goes through the user auth flow.
"""

import asyncio
import logging
from typing import Any, Dict, Tuple
from uuid import UUID

import httpx

from .config import settings

logger = logging.getLogger(__name__)

# Exponential backoff: base * 2^attempt — caps at 60 seconds
_BACKOFF_BASE_SECONDS = 1.0
_BACKOFF_MAX_SECONDS = 60.0


def _backoff(attempt: int) -> float:
    """
    Calculate exponential backoff delay in seconds.

    Args:
        attempt: Zero-indexed attempt number.

    Returns:
        Seconds to wait before the next retry.
    """
    delay = min(_BACKOFF_BASE_SECONDS * (2**attempt), _BACKOFF_MAX_SECONDS)
    return delay


class FinanceClient:
    """
    Async HTTP client for the finance service ingestion endpoint.

    Uses httpx.AsyncClient for connection pooling.  Create a single
    instance and reuse it across poll iterations.
    """

    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(settings.HTTP_TIMEOUT_SECONDS),
            headers={
                "Content-Type": "application/json",
                "X-Service-Secret": settings.FINANCE_INGESTION_SECRET,
            },
        )

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._client.aclose()

    async def ingest_event(
        self, event_doc: Dict[str, Any]
    ) -> Tuple[bool, bool, str]:
        """
        POST an outbox event to the finance ingestion endpoint.

        Handles the three expected response codes:
            200 status=processed       — success, first time
            200 status=already_processed — idempotent success
            4xx                        — permanent failure (bad payload)
            5xx / timeout / network    — transient failure, caller should retry

        Args:
            event_doc: The MongoDB outbox document to deliver.

        Returns:
            Tuple of (success: bool, is_permanent_failure: bool, message: str).
                success=True  → event delivered or already processed.
                success=False, is_permanent_failure=True  → don't retry.
                success=False, is_permanent_failure=False → transient, retry.
        """
        # Build envelope matching BaseFinanceEvent schema
        payload = {
            "eventId": str(event_doc["eventId"]),
            "eventType": event_doc["eventType"],
            "organizationId": str(event_doc["organizationId"]),
            "companyCode": event_doc["companyCode"],
            "occurredAt": event_doc["occurredAt"].isoformat()
            if hasattr(event_doc["occurredAt"], "isoformat")
            else str(event_doc["occurredAt"]),
            "sourceUserId": str(event_doc["sourceUserId"]),
            "sourceDocumentId": event_doc.get("sourceDocumentId"),
            "payload": event_doc["payload"],
        }

        try:
            response = await self._client.post(
                settings.ingest_url,
                json=payload,
            )

            if response.status_code == 200:
                data = response.json()
                status = data.get("status", "")
                if status in ("processed", "already_processed"):
                    logger.info(
                        "[Consumer] event delivered event_id=%s status=%s",
                        event_doc["eventId"],
                        status,
                    )
                    return True, False, status
                # Unexpected 200 body — treat as success
                return True, False, "ok"

            if 400 <= response.status_code < 500:
                # Reason: 4xx means the event itself is bad — no point retrying
                msg = f"HTTP {response.status_code}: {response.text[:200]}"
                logger.error(
                    "[Consumer] permanent failure event_id=%s %s",
                    event_doc["eventId"],
                    msg,
                )
                return False, True, msg

            # 5xx or unexpected status — transient
            msg = f"HTTP {response.status_code}: {response.text[:200]}"
            logger.warning(
                "[Consumer] transient failure event_id=%s %s",
                event_doc["eventId"],
                msg,
            )
            return False, False, msg

        except httpx.TimeoutException as exc:
            msg = f"Timeout: {exc}"
            logger.warning(
                "[Consumer] timeout event_id=%s %s",
                event_doc["eventId"],
                msg,
            )
            return False, False, msg

        except httpx.RequestError as exc:
            msg = f"Network error: {exc}"
            logger.warning(
                "[Consumer] network error event_id=%s %s",
                event_doc["eventId"],
                msg,
            )
            return False, False, msg
