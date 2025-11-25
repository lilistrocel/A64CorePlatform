# AI-Powered Analytics Chat System - Implementation Plan

**Date:** November 24, 2025
**Project:** Centralized Controls Monitoring (CCM) Dashboard AI Chat
**Complexity:** HIGH
**Estimated Timeline:** 2-3 weeks

---

## 🎯 Project Overview

Transform the CCM Dashboard into an AI-powered analytics interface where users can:
- Ask natural language questions about their data
- Get instant MongoDB query results
- Receive formatted reports and visualizations
- Have conversational follow-ups and context awareness

**Example User Interactions:**
- "Show me total sales for this week"
- "Which products are running low on stock?"
- "Compare revenue between Electronics and Clothing categories"
- "Show me a chart of daily sales for the last 30 days"

---

## 🏗️ System Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React/TypeScript)              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Chat Interface Component                      │  │
│  │  - Input field with auto-complete                     │  │
│  │  - Message history display                            │  │
│  │  - Response visualization (charts/tables)            │  │
│  │  - Loading states & error handling                    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓ HTTP/WebSocket
┌─────────────────────────────────────────────────────────────┐
│                  Backend API (FastAPI/Python)                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │       AI Analytics Service                            │  │
│  │  - Prompt processing & validation                     │  │
│  │  - LLM integration (local/API)                        │  │
│  │  - Query generation & execution                       │  │
│  │  - Response formatting                                │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │       Schema Introspection Service                    │  │
│  │  - MongoDB schema discovery                           │  │
│  │  - Collection metadata caching                        │  │
│  │  - Field type inference                               │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │       Query Engine & Safety Layer                     │  │
│  │  - Query validation & sanitization                    │  │
│  │  - Permission checking (user-specific data)          │  │
│  │  - Rate limiting & timeout control                    │  │
│  │  - Read-only enforcement (no writes/deletes)         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    MongoDB Database                          │
│  - Existing collections (farms, blocks, users, etc.)        │
│  - New: chat_history, query_cache collections              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                Lightweight LLM (Multiple Options)            │
│  Option 1: Ollama (llama3.2, mistral, codellama)           │
│  Option 2: OpenAI API (gpt-4o-mini for cost efficiency)    │
│  Option 3: Anthropic Claude API (claude-3-haiku)           │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 Detailed Implementation Plan

### Phase 1: Research & Architecture Design (2-3 days)

#### Task 1.1: LLM Selection & Evaluation
**Priority:** CRITICAL
**Duration:** 1 day

**Options to Evaluate:**

| Option | Pros | Cons | Cost | Recommended? |
|--------|------|------|------|-------------|
| **Ollama (Local)** | Free, private, no API costs, fast | Requires GPU/resources, setup complexity | $0 | ✅ YES (Primary) |
| **OpenAI GPT-4o-mini** | Great quality, reliable, easy integration | API costs (~$0.15/1M tokens) | $$ | ✅ YES (Fallback) |
| **Anthropic Claude-3-Haiku** | Fast, cost-effective, good at structured output | API costs (~$0.25/1M tokens) | $$ | ⚠️ Maybe |
| **Local Llama 3.2** | Free, optimized for reasoning | Requires significant resources | $0 | ✅ YES (via Ollama) |

**Recommendation:**
- **Primary:** Ollama with Llama 3.2 (3B or 8B model) running locally
- **Fallback:** OpenAI GPT-4o-mini for production/high-load scenarios
- **Rationale:** Local LLM = zero cost + data privacy, fallback ensures reliability

**Deliverables:**
- ✅ LLM comparison document
- ✅ Selected LLM with justification
- ✅ Installation/setup guide for chosen LLM

#### Task 1.2: Database Schema Introspection Design
**Priority:** HIGH
**Duration:** 1 day

**Requirements:**
- Automatically discover all MongoDB collections
- Extract field names, types, and sample values
- Build schema context for LLM prompts
- Cache schema information for performance

**Implementation Approach:**
```python
# Pseudo-code for schema introspection
class SchemaIntrospectionService:
    async def discover_collections(self) -> Dict[str, CollectionSchema]:
        """Discover all collections and their schemas"""

    async def get_collection_schema(self, collection_name: str) -> CollectionSchema:
        """Get schema for specific collection with field types"""

    async def get_sample_documents(self, collection_name: str, limit: int = 5):
        """Get sample documents to show LLM data structure"""

    def build_schema_context(self) -> str:
        """Build formatted schema context for LLM prompts"""
```

**Deliverables:**
- ✅ Schema introspection service implementation
- ✅ Schema caching mechanism (Redis or in-memory)
- ✅ Schema context formatter for LLM prompts

#### Task 1.3: Security & Safety Architecture
**Priority:** CRITICAL
**Duration:** 1 day

**Security Considerations:**

1. **Read-Only Queries:** Only SELECT/find operations allowed
2. **User Data Isolation:** Users only see their own farms/blocks
3. **Query Validation:** No dangerous MongoDB operators ($where, etc.)
4. **Rate Limiting:** Max queries per user per minute
5. **Timeout Control:** Queries must complete in <5 seconds
6. **Error Sanitization:** Don't expose internal DB structure in errors

**Safety Rules:**
```python
# Allowed MongoDB operations
ALLOWED_OPERATIONS = ["find", "aggregate", "count_documents", "distinct"]

# Blocked operations (security risk)
BLOCKED_OPERATIONS = ["insert", "update", "delete", "drop", "create"]

# Blocked operators (code injection risk)
BLOCKED_OPERATORS = ["$where", "$function", "$accumulator"]

# User data filter injection (automatic)
def inject_user_filter(query: dict, user_id: str, collection: str):
    """Automatically add user-specific filters to queries"""
    if collection in ["farms", "blocks"]:
        query["userId"] = user_id  # Ensure user only sees their data
    return query
```

**Deliverables:**
- ✅ Security policy document
- ✅ Query validator implementation
- ✅ User data isolation middleware
- ✅ Rate limiting configuration

---

### Phase 2: Backend Implementation (5-7 days)

#### Task 2.1: LLM Integration Service
**Priority:** HIGH
**Duration:** 2 days

**File:** `src/modules/ai_analytics/services/llm_service.py`

**Features:**
```python
class LLMService:
    """Service for integrating with lightweight LLM"""

    async def generate_query(
        self,
        user_prompt: str,
        schema_context: str,
        conversation_history: List[Message]
    ) -> QueryResponse:
        """
        Generate MongoDB query from natural language prompt

        Args:
            user_prompt: User's natural language question
            schema_context: Database schema information
            conversation_history: Previous messages for context

        Returns:
            QueryResponse with MongoDB query and explanation
        """

    async def format_response(
        self,
        query_result: Any,
        user_prompt: str
    ) -> FormattedResponse:
        """
        Format query results into human-readable response

        Args:
            query_result: Raw MongoDB query results
            user_prompt: Original user question

        Returns:
            FormattedResponse with text + visualization suggestions
        """
```

**Prompt Engineering:**
```
System Prompt Template:
---
You are an AI assistant specialized in MongoDB query generation for a farm management system.

Database Schema:
{schema_context}

User Data Access:
- User ID: {user_id}
- Role: {user_role}
- Accessible Farms: {farm_ids}

Task:
Generate a MongoDB query to answer the user's question. Respond with ONLY valid JSON:

{
  "query": { ... MongoDB query object ... },
  "collection": "collection_name",
  "operation": "find" | "aggregate" | "count_documents",
  "explanation": "Brief explanation of what the query does"
}

Rules:
1. Only use read operations (find, aggregate, count_documents)
2. Automatically filter by user's accessible data
3. Use efficient queries with proper indexes
4. Return null if question is unclear or unsafe

User Question: {user_prompt}
---
```

**Deliverables:**
- ✅ LLM service implementation
- ✅ Ollama integration (primary)
- ✅ OpenAI integration (fallback)
- ✅ Prompt templates
- ✅ Error handling & retries

#### Task 2.2: Query Generation & Execution Engine
**Priority:** HIGH
**Duration:** 2 days

**File:** `src/modules/ai_analytics/services/query_engine.py`

**Features:**
```python
class QueryEngine:
    """Secure query generation and execution"""

    async def execute_ai_query(
        self,
        user_prompt: str,
        user_id: str,
        user_role: str
    ) -> QueryResult:
        """
        Complete pipeline: prompt -> query -> execution -> formatting
        """
        # 1. Get schema context
        schema = await schema_service.get_schema_context()

        # 2. Generate query via LLM
        query_response = await llm_service.generate_query(
            user_prompt, schema, conversation_history
        )

        # 3. Validate query (security checks)
        validated_query = await self.validate_query(
            query_response.query,
            query_response.collection,
            query_response.operation
        )

        # 4. Inject user-specific filters
        user_filtered_query = self.inject_user_filter(
            validated_query, user_id, user_role, query_response.collection
        )

        # 5. Execute query with timeout
        result = await self.execute_with_timeout(
            user_filtered_query,
            query_response.collection,
            query_response.operation,
            timeout=5.0
        )

        # 6. Format response
        formatted = await llm_service.format_response(result, user_prompt)

        # 7. Log query for history
        await self.log_query(user_id, user_prompt, query_response, result)

        return QueryResult(
            answer=formatted.text,
            data=result,
            query=query_response.query,
            visualization=formatted.visualization_type
        )

    async def validate_query(
        self,
        query: dict,
        collection: str,
        operation: str
    ) -> dict:
        """Validate query for security and correctness"""
        # Check operation is allowed
        if operation not in ALLOWED_OPERATIONS:
            raise SecurityError("Operation not allowed")

        # Check for dangerous operators
        query_str = json.dumps(query)
        for blocked_op in BLOCKED_OPERATORS:
            if blocked_op in query_str:
                raise SecurityError(f"Operator {blocked_op} not allowed")

        # Check collection exists and user has access
        if collection not in await schema_service.get_collections():
            raise ValidationError("Collection not found")

        return query
```

**Deliverables:**
- ✅ Query engine implementation
- ✅ Query validator with security checks
- ✅ User filter injection
- ✅ Timeout & error handling
- ✅ Query logging for debugging

#### Task 2.3: API Endpoints
**Priority:** HIGH
**Duration:** 1 day

**File:** `src/modules/ai_analytics/api/v1/chat.py`

**Endpoints:**
```python
@router.post("/chat/query")
async def ai_query(
    request: ChatQueryRequest,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Process natural language query and return results

    Request:
    {
        "prompt": "Show me total sales for this week",
        "conversation_id": "uuid" (optional for context)
    }

    Response:
    {
        "answer": "Total sales for this week: $12,450",
        "data": { ... raw data ... },
        "visualization": {
            "type": "chart",
            "config": { ... chart config ... }
        },
        "query": { ... MongoDB query used ... },
        "query_id": "uuid"
    }
    """

@router.get("/chat/history")
async def get_chat_history(
    conversation_id: Optional[str] = None,
    limit: int = 20,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Get user's chat history"""

@router.get("/chat/suggestions")
async def get_query_suggestions(
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get suggested queries based on user's data

    Response:
    {
        "suggestions": [
            "Show me my farms with the highest yield",
            "Which blocks are currently in alert state?",
            "Compare this month's harvest to last month"
        ]
    }
    """
```

**Deliverables:**
- ✅ API endpoints implementation
- ✅ Request/response models (Pydantic)
- ✅ Authentication & authorization
- ✅ API documentation (OpenAPI)

#### Task 2.4: Conversation History & Context
**Priority:** MEDIUM
**Duration:** 1 day

**File:** `src/modules/ai_analytics/services/conversation_service.py`

**Features:**
- Store conversation history in MongoDB
- Maintain context for follow-up questions
- Support conversation branching

**Schema:**
```python
class ConversationMessage(BaseModel):
    messageId: UUID
    conversationId: UUID
    userId: UUID
    role: Literal["user", "assistant"]
    content: str
    timestamp: datetime
    query: Optional[dict]  # MongoDB query used
    data: Optional[dict]  # Query results (cached)

class Conversation(BaseModel):
    conversationId: UUID
    userId: UUID
    title: str  # Auto-generated from first message
    messages: List[ConversationMessage]
    createdAt: datetime
    updatedAt: datetime
```

**Deliverables:**
- ✅ Conversation service implementation
- ✅ MongoDB schema for chat history
- ✅ Context management for follow-ups

---

### Phase 3: Frontend Implementation (4-5 days)

#### Task 3.1: Chat Interface Component
**Priority:** HIGH
**Duration:** 2 days

**File:** `frontend/user-portal/src/components/dashboard/AIAnalyticsChat.tsx`

**Features:**
```typescript
interface AIAnalyticsChatProps {
  defaultPrompt?: string;
  showHistory?: boolean;
  fullscreen?: boolean;
}

export function AIAnalyticsChat({
  defaultPrompt,
  showHistory = true,
  fullscreen = false
}: AIAnalyticsChatProps) {
  // Component features:
  // - Chat input with auto-complete
  // - Message history display (user + AI responses)
  // - Typing indicators while AI processes
  // - Response visualization (charts/tables/text)
  // - Copy/export functionality
  // - Error handling with retry
  // - Loading states
}
```

**UI Design:**
```
┌─────────────────────────────────────────────────────────────┐
│  CCM Dashboard - AI Analytics                               │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Chat History                                         │ │
│  │                                                       │ │
│  │  👤 You: Show me total sales for this week          │ │
│  │                                                       │ │
│  │  🤖 AI: Total sales for this week: $12,450          │ │
│  │      ┌─────────────────────────────────┐             │ │
│  │      │   [Bar Chart Visualization]     │             │ │
│  │      │   Mon: $1,800                   │             │ │
│  │      │   Tue: $2,100                   │             │ │
│  │      │   Wed: $2,400                   │             │ │
│  │      │   ...                           │             │ │
│  │      └─────────────────────────────────┘             │ │
│  │                                                       │ │
│  │  👤 You: What about last week?                      │ │
│  │                                                       │ │
│  │  🤖 AI: Last week's total was $10,200...           │ │
│  │                                                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  💬 Ask me anything about your data...               │ │
│  │  [                                             ] 📤   │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  💡 Suggested queries:                                     │
│  • Show my farms with highest yield                        │
│  • Which blocks need attention?                            │
│  • Compare this month to last month                        │
└─────────────────────────────────────────────────────────────┘
```

**Deliverables:**
- ✅ AIAnalyticsChat component
- ✅ Message components (user/AI)
- ✅ Input component with auto-complete
- ✅ Loading & error states
- ✅ Styled components / CSS

#### Task 3.2: Response Visualization Components
**Priority:** HIGH
**Duration:** 2 days

**Features:**
- Auto-detect visualization type from data
- Support multiple chart types (bar, line, pie, table)
- Use existing charting library (recharts)

**File:** `frontend/user-portal/src/components/dashboard/ResponseVisualizer.tsx`

```typescript
interface ResponseVisualizerProps {
  data: any;
  visualizationType: 'chart' | 'table' | 'text' | 'metric';
  config?: VisualizationConfig;
}

export function ResponseVisualizer({
  data,
  visualizationType,
  config
}: ResponseVisualizerProps) {
  // Render appropriate visualization based on type
  switch (visualizationType) {
    case 'chart':
      return <ChartVisualizer data={data} config={config} />;
    case 'table':
      return <TableVisualizer data={data} config={config} />;
    case 'metric':
      return <MetricCard value={data} label={config.label} />;
    case 'text':
    default:
      return <TextResponse content={data} />;
  }
}
```

**Deliverables:**
- ✅ ResponseVisualizer component
- ✅ Chart sub-components
- ✅ Table sub-component
- ✅ Metric card sub-component

#### Task 3.3: API Integration Hook
**Priority:** HIGH
**Duration:** 1 day

**File:** `frontend/user-portal/src/hooks/ai/useAIAnalytics.ts`

```typescript
export function useAIAnalytics() {
  const sendQuery = async (prompt: string, conversationId?: string) => {
    // POST /api/v1/ai-analytics/chat/query
  };

  const getChatHistory = async (conversationId?: string) => {
    // GET /api/v1/ai-analytics/chat/history
  };

  const getSuggestions = async () => {
    // GET /api/v1/ai-analytics/chat/suggestions
  };

  return {
    sendQuery,
    getChatHistory,
    getSuggestions,
    loading,
    error
  };
}
```

**Deliverables:**
- ✅ useAIAnalytics hook
- ✅ TypeScript types for API responses
- ✅ Error handling
- ✅ Loading states

---

### Phase 4: Testing & Optimization (3-4 days)

#### Task 4.1: Query Testing Suite
**Priority:** HIGH
**Duration:** 2 days

**Test Scenarios:**
```python
# Test cases for query generation and execution
test_queries = [
    # Simple queries
    "Show me total number of farms",
    "List all my blocks",
    "What's the total yield this month?",

    # Aggregations
    "Show me average yield per farm",
    "Compare sales between Electronics and Clothing",

    # Time-based queries
    "Show me sales for last week",
    "What was my best day this month?",

    # Complex queries
    "Which farms have blocks in alert state?",
    "Show me farms with yield efficiency below 70%",

    # Follow-up questions (context)
    User: "Show me my farms"
    AI: [Lists farms]
    User: "Which one has the highest yield?"
    AI: [Should understand "which one" refers to farms]

    # Security tests (should FAIL)
    "Delete all farms",  # Should reject
    "Update block status to empty",  # Should reject
    "Show me all users",  # Should reject (privacy)
]
```

**Deliverables:**
- ✅ Automated test suite
- ✅ Test coverage report
- ✅ Performance benchmarks
- ✅ Security validation tests

#### Task 4.2: Performance Optimization
**Priority:** MEDIUM
**Duration:** 1 day

**Optimization Areas:**
- Query result caching (Redis)
- Schema introspection caching
- LLM response caching for common queries
- Async processing for long-running queries
- Connection pooling

**Deliverables:**
- ✅ Performance optimizations implemented
- ✅ Caching strategy documented
- ✅ Load testing results

#### Task 4.3: User Acceptance Testing
**Priority:** HIGH
**Duration:** 1 day

**Test with Real Users:**
- Test with farm manager persona
- Test with admin persona
- Collect feedback on query accuracy
- Identify common failure cases

**Deliverables:**
- ✅ UAT feedback report
- ✅ Bug fixes for discovered issues
- ✅ Updated suggested queries

---

## 📊 Success Metrics

### Functional Requirements ✅
- [ ] User can ask natural language questions
- [ ] AI generates correct MongoDB queries 90%+ accuracy
- [ ] Results display in <3 seconds for simple queries
- [ ] Visualizations auto-render when appropriate
- [ ] Conversation context maintained for follow-ups
- [ ] Security: User only sees their own data
- [ ] Security: No write operations allowed

### Non-Functional Requirements ✅
- [ ] Query response time: <5 seconds
- [ ] LLM response time: <2 seconds
- [ ] Uptime: 99%+
- [ ] Concurrent users: 50+ without degradation
- [ ] Error rate: <5%

---

## 🚧 Implementation Risks & Mitigations

### Risk 1: LLM Generates Incorrect Queries
**Likelihood:** MEDIUM
**Impact:** HIGH
**Mitigation:**
- Implement query validation layer
- Show generated query to user before execution
- Allow user to rate query accuracy
- Log failed queries for improvement
- Fallback to manual query builder

### Risk 2: Performance Issues with Large Datasets
**Likelihood:** MEDIUM
**Impact:** MEDIUM
**Mitigation:**
- Implement query timeouts (5 seconds max)
- Add result pagination
- Cache frequent queries
- Use MongoDB indexes
- Limit returned documents (max 1000)

### Risk 3: Security Vulnerabilities
**Likelihood:** LOW
**Impact:** CRITICAL
**Mitigation:**
- Whitelist allowed operations
- Block dangerous operators
- Inject user filters automatically
- Rate limiting per user
- Audit logging of all queries
- Regular security reviews

### Risk 4: LLM Hallucinations (Wrong Information)
**Likelihood:** LOW
**Impact:** MEDIUM
**Mitigation:**
- Always show raw query alongside results
- Add disclaimer: "AI-generated, verify important data"
- Allow users to view actual MongoDB query
- Provide export with query for auditing

---

## 💰 Cost Estimation

### Option 1: Ollama (Local LLM) - RECOMMENDED
- **Setup Cost:** 2-3 hours developer time
- **Infrastructure:** Existing server (needs 8GB RAM + GPU optional)
- **Monthly Cost:** $0 (zero ongoing costs)
- **Scalability:** Limited by server resources

### Option 2: OpenAI GPT-4o-mini (Cloud API)
- **Setup Cost:** 1 hour developer time
- **Monthly Cost:** ~$10-50 (depends on usage)
  - Assuming 10,000 queries/month
  - Average 500 tokens per query
  - Cost: ~$0.15 per 1M tokens
- **Scalability:** Unlimited (pay as you grow)

### Total Project Cost Estimate
- **Development:** 10-15 days × 8 hours = 80-120 hours
- **Testing:** 3-4 days × 4 hours = 12-16 hours
- **Total:** ~100-150 developer hours

---

## 📚 Technology Stack Summary

### Backend
- **Language:** Python 3.11+
- **Framework:** FastAPI
- **LLM:** Ollama (Llama 3.2 3B/8B) + OpenAI fallback
- **Database:** MongoDB (existing)
- **Caching:** Redis (optional for performance)
- **Libraries:**
  - `ollama` - Ollama Python client
  - `openai` - OpenAI API client
  - `pymongo` - MongoDB driver
  - `pydantic` - Data validation

### Frontend
- **Language:** TypeScript
- **Framework:** React
- **UI Library:** Styled Components
- **Charts:** Recharts (already in use)
- **HTTP:** Axios
- **State:** React Hooks

---

## 🎯 MVP (Minimum Viable Product) Scope

For initial release, focus on:

### ✅ MUST HAVE
1. Basic chat interface with input and history
2. LLM integration (Ollama + OpenAI fallback)
3. Query generation for common questions
4. Security validation and user data filtering
5. Text responses with optional table display
6. Error handling and rate limiting

### ⏳ SHOULD HAVE (Phase 2)
1. Advanced visualizations (charts)
2. Conversation context/follow-ups
3. Query suggestions
4. Export functionality
5. Query caching for performance

### 💡 NICE TO HAVE (Future)
1. Voice input
2. Multi-language support
3. Query templates library
4. Scheduled reports
5. Email notifications for insights

---

## 📅 Recommended Timeline

### Week 1: Research & Backend Foundation
- Days 1-2: LLM evaluation and setup
- Days 3-4: Schema introspection + security layer
- Day 5: API endpoints + query engine

### Week 2: Backend Completion & Frontend Start
- Days 1-2: LLM integration + query validation
- Days 3-4: Frontend chat interface
- Day 5: API integration hooks

### Week 3: Frontend Completion & Testing
- Days 1-2: Response visualizations
- Days 3-4: Testing + bug fixes
- Day 5: Deployment + documentation

---

## 🚀 Next Steps

**IMMEDIATE ACTION REQUIRED:**

1. **User Approval:** Review this plan and approve scope
2. **LLM Decision:** Confirm LLM choice (Ollama vs OpenAI)
3. **Priority Clarification:** Which phase should we start with?
4. **Resource Allocation:** Confirm developer availability

**Recommended Starting Point:**
- Start with Phase 1 (Research & Design)
- Set up Ollama locally for testing
- Build schema introspection service first
- Iterate quickly with small POC (Proof of Concept)

---

## ❓ Questions for User

Before proceeding, please clarify:

1. **LLM Preference:** Local (Ollama) or Cloud (OpenAI)?
2. **Budget:** Is there budget for API costs or prefer free local LLM?
3. **Timeline:** Is 2-3 week timeline acceptable?
4. **Scope:** MVP first or full-featured from start?
5. **Priority Features:** Which features are most critical?
6. **Server Resources:** Do we have GPU available for local LLM?

---

## 📝 Notes

- This is a complex project that combines AI, databases, and security
- Start small with MVP and iterate based on user feedback
- LLM accuracy will improve over time with more examples
- Security is paramount - never skip validation steps
- Consider this as the foundation for future AI features

---

**STATUS:** ⏳ Awaiting user approval to proceed with Phase 1
