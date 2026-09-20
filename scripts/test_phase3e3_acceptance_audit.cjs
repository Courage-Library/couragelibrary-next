/**
 * COURAGE LIBRARY — PHASE 3E.3 POST-CERTIFICATION ACCEPTANCE AUDIT
 * Forensic End-to-End Test Suite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

// TS Transpile Hook
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
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

let passed = 0;
let failed = 0;
const issues = [];

function check(testId, desc, fn) {
  try {
    fn();
    console.log(`  ✓ [${testId}] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [${testId}] ${desc}: ${err.message}`);
    issues.push({ testId, desc, error: err.message });
    failed++;
  }
}

async function checkAsync(testId, desc, fn) {
  try {
    await fn();
    console.log(`  ✓ [${testId}] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [${testId}] ${desc}: ${err.message}`);
    issues.push({ testId, desc, error: err.message });
    failed++;
  }
}

async function runAudit() {
  console.log('============================================================');
  console.log('PHASE 3E.3 POST-CERTIFICATION FORENSIC ACCEPTANCE AUDIT');
  console.log('============================================================\n');

  const { AcademicValidator } = require('../services/ai/academic-validator.service');
  const { AIModelConfigRegistry } = require('../services/ai/ai-model-registry');
  const { GeminiAIProvider } = require('../services/ai/gemini-provider.service');
  const { MockAIProvider } = require('../services/ai/mock-ai-provider.service');
  const { AIGenerationOrchestrator } = require('../services/ai/ai-generation-orchestrator.service');
  const { MdxSecurityScanner } = require('../services/mdx-security-scanner');
  const { ContentSpecValidator } = require('../services/content-spec-validator');

  // --- 1. Security Scanner Exhaustive Threat Test ---
  console.log('▶ Track 1: Security Scanner Threat Vectors');
  const securityThreats = [
    { name: '<script> tag', payload: 'Some text <script>alert(1)</script>' },
    { name: '<iframe> tag', payload: 'Frame <iframe src="https://evil.com"></iframe>' },
    { name: 'import statement', payload: 'import { useState } from "react";' },
    { name: 'export statement', payload: 'export const x = 10;' },
    { name: 'require() call', payload: 'const fs = require("fs");' },
    { name: 'eval() call', payload: 'const res = eval("2+2");' },
    { name: 'process.env access', payload: 'const k = process.env.SECRET;' },
    { name: 'inline onerror handler', payload: '<img src="x" onerror="alert(1)" />' },
    { name: 'javascript: link scheme', payload: 'Click [link](javascript:alert(1))' },
    { name: 'data: URI scheme', payload: 'Image <img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" />' },
  ];

  securityThreats.forEach((t, i) => {
    check(`SEC-${i + 1}`, `Scanner blocks ${t.name}`, () => {
      const res = MdxSecurityScanner.scan(t.payload);
      assert.strictEqual(res.isSafe, false, `Expected ${t.name} to be unsafe`);
      assert.ok(res.errors.length > 0, `Expected error list for ${t.name}`);
    });
  });

  // --- 2. Academic Validation Outcomes & Propagation ---
  console.log('\n▶ Track 2: Academic Validation Severity Propagation');
  
  // Base spec builder
  const makeSpec = (docType) => ({
    schemaVersion: '1.0.0',
    documentId: 'doc-audit-001',
    unitSlug: 'mechanics-newtons-laws',
    language: 'en',
    versionNumber: 1,
    documentType: docType,
    metadata: {
      title: "Newton's Laws of Motion & Momentum",
      summary: 'Comprehensive analysis of inertial frames, momentum conservation, and impulse.',
      subjectId: 'physics',
      topicId: 'mechanics',
      difficultyTier: 'INTERMEDIATE',
      estimatedReadingMinutes: 12,
      authoritativeKeywords: ['newton', 'momentum', 'force'],
      targetExamCategories: ['jee'],
    },
    learningObjectives: ['Master First, Second, and Third Laws of Motion'],
    prerequisites: [{ topicId: 'kinematics', conceptSummary: 'Velocity and acceleration' }],
    sections: [
      {
        id: 'sec-1',
        title: 'First Law: Law of Inertia',
        sectionType: 'THEORY',
        orderIndex: 0,
        contentMarkdown: 'Every body continues in its state of rest or uniform motion in a straight line unless compelled to change that state by an external unbalanced force.',
      },
    ],
    formulaBlocks: [
      {
        id: 'form-1',
        name: 'Second Law Equation',
        latexFormula: 'F_{net} = \\frac{dp}{dt} = m \\cdot a',
        derivationMarkdown: 'Rate of change of momentum is proportional to applied unbalanced force.',
        variables: [{ symbol: 'F_{net}', meaning: 'Net External Force', units: 'N' }],
        applicableConditions: ['Inertial reference frame', 'Constant mass system'],
      },
    ],
    workedExamples: [
      {
        id: 'ex-1',
        title: 'Impulse of a Bouncing Ball',
        problemText: 'A ball of mass 0.2kg strikes a wall at 10m/s and rebounds at 8m/s. Find impulse.',
        stepByStepSolution: [{ stepNumber: 1, description: 'J = Delta p = 0.2 * (8 - (-10)) = 3.6 Ns' }],
        finalAnswer: 'Impulse = 3.6 Ns',
      },
    ],
    cognitiveTraps: [
      {
        id: 'trap-1',
        trapType: 'MISREAD_KEYWORD',
        misconception: 'Action-reaction forces act on the same body and cancel each other.',
        correctApproach: 'Action and reaction forces ALWAYS act on DIFFERENT bodies simultaneously.',
      },
    ],
    quickChecks: [
      {
        id: 'qc-1',
        prompt: 'Do action and reaction cancel each other out?',
        options: [
          { id: 'opt-a', text: 'No, because they act on different bodies', isCorrect: true, feedbackExplanation: 'Correct.' },
          { id: 'opt-b', text: 'Yes, always', isCorrect: false, feedbackExplanation: 'Incorrect.' },
        ],
      },
    ],
    authenticPyqReferences: [
      {
        questionVersionId: 'qv-physics-jee-001',
        relevanceRationale: 'Tests impulse calculation in two dimensions.',
      },
    ],
    revisionSummary: {
      keyTakeaways: ['F = dp/dt', 'Action-reaction acts on different bodies'],
      coreFormulas: ['F = ma'],
      speedRules: ['Impulse = Area under F-t curve'],
    },
  });

  check('ACAD-1', 'FORMULA_SHORTCUT_SHEET requires formulaBlocks (BLOCK if empty)', () => {
    const spec = makeSpec('FORMULA_SHORTCUT_SHEET');
    spec.formulaBlocks = [];
    const res = AcademicValidator.validate(spec, 'FORMULA_SHORTCUT_SHEET');
    assert.strictEqual(res.outcome, 'BLOCK');
    assert.strictEqual(res.canProceedToReview, false);
  });

  check('ACAD-2', 'COMMON_TRAPS_AND_MISTAKES requires cognitiveTraps (BLOCK if empty)', () => {
    const spec = makeSpec('COMMON_TRAPS_AND_MISTAKES');
    spec.cognitiveTraps = [];
    const res = AcademicValidator.validate(spec, 'COMMON_TRAPS_AND_MISTAKES');
    assert.strictEqual(res.outcome, 'BLOCK');
    assert.strictEqual(res.canProceedToReview, false);
  });

  check('ACAD-3', 'WORKED_EXAMPLES requires workedExamples (BLOCK if empty)', () => {
    const spec = makeSpec('WORKED_EXAMPLES');
    spec.workedExamples = [];
    const res = AcademicValidator.validate(spec, 'WORKED_EXAMPLES');
    assert.strictEqual(res.outcome, 'BLOCK');
    assert.strictEqual(res.canProceedToReview, false);
  });

  check('ACAD-4', 'PYQ_DEEP_DIVE requires authenticPyqReferences (BLOCK if empty)', () => {
    const spec = makeSpec('PYQ_DEEP_DIVE');
    spec.authenticPyqReferences = [];
    const res = AcademicValidator.validate(spec, 'PYQ_DEEP_DIVE');
    assert.strictEqual(res.outcome, 'BLOCK');
    assert.strictEqual(res.canProceedToReview, false);
  });

  check('ACAD-5', 'Fabricated questionVersionId not in allowlist causes BLOCK', () => {
    const spec = makeSpec('CONCEPT_LESSON');
    spec.authenticPyqReferences = [{ questionVersionId: 'qv-fake-9999' }];
    const res = AcademicValidator.validate(spec, 'CONCEPT_LESSON', ['qv-physics-jee-001']);
    assert.strictEqual(res.outcome, 'BLOCK');
    assert.ok(res.issues.some((i) => i.code === 'FABRICATED_QUESTION_VERSION_ID'));
  });

  check('ACAD-6', 'Duplicate questionVersionId causes WARNING (does not BLOCK review)', () => {
    const spec = makeSpec('CONCEPT_LESSON');
    spec.authenticPyqReferences = [
      { questionVersionId: 'qv-physics-jee-001' },
      { questionVersionId: 'qv-physics-jee-001' },
    ];
    const res = AcademicValidator.validate(spec, 'CONCEPT_LESSON', ['qv-physics-jee-001']);
    assert.strictEqual(res.outcome, 'WARNING');
    assert.strictEqual(res.canProceedToReview, true);
    assert.ok(res.issues.some((i) => i.code === 'DUPLICATE_QUESTION_REFERENCE'));
  });

  // --- 3. Section Regeneration Precision ---
  console.log('\n▶ Track 3: Section-Level Regeneration Precision');

  await checkAsync('REGEN-1', 'Regenerate specific section replaces target without touching sibling sections', async () => {
    const spec = makeSpec('CONCEPT_LESSON');
    spec.sections = [
      {
        id: 'sec-keep-1',
        title: 'Keep Section 1',
        sectionType: 'THEORY',
        orderIndex: 0,
        contentMarkdown: 'STATIC CONTENT THAT MUST NOT CHANGE AT ALL DURING REGENERATION.',
      },
      {
        id: 'sec-target-2',
        title: 'Target Section 2',
        sectionType: 'THEORY',
        orderIndex: 1,
        contentMarkdown: 'Old draft text to be replaced.',
      },
      {
        id: 'sec-keep-3',
        title: 'Keep Section 3',
        sectionType: 'THEORY',
        orderIndex: 2,
        contentMarkdown: 'ANOTHER STATIC SECTION THAT MUST REMAIN EXACTLY IDENTICAL.',
      },
    ];

    const result = await AIGenerationOrchestrator.regenerateSection({
      learningUnitId: 'unit-regen-test',
      documentType: 'CONCEPT_LESSON',
      currentSpec: spec,
      sectionId: 'sec-target-2',
      adminUserId: 'admin-auditor',
      prefetchedData: {
        unit: { id: 'unit-regen-test', title: 'Mechanics', slug: 'mechanics', unit_type: 'CONCEPT_LESSON' },
        taxonomy: { subjectId: 'phy', subjectName: 'Physics', topicId: 'mech', topicName: 'Mechanics' },
        exams: [],
        relationships: [],
        questions: [{ id: 'qv-physics-jee-001', question_id: 'q-01', question_text: 'Sample' }],
        existingDocs: [],
      },
    });

    assert.strictEqual(result.spec.sections.length, 3);
    assert.strictEqual(result.spec.sections[0].id, 'sec-keep-1');
    assert.strictEqual(result.spec.sections[0].contentMarkdown, 'STATIC CONTENT THAT MUST NOT CHANGE AT ALL DURING REGENERATION.');
    assert.strictEqual(result.spec.sections[2].id, 'sec-keep-3');
    assert.strictEqual(result.spec.sections[2].contentMarkdown, 'ANOTHER STATIC SECTION THAT MUST REMAIN EXACTLY IDENTICAL.');
    assert.strictEqual(result.spec.sections[1].id, 'sec-target-2');
    assert.notStrictEqual(result.spec.sections[1].contentMarkdown, 'Old draft text to be replaced.');
    assert.strictEqual(result.validation.isStructurallyValid, true);
    assert.strictEqual(result.academicValidation.outcome, 'PASS');
  });

  // --- 4. Concurrency & Idempotency Locking ---
  console.log('\n▶ Track 4: Concurrency & Idempotency Locking');

  await checkAsync('IDEM-1', 'Simultaneous generation requests with identical hash are rejected with RATE_LIMITED', async () => {
    let slowResolve;
    const slowProvider = {
      providerId: 'MOCK',
      isConfigured: () => true,
      generateStructured: async (req) => {
        await new Promise((r) => { slowResolve = r; });
        return {
          success: true,
          requestId: req.requestId,
          idempotencyKey: req.idempotencyKey,
          providerId: 'MOCK',
          modelId: 'mock-model',
          data: makeSpec('CONCEPT_LESSON'),
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
          latencyMs: 100,
          finishReason: 'stop',
          timestamp: new Date().toISOString(),
        };
      },
    };

    AIGenerationOrchestrator.setProvider(slowProvider);

    const callParams = {
      learningUnitId: 'unit-concurrent-audit',
      documentType: 'CONCEPT_LESSON',
      adminUserId: 'admin-auditor',
      prefetchedData: {
        unit: { id: 'unit-concurrent-audit', title: 'Calculus', slug: 'calculus', unit_type: 'CONCEPT_LESSON' },
        taxonomy: { subjectId: 'mth', subjectName: 'Math', topicId: 'calc', topicName: 'Calculus' },
        exams: [],
        relationships: [],
        questions: [{ id: 'qv-physics-jee-001', question_id: 'q-01', question_text: 'Sample' }],
        existingDocs: [],
      },
    };

    const firstPromise = AIGenerationOrchestrator.generateFromCurriculum(callParams);
    let locked = false;
    try {
      await AIGenerationOrchestrator.generateFromCurriculum(callParams);
    } catch (err) {
      if (err.code === 'RATE_LIMITED') locked = true;
    }

    slowResolve();
    await firstPromise;
    assert.strictEqual(locked, true, 'Second concurrent request must be rejected while first is in-flight');
    AIGenerationOrchestrator.setProvider(new MockAIProvider());
  });

  // --- 5. Zero Exposure Client Secret Check ---
  console.log('\n▶ Track 5: Client Secret & Public Exposure Audit');
  check('SEC-KEY-1', 'GEMINI_API_KEY is not exposed to client bundle or NEXT_PUBLIC_ variables', () => {
    const clientCodeSearch = fs.readdirSync(path.resolve(__dirname, '../components/admin/content-studio'));
    for (const file of clientCodeSearch) {
      const content = fs.readFileSync(path.resolve(__dirname, '../components/admin/content-studio', file), 'utf8');
      assert.ok(!content.includes('GEMINI_API_KEY'), `Forbidden GEMINI_API_KEY string in ${file}`);
      assert.ok(!content.includes('NEXT_PUBLIC_GEMINI'), `Forbidden NEXT_PUBLIC_GEMINI in ${file}`);
    }
  });

  console.log('\n============================================================');
  console.log(`ACCEPTANCE AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runAudit().catch((err) => {
  console.error('Fatal acceptance audit error:', err);
  process.exit(1);
});
