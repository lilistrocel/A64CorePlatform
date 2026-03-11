"""
Watchdog Service - Pydantic models for configuration, issues, and logs.
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field
from uuid import uuid4


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SeverityThreshold(str, Enum):
    ALL = "all"
    MEDIUM_PLUS = "medium_plus"
    HIGH_PLUS = "high_plus"
    CRITICAL_ONLY = "critical_only"


# Ordered severity levels for threshold comparison
SEVERITY_ORDER = {
    Severity.LOW: 0,
    Severity.MEDIUM: 1,
    Severity.HIGH: 2,
    Severity.CRITICAL: 3,
}

THRESHOLD_MIN_SEVERITY = {
    SeverityThreshold.ALL: 0,
    SeverityThreshold.MEDIUM_PLUS: 1,
    SeverityThreshold.HIGH_PLUS: 2,
    SeverityThreshold.CRITICAL_ONLY: 3,
}


def meets_threshold(severity: Severity, threshold: SeverityThreshold) -> bool:
    """Check if a severity meets the configured threshold."""
    return SEVERITY_ORDER[severity] >= THRESHOLD_MIN_SEVERITY[threshold]


class CheckType(str, Enum):
    MCP_REACHABILITY = "mcp_reachability"
    LATE_ITEMS = "late_items"
    ACTIVE_ALERTS = "active_alerts"
    BLOCK_HEALTH = "block_health"
    SYSTEM_HEALTH = "system_health"


class WatchdogConfig(BaseModel):
    """Watchdog configuration stored in system_config collection."""
    botToken: str = ""
    chatId: str = ""
    enabled: bool = False
    checkIntervalMinutes: int = Field(default=15, ge=1, le=1440)
    notificationCooldownMinutes: int = Field(default=60, ge=5, le=1440)
    severityThreshold: SeverityThreshold = SeverityThreshold.HIGH_PLUS
    enabledChecks: List[str] = Field(default_factory=lambda: [
        "mcp_reachability", "late_items", "active_alerts",
        "block_health", "system_health"
    ])
    updatedAt: Optional[datetime] = None
    updatedBy: Optional[str] = None
    updatedByEmail: Optional[str] = None


class WatchdogConfigUpdate(BaseModel):
    """Payload for updating watchdog configuration."""
    botToken: Optional[str] = None
    chatId: Optional[str] = None
    enabled: Optional[bool] = None
    checkIntervalMinutes: Optional[int] = Field(default=None, ge=1, le=1440)
    notificationCooldownMinutes: Optional[int] = Field(default=None, ge=5, le=1440)
    severityThreshold: Optional[SeverityThreshold] = None
    enabledChecks: Optional[List[str]] = None


class WatchdogIssue(BaseModel):
    """A single issue detected by a checker."""
    checkType: CheckType
    severity: Severity
    title: str
    description: str
    entityId: Optional[str] = None
    farmName: Optional[str] = None
    blockName: Optional[str] = None
    extra: Optional[dict] = None

    @property
    def issue_key(self) -> str:
        """Deduplication key for cooldown logic."""
        return f"{self.checkType.value}:{self.entityId or 'global'}"


class WatchdogRunResult(BaseModel):
    """Result of a single watchdog run."""
    runId: str = Field(default_factory=lambda: str(uuid4()))
    startedAt: datetime
    completedAt: Optional[datetime] = None
    totalIssues: int = 0
    sentIssues: int = 0
    skippedByCooldown: int = 0
    errors: List[str] = Field(default_factory=list)
    triggeredBy: str = "scheduler"


class NotificationLog(BaseModel):
    """Log entry for a sent Telegram notification."""
    logId: str = Field(default_factory=lambda: str(uuid4()))
    issueKey: str
    checkType: str
    severity: str
    title: str
    description: str
    telegramMessageId: Optional[int] = None
    sentAt: datetime
    cooldownExpiresAt: datetime
