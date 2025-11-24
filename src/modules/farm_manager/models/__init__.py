"""
Farm Management Module - Data Models

All Pydantic models for the farm management system.
"""

from .farm import Farm, FarmLocation, FarmCreate, FarmUpdate
from .block import Block, BlockStatus, BlockState, BlockCreate, BlockUpdate, BlockStatusUpdate
from .block_harvest import BlockHarvest, BlockHarvestCreate, BlockHarvestUpdate, BlockHarvestSummary
from .alert import Alert, AlertSeverity, AlertStatus, AlertCreate, AlertResolve
from .block_archive import BlockArchive, BlockArchiveAnalytics, CropPerformanceComparison
from .plant_data import PlantData, PlantDataCreate, PlantDataUpdate
from .plant_data_enhanced import (
    PlantDataEnhanced,
    PlantDataEnhancedCreate,
    PlantDataEnhancedUpdate,
    FarmTypeEnum,
    GrowthStageEnum,
)
from .planting import Planting, PlantingItem, PlantingCreate
from .daily_harvest import DailyHarvest, DailyHarvestEntry, DailyHarvestCreate
from .harvest import Harvest, HarvestEntry
from .block_cycle import BlockCycle, BlockCycleAlert, BlockCycleDailyHarvest
from .stock_inventory import StockInventoryItem, StockInventoryCreate
from .farm_assignment import FarmAssignment, FarmAssignmentCreate
from .farm_task import (
    FarmTask,
    FarmTaskCreate,
    FarmTaskUpdate,
    FarmTaskListResponse,
    TaskType,
    TaskStatus,
    HarvestGrade,
    HarvestEntry,
    HarvestEntryCreate,
    HarvestTotal,
    TaskData,
    TaskCompletionData,
)
from .block_alert import (
    BlockAlert,
    BlockAlertCreate,
    BlockAlertListResponse,
    AlertSeverity as BlockAlertSeverity,
    AlertStatus as BlockAlertStatus,
    AlertCategory,
    AlertComment,
    AlertCommentCreate,
    AlertUpdate,
    AlertResolve as BlockAlertResolve,
)
from .farm_analytics import FarmAnalyticsResponse, AggregatedMetrics, StateBreakdown
from .global_analytics import (
    GlobalAnalyticsResponse,
    GlobalAggregatedMetrics,
    GlobalStateBreakdown,
    FarmSummaryItem,
    GlobalYieldTimeline,
    GlobalPerformanceInsights,
)

__all__ = [
    # Farm
    "Farm",
    "FarmLocation",
    "FarmCreate",
    "FarmUpdate",
    # Block
    "Block",
    "BlockStatus",
    "BlockState",  # Compatibility alias for old code
    "BlockCreate",
    "BlockUpdate",
    "BlockStatusUpdate",
    # Block Harvest
    "BlockHarvest",
    "BlockHarvestCreate",
    "BlockHarvestUpdate",
    "BlockHarvestSummary",
    # Block Archive
    "BlockArchive",
    "BlockArchiveAnalytics",
    "CropPerformanceComparison",
    # Plant Data
    "PlantData",
    "PlantDataCreate",
    "PlantDataUpdate",
    # Plant Data Enhanced
    "PlantDataEnhanced",
    "PlantDataEnhancedCreate",
    "PlantDataEnhancedUpdate",
    "FarmTypeEnum",
    "GrowthStageEnum",
    # Planting
    "Planting",
    "PlantingItem",
    "PlantingCreate",
    # Daily Harvest
    "DailyHarvest",
    "DailyHarvestEntry",
    "DailyHarvestCreate",
    # Harvest
    "Harvest",
    "HarvestEntry",
    # Alert
    "Alert",
    "AlertSeverity",
    "AlertStatus",
    "AlertCreate",
    "AlertResolve",
    # Block Cycle
    "BlockCycle",
    "BlockCycleAlert",
    "BlockCycleDailyHarvest",
    # Stock Inventory
    "StockInventoryItem",
    "StockInventoryCreate",
    # Farm Assignment
    "FarmAssignment",
    "FarmAssignmentCreate",
    # Farm Task (Operations)
    "FarmTask",
    "FarmTaskCreate",
    "FarmTaskUpdate",
    "FarmTaskListResponse",
    "TaskType",
    "TaskStatus",
    "HarvestGrade",
    "HarvestEntry",
    "HarvestEntryCreate",
    "HarvestTotal",
    "TaskData",
    "TaskCompletionData",
    # Block Alert (Operations)
    "BlockAlert",
    "BlockAlertCreate",
    "BlockAlertListResponse",
    "BlockAlertSeverity",
    "BlockAlertStatus",
    "AlertCategory",
    "AlertComment",
    "AlertCommentCreate",
    "AlertUpdate",
    "BlockAlertResolve",
    # Farm Analytics
    "FarmAnalyticsResponse",
    "AggregatedMetrics",
    "StateBreakdown",
    # Global Analytics
    "GlobalAnalyticsResponse",
    "GlobalAggregatedMetrics",
    "GlobalStateBreakdown",
    "FarmSummaryItem",
    "GlobalYieldTimeline",
    "GlobalPerformanceInsights",
]
