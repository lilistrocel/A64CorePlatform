"""
Application Settings Module

Manages environment variables and configuration settings
"""

from pydantic_settings import BaseSettings
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
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000"
    ]

    # Database Settings - MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "a64core_db"

    # Database Settings - MySQL
    MYSQL_HOST: str = "localhost"
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = "root"
    MYSQL_PASSWORD: str = ""
    MYSQL_DB_NAME: str = "a64core_db"

    # Security Settings
    SECRET_KEY: str = "dev_secret_key_change_in_production"
    API_KEY_PREFIX: str = "dev_key"

    # Email Settings
    FRONTEND_URL: str = "http://localhost:3000"
    FROM_EMAIL: str = "noreply@a64core.com"
    # SENDGRID_API_KEY: str = ""  # Add in production

    # Logging
    LOG_LEVEL: str = "INFO"

    class Config:
        """Pydantic config class"""
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


# Create settings instance
settings = Settings()
