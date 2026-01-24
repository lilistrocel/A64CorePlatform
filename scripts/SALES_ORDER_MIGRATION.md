# Sales Order Migration Guide

## Overview

This document describes the migration of legacy sales order data from PostgreSQL to MongoDB for the A64 Core Platform Sales module.

## Source Data

Located in `/home/noobcity/Code/A64CorePlatform/OldData/220126/`:

### 1. orderlist_re_rows.sql
**Order Headers** - 3,579 records

| Column | Type | Description | Maps To |
|--------|------|-------------|---------|
| `ref` | UUID | Unique order reference | Links to order_list_content |
| `DatePacked` | Timestamp | When order was packed | `orderDate` |
| `StartDate` | Timestamp | Order start date | `orderDate` (fallback) |
| `status` | String | "Pending" or "Finished" | `status` (mapped) |
| `client_id` | String | **Customer NAME** (not ID!) | Maps to `customerId` via lookup |
| `farm_id` | String | **Farm NAME** (not ID!) | Stored in `_farmName` metadata |
| `order_driver` | String | Driver name/email | Included in `notes` |
| `vehicle_id` | String | Vehicle identifier | Included in `notes` |
| `packager_email` | String | Packager email | Included in `notes` |
| `note` | String | Order notes | Included in `notes` |

### 2. order_list_content_rows.sql
**Order Line Items** - 7,717 records

| Column | Type | Description | Maps To |
|--------|------|-------------|---------|
| `order_list_ref` | UUID | Links to orderlist_re.ref | Groups items by order |
| `crop_id` | String | **Crop NAME** (not ID!) | Maps to `productId` via plant_data |
| `Grade` | String | A, B, or C | Included in `productName` |
| `packagetype` | String | "Box" or "Loose" | Included in `productName` |
| `quantity` | Numeric | Quantity ordered | `quantity` |
| `packagesize` | Numeric | Package size in kg | Included in `productName` |
| `totalkg` | Numeric | Total weight | Stored in `_totalKg` metadata |
| `total_price` | Numeric | Total price (often NULL) | `totalPrice` (0 if NULL) |
| `avg_price` | Numeric | Average price (often NULL) | `unitPrice` (0 if NULL) |
| `farm_id` | String | Farm name | Reference only |
| `client_id` | String | Customer name | Reference only |

## Target Schema

MongoDB collection: **`sales_orders`**

Based on `/home/noobcity/Code/A64CorePlatform/src/modules/sales/models/sales_order.py`:

```javascript
{
  // Core identifiers
  orderId: UUID,              // Generated UUID
  orderCode: "SO0001",        // Sequential: SO0001, SO0002, etc.

  // Customer information
  customerId: UUID,           // Mapped from customer name
  customerName: String,       // Denormalized for display

  // Order status
  status: Enum,               // "draft" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled"
  orderDate: ISODate,         // From DatePacked or StartDate

  // Order items (nested array)
  items: [
    {
      productId: UUID,        // Mapped from crop name via plant_data
      productName: String,    // "Zucchini - Yellow (Grade A, Box) - 10kg"
      quantity: Number,       // Number of packages/units
      unitPrice: Number,      // Price per unit (0 if NULL in source)
      totalPrice: Number,     // Total for this line item

      // Migration metadata (prefixed with _)
      _cropName: String,      // Original crop name
      _grade: String,         // A, B, or C
      _packageType: String,   // Box or Loose
      _packageSize: Number,   // Size in kg
      _totalKg: Number        // Total weight
    }
  ],

  // Financial summary
  subtotal: Number,           // Sum of item totals
  tax: Number,                // 0 (no tax data in old system)
  discount: Number,           // 0 (no discount data in old system)
  total: Number,              // subtotal (since tax and discount are 0)

  // Payment status
  paymentStatus: Enum,        // "pending" | "partial" | "paid" (default: pending)

  // Shipping (not available in old data)
  shippingAddress: null,      // No shipping address in old system

  // Notes
  notes: String,              // Combines: note, driver, vehicle, packager, farm

  // Audit trail
  createdBy: UUID,            // Migration user UUID
  createdAt: ISODate,         // Order date from old system
  updatedAt: ISODate,         // Current timestamp

  // Migration metadata
  _migrated: true,            // Flag for migration tracking
  _oldRef: UUID,              // Original order reference
  _farmId: UUID,              // Source farm UUID (if found)
  _farmName: String           // Source farm name
}
```

## Migration Logic

### Status Mapping

| Old Status | New Status | Rationale |
|------------|-----------|-----------|
| `Pending` | `processing` | Order is being fulfilled |
| `Finished` | `delivered` | Order completed and delivered |

### ID Mappings

The migration script uses **name-to-UUID lookups** from already-migrated collections:

1. **Customers** (`customers` collection):
   - Lookup: `customer_name` → `customerId`
   - Source: CRM module migration (19 customers)
   - Fallback: Creates placeholder UUID if not found

2. **Farms** (`farms` collection):
   - Lookup: `farm_name` → `farmId`
   - Source: Farm Management module migration (7 farms)
   - Used for: Reference metadata only

3. **Products** (`plant_data` collection):
   - Lookup: `crop_name` → `plantDataId` (used as productId)
   - Source: Plant data migration (56 plant types)
   - Fallback: Creates placeholder UUID if not found

### Price Calculation

Order line items have pricing data that is often NULL:

```python
if total_price > 0:
    # Use actual total price
    unit_price = total_price / quantity
    item_total = total_price
elif avg_price > 0:
    # Use average price
    unit_price = avg_price
    item_total = avg_price * quantity
else:
    # No pricing data - default to 0
    unit_price = 0.0
    item_total = 0.0
```

### Order Code Generation

Sequential order codes: `SO0001`, `SO0002`, `SO0003`, etc.

### Item Aggregation

Line items are grouped by `order_list_ref` and nested into the `items[]` array:

```python
# Group items by order reference
order_items[order_ref].append(item_row)

# Later, when building order document:
order['items'] = [
    build_item(item_row)
    for item_row in order_items[order_ref]
]
```

## Running the Migration

### Prerequisites

1. **MongoDB running** on `localhost:27017`
2. **Database**: `a64core_db`
3. **Source files** in `/home/noobcity/Code/A64CorePlatform/OldData/220126/`:
   - `orderlist_re_rows.sql`
   - `order_list_content_rows.sql`
4. **Already migrated** data:
   - Customers (from CRM module)
   - Farms (from Farm Management module)
   - Plant data (from Farm Management module)

### Execution

```bash
# Navigate to scripts directory
cd /home/noobcity/Code/A64CorePlatform/scripts

# Make executable
chmod +x migrate_sales_orders.py

# Run migration
python3 migrate_sales_orders.py
```

### Expected Output

```
Connecting to MongoDB at mongodb://localhost:27017...
✅ Connected to MongoDB successfully

🗑️  Clearing previously migrated sales orders...
   ✅ Cleared migrated data

======================================================================
SALES ORDER MIGRATION - PostgreSQL to MongoDB
======================================================================

📦 PHASE 1: Loading ID Mappings
----------------------------------------------------------------------
🔍 Loading existing ID mappings from MongoDB...
   ✅ Loaded 19 customer name mappings
   ✅ Loaded 7 farm name mappings
   ✅ Loaded 56 crop/product name mappings

📦 PHASE 2: Loading Order Data from SQL Files
----------------------------------------------------------------------
📦 Loading Order Headers...
📄 Reading orderlist_re_rows.sql...
   Parsed 3579 rows
   ✅ Loaded 3579 order headers

📝 Loading Order Line Items...
📄 Reading order_list_content_rows.sql...
   Parsed 7717 rows
   ✅ Loaded 7717 line items for 3579 orders

📦 PHASE 3: Migrating Sales Orders
----------------------------------------------------------------------
🚀 Migrating Sales Orders...
📥 Inserting 3579 sales orders into MongoDB...
   ✅ Batch 1: Inserted 100 orders
   ✅ Batch 2: Inserted 100 orders
   ...
   ✅ Total migrated: 3579 sales orders

📦 PHASE 4: Database Optimization
----------------------------------------------------------------------
🔧 Creating Indexes...
   ✅ Created indexes on sales_orders

======================================================================
SALES ORDER MIGRATION SUMMARY
======================================================================

📦 ORDERS:
   Total Order Headers: 3579
   Successfully Migrated: 3579
   Failed: 0
   Skipped (no items): 0
   Success Rate: 100.0%

📝 ORDER LINE ITEMS:
   Total Line Items: 7717
   Items in Migrated Orders: 7717

🔗 ID MAPPINGS:
   Customers Found: 3200
   Customers Missing: 379
   Farms Found: 3500
   Farms Missing: 79
   Products Found: 7500
   Products Missing: 217

======================================================================
MIGRATION COMPLETE
======================================================================

💡 NEXT STEPS:
   ⚠️  Some customers were not found - orders use placeholder UUIDs
      Consider updating customer references manually
   ⚠️  Some products were not found - items use placeholder UUIDs
      Consider creating product records or updating references

   ✅ Review migrated data: db.sales_orders.find({'_migrated': true})
   ✅ Check for missing references and update as needed
   ✅ Test the Sales module API with migrated data
```

## Verification

### Check Migrated Orders

```javascript
// Connect to MongoDB
mongosh mongodb://localhost:27017/a64core_db

// Count migrated orders
db.sales_orders.countDocuments({ _migrated: true })
// Expected: 3579

// View sample order
db.sales_orders.findOne({ _migrated: true })

// Check order code sequence
db.sales_orders.find({ _migrated: true })
  .sort({ orderCode: 1 })
  .limit(5)
  .pretty()
// Should show: SO0001, SO0002, SO0003, SO0004, SO0005

// Status distribution
db.sales_orders.aggregate([
  { $match: { _migrated: true } },
  { $group: { _id: "$status", count: { $sum: 1 } } }
])

// Orders with missing customer references (placeholder UUIDs)
db.sales_orders.countDocuments({
  _migrated: true,
  customerId: { $exists: true },
  // Customer name not found in mapping
})

// Check items array
db.sales_orders.aggregate([
  { $match: { _migrated: true } },
  { $project: {
      orderCode: 1,
      itemCount: { $size: "$items" },
      total: 1
  }},
  { $limit: 10 }
])
```

### Verify Indexes

```javascript
db.sales_orders.getIndexes()
```

Expected indexes:
- `orderId` (unique)
- `orderCode` (unique)
- `customerId`
- `status`
- `orderDate`
- Compound: `(customerName, orderDate)`

## Data Quality Checks

### Missing References

After migration, identify orders with missing references:

```javascript
// Orders with placeholder customer UUIDs
// (these won't match any customer in customers collection)
db.sales_orders.aggregate([
  { $match: { _migrated: true } },
  {
    $lookup: {
      from: "customers",
      localField: "customerId",
      foreignField: "customerId",
      as: "customer"
    }
  },
  { $match: { customer: { $size: 0 } } },
  { $project: { orderCode: 1, customerName: 1 } }
])

// Orders with placeholder product UUIDs
db.sales_orders.aggregate([
  { $match: { _migrated: true } },
  { $unwind: "$items" },
  {
    $lookup: {
      from: "plant_data",
      localField: "items.productId",
      foreignField: "plantDataId",
      as: "product"
    }
  },
  { $match: { product: { $size: 0 } } },
  { $project: {
      orderCode: 1,
      "items.productName": 1,
      "items._cropName": 1
  }}
])
```

### Price Validation

```javascript
// Orders with zero prices
db.sales_orders.aggregate([
  { $match: { _migrated: true, total: 0 } },
  { $count: "orders_with_zero_total" }
])

// Orders with items missing prices
db.sales_orders.aggregate([
  { $match: { _migrated: true } },
  { $unwind: "$items" },
  { $match: { "items.unitPrice": 0 } },
  { $group: {
      _id: "$orderId",
      orderCode: { $first: "$orderCode" },
      itemsWithZeroPrice: { $sum: 1 }
  }}
])
```

## Troubleshooting

### Issue: SQL Parsing Errors

**Symptoms**: Fewer rows parsed than expected

**Solution**: Check SQL file format
```bash
# Verify file format
file OldData/220126/orderlist_re_rows.sql

# Check for encoding issues
iconv -f UTF-8 -t UTF-8 OldData/220126/orderlist_re_rows.sql -o /dev/null
```

### Issue: MongoDB Connection Failed

**Symptoms**: "Connection refused" or timeout errors

**Solution**: Verify MongoDB is running
```bash
# Check MongoDB status
docker compose ps mongodb

# View MongoDB logs
docker compose logs mongodb --tail 20

# Restart MongoDB if needed
docker compose restart mongodb
```

### Issue: Duplicate Key Errors

**Symptoms**: "E11000 duplicate key error"

**Solution**: Clear existing data before re-running
```javascript
// Clear migrated sales orders
db.sales_orders.deleteMany({ _migrated: true })

// Drop indexes if needed
db.sales_orders.dropIndexes()
```

### Issue: Missing Customer/Product Mappings

**Symptoms**: High count of "missing" mappings in summary

**Solution**: Verify prerequisite migrations have been run
```bash
# Run customer migration first (if not done)
python3 scripts/migrate_old_data_v2.py

# Check customer count
mongosh --eval "db.customers.countDocuments({ _migrated: true })" mongodb://localhost:27017/a64core_db

# Check plant_data count
mongosh --eval "db.plant_data.countDocuments({ _migrated: true })" mongodb://localhost:27017/a64core_db
```

## Post-Migration Tasks

### 1. Update Placeholder References

For customers/products not found during migration, you may need to:

1. **Create missing customers** in CRM module
2. **Update orders** with correct customer UUIDs
3. **Create missing products** or map to existing ones

### 2. Update Order Statuses

Review orders and update statuses based on actual fulfillment:

```javascript
// Mark old "Finished" orders as delivered
db.sales_orders.updateMany(
  { _migrated: true, status: "delivered" },
  { $set: { paymentStatus: "paid" } }
)
```

### 3. Test Sales Module API

Verify the Sales module API works with migrated data:

```bash
# Test list orders endpoint
curl -X GET http://localhost/api/v1/sales/orders \
  -H "Authorization: Bearer <token>"

# Test get order by ID
curl -X GET http://localhost/api/v1/sales/orders/<orderId> \
  -H "Authorization: Bearer <token>"
```

### 4. Generate Reports

Use migrated data for historical reporting:

```javascript
// Sales by customer
db.sales_orders.aggregate([
  { $match: { _migrated: true } },
  { $group: {
      _id: "$customerName",
      totalOrders: { $sum: 1 },
      totalRevenue: { $sum: "$total" }
  }},
  { $sort: { totalRevenue: -1 } }
])

// Monthly order volume
db.sales_orders.aggregate([
  { $match: { _migrated: true } },
  { $group: {
      _id: {
        year: { $year: "$orderDate" },
        month: { $month: "$orderDate" }
      },
      orderCount: { $sum: 1 },
      revenue: { $sum: "$total" }
  }},
  { $sort: { "_id.year": 1, "_id.month": 1 } }
])
```

## Migration Script Design

### Key Features

1. **Reusable SQL Parser**: Uses the same robust parser from `migrate_old_data_v2.py`
2. **Name-to-UUID Mapping**: Handles the fact that old data uses names instead of IDs
3. **Batch Processing**: Inserts orders in batches of 100 for performance
4. **Graceful Degradation**: Uses placeholder UUIDs for missing references
5. **Comprehensive Logging**: Detailed progress and statistics
6. **Idempotent**: Can be re-run safely (clears previous migration first)

### Performance Considerations

- **Batch inserts**: 100 orders per batch reduces memory usage
- **Index creation**: Deferred until after bulk insert
- **Unordered inserts**: `ordered=False` allows partial success on errors

### Error Handling

```python
try:
    result = await self.db.sales_orders.insert_many(batch, ordered=False)
    self.stats['orders']['success'] += len(result.inserted_ids)
except Exception as e:
    self.stats['orders']['failed'] += len(batch)
    print(f"   ❌ Batch failed: {e}")
```

## Schema Compliance

The migration strictly follows the `SalesOrder` model defined in:
`/home/noobcity/Code/A64CorePlatform/src/modules/sales/models/sales_order.py`

### Required Fields

All required fields are populated:
- ✅ `orderId`: Generated UUID
- ✅ `customerId`: Mapped or placeholder UUID
- ✅ `customerName`: From old `client_id`
- ✅ `items`: Array with at least 1 item (orders with 0 items are skipped)
- ✅ `subtotal`: Calculated from items
- ✅ `total`: Calculated total
- ✅ `createdBy`: Migration user UUID

### Data Type Compliance

| Field | Expected Type | Migrated Type | Notes |
|-------|--------------|---------------|-------|
| `orderId` | UUID | UUID | Generated |
| `orderCode` | String | String | Sequential |
| `customerId` | UUID | UUID | Mapped from name |
| `status` | Enum | String (enum value) | Mapped |
| `orderDate` | ISODate | ISODate (UTC) | Parsed from timestamp |
| `items` | Array | Array | Min 1 item |
| `items[].productId` | UUID | UUID | Mapped from crop name |
| `items[].quantity` | Number | Number (float) | From SQL numeric |
| `items[].unitPrice` | Number | Number (float, ≥0) | Calculated |
| `items[].totalPrice` | Number | Number (float, ≥0) | Calculated |
| `subtotal` | Number | Number (float, ≥0) | Sum of items |
| `total` | Number | Number (float, ≥0) | Subtotal (no tax/discount) |
| `paymentStatus` | Enum | String (enum value) | Default "pending" |

### Naming Convention Compliance

✅ **MongoDB Standards**:
- Collection: `sales_orders` (plural, lowercase with underscores)
- Fields: `camelCase` (orderId, orderCode, customerId, etc.)
- Booleans: N/A (no boolean fields in this model)
- Indexes: `idx_sales_orders_orderId`, etc.

## Future Improvements

1. **Customer Matching**: Fuzzy matching for customer names (handle typos, variations)
2. **Product Catalog**: Create dedicated product catalog instead of using plant_data
3. **Price History**: Import historical pricing data if available
4. **Shipping Info**: Extract shipping details from notes field if structured
5. **Payment Records**: Link to payment system if available
6. **Order Splitting**: Handle orders that may have been split across farms

## Related Documentation

- **Main Migration**: `/home/noobcity/Code/A64CorePlatform/scripts/migrate_old_data_v2.py`
- **Sales Order Model**: `/home/noobcity/Code/A64CorePlatform/src/modules/sales/models/sales_order.py`
- **Sales Module API**: `/home/noobcity/Code/A64CorePlatform/src/modules/sales/routes/sales_orders.py`
- **Database Schema**: `/home/noobcity/Code/A64CorePlatform/Docs/1-Main-Documentation/System-Architecture.md`

## Support

For issues or questions:
1. Check this documentation
2. Review migration logs for errors
3. Verify prerequisite migrations have been run
4. Consult Database Schema Architect agent
