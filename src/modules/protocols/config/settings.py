"""
Protocols Module - Settings
"""

import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Protocols module settings"""

    MODULE_NAME: str = "protocols"
    MODULE_VERSION: str = "1.0.0"

    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://mongodb:27017")
    MONGODB_DB_NAME: str = os.getenv("MONGODB_DB_NAME", "a64core")

    API_PREFIX: str = "/api/v1"

    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
