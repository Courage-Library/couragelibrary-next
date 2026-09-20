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
  console.log('--- ALL TOPICS IN DATABASE ---');
  const { data: topics, error: tErr } = await supabase.from('topics').select('*').order('subject_id');
  if (tErr) console.error('Topics error:', tErr);
  else {
    topics.forEach(t => {
      console.log(`[${t.subject_id}] ${t.name} (id: ${t.id}, slug: ${t.slug})`);
    });
  }

  console.log('\n--- QUESTIONS TABLE INSPECTION ---');
  const { data: questions, error: qErr } = await supabase.from('questions').select('id, topic_id, difficulty, default_marks').limit(10);
  if (qErr) console.error('Questions error:', qErr);
  else {
    console.log(`Fetched ${questions ? questions.length : 0} sample questions:`);
    console.log(JSON.stringify(questions, null, 2));
  }

  const { data: allQ, error: allQErr } = await supabase.from('questions').select('id, topic_id');
  if (allQ) {
    console.log(`Total questions: ${allQ.length}`);
    const qCountByTopic = {};
    allQ.forEach(q => {
      qCountByTopic[q.topic_id] = (qCountByTopic[q.topic_id] || 0) + 1;
    });
    console.log('Question counts by topic_id:', JSON.stringify(qCountByTopic, null, 2));
  }

  console.log('\n--- QUESTION VERSIONS INSPECTION ---');
  const { data: qVers, error: vErr } = await supabase.from('question_versions').select('id, question_id, version_number, content').limit(3);
  if (vErr) console.error('Question versions error:', vErr);
  else {
    console.log('Sample question versions:', JSON.stringify(qVers, null, 2));
  }
}

run();
