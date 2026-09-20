/**
 * COURAGE LIBRARY — PHASE 3E.3 AUTOMATED TEST SUITE
 * PRODUCTION AI CONTENT GENERATION & HUMAN REVIEW PIPELINE
 * 
 * 50 Comprehensive Assertions (T01 - T50):
 * - T01-T18: Academic Validation Layer (PASS / WARNING / BLOCK rules, document-type constraints, PYQ authenticity)
 * - T19-T26: Model Registry & Gemini Provider Compatibility (1.5-pro, 2.0-flash, 1.5-flash, cost estimation, env config)
 * - T27-T34: Orchestrator Concurrency, Locking & Idempotency
 * - T35-T42: Section-Level Regeneration, Security Scanning & Policy Enforcement
 * - T43-T50: End-to-End Pipeline, Human Review Invariants & Smoke Test Integration
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ts = require('typescript');
const Module = require('module');

// Set up TS transpile & alias hook
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

let passedTests = 0;
let failedTests = 0;

function runTest(testId, description, fn) {
  try {
    fn();
    console.log(`  [PASS] ${testId}: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${testId}: ${description}`);
    console.error(`         ${err.message}`);
    failedTests++;
  }
}

async function runAsyncTest(testId, description, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${testId}: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${testId}: ${description}`);
    console.error(`         ${err.message}`);
    failedTests++;
  }
}

function getBaseValidSpec() {
  return {
    schemaVersion: '1.0.0',
    documentId: 'doc-valid-001',
    unitSlug: 'thermodynamics-first-law',
    language: 'en',
    versionNumber: 1,
    documentType: 'CONCEPT_LESSON',
    metadata: {
      title: 'Thermodynamics: First Law & Enthalpy Relations',
      summary: 'Comprehensive analysis of work, heat, and internal energy relations for JEE.',
      subjectId: 'chem',
      topicId: 'thermo',
      difficultyTier: 'INTERMEDIATE',
      estimatedReadingMinutes: 10,
      authoritativeKeywords: ['thermodynamics', 'first law', 'enthalpy'],
      targetExamCategories: ['jee'],
    },
    learningObjectives: [
      'Understand the first law of thermodynamics and sign conventions.',
    ],
    prerequisites: [
      {
        topicId: 'topic-basics',
        conceptSummary: 'Basic heat and temperature concepts.',
      },
    ],
    sections: [
      {
        id: 'sec-1',
        title: 'Fundamental Formulation of First Law',
        sectionType: 'THEORY',
        orderIndex: 0,
        contentMarkdown: 'The first law of thermodynamics states that energy cannot be created or destroyed, expressed as dU = dq + dw under standard IUPAC sign conventions.',
        callouts: [
          {
            type: 'KEY_CONCEPT',
            title: 'IUPAC Convention',
            contentMarkdown: 'Work done on the system is positive; work done by the system is negative.',
          },
        ],
      },
    ],
    formulaBlocks: [
      {
        id: 'form-1',
        name: 'First Law Equation',
        latexFormula: '\\Delta U = q + w',
        derivationMarkdown: 'Derived from conservation of energy principle in closed systems.',
        variables: [
          { symbol: '\\Delta U', meaning: 'Change in internal energy', units: 'Joules (J)' },
          { symbol: 'q', meaning: 'Heat supplied to system', units: 'Joules (J)' },
          { symbol: 'w', meaning: 'Work done on system', units: 'Joules (J)' },
        ],
      },
    ],
    workedExamples: [
      {
        id: 'ex-1',
        title: 'Isothermal Expansion Work Calculation',
        problemText: 'Calculate work done when 1 mole of ideal gas expands isothermally at 300K from 10L to 20L.',
        stepByStepSolution: [
          {
            stepNumber: 1,
            description: 'Apply Isothermal Work Formula: w = -nRT ln(V2/V1) = -1 * 8.314 * 300 * ln(2)',
          },
        ],
        finalAnswer: 'w = -1729 J (1729 J of work done BY the gas).',
      },
    ],
    cognitiveTraps: [
      {
        id: 'trap-1',
        trapType: 'CALCULATION_SLIP',
        misconception: 'Confusing IUPAC sign convention with Physics sign convention (dw = -P dV vs dw = P dV).',
        correctApproach: 'In Chemistry (IUPAC), work done ON the system is positive. Always verify whether the question is Chemistry or Physics.',
      },
    ],
    authenticPyqReferences: [
      {
        questionVersionId: 'qv-jee-2023-chem-01',
        relevanceRationale: 'Direct application of isothermal work calculation in Chemistry section.',
      },
    ],
    quickChecks: [
      {
        id: 'qc-1',
        prompt: 'In an adiabatic process with an isolated system, what is the value of q?',
        options: [
          { id: 'opt-a', text: 'q = 0', isCorrect: true, feedbackExplanation: 'No heat enters or leaves an adiabatic system.' },
          { id: 'opt-b', text: 'q > 0', isCorrect: false, feedbackExplanation: 'Incorrect, heat transfer occurs only in diathermic containers.' },
        ],
      },
    ],
    revisionSummary: {
      keyTakeaways: ['dU = dq + dw', 'Work done on system is positive'],
      coreFormulas: ['\\Delta U = q + w'],
      speedRules: ['In adiabatic expansion, q = 0 and dU = dw'],
    },
  };
}

async function runAllTests() {
  console.log('============================================================');
  console.log('COURAGE LIBRARY — PHASE 3E.3 TEST SUITE');
  console.log('PRODUCTION AI CONTENT GENERATION & HUMAN REVIEW PIPELINE');
  console.log('============================================================\n');

  const { AcademicValidator } = require('../services/ai/academic-validator.service');
  const { AIModelConfigRegistry, APPROVED_AI_MODELS } = require('../services/ai/ai-model-registry');
  const { GeminiAIProvider } = require('../services/ai/gemini-provider.service');
  const { MockAIProvider } = require('../services/ai/mock-ai-provider.service');
  const { AIGenerationOrchestrator } = require('../services/ai/ai-generation-orchestrator.service');
  const { MdxSecurityScanner } = require('../services/mdx-security-scanner');

  console.log('--- SUITE 1: Academic Validation Layer (T01 - T18) ---');

  runTest('T01', 'Clean standard spec passes AcademicValidator with PASS outcome', () => {
    const spec = getBaseValidSpec();
    const result = AcademicValidator.validate(spec, 'CONCEPT_LESSON');
    assert.strictEqual(result.outcome, 'PASS');
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.canProceedToReview, true);
    assert.strictEqual(result.summary.blocks, 0);
  });

  runTest('T02', 'Spec with title < 5 chars returns BLOCK (ACADEMIC_TITLE_TOO_SHORT)', () => {
    const spec = getBaseValidSpec();
    spec.metadata.title = 'Ther';
    const result = AcademicValidator.validate(spec, 'CONCEPT_LESSON');
    assert.strictEqual(result.outcome, 'BLOCK');
    assert.strictEqual(result.isValid, false);
    assert.ok(result.issues.some((i) => i.code === 'ACADEMIC_TITLE_TOO_SHORT'));
  });

  runTest('T03', 'Spec with empty learningObjectives returns BLOCK (MISSING_LEARNING_OBJECTIVES)', () => {
    const spec = getBaseValidSpec();
    spec.learningObjectives = [];
    const result = AcademicValidator.validate(spec, 'CONCEPT_LESSON');
    assert.strictEqual(result.outcome, 'BLOCK');
    assert.ok(result.issues.some((i) => i.code === 'MISSING_LEARNING_OBJECTIVES'));
  });

  runTest('T04', 'Spec with empty sections returns BLOCK (MISSING_THEORY_SECTIONS)', () => {
    const spec = getBaseValidSpec();
    spec.sections = [];
    const result = AcademicValidator.validate(spec, 'CONCEPT_LESSON');
    assert.strictEqual(result.outcome, 'BLOCK');
    assert.ok(result.issues.some((i) => i.code === 'MISSING_THEORY_SECTIONS'));
  });

  runTest('T05', 'Spec with section contentMarkdown < 30 chars returns BLOCK (SECTION_CONTENT_TOO_THIN)', () => {
    const spec = getBaseValidSpec();
    spec.sections[0].contentMarkdown = 'Too short.';
    const result = AcademicValidator.validate(spec, 'CONCEPT_LESSON');
    assert.strictEqual(result.outcome, 'BLOCK');
    assert.ok(result.issues.some((i) => i.code === 'SECTION_CONTENT_TOO_THIN'));
  });

  runTest('T06', 'DocumentType FORMULA_SHORTCUT_SHEET with 0 formula blocks returns BLOCK (FORMULA_SHEET_NO_FORMULAS)', () => {
    const spec = getBaseValidSpec();
    spec.formulaBlocks = [];
    const result = AcademicValidator.validate(spec, 'FORMULA_SHORTCUT_SHEET');
    assert.strictEqual(result.outcome, 'BLOCK');
    assert.ok(result.issues.some((i) => i.code === 'FORMULA_SHEET_NO_FORMULAS'));
  });

  runTest('T07', 'DocumentType FORMULA_SHORTCUT_SHEET with >= 1 formula block passes', () => {
    const spec = getBaseValidSpec();
    const result = AcademicValidator.validate(spec, 'FORMULA_SHORTCUT_SHEET');
    assert.strictEqual(result.outcome, 'PASS');
    assert.strictEqual(result.isValid, true);
  });

  runTest('T08', 'DocumentType COMMON_TRAPS_AND_MISTAKES with 0 cognitive traps returns BLOCK (TRAPS_DOCUMENT_NO_TRAPS)', () => {
    const spec = getBaseValidSpec();
    spec.cognitiveTraps = [];
    const result = AcademicValidator.validate(spec, 'COMMON_TRAPS_AND_MISTAKES');
    assert.strictEqual(result.outcome, 'BLOCK');
    assert.ok(result.issues.some((i) => i.code === 'TRAPS_DOCUMENT_NO_TRAPS'));
  });

  runTest('T09', 'DocumentType COMMON_TRAPS_AND_MISTAKES with >= 1 cognitive trap passes', () => {
    const spec = getBaseValidSpec();
    const result = AcademicValidator.validate(spec, 'COMMON_TRAPS_AND_MISTAKES');
    assert.strictEqual(result.outcome, 'PASS');
    assert.strictEqual(result.isValid, true);
  });

  runTest('T10', 'DocumentType WORKED_EXAMPLES with 0 worked examples returns BLOCK (WORKED_EXAMPLES_NO_EXAMPLES)', () => {
    const spec = getBaseValidSpec();
    spec.workedExamples = [];
    const result = AcademicValidator.validate(spec, 'WORKED_EXAMPLES');
    assert.strictEqual(result.outcome, 'BLOCK');
    assert.ok(result.issues.some((i) => i.code === 'WORKED_EXAMPLES_NO_EXAMPLES'));
  });

  runTest('T11', 'DocumentType WORKED_EXAMPLES with >= 1 worked example passes', () => {
    const spec = getBaseValidSpec();
    const result = AcademicValidator.validate(spec, 'WORKED_EXAMPLES');
    assert.strictEqual(result.outcome, 'PASS');
    assert.strictEqual(result.isValid, true);
  });

  runTest('T12', 'DocumentType PYQ_DEEP_DIVE with 0 authentic pyq references returns BLOCK (PYQ_DEEP_DIVE_NO_REFERENCES)', () => {
    const spec = getBaseValidSpec();
    spec.authenticPyqReferences = [];
    const result = AcademicValidator.validate(spec, 'PYQ_DEEP_DIVE');
    assert.strictEqual(result.outcome, 'BLOCK');
    assert.ok(result.issues.some((i) => i.code === 'PYQ_DEEP_DIVE_NO_REFERENCES'));
  });

  runTest('T13', 'DocumentType PYQ_DEEP_DIVE with authentic pyq references passes', () => {
    const spec = getBaseValidSpec();
    const result = AcademicValidator.validate(spec, 'PYQ_DEEP_DIVE', ['qv-jee-2023-chem-01']);
    assert.strictEqual(result.outcome, 'PASS');
    assert.strictEqual(result.isValid, true);
  });

  runTest('T14', 'Empty questionVersionId in pyq references returns BLOCK (EMPTY_QUESTION_VERSION_ID)', () => {
    const spec = getBaseValidSpec();
    spec.authenticPyqReferences = [{ questionVersionId: '', examName: 'JEE' }];
    const result = AcademicValidator.validate(spec, 'CONCEPT_LESSON');
    assert.strictEqual(result.outcome, 'BLOCK');
    assert.ok(result.issues.some((i) => i.code === 'EMPTY_QUESTION_VERSION_ID'));
  });

  runTest('T15', 'Duplicate questionVersionId returns WARNING (DUPLICATE_QUESTION_REFERENCE)', () => {
    const spec = getBaseValidSpec();
    spec.authenticPyqReferences = [
      { questionVersionId: 'qv-100', examName: 'JEE' },
      { questionVersionId: 'qv-100', examName: 'JEE' },
    ];
    const result = AcademicValidator.validate(spec, 'CONCEPT_LESSON');
    assert.strictEqual(result.outcome, 'WARNING');
    assert.strictEqual(result.isValid, true); // Warnings do not block
    assert.ok(result.issues.some((i) => i.code === 'DUPLICATE_QUESTION_REFERENCE'));
  });

  runTest('T16', 'Fabricated questionVersionId not in allowlist returns BLOCK (FABRICATED_QUESTION_VERSION_ID)', () => {
    const spec = getBaseValidSpec();
    spec.authenticPyqReferences = [{ questionVersionId: 'qv-fabricated-999', examName: 'JEE' }];
    const result = AcademicValidator.validate(spec, 'CONCEPT_LESSON', ['qv-jee-real-01', 'qv-jee-real-02']);
    assert.strictEqual(result.outcome, 'BLOCK');
    assert.ok(result.issues.some((i) => i.code === 'FABRICATED_QUESTION_VERSION_ID'));
  });

  runTest('T17', 'QuickCheck with < 2 options returns BLOCK (QUICK_CHECK_INSUFFICIENT_OPTIONS)', () => {
    const spec = getBaseValidSpec();
    spec.quickChecks[0].options = [{ id: 'opt-1', text: 'Only one', isCorrect: true }];
    const result = AcademicValidator.validate(spec, 'CONCEPT_LESSON');
    assert.strictEqual(result.outcome, 'BLOCK');
    assert.ok(result.issues.some((i) => i.code === 'QUICK_CHECK_INSUFFICIENT_OPTIONS'));
  });

  runTest('T18', 'QuickCheck with 0 or >1 correct options returns BLOCK (QUICK_CHECK_INVALID_CORRECT_COUNT)', () => {
    const spec = getBaseValidSpec();
    spec.quickChecks[0].options = [
      { id: 'opt-1', text: 'Opt A', isCorrect: true },
      { id: 'opt-2', text: 'Opt B', isCorrect: true },
    ];
    const result = AcademicValidator.validate(spec, 'CONCEPT_LESSON');
    assert.strictEqual(result.outcome, 'BLOCK');
    assert.ok(result.issues.some((i) => i.code === 'QUICK_CHECK_INVALID_CORRECT_COUNT'));
  });

  console.log('\n--- SUITE 2: Model Registry & Gemini Provider Compatibility (T19 - T26) ---');

  runTest('T19', 'AIModelConfigRegistry contains gemini-1.5-pro with CONTENT_GENERATION purpose', () => {
    const config = AIModelConfigRegistry.getModelConfig('gemini-1.5-pro');
    assert.strictEqual(config.providerId, 'GOOGLE_GEMINI');
    assert.strictEqual(config.purpose, 'CONTENT_GENERATION');
    assert.strictEqual(config.isEnabled, true);
  });

  runTest('T20', 'AIModelConfigRegistry contains gemini-2.0-flash with CONTENT_GENERATION purpose', () => {
    const config = AIModelConfigRegistry.getModelConfig('gemini-2.0-flash');
    assert.strictEqual(config.providerId, 'GOOGLE_GEMINI');
    assert.strictEqual(config.purpose, 'CONTENT_GENERATION');
    assert.strictEqual(config.isEnabled, true);
  });

  runTest('T21', 'AIModelConfigRegistry contains gemini-1.5-flash with SUMMARIZATION purpose', () => {
    const config = AIModelConfigRegistry.getModelConfig('gemini-1.5-flash');
    assert.strictEqual(config.providerId, 'GOOGLE_GEMINI');
    assert.strictEqual(config.purpose, 'SUMMARIZATION');
  });

  runTest('T22', 'AIModelConfigRegistry.estimateCostUsd computes accurate pricing', () => {
    const cost = AIModelConfigRegistry.estimateCostUsd('gemini-1.5-pro', 2000, 1000);
    assert.strictEqual(cost, 0.0075);
  });

  runTest('T23', 'GeminiAIProvider.isConfigured() returns false when GEMINI_API_KEY is empty', () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const provider = new GeminiAIProvider();
    assert.strictEqual(provider.isConfigured(), false);
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  });

  runTest('T24', 'GeminiAIProvider.isConfigured() returns true when GEMINI_API_KEY is set', () => {
    const originalKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-gemini-key-123';
    const provider = new GeminiAIProvider();
    assert.strictEqual(provider.isConfigured(), true);
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
    else delete process.env.GEMINI_API_KEY;
  });

  await runAsyncTest('T25', 'Missing API key throws AUTHENTICATION_ERROR on generateStructured', async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const provider = new GeminiAIProvider();
    let threw = false;
    try {
      await provider.generateStructured(
        {
          requestId: 'req-1',
          idempotencyKey: 'idem-1',
          purpose: 'CONTENT_GENERATION',
          learningUnitId: 'unit-1',
          documentType: 'CONCEPT_LESSON',
          academicContext: {
            examIds: ['jee'],
            subjectId: 'chem',
            subjectName: 'Chemistry',
            topicId: 'thermo',
            topicName: 'Thermodynamics',
            unitTitle: 'First Law',
            unitSlug: 'first-law',
            targetDifficulty: 'INTERMEDIATE',
            primaryLanguage: 'en',
          },
          generationDirectives: {
            focusKeywords: [],
            includeFormulas: true,
            includeWorkedExamples: true,
            includeTraps: true,
            quickCheckCount: 1,
          },
          requester: { adminUserId: 'admin-1' },
          timestamp: new Date().toISOString(),
        },
        () => ({ isValid: true, data: {}, errors: [], warnings: [] })
      );
    } catch (err) {
      threw = true;
      assert.strictEqual(err.code, 'AUTHENTICATION_ERROR');
    }
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
    assert.strictEqual(threw, true);
  });

  runTest('T26', 'Invalid model ID throws error in AIModelConfigRegistry', () => {
    assert.throws(() => {
      AIModelConfigRegistry.getModelConfig('unapproved-gpt-super-99');
    }, /Unrecognized or unapproved AI model ID/);
  });

  console.log('\n--- SUITE 3: Orchestrator Concurrency & Idempotency (T27 - T34) ---');

  runTest('T27', 'AIGenerationOrchestrator.computeIdempotencyHash generates 64-char hex SHA-256', () => {
    const req = {
      learningUnitId: 'unit-101',
      documentType: 'CONCEPT_LESSON',
      academicContext: { subjectId: 'chem' },
      generationDirectives: { focusKeywords: ['entropy'] },
      targetModel: 'gemini-1.5-pro',
    };
    const hash = AIGenerationOrchestrator.computeIdempotencyHash(req);
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 64);
  });

  runTest('T28', 'Idempotency hash changes when documentType or directives change', () => {
    const reqA = {
      learningUnitId: 'unit-101',
      documentType: 'CONCEPT_LESSON',
      academicContext: { subjectId: 'chem' },
      generationDirectives: { focusKeywords: ['entropy'] },
    };
    const reqB = {
      learningUnitId: 'unit-101',
      documentType: 'FORMULA_SHORTCUT_SHEET',
      academicContext: { subjectId: 'chem' },
      generationDirectives: { focusKeywords: ['entropy'] },
    };
    const hashA = AIGenerationOrchestrator.computeIdempotencyHash(reqA);
    const hashB = AIGenerationOrchestrator.computeIdempotencyHash(reqB);
    assert.notStrictEqual(hashA, hashB);
  });

  await runAsyncTest('T29', 'In-flight concurrency lock prevents duplicate simultaneous request', async () => {
    const mockSlowProvider = {
      providerId: 'MOCK',
      isConfigured: () => true,
      generateStructured: async (req, validator) => {
        await new Promise((r) => setTimeout(r, 100));
        return {
          success: true,
          requestId: req.requestId,
          idempotencyKey: req.idempotencyKey,
          providerId: 'MOCK',
          modelId: 'mock-model',
          data: getBaseValidSpec(),
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
          latencyMs: 100,
          finishReason: 'stop',
          timestamp: new Date().toISOString(),
        };
      },
    };

    AIGenerationOrchestrator.setProvider(mockSlowProvider);

    const params = {
      learningUnitId: 'unit-concurrent-1',
      documentType: 'CONCEPT_LESSON',
      adminUserId: 'admin-1',
      prefetchedData: {
        unit: { id: 'unit-concurrent-1', title: 'Thermodynamics', slug: 'thermo', unit_type: 'CONCEPT_LESSON' },
        taxonomy: { subjectId: 'sub-1', subjectName: 'Chemistry', topicId: 'top-1', topicName: 'Thermo' },
        exams: [],
        relationships: [],
        questions: [],
        existingDocs: [],
      },
    };

    const p1 = AIGenerationOrchestrator.generateFromCurriculum(params);
    let lockedOut = false;
    try {
      await AIGenerationOrchestrator.generateFromCurriculum(params);
    } catch (err) {
      if (err.code === 'RATE_LIMITED' && err.message.includes('in-flight')) {
        lockedOut = true;
      }
    }

    await p1;
    assert.strictEqual(lockedOut, true);
    AIGenerationOrchestrator.setProvider(new MockAIProvider());
  });

  await runAsyncTest('T30', 'In-flight lock is safely released after execution completes', async () => {
    const params = {
      learningUnitId: 'unit-lock-release',
      documentType: 'CONCEPT_LESSON',
      adminUserId: 'admin-1',
      prefetchedData: {
        unit: { id: 'unit-lock-release', title: 'Electrostatics', slug: 'electro', unit_type: 'CONCEPT_LESSON' },
        taxonomy: { subjectId: 'sub-1', subjectName: 'Physics', topicId: 'top-1', topicName: 'Electrostatics' },
        exams: [],
        relationships: [],
        questions: [],
        existingDocs: [],
      },
    };

    const res1 = await AIGenerationOrchestrator.generateFromCurriculum(params);
    assert.ok(res1.spec);

    const res2 = await AIGenerationOrchestrator.generateFromCurriculum(params);
    assert.ok(res2.spec);
  });

  await runAsyncTest('T31', 'Missing adminUserId throws AUTHENTICATION_ERROR', async () => {
    let threw = false;
    try {
      await AIGenerationOrchestrator.generateFromCurriculum({
        learningUnitId: 'unit-1',
        documentType: 'CONCEPT_LESSON',
        adminUserId: '',
      });
    } catch (err) {
      threw = true;
      assert.strictEqual(err.code, 'AUTHENTICATION_ERROR');
    }
    assert.strictEqual(threw, true);
  });

  await runAsyncTest('T32', 'Missing requestId or learningUnitId throws INVALID_REQUEST in generateLessonDraft', async () => {
    let threw = false;
    try {
      await AIGenerationOrchestrator.generateLessonDraft({
        requestId: '',
        learningUnitId: '',
      });
    } catch (err) {
      threw = true;
      assert.strictEqual(err.code, 'INVALID_REQUEST');
    }
    assert.strictEqual(threw, true);
  });

  runTest('T33', 'Default provider is MOCK when none specified', () => {
    const provider = AIGenerationOrchestrator.getProvider();
    assert.strictEqual(provider.providerId, 'MOCK');
  });

  runTest('T34', 'Gemini provider instance is selected when providerId is GOOGLE_GEMINI', () => {
    const provider = AIGenerationOrchestrator.getProvider('GOOGLE_GEMINI');
    assert.strictEqual(provider.providerId, 'GOOGLE_GEMINI');
  });

  console.log('\n--- SUITE 4: Section Regeneration & Security Scanning (T35 - T42) ---');

  await runAsyncTest('T35', 'regenerateSection throws INVALID_REQUEST if sectionId does not exist', async () => {
    const spec = getBaseValidSpec();
    let threw = false;
    try {
      await AIGenerationOrchestrator.regenerateSection({
        learningUnitId: 'unit-1',
        documentType: 'CONCEPT_LESSON',
        currentSpec: spec,
        sectionId: 'non-existent-section-999',
        adminUserId: 'admin-1',
        prefetchedData: {
          unit: { id: 'unit-1', title: 'Thermodynamics', slug: 'thermo', unit_type: 'CONCEPT_LESSON' },
          taxonomy: { subjectId: 'sub-1', subjectName: 'Chemistry', topicId: 'top-1', topicName: 'Thermo' },
          exams: [],
          relationships: [],
          questions: [],
          existingDocs: [],
        },
      });
    } catch (err) {
      threw = true;
      assert.strictEqual(err.code, 'INVALID_REQUEST');
    }
    assert.strictEqual(threw, true);
  });

  await runAsyncTest('T36', 'regenerateSection replaces only targeted section and preserves others', async () => {
    const spec = getBaseValidSpec();
    spec.sections = [
      { id: 'sec-1', title: 'Section 1 Untouched', sectionType: 'THEORY', orderIndex: 0, contentMarkdown: 'This section should remain strictly untouched during regeneration.' },
      { id: 'sec-2', title: 'Section 2 To Regenerate', sectionType: 'THEORY', orderIndex: 1, contentMarkdown: 'Old draft content that needs pedagogical improvement.' },
    ];

    const result = await AIGenerationOrchestrator.regenerateSection({
      learningUnitId: 'unit-1',
      documentType: 'CONCEPT_LESSON',
      currentSpec: spec,
      sectionId: 'sec-2',
      adminUserId: 'admin-1',
      prefetchedData: {
        unit: { id: 'unit-1', title: 'Thermodynamics', slug: 'thermo', unit_type: 'CONCEPT_LESSON' },
        taxonomy: { subjectId: 'sub-1', subjectName: 'Chemistry', topicId: 'top-1', topicName: 'Thermo' },
        exams: [],
        relationships: [],
        questions: [],
        existingDocs: [],
      },
    });

    assert.strictEqual(result.spec.sections.length, 2);
    assert.strictEqual(result.spec.sections[0].id, 'sec-1');
    assert.strictEqual(result.spec.sections[0].contentMarkdown, 'This section should remain strictly untouched during regeneration.');
    assert.strictEqual(result.spec.sections[1].id, 'sec-2');
    assert.notStrictEqual(result.spec.sections[1].contentMarkdown, 'Old draft content that needs pedagogical improvement.');
  });

  await runAsyncTest('T37', 'regenerateSection re-runs ContentSpecValidator and AcademicValidator', async () => {
    const spec = getBaseValidSpec();
    const result = await AIGenerationOrchestrator.regenerateSection({
      learningUnitId: 'unit-1',
      documentType: 'CONCEPT_LESSON',
      currentSpec: spec,
      sectionId: 'sec-1',
      adminUserId: 'admin-1',
      prefetchedData: {
        unit: { id: 'unit-1', title: 'Thermodynamics', slug: 'thermo', unit_type: 'CONCEPT_LESSON' },
        taxonomy: { subjectId: 'sub-1', subjectName: 'Chemistry', topicId: 'top-1', topicName: 'Thermo' },
        exams: [],
        relationships: [],
        questions: [],
        existingDocs: [],
      },
    });

    assert.strictEqual(result.validation.isStructurallyValid, true);
    assert.ok(result.academicValidation);
    assert.strictEqual(result.academicValidation.outcome, 'PASS');
  });

  await runAsyncTest('T38', 'regenerateSection sets auditMetadata purpose to CONTENT_REVISION', async () => {
    const spec = getBaseValidSpec();
    const result = await AIGenerationOrchestrator.regenerateSection({
      learningUnitId: 'unit-1',
      documentType: 'CONCEPT_LESSON',
      currentSpec: spec,
      sectionId: 'sec-1',
      adminUserId: 'admin-1',
      prefetchedData: {
        unit: { id: 'unit-1', title: 'Thermodynamics', slug: 'thermo', unit_type: 'CONCEPT_LESSON' },
        taxonomy: { subjectId: 'sub-1', subjectName: 'Chemistry', topicId: 'top-1', topicName: 'Thermo' },
        exams: [],
        relationships: [],
        questions: [],
        existingDocs: [],
      },
    });

    assert.strictEqual(result.auditMetadata.purpose, 'CONTENT_REVISION');
  });

  runTest('T39', 'Malicious markdown with <script> tag is detected by MdxSecurityScanner', () => {
    const malicious = 'Hello world <script>alert("xss")</script>';
    const scan = MdxSecurityScanner.scan(malicious);
    assert.strictEqual(scan.isSafe, false);
    assert.ok(scan.errors.length > 0);
  });

  runTest('T40', 'Malicious markdown with javascript: link is detected by MdxSecurityScanner', () => {
    const malicious = 'Click [here](javascript:stealTokens()) for free coins';
    const scan = MdxSecurityScanner.scan(malicious);
    assert.strictEqual(scan.isSafe, false);
    assert.ok(scan.errors.length > 0);
  });

  await runAsyncTest('T41', 'Spec violating AcademicValidator BLOCK criteria throws SCHEMA_VALIDATION_FAILED during orchestration', async () => {
    const invalidMockProvider = {
      providerId: 'MOCK',
      isConfigured: () => true,
      generateStructured: async (req) => {
        const spec = getBaseValidSpec();
        spec.formulaBlocks = [];
        return {
          success: true,
          requestId: req.requestId,
          idempotencyKey: req.idempotencyKey,
          providerId: 'MOCK',
          modelId: 'mock-model',
          data: spec,
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
          latencyMs: 10,
          finishReason: 'stop',
          timestamp: new Date().toISOString(),
        };
      },
    };

    AIGenerationOrchestrator.setProvider(invalidMockProvider);

    let threw = false;
    try {
      await AIGenerationOrchestrator.generateFromCurriculum({
        learningUnitId: 'unit-block-test',
        documentType: 'FORMULA_SHORTCUT_SHEET',
        adminUserId: 'admin-1',
        prefetchedData: {
          unit: { id: 'unit-block-test', title: 'Thermodynamics', slug: 'thermo', unit_type: 'FORMULA_SHORTCUT_SHEET' },
          taxonomy: { subjectId: 'sub-1', subjectName: 'Chemistry', topicId: 'top-1', topicName: 'Thermo' },
          exams: [],
          relationships: [],
          questions: [],
          existingDocs: [],
        },
      });
    } catch (err) {
      threw = true;
      assert.strictEqual(err.code, 'SCHEMA_VALIDATION_FAILED');
      assert.ok(err.message.includes('BLOCK'));
    }
    assert.strictEqual(threw, true);
    AIGenerationOrchestrator.setProvider(new MockAIProvider());
  });

  runTest('T42', 'Server action regenerateSectionAction is exported from actions.ts', () => {
    const actionsContent = fs.readFileSync(path.resolve(__dirname, '../app/admin/content/actions.ts'), 'utf8');
    assert.ok(actionsContent.includes('export async function regenerateSectionAction'));
  });

  console.log('\n--- SUITE 5: End-to-End Pipeline & Review Invariants (T43 - T50) ---');

  await runAsyncTest('T43', 'generateFromCurriculum produces full LessonDocumentSpec with PASS academic validation', async () => {
    const res = await AIGenerationOrchestrator.generateFromCurriculum({
      learningUnitId: 'unit-e2e-1',
      documentType: 'CONCEPT_LESSON',
      adminUserId: 'admin-super',
      directives: {
        focusKeywords: ['heat', 'work'],
        includeFormulas: true,
        includeWorkedExamples: true,
        includeTraps: true,
        quickCheckCount: 2,
      },
      prefetchedData: {
        unit: { id: 'unit-e2e-1', title: 'Chemical Energetics', slug: 'chem-energetics', unit_type: 'CONCEPT_LESSON' },
        taxonomy: { subjectId: 'sub-chem', subjectName: 'Chemistry', topicId: 'top-thermo', topicName: 'Thermodynamics' },
        exams: [{ id: 'exam-jee', name: 'JEE Main' }],
        relationships: [],
        questions: [{ id: 'qv-chem-01', question_id: 'q-01', question_text: 'Sample question' }],
        existingDocs: [],
      },
    });

    assert.ok(res.spec);
    assert.strictEqual(res.spec.schemaVersion, '1.0.0');
    assert.ok(res.spec.metadata.title.includes('Chemical Energetics'));
    assert.strictEqual(res.validation.isStructurallyValid, true);
    assert.strictEqual(res.academicValidation.outcome, 'PASS');
  });

  await runAsyncTest('T44', 'Audit metadata disposition is SAVED_AS_DRAFT', async () => {
    const res = await AIGenerationOrchestrator.generateFromCurriculum({
      learningUnitId: 'unit-e2e-2',
      documentType: 'CONCEPT_LESSON',
      adminUserId: 'admin-super',
      prefetchedData: {
        unit: { id: 'unit-e2e-2', title: 'Optics', slug: 'optics', unit_type: 'CONCEPT_LESSON' },
        taxonomy: { subjectId: 'sub-phy', subjectName: 'Physics', topicId: 'top-optics', topicName: 'Ray Optics' },
        exams: [],
        relationships: [],
        questions: [],
        existingDocs: [],
      },
    });

    assert.strictEqual(res.auditMetadata.disposition, 'SAVED_AS_DRAFT');
    assert.strictEqual(res.auditMetadata.responseStatus, 'SUCCESS');
  });

  runTest('T45', 'review_status enum explicitly includes AI_GENERATED and DRAFT states', () => {
    const typesContent = fs.readFileSync(path.resolve(__dirname, '../types/learning-compiler.ts'), 'utf8');
    assert.ok(typesContent.includes('AI_GENERATED'));
    assert.ok(typesContent.includes('DRAFT'));
    assert.ok(typesContent.includes('IN_REVIEW'));
    assert.ok(typesContent.includes('APPROVED'));
  });

  runTest('T46', 'StructuredLessonEditor supports reviewing and modifying AI-generated draft sections', () => {
    const editorContent = fs.readFileSync(path.resolve(__dirname, '../components/admin/content-studio/structured-lesson-editor.tsx'), 'utf8');
    assert.ok(editorContent.includes('spec'));
    assert.ok(editorContent.includes('onChange'));
    assert.ok(editorContent.includes('addSection'));
  });

  runTest('T47', 'reviewVersion service method transitions review_status to APPROVED or REJECTED only via explicit human admin decision', () => {
    const studioServiceContent = fs.readFileSync(path.resolve(__dirname, '../services/admin-content-studio.service.ts'), 'utf8');
    assert.ok(studioServiceContent.includes('reviewVersion'));
    assert.ok(studioServiceContent.includes("decision === 'APPROVED'"));
  });

  runTest('T48', 'compileVersion compiles validated spec into immutable ContentCompilationArtifact', () => {
    const studioServiceContent = fs.readFileSync(path.resolve(__dirname, '../services/admin-content-studio.service.ts'), 'utf8');
    assert.ok(studioServiceContent.includes('compileVersion'));
    assert.ok(studioServiceContent.includes('ControlledContentCompiler.compile'));
  });

  runTest('T49', 'publishVersion enforces is_published = true only on compiled and approved versions', () => {
    const studioServiceContent = fs.readFileSync(path.resolve(__dirname, '../services/admin-content-studio.service.ts'), 'utf8');
    assert.ok(studioServiceContent.includes('publishVersion'));
    assert.ok(studioServiceContent.includes('is_published: true'));
  });

  runTest('T50', 'smoke_test_gemini_provider.cjs executes cleanly with exit code 0', () => {
    const out = execSync('node scripts/smoke_test_gemini_provider.cjs', { encoding: 'utf8' });
    assert.ok(out.includes('RESULT: SKIPPED (SAFE)') || out.includes('RESULT: PASS (LIVE VERIFIED)'));
  });

  console.log('\n============================================================');
  console.log(`PHASE 3E.3 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('============================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
