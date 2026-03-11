"""
MCP Reachability Checker - Probes MCP endpoints for IoT-connected blocks.
"""

import asyncio
import logging
from typing import List

import httpx

from ..models import WatchdogIssue, CheckType, Severity

logger = logging.getLogger(__name__)

MAX_CONCURRENCY = 5
TIMEOUT_SECONDS = 3


class MCPChecker:
    """Check MCP server reachability for all IoT-connected blocks."""

    def __init__(self, db):
        self.db = db

    async def run(self) -> List[WatchdogIssue]:
        """Probe MCP endpoints and return issues for unreachable servers."""
        blocks_col = self.db["blocks"]

        # Find blocks with IoT controllers enabled and MCP port set
        cursor = blocks_col.find({
            "iotController.enabled": True,
            "iotController.mcpPort": {"$exists": True, "$ne": None},
        }, {
            "blockId": 1,
            "name": 1,
            "farmId": 1,
            "iotController": 1,
        })

        blocks = await cursor.to_list(length=500)
        if not blocks:
            return []

        # Enrich with farm names
        farm_ids = list({b["farmId"] for b in blocks if b.get("farmId")})
        farms_map = {}
        if farm_ids:
            farms_cursor = self.db["farms"].find(
                {"farmId": {"$in": farm_ids}},
                {"farmId": 1, "name": 1},
            )
            async for farm in farms_cursor:
                farms_map[farm["farmId"]] = farm.get("name", "Unknown Farm")

        # Probe each block with concurrency limit
        semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
        issues: List[WatchdogIssue] = []

        async def probe_block(block: dict):
            iot = block.get("iotController", {})
            address = iot.get("address", "")
            port = iot.get("mcpPort")
            if not address or not port:
                return

            url = f"http://{address}:{port}/mcp"
            async with semaphore:
                try:
                    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                        resp = await client.get(url)
                        if resp.status_code < 500:
                            return  # Reachable
                except Exception:
                    pass  # Unreachable

            farm_name = farms_map.get(block.get("farmId"), "Unknown Farm")
            block_name = block.get("name", "Unknown Block")
            issues.append(WatchdogIssue(
                checkType=CheckType.MCP_REACHABILITY,
                severity=Severity.HIGH,
                title="MCP Server Unreachable",
                description=f"Farm: {farm_name} > Block {block_name}\nServer: {address}:{port}",
                entityId=block.get("blockId"),
                farmName=farm_name,
                blockName=block_name,
                extra={"address": address, "port": port},
            ))

        await asyncio.gather(*[probe_block(b) for b in blocks], return_exceptions=True)
        return issues
