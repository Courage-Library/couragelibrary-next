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

async function queryTableCount(tableName) {
  const url = `${supabaseUrl}/rest/v1/${tableName}?select=*`;
  const res = await fetch(url, {
    method: 'HEAD',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Prefer': 'count=exact'
    }
  });
  const contentRange = res.headers.get('content-range');
  if (contentRange && contentRange.includes('/')) {
    const total = contentRange.split('/')[1];
    return total !== '*' ? parseInt(total, 10) : 0;
  }
  return 0;
}

async function main() {
  const tables = [
    'mock_tests', 'mock_sections', 'mock_questions', 'mock_templates',
    'test_attempts', 'test_results', 'attempt_answers',
    'questions', 'question_versions', 'question_options', 'question_answers',
    'subscription_plans', 'coin_wallets', 'coin_ledger', 'reward_policies',
    'live_test_events', 'live_test_registrations', 'live_test_instances',
    'live_test_ranking_snapshots', 'live_test_leaderboard_entries'
  ];

  const counts = {};
  for (const t of tables) {
    try {
      counts[t] = await queryTableCount(t);
    } catch (e) {
      counts[t] = 'ERROR: ' + e.message;
    }
  }

  console.log('BASELINE COUNTS:', JSON.stringify(counts, null, 2));
}

main().catch(console.error);
