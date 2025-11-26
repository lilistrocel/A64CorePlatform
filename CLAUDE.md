# A64 Core Platform - Development Guide

## Quick Reference for Developers

This is a quick reference guide. **Specialized agents have their own rules** in `.claude/agent-rules/`.

## Core Principles

- **KISS** - Keep It Simple, Stupid
- **YAGNI** - You Aren't Gonna Need It
- **Cross-Platform** - Code MUST work on Windows AND Linux
- **Never Assume** - When in doubt, ask for clarification
- **Delegate to Specialists** - Use specialized agents for complex tasks

## ⚠️ CRITICAL RULES - READ FIRST ⚠️

### Documentation-First Approach
**BEFORE starting ANY task:**
1. ✅ **CHECK relevant documentation** in `Docs/1-Main-Documentation/`
2. ✅ **READ existing code** to understand current implementation
3. ✅ **VERIFY** you understand the requirements completely

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

CRITICAL MCP Tool Requirements:
✅ Use Playwright MCP for: [specific testing needs]
✅ Use MongoDB MCP for: [specific database verification]
❌ Do NOT use: curl, wget, mongo shell, or print statements

Expected MCP Verification:
1. [What to verify with Playwright MCP]
2. [What to verify with MongoDB MCP]
```

### Multi-Agent Workflows

For complete features, use this sequence:

```
1. Implementation Agent (backend/frontend/api)
   ↓
2. Testing Agent (verify functionality)
   ↓
3. Change Guardian (document & commit)
```

**Example:**
```
User: "Add user registration feature"
→ @agent-backend-dev-expert (implement API)
→ @agent-frontend-dev-expert (implement UI)
→ @agent-frontend-testing-playwright (test UI flow)
→ @agent-change-guardian (document & commit)
```

### When NOT to Use Agents

**Handle directly for:**
- Simple file reads
- Quick documentation lookups
- Answering questions about code
- Small configuration changes
- Single-file edits (< 10 lines)

## Project Structure

### Documentation
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

## Getting Started

1. Check relevant documentation in `Docs/1-Main-Documentation/`
2. Review project structure and architecture
3. **Identify if task needs specialized agent** - Check agent delegation strategy above
4. Follow cross-platform standards (Windows + Linux)
5. Update documentation as you work

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
