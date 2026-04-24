"""
SenseHub Crop Sync Service

Wraps the existing SenseHubMCPClient with crop-specific business logic.
Provides four methods matching the SenseHub MCP crop tools:

  set_crop_data        — push full crop payload on planting
  update_growth_stage  — push stage transition
  complete_crop        — finalize harvest cycle
  get_crop_data        — read current active crop from SenseHub

All methods follow a fire-and-log-on-failure contract: exceptions are caught,
logged at ERROR level with context, and the caller receives None / False.
The only caller-visible exception to this is the HTTP 422 "No primary crop
zone configured" error, which is surfaced as a WARNING with an operator-action
marker.

Execution note: this module imports from sibling packages using relative
imports and must be run as part of the src package
(python -m uvicorn src.main:app).
"""

import logging
from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from uuid import UUID

from .sensehub_mcp_client import SenseHubMCPClient
from .sensehub_stage_mapper import SenseHubStage
from ...models.block import Block, IoTController
from ...models.plant_data_enhanced import PlantDataEnhanced

if TYPE_CHECKING:
    pass  # BlockRepository imported lazily inside from_block to avoid circular imports.

logger = logging.getLogger(__name__)

# Maximum characters of error detail included in log messages.
_ERR_PREVIEW_LEN = 500

# The HTTP 422 error body text that indicates an operator-side setup gap.
_ZONE_NOT_CONFIGURED_MARKER = "No primary crop zone configured"


# =============================================================================
# Internal helpers
# =============================================================================


def _to_utc_z(dt: datetime) -> str:
    """
    Serialize a datetime to ISO 8601 UTC string with 'Z' suffix.

    SenseHub requires the 'Z' suffix (not '+00:00').  We normalise any
    timezone-aware datetime to UTC first, then strip the '+00:00' offset.

    Args:
        dt: Datetime object (naive datetimes are treated as UTC).

    Returns:
        ISO 8601 string ending in 'Z', e.g. '2026-03-15T00:00:00Z'.
    """
    if dt.tzinfo is None:
        # Reason: naive datetimes stored in MongoDB are UTC by convention in A64Core.
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    utc_dt = dt.astimezone(timezone.utc)
    return utc_dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_ec_range_ms(ec_range_ms: Optional[str]) -> Optional[tuple[float, float]]:
    """
    Parse the ecRangeMs string field (e.g. '1.5-2.5') into (min, max) floats.

    The PlantDataEnhanced model stores EC as a human-readable range string
    rather than separate min/max floats.  This function parses it so we can
    emit the correct {min, max, unit} shape SenseHub expects.

    Args:
        ec_range_ms: String like '1.5-2.5' or None.

    Returns:
        Tuple (min_ec, max_ec) as floats, or None if unparseable / absent.
    """
    if not ec_range_ms:
        return None
    try:
        parts = ec_range_ms.strip().split("-")
        if len(parts) == 2:
            ec_min = float(parts[0].strip())
            ec_max = float(parts[1].strip())
            return ec_min, ec_max
    except (ValueError, AttributeError):
        pass
    return None


def _build_optimal_ranges(plant: PlantDataEnhanced) -> dict:
    """
    Build the 'optimal_ranges' sub-object for the set_crop_data payload.

    Each key is included ONLY if ALL its required sub-fields are non-null and
    parseable.  Missing or null fields cause the key to be omitted entirely —
    never sent as null.  SenseHub accepts partial optimal_ranges (including
    the empty dict {}) without error.

    Fields sourced from PlantDataEnhanced:
      ec          — soilRequirements.ecRangeMs  (parsed "min-max" string)
      ph          — soilRequirements.phRequirements.{minPH, maxPH}
      temperature — environmentalRequirements.temperature.{minCelsius, maxCelsius}
      humidity    — environmentalRequirements.humidity.{minPercentage, maxPercentage}
      light       — lightRequirements: optimalHoursDaily preferred;
                    falls back to average of (minHoursDaily, maxHoursDaily)
      water       — wateringRequirements.amountPerPlantLiters (already in L)

    Args:
        plant: Resolved PlantDataEnhanced document.

    Returns:
        Dict with zero or more optimal-range keys; may be empty.
    """
    ranges: dict = {}

    # --- EC ---
    soil = plant.soilRequirements
    if soil is not None:
        ec_parsed = _parse_ec_range_ms(soil.ecRangeMs)
        if ec_parsed is not None:
            ec_min, ec_max = ec_parsed
            ranges["ec"] = {"min": ec_min, "max": ec_max, "unit": "mS/cm"}

        # --- pH ---
        ph_req = soil.phRequirements
        if ph_req is not None:
            # Both fields are required (non-optional) on PHRequirements, so
            # their presence is guaranteed if the object exists.
            ranges["ph"] = {
                "min": ph_req.minPH,
                "max": ph_req.maxPH,
                "unit": "pH",
            }

    # --- Temperature ---
    env = plant.environmentalRequirements
    if env is not None and env.temperature is not None:
        temp = env.temperature
        ranges["temperature"] = {
            "min": temp.minCelsius,
            "max": temp.maxCelsius,
            "unit": "C",
        }

        # --- Humidity ---
        if env.humidity is not None:
            hum = env.humidity
            ranges["humidity"] = {
                "min": hum.minPercentage,
                "max": hum.maxPercentage,
                "unit": "%RH",
            }

    # --- Light ---
    light = plant.lightRequirements
    if light is not None:
        # Prefer optimalHoursDaily; fall back to average of min/max.
        if light.optimalHoursDaily is not None:
            hours = light.optimalHoursDaily
        elif light.minHoursDaily is not None and light.maxHoursDaily is not None:
            hours = (light.minHoursDaily + light.maxHoursDaily) / 2.0
        else:
            hours = None

        if hours is not None:
            ranges["light"] = {"hours_per_day": hours, "unit": "h"}

    # --- Water ---
    watering = plant.wateringRequirements
    if watering is not None and watering.amountPerPlantLiters is not None:
        # Field is already in liters; no conversion needed.
        ranges["water"] = {
            "volume_per_plant_per_day": watering.amountPerPlantLiters,
            "unit": "L",
        }

    return ranges


def _build_stage_durations(plant: PlantDataEnhanced) -> dict:
    """
    Build the 'stage_durations_days' sub-object.

    Omits any sub-key whose source value is zero (i.e. not applicable for this
    crop; e.g. a leafy green with no fruitingDays).

    Args:
        plant: Resolved PlantDataEnhanced document.

    Returns:
        Dict mapping stage name → integer days; keys with zero value omitted.
    """
    gc = plant.growthCycle
    durations: dict = {}

    # Reason: Use explicit truthiness check on int so that 0 is properly omitted.
    if gc.germinationDays:
        durations["seedling"] = gc.germinationDays
    if gc.vegetativeDays:
        durations["vegetative"] = gc.vegetativeDays
    if gc.floweringDays:
        durations["flowering"] = gc.floweringDays
    if gc.fruitingDays:
        durations["fruiting"] = gc.fruitingDays
    # harvestDurationDays → ripening (SenseHub has no "harvest_duration" key)
    if gc.harvestDurationDays:
        durations["ripening"] = gc.harvestDurationDays

    return durations


def _build_set_crop_data_payload(
    block: Block,
    plant_data_enhanced: PlantDataEnhanced,
    planting_id: UUID,
    current_stage: SenseHubStage,
) -> dict:
    """
    Assemble the full payload dict for the SenseHub set_crop_data MCP tool.

    Field mapping summary
    ─────────────────────
    block_id              ← block.blockId (UUID → str)
    a64core_planting_id   ← planting_id (UUID → str)
    crop.plant_data_id    ← plant_data_enhanced.plantDataId (UUID → str)
    crop.name             ← plant_data_enhanced.plantName
    crop.variety          ← plant_data_enhanced.scientificName (omitted if None)
    crop.scientific_name  ← plant_data_enhanced.scientificName (omitted if None)
    timing.planted_date   ← block.plantedDate → ISO 8601 UTC with Z suffix
    timing.expected_harvest_date ← block.expectedHarvestDate (omitted if None)
    timing.growth_cycle_days ← plant_data_enhanced.growthCycle.totalCycleDays
    population.plant_count   ← block.actualPlantCount (omitted if None)
    population.max_capacity  ← block.maxPlants
    current_stage         ← current_stage.value (SenseHubStage enum)
    optimal_ranges        ← _build_optimal_ranges(plant_data_enhanced)
    stage_durations_days  ← _build_stage_durations(plant_data_enhanced)

    CRITICAL: The payload is valid even when optimal_ranges is empty ({}),
    which is the case for plants with no sensor range data.  Never send null
    for any key inside optimal_ranges — omit the key entirely.

    Args:
        block: Current Block document.
        plant_data_enhanced: Resolved plant data for block.targetCrop.
        planting_id: A64Core planting UUID (stable correlation key).
        current_stage: Computed SenseHubStage value.

    Returns:
        Complete payload dict ready for _call_tool('set_crop_data', payload).
    """
    # --- crop sub-object ---
    crop: dict = {
        "plant_data_id": str(plant_data_enhanced.plantDataId),
        "name": plant_data_enhanced.plantName,
    }
    if plant_data_enhanced.scientificName:
        crop["variety"] = plant_data_enhanced.scientificName
        crop["scientific_name"] = plant_data_enhanced.scientificName

    # --- timing sub-object ---
    # planted_date is required; expectedHarvestDate is optional.
    timing: dict = {
        "planted_date": _to_utc_z(block.plantedDate),  # type: ignore[arg-type]
        "growth_cycle_days": plant_data_enhanced.growthCycle.totalCycleDays,
    }
    if block.expectedHarvestDate is not None:
        timing["expected_harvest_date"] = _to_utc_z(block.expectedHarvestDate)

    # --- population sub-object ---
    population: dict = {"max_capacity": block.maxPlants}
    if block.actualPlantCount is not None:
        population["plant_count"] = block.actualPlantCount

    payload: dict = {
        "block_id": str(block.blockId),
        "a64core_planting_id": str(planting_id),
        "crop": crop,
        "timing": timing,
        "population": population,
        "current_stage": current_stage.value,
        "optimal_ranges": _build_optimal_ranges(plant_data_enhanced),
        "stage_durations_days": _build_stage_durations(plant_data_enhanced),
    }

    return payload


# =============================================================================
# Public service class
# =============================================================================


class SenseHubCropSync:
    """
    Crop-specific MCP integration layer wrapping SenseHubMCPClient.

    One instance per block-MCP-session.  Callers construct it with a fresh
    client built from block.iotController credentials.

    All methods are fire-and-log: they never raise.  Callers receive None or
    False on any failure and must decide whether to queue a retry.

    Error handling contract
    -----------------------
    - httpx.HTTPStatusError with status 422 and body containing
      "No primary crop zone configured" → log WARNING with operator marker,
      return None / False immediately.  Do NOT retry.
    - All other exceptions → log ERROR with block_id + mcp_address + tool name
      + first 500 chars of error.  Return None / False.
    """

    def __init__(self, client: SenseHubMCPClient, mcp_address: str) -> None:
        """
        Initialise with an already-constructed MCP client.

        Args:
            client: SenseHubMCPClient instance configured for the target block.
            mcp_address: Human-readable address string used in log messages.
        """
        self._client = client
        self._mcp_address = mcp_address

    # -------------------------------------------------------------------------
    # Factory helper
    # -------------------------------------------------------------------------

    @classmethod
    async def from_block(cls, block: Block) -> Optional["SenseHubCropSync"]:
        """
        Construct a SenseHubCropSync from a Block's iotController settings.

        Checks the block's own iotController first.  If the block has no
        iotController (typical for virtual children), walks up the parentBlockId
        chain until it finds an ancestor with iotController.enabled and a valid
        mcpApiKey, or until the chain is exhausted.

        This is the T-007 architectural correction: virtual child blocks inherit
        MCP credentials from their physical parent, but are pushed to SenseHub
        using their own block_id (not the parent's).

        Args:
            block: Block document (may be a virtual child with no iotController).

        Returns:
            SenseHubCropSync instance configured with the resolved iotController,
            or None if no enabled iotController is found in the chain.
        """
        # Reason: Lazy import to avoid circular dependency at module load time.
        from ..block.block_repository_new import BlockRepository

        def _build_from_iot(iot: IoTController) -> Optional["SenseHubCropSync"]:
            """Return a SenseHubCropSync from an IoTController object, or None if incomplete."""
            if not iot.enabled:
                return None
            mcp_api_key = iot.mcpApiKey
            if not mcp_api_key:
                return None
            mcp_port = iot.mcpPort or 3001
            client = SenseHubMCPClient(
                address=iot.address,
                mcp_port=mcp_port,
                api_key=mcp_api_key,
            )
            return cls(client=client, mcp_address=f"{iot.address}:{mcp_port}")

        # ── 1. Try direct iotController on this block ────────────────────────
        if block.iotController is not None:
            result = _build_from_iot(block.iotController)
            if result is not None:
                return result
            # iotController present but disabled or missing mcpApiKey — log and
            # fall through to parent walk so we don't silently stop here.
            logger.warning(
                "[SenseHub] Block %s iotController is disabled or missing mcpApiKey"
                " — walking parent chain",
                block.blockId,
            )

        # ── 2. Walk parentBlockId chain ──────────────────────────────────────
        current = block
        while current.parentBlockId is not None:
            parent = await BlockRepository.get_by_id(current.parentBlockId)
            if parent is None:
                logger.warning(
                    "[SenseHub] block %s has parentBlockId=%s but parent not found"
                    " — cannot resolve iotController",
                    block.blockId,
                    current.parentBlockId,
                )
                return None
            if parent.iotController is not None:
                result = _build_from_iot(parent.iotController)
                if result is not None:
                    return result
            current = parent

        # ── 3. No iotController anywhere in chain ────────────────────────────
        logger.warning(
            "[SenseHub] Block %s (and all ancestors) have no enabled iotController"
            " with mcpApiKey — skipping MCP crop sync",
            block.blockId,
        )
        return None

    # -------------------------------------------------------------------------
    # Error handling helpers
    # -------------------------------------------------------------------------

    def _log_mcp_error(
        self,
        block_id: str,
        tool_name: str,
        exc: Exception,
    ) -> None:
        """
        Log a MCP call failure at ERROR level with standardised context.

        Args:
            block_id: UUID string of the block involved.
            tool_name: SenseHub MCP tool that failed.
            exc: The caught exception.
        """
        err_text = str(exc)[:_ERR_PREVIEW_LEN]
        logger.error(
            "[SenseHub] MCP tool '%s' failed | block_id=%s mcp_address=%s | error: %s",
            tool_name,
            block_id,
            self._mcp_address,
            err_text,
        )

    def _is_zone_not_configured(self, exc: Exception) -> bool:
        """
        Return True if the exception represents an HTTP 422 'No primary crop
        zone configured' error from SenseHub.

        Args:
            exc: The caught exception.

        Returns:
            True when the error body contains the known zone-config marker.
        """
        return _ZONE_NOT_CONFIGURED_MARKER in str(exc)

    def _handle_zone_not_configured(self, block_id: str, tool_name: str) -> None:
        """
        Log the operator-facing warning for missing zone configuration.

        Args:
            block_id: UUID string of the block involved.
            tool_name: SenseHub MCP tool that received the 422.
        """
        logger.warning(
            "[SenseHub] Primary crop zone not configured at %s — "
            "operator action required on SenseHub admin UI | "
            "tool=%s block_id=%s",
            self._mcp_address,
            tool_name,
            block_id,
        )

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

    async def set_crop_data(
        self,
        block: Block,
        planting_id: UUID,
        current_stage: SenseHubStage,
        plant_data_enhanced: PlantDataEnhanced,
    ) -> Optional[dict]:
        """
        Push the full crop payload to SenseHub (set_crop_data MCP tool).

        Called when A64Core assigns a crop to a block (planting executed).
        Replaces any prior active crop on that block_id atomically.

        Args:
            block: The block being planted.
            planting_id: A64Core planting UUID — the stable correlation key.
            current_stage: Computed growth stage at time of push.
            plant_data_enhanced: Resolved plant data for block.targetCrop.

        Returns:
            SenseHub response dict {'ok': True, 'sensehub_crop_id': '...'} on
            success, or None on any failure.
        """
        tool = "set_crop_data"
        block_id_str = str(block.blockId)

        try:
            payload = _build_set_crop_data_payload(
                block=block,
                plant_data_enhanced=plant_data_enhanced,
                planting_id=planting_id,
                current_stage=current_stage,
            )
            result = await self._client._call_tool(tool, payload)
            logger.info(
                "[SenseHub] set_crop_data OK | block_id=%s sensehub_crop_id=%s",
                block_id_str,
                result.get("sensehub_crop_id"),
            )
            return result
        except Exception as exc:
            if self._is_zone_not_configured(exc):
                self._handle_zone_not_configured(block_id_str, tool)
            else:
                self._log_mcp_error(block_id_str, tool, exc)
            return None

    async def update_growth_stage(
        self,
        block: Block,
        stage: SenseHubStage,
        transitioned_at: datetime,
        days_since_planting: int,
    ) -> bool:
        """
        Push a growth-stage transition to SenseHub (update_growth_stage MCP tool).

        Stage transitions are NOT forward-only — SenseHub accepts corrections
        and past transitioned_at values for backfill/reconciliation.
        SenseHub returns a 404-equivalent if no active crop exists for the
        block_id; we log it and return False (Phase 4 reconciliation will
        re-push set_crop_data to self-heal).

        Args:
            block: The block whose stage is transitioning.
            stage: New SenseHubStage to apply.
            transitioned_at: UTC datetime the transition occurred
                (may be in the past for backfill).
            days_since_planting: Integer day count at time of transition.

        Returns:
            True on success, False on any failure.
        """
        tool = "update_growth_stage"
        block_id_str = str(block.blockId)

        try:
            payload = {
                "block_id": block_id_str,
                "stage": stage.value,
                "transitioned_at": _to_utc_z(transitioned_at),
                "days_since_planting": days_since_planting,
            }
            await self._client._call_tool(tool, payload)
            logger.info(
                "[SenseHub] update_growth_stage OK | block_id=%s stage=%s",
                block_id_str,
                stage.value,
            )
            return True
        except Exception as exc:
            if self._is_zone_not_configured(exc):
                self._handle_zone_not_configured(block_id_str, tool)
            else:
                self._log_mcp_error(block_id_str, tool, exc)
            return False

    async def complete_crop(
        self,
        block: Block,
        harvested_at: datetime,
        total_yield_kg: float,
        average_quality_grade: str,
        harvest_count: int,
    ) -> bool:
        """
        Finalize a crop cycle on SenseHub (complete_crop MCP tool).

        After this call SenseHub archives the crop record; get_crop_data will
        return null for this block_id until a new set_crop_data arrives.

        Args:
            block: The block whose crop cycle is being finalised.
            harvested_at: UTC datetime the harvest was recorded in A64Core.
            total_yield_kg: Cumulative yield across all harvest events (kg).
            average_quality_grade: Letter grade 'A' / 'B' / 'C' / 'D'.
            harvest_count: Number of discrete harvest events in this cycle.

        Returns:
            True on success, False on any failure.
        """
        tool = "complete_crop"
        block_id_str = str(block.blockId)

        try:
            payload = {
                "block_id": block_id_str,
                "harvested_at": _to_utc_z(harvested_at),
                "total_yield_kg": total_yield_kg,
                "average_quality_grade": average_quality_grade,
                "harvest_count": harvest_count,
            }
            await self._client._call_tool(tool, payload)
            logger.info(
                "[SenseHub] complete_crop OK | block_id=%s yield_kg=%.2f",
                block_id_str,
                total_yield_kg,
            )
            return True
        except Exception as exc:
            if self._is_zone_not_configured(exc):
                self._handle_zone_not_configured(block_id_str, tool)
            else:
                self._log_mcp_error(block_id_str, tool, exc)
            return False

    async def get_crop_data(self, block: Block) -> Optional[dict]:
        """
        Read the current active crop for a block from SenseHub (get_crop_data MCP tool).

        Per the contract, returns null after complete_crop until a new
        set_crop_data arrives.  The MCP client returns an empty dict {} when
        the tool result is empty; we normalise that to None to align with the
        contract's null semantics.

        Args:
            block: The block whose active crop is being queried.

        Returns:
            SenseHub crop payload dict if an active crop exists, None otherwise.
        """
        tool = "get_crop_data"
        block_id_str = str(block.blockId)

        try:
            result = await self._client._call_tool(tool, {"block_id": block_id_str})
            # Reason: empty dict {} means SenseHub returned null/no active crop.
            if not result:
                return None
            return result
        except Exception as exc:
            if self._is_zone_not_configured(exc):
                self._handle_zone_not_configured(block_id_str, tool)
            else:
                self._log_mcp_error(block_id_str, tool, exc)
            return None
