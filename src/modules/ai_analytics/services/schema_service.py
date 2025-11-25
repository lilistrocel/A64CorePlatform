"""
Schema Service

Automatically discovers and caches MongoDB database schema.
Provides schema information to Gemini for query generation.
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import json
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)


class SchemaService:
    """
    Service for MongoDB schema introspection and caching.

    Features:
    - Automatic schema discovery
    - Field type inference
    - Index information
    - Collection relationships
    - Smart caching (24-hour TTL)
    """

    def __init__(self, mongodb_client: AsyncIOMotorClient, db_name: str):
        """
        Initialize schema service.

        Args:
            mongodb_client: MongoDB async client
            db_name: Database name
        """
        self.client = mongodb_client
        self.db = self.client[db_name]
        self.db_name = db_name

        # Schema cache
        self._schema_cache: Optional[Dict[str, Any]] = None
        self._schema_cache_timestamp: Optional[datetime] = None
        self._cache_ttl_hours = 24  # Refresh schema every 24 hours

        logger.info(f"SchemaService initialized for database: {db_name}")

    async def get_schema(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Get database schema (cached or fresh).

        Args:
            force_refresh: Force schema refresh even if cached

        Returns:
            Schema dict with collections, fields, types, indexes
        """
        # Check cache
        if not force_refresh and self._is_cache_valid():
            logger.info("Returning cached schema")
            return self._schema_cache

        # Discover fresh schema
        logger.info("Discovering database schema...")
        schema = await self._discover_schema()

        # Update cache
        self._schema_cache = schema
        self._schema_cache_timestamp = datetime.utcnow()

        return schema

    async def get_schema_as_json(self, force_refresh: bool = False) -> str:
        """
        Get schema as JSON string for Gemini.

        Args:
            force_refresh: Force schema refresh

        Returns:
            JSON string representation of schema
        """
        schema = await self.get_schema(force_refresh)
        return json.dumps(schema, indent=2)

    async def get_collection_info(self, collection_name: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a specific collection.

        Args:
            collection_name: Name of collection

        Returns:
            Collection info dict or None if not found
        """
        schema = await self.get_schema()
        return schema.get("collections", {}).get(collection_name)

    def _is_cache_valid(self) -> bool:
        """
        Check if schema cache is still valid.

        Returns:
            True if cache is valid
        """
        if self._schema_cache is None or self._schema_cache_timestamp is None:
            return False

        age = datetime.utcnow() - self._schema_cache_timestamp
        return age < timedelta(hours=self._cache_ttl_hours)

    async def _discover_schema(self) -> Dict[str, Any]:
        """
        Discover complete database schema.

        Returns:
            Schema dict
        """
        schema = {
            "database": self.db_name,
            "discovered_at": datetime.utcnow().isoformat(),
            "collections": {}
        }

        # Get all collection names
        collection_names = await self.db.list_collection_names()

        logger.info(f"Found {len(collection_names)} collections")

        # Discover each collection
        for collection_name in collection_names:
            try:
                collection_info = await self._discover_collection(collection_name)
                schema["collections"][collection_name] = collection_info
            except Exception as e:
                logger.error(f"Failed to discover collection {collection_name}: {e}")
                schema["collections"][collection_name] = {
                    "error": str(e),
                    "fields": {},
                    "indexes": []
                }

        return schema

    async def _discover_collection(self, collection_name: str) -> Dict[str, Any]:
        """
        Discover schema for a single collection.

        Args:
            collection_name: Collection name

        Returns:
            Collection info dict
        """
        collection = self.db[collection_name]

        # Get document count
        doc_count = await collection.count_documents({})

        # Get indexes
        indexes = await self._get_indexes(collection)

        # Sample documents to infer schema
        fields = await self._infer_fields(collection)

        # Get relationships (foreign key-like fields)
        relationships = self._infer_relationships(fields)

        return {
            "name": collection_name,
            "document_count": doc_count,
            "fields": fields,
            "indexes": indexes,
            "relationships": relationships
        }

    async def _infer_fields(self, collection) -> Dict[str, Dict[str, Any]]:
        """
        Infer field types from sample documents.

        Args:
            collection: MongoDB collection

        Returns:
            Dict of field info
        """
        # Sample up to 100 documents
        sample_size = 100
        cursor = collection.find().limit(sample_size)
        documents = await cursor.to_list(length=sample_size)

        if not documents:
            return {}

        # Analyze fields
        field_info = {}

        for doc in documents:
            self._analyze_document(doc, field_info)

        # Calculate field statistics and convert sets to lists for JSON serialization
        from bson import ObjectId
        from datetime import datetime
        for field_name, info in field_info.items():
            info["appears_in_percent"] = round(
                (info["count"] / len(documents)) * 100, 1
            )

            # Convert type set to list
            if isinstance(info["type"], set):
                info["type"] = list(info["type"])

            # Serialize ObjectId and datetime values in sample_values
            serialized_samples = []
            for val in info["sample_values"]:
                if isinstance(val, ObjectId):
                    serialized_samples.append(str(val))
                elif isinstance(val, datetime):
                    serialized_samples.append(val.isoformat())
                else:
                    serialized_samples.append(val)
            info["sample_values"] = serialized_samples

        return field_info

    def _analyze_document(
        self,
        doc: Dict[str, Any],
        field_info: Dict[str, Dict[str, Any]],
        prefix: str = ""
    ) -> None:
        """
        Recursively analyze document to extract field information.

        Args:
            doc: Document to analyze
            field_info: Dict to store field info
            prefix: Field path prefix for nested fields
        """
        for key, value in doc.items():
            # Build field path
            field_path = f"{prefix}.{key}" if prefix else key

            # Initialize field info if not exists
            if field_path not in field_info:
                field_info[field_path] = {
                    "type": set(),
                    "count": 0,
                    "sample_values": [],
                    "is_array": False,
                    "is_nested": False
                }

            info = field_info[field_path]
            info["count"] += 1

            # Determine type
            if value is None:
                info["type"].add("null")
            elif isinstance(value, bool):
                info["type"].add("boolean")
            elif isinstance(value, int):
                info["type"].add("integer")
            elif isinstance(value, float):
                info["type"].add("float")
            elif isinstance(value, str):
                info["type"].add("string")
                # Check if it looks like an ObjectId
                if len(value) == 24 and all(c in '0123456789abcdef' for c in value.lower()):
                    info["type"].add("ObjectId")
            elif isinstance(value, list):
                info["is_array"] = True
                info["type"].add("array")
                # Analyze array elements
                if value and isinstance(value[0], dict):
                    info["is_nested"] = True
                    # Sample first element
                    self._analyze_document(value[0], field_info, f"{field_path}[]")
            elif isinstance(value, dict):
                info["is_nested"] = True
                info["type"].add("object")
                # Recursively analyze nested document
                self._analyze_document(value, field_info, field_path)
            else:
                info["type"].add(type(value).__name__)

            # Store sample values (first 3 unique values)
            if len(info["sample_values"]) < 3 and value not in info["sample_values"]:
                if not isinstance(value, (dict, list)):  # Don't store complex values
                    info["sample_values"].append(value)

    async def _get_indexes(self, collection) -> List[Dict[str, Any]]:
        """
        Get index information for collection.

        Args:
            collection: MongoDB collection

        Returns:
            List of index info dicts
        """
        try:
            indexes = []
            async for index in collection.list_indexes():
                indexes.append({
                    "name": index.get("name"),
                    "keys": dict(index.get("key", {})),
                    "unique": index.get("unique", False),
                    "sparse": index.get("sparse", False)
                })
            return indexes
        except Exception as e:
            logger.error(f"Failed to get indexes: {e}")
            return []

    def _infer_relationships(self, fields: Dict[str, Dict[str, Any]]) -> List[Dict[str, str]]:
        """
        Infer relationships between collections based on field names.

        Args:
            fields: Field info dict

        Returns:
            List of relationship dicts
        """
        relationships = []

        for field_path, info in fields.items():
            # Look for fields that end with _id (foreign keys)
            if field_path.endswith("_id") and "ObjectId" in info.get("type", []):
                # Extract potential collection name
                # e.g., "farm_id" -> "farms", "user_id" -> "users"
                ref_field = field_path.replace("_id", "")
                potential_collection = f"{ref_field}s"  # Simple pluralization

                relationships.append({
                    "field": field_path,
                    "references": potential_collection,
                    "type": "ObjectId",
                    "note": "Inferred relationship (might need verification)"
                })

        return relationships

    def clear_cache(self) -> None:
        """Clear schema cache to force refresh on next request"""
        self._schema_cache = None
        self._schema_cache_timestamp = None
        logger.info("Schema cache cleared")


# Singleton instance
_schema_service: Optional[SchemaService] = None


def get_schema_service(mongodb_client: AsyncIOMotorClient, db_name: str) -> SchemaService:
    """
    Get singleton instance of SchemaService.

    Args:
        mongodb_client: MongoDB client
        db_name: Database name

    Returns:
        SchemaService instance
    """
    global _schema_service
    if _schema_service is None:
        _schema_service = SchemaService(mongodb_client, db_name)
    return _schema_service
