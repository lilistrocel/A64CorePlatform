#!/usr/bin/env python3
"""
Authentication Flow Test Script
Tests the complete authentication flow including registration, login, token refresh, etc.
Cross-platform compatible (Windows, Linux, macOS)

Usage:
    python tests/test_auth_flow.py
    python tests/test_auth_flow.py --url http://localhost:8000
"""

import argparse
import requests
import time
import sys
from datetime import datetime
from typing import Dict, Optional

try:
    from colorama import init, Fore, Style
    init(autoreset=True)
except ImportError:
    # Fallback if colorama not available
    class Fore:
        GREEN = RED = YELLOW = CYAN = WHITE = BLUE = ""
    class Style:
        RESET_ALL = ""


class AuthTester:
    """Authentication flow tester"""

    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.test_email = f"testuser_{int(time.time())}@example.com"
        self.test_password = "TestPass123@"
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.user_id: Optional[str] = None

    def print_header(self, text: str):
        """Print section header"""
        print(f"\n{Fore.CYAN}{'=' * 60}")
        print(f"{Fore.CYAN}{text}")
        print(f"{Fore.CYAN}{'=' * 60}")

    def print_test(self, test_name: str):
        """Print test name"""
        print(f"\n{Fore.YELLOW}Testing: {test_name}")
        print(f"{Fore.YELLOW}{'-' * 60}")

    def print_success(self, message: str):
        """Print success message"""
        print(f"{Fore.GREEN}[OK] {message}")

    def print_error(self, message: str):
        """Print error message"""
        print(f"{Fore.RED}[ERROR] {message}")

    def print_info(self, message: str):
        """Print info message"""
        print(f"{Fore.WHITE}{message}")

    def check_health(self) -> bool:
        """Check if API is healthy"""
        self.print_test("API Health Check")
        try:
            response = requests.get(f"{self.base_url}/api/health", timeout=5)
            if response.status_code == 200:
                data = response.json()
                self.print_success(f"API is healthy - {data.get('service')}")
                self.print_info(f"  Version: {data.get('version')}")
                self.print_info(f"  Status: {data.get('status')}")
                return True
            else:
                self.print_error(f"Health check failed: HTTP {response.status_code}")
                return False
        except Exception as e:
            self.print_error(f"Cannot connect to API: {e}")
            return False

    def test_register(self) -> bool:
        """Test user registration"""
        self.print_test("User Registration")

        payload = {
            "email": self.test_email,
            "password": self.test_password,
            "firstName": "Test",
            "lastName": "User"
        }

        try:
            response = requests.post(
                f"{self.base_url}/api/v1/auth/register",
                json=payload,
                timeout=10
            )

            if response.status_code == 201:
                data = response.json()
                self.user_id = data.get("userId")
                self.print_success("User registered successfully")
                self.print_info(f"  Email: {data.get('email')}")
                self.print_info(f"  User ID: {self.user_id}")
                self.print_info(f"  Name: {data.get('firstName')} {data.get('lastName')}")
                self.print_info(f"  Role: {data.get('role')}")
                self.print_info(f"  Email Verified: {data.get('isEmailVerified')}")
                return True
            else:
                self.print_error(f"Registration failed: HTTP {response.status_code}")
                self.print_info(f"  Response: {response.text}")
                return False

        except Exception as e:
            self.print_error(f"Registration error: {e}")
            return False

    def test_login(self) -> bool:
        """Test user login"""
        self.print_test("User Login")

        payload = {
            "email": self.test_email,
            "password": self.test_password
        }

        try:
            response = requests.post(
                f"{self.base_url}/api/v1/auth/login",
                json=payload,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                self.access_token = data.get("access_token")  # Snake case from API
                self.refresh_token = data.get("refresh_token")  # Snake case from API

                self.print_success("Login successful")
                self.print_info(f"  Access Token: {self.access_token[:50]}...")
                self.print_info(f"  Refresh Token: {self.refresh_token[:50]}...")
                self.print_info(f"  Token Type: {data.get('token_type')}")
                return True
            else:
                self.print_error(f"Login failed: HTTP {response.status_code}")
                self.print_info(f"  Response: {response.text}")
                return False

        except Exception as e:
            self.print_error(f"Login error: {e}")
            return False

    def test_get_current_user(self) -> bool:
        """Test getting current user with access token"""
        self.print_test("Get Current User")

        if not self.access_token:
            self.print_error("No access token available")
            return False

        headers = {
            "Authorization": f"Bearer {self.access_token}"
        }

        try:
            response = requests.get(
                f"{self.base_url}/api/v1/auth/me",
                headers=headers,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                self.print_success("Retrieved current user")
                self.print_info(f"  Email: {data.get('email')}")
                self.print_info(f"  User ID: {data.get('userId')}")
                self.print_info(f"  Name: {data.get('firstName')} {data.get('lastName')}")
                self.print_info(f"  Role: {data.get('role')}")
                self.print_info(f"  Active: {data.get('isActive')}")
                return True
            else:
                self.print_error(f"Get current user failed: HTTP {response.status_code}")
                self.print_info(f"  Response: {response.text}")
                return False

        except Exception as e:
            self.print_error(f"Get current user error: {e}")
            return False

    def test_refresh_token(self) -> bool:
        """Test token refresh"""
        self.print_test("Token Refresh")

        if not self.refresh_token:
            self.print_error("No refresh token available")
            return False

        payload = {
            "refresh_token": self.refresh_token  # Snake case for API
        }

        try:
            response = requests.post(
                f"{self.base_url}/api/v1/auth/refresh",
                json=payload,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                old_access = self.access_token[:30]
                old_refresh = self.refresh_token[:30]

                self.access_token = data.get("access_token")  # Snake case from API
                self.refresh_token = data.get("refresh_token")  # Snake case from API

                self.print_success("Token refreshed successfully")
                self.print_info(f"  Old Access Token: {old_access}...")
                self.print_info(f"  New Access Token: {self.access_token[:30]}...")
                self.print_info(f"  Old Refresh Token: {old_refresh}...")
                self.print_info(f"  New Refresh Token: {self.refresh_token[:30]}...")
                self.print_info(f"  Token Type: {data.get('token_type')}")
                return True
            else:
                self.print_error(f"Token refresh failed: HTTP {response.status_code}")
                self.print_info(f"  Response: {response.text}")
                return False

        except Exception as e:
            self.print_error(f"Token refresh error: {e}")
            return False

    def test_logout(self) -> bool:
        """Test user logout"""
        self.print_test("User Logout")

        if not self.access_token:
            self.print_error("No access token available")
            return False

        headers = {
            "Authorization": f"Bearer {self.access_token}"
        }

        try:
            response = requests.post(
                f"{self.base_url}/api/v1/auth/logout",
                headers=headers,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                self.print_success("Logout successful")
                self.print_info(f"  Message: {data.get('message')}")
                return True
            else:
                self.print_error(f"Logout failed: HTTP {response.status_code}")
                self.print_info(f"  Response: {response.text}")
                return False

        except Exception as e:
            self.print_error(f"Logout error: {e}")
            return False

    def test_invalid_login(self) -> bool:
        """Test login with invalid credentials"""
        self.print_test("Invalid Login (Should Fail)")

        payload = {
            "email": self.test_email,
            "password": "WrongPassword123!"
        }

        try:
            response = requests.post(
                f"{self.base_url}/api/v1/auth/login",
                json=payload,
                timeout=10
            )

            if response.status_code == 401:
                self.print_success("Invalid login correctly rejected")
                self.print_info(f"  Status: HTTP {response.status_code}")
                return True
            else:
                self.print_error(f"Expected 401, got: HTTP {response.status_code}")
                return False

        except Exception as e:
            self.print_error(f"Invalid login test error: {e}")
            return False

    def run_all_tests(self) -> Dict[str, bool]:
        """Run all authentication tests"""
        results = {}

        self.print_header("A64 Core Platform - Authentication Flow Test")
        print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"API URL: {self.base_url}")
        print(f"Test Email: {self.test_email}")

        # Test 1: Health Check
        results["health"] = self.check_health()
        if not results["health"]:
            self.print_error("API is not healthy, aborting tests")
            return results

        # Test 2: User Registration
        results["registration"] = self.test_register()

        # Test 3: User Login
        results["login"] = self.test_login()

        # Test 4: Get Current User
        if results["login"]:
            results["get_user"] = self.test_get_current_user()

        # Test 5: Token Refresh
        if results["login"]:
            results["refresh"] = self.test_refresh_token()

        # Test 6: Get User with New Token
        if results.get("refresh"):
            results["get_user_after_refresh"] = self.test_get_current_user()

        # Test 7: Invalid Login
        results["invalid_login"] = self.test_invalid_login()

        # Test 8: Logout
        if results["login"]:
            results["logout"] = self.test_logout()

        return results

    def print_summary(self, results: Dict[str, bool]):
        """Print test summary"""
        self.print_header("Test Summary")

        total = len(results)
        passed = sum(1 for v in results.values() if v)
        failed = total - passed

        print(f"\n{Fore.WHITE}Results:")
        for test_name, passed_test in results.items():
            status = f"{Fore.GREEN}[PASS]" if passed_test else f"{Fore.RED}[FAIL]"
            print(f"  {status} {test_name}")

        print(f"\n{Fore.CYAN}Summary:")
        print(f"{Fore.WHITE}  Total Tests: {total}")
        print(f"{Fore.GREEN}  Passed: {passed}")
        print(f"{Fore.RED}  Failed: {failed}")

        if failed == 0:
            print(f"\n{Fore.GREEN}{'=' * 60}")
            print(f"{Fore.GREEN}ALL TESTS PASSED!")
            print(f"{Fore.GREEN}{'=' * 60}")
        else:
            print(f"\n{Fore.RED}{'=' * 60}")
            print(f"{Fore.RED}SOME TESTS FAILED")
            print(f"{Fore.RED}{'=' * 60}")

        return failed == 0


def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description="Test authentication flow for A64 Core Platform"
    )
    parser.add_argument(
        "--url",
        default="http://localhost:8000",
        help="API base URL (default: http://localhost:8000)"
    )

    args = parser.parse_args()

    # Run tests
    tester = AuthTester(args.url)
    results = tester.run_all_tests()
    success = tester.print_summary(results)

    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
