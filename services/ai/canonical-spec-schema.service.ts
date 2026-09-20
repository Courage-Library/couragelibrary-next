/**
 * COURAGE LIBRARY — CANONICAL LESSON SPEC SCHEMA SERVICE
 * Phase 3E.4: External AI Authoring & Structured Content Import System
 * 
 * Centralized, authoritative JSON schema generator for LessonDocumentSpec.
 * Eliminates schema duplication and drift across ExternalAIContentPromptBuilder
 * and AIPromptBuilder.
 * 
 * INVARIANTS:
 * 1. Single source of truth for prompt JSON output contracts.
 * 2. Dynamically derives prerequisite topic IDs from actual knowledge graph relations.
 * 3. Dynamically derives authentic questionVersionId references from canonical context.
 * 4. Adapts pedagogical objectives and examples to Subject (Quant, Reasoning, English, General Awareness).
 * 5. Strictly matches ContentSpecValidator structural constraints (1.0.0 contract).
 */

import { CurriculumAIContext } from '@/types/ai-curriculum-context';
import { DocumentType } from '@/types/learning-compiler';

export type SubjectCategory =
  | 'QUANTITATIVE_APTITUDE'
  | 'REASONING'
  | 'ENGLISH_LANGUAGE'
  | 'GENERAL_AWARENESS';

export class CanonicalSpecSchemaService {
  /**
   * Identifies subject category from taxonomy naming or canonical path
   */
  static detectSubjectCategory(context: CurriculumAIContext): SubjectCategory {
    const raw = `${context.taxonomy.subjectName || ''} ${context.taxonomy.canonicalPath || ''} ${context.taxonomy.topicName || ''}`.toLowerCase();

    if (
      raw.includes('reason') ||
      raw.includes('logic') ||
      raw.includes('analogy') ||
      raw.includes('coding-decod') ||
      raw.includes('syllogism') ||
      raw.includes('puzzle')
    ) {
      return 'REASONING';
    }

    if (
      raw.includes('english') ||
      raw.includes('grammar') ||
      raw.includes('vocabulary') ||
      raw.includes('comprehension') ||
      raw.includes('verbal') ||
      raw.includes('idiom')
    ) {
      return 'ENGLISH_LANGUAGE';
    }

    if (
      raw.includes('general awareness') ||
      raw.includes('general studies') ||
      raw.includes('history') ||
      raw.includes('polity') ||
      raw.includes('geography') ||
      raw.includes('economy') ||
      raw.includes('science') ||
      raw.includes('current affairs')
    ) {
      return 'GENERAL_AWARENESS';
    }

    return 'QUANTITATIVE_APTITUDE';
  }

  /**
   * Subject-aware default learning objectives
   */
  static getSubjectLearningObjectives(
    context: CurriculumAIContext,
    category: SubjectCategory
  ): string[] {
    const title = context.learningUnit.title || context.taxonomy.topicName || 'this topic';

    switch (category) {
      case 'REASONING':
        return [
          `Master core pattern recognition rules and analytical structures of ${title}`,
          'Apply deductive elimination and high-speed solving shortcuts',
          'Avoid common distractor traps and false deduction errors',
        ];
      case 'ENGLISH_LANGUAGE':
        return [
          `Master grammatical conventions and contextual vocabulary rules of ${title}`,
          'Identify sentence construction patterns and error types',
          'Eliminate common usage misconceptions and idiom confusion',
        ];
      case 'GENERAL_AWARENESS':
        return [
          `Master foundational historical, constitutional, or scientific facts of ${title}`,
          'Understand core concepts, cause-and-effect relationships, and key timelines',
          'Eliminate factual misconceptions and deceptive distractor options',
        ];
      case 'QUANTITATIVE_APTITUDE':
      default:
        return [
          `Master core definitions, principles, and formulas of ${title}`,
          'Apply speed calculation shortcuts and algebraic techniques to exam problems',
          'Eliminate calculation slips and sign errors under exam time pressure',
        ];
    }
  }

  /**
   * Subject-aware pedagogical sequence rule
   */
  static getSubjectPedagogicalRule(category: SubjectCategory): string {
    switch (category) {
      case 'REASONING':
        return 'Pattern Rule / Core Logic -> Recognition Cues -> Step-by-Step Problem -> Deductive Shortcut -> Distractor Trap Warning -> Quick Check.';
      case 'ENGLISH_LANGUAGE':
        return 'Grammatical Rule / Concept -> Contextual Usage -> Sentence Application Example -> Error Elimination Shortcut -> Common Usage Trap -> Quick Check.';
      case 'GENERAL_AWARENESS':
        return 'Conceptual Framework -> Factual Timeline / Core Facts -> Analytical Context -> Memory Hook -> Misconception Trap -> Quick Check.';
      case 'QUANTITATIVE_APTITUDE':
      default:
        return 'Intuition / Core Concept -> Mathematical Rule / Formula -> Step-by-Step Example -> Speed Shortcut -> Calculation Trap Warning -> Quick Check.';
    }
  }

  /**
   * Generates a fully populated, machine-readable JSON schema string matching LessonDocumentSpec.
   */
  static generateJsonSchemaString(
    context: CurriculumAIContext,
    documentType: DocumentType
  ): string {
    const category = this.detectSubjectCategory(context);
    const objectives = this.getSubjectLearningObjectives(context, category);

    // Derive authentic prerequisites or empty array
    let prerequisitesJson = '[]';
    if (context.relationships?.prerequisites && context.relationships.prerequisites.length > 0) {
      prerequisitesJson = JSON.stringify(
        context.relationships.prerequisites.map((p) => ({
          topicId: p.topicId,
          conceptSummary: p.notes || `Foundational understanding of ${p.topicName}`,
        })),
        null,
        2
      );
    }

    // Derive authentic question references or empty array
    let pyqRefsJson = '[]';
    if (context.questionReferences && context.questionReferences.length > 0) {
      pyqRefsJson = JSON.stringify(
        context.questionReferences.map((q) => ({
          questionVersionId: q.questionVersionId,
          relevanceRationale: q.relevanceRationale || `Canonical exam benchmark from ${q.examContext || 'Question Bank'}`,
        })),
        null,
        2
      );
    }

    // Subject-tailored sample section & formula/rule content
    let sampleFormulaBlocks = `[
    {
      "id": "f-1",
      "name": "Core Governing Rule / Identity",
      "latexFormula": "P(A \\\\cup B) = P(A) + P(B) - P(A \\\\cap B)",
      "variableDefinitions": [
        { "symbol": "P(A)", "meaning": "Probability of event A" },
        { "symbol": "P(B)", "meaning": "Probability of event B" }
      ],
      "applicableConditions": ["Events are defined in the same sample space"],
      "speedShortcutTrick": "For mutually exclusive events: P(A \\\\cup B) = P(A) + P(B)."
    }
  ]`;

    let sampleWorkedExamples = `[
    {
      "id": "ex-1",
      "difficulty": "MEDIUM",
      "problemText": "Standard competitive examination problem statement...",
      "stepByStepSolution": [
        {
          "stepNumber": 1,
          "explanation": "Initial problem analysis and state identification",
          "mathSnippet": "Step 1 equation or deduction"
        },
        {
          "stepNumber": 2,
          "explanation": "Application of core principle or shortcut method",
          "mathSnippet": "Final simplified answer"
        }
      ],
      "shortcutMethod": "15-second exam elimination or shortcut technique",
      "commonMistakeToAvoid": "Common misconception or trap to avoid on this problem"
    }
  ]`;

    let sampleCognitiveTraps = `[
    {
      "trapType": "CALCULATION_SLIP",
      "misconception": "Common misconception description",
      "correctApproach": "Correct methodology and reasoning"
    }
  ]`;

    if (category === 'ENGLISH_LANGUAGE') {
      sampleFormulaBlocks = `[
    {
      "id": "rule-1",
      "name": "Subject-Verb Agreement Rule",
      "latexFormula": "\\\\text{Singular Subject} \\\\implies \\\\text{Singular Verb}",
      "variableDefinitions": [
        { "symbol": "Subject", "meaning": "Singular noun or pronoun" },
        { "symbol": "Verb", "meaning": "Third-person singular verb (e.g. is, has, runs)" }
      ],
      "applicableConditions": ["Applies to third person present tense constructions"],
      "speedShortcutTrick": "Ignore intervening prepositional phrases (e.g., 'along with', 'as well as')."
    }
  ]`;

      sampleCognitiveTraps = `[
    {
      "trapType": "MISREAD_KEYWORD",
      "misconception": "Matching the verb to the nearest noun rather than the true subject.",
      "correctApproach": "Isolate the core subject by crossing out parenthetical phrases."
    }
  ]`;
    } else if (category === 'REASONING') {
      sampleFormulaBlocks = `[
    {
      "id": "rule-1",
      "name": "Opposite Letter Pairs Rule",
      "latexFormula": "\\\\text{Position}_1 + \\\\text{Position}_2 = 27",
      "variableDefinitions": [
        { "symbol": "Position_1", "meaning": "Forward alphabetical rank (A=1)" },
        { "symbol": "Position_2", "meaning": "Reverse alphabetical rank (Z=1)" }
      ],
      "applicableConditions": ["Standard 26-letter English alphabet"],
      "speedShortcutTrick": "Opposite of letter with rank N is letter with rank (27 - N)."
    }
  ]`;

      sampleCognitiveTraps = `[
    {
      "trapType": "DISTRACTOR_TRAP",
      "misconception": "Assuming symmetrical shift without verifying direction (+2 followed by -2).",
      "correctApproach": "Write positional numbers above letters before selecting answer choice."
    }
  ]`;
    }

    return `{
  "schemaVersion": "1.0.0",
  "documentId": "${context.learningUnit.id}",
  "unitSlug": "${context.learningUnit.slug}",
  "language": "${context.language?.requestedLanguage || 'en'}",
  "metadata": {
    "title": "${context.learningUnit.title}",
    "topicId": "${context.taxonomy.topicId}",
    "subjectId": "${context.taxonomy.subjectId}",
    "targetExamCategories": ${JSON.stringify(context.examContext?.map((e) => e.examId) || [])},
    "estimatedReadingMinutes": ${context.learningUnit.estimatedMinutes || 10},
    "difficultyTier": "${context.generationDirectives?.targetDifficultyTier || 'INTERMEDIATE'}",
    "authoritativeKeywords": ${JSON.stringify(context.generationDirectives?.focusKeywords || [context.learningUnit.slug])}
  },
  "learningObjectives": ${JSON.stringify(objectives, null, 2)},
  "prerequisites": ${prerequisitesJson},
  "sections": [
    {
      "id": "sec-1",
      "title": "1. Conceptual Foundations",
      "sectionType": "THEORY",
      "contentMarkdown": "Rich instructional content explaining core concepts with exam-focused precision (minimum 30 characters)...",
      "calloutNotes": [
        {
          "variant": "TIP",
          "title": "High-Yield Exam Tip",
          "body": "Actionable shortcut, memory hook, or speed rule."
        }
      ]
    }
  ],
  "formulaBlocks": ${sampleFormulaBlocks},
  "workedExamples": ${sampleWorkedExamples},
  "cognitiveTraps": ${sampleCognitiveTraps},
  "authenticPyqReferences": ${pyqRefsJson},
  "quickChecks": [
    {
      "id": "qc-1",
      "prompt": "Conceptual diagnostic question prompt testing student understanding?",
      "options": [
        { "id": "opt-1", "text": "Correct analytical option statement", "isCorrect": true, "feedbackExplanation": "Detailed explanation of why this choice is correct." },
        { "id": "opt-2", "text": "Distractor option statement", "isCorrect": false, "feedbackExplanation": "Explanation identifying the specific trap in this option." }
      ]
    }
  ],
  "revisionSummary": {
    "keyTakeaways": [
      "Core takeaway 1: Foundational principle definition",
      "Core takeaway 2: Key condition of applicability"
    ],
    "coreFormulas": [
      "Rule / Formula 1 summary"
    ],
    "speedRules": [
      "High-speed recognition cue or elimination shortcut"
    ]
  },
  "seo": {
    "metaTitle": "${context.learningUnit.title} — Comprehensive Study Notes",
    "metaDescription": "Complete study guide, shortcut techniques, and error prevention for ${context.learningUnit.title}.",
    "focusKeywords": ${JSON.stringify(context.generationDirectives?.focusKeywords || [context.learningUnit.slug])}
  }
}`;
  }
}
