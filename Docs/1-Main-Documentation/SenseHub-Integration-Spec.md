# SenseHub Integration Specification

## Overview

SenseHub is a Dockerized edge computing platform deployed on Raspberry Pi 5 units installed in each farm block (greenhouse, open field, controlled environment). Each Raspberry Pi runs a self-contained SenseHub instance that manages local sensors, relays, and automation programs. SenseHub operates fully offline-first and exposes a REST API + WebSocket interface.

**A64CorePlatform** is the centralized cloud/server platform. Each block in A64CorePlatform can be linked to a SenseHub instance via its `iotController` field. The block monitor module should connect to each SenseHub instance to:

1. **Monitor** - Read sensor data, equipment status, and alerts in real-time
2. **Control** - Toggle relays (pumps, fans, lights, valves) remotely
3. **Automate** - Create, manage, and monitor automation programs running on the Pi
4. **Sync** - Pull historical readings and push cloud-suggested automation programs

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   A64CorePlatform                        │
│                  (Central Server)                        │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Block Monitor Module                    │   │
│  │                                                   │   │
│  │  Block A ──► SenseHub @ 192.168.1.101:3000       │   │
│  │  Block B ──► SenseHub @ 192.168.1.102:3000       │   │
│  │  Block C ──► SenseHub @ 192.168.1.103:3000       │   │
│  │  Block D ──► SenseHub @ 10.0.0.50:3000           │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  IoT Proxy (/api/v1/farm/iot-proxy) ◄── Frontend CORS  │
└─────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │ Pi + Hub │  │ Pi + Hub │  │ Pi + Hub │  │ Pi + Hub │
   │ Block A  │  │ Block B  │  │ Block C  │  │ Block D  │
   │ Sensors  │  │ Sensors  │  │ Sensors  │  │ Sensors  │
   │ Relays   │  │ Relays   │  │ Relays   │  │ Relays   │
   └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

**Communication Flow:** All frontend requests to SenseHub go through the existing IoT proxy at `/api/v1/farm/iot-proxy` to avoid CORS issues. Backend services can call SenseHub directly.

---

## SenseHub Connection Details

- **Base URL:** `http://{address}:{port}` (typically port `3000`)
- **WebSocket:** `ws://{address}:{port}/ws`
- **Authentication:** JWT Bearer token via `Authorization: Bearer {token}` header
- **Default Port:** `3000`
- **Health Check:** `GET /api/health` (no auth required)

### Obtaining a Token

SenseHub uses local email/password authentication. To connect from A64CorePlatform, you need to either:

1. **Use a dedicated service account** - Create a user on each SenseHub instance with `operator` or `admin` role specifically for A64CorePlatform access
2. **Store credentials in the block's `iotController` config** and authenticate on demand

```
POST /api/auth/login
Content-Type: application/json

{
  "email": "a64platform@sensehub.local",
  "password": "secure-service-password"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "email": "a64platform@sensehub.local",
    "name": "A64 Platform",
    "role": "operator"
  }
}
```

Tokens expire after **8 hours of inactivity**. Implement token caching and refresh logic.

### Check If Setup Is Complete

Before attempting login, check if the SenseHub instance has been set up:

```
GET /api/auth/setup-status

Response:
{
  "setupCompleted": true,
  "hasAdmin": true
}
```

If `setupCompleted` is `false`, the SenseHub instance needs initial setup before it can be used.

---

## Block `iotController` Field Update

The existing `iotController` model on the Block needs to be extended to support SenseHub authentication:

```python
class IoTController(BaseModel):
    address: str                          # IP address or hostname of the Pi
    port: int = 3000                      # SenseHub API port (default 3000)
    enabled: bool = True                  # Whether to fetch from this controller
    apiKey: Optional[str] = None          # Legacy field - not used by SenseHub
    controllerType: str = "sensehub"      # "sensehub" | "generic" (for backwards compat)
    senseHubCredentials: Optional[SenseHubCredentials] = None
    relayLabels: Dict[str, str] = {}      # Custom labels for relays
    lastConnected: Optional[datetime] = None
    lastSyncedAt: Optional[datetime] = None
    connectionStatus: str = "unknown"     # "connected" | "disconnected" | "error" | "unknown"

class SenseHubCredentials(BaseModel):
    email: str                            # Service account email on the SenseHub instance
    password: str                         # Encrypted/hashed - never expose to frontend
    token: Optional[str] = None           # Cached JWT token
    tokenExpiresAt: Optional[datetime] = None
```

---

## SenseHub API Endpoints Reference

All endpoints below are relative to the SenseHub base URL (`http://{address}:{port}`). All authenticated endpoints require the `Authorization: Bearer {token}` header.

### Health & System Info

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/health` | No | Health check (status, database, version) |
| GET | `/api/system/info` | Yes | System info (version, uptime, memory, CPU) |
| GET | `/api/auth/setup-status` | No | Check if initial setup is complete |

### Authentication

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/auth/login` | No | Login with email/password, returns JWT |
| POST | `/api/auth/logout` | Yes | Invalidate current session |
| GET | `/api/auth/session` | Yes | Validate current token/session |

### Equipment (Sensors & Relays)

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/equipment` | Yes | List all equipment (query: `status`, `search`, `zone`) |
| GET | `/api/equipment/:id` | Yes | Get single equipment with zone info |
| GET | `/api/equipment/:id/history` | Yes | Sensor reading history (query: `from`, `to`, `limit`) |
| GET | `/api/equipment/:id/errors` | Yes | Equipment error log |
| GET | `/api/equipment/:id/relay/state` | Yes | Get relay channel states |
| POST | `/api/equipment/:id/control` | Yes | Send control action to equipment |
| POST | `/api/equipment/:id/relay/control` | Yes | Control a single relay coil |
| POST | `/api/equipment/:id/relay/all` | Yes | Control all relay channels at once |

### Dashboard & Aggregated Data

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/dashboard/overview` | Yes | Full system overview (stats, alerts, readings) |
| GET | `/api/dashboard/zone/:id` | Yes | Zone-specific dashboard |
| GET | `/api/dashboard/equipment/:id` | Yes | Equipment-specific dashboard |

### Zones

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/zones` | Yes | List all zones with equipment counts |
| GET | `/api/zones/:id` | Yes | Zone details with equipment list |
| POST | `/api/zones` | Yes | Create zone |
| PUT | `/api/zones/:id` | Yes | Update zone |
| POST | `/api/zones/:id/equipment` | Yes | Assign equipment to zone |

### Automation Programs

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/automations` | Yes | List all automation programs |
| GET | `/api/automations/:id` | Yes | Get automation with run history |
| POST | `/api/automations` | Yes | Create new automation |
| PUT | `/api/automations/:id` | Yes | Update automation |
| DELETE | `/api/automations/:id` | Yes | Delete automation |
| POST | `/api/automations/:id/toggle` | Yes | Enable/disable automation |
| POST | `/api/automations/:id/trigger` | Yes | Manually trigger automation |
| POST | `/api/automations/:id/test` | Yes | Test automation in simulation mode |
| POST | `/api/automations/:id/duplicate` | Yes | Clone an automation |
| POST | `/api/automations/templates` | Yes | Get automation template library |

### Alerts

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/alerts` | Yes | List alerts (query: `severity`, `equipment_id`, `acknowledged`) |
| GET | `/api/alerts/unacknowledged/count` | Yes | Count of unacknowledged alerts |
| POST | `/api/alerts/:id/acknowledge` | Yes | Acknowledge an alert |

### Cloud Integration (A64CorePlatform as "Cloud")

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/cloud/status` | Yes | Cloud connection status |
| POST | `/api/cloud/connect` | Yes | Configure cloud connection |
| POST | `/api/cloud/disconnect` | Yes | Disconnect from cloud |
| POST | `/api/cloud/sync` | Yes | Trigger manual sync |
| GET | `/api/cloud/sync-history` | Yes | View sync history |
| GET | `/api/cloud/pending` | Yes | View pending sync items |
| POST | `/api/cloud/suggested-programs/:id/approve` | Yes | Approve a cloud-suggested program |
| POST | `/api/cloud/suggested-programs/:id/reject` | Yes | Reject a cloud-suggested program |

### Device Templates

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/templates` | Yes | List device templates (query: `category`, `manufacturer`, `protocol`) |
| GET | `/api/templates/:id` | Yes | Get specific template |

### Modbus Direct (Low-Level)

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/modbus/read/coils` | Yes | FC01 Read Coils |
| POST | `/api/modbus/read/holding-registers` | Yes | FC03 Read Holding Registers |
| POST | `/api/modbus/read/input-registers` | Yes | FC04 Read Input Registers |
| POST | `/api/modbus/write/coil` | Yes | FC05 Write Single Coil |
| POST | `/api/modbus/write/register` | Yes | FC06 Write Single Register |

---

## Data Models

### Equipment Object

```json
{
  "id": 1,
  "name": "Temperature Sensor - Section A",
  "description": "DHT22 temperature and humidity sensor",
  "type": "sensor",
  "protocol": "modbus",
  "address": "192.168.1.100:502",
  "status": "online",
  "enabled": true,
  "slave_id": 1,
  "polling_interval_ms": 5000,
  "last_reading": {
    "temperature": { "value": 28.5, "unit": "°C" },
    "humidity": { "value": 65.2, "unit": "%" }
  },
  "last_communication": "2026-02-14T10:30:00Z",
  "calibration_offset": 0,
  "calibration_scale": 1,
  "register_mappings": [
    {
      "name": "temperature",
      "register": "0",
      "type": "input",
      "dataType": "int16",
      "access": "read",
      "label": "Temperature"
    }
  ],
  "write_only": false,
  "created_at": "2026-01-15T08:00:00Z",
  "updated_at": "2026-02-14T10:30:00Z"
}
```

### Automation Object

```json
{
  "id": 1,
  "name": "High Temperature - Activate Exhaust Fan",
  "description": "Turn on exhaust fan when temperature exceeds 32°C",
  "enabled": true,
  "priority": 1,
  "trigger_config": {
    "type": "threshold",
    "equipment_id": 1,
    "sensor_type": "temperature",
    "operator": "gt",
    "threshold_value": 32,
    "unit": "°C"
  },
  "conditions": [],
  "condition_logic": "AND",
  "actions": [
    {
      "type": "control",
      "equipment_id": 3,
      "action": "on",
      "channel": 0,
      "delay_seconds": 0,
      "duration_seconds": 600
    },
    {
      "type": "alert",
      "severity": "warning",
      "message": "High temperature detected - exhaust fan activated"
    }
  ],
  "last_run": "2026-02-14T09:45:00Z",
  "run_count": 47,
  "created_at": "2026-01-20T12:00:00Z",
  "updated_at": "2026-02-10T15:30:00Z"
}
```

### Alert Object

```json
{
  "id": 15,
  "equipment_id": 1,
  "zone_id": 2,
  "severity": "warning",
  "message": "Temperature exceeded threshold: 34.2°C > 32°C",
  "acknowledged": false,
  "acknowledged_by": null,
  "equipment_name": "Temperature Sensor - Section A",
  "zone_name": "Greenhouse Zone 1",
  "created_at": "2026-02-14T10:15:00Z"
}
```

### Dashboard Overview Response

```json
{
  "equipment": {
    "total": 12,
    "online": 10,
    "offline": 1,
    "error": 1,
    "warning": 0
  },
  "zones": { "total": 3 },
  "automations": { "total": 8, "active": 6 },
  "alerts": {
    "unacknowledged": 3,
    "critical": 0,
    "warning": 2,
    "info": 1
  },
  "recent_alerts": [ /* last 5 alerts */ ],
  "recent_automation_runs": [ /* last 5 runs */ ],
  "latest_readings": [ /* latest reading per equipment */ ],
  "active_automations": [ /* enabled automations with last run */ ],
  "readings": [ /* historical readings for chart */ ],
  "equipment_list": [ /* all equipment for control panel */ ]
}
```

### Relay State

```json
{
  "equipmentId": 3,
  "equipmentName": "8-Channel Relay Module",
  "channels": {
    "0": { "state": true, "label": "Irrigation Pump" },
    "1": { "state": false, "label": "Exhaust Fan" },
    "2": { "state": false, "label": "Grow Lights" },
    "3": { "state": true, "label": "Misting System" },
    "4": { "state": false, "label": "Heater" },
    "5": { "state": false, "label": "CO2 Valve" },
    "6": { "state": false, "label": "Shade Curtain" },
    "7": { "state": false, "label": "Spare" }
  }
}
```

---

## WebSocket Real-Time Events

Connect to `ws://{address}:{port}/ws` for live updates. No authentication required for WebSocket (currently).

### Event Types

| Event Type | Description | Payload |
|------------|-------------|---------|
| `connected` | Initial connection confirmation | `{ timestamp }` |
| `sensor_reading` | New sensor reading received | `{ equipment_id, value, unit, timestamp }` |
| `relay_state_changed` | Relay toggled on/off | `{ equipment_id, channel, state, timestamp }` |
| `equipment_updated` | Equipment config changed | `{ equipment object }` |
| `equipment_error` | Equipment error detected | `{ equipment_id, error_type, message }` |
| `alert_acknowledged` | Alert was acknowledged | `{ alert_id, acknowledged_by }` |
| `equipment_control` | Control action executed | `{ equipment_id, action, result }` |
| `equipment_calibrated` | Calibration updated | `{ equipment_id, offset, scale }` |

### Ping/Pong Keep-Alive

```json
// Send
{ "type": "ping" }

// Receive
{ "type": "pong", "timestamp": "2026-02-14T10:30:00Z" }
```

---

## What to Build on A64CorePlatform

### 1. SenseHub Connection Service (Backend)

Create a service at `/src/modules/farm_manager/services/sensehub/` that handles:

**`sensehub_client.py`** - HTTP client for SenseHub API
- Token management (login, cache, refresh on 401)
- Retry logic with exponential backoff
- Connection pooling per SenseHub instance
- Timeout handling (5 second default)
- All API calls wrapped as typed methods

**`sensehub_sync_service.py`** - Background sync service
- Periodic health check polling for connected blocks
- Pull latest sensor readings and cache locally
- Pull active alerts from each instance
- Update block `connectionStatus` and `lastConnected`
- Optional: pull historical readings for analytics

**`sensehub_automation_service.py`** - Automation management
- CRUD operations on remote automations
- Push automation templates from A64CorePlatform to SenseHub
- Monitor automation execution status

### 2. New Backend API Endpoints

Add to `/src/modules/farm_manager/api/v1/`:

**`sensehub_proxy.py`** - Enhanced IoT proxy for SenseHub

```
# Connection Management
POST /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/connect
     - Test connection and authenticate with SenseHub instance
     - Store credentials securely
     - Returns: connection status, SenseHub version, equipment count

POST /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/disconnect
     - Clear stored credentials and token

GET  /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/status
     - Get current connection status, last sync time, SenseHub health

# Dashboard & Monitoring
GET  /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/dashboard
     - Proxy to GET /api/dashboard/overview on SenseHub
     - Returns: equipment stats, sensor readings, alerts, automations

GET  /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/equipment
     - Proxy to GET /api/equipment on SenseHub
     - Returns: all sensors and relays with current status

GET  /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/equipment/{equipment_id}/history
     - Proxy to GET /api/equipment/:id/history on SenseHub
     - Query params: from, to, limit

# Relay Control
POST /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/equipment/{equipment_id}/relay/control
     - Proxy to POST /api/equipment/:id/relay/control on SenseHub
     - Body: { "channel": 0, "state": true }

POST /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/equipment/{equipment_id}/relay/all
     - Proxy to POST /api/equipment/:id/relay/all on SenseHub
     - Body: { "states": [true, false, true, false, false, false, false, false] }

# Automation Management
GET  /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/automations
     - Proxy to GET /api/automations on SenseHub

POST /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/automations
     - Proxy to POST /api/automations on SenseHub
     - Create automation on the remote Pi

PUT  /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/automations/{automation_id}
     - Proxy to PUT /api/automations/:id on SenseHub

POST /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/automations/{automation_id}/toggle
     - Proxy to POST /api/automations/:id/toggle on SenseHub

POST /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/automations/{automation_id}/trigger
     - Proxy to POST /api/automations/:id/trigger on SenseHub

DELETE /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/automations/{automation_id}
     - Proxy to DELETE /api/automations/:id on SenseHub

# Alerts
GET  /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/alerts
     - Proxy to GET /api/alerts on SenseHub
     - Query params: severity, acknowledged

POST /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/alerts/{alert_id}/acknowledge
     - Proxy to POST /api/alerts/:id/acknowledge on SenseHub

# Templates
GET  /api/v1/farm/farms/{farm_id}/blocks/{block_id}/sensehub/templates
     - Proxy to GET /api/templates on SenseHub
     - Returns available device templates
```

### 3. Frontend Changes

#### Update Block Model Types (`/frontend/user-portal/src/types/farm.ts`)

```typescript
interface SenseHubCredentials {
  email: string;
  // password is never sent to frontend
  connected: boolean;
  lastConnected: string | null;
  connectionStatus: 'connected' | 'disconnected' | 'error' | 'unknown';
  senseHubVersion: string | null;
}

interface IoTController {
  address: string;
  port: number;
  enabled: boolean;
  apiKey?: string;                          // Legacy
  controllerType: 'sensehub' | 'generic';  // New
  senseHub?: SenseHubCredentials;           // New
  relayLabels: Record<string, string>;
  lastConnected: string | null;
}
```

#### Update `BlockAutomationTab.tsx`

Enhance the existing automation tab to support SenseHub integration:

**Connection Setup Panel:**
- SenseHub URL input (address + port)
- Service account credentials (email + password)
- "Test Connection" button → calls `/sensehub/connect`
- Connection status indicator (green/yellow/red)
- SenseHub version display
- "Disconnect" button

**Equipment Overview Panel:**
- List all sensors and relays from SenseHub
- Show online/offline status per device
- Last reading timestamp
- Click to expand sensor history chart

**Sensor Readings Display:**
- Real-time sensor values (temperature, humidity, pressure, etc.)
- Mini sparkline charts for recent trends
- Alert indicators when values exceed thresholds
- Auto-refresh every 10 seconds (or WebSocket for live updates)

**Relay Control Panel:**
- Grid/list of relay channels with custom labels
- Toggle switches for on/off control
- Status indicators (green = ON, gray = OFF, red = ERROR)
- Confirmation dialog for relay state changes
- Bulk control (all on / all off)

**Automation Management Panel:**
- List of automation programs running on the Pi
- Enable/disable toggle per automation
- Create new automation (form with trigger, conditions, actions)
- Edit existing automation
- Manual trigger button
- Run history with success/failure status
- Automation templates library

**Alerts Panel:**
- List of active alerts from SenseHub
- Severity badges (critical/warning/info)
- Acknowledge button
- Filter by severity
- Alert count badge on tab header

#### New API Service Functions (`/frontend/user-portal/src/services/farmApi.ts`)

```typescript
// SenseHub Connection
export const connectSenseHub = (farmId: string, blockId: string, credentials: {
  address: string;
  port: number;
  email: string;
  password: string;
}) => api.post(`/farm/farms/${farmId}/blocks/${blockId}/sensehub/connect`, credentials);

export const disconnectSenseHub = (farmId: string, blockId: string) =>
  api.post(`/farm/farms/${farmId}/blocks/${blockId}/sensehub/disconnect`);

export const getSenseHubStatus = (farmId: string, blockId: string) =>
  api.get(`/farm/farms/${farmId}/blocks/${blockId}/sensehub/status`);

// Dashboard
export const getSenseHubDashboard = (farmId: string, blockId: string) =>
  api.get(`/farm/farms/${farmId}/blocks/${blockId}/sensehub/dashboard`);

// Equipment
export const getSenseHubEquipment = (farmId: string, blockId: string) =>
  api.get(`/farm/farms/${farmId}/blocks/${blockId}/sensehub/equipment`);

export const getSenseHubEquipmentHistory = (farmId: string, blockId: string, equipmentId: number, params?: {
  from?: string;
  to?: string;
  limit?: number;
}) => api.get(`/farm/farms/${farmId}/blocks/${blockId}/sensehub/equipment/${equipmentId}/history`, { params });

// Relay Control
export const controlSenseHubRelay = (farmId: string, blockId: string, equipmentId: number, data: {
  channel: number;
  state: boolean;
}) => api.post(`/farm/farms/${farmId}/blocks/${blockId}/sensehub/equipment/${equipmentId}/relay/control`, data);

export const controlSenseHubRelayAll = (farmId: string, blockId: string, equipmentId: number, data: {
  states: boolean[];
}) => api.post(`/farm/farms/${farmId}/blocks/${blockId}/sensehub/equipment/${equipmentId}/relay/all`, data);

// Automations
export const getSenseHubAutomations = (farmId: string, blockId: string) =>
  api.get(`/farm/farms/${farmId}/blocks/${blockId}/sensehub/automations`);

export const createSenseHubAutomation = (farmId: string, blockId: string, data: SenseHubAutomation) =>
  api.post(`/farm/farms/${farmId}/blocks/${blockId}/sensehub/automations`, data);

export const updateSenseHubAutomation = (farmId: string, blockId: string, automationId: number, data: SenseHubAutomation) =>
  api.put(`/farm/farms/${farmId}/blocks/${blockId}/sensehub/automations/${automationId}`, data);

export const toggleSenseHubAutomation = (farmId: string, blockId: string, automationId: number) =>
  api.post(`/farm/farms/${farmId}/blocks/${blockId}/sensehub/automations/${automationId}/toggle`);

export const triggerSenseHubAutomation = (farmId: string, blockId: string, automationId: number) =>
  api.post(`/farm/farms/${farmId}/blocks/${blockId}/sensehub/automations/${automationId}/trigger`);

export const deleteSenseHubAutomation = (farmId: string, blockId: string, automationId: number) =>
  api.delete(`/farm/farms/${farmId}/blocks/${blockId}/sensehub/automations/${automationId}`);

// Alerts
export const getSenseHubAlerts = (farmId: string, blockId: string, params?: {
  severity?: string;
  acknowledged?: boolean;
}) => api.get(`/farm/farms/${farmId}/blocks/${blockId}/sensehub/alerts`, { params });

export const acknowledgeSenseHubAlert = (farmId: string, blockId: string, alertId: number) =>
  api.post(`/farm/farms/${farmId}/blocks/${blockId}/sensehub/alerts/${alertId}/acknowledge`);
```

### 4. Data Mapping: SenseHub → A64CorePlatform IoT Format

The existing `BlockAutomationTab.tsx` expects data in a specific format. Map SenseHub responses to match:

```typescript
// SenseHub GET /api/equipment → A64CorePlatform IoTDeviceData format

function mapSenseHubToIoTData(
  dashboardData: SenseHubDashboard,
  equipmentList: SenseHubEquipment[]
): IoTDeviceData {
  return {
    controllerId: `sensehub-${dashboardData.system?.hostname || 'unknown'}`,
    controllerName: `SenseHub v${dashboardData.system?.version || '1.0.0'}`,
    lastUpdate: new Date().toISOString(),
    sensors: equipmentList
      .filter(e => e.type === 'sensor' || !e.write_only)
      .map(e => ({
        id: String(e.id),
        name: e.name,
        type: e.type,
        label: e.description || e.name,
        online: e.status === 'online',
        readings: e.last_reading || {},
      })),
    relays: equipmentList
      .filter(e => e.type === 'relay' || e.write_only)
      .flatMap(e => {
        // Expand relay equipment into individual channels
        const mappings = e.register_mappings || [];
        return mappings.map((m, idx) => ({
          id: `${e.id}-ch${idx}`,
          label: m.label || m.name || `Channel ${idx}`,
          state: false, // Fetch actual state from /relay/state
          online: e.status === 'online',
        }));
      }),
  };
}
```

### 5. SenseHub as "Cloud" Provider

SenseHub has a built-in cloud sync module. A64CorePlatform can act as the "cloud" endpoint that SenseHub syncs with. This enables:

- **Bi-directional sync** of equipment data and readings
- **Push automation programs** from A64CorePlatform down to SenseHub instances
- **Centralized alert aggregation** across all blocks

To configure SenseHub to sync with A64CorePlatform, use:

```
POST /api/cloud/connect
{
  "url": "https://your-a64-platform.com",
  "apiKey": "platform-api-key",
  "syncInterval": 300
}
```

This is optional and separate from the proxy-based approach above. The proxy approach gives immediate control; the cloud sync approach gives background data aggregation.

---

## Implementation Priority

### Phase 1: Connection & Monitoring (MVP)
1. Update `IoTController` model with `controllerType` and `senseHubCredentials`
2. Create `/sensehub/connect` endpoint with token management
3. Create `/sensehub/status` and `/sensehub/dashboard` proxy endpoints
4. Create `/sensehub/equipment` proxy endpoint
5. Update `BlockAutomationTab.tsx` connection setup UI
6. Display sensor readings from SenseHub
7. Display equipment online/offline status

### Phase 2: Relay Control
1. Create `/sensehub/equipment/:id/relay/control` proxy endpoint
2. Create `/sensehub/equipment/:id/relay/all` proxy endpoint
3. Build relay control panel in BlockAutomationTab
4. Add relay label management
5. Add confirmation dialogs for relay state changes

### Phase 3: Automation Management
1. Create automation CRUD proxy endpoints
2. Build automation list/detail views
3. Build automation creation form (trigger + conditions + actions)
4. Add enable/disable toggles
5. Add manual trigger capability
6. Show automation run history

### Phase 4: Alerts & Advanced Features
1. Create alert proxy endpoints
2. Build alert display panel with severity filtering
3. Add alert acknowledgment
4. Add alert count badges to block cards
5. WebSocket integration for real-time updates
6. Background sync service for periodic data pull
7. Historical reading charts and analytics correlation

---

## Error Handling

All proxy endpoints should handle these SenseHub error scenarios:

| Scenario | HTTP Status | Action |
|----------|-------------|--------|
| SenseHub unreachable | 503 | Return `connectionStatus: "disconnected"`, show offline indicator |
| Token expired (401) | - | Auto-refresh token using stored credentials, retry once |
| Invalid credentials | 401 | Return error, prompt user to update credentials |
| SenseHub not set up | 400 | Return `setupRequired: true`, show setup instructions |
| Request timeout (>5s) | 504 | Return timeout error, suggest checking network |
| SenseHub internal error (500) | 502 | Forward error message from SenseHub |

---

## Security Considerations

1. **Credential Storage:** SenseHub passwords must be encrypted at rest in MongoDB. Never expose passwords to the frontend. Use a symmetric encryption key stored in environment variables.
2. **Token Caching:** Cache JWT tokens server-side only. Include token expiry tracking. Auto-refresh before expiry.
3. **Network Security:** SenseHub instances are typically on the local network. If accessed over the internet, ensure HTTPS/TLS.
4. **Role Mapping:** A64CorePlatform `admin` → SenseHub `admin` role. A64CorePlatform `manager`/`worker` → SenseHub `operator` role. A64CorePlatform `viewer` → SenseHub `viewer` role.
5. **Rate Limiting:** Respect SenseHub's local resources. Don't poll faster than every 5 seconds. Use WebSocket for real-time needs instead of rapid polling.
