"""
SenseHub HTTP Client

Manages authenticated HTTP communication with a single SenseHub instance.
Handles JWT token lifecycle (login, cache, auto-refresh on 401).
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Token refresh buffer - refresh 30 minutes before actual expiry
TOKEN_REFRESH_BUFFER = timedelta(minutes=30)

# SenseHub tokens expire after 8 hours of inactivity
TOKEN_LIFETIME = timedelta(hours=8)

# HTTP timeout in seconds
REQUEST_TIMEOUT = 5.0


class SenseHubClient:
    """HTTP client for a single SenseHub instance with token management."""

    def __init__(
        self,
        address: str,
        port: int,
        email: str,
        password: str,
        token: Optional[str] = None,
        token_expires_at: Optional[datetime] = None,
    ):
        self.base_url = f"http://{address}:{port}"
        self._email = email
        self._password = password
        self._token = token
        self._token_expires = token_expires_at

    def _token_is_valid(self) -> bool:
        """Check if the cached token is still likely valid."""
        if not self._token or not self._token_expires:
            return False
        return datetime.utcnow() < (self._token_expires - TOKEN_REFRESH_BUFFER)

    async def _login(self) -> str:
        """Authenticate with SenseHub and cache the JWT token."""
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.post(
                f"{self.base_url}/api/auth/login",
                json={"email": self._email, "password": self._password},
            )
            resp.raise_for_status()
            data = resp.json()
            self._token = data["token"]
            self._token_expires = datetime.utcnow() + TOKEN_LIFETIME
            return self._token

    async def _ensure_token(self) -> str:
        """Get a valid token, logging in if necessary."""
        if self._token_is_valid():
            return self._token
        return await self._login()

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        """
        Make an authenticated request to SenseHub.
        Auto-refreshes token on 401 and retries once.
        """
        token = await self._ensure_token()
        headers = {"Authorization": f"Bearer {token}"}

        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.request(
                method,
                f"{self.base_url}{path}",
                headers=headers,
                **kwargs,
            )

            # On 401, try refreshing the token once
            if resp.status_code == 401:
                token = await self._login()
                headers = {"Authorization": f"Bearer {token}"}
                resp = await client.request(
                    method,
                    f"{self.base_url}{path}",
                    headers=headers,
                    **kwargs,
                )

            resp.raise_for_status()
            return resp.json()

    # =========================================================================
    # Public cached token accessor (for persisting back to DB)
    # =========================================================================

    @property
    def cached_token(self) -> Optional[str]:
        return self._token

    @property
    def cached_token_expires(self) -> Optional[datetime]:
        return self._token_expires

    # =========================================================================
    # Health & System (no auth required for health)
    # =========================================================================

    async def health_check(self) -> dict:
        """GET /api/health - no auth required."""
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.get(f"{self.base_url}/api/health")
            resp.raise_for_status()
            return resp.json()

    async def get_setup_status(self) -> dict:
        """GET /api/auth/setup-status - no auth required."""
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.get(f"{self.base_url}/api/auth/setup-status")
            resp.raise_for_status()
            return resp.json()

    async def get_system_info(self) -> dict:
        """GET /api/system/info"""
        return await self._request("GET", "/api/system/info")

    # =========================================================================
    # Dashboard
    # =========================================================================

    async def get_dashboard(self) -> dict:
        """GET /api/dashboard/overview with response filtering."""
        data = await self._request("GET", "/api/dashboard/overview")

        if not isinstance(data, dict):
            return data

        # Strip chartReadings - can be 18MB+ with 90k+ data points.
        # Not needed for the dashboard summary view.
        data.pop("chartReadings", None)

        # Filter latestReadings - SenseHub may return all historical readings.
        # Keep only the most recent reading per equipment.
        readings = data.get("latestReadings")
        if isinstance(readings, list) and len(readings) > 50:
            seen: dict = {}
            for r in readings:
                eq_id = r.get("equipment_id")
                if eq_id is not None and eq_id not in seen:
                    seen[eq_id] = r
            data["latestReadings"] = list(seen.values())

        return data

    # =========================================================================
    # Equipment
    # =========================================================================

    async def get_equipment(
        self,
        status: Optional[str] = None,
        zone: Optional[str] = None,
    ) -> list:
        """GET /api/equipment"""
        params = {}
        if status:
            params["status"] = status
        if zone:
            params["zone"] = zone
        data = await self._request("GET", "/api/equipment", params=params)
        # SenseHub may return list directly or wrapped in a data field
        if isinstance(data, list):
            return data
        return data.get("data", data.get("equipment", []))

    async def get_equipment_history(
        self,
        equipment_id: int,
        from_dt: Optional[str] = None,
        to_dt: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> list:
        """GET /api/equipment/:id/history"""
        params = {}
        if from_dt:
            params["from"] = from_dt
        if to_dt:
            params["to"] = to_dt
        if limit:
            params["limit"] = limit
        data = await self._request(
            "GET", f"/api/equipment/{equipment_id}/history", params=params
        )
        if isinstance(data, list):
            return data
        return data.get("data", data.get("history", []))

    # =========================================================================
    # Relay Control
    # =========================================================================

    async def control_relay(
        self, equipment_id: int, channel: int, state: bool
    ) -> dict:
        """POST /api/equipment/:id/relay/control"""
        return await self._request(
            "POST",
            f"/api/equipment/{equipment_id}/relay/control",
            json={"channel": channel, "state": state},
        )

    async def control_relay_all(
        self, equipment_id: int, states: list
    ) -> dict:
        """POST /api/equipment/:id/relay/all"""
        return await self._request(
            "POST",
            f"/api/equipment/{equipment_id}/relay/all",
            json={"states": states},
        )

    # =========================================================================
    # Automations
    # =========================================================================

    async def get_automations(self) -> list:
        """GET /api/automations"""
        data = await self._request("GET", "/api/automations")
        if isinstance(data, list):
            return data
        return data.get("data", data.get("automations", []))

    async def create_automation(self, automation_data: dict) -> dict:
        """POST /api/automations"""
        return await self._request(
            "POST", "/api/automations", json=automation_data
        )

    async def update_automation(
        self, automation_id: int, automation_data: dict
    ) -> dict:
        """PUT /api/automations/:id"""
        return await self._request(
            "PUT", f"/api/automations/{automation_id}", json=automation_data
        )

    async def delete_automation(self, automation_id: int) -> dict:
        """DELETE /api/automations/:id"""
        return await self._request("DELETE", f"/api/automations/{automation_id}")

    async def toggle_automation(self, automation_id: int) -> dict:
        """POST /api/automations/:id/toggle"""
        return await self._request(
            "POST", f"/api/automations/{automation_id}/toggle"
        )

    async def trigger_automation(self, automation_id: int) -> dict:
        """POST /api/automations/:id/trigger"""
        return await self._request(
            "POST", f"/api/automations/{automation_id}/trigger"
        )

    # =========================================================================
    # Alerts
    # =========================================================================

    async def get_alerts(
        self,
        severity: Optional[str] = None,
        acknowledged: Optional[bool] = None,
    ) -> list:
        """GET /api/alerts"""
        params = {}
        if severity:
            params["severity"] = severity
        if acknowledged is not None:
            params["acknowledged"] = str(acknowledged).lower()
        data = await self._request("GET", "/api/alerts", params=params)
        if isinstance(data, list):
            return data
        return data.get("data", data.get("alerts", []))

    async def acknowledge_alert(self, alert_id: int) -> dict:
        """POST /api/alerts/:id/acknowledge"""
        return await self._request(
            "POST", f"/api/alerts/{alert_id}/acknowledge"
        )
