#!/usr/bin/env python3
"""
PostgreSQL to MongoDB Data Migration Script - V2 (Corrected)

FIXES from V1:
- block_standard -> blocks (BASE blocks only)
- farm_block -> plantings (growing cycles, NOT blocks)
- Proper linking of harvests to base blocks
- No duplicate block codes

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
        """Parse PostgreSQL INSERT statement and return list of row dictionaries."""
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


class DataMigrator:
    """Handles data migration from PostgreSQL dumps to MongoDB"""

    def __init__(self):
        self.client = None
        self.db = None
        self.mongodb_uri = MONGODB_URI
        self.database_name = DATABASE_NAME

        # ID mappings (old UUID -> new UUID)
        self.farm_id_map = {}  # old_ref -> new_farmId
        self.farm_name_map = {}  # farm_name -> new_farmId
        self.block_id_map = {}  # old_ref -> new_blockId
        self.block_code_map = {}  # block_code -> new_blockId
        self.plant_data_id_map = {}  # old_ref -> new_plantDataId
        self.plant_name_map = {}  # plant_name -> new_plantDataId
        self.customer_id_map = {}  # old_ref -> new_customerId

        # Statistics
        self.stats = {
            'farms': {'total': 0, 'success': 0, 'failed': 0},
            'blocks': {'total': 0, 'success': 0, 'failed': 0},
            'plantings': {'total': 0, 'success': 0, 'failed': 0},
            'plant_data': {'total': 0, 'success': 0, 'failed': 0},
            'harvests': {'total': 0, 'success': 0, 'failed': 0},
            'customers': {'total': 0, 'success': 0, 'failed': 0},
            'crop_prices': {'total': 0, 'success': 0, 'failed': 0},
            'block_archives': {'total': 0, 'success': 0, 'failed': 0},
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

    async def clear_migrated_data(self):
        """Clear all previously migrated data"""
        print("\n🗑️  Clearing previously migrated data...")
        collections = ['farms', 'blocks', 'plantings', 'plant_data', 'block_harvests',
                      'block_archives', 'customers', 'crop_prices']
        for coll in collections:
            result = await self.db[coll].delete_many({'_migrated': True})
            if result.deleted_count > 0:
                print(f"   Deleted {result.deleted_count} from {coll}")
        print("   ✅ Cleared migrated data")

    async def run_migration(self):
        """Execute complete migration"""
        try:
            await self.connect()
            await self.clear_migrated_data()

            print("\n" + "="*70)
            print("STARTING DATA MIGRATION V2 (Corrected)")
            print("="*70 + "\n")

            # Phase 1: Master data
            print("📦 PHASE 1: Master Data")
            print("-" * 70)
            await self.migrate_farms()
            await self.migrate_plant_data()
            await self.migrate_customers()

            # Phase 2: Blocks (from block_standard - BASE blocks only!)
            print("\n📦 PHASE 2: Base Blocks (from block_standard)")
            print("-" * 70)
            await self.migrate_blocks_from_standard()

            # Phase 3: Plantings (from farm_block - growing cycles)
            print("\n📦 PHASE 3: Plantings/Cycles (from farm_block)")
            print("-" * 70)
            await self.migrate_plantings()

            # Phase 4: Harvests and Archives
            print("\n📦 PHASE 4: Harvests and Archives")
            print("-" * 70)
            await self.migrate_harvests()
            await self.migrate_block_archives()

            # Phase 5: Operational data
            print("\n📦 PHASE 5: Operational Data")
            print("-" * 70)
            await self.migrate_crop_prices()

            # Phase 6: Create indexes
            print("\n📦 PHASE 6: Database Optimization")
            print("-" * 70)
            await self.create_indexes()

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

    def _parse_timestamp(self, ts_str: str) -> Optional[datetime]:
        """Parse PostgreSQL timestamp to Python datetime"""
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
                    return datetime.strptime(ts_str.replace('+00', '+0000'), fmt).replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
            return None
        except Exception:
            return None

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
            farm_name = row.get('Name', 'Unknown Farm')
            self.farm_name_map[farm_name] = new_uuid

            # Also handle slight name variations
            self.farm_name_map[farm_name.strip()] = new_uuid
            if 'Hydroponic' in farm_name:
                self.farm_name_map['New Hydroponic'] = new_uuid
                self.farm_name_map['New Hydroponics'] = new_uuid

            # Generate farm code from name
            farm_code = ''.join(w[0].upper() for w in farm_name.split()[:2]) + '-' + str(len(farms) + 1).zfill(2)

            farm = {
                'farmId': new_uuid,
                'farmCode': farm_code,
                'name': farm_name,
                'description': None,
                'owner': None,
                'location': None,
                'totalArea': 1,  # Will be updated from block_standard
                'areaUnit': 'hectares',
                'numberOfStaff': 0,
                'boundary': None,
                'managerId': MIGRATION_USER_ID,
                'managerEmail': MIGRATION_USER_EMAIL,
                'isActive': True,
                'createdAt': datetime.now(timezone.utc),
                'updatedAt': datetime.now(timezone.utc),
                '_migrated': True,
                '_oldRef': old_uuid
            }

            farms.append(farm)

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

            self.plant_data_id_map[old_uuid] = new_uuid
            plant_name = row.get('Item', 'Unknown')
            self.plant_name_map[plant_name] = new_uuid

            # Parse growth cycle days
            total_duration = int(row.get('TotalDurationday', 0) or 0)
            harvest_duration = int(row.get('HarvestDurationday', 0) or 0)
            sowing_duration = int(row.get('SowingDurationday', 0) or 0)

            # Parse yield data
            yield_per_drip = float(row.get('NetYieldPerDripkg', 0) or 0)

            plant = {
                'plantDataId': new_uuid,
                'plantName': plant_name,
                'scientificName': None,
                'plantType': 'Crop',
                'growthCycleDays': total_duration or 60,
                'minTemperatureCelsius': None,
                'maxTemperatureCelsius': None,
                'optimalPHMin': None,
                'optimalPHMax': None,
                'wateringFrequencyDays': None,
                'sunlightHoursDaily': None,
                'expectedYieldPerPlant': yield_per_drip,
                'yieldUnit': 'kg',
                'spacingCategory': 'm',
                'notes': f"Migrated from old system. Sowing: {sowing_duration}d, Harvest: {harvest_duration}d",
                'tags': [],
                'dataVersion': 1,
                'createdBy': MIGRATION_USER_ID,
                'createdByEmail': MIGRATION_USER_EMAIL,
                'createdAt': datetime.now(timezone.utc),
                'updatedAt': datetime.now(timezone.utc),
                '_migrated': True,
                '_oldRef': old_uuid,
                '_oldFertilizerData': row.get('PlanningFertilizer')
            }

            plants.append(plant)

        if plants:
            result = await self.db.plant_data.insert_many(plants)
            self.stats['plant_data']['success'] = len(result.inserted_ids)
            print(f"   ✅ Migrated {len(result.inserted_ids)} plant data records")

    async def migrate_customers(self):
        """Migrate client_details to customers collection"""
        print("\n👥 Migrating Customers...")

        rows = self.read_sql_file('client_details_rows.sql')
        self.stats['customers']['total'] = len(rows)

        if not rows:
            print("   No customers to migrate")
            return

        customers = []
        for i, row in enumerate(rows):
            old_uuid = row.get('ref')
            new_uuid = str(uuid4())

            self.customer_id_map[old_uuid] = new_uuid
            customer_name = row.get('clientname', 'Unknown')
            self.customer_id_map[customer_name] = new_uuid

            customer = {
                'customerId': new_uuid,
                'customerCode': f'C{str(i+1).zfill(3)}',
                'name': customer_name,
                'email': None,
                'phone': None,
                'address': None,
                'customerType': 'business',
                'status': 'active',
                'notes': 'Migrated from old system',
                'createdBy': MIGRATION_USER_ID,
                'createdAt': datetime.now(timezone.utc),
                'updatedAt': datetime.now(timezone.utc),
                '_migrated': True,
                '_oldRef': old_uuid
            }

            customers.append(customer)

        if customers:
            result = await self.db.customers.insert_many(customers)
            self.stats['customers']['success'] = len(result.inserted_ids)
            print(f"   ✅ Migrated {len(result.inserted_ids)} customers")

    # ============================================================================
    # PHASE 2: BLOCKS FROM BLOCK_STANDARD (BASE BLOCKS ONLY!)
    # ============================================================================

    async def migrate_blocks_from_standard(self):
        """Migrate block_standard to blocks collection - these are the PHYSICAL blocks"""
        print("\n📦 Migrating Base Blocks from block_standard...")

        rows = self.read_sql_file('block_standard_rows.sql')
        self.stats['blocks']['total'] = len(rows)

        if not rows:
            print("   No blocks to migrate")
            return

        blocks = []
        seen_codes = set()  # Track unique block codes

        for row in rows:
            old_uuid = row.get('ref')
            block_code = row.get('BlockID', '')
            farm_name = row.get('farm', '')

            # Skip duplicates (same block code)
            if block_code in seen_codes:
                print(f"   ⚠️  Skipping duplicate block: {block_code}")
                continue
            seen_codes.add(block_code)

            # Find farm
            new_farm_id = self.farm_name_map.get(farm_name)
            if not new_farm_id:
                # Try variations
                new_farm_id = self.farm_name_map.get(farm_name.strip())

            if not new_farm_id:
                print(f"   ⚠️  Skipping block {block_code} - farm '{farm_name}' not found")
                self.stats['blocks']['failed'] += 1
                continue

            new_uuid = str(uuid4())
            self.block_id_map[old_uuid] = new_uuid
            self.block_code_map[block_code] = new_uuid

            # Parse area and drips
            area = float(row.get('Area', 0) or 0)
            drips = int(row.get('TotalDrips', 0) or 0)
            block_type = row.get('type', 'Open Field')

            # Map block type
            type_map = {
                'Open Field': 'openfield',
                'Green House': 'greenhouse',
                'Net House': 'nethouse',
                'Hydroponic': 'hydroponic'
            }
            mapped_type = type_map.get(block_type, 'openfield')

            block = {
                'blockId': new_uuid,
                'farmId': new_farm_id,
                'blockCode': block_code,
                'name': block_code,
                'blockType': mapped_type,
                'state': 'empty',
                'maxPlants': drips if drips > 0 else 100,
                'area': area if area > 0 else 1,
                'areaUnit': 'sqm',
                'isActive': True,
                'createdAt': datetime.now(timezone.utc),
                'updatedAt': datetime.now(timezone.utc),
                '_migrated': True,
                '_oldRef': old_uuid,
                '_sourceTable': 'block_standard'
            }

            blocks.append(block)

        if blocks:
            # Insert in batches
            batch_size = 100
            for i in range(0, len(blocks), batch_size):
                batch = blocks[i:i+batch_size]
                result = await self.db.blocks.insert_many(batch)
                self.stats['blocks']['success'] += len(result.inserted_ids)
                print(f"   ✅ Migrated batch {i//batch_size + 1}: {len(result.inserted_ids)} blocks")

            print(f"   ✅ Total migrated: {self.stats['blocks']['success']} base blocks")

    # ============================================================================
    # PHASE 3: PLANTINGS FROM FARM_BLOCK (GROWING CYCLES)
    # ============================================================================

    async def migrate_plantings(self):
        """Migrate farm_block to plantings collection - these are GROWING CYCLES, not blocks!"""
        print("\n🌾 Migrating Plantings/Cycles from farm_block...")

        rows = self.read_sql_file('farm_block_rows.sql')
        self.stats['plantings']['total'] = len(rows)

        if not rows:
            print("   No plantings to migrate")
            return

        plantings = []

        for row in rows:
            old_uuid = row.get('ref')
            full_block_id = row.get('block_id', '')  # e.g., A-21-002
            farm_name = row.get('farm_name', '')
            crop_name = row.get('Item', '')
            season = row.get('plannedseason', '')

            # Extract base block code (remove season suffix)
            # A-21-002 -> A-21, NH-01-306 -> NH-01
            parts = full_block_id.rsplit('-', 1)
            if len(parts) == 2 and parts[1].isdigit():
                base_block_code = parts[0]
                cycle_number = parts[1]
            else:
                base_block_code = full_block_id
                cycle_number = season or '1'

            # Find the base block
            new_block_id = self.block_code_map.get(base_block_code)

            if not new_block_id:
                # Block doesn't exist - might need to create it
                # This happens if block_standard didn't have this block
                print(f"   ⚠️  Creating missing block: {base_block_code}")
                new_block_id = str(uuid4())

                # Find farm
                new_farm_id = self.farm_name_map.get(farm_name)
                if not new_farm_id:
                    self.stats['plantings']['failed'] += 1
                    continue

                # Create the block
                new_block = {
                    'blockId': new_block_id,
                    'farmId': new_farm_id,
                    'blockCode': base_block_code,
                    'name': base_block_code,
                    'blockType': 'openfield',
                    'state': 'empty',
                    'maxPlants': int(row.get('drips', 100) or 100),
                    'area': 1,
                    'areaUnit': 'sqm',
                    'isActive': True,
                    'createdAt': datetime.now(timezone.utc),
                    'updatedAt': datetime.now(timezone.utc),
                    '_migrated': True,
                    '_createdFromFarmBlock': True
                }
                await self.db.blocks.insert_one(new_block)
                self.block_code_map[base_block_code] = new_block_id
                self.stats['blocks']['success'] += 1

            # Find farm
            new_farm_id = self.farm_name_map.get(farm_name)
            if not new_farm_id:
                self.stats['plantings']['failed'] += 1
                continue

            # Find plant
            new_plant_id = self.plant_name_map.get(crop_name)

            # Parse dates
            planted_date = self._parse_timestamp(row.get('time_start'))
            expected_harvest = self._parse_timestamp(row.get('time_finish'))

            # Map state
            state = row.get('state', 'Planted')
            state_map = {
                'Planted': 'growing',
                'Growing': 'growing',
                'Harvesting': 'harvesting',
                'Cleaned': 'completed',
                'Empty': 'completed'
            }
            planting_status = state_map.get(state, 'growing')

            planting = {
                'plantingId': str(uuid4()),
                'blockId': new_block_id,
                'farmId': new_farm_id,
                'plantDataId': new_plant_id,
                'cropName': crop_name,
                'cycleNumber': int(cycle_number) if cycle_number.isdigit() else 1,
                'originalBlockId': full_block_id,  # Keep original for reference
                'plantedDate': planted_date,
                'expectedHarvestDate': expected_harvest,
                'status': planting_status,
                'numberOfPlants': int(row.get('drips', 0) or 0),
                'notes': f"Season {season}. Migrated from old system.",
                'createdBy': MIGRATION_USER_ID,
                'createdAt': planted_date or datetime.now(timezone.utc),
                'updatedAt': datetime.now(timezone.utc),
                '_migrated': True,
                '_oldRef': old_uuid,
                '_oldInventoryData': row.get('InventoryData')
            }

            plantings.append(planting)

            # Update block state if this is an active planting
            if planting_status in ['growing', 'harvesting']:
                await self.db.blocks.update_one(
                    {'blockId': new_block_id},
                    {'$set': {'state': 'growing', 'targetCropName': crop_name}}
                )

        # Create plantings collection if needed and insert
        if plantings:
            batch_size = 100
            for i in range(0, len(plantings), batch_size):
                batch = plantings[i:i+batch_size]
                result = await self.db.plantings.insert_many(batch)
                self.stats['plantings']['success'] += len(result.inserted_ids)
                print(f"   ✅ Migrated batch {i//batch_size + 1}: {len(result.inserted_ids)} plantings")

            print(f"   ✅ Total migrated: {self.stats['plantings']['success']} plantings")

    # ============================================================================
    # PHASE 4: HARVESTS AND ARCHIVES
    # ============================================================================

    async def migrate_harvests(self):
        """Migrate harvest_reports to block_harvests collection"""
        print("\n🌾 Migrating Harvests...")

        rows = self.read_sql_file('harvest_reports_rows.sql')
        self.stats['harvests']['total'] = len(rows)

        if not rows:
            print("   No harvests to migrate")
            return

        harvests = []

        for row in rows:
            old_uuid = row.get('ref')

            # Get base block code from harvest (this is the correct base block!)
            block_code = row.get('block_id', '')  # e.g., LW-07, A-38
            farm_name = row.get('farm', '')

            # Find block by code
            new_block_id = self.block_code_map.get(block_code)

            if not new_block_id:
                # Try to find or create block
                new_farm_id = self.farm_name_map.get(farm_name)
                if not new_farm_id:
                    self.stats['harvests']['failed'] += 1
                    continue

                # Create block
                new_block_id = str(uuid4())
                new_block = {
                    'blockId': new_block_id,
                    'farmId': new_farm_id,
                    'blockCode': block_code,
                    'name': block_code,
                    'blockType': 'openfield',
                    'state': 'empty',
                    'maxPlants': 100,
                    'area': 1,
                    'areaUnit': 'sqm',
                    'isActive': True,
                    'createdAt': datetime.now(timezone.utc),
                    'updatedAt': datetime.now(timezone.utc),
                    '_migrated': True,
                    '_createdFromHarvest': True
                }
                await self.db.blocks.insert_one(new_block)
                self.block_code_map[block_code] = new_block_id

            # Get farm ID
            new_farm_id = self.farm_name_map.get(farm_name)
            if not new_farm_id:
                self.stats['harvests']['failed'] += 1
                continue

            # Parse data
            harvest_date = self._parse_timestamp(row.get('time'))
            quantity = float(row.get('Quantity', 0) or 0)

            # Map grade
            old_grade = row.get('grade')
            grade_map = {'A': 'A', 'B': 'B', 'C': 'C', None: 'B'}
            quality_grade = grade_map.get(old_grade, 'B')

            harvest = {
                'harvestId': str(uuid4()),
                'blockId': new_block_id,
                'farmId': new_farm_id,
                'plantingId': None,
                'harvestDate': harvest_date or datetime.now(timezone.utc),
                'amount': quantity,
                'unit': 'kg',
                'qualityGrade': quality_grade,
                'cropName': row.get('crop', ''),
                'harvestedBy': MIGRATION_USER_ID,
                'harvestedByEmail': row.get('reporter_user', MIGRATION_USER_EMAIL),
                'notes': f"Season {row.get('harvestSeason', '')}. Migrated from old system.",
                'createdAt': harvest_date or datetime.now(timezone.utc),
                '_migrated': True,
                '_oldRef': old_uuid
            }

            harvests.append(harvest)

        # Insert in batches
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
            print("   No archives to migrate")
            return

        archives = []

        for row in rows:
            old_uuid = row.get('ref')

            # Get base block code
            block_code = row.get('block_id', '')
            farm_name = row.get('farm_id', '')  # This is actually farm NAME in this table
            crop_name = row.get('crop_id', '')  # This is actually crop NAME

            # Find farm
            new_farm_id = self.farm_name_map.get(farm_name)
            if not new_farm_id:
                self.stats['block_archives']['failed'] += 1
                continue

            # Find or get block
            new_block_id = self.block_code_map.get(block_code)
            if not new_block_id:
                new_block_id = str(uuid4())  # Placeholder

            # Find plant
            new_plant_id = self.plant_name_map.get(crop_name)

            # Parse dates
            planted_date = self._parse_timestamp(row.get('time_start'))
            harvest_date = self._parse_timestamp(row.get('time_finish'))
            cleaned_date = self._parse_timestamp(row.get('time_cleaned'))

            # Parse yields
            net_yield = float(row.get('net_yield', 0) or 0)
            predicted_yield = float(row.get('predicted_yield', 0) or 0)

            archive = {
                'archiveId': str(uuid4()),
                'blockId': new_block_id,
                'farmId': new_farm_id,
                'plantDataId': new_plant_id,
                'cropName': crop_name,
                'blockCode': block_code,
                'plantedDate': planted_date,
                'harvestStartDate': harvest_date,
                'harvestEndDate': cleaned_date,
                'predictedYield': {'amount': predicted_yield, 'unit': 'kg'},
                'actualYield': {'amount': net_yield, 'unit': 'kg'},
                'createdAt': datetime.now(timezone.utc),
                '_migrated': True,
                '_oldRef': old_uuid
            }

            archives.append(archive)

        if archives:
            batch_size = 200
            for i in range(0, len(archives), batch_size):
                batch = archives[i:i+batch_size]
                result = await self.db.block_archives.insert_many(batch)
                self.stats['block_archives']['success'] += len(result.inserted_ids)
                print(f"   ✅ Migrated batch {i//batch_size + 1}: {len(result.inserted_ids)} archives")

            print(f"   ✅ Total migrated: {self.stats['block_archives']['success']} archives")

    # ============================================================================
    # PHASE 5: OPERATIONAL DATA
    # ============================================================================

    async def migrate_crop_prices(self):
        """Migrate crop_price to crop_prices collection"""
        print("\n💰 Migrating Crop Prices...")

        rows = self.read_sql_file('crop_price_rows.sql')
        self.stats['crop_prices']['total'] = len(rows)

        if not rows:
            print("   No prices to migrate")
            return

        prices = []

        for row in rows:
            old_uuid = row.get('ref')

            # Parse date
            price_date = self._parse_timestamp(row.get('date'))

            # Get references
            customer_name = row.get('customer', '')
            farm_name = row.get('farm', '')

            customer_id = self.customer_id_map.get(customer_name)
            farm_id = self.farm_name_map.get(farm_name)

            # Parse values
            quantity = float(row.get('quantity', 0) or 0)
            price_unit = float(row.get('price_unit', 0) or 0)
            price_total = float(row.get('price_total', 0) or 0)

            price = {
                'priceId': str(uuid4()),
                'date': price_date or datetime.now(timezone.utc),
                'customerId': customer_id,
                'customerName': customer_name,
                'farmId': farm_id,
                'farmName': farm_name,
                'crop': row.get('crop', ''),
                'grade': row.get('grade', 'B'),
                'quantity': quantity,
                'unit': 'kg',
                'pricePerUnit': price_unit,
                'totalPrice': price_total,
                'currency': 'AED',
                'createdBy': MIGRATION_USER_ID,
                'createdAt': datetime.now(timezone.utc),
                '_migrated': True,
                '_oldRef': old_uuid
            }

            prices.append(price)

        if prices:
            batch_size = 500
            for i in range(0, len(prices), batch_size):
                batch = prices[i:i+batch_size]
                result = await self.db.crop_prices.insert_many(batch)
                self.stats['crop_prices']['success'] += len(result.inserted_ids)
                print(f"   ✅ Migrated batch {i//batch_size + 1}: {len(result.inserted_ids)} prices")

            print(f"   ✅ Total migrated: {self.stats['crop_prices']['success']} crop prices")

    # ============================================================================
    # PHASE 6: INDEXES
    # ============================================================================

    async def create_indexes(self):
        """Create indexes for performance"""
        print("\n🔧 Creating Indexes...")

        indexes_created = 0

        # Farms
        try:
            await self.db.farms.create_index('farmId', unique=True)
            await self.db.farms.create_index('name')
            indexes_created += 2
            print("   ✅ Created indexes on farms")
        except Exception as e:
            print(f"   ⚠️  Error on farms indexes: {e}")

        # Blocks
        try:
            await self.db.blocks.create_index('blockId', unique=True)
            await self.db.blocks.create_index('farmId')
            await self.db.blocks.create_index('blockCode')
            indexes_created += 3
            print("   ✅ Created indexes on blocks")
        except Exception as e:
            print(f"   ⚠️  Error on blocks indexes: {e}")

        # Plantings
        try:
            await self.db.plantings.create_index('plantingId', unique=True)
            await self.db.plantings.create_index('blockId')
            await self.db.plantings.create_index('farmId')
            indexes_created += 3
            print("   ✅ Created indexes on plantings")
        except Exception as e:
            print(f"   ⚠️  Error on plantings indexes: {e}")

        # Harvests
        try:
            await self.db.block_harvests.create_index('harvestId', unique=True)
            await self.db.block_harvests.create_index('blockId')
            await self.db.block_harvests.create_index('farmId')
            indexes_created += 3
            print("   ✅ Created indexes on block_harvests")
        except Exception as e:
            print(f"   ⚠️  Error on harvests indexes: {e}")

        # Crop prices
        try:
            await self.db.crop_prices.create_index('priceId', unique=True)
            await self.db.crop_prices.create_index('date')
            await self.db.crop_prices.create_index('crop')
            indexes_created += 3
            print("   ✅ Created indexes on crop_prices")
        except Exception as e:
            print(f"   ⚠️  Error on crop_prices indexes: {e}")

        print(f"\n   ✅ Total indexes created: {indexes_created}")

    def print_summary(self):
        """Print migration summary"""
        print("\n" + "="*70)
        print("MIGRATION SUMMARY V2")
        print("="*70 + "\n")

        total_records = 0
        total_success = 0
        total_failed = 0

        for category, stats in self.stats.items():
            total = stats['total']
            success = stats['success']
            failed = stats['failed']

            total_records += total
            total_success += success
            total_failed += failed

            if total > 0:
                rate = (success / total) * 100
                status = "✅" if rate >= 90 else ("⚠️" if rate >= 50 else "❌")
                print(f"{status} {category.upper()}")
                print(f"   Total: {total}")
                print(f"   Success: {success}")
                print(f"   Failed: {failed}")
                print(f"   Success Rate: {rate:.1f}%")
                print()

        print("-" * 70)
        print("OVERALL TOTALS")
        print(f"   Total Records: {total_records}")
        print(f"   Successfully Migrated: {total_success}")
        print(f"   Failed: {total_failed}")
        if total_records > 0:
            print(f"   Overall Success Rate: {(total_success/total_records)*100:.1f}%")

        print("\n" + "="*70)
        print("MIGRATION COMPLETE")
        print("="*70)


async def main():
    migrator = DataMigrator()
    await migrator.run_migration()


if __name__ == "__main__":
    asyncio.run(main())
