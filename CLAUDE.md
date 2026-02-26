# A64 Core Platform - Development Guide

## Core Principles

- **KISS** - Keep It Simple, Stupid
- **YAGNI** - You Aren't Gonna Need It
- **Cross-Platform** - Code MUST work on Windows AND Linux
- **Never Assume** - When in doubt, ask for clarification
- **Delegate to Specialists** - Use specialized agents for complex tasks

## ⚠️ CRITICAL RULES - READ FIRST ⚠️

### Documentation-First Approach
**BEFORE starting ANY task:**
1. ✅ **CHECK the Codebase Knowledge Graph** in `Docs/CodeMaps/INDEX.md` to understand relationships
2. ✅ **CHECK relevant documentation** in `Docs/1-Main-Documentation/`
3. ✅ **READ existing code** to understand current implementation
4. ✅ **VERIFY** you understand the requirements completely

### Never Assume Policy
**STOP and ASK the user if:**
- ❌ Requirements are ambiguous or unclear
- ❌ Multiple implementation approaches are possible
- ❌ You're unsure about architecture decisions
- ❌ Documentation conflicts with code
- ❌ Security implications are involved
- ❌ Breaking changes might occur

### 🚨 CRITICAL: Always Delegate to Specialized Agents 🚨

**MANDATORY: If a specialized agent is available for a task, you MUST delegate to that agent.**

**This is NON-NEGOTIABLE. Specialized agents have:**
- Deep domain expertise and best practices
- Task-specific validation and safety checks
- Comprehensive testing and verification
- Documentation and standards enforcement
- Error prevention and quality assurance

**When to Delegate:**
- ✅ **Backend Development** → Use `@agent-backend-dev-expert`
- ✅ **Frontend Development** → Use `@agent-frontend-dev-expert`
- ✅ **API Design** → Use `@agent-api-developer`
- ✅ **Database Schema** → Use `@agent-database-schema-architect`
- ✅ **Testing** → Use appropriate testing agents
- ✅ **Documentation & Commits** → Use `@agent-change-guardian`

**When NOT to Delegate:**
- ❌ Simple file reads (< 5 lines)
- ❌ Quick documentation lookups
- ❌ Answering questions about existing code
- ❌ Trivial configuration changes

**Why This Is Critical:**
1. **Quality Assurance** - Agents enforce standards you might miss
2. **Security** - Agents check for vulnerabilities and best practices
3. **Consistency** - Agents follow established patterns
4. **Efficiency** - Agents have specialized tools and knowledge
5. **Error Prevention** - Agents catch mistakes before they happen

**Example of WRONG Behavior (DON'T DO THIS):**
```
❌ User: "Add a new API endpoint for user registration"
   You: *Directly implements the endpoint without using @agent-api-developer*
```

**Example of CORRECT Behavior (DO THIS):**
```
✅ User: "Add a new API endpoint for user registration"
   You: "I'll delegate this to @agent-api-developer who will ensure proper
        API design, security, validation, and documentation."

   *Uses Task tool with subagent_type='api-developer'*
```

**Remember: Delegation is not a sign of weakness - it's a sign of knowing when to use the right tool for the job.**

### What NOT to Do
- ❌ NEVER make changes based on assumptions
- ❌ NEVER skip reading relevant documentation
- ❌ NEVER proceed with unclear requirements
- ❌ NEVER implement quick fixes without understanding root cause
- ❌ NEVER modify code you don't fully understand
- ❌ NEVER rush to fix things - we are NEVER in a rush

**When in doubt: STOP → READ DOCS → ASK USER → THEN PROCEED**

### 🚨 CRITICAL: Never Rush Fixes 🚨

**WE ARE NEVER IN A RUSH. QUALITY AND STABILITY OVER SPEED.**

**MANDATORY approach to fixes:**

1. **Understand the Root Cause** - Don't just treat symptoms
   - Read the error messages completely
   - Trace the issue back to its source
   - Understand WHY the problem exists

2. **Consider the Impact** - Think before acting
   - Will this fix cause other issues?
   - Is this a proper solution or a workaround?
   - What are the long-term implications?

3. **Ask for Opinion** - When in doubt, consult
   - ⚠️ **ALWAYS ask the user** if the fix seems like a quick fix just to achieve a goal
   - ⚠️ **ALWAYS ask the user** if you're considering a workaround instead of a proper fix
   - ⚠️ **ALWAYS ask the user** if the fix might have unintended consequences

4. **Implement Stable Fixes** - Do it right, not fast
   - ✅ Fix the root cause, not the symptoms
   - ✅ Ensure backward compatibility
   - ✅ Add proper error handling
   - ✅ Update documentation
   - ✅ Consider migration paths for data changes

**Examples of BAD quick fixes to AVOID:**
- Making required fields optional just to stop errors (without migration)
- Adding try-catch to hide errors instead of fixing them
- Hardcoding values to bypass validation
- Disabling checks temporarily "until we fix it properly"
- Commenting out code that's causing issues

**Examples of GOOD stable fixes:**
- Making fields optional WITH a migration script to populate existing data
- Fixing the underlying validation logic causing errors
- Adding proper default values with clear documentation
- Creating a deprecation path for old functionality
- Refactoring code to handle edge cases properly

**Remember: A rushed fix today creates technical debt tomorrow. Take the time to do it right.**

### 🚨 CRITICAL: Never Skip Errors During Testing 🚨

**MANDATORY approach when encountering errors during testing or E2E verification:**

1. **NEVER Skip or Ignore Errors** - Every error must be addressed
   - ❌ NEVER think "I'll skip this for now and continue testing"
   - ❌ NEVER assume an error is minor or unrelated
   - ❌ NEVER proceed to the next test step if the current one failed
   - ✅ ALWAYS stop and investigate when an error occurs
   - ✅ ALWAYS consult the user before deciding to skip an error

2. **Why This Is Critical**
   - Errors during testing often indicate blocking issues
   - Skipped errors cascade into bigger problems
   - Tests become unreliable if errors are ignored
   - What seems minor might be a critical system issue
   - User needs visibility into ALL problems, not just successes

3. **What To Do When You Encounter an Error**
   - ⚠️ **STOP immediately** - Don't continue to next test step
   - 📋 **Document the error** - Capture exact error message, stack trace, context
   - 🔍 **Investigate root cause** - Don't just report it, understand it
   - 💬 **Consult the user** - Present findings and ask for direction
   - ✅ **Fix or explicitly decide** - Either fix it or user explicitly approves skipping

4. **Example of WRONG Behavior (DON'T DO THIS)**
   ```
   ❌ "I encountered a validation error in the dashboard API, but I'll skip that
      and continue testing the alert resolution since that's the main goal."
   ```

5. **Example of CORRECT Behavior (DO THIS)**
   ```
   ✅ "I encountered a validation error in the dashboard API:

      Error: 'severity' field validation failed - receiving <AlertSeverity.HIGH: 'high'>
      instead of string 'high'

      This error is blocking the Block Monitor page from loading. Before continuing
      with the alert resolution test, should we:

      1. Fix this validation error now (recommended - it's blocking functionality)
      2. Use an alternative method to verify alert resolution
      3. Document and continue (only if you confirm this won't affect our test)

      What would you like me to do?"
   ```

**Remember: Comprehensive testing means investigating ALL errors, not just the happy path. The user hired you to find and fix problems, not to skip over them.**

### MCP Tool Requirements
**CRITICAL: When testing or debugging, ALWAYS use MCP tools:**

**This is NON-NEGOTIABLE. MCP tools MUST be used instead of traditional methods.**

1. **Playwright MCP** - MANDATORY for:
   - ✅ Testing frontend UI components and user flows
   - ✅ Verifying API endpoints and responses (instead of curl/wget)
   - ✅ Debugging browser behavior and interactions
   - ✅ Visual confirmation of changes
   - ✅ Real-time interaction debugging
   - ✅ Testing authentication flows
   - ✅ Verifying CORS configuration
   - ❌ NEVER use curl, wget, Postman screenshots, or manual browser testing

2. **MongoDB Verification** - Use mongosh (TEMPORARY WORKAROUND):
   - ⚠️ **CRITICAL:** MongoDB MCP is currently broken (connection doesn't persist)
   - ✅ **MUST use mongosh via Bash** for database verification until MCP is fixed
   - ✅ Pattern: `mongosh --eval "db.collection.find()" mongodb://localhost:27017/a64core_db --quiet`
   - ✅ Inspecting database collections and documents
   - ✅ Running queries and aggregations
   - ✅ Verifying data structure and schemas
   - ✅ Testing database operations
   - ✅ Checking index usage with explain()
   - ✅ Performance testing queries
   - ❌ NEVER use mongo shell interactive mode or pymongo print statements
   - 📝 NOTE: Will switch to MongoDB MCP when connection persistence is fixed
   - 📄 See MCP_TOOLS_TROUBLESHOOTING.md for details

### Why MCP Tools Are Mandatory

**Better Visibility:**
- Playwright MCP shows actual browser rendering and interactions
- MongoDB MCP provides structured query results with proper formatting

**Proper Validation:**
- Playwright MCP validates UI/UX behavior, not just HTTP responses
- MongoDB MCP ensures query correctness and data integrity

**Debugging Capability:**
- Playwright MCP allows inspecting DOM, network requests, console logs
- MongoDB MCP provides query explain plans and performance metrics

**Never Use Instead of MCP:**
- ❌ curl/wget for API testing (use Playwright MCP)
- ❌ mongo shell commands (use MongoDB MCP)
- ❌ Python print statements for database queries (use MongoDB MCP)
- ❌ Manual browser testing (use Playwright MCP)
- ❌ Postman/Insomnia screenshots (use Playwright MCP)

### 🚨 CRITICAL: Limit Large MCP Tool Outputs 🚨

**MCP tools can generate very large outputs that consume context. Be efficient:**

1. **Playwright MCP - Minimize Output Size:**
   - ✅ Use targeted element checks instead of full page snapshots
   - ✅ Click directly on known element refs rather than searching
   - ✅ Avoid repeated full-page `browser_snapshot` calls
   - ✅ Use `browser_wait_for` with specific text instead of time delays + snapshots
   - ✅ Once you have element refs, reuse them without re-snapshotting
   - ✅ Use `browser_evaluate` for targeted checks (e.g., element count, specific text, error states)
   - ❌ DON'T take full snapshots after every click
   - ❌ DON'T navigate through many pages when you can go directly via URL
   - ❌ DON'T repeat the same verification multiple times
   - ❌ DON'T call `browser_snapshot` on pages with many DOM elements (e.g., block monitor with 60+ cards)

2. **Save Large Outputs to File (instead of inline):**
   - ✅ `browser_snapshot` with `filename` parameter (e.g., `filename: "snapshot.md"`), then read only the relevant section
   - ✅ `browser_console_messages` with `filename` parameter for large console outputs
   - ✅ `browser_network_requests` with `filename` parameter for network logs
   - ✅ `browser_take_screenshot` with `filename` for visual verification instead of accessibility snapshots

3. **When Testing:**
   - ✅ Plan your test flow before starting
   - ✅ Navigate directly to the page you need to test (via URL)
   - ✅ Take ONE snapshot to get element refs, then interact
   - ✅ Only take additional snapshots when the page content changes significantly
   - ✅ Close browser when done testing

4. **Output Too Large?**
   - If snapshot output exceeds limits, use `Grep` or `Read` on the saved output file
   - Extract only the specific information you need
   - Don't try to read the entire large output

**Remember: Efficient MCP usage = more context for actual work**

### 🚨 CRITICAL: UI Testing is the Ultimate Truth 🚨

**MANDATORY: If it doesn't work in the UI using Playwright, it is NOT working - even if the API works.**

**This is NON-NEGOTIABLE. Real users interact through the UI, not the API.**

**Critical Principle:**
- ✅ **API working + UI working** = Feature is complete ✅
- ❌ **API working + UI broken** = Feature is BROKEN ❌
- ❌ **API tests pass but UI tests fail** = There is a PROBLEM that MUST be addressed

**Why This Is Critical:**
1. **Users don't call APIs directly** - They use the UI
2. **API success ≠ User success** - Backend might work but frontend might fail
3. **CORS, auth, data format issues** - Often only visible in browser
4. **Real-world validation** - Playwright tests actual user experience
5. **Integration issues** - API and frontend might have different expectations

**What This Means:**
- ⚠️ **NEVER** declare a feature "working" based only on API tests
- ⚠️ **NEVER** skip UI testing because "the API works"
- ⚠️ **NEVER** ignore UI errors just because backend responds correctly
- ✅ **ALWAYS** test features end-to-end through the UI using Playwright MCP
- ✅ **ALWAYS** investigate and fix UI issues even if API works
- ✅ **ALWAYS** ensure both API AND UI work before considering feature complete

**Example of WRONG Behavior (DON'T DO THIS):**
```
❌ "I tested the task completion endpoint with curl and it works perfectly!
   The task status is updated in the database. Feature is complete."

   [User opens UI and task completion button doesn't work - CORS error]
```

**Example of CORRECT Behavior (DO THIS):**
```
✅ "I tested the task completion endpoint with curl and it works.
   Now let me verify it works in the UI using Playwright MCP..."

   [Playwright test reveals CORS error preventing UI from calling endpoint]

   "I found a CORS configuration issue blocking the UI. The API works but
   users can't access it from the browser. I need to fix the CORS headers
   in nginx.conf before this feature is complete."
```

**Testing Sequence:**
1. **Unit Test** - Test individual functions/components
2. **API Test** - Verify backend endpoints work (curl/Playwright MCP)
3. **UI Test** - Verify frontend works (Playwright MCP) ⚠️ **MOST CRITICAL**
4. **E2E Test** - Complete user journey through UI (Playwright MCP)

**Only after ALL tests pass, especially UI tests, can a feature be considered working.**

**Remember: If a user can't use it through the UI, it doesn't work - period.**

## Agent Delegation Strategy

### When to Use Specialized Agents

**ALWAYS delegate these tasks to specialized agents:**

1. **Backend Development** → `@agent-backend-dev-expert`
   - FastAPI endpoint implementation
   - Database queries and operations
   - Security-sensitive code (auth, validation)
   - Python import structure issues
   - Environment configuration

2. **Frontend Development** → `@agent-frontend-dev-expert`
   - React component creation/modification
   - TypeScript type definitions
   - Styled-components implementation
   - CORS and API integration issues
   - UI/UX implementation

3. **API Design** → `@agent-api-developer`
   - New REST API endpoints
   - API structure review
   - Authentication flows
   - API documentation updates

4. **Database Schema** → `@agent-database-schema-architect`
   - New database tables/collections
   - Schema modifications
   - Indexing strategies
   - Database migrations

5. **Testing** → Specialized testing agents
   - `@agent-testing-backend-specialist` - Backend/API tests
   - `@agent-frontend-testing-playwright` - Frontend/UI tests

6. **Documentation & Version Control** → `@agent-change-guardian`
   - After completing features
   - Before releases
   - Updating CHANGELOG.md
   - Creating git commits
   - Version management

### ⚠️ CRITICAL: Instructing Agents to Use MCP Tools

**When delegating tasks to any agent, you MUST explicitly instruct them to use MCP tools.**

**ALWAYS include these instructions when calling agents:**

```
CRITICAL Instructions for this task:
- MUST use Playwright MCP for all frontend/API testing and verification
- MUST use MongoDB MCP for all database operations and verification
- NEVER use curl, wget, or manual browser testing
- NEVER use mongo shell commands or pymongo print statements
```

**Example of correct agent delegation:**

```
Good: "Implement user login endpoint. CRITICAL: Use Playwright MCP to test
       the endpoint and MongoDB MCP to verify user session creation."

Bad:  "Implement user login endpoint."
```

**Why this is critical:**
- Agents may default to traditional methods (curl, mongo shell) if not explicitly told
- MCP tools provide better visibility and debugging
- Ensures consistent testing approach across all agents
- Prevents agents from skipping proper verification

**Template for Agent Instructions:**

```
Task: [Your task description]

CRITICAL: Check Backlog first:
✅ Read Docs/Backlog/BACKLOG.md — claim your task (set 🔵 Active)
✅ When done, move task to ARCHIVE.md and unblock dependents

CRITICAL: Read CodeMaps first:
✅ Read Docs/CodeMaps/INDEX.md for architecture overview
✅ Read the relevant map for your task area (api-map.md, service-map.md, etc.)

CRITICAL MCP Tool Requirements:
✅ Use Playwright MCP for: [specific testing needs]
✅ Use MongoDB MCP for: [specific database verification]
❌ Do NOT use: curl, wget, mongo shell, or print statements

Expected MCP Verification:
1. [What to verify with Playwright MCP]
2. [What to verify with MongoDB MCP]

Post-Implementation:
⚠️ If you added/removed endpoints, services, components, or collections,
   flag that CodeMaps need regeneration.
⚠️ Update Docs/Backlog/BACKLOG.md — mark task complete, unblock dependents.
```

### Multi-Agent Workflows

For complete features, use this sequence:

```
0. Read CodeMaps (understand existing architecture)
   ↓
1. Check BACKLOG.md (claim task, verify not blocked)
   ↓
2. Implementation Agent (backend/frontend/api)
   ↓
3. Testing Agent (verify functionality)
   ↓
4. Change Guardian (document & commit)
   ↓
5. Update BACKLOG.md (complete task, unblock dependents, move to ARCHIVE.md)
   ↓
6. Regenerate CodeMaps (if structural changes were made)
```

**Example:**
```
User: "Add user registration feature"
→ Read Docs/Backlog/BACKLOG.md (claim task or create new one)
→ Read Docs/CodeMaps/api-map.md (check existing auth endpoints)
→ Read Docs/CodeMaps/service-map.md (check existing auth services)
→ @agent-backend-dev-expert (implement API)
→ @agent-frontend-dev-expert (implement UI)
→ @agent-frontend-testing-playwright (test UI flow)
→ @agent-change-guardian (document & commit)
→ Update Docs/Backlog/BACKLOG.md (mark done, move to ARCHIVE.md)
→ Regenerate CodeMaps: bash scripts/codebase_mapper/rerun.sh
```

### When NOT to Use Agents

**Handle directly for:**
- Simple file reads
- Quick documentation lookups
- Answering questions about code
- Small configuration changes
- Single-file edits (< 10 lines)

## Work Tracking

### Backlog System

The project uses a lightweight markdown-based backlog at [`Docs/Backlog/`](Docs/Backlog/):

| File | Purpose |
|------|---------|
| [BACKLOG.md](Docs/Backlog/BACKLOG.md) | Active, ready, and blocked tasks with dependencies |
| [ARCHIVE.md](Docs/Backlog/ARCHIVE.md) | Completed tasks (historical record) |

No external tools needed — agents read and edit the markdown directly.

### Agent Rules for Backlog

**MANDATORY: All agents MUST follow these rules:**

1. **Before implementation** — Read `Docs/Backlog/BACKLOG.md`
2. **Claim before working** — Change task status to `🔵 Active` with your agent type
3. **Never overlap** — If a task is `🔵 Active`, it belongs to another agent. Pick a different task.
4. **Respect blockers** — If a task is `🔴 Blocked`, do NOT work on it. Work on its dependencies first.
5. **Complete properly** — Move finished tasks to `ARCHIVE.md` and unblock dependents
6. **Create if missing** — If your work isn't tracked in the backlog, add a task entry before starting

### Task Lifecycle

```
🟢 Ready  →  🔵 Active  →  ✅ Done (moved to ARCHIVE.md)
                  ↓
          🔴 Blocked (if new dependency discovered)
```

### Adding Tasks to the Backlog

When a user asks to add a feature or task:
1. Open `Docs/Backlog/BACKLOG.md`
2. Create a new entry using the task format defined in that file
3. Set appropriate category, priority, and dependencies
4. Update the stats in the file header

**Example:**
```
User: "Add a feature for S3 sync"
→ Add task to Docs/Backlog/BACKLOG.md as 🟢 Ready
→ Set category: DevOps, priority: P2
→ Define implementation steps
```

## Project Structure

### Documentation
- **Codebase Knowledge Graph:** [`Docs/CodeMaps/`](Docs/CodeMaps/) - AI-queryable architecture maps (read FIRST)
  - [INDEX.md](Docs/CodeMaps/INDEX.md) - Master index, start here
  - [api-map.md](Docs/CodeMaps/api-map.md) - All API endpoints and routes
  - [database-map.md](Docs/CodeMaps/database-map.md) - MongoDB collections and schemas
  - [module-map.md](Docs/CodeMaps/module-map.md) - Backend module architecture
  - [frontend-map.md](Docs/CodeMaps/frontend-map.md) - React components, hooks, stores
  - [service-map.md](Docs/CodeMaps/service-map.md) - Service layer dependency graph
- **Work Tracking:** [`Docs/Backlog/`](Docs/Backlog/) - Task backlog with dependencies and agent locking
  - [BACKLOG.md](Docs/Backlog/BACKLOG.md) - Active, ready, and blocked tasks
  - [ARCHIVE.md](Docs/Backlog/ARCHIVE.md) - Completed tasks history
- **Main Documentation:** [`Docs/1-Main-Documentation/`](Docs/1-Main-Documentation/) - Single source of truth
  - [System-Architecture.md](Docs/1-Main-Documentation/System-Architecture.md)
  - [API-Structure.md](Docs/1-Main-Documentation/API-Structure.md)
  - [User-Structure.md](Docs/1-Main-Documentation/User-Structure.md)
  - [Versioning.md](Docs/1-Main-Documentation/Versioning.md)
- **Working Progress:** [`Docs/2-Working-Progress/`](Docs/2-Working-Progress/) - Active tasks
- **DevLog:** [`Docs/3-DevLog/`](Docs/3-DevLog/) - Development history

### DevLog Journal Policy

**When user requests "keep journal" or "create journal":**

Create a **dated summary journal** in `Docs/3-DevLog/` following this format:

**Filename:** `YYYY-MM-DD_descriptive-session-name.md`
**Example:** `2025-11-01_plant-data-testing-session.md`

**Required Content:**
1. **Session Header**
   - Date, session type, duration, focus area, status
   - Session objective (what user requested)

2. **What We Accomplished** ✅
   - Documentation reviewed
   - Code files analyzed
   - Bugs fixed
   - Features implemented
   - Tests completed

3. **Bugs/Issues Discovered** 🐛
   - Severity level and status
   - Detailed description with file locations and line numbers
   - Root cause analysis
   - Code snippets showing the issue
   - Suggested fixes with examples
   - Reproduction steps

4. **What We Need To Do Next** 🎯
   - Prioritized action items
   - Exact file locations and line numbers
   - Step-by-step instructions for each task
   - Expected outcomes

5. **Important Context for Next Session**
   - Key files to remember
   - Testing tools and credentials
   - Current state of features
   - Git status snapshot
   - Questions for user

6. **Files Modified**
   - List all files changed with status
   - Commit readiness

7. **Session Metrics**
   - Time breakdown
   - Lines of code read/written
   - Tools used
   - Key achievements

**Purpose:**
- Provides complete context continuity when conversation resets
- Ensures no work is lost or needs to be re-investigated
- Makes it easy to pick up exactly where we left off
- Documents debugging work and decisions made

**When to Create:**
- At end of long testing/debugging sessions
- When major bugs are discovered
- Before context limit is reached
- When user explicitly requests "keep journal"
- When switching between major tasks

## Project Specification

<project_specification>
  <project_name>A64 Core Platform</project_name>

  <overview>
    A64 Core Platform is a comprehensive, enterprise-grade agricultural technology platform serving as a central API hub with modular business applications. It provides authentication, authorization, user management, and orchestrates multiple integrated modules including Farm Management, HR, CRM, Sales, Logistics, Marketing, and AI Analytics. The platform targets agricultural operations (UAE-focused) with features like multi-crop farm block management, harvest tracking, inventory systems, employee management with Arabic name support and Emirates ID handling, and AI-powered conversational analytics via Google Vertex AI.
  </overview>

  <technology_stack>
    <frontend>
      <framework>React 18.3.1 with TypeScript</framework>
      <build_tool>Vite 5.0.11</build_tool>
      <styling>styled-components 6.1.19</styling>
      <state_management>Zustand 4.4.7</state_management>
      <server_state>TanStack React Query 5.17.19</server_state>
      <http_client>Axios 1.6.5</http_client>
      <routing>React Router v6</routing>
      <charts>Recharts 3.3.0</charts>
      <maps>MapLibre GL 5.13.0, react-map-gl 8.1.0</maps>
      <forms>React Hook Form 7.49.3, Zod 3.22.4</forms>
      <grid_layout>react-grid-layout</grid_layout>
      <dev_server_port>5173</dev_server_port>
    </frontend>
    <backend>
      <runtime>Python 3.11+ with FastAPI 0.128.0</runtime>
      <server>Uvicorn (async)</server>
      <database>MongoDB 7.0 (primary NoSQL), MySQL 8.0 (secondary/relational)</database>
      <cache>Redis 7 (caching, rate limiting, session management)</cache>
      <password_hashing>passlib with bcrypt (cost factor 12)</password_hashing>
      <jwt>python-jose with HS256</jwt>
      <encryption>cryptography (Fernet + PBKDF2HMAC for license keys)</encryption>
      <email_validation>email-validator 2.2.0</email_validation>
      <api_port>8000</api_port>
    </backend>
    <ai>
      <provider>Google Vertex AI</provider>
      <model>Gemini 2.5-flash</model>
      <credentials>/app/.credentials/vertex-ai-service-account.json</credentials>
    </ai>
    <infrastructure>
      <containerization>Docker + Docker Compose</containerization>
      <reverse_proxy>Nginx 1.25-alpine (ports 80/443)</reverse_proxy>
      <module_management>Docker SDK, PyYAML, jsonschema</module_management>
      <local_registry>Docker Registry 2 (port 5000)</local_registry>
      <db_admin>Adminer (port 8080)</db_admin>
      <iot_simulator>Port 8090</iot_simulator>
      <backup>MongoDB backup with AES-256 encryption (profile: backup)</backup>
      <cron>Automated scheduled tasks service</cron>
    </infrastructure>
    <communication>
      <api>RESTful JSON API, versioned at /api/v1</api>
      <documentation>Swagger/ReDoc auto-generated via FastAPI</documentation>
    </communication>
  </technology_stack>

  <prerequisites>
    <environment_setup>
      - Docker 20.10+ and Docker Compose 2.0+
      - Python 3.11+
      - Node.js 18+ with npm
      - MongoDB 7.0, Redis 7, MySQL 8.0 (all via Docker)
      - SSL certificates for production (Let's Encrypt)
      - Google Vertex AI service account credentials (for AI Analytics)
      - WeatherBit API key (for weather integration)
      - Environment variables configured (25+ vars, no .env file loading in prod)
    </environment_setup>
  </prerequisites>

  <feature_count>310</feature_count>
</project_specification>

## Getting Started

1. **Read `Docs/CodeMaps/INDEX.md`** — understand architecture, modules, and dependencies first
2. Check relevant documentation in `Docs/1-Main-Documentation/`
3. Review project structure and architecture
4. **Identify if task needs specialized agent** - Check agent delegation strategy above
5. Follow cross-platform standards (Windows + Linux)
6. Update documentation as you work

## Codebase Knowledge Graph

### What It Is

A pre-built knowledge graph of the entire codebase: **446 nodes, 285 edges** covering all 7 backend modules, the full React frontend, 50 MongoDB collections, and 69 API endpoints. Stored as Markdown maps that agents can read directly — no queries needed.

### How to Use It

**BEFORE modifying or investigating code, read the relevant map:**

| Question | Read This Map |
|----------|---------------|
| "What API endpoints exist?" | [`Docs/CodeMaps/api-map.md`](Docs/CodeMaps/api-map.md) |
| "What MongoDB collections are there?" | [`Docs/CodeMaps/database-map.md`](Docs/CodeMaps/database-map.md) |
| "What does module X contain?" | [`Docs/CodeMaps/module-map.md`](Docs/CodeMaps/module-map.md) |
| "What React components/hooks exist?" | [`Docs/CodeMaps/frontend-map.md`](Docs/CodeMaps/frontend-map.md) |
| "What services does Y depend on?" | [`Docs/CodeMaps/service-map.md`](Docs/CodeMaps/service-map.md) |
| "General architecture overview" | [`Docs/CodeMaps/INDEX.md`](Docs/CodeMaps/INDEX.md) |

**Workflow:**
```
1. Read INDEX.md (master index, ~960 tokens)
2. Read the specific map relevant to your task (~4,000-11,000 tokens each)
3. Now you know the relationships — proceed to read actual source files
```

This saves significant time vs. manually exploring the codebase file by file.

### When to Consult CodeMaps

- **Before any implementation** — understand what already exists and how it connects
- **Before adding new endpoints** — check api-map.md for naming patterns and existing routes
- **Before modifying a service** — check service-map.md for what depends on it
- **Before changing a DB model** — check database-map.md for which services read/write that collection
- **Before adding frontend components** — check frontend-map.md for existing components and hooks
- **When debugging** — trace the full chain: frontend component → hook → service → API endpoint → backend service → DB collection

### Keeping Maps Up to Date

**CRITICAL: After making structural changes to the codebase, the maps MUST be regenerated.**

**What counts as a structural change:**
- Adding/removing/renaming API endpoints
- Adding/removing/renaming services, models, or components
- Adding/removing MongoDB collections
- Adding new modules or significantly restructuring existing ones
- Adding/removing frontend hooks, stores, or service files

**What does NOT require regeneration:**
- Bug fixes within existing functions
- Changing business logic inside a service method
- Updating styles or UI text
- Modifying environment variable values
- Documentation changes

**How to regenerate after structural changes:**
```bash
# Option 1: Incremental re-run (only re-maps changed files)
bash scripts/codebase_mapper/rerun.sh

# Option 2: Full re-run from scratch
python3 scripts/codebase_mapper/setup.py --reset
# Then spawn mapping agents (see scripts/codebase_mapper/ for details)

# After mapping agents complete, regenerate Markdown maps:
python3 scripts/codebase_mapper/map_generator.py all

# Verify completion:
python3 scripts/codebase_mapper/task_manager.py stats
```

**When to regenerate:**
- After merging a feature branch that adds new modules, endpoints, or components
- After completing a multi-file refactor
- Periodically (monthly) as part of dev workflow
- Before starting a new multi-agent development session on unfamiliar code

### Quick Reference Commands

```bash
# Check current graph stats
python3 scripts/codebase_mapper/task_manager.py stats

# Query nodes by module (e.g., farm_manager services)
python3 scripts/codebase_mapper/knowledge_store.py query --module farm_manager --layer service

# Query nodes by type (e.g., all API endpoints)
python3 scripts/codebase_mapper/knowledge_store.py query --node-type api_endpoint

# List all mapping tasks and their status
python3 scripts/codebase_mapper/task_manager.py list
```

## Key Standards

- ✅ Cross-platform compatibility required
- ✅ Security-first approach
- ✅ Test everything
- ✅ Document first, code second
- ✅ Use specialized agents for complex tasks

## API Endpoint Reference

**CRITICAL: Always use these exact endpoint URLs when testing or making API calls.**

### Base URL Structure
- **Local Development:** `http://localhost/api/v1`
- **Production:** `https://a64core.com/api/v1`
- **Health Check:** `http://localhost/api/health`

### Authentication Endpoints (`/api/v1/auth/*`)
```
POST   /api/v1/auth/register              # Create new user account
POST   /api/v1/auth/login                 # Login and get tokens ⚠️ CORRECT URL
POST   /api/v1/auth/logout                # Logout and invalidate token
POST   /api/v1/auth/refresh               # Refresh access token
GET    /api/v1/auth/me                    # Get current user info
POST   /api/v1/auth/send-verification-email
POST   /api/v1/auth/verify-email
POST   /api/v1/auth/request-password-reset
POST   /api/v1/auth/reset-password
```

### User Management Endpoints (`/api/v1/users/*`)
```
GET    /api/v1/users                      # List all users (paginated)
GET    /api/v1/users/{user_id}            # Get specific user
PATCH  /api/v1/users/{user_id}            # Update user details
DELETE /api/v1/users/{user_id}            # Delete user
```

### Admin Endpoints (`/api/v1/admin/*`)
```
GET    /api/v1/admin/users                # Admin view of all users
GET    /api/v1/admin/users/{user_id}      # Admin view of specific user
PATCH  /api/v1/admin/users/{user_id}/role # Update user role
PATCH  /api/v1/admin/users/{user_id}/status # Update user status
DELETE /api/v1/admin/users/{user_id}      # Admin delete user
```

### Module Management Endpoints (`/api/v1/modules/*`)
```
POST   /api/v1/modules/install            # Install new module
GET    /api/v1/modules/installed          # List installed modules
GET    /api/v1/modules/available          # List available modules
DELETE /api/v1/modules/{module_name}      # Uninstall module
GET    /api/v1/modules/{module_name}/health # Check module health
GET    /api/v1/modules/{module_name}/logs # Get module logs
```

### Dashboard Endpoints (`/api/v1/dashboard/*`)
```
GET    /api/v1/dashboard/stats            # Get dashboard statistics
POST   /api/v1/dashboard/modules/{module_name}/start  # Start module
POST   /api/v1/dashboard/modules/{module_name}/stop   # Stop module
GET    /api/v1/dashboard/system           # Get system info
```

### Farm Management Module Endpoints (`/api/v1/farm/*`)

**⚠️ IMPORTANT: All farm endpoints are now part of the main API (previously separate microservice)**

#### Farms
```
GET    /api/v1/farm/farms                 # List all farms
POST   /api/v1/farm/farms                 # Create new farm
GET    /api/v1/farm/farms/{farm_id}       # Get farm details
PATCH  /api/v1/farm/farms/{farm_id}       # Update farm
DELETE /api/v1/farm/farms/{farm_id}       # Delete farm
```

#### Blocks
```
GET    /api/v1/farm/farms/{farm_id}/blocks                    # List farm blocks
POST   /api/v1/farm/farms/{farm_id}/blocks                    # Create block
GET    /api/v1/farm/farms/{farm_id}/blocks/{block_id}         # Get block details
PATCH  /api/v1/farm/farms/{farm_id}/blocks/{block_id}         # Update block
PATCH  /api/v1/farm/farms/{farm_id}/blocks/{block_id}/status  # Change block status
DELETE /api/v1/farm/farms/{farm_id}/blocks/{block_id}         # Delete block
```

#### Plant Data
```
GET    /api/v1/farm/plant-data            # List plant data (simple schema)
POST   /api/v1/farm/plant-data            # Create plant data
GET    /api/v1/farm/plant-data/{id}       # Get plant details
PATCH  /api/v1/farm/plant-data/{id}       # Update plant
DELETE /api/v1/farm/plant-data/{id}       # Delete plant

GET    /api/v1/farm/plant-data-enhanced   # List plant data (enhanced schema with growthCycle)
POST   /api/v1/farm/plant-data-enhanced   # Create enhanced plant data
GET    /api/v1/farm/plant-data-enhanced/{id}  # Get enhanced plant details
PATCH  /api/v1/farm/plant-data-enhanced/{id}  # Update enhanced plant
DELETE /api/v1/farm/plant-data-enhanced/{id}  # Delete enhanced plant
```

#### Block Harvests
```
GET    /api/v1/farm/farms/{farm_id}/blocks/{block_id}/harvests     # List block harvests
POST   /api/v1/farm/farms/{farm_id}/blocks/{block_id}/harvests     # Create harvest record
GET    /api/v1/farm/farms/{farm_id}/harvests                       # List all farm harvests
```

#### Block Alerts
```
GET    /api/v1/farm/farms/{farm_id}/blocks/{block_id}/alerts       # List block alerts
POST   /api/v1/farm/farms/{farm_id}/blocks/{block_id}/alerts       # Create alert
GET    /api/v1/farm/farms/{farm_id}/alerts                         # List all farm alerts
```

#### Farm Dashboard
```
GET    /api/v1/farm/dashboard             # Farm management dashboard stats
```

### Testing Examples

**Login (CORRECT URL):**
```python
import requests

# Login
response = requests.post(
    "http://localhost/api/v1/auth/login",  # ⚠️ /auth/login NOT /users/login
    json={
        "email": "admin@a64platform.com",
        "password": "SuperAdmin123!"
    }
)
token = response.json()["access_token"]

# Use token for authenticated requests
headers = {"Authorization": f"Bearer {token}"}
farms = requests.get("http://localhost/api/v1/farm/farms", headers=headers)
```

**Common Mistakes to Avoid:**
- ❌ `/api/v1/users/login` - WRONG! This endpoint doesn't exist
- ❌ `/api/v1/farm-management/farms` - WRONG! No longer a separate service
- ✅ `/api/v1/auth/login` - CORRECT login endpoint
- ✅ `/api/v1/farm/farms` - CORRECT farm endpoint (integrated into main API)

## Remote Server & Git Synchronization

**CRITICAL: When working with remote servers (EC2, VPS, etc.), ALWAYS keep Git synchronized:**

### 🚨 LOCAL-FIRST DEVELOPMENT RULE 🚨

**ALWAYS make changes on your LOCAL machine FIRST, then sync to remote servers.**

**This is NON-NEGOTIABLE to avoid file conflicts and maintain consistency:**
- ❌ **NEVER** edit code files directly on remote servers
- ❌ **NEVER** make changes on both local and remote simultaneously
- ❌ **NEVER** skip Git when making code changes
- ✅ **ALWAYS** edit locally → commit → push → pull on remote
- ✅ **ALWAYS** use Git as the single source of truth

**Why this prevents conflicts:**
1. Git tracks who changed what and when
2. Merge conflicts are detected and can be resolved properly
3. You can't accidentally overwrite someone else's work
4. Both environments stay synchronized automatically
5. Easy to roll back if something breaks

### Git Sync Workflow

**MANDATORY steps when making changes:**

1. **Make changes locally FIRST** - Edit files on your local development machine (NEVER on server)
2. **Test locally** (if applicable) - Verify changes work in local environment
3. **Commit to Git** - Create descriptive commit with proper message format
4. **Push to GitHub** - `git push origin main`
5. **Pull on remote server** - SSH to server and `git pull origin main`
6. **Apply changes** - Rebuild Docker containers, restart services as needed
7. **Test on remote** - Verify changes work in production environment

### Why This Is Critical

**Never edit files directly on remote servers:**
- ❌ Changes get lost when you pull new code
- ❌ No version control or history of modifications
- ❌ Cannot roll back if something breaks
- ❌ Local and remote environments become inconsistent
- ❌ Other developers won't have your changes

**Always use Git as the single source of truth:**
- ✅ All changes tracked and versioned
- ✅ Easy rollback if problems occur
- ✅ Consistent state between local and remote
- ✅ Full change history for debugging
- ✅ Team members stay synchronized

### Production Server Connection

**IMPORTANT: Always use these exact connection details:**

- **Domain**: `a64core.com` (NOT a64platform.com)
- **IP Address**: `51.112.224.227`
- **SSH Key**: `a64-platform-key.pem` (in project root)
- **User**: `ubuntu`

**SSH Command Format:**
```bash
ssh -i a64-platform-key.pem ubuntu@51.112.224.227
# OR
ssh -i a64-platform-key.pem ubuntu@a64core.com
```

**Dynamic IP Access:**
If your IP changes frequently (mobile/travel), run the update script:
```bash
bash update-ssh-access.sh
```
This script updates AWS Security Group (sg-046c0c2ce3f13c605) with your current IP.

### Example Workflow

```bash
# 1. Local: Make changes to code
# Edit files locally in your IDE

# 2. Local: Commit and push
git add .
git commit -m "fix: update API URL configuration for production"
git push origin main

# 3. Remote: Pull changes
ssh -i a64-platform-key.pem ubuntu@51.112.224.227
cd ~/A64CorePlatform
git pull origin main

# 4. Remote: Apply changes (if needed)
docker compose -f docker-compose.yml -f docker-compose.prod.yml build <service>
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d <service>

# 5. Remote: Verify changes
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail 20 <service>
```

### Exception: Environment-Specific Files

**Only edit these files directly on servers:**
- `.env.production` - Production environment variables
- `.env.local` - Server-specific configuration
- SSL certificates and keys
- Server-specific configuration that should NOT be in Git

**These files should:**
- Be listed in `.gitignore`
- Never be committed to Git (security risk)
- Be documented in deployment guides

### Troubleshooting Git Sync

**If you accidentally edited on remote:**
```bash
# Save your changes first
git diff > my-changes.patch

# Discard local changes and sync with Git
git reset --hard origin/main

# Apply your changes as a proper commit locally
# Then follow the Git Sync Workflow above
```

**Remember:** Git is your safety net. Use it consistently!
