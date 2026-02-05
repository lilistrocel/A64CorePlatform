"""
Centralized Logging Configuration

Provides structured JSON logging for production and human-readable
logging for development. Respects LOG_LEVEL from settings.
"""

import logging
import logging.config
import json
import sys
from datetime import datetime, timezone


class JSONFormatter(logging.Formatter):
    """
    Formats log records as JSON objects for structured log aggregation.

    Output fields: timestamp, level, logger, message, module, function,
    line, and any extra fields. Exception info is included when present.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = self.formatException(record.exc_info)

        # Include extra fields (e.g., request_id, user_id)
        for key in ("request_id", "user_id", "client_ip", "method", "path", "status_code", "duration_ms"):
            value = getattr(record, key, None)
            if value is not None:
                log_entry[key] = value

        return json.dumps(log_entry, default=str)


def setup_logging(log_level: str = "INFO", environment: str = "development") -> None:
    """
    Configure application-wide logging.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        environment: Application environment. Uses JSON format for non-development.
    """
    level = getattr(logging, log_level.upper(), logging.INFO)

    if environment == "development":
        # Human-readable format for development
        formatter_config = {
            "class": "logging.Formatter",
            "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        }
    else:
        # Structured JSON for production (parseable by log aggregation tools)
        formatter_config = {
            "()": JSONFormatter,
        }

    config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": formatter_config,
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "formatter": "default",
                "level": level,
            },
        },
        "root": {
            "level": level,
            "handlers": ["console"],
        },
        "loggers": {
            # Reduce noise from third-party libraries
            "uvicorn": {"level": "WARNING"},
            "uvicorn.access": {"level": "WARNING"},
            "motor": {"level": "WARNING"},
            "pymongo": {"level": "WARNING"},
            "httpx": {"level": "WARNING"},
            "httpcore": {"level": "WARNING"},
            "redis": {"level": "WARNING"},
        },
    }

    logging.config.dictConfig(config)

    logger = logging.getLogger(__name__)
    logger.info(
        "Logging configured: level=%s, format=%s",
        log_level,
        "json" if environment != "development" else "text",
    )
