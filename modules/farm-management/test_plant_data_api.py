"""
PlantData API Testing Script

Tests all PlantData API endpoints including CSV import functionality.
"""

import requests
import json
from datetime import datetime
import io
import csv

# Configuration
BASE_URL = "http://localhost:8001"
AUTH_URL = "http://localhost:8000"

# Test user credentials (use super admin account for agronomist permission)
TEST_USER_LOGIN = {
    "email": "admin@a64platform.com",
    "password": "SuperAdmin123!"
}

# Color codes for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

# Global variables
access_token = None
plant_data_id = None
test_results = []


def log_test(test_name, passed, message=""):
    """Log test result"""
    status = f"{GREEN}[PASS]{RESET}" if passed else f"{RED}[FAIL]{RESET}"
    print(f"{status} - {test_name}")
    if message:
        print(f"  {message}")
    test_results.append({"test": test_name, "passed": passed, "message": message})


def login():
    """Login and get access token"""
    global access_token
    print(f"\n{BLUE}=== Authentication ==={RESET}")

    try:
        response = requests.post(
            f"{AUTH_URL}/api/v1/auth/login",
            json=TEST_USER_LOGIN,
            headers={"Content-Type": "application/json"}
        )

        if response.status_code == 200:
            data = response.json()
            # A64Core auth returns access_token directly, not under 'data'
            access_token = data.get("access_token") or data.get("data", {}).get("accessToken")
            if access_token:
                log_test("User login", True, f"Token obtained for {TEST_USER_LOGIN['email']}")
                return True
            else:
                log_test("User login", False, f"No access_token in response: {data.keys()}")
                return False
        else:
            log_test("User login", False, f"Status: {response.status_code}, Response: {response.text}")
            return False
    except Exception as e:
        log_test("User login", False, f"Error: {str(e)}")
        return False


def get_headers():
    """Get authorization headers"""
    return {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }


def test_create_plant_data():
    """Test 1: Create plant data"""
    global plant_data_id
    print(f"\n{BLUE}=== Test 1: Create Plant Data ==={RESET}")

    plant_data = {
        "plantName": "Test Tomato",
        "scientificName": "Solanum lycopersicum",
        "plantType": "Crop",
        "growthCycleDays": 90,
        "minTemperatureCelsius": 18.0,
        "maxTemperatureCelsius": 27.0,
        "optimalPHMin": 6.0,
        "optimalPHMax": 6.8,
        "wateringFrequencyDays": 2,
        "sunlightHoursDaily": "6-8",
        "fertilizationScheduleDays": 14,
        "pesticideScheduleDays": 21,
        "expectedYieldPerPlant": 5.0,
        "yieldUnit": "kg",
        "notes": "Popular salad and cooking vegetable",
        "tags": ["vegetable", "salad", "summer"]
    }

    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/farm/plant-data",
            json=plant_data,
            headers=get_headers()
        )

        if response.status_code == 201:
            data = response.json()
            plant_data_id = data["data"]["plantDataId"]
            version = data["data"]["dataVersion"]
            log_test("Create plant data", True, f"PlantData ID: {plant_data_id}, Version: {version}")
        else:
            log_test("Create plant data", False, f"Status: {response.status_code}, Response: {response.text}")
    except Exception as e:
        log_test("Create plant data", False, f"Error: {str(e)}")


def test_create_duplicate_plant():
    """Test 2: Try to create duplicate plant (should fail)"""
    print(f"\n{BLUE}=== Test 2: Create Duplicate Plant (Should Fail) ==={RESET}")

    plant_data = {
        "plantName": "Test Tomato",  # Same name as Test 1
        "plantType": "Crop",
        "growthCycleDays": 85,
        "expectedYieldPerPlant": 4.0,
        "yieldUnit": "kg"
    }

    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/farm/plant-data",
            json=plant_data,
            headers=get_headers()
        )

        if response.status_code == 409:
            log_test("Duplicate plant rejected", True, "409 Conflict returned as expected")
        else:
            log_test("Duplicate plant rejected", False, f"Expected 409, got {response.status_code}")
    except Exception as e:
        log_test("Duplicate plant rejected", False, f"Error: {str(e)}")


def test_get_plant_data_by_id():
    """Test 3: Get plant data by ID"""
    print(f"\n{BLUE}=== Test 3: Get Plant Data by ID ==={RESET}")

    try:
        response = requests.get(
            f"{BASE_URL}/api/v1/farm/plant-data/{plant_data_id}",
            headers=get_headers()
        )

        if response.status_code == 200:
            data = response.json()
            plant_name = data["data"]["plantName"]
            version = data["data"]["version"]
            log_test("Get plant data by ID", True, f"Retrieved: {plant_name}, Version: {version}")
        else:
            log_test("Get plant data by ID", False, f"Status: {response.status_code}, Response: {response.text}")
    except Exception as e:
        log_test("Get plant data by ID", False, f"Error: {str(e)}")


def test_list_plant_data():
    """Test 4: List all plant data with pagination"""
    print(f"\n{BLUE}=== Test 4: List Plant Data ==={RESET}")

    try:
        response = requests.get(
            f"{BASE_URL}/api/v1/farm/plant-data?page=1&perPage=10",
            headers=get_headers()
        )

        if response.status_code == 200:
            data = response.json()
            total = data["meta"]["total"]
            count = len(data["data"])
            log_test("List plant data", True, f"Total: {total}, Returned: {count}")
        else:
            log_test("List plant data", False, f"Status: {response.status_code}, Response: {response.text}")
    except Exception as e:
        log_test("List plant data", False, f"Error: {str(e)}")


def test_search_plant_data():
    """Test 5: Search plant data"""
    print(f"\n{BLUE}=== Test 5: Search Plant Data ==={RESET}")

    try:
        response = requests.get(
            f"{BASE_URL}/api/v1/farm/plant-data?search=tomato",
            headers=get_headers()
        )

        if response.status_code == 200:
            data = response.json()
            total = data["meta"]["total"]
            if total > 0:
                plant_name = data["data"][0]["plantName"]
                log_test("Search plant data", True, f"Found {total} result(s): {plant_name}")
            else:
                log_test("Search plant data", False, "No results found for 'tomato'")
        else:
            log_test("Search plant data", False, f"Status: {response.status_code}, Response: {response.text}")
    except Exception as e:
        log_test("Search plant data", False, f"Error: {str(e)}")


def test_update_plant_data():
    """Test 6: Update plant data (should increment version)"""
    print(f"\n{BLUE}=== Test 6: Update Plant Data ==={RESET}")

    update_data = {
        "growthCycleDays": 95,
        "notes": "Updated: Popular salad and cooking vegetable with improved yield"
    }

    try:
        response = requests.patch(
            f"{BASE_URL}/api/v1/farm/plant-data/{plant_data_id}",
            json=update_data,
            headers=get_headers()
        )

        if response.status_code == 200:
            data = response.json()
            version = data["data"]["dataVersion"]
            growth_days = data["data"]["growthCycleDays"]
            if version == 2 and growth_days == 95:
                log_test("Update plant data", True, f"Version incremented to {version}, growthCycleDays: {growth_days}")
            else:
                log_test("Update plant data", False, f"Expected version 2, got {version}")
        else:
            log_test("Update plant data", False, f"Status: {response.status_code}, Response: {response.text}")
    except Exception as e:
        log_test("Update plant data", False, f"Error: {str(e)}")


def test_download_csv_template():
    """Test 7: Download CSV template"""
    print(f"\n{BLUE}=== Test 7: Download CSV Template ==={RESET}")

    try:
        response = requests.get(
            f"{BASE_URL}/api/v1/farm/plant-data/template/csv",
            headers=get_headers()
        )

        if response.status_code == 200:
            csv_content = response.text
            lines = csv_content.strip().split('\n')
            if len(lines) >= 2:  # Header + example row
                log_test("Download CSV template", True, f"Template downloaded with {len(lines)} lines")
                print(f"  First line: {lines[0][:100]}...")
            else:
                log_test("Download CSV template", False, "CSV template is empty or invalid")
        else:
            log_test("Download CSV template", False, f"Status: {response.status_code}")
    except Exception as e:
        log_test("Download CSV template", False, f"Error: {str(e)}")


def test_import_csv():
    """Test 8: Import plant data from CSV"""
    print(f"\n{BLUE}=== Test 8: Import CSV ==={RESET}")

    # Create sample CSV content
    csv_content = """plantName,scientificName,plantType,growthCycleDays,minTemperatureCelsius,maxTemperatureCelsius,optimalPHMin,optimalPHMax,wateringFrequencyDays,sunlightHoursDaily,fertilizationScheduleDays,pesticideScheduleDays,expectedYieldPerPlant,yieldUnit,notes,tags
CSV Cucumber,Cucumis sativus,Crop,60,20,30,6.0,7.0,3,6-8,14,21,4,kg,Refreshing cucumber for salads,"vegetable,cucumber,summer"
CSV Lettuce,Lactuca sativa,Crop,45,15,20,6.0,7.0,2,4-6,7,0,1.5,kg,Crisp salad lettuce,"vegetable,lettuce,salad"
CSV Carrot,Daucus carota,Crop,75,15,25,5.5,6.5,4,6-8,21,0,0.5,kg,Sweet root vegetable,"vegetable,carrot,root"
"""

    try:
        # Create file-like object
        files = {
            'file': ('plants.csv', csv_content, 'text/csv')
        }

        headers = {
            "Authorization": f"Bearer {access_token}"
        }

        response = requests.post(
            f"{BASE_URL}/api/v1/farm/plant-data/import/csv?updateExisting=false",
            files=files,
            headers=headers
        )

        if response.status_code == 200:
            data = response.json()
            result = data["data"]
            created = result["created"]
            updated = result["updated"]
            skipped = result["skipped"]
            errors = result["errors"]

            if created > 0 and errors == 0:
                log_test("Import CSV", True, f"Created: {created}, Updated: {updated}, Skipped: {skipped}, Errors: {errors}")
            else:
                log_test("Import CSV", False, f"Created: {created}, Errors: {errors}")
                if result.get("errorDetails"):
                    print(f"  Error details: {result['errorDetails']}")
        else:
            log_test("Import CSV", False, f"Status: {response.status_code}, Response: {response.text}")
    except Exception as e:
        log_test("Import CSV", False, f"Error: {str(e)}")


def test_import_csv_update_existing():
    """Test 9: Import CSV with update existing flag"""
    print(f"\n{BLUE}=== Test 9: Import CSV with Update Existing ==={RESET}")

    # Create CSV with existing plant name (Test Tomato) with updated data
    csv_content = """plantName,scientificName,plantType,growthCycleDays,minTemperatureCelsius,maxTemperatureCelsius,optimalPHMin,optimalPHMax,wateringFrequencyDays,sunlightHoursDaily,fertilizationScheduleDays,pesticideScheduleDays,expectedYieldPerPlant,yieldUnit,notes,tags
Test Tomato,Solanum lycopersicum,Crop,100,20,28,6.0,6.8,1,8-10,7,14,6,kg,Updated via CSV import - improved variety,"vegetable,tomato,updated"
"""

    try:
        files = {
            'file': ('update_plants.csv', csv_content, 'text/csv')
        }

        headers = {
            "Authorization": f"Bearer {access_token}"
        }

        response = requests.post(
            f"{BASE_URL}/api/v1/farm/plant-data/import/csv?updateExisting=true",
            files=files,
            headers=headers
        )

        if response.status_code == 200:
            data = response.json()
            result = data["data"]
            updated = result["updated"]

            if updated > 0:
                log_test("Import CSV update existing", True, f"Updated: {updated} plant(s)")
            else:
                log_test("Import CSV update existing", False, f"Expected updates, got: {result}")
        else:
            log_test("Import CSV update existing", False, f"Status: {response.status_code}, Response: {response.text}")
    except Exception as e:
        log_test("Import CSV update existing", False, f"Error: {str(e)}")


def test_delete_plant_data():
    """Test 10: Delete plant data (soft delete)"""
    print(f"\n{BLUE}=== Test 10: Delete Plant Data ==={RESET}")

    try:
        response = requests.delete(
            f"{BASE_URL}/api/v1/farm/plant-data/{plant_data_id}",
            headers=get_headers()
        )

        if response.status_code == 200:
            log_test("Delete plant data", True, f"PlantData {plant_data_id} soft deleted")

            # Verify it's marked as inactive (not returned in list by default)
            list_response = requests.get(
                f"{BASE_URL}/api/v1/farm/plant-data",
                headers=get_headers()
            )

            if list_response.status_code == 200:
                data = list_response.json()
                deleted_in_list = any(p["plantDataId"] == plant_data_id for p in data["data"])
                if not deleted_in_list:
                    log_test("Verify soft delete", True, "Deleted plant not in active list")
                else:
                    log_test("Verify soft delete", False, "Deleted plant still in active list")
        else:
            log_test("Delete plant data", False, f"Status: {response.status_code}, Response: {response.text}")
    except Exception as e:
        log_test("Delete plant data", False, f"Error: {str(e)}")


def print_summary():
    """Print test summary"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST SUMMARY{RESET}")
    print(f"{BLUE}{'='*60}{RESET}")

    passed = sum(1 for result in test_results if result["passed"])
    total = len(test_results)

    print(f"\nTotal Tests: {total}")
    print(f"{GREEN}Passed: {passed}{RESET}")
    print(f"{RED}Failed: {total - passed}{RESET}")
    print(f"Success Rate: {(passed/total*100):.1f}%")

    if total - passed > 0:
        print(f"\n{RED}Failed Tests:{RESET}")
        for result in test_results:
            if not result["passed"]:
                print(f"  - {result['test']}")
                if result["message"]:
                    print(f"    {result['message']}")


def main():
    """Run all tests"""
    print(f"{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}PlantData API Test Suite{RESET}")
    print(f"{BLUE}{'='*60}{RESET}")
    print(f"Base URL: {BASE_URL}")
    print(f"Auth URL: {AUTH_URL}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Login as super admin
    if not login():
        print(f"\n{RED}Login failed. Aborting tests.{RESET}")
        return

    # Run tests
    test_create_plant_data()
    test_create_duplicate_plant()
    test_get_plant_data_by_id()
    test_list_plant_data()
    test_search_plant_data()
    test_update_plant_data()
    test_download_csv_template()
    test_import_csv()
    test_import_csv_update_existing()
    test_delete_plant_data()

    # Print summary
    print_summary()


if __name__ == "__main__":
    main()
