$loginBody = @{
    email = "admin@a64platform.com"
    password = "SuperAdmin123!"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost/api/v1/auth/login" -Method POST -Body $loginBody -ContentType "application/json"

$token = $response.data.accessToken
$token | Out-File -FilePath "token.txt" -NoNewline

Write-Output "Token saved to token.txt"
Write-Output $response | ConvertTo-Json -Depth 5
