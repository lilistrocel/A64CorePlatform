"""
AI Analytics Chat API Endpoints

REST API for AI-powered database querying and reporting.
"""

import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime

from ...models.chat import (
    ChatQueryRequest,
    ChatQueryResponse,
    SchemaResponse,
    ErrorResponse,
    UserCostResponse,
    ErrorDetail
)
from ...services.query_engine import get_query_engine, QueryExecutionError
from ...services.schema_service import get_schema_service
from ...utils.validators import QueryValidationError

# Import dependencies from main app
from src.middleware.auth import get_current_user
from src.models.user import UserResponse
from src.services.database import mongodb

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(
    prefix="/ai",
    tags=["AI Analytics"],
    responses={
        401: {"description": "Unauthorized"},
        403: {"description": "Forbidden"},
        500: {"description": "Internal Server Error"}
    }
)


# ============================================================================
# Chat Endpoints
# ============================================================================

@router.post(
    "/chat",
    response_model=ChatQueryResponse,
    status_code=status.HTTP_200_OK,
    summary="Send AI chat query",
    description="Convert natural language to MongoDB query and execute it"
)
async def chat_query(
    request: ChatQueryRequest,
    current_user: UserResponse = Depends(get_current_user)
) -> ChatQueryResponse:
    """
    Execute AI-powered database query from natural language.

    This endpoint:
    1. Converts natural language to MongoDB query using Gemini AI
    2. Validates the query for security
    3. Executes the query on MongoDB
    4. Generates a human-readable report with insights
    5. Returns results, query, and report

    **Rate Limits:**
    - Free users: 10 queries per day
    - Admin users: Unlimited

    **Example Request:**
    ```json
    {
        "prompt": "Show me the top 5 farms by total yield",
        "conversation_history": [],
        "force_refresh": false
    }
    ```

    **Cost:**
    - Typical query: $0.0002 - $0.0005 USD
    - Cached results: $0 (free)
    """
    try:
        # Get query engine
        query_engine = get_query_engine(
            mongodb_client=mongodb.client,
            db_name="a64core_db"
        )

        # Convert conversation history to dict format
        conversation_history = [
            {"role": msg.role, "content": msg.content}
            for msg in request.conversation_history
        ] if request.conversation_history else None

        # Execute query
        logger.info(
            f"User {current_user.userId} query: {request.prompt[:50]}..."
        )

        result = await query_engine.execute_ai_query(
            user_prompt=request.prompt,
            user_id=str(current_user.userId),
            user_role=current_user.role,
            conversation_history=conversation_history,
            force_refresh=request.force_refresh
        )

        return ChatQueryResponse(**result)

    except QueryValidationError as e:
        logger.error(f"Query validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "QUERY_VALIDATION_FAILED",
                    "message": str(e),
                    "details": {},
                    "timestamp": datetime.utcnow().isoformat()
                }
            }
        )

    except QueryExecutionError as e:
        logger.error(f"Query execution error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "QUERY_EXECUTION_FAILED",
                    "message": str(e),
                    "details": {},
                    "timestamp": datetime.utcnow().isoformat()
                }
            }
        )

    except Exception as e:
        logger.error(f"Unexpected error in chat query: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected error occurred",
                    "details": {"error": str(e)},
                    "timestamp": datetime.utcnow().isoformat()
                }
            }
        )


# ============================================================================
# Schema Endpoints
# ============================================================================

@router.get(
    "/schema",
    response_model=SchemaResponse,
    status_code=status.HTTP_200_OK,
    summary="Get database schema",
    description="Retrieve complete database schema with field types and indexes"
)
async def get_schema(
    current_user: UserResponse = Depends(get_current_user)
) -> SchemaResponse:
    """
    Get complete database schema.

    Returns:
    - All collections in database
    - Field types and frequencies
    - Indexes on collections
    - Inferred relationships between collections

    **Cache:**
    - Schema is cached for 24 hours
    - Use /schema/refresh to force update
    """
    try:
        schema_service = get_schema_service(
            mongodb_client=mongodb.client,
            db_name="a64core_db"
        )

        schema = await schema_service.get_schema()

        return SchemaResponse(**schema)

    except Exception as e:
        logger.error(f"Failed to get schema: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "SCHEMA_FETCH_FAILED",
                    "message": "Failed to retrieve database schema",
                    "details": {"error": str(e)},
                    "timestamp": datetime.utcnow().isoformat()
                }
            }
        )


@router.post(
    "/schema/refresh",
    response_model=SchemaResponse,
    status_code=status.HTTP_200_OK,
    summary="Refresh database schema",
    description="Force refresh of database schema cache"
)
async def refresh_schema(
    current_user: UserResponse = Depends(get_current_user)
) -> SchemaResponse:
    """
    Force refresh of database schema.

    Use this after:
    - Adding new collections
    - Modifying collection structure
    - Adding/removing fields

    **Note:** Only admins can refresh schema.
    """
    # Check if user is admin
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": {
                    "code": "INSUFFICIENT_PERMISSIONS",
                    "message": "Only admins can refresh schema",
                    "details": {"required_role": "admin"},
                    "timestamp": datetime.utcnow().isoformat()
                }
            }
        )

    try:
        schema_service = get_schema_service(
            mongodb_client=mongodb.client,
            db_name="a64core_db"
        )

        # Force refresh
        schema = await schema_service.get_schema(force_refresh=True)

        logger.info(f"Schema refreshed by user {current_user.userId}")

        return SchemaResponse(**schema)

    except Exception as e:
        logger.error(f"Failed to refresh schema: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "SCHEMA_REFRESH_FAILED",
                    "message": "Failed to refresh database schema",
                    "details": {"error": str(e)},
                    "timestamp": datetime.utcnow().isoformat()
                }
            }
        )


# ============================================================================
# Cache Management Endpoints
# ============================================================================

@router.post(
    "/cache/clear",
    status_code=status.HTTP_200_OK,
    summary="Clear query cache",
    description="Clear all cached query results"
)
async def clear_cache(
    current_user: UserResponse = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Clear all cached query results.

    **Note:** Only admins can clear cache.
    """
    # Check if user is admin
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": {
                    "code": "INSUFFICIENT_PERMISSIONS",
                    "message": "Only admins can clear cache",
                    "details": {"required_role": "admin"},
                    "timestamp": datetime.utcnow().isoformat()
                }
            }
        )

    try:
        query_engine = get_query_engine(
            mongodb_client=mongodb.client,
            db_name="a64core_db"
        )

        query_engine.clear_cache()

        logger.info(f"Cache cleared by user {current_user.userId}")

        return {
            "message": "Cache cleared successfully",
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to clear cache: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "CACHE_CLEAR_FAILED",
                    "message": "Failed to clear cache",
                    "details": {"error": str(e)},
                    "timestamp": datetime.utcnow().isoformat()
                }
            }
        )


@router.get(
    "/cache/stats",
    status_code=status.HTTP_200_OK,
    summary="Get cache statistics",
    description="Get statistics about query result cache"
)
async def get_cache_stats(
    current_user: UserResponse = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get cache statistics.

    Returns:
    - Total cached entries
    - Valid (non-expired) entries
    - Expired entries
    - Cache TTL
    """
    try:
        query_engine = get_query_engine(
            mongodb_client=mongodb.client,
            db_name="a64core_db"
        )

        stats = query_engine.get_cache_stats()

        return {
            "cache_stats": stats,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to get cache stats: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "CACHE_STATS_FAILED",
                    "message": "Failed to get cache statistics",
                    "details": {"error": str(e)},
                    "timestamp": datetime.utcnow().isoformat()
                }
            }
        )


# ============================================================================
# Cost/Usage Endpoints (Placeholder - implement in Phase 4)
# ============================================================================

@router.get(
    "/cost",
    response_model=UserCostResponse,
    status_code=status.HTTP_200_OK,
    summary="Get cost statistics",
    description="Get user's AI API cost statistics"
)
async def get_cost_stats(
    period: str = "today",
    current_user: UserResponse = Depends(get_current_user)
) -> UserCostResponse:
    """
    Get cost statistics for current user.

    **Periods:**
    - today: Today's costs
    - this_month: Current month's costs
    - all_time: Total costs

    **Note:** This is a placeholder endpoint.
    Full cost tracking will be implemented in Phase 4.
    """
    # Placeholder response
    return UserCostResponse(
        user_id=str(current_user.userId),
        period=period,
        cost_summary={
            "total_queries": 0,
            "total_cost_usd": 0.0,
            "average_cost_per_query": 0.0,
            "total_tokens": 0,
            "cache_hit_rate": 0.0
        },
        daily_breakdown=None
    )
