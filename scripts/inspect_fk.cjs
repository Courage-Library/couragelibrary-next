const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[trimmed.slice(0, idx).trim()] = val;
      }
    }
  });
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function inspectDb() {
  // Check exams
  const examsRes = await fetch(`${supabaseUrl}/rest/v1/exams?select=id,name,slug&limit=2`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
  });
  console.log('Exams:', await examsRes.json());

  // Check test_attempts
  const attemptsRes = await fetch(`${supabaseUrl}/rest/v1/test_attempts?select=id,user_id,mock_test_id,status&limit=5`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
  });
  console.log('Sample Attempts:', await attemptsRes.json());

  // Check user_profiles
  const usersRes = await fetch(`${supabaseUrl}/rest/v1/user_profiles?select=id,email,role&limit=5`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
  });
  console.log('Sample Profiles:', await usersRes.json());
}

inspectDb().catch(console.error);
