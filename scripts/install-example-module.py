#!/usr/bin/env python3
"""
Script to install the example module via the Module Management API

Usage:
    python scripts/install-example-module.py
"""

import requests
import json
import sys
import platform

# Fix Windows console encoding for emoji support
if platform.system() == "Windows":
    sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://localhost"

def login():
    """Login as super admin"""
    print("🔐 Logging in as super admin...")

    response = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        json={
            "email": "admin@a64platform.com",
            "password": "SuperAdmin123!"
        }
    )

    if response.status_code == 200:
        data = response.json()
        token = data["access_token"]
        print(f"✅ Login successful!")
        print(f"   User: {data['user']['email']}")
        print(f"   Role: {data['user']['role']}\n")
        return token
    else:
        print(f"❌ Login failed: {response.text}")
        sys.exit(1)

def install_module(token):
    """Install the example module"""
    print("📦 Installing example-app module...")

    headers = {"Authorization": f"Bearer {token}"}

    module_config = {
        "module_name": "example-app",
        "display_name": "Example Application",
        "docker_image": "localhost:5000/example-app:1.0.0",  # Using local registry
        "version": "1.0.0",
        "license_key": "TEST-EXAM-PLE1-2345",  # Valid segmented format (XXX-YYY-ZZZ-AAA)
        "ports": ["9001:8080"],
        "environment": {
            "MODULE_ENV": "production"
        },
        "description": "Example web application module for testing the Module Management System",
        "cpu_limit": "0.5",
        "memory_limit": "256m"
    }

    print(f"\n📋 Module Configuration:")
    print(json.dumps(module_config, indent=2))
    print()

    response = requests.post(
        f"{BASE_URL}/api/v1/modules/install",
        headers=headers,
        json=module_config
    )

    if response.status_code == 202:
        data = response.json()
        print(f"✅ Module installation started!")
        print(f"   Module Name: {data.get('module_name')}")
        print(f"   Status: {data.get('status')}")
        print(f"   Message: {data.get('message')}")
        print(f"\n🌐 Module will be accessible at: http://localhost:9001")
        print(f"\n💡 Tip: Check module status with:")
        print(f"   curl http://localhost/api/v1/modules/installed")
        return True
    else:
        print(f"❌ Module installation failed!")
        print(f"   Status Code: {response.status_code}")
        print(f"   Response: {json.dumps(response.json(), indent=2)}")
        return False

def check_module_status(token, module_name):
    """Check module status"""
    print(f"\n📊 Checking module status...")

    headers = {"Authorization": f"Bearer {token}"}

    response = requests.get(
        f"{BASE_URL}/api/v1/modules/{module_name}/status",
        headers=headers
    )

    if response.status_code == 200:
        data = response.json()
        print(f"✅ Module Status Retrieved:")
        print(json.dumps(data, indent=2))
    else:
        print(f"⚠️  Could not retrieve status: {response.text}")

def list_installed_modules(token):
    """List all installed modules"""
    print(f"\n📋 Listing installed modules...")

    headers = {"Authorization": f"Bearer {token}"}

    response = requests.get(
        f"{BASE_URL}/api/v1/modules/installed",
        headers=headers
    )

    if response.status_code == 200:
        data = response.json()
        modules = data.get("data", [])
        meta = data.get("meta", {})

        print(f"\n📦 Installed Modules ({meta.get('total', 0)} total):")
        if modules:
            for module in modules:
                print(f"   - {module.get('module_name')} ({module.get('status')})")
                print(f"     Version: {module.get('version')}")
                print(f"     Health: {module.get('health')}")
                print(f"     Ports: {module.get('ports')}")
                print()
        else:
            print("   (no modules installed yet)")
    else:
        print(f"⚠️  Could not list modules: {response.text}")

def main():
    """Main function"""
    print("=" * 70)
    print("🚀 Example Module Installation Script")
    print("=" * 70)
    print()

    # Step 1: Login
    token = login()

    # Step 2: Install module
    success = install_module(token)

    if not success:
        sys.exit(1)

    # Step 3: Wait a moment for installation
    import time
    print("\n⏳ Waiting 5 seconds for installation to complete...")
    time.sleep(5)

    # Step 4: Check status
    check_module_status(token, "example-app")

    # Step 5: List all modules
    list_installed_modules(token)

    print("\n" + "=" * 70)
    print("✅ Installation script completed!")
    print("=" * 70)
    print("\n📖 Next steps:")
    print("   1. Visit http://localhost:9001 to see the module")
    print("   2. Check health: curl http://localhost:9001/health")
    print("   3. View logs: docker logs a64core-example-app-dev")
    print("   4. Uninstall: DELETE /api/v1/modules/example-app")
    print()

if __name__ == "__main__":
    main()
