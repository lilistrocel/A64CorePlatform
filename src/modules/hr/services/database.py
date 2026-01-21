"""
HR Module - Database Service

Manages MongoDB collections for the HR module.
Uses shared MongoDB connection from core services.
"""

import logging

# Import shared database manager from core
from src.services.database import mongodb

logger = logging.getLogger(__name__)


class HRDatabaseManager:
    """
    HR module database manager

    Manages MongoDB collections for human resources management:
    - employees
    - employee_contracts
    - employee_visas
    - employee_insurance
    - employee_performance

    Note: This delegates to the core MongoDB manager for actual connection management.
    The core manager handles connection pooling, health checks, and shutdown.
    """

    @classmethod
    async def connect(cls) -> None:
        """
        Initialize HR module indexes.
        The actual MongoDB connection is managed by core services.

        Note: This method is kept for backward compatibility but delegates
        to the shared MongoDB connection from src.services.database.
        """
        try:
            logger.info("[HR Module] Initializing HR indexes...")

            # The core MongoDB manager already connected in main.py startup
            # We just need to create our module-specific indexes
            await cls._create_indexes()

            logger.info("[HR Module] HR indexes initialized")

        except Exception as e:
            logger.error(f"[HR Module] Error initializing HR indexes: {e}")
            raise

    @classmethod
    async def _create_indexes(cls) -> None:
        """Create database indexes for HR collections"""
        try:
            # Get shared database instance from core
            db = mongodb.get_database()

            # Employees collection
            await db.employees.create_index("employeeId", unique=True)
            await db.employees.create_index("employeeCode", unique=True)
            await db.employees.create_index("email")
            await db.employees.create_index("department")
            await db.employees.create_index("position")
            await db.employees.create_index("status")
            await db.employees.create_index("createdBy")
            await db.employees.create_index([("createdAt", -1)])
            # Text search index for firstName, lastName, email, department
            await db.employees.create_index(
                [("firstName", "text"), ("lastName", "text"), ("email", "text"), ("department", "text")],
                name="employee_search_text"
            )

            # Employee contracts collection
            await db.employee_contracts.create_index("contractId", unique=True)
            await db.employee_contracts.create_index("employeeId")
            await db.employee_contracts.create_index("type")
            await db.employee_contracts.create_index("status")
            await db.employee_contracts.create_index([("startDate", -1)])
            await db.employee_contracts.create_index([("createdAt", -1)])

            # Employee visas collection
            await db.employee_visas.create_index("visaId", unique=True)
            await db.employee_visas.create_index("employeeId")
            await db.employee_visas.create_index("country")
            await db.employee_visas.create_index("status")
            await db.employee_visas.create_index([("expiryDate", -1)])
            await db.employee_visas.create_index([("createdAt", -1)])

            # Employee insurance collection
            await db.employee_insurance.create_index("insuranceId", unique=True)
            await db.employee_insurance.create_index("employeeId")
            await db.employee_insurance.create_index("type")
            await db.employee_insurance.create_index("provider")
            await db.employee_insurance.create_index([("startDate", -1)])
            await db.employee_insurance.create_index([("createdAt", -1)])

            # Employee performance collection
            await db.employee_performance.create_index("reviewId", unique=True)
            await db.employee_performance.create_index("employeeId")
            await db.employee_performance.create_index("reviewerId")
            await db.employee_performance.create_index([("reviewDate", -1)])
            await db.employee_performance.create_index([("createdAt", -1)])

            logger.info("[HR Module] MongoDB indexes created successfully")
        except Exception as e:
            logger.error(f"[HR Module] Error creating MongoDB indexes: {e}")
            # Don't raise - indexes are not critical for startup

    @classmethod
    async def disconnect(cls) -> None:
        """
        Disconnect from MongoDB (delegated to core manager)

        Note: This method is kept for backward compatibility but delegates
        to the shared MongoDB connection from src.services.database.
        The actual disconnection is handled by core services during shutdown.
        """
        logger.info("[HR Module] HR module shutdown (database managed by core)")
        # No action needed - core services handle disconnection

    @classmethod
    async def health_check(cls) -> bool:
        """
        Check MongoDB connection health (delegated to core manager)

        Returns:
            bool: True if connection is healthy, False otherwise
        """
        return await mongodb.health_check()

    @classmethod
    def get_database(cls):
        """
        Get database instance (delegated to core manager)

        Returns:
            MongoDB database instance
        """
        return mongodb.get_database()

    @classmethod
    def get_collection(cls, collection_name: str):
        """
        Get a specific collection (delegated to core manager)

        Args:
            collection_name: Name of the collection

        Returns:
            MongoDB collection
        """
        db = mongodb.get_database()
        return db[collection_name]


# Database manager instance
hr_db = HRDatabaseManager()
