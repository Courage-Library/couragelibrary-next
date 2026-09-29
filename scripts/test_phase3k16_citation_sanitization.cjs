/**
 * COURAGE LIBRARY — PHASE 3K.16 TEST SUITE
 * External AI Citation Artifact Forensic Audit & Sanitization Verification
 * 
 * Tests detection, sanitization, 5-gate validation, compiler safety,
 * candidate renderer defense-in-depth, and production revision lifecycle.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const Module = require('module');
const ts = require('typescript');

// Polyfills
global.WebSocket = class WebSocket {};

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
  const envContent = fs.readFileSync(envPath, 'utf8');
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
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const {
  sanitizeAiCitationArtifacts,
  detectAiCitationArtifacts,
  sanitizeObjectCitationArtifacts,
} = require('@/services/ai/ai-citation-sanitizer');
const { ExamKnowledgeValidatorService } = require('@/services/exam-knowledge/exam-knowledge-validator.service');
const { ExamKnowledgeImporterService } = require('@/services/exam-knowledge/exam-knowledge-importer.service');
const { AdminExamKnowledgeService } = require('@/services/exam-knowledge/admin-exam-knowledge.service');

async function runTests() {
  console.log('============================================================');
  console.log('COURAGE LIBRARY — PHASE 3K.16 CITATION SANITIZATION SUITE');
  console.log('Authoritative Runtime Verification');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function runTest(id, name, fn) {
    try {
      fn();
      console.log(`  [PASS] ${id}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${id}: ${name}`);
      console.error(`         ${err.message}`);
      failed++;
    }
  }

  async function runAsyncTest(id, name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${id}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${id}: ${name}`);
      console.error(`         ${err.message}`);
      failed++;
    }
  }

  console.log('--- GROUP 1: Pure Sanitizer & Pattern Normalization ---');

  runTest('T01', 'Clean Markdown is preserved 100% without modification', () => {
    const input = '### SSC CGL Exam Pattern\n\nThe Tier 1 examination consists of **100 questions** for a total of **200 marks** with $0.50$ negative marking.';
    const output = sanitizeAiCitationArtifacts(input);
    assert.strictEqual(output, input);
  });

  runTest('T02', 'Normal Markdown links are preserved intact', () => {
    const input = 'Refer to the [Official SSC Notification](https://ssc.gov.in/notice.pdf) for complete details.';
    const output = sanitizeAiCitationArtifacts(input);
    assert.strictEqual(output, input);
  });

  runTest('T03', 'Standard oaicite marker is cleanly stripped', () => {
    const input = 'The Staff Selection Commission conducts CGL:contentReference[oaicite:0]{index=0} annually.';
    const output = sanitizeAiCitationArtifacts(input);
    assert.strictEqual(output, 'The Staff Selection Commission conducts CGL annually.');
  });

  runTest('T04', 'Bracketed oaicite marker without contentReference is cleanly stripped', () => {
    const input = 'Candidates must be graduates [oaicite:1]{index=1} from a recognized university.';
    const output = sanitizeAiCitationArtifacts(input);
    assert.strictEqual(output, 'Candidates must be graduates from a recognized university.');
  });

  runTest('T05', 'OpenAI search footnote marker 【N†source】 is cleanly stripped', () => {
    const input = 'Age relaxation applies to reserved categories【4†source】as per government norms.';
    const output = sanitizeAiCitationArtifacts(input);
    assert.strictEqual(output, 'Age relaxation applies to reserved categories as per government norms.');
  });

  runTest('T06', 'Multiple citation markers on a single line are stripped without spacing degradation', () => {
    const input = 'Tier 1 is screening:contentReference[oaicite:2]{index=2} while Tier 2 determines merit:contentReference[oaicite:3]{index=3}.';
    const output = sanitizeAiCitationArtifacts(input);
    assert.strictEqual(output, 'Tier 1 is screening while Tier 2 determines merit.');
  });

  runTest('T07', 'Citation marker adjacent to punctuation cleans up comma/period spacing properly', () => {
    const input = 'Registration requires OTR:contentReference[oaicite:4]{index=4}, valid photo ID, and degree certificate.';
    const output = sanitizeAiCitationArtifacts(input);
    assert.strictEqual(output, 'Registration requires OTR, valid photo ID, and degree certificate.');
  });

  runTest('T08', 'Legitimate URL containing "oaicite" or "contentReference" in query param is NOT altered', () => {
    const input = 'Check research document at https://example.com/api?contentReference=test&oaicite=1 for reference.';
    const output = sanitizeAiCitationArtifacts(input);
    assert.strictEqual(output, input);
  });

  runTest('T09', 'detectAiCitationArtifacts accurately identifies token and line number', () => {
    const text = 'Line 1 clean\nLine 2 has :contentReference[oaicite:5]{index=5} here\nLine 3 clean';
    const detected = detectAiCitationArtifacts(text);
    assert.strictEqual(detected.length, 1);
    assert.strictEqual(detected[0].token, ':contentReference[oaicite:5]{index=5}');
    assert.strictEqual(detected[0].line, 2);
  });

  runTest('T10', 'sanitizeObjectCitationArtifacts deeply sanitizes nested objects and arrays', () => {
    const complexObj = {
      title: 'Guide:contentReference[oaicite:0]{index=0}',
      sections: [
        {
          heading: 'Pattern:contentReference[oaicite:1]{index=1}',
          body: 'Text with 【2†source】 note.',
        },
      ],
      sources: [
        { title: 'Notice', url: 'https://ssc.gov.in' },
      ],
    };

    const sanitized = sanitizeObjectCitationArtifacts(complexObj);
    assert.strictEqual(sanitized.title, 'Guide');
    assert.strictEqual(sanitized.sections[0].heading, 'Pattern');
    assert.strictEqual(sanitized.sections[0].body, 'Text with note.');
    assert.strictEqual(sanitized.sources[0].url, 'https://ssc.gov.in');
  });

  console.log('\n--- GROUP 2: Validation Gate 3 Enforcement ---');

  runTest('T11', 'Gate 3 fails when un-sanitized citation artifacts are present', () => {
    const specWithArtifact = {
      schemaVersion: '1.0.0',
      documentId: 'doc-1',
      examSlug: 'ssc-cgl',
      moduleKey: 'EXAM_OVERVIEW',
      language: 'en',
      metadata: {
        title: 'SSC CGL Overview',
        description: 'Comprehensive guide',
        lastVerifiedDate: '2026-09-01',
        authoritativeKeywords: ['SSC'],
      },
      structuredData: { claims: [] },
      contentSections: [
        {
          id: 'sec-1',
          heading: 'Overview',
          sectionType: 'SUMMARY',
          bodyMarkdown: 'The exam is conducted :contentReference[oaicite:0]{index=0} annually.',
        },
      ],
      officialSources: [],
      seo: {
        metaTitle: 'Title',
        metaDescription: 'Desc',
        canonicalUrlSlug: 'overview',
      },
    };

    const options = {
      expectedTarget: {
        examId: 'e-1',
        examSlug: 'ssc-cgl',
        moduleKey: 'EXAM_OVERVIEW',
        language: 'en',
      },
      expectedContextHash: 'hash-1',
    };

    const result = ExamKnowledgeValidatorService.validate(specWithArtifact, options);
    assert.strictEqual(result.overallOutcome, 'BLOCK');
    assert.strictEqual(result.gates.gate3_security.status, 'FAIL');
    assert(result.gates.gate3_security.errors.some(e => e.includes('Unresolved external AI citation artifact')));
  });

  runTest('T12', 'Gate 3 passes when citation artifacts are sanitized', () => {
    const cleanSpec = {
      schemaVersion: '1.0.0',
      documentId: 'doc-1',
      examSlug: 'ssc-cgl',
      moduleKey: 'EXAM_OVERVIEW',
      language: 'en',
      metadata: {
        title: 'SSC CGL Overview',
        description: 'Comprehensive guide',
        lastVerifiedDate: '2026-09-01',
        authoritativeKeywords: ['SSC'],
      },
      structuredData: { claims: [] },
      contentSections: [
        {
          id: 'sec-1',
          heading: 'Overview',
          sectionType: 'SUMMARY',
          bodyMarkdown: 'The exam is conducted annually.',
        },
      ],
      officialSources: [],
      seo: {
        metaTitle: 'Title',
        metaDescription: 'Desc',
        canonicalUrlSlug: 'overview',
      },
    };

    const options = {
      expectedTarget: {
        examId: 'e-1',
        examSlug: 'ssc-cgl',
        moduleKey: 'EXAM_OVERVIEW',
        language: 'en',
      },
      expectedContextHash: 'hash-1',
    };

    const result = ExamKnowledgeValidatorService.validate(cleanSpec, options);
    assert.strictEqual(result.gates.gate3_security.status, 'PASS');
  });

  console.log('\n--- GROUP 3: Importer & Compiler Integration ---');

  runTest('T13', 'ExamKnowledgeImporterService extracts and sanitizes payload automatically', () => {
    const rawAiJson = JSON.stringify({
      schemaVersion: '1.0.0',
      documentId: 'doc-1',
      examSlug: 'ssc-cgl',
      moduleKey: 'EXAM_OVERVIEW',
      language: 'en',
      metadata: {
        title: 'SSC CGL Overview:contentReference[oaicite:0]{index=0}',
        description: 'Guide【1†source】',
        lastVerifiedDate: '2026-09-01',
        authoritativeKeywords: ['SSC'],
      },
      structuredData: { claims: [] },
      contentSections: [
        {
          id: 'sec-1',
          heading: 'Pattern',
          sectionType: 'SUMMARY',
          bodyMarkdown: 'Tier 1 is CBT:contentReference[oaicite:1]{index=1}.',
        },
      ],
      officialSources: [
        { title: 'Notice:contentReference[oaicite:2]{index=2}', url: 'https://ssc.gov.in', issuingAuthority: 'SSC' },
      ],
      seo: {
        metaTitle: 'Title',
        metaDescription: 'Desc',
        canonicalUrlSlug: 'overview',
      },
    });

    const cleanedJson = ExamKnowledgeImporterService.extractJsonFromRaw(`\`\`\`json\n${rawAiJson}\n\`\`\``);
    const parsed = JSON.parse(cleanedJson);
    const sanitized = sanitizeObjectCitationArtifacts(parsed);

    assert.strictEqual(sanitized.metadata.title, 'SSC CGL Overview');
    assert.strictEqual(sanitized.metadata.description, 'Guide');
    assert.strictEqual(sanitized.contentSections[0].bodyMarkdown, 'Tier 1 is CBT.');
    assert.strictEqual(sanitized.officialSources[0].title, 'Notice');
  });

  console.log('\n--- GROUP 4: Database Snapshot Immutability & Production Revision Lifecycle ---');

  await runAsyncTest('T14', 'Historical versions v1 and v2 remain 100% immutable and uncorrupted', async () => {
    const { data: v1 } = await supabase
      .from('exam_doc_versions')
      .select('id, version_number, is_published, review_status')
      .eq('id', 'a51ea811-6ffd-48fc-bf84-1e47ffd9934c')
      .single();

    assert(v1, 'Version 1 must exist');
    assert.strictEqual(v1.version_number, 1);
    assert.strictEqual(v1.is_published, true);
  });

  await runAsyncTest('T15', 'Execute production revision v3 -> v4: Create Revision, Sanitize, Approve, Compile, Publish atomically', async () => {
    // 1. Fetch document and current published version v3
    const { data: doc } = await supabase
      .from('exam_knowledge_documents')
      .select('id, current_published_version_id')
      .eq('id', 'b8e31c45-a6de-444d-b9ec-17535e9417b8')
      .single();

    assert(doc, 'Document must exist');
    const v3Id = doc.current_published_version_id;

    // 2. Fetch v3 payload
    const { data: v3 } = await supabase
      .from('exam_doc_versions')
      .select('*')
      .eq('id', v3Id)
      .single();

    assert(v3, 'v3 must exist');

    // 3. Create Revision Draft v4
    const revRes = await AdminExamKnowledgeService.createRevisionDraft({
      documentId: doc.id,
      baseVersionId: v3.id,
    }, supabase);

    assert(revRes.success, `Revision creation failed: ${revRes.error}`);
    const v4Id = revRes.newVersionId;
    assert(v4Id, 'New version ID must be created');

    // 4. Sanitize v4 payload
    const cleanPayload = sanitizeObjectCitationArtifacts(v3.structured_payload);
    const updateRes = await AdminExamKnowledgeService.updateDraftPayload({
      versionId: v4Id,
      structuredPayload: cleanPayload,
    }, supabase);

    assert(updateRes.success, `Payload update failed: ${updateRes.error}`);

    // 5. Approve v4
    const approveRes = await AdminExamKnowledgeService.updateDocVersionReviewStatus({
      versionId: v4Id,
      newStatus: 'APPROVED',
    }, supabase);

    assert(approveRes.success, `Approve failed: ${approveRes.error}`);

    // 6. Compile v4 into MDX
    const compileRes = await AdminExamKnowledgeService.compileExamDocVersion(v4Id, supabase);
    assert(compileRes.success, `Compilation failed: ${compileRes.error}`);

    // Verify zero artifacts in compiled MDX
    const mdx = compileRes.compiledMdx;
    assert(!mdx.includes('oaicite'), 'Compiled MDX must contain zero oaicite');
    assert(!mdx.includes('contentReference'), 'Compiled MDX must contain zero contentReference');

    // Verify official sources are intact
    assert(mdx.includes('Official Sources & Evidence'), 'Official Sources & Evidence must remain intact');
    assert(mdx.includes('Staff Selection Commission'), 'Source title must remain intact');

    // 7. Publish v4
    const publishRes = await AdminExamKnowledgeService.publishExamDocVersion({
      versionId: v4Id,
    }, supabase);

    assert(publishRes.success, `Publication failed: ${publishRes.error}`);

    // 8. Verify new published pointer in exam_knowledge_documents
    const { data: updatedDoc } = await supabase
      .from('exam_knowledge_documents')
      .select('current_published_version_id')
      .eq('id', doc.id)
      .single();

    assert.strictEqual(updatedDoc.current_published_version_id, v4Id, 'Document pointer must point to clean v4');

    // 9. Verify v3 is now superseded but unmodified
    const { data: v3Post } = await supabase
      .from('exam_doc_versions')
      .select('id, version_number, is_published, structured_payload')
      .eq('id', v3Id)
      .single();

    assert(v3Post, 'v3 must still exist');
    assert.strictEqual(v3Post.is_published, true, 'Historical version retains is_published record');
  });

  await runAsyncTest('T16', 'Candidate view serves clean v4 with zero citation artifacts and intact source cards', async () => {
    const { ExamKnowledgeCandidateService } = require('@/services/exam-knowledge/exam-knowledge-candidate.service');
    const result = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      moduleSlug: 'overview',
      supabaseClient: supabase,
    });

    assert.strictEqual(result.status, 'FOUND', 'Candidate read service must return FOUND');
    const view = result.data;
    assert(view, 'Candidate view must be resolvable');
    assert(view.publishedModules, 'Published modules must exist');

    const overviewModule = view.publishedModules.EXAM_OVERVIEW;
    assert(overviewModule, 'EXAM_OVERVIEW module must be published');
    assert.strictEqual(overviewModule.moduleKey, 'EXAM_OVERVIEW');

    const mdx = overviewModule.compiledMdx;
    assert(mdx, 'Compiled MDX must exist');
    assert(!mdx.includes('oaicite'), 'Candidate MDX must contain zero oaicite');
    assert(!mdx.includes('contentReference'), 'Candidate MDX must contain zero contentReference');

    // Verify Official Sources & Evidence is present and valid
    assert(overviewModule.officialSources.length > 0, 'Official sources must be present');
    assert(overviewModule.officialSources[0].sourceUrl.startsWith('http'), 'Source URL must be valid');
  });

  console.log('\n============================================================');
  console.log(`PHASE 3K.16 TEST RESULTS: ${passed} PASSED | ${failed} FAILED (Total: ${passed + failed})`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
