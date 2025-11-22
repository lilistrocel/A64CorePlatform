"""
Comprehensive tests for Plant Data Enhanced API

Tests all endpoints, validations, and business logic for the enhanced plant data schema.
"""

import pytest
import json
from uuid import uuid4
from datetime import datetime


class TestPlantDataEnhancedAPI:
    """Test suite for enhanced plant data API endpoints"""

    # Test fixtures
    @pytest.fixture
    def sample_enhanced_plant_data(self):
        """Sample comprehensive plant data for testing"""
        return {
            "plantName": "Test Tomato Enhanced",
            "scientificName": "Solanum lycopersicum",
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
            "fertilizerSchedule": [
                {
                    "stage": "vegetative",
                    "fertilizerType": "NPK 20-10-10",
                    "quantityPerPlant": 50.0,
                    "quantityUnit": "grams",
                    "frequencyDays": 14,
                    "npkRatio": "20-10-10",
                    "notes": "Apply around base"
                }
            ],
            "pesticideSchedule": [
                {
                    "stage": "vegetative",
                    "pesticideType": "Neem oil",
                    "targetPest": "Aphids",
                    "quantityPerPlant": 10.0,
                    "quantityUnit": "ml",
                    "frequencyDays": 14,
                    "safetyNotes": "Organic safe",
                    "preharvestIntervalDays": 1
                }
            ],
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
            "diseasesAndPests": [
                {
                    "name": "Early Blight",
                    "symptoms": "Dark brown spots on leaves",
                    "preventionMeasures": "Crop rotation",
                    "treatmentOptions": "Copper fungicides",
                    "severity": "medium"
                }
            ],
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
            "gradingStandards": [
                {
                    "gradeName": "Premium",
                    "sizeRequirements": "7-10 cm diameter",
                    "colorRequirements": "Deep red",
                    "defectTolerance": "No defects",
                    "otherCriteria": "Firm texture",
                    "priceMultiplier": 1.5
                }
            ],
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
            "tags": ["vegetable", "fruit", "summer", "high-value"]
        }

    # Test: Create plant data with full fields
    def test_create_plant_data_full_fields(self, api_client, auth_headers, sample_enhanced_plant_data):
        """Test creating enhanced plant data with all fields populated"""
        response = api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=sample_enhanced_plant_data,
            headers=auth_headers
        )

        assert response.status_code == 201
        data = response.json()["data"]
        assert data["plantName"] == "Test Tomato Enhanced"
        assert data["dataVersion"] == 1
        assert "plantDataId" in data
        assert data["growthCycle"]["totalCycleDays"] == 100
        assert len(data["fertilizerSchedule"]) == 1
        assert data["environmentalRequirements"]["temperature"]["optimalCelsius"] == 24.0

    # Test: Create plant data with minimal fields
    def test_create_plant_data_minimal_fields(self, api_client, auth_headers):
        """Test creating enhanced plant data with only required fields"""
        minimal_data = {
            "plantName": "Test Lettuce Minimal",
            "scientificName": "Lactuca sativa",
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

        response = api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=minimal_data,
            headers=auth_headers
        )

        assert response.status_code == 201
        data = response.json()["data"]
        assert data["plantName"] == "Test Lettuce Minimal"
        assert data["growthCycle"]["totalCycleDays"] == 35

    # Test: Validation - growth cycle mismatch
    def test_validation_growth_cycle_mismatch(self, api_client, auth_headers, sample_enhanced_plant_data):
        """Test validation fails when growth cycle stages don't sum correctly"""
        invalid_data = sample_enhanced_plant_data.copy()
        invalid_data["plantName"] = "Invalid Growth Cycle"
        invalid_data["growthCycle"]["totalCycleDays"] = 999  # Incorrect total

        response = api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=invalid_data,
            headers=auth_headers
        )

        assert response.status_code == 422
        assert "Growth cycle mismatch" in response.json()["detail"]

    # Test: Validation - invalid temperature range
    def test_validation_invalid_temperature_range(self, api_client, auth_headers, sample_enhanced_plant_data):
        """Test validation fails when temperature range is invalid"""
        invalid_data = sample_enhanced_plant_data.copy()
        invalid_data["plantName"] = "Invalid Temperature"
        invalid_data["environmentalRequirements"]["temperature"] = {
            "minCelsius": 30.0,  # Min > Max
            "maxCelsius": 15.0,
            "optimalCelsius": 20.0
        }

        response = api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=invalid_data,
            headers=auth_headers
        )

        assert response.status_code == 422
        assert "Temperature range invalid" in response.json()["detail"]

    # Test: Validation - invalid pH range
    def test_validation_invalid_ph_range(self, api_client, auth_headers, sample_enhanced_plant_data):
        """Test validation fails when pH range is invalid"""
        invalid_data = sample_enhanced_plant_data.copy()
        invalid_data["plantName"] = "Invalid pH"
        invalid_data["soilRequirements"]["phRequirements"] = {
            "minPH": 7.0,
            "maxPH": 6.0,  # Max < Min
            "optimalPH": 6.5
        }

        response = api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=invalid_data,
            headers=auth_headers
        )

        assert response.status_code == 422
        assert "pH range invalid" in response.json()["detail"]

    # Test: Duplicate plant name
    def test_duplicate_plant_name(self, api_client, auth_headers, sample_enhanced_plant_data):
        """Test creation fails for duplicate plant name"""
        # Create first plant
        api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=sample_enhanced_plant_data,
            headers=auth_headers
        )

        # Try to create duplicate
        response = api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=sample_enhanced_plant_data,
            headers=auth_headers
        )

        assert response.status_code == 409
        assert "already exists" in response.json()["detail"]

    # Test: Update plant data and verify version increment
    def test_update_plant_data_version_increment(self, api_client, auth_headers, sample_enhanced_plant_data):
        """Test updating plant data increments version"""
        # Create plant
        create_response = api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=sample_enhanced_plant_data,
            headers=auth_headers
        )
        plant_id = create_response.json()["data"]["plantDataId"]

        # Update plant
        update_data = {
            "yieldInfo": {
                "yieldPerPlant": 6.0,
                "yieldUnit": "kg",
                "expectedWastePercentage": 12.0
            }
        }

        response = api_client.patch(
            f"/api/v1/farm/plant-data-enhanced/{plant_id}",
            json=update_data,
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["dataVersion"] == 2
        assert data["yieldInfo"]["yieldPerPlant"] == 6.0

    # Test: Delete plant data (soft delete)
    def test_soft_delete_plant_data(self, api_client, auth_headers, sample_enhanced_plant_data):
        """Test soft delete sets deletedAt timestamp"""
        # Create plant
        create_response = api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=sample_enhanced_plant_data,
            headers=auth_headers
        )
        plant_id = create_response.json()["data"]["plantDataId"]

        # Delete plant
        response = api_client.delete(
            f"/api/v1/farm/plant-data-enhanced/{plant_id}",
            headers=auth_headers
        )

        assert response.status_code == 200

        # Verify plant no longer appears in list
        list_response = api_client.get(
            "/api/v1/farm/plant-data-enhanced",
            headers=auth_headers
        )

        plant_ids = [p["plantDataId"] for p in list_response.json()["data"]]
        assert plant_id not in plant_ids

    # Test: Search by plant name
    def test_search_by_plant_name(self, api_client, auth_headers, sample_enhanced_plant_data):
        """Test text search on plant name"""
        # Create plant
        api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=sample_enhanced_plant_data,
            headers=auth_headers
        )

        # Search
        response = api_client.get(
            "/api/v1/farm/plant-data-enhanced?search=Tomato",
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()["data"]
        assert len(data) > 0
        assert any("Tomato" in plant["plantName"] for plant in data)

    # Test: Filter by farm type
    def test_filter_by_farm_type(self, api_client, auth_headers, sample_enhanced_plant_data):
        """Test filtering by farm type compatibility"""
        # Create plant
        api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=sample_enhanced_plant_data,
            headers=auth_headers
        )

        # Filter by farm type
        response = api_client.get(
            "/api/v1/farm/plant-data-enhanced?farmType=hydroponic",
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()["data"]
        assert all("hydroponic" in plant["farmTypeCompatibility"] for plant in data)

    # Test: Filter by growth cycle range
    def test_filter_by_growth_cycle_range(self, api_client, auth_headers, sample_enhanced_plant_data):
        """Test filtering by growth cycle duration range"""
        # Create plant
        api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=sample_enhanced_plant_data,
            headers=auth_headers
        )

        # Filter by growth cycle range (90-110 days)
        response = api_client.get(
            "/api/v1/farm/plant-data-enhanced?minGrowthCycle=90&maxGrowthCycle=110",
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()["data"]
        assert all(
            90 <= plant["growthCycle"]["totalCycleDays"] <= 110
            for plant in data
        )

    # Test: Filter by tags
    def test_filter_by_tags(self, api_client, auth_headers, sample_enhanced_plant_data):
        """Test filtering by tags"""
        # Create plant
        api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=sample_enhanced_plant_data,
            headers=auth_headers
        )

        # Filter by tags
        response = api_client.get(
            "/api/v1/farm/plant-data-enhanced?tags=vegetable,summer",
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()["data"]
        assert all(
            any(tag in plant["tags"] for tag in ["vegetable", "summer"])
            for plant in data if plant.get("tags")
        )

    # Test: Pagination
    def test_pagination(self, api_client, auth_headers, sample_enhanced_plant_data):
        """Test pagination works correctly"""
        # Create multiple plants
        for i in range(5):
            plant_data = sample_enhanced_plant_data.copy()
            plant_data["plantName"] = f"Test Plant {i}"
            api_client.post(
                "/api/v1/farm/plant-data-enhanced",
                json=plant_data,
                headers=auth_headers
            )

        # Get page 1 with 2 items per page
        response = api_client.get(
            "/api/v1/farm/plant-data-enhanced?page=1&perPage=2",
            headers=auth_headers
        )

        assert response.status_code == 200
        assert len(response.json()["data"]) == 2
        assert response.json()["meta"]["page"] == 1
        assert response.json()["meta"]["perPage"] == 2

    # Test: Clone plant data
    def test_clone_plant_data(self, api_client, auth_headers, sample_enhanced_plant_data):
        """Test cloning plant data creates new entry with same details"""
        # Create original plant
        create_response = api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=sample_enhanced_plant_data,
            headers=auth_headers
        )
        original_id = create_response.json()["data"]["plantDataId"]

        # Clone plant
        response = api_client.post(
            f"/api/v1/farm/plant-data-enhanced/{original_id}/clone?newName=Cloned Tomato",
            headers=auth_headers
        )

        assert response.status_code == 201
        data = response.json()["data"]
        assert data["plantName"] == "Cloned Tomato"
        assert data["scientificName"] == sample_enhanced_plant_data["scientificName"]
        assert data["dataVersion"] == 1
        assert data["plantDataId"] != original_id

    # Test: Get by farm type endpoint
    def test_get_by_farm_type_endpoint(self, api_client, auth_headers, sample_enhanced_plant_data):
        """Test dedicated farm type endpoint"""
        # Create plant
        api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=sample_enhanced_plant_data,
            headers=auth_headers
        )

        # Get by farm type
        response = api_client.get(
            "/api/v1/farm/plant-data-enhanced/by-farm-type/greenhouse",
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()["data"]
        assert all("greenhouse" in plant["farmTypeCompatibility"] for plant in data)

    # Test: Get by tags endpoint
    def test_get_by_tags_endpoint(self, api_client, auth_headers, sample_enhanced_plant_data):
        """Test dedicated tags endpoint"""
        # Create plant
        api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=sample_enhanced_plant_data,
            headers=auth_headers
        )

        # Get by tags
        response = api_client.get(
            "/api/v1/farm/plant-data-enhanced/by-tags/vegetable,fruit",
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()["data"]
        assert all(
            any(tag in plant.get("tags", []) for tag in ["vegetable", "fruit"])
            for plant in data
        )

    # Test: Download CSV template
    def test_download_csv_template(self, api_client, auth_headers):
        """Test CSV template download"""
        response = api_client.get(
            "/api/v1/farm/plant-data-enhanced/template/csv",
            headers=auth_headers
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"
        assert "plantName" in response.text

    # Test: Authorization - only agronomist can create
    def test_authorization_agronomist_only(self, api_client, user_headers, sample_enhanced_plant_data):
        """Test only users with agronomist permission can create plant data"""
        response = api_client.post(
            "/api/v1/farm/plant-data-enhanced",
            json=sample_enhanced_plant_data,
            headers=user_headers  # Regular user without agronomist permission
        )

        assert response.status_code == 403

    # Test: 404 - plant not found
    def test_get_nonexistent_plant(self, api_client, auth_headers):
        """Test getting non-existent plant returns 404"""
        fake_id = str(uuid4())
        response = api_client.get(
            f"/api/v1/farm/plant-data-enhanced/{fake_id}",
            headers=auth_headers
        )

        assert response.status_code == 404
