"""
SenseHub MCP Client

Communicates with a SenseHub Raspberry Pi MCP server (port 3001) using
Streamable HTTP transport with a static API key instead of JWT.

The MCP session handshake is:
  1. POST /mcp  {"jsonrpc":"2.0","method":"initialize","params":{...},"id":1}
     -> Response header: Mcp-Session-Id: <id>
  2. POST /mcp  {"jsonrpc":"2.0","method":"notifications/initialized"}  + session header
     -> 202 No Content
  3. POST /mcp  {"jsonrpc":"2.0","method":"tools/call","params":{...},"id":2}  + session header
     -> {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"<json-string>"}]},"id":2}

Auth: Authorization: Bearer <MCP_API_KEY> on all requests.
"""

import json
import logging
from datetime import datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 10.0

MCP_INITIALIZE_PARAMS = {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {"name": "a64-farm-ai", "version": "1.0.0"},
}


class SenseHubMCPClient:
    """MCP client for a single SenseHub instance. Drop-in replacement for SenseHubClient for AI tool calls."""

    def __init__(self, address: str, mcp_port: int, api_key: str):
        self.base_url = f"http://{address}:{mcp_port}"
        self._api_key = api_key
        self._session_id: Optional[str] = None

    # =========================================================================
    # Compatibility properties (so _update_token_cache short-circuits safely)
    # =========================================================================

    @property
    def cached_token(self) -> Optional[str]:
        return None  # MCP uses static API key, not JWT

    @property
    def cached_token_expires(self) -> Optional[datetime]:
        return None

    # =========================================================================
    # MCP Session Management
    # =========================================================================

    def _base_headers(self) -> dict:
        """Headers required by the MCP Streamable HTTP transport spec."""
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            # Accept both plain JSON and SSE — server decides which to use
            "Accept": "application/json, text/event-stream",
        }

    def _parse_response(self, resp: httpx.Response) -> dict:
        """
        Parse a MCP response that may be either plain JSON or SSE
        (text/event-stream).  Returns the first JSON-RPC result object found.
        """
        ct = resp.headers.get("content-type", "")
        if "text/event-stream" in ct:
            # SSE: each line is either "data: <json>" or a blank separator
            for line in resp.text.splitlines():
                line = line.strip()
                if line.startswith("data:"):
                    data = line[len("data:"):].strip()
                    if data:
                        try:
                            return json.loads(data)
                        except json.JSONDecodeError:
                            continue
            return {}
        return resp.json()

    async def _initialize_session(self) -> None:
        """Perform the MCP handshake to get a session ID."""
        headers = self._base_headers()

        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            # Step 1: initialize
            resp = await client.post(
                f"{self.base_url}/mcp",
                json={
                    "jsonrpc": "2.0",
                    "method": "initialize",
                    "params": MCP_INITIALIZE_PARAMS,
                    "id": 1,
                },
                headers=headers,
            )
            resp.raise_for_status()

            session_id = resp.headers.get("Mcp-Session-Id")
            if not session_id:
                raise RuntimeError("MCP server did not return Mcp-Session-Id header")
            self._session_id = session_id

            # Step 2: notifications/initialized (fire-and-forget, 202 expected)
            await client.post(
                f"{self.base_url}/mcp",
                json={"jsonrpc": "2.0", "method": "notifications/initialized"},
                headers={**headers, "Mcp-Session-Id": session_id},
            )

        logger.debug(f"MCP session initialized: {session_id}")

    async def _mcp_call(self, method: str, params: dict, call_id: int = 2) -> dict:
        """POST a JSON-RPC request to /mcp with the session header. Auto-reinitializes on 404."""
        if not self._session_id:
            await self._initialize_session()

        headers = {**self._base_headers(), "Mcp-Session-Id": self._session_id}
        payload = {"jsonrpc": "2.0", "method": method, "params": params, "id": call_id}

        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.post(
                f"{self.base_url}/mcp", json=payload, headers=headers
            )

            # Session expired — reinitialize and retry once
            if resp.status_code == 404:
                logger.info("MCP session expired, reinitializing...")
                self._session_id = None
                await self._initialize_session()
                headers["Mcp-Session-Id"] = self._session_id
                resp = await client.post(
                    f"{self.base_url}/mcp", json=payload, headers=headers
                )

            resp.raise_for_status()
            return self._parse_response(resp)

    async def _call_tool(self, name: str, arguments: dict) -> dict:
        """Call an MCP tool and return the parsed result."""
        response = await self._mcp_call(
            "tools/call",
            {"name": name, "arguments": arguments},
            call_id=2,
        )
        # MCP result: {"result": {"content": [{"type": "text", "text": "<json>"}]}}
        content = response.get("result", {}).get("content", [])
        for item in content:
            if item.get("type") == "text":
                text = item["text"]
                try:
                    return json.loads(text)
                except (json.JSONDecodeError, TypeError):
                    return {"raw": text}
        return {}

    # =========================================================================
    # Public API (same signatures as SenseHubClient)
    # =========================================================================

    async def get_equipment(
        self,
        status: Optional[str] = None,
        zone: Optional[str] = None,
    ) -> list:
        """Get equipment list via MCP tool."""
        args: dict = {}
        if status:
            args["status"] = status
        if zone:
            args["zone"] = zone
        result = await self._call_tool("get_equipment_list", args)
        if isinstance(result, list):
            return result
        return result.get("equipment", result.get("data", []))

    async def get_equipment_history(
        self,
        equipment_id: int,
        from_dt: Optional[str] = None,
        to_dt: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> list:
        """Get sensor reading history via MCP tool."""
        args: dict = {"equipment_id": equipment_id}
        if from_dt:
            args["from"] = from_dt
        if to_dt:
            args["to"] = to_dt
        if limit:
            args["limit"] = limit
        result = await self._call_tool("get_sensor_readings", args)
        if isinstance(result, list):
            return result
        return result.get("readings", result.get("data", []))

    async def get_automations(self) -> list:
        """Get automations via MCP tool."""
        result = await self._call_tool("get_automations", {})
        if isinstance(result, list):
            return result
        return result.get("automations", result.get("data", []))

    async def get_alerts(
        self,
        severity: Optional[str] = None,
        acknowledged: Optional[bool] = None,
    ) -> list:
        """Get alerts via MCP tool."""
        args: dict = {}
        if severity:
            args["severity"] = severity
        if acknowledged is not None:
            args["acknowledged"] = acknowledged
        result = await self._call_tool("get_alerts", args)
        if isinstance(result, list):
            return result
        return result.get("alerts", result.get("data", []))

    async def health_check(self) -> dict:
        """Get system health status via MCP tool."""
        result = await self._call_tool("get_system_status", {})
        return result.get("health", result)

    async def get_system_info(self) -> dict:
        """Get system info via MCP tool."""
        result = await self._call_tool("get_system_status", {})
        return result.get("system_info", result)

    async def control_relay(
        self, equipment_id: int, channel: int, state: bool
    ) -> dict:
        """Control a relay channel via MCP tool."""
        return await self._call_tool(
            "control_relay",
            {"equipment_id": equipment_id, "channel": channel, "state": state},
        )

    async def trigger_automation(self, automation_id: int) -> dict:
        """Trigger an automation via MCP tool."""
        return await self._call_tool(
            "trigger_automation", {"automation_id": automation_id}
        )

    async def toggle_automation(self, automation_id: int) -> dict:
        """Toggle an automation enabled/disabled via MCP tool."""
        return await self._call_tool(
            "toggle_automation", {"automation_id": automation_id}
        )
