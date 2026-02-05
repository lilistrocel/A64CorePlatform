// Verify soft-deleted user data still exists in database
db = db.getSiblingDB("a64core_db");

var user = db.users.findOne({email: "softdelete131@test.com"});
if (user) {
    printjson({
        exists: true,
        userId: user.userId,
        email: user.email,
        firstName: user.firstName,
        isActive: user.isActive,
        deletedAt: user.deletedAt,
        hasDeletedAtTimestamp: user.deletedAt !== null && user.deletedAt !== undefined
    });
} else {
    printjson({exists: false, message: "User not found in database!"});
}
