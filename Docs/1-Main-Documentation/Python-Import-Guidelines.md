# Python Import Guidelines for A64 Core Platform

## Overview
This document provides comprehensive guidelines to prevent import issues in Python projects with a `src/` package structure.

---

## Table of Contents
1. [Project Structure](#project-structure)
2. [Import Rules](#import-rules)
3. [Common Mistakes](#common-mistakes)
4. [Solutions](#solutions)
5. [Testing Imports](#testing-imports)
6. [Troubleshooting](#troubleshooting)

---

## Project Structure

Our project uses a **src layout** where all application code lives in the `src/` directory:

```
A64CorePlatform/
├── src/                    # Main package
│   ├── __init__.py        # Makes src a package
│   ├── main.py            # Entry point
│   ├── api/               # API routes
│   │   ├── __init__.py
│   │   ├── health.py
│   │   ├── routes.py
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── auth.py
│   │       └── users.py
│   ├── config/
│   │   ├── __init__.py
│   │   └── settings.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── database.py
│   │   ├── auth_service.py
│   │   └── user_service.py
│   ├── middleware/
│   ├── models/
│   └── utils/
├── tests/
├── Dockerfile
└── requirements.txt
```

---

## Import Rules

### Rule 1: Always Use Relative Imports Within src/

**Why:** Relative imports work regardless of how the package is installed or where Python is run from.

#### Examples by Location:

**In `src/main.py` (root of package):**
```python
# ✅ Correct - relative import from same level
from .api import health
from .api.routes import api_router
from .config.settings import settings
from .services.database import mongodb, mysql
```

**In `src/api/routes.py` (one level deep):**
```python
# ✅ Correct - relative import from sibling (same level)
from .v1 import auth, users

# ✅ Correct - relative import from parent's sibling
from ..services.database import mongodb
```

**In `src/api/v1/auth.py` (two levels deep):**
```python
# ✅ Correct - go up two levels to reach src/, then down
from ...models.user import UserCreate, UserResponse
from ...services.auth_service import AuthService
from ...middleware.auth import get_current_user
```

### Rule 2: Relative Import Patterns

| Your Location | Import From | Pattern | Example |
|--------------|-------------|---------|---------|
| `src/main.py` | `src/api/` | `.api` | `from .api import health` |
| `src/api/routes.py` | `src/api/v1/` | `.v1` | `from .v1 import auth` |
| `src/api/routes.py` | `src/services/` | `..services` | `from ..services import database` |
| `src/api/v1/auth.py` | `src/models/` | `...models` | `from ...models import user` |
| `src/services/auth.py` | `src/utils/` | `..utils` | `from ..utils import security` |
| `src/services/auth.py` | `src/services/database.py` | `.database` | `from .database import mongodb` |

**Pattern Explanation:**
- `.` = Current directory
- `..` = Parent directory (one level up)
- `...` = Grandparent directory (two levels up)
- `....` = Great-grandparent (three levels up) - rarely needed

---

## Common Mistakes

### ❌ Mistake 1: Absolute Imports
```python
# ❌ WRONG - This assumes 'api' is in PYTHONPATH
from api.v1 import auth
from services.database import mongodb
from models.user import UserCreate
```

**Why it fails:** Python can't find `api`, `services`, or `models` unless they're in PYTHONPATH.

**✅ Fix:**
```python
# ✅ CORRECT - Relative imports always work
from .v1 import auth              # if in api/
from ..services.database import mongodb
from ..models.user import UserCreate
```

---

### ❌ Mistake 2: Wrong Number of Dots
```python
# In src/api/v1/auth.py

# ❌ WRONG - Only goes up one level (to api/)
from ..models.user import UserCreate  # Can't find models in api/

# ✅ CORRECT - Goes up two levels (to src/)
from ...models.user import UserCreate
```

---

### ❌ Mistake 3: Missing __init__.py Files
```python
# If src/api/__init__.py doesn't exist, this fails:
from .api import health
```

**✅ Fix:** Ensure every directory has an `__init__.py` file.

---

### ❌ Mistake 4: Running Python from Wrong Directory
```bash
# ❌ WRONG - Running from src/ directory
cd src
python main.py  # Relative imports will fail!

# ✅ CORRECT - Run as a module from project root
cd A64CorePlatform
python -m src.main  # Imports work correctly
```

---

## Solutions

### Solution 1: Ensure All Directories Have __init__.py

**Create __init__.py in every package directory:**

```bash
# Windows
type nul > src\__init__.py
type nul > src\api\__init__.py
type nul > src\api\v1\__init__.py
type nul > src\config\__init__.py
type nul > src\services\__init__.py
type nul > src\middleware\__init__.py
type nul > src\models\__init__.py
type nul > src\utils\__init__.py

# Linux/Mac
touch src/__init__.py
touch src/api/__init__.py
touch src/api/v1/__init__.py
touch src/config/__init__.py
touch src/services/__init__.py
touch src/middleware/__init__.py
touch src/models/__init__.py
touch src/utils/__init__.py
```

---

### Solution 2: Update Dockerfile for Correct Python Path

**In Dockerfile:**
```dockerfile
# Set working directory
WORKDIR /app

# Copy application code
COPY src/ ./src/

# Run application as a module (not a script)
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Key:** Run as `src.main:app` (module notation), not `src/main.py` (file notation).

---

### Solution 3: Configure pytest for Tests

**In `pytest.ini` or `pyproject.toml`:**
```ini
[pytest]
pythonpath = .
testpaths = tests
```

This ensures pytest can import from `src/` when running tests.

---

### Solution 4: Use IDE Configuration

**VS Code - `.vscode/settings.json`:**
```json
{
  "python.analysis.extraPaths": ["${workspaceFolder}/src"],
  "python.autoComplete.extraPaths": ["${workspaceFolder}/src"]
}
```

**PyCharm:**
- Right-click `src/` → Mark Directory as → Sources Root

---

## Testing Imports

### Quick Test Script

Create `tests/test_imports.py`:

```python
"""Test that all imports work correctly"""
import pytest

def test_api_imports():
    """Test API module imports"""
    from src.api import health
    from src.api.routes import api_router
    assert health is not None
    assert api_router is not None

def test_service_imports():
    """Test service module imports"""
    from src.services.database import mongodb, mysql
    assert mongodb is not None
    assert mysql is not None

def test_model_imports():
    """Test model imports"""
    from src.models.user import UserCreate, UserResponse
    assert UserCreate is not None
    assert UserResponse is not None

def test_nested_imports():
    """Test deeply nested imports"""
    from src.api.v1.auth import router as auth_router
    from src.api.v1.users import router as users_router
    assert auth_router is not None
    assert users_router is not None

if __name__ == "__main__":
    # Run tests
    test_api_imports()
    test_service_imports()
    test_model_imports()
    test_nested_imports()
    print("✅ All imports working correctly!")
```

**Run:**
```bash
python -m pytest tests/test_imports.py
# or
python tests/test_imports.py
```

---

## Troubleshooting

### Problem 1: "ModuleNotFoundError: No module named 'api'"

**Cause:** Using absolute imports instead of relative imports.

**Solution:**
```python
# Change this:
from api.v1 import auth

# To this:
from .v1 import auth  # if in api/
# or
from ..api.v1 import auth  # if outside api/
```

---

### Problem 2: "ImportError: attempted relative import with no known parent package"

**Cause:** Running Python file directly instead of as a module.

**Solution:**
```bash
# ❌ Don't do this:
python src/main.py

# ✅ Do this:
python -m src.main
```

---

### Problem 3: "ImportError: cannot import name 'X' from 'src.api.routes'"

**Cause:** Trying to import something that doesn't exist in that module.

**Solution:** Check what the module exports:
```python
# In src/api/routes.py, check what's defined/exported
# Make sure you're importing the right thing

# If routes.py exports api_router but not health:
from .api.routes import api_router  # ✅ Works
from .api.routes import health       # ❌ Fails

# Import health from the correct module:
from .api import health              # ✅ Works
```

---

### Problem 4: Circular Imports

**Cause:** Two modules import from each other.

**Example:**
```python
# services/auth.py
from models.user import User  # Imports User

# models/user.py
from services.auth import hash_password  # Imports hash_password
# ❌ Circular dependency!
```

**Solutions:**

1. **Move shared code to a third module:**
```python
# utils/security.py
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password, bcrypt.gensalt())

# models/user.py
from utils.security import hash_password

# services/auth.py
from models.user import User
from utils.security import hash_password
```

2. **Use TYPE_CHECKING for type hints:**
```python
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from services.auth import AuthService

def some_function(auth: 'AuthService'):
    ...
```

3. **Import inside functions (lazy import):**
```python
def some_function():
    from services.auth import AuthService  # Import only when needed
    ...
```

---

## Best Practices Checklist

Before committing code, verify:

- [ ] All directories have `__init__.py` files
- [ ] All imports use relative imports (`.`, `..`, `...`)
- [ ] No absolute imports like `from api import ...`
- [ ] Code runs correctly with `python -m src.main`
- [ ] Docker CMD uses module notation: `python -m uvicorn src.main:app`
- [ ] Import test script passes: `python tests/test_imports.py`
- [ ] No circular import dependencies
- [ ] IDE recognizes `src/` as a package (marked as source root)

---

## Quick Reference Card

| Scenario | Import Pattern | Example |
|----------|---------------|---------|
| Same directory | `.module` | `from .database import mongodb` |
| Subdirectory | `.subdir.module` | `from .v1.auth import router` |
| Parent directory | `..module` | `from ..config import settings` |
| Parent's sibling | `..sibling.module` | `from ..services.database import mongodb` |
| Grandparent | `...module` | `from ...models.user import User` |

---

## Tools to Help

### 1. isort - Auto-organize imports
```bash
pip install isort
isort src/ --profile black
```

### 2. pylint - Check import issues
```bash
pip install pylint
pylint src/
```

### 3. mypy - Static type checking (catches import errors)
```bash
pip install mypy
mypy src/
```

### 4. flake8 - Style and import linting
```bash
pip install flake8
flake8 src/
```

---

## Summary

**Golden Rules:**
1. ✅ Always use relative imports within `src/`
2. ✅ Every directory must have `__init__.py`
3. ✅ Run as module: `python -m src.main`
4. ✅ Docker: Use `python -m uvicorn src.main:app`
5. ✅ Test imports before committing

**Never:**
- ❌ Use absolute imports like `from api import ...`
- ❌ Run files directly: `python src/main.py`
- ❌ Forget `__init__.py` files
- ❌ Create circular dependencies

---

**Last Updated:** 2025-10-16
**Version:** 1.0.0
**Status:** ✅ Mandatory for all development
