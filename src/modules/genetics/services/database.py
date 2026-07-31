"""
Genetics Repo Module - Database Service

Manages MongoDB collections for the genetics repository.
Uses the shared MongoDB connection from core services.
"""

import logging

from src.services.database import mongodb

logger = logging.getLogger(__name__)


# Collection name constants — referenced by every service so a rename is a
# one-line change rather than a grep.
LINES = "genetic_lines"
ACCESSIONS = "genetic_accessions"
PROPAGATIONS = "propagation_events"
RECIPES = "medium_recipes"
BATCHES = "medium_batches"
OBSERVATIONS = "genetic_observations"


class GeneticsDatabaseManager:
    """
    Genetics module database manager.

    Manages MongoDB collections for the genetics repository:
    - genetic_lines
    - genetic_accessions
    - propagation_events
    - medium_recipes
    - medium_batches
    - genetic_observations

    Note: Delegates to the core MongoDB manager for actual connection
    management. The core manager handles pooling, health checks and shutdown.
    """

    @classmethod
    async def connect(cls) -> None:
        """
        Initialize genetics module indexes.

        The MongoDB connection itself is managed by core services; this creates
        module-specific indexes only.
        """
        try:
            logger.info("[Genetics Module] Initializing genetics repository indexes...")
            await cls._create_indexes()
            logger.info("[Genetics Module] Genetics repository indexes initialized")
        except Exception as e:
            logger.error(f"[Genetics Module] Error initializing genetics indexes: {e}")
            raise

    @classmethod
    async def _create_indexes(cls) -> None:
        """
        Create database indexes for the genetics collections.

        Index choices follow the read paths: repo home lists lines, line detail
        lists accessions by line, and lineage traversal walks parents/children
        one hop at a time.
        """
        try:
            db = mongodb.get_database()

            # --- genetic_lines -------------------------------------------------
            await db[LINES].create_index("lineId", unique=True)
            await db[LINES].create_index("code", unique=True)
            await db[LINES].create_index("kind")
            await db[LINES].create_index("parentLineId")
            await db[LINES].create_index("isActive")
            await db[LINES].create_index("tags")
            await db[LINES].create_index([("commonName", 1)])
            await db[LINES].create_index([("createdAt", -1)])

            # --- genetic_accessions --------------------------------------------
            await db[ACCESSIONS].create_index("accessionId", unique=True)
            await db[ACCESSIONS].create_index("accessionCode", unique=True)
            # T-804 — opaque key the unauthenticated public label page resolves
            # through; must be unique so a collision on mint is even possible
            # to detect (see AccessionService.create_accession retry).
            await db[ACCESSIONS].create_index("publicToken", unique=True)
            await db[ACCESSIONS].create_index("lineId")
            await db[ACCESSIONS].create_index("status")
            await db[ACCESSIONS].create_index("form")
            await db[ACCESSIONS].create_index("mediumBatchId")
            await db[ACCESSIONS].create_index("sourceEventId")
            # T-804 — written today (batch split) but never indexed. The public
            # resolver walk queries it on every scan of a split-off vessel, so
            # it needs one regardless of the split's own indexing needs.
            await db[ACCESSIONS].create_index("splitFromAccessionId")
            # Lineage traversal walks children by parent id — the hot path for
            # the graph endpoint, hence a dedicated index on the nested field.
            await db[ACCESSIONS].create_index("parents.accessionId")
            # "What is in this room right now" — the inventory read path for
            # lab / spawn / incubation rooms, which hold many items at once.
            await db[ACCESSIONS].create_index("location.roomId")
            await db[ACCESSIONS].create_index("location.facilityId")
            await db[ACCESSIONS].create_index([("location.roomId", 1), ("status", 1)])
            await db[ACCESSIONS].create_index([("lineId", 1), ("cloneGeneration", 1)])
            await db[ACCESSIONS].create_index([("lineId", 1), ("status", 1)])
            await db[ACCESSIONS].create_index([("createdAt", -1)])

            # --- propagation_events --------------------------------------------
            await db[PROPAGATIONS].create_index("eventId", unique=True)
            await db[PROPAGATIONS].create_index("method")
            await db[PROPAGATIONS].create_index("reproductionMode")
            await db[PROPAGATIONS].create_index("parents.accessionId")
            await db[PROPAGATIONS].create_index("resultAccessionIds")
            await db[PROPAGATIONS].create_index("sourceLineIds")
            await db[PROPAGATIONS].create_index("mediumBatchId")
            await db[PROPAGATIONS].create_index([("performedAt", -1)])

            # --- medium_recipes -------------------------------------------------
            await db[RECIPES].create_index("recipeId", unique=True)
            await db[RECIPES].create_index("code", unique=True)
            await db[RECIPES].create_index("type")
            await db[RECIPES].create_index("isActive")
            # Answers "every accession grown on a medium containing X" from the
            # recipe side — the experiment readout query.
            await db[RECIPES].create_index("additives.name")
            await db[RECIPES].create_index("ingredients.name")

            # --- medium_batches -------------------------------------------------
            await db[BATCHES].create_index("batchId", unique=True)
            await db[BATCHES].create_index("batchCode", unique=True)
            await db[BATCHES].create_index("recipeId")
            await db[BATCHES].create_index("status")
            await db[BATCHES].create_index("additivesSnapshot.name")
            await db[BATCHES].create_index([("preparedAt", -1)])

            # --- genetic_observations -------------------------------------------
            await db[OBSERVATIONS].create_index("observationId", unique=True)
            await db[OBSERVATIONS].create_index("accessionId")
            await db[OBSERVATIONS].create_index("lineId")
            await db[OBSERVATIONS].create_index("type")
            await db[OBSERVATIONS].create_index("isNovelTrait")
            await db[OBSERVATIONS].create_index([("accessionId", 1), ("observedAt", -1)])
            await db[OBSERVATIONS].create_index([("observedAt", -1)])

            logger.info("[Genetics Module] MongoDB indexes created successfully")
        except Exception as e:
            logger.error(f"[Genetics Module] Error creating MongoDB indexes: {e}")
            # Reason: Indexes are not critical for startup; log and continue

    @classmethod
    async def disconnect(cls) -> None:
        """
        Disconnect from MongoDB (delegated to the core manager).

        Kept for parity with the module lifecycle pattern used by the other
        modules; actual disconnection happens in core services on shutdown.
        """
        logger.info("[Genetics Module] Genetics module shutdown (database managed by core)")

    @classmethod
    async def health_check(cls) -> bool:
        """Check MongoDB connection health (delegated to the core manager)."""
        return await mongodb.health_check()

    @classmethod
    def get_database(cls):
        """Get the database instance (delegated to the core manager)."""
        return mongodb.get_database()

    @classmethod
    def get_collection(cls, collection_name: str):
        """Get a specific collection by name."""
        return mongodb.get_database()[collection_name]


# Database manager singleton instance
genetics_db = GeneticsDatabaseManager()
