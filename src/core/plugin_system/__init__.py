"""
Plugin System Core

Dynamic module loading system for A64 Core Platform.
"""

from .plugin_manager import PluginManager, ModuleManifest, get_plugin_manager

__all__ = [
    "PluginManager",
    "ModuleManifest",
    "get_plugin_manager"
]
