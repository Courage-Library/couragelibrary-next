const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. WebSocket Polyfill
global.WebSocket = class WebSocket {};

// 2. Load Environment Variables
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
  console.log('Connecting to Supabase at:', supabaseUrl);
  
  const tables = [
    'exam_categories', 'exams', 'subjects', 'topics', 'exam_topics',
    'learning_units', 'exam_unit_mappings', 'topic_relationships',
    'learning_documents', 'document_versions', 'learning_content_artifacts',
    'learning_assets', 'learning_unit_asset_bindings'
  ];

  for (const t of tables) {
    const { data, error, count } = await supabase.from(t).select('*', { count: 'exact' });
    if (error) {
      console.log(`TABLE: ${t} ERROR:`, error.message);
    } else {
      console.log(`TABLE: ${t} (${count !== null ? count : data.length} rows)`);
      if (data && data.length > 0 && data.length <= 10) {
        console.log(JSON.stringify(data, null, 2));
      } else if (data && data.length > 10) {
        console.log(`Showing first 3 of ${data.length}:`);
        console.log(JSON.stringify(data.slice(0, 3), null, 2));
      }
    }
    console.log('------------------------------------------------------------');
  }

  // Also inspect questions table topics distribution
  const { data: questions } = await supabase.from('questions').select('id, topic_id, difficulty, exam_id').limit(10);
  console.log('Sample Questions:', JSON.stringify(questions, null, 2));

  // Query distinct topic_ids in questions
  const { data: qTopics } = await supabase.from('questions').select('topic_id');
  const topicCounts = {};
  if (qTopics) {
    qTopics.forEach(q => {
      topicCounts[q.topic_id] = (topicCounts[q.topic_id] || 0) + 1;
    });
  }
  console.log('Questions count per topic_id:', JSON.stringify(topicCounts, null, 2));
}

run();
