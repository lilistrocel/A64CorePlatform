"""
System Health Checker - Internal health check (API, DB, Redis).
"""

import logging
from typing import List

import httpx

from ..models import WatchdogIssue, CheckType, Severity

logger = logging.getLogger(__name__)

HEALTH_URL = "http://localhost:8000/api/health"


class SystemHealthChecker:
    """Check internal system health endpoint."""

    def __init__(self, db):
        self.db = db

    async def run(self) -> List[WatchdogIssue]:
        """Hit the health endpoint and report failures."""
        issues: List[WatchdogIssue] = []

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(HEALTH_URL)

            if resp.status_code != 200:
                issues.append(WatchdogIssue(
                    checkType=CheckType.SYSTEM_HEALTH,
                    severity=Severity.CRITICAL,
                    title="API Health Check Failed",
                    description=f"Health endpoint returned HTTP {resp.status_code}",
                    entityId="api_health",
                ))
                return issues

            data = resp.json()

            # Check individual components if the response includes them
            components = data.get("components", data.get("services", {}))
            for name, status in components.items() if isinstance(components, dict) else []:
                if isinstance(status, dict):
                    is_healthy = status.get("healthy", status.get("status") == "ok")
                else:
                    is_healthy = status in (True, "ok", "healthy")

                if not is_healthy:
                    issues.append(WatchdogIssue(
                        checkType=CheckType.SYSTEM_HEALTH,
                        severity=Severity.CRITICAL,
                        title=f"Unhealthy Service: {name}",
                        description=f"Component '{name}' reported unhealthy status",
                        entityId=f"system:{name}",
                    ))

        except Exception as e:
            issues.append(WatchdogIssue(
                checkType=CheckType.SYSTEM_HEALTH,
                severity=Severity.CRITICAL,
                title="API Unreachable",
                description=f"Health endpoint unreachable: {str(e)}",
                entityId="api_health",
            ))

        return issues
