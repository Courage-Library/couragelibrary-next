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
  const topicId = '47f9c646-ce00-4448-ac88-9d9273afa589'; // Percentage
  const { data: questions } = await supabase.from('questions').select('id, canonical_topic_id, status').eq('canonical_topic_id', topicId);
  console.log(`Found ${questions.length} questions for Percentage:`);

  for (const q of questions) {
    const { data: versions } = await supabase.from('question_versions').select('*').eq('question_id', q.id);
    console.log(`\nQuestion ${q.id}:`);
    for (const v of versions) {
      console.log(`  Version ${v.id} (v${v.version_number}): [${v.difficulty}] ${v.question_text}`);
      const { data: opts } = await supabase.from('question_options').select('id, option_key, option_text').eq('question_version_id', v.id);
      const { data: ans } = await supabase.from('question_answers').select('correct_option_id, explanation').eq('question_version_id', v.id);
      console.log('    Options:', opts ? opts.map(o => `${o.option_key}: ${o.option_text}`).join(' | ') : 'none');
      console.log('    Answer & Explanation:', ans && ans[0] ? ans[0].explanation : 'none');
    }
  }
}

run();
