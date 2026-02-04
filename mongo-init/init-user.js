// MongoDB Initialization Script
// Creates application-level user with readWrite access on a64core_db
// This script runs only on first container initialization (empty data volume)
//
// Environment variables (set via docker-compose):
//   MONGO_INITDB_ROOT_USERNAME - Root admin username
//   MONGO_INITDB_ROOT_PASSWORD - Root admin password
//   MONGO_INITDB_DATABASE      - Target database name

// Switch to the application database
db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || 'a64core_db');

// Create application user with readWrite role (least privilege)
db.createUser({
    user: process.env.MONGO_APP_USER || 'a64core_app',
    pwd: process.env.MONGO_APP_PASSWORD || 'changeme_in_production',
    roles: [
        {
            role: 'readWrite',
            db: process.env.MONGO_INITDB_DATABASE || 'a64core_db'
        }
    ]
});

print('MongoDB init: Application user created successfully');
