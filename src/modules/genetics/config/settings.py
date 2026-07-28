"""
Genetics Repo Module - Settings

Configuration for the genetics module. Uses A64Core's shared MongoDB connection.
"""

import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Genetics module settings"""

    # Module information
    MODULE_NAME: str = "genetics"
    MODULE_VERSION: str = "1.0.0"

    # MongoDB connection (uses A64Core's database)
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://mongodb:27017")
    MONGODB_DB_NAME: str = os.getenv("MONGODB_DB_NAME", "a64core")

    # API settings
    API_PREFIX: str = "/api/v1/genetics"

    # Pagination defaults
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # Lineage traversal guards — a deep clone chain with wide fan-out can blow
    # up quickly, so both depth and total nodes are capped per request.
    MAX_LINEAGE_DEPTH: int = 25
    MAX_LINEAGE_NODES: int = 500

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
