import mysql.connector

conn = mysql.connector.connect(
    host='localhost',
    user='root',
    password='rootpassword',
    database='a64core_db'
)

cursor = conn.cursor()

# Delete existing admin if exists (including soft-deleted)
cursor.execute("DELETE FROM users WHERE email = 'admin@a64platform.com'")

# Insert new admin user
password_hash = '$2b$12$j4AZiWEcgDDcR6vJhpthGO96xummcyoITRYdHhUtY5jMCbFIC2P6y'
user_id = '0224a4f2-916d-4434-8f50-871fa9f65cd6'

cursor.execute("""
    INSERT INTO users
    (user_id, email, password_hash, first_name, last_name, role, is_active, is_email_verified)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
""", (user_id, 'admin@a64platform.com', password_hash, 'Admin', 'User', 'super_admin', 1, 1))

conn.commit()
print(f"✅ Created admin user: {user_id}")
print(f"   Email: admin@a64platform.com")
print(f"   Password: SuperAdmin123!")
print(f"   Role: super_admin")

cursor.close()
conn.close()
