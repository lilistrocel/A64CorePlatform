# CRITICAL: Documentation-First Approach

Core Development Philosophy
KISS (Keep It Simple, Stupid)
Simplicity should be a key goal in design. Choose straightforward solutions over complex ones whenever possible. Simple solutions are easier to understand, maintain, and debug.

YAGNI (You Aren't Gonna Need It)
Avoid building functionality on speculation. Implement features only when they are needed, not when you anticipate they might be useful in the future.

Design Principles
Dependency Inversion: High-level modules should not depend on low-level modules. Both should depend on abstractions.
Open/Closed Principle: Software entities should be open for extension but closed for modification.
Single Responsibility: Each function, class, and module should have one clear purpose.
Fail Fast: Check for potential errors early and raise exceptions immediately when issues occur.

NEVER ASSUME OR GUESS - When in doubt, ask for clarification
Always verify file paths and module names before use
Keep CLAUDE.md updated when adding new patterns or dependencies
Document your decisions - Future developers (including yourself) will thank you

🖥️ Cross-Platform Compatibility

CRITICAL: All Code MUST Work on Windows AND Linux
Everything we create MUST be cross-platform compatible. This is NON-NEGOTIABLE.

Supported Platforms:
- Windows 10/11
- Linux (Ubuntu, Debian, CentOS, etc.)
- macOS (best effort - test when possible)

Cross-Platform Rules:

1. Path Handling:
   ❌ NEVER use hardcoded paths with forward slashes or backslashes
   ✅ ALWAYS use os.path.join() or pathlib.Path for file paths

   # Wrong:
   path = "c:\folder\file.txt"  # Windows-only
   path = "/usr/local/file.txt"  # Linux-only

   # Correct:
   from pathlib import Path
   path = Path("folder") / "file.txt"
   # or
   import os
   path = os.path.join("folder", "file.txt")

2. Scripts and Executables:
   ❌ NEVER create shell scripts (.sh) only
   ❌ NEVER create batch files (.bat) only
   ✅ ALWAYS provide BOTH .sh (Linux/Mac) AND .bat/.ps1 (Windows) versions
   ✅ OR use Python scripts (work on all platforms)

   Example structure:
   /scripts/
     ├── test.sh          # For Linux/Mac
     ├── test.bat         # For Windows (cmd)
     ├── test.ps1         # For Windows (PowerShell)
     └── test.py          # Python (works everywhere - PREFERRED)

3. Line Endings:
   ✅ Configure Git to handle line endings: .gitattributes file
   ✅ Use LF (\n) for all text files
   ✅ Git will auto-convert on Windows (CRLF) if configured

4. Environment Variables:
   ✅ Use cross-platform methods to access environment variables

   # Python:
   import os
   value = os.getenv("ENV_VAR", "default")

   # Node.js:
   const value = process.env.ENV_VAR || 'default';

5. Command Execution:
   ❌ NEVER assume Unix commands are available (grep, sed, awk, etc.)
   ✅ Use Python/Node.js equivalents or check for availability
   ✅ Provide fallback options

   # Python example:
   import shutil
   if shutil.which("docker"):  # Check if command exists
       subprocess.run(["docker", "ps"])

6. Docker and Containers:
   ✅ Docker works on both Windows and Linux
   ✅ Use docker-compose for multi-container apps
   ✅ Test containers on both platforms
   ⚠️ Note: Windows uses Windows containers OR Linux containers (via WSL2)

7. File Permissions:
   ⚠️ Windows does not have Unix-style file permissions (chmod)
   ✅ Design systems to work without specific file permissions when possible
   ✅ If permissions needed, handle gracefully on Windows

8. Case Sensitivity:
   ⚠️ Windows filesystems are case-insensitive, Linux is case-sensitive
   ✅ Always use consistent casing for filenames
   ✅ Test on Linux to catch case-sensitivity issues

9. Testing Cross-Platform:
   ✅ Test on Windows if you develop on Linux (and vice versa)
   ✅ Use GitHub Actions / GitLab CI with both Windows and Linux runners
   ✅ Document any platform-specific quirks

10. Documentation:
    ✅ Provide installation/setup instructions for BOTH Windows and Linux
    ✅ Include Windows-specific notes (e.g., WSL, PowerShell)
    ✅ Include Linux-specific notes (e.g., apt-get, yum)

Cross-Platform Testing Checklist:
Before ANY release:
- [ ] Code tested on Windows
- [ ] Code tested on Linux
- [ ] Scripts work on both platforms (or alternatives provided)
- [ ] Paths use os.path or pathlib
- [ ] Docker containers work on both platforms
- [ ] Documentation includes both Windows and Linux instructions
- [ ] No hardcoded platform-specific paths
- [ ] Environment variables handled cross-platform
- [ ] File permissions handled gracefully
- [ ] CI/CD tests on both platforms

Preferred Solutions for Cross-Platform:
1. Python scripts instead of shell scripts (.py works everywhere)
2. Docker/Docker Compose (standardizes environment)
3. pathlib.Path or os.path for all file operations
4. Cross-platform libraries (e.g., pytest, not bash-specific tools)
5. GitHub Actions with multiple OS matrices

Example Cross-Platform Python Script:
```python
#!/usr/bin/env python3
"""Cross-platform script example"""
import os
import sys
import platform
from pathlib import Path

def main():
    # Detect platform
    current_os = platform.system()  # 'Windows', 'Linux', 'Darwin'

    # Use pathlib for paths
    project_root = Path(__file__).parent.parent
    config_file = project_root / "config" / "settings.json"

    # Cross-platform command execution
    if current_os == "Windows":
        print("Running on Windows")
        # Windows-specific logic if needed
    else:
        print("Running on Linux/Mac")
        # Unix-specific logic if needed

    print(f"Config file: {config_file}")

if __name__ == "__main__":
    main()
```

REMEMBER: If it doesn't work on both Windows AND Linux, it's not done!

🐍 Python Import Standards (CRITICAL)

CRITICAL: Proper Import Structure is MANDATORY
Import issues cause deployment failures and waste significant debugging time. Follow these rules WITHOUT EXCEPTION.

Python Import Rules:
1. ✅ ALWAYS use relative imports within src/ package
   - Never use: from api.v1 import auth
   - Always use: from .v1 import auth (if in api/)
   - Always use: from ..api.v1 import auth (if outside api/)

2. ✅ ALWAYS ensure every directory has __init__.py
   - Without __init__.py, Python won't recognize it as a package
   - Even empty __init__.py files are required
   - Check all subdirectories: api/, api/v1/, services/, models/, etc.

3. ✅ ALWAYS run as module, not script
   - Never: python src/main.py
   - Always: python -m src.main
   - Docker CMD: python -m uvicorn src.main:app

4. ❌ NEVER use absolute imports for internal modules
   - Never: from services.database import mongodb
   - Always: from .services.database import mongodb (from src/)
   - Always: from ..services.database import mongodb (from src/subdirectory/)

Relative Import Patterns:
- Same directory: from .module import function
- Subdirectory: from .subdir.module import function
- Parent directory: from ..module import function
- Parent's sibling: from ..sibling.module import function
- Grandparent: from ...module import function

Common Import Mistakes to Avoid:
❌ Wrong: from api.v1 import auth
✅ Right: from .v1 import auth (if in api/)

❌ Wrong: from services.database import mongodb
✅ Right: from ..services.database import mongodb (from api/)

❌ Wrong: python src/main.py
✅ Right: python -m src.main

❌ Wrong: Directory missing __init__.py
✅ Right: Every package directory has __init__.py

Quick Import Troubleshooting:
If you see "ModuleNotFoundError: No module named 'api'" or similar:
1. Check if you're using absolute imports (api.v1) instead of relative (.v1)
2. Verify all directories have __init__.py files
3. Ensure you're running as module (python -m src.main)
4. Check Docker CMD uses module notation (src.main:app not src/main.py)

Import Testing:
Before committing, verify imports work:
```bash
# Test imports
python -m pytest tests/test_imports.py

# Or quick test
python -c "from src.api import health; from src.services import database; print('Imports OK')"
```

Mandatory Checks Before ANY Commit:
- [ ] All imports use relative imports (., .., ...)
- [ ] All directories have __init__.py
- [ ] Code runs with python -m src.main
- [ ] Docker CMD uses module notation
- [ ] No absolute imports for internal modules

For Complete Import Guidelines:
See: Docs/1-Main-Documentation/Python-Import-Guidelines.md

REMEMBER: Import errors in production are UNACCEPTABLE. Test imports before committing!

📝 Documentation Standards

Project Documentation Structure
The project uses a structured documentation system in the Docs/ folder:
- Docs/1-Main-Documentation/ - Core documentation including:
  - API Standards
  - System Architecture
  - Data Structures
- Docs/2-Working-Progress/ - Active work documentation and status tracking
- Docs/3-DevLog/ - Development process logs and decisions

MANDATORY DOCUMENTATION WORKFLOW:
1. CRITICAL: Docs/1-Main-Documentation/ is the SINGLE SOURCE OF TRUTH
   - ALWAYS check ALL files in Docs/1-Main-Documentation/ BEFORE starting ANY task
   - These documents define system architecture, standards, and requirements
   - NEVER guess or assume - check documentation FIRST
   - When in doubt about anything, check relevant Main Documentation FIRST, then ask user for clarification
   - Main Documentation files:
     * System-Architecture.md - Framework, system design, architecture (SINGLE SOURCE OF TRUTH for architecture)
     * API-Structure.md - API endpoints, routes, authentication
     * Versioning.md - Version management and compatibility
     * User-Structure.md - User model, roles, permissions, authentication flows

2. CRITICAL: For ANY API-related work, ALWAYS check Docs/1-Main-Documentation/API-Structure.md FIRST
   - Review existing endpoints to avoid duplication
   - Understand current API patterns and conventions
   - Check authentication requirements
   - Verify naming conventions are followed

3. CRITICAL: For ANY architecture/system work, ALWAYS check Docs/1-Main-Documentation/System-Architecture.md FIRST
   - Review system design patterns and principles
   - Check technology stack and dependencies
   - Understand component architecture and layers
   - Follow data flow patterns
   - Verify security architecture requirements
   - Check scalability and deployment guidelines

4. CRITICAL: For ANY user/auth-related work, ALWAYS check Docs/1-Main-Documentation/User-Structure.md FIRST
   - Review user model schema (MongoDB & MySQL)
   - Check role definitions and permissions matrix
   - Follow authentication flows exactly as documented
   - Understand security requirements and password policies
   - Verify role-based access control (RBAC) rules

5. CRITICAL: For ANY version-related work, ALWAYS check Docs/1-Main-Documentation/Versioning.md FIRST
   - Review current version numbers across all components
   - Check subsystem compatibility matrix
   - Understand versioning strategy (Semantic Versioning)
   - Review deprecation policies and timelines

6. ALWAYS update documentation when:
   - Adding new features or components
   - Modifying architecture or design patterns (update System-Architecture.md immediately)
   - Making significant code changes
   - Completing tasks or milestones
   - Creating or modifying ANY API endpoint (update API-Structure.md immediately)
   - Adding/modifying user roles or permissions (update User-Structure.md immediately)
   - Releasing ANY version (update Versioning.md and CHANGELOG.md)
   - Adding new technology/library (update System-Architecture.md technology stack)
   - Changing deployment architecture (update System-Architecture.md deployment section)

7. When working on a task:
   - Create/update entries in Docs/2-Working-Progress/
   - Log decisions and progress in Docs/3-DevLog/
   - Update main docs in Docs/1-Main-Documentation/ when complete
   - For architecture work: Update System-Architecture.md with design decisions
   - For API work: Update API-Structure.md with full endpoint documentation
   - For user/auth work: Update User-Structure.md with schema/role/permission changes
   - For releases: Update Versioning.md, CHANGELOG.md, and git tags

8. Documentation is NOT optional - treat it as part of the feature implementation

Code Documentation
Every module should have a docstring explaining its purpose
Public functions must have complete docstrings
Complex logic should have inline comments with # Reason: prefix
Keep README.md updated with setup instructions and examples
Maintain CHANGELOG.md for version history

README.md as Central Instruction Hub
README.md serves as the single source of truth for all user-facing instructions:
- ALWAYS update README.md when adding features that users will interact with
- ALL tutorials, usage instructions, and how-to guides MUST be in README.md
- Keep README.md organized with clear sections and table of contents
- Technical/internal documentation goes in Docs/, user instructions go in README.md
- When completing a feature, updating README.md is MANDATORY, not optional

DEPLOYMENT.md for Deployment Instructions
DEPLOYMENT.md is the dedicated file for all deployment-related documentation:
- ALWAYS update DEPLOYMENT.md when making deployment process changes
- ALL deployment instructions, configurations, and procedures MUST be in DEPLOYMENT.md
- Include environment setup, deployment steps, and rollback procedures
- Document deployment prerequisites, post-deployment verification, and troubleshooting
- Keep deployment documentation separate from user instructions (README.md) and technical docs (Docs/)

💻 Coding Standards

Language-Specific Standards

JavaScript/Node.js Standards
Syntax Rules:
- Use ES6+ modern syntax (const/let, arrow functions, async/await)
- Use strict mode: 'use strict' at the top of files
- Use semicolons consistently
- Prefer template literals over string concatenation
- Use async/await over raw promises for better readability
- Maximum line length: 100 characters
- Indentation: 2 spaces (no tabs)

Naming Conventions:
- Variables & Functions: camelCase (e.g., getUserData, isActive)
- Classes: PascalCase (e.g., UserController, DatabaseManager)
- Constants: UPPER_SNAKE_CASE (e.g., API_KEY, MAX_RETRY_COUNT)
- Private methods/properties: prefix with _ (e.g., _validateInput)
- File names: kebab-case for modules (e.g., user-service.js, auth-middleware.js)
- Boolean variables: prefix with is/has/should (e.g., isValid, hasPermission)

React/TypeScript/Styled-Components Standards

CRITICAL: For ALL UI development work, ALWAYS check Docs/1-Main-Documentation/UI-Standards.md FIRST
- This document contains comprehensive UI development standards
- Covers React, TypeScript, styled-components, form handling, state management
- MUST be followed to avoid DOM prop warnings and React errors
- Reference this document before creating or modifying ANY UI components

Quick Reference - Styled-Components DOM Props:
❌ NEVER pass custom props directly to DOM elements
✅ ALWAYS use transient props ($ prefix) for styled-component props

Wrong:
```typescript
const StyledButton = styled.button<{ variant: string }>`
  background: ${({ variant }) => variant === 'primary' ? 'blue' : 'gray'};
`;
<StyledButton variant="primary">Click</StyledButton>  // ❌ 'variant' passed to DOM
```

Correct:
```typescript
const StyledButton = styled.button<{ $variant: string }>`
  background: ${({ $variant }) => $variant === 'primary' ? 'blue' : 'gray'};
`;
export function Button({ variant = 'primary', ...props }) {
  return <StyledButton $variant={variant} {...props}>Click</StyledButton>;  // ✅ $variant filtered
}
```

Component Props Pattern:
1. Public interface: Normal prop names (variant, fullWidth, size)
2. Internal styled-component: Transient props ($variant, $fullWidth, $size)
3. Component function: Converts public props to transient props

React Router Standards:
✅ ALWAYS add future flags to BrowserRouter to avoid deprecation warnings:
```typescript
<BrowserRouter
  future={{
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  }}
>
```

For complete UI development standards, see: Docs/1-Main-Documentation/UI-Standards.md

Python Standards
Syntax Rules:
- Follow PEP 8 style guide
- Use type hints for function parameters and return values
- Maximum line length: 88 characters (Black formatter standard)
- Indentation: 4 spaces (no tabs)
- Use list comprehensions when appropriate for readability
- Prefer f-strings for string formatting
- Use context managers (with statement) for resource management

Naming Conventions:
- Variables & Functions: snake_case (e.g., get_user_data, is_active)
- Classes: PascalCase (e.g., UserController, DatabaseManager)
- Constants: UPPER_SNAKE_CASE (e.g., API_KEY, MAX_RETRY_COUNT)
- Private methods/properties: prefix with _ (e.g., _validate_input)
- File names: snake_case (e.g., user_service.py, auth_middleware.py)
- Boolean variables: prefix with is/has/should (e.g., is_valid, has_permission)

Database Standards

MongoDB Naming:
- Collection names: plural, lowercase with underscores (e.g., users, order_items)
- Field names: camelCase (e.g., firstName, createdAt)
- Document IDs: Use MongoDB ObjectId or UUID v4
- Index naming: descriptive with fields (e.g., idx_users_email, idx_orders_status_date)

MySQL Naming:
- Table names: plural, lowercase with underscores (e.g., users, order_items)
- Column names: snake_case (e.g., first_name, created_at)
- Primary keys: id (auto-increment) or uuid
- Foreign keys: {table_name}_id (e.g., user_id, order_id)
- Index naming: idx_{table}_{columns} (e.g., idx_users_email)
- Constraint naming: {type}_{table}_{columns} (e.g., fk_orders_user_id)

ID and Identifier Standards

Universal ID Rules:
- API Endpoints: Use UUIDs for public-facing IDs (security through obscurity)
- Internal IDs: Auto-increment integers acceptable for internal use
- Resource IDs in URLs: Use kebab-case slugs when possible (e.g., /api/users/john-doe)
- Session IDs: Use cryptographically secure random tokens (minimum 32 bytes)
- API Keys: Prefix with environment (e.g., dev_key_..., prod_key_...)

Naming Pattern:
- {resource}Id for references (e.g., userId, orderId)
- Consistent across MongoDB (camelCase) and MySQL (snake_case): user_id vs userId
- Always use meaningful names, never generic like id1, id2

File and Directory Structure

Project Organization:
- /src - Source code
- /tests - Test files (mirror src structure)
- /docs or /Docs - Documentation
- /config - Configuration files
- /scripts - Utility scripts
- /public - Static assets (web)
- /api - API route definitions
- /models - Database models
- /controllers - Business logic controllers
- /services - Service layer
- /middleware - Middleware functions
- /utils or /helpers - Utility functions

Git Standards

Branch Naming:
- feature/{feature-name} (e.g., feature/user-authentication)
- bugfix/{bug-name} (e.g., bugfix/login-error)
- hotfix/{issue-name} (e.g., hotfix/security-patch)
- release/{version} (e.g., release/v1.0.0)
- Main branches: main, develop

Commit Messages:
- Format: {type}: {short description}
- Types: feat, fix, docs, style, refactor, test, chore
- Examples:
  - feat: add user authentication endpoint
  - fix: resolve database connection timeout
  - docs: update API documentation
- Use present tense, imperative mood
- Keep first line under 50 characters
- Add detailed description after blank line if needed

Docker Standards

Container Naming:
- Format: {project}-{service}-{environment}
- Example: a64core-api-dev, a64core-db-prod
- Use lowercase with hyphens

Image Naming:
- Format: {organization}/{project}-{service}:{version}
- Example: a64core/api:1.0.0, a64core/worker:latest
- Always tag images with version numbers

General Code Quality Rules
- DRY (Don't Repeat Yourself): Extract repeated code into functions/modules
- Error Handling: Always handle errors explicitly, never use empty catch blocks
- Logging: Use appropriate log levels (DEBUG, INFO, WARN, ERROR)
- Security: Never commit secrets, API keys, or passwords to git
- Testing: Minimum 80% code coverage for critical paths
- Code Reviews: All code must be reviewed before merging to main/develop

🌐 API Standards

CRITICAL: API Development Workflow
1. ALWAYS check Docs/1-Main-Documentation/API-Structure.md BEFORE creating or modifying any API endpoint
2. ALWAYS update API-Structure.md when adding, modifying, or removing endpoints
3. NEVER create duplicate endpoints - check existing routes first
4. ALL API changes must be documented with request/response examples

RESTful API Design Principles
Endpoint Structure:
- Use nouns for resources, not verbs: /users NOT /getUsers
- Use plural nouns: /users, /products, /orders
- Use HTTP methods for actions:
  - GET: Retrieve resource(s)
  - POST: Create new resource
  - PATCH: Partial update of resource
  - PUT: Full replacement of resource
  - DELETE: Remove resource
- Nested resources: /users/{userId}/orders (max 2 levels deep)
- Use query parameters for filtering, sorting, pagination:
  - ?page=1&perPage=20
  - ?sortBy=createdAt&order=desc
  - ?filter[status]=active

URL Naming Conventions:
- All lowercase
- Use hyphens for multi-word resources: /order-items
- Version in path: /api/v1/users
- No trailing slashes: /users NOT /users/
- File extensions not needed: /users/123 NOT /users/123.json

Request/Response Standards:
- Content-Type: application/json (default)
- Use camelCase for JSON keys
- ISO 8601 format for dates: "2025-10-16T10:30:00.000Z"
- UUIDs for resource IDs in responses
- Include timestamps: createdAt, updatedAt

Response Structure:
Success Response (Single Resource):
{
  "data": {
    "id": "uuid",
    "attribute": "value"
  }
}

Success Response (Multiple Resources):
{
  "data": [...],
  "meta": {
    "total": 100,
    "page": 1,
    "perPage": 20,
    "totalPages": 5
  },
  "links": {
    "first": "...",
    "last": "...",
    "prev": "...",
    "next": "..."
  }
}

Error Response:
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": "Additional context",
    "timestamp": "2025-10-16T10:30:00.000Z",
    "path": "/api/v1/resource"
  }
}

HTTP Status Code Usage:
- 200 OK: Successful GET, PATCH, PUT
- 201 Created: Successful POST (return created resource)
- 204 No Content: Successful DELETE
- 400 Bad Request: Invalid request format
- 401 Unauthorized: Missing/invalid authentication
- 403 Forbidden: Insufficient permissions
- 404 Not Found: Resource doesn't exist
- 409 Conflict: Duplicate resource
- 422 Unprocessable Entity: Validation errors
- 429 Too Many Requests: Rate limit exceeded
- 500 Internal Server Error: Server-side error
- 503 Service Unavailable: Temporary downtime

Authentication Standards:
- API Keys: X-API-Key header for service-to-service
- JWT: Authorization: Bearer {token} for user authentication
- Never pass credentials in URL query parameters
- All production endpoints require authentication (except public endpoints)

Versioning Strategy:
- Major version in URL: /api/v1, /api/v2
- Breaking changes require new major version
- Maintain backward compatibility within same version
- Deprecation notice: minimum 6 months before removal
- Document version changes in API-Structure.md

Pagination Standards:
- Default page size: 20 items
- Maximum page size: 100 items
- Query params: ?page=1&perPage=20
- Always include pagination metadata in response

Security Requirements:
- Validate all input data
- Sanitize user input to prevent injection attacks
- Use HTTPS in production (TLS 1.2+)
- Implement rate limiting (default: 100 requests/minute per IP)
- Never expose internal error details in production
- Log all authentication failures
- Use CORS appropriately (whitelist specific origins)

Error Handling:
- Return appropriate HTTP status codes
- Include error codes for client handling
- Provide helpful error messages
- Never expose stack traces in production
- Log all errors server-side

Documentation Requirements for Each Endpoint:
- HTTP method and full path
- Purpose/description
- Authentication requirements
- Request parameters (path, query, body)
- Request body schema with types
- Response schema with types
- All possible status codes
- Error response examples
- Usage examples (curl, code samples)

📦 Versioning Standards

CRITICAL: Version Management Workflow
1. ALWAYS check Docs/1-Main-Documentation/Versioning.md BEFORE any version-related work
2. ALWAYS update Versioning.md when releasing any version
3. ALWAYS create CHANGELOG.md entries for all releases
4. ALWAYS create git tags for version releases
5. NEVER skip version numbers - follow strict sequential ordering

Semantic Versioning (SemVer 2.0.0)
Format: MAJOR.MINOR.PATCH (e.g., 1.4.2)

When to Increment MAJOR (X.0.0):
- Breaking API changes (endpoint removal, response format changes)
- Database schema breaking changes
- Removal of deprecated features after notice period
- Major architecture changes requiring migration
- Any change that breaks backward compatibility

When to Increment MINOR (1.X.0):
- New API endpoints added (backward compatible)
- New features added (backward compatible)
- New optional parameters
- New database tables/collections (non-breaking)
- Feature deprecation warnings (feature still works)
- Significant performance improvements

When to Increment PATCH (1.0.X):
- Bug fixes (no API changes)
- Security patches
- Performance improvements (minor)
- Documentation updates
- Internal refactoring (no external changes)
- Dependency updates (non-breaking)

Pre-release Versions:
- Alpha: 1.0.0-alpha.1 (internal testing, unstable)
- Beta: 1.0.0-beta.1 (external testing, feature complete)
- Release Candidate: 1.0.0-rc.1 (final testing before release)

Version Files to Update on Release:
1. Docs/1-Main-Documentation/Versioning.md (version history, compatibility matrix)
2. CHANGELOG.md (detailed change log with dates)
3. src/main.py or package.json (application version constant)
4. docker-compose.yml (image tags)
5. Git tags (git tag -a v1.0.0 -m "Release 1.0.0")
6. README.md (if user-facing changes)
7. DEPLOYMENT.md (if deployment process changes)
8. API-Structure.md (if API version changes)

Release Checklist (Before Release):
- [ ] All tests passing (unit, integration, e2e)
- [ ] Version numbers updated in all files
- [ ] CHANGELOG.md updated with all changes
- [ ] Versioning.md updated with new version entry
- [ ] API-Structure.md updated if API changes
- [ ] Documentation reviewed and updated
- [ ] Breaking changes documented with migration guide
- [ ] Deprecation notices added (if applicable)
- [ ] Security scan completed
- [ ] Performance testing completed

Release Checklist (During Release):
- [ ] Git tag created with version number
- [ ] Docker images built with version tag
- [ ] Docker images pushed to registry
- [ ] GitHub/GitLab release created with changelog
- [ ] Production deployment executed
- [ ] Health checks verified in production

Release Checklist (After Release):
- [ ] Monitor logs for errors (24 hours)
- [ ] Update Docs/3-DevLog/ with release notes
- [ ] Announce release to stakeholders
- [ ] Archive old documentation versions
- [ ] Plan next version features

Deprecation Policy:
1. Announcement: Mark feature as deprecated in documentation
2. Warning Period: Minimum 6 months, feature still works with warnings
3. Removal: Remove in next MAJOR version only
4. Communication: Update CHANGELOG.md, Versioning.md, API-Structure.md
5. Migration Guide: Provide clear path to replacement functionality

Version Compatibility Rules:
- APIs within same MAJOR version MUST be backward compatible
- Database migrations MUST support rolling back one version
- Docker images MUST be tagged with full semantic version
- Never use 'latest' tag in production deployments
- Maintain compatibility matrix in Versioning.md

Git Tagging Standards:
- Format: v{MAJOR}.{MINOR}.{PATCH} (e.g., v1.0.0)
- Always use annotated tags: git tag -a v1.0.0 -m "Release 1.0.0"
- Include release notes in tag message
- Push tags explicitly: git push origin v1.0.0
- Never delete or modify published tags

🔐 Python Secure Coding Standards

CRITICAL: Security is NOT Optional
ALL code must follow these security standards. Security vulnerabilities are considered critical bugs and must be fixed immediately.

Input Validation & Sanitization:
1. NEVER trust user input - validate everything
2. Use Pydantic models for all API request validation
3. Sanitize file uploads (validate extension AND content)
4. Reject invalid data immediately with clear error messages

Database Security:
1. ALWAYS use parameterized queries (NEVER string concatenation)
2. Use ORM query builders when possible
3. Apply least privilege to database users
4. Encrypt sensitive data at rest
5. Example: db.execute("SELECT * FROM users WHERE id = ?", (user_id,))

Authentication & Passwords:
1. NEVER store plain text passwords (use bcrypt/argon2)
2. Implement secure session management (httpOnly, secure, sameSite cookies)
3. Implement rate limiting on auth endpoints (5 attempts/minute)
4. Use cryptographically secure tokens (secrets.token_urlsafe(32))
5. JWT: Use HS256, short expiry (1hr access, 7 days refresh max)

Secrets Management:
1. NEVER hardcode secrets in code
2. Use environment variables for all secrets
3. Use secret management services in production (AWS Secrets Manager, Vault)
4. Separate config by environment (dev/staging/prod)
5. Example: SECRET_KEY = os.getenv("SECRET_KEY") with validation

Command Execution:
1. NEVER use os.system() or shell=True
2. NEVER concatenate user input into commands
3. Always use subprocess with shell=False and argument lists
4. Validate and sanitize all inputs to system calls
5. Example: subprocess.run(['convert', input_file, output_file], shell=False, timeout=30)

Serialization:
1. NEVER use pickle with untrusted data (arbitrary code execution risk)
2. Use JSON for data exchange
3. Validate all deserialized data with Pydantic
4. Use safe alternatives (msgpack, protobuf)

Error Handling & Logging:
1. NEVER expose stack traces in production responses
2. NEVER log sensitive data (passwords, tokens, PII)
3. Use structured logging with appropriate levels
4. Return generic error messages to clients, detailed logs server-side
5. Example: logger.error("Operation failed", exc_info=True) + return generic message

Dependencies:
1. Pin ALL dependency versions in requirements.txt
2. Run security audits regularly (pip-audit, safety check)
3. Review dependencies before adding to project
4. Update dependencies regularly but test thoroughly

HTTP Security Headers:
1. Implement security headers (X-Content-Type-Options, X-Frame-Options, HSTS)
2. Configure CORS properly (NEVER use wildcard "*" with credentials)
3. Enforce HTTPS in production (HTTPSRedirect middleware)
4. Set secure cookie flags (Secure, HttpOnly, SameSite)

Security Testing:
1. Write tests for SQL injection prevention
2. Write tests for authentication/authorization
3. Write tests for rate limiting
4. Test with malicious inputs
5. Run security scanners (bandit for Python)

Code Review Security Checklist:
- [ ] No hardcoded secrets
- [ ] All inputs validated
- [ ] Parameterized database queries
- [ ] No shell=True in subprocess
- [ ] No pickle with external data
- [ ] Sensitive data encrypted
- [ ] Secure password hashing
- [ ] Rate limiting implemented
- [ ] Error messages don't leak info
- [ ] No sensitive data in logs
- [ ] Dependencies pinned and audited
- [ ] Security headers configured
- [ ] HTTPS enforced
- [ ] CORS properly configured

Security Incident Response:
If security breach occurs:
1. IMMEDIATELY rotate all credentials and secrets
2. Assess scope of breach
3. Block malicious access
4. Document all actions
5. Notify affected users and stakeholders
6. Conduct post-mortem and update security

Security Resources:
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Python Security: https://python.readthedocs.io/en/stable/library/security_warnings.html
- Bandit (Security Linter): https://github.com/PyCQA/bandit
- CWE Top 25: https://cwe.mitre.org/top25/

🚀 Performance Testing Standards

CRITICAL: Performance Testing is MANDATORY
Performance testing MUST be included in ALL testing phases. Performance issues are considered bugs and must be addressed before deployment.

When to Perform Performance Tests:
1. ALWAYS during system testing (before deployment)
2. ALWAYS after adding new features or endpoints
3. ALWAYS after database schema changes
4. ALWAYS after significant code refactoring
5. ALWAYS when modifying authentication/authorization logic
6. ALWAYS when changing rate limiting or caching strategies

Performance Testing Requirements:

Baseline Metrics (Target Performance):
- API Response Time (p50): < 100ms
- API Response Time (p95): < 500ms
- API Response Time (p99): < 1000ms
- Database Query Time: < 50ms average
- Authentication Time: < 200ms
- Token Validation: < 50ms
- Rate Limiting Check: < 10ms
- Error Rate: < 0.1%
- Throughput: > 100 requests/second (single instance)

Load Testing Scenarios:
1. Normal Load: Expected average traffic
   - Test with 10-50 concurrent users
   - Run for 5-10 minutes
   - Verify all metrics within targets

2. Peak Load: Expected maximum traffic
   - Test with 100-500 concurrent users
   - Run for 5-10 minutes
   - Response times should stay within acceptable range

3. Stress Testing: Beyond expected maximum
   - Test with 500-1000+ concurrent users
   - Identify breaking point
   - System should degrade gracefully, not crash

4. Sustained Load: Long-duration testing
   - Test with normal load for 1+ hours
   - Check for memory leaks
   - Monitor resource usage trends

Performance Testing Tools:
Required Tools:
- Apache Bench (ab): Simple HTTP load testing
- wrk: Modern HTTP benchmarking tool
- Locust: Python-based load testing with UI
- k6: Modern load testing with JavaScript

Recommended Usage:
```bash
# Quick API endpoint test with Apache Bench
ab -n 1000 -c 10 http://localhost:8000/api/health

# Load test with wrk
wrk -t4 -c100 -d30s http://localhost:8000/api/v1/auth/login

# Authentication flow test with k6
k6 run load-test-auth.js
```

What to Test:

1. Authentication Endpoints:
   - POST /api/v1/auth/register (signup load)
   - POST /api/v1/auth/login (login load)
   - GET /api/v1/auth/me (token validation load)
   - POST /api/v1/auth/refresh (token refresh load)

2. Database Operations:
   - Read operations (GET requests)
   - Write operations (POST/PATCH requests)
   - Complex queries with joins/aggregations
   - Concurrent write operations

3. Rate Limiting:
   - Verify rate limits trigger correctly
   - Test different role limits
   - Test login attempt limiting
   - Ensure rate limiter doesn't become bottleneck

4. Middleware Performance:
   - Authentication middleware overhead
   - Authorization middleware overhead
   - Rate limiting middleware overhead
   - Total middleware stack overhead

5. Database Connection Pooling:
   - Test with various pool sizes
   - Monitor pool exhaustion
   - Test connection recycling
   - Check for connection leaks

Performance Monitoring Metrics:

Application Metrics:
- Request rate (requests/second)
- Response time distribution (p50, p95, p99)
- Error rate and error types
- Active requests/connections
- Queue depth (if applicable)

System Metrics:
- CPU usage (should be < 70% under normal load)
- Memory usage (should not grow unbounded)
- Disk I/O (if persistent storage used)
- Network I/O

Database Metrics:
- Query execution time
- Connection pool usage
- Cache hit rate
- Index usage
- Slow query log

Performance Testing Workflow:

1. Baseline Testing (Before Changes):
   - Run performance tests on current stable version
   - Document baseline metrics
   - Save results for comparison

2. Development Testing (During Changes):
   - Run quick smoke tests after significant changes
   - Compare with baseline immediately
   - Fix performance regressions before continuing

3. Integration Testing (After Changes):
   - Run full performance test suite
   - Compare with baseline metrics
   - Document any performance changes (positive or negative)

4. Pre-Deployment Testing:
   - Run complete load test scenarios
   - Verify all metrics meet targets
   - Test under stress conditions
   - Document results in test report

Performance Optimization Guidelines:

When Performance Issues Detected:
1. Profile the application to identify bottlenecks
2. Check database query performance (use EXPLAIN)
3. Review N+1 query problems
4. Check connection pool settings
5. Review caching strategy
6. Check for memory leaks
7. Review algorithm complexity
8. Consider async operations where appropriate

Common Performance Improvements:
- Add database indexes for frequently queried fields
- Implement caching (Redis) for frequently accessed data
- Optimize database queries (avoid N+1, use projections)
- Use connection pooling appropriately
- Implement pagination for large datasets
- Use async operations for I/O-bound tasks
- Minimize middleware overhead
- Compress responses (gzip)
- Use CDN for static assets

Performance Regression Policy:
- 10% regression: Warning - investigate and justify
- 20% regression: Blocker - must be fixed before merge
- 50% regression: Critical - rollback immediately

Performance Testing Checklist:
Before ANY deployment:
- [ ] Baseline metrics documented
- [ ] Load tests executed (normal, peak, stress)
- [ ] Response times within targets (p95 < 500ms)
- [ ] Error rate acceptable (< 0.1%)
- [ ] No memory leaks detected
- [ ] Database queries optimized (< 50ms avg)
- [ ] Rate limiting verified functional
- [ ] Concurrent user load tested
- [ ] Resource usage acceptable (CPU < 70%)
- [ ] Performance test results documented

Performance Test Documentation:
ALWAYS document performance test results:
1. Create/update entry in Docs/2-Working-Progress/
2. Include test scenarios and parameters
3. Document all metrics (response times, throughput, errors)
4. Compare with baseline/previous results
5. Document any performance issues found
6. Document optimizations performed
7. Include graphs/charts if applicable

Tools Installation:
```bash
# Apache Bench (usually pre-installed on Linux/Mac)
sudo apt-get install apache2-utils  # Ubuntu/Debian
brew install httpd  # macOS

# wrk
git clone https://github.com/wg/wrk.git
cd wrk && make

# Locust
pip install locust

# k6
brew install k6  # macOS
# or download from https://k6.io/docs/getting-started/installation/
```

Performance Testing Example (k6 script):
```javascript
// load-test-auth.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp up to 20 users
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 50 },   // Stay at 50 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.01'],    // Error rate must be below 1%
  },
};

export default function () {
  // Test login endpoint
  let loginRes = http.post('http://localhost:8000/api/v1/auth/login',
    JSON.stringify({
      email: 'testuser@example.com',
      password: 'TestPass123!'
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(loginRes, {
    'login status is 200': (r) => r.status === 200,
    'login response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

REMEMBER: Performance testing is NOT optional. It protects against performance regressions and ensures good user experience!

🌐 CORS (Cross-Origin Resource Sharing) Standards

CRITICAL: CORS Configuration is MANDATORY for Frontend-Backend Communication
CORS errors are one of the most common issues in development. Follow these standards to avoid "No 'Access-Control-Allow-Origin' header" errors.

Understanding CORS
CORS (Cross-Origin Resource Sharing) is a security mechanism that controls which origins can access your API:
- **Origin:** Protocol + Domain + Port (e.g., http://localhost:5173)
- **Cross-Origin Request:** When frontend and backend are on different origins
- **Same-Origin:** http://localhost:5173 → http://localhost:5173 ✅
- **Cross-Origin:** http://localhost:5173 → http://localhost:8000 ❌ (different port)

Common CORS Error:
```
Access to XMLHttpRequest at 'http://localhost:8000/api/v1/auth/login' from origin 'http://localhost:5173'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

CORS Configuration Requirements

Backend (FastAPI/Python) CORS Configuration:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Development CORS configuration
if settings.ENVIRONMENT == "development":
    origins = [
        "http://localhost:5173",      # Vite dev server
        "http://localhost:3000",      # Alternative React dev server
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]
else:
    # Production CORS configuration
    origins = [
        "https://yourdomain.com",
        "https://www.yourdomain.com",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,              # Allowed origins
    allow_credentials=True,             # Allow cookies/auth headers
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],                # Allow all headers (or specify)
    expose_headers=["*"],               # Expose headers to frontend
    max_age=600,                        # Cache preflight requests (10 min)
)
```

Backend (Node.js/Express) CORS Configuration:
```javascript
const express = require('express');
const cors = require('cors');

const app = express();

// Development CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://yourdomain.com', 'https://www.yourdomain.com']
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,                    // Allow cookies/auth headers
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600,                          // Cache preflight (10 min)
};

app.use(cors(corsOptions));
```

Nginx Proxy Configuration (Production):
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend
    location / {
        proxy_pass http://user-portal:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API with CORS headers
    location /api/ {
        proxy_pass http://api:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CORS headers (if not handled by backend)
        add_header 'Access-Control-Allow-Origin' 'https://yourdomain.com' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;

        # Handle preflight requests
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' 'https://yourdomain.com' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With' always;
            add_header 'Access-Control-Max-Age' 600;
            add_header 'Content-Type' 'text/plain charset=UTF-8';
            add_header 'Content-Length' 0;
            return 204;
        }
    }
}
```

CORS Security Best Practices

Development Environment:
✅ DO:
- Allow localhost origins (http://localhost:5173, http://127.0.0.1:5173)
- Use specific ports, not wildcards
- Enable credentials: true for authentication

❌ DON'T:
- Use allow_origins=["*"] with credentials=True (not allowed by browsers)
- Forget to include 127.0.0.1 variants
- Use production origins in development config

Production Environment:
✅ DO:
- Use specific domain names only (https://yourdomain.com)
- Use HTTPS (never HTTP in production)
- Whitelist only necessary origins
- Use environment variables for origin configuration
- Set max_age for preflight caching (reduces requests)

❌ DON'T:
- Use allow_origins=["*"] in production
- Allow HTTP origins in production
- Include development origins (localhost)
- Expose sensitive headers unnecessarily

Frontend Configuration

API Base URL Configuration:
```typescript
// src/config/api.config.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const apiConfig = {
  baseURL: API_BASE_URL,
  timeout: 10000,
  withCredentials: true,  // Required if backend allows credentials
};
```

Axios Configuration with Credentials:
```typescript
// src/services/api.ts
import axios from 'axios';
import { apiConfig } from '../config/api.config';

const api = axios.create({
  baseURL: apiConfig.baseURL,
  timeout: apiConfig.timeout,
  withCredentials: apiConfig.withCredentials,  // Send cookies/auth
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
```

Environment Variables (.env):
```bash
# Development
VITE_API_BASE_URL=http://localhost:8000

# Production
VITE_API_BASE_URL=https://api.yourdomain.com
```

CORS Troubleshooting

Common CORS Errors and Solutions:

1. "No 'Access-Control-Allow-Origin' header is present"
   - Cause: Backend not configured with CORS middleware
   - Solution: Add CORSMiddleware to backend with correct origins

2. "The 'Access-Control-Allow-Origin' header contains multiple values"
   - Cause: Both backend and proxy (Nginx) adding CORS headers
   - Solution: Only add CORS headers in ONE place (prefer backend)

3. "Credentials flag is 'true', but 'Access-Control-Allow-Origin' is '*'"
   - Cause: Cannot use wildcard (*) with credentials
   - Solution: Specify exact origins when using credentials=True

4. "Method not allowed in Access-Control-Allow-Methods"
   - Cause: Backend CORS config doesn't allow specific HTTP method
   - Solution: Add method to allow_methods list (e.g., PATCH, DELETE)

5. "Request header field X is not allowed by Access-Control-Allow-Headers"
   - Cause: Custom header not allowed
   - Solution: Add header to allow_headers or use ["*"]

CORS Preflight Requests:
- Browsers send OPTIONS request before actual request (preflight)
- Preflight checks if actual request is allowed
- Backend must respond to OPTIONS with 200/204 and CORS headers
- Use max_age to cache preflight responses and reduce requests

CORS Testing Checklist:
Before deployment:
- [ ] Backend CORS middleware configured with correct origins
- [ ] Environment-specific origins (dev vs prod)
- [ ] Credentials enabled if using authentication
- [ ] All required HTTP methods allowed
- [ ] Preflight requests handled (OPTIONS)
- [ ] Frontend withCredentials set correctly
- [ ] API base URL uses environment variables
- [ ] Test with actual frontend (not just Postman/curl)
- [ ] Test authentication flow end-to-end
- [ ] No wildcard (*) in production with credentials

Docker Development Setup:
When using Docker Compose with separate frontend/backend containers:
```yaml
# docker-compose.yml
services:
  api:
    environment:
      - CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
      - ENVIRONMENT=development

  user-portal:
    environment:
      - VITE_API_BASE_URL=http://localhost:8000
    ports:
      - "5173:5173"
```

For complete CORS configuration examples, see: Docs/1-Main-Documentation/UI-Standards.md

REMEMBER: CORS errors mean your backend is not configured to accept requests from your frontend origin. Fix CORS on the backend, not the frontend!

⚠️ Important Notes

Test your code - No feature is complete without tests
Performance testing - ALWAYS include performance tests in system testing
Documentation is complete only when both code AND documentation are updated
Security is mandatory - Code with security vulnerabilities will be rejected
Consistency is key - Follow these standards without exception
CORS configuration - ALWAYS configure CORS when frontend and backend are separate
