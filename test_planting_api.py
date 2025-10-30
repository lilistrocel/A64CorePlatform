#!/usr/bin/env python3
"""
Planting API Test Script

Tests all planting endpoints including:
- Create planting plan
- Mark as planted
- Get planting by ID
- List plantings
"""

import requests
import json
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:8001/api/v1/farm"
AUTH_URL = "http://localhost/api/v1/auth/login"

# Test credentials (make sure this user exists in A64Core)
# Using super admin account for testing (has farm.manage permission)
TEST_EMAIL = "admin@a64platform.com"
TEST_PASSWORD = "SuperAdmin123!"

# Global variables for test data
token = None
farm_id = None
block_id = None
plant_data_id = None
planting_id = None


def login():
    """Login and get JWT token"""
    print("\n[TEST 1] Authentication")
    print("=" * 60)

    response = requests.post(
        AUTH_URL,
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )

    if response.status_code != 200:
        print(f"ERROR: Login failed - {response.status_code}")
        print(f"Response: {response.text}")
        return False

    data = response.json()
    global token
    token = data.get("access_token")

    if not token:
        print("ERROR: No access token in response")
        return False

    print(f"SUCCESS: Authenticated successfully")
    print(f"Token: {token[:20]}...")
    return True


def create_farm():
    """Create a test farm"""
    print("\n[TEST 2] Create Farm")
    print("=" * 60)

    headers = {"Authorization": f"Bearer {token}"}

    farm_data = {
        "name": "Planting Test Farm",
        "location": {
            "address": "Test Location",
            "city": "Test City",
            "state": "CA",
            "country": "USA",
            "latitude": 37.7749,
            "longitude": -122.4194
        },
        "totalArea": 100.0
    }

    response = requests.post(
        f"{BASE_URL}/farms",
        headers=headers,
        json=farm_data
    )

    if response.status_code not in [200, 201]:
        print(f"ERROR: Failed to create farm - {response.status_code}")
        print(f"Response: {response.text}")
        return False

    data = response.json()
    global farm_id
    farm_id = data["data"]["farmId"]

    print(f"SUCCESS: Farm created")
    print(f"Farm ID: {farm_id}")
    print(f"Name: {data['data']['name']}")
    return True


def create_block():
    """Create a test block"""
    print("\n[TEST 3] Create Block")
    print("=" * 60)

    headers = {"Authorization": f"Bearer {token}"}

    block_data = {
        "name": "Test Block for Planting",
        "area": 10.0,
        "maxPlants": 500
    }

    response = requests.post(
        f"{BASE_URL}/farms/{farm_id}/blocks",
        headers=headers,
        json=block_data
    )

    if response.status_code not in [200, 201]:
        print(f"ERROR: Failed to create block - {response.status_code}")
        print(f"Response: {response.text}")
        return False

    data = response.json()
    global block_id
    block_id = data["data"]["blockId"]

    print(f"SUCCESS: Block created")
    print(f"Block ID: {block_id}")
    print(f"Name: {data['data']['name']}")
    print(f"State: {data['data']['state']}")
    print(f"Max Plants: {data['data']['maxPlants']}")
    return True


def create_plant_data():
    """Create test plant data"""
    print("\n[TEST 4] Create Plant Data")
    print("=" * 60)

    headers = {"Authorization": f"Bearer {token}"}

    # Use timestamp to ensure unique plant name
    timestamp_suffix = datetime.now().strftime("%H%M%S")

    plant_data = {
        "plantName": f"Test Tomato {timestamp_suffix}",
        "scientificName": "Solanum lycopersicum",
        "plantType": "Vegetable",
        "growthCycleDays": 90,
        "expectedYieldPerPlant": 5.0,
        "yieldUnit": "kg",
        "minTemperatureCelsius": 15.0,
        "maxTemperatureCelsius": 30.0,
        "wateringFrequencyDays": 2,
        "waterAmountLiters": 2.0,
        "spacingCm": 60.0,
        "description": "Test tomato plant for planting tests"
    }

    response = requests.post(
        f"{BASE_URL}/plant-data",
        headers=headers,
        json=plant_data
    )

    if response.status_code not in [200, 201]:
        print(f"ERROR: Failed to create plant data - {response.status_code}")
        print(f"Response: {response.text}")
        return False

    data = response.json()
    global plant_data_id
    plant_data_id = data["data"]["plantDataId"]

    print(f"SUCCESS: Plant data created")
    print(f"Plant Data ID: {plant_data_id}")
    print(f"Plant Name: {data['data']['plantName']}")
    print(f"Growth Cycle: {data['data']['growthCycleDays']} days")
    print(f"Expected Yield: {data['data']['expectedYieldPerPlant']} {data['data']['yieldUnit']}")
    return True


def create_planting_plan():
    """Create a planting plan"""
    print("\n[TEST 5] Create Planting Plan")
    print("=" * 60)

    headers = {"Authorization": f"Bearer {token}"}

    planting_data = {
        "blockId": block_id,
        "plants": [
            {
                "plantDataId": plant_data_id,
                "plantName": "Placeholder",  # Service will enrich this
                "quantity": 100,
                "plantDataSnapshot": {}  # Service will enrich this
            }
        ],
        "totalPlants": 100
    }

    response = requests.post(
        f"{BASE_URL}/plantings",
        headers=headers,
        json=planting_data
    )

    if response.status_code not in [200, 201]:
        print(f"ERROR: Failed to create planting plan - {response.status_code}")
        print(f"Response: {response.text}")
        return False

    data = response.json()
    global planting_id
    planting_id = data["data"]["planting"]["plantingId"]

    planting = data["data"]["planting"]
    block = data["data"]["block"]

    print(f"SUCCESS: Planting plan created")
    print(f"Planting ID: {planting_id}")
    print(f"Total Plants: {planting['totalPlants']}")
    print(f"Predicted Yield: {planting['predictedYield']} {planting['yieldUnit']}")
    print(f"Status: {planting['status']}")
    print(f"Block State: {block['state']}")
    print(f"Message: {data['message']}")
    return True


def mark_as_planted():
    """Mark planting as planted"""
    print("\n[TEST 6] Mark as Planted")
    print("=" * 60)

    headers = {"Authorization": f"Bearer {token}"}

    response = requests.post(
        f"{BASE_URL}/plantings/{planting_id}/mark-planted",
        headers=headers
    )

    if response.status_code not in [200, 201]:
        print(f"ERROR: Failed to mark as planted - {response.status_code}")
        print(f"Response: {response.text}")
        return False

    data = response.json()
    planting = data["data"]["planting"]
    block = data["data"]["block"]

    print(f"SUCCESS: Marked as planted")
    print(f"Planting ID: {planting['plantingId']}")
    print(f"Status: {planting['status']}")
    print(f"Planted By: {planting['plantedByEmail']}")
    print(f"Planted At: {planting['plantedAt']}")
    print(f"Estimated Harvest Start: {planting.get('estimatedHarvestStartDate', 'N/A')}")
    print(f"Block State: {block['state']}")
    print(f"Message: {data['message']}")
    return True


def get_planting():
    """Get planting by ID"""
    print("\n[TEST 7] Get Planting by ID")
    print("=" * 60)

    headers = {"Authorization": f"Bearer {token}"}

    response = requests.get(
        f"{BASE_URL}/plantings/{planting_id}",
        headers=headers
    )

    if response.status_code != 200:
        print(f"ERROR: Failed to get planting - {response.status_code}")
        print(f"Response: {response.text}")
        return False

    data = response.json()
    planting = data["data"]

    print(f"SUCCESS: Retrieved planting")
    print(f"Planting ID: {planting['plantingId']}")
    print(f"Block ID: {planting['blockId']}")
    print(f"Status: {planting['status']}")
    print(f"Total Plants: {planting['totalPlants']}")
    print(f"Predicted Yield: {planting['predictedYield']} {planting['yieldUnit']}")

    if planting.get('plants'):
        print(f"Plants in planting:")
        for plant in planting['plants']:
            print(f"  - {plant['plantName']}: {plant['quantity']} plants")

    return True


def list_plantings():
    """List plantings for farm"""
    print("\n[TEST 8] List Plantings")
    print("=" * 60)

    headers = {"Authorization": f"Bearer {token}"}

    response = requests.get(
        f"{BASE_URL}/plantings?farmId={farm_id}",
        headers=headers
    )

    if response.status_code != 200:
        print(f"ERROR: Failed to list plantings - {response.status_code}")
        print(f"Response: {response.text}")
        return False

    data = response.json()

    print(f"SUCCESS: Retrieved plantings list")
    print(f"Total: {data['meta']['total']}")
    print(f"Page: {data['meta']['page']}")
    print(f"Per Page: {data['meta']['perPage']}")

    if data['data']:
        print(f"\nPlantings:")
        for planting in data['data']:
            print(f"  - {planting['plantingId']}: {planting['totalPlants']} plants, status: {planting['status']}")

    return True


def cleanup():
    """Clean up test data"""
    print("\n[CLEANUP] Removing test data")
    print("=" * 60)

    headers = {"Authorization": f"Bearer {token}"}

    # Delete block (will cascade delete planting if needed)
    if block_id:
        # First transition block back to empty state
        requests.post(
            f"{BASE_URL}/farms/{farm_id}/blocks/{block_id}/state",
            headers=headers,
            json={"state": "empty"}
        )

        # Now delete block
        response = requests.delete(
            f"{BASE_URL}/farms/{farm_id}/blocks/{block_id}",
            headers=headers
        )
        print(f"Block deleted: {response.status_code}")

    # Delete plant data
    if plant_data_id:
        response = requests.delete(
            f"{BASE_URL}/plant-data/{plant_data_id}",
            headers=headers
        )
        print(f"Plant data deleted: {response.status_code}")

    # Delete farm
    if farm_id:
        response = requests.delete(
            f"{BASE_URL}/farms/{farm_id}",
            headers=headers
        )
        print(f"Farm deleted: {response.status_code}")

    print("Cleanup completed")


def save_results(test_results):
    """Save test results to JSON file"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"planting_api_test_results_{timestamp}.json"

    with open(filename, 'w') as f:
        json.dump(test_results, f, indent=2)

    print(f"\nTest results saved to: {filename}")


def main():
    """Run all tests"""
    print("=" * 60)
    print("PLANTING API TEST SUITE")
    print("=" * 60)
    print(f"Farm Module Base URL: {BASE_URL}")
    print(f"Auth URL: {AUTH_URL}")
    print(f"Test User: {TEST_EMAIL}")
    print("=" * 60)

    test_results = {
        "timestamp": datetime.now().isoformat(),
        "baseUrl": BASE_URL,
        "tests": []
    }

    tests = [
        ("Authentication", login),
        ("Create Farm", create_farm),
        ("Create Block", create_block),
        ("Create Plant Data", create_plant_data),
        ("Create Planting Plan", create_planting_plan),
        ("Mark as Planted", mark_as_planted),
        ("Get Planting", get_planting),
        ("List Plantings", list_plantings)
    ]

    passed = 0
    failed = 0

    for test_name, test_func in tests:
        try:
            result = test_func()
            test_results["tests"].append({
                "name": test_name,
                "status": "PASSED" if result else "FAILED",
                "timestamp": datetime.now().isoformat()
            })

            if result:
                passed += 1
            else:
                failed += 1
                print(f"\n{test_name} FAILED - Stopping tests")
                break

        except Exception as e:
            failed += 1
            print(f"\nERROR in {test_name}: {str(e)}")
            test_results["tests"].append({
                "name": test_name,
                "status": "ERROR",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            })
            break

    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print(f"Total Tests: {len(tests)}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Pass Rate: {(passed / len(tests) * 100):.1f}%")

    test_results["summary"] = {
        "total": len(tests),
        "passed": passed,
        "failed": failed,
        "passRate": f"{(passed / len(tests) * 100):.1f}%"
    }

    # Save results
    save_results(test_results)

    # Cleanup
    if passed > 0:  # Only cleanup if we created something
        cleanup()

    print("\n" + "=" * 60)
    print("PLANTING API TEST COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
