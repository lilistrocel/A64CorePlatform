"""
AI Analytics Cost Tracking Service

Persists AI query costs to MongoDB and provides aggregation for cost reporting.
Each AI query is logged with its cost, token usage, and metadata.
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)


class CostTrackingService:
    """
    Tracks AI query costs in MongoDB for reporting and quota enforcement.

    Collection: ai_query_log
    Document schema:
    {
        user_id: str,
        prompt: str (truncated to 200 chars),
        collection_queried: str,
        query_cost_usd: float,
        report_cost_usd: float,
        total_cost_usd: float,
        input_tokens: int,
        output_tokens: int,
        total_tokens: int,
        cache_hit: bool,
        execution_time_seconds: float,
        result_count: int,
        timestamp: datetime (UTC)
    }
    """

    def __init__(self, mongodb_client: AsyncIOMotorClient, db_name: str):
        self.db = mongodb_client[db_name]
        self.collection = self.db["ai_query_log"]
        logger.info("CostTrackingService initialized")

    async def ensure_indexes(self):
        """Create indexes for efficient cost queries."""
        try:
            await self.collection.create_index("user_id")
            await self.collection.create_index([("timestamp", -1)])
            await self.collection.create_index([("user_id", 1), ("timestamp", -1)])
            logger.info("ai_query_log indexes created")
        except Exception as e:
            logger.error(f"Failed to create ai_query_log indexes: {e}")

    async def log_query(
        self,
        user_id: str,
        prompt: str,
        collection_queried: str,
        cost_data: Dict[str, Any],
        execution_time_seconds: float,
        result_count: int,
        cache_hit: bool
    ) -> None:
        """
        Log an AI query with its cost data to MongoDB.

        Args:
            user_id: The user who made the query
            prompt: The user's natural language prompt (truncated)
            collection_queried: MongoDB collection that was queried
            cost_data: Cost breakdown from the query engine
            execution_time_seconds: How long the query took
            result_count: Number of results returned
            cache_hit: Whether the result came from cache
        """
        try:
            query_gen = cost_data.get("query_generation", {})
            report_gen = cost_data.get("report_generation", {})

            query_cost = query_gen.get("total_cost_usd", 0.0)
            report_cost = report_gen.get("total_cost_usd", 0.0)
            total_cost = cost_data.get("total_cost_usd", query_cost + report_cost)

            query_input_tokens = query_gen.get("input_tokens", 0)
            query_output_tokens = query_gen.get("output_tokens", 0)
            report_input_tokens = report_gen.get("input_tokens", 0)
            report_output_tokens = report_gen.get("output_tokens", 0)

            doc = {
                "user_id": user_id,
                "prompt": prompt[:200],
                "collection_queried": collection_queried,
                "query_cost_usd": query_cost,
                "report_cost_usd": report_cost,
                "total_cost_usd": total_cost,
                "input_tokens": query_input_tokens + report_input_tokens,
                "output_tokens": query_output_tokens + report_output_tokens,
                "total_tokens": (query_input_tokens + query_output_tokens +
                                 report_input_tokens + report_output_tokens),
                "cache_hit": cache_hit,
                "execution_time_seconds": execution_time_seconds,
                "result_count": result_count,
                "timestamp": datetime.utcnow()
            }

            await self.collection.insert_one(doc)
            logger.info(f"Logged AI query cost for user {user_id}: ${total_cost:.6f}")

        except Exception as e:
            logger.error(f"Failed to log AI query cost: {e}")
            # Don't raise - cost logging should not break the query flow

    async def get_user_cost_summary(
        self,
        user_id: str,
        period: str = "today"
    ) -> Dict[str, Any]:
        """
        Get aggregated cost summary for a user.

        Args:
            user_id: User ID to get costs for
            period: 'today', 'this_month', or 'all_time'

        Returns:
            Cost summary with totals and averages
        """
        try:
            # Determine date filter based on period
            now = datetime.utcnow()
            if period == "today":
                start_date = datetime(now.year, now.month, now.day)
            elif period == "this_month":
                start_date = datetime(now.year, now.month, 1)
            else:  # all_time
                start_date = None

            # Build match filter
            match_filter: Dict[str, Any] = {"user_id": user_id}
            if start_date:
                match_filter["timestamp"] = {"$gte": start_date}

            # Aggregate costs
            pipeline = [
                {"$match": match_filter},
                {
                    "$group": {
                        "_id": None,
                        "total_queries": {"$sum": 1},
                        "total_cost_usd": {"$sum": "$total_cost_usd"},
                        "total_tokens": {"$sum": "$total_tokens"},
                        "cache_hits": {
                            "$sum": {"$cond": ["$cache_hit", 1, 0]}
                        }
                    }
                }
            ]

            results = await self.collection.aggregate(pipeline).to_list(length=1)

            if results:
                data = results[0]
                total_queries = data["total_queries"]
                total_cost = data["total_cost_usd"]
                total_tokens = data["total_tokens"]
                cache_hits = data["cache_hits"]

                return {
                    "total_queries": total_queries,
                    "total_cost_usd": round(total_cost, 6),
                    "average_cost_per_query": round(
                        total_cost / total_queries if total_queries > 0 else 0, 6
                    ),
                    "total_tokens": total_tokens,
                    "cache_hit_rate": round(
                        cache_hits / total_queries if total_queries > 0 else 0.0, 4
                    )
                }
            else:
                return {
                    "total_queries": 0,
                    "total_cost_usd": 0.0,
                    "average_cost_per_query": 0.0,
                    "total_tokens": 0,
                    "cache_hit_rate": 0.0
                }

        except Exception as e:
            logger.error(f"Failed to get cost summary for user {user_id}: {e}")
            return {
                "total_queries": 0,
                "total_cost_usd": 0.0,
                "average_cost_per_query": 0.0,
                "total_tokens": 0,
                "cache_hit_rate": 0.0
            }

    async def get_user_daily_breakdown(
        self,
        user_id: str,
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Get daily cost breakdown for a user.

        Args:
            user_id: User ID
            days: Number of days to look back

        Returns:
            List of daily cost summaries
        """
        try:
            start_date = datetime.utcnow() - timedelta(days=days)

            pipeline = [
                {
                    "$match": {
                        "user_id": user_id,
                        "timestamp": {"$gte": start_date}
                    }
                },
                {
                    "$group": {
                        "_id": {
                            "$dateToString": {
                                "format": "%Y-%m-%d",
                                "date": "$timestamp"
                            }
                        },
                        "queries": {"$sum": 1},
                        "cost_usd": {"$sum": "$total_cost_usd"},
                        "tokens": {"$sum": "$total_tokens"},
                        "cache_hits": {
                            "$sum": {"$cond": ["$cache_hit", 1, 0]}
                        }
                    }
                },
                {"$sort": {"_id": 1}}
            ]

            results = await self.collection.aggregate(pipeline).to_list(length=None)

            return [
                {
                    "date": r["_id"],
                    "queries": r["queries"],
                    "cost_usd": round(r["cost_usd"], 6),
                    "tokens": r["tokens"],
                    "cache_hits": r["cache_hits"]
                }
                for r in results
            ]

        except Exception as e:
            logger.error(f"Failed to get daily breakdown for user {user_id}: {e}")
            return []

    async def get_user_query_count_today(self, user_id: str) -> int:
        """
        Get the number of queries a user has made today.
        Used for rate limiting enforcement.

        Args:
            user_id: User ID

        Returns:
            Number of queries made today
        """
        try:
            now = datetime.utcnow()
            start_of_day = datetime(now.year, now.month, now.day)

            count = await self.collection.count_documents({
                "user_id": user_id,
                "timestamp": {"$gte": start_of_day},
                "cache_hit": False  # Only count non-cached queries
            })

            return count

        except Exception as e:
            logger.error(f"Failed to get query count for user {user_id}: {e}")
            return 0


# Singleton instance
_cost_tracking_service: Optional[CostTrackingService] = None


def get_cost_tracking_service(
    mongodb_client: AsyncIOMotorClient,
    db_name: str
) -> CostTrackingService:
    """
    Get singleton instance of CostTrackingService.

    Args:
        mongodb_client: MongoDB client
        db_name: Database name

    Returns:
        CostTrackingService instance
    """
    global _cost_tracking_service
    if _cost_tracking_service is None:
        _cost_tracking_service = CostTrackingService(mongodb_client, db_name)
    return _cost_tracking_service
