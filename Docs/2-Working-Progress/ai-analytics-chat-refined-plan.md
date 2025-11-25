# AI Analytics Chat - Refined Step-by-Step Implementation Plan

**Date:** November 24, 2025
**Selected LLM:** Google Gemini 2.0 Flash (Cloud-based)
**Budget:** $500/month
**Approach:** Incremental, step-by-step development
**Estimated Timeline:** 2-3 weeks (MVP in 1 week)

---

## 🎯 Project Decision Summary

### **Final Configuration:**
- **Primary LLM:** Google Gemini 2.0 Flash (93-95% accuracy, $0.075/1M tokens)
- **Deployment:** Cloud-based API (no infrastructure needed)
- **Budget:** $500/month (covers 25,000-35,000 queries)
- **Development Approach:** Step-by-step, incremental releases

### **Key Advantages of Cloud-Based Gemini:**
✅ Zero infrastructure management
✅ 93-95% query accuracy (vs 80-85% for Ollama)
✅ Sub-1 second response times
✅ 75% cost savings with context caching
✅ Automatic scaling to any load
✅ 99.9% uptime SLA

---

## 📅 Step-by-Step Implementation Plan

Each step is designed to be completed, tested, and deployed independently.

---

### **STEP 1: Project Setup & Google Gemini Integration** ⏱️ 1-2 Days

**Goal:** Get Google Gemini API working with a simple test

#### Task 1.1: Google Cloud Setup (2 hours)
```bash
# 1. Create Google Cloud project
# 2. Enable Gemini API
# 3. Create API key
# 4. Set up billing alerts
```

**Deliverables:**
- ✅ Google Cloud project created
- ✅ Gemini API enabled
- ✅ API key obtained
- ✅ Billing alerts configured ($100, $250, $400, $500)

#### Task 1.2: Backend Module Structure (1 hour)
```
src/modules/ai_analytics/
├── __init__.py
├── api/
│   └── v1/
│       ├── __init__.py
│       └── chat.py           # API endpoints
├── services/
│   ├── __init__.py
│   ├── gemini_service.py     # Gemini integration
│   ├── schema_service.py     # Database schema introspection
│   └── query_engine.py       # Query generation & execution
├── models/
│   ├── __init__.py
│   ├── chat.py              # Request/response models
│   └── query.py             # Query models
└── utils/
    ├── __init__.py
    ├── cost_tracker.py      # Cost monitoring
    └── validators.py        # Security validation
```

**Commands:**
```bash
# Create module structure
mkdir -p src/modules/ai_analytics/{api/v1,services,models,utils}
touch src/modules/ai_analytics/{__init__.py,api/__init__.py,api/v1/__init__.py}
```

**Deliverables:**
- ✅ Module structure created
- ✅ Environment variables configured

#### Task 1.3: Gemini Service Implementation (4 hours)

**File:** `src/modules/ai_analytics/services/gemini_service.py`

```python
"""
Google Gemini Integration Service

Handles all interactions with Google Gemini API including:
- Query generation from natural language
- Response formatting
- Context caching for cost optimization
"""

import os
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

logger = logging.getLogger(__name__)

# Configure Gemini
genai.configure(api_key=os.getenv("GOOGLE_GEMINI_API_KEY"))


class GeminiService:
    """Service for Google Gemini AI integration"""

    def __init__(self):
        self.model_name = "gemini-2.0-flash-exp"  # Latest Flash model
        self.schema_cache = None
        self.schema_cache_expiry = None

    async def generate_mongodb_query(
        self,
        user_prompt: str,
        schema_context: str,
        user_id: str,
        user_role: str
    ) -> Dict[str, Any]:
        """
        Generate MongoDB query from natural language prompt

        Args:
            user_prompt: User's natural language question
            schema_context: Database schema information
            user_id: User ID for data filtering
            user_role: User role for permission checking

        Returns:
            {
                "query": {...},
                "collection": "collection_name",
                "operation": "find" | "aggregate" | "count_documents",
                "explanation": "What the query does",
                "confidence": 0.0-1.0
            }
        """
        try:
            # Build the prompt
            system_prompt = self._build_system_prompt(
                schema_context, user_id, user_role
            )

            # Use cached schema if available (75% cost savings!)
            model = await self._get_cached_model(system_prompt)

            # Generate query
            response = model.generate_content(
                user_prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.1,  # Low temperature for consistent outputs
                    top_p=0.95,
                    top_k=40,
                    max_output_tokens=1024,
                    response_mime_type="application/json"  # Force JSON output
                ),
                safety_settings={
                    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
                    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
                    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
                    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE
                }
            )

            # Parse response
            import json
            result = json.loads(response.text)

            # Track token usage and cost
            await self._track_cost(response.usage_metadata)

            logger.info(f"[Gemini] Generated query for prompt: {user_prompt}")
            logger.info(f"[Gemini] Collection: {result.get('collection')}, Operation: {result.get('operation')}")

            return result

        except Exception as e:
            logger.error(f"[Gemini] Error generating query: {e}")
            raise

    async def _get_cached_model(self, system_prompt: str):
        """
        Get model with cached schema context (75% cost savings)

        Cache lasts 1 hour and contains database schema.
        Only user prompts are sent as fresh tokens.
        """
        now = datetime.utcnow()

        # Check if cache expired or doesn't exist
        if (
            self.schema_cache is None
            or self.schema_cache_expiry is None
            or now >= self.schema_cache_expiry
        ):
            logger.info("[Gemini] Creating new schema cache")

            # Create cached content
            self.schema_cache = genai.caching.CachedContent.create(
                model=f'models/{self.model_name}',
                display_name='mongodb_schema_cache',
                system_instruction=system_prompt,
                ttl=timedelta(hours=1)  # Cache for 1 hour
            )
            self.schema_cache_expiry = now + timedelta(hours=1)

            logger.info(f"[Gemini] Schema cache created, expires at {self.schema_cache_expiry}")

        # Return model using cached schema
        return genai.GenerativeModel.from_cached_content(
            cached_content=self.schema_cache
        )

    def _build_system_prompt(
        self,
        schema_context: str,
        user_id: str,
        user_role: str
    ) -> str:
        """Build system prompt for query generation"""
        return f"""You are an AI assistant specialized in generating MongoDB queries for a farm management system.

DATABASE SCHEMA:
{schema_context}

USER CONTEXT:
- User ID: {user_id}
- Role: {user_role}

TASK:
Generate a MongoDB query to answer the user's question. Respond with ONLY valid JSON in this exact format:

{{
  "query": {{ ... MongoDB query object ... }},
  "collection": "collection_name",
  "operation": "find" | "aggregate" | "count_documents" | "distinct",
  "explanation": "Brief explanation of what the query does",
  "confidence": 0.95
}}

CRITICAL RULES:
1. ONLY use read operations (find, aggregate, count_documents, distinct)
2. NEVER use write operations (insert, update, delete, drop)
3. ALWAYS filter by user's data (inject userId filter for farms/blocks)
4. Use proper MongoDB query syntax
5. Return null for unclear or unsafe queries
6. For time-based queries, use ISODate format
7. Include confidence score (0.0-1.0) based on clarity of user prompt

SECURITY:
- User can ONLY access their own farms and blocks
- Add user filter automatically: {{"userId": "{user_id}"}}
- Admins (super_admin, admin) can access all data but still need safety checks

EXAMPLES:

User: "Show me my farms"
Response:
{{
  "query": {{"userId": "{user_id}"}},
  "collection": "farms",
  "operation": "find",
  "explanation": "Retrieve all farms owned by the user",
  "confidence": 1.0
}}

User: "Total yield this month"
Response:
{{
  "query": [
    {{"$match": {{"userId": "{user_id}", "harvestDate": {{"$gte": "2025-11-01T00:00:00Z"}}}}}},
    {{"$group": {{"_id": null, "totalYield": {{"$sum": "$quantityKg"}}}}}}
  ],
  "collection": "block_harvests",
  "operation": "aggregate",
  "explanation": "Sum all harvest yields for current month",
  "confidence": 0.95
}}

User: "Destroy the database"
Response:
{{
  "query": null,
  "collection": null,
  "operation": null,
  "explanation": "Request rejected: destructive operation not allowed",
  "confidence": 0.0
}}

Now process the user's query with maximum accuracy."""

    async def _track_cost(self, usage_metadata):
        """Track token usage and calculate cost"""
        try:
            # Extract token counts
            input_tokens = usage_metadata.prompt_token_count
            output_tokens = usage_metadata.candidates_token_count
            cached_tokens = getattr(usage_metadata, 'cached_content_token_count', 0)

            # Calculate costs (Gemini 2.0 Flash pricing)
            INPUT_COST_PER_M = 0.075  # $0.075 per 1M tokens
            OUTPUT_COST_PER_M = 0.30  # $0.30 per 1M tokens
            CACHED_COST_PER_M = 0.01875  # $0.01875 per 1M tokens (75% discount)

            input_cost = (input_tokens / 1_000_000) * INPUT_COST_PER_M
            output_cost = (output_tokens / 1_000_000) * OUTPUT_COST_PER_M
            cached_cost = (cached_tokens / 1_000_000) * CACHED_COST_PER_M
            total_cost = input_cost + output_cost + cached_cost

            logger.info(
                f"[Gemini Cost] "
                f"Input: {input_tokens} tokens (${input_cost:.6f}), "
                f"Output: {output_tokens} tokens (${output_cost:.6f}), "
                f"Cached: {cached_tokens} tokens (${cached_cost:.6f}), "
                f"Total: ${total_cost:.6f}"
            )

            # Store in cost tracking (will implement in later step)
            # await cost_tracker.track_query_cost(user_id, input_tokens, output_tokens, cached_tokens)

        except Exception as e:
            logger.error(f"[Gemini] Error tracking cost: {e}")


# Singleton instance
gemini_service = GeminiService()
```

**Deliverables:**
- ✅ Gemini service implementation
- ✅ Context caching enabled
- ✅ Cost tracking implemented
- ✅ JSON response parsing

#### Task 1.4: Simple Test (1 hour)

**File:** `test_gemini.py`

```python
"""
Test Gemini integration with simple query

Run: python test_gemini.py
"""

import asyncio
from src.modules.ai_analytics.services.gemini_service import gemini_service

async def test_gemini():
    """Test Gemini with a simple query"""

    # Sample schema (simplified)
    schema = """
    Collections:
    - farms: {farmId: UUID, name: string, userId: UUID, isActive: boolean}
    - blocks: {blockId: UUID, farmId: UUID, userId: UUID, name: string, state: string}
    """

    # Test query
    user_prompt = "Show me all my farms"

    print("Testing Gemini API...")
    print(f"Prompt: {user_prompt}")
    print()

    result = await gemini_service.generate_mongodb_query(
        user_prompt=user_prompt,
        schema_context=schema,
        user_id="test-user-id",
        user_role="farm_manager"
    )

    print("Result:")
    print(f"  Collection: {result['collection']}")
    print(f"  Operation: {result['operation']}")
    print(f"  Query: {result['query']}")
    print(f"  Explanation: {result['explanation']}")
    print(f"  Confidence: {result['confidence']}")

if __name__ == "__main__":
    asyncio.run(test_gemini())
```

**Test:**
```bash
cd C:\Code\A64CorePlatform
python test_gemini.py
```

**Expected Output:**
```
Testing Gemini API...
Prompt: Show me all my farms

Result:
  Collection: farms
  Operation: find
  Query: {'userId': 'test-user-id'}
  Explanation: Retrieve all farms owned by the user
  Confidence: 1.0
```

**Deliverables:**
- ✅ Test script working
- ✅ Gemini generating correct queries
- ✅ Cost tracking visible in logs

**🎉 STEP 1 COMPLETE - Gemini is working!**

---

### **STEP 2: Database Schema Introspection** ⏱️ 1 Day

**Goal:** Automatically discover and format MongoDB schema for LLM

#### Task 2.1: Schema Service Implementation (4 hours)

**File:** `src/modules/ai_analytics/services/schema_service.py`

```python
"""
MongoDB Schema Introspection Service

Automatically discovers MongoDB collections and their structure.
Builds optimized schema context for LLM prompts.
"""

import logging
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
import json
from collections import Counter

from ...farm_manager.database import farm_db

logger = logging.getLogger(__name__)


class SchemaService:
    """Service for MongoDB schema introspection"""

    def __init__(self):
        self.schema_cache: Optional[str] = None
        self.schema_cache_expiry: Optional[datetime] = None
        self.cache_ttl = timedelta(hours=24)  # Cache schema for 24 hours

    async def get_schema_context(self) -> str:
        """
        Get formatted schema context for LLM

        Returns compressed schema with collection names, field names, and types.
        Cached for 24 hours to avoid repeated database scans.
        """
        now = datetime.utcnow()

        # Return cached schema if valid
        if (
            self.schema_cache is not None
            and self.schema_cache_expiry is not None
            and now < self.schema_cache_expiry
        ):
            logger.info("[Schema] Using cached schema")
            return self.schema_cache

        logger.info("[Schema] Discovering database schema...")

        # Discover schema
        schema = await self._discover_schema()

        # Format for LLM
        formatted_schema = self._format_schema_for_llm(schema)

        # Cache the result
        self.schema_cache = formatted_schema
        self.schema_cache_expiry = now + self.cache_ttl

        logger.info(f"[Schema] Schema cached until {self.schema_cache_expiry}")

        return formatted_schema

    async def _discover_schema(self) -> Dict[str, Any]:
        """
        Discover all collections and their schemas

        Returns:
            {
                "farms": {
                    "fields": ["farmId", "name", "userId", ...],
                    "types": {"farmId": "UUID", "name": "string", ...},
                    "sample": {...}
                },
                ...
            }
        """
        db = farm_db.get_database()
        schema = {}

        # Get all collection names
        collection_names = await db.list_collection_names()

        logger.info(f"[Schema] Found {len(collection_names)} collections")

        for collection_name in collection_names:
            # Skip system collections
            if collection_name.startswith("system."):
                continue

            logger.info(f"[Schema] Analyzing collection: {collection_name}")

            collection = db[collection_name]

            # Get sample documents (5 max)
            sample_docs = await collection.find().limit(5).to_list(length=5)

            if not sample_docs:
                logger.warning(f"[Schema] Collection {collection_name} is empty, skipping")
                continue

            # Infer schema from samples
            fields = set()
            field_types = {}

            for doc in sample_docs:
                for key, value in doc.items():
                    fields.add(key)

                    # Infer type
                    if key not in field_types:
                        field_types[key] = self._infer_type(value)

            # Store schema
            schema[collection_name] = {
                "fields": sorted(list(fields)),
                "types": field_types,
                "sample": sample_docs[0] if sample_docs else {},
                "count": await collection.count_documents({})
            }

            logger.info(
                f"[Schema] {collection_name}: "
                f"{len(fields)} fields, "
                f"{schema[collection_name]['count']} documents"
            )

        return schema

    def _infer_type(self, value: Any) -> str:
        """Infer MongoDB field type from value"""
        if value is None:
            return "null"
        elif isinstance(value, bool):
            return "boolean"
        elif isinstance(value, int):
            return "integer"
        elif isinstance(value, float):
            return "number"
        elif isinstance(value, str):
            # Check if it looks like a UUID
            if len(value) == 36 and value.count('-') == 4:
                return "UUID"
            # Check if it looks like a date
            if len(value) >= 19 and 'T' in value:
                return "datetime"
            return "string"
        elif isinstance(value, list):
            if value:
                return f"array<{self._infer_type(value[0])}>"
            return "array"
        elif isinstance(value, dict):
            return "object"
        else:
            return "unknown"

    def _format_schema_for_llm(self, schema: Dict[str, Any]) -> str:
        """
        Format schema in compressed format for LLM

        Example output:
        ```
        Collections (10 total):

        farms (2 documents)
        - farmId: UUID (primary key)
        - name: string
        - userId: UUID (references users)
        - location: object {city, state, country}
        - totalArea: number
        - isActive: boolean

        blocks (8 documents)
        - blockId: UUID (primary key)
        - farmId: UUID (references farms)
        - userId: UUID (references users)
        - name: string
        - state: string (empty|planned|growing|fruiting|harvesting|cleaning|alert)
        ...
        ```
        """
        lines = []
        lines.append(f"DATABASE SCHEMA ({len(schema)} collections):\n")

        # Sort collections by importance (most used first)
        important_collections = [
            "farms", "blocks", "block_harvests", "farm_tasks",
            "block_alerts", "plant_data", "users"
        ]

        sorted_collections = []
        for coll in important_collections:
            if coll in schema:
                sorted_collections.append(coll)

        # Add remaining collections
        for coll in sorted(schema.keys()):
            if coll not in sorted_collections:
                sorted_collections.append(coll)

        for collection_name in sorted_collections:
            info = schema[collection_name]

            lines.append(f"\n{collection_name} ({info['count']} documents)")

            # List fields with types
            for field in info['fields']:
                field_type = info['types'].get(field, 'unknown')
                line = f"- {field}: {field_type}"

                # Add hints for important fields
                if field.endswith('Id') and field != '_id':
                    if field == 'userId':
                        line += " (user ownership - ALWAYS filter by this for non-admin)"
                    elif field == 'farmId':
                        line += " (references farms)"
                    elif field == 'blockId':
                        line += " (references blocks)"

                # Add value hints for enums
                if collection_name == "blocks" and field == "state":
                    line += " (values: empty|planned|growing|fruiting|harvesting|cleaning|alert)"

                lines.append(line)

        result = "\n".join(lines)

        logger.info(f"[Schema] Generated schema context ({len(result)} chars)")

        return result


# Singleton instance
schema_service = SchemaService()
```

**Deliverables:**
- ✅ Schema discovery working
- ✅ Type inference implemented
- ✅ Compressed schema format
- ✅ 24-hour caching

#### Task 2.2: Test Schema Discovery (30 min)

**File:** `test_schema.py`

```python
"""Test schema discovery"""

import asyncio
from src.modules.ai_analytics.services.schema_service import schema_service

async def test_schema():
    print("Discovering MongoDB schema...\n")

    schema_context = await schema_service.get_schema_context()

    print(schema_context)
    print(f"\nTotal length: {len(schema_context)} characters")

if __name__ == "__main__":
    asyncio.run(test_schema())
```

**Test:**
```bash
python test_schema.py
```

**Deliverables:**
- ✅ Schema discovery working
- ✅ All collections found
- ✅ Types correctly inferred

#### Task 2.3: Integrate Schema with Gemini (30 min)

Update `test_gemini.py` to use real schema:

```python
async def test_gemini_with_real_schema():
    """Test Gemini with actual database schema"""
    from src.modules.ai_analytics.services.schema_service import schema_service

    # Get real schema
    schema = await schema_service.get_schema_context()

    # Test queries
    test_queries = [
        "Show me all my farms",
        "How many blocks do I have?",
        "What's the total yield this month?",
        "List blocks in alert state"
    ]

    for query in test_queries:
        print(f"\nQuery: {query}")
        result = await gemini_service.generate_mongodb_query(
            user_prompt=query,
            schema_context=schema,
            user_id="test-user-id",
            user_role="farm_manager"
        )
        print(f"  → {result['operation']} on {result['collection']}")
        print(f"  → {result['explanation']}")
```

**Deliverables:**
- ✅ Gemini using real schema
- ✅ Queries working correctly

**🎉 STEP 2 COMPLETE - Schema discovery working!**

---

### **STEP 3: Query Execution Engine** ⏱️ 1-2 Days

**Goal:** Securely execute MongoDB queries with validation

#### Task 3.1: Query Validator (3 hours)

**File:** `src/modules/ai_analytics/utils/validators.py`

```python
"""
Query Validation and Security

Validates generated queries for security and correctness.
Blocks dangerous operations and operators.
"""

import json
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

# Allowed operations
ALLOWED_OPERATIONS = ["find", "aggregate", "count_documents", "distinct"]

# Blocked operations (security risk)
BLOCKED_OPERATIONS = [
    "insert", "insert_one", "insert_many",
    "update", "update_one", "update_many",
    "delete", "delete_one", "delete_many",
    "drop", "drop_collection", "drop_database",
    "create_collection", "rename"
]

# Blocked operators (code injection risk)
BLOCKED_OPERATORS = [
    "$where",        # JavaScript execution
    "$function",     # JavaScript execution
    "$accumulator",  # JavaScript execution
    "$expr",         # Can be used for injection in some cases
]

# Collections accessible by users
USER_COLLECTIONS = [
    "farms", "blocks", "block_harvests", "farm_tasks",
    "block_alerts", "plant_data"
]

# Admin-only collections
ADMIN_COLLECTIONS = [
    "users", "roles", "permissions", "audit_logs"
]


class QueryValidator:
    """Validates MongoDB queries for security"""

    @staticmethod
    def validate_operation(operation: str) -> bool:
        """Check if operation is allowed"""
        if operation not in ALLOWED_OPERATIONS:
            logger.error(f"[Validator] Blocked operation: {operation}")
            raise SecurityError(f"Operation '{operation}' is not allowed")
        return True

    @staticmethod
    def validate_query(query: Any, collection: str) -> bool:
        """Check query for dangerous operators"""
        query_str = json.dumps(query) if isinstance(query, (dict, list)) else str(query)

        # Check for blocked operators
        for blocked_op in BLOCKED_OPERATORS:
            if blocked_op in query_str:
                logger.error(f"[Validator] Blocked operator: {blocked_op}")
                raise SecurityError(f"Operator '{blocked_op}' is not allowed")

        return True

    @staticmethod
    def validate_collection(collection: str, user_role: str) -> bool:
        """Check if user has access to collection"""
        # Admin can access any collection
        if user_role in ["super_admin", "admin"]:
            return True

        # Regular users can only access user collections
        if collection not in USER_COLLECTIONS:
            logger.error(f"[Validator] Access denied to collection: {collection}")
            raise PermissionError(f"Access denied to collection '{collection}'")

        return True

    @staticmethod
    def inject_user_filter(
        query: Any,
        collection: str,
        user_id: str,
        user_role: str
    ) -> Any:
        """
        Inject user-specific filter to ensure data isolation

        Non-admin users can only see their own data
        """
        # Admin can see all data
        if user_role in ["super_admin", "admin"]:
            logger.info(f"[Validator] Admin user, no filter injection")
            return query

        # Collections that need user filtering
        if collection in USER_COLLECTIONS:
            logger.info(f"[Validator] Injecting userId filter for {collection}")

            if isinstance(query, dict):
                # find() query
                if "userId" not in query:
                    query["userId"] = user_id
                else:
                    # User tried to query other user's data
                    logger.warning(f"[Validator] User tried to bypass userId filter")
                    query["userId"] = user_id  # Override with their own ID

            elif isinstance(query, list):
                # aggregate() pipeline
                # Inject $match stage at the beginning
                user_match = {"$match": {"userId": user_id}}

                # Check if first stage is already a $match
                if query and isinstance(query[0], dict) and "$match" in query[0]:
                    # Merge with existing $match
                    query[0]["$match"]["userId"] = user_id
                else:
                    # Add new $match stage at the beginning
                    query.insert(0, user_match)

        return query


class SecurityError(Exception):
    """Query validation security error"""
    pass


class PermissionError(Exception):
    """Permission denied error"""
    pass


# Singleton instance
query_validator = QueryValidator()
```

**Deliverables:**
- ✅ Operation validation
- ✅ Operator blocking
- ✅ Collection access control
- ✅ User filter injection

#### Task 3.2: Query Engine (4 hours)

**File:** `src/modules/ai_analytics/services/query_engine.py`

```python
"""
Query Engine

Orchestrates the complete flow:
1. Generate query via LLM
2. Validate query for security
3. Inject user filters
4. Execute query with timeout
5. Format results
"""

import logging
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime

from .gemini_service import gemini_service
from .schema_service import schema_service
from ..utils.validators import query_validator, SecurityError, PermissionError
from ...farm_manager.database import farm_db

logger = logging.getLogger(__name__)


class QueryEngine:
    """Secure query generation and execution engine"""

    async def execute_ai_query(
        self,
        user_prompt: str,
        user_id: str,
        user_role: str,
        timeout: float = 5.0
    ) -> Dict[str, Any]:
        """
        Complete pipeline: prompt → query → execution → results

        Args:
            user_prompt: Natural language query from user
            user_id: User ID for data filtering
            user_role: User role for permissions
            timeout: Query execution timeout in seconds

        Returns:
            {
                "success": True,
                "data": [...],
                "query": {...},
                "collection": "...",
                "operation": "...",
                "explanation": "...",
                "execution_time_ms": 123
            }
        """
        start_time = datetime.utcnow()

        try:
            # Step 1: Get database schema
            logger.info(f"[QueryEngine] Processing query: {user_prompt}")
            schema_context = await schema_service.get_schema_context()

            # Step 2: Generate query via Gemini
            logger.info("[QueryEngine] Generating MongoDB query via Gemini...")
            llm_response = await gemini_service.generate_mongodb_query(
                user_prompt=user_prompt,
                schema_context=schema_context,
                user_id=user_id,
                user_role=user_role
            )

            # Check if LLM rejected the query
            if llm_response.get("query") is None:
                logger.warning(f"[QueryEngine] LLM rejected query: {llm_response.get('explanation')}")
                return {
                    "success": False,
                    "error": llm_response.get("explanation", "Query could not be processed"),
                    "execution_time_ms": 0
                }

            query = llm_response["query"]
            collection = llm_response["collection"]
            operation = llm_response["operation"]
            explanation = llm_response["explanation"]

            # Step 3: Validate query (security checks)
            logger.info("[QueryEngine] Validating query security...")
            query_validator.validate_operation(operation)
            query_validator.validate_query(query, collection)
            query_validator.validate_collection(collection, user_role)

            # Step 4: Inject user-specific filters
            logger.info("[QueryEngine] Injecting user filters...")
            filtered_query = query_validator.inject_user_filter(
                query, collection, user_id, user_role
            )

            # Step 5: Execute query with timeout
            logger.info(f"[QueryEngine] Executing {operation} on {collection}...")
            result = await self._execute_with_timeout(
                filtered_query, collection, operation, timeout
            )

            execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

            logger.info(f"[QueryEngine] Query completed in {execution_time:.2f}ms")

            return {
                "success": True,
                "data": result,
                "query": filtered_query,
                "collection": collection,
                "operation": operation,
                "explanation": explanation,
                "execution_time_ms": round(execution_time, 2)
            }

        except SecurityError as e:
            logger.error(f"[QueryEngine] Security error: {e}")
            return {
                "success": False,
                "error": f"Security error: {str(e)}",
                "execution_time_ms": 0
            }

        except PermissionError as e:
            logger.error(f"[QueryEngine] Permission error: {e}")
            return {
                "success": False,
                "error": f"Permission denied: {str(e)}",
                "execution_time_ms": 0
            }

        except asyncio.TimeoutError:
            logger.error(f"[QueryEngine] Query timeout after {timeout}s")
            return {
                "success": False,
                "error": f"Query timeout after {timeout} seconds",
                "execution_time_ms": timeout * 1000
            }

        except Exception as e:
            logger.error(f"[QueryEngine] Unexpected error: {e}")
            return {
                "success": False,
                "error": f"Query execution failed: {str(e)}",
                "execution_time_ms": 0
            }

    async def _execute_with_timeout(
        self,
        query: Any,
        collection: str,
        operation: str,
        timeout: float
    ) -> Any:
        """Execute MongoDB query with timeout protection"""
        db = farm_db.get_database()
        coll = db[collection]

        async def _execute():
            if operation == "find":
                # Convert to list (max 1000 documents)
                cursor = coll.find(query).limit(1000)
                results = await cursor.to_list(length=1000)
                return results

            elif operation == "count_documents":
                count = await coll.count_documents(query)
                return {"count": count}

            elif operation == "distinct":
                # query format: {"field": "fieldName", "filter": {...}}
                field = query.get("field")
                filter_query = query.get("filter", {})
                values = await coll.distinct(field, filter_query)
                return values

            elif operation == "aggregate":
                # query is a pipeline (list of stages)
                cursor = coll.aggregate(query)
                results = await cursor.to_list(length=1000)
                return results

            else:
                raise ValueError(f"Unknown operation: {operation}")

        # Execute with timeout
        try:
            result = await asyncio.wait_for(_execute(), timeout=timeout)
            return result
        except asyncio.TimeoutError:
            logger.error(f"[QueryEngine] Query timeout: {operation} on {collection}")
            raise


# Singleton instance
query_engine = QueryEngine()
```

**Deliverables:**
- ✅ Complete query pipeline
- ✅ Security validation integrated
- ✅ Timeout protection
- ✅ Error handling

#### Task 3.3: Test Query Engine (1 hour)

**File:** `test_query_engine.py`

```python
"""Test complete query engine pipeline"""

import asyncio
from src.modules.ai_analytics.services.query_engine import query_engine

async def test_queries():
    """Test various queries through complete pipeline"""

    test_cases = [
        {
            "prompt": "Show me all my farms",
            "user_id": "ae5e7ee3-0bc5-4a71-a070-c2f5ca328aae",  # Real user ID
            "user_role": "super_admin"
        },
        {
            "prompt": "How many blocks do I have?",
            "user_id": "ae5e7ee3-0bc5-4a71-a070-c2f5ca328aae",
            "user_role": "super_admin"
        },
        {
            "prompt": "List all harvest records",
            "user_id": "ae5e7ee3-0bc5-4a71-a070-c2f5ca328aae",
            "user_role": "super_admin"
        },
        {
            "prompt": "DELETE ALL FARMS",  # Should be rejected
            "user_id": "ae5e7ee3-0bc5-4a71-a070-c2f5ca328aae",
            "user_role": "super_admin"
        }
    ]

    for i, test_case in enumerate(test_cases, 1):
        print(f"\n{'='*60}")
        print(f"Test {i}: {test_case['prompt']}")
        print('='*60)

        result = await query_engine.execute_ai_query(
            user_prompt=test_case["prompt"],
            user_id=test_case["user_id"],
            user_role=test_case["user_role"]
        )

        if result["success"]:
            print(f"✅ Success!")
            print(f"  Collection: {result['collection']}")
            print(f"  Operation: {result['operation']}")
            print(f"  Explanation: {result['explanation']}")
            print(f"  Results: {len(result['data'])} items")
            print(f"  Execution time: {result['execution_time_ms']}ms")
        else:
            print(f"❌ Failed!")
            print(f"  Error: {result['error']}")

if __name__ == "__main__":
    asyncio.run(test_queries())
```

**Test:**
```bash
python test_query_engine.py
```

**Expected Output:**
```
Test 1: Show me all my farms
✅ Success!
  Collection: farms
  Operation: find
  Explanation: Retrieve all farms owned by the user
  Results: 2 items
  Execution time: 245.32ms

Test 2: How many blocks do I have?
✅ Success!
  Collection: blocks
  Operation: count_documents
  Explanation: Count total number of blocks
  Results: 1 items
  Execution time: 123.45ms

Test 3: List all harvest records
✅ Success!
  Collection: block_harvests
  Operation: find
  Explanation: Retrieve all harvest records
  Results: 2 items
  Execution time: 189.67ms

Test 4: DELETE ALL FARMS
❌ Failed!
  Error: Query rejected: destructive operation not allowed
```

**Deliverables:**
- ✅ All test queries working
- ✅ Security validation blocking dangerous queries
- ✅ Results returned correctly

**🎉 STEP 3 COMPLETE - Query engine working!**

---

## 📝 Implementation Progress Tracker

| Step | Task | Status | Duration | Deliverables |
|------|------|--------|----------|-------------|
| **1** | **Gemini Integration** | | **1-2 days** | |
| 1.1 | Google Cloud setup | ⏳ Pending | 2 hours | API key, billing alerts |
| 1.2 | Module structure | ⏳ Pending | 1 hour | Folder structure |
| 1.3 | Gemini service | ⏳ Pending | 4 hours | Working service with caching |
| 1.4 | Simple test | ⏳ Pending | 1 hour | Test script passing |
| **2** | **Schema Discovery** | | **1 day** | |
| 2.1 | Schema service | ⏳ Pending | 4 hours | Auto-discovery working |
| 2.2 | Test discovery | ⏳ Pending | 30 min | All collections found |
| 2.3 | Integration | ⏳ Pending | 30 min | Gemini using real schema |
| **3** | **Query Engine** | | **1-2 days** | |
| 3.1 | Query validator | ⏳ Pending | 3 hours | Security validation |
| 3.2 | Query engine | ⏳ Pending | 4 hours | Complete pipeline |
| 3.3 | Test engine | ⏳ Pending | 1 hour | All tests passing |

---

## 🚀 Next Steps After Step 3

Once Steps 1-3 are complete, we'll have a **fully functional backend**. Then we proceed to:

**STEP 4:** API Endpoints (1 day)
**STEP 5:** Frontend Chat UI (2 days)
**STEP 6:** Cost Management & Quotas (1 day)
**STEP 7:** Testing & Deployment (1 day)

---

## ❓ Ready to Start?

**To begin Step 1, I need:**
1. ✅ Budget approval ($500/month)
2. ✅ Google Cloud account credentials (or create new account)
3. ✅ Confirm ready to proceed

Should I start with **Step 1: Gemini Integration**?
