"""
Plugin System - Core Manager

Manages module discovery, loading, and lifecycle for the A64 Core Platform.
This enables dynamic loading of modules like farm_manager, animal_manager, etc.
"""

import json
import importlib
import logging
from pathlib import Path
from typing import Dict, Optional, List
from dataclasses import dataclass
from fastapi import FastAPI, HTTPException

logger = logging.getLogger(__name__)


@dataclass
class ModuleManifest:
    """Module manifest metadata"""
    module_name: str
    display_name: str
    version: str
    description: str
    route_prefix: str
    dependencies: Dict[str, str]
    database_collections: List[str]
    permissions: List[str]
    license_required: bool
    enabled_by_default: bool = True
    core_module: bool = False


class PluginManager:
    """
    Manages module discovery, loading, and lifecycle.

    This class is responsible for:
    - Discovering available modules in src/modules/
    - Loading module manifests
    - Validating module dependencies
    - Registering modules with the main FastAPI application
    - Managing module lifecycle (startup/shutdown hooks)
    """

    def __init__(self, modules_dir: Optional[Path] = None):
        """
        Initialize the plugin manager.

        Args:
            modules_dir: Path to modules directory (defaults to src/modules/)
        """
        if modules_dir is None:
            # Default to src/modules/ relative to this file
            modules_dir = Path(__file__).parent.parent.parent / "modules"

        self.modules_dir = modules_dir
        self.loaded_modules: Dict[str, ModuleManifest] = {}
        self.module_instances: Dict[str, any] = {}

        logger.info(f"[PluginManager] Initialized with modules directory: {self.modules_dir}")

    def discover_modules(self) -> List[str]:
        """
        Discover all available modules in the modules directory.

        Returns:
            List of module names (directory names)
        """
        if not self.modules_dir.exists():
            logger.warning(f"[PluginManager] Modules directory does not exist: {self.modules_dir}")
            return []

        modules = []
        for item in self.modules_dir.iterdir():
            if item.is_dir() and not item.name.startswith("_"):
                # Check if it has a manifest.json
                manifest_path = item / "manifest.json"
                if manifest_path.exists():
                    modules.append(item.name)
                    logger.debug(f"[PluginManager] Discovered module: {item.name}")

        logger.info(f"[PluginManager] Discovered {len(modules)} modules: {modules}")
        return modules

    def _load_manifest(self, module_name: str) -> ModuleManifest:
        """
        Load module manifest from manifest.json

        Args:
            module_name: Name of the module

        Returns:
            ModuleManifest object

        Raises:
            FileNotFoundError: If manifest.json does not exist
            ValueError: If manifest.json is invalid
        """
        manifest_path = self.modules_dir / module_name / "manifest.json"

        if not manifest_path.exists():
            raise FileNotFoundError(f"Module manifest not found: {manifest_path}")

        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest_data = json.load(f)

            return ModuleManifest(**manifest_data)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid manifest.json for module '{module_name}': {e}")
        except TypeError as e:
            raise ValueError(f"Manifest.json has invalid structure for module '{module_name}': {e}")

    def _validate_dependencies(self, manifest: ModuleManifest) -> bool:
        """
        Validate module dependencies.

        Currently a placeholder - will check:
        - Core version compatibility
        - Python version
        - Required modules are loaded

        Args:
            manifest: Module manifest to validate

        Returns:
            True if dependencies are satisfied

        Raises:
            HTTPException: If dependencies are not satisfied
        """
        # TODO: Implement actual dependency validation
        # For now, just log and return True
        logger.debug(f"[PluginManager] Validating dependencies for {manifest.module_name}: {manifest.dependencies}")
        return True

    async def load_module(
        self,
        module_name: str,
        app: FastAPI,
        validate_license: bool = False
    ) -> ModuleManifest:
        """
        Load a module and register it with the application.

        Args:
            module_name: Name of the module to load
            app: FastAPI application instance
            validate_license: Whether to validate module license (future feature)

        Returns:
            ModuleManifest of the loaded module

        Raises:
            FileNotFoundError: If module or manifest not found
            ValueError: If manifest is invalid
            HTTPException: If license validation fails or dependencies not met
        """
        logger.info(f"[PluginManager] Loading module: {module_name}")

        # Load manifest
        manifest = self._load_manifest(module_name)

        # Validate dependencies
        self._validate_dependencies(manifest)

        # Validate license if required (placeholder for future implementation)
        if validate_license and manifest.license_required:
            # TODO: Implement license validation
            logger.warning(f"[PluginManager] License validation not yet implemented for {module_name}")

        # Import and register module
        try:
            # Import the module's register function
            module_path = f"src.modules.{module_name}.register"
            logger.debug(f"[PluginManager] Importing {module_path}")

            module = importlib.import_module(module_path)

            # Call the register function
            if hasattr(module, "register"):
                logger.info(f"[PluginManager] Registering module: {module_name}")
                module.register(app, prefix=manifest.route_prefix)

                # Store loaded module info
                self.loaded_modules[module_name] = manifest
                self.module_instances[module_name] = module

                logger.info(f"[PluginManager] ✓ Successfully loaded module: {manifest.display_name} v{manifest.version}")
            else:
                raise ValueError(f"Module '{module_name}' does not have a register() function")

        except ImportError as e:
            logger.error(f"[PluginManager] Failed to import module '{module_name}': {e}")
            raise
        except Exception as e:
            logger.error(f"[PluginManager] Failed to register module '{module_name}': {e}")
            raise

        return manifest

    async def load_all_modules(self, app: FastAPI, enabled_modules: Optional[List[str]] = None) -> Dict[str, ModuleManifest]:
        """
        Load all discovered modules (or specified modules).

        Args:
            app: FastAPI application instance
            enabled_modules: Optional list of module names to load (defaults to all discovered modules)

        Returns:
            Dictionary of loaded module manifests {module_name: manifest}
        """
        # Discover available modules
        available_modules = self.discover_modules()

        # Determine which modules to load
        if enabled_modules is None:
            # Load all modules that are enabled by default
            modules_to_load = available_modules
        else:
            # Load only specified modules
            modules_to_load = [m for m in enabled_modules if m in available_modules]

        logger.info(f"[PluginManager] Loading {len(modules_to_load)} modules: {modules_to_load}")

        # Load each module
        loaded = {}
        for module_name in modules_to_load:
            try:
                manifest = await self.load_module(module_name, app)
                loaded[module_name] = manifest
            except Exception as e:
                logger.error(f"[PluginManager] Failed to load module '{module_name}': {e}")
                # Continue loading other modules even if one fails
                continue

        logger.info(f"[PluginManager] Successfully loaded {len(loaded)}/{len(modules_to_load)} modules")
        return loaded

    def get_loaded_modules(self) -> Dict[str, ModuleManifest]:
        """
        Get all currently loaded modules.

        Returns:
            Dictionary of loaded module manifests
        """
        return self.loaded_modules.copy()

    def is_module_loaded(self, module_name: str) -> bool:
        """
        Check if a module is currently loaded.

        Args:
            module_name: Name of the module

        Returns:
            True if module is loaded, False otherwise
        """
        return module_name in self.loaded_modules


# Global plugin manager instance
_plugin_manager: Optional[PluginManager] = None


def get_plugin_manager() -> PluginManager:
    """
    Get the global plugin manager instance.

    Returns:
        PluginManager instance
    """
    global _plugin_manager
    if _plugin_manager is None:
        _plugin_manager = PluginManager()
    return _plugin_manager
