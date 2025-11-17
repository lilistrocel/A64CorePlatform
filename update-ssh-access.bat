@echo off
REM Auto-update AWS Security Group with current IP for SSH access
REM Run this script whenever your IP changes: update-ssh-access.bat

set SECURITY_GROUP_ID=sg-046c0c2ce3f13c605
set EC2_IP=51.112.224.227

echo Getting current IP address...
for /f %%i in ('curl -s https://api.ipify.org') do set CURRENT_IP=%%i

echo.
echo Current IP: %CURRENT_IP%
echo Security Group: %SECURITY_GROUP_ID%
echo.
echo Adding current IP to SSH security group...

aws ec2 authorize-security-group-ingress --group-id %SECURITY_GROUP_ID% --protocol tcp --port 22 --cidr %CURRENT_IP%/32 2>nul

if %errorlevel% equ 0 (
    echo.
    echo ✓ Success! SSH access granted for IP: %CURRENT_IP%
) else (
    echo.
    echo ! IP %CURRENT_IP% might already be in the security group (this is OK^)
)

echo.
echo You can now connect with:
echo ssh -i a64-platform-key.pem ubuntu@%EC2_IP%
echo.
pause
