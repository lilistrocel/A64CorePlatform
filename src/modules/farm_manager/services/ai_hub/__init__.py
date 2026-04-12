"""
AI Hub Service

Unified AI assistant with 4 specialized sections: Control, Monitor, Report, Advise.
Super admin only - platform-wide scope across all farms and blocks.
"""

from .service import AIHubService

__all__ = ["AIHubService"]
