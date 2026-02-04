"""
Application Settings Module

Manages environment variables and configuration settings
"""

from pydantic_settings import BaseSettings
from pydantic import model_validator
from typing import List
import os


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables

    All settings can be overridden via environment variables or .env file
    """

    # Application Settings
    APP_NAME: str = "A64 Core Platform API Hub"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Server Settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # CORS Settings
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",        # Vite dev server (user-portal)
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",        # Vite dev server (127.0.0.1)
        "http://127.0.0.1:8000",
        "http://localhost:80",          # Nginx proxy
        "http://localhost",             # Nginx proxy (shorthand)
    ]

    # Database Settings - MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "a64core_db"

    # Security Settings
    SECRET_KEY: str = "dev_secret_key_change_in_production"
    API_KEY_PREFIX: str = "dev_key"

    # Email Settings
    FRONTEND_URL: str = "http://localhost:3000"
    FROM_EMAIL: str = "noreply@a64core.com"
    # SENDGRID_API_KEY: str = ""  # Add in production

    # Logging
    LOG_LEVEL: str = "INFO"

    @model_validator(mode='after')
    def validate_production_settings(self):
        if self.ENVIRONMENT != "development":
            if self.SECRET_KEY == "dev_secret_key_change_in_production":
                raise ValueError(
                    "SECRET_KEY must be set in production! "
                    "Do not use the default value."
                )
            if self.DEBUG:
                raise ValueError("DEBUG must be False in production!")
        return self

    class Config:
        """Pydantic config class"""
        # Disable .env file loading - use environment variables only
        # This prevents parsing errors with comma-separated values
        env_file = None
        env_file_encoding = "utf-8"
        case_sensitive = True


# Create settings instance
settings = Settings()
