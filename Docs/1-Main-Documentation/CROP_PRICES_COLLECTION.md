# crop_prices Collection - Data Dictionary

**Collection Name:** `crop_prices`
**Database:** `a64core_db`
**Version:** 1.0.0
**Created:** 2026-01-22
**Purpose:** Historical pricing data for crops and produce

---

## Overview

The `crop_prices` collection stores historical pricing information for crops sold to customers. This collection enables:

- **Price History Tracking** - Monitor pricing trends over time
- **Customer-Specific Pricing** - Track different prices for different customers
- **Grade-Based Pricing** - Analyze pricing by quality grade
- **Revenue Analytics** - Calculate sales revenue and trends
- **Market Analysis** - Identify pricing patterns and opportunities
- **Pricing Strategy** - Inform future pricing decisions

**Source:** Migrated from PostgreSQL `crop_price` table (old system)

---

## Schema Definition

### MongoDB Schema

```javascript
{
  _id: ObjectId,                      // MongoDB internal ID
  priceId: String (UUID),             // Unique price record identifier
  date: Date,                         // Price date (when sale occurred)

  // Customer Information
  customerId: String (UUID),          // Reference to customers collection
  customerName: String,               // Customer name snapshot (denormalized)

  // Farm Information
  farmId: String (UUID),              // Reference to farms collection
  farmName: String,                   // Farm name snapshot (denormalized)

  // Product Details
  crop: String,                       // Crop/product name (e.g., "Tomato", "Lettuce")
  grade: String,                      // Quality grade (A, B, C, premium, etc.)

  // Quantity & Pricing
  quantity: Number,                   // Quantity sold
  unit: String,                       // Unit of measurement (kg, lbs, units)
  pricePerUnit: Number,               // Price per unit (in currency)
  totalPrice: Number,                 // Total transaction price
  currency: String,                   // Currency code (AED, USD, EUR, etc.)

  // Audit Trail
  createdBy: String (UUID),           // User ID who recorded this price
  createdAt: Date,                    // Timestamp when record was created

  // Migration Tracking
  _migrated: Boolean,                 // True if migrated from old system
  _oldRef: String (UUID)              // Original UUID from old PostgreSQL system
}
```

---

## Field Specifications

### priceId
- **Type:** String (UUID v4)
- **Required:** Yes
- **Unique:** Yes
- **Description:** Unique identifier for this price record
- **Format:** `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`
- **Example:** `"d1234567-89ab-cdef-0123-456789abcdef"`
- **Index:** Unique index

### date
- **Type:** Date (UTC)
- **Required:** Yes
- **Description:** Date when the sale occurred or price was recorded
- **Format:** ISO 8601 datetime
- **Example:** `2025-03-15T10:30:00.000Z`
- **Index:** Descending (for time-series queries)
- **Validation:** Must be a valid date, typically not in future

### customerId
- **Type:** String (UUID v4)
- **Required:** No (nullable)
- **Description:** Reference to the customer in the `customers` collection
- **Example:** `"c47ac10b-58cc-4372-a567-0e02b2c3d479"`
- **Foreign Key:** → `customers.customerId`
- **Index:** Non-unique
- **Notes:** May be null for migrated data where customer couldn't be resolved

### customerName
- **Type:** String
- **Required:** No (nullable)
- **Max Length:** 200 characters
- **Description:** Snapshot of customer name at time of sale (denormalized for performance)
- **Example:** `"SILAL FOOD AND TECHNOLOGY LLC"`
- **Notes:** Denormalized to avoid JOIN queries; may differ from current customer name

### farmId
- **Type:** String (UUID v4)
- **Required:** No (nullable)
- **Description:** Reference to the farm in the `farms` collection
- **Example:** `"f89ab123-4567-89cd-ef01-234567890abc"`
- **Foreign Key:** → `farms.farmId`
- **Index:** Non-unique
- **Notes:** May be null for migrated data where farm couldn't be resolved

### farmName
- **Type:** String
- **Required:** No (nullable)
- **Max Length:** 200 characters
- **Description:** Snapshot of farm name at time of sale (denormalized)
- **Example:** `"Al Khazana"`
- **Notes:** Denormalized for query performance

### crop
- **Type:** String
- **Required:** Yes
- **Max Length:** 200 characters
- **Description:** Name of the crop or produce sold
- **Example:** `"Tomato"`, `"Lettuce - Romaine"`, `"Cucumber"`
- **Index:** Non-unique
- **Notes:** Use consistent naming (title case, descriptive)

### grade
- **Type:** String
- **Required:** No (nullable)
- **Max Length:** 50 characters
- **Description:** Quality grade of the produce
- **Allowed Values:** `A`, `B`, `C`, `premium`, `grade_a`, `grade_b`, `grade_c`, `processing`, `rejected`
- **Example:** `"A"`, `"premium"`
- **Index:** Non-unique
- **Notes:** Higher grades typically command higher prices

### quantity
- **Type:** Number (Float/Double)
- **Required:** Yes
- **Min:** 0
- **Description:** Quantity of produce sold
- **Example:** `150.5` (150.5 kg)
- **Precision:** 2 decimal places recommended
- **Validation:** Must be > 0

### unit
- **Type:** String
- **Required:** Yes
- **Max Length:** 20 characters
- **Description:** Unit of measurement for quantity
- **Common Values:** `"kg"`, `"lbs"`, `"units"`, `"boxes"`, `"crates"`
- **Example:** `"kg"`
- **Notes:** Use standard abbreviations for consistency

### pricePerUnit
- **Type:** Number (Float/Double)
- **Required:** Yes
- **Min:** 0
- **Description:** Price per unit in the specified currency
- **Example:** `5.50` (5.50 AED per kg)
- **Precision:** 2 decimal places (for currency)
- **Validation:** Must be ≥ 0

### totalPrice
- **Type:** Number (Float/Double)
- **Required:** Yes
- **Min:** 0
- **Description:** Total price for the entire transaction
- **Example:** `827.50` (5.50 × 150.5)
- **Calculation:** `pricePerUnit × quantity`
- **Precision:** 2 decimal places
- **Validation:** Should equal `pricePerUnit × quantity` (with rounding tolerance)

### currency
- **Type:** String
- **Required:** Yes
- **Max Length:** 3 characters
- **Description:** Currency code (ISO 4217)
- **Common Values:** `"AED"`, `"USD"`, `"EUR"`, `"GBP"`
- **Example:** `"AED"`
- **Default:** `"AED"` (for UAE operations)
- **Format:** 3-letter uppercase code

### createdBy
- **Type:** String (UUID v4)
- **Required:** Yes
- **Description:** User ID who created this price record
- **Example:** `"a1b2c3d4-e5f6-7890-abcd-ef1234567890"`
- **Foreign Key:** → `users.userId`
- **Notes:** For migrated data, this is the migration system user

### createdAt
- **Type:** Date (UTC)
- **Required:** Yes
- **Description:** Timestamp when this record was created
- **Format:** ISO 8601 datetime
- **Example:** `2025-03-15T14:22:00.000Z`
- **Default:** Current UTC timestamp
- **Notes:** Immutable after creation

### _migrated
- **Type:** Boolean
- **Required:** No
- **Description:** Flag indicating if this record was migrated from the old system
- **Example:** `true`
- **Notes:** Used to distinguish migrated data from new data; can be removed after verification

### _oldRef
- **Type:** String (UUID)
- **Required:** No
- **Description:** Original UUID from the old PostgreSQL system
- **Example:** `"c82d1236-ceff-4b71-b883-8db0fbc383c5"`
- **Notes:** Preserved for data lineage and debugging; can be removed after verification

---

## Indexes

### Primary Indexes

```javascript
// Unique index on priceId
db.crop_prices.createIndex({ priceId: 1 }, { unique: true })

// Time-series index on date (descending for recent-first queries)
db.crop_prices.createIndex({ date: -1 })
```

### Foreign Key Indexes

```javascript
// Index on customerId for customer-specific queries
db.crop_prices.createIndex({ customerId: 1 })

// Index on farmId for farm-specific queries
db.crop_prices.createIndex({ farmId: 1 })
```

### Query Optimization Indexes

```javascript
// Index on crop for crop-specific price history
db.crop_prices.createIndex({ crop: 1 })

// Index on grade for grade-based pricing analysis
db.crop_prices.createIndex({ grade: 1 })
```

### Compound Indexes (Future Optimization)

```javascript
// Customer + Date (for customer price history over time)
db.crop_prices.createIndex({ customerId: 1, date: -1 })

// Crop + Grade + Date (for crop+grade pricing trends)
db.crop_prices.createIndex({ crop: 1, grade: 1, date: -1 })

// Farm + Crop + Date (for farm crop pricing)
db.crop_prices.createIndex({ farmId: 1, crop: 1, date: -1 })
```

### Migration Indexes

```javascript
// Index on old reference for migration tracking
db.crop_prices.createIndex({ _oldRef: 1 })
```

---

## Example Documents

### Example 1: Premium Grade Sale
```javascript
{
  "_id": ObjectId("65a8f1234567890abcdef123"),
  "priceId": "d1234567-89ab-cdef-0123-456789abcdef",
  "date": ISODate("2025-03-15T10:30:00.000Z"),
  "customerId": "c47ac10b-58cc-4372-a567-0e02b2c3d479",
  "customerName": "SILAL FOOD AND TECHNOLOGY LLC",
  "farmId": "f89ab123-4567-89cd-ef01-234567890abc",
  "farmName": "Al Khazana",
  "crop": "Tomato - Cherry",
  "grade": "premium",
  "quantity": 150.5,
  "unit": "kg",
  "pricePerUnit": 8.50,
  "totalPrice": 1279.25,
  "currency": "AED",
  "createdBy": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "createdAt": ISODate("2025-03-15T14:22:00.000Z")
}
```

### Example 2: Standard Grade Sale
```javascript
{
  "_id": ObjectId("65a8f2345678901bcdef234"),
  "priceId": "e2345678-9abc-def0-1234-56789abcdef0",
  "date": ISODate("2025-03-14T09:15:00.000Z"),
  "customerId": "c58bd21c-59cc-4483-b678-1f13c3d4e580",
  "customerName": "NRTC Company",
  "farmId": "f89ab123-4567-89cd-ef01-234567890abc",
  "farmName": "Al Ain",
  "crop": "Lettuce - Iceberg",
  "grade": "B",
  "quantity": 320.0,
  "unit": "kg",
  "pricePerUnit": 4.25,
  "totalPrice": 1360.00,
  "currency": "AED",
  "createdBy": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "createdAt": ISODate("2025-03-14T13:45:00.000Z")
}
```

### Example 3: Migrated Record
```javascript
{
  "_id": ObjectId("65a8f3456789012cdef345"),
  "priceId": "f3456789-abcd-ef01-2345-6789abcdef01",
  "date": ISODate("2024-11-20T00:00:00.000Z"),
  "customerId": "c69ce32d-60dd-4594-c789-2f24d4e5f691",
  "customerName": "AL MONTAZAH",
  "farmId": "f89ab123-4567-89cd-ef01-234567890abc",
  "farmName": "Liwa",
  "crop": "Cucumber",
  "grade": "A",
  "quantity": 450.0,
  "unit": "kg",
  "pricePerUnit": 3.75,
  "totalPrice": 1687.50,
  "currency": "AED",
  "createdBy": "00000000-0000-0000-0000-000000000000",  // Migration user
  "createdAt": ISODate("2024-11-20T00:00:00.000Z"),
  "_migrated": true,
  "_oldRef": "c82d1236-ceff-4b71-b883-8db0fbc383c5"
}
```

---

## Common Queries

### Query 1: Recent Prices for a Crop
```javascript
db.crop_prices.find(
  { crop: "Tomato" }
).sort(
  { date: -1 }
).limit(10)
```

### Query 2: Customer Price History
```javascript
db.crop_prices.find(
  { customerId: "c47ac10b-58cc-4372-a567-0e02b2c3d479" }
).sort(
  { date: -1 }
)
```

### Query 3: Farm Revenue by Month
```javascript
db.crop_prices.aggregate([
  { $match: { farmId: "f89ab123-4567-89cd-ef01-234567890abc" } },
  { $group: {
      _id: {
        year: { $year: "$date" },
        month: { $month: "$date" }
      },
      totalRevenue: { $sum: "$totalPrice" },
      totalQuantity: { $sum: "$quantity" },
      transactionCount: { $sum: 1 }
    }
  },
  { $sort: { "_id.year": -1, "_id.month": -1 } }
])
```

### Query 4: Average Price by Grade
```javascript
db.crop_prices.aggregate([
  { $match: { crop: "Lettuce - Romaine" } },
  { $group: {
      _id: "$grade",
      avgPricePerUnit: { $avg: "$pricePerUnit" },
      totalQuantity: { $sum: "$quantity" },
      count: { $sum: 1 }
    }
  },
  { $sort: { avgPricePerUnit: -1 } }
])
```

### Query 5: Top Customers by Revenue
```javascript
db.crop_prices.aggregate([
  { $match: { date: { $gte: ISODate("2025-01-01") } } },
  { $group: {
      _id: "$customerId",
      customerName: { $first: "$customerName" },
      totalRevenue: { $sum: "$totalPrice" },
      transactionCount: { $sum: 1 }
    }
  },
  { $sort: { totalRevenue: -1 } },
  { $limit: 10 }
])
```

### Query 6: Price Trends Over Time
```javascript
db.crop_prices.aggregate([
  { $match: {
      crop: "Tomato",
      grade: "A"
    }
  },
  { $group: {
      _id: {
        year: { $year: "$date" },
        month: { $month: "$date" }
      },
      avgPrice: { $avg: "$pricePerUnit" },
      minPrice: { $min: "$pricePerUnit" },
      maxPrice: { $max: "$pricePerUnit" },
      volume: { $sum: "$quantity" }
    }
  },
  { $sort: { "_id.year": 1, "_id.month": 1 } }
])
```

---

## Data Validation

### Application-Level Validation (Recommended)

```python
from pydantic import BaseModel, Field, validator
from uuid import UUID
from datetime import datetime
from typing import Optional

class CropPriceCreate(BaseModel):
    date: datetime
    customerId: Optional[UUID] = None
    customerName: Optional[str] = Field(None, max_length=200)
    farmId: Optional[UUID] = None
    farmName: Optional[str] = Field(None, max_length=200)
    crop: str = Field(..., min_length=1, max_length=200)
    grade: Optional[str] = Field(None, max_length=50)
    quantity: float = Field(..., gt=0)
    unit: str = Field(..., max_length=20)
    pricePerUnit: float = Field(..., ge=0)
    totalPrice: float = Field(..., ge=0)
    currency: str = Field("AED", min_length=3, max_length=3)

    @validator('totalPrice')
    def validate_total_price(cls, v, values):
        expected = values['pricePerUnit'] * values['quantity']
        tolerance = 0.01
        if abs(v - expected) > tolerance:
            raise ValueError(f"Total price {v} doesn't match pricePerUnit × quantity")
        return v

    @validator('currency')
    def validate_currency_code(cls, v):
        return v.upper()
```

### MongoDB Schema Validation (Optional)

```javascript
db.createCollection("crop_prices", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["priceId", "date", "crop", "quantity", "unit", "pricePerUnit", "totalPrice", "currency", "createdBy", "createdAt"],
      properties: {
        priceId: {
          bsonType: "string",
          pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        },
        date: { bsonType: "date" },
        customerId: { bsonType: ["string", "null"] },
        customerName: { bsonType: ["string", "null"], maxLength: 200 },
        farmId: { bsonType: ["string", "null"] },
        farmName: { bsonType: ["string", "null"], maxLength: 200 },
        crop: { bsonType: "string", maxLength: 200 },
        grade: { bsonType: ["string", "null"], maxLength: 50 },
        quantity: { bsonType: ["double", "int"], minimum: 0 },
        unit: { bsonType: "string", maxLength: 20 },
        pricePerUnit: { bsonType: ["double", "int"], minimum: 0 },
        totalPrice: { bsonType: ["double", "int"], minimum: 0 },
        currency: { bsonType: "string", minLength: 3, maxLength: 3 },
        createdBy: { bsonType: "string" },
        createdAt: { bsonType: "date" }
      }
    }
  }
})
```

---

## Use Cases

### 1. Pricing Strategy
**Goal:** Determine optimal pricing for different grades and customers

```javascript
// Average prices by grade across all customers
db.crop_prices.aggregate([
  { $match: { crop: "Lettuce - Romaine", date: { $gte: ISODate("2025-01-01") } } },
  { $group: {
      _id: "$grade",
      avgPrice: { $avg: "$pricePerUnit" },
      minPrice: { $min: "$pricePerUnit" },
      maxPrice: { $max: "$pricePerUnit" },
      stdDev: { $stdDevPop: "$pricePerUnit" }
    }
  }
])
```

### 2. Customer Segmentation
**Goal:** Identify high-value customers

```javascript
// Top customers by total revenue
db.crop_prices.aggregate([
  { $match: { date: { $gte: ISODate("2024-01-01") } } },
  { $group: {
      _id: "$customerId",
      customerName: { $first: "$customerName" },
      totalSpent: { $sum: "$totalPrice" },
      avgOrderValue: { $avg: "$totalPrice" },
      orderCount: { $sum: 1 }
    }
  },
  { $sort: { totalSpent: -1 } }
])
```

### 3. Revenue Reporting
**Goal:** Generate monthly revenue reports

```javascript
// Monthly revenue breakdown
db.crop_prices.aggregate([
  { $match: {
      farmId: "f89ab123-4567-89cd-ef01-234567890abc",
      date: { $gte: ISODate("2025-01-01"), $lte: ISODate("2025-12-31") }
    }
  },
  { $group: {
      _id: { $month: "$date" },
      revenue: { $sum: "$totalPrice" },
      volume: { $sum: "$quantity" },
      avgPrice: { $avg: "$pricePerUnit" }
    }
  },
  { $sort: { "_id": 1 } }
])
```

### 4. Market Trend Analysis
**Goal:** Identify pricing trends and seasonality

```javascript
// Price trends by month for specific crop
db.crop_prices.aggregate([
  { $match: { crop: "Tomato", grade: "A" } },
  { $group: {
      _id: {
        year: { $year: "$date" },
        month: { $month: "$date" }
      },
      avgPrice: { $avg: "$pricePerUnit" },
      volume: { $sum: "$quantity" }
    }
  },
  { $sort: { "_id.year": 1, "_id.month": 1 } }
])
```

---

## Best Practices

### Data Entry
1. ✅ Always record date of actual sale, not entry date
2. ✅ Use consistent crop naming (e.g., "Tomato - Cherry" not "cherry tomato")
3. ✅ Verify totalPrice = pricePerUnit × quantity
4. ✅ Use standard currency codes (ISO 4217)
5. ✅ Record customer and farm IDs when available

### Query Optimization
1. ✅ Use indexes for date range queries
2. ✅ Add compound indexes for common query patterns
3. ✅ Use aggregation pipeline for complex analytics
4. ✅ Limit results for large datasets
5. ✅ Cache frequently accessed aggregations

### Data Quality
1. ✅ Validate prices are within reasonable ranges
2. ✅ Check for duplicate entries
3. ✅ Verify customer and farm references exist
4. ✅ Audit anomalous prices (too high/low)
5. ✅ Regular data quality checks

### Performance
1. ✅ Archive old price data (>2 years) to separate collection
2. ✅ Use aggregation for reports, not application-level processing
3. ✅ Monitor slow queries and add indexes
4. ✅ Consider read replicas for analytics workloads

---

## Migration Notes

### Source Data
- **Original Table:** PostgreSQL `crop_price`
- **Records Migrated:** ~8,000
- **Date Range:** 2024-2025
- **Migration Date:** 2026-01-22

### Data Quality Issues (Migrated Data)
- ⚠️ Some customer names may not match exactly due to spelling variations
- ⚠️ Some farm references couldn't be resolved (farmId = null)
- ⚠️ All dates are in UTC, original timezone may have been lost
- ⚠️ Grade values are inconsistent (some A/B/C, some numeric)

### Post-Migration Cleanup
```javascript
// Remove migration tracking fields (after verification)
db.crop_prices.updateMany(
  { _migrated: true },
  { $unset: { _migrated: "", _oldRef: "" } }
)

// Standardize grade values
db.crop_prices.updateMany(
  { grade: "1" },
  { $set: { grade: "A" } }
)
```

---

## Future Enhancements

### Planned Features
1. **Automated Price Suggestions** - Based on historical data
2. **Price Alerts** - Notify when prices deviate from norm
3. **Customer-Specific Contracts** - Store negotiated pricing
4. **Seasonal Adjustments** - Track price seasonality
5. **Grade Mix Analysis** - Optimal grade distribution
6. **Competitor Pricing** - Market price comparisons

### Schema Extensions
```javascript
// Potential additional fields
{
  // Contract pricing
  contractId: UUID,              // Link to customer contract
  isContractPrice: Boolean,      // True if contract price

  // Market context
  marketPrice: Number,           // Market price at time of sale
  priceVariance: Number,         // Deviation from market price

  // Batch tracking
  batchId: UUID,                 // Link to production batch
  harvestDate: Date,             // When crop was harvested

  // Additional metadata
  paymentTerms: String,          // Net 30, COD, etc.
  deliveryMethod: String,        // Pickup, delivery, etc.
  notes: String                  // Additional notes
}
```

---

**Document Version:** 1.0.0
**Last Updated:** 2026-01-22
**Maintained By:** Database Schema Architect
