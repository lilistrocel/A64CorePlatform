#!/usr/bin/env python3
"""
Installation script for example-app-2 module

Tests multi-module port allocation and reverse proxy routing.
"""

import requests
import json
import sys
import time
import platform

# Fix Windows console encoding for emoji support
if platform.system() == "Windows":
    sys.stdout.reconfigure(encoding='utf-8')

# Configuration
BASE_URL = "http://localhost/api/v1"
ADMIN_EMAIL = "admin@a64platform.com"
ADMIN_PASSWORD = "SuperAdmin123!"

# Module configuration
MODULE_CONFIG = {
    "module_name": "example-app-2",
    "display_name": "Example Application 2",
    "docker_image": "localhost:5000/example-app-2:1.0.0",
    "version": "1.0.0",
    "license_key": "TEST-EXAM-PLE2-6789",
    "ports": ["9999:8080"],  # Port will be auto-allocated, 9999 is ignored
    "environment": {
        "MODULE_ENV": "production"
    },
    "description": "Second example module for testing multi-module port allocation",
    "cpu_limit": "0.5",
    "memory_limit": "256m"
}

def main():
    print("=" * 70)
    print("🚀 Example Module 2 Installation Script")
    print("=" * 70)
    print()

    # Step 1: Login
    print("🔐 Logging in as super admin...")
    login_response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )

    if login_response.status_code != 200:
        print(f"❌ Login failed: {login_response.status_code}")
        print(f"   Response: {login_response.text}")
        sys.exit(1)

    token = login_response.json()["access_token"]
    user_info = login_response.json()["user"]
    print(f"✅ Login successful!")
    print(f"   User: {user_info['email']}")
    print(f"   Role: {user_info['role']}")
    print()

    # Step 2: Install module
    print("📦 Installing example-app-2 module...")
    print()
    print("📋 Module Configuration:")
    print(json.dumps(MODULE_CONFIG, indent=2))
    print()

    headers = {"Authorization": f"Bearer {token}"}
    install_response = requests.post(
        f"{BASE_URL}/modules/install",
        json=MODULE_CONFIG,
        headers=headers
    )

    if install_response.status_code not in [200, 201, 202]:
        print(f"❌ Module installation failed!")
        print(f"   Status Code: {install_response.status_code}")
        print(f"   Response: {install_response.json()}")
        sys.exit(1)

    result = install_response.json()
    print("✅ Module installation started!")
    print(f"   Module Name: {result.get('module_name')}")
    print(f"   Status: {result.get('status')}")
    print(f"   Message: {result.get('message')}")

    # Extract allocated port if available
    module_data = result.get('module', {})
    allocated_ports = module_data.get('allocated_ports', {})
    if allocated_ports:
        external_port = list(allocated_ports.values())[0]
        print(f"   Auto-allocated Port: {external_port}")
        print(f"🌐 Module will be accessible at: http://localhost:{external_port}")
    print()

    print("💡 Tip: Check module status with:")
    print("   curl http://localhost/api/v1/modules/installed")
    print()

    # Step 3: Wait for module to be ready
    print("⏳ Waiting 5 seconds for installation to complete...")
    time.sleep(5)

    # Step 4: Get module status
    print()
    print("📊 Checking module status...")
    status_response = requests.get(
        f"{BASE_URL}/modules/example-app-2/status",
        headers=headers
    )

    if status_response.status_code == 200:
        print("✅ Module Status Retrieved:")
        print(json.dumps(status_response.json(), indent=2))
    else:
        print(f"⚠️  Could not retrieve status: {status_response.status_code}")

    # Step 5: List all installed modules
    print()
    print("📋 Listing installed modules...")
    list_response = requests.get(
        f"{BASE_URL}/modules/installed",
        headers=headers
    )

    if list_response.status_code == 200:
        modules = list_response.json().get("modules", [])
        print(f"\n📦 Installed Modules ({len(modules)} total):")
        for mod in modules:
            print(f"   - {mod['module_name']} ({mod['status']})")
            print(f"     Version: {mod['version']}")
            print(f"     Health: {mod.get('health', 'unknown')}")
            if mod.get('allocated_ports'):
                print(f"     Allocated Ports: {mod['allocated_ports']}")
            if mod.get('proxy_route'):
                print(f"     Proxy Route: {mod['proxy_route']}")
            print()

    print()
    print("=" * 70)
    print("✅ Installation script completed!")
    print("=" * 70)
    print()

    if allocated_ports:
        external_port = list(allocated_ports.values())[0]
        proxy_route = module_data.get('proxy_route', '/example-app-2')
        print("📖 Next steps:")
        print(f"   1. Visit http://localhost:{external_port} to see the module (direct)")
        print(f"   2. Visit http://localhost{proxy_route}/ to see via reverse proxy")
        print(f"   3. Check health: curl http://localhost{proxy_route}/health")
        print(f"   4. View logs: docker logs a64core-example-app-2")
        print(f"   5. Uninstall: DELETE /api/v1/modules/example-app-2")

if __name__ == "__main__":
    main()
