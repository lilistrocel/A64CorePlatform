$token = Get-Content token.txt
$headers = @{
    Authorization = "Bearer $token"
}

Write-Output "Testing: List installed modules"
$response = Invoke-RestMethod -Uri "http://localhost/api/v1/modules/installed" -Headers $headers -Method GET
$response | ConvertTo-Json -Depth 5
