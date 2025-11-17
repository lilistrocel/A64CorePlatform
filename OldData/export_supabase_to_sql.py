"""
Supabase Database Export Script - SQL Dump Format
==================================================
This script creates a SQL dump of your Supabase PostgreSQL database using pg_dump.
This is useful for creating a complete backup in native PostgreSQL format.

Requirements:
    - PostgreSQL client tools (pg_dump) must be installed
    - Windows: Download from https://www.postgresql.org/download/windows/
    - Linux: sudo apt-get install postgresql-client

Usage:
    python export_supabase_to_sql.py

Output:
    - sql_dumps/supabase_backup_{timestamp}.sql
"""

import subprocess
from datetime import datetime
from pathlib import Path
import sys
import platform
import os

# Fix Windows console encoding for emojis
if sys.platform == "win32":
    os.system("chcp 65001 > nul")
    sys.stdout.reconfigure(encoding='utf-8')


class SQLDumpExporter:
    def __init__(self, host: str, port: int, database: str, user: str, password: str):
        """Initialize the SQL dump exporter."""
        self.host = host
        self.port = port
        self.database = database
        self.user = user
        self.password = password
        self.export_dir = Path(__file__).parent / "sql_dumps"
        self.export_dir.mkdir(exist_ok=True)

    def check_pg_dump_installed(self) -> bool:
        """Check if pg_dump is installed and accessible."""
        try:
            result = subprocess.run(
                ["pg_dump", "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                print(f"✅ pg_dump found: {result.stdout.strip()}")
                return True
            else:
                print("❌ pg_dump is not working properly")
                return False
        except FileNotFoundError:
            print("❌ pg_dump is not installed or not in PATH")
            print("\n📥 Installation instructions:")
            if platform.system() == "Windows":
                print("   Windows: Download PostgreSQL from https://www.postgresql.org/download/windows/")
                print("   During installation, make sure to include 'Command Line Tools'")
            else:
                print("   Linux: sudo apt-get install postgresql-client")
                print("   macOS: brew install postgresql")
            return False
        except Exception as e:
            print(f"❌ Error checking pg_dump: {e}")
            return False

    def create_sql_dump(self) -> bool:
        """Create SQL dump of the database."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = self.export_dir / f"supabase_backup_{timestamp}.sql"

        print(f"\n🚀 Starting SQL dump export...")
        print(f"📁 Output file: {output_file}")

        # Build pg_dump command
        # Using connection string format for better cross-platform compatibility
        connection_string = f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"

        cmd = [
            "pg_dump",
            connection_string,
            "--file", str(output_file),
            "--verbose",
            "--no-owner",  # Don't include ownership commands
            "--no-privileges",  # Don't include privilege commands
            "--clean",  # Include commands to clean (drop) database objects
            "--if-exists",  # Use IF EXISTS when dropping objects
            "--format=plain"  # Plain SQL format (human-readable)
        ]

        try:
            print("\n⏳ Exporting database (this may take a while)...\n")

            # Run pg_dump
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )

            if result.returncode == 0:
                file_size = output_file.stat().st_size
                file_size_mb = file_size / (1024 * 1024)

                print(f"\n✅ SQL dump created successfully!")
                print(f"📄 File: {output_file.name}")
                print(f"💾 Size: {file_size_mb:.2f} MB ({file_size:,} bytes)")

                # Create metadata file
                metadata = {
                    "export_date": datetime.now().isoformat(),
                    "database": {
                        "host": self.host,
                        "port": self.port,
                        "database": self.database,
                        "user": self.user
                    },
                    "output_file": output_file.name,
                    "file_size_bytes": file_size,
                    "file_size_mb": round(file_size_mb, 2)
                }

                import json
                metadata_file = self.export_dir / f"supabase_backup_{timestamp}_metadata.json"
                with open(metadata_file, 'w', encoding='utf-8') as f:
                    json.dump(metadata, f, indent=2)

                print(f"📋 Metadata: {metadata_file.name}")
                return True
            else:
                print(f"❌ pg_dump failed with error code {result.returncode}")
                print(f"Error output: {result.stderr}")
                return False

        except subprocess.TimeoutExpired:
            print("❌ Export timed out (exceeded 5 minutes)")
            print("   Your database might be very large. Try using the JSON export instead.")
            return False
        except Exception as e:
            print(f"❌ Error during export: {e}")
            import traceback
            traceback.print_exc()
            return False

    def export(self) -> bool:
        """Main export function."""
        if not self.check_pg_dump_installed():
            return False

        return self.create_sql_dump()


def main():
    """Main execution function."""
    print("=" * 60)
    print("Supabase Database Export Tool - SQL Dump Format")
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
    exporter = SQLDumpExporter(**config)

    try:
        # Perform export
        success = exporter.export()

        if success:
            print("\n" + "=" * 60)
            print("✅ SQL Dump Export Completed Successfully!")
            print("=" * 60)
            sys.exit(0)
        else:
            print("\n" + "=" * 60)
            print("❌ SQL Dump Export Failed")
            print("=" * 60)
            print("\n💡 Tip: If pg_dump is not available, use export_supabase_to_json.py instead")
            sys.exit(1)

    except KeyboardInterrupt:
        print("\n\n⚠️  Export interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
