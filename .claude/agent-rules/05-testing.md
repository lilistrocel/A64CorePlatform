# Testing Agent Rules

**Specialization:** Unit testing, integration testing, performance testing, UI testing
**Prerequisites:** Must follow `00-core-philosophy.md`

---

## CRITICAL: MCP Tool Usage for Testing

**MANDATORY: ALL testing and verification MUST use MCP tools when available.**

### Testing with Playwright MCP

**ALWAYS use Playwright MCP for:**
- Frontend UI component testing
- User flow testing
- API endpoint verification
- Browser behavior validation
- Visual regression testing
- Integration testing involving the browser

**Example:**
```
✅ CORRECT: Use mcp__playwright__browser_navigate, browser_click, browser_snapshot
❌ WRONG: Use curl to test API, manual browser testing, screenshots
```

### Database Testing with mongosh (TEMPORARY WORKAROUND)

**ALWAYS use mongosh via Bash for:**
- ⚠️ **CRITICAL:** MongoDB MCP is currently broken (connection doesn't persist)
- ✅ Verifying database state
- ✅ Testing database operations
- ✅ Checking query results
- ✅ Validating data integrity
- ✅ Performance testing queries
- 📝 NOTE: Will switch to MongoDB MCP when connection persistence is fixed

**Example:**
```bash
✅ CORRECT:
mongosh --eval 'db.collection.find().toArray()' \
  mongodb://localhost:27017/a64core_db --quiet

mongosh --eval 'db.collection.aggregate([...]).toArray()' \
  mongodb://localhost:27017/a64core_db --quiet

mongosh --eval 'db.collection.countDocuments()' \
  mongodb://localhost:27017/a64core_db --quiet

❌ WRONG: Use pymongo with print statements, mongo shell interactive mode
```

---

## Test Strategy

### Unit Tests
- Test individual functions and methods in isolation
- Mock external dependencies
- Aim for 80%+ code coverage
- Fast execution (< 100ms per test)

### Integration Tests
- Test component interactions
- Use real database (test environment)
- **MUST use mongosh** to verify database state (TEMPORARY until MongoDB MCP fixed)
- Test API endpoints with **Playwright MCP**

### End-to-End Tests
- Test complete user workflows
- **MUST use Playwright MCP** for all browser interactions
- Verify data flow from UI to database
- Test authentication and authorization flows

### Performance Tests
- Benchmark API response times
- Load test critical endpoints
- **Use mongosh** to verify database performance (TEMPORARY until MongoDB MCP fixed)
- **Use Playwright MCP** to measure frontend performance

---

## Testing Best Practices

### Before Writing Tests
1. Read existing test files to understand patterns
2. Identify what needs testing (coverage gaps)
3. Choose appropriate test type (unit/integration/e2e)
4. **Determine if MCP tools are needed** (almost always yes)

### Writing Tests
1. Use descriptive test names
2. Follow AAA pattern: Arrange, Act, Assert
3. **Use MCP tools for verification** when available
4. Keep tests independent and isolated
5. Clean up test data after each test

### Test Organization
```
tests/
├── unit/           # Unit tests
├── integration/    # Integration tests
├── e2e/            # End-to-end tests (use Playwright MCP)
└── performance/    # Performance tests
```

---

## Backend Testing (Python/FastAPI)

### Test Structure
```python
import pytest
from fastapi.testclient import TestClient

def test_endpoint_name():
    """Test description"""
    # Arrange
    client = TestClient(app)
    test_data = {"key": "value"}

    # Act
    response = client.post("/api/v1/endpoint", json=test_data)

    # Assert
    assert response.status_code == 201

    # CRITICAL: Use mongosh to verify database state (TEMPORARY until MongoDB MCP fixed)
    # mongosh --eval 'db.collection.find({...}).toArray()' \
    #   mongodb://localhost:27017/a64core_db --quiet
    # NOT: db.collection.find_one() with print
```

### Fixtures
- Use pytest fixtures for common setup
- Clean up resources in fixture teardown
- **Use mongosh** in fixtures to verify state (TEMPORARY until MongoDB MCP fixed)

---

## Frontend Testing (React/TypeScript)

### Component Testing
```typescript
import { render, screen } from '@testing-library/react'

test('component renders correctly', () => {
  render(<Component />)
  const element = screen.getByText('Expected Text')
  expect(element).toBeInTheDocument()
})
```

### Integration Testing with Playwright MCP
**MANDATORY for testing:**
- User interactions (clicks, form submissions)
- API integration
- Navigation flows
- Visual changes

**Example workflow:**
1. Use `browser_navigate` to load page
2. Use `browser_click` to interact
3. Use `browser_snapshot` to verify state
4. Use mongosh to verify backend data (TEMPORARY until MongoDB MCP fixed)

---

## API Testing

### Testing API Endpoints

**ALWAYS use Playwright MCP for API testing:**

```
✅ CORRECT Workflow:
1. mcp__playwright__browser_navigate(url)
2. mcp__playwright__browser_evaluate(fetch API call)
3. mcp__playwright__browser_console_messages() to check response
4. mongosh --eval 'db.collection.find().toArray()' to verify database state (TEMPORARY)

❌ WRONG Workflow:
1. curl http://localhost/api/endpoint
2. Print response
3. Manually check database with mongo shell interactive mode
```

### Why Playwright MCP for API Testing?
- Captures full request/response cycle
- Shows network timing
- Reveals CORS issues
- Displays actual browser behavior
- Provides console logs and errors

---

## Database Testing

### Testing Database Operations

**MANDATORY: Use mongosh for all database verification (TEMPORARY):**

**Correct approach:**
```python
def test_user_creation():
    # Act
    response = client.post("/api/v1/users", json=user_data)

    # Assert with mongosh (TEMPORARY until MongoDB MCP fixed)
    # Agent uses:
    # mongosh --eval 'db.users.find({email: "test@test.com"}).toArray()' \
    #   mongodb://localhost:27017/a64core_db --quiet
    # Verifies: Document exists with correct fields
```

**Wrong approach:**
```python
def test_user_creation():
    # Act
    response = client.post("/api/v1/users", json=user_data)

    # ❌ WRONG: Direct database query with print
    user = db.users.find_one({"email": "test@test.com"})
    print(user)  # This doesn't provide structured verification
```

---

## Performance Testing

### Backend Performance
- Use pytest-benchmark for Python
- Measure response times
- **Use mongosh** to verify query performance with explain() (TEMPORARY until MongoDB MCP fixed)

### Frontend Performance
- **Use Playwright MCP** to measure page load times
- Monitor network requests
- Check for performance regressions

### Load Testing
- Use locust or k6 for load testing
- **Verify database performance with mongosh** (TEMPORARY until MongoDB MCP fixed)
- Monitor system resources

---

## Pre-Deployment Testing Checklist

Before any deployment:
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] **All tests using MCP tools complete successfully**
- [ ] Performance benchmarks meet requirements
- [ ] No security vulnerabilities detected
- [ ] Test coverage meets minimum threshold (80%)
- [ ] **Database state verified with mongosh** (TEMPORARY until MongoDB MCP fixed)
- [ ] **UI flows tested with Playwright MCP**

---

## Test Coverage

### Minimum Coverage Requirements
- Critical paths: 100%
- Business logic: 90%
- API endpoints: 85%
- Overall: 80%

### Measuring Coverage
```bash
# Python/FastAPI
pytest --cov=src --cov-report=html

# TypeScript/React
npm run test:coverage
```

---

## Continuous Integration

### CI Pipeline Testing
1. Run unit tests (fast feedback)
2. Run integration tests (with MCP tools)
3. Run e2e tests (Playwright MCP)
4. Check coverage thresholds
5. Run performance tests
6. Generate test reports

---

## Common Testing Patterns

### Testing Authentication
**MUST use Playwright MCP:**
1. Navigate to login page
2. Fill credentials
3. Submit form
4. Verify redirect
5. **Use mongosh** to verify session/token (TEMPORARY until MongoDB MCP fixed)

### Testing CRUD Operations
**Workflow:**
1. Create: Test with Playwright MCP, verify with mongosh (TEMPORARY)
2. Read: Test API, verify UI rendering
3. Update: Test form submission, verify database with mongosh (TEMPORARY)
4. Delete: Test deletion, verify removal from database with mongosh (TEMPORARY)

### Testing Error Handling
- Test invalid inputs
- Test authentication failures
- Test authorization errors
- Verify error messages in UI (Playwright MCP)
- Verify error logging in database (mongosh - TEMPORARY until MongoDB MCP fixed)

---

## Debugging Failed Tests

### When Tests Fail

1. **Check tool outputs first**
   - Playwright MCP: Check screenshots, console logs, network requests
   - mongosh: Check query results, explain plans (TEMPORARY until MongoDB MCP fixed)

2. **Review test logs**
   - Look for assertion errors
   - Check for timing issues
   - Verify test data

3. **Reproduce manually with tools**
   - Use Playwright MCP to step through the flow
   - Use mongosh to inspect database state (TEMPORARY until MongoDB MCP fixed)

---

## Remember

**CRITICAL Tool Rules:**
1. ✅ ALWAYS use Playwright MCP for UI/API testing
2. ⚠️ TEMPORARILY use mongosh for database verification (MongoDB MCP broken)
3. ❌ NEVER use curl/wget for API testing
4. ❌ NEVER use mongo shell interactive mode or print statements
5. ❌ NEVER skip verification for "quick tests"

**These tools provide:**
- Better visibility into what's happening
- Structured, verifiable results
- Debugging capabilities
- Consistent testing approach

**NOTE:** Once MongoDB MCP connection persistence is fixed, switch from mongosh to MongoDB MCP tools.

---

**Last Updated:** 2025-11-01
**Version:** 1.0.0
