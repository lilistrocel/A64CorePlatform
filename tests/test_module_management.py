#!/usr/bin/env python3
"""
Module Management System Test Script
Tests all module management endpoints and functionality
"""
import requests
import json
import sys
from datetime import datetime

BASE_URL = "http://localhost"

class Colors:
    """ANSI color codes for output"""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    CYAN = '\033[96m'
    END = '\033[0m'

def print_header(text):
    """Print section header"""
    print(f"\n{Colors.CYAN}{'=' * 70}")
    print(f"{Colors.CYAN}{text}")
    print(f"{Colors.CYAN}{'=' * 70}{Colors.END}")

def print_test(test_name):
    """Print test name"""
    print(f"\n{Colors.YELLOW}TEST: {test_name}")
    print(f"{Colors.YELLOW}{'-' * 70}{Colors.END}")

def print_success(message):
    """Print success message"""
    try:
        print(f"{Colors.GREEN}✅ {message}{Colors.END}")
    except UnicodeEncodeError:
        print(f"{Colors.GREEN}[OK] {message}{Colors.END}")

def print_error(message):
    """Print error message"""
    try:
        print(f"{Colors.RED}❌ {message}{Colors.END}")
    except UnicodeEncodeError:
        print(f"{Colors.RED}[ERROR] {message}{Colors.END}")

def print_info(message):
    """Print info message"""
    print(f"   {message}")

def login_as_super_admin():
    """Login and get access token"""
    print_test("Login as Super Admin")

    response = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        json={
            "email": "admin@a64platform.com",
            "password": "SuperAdmin123!"
        }
    )

    print_info(f"Status Code: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        token = data["access_token"]
        print_success("Login successful")
        print_info(f"Token: {token[:50]}...")
        print_info(f"User: {data['user']['email']}")
        print_info(f"Role: {data['user']['role']}")
        return token
    else:
        print_error(f"Login failed: {response.text}")
        return None

def test_module_health():
    """Test module system health endpoint"""
    print_test("Module System Health Check (No Auth)")

    response = requests.get(f"{BASE_URL}/api/v1/modules/health")

    print_info(f"Status Code: {response.status_code}")
    data = response.json()
    print_info(f"Response: {json.dumps(data, indent=2)}")

    # Accept both 200 (healthy) and 503 (unhealthy - expected on Windows)
    if response.status_code in [200, 503]:
        detail = data.get("detail", {})
        print_success(f"Health check endpoint working - Status: {detail.get('status')}")
        print_info(f"Components:")
        for component, status in detail.get("components", {}).items():
            print_info(f"  - {component}: {status}")

        # On Windows, Docker might be unhealthy - that's expected
        if detail.get("components", {}).get("docker") == "unhealthy":
            print_info("Note: Docker unhealthy status is expected on Windows")

        return True
    else:
        print_error("Health check failed")
        return False

def test_list_modules_no_auth():
    """Test listing modules without authentication"""
    print_test("List Modules Without Auth (Should Fail)")

    response = requests.get(f"{BASE_URL}/api/v1/modules/installed")

    print_info(f"Status Code: {response.status_code}")
    print_info(f"Response: {json.dumps(response.json(), indent=2)}")

    if response.status_code == 403:
        print_success("Correctly blocked unauthenticated request")
        return True
    else:
        print_error(f"Expected 403, got {response.status_code}")
        return False

def test_list_modules_with_auth(token):
    """Test listing modules with authentication"""
    print_test("List Installed Modules (With Auth)")

    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/api/v1/modules/installed", headers=headers)

    print_info(f"Status Code: {response.status_code}")
    data = response.json()
    print_info(f"Response: {json.dumps(data, indent=2)}")

    if response.status_code == 200:
        modules = data.get("data", [])
        meta = data.get("meta", {})
        print_success(f"Module listing successful")
        print_info(f"Total modules: {meta.get('total', 0)}")
        print_info(f"Page: {meta.get('page')} of {meta.get('totalPages')}")
        if modules:
            print_info("Installed modules:")
            for module in modules:
                print_info(f"  - {module.get('module_name')} ({module.get('status')})")
        else:
            print_info("No modules installed yet")
        return True
    else:
        print_error(f"Module listing failed: {response.text}")
        return False

def test_audit_log(token):
    """Test audit log retrieval"""
    print_test("Get Module Audit Log")

    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/api/v1/modules/audit-log", headers=headers)

    print_info(f"Status Code: {response.status_code}")
    data = response.json()
    print_info(f"Response: {json.dumps(data, indent=2)}")

    if response.status_code == 200:
        logs = data.get("data", [])
        meta = data.get("meta", {})
        print_success(f"Audit log retrieval successful")
        print_info(f"Total log entries: {meta.get('total', 0)}")
        if logs:
            print_info("Recent audit entries:")
            for log in logs[:3]:  # Show first 3
                print_info(f"  - {log.get('operation')} on {log.get('module_name')} by {log.get('user_email')}")
        else:
            print_info("No audit log entries yet")
        return True
    else:
        print_error(f"Audit log retrieval failed: {response.text}")
        return False

def test_install_module_invalid_data(token):
    """Test module installation with invalid data"""
    print_test("Install Module with Invalid Data (Should Fail)")

    headers = {"Authorization": f"Bearer {token}"}
    invalid_config = {
        "module_name": "INVALID NAME!",  # Should fail validation (uppercase, special chars)
        "docker_image": "test-image:latest",  # Should fail ('latest' tag forbidden)
        "version": "invalid",  # Should fail (not semantic versioning)
        "license_key": "invalid-key"
    }

    response = requests.post(
        f"{BASE_URL}/api/v1/modules/install",
        headers=headers,
        json=invalid_config
    )

    print_info(f"Status Code: {response.status_code}")
    print_info(f"Response: {json.dumps(response.json(), indent=2)}")

    if response.status_code == 422:
        print_success("Validation correctly rejected invalid data")
        return True
    else:
        print_error(f"Expected 422 validation error, got {response.status_code}")
        return False

def test_install_module_untrusted_registry(token):
    """Test module installation from untrusted registry"""
    print_test("Install Module from Untrusted Registry (Should Fail)")

    headers = {"Authorization": f"Bearer {token}"}
    config = {
        "module_name": "test-module",
        "docker_image": "untrusted-registry.com/malicious-image:1.0.0",  # Untrusted registry
        "version": "1.0.0",
        "license_key": "TEST-LICENSE-KEY-123"
    }

    response = requests.post(
        f"{BASE_URL}/api/v1/modules/install",
        headers=headers,
        json=config
    )

    print_info(f"Status Code: {response.status_code}")
    print_info(f"Response: {json.dumps(response.json(), indent=2)}")

    if response.status_code in [400, 422]:
        print_success("Correctly rejected untrusted registry")
        return True
    else:
        print_error(f"Expected 400/422 error, got {response.status_code}")
        return False

def test_install_module_latest_tag(token):
    """Test module installation with 'latest' tag"""
    print_test("Install Module with 'latest' Tag (Should Fail)")

    headers = {"Authorization": f"Bearer {token}"}
    config = {
        "module_name": "test-module",
        "docker_image": "docker.io/library/nginx:latest",  # 'latest' tag forbidden
        "version": "1.0.0",
        "license_key": "TEST-LICENSE-KEY-123"
    }

    response = requests.post(
        f"{BASE_URL}/api/v1/modules/install",
        headers=headers,
        json=config
    )

    print_info(f"Status Code: {response.status_code}")
    print_info(f"Response: {json.dumps(response.json(), indent=2)}")

    if response.status_code == 422:
        print_success("Correctly rejected 'latest' tag")
        return True
    else:
        print_error(f"Expected 422 validation error, got {response.status_code}")
        return False

def test_nonexistent_module_status(token):
    """Test getting status of non-existent module"""
    print_test("Get Status of Non-Existent Module (Should Fail)")

    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(
        f"{BASE_URL}/api/v1/modules/nonexistent-module-xyz/status",
        headers=headers
    )

    print_info(f"Status Code: {response.status_code}")
    print_info(f"Response: {json.dumps(response.json(), indent=2)}")

    if response.status_code == 404:
        print_success("Correctly returned 404 for non-existent module")
        return True
    else:
        print_error(f"Expected 404, got {response.status_code}")
        return False

def main():
    """Run all module management tests"""
    print_header("MODULE MANAGEMENT SYSTEM - COMPREHENSIVE TEST SUITE")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"API URL: {BASE_URL}")

    results = []

    # Test 1: Health check (no auth)
    results.append(("Module health check", test_module_health()))

    # Test 2: Login
    token = login_as_super_admin()
    if not token:
        print_error("\n❌ CRITICAL: Could not obtain access token. Aborting tests.")
        sys.exit(1)
    results.append(("Super admin login", True))

    # Test 3: List modules without auth
    results.append(("List modules (no auth)", test_list_modules_no_auth()))

    # Test 4: List modules with auth
    results.append(("List modules (with auth)", test_list_modules_with_auth(token)))

    # Test 5: Audit log
    results.append(("Audit log retrieval", test_audit_log(token)))

    # Test 6: Install with invalid data
    results.append(("Install invalid data", test_install_module_invalid_data(token)))

    # Test 7: Install from untrusted registry
    results.append(("Install untrusted registry", test_install_module_untrusted_registry(token)))

    # Test 8: Install with 'latest' tag
    results.append(("Install 'latest' tag", test_install_module_latest_tag(token)))

    # Test 9: Get status of non-existent module
    results.append(("Non-existent module status", test_nonexistent_module_status(token)))

    # Print summary
    print_header("TEST SUMMARY")

    for test_name, passed in results:
        if passed:
            try:
                print(f"{Colors.GREEN}✅ PASSED{Colors.END}: {test_name}")
            except UnicodeEncodeError:
                print(f"{Colors.GREEN}[PASS]{Colors.END}: {test_name}")
        else:
            try:
                print(f"{Colors.RED}❌ FAILED{Colors.END}: {test_name}")
            except UnicodeEncodeError:
                print(f"{Colors.RED}[FAIL]{Colors.END}: {test_name}")

    passed_count = sum(1 for _, passed in results if passed)
    total_count = len(results)

    print(f"\n{Colors.CYAN}Results: {passed_count}/{total_count} tests passed{Colors.END}")

    if passed_count == total_count:
        print(f"\n{Colors.GREEN}{'=' * 70}")
        try:
            print(f"🎉 ALL TESTS PASSED!")
        except UnicodeEncodeError:
            print(f"SUCCESS: ALL TESTS PASSED!")
        print(f"{'=' * 70}{Colors.END}\n")
        sys.exit(0)
    else:
        failed_count = total_count - passed_count
        print(f"\n{Colors.RED}{'=' * 70}")
        try:
            print(f"⚠️  {failed_count} TEST(S) FAILED")
        except UnicodeEncodeError:
            print(f"WARNING: {failed_count} TEST(S) FAILED")
        print(f"{'=' * 70}{Colors.END}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
