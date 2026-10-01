const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const assert = require('assert');

// Polyfills
global.WebSocket = class WebSocket {};

// Load environment variables
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

// Resilient fetch wrapper
const originalFetch = global.fetch;
global.fetch = async function (url, options) {
  let attempts = 0;
  while (attempts < 3) {
    try {
      return await originalFetch(url, options);
    } catch (err) {
      attempts++;
      if (attempts >= 3) throw err;
      await new Promise(r => setTimeout(r, 500 * attempts));
    }
  }
};

// Register @ alias resolver
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    const target = path.resolve(__dirname, '..', request.slice(2));
    return originalResolveFilename.call(this, target, parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// Register TypeScript loader
require.extensions['.ts'] = function (module, filename) {
  const fileContent = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(fileContent, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  return module._compile(compiled.outputText, filename);
};

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { ExamOnboardingService } = require('@/services/exam-onboarding/exam-onboarding.service');

async function getTableCount(table) {
  try {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      return `N/A (${error.message || error.code})`;
    }
    return count || 0;
  } catch (err) {
    return `ERR (${err.message})`;
  }
}

async function getTableCounts() {
  const tables = [
    'exams',
    'exam_cycles',
    'exam_posts',
    'exam_syllabi',
    'exam_topics',
    'exam_knowledge_documents',
    'exam_doc_versions',
    'exam_sources',
    'exam_claims',
    'mock_templates',
    'mock_tests',
    'test_attempts',
    'user_exam_goals',
    'questions',
    'learning_resources',
    'current_affairs',
    'admin_audit_logs',
  ];

  const counts = {};
  for (const table of tables) {
    counts[table] = await getTableCount(table);
  }
  return counts;
}

async function runControlledCleanup() {
  console.log('================================================================');
  console.log('EXAMINATION MANAGEMENT — CONTROLLED TEST EXAM CLEANUP');
  console.log('================================================================\n');

  // 1. Snapshot table counts before
  console.log('1. Capturing pre-cleanup database table counts...');
  const beforeCounts = await getTableCounts();
  console.log('Pre-cleanup table counts:');
  console.table(beforeCounts);

  // 2. Snapshot canonical production exams baseline
  console.log('\n2. Capturing canonical exams baseline...');
  const canonicalSlugs = ['ssc-cgl', 'ssc-chsl', 'ssc-mts', 'ssc-gd'];
  const { data: canonicalExamsBefore, error: cErr } = await supabase
    .from('exams')
    .select('id, title, slug, is_active, created_at')
    .in('slug', canonicalSlugs);
  
  if (cErr) throw new Error(`Failed to fetch canonical exams: ${cErr.message}`);
  console.table(canonicalExamsBefore);
  assert.strictEqual(canonicalExamsBefore.length, 4, 'All 4 canonical exams must exist before cleanup');

  // Verify SSC CGL specific state
  const cglBefore = canonicalExamsBefore.find(e => e.slug === 'ssc-cgl');
  assert(cglBefore, 'SSC CGL must exist');
  assert.strictEqual(cglBefore.is_active, true, 'SSC CGL must be active/published');

  // Verify SSC CHSL specific state
  const chslBefore = canonicalExamsBefore.find(e => e.slug === 'ssc-chsl');
  assert(chslBefore, 'SSC CHSL must exist');
  assert.strictEqual(chslBefore.is_active, false, 'SSC CHSL must be draft/inactive');

  // 3. Enumerate all exams for controlled cleanup
  console.log('\n3. Enumerating all exams from public.exams...');
  const { data: allExams, error: allErr } = await supabase
    .from('exams')
    .select('id, title, slug, is_active, category, created_at')
    .order('created_at', { ascending: true });

  if (allErr) throw new Error(`Failed to list exams: ${allErr.message}`);
  console.log(`Total exams in database: ${allExams.length}`);

  const toDelete = [];
  const skipped = [];
  const protectedCanonical = [];

  console.log('\n4. Evaluating test fixture classification and deletion eligibility...');
  for (let i = 0; i < allExams.length; i++) {
    const exam = allExams[i];
    const titleLower = exam.title.toLowerCase();
    const slugLower = exam.slug.toLowerCase();

    // Canonical real exams check
    if (canonicalSlugs.includes(exam.slug)) {
      protectedCanonical.push({
        exam,
        reason: 'CANONICAL PRODUCTION EXAMINATION'
      });
      continue;
    }

    // Test fixture classification
    const isTestFixture = (
      titleLower.startsWith('test ') ||
      titleLower.startsWith('test-') ||
      titleLower.includes('phase 3') ||
      titleLower.includes('phase3') ||
      titleLower.includes('regression') ||
      titleLower.includes('mock blueprint') ||
      titleLower.includes('forensic') ||
      titleLower.includes('dummy') ||
      titleLower.includes('diff & version history') ||
      slugLower.startsWith('test-') ||
      slugLower.includes('phase3') ||
      slugLower.includes('phase-3') ||
      slugLower.includes('dummy') ||
      slugLower.includes('sample-exam')
    );

    if (!isTestFixture) {
      skipped.push({
        exam,
        reason: 'NON-TEST EXAMINATION (Ambiguous or Genuine Non-Test Exam)'
      });
      continue;
    }

    // Call evaluateExamDeletionEligibility
    console.log(`   Evaluating [${i + 1}/${allExams.length}] "${exam.title}" (${exam.slug})...`);
    const report = await ExamOnboardingService.evaluateExamDeletionEligibility(exam.id, supabase);

    if (!report.eligible) {
      skipped.push({
        exam,
        reason: `SKIPPED — PROTECTED DEPENDENCY: ${report.blockers.join('; ')}`
      });
    } else {
      toDelete.push({
        exam,
        report
      });
    }
  }

  console.log('\n================================================================');
  console.log(`CLASSIFICATION RESULTS:`);
  console.log(`- Canonical Real Exams (Protected): ${protectedCanonical.length}`);
  console.log(`- Test Fixtures Eligible for Deletion: ${toDelete.length}`);
  console.log(`- Skipped / Blocked: ${skipped.length}`);
  console.log('================================================================\n');

  // 5. Execute controlled deletion using ExamOnboardingService.deleteExam
  console.log(`5. Executing controlled deletion of ${toDelete.length} test fixtures...`);
  const deletedRecords = [];

  for (let i = 0; i < toDelete.length; i++) {
    const item = toDelete[i];
    const { exam, report } = item;
    console.log(`\n[${i + 1}/${toDelete.length}] Deleting "${exam.title}" (${exam.slug})...`);
    console.log(`   ID: ${exam.id}`);
    console.log(`   Dependencies to clean: Cycles=${report.dependencies.cycles}, Syllabi=${report.dependencies.syllabi}, Topics=${report.dependencies.topics}, Docs=${report.dependencies.knowledgeDocuments}, DocVersions=${report.dependencies.knowledgeVersions}, Posts=${report.dependencies.posts}`);

    const result = await ExamOnboardingService.deleteExam(
      exam.id,
      exam.slug,
      'admin-system-cleanup',
      'admin@couragelibrary.com',
      supabase
    );

    assert(result.success, `Deletion of ${exam.slug} must return success=true`);
    deletedRecords.push({
      id: exam.id,
      title: exam.title,
      slug: exam.slug,
      status: exam.is_active ? 'PUBLISHED' : 'DRAFT',
      deletedAt: new Date().toISOString()
    });
    console.log(`   -> Successfully deleted [${exam.slug}] via deleteExam()`);
  }

  // 6. Snapshot table counts after
  console.log('\n6. Capturing post-cleanup database table counts...');
  const afterCounts = await getTableCounts();
  console.log('Post-cleanup table counts:');
  console.table(afterCounts);

  // 7. Verify delta comparison
  console.log('\n7. Database Delta Summary:');
  const deltaSummary = {};
  for (const table of Object.keys(beforeCounts)) {
    const b = typeof beforeCounts[table] === 'number' ? beforeCounts[table] : 0;
    const a = typeof afterCounts[table] === 'number' ? afterCounts[table] : 0;
    deltaSummary[table] = {
      before: beforeCounts[table],
      after: afterCounts[table],
      delta: typeof beforeCounts[table] === 'number' && typeof afterCounts[table] === 'number' ? (a - b) : 'N/A'
    };
  }
  console.table(deltaSummary);

  // 8. Verify canonical production exams baseline intact
  console.log('\n8. Verifying canonical production exams after cleanup...');
  const { data: canonicalExamsAfter, error: cAfterErr } = await supabase
    .from('exams')
    .select('id, title, slug, is_active, created_at')
    .in('slug', canonicalSlugs);

  if (cAfterErr) throw new Error(`Failed to fetch canonical exams after cleanup: ${cAfterErr.message}`);
  console.table(canonicalExamsAfter);
  assert.strictEqual(canonicalExamsAfter.length, 4, 'All 4 canonical exams must remain after cleanup');

  const cglAfter = canonicalExamsAfter.find(e => e.slug === 'ssc-cgl');
  assert.strictEqual(cglAfter.id, cglBefore.id, 'SSC CGL ID must be identical');
  assert.strictEqual(cglAfter.is_active, true, 'SSC CGL must remain active/published');

  const chslAfter = canonicalExamsAfter.find(e => e.slug === 'ssc-chsl');
  assert.strictEqual(chslAfter.id, chslBefore.id, 'SSC CHSL ID must be identical');
  assert.strictEqual(chslAfter.is_active, false, 'SSC CHSL must remain draft/inactive');

  const mtsAfter = canonicalExamsAfter.find(e => e.slug === 'ssc-mts');
  assert(mtsAfter, 'SSC MTS must remain intact');

  const gdAfter = canonicalExamsAfter.find(e => e.slug === 'ssc-gd');
  assert(gdAfter, 'SSC GD Constable must remain intact');

  // 9. Verify candidate attempts, goals, questions, learning resources remain untouched
  assert.strictEqual(afterCounts.test_attempts, beforeCounts.test_attempts, 'Candidate test attempts must be unchanged');
  assert.strictEqual(afterCounts.user_exam_goals, beforeCounts.user_exam_goals, 'User exam goals must be unchanged');
  assert.strictEqual(afterCounts.questions, beforeCounts.questions, 'Question bank questions must be unchanged');
  assert.strictEqual(afterCounts.learning_resources, beforeCounts.learning_resources, 'Learning resources must be unchanged');
  assert.strictEqual(afterCounts.current_affairs, beforeCounts.current_affairs, 'Current affairs must be unchanged');

  // 10. Verify audit logs
  console.log('\n9. Verifying audit log records...');
  const { data: recentAuditLogs, error: aErr } = await supabase
    .from('admin_audit_logs')
    .select('id, action_type, target_entity, target_id, actor_email, reason, created_at')
    .eq('action_type', 'EXAMINATION_PERMANENTLY_DELETED')
    .order('created_at', { ascending: false })
    .limit(toDelete.length + 5);

  if (aErr) console.warn('Warning querying audit logs:', aErr);
  console.log(`Found ${recentAuditLogs?.length || 0} recent EXAMINATION_PERMANENTLY_DELETED audit entries.`);

  console.log('\n================================================================');
  console.log('CLEANUP SUMMARY:');
  console.log(`Total Exams Before: ${allExams.length}`);
  console.log(`Total Exams Deleted: ${deletedRecords.length}`);
  console.log(`Total Exams Remaining: ${afterCounts.exams}`);
  console.log('================================================================\n');

  return {
    beforeCounts,
    afterCounts,
    deltaSummary,
    deletedRecords,
    skipped,
    canonicalExamsAfter,
  };
}

runControlledCleanup().then(res => {
  fs.writeFileSync(
    path.join(__dirname, 'cleanup_result.json'),
    JSON.stringify(res, null, 2),
    'utf-8'
  );
  console.log('Cleanup result saved to scripts/cleanup_result.json');
}).catch(err => {
  console.error('Cleanup execution failed:', err);
  process.exit(1);
});
