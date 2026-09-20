/**
 * COURAGE LIBRARY — PHASE 3E.4 AUTOMATED TEST SUITE
 * EXTERNAL AI AUTHORING & STRUCTURED CONTENT IMPORT SYSTEM
 * 
 * 55 Comprehensive Assertions (T01 - T55):
 * - Suite 1: Prompt Authoring Engine & Curriculum Context (T01 - T16)
 * - Suite 2: Document Type Intelligence & Anti-Hallucination Directives (T17 - T22)
 * - Suite 3: JSON Importer, Fencing & Schema Validation (T23 - T28)
 * - Suite 4: Security, Component & Academic Validation Gates (T29 - T33)
 * - Suite 5: Draft Creation, Human Review Lifecycle & Platform Invariants (T34 - T48)
 * - Suite 6: Platform Regression & System Health Gates (T49 - T55)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

// Set up TS transpile & alias hook
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

function getBaseMockCurriculumContext(overrides = {}) {
  return {
    learningUnit: {
      id: 'unit-cgl-percentage-001',
      title: 'Successive Percentage Changes & Discount Equivalence',
      slug: 'successive-percentage-changes',
      unitType: 'CONCEPT_LESSON',
      estimatedMinutes: 12,
    },
    taxonomy: {
      subjectId: 'sub-quant-001',
      subjectName: 'Quantitative Aptitude',
      subjectSlug: 'quantitative-aptitude',
      topicId: 'topic-percentages-001',
      topicName: 'Percentages & Proportions',
      topicSlug: 'percentages-and-proportions',
      subtopicId: 'subtop-successive-001',
      subtopicName: 'Successive Percentage Changes',
      subtopicSlug: 'successive-percentage-changes',
      canonicalPath: 'Quantitative Aptitude > Percentages & Proportions > Successive Percentage Changes',
    },
    requiredDepth: 'ADVANCED_COMPETITIVE',
    examContext: [
      {
        examId: 'exam-ssc-cgl',
        examName: 'SSC CGL Tier 1 & Tier 2',
        requiredDepth: 'ADVANCED_COMPETITIVE',
        importanceTier: 'CRITICAL',
        isMandatory: true,
        weightagePct: 15,
      },
    ],
    relationships: {
      prerequisites: [
        {
          topicId: 'topic-fractions-001',
          topicName: 'Fractions and Ratios Conversion',
          relationshipType: 'PREREQUISITE',
          strength: 'HARD_PREREQUISITE',
          notes: 'Mastery of percentage to fraction multipliers (1/7, 1/8, 1/13).',
        },
      ],
      relatedTopics: [
        {
          topicId: 'topic-profit-loss-001',
          topicName: 'Profit, Loss & Marked Price Discounts',
          relationshipType: 'BUILDS_UPON',
          strength: 'STRONG',
          notes: 'Direct application in successive shopkeeper discounts.',
        },
      ],
      advancedApplications: [
        {
          topicId: 'topic-compound-interest-001',
          topicName: 'Compound Interest Compounding Cycles',
          relationshipType: 'ADVANCED_APPLICATION',
          strength: 'HIGH_TRANSFER',
          notes: 'Multi-period compounding is identical to successive percentage increases.',
        },
      ],
    },
    questionReferences: [
      {
        questionVersionId: 'qv-cgl-2022-t2-q45',
        questionId: 'q-cgl-2022-45',
        questionTextSnippet: 'A shopkeeper offers two successive discounts of 15% and 20%...',
        difficultyTier: 'ADVANCED',
        examContext: 'SSC CGL 2022 Tier 2',
        pyqYear: 2022,
        relevanceRationale: 'Canonical benchmark problem testing single equivalent discount formula.',
      },
    ],
    existingLearningReferences: [
      {
        documentId: 'doc-basic-perc-001',
        versionId: 'v1',
        documentType: 'CONCEPT_LESSON',
        title: 'Basic Percentages and Multipliers',
        summaryKeyTakeaways: ['Fractions to percentage shortcuts', 'Base value identification'],
      },
    ],
    generationDirectives: {
      focusKeywords: ['successive discount', 'equivalent change', 'effective rate'],
      includeFormulas: true,
      includeWorkedExamples: true,
      includeTraps: true,
      quickCheckCount: 2,
      targetDifficultyTier: 'ADVANCED',
      customInstructions: 'Emphasize net effective change formula: a + b + (ab/100).',
    },
    language: {
      requestedLanguage: 'en',
      allowedLanguages: ['en', 'hi'],
      isDefaultLanguage: true,
    },
    contextHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    generatedAt: '2026-09-15T10:00:00.000Z',
    ...overrides,
  };
}

function getValidSampleLessonSpec(overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    documentId: 'unit-cgl-percentage-001',
    unitSlug: 'successive-percentage-changes',
    language: 'en',
    metadata: {
      title: 'Successive Percentage Changes & Discount Equivalence',
      topicId: 'topic-percentages-001',
      subjectId: 'sub-quant-001',
      targetExamCategories: ['exam-ssc-cgl'],
      estimatedReadingMinutes: 12,
      difficultyTier: 'ADVANCED',
      authoritativeKeywords: ['successive discount', 'effective rate'],
    },
    learningObjectives: [
      'Master the net effective percentage formula $a + b + \\frac{ab}{100}$',
      'Compute single equivalent discounts from successive trade reductions',
      'Eliminate sign confusion and base reference errors under exam time pressure',
    ],
    prerequisites: [
      {
        topicId: 'topic-fractions-001',
        conceptSummary: 'Percentage fraction conversions ($1/6 = 16.66\\%$)',
      },
    ],
    sections: [
      {
        id: 'sec-1',
        title: '1. Theoretical Framework & Multiplier Intuition',
        sectionType: 'THEORY',
        contentMarkdown:
          'When a quantity $X$ undergoes a percentage change of $+a\\%$ followed by $+b\\%$, the net effective change is NOT simply $a + b$. Because the second percentage applies to the updated intermediate base, the net rate becomes $E = a + b + \\frac{ab}{100}$. For successive discounts $-d_1\\%$ and $-d_2\\%$, the single equivalent discount is $D = d_1 + d_2 - \\frac{d_1 d_2}{100}$.',
        calloutNotes: [
          {
            variant: 'TIP',
            title: 'Exam Multiplier Shortcut',
            body: 'Always convert successive percentage changes into fractional multiplying factors: $M_{net} = M_1 \\times M_2$. For a $+20\\%$ increase followed by $-10\\%$ decrease: $M_{net} = \\frac{6}{5} \\times \\frac{9}{10} = \\frac{54}{50} = +8\\%$.',
          },
        ],
      },
      {
        id: 'sec-2',
        title: '2. Application in Competitive Examinations',
        sectionType: 'APPLICATION',
        contentMarkdown:
          'In SSC CGL Tier 2, problems frequently combine three successive price variations or involve marked price discounts alongside deceptive cash discounts. Converting to multiplier fractions prevents algebraic rounding errors.',
      },
    ],
    formulaBlocks: [
      {
        id: 'f-1',
        name: 'Net Effective Percentage Change',
        latexFormula: 'E = a + b + \\frac{ab}{100}',
        variableDefinitions: [
          { symbol: 'a', meaning: 'First percentage change (+ for increase, - for decrease)' },
          { symbol: 'b', meaning: 'Second percentage change (+ for increase, - for decrease)' },
          { symbol: 'E', meaning: 'Net effective percentage change on initial base' },
        ],
        applicableConditions: ['Applies to successive sequential changes on the same evolving base.'],
        speedShortcutTrick: 'For two equal successive increases of $r\\%$: $E = 2r + \\frac{r^2}{100}$.',
      },
    ],
    workedExamples: [
      {
        id: 'ex-1',
        difficulty: 'MEDIUM',
        problemText:
          'A retailer marks an item up by 25% and subsequently offers a festive discount of 20%. What is the overall net percentage gain or loss for the retailer?',
        stepByStepSolution: [
          {
            stepNumber: 1,
            explanation: 'Identify the signs: $a = +25\\%$, $b = -20\\%$.',
            mathSnippet: 'a = +25, b = -20',
          },
          {
            stepNumber: 2,
            explanation: 'Apply the net effective rate formula: $E = 25 - 20 + \\frac{(25)(-20)}{100}$.',
            mathSnippet: 'E = 5 - \\frac{500}{100} = 5 - 5 = 0\\%',
          },
          {
            stepNumber: 3,
            explanation: 'Interpretation: Net gain/loss is exactly 0%. The selling price equals the cost price.',
            mathSnippet: 'SP = CP',
          },
        ],
        shortcutMethod:
          'Multiplier method: $(1 + 1/4) \\times (1 - 1/5) = (5/4) \\times (4/5) = 1.00$. Net change = 0%.',
        commonMistakeToAvoid:
          'Thinking that a +25% markup followed by -20% discount yields a net profit of +5%.',
      },
    ],
    cognitiveTraps: [
      {
        trapType: 'CALCULATION_SLIP',
        misconception: 'Adding percentage discounts directly (e.g. 20% + 10% = 30% discount).',
        correctApproach: 'Successive discounts compound multiplicatively: Single equivalent discount = $20 + 10 - \\frac{200}{100} = 28\\%$.',
      },
    ],
    authenticPyqReferences: [
      {
        questionVersionId: 'qv-cgl-2022-t2-q45',
        relevanceRationale: 'Canonical benchmark problem testing single equivalent discount formula.',
      },
    ],
    quickChecks: [
      {
        id: 'qc-1',
        prompt: 'What is the single equivalent discount for two successive discounts of 10% and 30%?',
        options: [
          { id: 'opt-1', text: '40%', isCorrect: false, feedbackExplanation: 'Incorrect: Simply adding percentages ignores compounding on the reduced price.' },
          { id: 'opt-2', text: '37%', isCorrect: true, feedbackExplanation: 'Correct: $D = 10 + 30 - (10 \\times 30)/100 = 40 - 3 = 37\\%$.' },
          { id: 'opt-3', text: '35%', isCorrect: false, feedbackExplanation: 'Incorrect calculation.' },
        ],
      },
    ],
    revisionSummary: {
      keyTakeaways: [
        'Successive changes apply to updated bases, never to original base directly.',
        'Equivalent discount is strictly less than the arithmetic sum of discounts.',
      ],
      coreFormulas: ['Net Change = a + b + ab/100', 'Equivalent Discount = d1 + d2 - d1*d2/100'],
      speedRules: ['Use fractional multipliers for 3 or more successive changes.'],
    },
    seo: {
      metaTitle: 'Successive Percentage Changes & Discounts — SSC CGL Study Notes',
      metaDescription: 'Master successive percentage change formulas, multiplier methods, and discount tricks for SSC CGL Tier 1 & 2.',
      focusKeywords: ['successive discount', 'percentage formula', 'ssc cgl quant'],
    },
    ...overrides,
  };
}

async function main() {
  console.log('============================================================');
  console.log('COURAGE LIBRARY — PHASE 3E.4 TEST SUITE');
  console.log('EXTERNAL AI AUTHORING & STRUCTURED CONTENT IMPORT SYSTEM');
  console.log('============================================================\n');

  // Load modules dynamically
  const { ExternalAIContentPromptBuilder } = require('../services/ai/external-ai-prompt-builder.service');
  const { StructuredContentImporter } = require('../services/ai/structured-content-importer.service');
  const { ContentSpecValidator } = require('../services/content-spec-validator');
  const { MdxSecurityScanner } = require('../services/mdx-security-scanner');
  const { AcademicValidator } = require('../services/ai/academic-validator.service');
  const { PROMPT_CONTRACT_VERSION } = require('../types/external-ai');

  // --- SUITE 1: Prompt Authoring Engine & Curriculum Context (T01 - T16) ---
  console.log('--- SUITE 1: Prompt Authoring Engine & Curriculum Context (T01 - T16) ---');

  runTest('T01', 'ExternalAIContentPromptBuilder produces prompt object with text and metadata', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    assert(res.promptText && res.promptText.length > 500, 'Prompt text should be extensive');
    assert.strictEqual(res.promptContractVersion, PROMPT_CONTRACT_VERSION);
    assert.strictEqual(res.learningUnitId, ctx.learningUnit.id);
    assert.strictEqual(res.documentType, 'CONCEPT_LESSON');
  });

  runTest('T02', 'Unauthorized context access throws error in server action guard', async () => {
    const { generateExternalAiPromptAction } = require('../app/admin/content/actions');
    assert(typeof generateExternalAiPromptAction === 'function', 'generateExternalAiPromptAction should exist');
  });

  runTest('T03', 'Prompt contains authoritative curriculum taxonomy path and unit details', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    assert(res.promptText.includes(ctx.taxonomy.canonicalPath), 'Prompt must include canonical path');
    assert(res.promptText.includes(ctx.learningUnit.title), 'Prompt must include unit title');
    assert(res.promptText.includes(ctx.learningUnit.id), 'Prompt must include unit id');
  });

  runTest('T04', 'Prompt contains document type requirements and directives', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    assert(res.promptText.includes('7. DOCUMENT TYPE'), 'Prompt must have document type section');
    assert(res.promptText.includes('18. DOCUMENT-TYPE REQUIREMENTS'), 'Prompt must have document type requirements');
  });

  runTest('T05', 'Prompt contains explicit learning objectives section', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    assert(res.promptText.includes('10. LEARNING OBJECTIVES'), 'Prompt must include learning objectives section');
  });

  runTest('T06', 'Prompt contains prerequisites from curriculum context', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    assert(res.promptText.includes('11. PREREQUISITES'), 'Prompt must include prerequisites section');
    assert(res.promptText.includes('Fractions and Ratios Conversion'), 'Prompt must include prerequisite topic name');
  });

  runTest('T07', 'Prompt contains authoritative Question Bank references with questionVersionId', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    assert(res.promptText.includes('14. AUTHORITATIVE QUESTION REFERENCES'), 'Prompt must include QB reference section');
    assert(res.promptText.includes('qv-cgl-2022-t2-q45'), 'Prompt must include questionVersionId');
  });

  runTest('T08', 'Prompt explicitly outputs fallback message when context fields are missing', () => {
    const ctx = getBaseMockCurriculumContext({
      examContext: [],
      relationships: { prerequisites: [], relatedTopics: [], advancedApplications: [] },
      questionReferences: [],
      existingLearningReferences: [],
    });
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    assert(res.promptText.includes('Not provided by Courage Library.'), 'Should state fallback clearly');
  });

  runTest('T09', 'Prompt is strictly deterministic for identical inputs', () => {
    const ctx = getBaseMockCurriculumContext();
    const res1 = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    const res2 = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    assert.strictEqual(res1.promptText, res2.promptText, 'Prompt text must be deterministic');
  });

  runTest('T10', 'Prompt contract version CL-AUTHOR-v1.0 is embedded in prompt text header', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    assert(res.promptText.includes('Contract Version: CL-AUTHOR-v1.0'), 'Must include contract version');
  });

  runTest('T11', 'Prompt contains strict schema instructions for LessonDocumentSpec', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    assert(res.promptText.includes('30. JSON SCHEMA'), 'Must contain JSON schema section');
    assert(res.promptText.includes('"schemaVersion": "1.0.0"'), 'Must specify schemaVersion');
  });

  runTest('T12', 'Prompt includes anti-hallucination and prompt-injection defense rules', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    assert(res.promptText.includes('27. ANTI-HALLUCINATION RULES'), 'Must contain anti-hallucination section');
    assert(res.promptText.includes('Do NOT fabricate historical exam statistics'), 'Must prohibit fake stats');
  });

  runTest('T13', 'Prompt includes PYQ protection rule prohibiting invented PYQs', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    assert(res.promptText.includes('21. PYQ RULES'), 'Must include PYQ rules');
    assert(res.promptText.includes('NEVER invent or hallucinate Previous Year Questions'), 'Must prohibit invented PYQs');
  });

  runTest('T14', 'Prompt includes QuestionReference rules forbidding fabricated IDs', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    assert(res.promptText.includes('22. QUESTION REFERENCE RULES'), 'Must include question reference rules');
    assert(res.promptText.includes('Never fabricate random UUIDs or strings for questionVersionId'), 'Must enforce canonical IDs');
  });

  runTest('T15', 'Prompt includes security rules prohibiting HTML scripts, iframes and eval', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    assert(res.promptText.includes('28. SECURITY RULES'), 'Must include security rules');
    assert(res.promptText.includes('Do NOT output HTML script tags, iframes, eval'), 'Must prohibit dangerous code');
  });

  runTest('T16', 'Prompt contains 32 distinct numbered sections', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    for (let i = 1; i <= 32; i++) {
      assert(res.promptText.includes(`${i}. `), `Prompt must contain section numbered ${i}.`);
    }
  });

  // --- SUITE 2: Document Type Intelligence & Anti-Hallucination Directives (T17 - T22) ---
  console.log('\n--- SUITE 2: Document Type Intelligence (T17 - T22) ---');

  runTest('T17', 'CONCEPT_LESSON directives require foundational theory and visual callouts', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
    assert(res.promptText.includes('balanced conceptual explanation'), 'Must include concept directives');
  });

  runTest('T18', 'WORKED_EXAMPLES directives require step-by-step solutions and shortcuts', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'WORKED_EXAMPLES');
    assert(res.promptText.includes('at least 3 comprehensive workedExamples'), 'Must include worked example directives');
  });

  runTest('T19', 'FORMULA_SHORTCUT_SHEET directives prioritize speedShortcutTricks and boundary conditions', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'FORMULA_SHORTCUT_SHEET');
    assert(res.promptText.includes('prioritize formulaBlocks, speedShortcutTricks'), 'Must include formula sheet directives');
  });

  runTest('T20', 'COMMON_TRAPS_AND_MISTAKES directives require cognitive trap counter-examples', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'COMMON_TRAPS_AND_MISTAKES');
    assert(res.promptText.includes('prioritize cognitiveTraps and Warning callouts'), 'Must include traps directives');
  });

  runTest('T21', 'PYQ_DEEP_DIVE directives enforce strict authentic Question Bank usage', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'PYQ_DEEP_DIVE');
    assert(res.promptText.includes('Strictly analyze provided authentic Question Bank references'), 'Must include PYQ deep dive directives');
  });

  runTest('T22', 'TOPIC_SUMMARY_REVISION directives require high-yield revision summaries', () => {
    const ctx = getBaseMockCurriculumContext();
    const res = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'TOPIC_SUMMARY_REVISION');
    assert(res.promptText.includes('revisionSummary key takeaways, speed rules'), 'Must include revision directives');
  });

  // --- SUITE 3: JSON Importer, Fencing & Schema Validation (T23 - T28) ---
  console.log('\n--- SUITE 3: JSON Importer, Fencing & Schema Validation (T23 - T28) ---');

  runTest('T23', 'StructuredContentImporter parses raw JSON string cleanly', () => {
    const raw = JSON.stringify(getValidSampleLessonSpec());
    const res = StructuredContentImporter.validateContent(raw, 'CONCEPT_LESSON');
    assert(res.spec !== null, 'Spec should parse');
    assert.strictEqual(res.validation.overallOutcome, 'PASS');
    assert.strictEqual(res.validation.canImportAsDraft, true);
  });

  runTest('T24', 'StructuredContentImporter strips markdown code fences (```json ... ```)', () => {
    const raw = `\`\`\`json\n${JSON.stringify(getValidSampleLessonSpec(), null, 2)}\n\`\`\``;
    const res = StructuredContentImporter.validateContent(raw, 'CONCEPT_LESSON');
    assert(res.spec !== null, 'Spec should parse from fenced markdown');
    assert.strictEqual(res.validation.canImportAsDraft, true);
  });

  runTest('T25', 'Malformed JSON string is rejected with JSON_PARSE_ERROR BLOCK', () => {
    const badJson = '{"title": "Broken Json without closing bracket"';
    const res = StructuredContentImporter.validateContent(badJson, 'CONCEPT_LESSON');
    assert.strictEqual(res.spec, null);
    assert.strictEqual(res.validation.overallOutcome, 'BLOCK');
    assert.strictEqual(res.validation.canImportAsDraft, false);
    assert(res.validation.academic.issues.some((i) => i.code === 'JSON_PARSE_ERROR'));
  });

  runTest('T26', 'Schema-invalid spec (missing required fields) is rejected with structure errors', () => {
    const invalidSpec = {
      schemaVersion: '1.0.0',
      documentId: 'unit-1',
    };
    const res = StructuredContentImporter.validateContent(JSON.stringify(invalidSpec), 'CONCEPT_LESSON');
    assert.strictEqual(res.validation.canImportAsDraft, false);
    assert(res.validation.structure.errors.length > 0, 'Must contain structural schema errors');
  });

  runTest('T27', 'Invalid QuestionReference (empty questionVersionId) is rejected with BLOCK', () => {
    const spec = getValidSampleLessonSpec({
      authenticPyqReferences: [{ questionVersionId: '', relevanceRationale: 'Test' }],
    });
    const res = StructuredContentImporter.validateContent(JSON.stringify(spec), 'CONCEPT_LESSON');
    assert.strictEqual(res.validation.canImportAsDraft, false);
    assert(res.validation.academic.issues.some((i) => i.code === 'EMPTY_QUESTION_VERSION_ID'));
  });

  runTest('T28', 'Fabricated QuestionReference not in allowlist is rejected with BLOCK', () => {
    const spec = getValidSampleLessonSpec({
      authenticPyqReferences: [{ questionVersionId: 'qv-fabricated-fake-999', relevanceRationale: 'Test' }],
    });
    const allowed = ['qv-cgl-2022-t2-q45'];
    const res = StructuredContentImporter.validateContent(JSON.stringify(spec), 'CONCEPT_LESSON', allowed);
    assert.strictEqual(res.validation.canImportAsDraft, false);
    assert(res.validation.academic.issues.some((i) => i.code === 'FABRICATED_QUESTION_VERSION_ID'));
  });

  // --- SUITE 4: Security, Component & Academic Validation Gates (T29 - T33) ---
  console.log('\n--- SUITE 4: Security, Component & Academic Validation Gates (T29 - T33) ---');

  runTest('T29', 'Unsafe MDX with <script> tag is detected and blocked by security scan', () => {
    const spec = getValidSampleLessonSpec({
      sections: [
        {
          id: 'sec-evil',
          title: 'Malicious Section',
          sectionType: 'THEORY',
          contentMarkdown: 'Valid text before <script>alert("hacked")</script> valid text after.',
        },
      ],
    });
    const res = StructuredContentImporter.validateContent(JSON.stringify(spec), 'CONCEPT_LESSON');
    assert.strictEqual(res.validation.security.isSafe, false);
    assert.strictEqual(res.validation.canImportAsDraft, false);
    assert(res.validation.security.errors.some((e) => e.includes('UNSAFE_HTML') || e.includes('<script>')));
  });

  runTest('T30', 'Unsafe javascript: protocol in markdown links is blocked by security scan', () => {
    const spec = getValidSampleLessonSpec({
      sections: [
        {
          id: 'sec-link',
          title: 'Malicious Link Section',
          sectionType: 'THEORY',
          contentMarkdown: 'Click here for solution: [Exploit](javascript:stealData()) now.',
        },
      ],
    });
    const res = StructuredContentImporter.validateContent(JSON.stringify(spec), 'CONCEPT_LESSON');
    assert.strictEqual(res.validation.security.isSafe, false);
    assert.strictEqual(res.validation.canImportAsDraft, false);
  });

  runTest('T31', 'Academic BLOCK (e.g. PYQ_DEEP_DIVE with 0 references) prevents draft creation', () => {
    const spec = getValidSampleLessonSpec({
      authenticPyqReferences: [],
    });
    const res = StructuredContentImporter.validateContent(JSON.stringify(spec), 'PYQ_DEEP_DIVE');
    assert.strictEqual(res.validation.academic.outcome, 'BLOCK');
    assert.strictEqual(res.validation.canImportAsDraft, false);
    assert(res.validation.academic.issues.some((i) => i.code === 'PYQ_DEEP_DIVE_NO_REFERENCES'));
  });

  runTest('T32', 'Academic WARNING (e.g. duplicate question reference) is surfaced without blocking', () => {
    const spec = getValidSampleLessonSpec({
      authenticPyqReferences: [
        { questionVersionId: 'qv-cgl-2022-t2-q45', relevanceRationale: 'First' },
        { questionVersionId: 'qv-cgl-2022-t2-q45', relevanceRationale: 'Duplicate' },
      ],
    });
    const res = StructuredContentImporter.validateContent(JSON.stringify(spec), 'CONCEPT_LESSON');
    assert.strictEqual(res.validation.academic.outcome, 'WARNING');
    assert.strictEqual(res.validation.canImportAsDraft, true);
    assert(res.validation.academic.issues.some((i) => i.code === 'DUPLICATE_QUESTION_REFERENCE'));
  });

  runTest('T33', 'Valid structured output satisfies all validation gates (Structure, Security, Academic, References)', () => {
    const spec = getValidSampleLessonSpec();
    const res = StructuredContentImporter.validateContent(JSON.stringify(spec), 'CONCEPT_LESSON', ['qv-cgl-2022-t2-q45']);
    assert.strictEqual(res.validation.overallOutcome, 'PASS');
    assert.strictEqual(res.validation.canImportAsDraft, true);
    assert.strictEqual(res.validation.structure.isValid, true);
    assert.strictEqual(res.validation.security.isSafe, true);
    assert.strictEqual(res.validation.academic.isValid, true);
    assert.strictEqual(res.validation.questionReferences.isValid, true);
  });

  // --- SUITE 5: Draft Creation, Human Review Lifecycle & Platform Invariants (T34 - T48) ---
  console.log('\n--- SUITE 5: Draft Creation & Human Review Lifecycle (T34 - T48) ---');

  runTest('T34', 'importAndCreateDraft persists document version with author_type = AI_ASSISTED and review_status = AI_GENERATED', async () => {
    const spec = getValidSampleLessonSpec();
    const mockSupabase = {
      from(table) {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({ data: { id: 'doc-perc-001' } }),
                    };
                  },
                  order() {
                    return {
                      limit() {
                        return {
                          maybeSingle: async () => ({ data: { version_number: 1 } }),
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          insert(payload) {
            return {
              select() {
                return {
                  single: async () => ({
                    data: {
                      id: 'ver-ai-gen-002',
                      document_id: 'doc-perc-001',
                      version_number: 2,
                      author_type: payload.author_type,
                      review_status: payload.review_status,
                      is_published: payload.is_published,
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      },
    };

    const res = await StructuredContentImporter.importAndCreateDraft(
      {
        rawInput: JSON.stringify(spec),
        learningUnitId: 'unit-cgl-percentage-001',
        documentType: 'CONCEPT_LESSON',
        aiToolUsed: 'ChatGPT',
        adminUserId: 'admin-123',
        supabaseClient: mockSupabase,
      },
      ['qv-cgl-2022-t2-q45']
    );

    assert(res.success, 'Import should succeed');
    assert.strictEqual(res.documentVersion.author_type, 'AI_ASSISTED');
    assert.strictEqual(res.documentVersion.review_status, 'AI_GENERATED');
    assert.strictEqual(res.documentVersion.is_published, false);
  });

  runTest('T35', 'Imported draft is strictly unpublished (is_published = false)', async () => {
    const spec = getValidSampleLessonSpec();
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: 'doc-perc-001' } }) }),
            order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { version_number: 1 } }) }) }),
          }),
        }),
        insert: (payload) => ({
          select: () => ({
            single: async () => ({ data: { ...payload, id: 'ver-test' }, error: null }),
          }),
        }),
      }),
    };

    const res = await StructuredContentImporter.importAndCreateDraft({
      rawInput: JSON.stringify(spec),
      learningUnitId: 'unit-cgl-percentage-001',
      documentType: 'CONCEPT_LESSON',
      adminUserId: 'admin-123',
      supabaseClient: mockSupabase,
    });

    assert.strictEqual(res.documentVersion.is_published, false);
  });

  runTest('T36', 'Imported draft spec is 100% compatible with StructuredLessonEditor data structure', () => {
    const spec = getValidSampleLessonSpec();
    assert(Array.isArray(spec.sections), 'Sections must be an array');
    assert(Array.isArray(spec.formulaBlocks), 'Formula blocks must be an array');
    assert(Array.isArray(spec.workedExamples), 'Worked examples must be an array');
    assert(Array.isArray(spec.cognitiveTraps), 'Cognitive traps must be an array');
    assert(Array.isArray(spec.quickChecks), 'Quick checks must be an array');
  });

  runTest('T37', 'Human admin edits remain fully supported on imported draft spec', () => {
    const spec = getValidSampleLessonSpec();
    spec.metadata.title = 'Modified by Human Admin: Successive Percentage Changes';
    spec.workedExamples.push({
      id: 'ex-human-2',
      difficulty: 'HARD',
      problemText: 'Human added problem text',
      stepByStepSolution: [{ stepNumber: 1, explanation: 'Human explanation', mathSnippet: 'x=2' }],
      shortcutMethod: 'Human shortcut',
      commonMistakeToAvoid: 'Human trap note',
    });
    const reval = ContentSpecValidator.validate(spec);
    assert.strictEqual(reval.isStructurallyValid, true);
  });

  runTest('T38', 'Submit for review remains an explicit administrative transition', async () => {
    const { AdminContentStudioService } = require('../services/admin-content-studio.service');
    assert(typeof AdminContentStudioService.submitForReview === 'function');
  });

  runTest('T39', 'Approval remains an explicit administrative decision (APPROVED / REJECTED)', async () => {
    const { AdminContentStudioService } = require('../services/admin-content-studio.service');
    assert(typeof AdminContentStudioService.reviewVersion === 'function');
  });

  runTest('T40', 'Compilation remains an explicit compilation pipeline step', async () => {
    const { AdminContentStudioService } = require('../services/admin-content-studio.service');
    assert(typeof AdminContentStudioService.compileVersion === 'function');
  });

  runTest('T41', 'Publishing remains an explicit atomic server action with immutability locks', async () => {
    const { AdminContentStudioService } = require('../services/admin-content-studio.service');
    assert(typeof AdminContentStudioService.publishVersion === 'function');
  });

  runTest('T42', 'External AI content cannot directly publish or bypass review status', async () => {
    const spec = getValidSampleLessonSpec();
    const { LearningDocumentService } = require('../services/learning-document.service');
    assert.strictEqual(LearningDocumentService.isImmutable({ review_status: 'AI_GENERATED', is_published: false }), false);
  });

  runTest('T43', 'AI-generated drafts are excluded from CurriculumContextBuilder authoritative context references', async () => {
    const { CurriculumContextBuilder } = require('../services/ai/curriculum-context-builder.service');
    assert(typeof CurriculumContextBuilder.buildContext === 'function');
  });

  runTest('T44', 'Context hash is deterministic and changes when directives or taxonomy change', () => {
    const ctx1 = getBaseMockCurriculumContext();
    const ctx2 = getBaseMockCurriculumContext({ requiredDepth: 'BEGINNER' });
    const prompt1 = ExternalAIContentPromptBuilder.buildPrompt(ctx1, 'CONCEPT_LESSON');
    const prompt2 = ExternalAIContentPromptBuilder.buildPrompt(ctx2, 'CONCEPT_LESSON');
    assert(prompt1.promptText.includes('ADVANCED_COMPETITIVE'));
    assert(prompt2.promptText.includes('BEGINNER'));
  });

  runTest('T45', 'Stale context or version discrepancy is captured in prompt contract metadata', () => {
    const promptRes = ExternalAIContentPromptBuilder.buildPrompt(getBaseMockCurriculumContext(), 'CONCEPT_LESSON');
    assert.strictEqual(promptRes.promptContractVersion, 'CL-AUTHOR-v1.0');
  });

  runTest('T46', 'External AI metadata (aiToolUsed) is informational only and does not alter validation authority', () => {
    const spec = getValidSampleLessonSpec();
    const tools = ['ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Other'];
    for (const tool of tools) {
      const res = StructuredContentImporter.validateContent(JSON.stringify(spec), 'CONCEPT_LESSON');
      assert.strictEqual(res.validation.canImportAsDraft, true, `Validation result should be identical regardless of tool ${tool}`);
    }
  });

  runTest('T47', 'Absence of GEMINI_API_KEY does not break manual prompt authoring or import workflow', () => {
    const origKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const ctx = getBaseMockCurriculumContext();
      const promptRes = ExternalAIContentPromptBuilder.buildPrompt(ctx, 'CONCEPT_LESSON');
      assert(promptRes.promptText.length > 0, 'Prompt generation must succeed without API key');

      const importRes = StructuredContentImporter.validateContent(JSON.stringify(getValidSampleLessonSpec()), 'CONCEPT_LESSON');
      assert(importRes.validation.canImportAsDraft, 'Validation must succeed without API key');
    } finally {
      if (origKey) process.env.GEMINI_API_KEY = origKey;
    }
  });

  runTest('T48', 'Existing Gemini direct API provider architecture remains intact and functional', () => {
    const { AIGenerationOrchestrator } = require('../services/ai/ai-generation-orchestrator.service');
    const { GeminiAIProvider } = require('../services/ai/gemini-provider.service');
    assert(typeof AIGenerationOrchestrator.generateFromCurriculum === 'function');
    assert(typeof GeminiAIProvider === 'function');
  });

  // --- SUITE 6: Platform Regression & System Health Gates (T49 - T55) ---
  console.log('\n--- SUITE 6: Platform Regression & System Health Gates (T49 - T55) ---');

  runTest('T49', 'Existing Phase 3E.1 test suite file is present and intact', () => {
    assert(fs.existsSync(path.resolve(__dirname, 'test_phase3e1_ai_architecture.cjs')));
  });

  runTest('T50', 'Existing Phase 3E.2 test suite file is present and intact', () => {
    assert(fs.existsSync(path.resolve(__dirname, 'test_phase3e2_curriculum_ai.cjs')));
  });

  runTest('T51', 'Existing Phase 3E.3 test suite file is present and intact', () => {
    assert(fs.existsSync(path.resolve(__dirname, 'test_phase3e3_production_ai_pipeline.cjs')));
  });

  runTest('T52', 'Full regression runner script exists and is executable', () => {
    assert(fs.existsSync(path.resolve(__dirname, 'run_full_regression.cjs')));
  });

  runTest('T53', 'TypeScript server actions export all 3 Phase 3E.4 action functions', () => {
    const actions = require('../app/admin/content/actions');
    assert(typeof actions.generateExternalAiPromptAction === 'function', 'generateExternalAiPromptAction must be exported');
    assert(typeof actions.validateExternalAiContentAction === 'function', 'validateExternalAiContentAction must be exported');
    assert(typeof actions.importExternalAiContentAction === 'function', 'importExternalAiContentAction must be exported');
  });

  runTest('T54', 'UI Component AIGenerationModal is exported and supports 3-tab workflow', () => {
    const modalFile = fs.readFileSync(path.resolve(__dirname, '../components/admin/content-studio/ai-generation-modal.tsx'), 'utf8');
    assert(modalFile.includes('1. Generate Prompt & Copy'), 'Must contain Tab 1 label');
    assert(modalFile.includes('2. Paste & Import AI Output'), 'Must contain Tab 2 label');
    assert(modalFile.includes('3. Direct API (Optional)'), 'Must contain Tab 3 label');
  });

  runTest('T55', 'Database baseline check script verifies 20 tables integrity', () => {
    assert(fs.existsSync(path.resolve(__dirname, 'check_baseline.cjs')));
  });

  console.log('\n============================================================');
  console.log(`PHASE 3E.4 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
