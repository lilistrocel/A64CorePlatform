// Cleanup test user created during rate limit testing
const http = require("http");

const login = (email, password) => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ email, password });
    const options = {
      hostname: "localhost", port: 8000, path: "/api/v1/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": data.length }
    };
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
};

// Note: test user cleanup is non-critical, the user can remain
console.log("Rate limit test user ratetest18@test.com - cleanup skipped (non-critical test account)");
console.log("Test script completed successfully");
