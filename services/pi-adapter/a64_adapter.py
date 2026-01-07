"""
A64 Platform Adapter Endpoints

Adds A64-compatible API endpoints that translate to the existing
greenhouse API format. This allows the Raspberry Pi to work with
the A64 Core Platform's IoT system.

Usage in api.py:
    from src.a64_adapter import register_a64_routes
    register_a64_routes(app, get_greenhouse, verify_api_key)
"""

from datetime import datetime
from typing import Dict, Any, List, Optional, Callable
from fastapi import FastAPI, APIRouter, HTTPException, Depends
from pydantic import BaseModel
import socket


# =============================================================================
# Pydantic Models for A64 Format
# =============================================================================

class RelayCommand(BaseModel):
    state: bool


# =============================================================================
# Helper Functions
# =============================================================================

def get_controller_id() -> str:
    """Generate a unique controller ID based on hostname."""
    hostname = socket.gethostname()
    return f"pi-{hostname}"


def get_controller_name() -> str:
    """Get human-readable controller name."""
    return "Raspberry Pi Greenhouse Controller"


def build_sensors_response(sensors_data) -> List[dict]:
    """Convert sensor readings to A64 format."""
    timestamp = datetime.now().isoformat()
    sensors = []

    # Air Sensor (SHT20)
    sht20_temp = getattr(sensors_data, 'sht20_temp', None) if sensors_data else None
    sht20_humidity = getattr(sensors_data, 'sht20_humidity', None) if sensors_data else None

    sensors.append({
        "id": "sensor1",
        "name": "SHT20",
        "type": "air_temp_humidity",
        "label": "Air Temp/Humidity",
        "address": 1,
        "online": sht20_temp is not None,
        "lastUpdate": timestamp,
        "readings": {
            "temperature": {
                "value": sht20_temp if sht20_temp is not None else 0,
                "unit": "°C"
            },
            "humidity": {
                "value": sht20_humidity if sht20_humidity is not None else 0,
                "unit": "%"
            }
        }
    })

    # Soil Sensor (7-in-1)
    soil_moisture = getattr(sensors_data, 'soil_moisture', None) if sensors_data else None
    sensors.append({
        "id": "sensor2",
        "name": "Soil Sensor 7-in-1",
        "type": "soil_multi",
        "label": "Soil Analysis",
        "address": 3,
        "online": soil_moisture is not None,
        "lastUpdate": timestamp,
        "readings": {
            "moisture": {
                "value": getattr(sensors_data, 'soil_moisture', 0) or 0 if sensors_data else 0,
                "unit": "%"
            },
            "temperature": {
                "value": getattr(sensors_data, 'soil_temp', 0) or 0 if sensors_data else 0,
                "unit": "°C"
            },
            "ec": {
                "value": getattr(sensors_data, 'soil_ec', 0) or 0 if sensors_data else 0,
                "unit": "μS/cm"
            },
            "ph": {
                "value": getattr(sensors_data, 'soil_ph', 0) or 0 if sensors_data else 0,
                "unit": ""
            },
            "nitrogen": {
                "value": getattr(sensors_data, 'soil_nitrogen', 0) or 0 if sensors_data else 0,
                "unit": "mg/kg"
            },
            "phosphorus": {
                "value": getattr(sensors_data, 'soil_phosphorus', 0) or 0 if sensors_data else 0,
                "unit": "mg/kg"
            },
            "potassium": {
                "value": getattr(sensors_data, 'soil_potassium', 0) or 0 if sensors_data else 0,
                "unit": "mg/kg"
            }
        }
    })

    return sensors


def build_relays_response(greenhouse) -> List[dict]:
    """Build relay list from greenhouse controller state."""
    relays = []

    # Pump relay
    relays.append({
        "id": "pump",
        "label": "Irrigation Pump",
        "state": greenhouse.pump_state.is_on if hasattr(greenhouse, 'pump_state') else False,
        "online": True
    })

    # Fan relays
    if hasattr(greenhouse, 'fan_states'):
        for fan_num in sorted(greenhouse.fan_states.keys()):
            fan_state = greenhouse.fan_states[fan_num]
            relays.append({
                "id": f"fan{fan_num}",
                "label": f"Fan {fan_num}",
                "state": fan_state.is_on if hasattr(fan_state, 'is_on') else False,
                "online": True
            })

    return relays


# =============================================================================
# Route Factory Function
# =============================================================================

def register_a64_routes(app: FastAPI, greenhouse_getter: Callable, api_key_verifier: Callable):
    """
    Register A64 adapter routes with the main FastAPI app.
    """

    router = APIRouter(prefix="/api", tags=["A64 Adapter"])

    @router.get("/devices")
    async def get_all_devices():
        """
        A64 Platform compatible endpoint.
        Returns all sensors and relays in A64 format.
        """
        greenhouse = greenhouse_getter()

        try:
            # Use poll_sensors() instead of read_all_sensors()
            sensors_data = greenhouse.poll_sensors()
        except Exception as e:
            sensors_data = None

        return {
            "controllerId": get_controller_id(),
            "controllerName": get_controller_name(),
            "lastUpdate": datetime.now().isoformat(),
            "sensors": build_sensors_response(sensors_data),
            "relays": build_relays_response(greenhouse),
        }

    @router.get("/relays")
    async def get_relays():
        """Get all relay states in A64 format."""
        greenhouse = greenhouse_getter()

        return {
            "relays": build_relays_response(greenhouse),
            "timestamp": datetime.now().isoformat()
        }

    @router.get("/relays/{relay_id}")
    async def get_relay(relay_id: str):
        """Get specific relay state."""
        greenhouse = greenhouse_getter()

        if relay_id == "pump":
            return {
                "id": "pump",
                "label": "Irrigation Pump",
                "state": greenhouse.pump_state.is_on if hasattr(greenhouse, 'pump_state') else False,
                "online": True
            }
        elif relay_id.startswith("fan"):
            try:
                fan_num = int(relay_id.replace("fan", ""))
                if hasattr(greenhouse, 'fan_states') and fan_num in greenhouse.fan_states:
                    return {
                        "id": relay_id,
                        "label": f"Fan {fan_num}",
                        "state": greenhouse.fan_states[fan_num].is_on,
                        "online": True
                    }
                else:
                    raise HTTPException(status_code=404, detail=f"Fan {fan_num} not found")
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid relay ID: {relay_id}")
        else:
            raise HTTPException(status_code=404, detail=f"Relay {relay_id} not found")

    @router.put("/relays/{relay_id}")
    async def set_relay(relay_id: str, command: RelayCommand, api_key: str = Depends(api_key_verifier)):
        """
        A64 Platform compatible relay control.
        """
        greenhouse = greenhouse_getter()

        try:
            if relay_id == "pump":
                prev_state = greenhouse.pump_state.is_on if hasattr(greenhouse, 'pump_state') else False
                if command.state:
                    greenhouse.pump_on()
                else:
                    greenhouse.pump_off()

                return {
                    "id": "pump",
                    "label": "Irrigation Pump",
                    "previousState": prev_state,
                    "currentState": command.state,
                    "success": True,
                    "timestamp": datetime.now().isoformat()
                }

            elif relay_id.startswith("fan"):
                fan_num = int(relay_id.replace("fan", ""))
                prev_state = False
                if hasattr(greenhouse, 'fan_states') and fan_num in greenhouse.fan_states:
                    prev_state = greenhouse.fan_states[fan_num].is_on

                if command.state:
                    greenhouse.fan_on(fan_num)
                else:
                    greenhouse.fan_off(fan_num)

                return {
                    "id": relay_id,
                    "label": f"Fan {fan_num}",
                    "previousState": prev_state,
                    "currentState": command.state,
                    "success": True,
                    "timestamp": datetime.now().isoformat()
                }

            else:
                raise HTTPException(status_code=404, detail=f"Relay {relay_id} not found")

        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid relay ID format: {relay_id}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to control relay: {str(e)}")

    # Include the router in the app
    app.include_router(router)
