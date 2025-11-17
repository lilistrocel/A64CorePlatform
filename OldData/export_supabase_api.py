"""
Supabase Database Export Script - REST API Method
==================================================
This script exports all tables from Supabase using the REST API instead of
direct PostgreSQL connection. This works when direct database connections
have network/DNS issues.

Requirements:
    pip install requests

Usage:
    python export_supabase_api.py

Output:
    - json_exports/{table_name}.json for each table
    - json_exports/export_metadata.json with export details
"""

import requests
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


class SupabaseAPIExporter:
    def __init__(self, project_url: str, service_role_key: str):
        """Initialize the API exporter with Supabase project details."""
        self.project_url = project_url.rstrip('/')
        self.service_role_key = service_role_key
        self.headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json"
        }
        self.export_dir = Path(__file__).parent / "json_exports"
        self.export_dir.mkdir(exist_ok=True)

    def test_connection(self) -> bool:
        """Test if we can connect to Supabase API."""
        try:
            print(f"Testing connection to {self.project_url}...")
            # Try to access the REST API
            response = requests.get(
                f"{self.project_url}/rest/v1/",
                headers=self.headers,
                timeout=10
            )

            if response.status_code in [200, 404]:  # 404 is OK, means API is responding
                print("✅ Connected successfully!")
                return True
            else:
                print(f"❌ Connection failed: HTTP {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Connection failed: {e}")
            return False

    def get_all_tables(self) -> List[str]:
        """Get list of all tables from Supabase."""
        try:
            print("\n🔍 Fetching table list...")

            # Use PostgREST introspection endpoint
            response = requests.get(
                f"{self.project_url}/rest/v1/",
                headers=self.headers,
                timeout=30
            )

            if response.status_code == 200:
                # Parse the OpenAPI schema to get table names
                schema = response.json()
                if 'definitions' in schema:
                    tables = list(schema['definitions'].keys())
                else:
                    print("⚠️  Could not auto-detect tables. Trying alternative method...")
                    tables = []
            else:
                print(f"⚠️  API returned HTTP {response.status_code}")
                print("Please provide table names manually.")
                return []

            print(f"\n📊 Found {len(tables)} tables:")
            for table in tables:
                print(f"   - {table}")

            return tables

        except Exception as e:
            print(f"❌ Error getting tables: {e}")
            print("\n💡 If auto-detection fails, you can manually specify table names.")
            return []

    def export_table_to_json(self, table_name: str) -> Dict[str, Any]:
        """Export a single table to JSON file using Supabase REST API."""
        try:
            all_data = []
            offset = 0
            limit = 1000  # Fetch 1000 rows at a time

            print(f"📥 Fetching {table_name}...", end="", flush=True)

            while True:
                # Fetch data with pagination
                response = requests.get(
                    f"{self.project_url}/rest/v1/{table_name}",
                    headers={
                        **self.headers,
                        "Range": f"{offset}-{offset + limit - 1}",
                        "Prefer": "count=exact"
                    },
                    timeout=60
                )

                if response.status_code != 200 and response.status_code != 206:
                    print(f" ❌ Failed (HTTP {response.status_code})")
                    return {
                        "table_name": table_name,
                        "error": f"HTTP {response.status_code}: {response.text[:200]}"
                    }

                data = response.json()

                if not data:
                    break

                all_data.extend(data)

                # Check if there's more data
                content_range = response.headers.get('Content-Range', '')
                if '/' in content_range:
                    _, total = content_range.split('/')
                    if total == '*' or offset + len(data) >= int(total):
                        break
                else:
                    if len(data) < limit:
                        break

                offset += limit
                print(".", end="", flush=True)

            # Write to JSON file
            output_file = self.export_dir / f"{table_name}.json"
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(all_data, f, indent=2, ensure_ascii=False, default=str)

            # Get column names from first row
            columns = list(all_data[0].keys()) if all_data else []

            print(f" ✅ {len(all_data)} rows → {output_file.name}")

            return {
                "table_name": table_name,
                "row_count": len(all_data),
                "columns": columns,
                "file": output_file.name
            }

        except Exception as e:
            print(f" ❌ Error: {e}")
            return {
                "table_name": table_name,
                "error": str(e)
            }

    def export_all_tables(self, table_names: List[str] = None) -> Dict[str, Any]:
        """Export all tables and create metadata file."""

        if table_names is None:
            tables = self.get_all_tables()
        else:
            tables = table_names
            print(f"\n📊 Using provided table list: {len(tables)} tables")
            for table in tables:
                print(f"   - {table}")

        if not tables:
            print("❌ No tables to export")
            print("\n💡 You can manually specify tables by editing the script:")
            print("   tables = ['table1', 'table2', 'table3']")
            return {}

        print(f"\n🚀 Starting export of {len(tables)} tables...\n")

        metadata = {
            "export_date": datetime.now().isoformat(),
            "export_method": "Supabase REST API",
            "project_url": self.project_url,
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


def main():
    """Main execution function."""
    print("=" * 60)
    print("Supabase Database Export Tool - REST API Method")
    print("=" * 60)

    # Supabase project credentials
    PROJECT_URL = "https://gvnmcvxycrfnsftxzdct.supabase.co"
    SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bm1jdnh5Y3JmbnNmdHh6ZGN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMTMyMTIyNywiZXhwIjoyMDQ2ODk3MjI3fQ.szOrRMokttws4lC8WVWi123uT-hizCtomEpKb5la3BI"

    # Create exporter instance
    exporter = SupabaseAPIExporter(PROJECT_URL, SERVICE_ROLE_KEY)

    # Test connection
    if not exporter.test_connection():
        print("\n❌ Failed to connect to Supabase API")
        print("\n💡 Troubleshooting:")
        print("   1. Check your project URL is correct")
        print("   2. Verify your service_role key is valid")
        print("   3. Make sure your Supabase project is active")
        sys.exit(1)

    try:
        # Export all tables
        # If auto-detection fails, manually specify tables:
        # tables = ['users', 'posts', 'comments']  # Your table names here
        # exporter.export_all_tables(table_names=tables)

        exporter.export_all_tables()

    except KeyboardInterrupt:
        print("\n\n⚠️  Export interrupted by user")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "=" * 60)
    print("Export completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()
