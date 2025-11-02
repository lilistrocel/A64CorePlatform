# Backend Development Agent Rules

**Specialization:** Python/FastAPI, Node.js, security, database operations
**Prerequisites:** Must follow `00-core-philosophy.md`

---

## CRITICAL: MCP Tool Usage for Backend Work

**MANDATORY: ALL backend testing and database verification MUST use MCP tools.**

### When to Use MCP Tools

**ALWAYS use mongosh (TEMPORARY WORKAROUND) for:**
- ⚠️ **CRITICAL:** MongoDB MCP is currently broken (connection doesn't persist)
- ✅ Use mongosh via Bash for database verification
- ✅ Pattern: `mongosh --eval "db.collection.find()" mongodb://localhost:27017/a64core_db --quiet`
- ✅ Verifying database operations after implementation
- ✅ Testing database queries
- ✅ Inspecting collection schemas
- ✅ Checking data integrity
- ✅ Performance testing queries
- ❌ NEVER use mongo shell interactive mode or pymongo print statements
- 📝 NOTE: Will switch to MongoDB MCP when connection persistence is fixed

**ALWAYS use Playwright MCP for:**
- ✅ Testing API endpoints (instead of curl)
- ✅ Verifying API responses
- ✅ Testing authentication flows
- ✅ Checking CORS configuration
- ❌ NEVER use curl, wget, or Postman screenshots

### Backend Testing Workflow

1. **Implement API Endpoint/Database Operation**
   - Write FastAPI route
   - Implement business logic
   - Add database operations

2. **Test with MCP Tools** (MANDATORY)
   - **mongosh (via Bash)**: Verify database state (TEMPORARY until MongoDB MCP fixed)
   - **Playwright MCP**: Test API endpoint
   - Check for errors and edge cases

3. **Verify Complete Flow**
   - Test authentication (Playwright MCP)
   - Verify data persistence (mongosh via Bash)
   - Check authorization rules

---

## Python Import Standards

### Absolute vs Relative Imports

**ALWAYS use absolute imports from project root:**

```python
# ✅ CORRECT
from src.models.user import UserCreate
from src.services.database import get_db
from src.api.v1.auth import router

# ❌ WRONG - Relative imports
from ..models.user import UserCreate
from ...services.database import get_db
```

### Why Absolute Imports?

- Prevents `ModuleNotFoundError`
- Works regardless of execution context
- Clearer dependency structure
- Easier to refactor

### Project Structure for Imports

```
src/
├── __init__.py          # Makes src a package
├── models/
│   ├── __init__.py
│   └── user.py
├── services/
│   ├── __init__.py
│   └── database.py
└── api/
    ├── __init__.py
    └── v1/
        ├── __init__.py
        └── auth.py
```

### Running Python with Absolute Imports

```bash
# ✅ CORRECT - Run from project root
python -m src.main
python -m src.api.server

# ❌ WRONG - Running file directly breaks imports
python src/main.py
```

---

## FastAPI Standards

### Route Structure

```python
from fastapi import APIRouter, Depends, HTTPException, status
from src.models.user import UserCreate, UserResponse
from src.services.auth import get_current_user

router = APIRouter(prefix="/api/v1/users", tags=["users"])

@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new user"""
    # Implementation
    pass
```

### Dependency Injection

```python
from fastapi import Depends
from src.services.database import get_db

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db = Depends(get_db)
) -> User:
    # Verify token and return user
    pass
```

### Error Handling

```python
from fastapi import HTTPException, status

# Raise HTTP exceptions with clear messages
if not user:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="User not found"
    )

if not authorized:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Insufficient permissions"
    )
```

---

## Pydantic Models

### Model Definition

```python
from pydantic import BaseModel, Field, EmailStr, validator
from typing import Optional
from datetime import datetime
from uuid import UUID

class UserCreate(BaseModel):
    """User creation schema"""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, description="User password")
    full_name: Optional[str] = Field(None, max_length=200)

    @validator('password')
    def validate_password(cls, v):
        if not any(char.isdigit() for char in v):
            raise ValueError('Password must contain at least one digit')
        return v

class UserResponse(BaseModel):
    """User response schema (no password)"""
    id: UUID
    email: EmailStr
    full_name: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True  # Pydantic v2
```

### Model Validation

- Use Pydantic validators for complex validation
- Never return sensitive data (passwords, tokens) in responses
- Always validate input data
- Use appropriate field types (EmailStr, UUID, etc.)

---

## Database Operations with MongoDB

### Database Connection

```python
from motor.motor_asyncio import AsyncIOMotorClient
from src.config import settings

class Database:
    client: AsyncIOMotorClient = None
    db = None

db = Database()

async def get_db():
    return db.db

async def connect_to_mongo():
    db.client = AsyncIOMotorClient(settings.MONGODB_URL)
    db.db = db.client[settings.DB_NAME]

async def close_mongo_connection():
    db.client.close()
```

### CRUD Operations

```python
async def create_user(user_data: UserCreate, db) -> User:
    """Create a new user"""
    user_dict = user_data.dict()
    user_dict['created_at'] = datetime.utcnow()

    result = await db.users.insert_one(user_dict)

    # CRITICAL: Use mongosh to verify insertion (TEMPORARY until MongoDB MCP fixed)
    # Agent will use: mongosh --eval 'db.users.find({_id: ObjectId("...")}).toArray()' \
    #   mongodb://localhost:27017/a64core_db --quiet

    return await get_user_by_id(result.inserted_id, db)
```

### Testing Database Operations with mongosh (TEMPORARY)

**MANDATORY workflow after implementing database operations:**

```python
# After implementing create_user function:

# 1. Test the endpoint (use Playwright MCP)
# 2. Verify database state (use mongosh via Bash)
#    mongosh --eval 'db.users.find({email: "test@example.com"}).toArray()' \
#      mongodb://localhost:27017/a64core_db --quiet
# 3. Check document structure matches schema
# 4. Verify indexes are being used
#    mongosh --eval 'db.users.find({email: "test@example.com"}).explain()' \
#      mongodb://localhost:27017/a64core_db --quiet
```

---

## Security Standards

### Password Hashing

```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return pwd_context.verify(plain_password, hashed_password)
```

### JWT Tokens

```python
from jose import JWTError, jwt
from datetime import datetime, timedelta

def create_access_token(data: dict, expires_delta: timedelta = None):
    """Create JWT access token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
```

### Environment Variables

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """Application settings"""
    DATABASE_URL: str
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
```

**CRITICAL Security Rules:**
- ❌ NEVER hardcode secrets, API keys, or passwords
- ✅ ALWAYS use environment variables
- ✅ ALWAYS hash passwords before storage
- ✅ ALWAYS validate and sanitize input
- ✅ ALWAYS use parameterized queries (prevent SQL/NoSQL injection)

---

## API Testing with MCP Tools

### Testing Endpoints

**MANDATORY: Use Playwright MCP instead of curl:**

```
✅ CORRECT Workflow:
1. Implement POST /api/v1/users endpoint
2. Use Playwright MCP to test:
   - browser_navigate('http://localhost')
   - browser_evaluate(fetch POST request)
   - Check response status and body
3. Use MongoDB MCP to verify user was created:
   - mcp__mongodb__find({"email": "test@example.com"})
4. Verify all fields are correct

❌ WRONG Workflow:
1. Implement endpoint
2. Run: curl -X POST http://localhost/api/v1/users
3. Look at response
4. Manually check database with mongo shell
```

### Why Playwright MCP for API Testing?

- Shows actual HTTP request/response
- Captures CORS headers
- Reveals authentication issues
- Provides network timing information
- Tests from browser perspective (how frontend will use it)

---

## Authentication & Authorization

### JWT Authentication

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db = Depends(get_db)
) -> User:
    """Get current authenticated user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = await get_user_by_id(user_id, db)
    if user is None:
        raise credentials_exception

    return user
```

### Permission Checking

```python
from functools import wraps

def require_permission(permission: str):
    """Decorator to check user permission"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, current_user: User = None, **kwargs):
            if permission not in current_user.permissions:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Missing required permission: {permission}"
                )
            return await func(*args, current_user=current_user, **kwargs)
        return wrapper
    return decorator

@router.post("/admin-only")
@require_permission("admin")
async def admin_endpoint(current_user: User = Depends(get_current_user)):
    pass
```

### Testing Authentication with MCP Tools

**Complete auth flow testing:**

```
1. Implement login endpoint
2. Use Playwright MCP:
   - Navigate to login page
   - Fill credentials
   - Submit form
   - Capture JWT token from response
3. Use mongosh (TEMPORARY):
   - Verify user session/refresh token created
     mongosh --eval 'db.sessions.find({userId: "..."}).toArray()' \
       mongodb://localhost:27017/a64core_db --quiet
   - Check token expiry
4. Test protected endpoint:
   - Use Playwright with JWT header
   - Verify access granted
5. Test without token:
   - Verify 401 Unauthorized response
```

---

## Error Handling

### Custom Exceptions

```python
class UserNotFoundError(Exception):
    """Raised when user is not found"""
    pass

class InsufficientPermissionsError(Exception):
    """Raised when user lacks required permissions"""
    pass
```

### Exception Handlers

```python
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(UserNotFoundError)
async def user_not_found_handler(request: Request, exc: UserNotFoundError):
    return JSONResponse(
        status_code=404,
        content={"detail": str(exc)}
    )
```

### Logging

```python
import logging

logger = logging.getLogger(__name__)

@router.post("/users")
async def create_user(user_data: UserCreate):
    try:
        user = await create_user_in_db(user_data)
        logger.info(f"Created user: {user.email}")

        # Verify with mongosh (TEMPORARY until MongoDB MCP fixed)
        # mongosh --eval 'db.users.find({email: "..."}).toArray()' \
        #   mongodb://localhost:27017/a64core_db --quiet

        return user
    except Exception as e:
        logger.error(f"Failed to create user: {str(e)}")
        raise
```

---

## Performance Optimization

### Database Indexing

```python
# Create indexes for frequently queried fields
await db.users.create_index("email", unique=True)
await db.users.create_index([("created_at", -1)])

# Compound indexes
await db.users.create_index([("role", 1), ("is_active", 1)])
```

**CRITICAL: Verify index usage with mongosh (TEMPORARY):**
```bash
# Use mongosh to run explain() on queries
mongosh --eval 'db.users.find({email: "test@test.com"}).explain("executionStats")' \
  mongodb://localhost:27017/a64core_db --quiet

# Verify indexes are being used (look for IXSCAN not COLLSCAN)
# Check query performance (executionTimeMillis)
# Identify missing indexes
```

### Async Operations

```python
# ✅ CORRECT - Async database operations
async def get_users(db):
    users = await db.users.find().to_list(100)
    return users

# ❌ WRONG - Blocking operations
def get_users(db):
    users = db.users.find()  # Blocks event loop
    return list(users)
```

---

## Testing Backend Code

### Unit Testing

```python
import pytest
from httpx import AsyncClient
from src.main import app

@pytest.mark.asyncio
async def test_create_user():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/users",
            json={"email": "test@example.com", "password": "Test123!"}
        )

    assert response.status_code == 201

    # CRITICAL: Use mongosh to verify (TEMPORARY until MongoDB MCP fixed)
    # Agent uses: mongosh --eval 'db.users.find({email: "test@example.com"}).toArray()' \
    #   mongodb://localhost:27017/a64core_db --quiet
```

### Integration Testing with MCP Tools

**Complete workflow testing:**

```
1. Create test user (API endpoint)
2. Verify user in database (mongosh via Bash - TEMPORARY)
3. Login with user (Playwright MCP)
4. Access protected resource (Playwright MCP)
5. Verify authorization (mongosh via Bash - TEMPORARY)
6. Clean up test data (mongosh via Bash - TEMPORARY)
```

---

## Backend Development Checklist

Before considering an endpoint complete:
- [ ] Pydantic models defined for request/response
- [ ] Input validation implemented
- [ ] Authentication/authorization added
- [ ] Error handling implemented
- [ ] Logging added for debugging
- [ ] **Tested with Playwright MCP** (MANDATORY)
- [ ] **Database operations verified with mongosh** (MANDATORY - TEMPORARY until MongoDB MCP fixed)
- [ ] Security review completed (no hardcoded secrets)
- [ ] Performance optimized (indexes, async operations)
- [ ] API documentation updated

---

## Common Backend Pitfalls

### 1. Import Errors
❌ Using relative imports
✅ Use absolute imports from project root

### 2. Blocking Operations
❌ Using synchronous database calls in async functions
✅ Always use async/await for I/O operations

### 3. Security Issues
❌ Storing plain text passwords
✅ Always hash passwords with bcrypt

### 4. Not Testing with MCP Tools
❌ Using curl and print statements
✅ ALWAYS use Playwright MCP and mongosh (TEMPORARY workaround)

### 5. Missing Error Handling
❌ Not handling database errors
✅ Wrap operations in try-except, log errors

---

## Remember: MCP Tools Are Mandatory

**CRITICAL Rules:**
1. ⚠️ TEMPORARILY use mongosh to verify database operations (MongoDB MCP broken)
2. ✅ ALWAYS use Playwright MCP to test API endpoints
3. ❌ NEVER use mongo shell interactive mode or pymongo print statements
4. ❌ NEVER use curl/wget for API testing
5. ❌ NEVER skip verification for "simple changes"

**Why these tools matter:**
- mongosh provides clean, structured query results (TEMPORARY until MongoDB MCP fixed)
- Playwright MCP tests APIs as browsers use them
- Both provide debugging capabilities
- Ensures data integrity
- Catches issues early

**NOTE:** Once MongoDB MCP connection persistence is fixed, switch from mongosh to MongoDB MCP tools.

---

**Last Updated:** 2025-11-01
**Version:** 1.0.0
