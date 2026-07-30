"""
Protocols Module - Database Service

Manages the ``protocols`` collection. Uses the shared MongoDB connection.
"""

import logging

from src.services.database import mongodb

logger = logging.getLogger(__name__)

PROTOCOLS = "protocols"


class ProtocolsDatabaseManager:
    """Protocols module database manager."""

    @classmethod
    async def connect(cls) -> None:
        try:
            logger.info("[Protocols Module] Initializing protocol indexes...")
            await cls._create_indexes()
            logger.info("[Protocols Module] Protocol indexes initialized")
        except Exception as e:
            logger.error(f"[Protocols Module] Error initializing indexes: {e}")
            raise

    @classmethod
    async def _create_indexes(cls) -> None:
        try:
            db = mongodb.get_database()
            await db[PROTOCOLS].create_index("protocolId", unique=True)
            await db[PROTOCOLS].create_index("code", unique=True)
            await db[PROTOCOLS].create_index("category")
            await db[PROTOCOLS].create_index("status")
            await db[PROTOCOLS].create_index("tags")
            # The in-context lookup: "which active SOPs apply here". Compound
            # with status because only ACTIVE ones are ever offered at the bench.
            await db[PROTOCOLS].create_index("appliesTo")
            await db[PROTOCOLS].create_index([("appliesTo", 1), ("status", 1)])
            await db[PROTOCOLS].create_index([("createdAt", -1)])
            logger.info("[Protocols Module] MongoDB indexes created successfully")
        except Exception as e:
            logger.error(f"[Protocols Module] Error creating indexes: {e}")
            # Reason: indexes are not critical for startup; log and continue

    @classmethod
    async def disconnect(cls) -> None:
        logger.info("[Protocols Module] Shutdown (database managed by core)")

    @classmethod
    async def health_check(cls) -> bool:
        return await mongodb.health_check()

    @classmethod
    def get_database(cls):
        return mongodb.get_database()


protocols_db = ProtocolsDatabaseManager()
