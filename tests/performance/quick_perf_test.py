#!/usr/bin/env python3
"""
quick_perf_test.py
Quick Performance Test Script for A64 Core Platform
Cross-platform Python implementation (Windows, Linux, macOS)

This script replaces quick-perf-test.sh with a cross-platform solution
that works on Windows and Linux without requiring Apache Bench.

Usage:
    python quick_perf_test.py
    python quick_perf_test.py --url http://localhost:8000 --requests 1000 --concurrency 10

Requirements:
    pip install requests colorama

Features:
    - Cross-platform (Windows, Linux, macOS)
    - Color-coded output
    - Configurable via command line arguments
    - No external tools required (pure Python)
    - Performance metrics (req/sec, avg response time, error rate)
"""

import argparse
import platform
import time
import statistics
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple
from datetime import datetime
import sys

try:
    import requests
    from colorama import init, Fore, Style
    # Initialize colorama for cross-platform color support
    init(autoreset=True)
except ImportError:
    print("ERROR: Required packages not installed.")
    print("Please run: pip install requests colorama")
    sys.exit(1)


class PerformanceTest:
    """Cross-platform performance testing class"""

    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()

    def test_endpoint(
        self,
        endpoint: str,
        method: str = "GET",
        num_requests: int = 100,
        concurrency: int = 10,
        json_data: dict = None
    ) -> Dict:
        """
        Test an endpoint with specified number of requests and concurrency

        Args:
            endpoint: API endpoint path
            method: HTTP method (GET, POST, etc.)
            num_requests: Total number of requests to make
            concurrency: Number of concurrent requests
            json_data: JSON payload for POST requests

        Returns:
            Dictionary with performance metrics
        """
        url = f"{self.base_url}{endpoint}"
        response_times = []
        status_codes = []
        errors = []

        def make_request() -> Tuple[float, int, str]:
            """Make a single request and return (response_time, status_code, error)"""
            try:
                start_time = time.time()

                if method == "GET":
                    response = self.session.get(url, timeout=30)
                elif method == "POST":
                    response = self.session.post(
                        url,
                        json=json_data,
                        headers={"Content-Type": "application/json"},
                        timeout=30
                    )
                else:
                    raise ValueError(f"Unsupported method: {method}")

                response_time = (time.time() - start_time) * 1000  # Convert to ms
                return response_time, response.status_code, None

            except Exception as e:
                return 0, 0, str(e)

        # Execute requests with thread pool
        start_time = time.time()

        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = [executor.submit(make_request) for _ in range(num_requests)]

            for future in as_completed(futures):
                response_time, status_code, error = future.result()

                if error:
                    errors.append(error)
                else:
                    response_times.append(response_time)
                    status_codes.append(status_code)

        total_time = time.time() - start_time

        # Calculate metrics
        successful_requests = len([s for s in status_codes if 200 <= s < 300])
        failed_requests = len(status_codes) - successful_requests + len(errors)

        metrics = {
            "total_requests": num_requests,
            "successful_requests": successful_requests,
            "failed_requests": failed_requests,
            "error_rate": (failed_requests / num_requests) * 100,
            "total_time": total_time,
            "requests_per_second": num_requests / total_time if total_time > 0 else 0,
        }

        if response_times:
            metrics.update({
                "avg_response_time": statistics.mean(response_times),
                "min_response_time": min(response_times),
                "max_response_time": max(response_times),
                "median_response_time": statistics.median(response_times),
            })

            # Calculate percentiles
            sorted_times = sorted(response_times)
            p95_index = int(len(sorted_times) * 0.95)
            p99_index = int(len(sorted_times) * 0.99)

            metrics["p95_response_time"] = sorted_times[p95_index] if sorted_times else 0
            metrics["p99_response_time"] = sorted_times[p99_index] if sorted_times else 0

        return metrics


def print_header():
    """Print test header with system information"""
    print("\n" + "=" * 60)
    print(f"{Fore.CYAN}A64 Core Platform - Quick Performance Test")
    print("=" * 60)
    print(f"Platform: {platform.system()} {platform.release()}")
    print(f"Python: {platform.python_version()}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60 + "\n")


def print_test_header(test_name: str, endpoint: str):
    """Print individual test header"""
    print(f"\n{Fore.YELLOW}{'-' * 60}")
    print(f"{Fore.YELLOW}Test: {test_name}")
    print(f"{Fore.YELLOW}Endpoint: {endpoint}")
    print(f"{Fore.YELLOW}{'-' * 60}")


def print_metrics(metrics: Dict):
    """Print performance metrics in a formatted way"""
    print(f"\n{Fore.CYAN}Performance Metrics:")
    print(f"{Fore.WHITE}  Total Requests:     {metrics['total_requests']}")
    print(f"{Fore.GREEN}  Successful:         {metrics['successful_requests']}")

    # Color failed requests based on count
    failed_color = Fore.RED if metrics['failed_requests'] > 0 else Fore.GREEN
    print(f"{failed_color}  Failed:             {metrics['failed_requests']}")

    # Color error rate based on threshold
    error_rate = metrics['error_rate']
    error_color = Fore.GREEN if error_rate < 1 else (Fore.YELLOW if error_rate < 5 else Fore.RED)
    print(f"{error_color}  Error Rate:         {error_rate:.2f}%")

    print(f"{Fore.WHITE}  Total Time:         {metrics['total_time']:.2f}s")

    # Color req/sec based on target (> 100 req/sec is good)
    req_per_sec = metrics['requests_per_second']
    rps_color = Fore.GREEN if req_per_sec > 100 else (Fore.YELLOW if req_per_sec > 50 else Fore.RED)
    print(f"{rps_color}  Requests/sec:       {req_per_sec:.2f}")

    if 'avg_response_time' in metrics:
        print(f"\n{Fore.CYAN}Response Times (ms):")
        print(f"{Fore.WHITE}  Average:            {metrics['avg_response_time']:.2f}ms")
        print(f"{Fore.WHITE}  Median:             {metrics['median_response_time']:.2f}ms")
        print(f"{Fore.WHITE}  Min:                {metrics['min_response_time']:.2f}ms")
        print(f"{Fore.WHITE}  Max:                {metrics['max_response_time']:.2f}ms")

        # Color p95 based on target (< 500ms is good)
        p95 = metrics['p95_response_time']
        p95_color = Fore.GREEN if p95 < 500 else (Fore.YELLOW if p95 < 1000 else Fore.RED)
        print(f"{p95_color}  P95:                {p95:.2f}ms")

        # Color p99 based on target (< 1000ms is good)
        p99 = metrics['p99_response_time']
        p99_color = Fore.GREEN if p99 < 1000 else (Fore.YELLOW if p99 < 2000 else Fore.RED)
        print(f"{p99_color}  P99:                {p99:.2f}ms")


def check_api_health(base_url: str) -> bool:
    """Check if API is healthy before running tests"""
    print(f"{Fore.BLUE}Checking API health...")

    try:
        response = requests.get(f"{base_url}/api/health", timeout=10)

        if response.status_code == 200:
            print(f"{Fore.GREEN}[OK] API is healthy (HTTP {response.status_code})")
            return True
        else:
            print(f"{Fore.RED}[ERROR] API health check failed (HTTP {response.status_code})")
            return False

    except requests.exceptions.ConnectionError:
        print(f"{Fore.RED}[ERROR] Cannot connect to API at {base_url}")
        print(f"{Fore.YELLOW}Make sure the API is running: docker-compose up -d")
        return False
    except Exception as e:
        print(f"{Fore.RED}[ERROR] Health check error: {e}")
        return False


def main():
    """Main test execution"""
    parser = argparse.ArgumentParser(
        description="Cross-platform performance test for A64 Core Platform"
    )
    parser.add_argument(
        "--url",
        default="http://localhost:8000",
        help="API base URL (default: http://localhost:8000)"
    )
    parser.add_argument(
        "--requests",
        type=int,
        default=1000,
        help="Total number of requests per test (default: 1000)"
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=10,
        help="Number of concurrent requests (default: 10)"
    )
    parser.add_argument(
        "--skip-health-check",
        action="store_true",
        help="Skip initial health check"
    )

    args = parser.parse_args()

    print_header()

    print(f"Configuration:")
    print(f"  API URL:            {args.url}")
    print(f"  Total Requests:     {args.requests}")
    print(f"  Concurrent:         {args.concurrency}")
    print()

    # Health check
    if not args.skip_health_check:
        if not check_api_health(args.url):
            sys.exit(1)
        print()

    # Initialize test runner
    tester = PerformanceTest(args.url)

    # Test 1: Health Endpoint (Baseline)
    print_test_header("Health Endpoint (Baseline)", "GET /api/health")
    metrics = tester.test_endpoint(
        "/api/health",
        method="GET",
        num_requests=args.requests,
        concurrency=args.concurrency
    )
    print_metrics(metrics)

    # Test 2: Readiness Endpoint (With Database Check)
    print_test_header("Readiness Endpoint (With Database Check)", "GET /api/ready")
    metrics = tester.test_endpoint(
        "/api/ready",
        method="GET",
        num_requests=args.requests,
        concurrency=args.concurrency
    )
    print_metrics(metrics)

    # Test 3: User Registration (Write Operation)
    print_test_header("User Registration (Write Operation)", "POST /api/v1/auth/register")
    print(f"{Fore.YELLOW}Note: Most requests will fail with 409 (duplicate email) - this is expected")

    timestamp = int(time.time() * 1000000)  # Microsecond timestamp
    registration_data = {
        "email": f"loadtest{timestamp}@example.com",
        "password": "TestPass123!",
        "firstName": "Load",
        "lastName": "Test"
    }

    metrics = tester.test_endpoint(
        "/api/v1/auth/register",
        method="POST",
        num_requests=100,  # Fewer requests for write operations
        concurrency=5,     # Lower concurrency for write operations
        json_data=registration_data
    )
    print_metrics(metrics)

    # Test 4: API Documentation (Static Content)
    print_test_header("API Documentation (Static Content)", "GET /api/docs")
    metrics = tester.test_endpoint(
        "/api/docs",
        method="GET",
        num_requests=args.requests,
        concurrency=args.concurrency
    )
    print_metrics(metrics)

    # Summary
    print(f"\n{'=' * 60}")
    print(f"{Fore.GREEN}Performance Test Complete")
    print("=" * 60)
    print()
    print("Performance Targets (from CLAUDE.md):")
    print("  - Response Time p95: < 500ms")
    print("  - Response Time p99: < 1000ms")
    print("  - Throughput: > 100 req/sec")
    print("  - Error Rate: < 0.1%")
    print()
    print("For comprehensive load testing, use:")
    print("  k6 run tests/performance/load-test-auth.js")
    print()
    print("For monitoring during tests:")
    print("  docker stats")
    print("  docker-compose logs -f api")
    print()


if __name__ == "__main__":
    main()
