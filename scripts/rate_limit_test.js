const http = require("http");

const makeLoginRequest = (email, password) => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ email, password });
    const options = {
      hostname: "localhost",
      port: 8000,
      path: "/api/v1/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": data.length }
    };
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
};

const test = async () => {
  const email = "ratetest18@test.com";
  const wrongPass = "WrongPassword99@";
  const correctPass = "SecurePass123!";

  console.log("=== Clearing rate limit state ===");
  const clearRes = await makeLoginRequest(email, correctPass);
  console.log("Login with correct pass:", clearRes.status);

  await new Promise(r => setTimeout(r, 500));

  console.log("\n=== Making 5 wrong login attempts ===");
  for (let i = 1; i <= 5; i++) {
    const res = await makeLoginRequest(email, wrongPass);
    console.log("Attempt " + i + ": status=" + res.status + " body=" + res.body.substring(0, 120));
    await new Promise(r => setTimeout(r, 200));
  }

  console.log("\n=== 6th attempt (should be 429) ===");
  const res6 = await makeLoginRequest(email, wrongPass);
  console.log("Attempt 6: status=" + res6.status + " body=" + res6.body);
  console.log("Retry-After header:", res6.headers["retry-after"]);

  console.log("\n=== Correct password during lockout (should also be 429) ===");
  const resCorrect = await makeLoginRequest(email, correctPass);
  console.log("Correct pass during lockout: status=" + resCorrect.status + " body=" + resCorrect.body);
  console.log("Retry-After header:", resCorrect.headers["retry-after"]);
};

test().catch(console.error);
