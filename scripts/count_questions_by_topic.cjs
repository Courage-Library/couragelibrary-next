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
  const { data: topics } = await supabase.from('topics').select('id, name, slug, subject_id');
  const topicMap = {};
  topics.forEach(t => topicMap[t.id] = t);

  const { data: questions } = await supabase.from('questions').select('id, canonical_topic_id');
  const countByTopic = {};
  questions.forEach(q => {
    const tid = q.canonical_topic_id || 'unassigned';
    countByTopic[tid] = (countByTopic[tid] || 0) + 1;
  });

  console.log('=== QUESTIONS COUNT BY TOPIC ===');
  for (const [tid, count] of Object.entries(countByTopic)) {
    const t = topicMap[tid];
    console.log(`${t ? t.name : 'Unknown'} (${t ? t.slug : tid}): ${count} questions (topic_id: ${tid})`);
  }
}

run();
