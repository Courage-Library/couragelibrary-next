global.WebSocket = class WebSocket {};

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const t = line.trim();
  if (t && !t.startsWith('#')) {
    const idx = t.indexOf('=');
    if (idx > 0) env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function inspect() {
  const tables = [
    'conducting_orgs',
    'exams',
    'exam_cycles',
    'exam_syllabi',
    'exam_topics',
    'exam_patterns',
    'exam_announcements',
    'exam_unit_mappings',
    'user_exam_goals',
    'user_exam_readiness',
    'exam_cutoff_benchmarks'
  ];

  console.log('=== LIVE EXAM SCHEMA & DATA AUDIT ===\n');
  for (const t of tables) {
    try {
      const { data, count, error } = await supabase.from(t).select('*', { count: 'exact' }).limit(5);
      console.log(`Table: [${t}]`);
      if (error) {
        console.log(`  Status: NOT PRESENT OR ERROR: ${error.message}`);
      } else {
        console.log(`  Status: ACTIVE | Row Count: ${count}`);
        console.log(`  Sample (first ${data.length} records):`, JSON.stringify(data, null, 2));
      }
    } catch (e) {
      console.log(`  Exception querying ${t}: ${e.message}`);
    }
    console.log('--------------------------------------------------');
  }
}

inspect().catch(console.error);
