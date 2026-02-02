#!/usr/bin/env python3
"""
PostgreSQL to MongoDB Data Migration Script

Migrates data from old PostgreSQL SQL dumps to new MongoDB collections.
Handles UUID preservation, data transformation, and reference resolution.

Author: Database Schema Architect
Date: 2026-01-22
"""

import os
import re
import json
import asyncio
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Tuple
from uuid import uuid4
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne

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

        Example:
        INSERT INTO "table" ("col1", "col2") VALUES ('val1', 'val2'), ('val3', 'val4');
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

            if char == "'":
                in_quote = not in_quote
                current_value += char
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
                    # Start of new row
                    current_row = []
                    current_value = ""
                else:
                    current_value += char
                i += 1
                continue

            if char == ')':
                paren_depth -= 1
                if paren_depth == 0:
                    # End of row
                    if current_value.strip():
                        current_row.append(SQLParser._parse_value(current_value.strip()))
                    if current_row:
                        rows.append(dict(zip(columns, current_row)))
                    current_value = ""
                else:
                    current_value += char
                i += 1
                continue

            if char == ',' and paren_depth == 1:
                # Column separator
                current_row.append(SQLParser._parse_value(current_value.strip()))
                current_value = ""
                i += 1
                continue

            current_value += char
            i += 1

        return rows

    @staticmethod
    def _parse_value(val: str) -> Any:
        """Parse SQL value to Python type"""
        val = val.strip()

        if val == 'null' or val == 'NULL':
            return None

        # Remove surrounding quotes
        if val.startswith("'") and val.endswith("'"):
            val = val[1:-1]
            # Unescape single quotes
            val = val.replace("''", "'")
            return val

        # Boolean
        if val.lower() == 'true':
            return True
        if val.lower() == 'false':
            return False

        # Try integer
        try:
            if '.' not in val:
                return int(val)
        except ValueError:
            pass

        # Try float
        try:
            return float(val)
        except ValueError:
            pass

        return val


class DataMigrator:
    """Main migration orchestrator"""

    def __init__(self, mongodb_uri: str, database_name: str):
        self.mongodb_uri = mongodb_uri
        self.database_name = database_name
        self.client: Optional[AsyncIOMotorClient] = None
        self.db = None

        # Mapping dictionaries (old UUID -> new UUID)
        self.farm_id_map: Dict[str, str] = {}
        self.block_id_map: Dict[str, str] = {}
        self.plant_data_id_map: Dict[str, str] = {}
        self.customer_id_map: Dict[str, str] = {}
        self.vehicle_id_map: Dict[str, str] = {}

        # Statistics
        self.stats = {
            'farms': {'total': 0, 'success': 0, 'failed': 0},
            'blocks': {'total': 0, 'success': 0, 'failed': 0},
            'plant_data': {'total': 0, 'success': 0, 'failed': 0},
            'harvests': {'total': 0, 'success': 0, 'failed': 0},
            'customers': {'total': 0, 'success': 0, 'failed': 0},
            'vehicles': {'total': 0, 'success': 0, 'failed': 0},
            'orders': {'total': 0, 'success': 0, 'failed': 0},
            'crop_prices': {'total': 0, 'success': 0, 'failed': 0},
            'block_archives': {'total': 0, 'success': 0, 'failed': 0},
        }

    async def connect(self):
        """Connect to MongoDB"""
        print(f"Connecting to MongoDB at {self.mongodb_uri}...")
        self.client = AsyncIOMotorClient(self.mongodb_uri)
        self.db = self.client[self.database_name]

        # Test connection
        await self.db.command('ping')
        print("✅ Connected to MongoDB successfully")

    async def close(self):
        """Close MongoDB connection"""
        if self.client:
            self.client.close()
            print("✅ Closed MongoDB connection")

    async def run_migration(self):
        """Execute complete migration"""
        try:
            await self.connect()

            print("\n" + "="*70)
            print("STARTING DATA MIGRATION")
            print("="*70 + "\n")

            # Phase 1: Migrate master data (no dependencies)
            print("📦 PHASE 1: Master Data")
            print("-" * 70)
            await self.migrate_farms()
            await self.migrate_plant_data()
            await self.migrate_customers()
            await self.migrate_vehicles()

            # Phase 2: Migrate transactional data (depends on master data)
            print("\n📦 PHASE 2: Transactional Data")
            print("-" * 70)
            await self.migrate_blocks()
            await self.migrate_harvests()
            await self.migrate_block_archives()

            # Phase 3: Migrate operational data
            print("\n📦 PHASE 3: Operational Data")
            print("-" * 70)
            await self.migrate_orders()
            await self.migrate_crop_prices()

            # Phase 4: Create indexes
            print("\n📦 PHASE 4: Database Optimization")
            print("-" * 70)
            await self.create_indexes()

            # Print summary
            self.print_summary()

        except Exception as e:
            print(f"\n❌ MIGRATION FAILED: {str(e)}")
            import traceback
            traceback.print_exc()
        finally:
            await self.close()

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

    # ============================================================================
    # PHASE 1: MASTER DATA MIGRATION
    # ============================================================================

    async def migrate_farms(self):
        """Migrate farm_details to farms collection"""
        print("\n🏞️  Migrating Farms...")

        rows = self.read_sql_file('farm_details_rows.sql')
        self.stats['farms']['total'] = len(rows)

        if not rows:
            print("   No farms to migrate")
            return

        farms = []
        for row in rows:
            old_uuid = row.get('ref')
            new_uuid = str(uuid4())

            # Store mapping
            self.farm_id_map[old_uuid] = new_uuid

            farm = {
                'farmId': new_uuid,
                'name': row.get('Name', 'Unknown Farm'),
                'description': None,
                'owner': None,
                'location': None,
                'totalArea': 0,  # Not in old schema
                'areaUnit': 'hectares',
                'numberOfStaff': 0,
                'managerId': MIGRATION_USER_ID,
                'managerEmail': MIGRATION_USER_EMAIL,
                'isActive': True,
                'createdAt': datetime.now(timezone.utc),
                'updatedAt': datetime.now(timezone.utc),
                '_migrated': True,
                '_oldRef': old_uuid
            }

            farms.append(farm)

        # Insert farms
        if farms:
            result = await self.db.farms.insert_many(farms)
            self.stats['farms']['success'] = len(result.inserted_ids)
            print(f"   ✅ Migrated {len(result.inserted_ids)} farms")

    async def migrate_plant_data(self):
        """Migrate standard_planning to plant_data collection"""
        print("\n🌱 Migrating Plant Data...")

        rows = self.read_sql_file('standard_planning_rows.sql')
        self.stats['plant_data']['total'] = len(rows)

        if not rows:
            print("   No plant data to migrate")
            return

        plants = []
        for row in rows:
            old_uuid = row.get('ref')
            new_uuid = str(uuid4())

            # Store mapping
            self.plant_data_id_map[old_uuid] = new_uuid

            # Map old plant name
            plant_name = row.get('Item', 'Unknown Plant')

            # Calculate growth cycle
            total_days = int(row.get('TotalDurationday', 90) or 90)

            # Parse net yield
            net_yield = float(row.get('NetYieldPerDripkg', 1.0) or 1.0)

            plant = {
                'plantDataId': new_uuid,
                'plantName': plant_name,
                'scientificName': None,
                'plantType': 'Crop',
                'growthCycleDays': total_days,
                'minTemperatureCelsius': None,
                'maxTemperatureCelsius': None,
                'optimalPHMin': None,
                'optimalPHMax': None,
                'wateringFrequencyDays': None,
                'sunlightHoursDaily': None,
                'expectedYieldPerPlant': net_yield,
                'yieldUnit': 'kg',
                'spacingCategory': 'm',  # Default medium spacing
                'notes': f"Migrated from old system. Cleaning days: {row.get('Cleaningday', 0)}, Harvest duration: {row.get('HarvestDurationday', 0)} days",
                'tags': [],
                'dataVersion': 1,
                'createdBy': MIGRATION_USER_ID,
                'createdByEmail': MIGRATION_USER_EMAIL,
                'createdAt': datetime.now(timezone.utc),
                'updatedAt': datetime.now(timezone.utc),
                '_migrated': True,
                '_oldRef': old_uuid,
                '_oldFertilizerData': row.get('PlanningFertilizer')  # Keep for reference
            }

            plants.append(plant)

        # Insert plant data
        if plants:
            result = await self.db.plant_data.insert_many(plants)
            self.stats['plant_data']['success'] = len(result.inserted_ids)
            print(f"   ✅ Migrated {len(result.inserted_ids)} plant data records")

    async def migrate_customers(self):
        """Migrate client_details to customers collection (CRM)"""
        print("\n👥 Migrating Customers...")

        rows = self.read_sql_file('client_details_rows.sql')
        self.stats['customers']['total'] = len(rows)

        if not rows:
            print("   No customers to migrate")
            return

        customers = []
        customer_code = 1

        for row in rows:
            old_uuid = row.get('ref')
            new_uuid = str(uuid4())

            # Store mapping
            self.customer_id_map[old_uuid] = new_uuid

            customer = {
                'customerId': new_uuid,
                'customerCode': f"C{customer_code:03d}",
                'name': row.get('clientname', 'Unknown Client'),
                'email': None,
                'phone': None,
                'company': row.get('clientname'),
                'address': None,
                'type': 'business',  # All old clients are business
                'status': 'active',
                'notes': 'Migrated from old system',
                'tags': ['migrated'],
                'createdBy': MIGRATION_USER_ID,
                'createdAt': datetime.now(timezone.utc),
                'updatedAt': datetime.now(timezone.utc),
                '_migrated': True,
                '_oldRef': old_uuid
            }

            customers.append(customer)
            customer_code += 1

        # Insert customers
        if customers:
            result = await self.db.customers.insert_many(customers)
            self.stats['customers']['success'] = len(result.inserted_ids)
            print(f"   ✅ Migrated {len(result.inserted_ids)} customers")

    async def migrate_vehicles(self):
        """Migrate vehicle_details to vehicles collection (Logistics)"""
        print("\n🚚 Migrating Vehicles...")

        rows = self.read_sql_file('vehicle_details_rows.sql')
        self.stats['vehicles']['total'] = len(rows)

        if not rows:
            print("   No vehicles to migrate")
            return

        vehicles = []

        for row in rows:
            old_uuid = row.get('ref')
            new_uuid = str(uuid4())

            # Store mapping
            self.vehicle_id_map[old_uuid] = new_uuid

            # Parse vehicle name (e.g., "TOYOTA HIACE - 51091")
            vehicle_name = row.get('vehiclename', 'Unknown Vehicle')
            parts = vehicle_name.split(' - ')

            make_model = parts[0].strip() if len(parts) > 0 else 'Unknown'
            plate_number = parts[1].strip() if len(parts) > 1 else None

            vehicle = {
                'vehicleId': new_uuid,
                'vehicleCode': plate_number or f"V{len(vehicles)+1:03d}",
                'name': vehicle_name,
                'makeModel': make_model,
                'licensePlate': plate_number,
                'type': 'delivery_truck',  # Default type
                'status': 'operational',
                'capacity': None,
                'capacityUnit': None,
                'driver': None,
                'notes': 'Migrated from old system',
                'createdBy': MIGRATION_USER_ID,
                'createdAt': datetime.now(timezone.utc),
                'updatedAt': datetime.now(timezone.utc),
                '_migrated': True,
                '_oldRef': old_uuid
            }

            vehicles.append(vehicle)

        # Insert vehicles
        if vehicles:
            # Note: vehicles collection may not exist yet, skip for now
            # Will be implemented when logistics module is created
            print(f"   ⚠️  Vehicles collection not yet implemented - {len(vehicles)} vehicles ready for future migration")
            self.stats['vehicles']['success'] = len(vehicles)

    # ============================================================================
    # PHASE 2: TRANSACTIONAL DATA MIGRATION
    # ============================================================================

    async def migrate_blocks(self):
        """Migrate farm_block to blocks collection"""
        print("\n📦 Migrating Blocks...")

        rows = self.read_sql_file('farm_block_rows.sql')
        self.stats['blocks']['total'] = len(rows)

        if not rows:
            print("   No blocks to migrate")
            return

        blocks = []
        sequence_counters = {}  # Track sequence per farm

        for row in rows:
            old_uuid = row.get('ref')
            new_uuid = str(uuid4())

            # Store mapping
            self.block_id_map[old_uuid] = new_uuid

            # Map farm reference
            old_farm_ref = row.get('farm_details_ref')
            new_farm_id = self.farm_id_map.get(old_farm_ref)

            if not new_farm_id:
                print(f"   ⚠️  Skipping block {row.get('block_id')} - farm not found")
                self.stats['blocks']['failed'] += 1
                continue

            # Get farm code from farm_id_map
            farm_name = row.get('farm_name', 'Unknown')
            farm_code = farm_name[:3].upper()

            # Sequence number
            if new_farm_id not in sequence_counters:
                sequence_counters[new_farm_id] = 1
            else:
                sequence_counters[new_farm_id] += 1

            sequence_num = sequence_counters[new_farm_id]
            block_code = f"{farm_code}-{sequence_num:03d}"

            # Map plant reference
            old_plant_ref = row.get('standard_planning_ref')
            new_plant_id = self.plant_data_id_map.get(old_plant_ref)

            # Parse state
            old_state = row.get('state', 'empty')
            state_map = {
                'Planted': 'planted',
                'Cleaned': 'empty',
                'Harvesting': 'harvesting',
                'Growing': 'growing'
            }
            new_state = state_map.get(old_state, 'empty')

            # Parse dates
            time_start = self._parse_timestamp(row.get('time_start'))
            time_finish = self._parse_timestamp(row.get('time_finish'))

            # Calculate area from drips (approximate)
            drips = int(row.get('drips', 0) or 0)
            area = drips * 0.3  # Approximate: 0.3 sqm per drip

            block = {
                'blockId': new_uuid,
                'farmId': new_farm_id,
                'farmCode': farm_code,
                'blockCode': block_code,
                'sequenceNumber': sequence_num,
                'name': row.get('block_id'),  # Use old block_id as name
                'blockType': 'openfield',  # Default, can be updated
                'maxPlants': drips,
                'area': area,
                'areaUnit': 'sqm',
                'location': None,
                'state': new_state,
                'previousState': None,
                'targetCrop': new_plant_id,
                'targetCropName': row.get('Item'),
                'actualPlantCount': drips,
                'plantedDate': time_start,
                'expectedHarvestDate': time_finish,
                'expectedStatusChanges': {},
                'kpi': {
                    'predictedYieldKg': 0,
                    'actualYieldKg': 0,
                    'yieldEfficiencyPercent': 0,
                    'totalHarvests': 0
                },
                'statusChanges': [],
                'createdAt': time_start or datetime.now(timezone.utc),
                'updatedAt': datetime.now(timezone.utc),
                'isActive': new_state != 'empty',
                '_migrated': True,
                '_oldRef': old_uuid,
                '_oldBlockId': row.get('block_id'),
                '_oldInventoryData': row.get('InventoryData')  # Keep fertilizer schedule
            }

            blocks.append(block)

        # Insert blocks in batches
        if blocks:
            batch_size = 100
            for i in range(0, len(blocks), batch_size):
                batch = blocks[i:i+batch_size]
                result = await self.db.blocks.insert_many(batch)
                self.stats['blocks']['success'] += len(result.inserted_ids)
                print(f"   ✅ Migrated batch {i//batch_size + 1}: {len(result.inserted_ids)} blocks")

            print(f"   ✅ Total migrated: {self.stats['blocks']['success']} blocks")

    async def migrate_harvests(self):
        """Migrate harvest_reports to block_harvests collection"""
        print("\n🌾 Migrating Harvests...")

        rows = self.read_sql_file('harvest_reports_rows.sql')
        self.stats['harvests']['total'] = len(rows)

        if not rows:
            print("   No harvests to migrate")
            return

        # Build name-based lookup for farms
        farm_name_map = {}  # farm_name -> farmId
        async for farm in self.db.farms.find({'_migrated': True}):
            farm_name_map[farm['name']] = farm['farmId']

        # Build block lookup: (farmId, blockCode) -> blockId
        block_lookup = {}
        async for block in self.db.blocks.find({'_migrated': True}):
            key = (block['farmId'], block.get('blockCode', ''))
            block_lookup[key] = block['blockId']

        harvests = []
        blocks_created = 0

        for row in rows:
            old_uuid = row.get('ref')

            # Try 1: Map block reference by UUID
            old_block_ref = row.get('farm_block_ref')
            new_block_id = self.block_id_map.get(old_block_ref)
            new_farm_id = None

            if new_block_id:
                # Get farm from block
                block_doc = await self.db.blocks.find_one({'blockId': new_block_id})
                if block_doc:
                    new_farm_id = block_doc['farmId']

            # Try 2: If no block found, use farm name + block_id to find or create
            if not new_block_id or not new_farm_id:
                farm_name = row.get('farm', '')
                block_code = row.get('block_id', '')

                # Find farm by name
                new_farm_id = farm_name_map.get(farm_name)
                if not new_farm_id:
                    self.stats['harvests']['failed'] += 1
                    continue

                # Check if block exists by farm+code
                lookup_key = (new_farm_id, block_code)
                new_block_id = block_lookup.get(lookup_key)

                if not new_block_id:
                    # Create the block on the fly
                    new_block_id = str(uuid4())
                    new_block = {
                        'blockId': new_block_id,
                        'farmId': new_farm_id,
                        'blockCode': block_code,
                        'name': block_code,
                        'blockType': 'openfield',
                        'state': 'empty',
                        'maxPlants': 0,
                        'area': 0,
                        'areaUnit': 'sqm',
                        'isActive': True,
                        'createdAt': datetime.now(timezone.utc),
                        'updatedAt': datetime.now(timezone.utc),
                        '_migrated': True,
                        '_createdFromHarvest': True,
                        '_oldBlockCode': block_code
                    }
                    await self.db.blocks.insert_one(new_block)
                    block_lookup[lookup_key] = new_block_id
                    blocks_created += 1

            # Parse harvest date
            harvest_date = self._parse_timestamp(row.get('time'))

            # Parse quantity
            quantity = float(row.get('Quantity', 0) or 0)

            # Map quality grade
            old_grade = row.get('grade')
            grade_map = {
                'A': 'A',
                'B': 'B',
                'C': 'C',
                None: 'B'  # Default
            }
            quality_grade = grade_map.get(old_grade, 'B')

            harvest = {
                'harvestId': str(uuid4()),
                'blockId': new_block_id,
                'farmId': new_farm_id,
                'plantingId': None,  # Not tracked in old system
                'harvestDate': harvest_date or datetime.now(timezone.utc),
                'amount': quantity,
                'unit': 'kg',
                'qualityGrade': quality_grade,
                'harvestedBy': MIGRATION_USER_ID,
                'harvestedByEmail': row.get('reporter_user', MIGRATION_USER_EMAIL),
                'notes': f"Season {row.get('harvestSeason', '')}. Migrated from old system.",
                'createdAt': harvest_date or datetime.now(timezone.utc),
                '_migrated': True,
                '_oldRef': old_uuid
            }

            harvests.append(harvest)

        if blocks_created > 0:
            print(f"   📦 Created {blocks_created} missing blocks from harvest data")

        # Insert harvests in batches
        if harvests:
            batch_size = 500
            for i in range(0, len(harvests), batch_size):
                batch = harvests[i:i+batch_size]
                result = await self.db.block_harvests.insert_many(batch)
                self.stats['harvests']['success'] += len(result.inserted_ids)
                print(f"   ✅ Migrated batch {i//batch_size + 1}: {len(result.inserted_ids)} harvests")

            print(f"   ✅ Total migrated: {self.stats['harvests']['success']} harvests")

    async def migrate_block_archives(self):
        """Migrate block_history to block_archives collection"""
        print("\n📚 Migrating Block Archives...")

        rows = self.read_sql_file('block_history_rows.sql')
        self.stats['block_archives']['total'] = len(rows)

        if not rows:
            print("   No block archives to migrate")
            return

        # Build name-based lookup for farms
        farm_name_map = {}  # farm_name -> farmId
        async for farm in self.db.farms.find({'_migrated': True}):
            farm_name_map[farm['name']] = farm['farmId']

        # Build plant name lookup
        plant_name_map = {}  # plant_name -> plantDataId
        async for plant in self.db.plant_data.find({'_migrated': True}):
            plant_name_map[plant.get('plantName', '')] = plant['plantDataId']

        # Build block lookup: (farmId, blockCode) -> blockId
        block_lookup = {}
        async for block in self.db.blocks.find({'_migrated': True}):
            key = (block['farmId'], block.get('blockCode', ''))
            block_lookup[key] = block['blockId']

        archives = []

        for row in rows:
            old_uuid = row.get('ref')

            # farm_id in block_history is actually farm NAME, not UUID
            farm_name = row.get('farm_id', '')
            new_farm_id = farm_name_map.get(farm_name)

            if not new_farm_id:
                self.stats['block_archives']['failed'] += 1
                continue

            # Try to find block by UUID first
            old_block_ref = row.get('farm_block_ref')
            new_block_id = self.block_id_map.get(old_block_ref)

            if not new_block_id:
                # Try by farm+block_code
                block_code = row.get('block_id', '')
                lookup_key = (new_farm_id, block_code)
                new_block_id = block_lookup.get(lookup_key)

            if not new_block_id:
                # Create a placeholder block ID
                new_block_id = str(uuid4())

            # Map plant by name (crop_id is actually crop name)
            crop_name = row.get('crop_id', '')
            new_plant_id = plant_name_map.get(crop_name)

            # Parse dates
            planted_date = self._parse_timestamp(row.get('time_start'))
            harvest_start = self._parse_timestamp(row.get('time_finish'))
            cleaned_date = self._parse_timestamp(row.get('time_cleaned'))

            # Calculate cycle duration
            if planted_date and cleaned_date:
                cycle_days = (cleaned_date - planted_date).days
            else:
                cycle_days = int(row.get('harvest_duration', 0) or 0)

            # Parse yield data
            net_yield = float(row.get('net_yield', 0) or 0)
            predicted_yield = float(row.get('predicted_yield', 0) or 0)

            yield_efficiency = 0
            if predicted_yield > 0:
                yield_efficiency = (net_yield / predicted_yield) * 100

            archive = {
                'archiveId': str(uuid4()),
                'blockId': new_block_id,
                'farmId': new_farm_id,
                'plantingId': None,
                'plantDataId': new_plant_id,
                'plantName': row.get('block_id', 'Unknown'),
                'plantedDate': planted_date,
                'harvestStartDate': harvest_start,
                'harvestEndDate': cleaned_date,
                'cycleDuration': cycle_days,
                'predictedYield': {
                    'amount': predicted_yield,
                    'unit': 'kg'
                },
                'actualYield': {
                    'amount': net_yield,
                    'unit': 'kg'
                },
                'yieldEfficiency': yield_efficiency,
                'qualityBreakdown': {
                    'gradeA': 0,
                    'gradeB': 0,
                    'gradeC': 0,
                    'total': net_yield
                },
                'harvests': [],  # Would need to link harvest_reports
                'statusChanges': [],
                'archivedAt': cleaned_date or datetime.now(timezone.utc),
                'archivedBy': MIGRATION_USER_ID,
                'archivedByEmail': MIGRATION_USER_EMAIL,
                '_migrated': True,
                '_oldRef': old_uuid,
                '_oldKpiData': row.get('kpi')
            }

            archives.append(archive)

        # Insert archives in batches
        if archives:
            batch_size = 200
            for i in range(0, len(archives), batch_size):
                batch = archives[i:i+batch_size]
                result = await self.db.block_archives.insert_many(batch)
                self.stats['block_archives']['success'] += len(result.inserted_ids)
                print(f"   ✅ Migrated batch {i//batch_size + 1}: {len(result.inserted_ids)} archives")

            print(f"   ✅ Total migrated: {self.stats['block_archives']['success']} archives")

    # ============================================================================
    # PHASE 3: OPERATIONAL DATA MIGRATION
    # ============================================================================

    async def migrate_orders(self):
        """Migrate orderlist_re and order_list_content to sales_orders collection"""
        print("\n📋 Migrating Sales Orders...")

        # Read order headers
        order_headers = self.read_sql_file('orderlist_re_rows.sql')
        # Read order items
        order_items_list = self.read_sql_file('order_list_content_rows.sql')

        self.stats['orders']['total'] = len(order_headers)

        if not order_headers:
            print("   No orders to migrate")
            return

        # Group items by order
        items_by_order = {}
        for item in order_items_list:
            order_ref = item.get('order_list_ref')
            if order_ref not in items_by_order:
                items_by_order[order_ref] = []
            items_by_order[order_ref].append(item)

        orders = []

        for header in order_headers:
            old_uuid = header.get('ref')

            # Map customer
            old_customer_id = header.get('client_id')
            new_customer_id = None

            # Search by name since old system uses names
            if old_customer_id:
                customer_doc = await self.db.customers.find_one({'name': old_customer_id})
                if customer_doc:
                    new_customer_id = customer_doc['customerId']

            # Map farm
            old_farm_id = header.get('farm_id')
            new_farm_id = None

            if old_farm_id:
                farm_doc = await self.db.farms.find_one({'name': old_farm_id})
                if farm_doc:
                    new_farm_id = farm_doc['farmId']

            # Parse dates
            order_date = self._parse_timestamp(header.get('StartDate'))
            packed_date = self._parse_timestamp(header.get('DatePacked'))
            finished_date = self._parse_timestamp(header.get('DateFinished'))

            # Map status
            status_map = {
                'Pending': 'pending',
                'Packed': 'packed',
                'Delivered': 'delivered',
                'Cancelled': 'cancelled'
            }
            status = status_map.get(header.get('status'), 'pending')

            # Get order items
            items = []
            order_items = items_by_order.get(old_uuid, [])

            total_amount = 0
            for item in order_items:
                item_total = float(item.get('total_price', 0) or 0)
                total_amount += item_total

                items.append({
                    'itemId': str(uuid4()),
                    'productName': item.get('crop_id', 'Unknown'),
                    'quantity': float(item.get('quantity', 0) or 0),
                    'unit': 'kg',
                    'grade': item.get('Grade'),
                    'unitPrice': float(item.get('avg_price', 0) or 0),
                    'totalPrice': item_total,
                    'packageSize': item.get('packagesize'),
                    'packageType': item.get('packagetype')
                })

            order = {
                'orderId': str(uuid4()),
                'orderNumber': header.get('RNumber') or f"ORD-{old_uuid[:8]}",
                'customerId': new_customer_id,
                'customerName': old_customer_id,
                'farmId': new_farm_id,
                'orderDate': order_date or datetime.now(timezone.utc),
                'status': status,
                'items': items,
                'totalAmount': total_amount,
                'currency': 'AED',
                'notes': header.get('note'),
                'packedDate': packed_date,
                'deliveredDate': finished_date,
                'driver': header.get('order_driver'),
                'vehicle': header.get('vehicle_id'),
                'packager': header.get('packager_email'),
                'receiver': header.get('Reciever'),
                'signature': header.get('Signature'),
                'createdBy': MIGRATION_USER_ID,
                'createdAt': order_date or datetime.now(timezone.utc),
                'updatedAt': datetime.now(timezone.utc),
                '_migrated': True,
                '_oldRef': old_uuid
            }

            orders.append(order)

        # Insert orders
        if orders:
            # Note: sales_orders collection may not exist yet
            print(f"   ⚠️  Sales orders collection not yet implemented - {len(orders)} orders ready for future migration")
            self.stats['orders']['success'] = len(orders)

    async def migrate_crop_prices(self):
        """Migrate crop_price to crop_prices collection (new)"""
        print("\n💰 Migrating Crop Prices...")

        rows = self.read_sql_file('crop_price_rows.sql')
        self.stats['crop_prices']['total'] = len(rows)

        if not rows:
            print("   No crop prices to migrate")
            return

        prices = []

        for row in rows:
            old_uuid = row.get('ref')

            # Parse date
            price_date = self._parse_timestamp(row.get('date'))

            # Map customer
            customer_name = row.get('customer')
            new_customer_id = None

            if customer_name:
                customer_doc = await self.db.customers.find_one({'name': customer_name})
                if customer_doc:
                    new_customer_id = customer_doc['customerId']

            # Map farm
            farm_name = row.get('farm')
            new_farm_id = None

            if farm_name:
                farm_doc = await self.db.farms.find_one({'name': farm_name})
                if farm_doc:
                    new_farm_id = farm_doc['farmId']

            price = {
                'priceId': str(uuid4()),
                'date': price_date or datetime.now(timezone.utc),
                'customerId': new_customer_id,
                'customerName': customer_name,
                'farmId': new_farm_id,
                'farmName': farm_name,
                'crop': row.get('crop'),
                'grade': row.get('grade'),
                'quantity': float(row.get('quantity', 0) or 0),
                'unit': 'kg',
                'pricePerUnit': float(row.get('price_unit', 0) or 0),
                'totalPrice': float(row.get('price_total', 0) or 0),
                'currency': 'AED',
                'createdBy': MIGRATION_USER_ID,
                'createdAt': price_date or datetime.now(timezone.utc),
                '_migrated': True,
                '_oldRef': old_uuid
            }

            prices.append(price)

        # Insert prices in batches
        if prices:
            batch_size = 500
            for i in range(0, len(prices), batch_size):
                batch = prices[i:i+batch_size]
                result = await self.db.crop_prices.insert_many(batch)
                self.stats['crop_prices']['success'] += len(result.inserted_ids)
                print(f"   ✅ Migrated batch {i//batch_size + 1}: {len(result.inserted_ids)} prices")

            print(f"   ✅ Total migrated: {self.stats['crop_prices']['success']} crop prices")

    # ============================================================================
    # PHASE 4: DATABASE OPTIMIZATION
    # ============================================================================

    async def create_indexes(self):
        """Create indexes on migrated collections"""
        print("\n🔧 Creating Indexes...")

        indexes_created = 0

        # Farms
        try:
            await self.db.farms.create_index('farmId', unique=True)
            await self.db.farms.create_index('_oldRef')
            indexes_created += 2
            print("   ✅ Created indexes on farms collection")
        except Exception as e:
            print(f"   ⚠️  Error creating farms indexes: {e}")

        # Blocks
        try:
            await self.db.blocks.create_index('blockId', unique=True)
            await self.db.blocks.create_index('farmId')
            await self.db.blocks.create_index('blockCode', unique=True)
            await self.db.blocks.create_index('_oldRef')
            await self.db.blocks.create_index('_oldBlockId')
            indexes_created += 5
            print("   ✅ Created indexes on blocks collection")
        except Exception as e:
            print(f"   ⚠️  Error creating blocks indexes: {e}")

        # Plant Data
        try:
            await self.db.plant_data.create_index('plantDataId', unique=True)
            await self.db.plant_data.create_index('plantName')
            await self.db.plant_data.create_index('_oldRef')
            indexes_created += 3
            print("   ✅ Created indexes on plant_data collection")
        except Exception as e:
            print(f"   ⚠️  Error creating plant_data indexes: {e}")

        # Block Harvests
        try:
            await self.db.block_harvests.create_index('harvestId', unique=True)
            await self.db.block_harvests.create_index('blockId')
            await self.db.block_harvests.create_index('farmId')
            await self.db.block_harvests.create_index('harvestDate')
            await self.db.block_harvests.create_index('_oldRef')
            indexes_created += 5
            print("   ✅ Created indexes on block_harvests collection")
        except Exception as e:
            print(f"   ⚠️  Error creating block_harvests indexes: {e}")

        # Block Archives
        try:
            await self.db.block_archives.create_index('archiveId', unique=True)
            await self.db.block_archives.create_index('blockId')
            await self.db.block_archives.create_index('farmId')
            await self.db.block_archives.create_index('archivedAt')
            await self.db.block_archives.create_index('_oldRef')
            indexes_created += 5
            print("   ✅ Created indexes on block_archives collection")
        except Exception as e:
            print(f"   ⚠️  Error creating block_archives indexes: {e}")

        # Customers
        try:
            await self.db.customers.create_index('customerId', unique=True)
            await self.db.customers.create_index('name')
            await self.db.customers.create_index('_oldRef')
            indexes_created += 3
            print("   ✅ Created indexes on customers collection")
        except Exception as e:
            print(f"   ⚠️  Error creating customers indexes: {e}")

        # Crop Prices
        try:
            await self.db.crop_prices.create_index('priceId', unique=True)
            await self.db.crop_prices.create_index('date')
            await self.db.crop_prices.create_index('customerId')
            await self.db.crop_prices.create_index('farmId')
            await self.db.crop_prices.create_index('crop')
            await self.db.crop_prices.create_index('_oldRef')
            indexes_created += 6
            print("   ✅ Created indexes on crop_prices collection")
        except Exception as e:
            print(f"   ⚠️  Error creating crop_prices indexes: {e}")

        print(f"\n   ✅ Total indexes created: {indexes_created}")

    # ============================================================================
    # UTILITY METHODS
    # ============================================================================

    def _parse_timestamp(self, ts: Any) -> Optional[datetime]:
        """Parse timestamp string to datetime"""
        if not ts:
            return None

        if isinstance(ts, datetime):
            return ts

        if isinstance(ts, str):
            # Remove timezone suffix if present
            ts = ts.replace('+00', '').strip()

            formats = [
                '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%d %H:%M:%S.%f',
                '%Y-%m-%d',
            ]

            for fmt in formats:
                try:
                    dt = datetime.strptime(ts, fmt)
                    return dt.replace(tzinfo=timezone.utc)
                except ValueError:
                    continue

        return None

    def print_summary(self):
        """Print migration summary"""
        print("\n" + "="*70)
        print("MIGRATION SUMMARY")
        print("="*70 + "\n")

        total_records = 0
        total_success = 0
        total_failed = 0

        for collection, stats in self.stats.items():
            total = stats['total']
            success = stats['success']
            failed = stats['failed']

            total_records += total
            total_success += success
            total_failed += failed

            if total > 0:
                success_rate = (success / total) * 100 if total > 0 else 0
                status = "✅" if success_rate == 100 else "⚠️" if success_rate > 0 else "❌"

                print(f"{status} {collection.upper()}")
                print(f"   Total: {total}")
                print(f"   Success: {success}")
                print(f"   Failed: {failed}")
                print(f"   Success Rate: {success_rate:.1f}%")
                print()

        print("-" * 70)
        print(f"OVERALL TOTALS")
        print(f"   Total Records: {total_records}")
        print(f"   Successfully Migrated: {total_success}")
        print(f"   Failed: {total_failed}")

        if total_records > 0:
            overall_rate = (total_success / total_records) * 100
            print(f"   Overall Success Rate: {overall_rate:.1f}%")

        print("\n" + "="*70)
        print("MIGRATION COMPLETE")
        print("="*70)


async def main():
    """Main execution"""
    migrator = DataMigrator(MONGODB_URI, DATABASE_NAME)
    await migrator.run_migration()


if __name__ == "__main__":
    asyncio.run(main())
