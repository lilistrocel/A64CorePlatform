"""
Weather Cache Service

Manages persistent MongoDB caching of weather data for all farms.
Provides background refresh functionality to update data hourly.
"""

import logging
import asyncio
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from uuid import UUID

from ...config.settings import settings
from ...models.weather import AgriWeatherData
from ..farm.farm_repository import FarmRepository
from .weather_service import WeatherService

logger = logging.getLogger(__name__)


class WeatherCacheService:
    """
    Service for caching weather data in MongoDB.

    Provides:
    - Persistent storage of weather data per farm
    - Automatic background refresh every hour
    - Fallback to API if cache miss
    """

    COLLECTION_NAME = "weather_cache"
    CACHE_TTL_HOURS = 1  # Cache valid for 1 hour

    _instance: Optional['WeatherCacheService'] = None
    _db = None
    _refresh_task: Optional[asyncio.Task] = None
    _is_running = False

    @classmethod
    def get_instance(cls) -> 'WeatherCacheService':
        """Get singleton instance"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    async def initialize(cls, db) -> 'WeatherCacheService':
        """
        Initialize the weather cache service with database connection

        Args:
            db: MongoDB database instance

        Returns:
            WeatherCacheService instance
        """
        instance = cls.get_instance()
        instance._db = db

        # Create indexes
        await instance._create_indexes()

        logger.info("WeatherCacheService initialized")
        return instance

    async def _create_indexes(self) -> None:
        """Create MongoDB indexes for weather cache"""
        if self._db is None:
            return

        try:
            collection = self._db[self.COLLECTION_NAME]

            # Index on farmId for fast lookups
            await collection.create_index("farmId", unique=True)

            # Drop existing updatedAt index if it exists (to allow TTL index)
            try:
                await collection.drop_index("updatedAt_1")
            except Exception:
                pass  # Index doesn't exist, which is fine

            # TTL index to auto-expire old entries (2 hours - gives buffer beyond refresh)
            await collection.create_index(
                "updatedAt",
                expireAfterSeconds=7200,  # 2 hours
                name="ttl_updatedAt"
            )

            logger.info("Weather cache indexes created")
        except Exception as e:
            logger.error(f"Error creating weather cache indexes: {e}")

    async def get_cached_weather(self, farm_id: UUID) -> Optional[AgriWeatherData]:
        """
        Get cached weather data for a farm

        Args:
            farm_id: Farm UUID

        Returns:
            AgriWeatherData if cache hit and not expired, None otherwise
        """
        if self._db is None:
            logger.warning("Weather cache not initialized - database not connected")
            return None

        try:
            collection = self._db[self.COLLECTION_NAME]

            # Find cached entry
            entry = await collection.find_one({"farmId": str(farm_id)})

            if not entry:
                logger.debug(f"Cache miss for farm {farm_id}")
                return None

            # Check if cache is still valid (within TTL)
            updated_at = entry.get("updatedAt")
            if updated_at:
                cache_age = datetime.utcnow() - updated_at
                if cache_age > timedelta(hours=self.CACHE_TTL_HOURS):
                    logger.debug(f"Cache expired for farm {farm_id} (age: {cache_age})")
                    return None

            # Parse cached data
            data = entry.get("data")
            if data:
                # Convert lastUpdated back to datetime if stored as string
                if isinstance(data.get("lastUpdated"), str):
                    data["lastUpdated"] = datetime.fromisoformat(data["lastUpdated"].replace("Z", "+00:00"))

                logger.debug(f"Cache hit for farm {farm_id}")
                return AgriWeatherData(**data)

            return None

        except Exception as e:
            logger.error(f"Error getting cached weather for farm {farm_id}: {e}")
            return None

    async def set_cached_weather(self, farm_id: UUID, data: AgriWeatherData) -> bool:
        """
        Store weather data in cache

        Args:
            farm_id: Farm UUID
            data: AgriWeatherData to cache

        Returns:
            True if cached successfully, False otherwise
        """
        if self._db is None:
            logger.warning("Weather cache not initialized - database not connected")
            return False

        try:
            collection = self._db[self.COLLECTION_NAME]

            # Serialize data
            data_dict = data.model_dump(mode="json")

            # Upsert cache entry
            await collection.update_one(
                {"farmId": str(farm_id)},
                {
                    "$set": {
                        "farmId": str(farm_id),
                        "farmName": data.farmName,
                        "data": data_dict,
                        "updatedAt": datetime.utcnow()
                    }
                },
                upsert=True
            )

            logger.debug(f"Cached weather data for farm {farm_id}")
            return True

        except Exception as e:
            logger.error(f"Error caching weather for farm {farm_id}: {e}")
            return False

    async def invalidate_cache(self, farm_id: UUID) -> bool:
        """
        Invalidate cached weather data for a farm

        Args:
            farm_id: Farm UUID

        Returns:
            True if invalidated, False otherwise
        """
        if self._db is None:
            return False

        try:
            collection = self._db[self.COLLECTION_NAME]
            await collection.delete_one({"farmId": str(farm_id)})
            logger.debug(f"Invalidated cache for farm {farm_id}")
            return True
        except Exception as e:
            logger.error(f"Error invalidating cache for farm {farm_id}: {e}")
            return False

    async def get_all_farms_with_locations(self) -> List[Dict[str, Any]]:
        """
        Get all farms that have location coordinates configured

        Returns:
            List of farms with farmId, name, and coordinates
        """
        try:
            farm_repo = FarmRepository()
            farms, _ = await farm_repo.get_all(skip=0, limit=1000, is_active=True)

            farms_with_locations = []
            for farm in farms:
                # Check if farm has valid coordinates
                if (farm.location and
                    farm.location.latitude is not None and
                    farm.location.longitude is not None):
                    farms_with_locations.append({
                        "farmId": farm.farmId,
                        "name": farm.name,
                        "latitude": farm.location.latitude,
                        "longitude": farm.location.longitude
                    })

            return farms_with_locations

        except Exception as e:
            logger.error(f"Error getting farms with locations: {e}")
            return []

    async def refresh_farm_weather(self, farm_id: UUID) -> bool:
        """
        Refresh weather data for a single farm

        Args:
            farm_id: Farm UUID

        Returns:
            True if refreshed successfully, False otherwise
        """
        try:
            weather_service = WeatherService()

            # Fetch fresh data from API
            agri_data = await weather_service.get_agri_data(farm_id)

            # Store in cache
            await self.set_cached_weather(farm_id, agri_data)

            logger.info(f"Refreshed weather cache for farm {farm_id}")
            return True

        except Exception as e:
            logger.error(f"Error refreshing weather for farm {farm_id}: {e}")
            return False

    async def refresh_all_farms(self) -> Dict[str, Any]:
        """
        Refresh weather data for all farms with locations

        Returns:
            Summary of refresh operation
        """
        logger.info("Starting weather cache refresh for all farms...")

        farms = await self.get_all_farms_with_locations()

        if not farms:
            logger.info("No farms with locations found to refresh")
            return {
                "total": 0,
                "success": 0,
                "failed": 0,
                "farms": []
            }

        logger.info(f"Found {len(farms)} farms with locations")

        success_count = 0
        failed_count = 0
        results = []

        for farm in farms:
            farm_id = farm["farmId"]
            farm_name = farm["name"]

            try:
                success = await self.refresh_farm_weather(farm_id)

                if success:
                    success_count += 1
                    results.append({"farmId": str(farm_id), "name": farm_name, "status": "success"})
                else:
                    failed_count += 1
                    results.append({"farmId": str(farm_id), "name": farm_name, "status": "failed"})

            except Exception as e:
                failed_count += 1
                results.append({"farmId": str(farm_id), "name": farm_name, "status": "error", "error": str(e)})

            # Small delay between API calls to avoid rate limiting
            await asyncio.sleep(0.5)

        summary = {
            "total": len(farms),
            "success": success_count,
            "failed": failed_count,
            "refreshedAt": datetime.utcnow().isoformat(),
            "farms": results
        }

        logger.info(f"Weather cache refresh complete: {success_count}/{len(farms)} farms updated")

        return summary

    async def start_background_refresh(self, interval_seconds: int = 3600) -> None:
        """
        Start background task to refresh weather cache periodically

        Args:
            interval_seconds: Refresh interval (default: 3600 = 1 hour)
        """
        if self._is_running:
            logger.warning("Background refresh already running")
            return

        self._is_running = True

        async def refresh_loop():
            """Background loop that runs refresh at intervals"""
            logger.info(f"Weather cache background refresh started (interval: {interval_seconds}s)")

            # Initial refresh on startup
            await asyncio.sleep(10)  # Wait for app to fully start
            await self.refresh_all_farms()

            while self._is_running:
                try:
                    # Wait for next interval
                    await asyncio.sleep(interval_seconds)

                    if not self._is_running:
                        break

                    # Refresh all farms
                    await self.refresh_all_farms()

                except asyncio.CancelledError:
                    logger.info("Weather cache refresh task cancelled")
                    break
                except Exception as e:
                    logger.error(f"Error in weather cache refresh loop: {e}")
                    # Continue running even after errors
                    await asyncio.sleep(60)  # Wait a bit before retrying

        self._refresh_task = asyncio.create_task(refresh_loop())
        logger.info("Weather cache background refresh task created")

    async def stop_background_refresh(self) -> None:
        """Stop the background refresh task"""
        self._is_running = False

        if self._refresh_task:
            self._refresh_task.cancel()
            try:
                await self._refresh_task
            except asyncio.CancelledError:
                pass
            self._refresh_task = None

        logger.info("Weather cache background refresh stopped")

    async def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the weather cache

        Returns:
            Cache statistics
        """
        if self._db is None:
            return {"error": "Database not connected"}

        try:
            collection = self._db[self.COLLECTION_NAME]

            # Count total entries
            total = await collection.count_documents({})

            # Count entries updated in last hour
            one_hour_ago = datetime.utcnow() - timedelta(hours=1)
            fresh = await collection.count_documents({"updatedAt": {"$gte": one_hour_ago}})

            # Get oldest and newest entries
            oldest = await collection.find_one(sort=[("updatedAt", 1)])
            newest = await collection.find_one(sort=[("updatedAt", -1)])

            return {
                "totalEntries": total,
                "freshEntries": fresh,
                "staleEntries": total - fresh,
                "oldestUpdate": oldest.get("updatedAt").isoformat() if oldest and oldest.get("updatedAt") else None,
                "newestUpdate": newest.get("updatedAt").isoformat() if newest and newest.get("updatedAt") else None,
                "backgroundRefreshRunning": self._is_running,
                "cacheCollectionName": self.COLLECTION_NAME
            }

        except Exception as e:
            logger.error(f"Error getting cache stats: {e}")
            return {"error": str(e)}


# Module-level function for easy access
def get_weather_cache_service() -> WeatherCacheService:
    """Get the weather cache service instance"""
    return WeatherCacheService.get_instance()
