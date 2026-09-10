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

async function testRpcs() {
  const rpcs = [
    { name: 'fn_evaluate_live_test_event', args: { p_event_id: '00000000-0000-0000-0000-000000000000' } },
    { name: 'fn_publish_live_test_results', args: { p_event_id: '00000000-0000-0000-0000-000000000000' } },
    { name: 'fn_distribute_live_test_rewards', args: { p_event_id: '00000000-0000-0000-0000-000000000000' } }
  ];

  for (const rpc of rpcs) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpc.name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(rpc.args),
    });
    console.log(`RPC [${rpc.name}]: Status ${res.status}, Response: ${(await res.text()).slice(0, 150)}`);
  }

  // Check tables
  const tables = ['live_test_reward_policies', 'live_test_reward_settlements'];
  for (const t of tables) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${t}?select=count`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
    });
    console.log(`Table [${t}]: Status ${res.status}`);
  }
}

testRpcs().catch(console.error);
