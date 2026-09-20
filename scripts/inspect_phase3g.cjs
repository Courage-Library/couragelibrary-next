/**
 * COURAGE LIBRARY — PHASE 3G FORENSIC INSPECTION SCRIPT
 * Queries database and memory/storage artifacts for all 10 published targets.
 */

global.WebSocket = class WebSocket {};

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

// Hook TS transpilation & alias resolution
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    const target = path.resolve(__dirname, '..', request.slice(2));
    return originalResolveFilename.call(this, target, parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions['.ts'] = function (module, filename) {
  const content = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(content, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  return module._compile(compiled.outputText, filename);
};

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

const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const { MemoryStorageProvider } = require('@/services/storage/memory-storage.provider');
const { StorageFactory } = require('@/services/storage/storage-factory');
const { LearningDocumentService } = require('@/services/learning-document.service');

const TARGETS = [
  { targetId: 'T01', unitId: 'unit-3569f1f2-1ccf-4eda-95e2-6b11aa943ff1', subject: 'Quantitative Aptitude', topic: 'Number System', docType: 'CONCEPT_LESSON' },
  { targetId: 'T02', unitId: 'unit-a4a1c20f-bee6-4848-8ac6-eab28e7da228', subject: 'Quantitative Aptitude', topic: 'Ratio & Proportion', docType: 'WORKED_EXAMPLES' },
  { targetId: 'T03', unitId: 'unit-6694fccf-2d08-4711-a31a-49fd1807906f', subject: 'Quantitative Aptitude', topic: 'Profit & Loss', docType: 'FORMULA_SHORTCUT_SHEET' },
  { targetId: 'T04', unitId: 'unit-fc551aeb-a390-487f-86bc-d6959f649678', subject: 'General Intelligence and Reasoning', topic: 'Classification', docType: 'CONCEPT_LESSON' },
  { targetId: 'T05', unitId: 'unit-4267aab0-0e8a-4c63-81ec-ebd5a5fe8ede', subject: 'General Intelligence and Reasoning', topic: 'Coding-Decoding', docType: 'COMMON_TRAPS_AND_MISTAKES' },
  { targetId: 'T06', unitId: 'unit-4a408ce2-30bc-4639-80f2-d37b71784aad', subject: 'General Intelligence and Reasoning', topic: 'Syllogism', docType: 'WORKED_EXAMPLES' },
  { targetId: 'T07', unitId: 'unit-e97b90ff-a74b-49f5-b3f2-ff52867717b8', subject: 'English Comprehension', topic: 'Error Spotting', docType: 'CONCEPT_LESSON' },
  { targetId: 'T08', unitId: 'unit-b53394fc-eba0-418e-b269-d76a970d1f01', subject: 'English Comprehension', topic: 'Synonyms', docType: 'TOPIC_SUMMARY_REVISION' },
  { targetId: 'T09', unitId: 'unit-b41e5958-e7ed-4c87-8e3a-f741331c34a9', subject: 'General Awareness', topic: 'Polity', docType: 'CONCEPT_LESSON' },
  { targetId: 'T10', unitId: 'unit-1de0cac7-43ed-4c58-9060-cc016c7c26fd', subject: 'General Awareness', topic: 'History', docType: 'PYQ_DEEP_DIVE' },
];

async function runAuditInspection() {
  console.log('=== PHASE 3G DATABASE BASELINE CHECK ===');
  const tables = [
    'mock_templates', 'mock_tests', 'mock_sections', 'mock_questions',
    'test_attempts', 'test_results', 'attempt_answers',
    'questions', 'question_versions', 'question_options', 'question_answers',
    'subscription_plans', 'coin_wallets', 'coin_ledger', 'reward_policies',
    'subjects', 'topics', 'subtopics', 'exams', 'exam_topics',
    'learning_units', 'learning_documents', 'document_versions'
  ];

  const baseline = {};
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    baseline[t] = error ? `Error: ${error.message}` : count;
  }
  console.log(JSON.stringify(baseline, null, 2));

  console.log('\n=== PHASE 3G TARGET INVENTORY INSPECTION ===');
  const inventory = [];
  for (const target of TARGETS) {
    // 1. Check unit
    const { data: unit, error: uErr } = await supabase
      .from('learning_units')
      .select('id, title, slug, topic_id, estimated_minutes, difficulty_tier')
      .eq('id', target.unitId)
      .single();

    // 2. Check document
    const { data: doc, error: dErr } = await supabase
      .from('learning_documents')
      .select('id, title, slug, document_type, current_published_version_id, status, learning_unit_id')
      .eq('learning_unit_id', target.unitId)
      .eq('document_type', target.docType)
      .single();

    // 3. Check version
    let version = null;
    if (doc?.current_published_version_id) {
      const { data: v, error: vErr } = await supabase
        .from('document_versions')
        .select('*')
        .eq('id', doc.current_published_version_id)
        .single();
      version = v;
    }

    // 4. Also check cached version in LearningDocumentService if DB version row was cached
    const cachedVer = doc?.current_published_version_id ? LearningDocumentService.getCachedVersion(doc.current_published_version_id) : null;

    // 5. Storage check
    const storageProvider = StorageFactory.getDefaultProvider();
    let specContent = null;
    let mdxContent = null;
    const specKey = version?.source_spec_storage_key || cachedVer?.source_spec_storage_key;
    const mdxKey = version?.compiled_artifact_storage_key || cachedVer?.compiled_artifact_storage_key;

    if (specKey) {
      try {
        const specBuf = await storageProvider.get('courage-library-content', specKey);
        if (specBuf) specContent = JSON.parse(specBuf.toString('utf8'));
      } catch (e) {
        specContent = { error: e.message };
      }
    }
    if (mdxKey) {
      try {
        const mdxBuf = await storageProvider.get('courage-library-content', mdxKey);
        if (mdxBuf) mdxContent = mdxBuf.toString('utf8');
      } catch (e) {
        mdxContent = `Error: ${e.message}`;
      }
    }

    inventory.push({
      targetId: target.targetId,
      unitId: target.unitId,
      unitTitle: unit?.title || (uErr ? uErr.message : 'Not Found'),
      unitSlug: unit?.slug,
      topicId: unit?.topic_id,
      docType: target.docType,
      docId: doc?.id || (dErr ? dErr.message : 'Not Found'),
      docTitle: doc?.title,
      docStatus: doc?.status,
      publishedVersionId: doc?.current_published_version_id,
      dbVersionNumber: version?.version_number,
      dbReviewStatus: version?.review_status,
      dbIsPublished: version?.is_published,
      cachedVerReviewStatus: cachedVer?.review_status,
      specKey,
      hasSpec: Boolean(specContent && !specContent.error),
      mdxKey,
      hasMdx: Boolean(mdxContent && !mdxContent.startsWith('Error:')),
      specSummary: specContent ? {
        title: specContent.metadata?.title,
        sectionsCount: specContent.sections?.length,
        learningObjectivesCount: specContent.learningObjectives?.length,
        hasFormulaBlocks: Boolean(specContent.formulaBlocks?.length),
        hasWorkedExamples: Boolean(specContent.workedExamples?.length),
        hasCognitiveTraps: Boolean(specContent.cognitiveTraps?.length),
        hasPyqs: Boolean(specContent.authenticPyqReferences?.length),
        pyqCount: specContent.authenticPyqReferences?.length || 0,
        pyqRefs: specContent.authenticPyqReferences,
      } : null
    });
  }

  console.log(JSON.stringify(inventory, null, 2));

  // Write detailed inventory to file
  fs.writeFileSync(
    path.join(__dirname, 'phase3g_inventory_raw.json'),
    JSON.stringify(inventory, null, 2)
  );

  console.log('\n=== QUESTION BANK CHECK FOR REFERENCED QUESTIONS ===');
  const { data: allQuestions } = await supabase.from('questions').select('id, topic_id, subject_id, canonical_version_id').limit(20);
  console.log('Sample Questions in DB:', allQuestions?.slice(0, 5));

  const { data: allQuestionVersions } = await supabase.from('question_versions').select('id, question_id, explanation, difficulty').limit(10);
  console.log('Sample Question Versions in DB:', allQuestionVersions?.slice(0, 5));
}

runAuditInspection().catch(console.error);
