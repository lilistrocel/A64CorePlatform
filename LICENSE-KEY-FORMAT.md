# License Key Format Guide

## Valid License Key Formats

The A64 Core Platform Module Management System supports three license key formats:

### 1. Segmented Format (Recommended for Testing)

**Pattern:** `XXX-YYY-ZZZ` or `XXX-YYY-ZZZ-AAA` or `XXX-YYY-ZZZ-AAA-BBB`

Each segment must be **3-4 uppercase alphanumeric characters** (A-Z, 0-9).

**Valid Examples:**
```
TEST-EXAM-PLE1-2345
A8B9-C7D6-E5F4
MOD1-KEY2-VAL3-4567
PROD-1234-ABCD
```

**Invalid Examples:**
```
❌ test-exam-ple1-2345          (lowercase not allowed)
❌ EXAMPLE-APP-LICENSE-12345    (segments too long)
❌ TEST_EXAM_PLE1_2345          (underscores not allowed, use hyphens)
❌ TEST                         (too few segments)
```

### 2. UUID Format

**Pattern:** Standard UUID v4 format (8-4-4-4-12 hex digits)

**Valid Examples:**
```
550e8400-e29b-41d4-a716-446655440000
f47ac10b-58cc-4372-a567-0e02b2c3d479
123e4567-e89b-12d3-a456-426614174000
```

### 3. Alphanumeric Format

**Pattern:** 20-100 uppercase alphanumeric characters (no hyphens)

**Valid Examples:**
```
ABCD1234EFGH5678IJKL9012
A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6
TESTLICENSEKEYFORMAT12345678901234
```

---

## How to Use

### For Testing (Quick)

Use the segmented format with any values:

```json
{
  "license_key": "TEST-EXAM-PLE1-2345"
}
```

### Generate Test License

Use the provided script:

```bash
python scripts/generate_license.py
```

**Output:**
```
Test License Key: OGVC-ZI5E-FC6P-EUSI
```

### Validation Modes

The system supports three validation modes (set via `LICENSE_VALIDATION_MODE` environment variable):

#### 1. Format Validation Only (Default for Development)

```bash
LICENSE_VALIDATION_MODE=format
```

- ✅ Fast (no network calls)
- ✅ Checks format only
- ✅ Perfect for development
- ❌ No checksum verification
- ❌ No revocation checking

#### 2. Offline Validation (Recommended for Testing)

```bash
LICENSE_VALIDATION_MODE=offline
```

- ✅ Format validation
- ✅ Luhn checksum (for numeric keys)
- ✅ Revocation list check (cached)
- ❌ No online server verification

#### 3. Online Validation (Production)

```bash
LICENSE_VALIDATION_MODE=online
LICENSE_SERVER_URL=https://your-license-server.com
LICENSE_SERVER_API_KEY=your-api-key
```

- ✅ All offline checks
- ✅ Real-time server verification
- ✅ Expiration checking
- ✅ Feature flag validation
- ❌ Requires network connection
- ❌ Requires license server setup

---

## Common Errors

### Error: "Invalid license key format"

**Cause:** License key doesn't match any supported format

**Solution:** Use one of the valid formats above. Quick fix:

```json
{
  "license_key": "TEST-EXAM-PLE1-2345"
}
```

### Error: "Invalid license key checksum"

**Cause:** Checksum validation failed (offline mode with numeric keys)

**Solution:**
1. Switch to format-only validation for testing
2. Or generate a license with valid checksum using the utility

### Error: "License key has been revoked"

**Cause:** License was added to revocation list

**Solution:** Use a different license key or contact administrator

---

## Quick Reference

| Format | Example | Length | Case Sensitive |
|--------|---------|--------|----------------|
| Segmented | `TEST-EXAM-PLE1-2345` | 3-5 segments of 3-4 chars | Uppercase only |
| UUID | `550e8400-e29b-41d4-a716-446655440000` | Fixed (36 chars) | Lowercase only |
| Alphanumeric | `ABCD1234EFGH5678IJKL9012` | 20-100 chars | Uppercase only |

---

## For Production

In production, you would:

1. **Set up a license server** that issues real licenses
2. **Use online validation** mode
3. **Implement license generation** with proper cryptography
4. **Track license usage** and enforce limits
5. **Handle expiration** and renewal

For development and testing, the simple segmented format works perfectly!

---

## Examples in Different Scenarios

### Local Development

```json
{
  "module_name": "my-app",
  "docker_image": "localhost/my-app:1.0.0",
  "license_key": "DEV1-TEST-KEY2-3456",
  "version": "1.0.0"
}
```

### Staging Environment

```json
{
  "module_name": "my-app",
  "docker_image": "staging-registry:5000/my-app:1.0.0",
  "license_key": "STAG-ING1-ENV2-7890",
  "version": "1.0.0"
}
```

### Production (with UUID)

```json
{
  "module_name": "my-app",
  "docker_image": "ghcr.io/mycompany/my-app:1.0.0",
  "license_key": "550e8400-e29b-41d4-a716-446655440000",
  "version": "1.0.0"
}
```

---

## Need Help?

- **Generate a test license:** `python scripts/generate_license.py`
- **Test validation:** Check `src/utils/license_validator.py`
- **Module installation:** See `DOCKER-IMAGE-QUICK-START.md`

**Quick fix for testing:** Just use `TEST-EXAM-PLE1-2345` as your license key!
