"""
IoT Simulator Service - Simulates greenhouse sensors and relays
This simulates a Raspberry Pi / ESP32 controller for testing
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from datetime import datetime
import random
import math

app = FastAPI(
    title="IoT Simulator - AG11 Greenhouse",
    description="Simulates sensors and relays for greenhouse automation testing",
    version="1.0.0"
)

# Enable CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# STATE MANAGEMENT - Simulates actual device state
# ============================================================================

# Base values from real sensor data (from user's screenshots)
BASE_AIR_TEMP = 22.4  # °C
BASE_AIR_HUMIDITY = 73.1  # %
BASE_SOIL_MOISTURE = 62.6  # %
BASE_SOIL_TEMP = 24.5  # °C
BASE_SOIL_EC = 1227  # μS/cm
BASE_SOIL_PH = 6.26
BASE_SOIL_NITROGEN = 350  # mg/kg
BASE_SOIL_PHOSPHORUS = 1097  # mg/kg
BASE_SOIL_POTASSIUM = 1600  # mg/kg

# Relay states (True = ON, False = OFF)
relay_states: Dict[str, bool] = {
    "relay1": False,   # Fan 1
    "relay2": False,   # Fan 2
    "relay3": False,   # Fan 3
    "relay4": False,   # Fan 4
    "relay5": False,   # Fan 5
    "relay6": False,   # Fan 6
    "relay7": False,   # Fan 7
    "relay8": False,   # Fan 8
    "relay9": False,   # Fan 9
    "relay10": False,  # Fan 10
    "relay11": False,  # Cooling Pump (Evaporative)
}

# Relay labels (user-configurable names)
relay_labels: Dict[str, str] = {
    "relay1": "Fan 1",
    "relay2": "Fan 2",
    "relay3": "Fan 3",
    "relay4": "Fan 4",
    "relay5": "Fan 5",
    "relay6": "Fan 6",
    "relay7": "Fan 7",
    "relay8": "Fan 8",
    "relay9": "Fan 9",
    "relay10": "Fan 10",
    "relay11": "Cooling Pump",
}

# Sensor labels
sensor_labels: Dict[str, str] = {
    "sensor1": "Air Temp/Humidity",
    "sensor2": "Soil Analysis",
}


# ============================================================================
# HELPER FUNCTIONS - Simulate realistic sensor variations
# ============================================================================

# Persistent state for smooth sensor readings (avoids jumpy values)
_sensor_state: Dict[str, float] = {}

def simulate_variation(base_value: float, variation_percent: float = 0.5, sensor_key: str = None) -> float:
    """
    Add realistic random variation to sensor readings.
    Uses small variations (0.1-0.5%) like real sensors.
    Optionally maintains state for smooth transitions.
    """
    global _sensor_state

    # Very small variation for realistic sensor behavior
    max_variation = base_value * (variation_percent / 100)

    if sensor_key and sensor_key in _sensor_state:
        # Smooth transition from previous value (max 0.1% change per reading)
        prev_value = _sensor_state[sensor_key]
        max_change = base_value * 0.001  # 0.1% max change per reading
        change = random.uniform(-max_change, max_change)
        new_value = prev_value + change
        # Keep within bounds of base value +/- variation
        new_value = max(base_value - max_variation, min(base_value + max_variation, new_value))
    else:
        # Initial value with small random offset
        new_value = base_value + random.uniform(-max_variation, max_variation)

    if sensor_key:
        _sensor_state[sensor_key] = new_value

    return round(new_value, 2)


def get_time_based_variation() -> float:
    """
    Simulate temperature variation based on time of day.
    Uses smooth sinusoidal curve instead of random jumps.
    Peak at 2pm (14:00), lowest at 4am (04:00).
    """
    hour = datetime.now().hour
    minute = datetime.now().minute

    # Convert to decimal hours
    decimal_hour = hour + minute / 60.0

    # Sinusoidal variation: peak at 14:00 (+2°C), lowest at 02:00 (-1°C)
    # Using sine wave shifted to peak at 14:00
    variation = 1.5 * math.sin((decimal_hour - 8) * math.pi / 12) + 0.5

    return round(variation, 2)


def calculate_effect_of_fans() -> float:
    """Calculate cooling effect based on active fans"""
    active_fans = sum(1 for k, v in relay_states.items() if k.startswith("relay") and k != "relay11" and v)
    # Each fan provides about 0.5°C cooling
    return -0.5 * active_fans


def calculate_effect_of_pump() -> float:
    """Calculate humidity effect of evaporative cooling pump"""
    if relay_states.get("relay11", False):
        return 5.0  # Pump adds 5% humidity when running
    return 0.0


# ============================================================================
# SENSOR DATA GENERATION
# ============================================================================

def get_sensor_data() -> List[Dict[str, Any]]:
    """Generate current sensor readings with realistic variations"""

    # Calculate environmental effects
    fan_cooling = calculate_effect_of_fans()
    pump_humidity = calculate_effect_of_pump()
    time_variation = get_time_based_variation()

    # Base values adjusted for environmental effects
    adjusted_air_temp = BASE_AIR_TEMP + fan_cooling + time_variation
    adjusted_humidity = min(99, BASE_AIR_HUMIDITY + pump_humidity)

    return [
        {
            "id": "sensor1",
            "name": "SHT20",
            "type": "air_temp_humidity",
            "label": sensor_labels.get("sensor1", "Air Temp/Humidity"),
            "address": 1,
            "online": True,
            "lastUpdate": datetime.now().isoformat(),
            "readings": {
                "temperature": {
                    "value": simulate_variation(adjusted_air_temp, 0.3, "air_temp"),
                    "unit": "°C"
                },
                "humidity": {
                    "value": simulate_variation(adjusted_humidity, 0.5, "air_humidity"),
                    "unit": "%"
                }
            }
        },
        {
            "id": "sensor2",
            "name": "Soil Sensor 7-in-1",
            "type": "soil_multi",
            "label": sensor_labels.get("sensor2", "Soil Analysis"),
            "address": 3,
            "online": True,
            "lastUpdate": datetime.now().isoformat(),
            "readings": {
                "moisture": {
                    "value": simulate_variation(BASE_SOIL_MOISTURE, 0.3, "soil_moisture"),
                    "unit": "%"
                },
                "temperature": {
                    "value": simulate_variation(BASE_SOIL_TEMP, 0.2, "soil_temp"),
                    "unit": "°C"
                },
                "ec": {
                    "value": int(simulate_variation(BASE_SOIL_EC, 0.5, "soil_ec")),
                    "unit": "μS/cm"
                },
                "ph": {
                    "value": simulate_variation(BASE_SOIL_PH, 0.2, "soil_ph"),
                    "unit": ""
                },
                "nitrogen": {
                    "value": int(simulate_variation(BASE_SOIL_NITROGEN, 0.3, "soil_n")),
                    "unit": "mg/kg"
                },
                "phosphorus": {
                    "value": int(simulate_variation(BASE_SOIL_PHOSPHORUS, 0.3, "soil_p")),
                    "unit": "mg/kg"
                },
                "potassium": {
                    "value": int(simulate_variation(BASE_SOIL_POTASSIUM, 0.3, "soil_k")),
                    "unit": "mg/kg"
                }
            }
        }
    ]


def get_relay_data() -> List[Dict[str, Any]]:
    """Get current relay states"""
    return [
        {
            "id": relay_id,
            "label": relay_labels.get(relay_id, relay_id),
            "state": state,
            "online": True
        }
        for relay_id, state in relay_states.items()
    ]


# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "online",
        "service": "IoT Simulator - AG11 Greenhouse",
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/devices")
async def get_all_devices():
    """
    Get all sensors and relays - Main discovery endpoint
    This is the standard endpoint that the A64 platform will call
    """
    return {
        "controllerId": "ag11-greenhouse-sim",
        "controllerName": "AG11 Virtual Greenhouse Controller",
        "lastUpdate": datetime.now().isoformat(),
        "sensors": get_sensor_data(),
        "relays": get_relay_data()
    }


@app.get("/api/sensors")
async def get_sensors():
    """Get all sensor readings"""
    return {
        "sensors": get_sensor_data(),
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/sensors/{sensor_id}")
async def get_sensor(sensor_id: str):
    """Get specific sensor data"""
    sensors = get_sensor_data()
    for sensor in sensors:
        if sensor["id"] == sensor_id:
            return sensor
    raise HTTPException(status_code=404, detail=f"Sensor {sensor_id} not found")


@app.get("/api/relays")
async def get_relays():
    """Get all relay states"""
    return {
        "relays": get_relay_data(),
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/relays/{relay_id}")
async def get_relay(relay_id: str):
    """Get specific relay state"""
    if relay_id not in relay_states:
        raise HTTPException(status_code=404, detail=f"Relay {relay_id} not found")

    return {
        "id": relay_id,
        "label": relay_labels.get(relay_id, relay_id),
        "state": relay_states[relay_id],
        "online": True
    }


class RelayCommand(BaseModel):
    state: bool


@app.put("/api/relays/{relay_id}")
async def set_relay(relay_id: str, command: RelayCommand):
    """Set relay state (ON/OFF)"""
    if relay_id not in relay_states:
        raise HTTPException(status_code=404, detail=f"Relay {relay_id} not found")

    old_state = relay_states[relay_id]
    relay_states[relay_id] = command.state

    return {
        "id": relay_id,
        "label": relay_labels.get(relay_id, relay_id),
        "previousState": old_state,
        "currentState": command.state,
        "success": True,
        "timestamp": datetime.now().isoformat()
    }


class RelayLabelUpdate(BaseModel):
    label: str


@app.patch("/api/relays/{relay_id}/label")
async def update_relay_label(relay_id: str, update: RelayLabelUpdate):
    """Update relay label/name"""
    if relay_id not in relay_states:
        raise HTTPException(status_code=404, detail=f"Relay {relay_id} not found")

    relay_labels[relay_id] = update.label

    return {
        "id": relay_id,
        "label": update.label,
        "success": True
    }


class SensorLabelUpdate(BaseModel):
    label: str


@app.patch("/api/sensors/{sensor_id}/label")
async def update_sensor_label(sensor_id: str, update: SensorLabelUpdate):
    """Update sensor label/name"""
    if sensor_id not in sensor_labels and sensor_id not in ["sensor1", "sensor2"]:
        raise HTTPException(status_code=404, detail=f"Sensor {sensor_id} not found")

    sensor_labels[sensor_id] = update.label

    return {
        "id": sensor_id,
        "label": update.label,
        "success": True
    }


# Bulk relay control
class BulkRelayCommand(BaseModel):
    relays: Dict[str, bool]


@app.put("/api/relays/bulk")
async def set_relays_bulk(command: BulkRelayCommand):
    """Set multiple relay states at once"""
    results = []
    for relay_id, state in command.relays.items():
        if relay_id in relay_states:
            old_state = relay_states[relay_id]
            relay_states[relay_id] = state
            results.append({
                "id": relay_id,
                "previousState": old_state,
                "currentState": state,
                "success": True
            })
        else:
            results.append({
                "id": relay_id,
                "success": False,
                "error": "Relay not found"
            })

    return {
        "results": results,
        "timestamp": datetime.now().isoformat()
    }


# Convenience endpoints for common operations
@app.post("/api/relays/fans/all-on")
async def all_fans_on():
    """Turn all fans on"""
    for i in range(1, 11):
        relay_states[f"relay{i}"] = True
    return {"message": "All fans turned on", "success": True}


@app.post("/api/relays/fans/all-off")
async def all_fans_off():
    """Turn all fans off"""
    for i in range(1, 11):
        relay_states[f"relay{i}"] = False
    return {"message": "All fans turned off", "success": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8090)
