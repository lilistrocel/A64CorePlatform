"""
Finance Service Configuration

All settings are loaded from environment variables only (no .env file).
Uses the same SECRET_KEY env var as the main A64 app so JWT tokens
issued by the main app are accepted here without a round-trip to MongoDB.
"""

from pydantic_settings import BaseSettings
from pydantic import model_validator
from typing import List


class Settings(BaseSettings):
    """Finance service settings loaded from environment variables."""

    # Application
    APP_NAME: str = "A64 Finance Service"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8001

    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
        "http://localhost:80",
        "http://localhost",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
    ]

    # MySQL (primary store for finance service)
    MYSQL_HOST: str = "mysql"
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = "finance_user"
    MYSQL_PASSWORD: str = "finance_password"
    MYSQL_DATABASE: str = "finance_db"

    # JWT — must match the main app's SECRET_KEY exactly
    SECRET_KEY: str = "dev_secret_key_change_in_production"
    JWT_ALGORITHM: str = "HS256"

    # Logging
    LOG_LEVEL: str = "INFO"

    @property
    def database_url(self) -> str:
        """Async MySQL URL for SQLAlchemy (asyncmy driver)."""
        return (
            f"mysql+asyncmy://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"
        )

    @property
    def alembic_database_url(self) -> str:
        """Synchronous MySQL URL for Alembic migrations."""
        return (
            f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"
        )

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        """Enforce strong secrets in production."""
        if self.ENVIRONMENT != "development":
            if self.SECRET_KEY == "dev_secret_key_change_in_production":
                raise ValueError(
                    "SECRET_KEY must be overridden in production via environment variable."
                )
            if self.DEBUG:
                raise ValueError("DEBUG must be False in production.")
        return self

    class Config:
        env_file = None  # Never load .env files — env vars only
        case_sensitive = True


settings = Settings()
