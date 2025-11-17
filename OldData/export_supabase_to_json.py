"""
Supabase Database Export Script - JSON Format
==============================================
This script exports all tables from a Supabase PostgreSQL database to JSON files.
Each table is exported to a separate JSON file for easy inspection and processing.

Usage:
    python export_supabase_to_json.py

Output:
    - json_exports/{table_name}.json for each table
    - json_exports/export_metadata.json with export details
"""

import psycopg2
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any
import sys
import os

# Fix Windows console encoding for emojis
if sys.platform == "win32":
    os.system("chcp 65001 > nul")
    sys.stdout.reconfigure(encoding='utf-8')


class SupabaseExporter:
    def __init__(self, host: str, port: int, database: str, user: str, password: str):
        """Initialize the exporter with database connection details."""
        self.host = host
        self.port = port
        self.database = database
        self.user = user
        self.password = password
        self.connection = None
        self.export_dir = Path(__file__).parent / "json_exports"
        self.export_dir.mkdir(exist_ok=True)

    def connect(self) -> bool:
        """Establish connection to the PostgreSQL database."""
        try:
            # Use connection string format to bypass DNS issues
            connection_string = f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"
            print(f"Connecting to {self.host}:{self.port}/{self.database}...")
            self.connection = psycopg2.connect(
                connection_string,
                connect_timeout=10
            )
            print("✅ Connected successfully!")
            return True
        except Exception as e:
            print(f"❌ Connection failed: {e}")
            return False

    def get_all_tables(self) -> List[str]:
        """Get list of all user tables (excluding system tables)."""
        query = """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """

        try:
            cursor = self.connection.cursor()
            cursor.execute(query)
            tables = [row[0] for row in cursor.fetchall()]
            cursor.close()
            print(f"\n📊 Found {len(tables)} tables:")
            for table in tables:
                print(f"   - {table}")
            return tables
        except Exception as e:
            print(f"❌ Error getting tables: {e}")
            return []

    def export_table_to_json(self, table_name: str) -> Dict[str, Any]:
        """Export a single table to JSON file."""
        try:
            cursor = self.connection.cursor()

            # Get column names
            cursor.execute(f"""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = '{table_name}'
                AND table_schema = 'public'
                ORDER BY ordinal_position;
            """)
            columns = [row[0] for row in cursor.fetchall()]

            # Get all rows
            cursor.execute(f'SELECT * FROM "{table_name}";')
            rows = cursor.fetchall()

            # Convert to list of dictionaries
            data = []
            for row in rows:
                row_dict = {}
                for i, column in enumerate(columns):
                    value = row[i]
                    # Handle datetime objects
                    if isinstance(value, datetime):
                        value = value.isoformat()
                    row_dict[column] = value
                data.append(row_dict)

            # Write to JSON file
            output_file = self.export_dir / f"{table_name}.json"
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False, default=str)

            cursor.close()

            print(f"✅ Exported {table_name}: {len(data)} rows → {output_file.name}")

            return {
                "table_name": table_name,
                "row_count": len(data),
                "columns": columns,
                "file": output_file.name
            }

        except Exception as e:
            print(f"❌ Error exporting {table_name}: {e}")
            return {
                "table_name": table_name,
                "error": str(e)
            }

    def export_all_tables(self) -> Dict[str, Any]:
        """Export all tables and create metadata file."""
        if not self.connection:
            print("❌ Not connected to database")
            return {}

        tables = self.get_all_tables()

        if not tables:
            print("❌ No tables found to export")
            return {}

        print(f"\n🚀 Starting export of {len(tables)} tables...\n")

        metadata = {
            "export_date": datetime.now().isoformat(),
            "database": {
                "host": self.host,
                "port": self.port,
                "database": self.database,
                "user": self.user
            },
            "tables": []
        }

        for table in tables:
            table_info = self.export_table_to_json(table)
            metadata["tables"].append(table_info)

        # Write metadata
        metadata_file = self.export_dir / "export_metadata.json"
        with open(metadata_file, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)

        print(f"\n✅ Export completed!")
        print(f"📁 Output directory: {self.export_dir}")
        print(f"📄 Metadata file: {metadata_file.name}")

        # Print summary
        total_rows = sum(t.get("row_count", 0) for t in metadata["tables"])
        successful = sum(1 for t in metadata["tables"] if "error" not in t)
        failed = len(metadata["tables"]) - successful

        print(f"\n📊 Summary:")
        print(f"   Total tables: {len(tables)}")
        print(f"   Successful: {successful}")
        print(f"   Failed: {failed}")
        print(f"   Total rows exported: {total_rows:,}")

        return metadata

    def close(self):
        """Close database connection."""
        if self.connection:
            self.connection.close()
            print("\n🔒 Connection closed")


def main():
    """Main execution function."""
    print("=" * 60)
    print("Supabase Database Export Tool - JSON Format")
    print("=" * 60)

    # Connection details
    config = {
        "host": "db.gvnmcvxycrfnsftxzdct.supabase.co",
        "port": 5432,
        "database": "postgres",
        "user": "postgres",
        "password": "6nOoOQpQcBAtfNtu"
    }

    # Create exporter instance
    exporter = SupabaseExporter(**config)

    # Connect to database
    if not exporter.connect():
        sys.exit(1)

    try:
        # Export all tables
        exporter.export_all_tables()
    except KeyboardInterrupt:
        print("\n\n⚠️  Export interrupted by user")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Always close connection
        exporter.close()

    print("\n" + "=" * 60)
    print("Export completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()
