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

### What NOT to Do
- ❌ NEVER make changes based on assumptions
- ❌ NEVER skip reading relevant documentation
- ❌ NEVER proceed with unclear requirements
- ❌ NEVER implement quick fixes without understanding root cause
- ❌ NEVER modify code you don't fully understand

**When in doubt: STOP → READ DOCS → ASK USER → THEN PROCEED**

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

## Remote Server & Git Synchronization

**CRITICAL: When working with remote servers (EC2, VPS, etc.), ALWAYS keep Git synchronized:**

### Git Sync Workflow

**MANDATORY steps when making changes:**

1. **Make changes locally** - Edit files on your local development machine
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

### Example Workflow

```bash
# 1. Local: Make changes to code
# Edit files locally in your IDE

# 2. Local: Commit and push
git add .
git commit -m "fix: update API URL configuration for production"
git push origin main

# 3. Remote: Pull changes
ssh user@server
cd /path/to/project
git pull origin main

# 4. Remote: Apply changes (if needed)
docker compose -f docker-compose.prod.yml build <service>
docker compose -f docker-compose.prod.yml up -d <service>

# 5. Remote: Verify changes
# Test the application
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
