"""
Query Engine

Complete pipeline from natural language prompt to MongoDB results.
Integrates: GeminiService + SchemaService + QueryValidator + MongoDB execution.
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import hashlib
import json
from motor.motor_asyncio import AsyncIOMotorClient

from ..utils.validators import QueryValidator, QueryValidationError
from .gemini_service import get_gemini_service
from .schema_service import get_schema_service

logger = logging.getLogger(__name__)


class QueryExecutionError(Exception):
    """Raised when query execution fails"""
    pass


class QueryEngine:
    """
    Complete AI-powered database query engine.

    Flow:
    1. Get database schema (SchemaService)
    2. Generate MongoDB query from natural language (GeminiService)
    3. Validate query for security (QueryValidator)
    4. Execute query on MongoDB
    5. Generate human-readable report (GeminiService)
    6. Cache results for performance

    Features:
    - End-to-end query pipeline
    - Result caching (30-minute TTL)
    - Error handling and retry logic
    - Performance tracking
    - Cost tracking
    """

    def __init__(
        self,
        mongodb_client: AsyncIOMotorClient,
        db_name: str,
        cache_ttl_minutes: int = 30
    ):
        """
        Initialize query engine.

        Args:
            mongodb_client: MongoDB async client
            db_name: Database name
            cache_ttl_minutes: Cache TTL in minutes
        """
        self.mongodb_client = mongodb_client
        self.db = mongodb_client[db_name]
        self.db_name = db_name
        self.cache_ttl = timedelta(minutes=cache_ttl_minutes)

        # Initialize services
        self.gemini_service = get_gemini_service()
        self.schema_service = get_schema_service(mongodb_client, db_name)
        self.query_validator = QueryValidator()

        # Result cache: {cache_key: {result, timestamp, cost}}
        self._result_cache: Dict[str, Dict[str, Any]] = {}

        logger.info(f"QueryEngine initialized for database: {db_name}")

    async def execute_ai_query(
        self,
        user_prompt: str,
        user_id: str,
        user_role: str = "user",
        conversation_history: Optional[List[Dict[str, str]]] = None,
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        """
        Execute complete AI query pipeline.

        Args:
            user_prompt: User's natural language query
            user_id: User ID (for caching and tracking)
            user_role: User's role (for permissions)
            conversation_history: Previous conversation messages
            force_refresh: Skip cache and force fresh query

        Returns:
            Dict containing:
                - query: Generated MongoDB query
                - results: Query execution results
                - explanation: Human-readable explanation
                - report: AI-generated report with insights
                - metadata: Execution time, cost, cache status
        """
        start_time = datetime.utcnow()

        try:
            # Check cache first (unless force refresh)
            if not force_refresh:
                cached_result = self._get_cached_result(user_prompt, user_id)
                if cached_result:
                    logger.info(f"Cache hit for user {user_id}")
                    cached_result["metadata"]["cache_hit"] = True
                    return cached_result

            # Step 1: Get database schema
            logger.info(f"Getting schema for query: {user_prompt[:50]}...")
            schema = await self.schema_service.get_schema_as_json()

            # Update validator with valid collections
            schema_dict = await self.schema_service.get_schema()
            valid_collections = set(schema_dict.get("collections", {}).keys())
            self.query_validator.set_valid_collections(valid_collections)

            # Step 2: Generate MongoDB query from natural language
            logger.info("Generating MongoDB query with Gemini...")
            query_generation = await self.gemini_service.generate_mongodb_query(
                user_prompt=user_prompt,
                schema=schema,
                conversation_history=conversation_history
            )

            collection = query_generation.get("collection")
            query = query_generation.get("query")
            explanation = query_generation.get("explanation")
            query_cost = query_generation.get("estimated_cost", {})

            # Step 3: Validate query for security
            logger.info(f"Validating query for collection: {collection}...")
            try:
                self.query_validator.validate_query(
                    collection=collection,
                    query=query,
                    user_role=user_role
                )
            except QueryValidationError as e:
                logger.error(f"Query validation failed: {e}")
                raise QueryExecutionError(f"Query validation failed: {str(e)}")

            # Step 4: Execute query on MongoDB
            logger.info(f"Executing query on collection: {collection}...")
            results = await self._execute_mongodb_query(collection, query)

            # Step 5: Generate report with insights
            logger.info("Generating report with Gemini...")
            report = await self.gemini_service.generate_report(
                query_results=results,
                user_prompt=user_prompt,
                query_explanation=explanation
            )
            report_cost = report.get("estimated_cost", {})

            # Calculate total execution time
            execution_time = (datetime.utcnow() - start_time).total_seconds()

            # Build response
            response = {
                "query": {
                    "collection": collection,
                    "pipeline": query,
                    "explanation": explanation
                },
                "results": results,
                "report": {
                    "summary": report.get("summary"),
                    "insights": report.get("insights", []),
                    "statistics": report.get("statistics", {}),
                    "visualization_suggestions": report.get("visualization_suggestions", []),
                    "markdown": report.get("markdown")
                },
                "metadata": {
                    "execution_time_seconds": round(execution_time, 2),
                    "result_count": len(results),
                    "cache_hit": False,
                    "cache_key": self._generate_cache_key(user_prompt, user_id),
                    "cost": {
                        "query_generation": query_cost,
                        "report_generation": report_cost,
                        "total_cost_usd": round(
                            query_cost.get("total_cost_usd", 0) +
                            report_cost.get("total_cost_usd", 0),
                            6
                        )
                    },
                    "timestamp": datetime.utcnow().isoformat()
                }
            }

            # Cache the result
            self._cache_result(user_prompt, user_id, response)

            logger.info(
                f"Query executed successfully: {len(results)} results in {execution_time:.2f}s, "
                f"cost: ${response['metadata']['cost']['total_cost_usd']:.6f}"
            )

            return response

        except QueryValidationError as e:
            logger.error(f"Validation error: {e}")
            raise QueryExecutionError(f"Query validation failed: {str(e)}")

        except Exception as e:
            logger.error(f"Query execution failed: {e}", exc_info=True)
            raise QueryExecutionError(f"Failed to execute query: {str(e)}")

    async def _execute_mongodb_query(
        self,
        collection_name: str,
        pipeline: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Execute MongoDB aggregation pipeline.

        Args:
            collection_name: Collection to query
            pipeline: Aggregation pipeline

        Returns:
            List of result documents

        Raises:
            QueryExecutionError: If execution fails
        """
        try:
            collection = self.db[collection_name]

            # Execute aggregation
            cursor = collection.aggregate(pipeline)
            results = await cursor.to_list(length=None)

            # Convert ObjectId to string for JSON serialization
            results = self._serialize_results(results)

            logger.info(f"Query returned {len(results)} documents")

            return results

        except Exception as e:
            logger.error(f"MongoDB query execution failed: {e}")
            raise QueryExecutionError(f"Database query failed: {str(e)}")

    def _serialize_results(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Serialize MongoDB results for JSON response.

        Converts ObjectId, datetime, etc. to JSON-serializable types.

        Args:
            results: Raw MongoDB results

        Returns:
            Serialized results
        """
        from bson import ObjectId
        from datetime import datetime

        def serialize_value(value):
            if isinstance(value, ObjectId):
                return str(value)
            elif isinstance(value, datetime):
                return value.isoformat()
            elif isinstance(value, dict):
                return {k: serialize_value(v) for k, v in value.items()}
            elif isinstance(value, list):
                return [serialize_value(item) for item in value]
            else:
                return value

        return [serialize_value(doc) for doc in results]

    def _generate_cache_key(self, user_prompt: str, user_id: str) -> str:
        """
        Generate cache key for query.

        Args:
            user_prompt: User's prompt
            user_id: User ID

        Returns:
            Cache key (hash)
        """
        # Include user_id to separate cache by user
        cache_input = f"{user_id}:{user_prompt}".encode('utf-8')
        return hashlib.sha256(cache_input).hexdigest()

    def _get_cached_result(
        self,
        user_prompt: str,
        user_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get cached result if available and not expired.

        Args:
            user_prompt: User's prompt
            user_id: User ID

        Returns:
            Cached result or None
        """
        cache_key = self._generate_cache_key(user_prompt, user_id)

        if cache_key not in self._result_cache:
            return None

        cached_entry = self._result_cache[cache_key]
        cached_time = cached_entry.get("timestamp")

        # Check if cache is still valid
        if datetime.utcnow() - cached_time > self.cache_ttl:
            # Expired, remove from cache
            del self._result_cache[cache_key]
            logger.info(f"Cache expired for key: {cache_key[:16]}...")
            return None

        logger.info(f"Cache hit for key: {cache_key[:16]}...")
        return cached_entry.get("result")

    def _cache_result(
        self,
        user_prompt: str,
        user_id: str,
        result: Dict[str, Any]
    ) -> None:
        """
        Cache query result.

        Args:
            user_prompt: User's prompt
            user_id: User ID
            result: Result to cache
        """
        cache_key = self._generate_cache_key(user_prompt, user_id)

        self._result_cache[cache_key] = {
            "result": result,
            "timestamp": datetime.utcnow()
        }

        logger.info(f"Result cached with key: {cache_key[:16]}...")

    def clear_cache(self) -> None:
        """Clear all cached results"""
        cache_size = len(self._result_cache)
        self._result_cache.clear()
        logger.info(f"Cleared {cache_size} cached results")

    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics.

        Returns:
            Dict with cache stats
        """
        now = datetime.utcnow()
        valid_entries = sum(
            1 for entry in self._result_cache.values()
            if now - entry["timestamp"] <= self.cache_ttl
        )

        return {
            "total_entries": len(self._result_cache),
            "valid_entries": valid_entries,
            "expired_entries": len(self._result_cache) - valid_entries,
            "cache_ttl_minutes": self.cache_ttl.total_seconds() / 60
        }


# Singleton instance
_query_engine: Optional[QueryEngine] = None


def get_query_engine(
    mongodb_client: AsyncIOMotorClient,
    db_name: str,
    cache_ttl_minutes: int = 30
) -> QueryEngine:
    """
    Get singleton instance of QueryEngine.

    Args:
        mongodb_client: MongoDB client
        db_name: Database name
        cache_ttl_minutes: Cache TTL

    Returns:
        QueryEngine instance
    """
    global _query_engine
    if _query_engine is None:
        _query_engine = QueryEngine(mongodb_client, db_name, cache_ttl_minutes)
    return _query_engine
