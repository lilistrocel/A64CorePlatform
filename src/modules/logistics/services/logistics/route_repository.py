"""
Route Repository

Data access layer for Route operations.
Handles all database interactions for routes.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from src.modules.logistics.models.route import Route, RouteCreate, RouteUpdate
from src.modules.logistics.services.database import logistics_db

logger = logging.getLogger(__name__)


class RouteRepository:
    """Repository for Route data access"""

    def __init__(self):
        self.collection_name = "routes"

    def _get_collection(self):
        """Get routes collection"""
        return logistics_db.get_collection(self.collection_name)

    async def _get_next_route_sequence(self) -> int:
        """
        Get next route sequence number using atomic increment.

        Uses a counters collection to maintain an atomic counter for route codes.

        Returns:
            Next sequence number for route code
        """
        db = logistics_db.get_database()

        # Use findOneAndUpdate with upsert to atomically get and increment
        result = await db.counters.find_one_and_update(
            {"_id": "route_sequence"},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=True
        )

        return result["value"]

    async def create(self, route_data: RouteCreate, created_by: UUID) -> Route:
        """
        Create a new route with auto-generated routeCode

        Args:
            route_data: Route creation data
            created_by: ID of the user creating the route

        Returns:
            Created route
        """
        collection = self._get_collection()

        # Generate route code (e.g., "R001", "R002")
        sequence = await self._get_next_route_sequence()
        route_code = f"R{sequence:03d}"

        route_dict = route_data.model_dump()
        route = Route(
            **route_dict,
            routeCode=route_code,
            createdBy=created_by,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        route_doc = route.model_dump(by_alias=True)
        route_doc["routeId"] = str(route_doc["routeId"])  # Convert UUID to string for MongoDB
        route_doc["createdBy"] = str(route_doc["createdBy"])

        await collection.insert_one(route_doc)

        logger.info(f"Created route: {route.routeId} with code {route_code}")
        return route

    async def get_by_id(self, route_id: UUID) -> Optional[Route]:
        """
        Get route by ID

        Args:
            route_id: Route ID

        Returns:
            Route if found, None otherwise
        """
        collection = self._get_collection()
        route_doc = await collection.find_one({"routeId": str(route_id)})

        if route_doc:
            route_doc.pop("_id", None)  # Remove MongoDB _id
            return Route(**route_doc)
        return None

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        is_active: Optional[bool] = None
    ) -> tuple[List[Route], int]:
        """
        Get all routes with pagination and filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            is_active: Filter by active status (optional)

        Returns:
            Tuple of (list of routes, total count)
        """
        collection = self._get_collection()
        query = {}

        if is_active is not None:
            query["isActive"] = is_active

        # Get total count
        total = await collection.count_documents(query)

        # Get routes
        cursor = collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        routes = []

        async for route_doc in cursor:
            route_doc.pop("_id", None)
            routes.append(Route(**route_doc))

        return routes, total

    async def update(self, route_id: UUID, update_data: RouteUpdate) -> Optional[Route]:
        """
        Update a route

        Args:
            route_id: Route ID
            update_data: Fields to update

        Returns:
            Updated route if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(route_id)

        update_dict["updatedAt"] = datetime.utcnow()

        result = await collection.update_one(
            {"routeId": str(route_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated route: {route_id}")
            return await self.get_by_id(route_id)

        return None

    async def delete(self, route_id: UUID) -> bool:
        """
        Delete a route (hard delete)

        Args:
            route_id: Route ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.delete_one({"routeId": str(route_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted route: {route_id}")
            return True

        return False

    async def exists(self, route_id: UUID) -> bool:
        """
        Check if route exists

        Args:
            route_id: Route ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"routeId": str(route_id)})
        return count > 0
