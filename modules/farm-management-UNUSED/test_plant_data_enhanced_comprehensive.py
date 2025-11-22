"""
Comprehensive Integration Tests for Plant Data Enhanced API

This script tests all 9 API endpoints with real HTTP requests against the running service.
"""

import requests
import json
import time
from datetime import datetime
from uuid import uuid4


BASE_URL = "http://localhost:8001/api/v1/farm"
API_URL = f"{BASE_URL}/plant-data-enhanced"

# Test Results Storage
test_results = {
    "timestamp": datetime.now().isoformat(),
    "total_tests": 0,
    "passed": 0,
    "failed": 0,
    "errors": [],
    "tests": []
}


def log_test(test_name, passed, details="", response_time=0):
    """Log test result"""
    test_results["total_tests"] += 1
    if passed:
        test_results["passed"] += 1
        print(f"[PASS] {test_name} ({response_time:.2f}ms)")
    else:
        test_results["failed"] += 1
        test_results["errors"].append({"test": test_name, "details": details})
        print(f"[FAIL] {test_name}: {details}")

    test_results["tests"].append({
        "name": test_name,
        "passed": passed,
        "response_time_ms": response_time,
        "details": details
    })


def get_auth_token():
    """Get authentication token from main API"""
    # For testing, we'll use a mock token or get from main API
    # In production environment, this should authenticate properly
    login_data = {
        "email": "admin@farmtech.com",
        "password": "Admin@123"
    }

    try:
        response = requests.post("http://localhost:8000/api/v1/auth/login", json=login_data)
        if response.status_code == 200:
            return response.json()["data"]["token"]
    except:
        pass

    # Fallback: Return None and tests will check for 401
    return None


def get_headers(token=None):
    """Get headers with optional authorization"""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


# ====================================================================================
# PHASE 1: Basic CRUD Operations
# ====================================================================================

def test_create_plant_full_fields(token):
    """Test 1: Create plant data with full fields"""
    plant_data = {
        "plantName": f"Test Tomato {uuid4().hex[:8]}",
        "scientificName": f"Solanum test {uuid4().hex[:8]}",
        "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
        "growthCycle": {
            "germinationDays": 7,
            "vegetativeDays": 30,
            "floweringDays": 14,
            "fruitingDays": 35,
            "harvestDurationDays": 14,
            "totalCycleDays": 100
        },
        "yieldInfo": {
            "yieldPerPlant": 5.0,
            "yieldUnit": "kg",
            "expectedWastePercentage": 10.0
        },
        "fertilizerSchedule": [{
            "stage": "vegetative",
            "fertilizerType": "NPK 20-10-10",
            "quantityPerPlant": 50.0,
            "quantityUnit": "grams",
            "frequencyDays": 14,
            "npkRatio": "20-10-10",
            "notes": "Apply around base"
        }],
        "pesticideSchedule": [{
            "stage": "vegetative",
            "pesticideType": "Neem oil",
            "targetPest": "Aphids",
            "quantityPerPlant": 10.0,
            "quantityUnit": "ml",
            "frequencyDays": 14,
            "safetyNotes": "Organic safe",
            "preharvestIntervalDays": 1
        }],
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 15.0,
                "maxCelsius": 30.0,
                "optimalCelsius": 24.0
            },
            "humidity": {
                "minPercentage": 60.0,
                "maxPercentage": 80.0,
                "optimalPercentage": 70.0
            },
            "co2RequirementPpm": 1000,
            "airCirculation": "Moderate air flow"
        },
        "wateringRequirements": {
            "frequencyDays": 2,
            "waterType": "filtered",
            "amountPerPlantLiters": 2.0,
            "droughtTolerance": "low",
            "notes": "Keep soil moist"
        },
        "soilRequirements": {
            "phRequirements": {
                "minPH": 6.0,
                "maxPH": 6.8,
                "optimalPH": 6.5
            },
            "soilTypes": ["loamy", "sandy"],
            "nutrientsRecommendations": "High N during vegetative",
            "ecRangeMs": "2.0-3.5",
            "tdsRangePpm": "1400-2450",
            "notes": "Well-draining soil essential"
        },
        "diseasesAndPests": [{
            "name": "Early Blight",
            "symptoms": "Dark brown spots on leaves",
            "preventionMeasures": "Crop rotation",
            "treatmentOptions": "Copper fungicides",
            "severity": "medium"
        }],
        "lightRequirements": {
            "lightType": "full_sun",
            "minHoursDaily": 6.0,
            "maxHoursDaily": 10.0,
            "optimalHoursDaily": 8.0,
            "intensityLux": 30000,
            "intensityPpfd": 400,
            "photoperiodSensitive": False,
            "notes": "Full sun essential"
        },
        "gradingStandards": [{
            "gradeName": "Premium",
            "sizeRequirements": "7-10 cm diameter",
            "colorRequirements": "Deep red",
            "defectTolerance": "No defects",
            "otherCriteria": "Firm texture",
            "priceMultiplier": 1.5
        }],
        "economicsAndLabor": {
            "averageMarketValuePerKg": 3.50,
            "currency": "USD",
            "totalManHoursPerPlant": 1.5,
            "plantingHours": 0.1,
            "maintenanceHours": 1.0,
            "harvestingHours": 0.4,
            "notes": "Labor intensive"
        },
        "additionalInfo": {
            "growthHabit": "indeterminate",
            "spacing": {
                "betweenPlantsCm": 60.0,
                "betweenRowsCm": 90.0,
                "plantsPerSquareMeter": 1.85
            },
            "supportRequirements": "stakes",
            "companionPlants": ["Basil", "Marigold"],
            "incompatiblePlants": ["Fennel", "Potatoes"],
            "notes": "Prune suckers for better yield"
        },
        "tags": ["vegetable", "fruit", "summer", "high-value", "test"]
    }

    start = time.time()
    response = requests.post(API_URL, json=plant_data, headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 201:
        data = response.json()["data"]
        log_test("Create plant with full fields", True, response_time=elapsed)
        return data["plantDataId"]
    else:
        log_test("Create plant with full fields", False, f"Status {response.status_code}: {response.text}", elapsed)
        return None


def test_create_plant_minimal_fields(token):
    """Test 2: Create plant data with minimal required fields"""
    plant_data = {
        "plantName": f"Test Lettuce Minimal {uuid4().hex[:8]}",
        "scientificName": f"Lactuca test {uuid4().hex[:8]}",
        "farmTypeCompatibility": ["hydroponic"],
        "growthCycle": {
            "germinationDays": 3,
            "vegetativeDays": 25,
            "floweringDays": 0,
            "fruitingDays": 0,
            "harvestDurationDays": 7,
            "totalCycleDays": 35
        },
        "yieldInfo": {
            "yieldPerPlant": 0.3,
            "yieldUnit": "kg",
            "expectedWastePercentage": 15.0
        },
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 7.0,
                "maxCelsius": 24.0,
                "optimalCelsius": 18.0
            }
        },
        "wateringRequirements": {
            "frequencyDays": 1,
            "waterType": "filtered",
            "droughtTolerance": "low"
        },
        "soilRequirements": {
            "phRequirements": {
                "minPH": 6.0,
                "maxPH": 7.0,
                "optimalPH": 6.5
            },
            "soilTypes": ["loamy"]
        },
        "lightRequirements": {
            "lightType": "partial_shade",
            "minHoursDaily": 4.0,
            "maxHoursDaily": 8.0,
            "optimalHoursDaily": 6.0,
            "photoperiodSensitive": True
        },
        "economicsAndLabor": {
            "currency": "USD",
            "totalManHoursPerPlant": 0.3,
            "plantingHours": 0.05,
            "maintenanceHours": 0.15,
            "harvestingHours": 0.1
        },
        "additionalInfo": {
            "growthHabit": "bush",
            "spacing": {
                "betweenPlantsCm": 20.0,
                "betweenRowsCm": 30.0,
                "plantsPerSquareMeter": 16.67
            },
            "supportRequirements": "none"
        }
    }

    start = time.time()
    response = requests.post(API_URL, json=plant_data, headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 201:
        log_test("Create plant with minimal fields", True, response_time=elapsed)
        return response.json()["data"]["plantDataId"]
    else:
        log_test("Create plant with minimal fields", False, f"Status {response.status_code}: {response.text}", elapsed)
        return None


def test_get_plant_by_id(token, plant_id):
    """Test 3: Get plant data by ID"""
    start = time.time()
    response = requests.get(f"{API_URL}/{plant_id}", headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 200:
        data = response.json()["data"]
        log_test("Get plant by ID", True, response_time=elapsed)
        return True
    else:
        log_test("Get plant by ID", False, f"Status {response.status_code}", elapsed)
        return False


def test_update_plant(token, plant_id):
    """Test 4: Update plant data"""
    update_data = {
        "yieldInfo": {
            "yieldPerPlant": 6.0,
            "yieldUnit": "kg",
            "expectedWastePercentage": 12.0
        }
    }

    start = time.time()
    response = requests.patch(f"{API_URL}/{plant_id}", json=update_data, headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 200:
        data = response.json()["data"]
        version = data.get("dataVersion", 0)
        if version == 2:
            log_test("Update plant (version increment)", True, response_time=elapsed)
            return True
        else:
            log_test("Update plant (version increment)", False, f"Version is {version}, expected 2", elapsed)
            return False
    else:
        log_test("Update plant (version increment)", False, f"Status {response.status_code}", elapsed)
        return False


def test_delete_plant(token, plant_id):
    """Test 5: Delete plant data (soft delete)"""
    start = time.time()
    response = requests.delete(f"{API_URL}/{plant_id}", headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 200:
        log_test("Delete plant (soft delete)", True, response_time=elapsed)
        return True
    else:
        log_test("Delete plant (soft delete)", False, f"Status {response.status_code}", elapsed)
        return False


# ====================================================================================
# PHASE 2: Search and Filter Operations
# ====================================================================================

def test_list_all_plants(token):
    """Test 6: List all plants with pagination"""
    start = time.time()
    response = requests.get(f"{API_URL}?page=1&perPage=20", headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 200:
        data = response.json()
        meta = data.get("meta", {})
        log_test("List all plants (pagination)", True, f"Total: {meta.get('total', 0)}", elapsed)
        return True
    else:
        log_test("List all plants (pagination)", False, f"Status {response.status_code}", elapsed)
        return False


def test_search_by_name(token):
    """Test 7: Search plants by name"""
    start = time.time()
    response = requests.get(f"{API_URL}?search=Tomato", headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 200:
        data = response.json()["data"]
        log_test("Search by plant name", True, f"Found {len(data)} plants", elapsed)
        return True
    else:
        log_test("Search by plant name", False, f"Status {response.status_code}", elapsed)
        return False


def test_filter_by_farm_type(token):
    """Test 8: Filter by farm type"""
    start = time.time()
    response = requests.get(f"{API_URL}?farmType=hydroponic", headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 200:
        data = response.json()["data"]
        log_test("Filter by farm type", True, f"Found {len(data)} plants", elapsed)
        return True
    else:
        log_test("Filter by farm type", False, f"Status {response.status_code}", elapsed)
        return False


def test_filter_by_growth_cycle(token):
    """Test 9: Filter by growth cycle range"""
    start = time.time()
    response = requests.get(f"{API_URL}?minGrowthCycle=30&maxGrowthCycle=100", headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 200:
        data = response.json()["data"]
        log_test("Filter by growth cycle range", True, f"Found {len(data)} plants", elapsed)
        return True
    else:
        log_test("Filter by growth cycle range", False, f"Status {response.status_code}", elapsed)
        return False


def test_filter_by_tags(token):
    """Test 10: Filter by tags"""
    start = time.time()
    response = requests.get(f"{API_URL}?tags=vegetable,summer", headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 200:
        data = response.json()["data"]
        log_test("Filter by tags", True, f"Found {len(data)} plants", elapsed)
        return True
    else:
        log_test("Filter by tags", False, f"Status {response.status_code}", elapsed)
        return False


# ====================================================================================
# PHASE 3: Advanced Operations
# ====================================================================================

def test_clone_plant(token, source_plant_id):
    """Test 11: Clone plant data"""
    new_name = f"Cloned Plant {uuid4().hex[:8]}"

    start = time.time()
    response = requests.post(f"{API_URL}/{source_plant_id}/clone?newName={new_name}", headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 201:
        data = response.json()["data"]
        if data["plantName"] == new_name and data["dataVersion"] == 1:
            log_test("Clone plant data", True, response_time=elapsed)
            return data["plantDataId"]
        else:
            log_test("Clone plant data", False, "Cloned data incorrect", elapsed)
            return None
    else:
        log_test("Clone plant data", False, f"Status {response.status_code}", elapsed)
        return None


def test_get_by_farm_type_endpoint(token):
    """Test 12: Get plants by farm type (dedicated endpoint)"""
    start = time.time()
    response = requests.get(f"{API_URL}/by-farm-type/greenhouse", headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 200:
        data = response.json()["data"]
        log_test("Get by farm type endpoint", True, f"Found {len(data)} plants", elapsed)
        return True
    else:
        log_test("Get by farm type endpoint", False, f"Status {response.status_code}", elapsed)
        return False


def test_get_by_tags_endpoint(token):
    """Test 13: Get plants by tags (dedicated endpoint)"""
    start = time.time()
    response = requests.get(f"{API_URL}/by-tags/vegetable,fruit", headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 200:
        data = response.json()["data"]
        log_test("Get by tags endpoint", True, f"Found {len(data)} plants", elapsed)
        return True
    else:
        log_test("Get by tags endpoint", False, f"Status {response.status_code}", elapsed)
        return False


def test_download_csv_template(token):
    """Test 14: Download CSV template"""
    start = time.time()
    response = requests.get(f"{API_URL}/template/csv", headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 200 and "text/csv" in response.headers.get("content-type", ""):
        log_test("Download CSV template", True, response_time=elapsed)
        return True
    else:
        log_test("Download CSV template", False, f"Status {response.status_code}", elapsed)
        return False


# ====================================================================================
# PHASE 4: Validation Tests
# ====================================================================================

def test_validation_growth_cycle_mismatch(token):
    """Test 15: Validation - growth cycle mismatch"""
    plant_data = {
        "plantName": f"Invalid Growth Cycle {uuid4().hex[:8]}",
        "scientificName": f"Test invalid {uuid4().hex[:8]}",
        "farmTypeCompatibility": ["greenhouse"],
        "growthCycle": {
            "germinationDays": 7,
            "vegetativeDays": 30,
            "floweringDays": 14,
            "fruitingDays": 35,
            "harvestDurationDays": 14,
            "totalCycleDays": 999  # INCORRECT
        },
        "yieldInfo": {"yieldPerPlant": 5.0, "yieldUnit": "kg", "expectedWastePercentage": 10.0},
        "environmentalRequirements": {"temperature": {"minCelsius": 15.0, "maxCelsius": 30.0, "optimalCelsius": 24.0}},
        "wateringRequirements": {"frequencyDays": 2, "waterType": "filtered", "droughtTolerance": "low"},
        "soilRequirements": {"phRequirements": {"minPH": 6.0, "maxPH": 7.0, "optimalPH": 6.5}, "soilTypes": ["loamy"]},
        "lightRequirements": {"lightType": "full_sun", "minHoursDaily": 6.0, "maxHoursDaily": 10.0, "optimalHoursDaily": 8.0, "photoperiodSensitive": False},
        "economicsAndLabor": {"currency": "USD", "totalManHoursPerPlant": 1.0, "plantingHours": 0.1, "maintenanceHours": 0.8, "harvestingHours": 0.1},
        "additionalInfo": {"growthHabit": "bush", "spacing": {"betweenPlantsCm": 50.0, "betweenRowsCm": 60.0, "plantsPerSquareMeter": 2.0}, "supportRequirements": "none"}
    }

    start = time.time()
    response = requests.post(API_URL, json=plant_data, headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 422:
        log_test("Validation: Growth cycle mismatch", True, response_time=elapsed)
        return True
    else:
        log_test("Validation: Growth cycle mismatch", False, f"Expected 422, got {response.status_code}", elapsed)
        return False


def test_validation_invalid_temperature(token):
    """Test 16: Validation - invalid temperature range"""
    plant_data = {
        "plantName": f"Invalid Temperature {uuid4().hex[:8]}",
        "scientificName": f"Test invalid {uuid4().hex[:8]}",
        "farmTypeCompatibility": ["greenhouse"],
        "growthCycle": {"germinationDays": 7, "vegetativeDays": 30, "floweringDays": 14, "fruitingDays": 35, "harvestDurationDays": 14, "totalCycleDays": 100},
        "yieldInfo": {"yieldPerPlant": 5.0, "yieldUnit": "kg", "expectedWastePercentage": 10.0},
        "environmentalRequirements": {"temperature": {"minCelsius": 30.0, "maxCelsius": 15.0, "optimalCelsius": 20.0}},  # INVALID: min > max
        "wateringRequirements": {"frequencyDays": 2, "waterType": "filtered", "droughtTolerance": "low"},
        "soilRequirements": {"phRequirements": {"minPH": 6.0, "maxPH": 7.0, "optimalPH": 6.5}, "soilTypes": ["loamy"]},
        "lightRequirements": {"lightType": "full_sun", "minHoursDaily": 6.0, "maxHoursDaily": 10.0, "optimalHoursDaily": 8.0, "photoperiodSensitive": False},
        "economicsAndLabor": {"currency": "USD", "totalManHoursPerPlant": 1.0, "plantingHours": 0.1, "maintenanceHours": 0.8, "harvestingHours": 0.1},
        "additionalInfo": {"growthHabit": "bush", "spacing": {"betweenPlantsCm": 50.0, "betweenRowsCm": 60.0, "plantsPerSquareMeter": 2.0}, "supportRequirements": "none"}
    }

    start = time.time()
    response = requests.post(API_URL, json=plant_data, headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 422:
        log_test("Validation: Invalid temperature range", True, response_time=elapsed)
        return True
    else:
        log_test("Validation: Invalid temperature range", False, f"Expected 422, got {response.status_code}", elapsed)
        return False


def test_duplicate_plant_name(token):
    """Test 17: Duplicate plant name rejection"""
    plant_data = {
        "plantName": "Tomato",  # Already exists in sample data
        "scientificName": f"Solanum duplicate {uuid4().hex[:8]}",
        "farmTypeCompatibility": ["greenhouse"],
        "growthCycle": {"germinationDays": 7, "vegetativeDays": 30, "floweringDays": 14, "fruitingDays": 35, "harvestDurationDays": 14, "totalCycleDays": 100},
        "yieldInfo": {"yieldPerPlant": 5.0, "yieldUnit": "kg", "expectedWastePercentage": 10.0},
        "environmentalRequirements": {"temperature": {"minCelsius": 15.0, "maxCelsius": 30.0, "optimalCelsius": 24.0}},
        "wateringRequirements": {"frequencyDays": 2, "waterType": "filtered", "droughtTolerance": "low"},
        "soilRequirements": {"phRequirements": {"minPH": 6.0, "maxPH": 7.0, "optimalPH": 6.5}, "soilTypes": ["loamy"]},
        "lightRequirements": {"lightType": "full_sun", "minHoursDaily": 6.0, "maxHoursDaily": 10.0, "optimalHoursDaily": 8.0, "photoperiodSensitive": False},
        "economicsAndLabor": {"currency": "USD", "totalManHoursPerPlant": 1.0, "plantingHours": 0.1, "maintenanceHours": 0.8, "harvestingHours": 0.1},
        "additionalInfo": {"growthHabit": "bush", "spacing": {"betweenPlantsCm": 50.0, "betweenRowsCm": 60.0, "plantsPerSquareMeter": 2.0}, "supportRequirements": "none"}
    }

    start = time.time()
    response = requests.post(API_URL, json=plant_data, headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 409:
        log_test("Duplicate plant name rejection", True, response_time=elapsed)
        return True
    else:
        log_test("Duplicate plant name rejection", False, f"Expected 409, got {response.status_code}", elapsed)
        return False


def test_404_not_found(token):
    """Test 18: 404 - Plant not found"""
    fake_id = str(uuid4())

    start = time.time()
    response = requests.get(f"{API_URL}/{fake_id}", headers=get_headers(token))
    elapsed = (time.time() - start) * 1000

    if response.status_code == 404:
        log_test("404: Plant not found", True, response_time=elapsed)
        return True
    else:
        log_test("404: Plant not found", False, f"Expected 404, got {response.status_code}", elapsed)
        return False


def test_401_unauthorized(token=None):
    """Test 19: 401 - Unauthorized (no token)"""
    start = time.time()
    response = requests.get(API_URL, headers=get_headers(None))  # No token
    elapsed = (time.time() - start) * 1000

    if response.status_code == 401:
        log_test("401: Unauthorized (no token)", True, response_time=elapsed)
        return True
    else:
        log_test("401: Unauthorized (no token)", False, f"Expected 401, got {response.status_code}", elapsed)
        return False


# ====================================================================================
# Main Test Runner
# ====================================================================================

def run_comprehensive_tests():
    """Run all comprehensive tests"""
    print("=" * 80)
    print("COMPREHENSIVE PLANT DATA ENHANCED API TESTING")
    print("=" * 80)
    print(f"Start Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"API Endpoint: {API_URL}\n")

    # Get authentication token
    print("Authenticating...")
    token = get_auth_token()
    if not token:
        print("Warning: Could not obtain auth token. Some tests may fail with 401.\n")
    else:
        print("Authentication successful\n")

    # Phase 1: Basic CRUD
    print("\n" + "=" * 80)
    print("PHASE 1: BASIC CRUD OPERATIONS")
    print("=" * 80)

    plant_id_full = test_create_plant_full_fields(token)
    plant_id_minimal = test_create_plant_minimal_fields(token)

    if plant_id_full:
        test_get_plant_by_id(token, plant_id_full)
        test_update_plant(token, plant_id_full)

    # Phase 2: Search and Filter
    print("\n" + "=" * 80)
    print("PHASE 2: SEARCH AND FILTER OPERATIONS")
    print("=" * 80)

    test_list_all_plants(token)
    test_search_by_name(token)
    test_filter_by_farm_type(token)
    test_filter_by_growth_cycle(token)
    test_filter_by_tags(token)

    # Phase 3: Advanced Operations
    print("\n" + "=" * 80)
    print("PHASE 3: ADVANCED OPERATIONS")
    print("=" * 80)

    if plant_id_full:
        cloned_id = test_clone_plant(token, plant_id_full)

    test_get_by_farm_type_endpoint(token)
    test_get_by_tags_endpoint(token)
    test_download_csv_template(token)

    # Phase 4: Validation and Error Handling
    print("\n" + "=" * 80)
    print("PHASE 4: VALIDATION AND ERROR HANDLING")
    print("=" * 80)

    test_validation_growth_cycle_mismatch(token)
    test_validation_invalid_temperature(token)
    test_duplicate_plant_name(token)
    test_404_not_found(token)
    test_401_unauthorized()

    # Phase 5: Cleanup (soft delete)
    print("\n" + "=" * 80)
    print("PHASE 5: CLEANUP (SOFT DELETE)")
    print("=" * 80)

    if plant_id_full:
        test_delete_plant(token, plant_id_full)
    if plant_id_minimal:
        test_delete_plant(token, plant_id_minimal)

    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total Tests: {test_results['total_tests']}")
    print(f"Passed: {test_results['passed']}")
    print(f"Failed: {test_results['failed']}")
    print(f"Success Rate: {(test_results['passed'] / test_results['total_tests'] * 100):.1f}%")

    if test_results['errors']:
        print("\nFAILED TESTS:")
        for error in test_results['errors']:
            print(f"  - {error['test']}: {error['details']}")

    # Save results to file
    output_file = f"plant_data_enhanced_test_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, 'w') as f:
        json.dump(test_results, f, indent=2)

    print(f"\nFull test results saved to: {output_file}")
    print(f"End Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)

    return test_results


if __name__ == "__main__":
    results = run_comprehensive_tests()

    # Exit with appropriate code
    exit(0 if results['failed'] == 0 else 1)
