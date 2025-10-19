# Uninstall example-app module

# Login
$body = @{
    email = 'admin@a64platform.com'
    password = 'SuperAdmin123!'
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri 'http://localhost/api/v1/auth/login' -Method POST -Body $body -ContentType 'application/json'
$token = $response.access_token

Write-Host "Logged in successfully"

# Uninstall module
$headers = @{
    Authorization = "Bearer $token"
}

try {
    $result = Invoke-RestMethod -Uri 'http://localhost/api/v1/modules/example-app' -Method DELETE -Headers $headers
    Write-Host "Module uninstalled successfully"
    $result | ConvertTo-Json
} catch {
    Write-Host "Error: $_"
}
