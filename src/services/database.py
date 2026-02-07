"""
Database Connection Manager

Manages connections to MongoDB database with connection pooling,
health checks, and graceful shutdown.
"""

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure
from typing import Optional
import logging

from ..config.settings import settings

logger = logging.getLogger(__name__)


class MongoDBManager:
    """
    MongoDB connection manager using Motor (async driver)

    Provides async connection pooling and database access
    """

    client: Optional[AsyncIOMotorClient] = None
    db = None

    @classmethod
    async def connect(cls) -> None:
        """
        Establish connection to MongoDB

        Raises:
            ConnectionFailure: If unable to connect to MongoDB
        """
        try:
            logger.info(f"Connecting to MongoDB at {settings.MONGODB_URL}")
            cls.client = AsyncIOMotorClient(
                settings.MONGODB_URL,
                maxPoolSize=50,
                minPoolSize=10,
                serverSelectionTimeoutMS=5000
            )

            # Verify connection
            await cls.client.admin.command('ping')

            cls.db = cls.client[settings.MONGODB_DB_NAME]
            logger.info(f"Connected to MongoDB database: {settings.MONGODB_DB_NAME}")

            # Create indexes
            await cls._create_indexes()

        except ConnectionFailure as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error connecting to MongoDB: {e}")
            raise

    @classmethod
    async def _create_indexes(cls) -> None:
        """Create database indexes for optimal query performance"""
        try:
            # Users collection indexes
            await cls.db.users.create_index("email", unique=True)
            await cls.db.users.create_index("userId", unique=True)
            await cls.db.users.create_index("role")
            await cls.db.users.create_index([("createdAt", -1)])

            # Refresh tokens collection indexes
            await cls.db.refresh_tokens.create_index("tokenId", unique=True)
            await cls.db.refresh_tokens.create_index("userId")
            await cls.db.refresh_tokens.create_index(
                "expiresAt",
                expireAfterSeconds=0  # TTL index for automatic deletion
            )

            # Verification tokens collection indexes
            await cls.db.verification_tokens.create_index("tokenId", unique=True)
            await cls.db.verification_tokens.create_index("userId")
            await cls.db.verification_tokens.create_index("email")
            await cls.db.verification_tokens.create_index("tokenType")
            await cls.db.verification_tokens.create_index(
                "expiresAt",
                expireAfterSeconds=0  # TTL index for automatic deletion
            )

            # Installed modules collection indexes (Module Management System)
            await cls.db.installed_modules.create_index("module_name", unique=True)
            await cls.db.installed_modules.create_index("status")
            await cls.db.installed_modules.create_index("health")
            await cls.db.installed_modules.create_index("installed_by_user_id")
            await cls.db.installed_modules.create_index([("installed_at", -1)])
            await cls.db.installed_modules.create_index([("updated_at", -1)])
            await cls.db.installed_modules.create_index("container_id")

            # Module audit log collection indexes (Module Management System)
            await cls.db.module_audit_log.create_index("module_name")
            await cls.db.module_audit_log.create_index("operation")
            await cls.db.module_audit_log.create_index("user_id")
            await cls.db.module_audit_log.create_index("status")
            await cls.db.module_audit_log.create_index([("timestamp", -1)])
            await cls.db.module_audit_log.create_index(
                "timestamp",
                expireAfterSeconds=7776000  # TTL index: 90 days (90*24*60*60)
            )

            # AI query log collection indexes (AI Analytics cost tracking)
            await cls.db.ai_query_log.create_index("user_id")
            await cls.db.ai_query_log.create_index([("timestamp", -1)])
            await cls.db.ai_query_log.create_index([("user_id", 1), ("timestamp", -1)])

            # =================================================================
            # MFA (Multi-Factor Authentication) Collection Indexes
            # =================================================================

            # user_mfa collection - stores TOTP secrets and MFA configuration per user
            # One MFA record per user (userId is unique index)
            await cls.db.user_mfa.create_index("mfaId", unique=True)
            await cls.db.user_mfa.create_index("userId", unique=True)
            await cls.db.user_mfa.create_index("isEnabled")
            await cls.db.user_mfa.create_index([("createdAt", -1)])
            await cls.db.user_mfa.create_index([("updatedAt", -1)])
            logger.info("MFA user_mfa collection indexes created")

            # mfa_backup_codes collection - stores hashed backup codes
            # Multiple codes per user, lookup by userId + codeHash
            await cls.db.mfa_backup_codes.create_index("codeId", unique=True)
            await cls.db.mfa_backup_codes.create_index("userId")
            await cls.db.mfa_backup_codes.create_index([("userId", 1), ("codeHash", 1)])
            await cls.db.mfa_backup_codes.create_index("isUsed")
            await cls.db.mfa_backup_codes.create_index([("userId", 1), ("isUsed", 1)])
            # TTL index: automatically delete used backup codes after 90 days
            await cls.db.mfa_backup_codes.create_index(
                "expiresAt",
                expireAfterSeconds=0  # TTL uses expiresAt field value directly
            )
            logger.info("MFA mfa_backup_codes collection indexes created")

            # mfa_audit_log collection - security audit trail for MFA actions
            await cls.db.mfa_audit_log.create_index("logId", unique=True)
            await cls.db.mfa_audit_log.create_index("userId")
            await cls.db.mfa_audit_log.create_index("action")
            await cls.db.mfa_audit_log.create_index([("timestamp", -1)])
            await cls.db.mfa_audit_log.create_index([("userId", 1), ("timestamp", -1)])
            await cls.db.mfa_audit_log.create_index([("userId", 1), ("action", 1)])
            await cls.db.mfa_audit_log.create_index("performedBy")  # For admin action lookups
            # Optional: TTL index for log retention (keep 1 year = 31536000 seconds)
            # Uncomment if you want automatic log cleanup:
            # await cls.db.mfa_audit_log.create_index(
            #     "timestamp",
            #     expireAfterSeconds=31536000  # 1 year retention
            # )
            logger.info("MFA mfa_audit_log collection indexes created")

            # Admin audit log collection indexes (admin actions including MFA reset)
            await cls.db.admin_audit_log.create_index("action")
            await cls.db.admin_audit_log.create_index("performedBy")
            await cls.db.admin_audit_log.create_index("targetUserId")
            await cls.db.admin_audit_log.create_index([("timestamp", -1)])
            logger.info("Admin audit log collection indexes created")

            logger.info("MongoDB indexes created successfully")
        except Exception as e:
            logger.error(f"Error creating MongoDB indexes: {e}")
            # Don't raise - indexes are not critical for startup

    @classmethod
    async def disconnect(cls) -> None:
        """Close MongoDB connection"""
        if cls.client:
            cls.client.close()
            logger.info("Disconnected from MongoDB")

    @classmethod
    async def health_check(cls) -> bool:
        """
        Check MongoDB connection health

        Returns:
            bool: True if connection is healthy, False otherwise
        """
        try:
            if cls.client:
                await cls.client.admin.command('ping')
                return True
            return False
        except Exception as e:
            logger.error(f"MongoDB health check failed: {e}")
            return False

    @classmethod
    def get_database(cls):
        """Get database instance"""
        if cls.db is None:
            raise ConnectionError("MongoDB not connected. Call connect() first.")
        return cls.db


# Database manager instance
mongodb = MongoDBManager()
