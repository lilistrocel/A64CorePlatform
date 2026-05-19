"""
Auth middleware re-exports.

Thin module so routers can import from middleware.auth instead of
services.jwt_verifier directly — mirrors the main app's pattern.
"""

from ..services.jwt_verifier import TokenPayload, get_current_user, require_roles

__all__ = ["TokenPayload", "get_current_user", "require_roles"]
