# OldData - Supabase Database Export

This folder contains tools to export your old Supabase database for migration to the new A64 Core Platform.

## 📁 Folder Structure

```
OldData/
├── export_supabase_api.py       # ✅ Export via REST API (RECOMMENDED)
├── export_supabase_to_json.py   # Export via PostgreSQL connection
├── export_supabase_to_sql.py    # Create SQL dump backup
├── json_exports/                # Output folder for JSON files
│   ├── {table_name}.json       # One file per table (36 tables)
│   └── export_metadata.json    # Export summary and stats
├── sql_dumps/                   # Output folder for SQL dumps
│   ├── supabase_backup_{timestamp}.sql
│   └── supabase_backup_{timestamp}_metadata.json
└── README.md                    # This file
```

## 🚀 Quick Start

### Option 1: JSON Export via REST API (Recommended) ✅

**Best for:** Data migration, inspection, and custom processing
**Status:** ✅ Successfully completed on 2025-11-17

```bash
# Install required Python package
pip install requests

# Run the export
python OldData/export_supabase_api.py
```

**Output:**
- One JSON file per table in `json_exports/`
- Easy to read and process with Python scripts
- Each file contains all rows from that table
- Metadata file with export summary

**Last Export Results:**
- ✅ 36 tables exported
- ✅ 50,008 total rows
- ✅ All exports successful
- 📁 Location: `OldData/json_exports/`

### Option 2: JSON Export via PostgreSQL (Alternative)

**Note:** This method requires direct PostgreSQL connection and may have DNS/networking issues.

```bash
# Install required Python package
pip install psycopg2-binary

# Run the export
python OldData/export_supabase_to_json.py
```

**Output:**
- One JSON file per table in `json_exports/`
- Direct database connection (faster for large datasets)
- Requires proper network configuration

### Option 2: SQL Dump (Backup)

**Best for:** Complete database backup in native PostgreSQL format

**Requirements:** PostgreSQL client tools must be installed
- **Windows:** Download from [postgresql.org](https://www.postgresql.org/download/windows/)
- **Linux:** `sudo apt-get install postgresql-client`

```bash
# Run the SQL dump
python OldData/export_supabase_to_sql.py
```

**Output:**
- Single `.sql` file with complete database dump
- Can be imported directly into another PostgreSQL database

## 📊 What Gets Exported?

Both scripts export:
- ✅ All user tables in the `public` schema
- ✅ All rows from each table
- ✅ Column names and data types
- ✅ Complete data with proper encoding

They do NOT export:
- ❌ System tables
- ❌ Supabase internal tables
- ❌ Database roles and permissions (SQL dump only)
- ❌ Database configuration

## 🔍 Understanding the Output

### JSON Export

Each table becomes a separate JSON file:

```json
// example_table.json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Example Item",
    "created_at": "2024-01-15T10:30:00",
    "data": { "key": "value" }
  },
  {
    "id": "223e4567-e89b-12d3-a456-426614174001",
    "name": "Another Item",
    "created_at": "2024-01-16T14:20:00",
    "data": { "key": "value2" }
  }
]
```

The `export_metadata.json` file contains:
- Export date and time
- Database connection details
- List of all tables exported
- Row counts for each table
- Column names for each table

### SQL Dump

A single `.sql` file containing:
- Table creation statements
- All data as INSERT statements
- Proper escaping and encoding
- Can be executed directly with `psql` or `pg_restore`

## 🔧 Configuration

### API-based Export (export_supabase_api.py) ✅

```python
PROJECT_URL = "https://gvnmcvxycrfnsftxzdct.supabase.co"
SERVICE_ROLE_KEY = "eyJhbG..."  # service_role JWT token
```

### PostgreSQL Direct Connection (export_supabase_to_json.py)

```python
config = {
    "host": "db.gvnmcvxycrfnsftxzdct.supabase.co",
    "port": 5432,
    "database": "postgres",
    "user": "postgres",
    "password": "6nOoOQpQcBAtfNtu"
}
```

⚠️ **Security Note:**
- These credentials are for your OLD Supabase database only
- The `OldData/` folder and its exports are excluded from git (see `.gitignore`)
- Never commit database credentials or exported data to version control

## 📝 Next Steps - Data Migration

After exporting your data:

1. **Inspect the JSON files** - Understand the old structure
2. **Map old structure to new** - Document how old tables map to new MongoDB collections
3. **Write migration scripts** - Create Python scripts to transform and import data
4. **Test with sample data** - Verify migration logic works correctly
5. **Full migration** - Import all data to new MongoDB database

Example migration workflow:

```python
# Example: Migrate users from old to new structure
import json

# Load old data
with open('OldData/json_exports/users.json') as f:
    old_users = json.load(f)

# Transform to new structure
new_users = []
for old_user in old_users:
    new_user = {
        "email": old_user["email"],
        "role": map_old_role(old_user["role_id"]),
        "created_at": old_user["created_at"],
        # ... map other fields
    }
    new_users.append(new_user)

# Insert into MongoDB
# (code to insert into your new database)
```

## 🐛 Troubleshooting

### "Connection failed" error

**Check:**
1. Are you connected to the internet?
2. Is the Supabase project still active?
3. Are the connection details correct?
4. Is your IP address allowed in Supabase settings?

### "pg_dump not found" (SQL export only)

**Solution:**
- Install PostgreSQL client tools
- Make sure `pg_dump` is in your system PATH
- Or use the JSON export instead (no dependencies)

### "Permission denied" errors

**Solution:**
- Check database user has read permissions
- Verify password is correct
- Try connecting with different user

### Very large database (> 1GB)

**Recommendations:**
- Use JSON export with table-by-table processing
- Export during off-peak hours
- Consider exporting specific tables individually
- Increase timeout in script if needed

## 📧 Support

If you encounter issues:
1. Check the error message carefully
2. Verify connection details in Supabase dashboard
3. Test connection with a PostgreSQL client (e.g., pgAdmin, DBeaver)
4. Check Supabase project logs

## 🔒 Security

⚠️ **Important:**
- Never commit database credentials to git
- `OldData/` folder is in `.gitignore`
- Delete exported data after successful migration
- Keep backups in a secure location

## 📅 Version

- Created: 2025-11-17
- Last Updated: 2025-11-17
- Database: Supabase PostgreSQL (Old Platform)
- Target: MongoDB (New A64 Core Platform)
