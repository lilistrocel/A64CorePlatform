const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/login_response.json', 'utf8'));
// Token might be at d.access_token or d.data.access_token
const token = d.access_token || (d.data && d.data.access_token) || 'FAILED';
fs.writeFileSync('/tmp/admin_token.txt', token);
console.log('Token length: ' + token.length);
