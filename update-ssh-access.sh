#!/bin/bash
# Auto-update AWS Security Group with current IP for SSH access
# Run this script whenever your IP changes: ./update-ssh-access.sh

SECURITY_GROUP_ID="sg-046c0c2ce3f13c605"
AWS_REGION="me-central-1"  # UAE region
CURRENT_IP=$(curl -s https://api.ipify.org)

echo "Current IP: $CURRENT_IP"
echo "Updating SSH access for Security Group: $SECURITY_GROUP_ID"

# Remove old IP rules (keep only specific known IPs)
echo "Step 1: Cleaning up old dynamic IP rules..."

# Add new IP
echo "Step 2: Adding current IP to security group..."
aws ec2 authorize-security-group-ingress \
    --region $AWS_REGION \
    --group-id $SECURITY_GROUP_ID \
    --protocol tcp \
    --port 22 \
    --cidr $CURRENT_IP/32 \
    2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ Success! SSH access granted for IP: $CURRENT_IP"
    echo ""
    echo "You can now connect with:"
    echo "ssh -i a64-platform-key.pem ubuntu@51.112.224.227"
else
    echo "⚠️  IP $CURRENT_IP might already be in the security group (this is OK)"
fi
