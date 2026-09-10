const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[trimmed.slice(0, idx).trim()] = val;
    }
  }
});

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function test() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/';
  const res = await fetch(url, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
  console.log('Status:', res.status);
  const data = await res.json();
  const paths = Object.keys(data.paths || {}).map(p => p.replace('/', ''));
  console.log('Exposed REST tables/RPCs:', paths.filter(p => !p.startsWith('rpc/')));
}

test().catch(console.error);
