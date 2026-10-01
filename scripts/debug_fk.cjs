const fs = require('fs');
const path = require('path');
global.WebSocket = class WebSocket {};
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf-8');
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      process.env[trimmed.slice(0, idx).trim()] = val;
    }
  }
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testCleanDocOrder() {
  const examId = '95d31330-f0af-464f-a9e2-074f1ebf59d6';
  
  // 1. Fetch docs
  const { data: docs } = await supabase.from('exam_knowledge_documents').select('id, current_published_version_id').eq('exam_id', examId);
  console.log('Docs:', docs);
  const docIds = (docs || []).map(d => d.id);

  if (docIds.length > 0) {
    // Break circular FK by nulling current_published_version_id
    const { error: nullErr } = await supabase.from('exam_knowledge_documents').update({ current_published_version_id: null }).in('id', docIds);
    console.log('Nulling current_published_version_id error:', nullErr);

    // Delete versions
    const { error: vErr } = await supabase.from('exam_doc_versions').delete().in('document_id', docIds);
    console.log('Delete versions error:', vErr);

    // Delete docs
    const { error: dErr } = await supabase.from('exam_knowledge_documents').delete().in('id', docIds);
    console.log('Delete docs error:', dErr);
  }

  // Check if exam can now be deleted
  const { error: examDelErr } = await supabase.from('exams').delete().eq('id', examId);
  console.log('Delete exam error:', examDelErr);
}

testCleanDocOrder().catch(console.error);
