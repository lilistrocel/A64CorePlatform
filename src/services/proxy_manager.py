"""
Reverse Proxy Management Service

Automatically generates and manages NGINX reverse proxy configurations for modules.
Enables clean URLs like example.com/module-name instead of example.com:9001.

Key Features:
- Auto-generate NGINX location blocks for each module
- Reload NGINX without downtime
- Remove routes on module uninstallation
- Support for WebSocket, SSE, and long-running connections
- Production-ready configuration with security headers
"""

import logging
import os
import subprocess
from typing import Dict, Optional
from pathlib import Path

logger = logging.getLogger(__name__)


class ProxyManager:
    """
    Reverse Proxy Manager

    Manages NGINX reverse proxy configurations for modules.
    Automatically generates, updates, and removes proxy rules.
    """

    def __init__(self, nginx_config_dir: str = "/etc/nginx/conf.d"):
        """
        Initialize Proxy Manager

        Args:
            nginx_config_dir: Directory for NGINX module configurations
        """
        self.nginx_config_dir = nginx_config_dir
        self.modules_config_dir = os.path.join(nginx_config_dir, "modules")

        # Create modules config directory if it doesn't exist
        os.makedirs(self.modules_config_dir, exist_ok=True)

        logger.info(f"Proxy Manager initialized: Config dir = {self.modules_config_dir}")

    def generate_module_config(
        self,
        module_name: str,
        route_path: str,
        upstream_host: str,
        upstream_port: int,
        enable_websocket: bool = True
    ) -> str:
        """
        Generate NGINX reverse proxy configuration for a module.

        Args:
            module_name: Name of the module
            route_path: URL route path (e.g., /example-app)
            upstream_host: Backend host (usually container name)
            upstream_port: Backend port
            enable_websocket: Enable WebSocket support

        Returns:
            Generated NGINX configuration content
        """
        config = f"""# Auto-generated reverse proxy configuration for {module_name}
# Generated at: {os.popen('date').read().strip()}
# DO NOT EDIT MANUALLY - Managed by A64 Core Platform

# Upstream definition
upstream {module_name}_backend {{
    server {upstream_host}:{upstream_port};
    keepalive 32;
}}

# Location block
location {route_path} {{
    # Proxy headers
    proxy_pass http://{module_name}_backend;
    proxy_http_version 1.1;

    # Host headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Port $server_port;

"""

        if enable_websocket:
            config += """    # WebSocket support
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

"""

        config += """    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    # Buffering
    proxy_buffering on;
    proxy_buffer_size 4k;
    proxy_buffers 8 4k;
    proxy_busy_buffers_size 8k;

    # Security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/{module_name}_access.log;
    error_log /var/log/nginx/{module_name}_error.log;
}}

# Health check endpoint (if exists)
location {route_path}/health {{
    proxy_pass http://{module_name}_backend/health;
    proxy_http_version 1.1;
    access_log off;
}}
"""

        return config

    async def create_proxy_route(
        self,
        module_name: str,
        route_path: str,
        upstream_port: int,
        enable_websocket: bool = True
    ) -> bool:
        """
        Create reverse proxy route for a module.

        Args:
            module_name: Name of the module
            route_path: URL route path (e.g., /example-app)
            upstream_port: Backend port
            enable_websocket: Enable WebSocket support

        Returns:
            True if successful, False otherwise
        """
        logger.info(f"Creating proxy route for {module_name}: {route_path} -> :{upstream_port}")

        try:
            # Generate configuration
            # Use container name as upstream host (Docker DNS resolution)
            upstream_host = f"a64core-{module_name}"
            config_content = self.generate_module_config(
                module_name,
                route_path,
                upstream_host,
                upstream_port,
                enable_websocket
            )

            # Write configuration file
            config_file_path = os.path.join(
                self.modules_config_dir,
                f"{module_name}.conf"
            )

            with open(config_file_path, 'w') as f:
                f.write(config_content)

            logger.info(f"Created NGINX config file: {config_file_path}")

            # Test NGINX configuration
            if not self._test_nginx_config():
                logger.error("NGINX configuration test failed - rolling back")
                self._remove_config_file(module_name)
                return False

            # Reload NGINX
            if not await self.reload_nginx():
                logger.error("NGINX reload failed - rolling back")
                self._remove_config_file(module_name)
                return False

            logger.info(f"Proxy route created successfully for {module_name}")
            return True

        except Exception as e:
            logger.error(f"Failed to create proxy route for {module_name}: {e}")
            return False

    async def remove_proxy_route(self, module_name: str) -> bool:
        """
        Remove reverse proxy route for a module.

        Args:
            module_name: Name of the module

        Returns:
            True if successful, False otherwise
        """
        logger.info(f"Removing proxy route for {module_name}")

        try:
            # Remove configuration file
            removed = self._remove_config_file(module_name)

            if not removed:
                logger.warning(f"Config file not found for {module_name}")
                return True  # Already removed

            # Test NGINX configuration
            if not self._test_nginx_config():
                logger.error("NGINX configuration test failed after removing config")
                return False

            # Reload NGINX
            if not await self.reload_nginx():
                logger.error("NGINX reload failed")
                return False

            logger.info(f"Proxy route removed successfully for {module_name}")
            return True

        except Exception as e:
            logger.error(f"Failed to remove proxy route for {module_name}: {e}")
            return False

    def _remove_config_file(self, module_name: str) -> bool:
        """
        Remove NGINX configuration file for a module.

        Args:
            module_name: Name of the module

        Returns:
            True if file was removed, False if didn't exist
        """
        config_file_path = os.path.join(
            self.modules_config_dir,
            f"{module_name}.conf"
        )

        if os.path.exists(config_file_path):
            os.remove(config_file_path)
            logger.info(f"Removed config file: {config_file_path}")
            return True
        else:
            return False

    def _test_nginx_config(self) -> bool:
        """
        Test NGINX configuration for syntax errors.

        Returns:
            True if configuration is valid, False otherwise
        """
        try:
            result = subprocess.run(
                ["nginx", "-t"],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                logger.info("NGINX configuration test passed")
                return True
            else:
                logger.error(f"NGINX configuration test failed: {result.stderr}")
                return False

        except subprocess.TimeoutExpired:
            logger.error("NGINX configuration test timed out")
            return False
        except FileNotFoundError:
            logger.warning("nginx command not found - skipping config test")
            return True  # Assume valid if nginx not available
        except Exception as e:
            logger.error(f"Failed to test NGINX configuration: {e}")
            return False

    async def reload_nginx(self) -> bool:
        """
        Reload NGINX without downtime.

        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info("Reloading NGINX...")

            result = subprocess.run(
                ["nginx", "-s", "reload"],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                logger.info("NGINX reloaded successfully")
                return True
            else:
                logger.error(f"NGINX reload failed: {result.stderr}")
                return False

        except subprocess.TimeoutExpired:
            logger.error("NGINX reload timed out")
            return False
        except FileNotFoundError:
            logger.warning("nginx command not found - skipping reload")
            return True  # Assume success if nginx not available (development)
        except Exception as e:
            logger.error(f"Failed to reload NGINX: {e}")
            return False

    async def get_module_route_url(
        self,
        module_name: str,
        base_url: str = "http://localhost"
    ) -> str:
        """
        Get the full URL for accessing a module via reverse proxy.

        Args:
            module_name: Name of the module
            base_url: Base URL of the server

        Returns:
            Full URL (e.g., http://localhost/example-app)
        """
        route_path = f"/{module_name}"
        url = f"{base_url}{route_path}"
        return url


# Create singleton instance
proxy_manager = ProxyManager()


def get_proxy_manager() -> ProxyManager:
    """Get Proxy Manager singleton instance"""
    return proxy_manager
