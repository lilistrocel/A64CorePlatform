"""
Port Management Service

Manages automatic port allocation, prevents conflicts, and tracks port usage.
Designed to scale to 10,000+ modules with efficient port allocation.

Key Features:
- Automatic port allocation (9001-19999 range)
- Port conflict prevention
- Port release on module uninstallation
- Reverse proxy route generation
- Scalable to thousands of modules
"""

import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.module import PortAllocation, PortRange

logger = logging.getLogger(__name__)


class PortManager:
    """
    Port Management Service

    Handles automatic port allocation and tracking for modules.
    Uses MongoDB for persistent port registry.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        """
        Initialize Port Manager

        Args:
            db: MongoDB database instance
        """
        self.db = db
        self.port_range = PortRange()  # Default: 9000-19999
        logger.info(f"Port Manager initialized: Range {self.port_range.start_port}-{self.port_range.end_port}")

    async def _ensure_indexes(self):
        """Create database indexes for efficient port lookups"""
        # Index on port for fast conflict detection
        await self.db.port_registry.create_index("port", unique=True)

        # Index on module_name for fast module port lookups
        await self.db.port_registry.create_index("module_name")

        # Index on status for filtering active ports
        await self.db.port_registry.create_index("status")

        # Compound index for efficient queries
        await self.db.port_registry.create_index([("module_name", 1), ("status", 1)])

        logger.info("Port registry indexes created")

    async def allocate_ports(
        self,
        module_name: str,
        internal_ports: List[int]
    ) -> Dict[int, int]:
        """
        Allocate external ports for a module's internal ports.

        Automatically finds available ports in the configured range.
        Returns mapping of internal_port -> external_port.

        Args:
            module_name: Name of the module requesting ports
            internal_ports: List of module's internal container ports

        Returns:
            Dictionary mapping internal ports to allocated external ports
            Example: {8080: 9001, 3000: 9002}

        Raises:
            RuntimeError: If no ports available or allocation fails
        """
        if not internal_ports:
            logger.warning(f"No internal ports specified for {module_name}")
            return {}

        logger.info(f"Allocating {len(internal_ports)} port(s) for {module_name}")

        allocated_ports = {}

        for internal_port in internal_ports:
            # Find next available port
            external_port = await self._find_next_available_port()

            if external_port is None:
                # Rollback already allocated ports
                await self._rollback_allocations(module_name, allocated_ports)
                raise RuntimeError(
                    f"No available ports in range {self.port_range.start_port}-{self.port_range.end_port}. "
                    f"Consider expanding port range or removing unused modules."
                )

            # Create port allocation record
            allocation = PortAllocation(
                port=external_port,
                module_name=module_name,
                internal_port=internal_port,
                allocated_at=datetime.utcnow(),
                status="active"
            )

            try:
                # Insert allocation record
                await self.db.port_registry.insert_one(allocation.dict())
                allocated_ports[internal_port] = external_port
                logger.info(f"Port {external_port} allocated to {module_name} (internal: {internal_port})")

            except Exception as e:
                # Rollback on error
                logger.error(f"Failed to allocate port {external_port}: {e}")
                await self._rollback_allocations(module_name, allocated_ports)
                raise RuntimeError(f"Port allocation failed: {str(e)}") from e

        logger.info(f"Successfully allocated {len(allocated_ports)} port(s) for {module_name}: {allocated_ports}")
        return allocated_ports

    async def _find_next_available_port(self) -> Optional[int]:
        """
        Find the next available port in the configured range.

        Uses efficient algorithm:
        1. Get all allocated ports
        2. Find first gap in sequence
        3. Return next available port

        Returns:
            Next available port number or None if no ports available
        """
        # Get all active port allocations, sorted
        allocations = await self.db.port_registry.find(
            {"status": "active"},
            {"port": 1, "_id": 0}
        ).sort("port", 1).to_list(length=None)

        allocated_port_set = {alloc["port"] for alloc in allocations}

        # Find first available port in range
        for port in range(self.port_range.start_port, self.port_range.end_port + 1):
            # Skip reserved ports
            if port in self.port_range.reserved_ports:
                continue

            # Check if port is available
            if port not in allocated_port_set:
                return port

        # No available ports
        logger.error("Port range exhausted! No available ports.")
        return None

    async def _rollback_allocations(
        self,
        module_name: str,
        allocated_ports: Dict[int, int]
    ):
        """
        Rollback port allocations in case of error.

        Args:
            module_name: Module name
            allocated_ports: Ports that were allocated (to be released)
        """
        if not allocated_ports:
            return

        logger.warning(f"Rolling back {len(allocated_ports)} port allocation(s) for {module_name}")

        for internal_port, external_port in allocated_ports.items():
            try:
                await self.db.port_registry.delete_one({
                    "module_name": module_name,
                    "port": external_port
                })
                logger.info(f"Rolled back port {external_port} for {module_name}")
            except Exception as e:
                logger.error(f"Failed to rollback port {external_port}: {e}")

    async def release_ports(self, module_name: str):
        """
        Release all ports allocated to a module.

        Called when module is uninstalled.

        Args:
            module_name: Name of the module
        """
        logger.info(f"Releasing ports for module: {module_name}")

        # Get all ports for this module
        allocations = await self.db.port_registry.find(
            {"module_name": module_name, "status": "active"}
        ).to_list(length=None)

        if not allocations:
            logger.warning(f"No ports found for {module_name}")
            return

        # Mark ports as released
        result = await self.db.port_registry.update_many(
            {"module_name": module_name, "status": "active"},
            {"$set": {"status": "released"}}
        )

        logger.info(f"Released {result.modified_count} port(s) for {module_name}")

        # Optionally delete released ports after some time (for audit trail)
        # For now, just mark as released

    async def get_module_ports(self, module_name: str) -> Dict[int, int]:
        """
        Get all allocated ports for a module.

        Args:
            module_name: Name of the module

        Returns:
            Dictionary mapping internal_port -> external_port
        """
        allocations = await self.db.port_registry.find(
            {"module_name": module_name, "status": "active"}
        ).to_list(length=None)

        return {
            alloc["internal_port"]: alloc["port"]
            for alloc in allocations
        }

    async def is_port_available(self, port: int) -> bool:
        """
        Check if a specific port is available.

        Args:
            port: Port number to check

        Returns:
            True if available, False if allocated
        """
        allocation = await self.db.port_registry.find_one({
            "port": port,
            "status": "active"
        })

        return allocation is None

    async def get_port_statistics(self) -> Dict[str, any]:
        """
        Get port allocation statistics.

        Returns:
            Statistics dictionary with allocation info
        """
        total_range = self.port_range.end_port - self.port_range.start_port + 1

        # Count active allocations
        active_count = await self.db.port_registry.count_documents({"status": "active"})

        # Count released allocations
        released_count = await self.db.port_registry.count_documents({"status": "released"})

        # Calculate available ports
        available_count = total_range - active_count - len(self.port_range.reserved_ports)

        return {
            "total_ports_in_range": total_range,
            "allocated_ports": active_count,
            "available_ports": available_count,
            "released_ports": released_count,
            "reserved_ports": len(self.port_range.reserved_ports),
            "port_range": {
                "start": self.port_range.start_port,
                "end": self.port_range.end_port
            },
            "utilization_percent": round((active_count / total_range) * 100, 2)
        }

    async def generate_proxy_route(self, module_name: str) -> str:
        """
        Generate reverse proxy route path for a module.

        Returns:
            Route path (e.g., "/example-app")
        """
        # Route is simply the module name prefixed with /
        route = f"/{module_name}"
        logger.info(f"Generated proxy route for {module_name}: {route}")
        return route

    async def parse_ports_from_config(self, ports_config: List[str]) -> List[int]:
        """
        Parse internal ports from port configuration.

        Handles formats:
        - "9001:8080" -> internal port 8080
        - "8080" -> internal port 8080

        Args:
            ports_config: List of port configurations

        Returns:
            List of internal ports
        """
        internal_ports = []

        for port_str in ports_config:
            # Handle "host:container" format
            if ":" in port_str:
                parts = port_str.split(":")
                internal_port = int(parts[-1])  # Last part is container port
            else:
                internal_port = int(port_str)

            internal_ports.append(internal_port)

        return internal_ports


# Create singleton instance (will be initialized with db in main.py)
port_manager: Optional[PortManager] = None


def get_port_manager() -> PortManager:
    """Get Port Manager singleton instance"""
    if port_manager is None:
        raise RuntimeError("Port Manager not initialized. Call init_port_manager() first.")
    return port_manager


async def init_port_manager(db: AsyncIOMotorDatabase):
    """
    Initialize Port Manager singleton.

    Call this during application startup.

    Args:
        db: MongoDB database instance
    """
    global port_manager
    port_manager = PortManager(db)
    await port_manager._ensure_indexes()
    logger.info("Port Manager initialized and ready")
