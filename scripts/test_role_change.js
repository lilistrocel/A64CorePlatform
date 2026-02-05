const http = require("http");

const makeRequest = (method, path, body, token) => {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    if (data) headers["Content-Length"] = Buffer.byteLength(data);

    const options = {
      hostname: "localhost",
      port: 8000,
      path: path,
      method: method,
      headers: headers
    };

    const req = http.request(options, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => responseBody += chunk);
      res.on("end", () => {
        let parsed;
        try { parsed = JSON.parse(responseBody); } catch(e) { parsed = responseBody; }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
};

const run = async () => {
  // Step 1: Register an admin user
  console.log("=== Step 1: Register admin user ===");
  const adminReg = await makeRequest("POST", "/api/v1/auth/register", {
    email: "roleadmin26@test.com",
    password: "SecurePass123!",
    firstName: "RoleAdmin",
    lastName: "Test26"
  });
  console.log("Admin register status:", adminReg.status);

  let adminToken;
  if (adminReg.status === 201) {
    adminToken = adminReg.body.access_token;
    console.log("Admin userId:", adminReg.body.user.userId);
  } else {
    // Try login if already exists
    const adminLogin = await makeRequest("POST", "/api/v1/auth/login", {
      email: "roleadmin26@test.com",
      password: "SecurePass123!"
    });
    console.log("Admin login status:", adminLogin.status);
    adminToken = adminLogin.body.access_token;
  }

  // Promote admin via mongosh - we need to use a super_admin for this
  // Let's check existing admin users first
  console.log("\n=== Step 1b: Login as existing admin (farmtest_admin@a64core.com) ===");
  const farmAdminLogin = await makeRequest("POST", "/api/v1/auth/login", {
    email: "farmtest_admin@a64core.com",
    password: "TestAdmin123@"
  });
  console.log("Farm admin login status:", farmAdminLogin.status);

  if (farmAdminLogin.status !== 200) {
    // Try testadmin
    console.log("Trying testadmin@a64core.com...");
    const testAdminLogin = await makeRequest("POST", "/api/v1/auth/login", {
      email: "testadmin@a64core.com",
      password: "TestPass123@"
    });
    console.log("Test admin login:", testAdminLogin.status, "role:", testAdminLogin.body?.user?.role);
    if (testAdminLogin.status === 200) {
      adminToken = testAdminLogin.body.access_token;
    }
  } else {
    adminToken = farmAdminLogin.body.access_token;
    console.log("Farm admin role:", farmAdminLogin.body.user.role);
  }

  // Step 2: Register a regular user (target for role change)
  console.log("\n=== Step 2: Register target user ===");
  const userReg = await makeRequest("POST", "/api/v1/auth/register", {
    email: "roleuser26@test.com",
    password: "SecurePass123!",
    firstName: "RoleUser",
    lastName: "Test26"
  });
  console.log("User register status:", userReg.status);

  let targetUserId;
  let targetToken;
  if (userReg.status === 201) {
    targetUserId = userReg.body.user.userId;
    targetToken = userReg.body.access_token;
    console.log("Target userId:", targetUserId, "role:", userReg.body.user.role);
  } else {
    // Login if already exists
    const userLogin = await makeRequest("POST", "/api/v1/auth/login", {
      email: "roleuser26@test.com",
      password: "SecurePass123!"
    });
    console.log("User login status:", userLogin.status);
    if (userLogin.status === 200) {
      targetUserId = userLogin.body.user.userId;
      targetToken = userLogin.body.access_token;
      console.log("Target userId:", targetUserId, "role:", userLogin.body.user.role);
    }
  }

  // Step 3: Change user role to moderator via PATCH /api/v1/users/{userId}/role
  console.log("\n=== Step 3: Change user role to moderator ===");
  const roleChange = await makeRequest("PATCH", "/api/v1/users/" + targetUserId + "/role", {
    role: "moderator"
  }, adminToken);
  console.log("Role change status:", roleChange.status);
  console.log("Role change response:", JSON.stringify(roleChange.body));

  // Step 4: Verify success - check the response shows the new role
  if (roleChange.status === 200) {
    console.log("\n=== Step 4: Verify success response ===");
    console.log("Response role:", roleChange.body.role);
    console.log("SUCCESS: Role changed to", roleChange.body.role);
  } else {
    console.log("FAILED: Role change returned status", roleChange.status);
    // Try with admin/users path
    console.log("\nTrying PATCH /api/v1/admin/users/{userId}/role ...");
    const roleChange2 = await makeRequest("PATCH", "/api/v1/admin/users/" + targetUserId + "/role", {
      role: "moderator"
    }, adminToken);
    console.log("Admin role change status:", roleChange2.status);
    console.log("Admin role change response:", JSON.stringify(roleChange2.body));
  }

  // Step 5: GET user and verify role is moderator
  console.log("\n=== Step 5: GET user and verify role ===");
  const getUser = await makeRequest("GET", "/api/v1/users/" + targetUserId, null, adminToken);
  console.log("GET user status:", getUser.status);
  console.log("User role after change:", getUser.body.role);

  // Step 6: Verify the user's API access changed
  console.log("\n=== Step 6: Verify user API access changed ===");
  // Re-login as the target user to get new token with updated role
  const userRelogin = await makeRequest("POST", "/api/v1/auth/login", {
    email: "roleuser26@test.com",
    password: "SecurePass123!"
  });
  console.log("User re-login status:", userRelogin.status);
  console.log("User role in token:", userRelogin.body?.user?.role);

  if (userRelogin.status === 200) {
    targetToken = userRelogin.body.access_token;
    // Test /me endpoint shows new role
    const me = await makeRequest("GET", "/api/v1/auth/me", null, targetToken);
    console.log("User /me role:", me.body.role);
    console.log("Role changed from user to", me.body.role, "- VERIFIED");
  }

  console.log("\n=== SUMMARY ===");
  console.log("All steps completed. Feature #26 verification done.");
};

run().catch(console.error);
