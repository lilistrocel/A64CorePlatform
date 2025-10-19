"""
Database Connection Managers

Manages connections to MongoDB and MySQL databases with connection pooling,
health checks, and graceful shutdown.
"""

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure
import aiomysql
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


class MySQLManager:
    """
    MySQL connection manager using aiomysql (async driver)

    Provides async connection pooling and database access
    """

    pool: Optional[aiomysql.Pool] = None

    @classmethod
    async def connect(cls) -> None:
        """
        Establish connection pool to MySQL

        Raises:
            Exception: If unable to connect to MySQL
        """
        try:
            logger.info(f"Connecting to MySQL at {settings.MYSQL_HOST}")
            cls.pool = await aiomysql.create_pool(
                host=settings.MYSQL_HOST,
                port=settings.MYSQL_PORT,
                user=settings.MYSQL_USER,
                password=settings.MYSQL_PASSWORD,
                db=settings.MYSQL_DB_NAME,
                minsize=5,
                maxsize=20,
                autocommit=False,
                charset='utf8mb4'
            )
            logger.info(f"Connected to MySQL database: {settings.MYSQL_DB_NAME}")

            # Create tables if they don't exist
            await cls._create_tables()

        except Exception as e:
            logger.error(f"Failed to connect to MySQL: {e}")
            raise

    @classmethod
    async def _create_tables(cls) -> None:
        """Create database tables if they don't exist"""
        try:
            async with cls.pool.acquire() as conn:
                async with conn.cursor() as cursor:
                    # Create users table
                    await cursor.execute("""
                        CREATE TABLE IF NOT EXISTS users (
                            id INT PRIMARY KEY AUTO_INCREMENT,
                            user_id VARCHAR(36) UNIQUE NOT NULL,
                            email VARCHAR(255) UNIQUE NOT NULL,
                            password_hash VARCHAR(255) NOT NULL,
                            first_name VARCHAR(100) NOT NULL,
                            last_name VARCHAR(100) NOT NULL,
                            role ENUM('super_admin', 'admin', 'moderator', 'user', 'guest')
                                NOT NULL DEFAULT 'user',
                            is_active BOOLEAN NOT NULL DEFAULT TRUE,
                            is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
                            phone VARCHAR(20),
                            avatar VARCHAR(500),
                            timezone VARCHAR(50),
                            locale VARCHAR(10),
                            last_login_at TIMESTAMP NULL,
                            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
                            deleted_at TIMESTAMP NULL,
                            metadata JSON,

                            INDEX idx_email (email),
                            INDEX idx_user_id (user_id),
                            INDEX idx_role (role),
                            INDEX idx_created_at (created_at)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """)

                    # Create refresh_tokens table
                    await cursor.execute("""
                        CREATE TABLE IF NOT EXISTS refresh_tokens (
                            id INT PRIMARY KEY AUTO_INCREMENT,
                            token_id VARCHAR(36) UNIQUE NOT NULL,
                            user_id VARCHAR(36) NOT NULL,
                            token TEXT NOT NULL,
                            expires_at TIMESTAMP NOT NULL,
                            is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
                            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            last_used_at TIMESTAMP NULL,

                            INDEX idx_token_id (token_id),
                            INDEX idx_user_id (user_id),
                            INDEX idx_expires_at (expires_at),
                            FOREIGN KEY (user_id) REFERENCES users(user_id)
                                ON DELETE CASCADE
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """)

                    await conn.commit()
                    logger.info("MySQL tables created successfully")

        except Exception as e:
            logger.error(f"Error creating MySQL tables: {e}")
            # Don't raise - we'll log and continue

    @classmethod
    async def disconnect(cls) -> None:
        """Close MySQL connection pool"""
        if cls.pool:
            cls.pool.close()
            await cls.pool.wait_closed()
            logger.info("Disconnected from MySQL")

    @classmethod
    async def health_check(cls) -> bool:
        """
        Check MySQL connection health

        Returns:
            bool: True if connection is healthy, False otherwise
        """
        try:
            if cls.pool:
                async with cls.pool.acquire() as conn:
                    async with conn.cursor() as cursor:
                        await cursor.execute("SELECT 1")
                        result = await cursor.fetchone()
                        return result == (1,)
            return False
        except Exception as e:
            logger.error(f"MySQL health check failed: {e}")
            return False

    @classmethod
    async def get_connection(cls):
        """Get a connection from the pool"""
        if cls.pool is None:
            raise ConnectionError("MySQL not connected. Call connect() first.")
        return cls.pool.acquire()


# Database manager instances
mongodb = MongoDBManager()
mysql = MySQLManager()
