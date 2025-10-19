# External API Integration Guide

**Version:** 1.0.0
**Status:** Planning
**Created:** 2025-10-19
**Platform:** A64 Core Platform

---

## Overview

The External API Integration system allows the CCM dashboard to display data from third-party services like Stripe, SendGrid, Google Analytics, IoT sensors, and custom APIs. All external API requests are proxied through the backend for security and credential management.

---

## Architecture

```
┌─────────────────┐
│  User Dashboard │
│    (Frontend)   │
└────────┬────────┘
         │
         │ Request data for widget
         │
         ▼
┌─────────────────┐
│  Backend Proxy  │ ← Manages credentials, rate limiting, caching
│    (FastAPI)    │
└────────┬────────┘
         │
         │ Authenticated request
         │
         ▼
┌─────────────────┐
│  External API   │
│  (Stripe, etc.) │
└─────────────────┘
```

**Key Benefits:**
- Centralized credential management
- Rate limiting and quota management
- Response caching
- Request validation
- Audit logging
- Error handling

---

## Supported Authentication Methods

### 1. Bearer Token
Most modern APIs (Stripe, SendGrid)

```json
{
  "auth_type": "bearer",
  "api_key": "sk_live_..."
}
```

### 2. API Key Header
Custom header-based auth

```json
{
  "auth_type": "api_key",
  "header_name": "X-API-Key",
  "api_key": "abc123..."
}
```

### 3. Basic Authentication
Username/password

```json
{
  "auth_type": "basic",
  "username": "user",
  "password": "pass"
}
```

### 4. OAuth 2.0
Third-party authorization (Google, Facebook)

```json
{
  "auth_type": "oauth2",
  "client_id": "...",
  "client_secret": "...",
  "access_token": "...",
  "refresh_token": "..."
}
```

---

## Pre-Built API Connectors

### Stripe (Payments)

**Configuration:**
```typescript
{
  apiName: 'stripe',
  baseUrl: 'https://api.stripe.com',
  authType: 'bearer',
  apiKey: 'sk_live_...'
}
```

**Available Endpoints:**
- `/v1/charges` - Payment transactions
- `/v1/balance` - Account balance
- `/v1/customers` - Customer list
- `/v1/subscriptions` - Subscriptions

**Example Widget:**
```typescript
{
  dataSource: {
    type: 'external_api',
    apiName: 'stripe',
    endpoint: '/v1/charges',
    params: { limit: 100, created: { gte: 'today' } }
  }
}
```

---

### SendGrid (Email)

**Configuration:**
```typescript
{
  apiName: 'sendgrid',
  baseUrl: 'https://api.sendgrid.com/v3',
  authType: 'bearer',
  apiKey: 'SG.xxx...'
}
```

**Available Endpoints:**
- `/stats` - Email statistics
- `/campaigns` - Campaign performance
- `/bounces` - Bounce reports

---

### Google Analytics

**Configuration:**
```typescript
{
  apiName: 'google_analytics',
  baseUrl: 'https://analyticsreporting.googleapis.com/v4',
  authType: 'oauth2',
  // OAuth credentials
}
```

---

### Custom API

**Configuration:**
```typescript
{
  apiName: 'custom_api',
  baseUrl: 'https://your-api.com',
  authType: 'bearer',
  apiKey: 'your-key'
}
```

---

## Adding External API Configuration

### Frontend UI

Navigate to: **User Portal → Integrations → External APIs**

1. Click "Add API"
2. Select API type or choose "Custom"
3. Enter base URL
4. Select authentication method
5. Provide credentials
6. Test connection
7. Save configuration

### Backend Storage

Credentials are encrypted and stored in MongoDB:

```javascript
// Collection: external_api_configs
{
  _id: ObjectId("..."),
  user_id: "uuid",
  api_name: "stripe",
  base_url: "https://api.stripe.com",
  auth_type: "bearer",
  encrypted_credentials: "...", // Fernet encrypted
  created_at: ISODate("..."),
  updated_at: ISODate("...")
}
```

---

## Backend Implementation

### External API Service

```python
# src/services/external_api_service.py
import httpx
from cryptography.fernet import Fernet

class ExternalAPIService:
    async def fetch_data(
        self,
        api_name: str,
        endpoint: string,
        user_id: str,
        params: dict = None
    ) -> dict:
        # Get API config
        config = await self.get_config(api_name, user_id)

        # Build URL
        url = f"{config['base_url']}{endpoint}"

        # Build headers
        headers = self._build_auth_headers(config)

        # Make request
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=headers,
                params=params,
                timeout=30.0
            )
            return response.json()

    def _build_auth_headers(self, config: dict) -> dict:
        headers = {"Content-Type": "application/json"}

        if config['auth_type'] == 'bearer':
            headers['Authorization'] = f"Bearer {config['api_key']}"
        elif config['auth_type'] == 'api_key':
            headers[config['header_name']] = config['api_key']

        return headers
```

---

## Rate Limiting

Each external API has rate limits. The proxy handles this automatically:

```python
# src/middleware/rate_limit_external_api.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# Per-API rate limits
API_RATE_LIMITS = {
    'stripe': '100/minute',
    'sendgrid': '50/minute',
    'google_analytics': '10/minute',
    'custom': '30/minute'
}

@app.post("/external-api/proxy")
@limiter.limit(lambda: API_RATE_LIMITS.get(request.json['apiName'], '30/minute'))
async def proxy_external_api(request: ExternalAPIRequest):
    # Proxy logic
    pass
```

---

## Caching

Reduce API calls and costs with caching:

```python
# src/services/external_api_cache.py
from redis import Redis
import json

class ExternalAPICache:
    def __init__(self):
        self.redis = Redis()

    async def get_cached(self, cache_key: str) -> dict | None:
        cached = self.redis.get(cache_key)
        return json.loads(cached) if cached else None

    async def set_cached(self, cache_key: str, data: dict, ttl: int):
        self.redis.setex(
            cache_key,
            ttl,
            json.dumps(data)
        )
```

**Cache TTL by API:**
- Stripe: 60 seconds
- SendGrid: 300 seconds
- Analytics: 600 seconds

---

## Security Best Practices

1. **Never expose credentials to frontend**
2. **Encrypt credentials at rest** (Fernet)
3. **Use HTTPS for all external API calls**
4. **Validate all responses**
5. **Log all external API requests**
6. **Implement rate limiting**
7. **Rotate API keys regularly**

---

## Testing External API Integration

```bash
# Test API configuration
curl -X POST http://localhost/api/v1/external-api/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "api_name": "stripe",
    "endpoint": "/v1/balance"
  }'
```

---

## Troubleshooting

**Issue: API returns 401 Unauthorized**
- Verify API key is correct
- Check if key has required permissions
- Ensure token is not expired

**Issue: Rate limit exceeded**
- Increase widget refresh interval
- Implement caching
- Upgrade API plan

**Issue: Slow response**
- Enable caching
- Reduce data fetched
- Use pagination

---

## References

- [CCM Architecture](./CCM-Architecture.md)
- [Widget Development Guide](./Widget-Development-Guide.md)

---

**End of External API Integration Guide**
