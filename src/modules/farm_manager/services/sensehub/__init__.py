"""
SenseHub Integration Services

Provides client and connection management for SenseHub edge computing
instances running on Raspberry Pi devices in farm blocks.

Phase 3 additions:
  SenseHubCropSync   — crop-data MCP push (set/update/complete/get)
  SenseHubStage      — SenseHub stage enum
  compute_stage      — A64Core stage → SenseHub stage mapping helper
"""

from .sensehub_client import SenseHubClient
from .sensehub_connection_service import SenseHubConnectionService
from .sync_service import SenseHubSyncService
from .cache_query_service import SenseHubCacheQueryService
from .sensehub_crop_sync import SenseHubCropSync
from .sensehub_stage_mapper import SenseHubStage, compute_stage

__all__ = [
    "SenseHubClient",
    "SenseHubConnectionService",
    "SenseHubSyncService",
    "SenseHubCacheQueryService",
    "SenseHubCropSync",
    "SenseHubStage",
    "compute_stage",
]
