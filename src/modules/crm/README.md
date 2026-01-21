# CRM Module - Customer Relationship Management

A comprehensive Customer Relationship Management (CRM) system for managing customers, contacts, and business relationships, following the exact architectural patterns of the farm_manager module.

## Version

**1.0.0** - Initial Release

## Features

- **Customer Management**: Create, read, update, delete customers
- **Customer Types**: Support for individual and business customers
- **Customer Status Tracking**: Lead, Prospect, Active, Inactive
- **Search Functionality**: Full-text search across name, email, and company
- **Auto-generated Customer Codes**: C001, C002, C003, etc.
- **Address Management**: Structured address fields
- **Tagging System**: Categorize customers with custom tags
- **Notes**: Add detailed notes for each customer
- **Audit Trail**: Track who created each customer and when

## Module Structure

```
src/modules/crm/
├── manifest.json                           # Module metadata and configuration
├── register.py                             # Module registration with main app
├── __init__.py                             # Module initialization
├── README.md                               # This file
├── api/
│   ├── __init__.py
│   └── v1/
│       ├── __init__.py
│       └── customers.py                    # Customer CRUD endpoints
├── models/
│   ├── __init__.py
│   └── customer.py                         # Customer Pydantic models
├── services/
│   ├── __init__.py
│   ├── database.py                         # MongoDB connection manager
│   └── customer/
│       ├── __init__.py
│       ├── customer_repository.py          # Data access layer
│       └── customer_service.py             # Business logic layer
├── middleware/
│   ├── __init__.py
│   └── auth.py                             # JWT authentication
├── config/
│   ├── __init__.py
│   └── settings.py                         # Module configuration
└── utils/
    ├── __init__.py
    └── responses.py                        # Standard API responses
```

## Database Schema

### MongoDB Collection: `customers`

```json
{
  "customerId": "UUID (string)",
  "customerCode": "C001",
  "name": "string (required)",
  "email": "string (optional, validated)",
  "phone": "string (optional)",
  "company": "string (optional)",
  "address": {
    "street": "string",
    "city": "string",
    "state": "string",
    "country": "string",
    "postalCode": "string"
  },
  "type": "individual|business",
  "status": "active|inactive|lead|prospect",
  "notes": "string",
  "tags": ["string"],
  "createdBy": "UUID (string)",
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

### Indexes

- `customerId` (unique)
- `customerCode` (unique)
- `email`
- `phone`
- `company`
- `type`
- `status`
- `createdBy`
- `tags`
- `createdAt` (descending)
- Text search index on: `name`, `email`, `company`

## API Endpoints

### Base URL: `/api/v1/crm`

#### Create Customer
```http
POST /api/v1/crm/customers
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Smith",
  "email": "john.smith@example.com",
  "phone": "+1-555-0123",
  "company": "Acme Corporation",
  "address": {
    "street": "123 Main Street",
    "city": "New York",
    "state": "NY",
    "country": "United States",
    "postalCode": "10001"
  },
  "type": "business",
  "status": "active",
  "notes": "Key account - handles all northeast region sales",
  "tags": ["enterprise", "priority", "northeast"]
}
```

**Response:** 201 Created
```json
{
  "data": {
    "customerId": "c47ac10b-58cc-4372-a567-0e02b2c3d479",
    "customerCode": "C001",
    "name": "John Smith",
    ...
  },
  "message": "Customer created successfully"
}
```

#### List Customers (Paginated)
```http
GET /api/v1/crm/customers?page=1&perPage=20&status=active&type=business
Authorization: Bearer <token>
```

**Response:** 200 OK
```json
{
  "data": [
    {
      "customerId": "...",
      "customerCode": "C001",
      "name": "John Smith",
      ...
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "perPage": 20,
    "totalPages": 8
  }
}
```

#### Search Customers
```http
GET /api/v1/crm/customers/search?q=acme&page=1&perPage=20
Authorization: Bearer <token>
```

**Response:** 200 OK (same structure as list)

#### Get Customer by ID
```http
GET /api/v1/crm/customers/{customer_id}
Authorization: Bearer <token>
```

**Response:** 200 OK
```json
{
  "data": {
    "customerId": "c47ac10b-58cc-4372-a567-0e02b2c3d479",
    "customerCode": "C001",
    ...
  }
}
```

#### Update Customer
```http
PATCH /api/v1/crm/customers/{customer_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "active",
  "notes": "Updated notes"
}
```

**Response:** 200 OK
```json
{
  "data": {
    "customerId": "...",
    "customerCode": "C001",
    ...
  },
  "message": "Customer updated successfully"
}
```

#### Delete Customer
```http
DELETE /api/v1/crm/customers/{customer_id}
Authorization: Bearer <token>
```

**Response:** 200 OK
```json
{
  "data": {
    "message": "Customer deleted successfully"
  },
  "message": "Customer deleted successfully"
}
```

## Permissions

The CRM module uses the following permissions:

- **crm.view** - View customers
- **crm.create** - Create new customers
- **crm.edit** - Update existing customers
- **crm.delete** - Delete customers

### Role-based Access

Currently implemented as:
- **admin, super_admin, moderator, user** - All CRM permissions
- Additional roles can be configured in the auth middleware

## Installation & Registration

The module is automatically registered with the main A64Core application when present in `src/modules/crm/`.

### Manual Registration (if needed)

```python
from fastapi import FastAPI
from src.modules.crm.register import register

app = FastAPI()
register(app, prefix="/api/v1/crm")
```

## Configuration

The module uses environment variables for configuration:

```env
# MongoDB (inherited from core)
MONGODB_URL=mongodb://mongodb:27017
MONGODB_DB_NAME=a64core

# JWT (inherited from core)
SECRET_KEY=your-secret-key-here

# API Settings
A64CORE_API_URL=http://api:8000
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

## Architecture Patterns

This module follows the exact patterns from `farm_manager`:

### 1. **Layered Architecture**
- **API Layer** (`api/v1/customers.py`) - FastAPI routes, request/response handling
- **Service Layer** (`services/customer/customer_service.py`) - Business logic, validation
- **Repository Layer** (`services/customer/customer_repository.py`) - Data access
- **Model Layer** (`models/customer.py`) - Pydantic schemas

### 2. **Import Structure**
- Uses absolute imports with `src.modules.crm` prefix
- All package directories have `__init__.py`
- Relative imports within the module (e.g., `from ...models.customer import Customer`)

### 3. **Database Patterns**
- Shared MongoDB connection from core services
- UUID stored as strings in MongoDB
- Atomic counter for auto-generated customer codes
- Text search indexes for full-text search
- Proper index creation on startup

### 4. **Security Patterns**
- JWT-based authentication
- Role-based permissions
- Input validation with Pydantic
- Parameterized database queries (no SQL injection risk)
- HTTPException for error handling

### 5. **Response Patterns**
- `SuccessResponse[T]` - Single item responses
- `PaginatedResponse[T]` - List/paginated responses
- `ErrorResponse` - Error responses (handled by FastAPI)
- Consistent message format

### 6. **Testing Patterns**
- Dependency injection for services
- Mockable repository layer
- Type hints for all functions
- Comprehensive docstrings

## Auto-generated Customer Codes

Customer codes are automatically generated using an atomic counter pattern:

1. On customer creation, increment `counters.customer_sequence`
2. Format as `C{sequence:03d}` (e.g., C001, C002, C003)
3. Stored in `customerCode` field
4. Unique index ensures no duplicates

## Full-text Search

The module implements MongoDB text search:

```python
# Index definition
await db.customers.create_index(
    [("name", "text"), ("email", "text"), ("company", "text")],
    name="customer_search_text"
)

# Search query
query = {"$text": {"$search": search_term}}
```

Search is case-insensitive and matches partial words.

## Error Handling

The module uses FastAPI's HTTPException for error responses:

- **400 Bad Request** - Validation errors
- **401 Unauthorized** - Invalid or missing token
- **403 Forbidden** - Insufficient permissions
- **404 Not Found** - Customer not found
- **500 Internal Server Error** - Unexpected errors

## Logging

The module logs key events:

- Customer creation with ID and code
- Customer updates
- Customer deletions
- Database connection status
- Error conditions

Logger: `src.modules.crm.*`

## Dependencies

### Python Dependencies
- **fastapi** - Web framework
- **pydantic** - Data validation
- **pydantic-settings** - Configuration management
- **motor** - Async MongoDB driver (via core)
- **python-jose** - JWT handling
- **python-multipart** - Form data support

### Core Dependencies
- **A64Core Platform** >= 1.3.0
- **Python** >= 3.11

## Future Enhancements

Potential future additions:
- Contact management (multiple contacts per customer)
- Interaction history (calls, emails, meetings)
- Deal/opportunity tracking
- Sales pipeline management
- Custom fields
- Email integration
- Activity timeline
- Customer segmentation
- Export functionality (CSV, Excel)
- Import functionality (bulk upload)
- Advanced filtering
- Reporting and analytics

## Migration from Existing CRM

If migrating from another CRM system:

1. Export customer data to CSV
2. Map fields to CRM schema
3. Create import script using `CustomerRepository.create()`
4. Verify data integrity after import
5. Update customer codes if needed

## Testing

### Unit Tests
```bash
pytest src/modules/crm/tests/test_customer_repository.py
pytest src/modules/crm/tests/test_customer_service.py
```

### API Tests
```bash
pytest src/modules/crm/tests/test_customer_api.py
```

### Integration Tests
```bash
pytest src/modules/crm/tests/test_integration.py
```

## Support

For issues or questions:
- Check documentation in `Docs/1-Main-Documentation/`
- Review code comments and docstrings
- Check logs for error details
- Contact A64Core Platform support

## License

This module is part of the A64Core Platform.

## Changelog

### Version 1.0.0 (2025-01-21)
- Initial release
- Customer CRUD operations
- Full-text search
- Auto-generated customer codes
- Address management
- Tagging system
- Pagination support
- Permission-based access control
