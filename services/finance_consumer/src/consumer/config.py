"""
Consumer Worker Configuration

All settings loaded from environment variables; no .env file loading.
Defaults are suitable for local Docker Compose development.
"""

from pydantic_settings import BaseSettings


class ConsumerSettings(BaseSettings):
    """Settings for the finance outbox consumer worker."""

    # MongoDB — same instance as the main A64 app
    MONGODB_URL: str = "mongodb://mongodb:27017/a64core_db"
    MONGODB_DB_NAME: str = "a64core_db"

    # Finance service ingestion endpoint
    FINANCE_URL: str = "http://finance:8001"
    FINANCE_INGEST_PATH: str = "/api/v1/finance/events/ingest"

    # Service-to-service shared secret
    # CRITICAL: must match FINANCE_INGESTION_SECRET on the finance container
    FINANCE_INGESTION_SECRET: str = "dev-only-secret-change-in-prod"

    # Poll behaviour
    CONSUMER_POLL_INTERVAL_SECONDS: int = 5
    CONSUMER_BATCH_SIZE: int = 50
    CONSUMER_MAX_ATTEMPTS: int = 5

    # Stale claim recovery: re-claim events stuck in 'processing' for > N seconds
    CONSUMER_STALE_CLAIM_SECONDS: int = 300

    # HTTP client
    HTTP_TIMEOUT_SECONDS: float = 10.0

    # Logging
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = None  # Never load .env files — env vars only
        case_sensitive = True

    @property
    def ingest_url(self) -> str:
        """Full URL for the finance ingestion endpoint."""
        return f"{self.FINANCE_URL.rstrip('/')}{self.FINANCE_INGEST_PATH}"


settings = ConsumerSettings()
