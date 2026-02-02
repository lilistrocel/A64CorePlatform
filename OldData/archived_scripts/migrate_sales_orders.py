#!/usr/bin/env python3
"""
Sales Order Migration Script - PostgreSQL to MongoDB

Migrates sales order data from old PostgreSQL database to MongoDB:
- orderlist_re (order headers) -> sales_orders collection
- order_list_content (order line items) -> nested items[] in sales_orders

This script maps old customer/farm names to existing UUIDs and aggregates
line items into nested order documents.

Author: Database Schema Architect
Date: 2026-01-23
"""

import os
import re
import asyncio
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Tuple
from uuid import uuid4
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from collections import defaultdict

# Constants
OLD_DATA_DIR = "/home/noobcity/Code/A64CorePlatform/OldData/220126"
MONGODB_URI = "mongodb://localhost:27017"
DATABASE_NAME = "a64core_db"

# Default user for migration
MIGRATION_USER_ID = str(uuid4())
MIGRATION_USER_EMAIL = "system@migration.a64platform.com"


class SQLParser:
    """Parse PostgreSQL INSERT statements from SQL dump files"""

    @staticmethod
    def parse_insert_statement(sql: str) -> List[Dict[str, Any]]:
        """
        Parse PostgreSQL INSERT statement and return list of row dictionaries.
        Reuses the same robust parser from migrate_old_data_v2.py
        """
        # Extract table name
        table_match = re.search(r'INSERT INTO "public"\."(\w+)"', sql)
        if not table_match:
            return []

        # Extract column names
        columns_match = re.search(r'\(([^)]+)\)\s+VALUES', sql)
        if not columns_match:
            return []

        columns = [col.strip().strip('"') for col in columns_match.group(1).split(',')]

        # Extract VALUES section
        values_match = re.search(r'VALUES\s+(.+);?$', sql, re.DOTALL)
        if not values_match:
            return []

        values_str = values_match.group(1).rstrip(';')

        # Parse individual row tuples
        rows = []
        current_row = []
        in_quote = False
        in_escape = False
        current_value = ""
        paren_depth = 0

        i = 0
        while i < len(values_str):
            char = values_str[i]

            if in_escape:
                current_value += char
                in_escape = False
                i += 1
                continue

            if char == '\\':
                in_escape = True
                i += 1
                continue

            # Handle double single quotes as escaped quote
            if char == "'" and i + 1 < len(values_str) and values_str[i + 1] == "'":
                current_value += "'"
                i += 2
                continue

            if char == "'":
                in_quote = not in_quote
                i += 1
                continue

            if in_quote:
                current_value += char
                i += 1
                continue

            # Not in quote
            if char == '(':
                paren_depth += 1
                if paren_depth == 1:
                    current_value = ""
                    current_row = []
                i += 1
                continue

            if char == ')':
                paren_depth -= 1
                if paren_depth == 0:
                    # End of row
                    current_row.append(current_value.strip())
                    if len(current_row) == len(columns):
                        row_dict = {}
                        for j, col in enumerate(columns):
                            val = current_row[j]
                            if val.lower() == 'null' or val == '':
                                row_dict[col] = None
                            else:
                                row_dict[col] = val
                        rows.append(row_dict)
                    current_value = ""
                i += 1
                continue

            if char == ',' and paren_depth == 1:
                current_row.append(current_value.strip())
                current_value = ""
                i += 1
                continue

            if paren_depth >= 1:
                current_value += char

            i += 1

        return rows


class SalesOrderMigrator:
    """Handles sales order migration from PostgreSQL dumps to MongoDB"""

    def __init__(self):
        self.client = None
        self.db = None
        self.mongodb_uri = MONGODB_URI
        self.database_name = DATABASE_NAME

        # ID mappings (name -> UUID) - populated from already-migrated data
        self.customer_name_to_id = {}  # customer name -> customerId
        self.farm_name_to_id = {}  # farm name -> farmId
        self.crop_name_to_product_id = {}  # crop name -> productId (from plant_data)

        # Order data structures
        self.order_headers = {}  # order_ref -> order_header_dict
        self.order_items = defaultdict(list)  # order_ref -> [item1, item2, ...]

        # Statistics
        self.stats = {
            'orders': {'total': 0, 'success': 0, 'failed': 0, 'skipped': 0},
            'items': {'total': 0, 'success': 0, 'failed': 0},
            'mappings': {
                'customers_found': 0,
                'customers_missing': 0,
                'farms_found': 0,
                'farms_missing': 0,
                'products_found': 0,
                'products_missing': 0
            }
        }

    async def connect(self):
        """Connect to MongoDB"""
        print(f"Connecting to MongoDB at {self.mongodb_uri}...")
        self.client = AsyncIOMotorClient(self.mongodb_uri)
        self.db = self.client[self.database_name]
        await self.db.command('ping')
        print("✅ Connected to MongoDB successfully")

    async def close(self):
        """Close MongoDB connection"""
        if self.client:
            self.client.close()
            print("✅ Closed MongoDB connection")

    def read_sql_file(self, filename: str) -> List[Dict[str, Any]]:
        """Read and parse SQL dump file"""
        filepath = Path(OLD_DATA_DIR) / filename

        if not filepath.exists():
            print(f"⚠️  File not found: {filename}")
            return []

        print(f"📄 Reading {filename}...")

        with open(filepath, 'r', encoding='utf-8') as f:
            sql_content = f.read()

        rows = SQLParser.parse_insert_statement(sql_content)
        print(f"   Parsed {len(rows)} rows")

        return rows

    def _parse_timestamp(self, ts_str: str) -> Optional[datetime]:
        """Parse PostgreSQL timestamp to Python datetime (UTC)"""
        if not ts_str:
            return None
        try:
            # Handle various formats
            for fmt in [
                '%Y-%m-%d %H:%M:%S%z',
                '%Y-%m-%d %H:%M:%S+00',
                '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%d'
            ]:
                try:
                    dt = datetime.strptime(ts_str.replace('+00', '+0000'), fmt)
                    # Ensure UTC timezone
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    return dt
                except ValueError:
                    continue
            return None
        except Exception:
            return None

    async def load_existing_mappings(self):
        """
        Load ID mappings from already-migrated data in MongoDB.
        This connects customer/farm/product NAMES to their UUIDs.
        """
        print("\n🔍 Loading existing ID mappings from MongoDB...")

        # Load customers (from CRM module - customers collection)
        customers = await self.db.customers.find({'_migrated': True}).to_list(None)
        for customer in customers:
            name = customer.get('name', '').strip()
            customer_id = customer.get('customerId')
            if name and customer_id:
                self.customer_name_to_id[name] = customer_id
                # Add variations
                self.customer_name_to_id[name.upper()] = customer_id
                self.customer_name_to_id[name.lower()] = customer_id

        print(f"   ✅ Loaded {len(self.customer_name_to_id)} customer name mappings")

        # Load farms (from farm management module - farms collection)
        farms = await self.db.farms.find({'_migrated': True}).to_list(None)
        for farm in farms:
            name = farm.get('name', '').strip()
            farm_id = farm.get('farmId')
            if name and farm_id:
                self.farm_name_to_id[name] = farm_id
                # Add variations
                self.farm_name_to_id[name.upper()] = farm_id
                self.farm_name_to_id[name.lower()] = farm_id
                # Handle special cases
                if 'Hydroponic' in name:
                    self.farm_name_to_id['New Hydroponic'] = farm_id
                    self.farm_name_to_id['New Hydroponics'] = farm_id

        print(f"   ✅ Loaded {len(self.farm_name_to_id)} farm name mappings")

        # Load plant data (crop names -> plant_data IDs which can be used as products)
        plants = await self.db.plant_data.find({'_migrated': True}).to_list(None)
        for plant in plants:
            name = plant.get('plantName', '').strip()
            plant_id = plant.get('plantDataId')
            if name and plant_id:
                self.crop_name_to_product_id[name] = plant_id
                # Add variations
                self.crop_name_to_product_id[name.upper()] = plant_id
                self.crop_name_to_product_id[name.lower()] = plant_id

        print(f"   ✅ Loaded {len(self.crop_name_to_product_id)} crop/product name mappings")

    def _map_customer_name(self, customer_name: str) -> Tuple[Optional[str], str]:
        """Map customer name to UUID. Returns (uuid, name_used_for_display)"""
        if not customer_name:
            return None, "Unknown Customer"

        customer_name = customer_name.strip()

        # Try exact match first
        customer_id = self.customer_name_to_id.get(customer_name)
        if customer_id:
            self.stats['mappings']['customers_found'] += 1
            return customer_id, customer_name

        # Try case variations
        for variation in [customer_name.upper(), customer_name.lower()]:
            customer_id = self.customer_name_to_id.get(variation)
            if customer_id:
                self.stats['mappings']['customers_found'] += 1
                return customer_id, customer_name

        # Not found
        self.stats['mappings']['customers_missing'] += 1
        return None, customer_name

    def _map_farm_name(self, farm_name: str) -> Optional[str]:
        """Map farm name to UUID"""
        if not farm_name:
            return None

        farm_name = farm_name.strip()

        # Try exact match
        farm_id = self.farm_name_to_id.get(farm_name)
        if farm_id:
            self.stats['mappings']['farms_found'] += 1
            return farm_id

        # Try variations
        for variation in [farm_name.upper(), farm_name.lower()]:
            farm_id = self.farm_name_to_id.get(variation)
            if farm_id:
                self.stats['mappings']['farms_found'] += 1
                return farm_id

        # Not found
        self.stats['mappings']['farms_missing'] += 1
        return None

    def _map_crop_name(self, crop_name: str) -> Tuple[Optional[str], str]:
        """Map crop name to product UUID. Returns (uuid, name)"""
        if not crop_name:
            return None, "Unknown Product"

        crop_name = crop_name.strip()

        # Try exact match
        product_id = self.crop_name_to_product_id.get(crop_name)
        if product_id:
            self.stats['mappings']['products_found'] += 1
            return product_id, crop_name

        # Try variations
        for variation in [crop_name.upper(), crop_name.lower()]:
            product_id = self.crop_name_to_product_id.get(variation)
            if product_id:
                self.stats['mappings']['products_found'] += 1
                return product_id, crop_name

        # Not found
        self.stats['mappings']['products_missing'] += 1
        return None, crop_name

    def _map_status(self, old_status: str) -> str:
        """
        Map old status to new SalesOrderStatus enum.
        Old: Pending, Finished
        New: draft, confirmed, processing, shipped, delivered, cancelled
        """
        status_map = {
            'Pending': 'processing',  # In process of being fulfilled
            'Finished': 'delivered',  # Completed and delivered
        }
        return status_map.get(old_status, 'draft')

    async def load_order_headers(self):
        """Load all order headers from orderlist_re_rows.sql"""
        print("\n📦 Loading Order Headers...")

        rows = self.read_sql_file('orderlist_re_rows.sql')
        self.stats['orders']['total'] = len(rows)

        for row in rows:
            order_ref = row.get('ref')
            if not order_ref:
                continue

            # Store header data for later aggregation
            self.order_headers[order_ref] = row

        print(f"   ✅ Loaded {len(self.order_headers)} order headers")

    async def load_order_items(self):
        """Load all order line items from order_list_content_rows.sql"""
        print("\n📝 Loading Order Line Items...")

        rows = self.read_sql_file('order_list_content_rows.sql')
        self.stats['items']['total'] = len(rows)

        for row in rows:
            order_ref = row.get('order_list_ref')
            if not order_ref:
                continue

            # Group items by order reference
            self.order_items[order_ref].append(row)

        total_items = sum(len(items) for items in self.order_items.values())
        print(f"   ✅ Loaded {total_items} line items for {len(self.order_items)} orders")

    async def migrate_orders(self):
        """
        Migrate sales orders by combining headers and line items.
        Creates documents in sales_orders collection.
        """
        print("\n🚀 Migrating Sales Orders...")

        orders = []
        order_code_counter = 1

        for order_ref, header in self.order_headers.items():
            # Get all line items for this order
            items = self.order_items.get(order_ref, [])

            if not items:
                # Order has no items - skip it
                self.stats['orders']['skipped'] += 1
                print(f"   ⚠️  Skipping order {order_ref[:8]}... (no items)")
                continue

            # Extract header fields
            customer_name = header.get('client_id', '')
            farm_name = header.get('farm_id', '')
            old_status = header.get('status', 'Pending')
            order_driver = header.get('order_driver', '')
            vehicle_id = header.get('vehicle_id', '')
            packager_email = header.get('packager_email', '')
            note = header.get('note', '')

            # Parse dates
            date_packed = self._parse_timestamp(header.get('DatePacked'))
            start_date = self._parse_timestamp(header.get('StartDate'))
            order_date = date_packed or start_date or datetime.now(timezone.utc)

            # Map customer to UUID
            customer_id, customer_display_name = self._map_customer_name(customer_name)
            if not customer_id:
                # Create placeholder UUID for unknown customers
                customer_id = str(uuid4())
                print(f"   ⚠️  Unknown customer '{customer_name}' - using placeholder UUID")

            # Map farm (optional - for reference only)
            farm_id = self._map_farm_name(farm_name)

            # Process line items
            order_items_list = []
            subtotal = 0.0

            for item_row in items:
                crop_name = item_row.get('crop_id', '')
                grade = item_row.get('Grade', 'B')
                package_type = item_row.get('packagetype', 'Box')
                quantity = float(item_row.get('quantity', 0) or 0)
                package_size = float(item_row.get('packagesize', 0) or 0)
                total_kg = float(item_row.get('totalkg', 0) or 0)
                total_price = float(item_row.get('total_price', 0) or 0)
                avg_price = float(item_row.get('avg_price', 0) or 0)

                # Map crop to product UUID
                product_id, product_name = self._map_crop_name(crop_name)
                if not product_id:
                    # Create placeholder product ID
                    product_id = str(uuid4())

                # Calculate pricing (handle NULL prices)
                if total_price > 0:
                    unit_price = total_price / max(quantity, 1)
                    item_total = total_price
                elif avg_price > 0:
                    unit_price = avg_price
                    item_total = avg_price * quantity
                else:
                    # No pricing data - use 0
                    unit_price = 0.0
                    item_total = 0.0

                # Build product name with grade and package type
                full_product_name = f"{product_name} (Grade {grade}, {package_type})"
                if package_size > 0:
                    full_product_name += f" - {package_size}kg"

                order_item = {
                    'productId': product_id,
                    'productName': full_product_name,
                    'quantity': quantity,
                    'unitPrice': round(unit_price, 2),
                    'totalPrice': round(item_total, 2),
                    # Additional metadata (not in base model but useful)
                    '_cropName': crop_name,
                    '_grade': grade,
                    '_packageType': package_type,
                    '_packageSize': package_size,
                    '_totalKg': total_kg
                }

                order_items_list.append(order_item)
                subtotal += item_total

            # Calculate totals
            subtotal = round(subtotal, 2)
            tax = 0.0  # No tax data in old system
            discount = 0.0  # No discount data in old system
            total = subtotal

            # Map status
            status = self._map_status(old_status)

            # Build order notes
            order_notes = []
            if note:
                order_notes.append(f"Note: {note}")
            if order_driver:
                order_notes.append(f"Driver: {order_driver}")
            if vehicle_id:
                order_notes.append(f"Vehicle: {vehicle_id}")
            if packager_email:
                order_notes.append(f"Packager: {packager_email}")
            if farm_name:
                order_notes.append(f"Source Farm: {farm_name}")

            notes = " | ".join(order_notes) if order_notes else "Migrated from old system"

            # Create sales order document
            order = {
                'orderId': str(uuid4()),
                'orderCode': f'SO{str(order_code_counter).zfill(4)}',  # SO0001, SO0002, etc.
                'customerId': customer_id,
                'customerName': customer_display_name,
                'status': status,
                'orderDate': order_date,
                'items': order_items_list,
                'subtotal': subtotal,
                'tax': tax,
                'discount': discount,
                'total': total,
                'paymentStatus': 'pending',  # Default to pending (no payment data in old system)
                'shippingAddress': None,  # No shipping address data
                'notes': notes,
                'createdBy': MIGRATION_USER_ID,
                'createdAt': order_date,
                'updatedAt': datetime.now(timezone.utc),
                # Migration metadata
                '_migrated': True,
                '_oldRef': order_ref,
                '_farmId': farm_id,  # For reference
                '_farmName': farm_name
            }

            orders.append(order)
            order_code_counter += 1

        # Insert orders in batches
        if orders:
            print(f"\n📥 Inserting {len(orders)} sales orders into MongoDB...")

            batch_size = 100
            for i in range(0, len(orders), batch_size):
                batch = orders[i:i+batch_size]
                try:
                    result = await self.db.sales_orders.insert_many(batch, ordered=False)
                    self.stats['orders']['success'] += len(result.inserted_ids)
                    print(f"   ✅ Batch {i//batch_size + 1}: Inserted {len(result.inserted_ids)} orders")
                except Exception as e:
                    self.stats['orders']['failed'] += len(batch)
                    print(f"   ❌ Batch {i//batch_size + 1} failed: {e}")

            print(f"   ✅ Total migrated: {self.stats['orders']['success']} sales orders")

    async def create_indexes(self):
        """Create indexes for sales_orders collection"""
        print("\n🔧 Creating Indexes...")

        try:
            await self.db.sales_orders.create_index('orderId', unique=True)
            await self.db.sales_orders.create_index('orderCode', unique=True)
            await self.db.sales_orders.create_index('customerId')
            await self.db.sales_orders.create_index('status')
            await self.db.sales_orders.create_index('orderDate')
            await self.db.sales_orders.create_index([('customerName', 1), ('orderDate', -1)])
            print("   ✅ Created indexes on sales_orders")
        except Exception as e:
            print(f"   ⚠️  Error creating indexes: {e}")

    async def clear_migrated_data(self):
        """Clear previously migrated sales orders"""
        print("\n🗑️  Clearing previously migrated sales orders...")
        result = await self.db.sales_orders.delete_many({'_migrated': True})
        if result.deleted_count > 0:
            print(f"   Deleted {result.deleted_count} sales orders")
        print("   ✅ Cleared migrated data")

    async def run_migration(self):
        """Execute complete migration workflow"""
        try:
            await self.connect()
            await self.clear_migrated_data()

            print("\n" + "="*70)
            print("SALES ORDER MIGRATION - PostgreSQL to MongoDB")
            print("="*70 + "\n")

            # Phase 1: Load existing mappings
            print("📦 PHASE 1: Loading ID Mappings")
            print("-" * 70)
            await self.load_existing_mappings()

            # Phase 2: Load order data from SQL files
            print("\n📦 PHASE 2: Loading Order Data from SQL Files")
            print("-" * 70)
            await self.load_order_headers()
            await self.load_order_items()

            # Phase 3: Migrate orders
            print("\n📦 PHASE 3: Migrating Sales Orders")
            print("-" * 70)
            await self.migrate_orders()

            # Phase 4: Create indexes
            print("\n📦 PHASE 4: Database Optimization")
            print("-" * 70)
            await self.create_indexes()

            self.print_summary()

        except Exception as e:
            print(f"\n❌ MIGRATION FAILED: {str(e)}")
            import traceback
            traceback.print_exc()
        finally:
            await self.close()

    def print_summary(self):
        """Print migration summary with statistics"""
        print("\n" + "="*70)
        print("SALES ORDER MIGRATION SUMMARY")
        print("="*70 + "\n")

        # Orders
        print("📦 ORDERS:")
        print(f"   Total Order Headers: {self.stats['orders']['total']}")
        print(f"   Successfully Migrated: {self.stats['orders']['success']}")
        print(f"   Failed: {self.stats['orders']['failed']}")
        print(f"   Skipped (no items): {self.stats['orders']['skipped']}")
        if self.stats['orders']['total'] > 0:
            success_rate = (self.stats['orders']['success'] / self.stats['orders']['total']) * 100
            print(f"   Success Rate: {success_rate:.1f}%")

        # Items
        print("\n📝 ORDER LINE ITEMS:")
        print(f"   Total Line Items: {self.stats['items']['total']}")
        total_migrated_items = sum(
            len(order.get('items', []))
            for order in self.order_headers.keys()
        )
        print(f"   Items in Migrated Orders: {total_migrated_items}")

        # Mappings
        print("\n🔗 ID MAPPINGS:")
        print(f"   Customers Found: {self.stats['mappings']['customers_found']}")
        print(f"   Customers Missing: {self.stats['mappings']['customers_missing']}")
        print(f"   Farms Found: {self.stats['mappings']['farms_found']}")
        print(f"   Farms Missing: {self.stats['mappings']['farms_missing']}")
        print(f"   Products Found: {self.stats['mappings']['products_found']}")
        print(f"   Products Missing: {self.stats['mappings']['products_missing']}")

        # Status breakdown
        print("\n📊 ORDER STATUS DISTRIBUTION:")
        # Would need to scan orders to show this - omitting for now

        print("\n" + "="*70)
        print("MIGRATION COMPLETE")
        print("="*70)

        # Recommendations
        print("\n💡 NEXT STEPS:")
        if self.stats['mappings']['customers_missing'] > 0:
            print("   ⚠️  Some customers were not found - orders use placeholder UUIDs")
            print("      Consider updating customer references manually")
        if self.stats['mappings']['products_missing'] > 0:
            print("   ⚠️  Some products were not found - items use placeholder UUIDs")
            print("      Consider creating product records or updating references")
        print("\n   ✅ Review migrated data: db.sales_orders.find({'_migrated': true})")
        print("   ✅ Check for missing references and update as needed")
        print("   ✅ Test the Sales module API with migrated data")


async def main():
    """Main entry point"""
    migrator = SalesOrderMigrator()
    await migrator.run_migration()


if __name__ == "__main__":
    asyncio.run(main())
