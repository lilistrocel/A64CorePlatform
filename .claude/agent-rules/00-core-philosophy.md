# Core Development Philosophy

**Agent Type:** Universal - All agents must follow these principles

---

## KISS (Keep It Simple, Stupid)

Simplicity should be a key goal in design. Choose straightforward solutions over complex ones whenever possible. Simple solutions are easier to understand, maintain, and debug.

## YAGNI (You Aren't Gonna Need It)

Avoid building functionality on speculation. Implement features only when they are needed, not when you anticipate they might be useful in the future.

## Design Principles

- **Dependency Inversion:** High-level modules should not depend on low-level modules. Both should depend on abstractions.
- **Open/Closed Principle:** Software entities should be open for extension but closed for modification.
- **Single Responsibility:** Each function, class, and module should have one clear purpose.
- **Fail Fast:** Check for potential errors early and raise exceptions immediately when issues occur.

## Golden Rules

- **NEVER ASSUME OR GUESS** - When in doubt, ask for clarification
- **Always verify** file paths and module names before use
- **Keep CLAUDE.md updated** when adding new patterns or dependencies
- **Document your decisions** - Future developers (including yourself) will thank you

## MCP Tool Priority Mandate

**CRITICAL: ALWAYS Use MCP Tools When Available**

**This is NON-NEGOTIABLE. MCP tools provide better visibility, validation, and debugging than traditional methods.**

### MCP Tools Priority

1. **Playwright MCP** - MUST be used for:
   - ✅ Testing frontend UI components and user flows
   - ✅ Verifying API endpoints and responses
   - ✅ Debugging browser behavior and interactions
   - ✅ Visual confirmation of changes
   - ✅ Real-time interaction debugging
   - ❌ NEVER use curl, wget, or manual browser testing instead

2. **MongoDB Verification** - MUST use mongosh (TEMPORARY WORKAROUND):
   - ⚠️ **CRITICAL:** MongoDB MCP is currently broken (connection doesn't persist)
   - ✅ Use mongosh via Bash for database verification
   - ✅ Pattern: `mongosh --eval "db.collection.find()" mongodb://localhost:27017/a64core_db --quiet`
   - ✅ Inspecting database collections and documents
   - ✅ Running queries and aggregations
   - ✅ Verifying data structure and schemas
   - ✅ Testing database operations
   - ❌ NEVER use mongo shell interactive mode or pymongo print statements
   - 📝 NOTE: Will switch to MongoDB MCP when connection persistence is fixed

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

## Cross-Platform Mandate

**CRITICAL: All Code MUST Work on Windows AND Linux**

This is NON-NEGOTIABLE. If it doesn't work on both Windows AND Linux, it's not done!

Supported Platforms:
- Windows 10/11 ✅
- Linux (Ubuntu, Debian, CentOS, etc.) ✅
- macOS (best effort - test when possible) ⚠️

## General Code Quality Rules

- **DRY (Don't Repeat Yourself):** Extract repeated code into functions/modules
- **Error Handling:** Always handle errors explicitly, never use empty catch blocks
- **Logging:** Use appropriate log levels (DEBUG, INFO, WARN, ERROR)
- **Security:** Never commit secrets, API keys, or passwords to git
- **Testing:** Minimum 80% code coverage for critical paths
- **Code Reviews:** All code must be reviewed before merging to main/develop

---

**Remember:** These principles apply to ALL agents and ALL code. No exceptions.
