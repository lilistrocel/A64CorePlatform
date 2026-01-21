"""
HR Module - Settings

Configuration settings for the HR module.
Uses A64Core's MongoDB connection.
"""

import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """HR module settings"""

    # Module information
    MODULE_NAME: str = "hr"
    MODULE_VERSION: str = "1.0.0"

    # MongoDB connection (uses A64Core's database)
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://mongodb:27017")
    MONGODB_DB_NAME: str = os.getenv("MONGODB_DB_NAME", "a64core")

    # API settings
    API_PREFIX: str = "/api/v1/hr"

    # A64Core API integration
    A64CORE_API_URL: str = os.getenv("A64CORE_API_URL", "http://api:8000")

    # JWT settings (from A64Core)
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-here")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # CORS settings
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000")

    # Pagination defaults
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
