"""
AI Analytics Chat Models

Pydantic models for API request/response validation.
"""

from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel, Field
from datetime import datetime


# ============================================================================
# Request Models
# ============================================================================

class ConversationMessage(BaseModel):
    """Single message in conversation history"""
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")
    timestamp: Optional[str] = Field(None, description="Message timestamp (ISO format)")


class ChatQueryRequest(BaseModel):
    """Request model for AI chat query"""
    prompt: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="User's natural language query",
        examples=["Show me all farms with more than 10 blocks"]
    )
    conversation_history: Optional[List[ConversationMessage]] = Field(
        default=[],
        max_length=10,
        description="Previous conversation messages (max 10)"
    )
    force_refresh: bool = Field(
        default=False,
        description="Skip cache and force fresh query"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "prompt": "Show me the top 5 farms by total yield",
                "conversation_history": [
                    {
                        "role": "user",
                        "content": "Show me all farms"
                    },
                    {
                        "role": "assistant",
                        "content": "Found 15 farms..."
                    }
                ],
                "force_refresh": False
            }
        }


# ============================================================================
# Response Models
# ============================================================================

class QueryInfo(BaseModel):
    """Information about the generated MongoDB query"""
    collection: str = Field(..., description="Target MongoDB collection")
    pipeline: List[Dict[str, Any]] = Field(..., description="MongoDB aggregation pipeline")
    explanation: str = Field(..., description="Human-readable explanation of query")


class VisualizationSuggestion(BaseModel):
    """Suggested visualization for data"""
    type: str = Field(..., description="Chart type: bar_chart, pie_chart, line_chart, etc.")
    title: str = Field(..., description="Chart title")
    x_axis: Optional[str] = Field(None, description="X-axis field (for bar/line charts)")
    y_axis: Optional[str] = Field(None, description="Y-axis field (for bar/line charts)")
    data_field: Optional[str] = Field(None, description="Data field (for pie charts)")


class ReportInfo(BaseModel):
    """AI-generated report with insights"""
    summary: str = Field(..., description="2-3 sentence high-level summary")
    insights: List[str] = Field(..., description="Key insights from data")
    statistics: Dict[str, Any] = Field(default={}, description="Important statistics")
    visualization_suggestions: List[VisualizationSuggestion] = Field(
        default=[],
        description="Suggested charts/graphs"
    )
    markdown: str = Field(..., description="Formatted markdown report")


class CostInfo(BaseModel):
    """Cost tracking information"""
    query_generation: Dict[str, Any] = Field(..., description="Cost for query generation")
    report_generation: Dict[str, Any] = Field(..., description="Cost for report generation")
    total_cost_usd: float = Field(..., description="Total cost in USD")


class MetadataInfo(BaseModel):
    """Query execution metadata"""
    execution_time_seconds: float = Field(..., description="Total execution time")
    result_count: int = Field(..., description="Number of results returned")
    cache_hit: bool = Field(..., description="Whether result was from cache")
    cache_key: str = Field(..., description="Cache key for this query")
    cost: CostInfo = Field(..., description="Cost breakdown")
    timestamp: str = Field(..., description="Query timestamp (ISO format)")


class ChatQueryResponse(BaseModel):
    """Response model for AI chat query"""
    query: QueryInfo = Field(..., description="Generated MongoDB query information")
    results: List[Dict[str, Any]] = Field(..., description="Query execution results")
    report: ReportInfo = Field(..., description="AI-generated report with insights")
    metadata: MetadataInfo = Field(..., description="Execution metadata")

    class Config:
        json_schema_extra = {
            "example": {
                "query": {
                    "collection": "farms",
                    "pipeline": [
                        {"$match": {"status": "active"}},
                        {"$limit": 10}
                    ],
                    "explanation": "Finding all active farms, limited to 10 results"
                },
                "results": [
                    {"_id": "123", "name": "Farm A", "blocks": 15},
                    {"_id": "456", "name": "Farm B", "blocks": 22}
                ],
                "report": {
                    "summary": "Found 2 active farms with a total of 37 blocks.",
                    "insights": [
                        "Farm B has 47% more blocks than Farm A",
                        "Both farms are currently active"
                    ],
                    "statistics": {
                        "total_farms": 2,
                        "total_blocks": 37,
                        "average_blocks": 18.5
                    },
                    "visualization_suggestions": [
                        {
                            "type": "bar_chart",
                            "title": "Blocks per Farm",
                            "x_axis": "name",
                            "y_axis": "blocks"
                        }
                    ],
                    "markdown": "# Farm Analysis\\n\\nFound 2 active farms..."
                },
                "metadata": {
                    "execution_time_seconds": 1.23,
                    "result_count": 2,
                    "cache_hit": False,
                    "cache_key": "abc123...",
                    "cost": {
                        "query_generation": {
                            "input_tokens": 1500,
                            "output_tokens": 150,
                            "total_cost_usd": 0.000158
                        },
                        "report_generation": {
                            "input_tokens": 800,
                            "output_tokens": 200,
                            "total_cost_usd": 0.000120
                        },
                        "total_cost_usd": 0.000278
                    },
                    "timestamp": "2025-11-24T12:00:00"
                }
            }
        }


# ============================================================================
# Schema Models
# ============================================================================

class CollectionFieldInfo(BaseModel):
    """Information about a collection field"""
    type: List[str] = Field(..., description="Field types (string, integer, etc.)")
    count: int = Field(..., description="Number of documents with this field")
    appears_in_percent: float = Field(..., description="Percentage of documents with field")
    sample_values: List[Any] = Field(default=[], description="Sample values")
    is_array: bool = Field(default=False, description="Whether field is an array")
    is_nested: bool = Field(default=False, description="Whether field is nested object")


class CollectionIndexInfo(BaseModel):
    """Information about a collection index"""
    name: str = Field(..., description="Index name")
    keys: Dict[str, Union[int, str]] = Field(..., description="Index keys and direction (int for normal, str for text indexes)")
    unique: bool = Field(default=False, description="Whether index is unique")
    sparse: bool = Field(default=False, description="Whether index is sparse")


class CollectionRelationship(BaseModel):
    """Inferred relationship between collections"""
    field: str = Field(..., description="Field name (foreign key)")
    references: str = Field(..., description="Referenced collection name")
    type: str = Field(..., description="Field type (usually ObjectId)")
    note: str = Field(..., description="Additional notes")


class CollectionInfo(BaseModel):
    """Information about a MongoDB collection"""
    name: str = Field(..., description="Collection name")
    document_count: int = Field(..., description="Number of documents")
    fields: Dict[str, CollectionFieldInfo] = Field(..., description="Field information")
    indexes: List[CollectionIndexInfo] = Field(..., description="Index information")
    relationships: List[CollectionRelationship] = Field(
        default=[],
        description="Inferred relationships"
    )


class SchemaResponse(BaseModel):
    """Response model for database schema"""
    database: str = Field(..., description="Database name")
    discovered_at: str = Field(..., description="Schema discovery timestamp")
    collections: Dict[str, CollectionInfo] = Field(..., description="Collection information")

    class Config:
        json_schema_extra = {
            "example": {
                "database": "a64core_db",
                "discovered_at": "2025-11-24T12:00:00",
                "collections": {
                    "farms": {
                        "name": "farms",
                        "document_count": 15,
                        "fields": {
                            "_id": {
                                "type": ["ObjectId"],
                                "count": 15,
                                "appears_in_percent": 100.0,
                                "sample_values": []
                            },
                            "name": {
                                "type": ["string"],
                                "count": 15,
                                "appears_in_percent": 100.0,
                                "sample_values": ["Farm A", "Farm B"]
                            }
                        },
                        "indexes": [
                            {
                                "name": "_id_",
                                "keys": {"_id": 1},
                                "unique": False,
                                "sparse": False
                            }
                        ],
                        "relationships": []
                    }
                }
            }
        }


# ============================================================================
# Cost/Usage Models
# ============================================================================

class CostSummary(BaseModel):
    """Summary of AI API costs"""
    total_queries: int = Field(..., description="Total number of queries")
    total_cost_usd: float = Field(..., description="Total cost in USD")
    average_cost_per_query: float = Field(..., description="Average cost per query")
    total_tokens: int = Field(..., description="Total tokens used")
    cache_hit_rate: float = Field(..., description="Cache hit rate (0.0 to 1.0)")


class UserCostResponse(BaseModel):
    """Response model for user cost statistics"""
    user_id: str = Field(..., description="User ID")
    period: str = Field(..., description="Time period (today, this_month, all_time)")
    cost_summary: CostSummary = Field(..., description="Cost summary")
    daily_breakdown: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Daily cost breakdown"
    )


# ============================================================================
# Error Models
# ============================================================================

class ErrorDetail(BaseModel):
    """Detailed error information"""
    code: str = Field(..., description="Error code")
    message: str = Field(..., description="Error message")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional error details")
    timestamp: str = Field(..., description="Error timestamp")


class ErrorResponse(BaseModel):
    """Error response model"""
    error: ErrorDetail = Field(..., description="Error information")

    class Config:
        json_schema_extra = {
            "example": {
                "error": {
                    "code": "QUERY_VALIDATION_FAILED",
                    "message": "Query validation failed: Dangerous operator '$where' not allowed",
                    "details": {
                        "operator": "$where",
                        "stage": 2
                    },
                    "timestamp": "2025-11-24T12:00:00"
                }
            }
        }
