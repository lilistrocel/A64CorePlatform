# A64 IoT Greenhouse API Documentation

**Base URL:** `http://raspberri.local:8000` or `http://192.168.68.57:8000`

**Swagger UI:** `http://raspberri.local:8000/docs`

---

## Overview

The API provides endpoints for:
- **Greenhouse** - Full system status, all sensors, relay control (recommended)
- **Camera** - Hikvision camera snapshots and status
- **Sensor** - Direct soil sensor readings (legacy)
- **Pump** - Legacy pump control via GPIO/HTTP
- **History** - Historical data from database
- **System** - Configuration and health checks

---

## Authentication

Control endpoints (POST requests) require an API key.

**Header:** `X-API-Key: your-api-key-here`

**Protected endpoints:**
- All `/api/greenhouse/*/on` and `/off` endpoints
- `/api/greenhouse/all-off`
- `/api/greenhouse/relay/*`
- `/api/pump/*` control endpoints
- `/api/collect`
- `/api/camera/snapshot` (POST)

**Unprotected endpoints (GET):**
- All sensor reading endpoints
- Status endpoints
- History endpoints
- Health check

---

## Greenhouse Endpoints

These are the primary endpoints for dashboard integration.

### GET /api/greenhouse/status

Get full greenhouse status including all sensors, relay states, and thresholds.

**Response:**
```json
{
  "sensors": {
    "timestamp": "2025-12-24T10:30:00",
    "sht20_temp": 24.6,
    "sht20_humidity": 60.3,
    "xymd02_temp": null,
    "xymd02_humidity": null,
    "soil_moisture": 70.0,
    "soil_temp": 23.9,
    "soil_ec": 1611,
    "soil_ph": 7.0,
    "soil_nitrogen": 350,
    "soil_phosphorus": 1097,
    "soil_potassium": 1600,
    "avg_air_temp": 24.6,
    "avg_air_humidity": 60.3
  },
  "pump": {
    "is_on": false,
    "runtime": 0.0
  },
  "fans": {
    "fan_1": {"is_on": false, "runtime": 0.0},
    "fan_2": {"is_on": false, "runtime": 0.0},
    "...": "// one entry per fan in FAN_ASSIGNMENTS"
  },
  "thresholds": {
    "moisture_low": 30,
    "moisture_high": 60,
    "temp_high": 32.0,
    "temp_low": 28.0,
    "humidity_high": 80,
    "humidity_low": 60
  }
}
```

**Notes:**
- The `fans` object contains one entry per fan defined in `FAN_ASSIGNMENTS` config
- XY-MD02 sensor is not actively polled (returns null)

---

### GET /api/greenhouse/sensors

Get all sensor readings only (lighter response).

**Response:**
```json
{
  "timestamp": "2025-12-24T10:30:00",
  "sht20_temp": 24.6,
  "sht20_humidity": 60.3,
  "xymd02_temp": null,
  "xymd02_humidity": null,
  "soil_moisture": 70.0,
  "soil_temp": 23.9,
  "soil_ec": 1611,
  "soil_ph": 7.0,
  "soil_nitrogen": 350,
  "soil_phosphorus": 1097,
  "soil_potassium": 1600,
  "avg_air_temp": 24.6,
  "avg_air_humidity": 60.3
}
```

---

### POST /api/greenhouse/pump/on

Turn irrigation pump ON (ESP32 #4, channel 0).

**Headers:** `X-API-Key: your-api-key`

**Response:**
```json
{
  "message": "Irrigation pump ON",
  "success": true
}
```

---

### POST /api/greenhouse/pump/off

Turn irrigation pump OFF.

**Headers:** `X-API-Key: your-api-key`

**Response:**
```json
{
  "message": "Irrigation pump OFF",
  "success": true
}
```

---

### POST /api/greenhouse/fan/{fan_num}/on

Turn a specific fan ON.

**Headers:** `X-API-Key: your-api-key`

**Parameters:**
- `fan_num` (path): Fan number (must exist in `FAN_ASSIGNMENTS` config)

**Example:** `POST /api/greenhouse/fan/1/on`

**Response:**
```json
{
  "message": "Fan 1 ON",
  "success": true
}
```

---

### POST /api/greenhouse/fan/{fan_num}/off

Turn a specific fan OFF.

**Headers:** `X-API-Key: your-api-key`

**Parameters:**
- `fan_num` (path): Fan number (must exist in `FAN_ASSIGNMENTS` config)

**Example:** `POST /api/greenhouse/fan/7/off`

**Response:**
```json
{
  "message": "Fan 7 OFF",
  "success": true
}
```

---

### POST /api/greenhouse/relay/{esp32_num}/{channel}

Direct relay control for any ESP32 channel.

**Headers:** `X-API-Key: your-api-key`

**Parameters:**
- `esp32_num` (path): ESP32 number 1-5
- `channel` (path): Channel 0-5

**Request Body:**
```json
{
  "state": true
}
```

**Example:** `POST /api/greenhouse/relay/4/0` with `{"state": true}` turns on ESP32 #4 channel 0.

**Response:**
```json
{
  "message": "ESP32 #4 CH0 = ON",
  "success": true
}
```

---

### POST /api/greenhouse/all-off

Emergency shutoff - turn ALL relays OFF on ESP32 #4 and #5.

**Headers:** `X-API-Key: your-api-key`

**Response:**
```json
{
  "message": "All relays turned OFF",
  "success": true
}
```

---

## Hardware Architecture

### Overview

The system uses Modbus TCP to communicate with devices on an RS485 bus via a gateway:

```
Pi (Modbus TCP) → Gateway (RS485-ETH) → RS485 Bus → Sensors + ESP32 Relays
```

### Modbus Device Addresses

Configured in `config.py`. Default addresses:

| Device Type | Default Address | Config Variable |
|-------------|-----------------|-----------------|
| SHT20 Air Sensor | 1 (0x01) | `SHT20_ADDRESS` |
| XY-MD02 Air Sensor | 2 (0x02) | `XYMD02_ADDRESS` |
| 7-in-1 Soil Sensor | 3 (0x03) | `SOIL_SENSOR_ADDRESS` |
| ESP32 #1 | 16 (0x10) | `ESP32_1_ADDRESS` |
| ESP32 #2 | 17 (0x11) | `ESP32_2_ADDRESS` |
| ESP32 #3 | 18 (0x12) | `ESP32_3_ADDRESS` |
| ESP32 #4 | 19 (0x13) | `ESP32_4_ADDRESS` |
| ESP32 #5 | 20 (0x14) | `ESP32_5_ADDRESS` |

### Fan/Pump Mapping

The API uses **logical fan numbers** (Fan 1, Fan 2, etc.) which map to physical ESP32 channels via `config.py`:

```python
# config.py
FAN_ASSIGNMENTS = {
    1: (ESP32_5_ADDRESS, 5),   # Fan 1 → ESP32 #5 CH5
    2: (ESP32_5_ADDRESS, 1),   # Fan 2 → ESP32 #5 CH1
    # ... etc
}

IRRIGATION_PUMP_ESP32 = ESP32_4_ADDRESS
IRRIGATION_PUMP_CHANNEL = 2
```

**This mapping is site-specific.** Each deployment has its own wiring configuration. See the site-specific documentation for actual channel assignments:
- `docs/FARM_ALAIN_GREENHOUSE_11.md` - Alain Greenhouse 11 wiring

### ESP32 Watchdog

Each ESP32 has a 60-second watchdog timer. If no valid Modbus command is received within 60 seconds, all relays on that ESP32 turn OFF automatically (safety feature).

The API service periodically syncs relay states to keep dashboard-enabled relays alive.

---

## Camera Endpoints

### GET /api/camera/status

Check camera availability and get device info.

**Response (available):**
```json
{
  "available": true,
  "ip": "192.168.1.64",
  "model": "DS-2CD2043G2-IU",
  "serialNumber": "DS-2CD2043G2-IU20210924",
  "firmwareVersion": "V5.7.1"
}
```

**Response (unavailable):**
```json
{
  "available": false,
  "ip": "192.168.1.64",
  "error": "Camera not reachable or authentication failed"
}
```

---

### GET /api/camera/snapshot

Capture and return a snapshot as JPEG image.

**Response:** Raw JPEG bytes with `Content-Type: image/jpeg`

**Usage:**
```html
<img src="http://raspberri.local:8000/api/camera/snapshot" />
```

---

### POST /api/camera/snapshot

Capture and save a snapshot to disk.

**Headers:** `X-API-Key: your-api-key`

**Response:**
```json
{
  "message": "Snapshot saved: data/snapshots/snapshot_20251224_103000.jpg",
  "success": true
}
```

---

### GET /api/camera/snapshots

List recent saved snapshots.

**Query Parameters:**
- `limit` (optional): Max snapshots to return, 1-100 (default: 20)

**Response:**
```json
{
  "count": 5,
  "snapshots": [
    "data/snapshots/snapshot_20251224_103000.jpg",
    "data/snapshots/snapshot_20251224_102900.jpg"
  ]
}
```

---

## Sensor Endpoints (Legacy)

Direct access to 7-in-1 soil sensor via Modbus.

### GET /api/sensor

Get all 7 soil sensor values.

**Response:**
```json
{
  "moisture": 70.0,
  "temperature": 23.9,
  "ec": 1611,
  "ph": 7.0,
  "nitrogen": 350,
  "phosphorus": 1097,
  "potassium": 1600
}
```

---

### GET /api/sensor/moisture

Get moisture reading only.

**Response:**
```json
{
  "moisture": 70.0,
  "unit": "%"
}
```

---

### GET /api/sensor/temperature

Get soil temperature only.

**Response:**
```json
{
  "temperature": 23.9,
  "unit": "°C"
}
```

---

## History Endpoints

Access stored historical readings from the database.

### GET /api/history

Get historical readings.

**Query Parameters:**
- `hours` (optional): Hours to look back, 1-720 (default: 24)
- `limit` (optional): Max records to return, 1-1000

**Example:** `GET /api/history?hours=12&limit=100`

**Response:**
```json
{
  "count": 12,
  "hours": 12,
  "readings": [
    {
      "timestamp": "2025-12-24T10:00:00",
      "moisture": 65.0,
      "temperature": 24.1,
      "ec": 1580,
      "ph": 6.9,
      "nitrogen": 340,
      "phosphorus": 1080,
      "potassium": 1550,
      "sht20_temp": 24.6,
      "sht20_humidity": 60.3,
      "avg_air_temp": 24.6,
      "avg_air_humidity": 60.3
    }
  ]
}
```

---

### GET /api/history/latest

Get the most recent stored reading.

**Response:**
```json
{
  "timestamp": "2025-12-24T10:00:00",
  "moisture": 70.0,
  "temperature": 23.9,
  "ec": 1611,
  "ph": 7.0,
  "nitrogen": 350,
  "phosphorus": 1097,
  "potassium": 1600
}
```

---

### GET /api/history/stats

Get statistics for a time period.

**Query Parameters:**
- `hours` (optional): Hours to analyze, 1-720 (default: 24)

**Response:**
```json
{
  "period_hours": 24,
  "count": 24,
  "moisture": {"min": 45.0, "max": 75.0, "avg": 62.3},
  "temperature": {"min": 22.0, "max": 28.0, "avg": 24.5}
}
```

---

## System Endpoints

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy"
}
```

---

### GET /api/status

Get overall system status.

**Response:**
```json
{
  "pump_on": false,
  "sensor_connected": true,
  "collector_running": true,
  "total_readings": 1523,
  "last_reading": {
    "timestamp": "2025-12-24T10:00:00",
    "moisture": 70.0
  }
}
```

---

### GET /api/config

Get current configuration values.

**Response:**
```json
{
  "moisture_threshold": 30,
  "moisture_target": 60,
  "check_interval": 10,
  "watering_duration": 30,
  "cooldown_period": 300,
  "collection_interval": 1800,
  "api_port": 8000
}
```

---

### POST /api/collect

Manually trigger a data collection to database.

**Headers:** `X-API-Key: your-api-key`

**Response:**
```json
{
  "message": "Collection completed",
  "success": true
}
```

---

## Pump Endpoints (Legacy)

Direct pump control via GPIO or HTTP (before Modbus integration).

### POST /api/pump/on

Turn pump ON.

**Headers:** `X-API-Key: your-api-key`

### POST /api/pump/off

Turn pump OFF.

**Headers:** `X-API-Key: your-api-key`

### POST /api/pump/water

Water for specified duration.

**Headers:** `X-API-Key: your-api-key`

**Request Body:**
```json
{
  "duration": 30
}
```

**Note:** Maximum 300 seconds.

### GET /api/pump/status

Get pump status.

**Response:**
```json
{
  "is_on": false,
  "runtime": 0.0
}
```

---

## Error Responses

All endpoints return standard HTTP error codes:

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid parameters |
| 403 | Forbidden - Missing or invalid API key |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error - Operation failed |
| 503 | Service Unavailable - Sensor/device not available |

**Error Response Format:**
```json
{
  "detail": "Error message here"
}
```

**Authentication Error:**
```json
{
  "detail": "API key required. Provide X-API-Key header."
}
```

---

## CORS

CORS is configured for specific origins:
- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `http://raspberri.local:3000`
- `http://192.168.68.57:3000` (Pi WiFi)
- `http://192.168.1.100:3000` (Pi Ethernet)

Additional origins can be configured via `ALLOWED_ORIGINS` environment variable.

---

## Quick Reference

| Action | Method | Endpoint | Auth |
|--------|--------|----------|------|
| Get all status | GET | `/api/greenhouse/status` | No |
| Get sensors only | GET | `/api/greenhouse/sensors` | No |
| Pump ON | POST | `/api/greenhouse/pump/on` | Yes |
| Pump OFF | POST | `/api/greenhouse/pump/off` | Yes |
| Fan N ON | POST | `/api/greenhouse/fan/{n}/on` | Yes |
| Fan N OFF | POST | `/api/greenhouse/fan/{n}/off` | Yes |
| Relay control | POST | `/api/greenhouse/relay/{esp}/{ch}` | Yes |
| Emergency stop | POST | `/api/greenhouse/all-off` | Yes |
| Camera snapshot | GET | `/api/camera/snapshot` | No |
| Save snapshot | POST | `/api/camera/snapshot` | Yes |
| Camera status | GET | `/api/camera/status` | No |
| Health check | GET | `/health` | No |
| Trigger collection | POST | `/api/collect` | Yes |

---

## Example: cURL Commands

**Get status:**
```bash
curl http://raspberri.local:8000/api/greenhouse/status
```

**Turn fan 1 ON:**
```bash
curl -X POST http://raspberri.local:8000/api/greenhouse/fan/1/on \
  -H "X-API-Key: your-api-key-here"
```

**Emergency all-off:**
```bash
curl -X POST http://raspberri.local:8000/api/greenhouse/all-off \
  -H "X-API-Key: your-api-key-here"
```

**Get camera snapshot:**
```bash
curl http://raspberri.local:8000/api/camera/snapshot -o snapshot.jpg
```

---

*Last Updated: 2026-01-07*
