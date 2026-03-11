"""
Mushroom Management Module - Settings

Configuration settings for the mushroom management module.
Uses A64Core's MongoDB connection.
"""

import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Mushroom module settings"""

    # Module information
    MODULE_NAME: str = "mushroom-management"
    MODULE_VERSION: str = "1.0.0"

    # MongoDB connection (uses A64Core's database)
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://mongodb:27017")
    MONGODB_DB_NAME: str = os.getenv("MONGODB_DB_NAME", "a64core")

    # API settings
    API_PREFIX: str = "/api/v1/mushroom"

    # Pagination defaults
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
