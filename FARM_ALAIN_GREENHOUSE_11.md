# Alain Greenhouse 11 - Wiring Configuration

**Site:** Alain Greenhouse 11
**Location:** Al Ain, UAE
**Last Updated:** 2026-01-07

---

## Overview

- **Fans:** 10 exhaust fans
- **Pump:** 1 chiller pump
- **ESP32 Controllers:** 2 (ESP32 #4 and #5)
- **Total Relay Channels Used:** 11 of 12 available

---

## Physical Wiring Map

### ESP32 #4 (Modbus Address 19)

| Channel | Coil | Connected Device | API Endpoint |
|---------|------|------------------|--------------|
| CH0 | 0 | (unused) | - |
| CH1 | 1 | Fan 10 | `/api/greenhouse/fan/10/on` |
| CH2 | 2 | **chiller Pump** | `/api/greenhouse/pump/on` |
| CH3 | 3 | Fan 7 | `/api/greenhouse/fan/7/on` |
| CH4 | 4 | Fan 9 | `/api/greenhouse/fan/9/on` |
| CH5 | 5 | Fan 8 | `/api/greenhouse/fan/8/on` |

### ESP32 #5 (Modbus Address 20)

| Channel | Coil | Connected Device | API Endpoint |
|---------|------|------------------|--------------|
| CH0 | 0 | Fan 6 | `/api/greenhouse/fan/6/on` |
| CH1 | 1 | Fan 2 | `/api/greenhouse/fan/2/on` |
| CH2 | 2 | Fan 3 | `/api/greenhouse/fan/3/on` |
| CH3 | 3 | Fan 4 | `/api/greenhouse/fan/4/on` |
| CH4 | 4 | Fan 5 | `/api/greenhouse/fan/5/on` |
| CH5 | 5 | Fan 1 | `/api/greenhouse/fan/1/on` |

---

## Logical to Physical Mapping

Sorted by logical fan number for easy reference:

| Fan # | ESP32 | Address | Channel | Coil |
|-------|-------|---------|---------|------|
| Fan 1 | #5 | 20 | CH5 | 5 |
| Fan 2 | #5 | 20 | CH1 | 1 |
| Fan 3 | #5 | 20 | CH2 | 2 |
| Fan 4 | #5 | 20 | CH3 | 3 |
| Fan 5 | #5 | 20 | CH4 | 4 |
| Fan 6 | #5 | 20 | CH0 | 0 |
| Fan 7 | #4 | 19 | CH3 | 3 |
| Fan 8 | #4 | 19 | CH5 | 5 |
| Fan 9 | #4 | 19 | CH4 | 4 |
| Fan 10 | #4 | 19 | CH1 | 1 |
| **Pump** | #4 | 19 | CH2 | 2 |

---

## config.py Settings

These settings are configured in `config.py` for this site:

```python
# chiller pump assignment
IRRIGATION_PUMP_ESP32 = ESP32_4_ADDRESS  # 19
IRRIGATION_PUMP_CHANNEL = 2

# Fan assignments
FAN_ASSIGNMENTS = {
    1: (ESP32_5_ADDRESS, 5),   # ESP32 #5 CH5
    2: (ESP32_5_ADDRESS, 1),   # ESP32 #5 CH1
    3: (ESP32_5_ADDRESS, 2),   # ESP32 #5 CH2
    4: (ESP32_5_ADDRESS, 3),   # ESP32 #5 CH3
    5: (ESP32_5_ADDRESS, 4),   # ESP32 #5 CH4
    6: (ESP32_5_ADDRESS, 0),   # ESP32 #5 CH0
    7: (ESP32_4_ADDRESS, 3),   # ESP32 #4 CH3
    8: (ESP32_4_ADDRESS, 5),   # ESP32 #4 CH5
    9: (ESP32_4_ADDRESS, 4),   # ESP32 #4 CH4
    10: (ESP32_4_ADDRESS, 1),  # ESP32 #4 CH1
}
```

---

## RS485 Bus Devices

| Device | Address | Type |
|--------|---------|------|
| SHT20 Air Sensor | 1 (0x01) | Temperature/Humidity |
| 7-in-1 Soil Sensor | 3 (0x03) | Soil monitoring |
| ESP32 #4 | 19 (0x13) | Relay controller |
| ESP32 #5 | 20 (0x14) | Relay controller |

**Note:** XY-MD02 (address 2) is installed but not actively polled.

---

## Network Configuration

| Device | IP Address | Port |
|--------|------------|------|
| Raspberry Pi (eth0) | 192.168.1.100 | - |
| Waveshare RS485-ETH Gateway | 192.168.1.201 | 4196 |
| Hikvision Camera | 192.168.1.64 | - |

---

## Contactor Wiring

ESP32 relays control Schneider LC1D09 contactors (220V AC coils):

```
ESP32 Relay          Contactor
[NO]  [COM]  [NC]    [A1]  [A2]
  │     │              │     │
  │     └── Live (L) ──┘     │
  └────────────────────┘     │
                    Neutral (N)
```

Each contactor switches a 3-phase exhaust fan or pump motor.

---

## Testing Commands

Test individual channels via direct Modbus control:

```bash
# Turn on Fan 1 (ESP32 #5, coil 5)
curl -X POST http://raspberri.local:8000/api/greenhouse/fan/1/on \
  -H "X-API-Key: your-api-key"

# Turn on Pump (ESP32 #4, coil 2)
curl -X POST http://raspberri.local:8000/api/greenhouse/pump/on \
  -H "X-API-Key: your-api-key"

# Emergency all-off
curl -X POST http://raspberri.local:8000/api/greenhouse/all-off \
  -H "X-API-Key: your-api-key"
```

---

## Notes

- ESP32 #4 CH0 is unused (available for future expansion)
- ESP32 #1, #2, #3 are spare (not used at this site)
- All ESP32s have 60-second watchdog - relays auto-off if no command received
