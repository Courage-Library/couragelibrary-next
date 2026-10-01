const fs = require('fs');
const path = require('path');
global.WebSocket = class WebSocket {};
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const clean = line.trim();
  if (!clean || clean.startsWith('#')) continue;
  const idx = clean.indexOf('=');
  if (idx !== -1) {
    const key = clean.slice(0, idx).trim();
    const val = clean.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    envVars[key] = val;
  }
}

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runAudit() {
  console.log('================================================================');
  console.log('IMMUTABILITY & DATABASE STATE AUDIT');
  console.log('================================================================\n');

  // 1. Current Exam State
  const { data: exams, error: examErr } = await supabase
    .from('exams')
    .select('id, title, slug, is_active, category')
    .order('created_at');
  
  if (examErr) {
    console.error('Error fetching exams:', examErr);
    return;
  }

  console.log(`[1] Canonical Exams Count: ${exams.length}`);
  exams.forEach((ex, idx) => {
    console.log(`    ${idx + 1}. [${ex.is_active ? 'PUBLISHED' : 'DRAFT'}] ${ex.title} (${ex.slug}) ID: ${ex.id}`);
  });

  // 2. Counts across related tables
  const { count: cycleCount } = await supabase.from('exam_cycles').select('*', { count: 'exact', head: true });
  const { count: docCount } = await supabase.from('exam_knowledge_documents').select('*', { count: 'exact', head: true });
  const { count: verCount } = await supabase.from('exam_doc_versions').select('*', { count: 'exact', head: true });
  const { count: pubVerCount } = await supabase.from('exam_doc_versions').select('*', { count: 'exact', head: true }).eq('is_published', true);
  const { count: attemptCount } = await supabase.from('test_attempts').select('*', { count: 'exact', head: true });
  const { count: templateCount } = await supabase.from('mock_templates').select('*', { count: 'exact', head: true });
  const { count: testCount } = await supabase.from('mock_tests').select('*', { count: 'exact', head: true });
  const { count: questionCount } = await supabase.from('questions').select('*', { count: 'exact', head: true });
  const { count: resourceCount } = await supabase.from('learning_resources').select('*', { count: 'exact', head: true });
  const { count: affairsCount } = await supabase.from('current_affairs_items').select('*', { count: 'exact', head: true });

  console.log('\n[2] Live Table Counts:');
  console.log(`    - exam_cycles: ${cycleCount}`);
  console.log(`    - exam_knowledge_documents: ${docCount}`);
  console.log(`    - exam_doc_versions: ${verCount}`);
  console.log(`    - exam_doc_versions (is_published=true): ${pubVerCount}`);
  console.log(`    - test_attempts: ${attemptCount}`);
  console.log(`    - mock_templates: ${templateCount}`);
  console.log(`    - mock_tests: ${testCount}`);
  console.log(`    - questions: ${questionCount}`);
  console.log(`    - learning_resources: ${resourceCount}`);
  console.log(`    - current_affairs_items: ${affairsCount}`);

  // 3. Test Direct Immutability via Service Role Client (Without app.allow_exam_deletion)
  console.log('\n[3] Testing Direct Immutability on Published Version (Without Session Flag):');
  
  // Find a published doc version of SSC CGL
  const { data: pubVers } = await supabase
    .from('exam_doc_versions')
    .select('id, document_id, version_number, is_published, review_status')
    .eq('is_published', true)
    .limit(1);

  if (pubVers && pubVers.length > 0) {
    const pubVer = pubVers[0];
    console.log(`    Target Published Version: ID=${pubVer.id}, v${pubVer.version_number}, is_published=${pubVer.is_published}`);

    // A. Attempt Direct UPDATE
    const { error: updateErr } = await supabase
      .from('exam_doc_versions')
      .update({ compiled_mdx: '# TAMPER_TEST_IMMUTABILITY' })
      .eq('id', pubVer.id);

    console.log(`    Direct UPDATE result: ${updateErr ? 'BLOCKED as expected' : 'UNEXPECTEDLY SUCCEEDED'}`);
    if (updateErr) {
      console.log(`    UPDATE error message: "${updateErr.message}"`);
    }

    // B. Attempt Direct DELETE
    const { error: deleteErr } = await supabase
      .from('exam_doc_versions')
      .delete()
      .eq('id', pubVer.id);

    console.log(`    Direct DELETE result: ${deleteErr ? 'BLOCKED as expected' : 'UNEXPECTEDLY SUCCEEDED'}`);
    if (deleteErr) {
      console.log(`    DELETE error message: "${deleteErr.message}"`);
    }

    // C. Attempt Direct Document DELETE
    const { error: docDeleteErr } = await supabase
      .from('exam_knowledge_documents')
      .delete()
      .eq('id', pubVer.document_id);

    console.log(`    Direct Document DELETE result: ${docDeleteErr ? 'BLOCKED as expected' : 'UNEXPECTEDLY SUCCEEDED'}`);
    if (docDeleteErr) {
      console.log(`    Document DELETE error message: "${docDeleteErr.message}"`);
    }
  }

  // 4. Test RPC on SSC CGL (Should be blocked by dependency check)
  console.log('\n[4] Testing fn_delete_exam_controlled on Protected Published Exam (SSC CGL):');
  const { data: cgl } = await supabase.from('exams').select('id, slug').eq('slug', 'ssc-cgl').single();
  if (cgl) {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('fn_delete_exam_controlled', {
      p_exam_id: cgl.id,
      p_slug: cgl.slug,
      p_actor_id: null,
      p_actor_email: 'audit@couragelibrary.com',
      p_reason: 'Audit test attempt on protected exam'
    });

    console.log(`    fn_delete_exam_controlled result on SSC CGL: ${rpcErr ? 'BLOCKED as expected' : 'UNEXPECTEDLY SUCCEEDED'}`);
    if (rpcErr) {
      console.log(`    RPC error message: "${rpcErr.message}"`);
    }
  }

  console.log('\n================================================================');
  console.log('AUDIT COMPLETED');
  console.log('================================================================');
}

runAudit().catch(err => {
  console.error('Audit execution failed:', err);
});
