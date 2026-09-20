const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

global.WebSocket = class WebSocket {};

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
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  const { data: q, error: qErr } = await supabase.from('questions').select('*').limit(1);
  console.log('Sample question record:', q ? q[0] : qErr);

  const { data: qv, error: qvErr } = await supabase.from('question_versions').select('*').limit(1);
  console.log('Sample question version record:', qv ? qv[0] : qvErr);

  const { data: subtopics, error: stErr } = await supabase.from('subtopics').select('*').limit(10);
  console.log('Sample subtopics:', subtopics ? subtopics : stErr);
}

run();
