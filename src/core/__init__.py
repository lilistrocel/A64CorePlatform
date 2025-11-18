"""
A64 Core Platform - Core Components
"""

from .plugin_system import PluginManager, ModuleManifest, get_plugin_manager

__all__ = [
    "PluginManager",
    "ModuleManifest",
    "get_plugin_manager"
]
