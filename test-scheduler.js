// Test script to verify scheduler works
const https = require('https');

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!serviceKey || !supabaseUrl) {
  console.error('Missing environment variables');
  process.exit(1);
}

const functionUrl = `${supabaseUrl}/functions/v1/resolve_due_matchups`;

console.log('Testing scheduler...');
console.log('Function URL:', functionUrl);

const options = {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json'
  }
};

const req = https.request(functionUrl, options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response status:', res.statusCode);
    console.log('Response body:', data);
    
    if (res.statusCode === 200) {
      console.log('✅ Scheduler test successful!');
    } else {
      console.log('❌ Scheduler test failed!');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error);
});

req.write('{}');
req.end();
