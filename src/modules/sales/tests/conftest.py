"""
conftest.py for Sales module tests.

The sales module's services/__init__.py re-exports OrderService, which triggers
the full ops-app import chain (passlib, redis, python-jose) at collection time.
These packages are not installed in the local dev environment — they live inside
the Docker container.

This conftest stubs out ONLY the missing third-party packages and the specific
app modules that are unreachable without them.  It does NOT stub any
``src.core.*`` or ``src.modules.*`` paths — those must stay real so that
``src.core.documents`` remains importable.

Strategy
--------
1. Stub missing third-party packages (passlib, jose, redis, aiofiles).
2. Stub the specific app modules that import those packages directly.
3. Register stubs BEFORE any test module is collected by pytest.

This is safe because:
- ``quote_service.py`` only imports from ``src.core.documents.*`` and
  ``src.modules.sales.models.quotes`` — both are clean Python with no
  problematic transitive deps.
- The stubs are never used during test execution; they only satisfy the
  import-time dependency resolution in ``services/__init__.py``.
"""

from __future__ import annotations

import sys
from types import ModuleType
from unittest.mock import MagicMock


def _pkg_stub(dotted_name: str) -> MagicMock:
    """
    Create a package-like MagicMock stub and register it under dotted_name.

    Only registers if not already in sys.modules.  Returns the stub (or the
    existing entry if it was already registered).
    """
    if dotted_name in sys.modules:
        return sys.modules[dotted_name]  # type: ignore[return-value]

    stub = MagicMock()
    stub.__name__ = dotted_name
    stub.__path__ = [dotted_name]  # marks as a package for sub-import resolution
    stub.__package__ = dotted_name
    sys.modules[dotted_name] = stub
    return stub


# ---------------------------------------------------------------------------
# Step 1: Stub missing third-party packages.
#
# Register parent before child so Python does not try to load the real parent.
# We must NOT register "src", "src.core", or "src.modules" — those are real
# packages on disk and must remain real so that src.core.documents is usable.
# ---------------------------------------------------------------------------

_THIRD_PARTY = [
    "passlib",
    "passlib.context",
    "passlib.exc",
    "passlib.handlers",
    "passlib.handlers.bcrypt",
    "jose",
    "jose.jwt",
    "jose.exceptions",
    "redis",
    "redis.asyncio",
    "redis.asyncio.connection",
    "redis.exceptions",
    "aiofiles",
    "aiofiles.os",
]

for _name in _THIRD_PARTY:
    _pkg_stub(_name)

# ---------------------------------------------------------------------------
# Step 2: Stub the app-level modules that import those third-party packages.
#
# These are stubbed AFTER the third-party stubs so that if any of them try
# to import passlib/redis at the module body level, they resolve to our mock.
#
# IMPORTANT: Only stub leaf modules (e.g. src.utils.security) NOT their
# parent packages (src.utils, src.services) so that real sibling modules in
# those packages (e.g. src.utils.responses) still import correctly.
# ---------------------------------------------------------------------------

# src.utils.security imports passlib — stub it before src.utils is loaded.
_pkg_stub("src.utils.security")

# src.services.auth_service imports passlib + jose — stub it.
_pkg_stub("src.services.auth_service")

# src.core.cache.redis_cache imports redis.exceptions — stub it.
# Parent src.core.cache is also stubbed to prevent its __init__.py from
# running (which re-exports redis_cache).
_pkg_stub("src.core.cache.redis_cache")
_pkg_stub("src.core.cache")

# src.services.database imports src.services.auth_service transitively.
# Stub it and set a `mongodb` attribute so callers get a usable mock.
_db_stub = _pkg_stub("src.services.database")
_db_stub.mongodb = MagicMock()

# src.utils is a real package but its __init__.py exports from .security.
# Stub the entire src.utils to prevent that __init__ from running.
# (Real imports of e.g. src.utils.responses are not needed by quote tests.)
_pkg_stub("src.utils")

# src.services is a real package whose __init__ exports auth_service objects.
# Stub the package-level init to block that chain; individual modules under
# src.services that ARE needed (none in this test file) would need separate
# registration.
_pkg_stub("src.services")

# ---------------------------------------------------------------------------
# Step 3: Stubs required by the sales API layer (T-200.x and future tests)
#
# Tests that import from src.modules.sales.api.v1.* trigger Python to first
# import src/modules/sales/api/v1/__init__.py (the package initialiser),
# which in turn imports ALL routers including dashboard.py. dashboard.py
# imports from middleware/__init__.py → auth.py → sales config/settings.py.
# settings.py instantiates Settings() which reads pydantic_settings from
# the environment and fails with "Extra inputs not permitted" when
# non-declared env vars (ANTHROPIC_API_KEY, FINANCE_OUTBOX_ENABLED, etc.)
# are present.
#
# Strategy: stub the three modules that trigger the settings chain before
# any test imports the API layer. This prevents Settings() instantiation
# while keeping the pure data-model code (pydantic models, helpers,
# constants) importable.
#
# The stubs provide the minimal interface that the api/v1/__init__.py chain
# needs to complete its import without running real auth or DB code.
# ---------------------------------------------------------------------------

# Stub sales config/settings so Settings() is never instantiated from env
_sales_settings_module = _pkg_stub("src.modules.sales.config.settings")
_settings_mock = MagicMock()
_settings_mock.SECRET_KEY = "test-secret"
_settings_mock.ALGORITHM = "HS256"
_settings_mock.MONGODB_URL = "mongodb://localhost:27017"
_settings_mock.MONGODB_DB_NAME = "test"
_sales_settings_module.settings = _settings_mock

# Stub sales config package
_pkg_stub("src.modules.sales.config")

# Stub middleware/auth so require_permission and CurrentUser are importable
_sales_auth_module = _pkg_stub("src.modules.sales.middleware.auth")
_sales_auth_module.require_permission = MagicMock(return_value=MagicMock())
_sales_auth_module.get_current_active_user = MagicMock()
_sales_auth_module.get_current_user = MagicMock()
_sales_auth_module.CurrentUser = MagicMock

# Stub middleware package
_sales_middleware_module = _pkg_stub("src.modules.sales.middleware")
_sales_middleware_module.require_permission = _sales_auth_module.require_permission
_sales_middleware_module.get_current_active_user = (
    _sales_auth_module.get_current_active_user
)
_sales_middleware_module.get_current_user = _sales_auth_module.get_current_user
_sales_middleware_module.CurrentUser = _sales_auth_module.CurrentUser

# Stub sales database module so sales_db.get_database() is callable
_sales_db_module = _pkg_stub("src.modules.sales.services.database")
_sales_db_mock = MagicMock()
_sales_db_mock.get_database = MagicMock(return_value=MagicMock())
_sales_db_module.sales_db = _sales_db_mock
