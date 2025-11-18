# Plugin System Implementation Plan

**Status:** 📋 Planning Phase
**Start Date:** 2025-11-18
**Architecture:** Hybrid Plugin System with Shared Runtime
**Goal:** Enable installable modules (Farm Manager, Animal Manager, etc.) with one-click installation

---

## 🎯 Executive Summary

**Vision:** Transform A64 Core Platform into a modular system where customers can install only the modules they need, while maintaining the simplicity and performance of a monolithic architecture.

**Approach:** Hybrid Plugin System
- **Core Platform:** Authentication, users, admin (always installed)
- **Optional Modules:** Farm Manager, Animal Manager, etc. (installed on-demand)
- **Shared Runtime:** All modules run in same FastAPI application
- **Dynamic Loading:** Modules discovered and loaded at startup
- **License Enforcement:** Modules validate license before loading

**Benefits:**
- ✅ Simple customer experience (one-click install from admin panel)
- ✅ Pay for what you use (only download needed modules)
- ✅ Fast development (shared runtime, no network overhead)
- ✅ Independent updates (release modules separately)
- ✅ Strong license enforcement (no code without valid license)

---

## 📐 Architecture Overview

### Current State (Microservice)

```
Nginx (Port 80)
├── /api/v1/auth, /api/v1/users → Main API (Port 8000)
└── /api/v1/farm/* → Farm Management (Port 8001) [SEPARATE CONTAINER]

Main API Container
└── src/ (authentication, users, admin)

Farm Management Container [SEPARATE]
└── modules/farm-management/src/ (farms, blocks, harvests)

Shared MongoDB Database
```

### Target State (Plugin System)

```
Nginx (Port 80)
└── /api/* → Core Platform (Port 8000) [SINGLE CONTAINER]

Core Platform Container
├── src/core/ (authentication, users, admin)
├── src/plugin_system/ (module discovery, loading, validation)
└── /app/modules/ [PERSISTENT VOLUME]
    ├── farm-manager/ (installed via admin panel)
    │   ├── manifest.json
    │   ├── api/
    │   ├── services/
    │   └── models/
    ├── animal-manager/ (installed via admin panel)
    └── inventory/ (installed via admin panel)

Shared MongoDB Database
```

### Data Flow

```
1. Customer logs into admin panel
2. Clicks "Install Module" → Selects "Farm Manager"
3. Enters license key
4. Platform:
   a. Validates license with license server
   b. Downloads module from registry (S3/CDN)
   c. Extracts to /app/modules/farm-manager/
   d. Reads manifest.json
   e. Dynamically loads module into FastAPI app
   f. Registers routes (/api/v1/farm/*)
5. Module is now available
6. Customer can use farm features immediately
```

---

## 📋 Implementation Phases

### Phase 1: Core Refactoring (Week 1-2)

**Goal:** Merge farm-management into core as a module, establish plugin architecture

**Tasks:**

#### 1.1 Create Module Structure
```bash
# Create new directory structure
mkdir -p src/modules/farm_manager
mkdir -p src/core/plugin_system
mkdir -p modules_volume  # Persistent storage for installed modules
```

#### 1.2 Move Farm Management Code
```bash
# Move farm-management code to core
cp -r modules/farm-management/src/* src/modules/farm_manager/

# Update imports throughout
# FROM: from src.services.farm.farm_service import ...
# TO:   from src.modules.farm_manager.services.farm_service import ...
```

**Files to Move:**
- `modules/farm-management/src/api/` → `src/modules/farm_manager/api/`
- `modules/farm-management/src/services/` → `src/modules/farm_manager/services/`
- `modules/farm-management/src/models/` → `src/modules/farm_manager/models/`
- `modules/farm-management/src/utils/` → `src/modules/farm_manager/utils/`

#### 1.3 Create Module Manifest
```json
// src/modules/farm_manager/manifest.json
{
  "module_name": "farm_manager",
  "display_name": "Farm Manager",
  "version": "1.8.0",
  "description": "Complete farm and block management system",
  "route_prefix": "/api/v1/farm",
  "author": "A64 Platform Team",
  "dependencies": {
    "core": ">=1.3.0",
    "python": ">=3.11"
  },
  "database_collections": [
    "farms",
    "blocks",
    "plant_data_enhanced",
    "block_harvests",
    "alerts",
    "block_archives"
  ],
  "permissions": [
    "farm.view",
    "farm.create",
    "farm.edit",
    "farm.delete",
    "farm.manage_blocks",
    "farm.view_analytics"
  ],
  "license_required": true,
  "license_type": "per_installation"
}
```

#### 1.4 Create Module Registration Interface
```python
# src/modules/farm_manager/__init__.py
from fastapi import FastAPI
from .api.v1 import farms, blocks, dashboard, plant_data

def register(app: FastAPI, prefix: str = "/api/v1/farm"):
    """
    Register farm manager routes with main application

    Called by plugin system during module loading
    """
    app.include_router(farms.router, prefix=f"{prefix}/farms", tags=["farms"])
    app.include_router(blocks.router, prefix=f"{prefix}/blocks", tags=["blocks"])
    app.include_router(dashboard.router, prefix=f"{prefix}/dashboard", tags=["dashboard"])
    app.include_router(plant_data.router, prefix=f"{prefix}/plant-data", tags=["plant-data"])

def get_manifest():
    """Return module manifest for plugin system"""
    import json
    from pathlib import Path

    manifest_path = Path(__file__).parent / "manifest.json"
    with open(manifest_path) as f:
        return json.load(f)

def on_enable():
    """Called when module is enabled"""
    print("✅ Farm Manager module enabled")

def on_disable():
    """Called when module is disabled"""
    print("⚠️ Farm Manager module disabled")
```

#### 1.5 Consolidate Database Connections
```python
# Remove: modules/farm-management/src/services/database.py
# Use: src/shared/database.py (single connection pool for all modules)

# src/shared/database.py
class Database:
    """Shared database connection for core and all modules"""

    def __init__(self):
        self.client = None
        self.db = None

    async def connect(self):
        """Connect to MongoDB"""
        self.client = AsyncIOMotorClient(settings.MONGODB_URL)
        self.db = self.client[settings.MONGODB_DB_NAME]

        # Create indexes for core collections
        await self._create_core_indexes()

        # Create indexes for module collections (if modules installed)
        await self._create_module_indexes()

    async def _create_module_indexes(self):
        """Create indexes for installed modules"""
        # Farm Manager indexes
        if await self.is_module_installed("farm_manager"):
            await self.db.farms.create_index("farmId", unique=True)
            await self.db.blocks.create_index("blockId", unique=True)
            # ... other indexes

# Single instance shared by all
db = Database()
```

#### 1.6 Update Docker Compose
```yaml
# docker-compose.yml
services:
  api:  # Renamed from 'core' for clarity
    container_name: a64core-api-dev
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - ./src:/app/src
      - modules_volume:/app/modules  # NEW: Persistent volume for installed modules
    environment:
      - ENABLED_MODULES=farm_manager  # Built-in modules to load
      - MODULE_REGISTRY=https://registry.a64platform.com
      - AUTO_DISCOVER_MODULES=true

  # REMOVE: farm-management service (no longer needed)

  nginx:
    # Update config to route all /api/* to single service
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d

volumes:
  modules_volume:  # NEW: Persistent storage for installed modules
```

#### 1.7 Update Nginx Config
```nginx
# nginx/conf.d/default.conf
# REMOVE: nginx/conf.d/modules/farm-management.conf

# Single routing rule for all API endpoints
location /api/ {
    proxy_pass http://api:8000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
}
```

**Deliverables:**
- [ ] Farm Manager code moved to `src/modules/farm_manager/`
- [ ] All imports updated
- [ ] Module manifest created
- [ ] Module registration interface implemented
- [ ] Database connections consolidated
- [ ] Docker compose updated (single service)
- [ ] Nginx config simplified
- [ ] Tests passing

**Testing:**
```bash
# Start single service
docker-compose up -d api

# All endpoints should work
curl http://localhost/api/v1/auth/login
curl http://localhost/api/v1/farm/farms
curl http://localhost/api/v1/farm/blocks

# Check logs show module loaded
docker logs a64core-api-dev | grep "Farm Manager"
# Expected: "✅ Farm Manager module enabled"
```

---

### Phase 2: Plugin System Core (Week 3-4)

**Goal:** Build the plugin discovery, loading, and validation system

**Tasks:**

#### 2.1 Create Plugin Models
```python
# src/core/plugin_system/models.py
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from datetime import datetime

class ModuleManifest(BaseModel):
    """Module manifest schema"""
    module_name: str = Field(..., pattern="^[a-z_]+$")
    display_name: str
    version: str = Field(..., pattern=r"^\d+\.\d+\.\d+$")
    description: str
    route_prefix: str
    author: str
    dependencies: Dict[str, str]
    database_collections: List[str]
    permissions: List[str]
    license_required: bool = False
    license_type: Optional[str] = None  # per_installation, per_user, subscription

class InstalledModule(BaseModel):
    """Installed module database record"""
    module_name: str
    display_name: str
    version: str
    manifest: ModuleManifest
    installed_at: datetime
    installed_by: str  # User ID
    installed_by_email: str
    license_key_encrypted: Optional[str] = None
    is_enabled: bool = True
    last_loaded_at: Optional[datetime] = None
    load_error: Optional[str] = None
```

#### 2.2 Create Plugin Manager
```python
# src/core/plugin_system/manager.py
from pathlib import Path
from typing import List, Dict, Optional
import importlib
import logging
from fastapi import FastAPI, HTTPException

logger = logging.getLogger(__name__)

class PluginManager:
    """
    Manages module discovery, loading, and lifecycle
    """

    def __init__(self, modules_dir: Path, core_modules_dir: Path):
        """
        Args:
            modules_dir: Directory for installed modules (/app/modules/)
            core_modules_dir: Directory for built-in modules (src/modules/)
        """
        self.modules_dir = modules_dir
        self.core_modules_dir = core_modules_dir
        self.loaded_modules: Dict[str, ModuleManifest] = {}

    async def discover_all_modules(self) -> List[ModuleManifest]:
        """
        Discover all available modules (both built-in and installed)

        Returns:
            List of module manifests
        """
        modules = []

        # Discover built-in modules
        modules.extend(await self._discover_modules_in_dir(self.core_modules_dir))

        # Discover installed modules
        modules.extend(await self._discover_modules_in_dir(self.modules_dir))

        return modules

    async def _discover_modules_in_dir(self, directory: Path) -> List[ModuleManifest]:
        """Scan directory for modules with manifests"""
        modules = []

        if not directory.exists():
            return modules

        for path in directory.iterdir():
            if not path.is_dir():
                continue

            manifest_path = path / "manifest.json"
            if not manifest_path.exists():
                logger.warning(f"Module {path.name} missing manifest.json")
                continue

            try:
                manifest = ModuleManifest.parse_file(manifest_path)
                modules.append(manifest)
                logger.debug(f"Discovered module: {manifest.display_name}")
            except Exception as e:
                logger.error(f"Invalid manifest for {path.name}: {e}")

        return modules

    async def load_module(
        self,
        module_name: str,
        app: FastAPI,
        validate_license: bool = True
    ) -> ModuleManifest:
        """
        Load a module and register its routes

        Args:
            module_name: Name of module to load
            app: FastAPI application instance
            validate_license: Whether to validate license (skip for built-in modules)

        Returns:
            Module manifest

        Raises:
            HTTPException: If module not found or license invalid
        """
        logger.info(f"Loading module: {module_name}")

        # Find manifest
        manifest = await self._get_manifest(module_name)
        if not manifest:
            raise HTTPException(404, f"Module {module_name} not found")

        # Validate license if required
        if validate_license and manifest.license_required:
            is_valid = await self._validate_module_license(module_name)
            if not is_valid:
                raise HTTPException(403, f"Invalid license for {module_name}")

        # Check dependencies
        await self._check_dependencies(manifest)

        # Import module
        try:
            # Try built-in modules first
            module_path = f"src.modules.{module_name}"
            try:
                module = importlib.import_module(module_path)
            except ImportError:
                # Try installed modules
                module_path = f"modules.{module_name}"
                module = importlib.import_module(module_path)

            # Call registration function
            if hasattr(module, 'register'):
                module.register(app, prefix=manifest.route_prefix)
            else:
                raise HTTPException(500, f"Module {module_name} missing register() function")

            # Call on_enable hook
            if hasattr(module, 'on_enable'):
                module.on_enable()

            # Track loaded module
            self.loaded_modules[module_name] = manifest

            # Update last_loaded_at in database
            await self._update_module_loaded_time(module_name)

            logger.info(f"✅ Successfully loaded module: {manifest.display_name} v{manifest.version}")
            return manifest

        except ImportError as e:
            logger.error(f"Failed to import module {module_name}: {e}")
            raise HTTPException(500, f"Failed to load module: {e}")
        except Exception as e:
            logger.error(f"Error loading module {module_name}: {e}")
            raise HTTPException(500, f"Module load error: {e}")

    async def unload_module(self, module_name: str, app: FastAPI):
        """
        Unload a module (remove routes, cleanup resources)

        Note: Requires app restart to fully unload due to FastAPI limitations
        """
        if module_name not in self.loaded_modules:
            raise HTTPException(404, f"Module {module_name} not loaded")

        # Call on_disable hook
        module_path = f"src.modules.{module_name}"
        try:
            module = importlib.import_module(module_path)
            if hasattr(module, 'on_disable'):
                module.on_disable()
        except ImportError:
            pass

        # Remove from loaded modules
        del self.loaded_modules[module_name]

        logger.info(f"⚠️ Module {module_name} unloaded (restart required for full cleanup)")

    async def _get_manifest(self, module_name: str) -> Optional[ModuleManifest]:
        """Get module manifest from built-in or installed modules"""
        # Check built-in modules
        manifest_path = self.core_modules_dir / module_name / "manifest.json"
        if manifest_path.exists():
            return ModuleManifest.parse_file(manifest_path)

        # Check installed modules
        manifest_path = self.modules_dir / module_name / "manifest.json"
        if manifest_path.exists():
            return ModuleManifest.parse_file(manifest_path)

        return None

    async def _validate_module_license(self, module_name: str) -> bool:
        """Validate module license from database"""
        from src.shared.database import db

        installed = await db.installed_modules.find_one({"module_name": module_name})
        if not installed:
            return False

        # Decrypt license key
        from src.utils.encryption import decrypt_license_key
        license_key = decrypt_license_key(installed["license_key_encrypted"])

        # Validate with license server
        from src.utils.license_validator import validate_license
        return await validate_license(module_name, license_key)

    async def _check_dependencies(self, manifest: ModuleManifest):
        """Check if module dependencies are satisfied"""
        # Check core version
        from src.config import settings
        core_version = settings.VERSION

        required_core = manifest.dependencies.get("core")
        if required_core:
            # Parse version requirement (>=1.3.0)
            # Implement version comparison
            pass

    async def _update_module_loaded_time(self, module_name: str):
        """Update last_loaded_at timestamp in database"""
        from src.shared.database import db
        from datetime import datetime

        await db.installed_modules.update_one(
            {"module_name": module_name},
            {"$set": {"last_loaded_at": datetime.utcnow()}}
        )

# Global instance
plugin_manager = PluginManager(
    modules_dir=Path("/app/modules"),
    core_modules_dir=Path("src/modules")
)
```

#### 2.3 Integrate with Main Application
```python
# src/main.py
from fastapi import FastAPI
from src.core.api.v1 import auth, users, admin
from src.core.plugin_system.manager import plugin_manager
from src.config import settings
import logging

logger = logging.getLogger(__name__)

app = FastAPI(
    title="A64 Core Platform",
    version=settings.VERSION,
    description="Modular platform with plugin system"
)

# Load core routes (always enabled)
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])

@app.on_event("startup")
async def startup():
    """Initialize database and load modules"""
    logger.info("🚀 Starting A64 Core Platform...")

    # Connect to database
    from src.shared.database import db
    await db.connect()
    logger.info("✅ Database connected")

    # Discover and load modules
    if settings.AUTO_DISCOVER_MODULES:
        logger.info("🔍 Discovering modules...")
        modules = await plugin_manager.discover_all_modules()
        logger.info(f"Found {len(modules)} modules")

        # Load enabled modules
        enabled = settings.ENABLED_MODULES.split(",") if settings.ENABLED_MODULES else []

        for manifest in modules:
            if manifest.module_name in enabled:
                try:
                    await plugin_manager.load_module(
                        manifest.module_name,
                        app,
                        validate_license=manifest.license_required
                    )
                except Exception as e:
                    logger.error(f"Failed to load {manifest.module_name}: {e}")

    logger.info("✅ Platform ready")

@app.on_event("shutdown")
async def shutdown():
    """Cleanup resources"""
    from src.shared.database import db
    await db.disconnect()
    logger.info("👋 Platform shutdown complete")
```

#### 2.4 Create Module Management API
```python
# src/core/api/v1/modules.py
from fastapi import APIRouter, Depends, HTTPException
from src.middleware.auth import get_current_user, require_super_admin
from src.core.plugin_system.manager import plugin_manager
from src.core.plugin_system.models import InstalledModule
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/modules", tags=["modules"])

class ModuleInstallRequest(BaseModel):
    module_name: str
    version: str
    license_key: str

@router.get("/available")
async def list_available_modules(
    current_user = Depends(get_current_user)
):
    """List all available modules (built-in + installed)"""
    modules = await plugin_manager.discover_all_modules()
    return {"modules": [m.dict() for m in modules]}

@router.get("/loaded")
async def list_loaded_modules(
    current_user = Depends(get_current_user)
):
    """List currently loaded modules"""
    return {"modules": list(plugin_manager.loaded_modules.values())}

@router.post("/install")
async def install_module(
    request: ModuleInstallRequest,
    current_user = Depends(require_super_admin)
):
    """
    Install a module from registry

    Steps:
    1. Validate license with license server
    2. Download module package from registry
    3. Extract to /app/modules/{module_name}/
    4. Load module dynamically
    5. Store installation record in database
    """
    # TODO: Implement in Phase 3
    raise HTTPException(501, "Module installation not yet implemented - coming in Phase 3")

@router.post("/{module_name}/enable")
async def enable_module(
    module_name: str,
    current_user = Depends(require_super_admin)
):
    """Enable a module (load it into application)"""
    from src.main import app

    manifest = await plugin_manager.load_module(module_name, app)
    return {
        "status": "success",
        "message": f"Module {manifest.display_name} enabled",
        "module": manifest.dict()
    }

@router.post("/{module_name}/disable")
async def disable_module(
    module_name: str,
    current_user = Depends(require_super_admin)
):
    """Disable a module (requires restart for full unload)"""
    from src.main import app

    await plugin_manager.unload_module(module_name, app)
    return {
        "status": "success",
        "message": f"Module {module_name} disabled (restart required)",
        "restart_required": True
    }
```

**Deliverables:**
- [ ] Plugin system models created
- [ ] PluginManager implemented
- [ ] Module discovery working
- [ ] Module loading working
- [ ] License validation integrated
- [ ] Module management API created
- [ ] Integration with main app complete
- [ ] Documentation updated

**Testing:**
```bash
# Test module discovery
curl http://localhost/api/v1/modules/available

# Test loading farm manager
curl -X POST http://localhost/api/v1/modules/farm_manager/enable \
  -H "Authorization: Bearer $TOKEN"

# Verify routes registered
curl http://localhost/api/v1/farm/farms
```

---

### Phase 3: Module Installation System (Week 5-6)

**Goal:** Enable downloading and installing modules from registry

**Tasks:**

#### 3.1 Set up Module Registry
```bash
# Option 1: AWS S3
aws s3 mb s3://a64platform-modules
aws s3 sync ./module-packages/ s3://a64platform-modules/

# Option 2: Self-hosted on VPS
mkdir -p /var/www/registry.a64platform.com/modules/
nginx config for static file serving
```

**Registry Structure:**
```
https://registry.a64platform.com/modules/
├── catalog.json (list of all available modules)
├── farm-manager/
│   ├── 1.8.0/
│   │   ├── farm-manager-1.8.0.tar.gz
│   │   └── checksums.txt
│   ├── 1.9.0/
│   │   ├── farm-manager-1.9.0.tar.gz
│   │   └── checksums.txt
│   └── latest.json → { "version": "1.9.0" }
├── animal-manager/
│   └── 1.0.0/
│       ├── animal-manager-1.0.0.tar.gz
│       └── checksums.txt
```

#### 3.2 Implement Module Downloader
```python
# src/core/plugin_system/downloader.py
import httpx
import tarfile
from pathlib import Path
import hashlib

class ModuleDownloader:
    """Download and extract modules from registry"""

    def __init__(self, registry_url: str):
        self.registry_url = registry_url

    async def download_module(
        self,
        module_name: str,
        version: str,
        target_dir: Path
    ) -> Path:
        """
        Download module package from registry

        Returns:
            Path to extracted module directory
        """
        # Download package
        package_url = f"{self.registry_url}/{module_name}/{version}/{module_name}-{version}.tar.gz"

        async with httpx.AsyncClient() as client:
            response = await client.get(package_url)
            response.raise_for_status()

            # Save to temp file
            temp_file = Path(f"/tmp/{module_name}-{version}.tar.gz")
            temp_file.write_bytes(response.content)

        # Verify checksum
        await self._verify_checksum(temp_file, module_name, version)

        # Extract
        extract_path = target_dir / module_name
        extract_path.mkdir(parents=True, exist_ok=True)

        with tarfile.open(temp_file, "r:gz") as tar:
            tar.extractall(extract_path)

        # Cleanup temp file
        temp_file.unlink()

        return extract_path

    async def _verify_checksum(self, file_path: Path, module_name: str, version: str):
        """Verify package integrity"""
        # Download checksum file
        checksum_url = f"{self.registry_url}/{module_name}/{version}/checksums.txt"

        async with httpx.AsyncClient() as client:
            response = await client.get(checksum_url)
            expected_checksum = response.text.strip()

        # Calculate actual checksum
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                sha256.update(chunk)

        actual_checksum = sha256.hexdigest()

        if actual_checksum != expected_checksum:
            raise ValueError(f"Checksum mismatch for {module_name} v{version}")
```

#### 3.3 Complete Installation Endpoint
```python
# src/core/api/v1/modules.py (update)

@router.post("/install")
async def install_module(
    request: ModuleInstallRequest,
    current_user = Depends(require_super_admin)
):
    """Install a module from registry"""
    from src.core.plugin_system.downloader import ModuleDownloader
    from src.utils.encryption import encrypt_license_key
    from src.shared.database import db
    from datetime import datetime

    # Validate license first (don't download if invalid)
    from src.utils.license_validator import validate_license
    is_valid = await validate_license(request.module_name, request.license_key)
    if not is_valid:
        raise HTTPException(403, "Invalid license key")

    # Download module
    downloader = ModuleDownloader(settings.MODULE_REGISTRY)
    module_path = await downloader.download_module(
        request.module_name,
        request.version,
        Path("/app/modules")
    )

    # Read manifest
    manifest_file = module_path / "manifest.json"
    manifest = ModuleManifest.parse_file(manifest_file)

    # Store installation record
    await db.installed_modules.insert_one({
        "module_name": manifest.module_name,
        "display_name": manifest.display_name,
        "version": manifest.version,
        "manifest": manifest.dict(),
        "installed_at": datetime.utcnow(),
        "installed_by": current_user.userId,
        "installed_by_email": current_user.email,
        "license_key_encrypted": encrypt_license_key(request.license_key),
        "is_enabled": True
    })

    # Load module immediately
    from src.main import app
    await plugin_manager.load_module(manifest.module_name, app)

    return {
        "status": "success",
        "message": f"Module {manifest.display_name} v{manifest.version} installed and enabled",
        "module": manifest.dict()
    }

@router.delete("/{module_name}")
async def uninstall_module(
    module_name: str,
    current_user = Depends(require_super_admin)
):
    """Uninstall a module"""
    import shutil

    # Unload module first
    from src.main import app
    await plugin_manager.unload_module(module_name, app)

    # Remove files
    module_path = Path("/app/modules") / module_name
    if module_path.exists():
        shutil.rmtree(module_path)

    # Remove from database
    from src.shared.database import db
    await db.installed_modules.delete_one({"module_name": module_name})

    return {
        "status": "success",
        "message": f"Module {module_name} uninstalled"
    }
```

**Deliverables:**
- [ ] Module registry set up (S3 or self-hosted)
- [ ] Module downloader implemented
- [ ] Checksum verification working
- [ ] Installation endpoint complete
- [ ] Uninstallation endpoint complete
- [ ] Database records for installed modules
- [ ] Module packages created and uploaded to registry

---

### Phase 4: Admin UI Integration (Week 7-8)

**Goal:** Add one-click module installation to admin panel

**Tasks:**

#### 4.1 Create Module Management Page
```typescript
// frontend/admin-panel/src/pages/Modules.tsx

import React, { useState, useEffect } from 'react';

interface Module {
  module_name: string;
  display_name: string;
  version: string;
  description: string;
  is_installed: boolean;
  is_enabled: boolean;
}

export const ModulesPage: React.FC = () => {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    const response = await fetch('/api/v1/modules/available');
    const data = await response.json();
    setModules(data.modules);
  };

  const installModule = async (moduleName: string) => {
    const licenseKey = prompt(`Enter license key for ${moduleName}:`);
    if (!licenseKey) return;

    setLoading(true);
    try {
      const response = await fetch('/api/v1/modules/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module_name: moduleName,
          version: 'latest',
          license_key: licenseKey
        })
      });

      if (response.ok) {
        alert('Module installed successfully!');
        loadModules();
      } else {
        const error = await response.json();
        alert(`Installation failed: ${error.detail}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modules-page">
      <h1>Module Management</h1>

      <div className="modules-grid">
        {modules.map(module => (
          <div key={module.module_name} className="module-card">
            <h3>{module.display_name}</h3>
            <p>{module.description}</p>
            <p>Version: {module.version}</p>

            {module.is_installed ? (
              <div>
                <span className="badge badge-success">Installed</span>
                {module.is_enabled ? (
                  <button onClick={() => disableModule(module.module_name)}>
                    Disable
                  </button>
                ) : (
                  <button onClick={() => enableModule(module.module_name)}>
                    Enable
                  </button>
                )}
                <button onClick={() => uninstallModule(module.module_name)}>
                  Uninstall
                </button>
              </div>
            ) : (
              <button
                onClick={() => installModule(module.module_name)}
                disabled={loading}
              >
                Install
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
```

**Deliverables:**
- [ ] Module management page in admin panel
- [ ] One-click installation flow
- [ ] Module enable/disable controls
- [ ] Module uninstall flow
- [ ] License key input dialog
- [ ] Installation progress feedback

---

## 📊 Success Criteria

### Phase 1 Success
- [ ] Single FastAPI application running
- [ ] Farm Manager integrated as built-in module
- [ ] All existing features working
- [ ] No network overhead between core and farm features
- [ ] Single docker-compose service
- [ ] All tests passing

### Phase 2 Success
- [ ] Modules can be discovered automatically
- [ ] Modules can be loaded/unloaded dynamically
- [ ] License validation working
- [ ] API endpoints for module management
- [ ] Module manifest system working

### Phase 3 Success
- [ ] Modules can be downloaded from registry
- [ ] Installation/uninstallation working
- [ ] Checksum verification working
- [ ] Database tracking installed modules

### Phase 4 Success
- [ ] Admin panel shows available modules
- [ ] One-click installation from UI
- [ ] Customer can install module in < 5 minutes
- [ ] Module features immediately available after install

---

## 🔒 Security Considerations

**License Validation:**
- [ ] License keys encrypted at rest
- [ ] License validation on module load
- [ ] Online license verification with license server
- [ ] License revocation support

**Module Security:**
- [ ] Only download from trusted registry
- [ ] Checksum verification for all downloads
- [ ] Sandboxing for module code (future)
- [ ] Permission system for module capabilities

**Authentication:**
- [ ] Only super_admin can install modules
- [ ] Audit log for all module operations
- [ ] License keys never logged

---

## 📈 Performance Targets

**Module Loading:**
- [ ] Module discovery < 100ms
- [ ] Module loading < 500ms
- [ ] Application startup < 5 seconds

**Module Installation:**
- [ ] Download time depends on size (~50MB in < 10s on good connection)
- [ ] Extraction < 2 seconds
- [ ] Total install time < 30 seconds

**Runtime Performance:**
- [ ] No performance degradation vs current microservice approach
- [ ] Cross-module calls: ~1ms (vs ~50ms for HTTP)
- [ ] Memory overhead: < 50MB per module

---

## 🚀 Rollout Plan

**Week 1-2: Internal Testing**
- Test on development environment
- Verify all farm features working
- Performance benchmarks

**Week 3-4: Staging Deployment**
- Deploy to staging server
- Beta testing with select customers
- Gather feedback

**Week 5-6: Production Rollout**
- Deploy to production
- Monitor for issues
- Customer communication

**Week 7-8: Module Marketplace**
- Add more modules (Animal Manager, etc.)
- Enable customer self-service installation
- Marketing launch

---

## 📚 Documentation Requirements

**For Developers:**
- [ ] How to create a new module
- [ ] Module manifest specification
- [ ] Plugin system API reference
- [ ] Testing guidelines for modules

**For Customers:**
- [ ] How to install a module
- [ ] How to obtain license keys
- [ ] Troubleshooting guide
- [ ] Module comparison guide

**For Support:**
- [ ] Debugging module issues
- [ ] Common installation problems
- [ ] License validation troubleshooting

---

## 🔄 Migration from Current Microservice

### Checklist

**Pre-Migration:**
- [ ] Backup current database
- [ ] Document all current endpoints
- [ ] Create rollback plan

**Migration:**
- [ ] Create new module structure
- [ ] Move farm-management code
- [ ] Update imports
- [ ] Test all endpoints
- [ ] Update docker-compose
- [ ] Update nginx config

**Post-Migration:**
- [ ] Verify all features working
- [ ] Performance testing
- [ ] Update documentation
- [ ] Remove old farm-management service

**Rollback Plan:**
- Keep old docker-compose.yml as `docker-compose.yml.backup`
- Keep old nginx config as `farm-management.conf.backup`
- Can restore in < 5 minutes if issues found

---

## 🎯 Next Actions

1. **Review this plan** - Make sure architecture makes sense
2. **Create backup** - Commit current state before starting
3. **Start Phase 1** - Begin moving farm-management to modules
4. **Regular check-ins** - Review progress after each phase

---

## 📝 Notes

**Key Decisions:**
- ✅ Use shared runtime (not separate containers)
- ✅ Modules as plugins loaded at startup
- ✅ License validation per module
- ✅ Module registry for distribution
- ✅ One-click installation from admin panel

**Future Enhancements:**
- Hot-reload modules without restart
- Module dependency resolution
- Module marketplace with ratings/reviews
- Automatic module updates
- Module usage analytics
- Sandboxed module execution

---

**END OF IMPLEMENTATION PLAN**

This plan will be reviewed and updated as implementation progresses.
