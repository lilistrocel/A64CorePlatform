"""
AI Dashboard Service Package

Provides automated farm inspection every 4 hours, collecting data from all
farms, blocks, and SenseHub instances, feeding it to Gemini AI for analysis,
and storing structured reports in MongoDB.
"""

from .service import AIDashboardService
from .scheduler import AIDashboardScheduler

__all__ = [
    "AIDashboardService",
    "AIDashboardScheduler",
]
