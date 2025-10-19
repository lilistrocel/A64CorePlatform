#!/usr/bin/env python3
"""
Create Super Admin User

This script creates the initial super admin user for the A64 Core Platform.
Run this script ONCE during initial setup.

Usage:
    python scripts/create_superadmin.py

The script will prompt for email and password, or use environment variables:
    SUPERADMIN_EMAIL=admin@example.com
    SUPERADMIN_PASSWORD=SecurePass123!
"""

import asyncio
import sys
import os
from pathlib import Path
from getpass import getpass
from datetime import datetime
import uuid

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.utils.security import hash_password
from src.services.database import mongodb
from src.models.user import UserRole


async def create_superadmin():
    """Create super admin user"""
    print("=" * 60)
    print("A64 Core Platform - Create Super Admin User")
    print("=" * 60)
    print()

    # Get credentials from environment or prompt
    email = os.getenv("SUPERADMIN_EMAIL")
    password = os.getenv("SUPERADMIN_PASSWORD")

    if not email:
        email = input("Enter super admin email: ").strip()
        if not email:
            print("Error: Email is required")
            return False

    if not password:
        password = getpass("Enter super admin password: ").strip()
        confirm_password = getpass("Confirm password: ").strip()

        if password != confirm_password:
            print("Error: Passwords do not match")
            return False

        if len(password) < 8:
            print("Error: Password must be at least 8 characters")
            return False

    # Connect to database
    try:
        db = mongodb.get_database()
        print(f"\nConnected to MongoDB: {db.name}")
    except Exception as e:
        print(f"Error: Failed to connect to database: {e}")
        return False

    # Check if super admin already exists
    existing_superadmin = await db.users.find_one({"role": UserRole.SUPER_ADMIN.value})
    if existing_superadmin:
        print(f"\nWarning: Super admin already exists!")
        print(f"Email: {existing_superadmin.get('email')}")
        print(f"User ID: {existing_superadmin.get('userId')}")
        print(f"Created: {existing_superadmin.get('createdAt')}")
        print()

        overwrite = input("Do you want to create another super admin? (yes/no): ").strip().lower()
        if overwrite not in ['yes', 'y']:
            print("Operation cancelled.")
            return False

    # Check if email already exists
    existing_user = await db.users.find_one({"email": email})
    if existing_user:
        print(f"\nError: User with email '{email}' already exists")
        print(f"User ID: {existing_user.get('userId')}")
        print(f"Role: {existing_user.get('role')}")
        print()

        if existing_user.get('role') != UserRole.SUPER_ADMIN.value:
            upgrade = input("Do you want to upgrade this user to super admin? (yes/no): ").strip().lower()
            if upgrade in ['yes', 'y']:
                result = await db.users.update_one(
                    {"userId": existing_user.get('userId')},
                    {
                        "$set": {
                            "role": UserRole.SUPER_ADMIN.value,
                            "isActive": True,
                            "updatedAt": datetime.utcnow()
                        }
                    }
                )
                if result.modified_count > 0:
                    print(f"\n✓ User upgraded to super admin successfully!")
                    print(f"  Email: {email}")
                    print(f"  User ID: {existing_user.get('userId')}")
                    return True
                else:
                    print("\nError: Failed to upgrade user")
                    return False
            else:
                print("Operation cancelled.")
                return False
        else:
            print("User is already a super admin.")
            return False

    # Generate user ID
    user_id = str(uuid.uuid4())

    # Hash password
    print("\nHashing password...")
    password_hash = hash_password(password)

    # Create user document
    user_doc = {
        "userId": user_id,
        "email": email,
        "passwordHash": password_hash,
        "firstName": "Super",
        "lastName": "Admin",
        "role": UserRole.SUPER_ADMIN.value,
        "isActive": True,
        "isEmailVerified": True,  # Super admin is pre-verified
        "phone": None,
        "avatar": None,
        "timezone": None,
        "locale": None,
        "lastLoginAt": None,
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
        "deletedAt": None,
        "metadata": {
            "createdBy": "setup_script",
            "setupDate": datetime.utcnow().isoformat()
        }
    }

    # Insert into database
    try:
        result = await db.users.insert_one(user_doc)
        print(f"\n{'=' * 60}")
        print("✓ Super admin user created successfully!")
        print(f"{'=' * 60}")
        print(f"\nUser Details:")
        print(f"  Email: {email}")
        print(f"  User ID: {user_id}")
        print(f"  Role: super_admin")
        print(f"  Created: {user_doc['createdAt'].strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print()
        print("IMPORTANT:")
        print("  - Keep these credentials secure")
        print("  - Change the password after first login")
        print("  - This account has full system access")
        print()
        return True
    except Exception as e:
        print(f"\nError: Failed to create super admin: {e}")
        return False


async def main():
    """Main entry point"""
    success = await create_superadmin()

    # Close database connection
    mongodb.close()

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    asyncio.run(main())
