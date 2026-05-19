"""
Finance Consumer Worker — Entry Point

Long-lived process that:
    1. Connects to MongoDB.
    2. Ensures outbox indexes exist.
    3. Runs a poll loop forever: claim → deliver → update.
    4. Shuts down gracefully on SIGTERM / SIGINT.

Invocation:
    python -m consumer.main

Env vars (see config.py for full list):
    MONGODB_URL                     MongoDB connection string
    FINANCE_URL                     Finance service base URL
    FINANCE_INGESTION_SECRET        Shared secret for X-Service-Secret header
    CONSUMER_POLL_INTERVAL_SECONDS  Seconds between poll cycles (default 5)
    CONSUMER_BATCH_SIZE             Events per cycle (default 50)
    CONSUMER_MAX_ATTEMPTS           Max delivery attempts per event (default 5)
    LOG_LEVEL                       Logging level (default INFO)
"""

import asyncio
import logging
import signal
import sys

from . import mongo
from .config import settings
from .finance_client import FinanceClient
from .poller import run_poll_cycle

# Structured JSON logging would be ideal for production; for simplicity we
# use a single-line format compatible with Docker's json-file driver.
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
    stream=sys.stdout,
)
logger = logging.getLogger("consumer")

_shutdown_event = asyncio.Event()


def _handle_signal(signum: int, frame: object) -> None:
    """Handle SIGTERM/SIGINT by setting the shutdown event."""
    sig_name = signal.Signals(signum).name
    logger.info("[Consumer] received signal %s — initiating graceful shutdown", sig_name)
    _shutdown_event.set()


async def main() -> None:
    """
    Main async entry point.

    Connects to MongoDB, starts the finance HTTP client, then loops until
    SIGTERM/SIGINT received.
    """
    # Register signal handlers
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    logger.info(
        "[Consumer] starting — poll_interval=%ds batch_size=%d max_attempts=%d",
        settings.CONSUMER_POLL_INTERVAL_SECONDS,
        settings.CONSUMER_BATCH_SIZE,
        settings.CONSUMER_MAX_ATTEMPTS,
    )

    try:
        await mongo.connect()
        await mongo.ensure_indexes()
    except Exception as exc:
        logger.critical("[Consumer] failed to connect to MongoDB: %s", exc)
        sys.exit(1)

    finance_client = FinanceClient()
    logger.info(
        "[Consumer] finance ingest URL: %s", settings.ingest_url
    )

    try:
        while not _shutdown_event.is_set():
            try:
                count = await run_poll_cycle(finance_client)
                if count == 0:
                    # Reason: no work this cycle — sleep full interval before rechecking
                    logger.debug("[Consumer] no pending events, sleeping %ds",
                                 settings.CONSUMER_POLL_INTERVAL_SECONDS)
                else:
                    # Reason: processed some events — brief sleep then check again
                    # in case more arrived during processing
                    logger.debug("[Consumer] processed %d events, brief sleep", count)
            except Exception as exc:
                logger.exception("[Consumer] poll cycle error: %s", exc)

            # Wait for poll interval or shutdown signal, whichever comes first
            try:
                await asyncio.wait_for(
                    _shutdown_event.wait(),
                    timeout=settings.CONSUMER_POLL_INTERVAL_SECONDS,
                )
            except asyncio.TimeoutError:
                pass  # Normal — interval elapsed, loop again
    finally:
        logger.info("[Consumer] shutting down...")
        await finance_client.close()
        await mongo.close()
        logger.info("[Consumer] shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())
