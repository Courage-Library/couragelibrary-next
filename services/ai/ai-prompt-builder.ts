/**
 * COURAGE LIBRARY — AI PROMPT ARCHITECTURE & TEMPLATE BUILDER
 * Phase 3E.2: Curriculum Context Builder & First Production Provider
 * 
 * Constructs provider-independent prompts separating system rules,
 * authoritative academic data, document-type strategies, admin directives,
 * and strict LessonDocumentSpec output schemas.
 * Synchronized with CanonicalSpecSchemaService.
 */

import { CurriculumAIContext } from '@/types/ai-curriculum-context';
import { DocumentType } from '@/types/learning-compiler';
import { CanonicalSpecSchemaService } from './canonical-spec-schema.service';

export class AIPromptBuilder {
  /**
   * Builds the complete prompt instruction bundle for LLM generation.
   */
  static buildPrompt(context: CurriculumAIContext, documentType: DocumentType): {
    systemInstruction: string;
    userPrompt: string;
  } {
    const subjectCategory = CanonicalSpecSchemaService.detectSubjectCategory(context);
    const pedagogicalRule = CanonicalSpecSchemaService.getSubjectPedagogicalRule(subjectCategory);

    const systemInstruction = `You are the Courage Library Educational AI Authoring Engine.
Your role is to author structured, pedagogically sound, competitive-exam lesson content strictly targeting the Indian government examination syllabus (SSC CGL, UPSC CSAT, Banking, Railways).

SACRED INVARIANTS:
1. You are a content draft author, NOT the academic authority.
2. NEVER invent Question Bank IDs or asset IDs. Use ONLY the canonical IDs provided in the context.
3. Obey the specified Required Depth (${context.requiredDepth}).
4. Output MUST be valid, complete JSON conforming to LessonDocumentSpec.
5. Do NOT include markdown fences (like \`\`\`json) outside or inside JSON properties.
6. Provide accurate domain equations and LaTeX ($...$ or $$...$$) where academically appropriate.
7. Tone must be encouraging, razor-sharp, analytical, and tailored to high-speed competitive test-takers.`;

    const docTypeSpecificDirectives = this.getDocumentTypeDirectives(documentType);
    const jsonSchemaString = CanonicalSpecSchemaService.generateJsonSchemaString(context, documentType);

    const userPrompt = `<AUTHORITATIVE_ACADEMIC_CONTEXT>
Learning Unit ID: ${context.learningUnit.id}
Unit Title: ${context.learningUnit.title}
Unit Slug: ${context.learningUnit.slug}
Taxonomy Path: ${context.taxonomy.canonicalPath}
Required Depth: ${context.requiredDepth}
Target Exam(s): ${context.examContext.map((e) => `${e.examName} (${e.requiredDepth})`).join(', ') || 'General Competitive'}

Prerequisites:
${context.relationships.prerequisites.map((p) => `- Topic ID: "${p.topicId}" | "${p.topicName}" [${p.strength}]: ${p.notes || 'Foundational knowledge'}`).join('\n') || 'None'}

Authoritative Question Bank References (Use these exact questionVersionId values):
${context.questionReferences.map((q) => `- questionVersionId: "${q.questionVersionId}", Text: "${q.questionTextSnippet}", Difficulty: ${q.difficultyTier}`).join('\n') || 'None provided'}

Approved Existing Content References:
${context.existingLearningReferences.map((c) => `- Version ID: "${c.versionId}", Title: "${c.title}"`).join('\n') || 'None provided'}
</AUTHORITATIVE_ACADEMIC_CONTEXT>

<DOCUMENT_TYPE_DIRECTIVES>
Target Document Type: ${documentType}
${docTypeSpecificDirectives}
Pedagogical Rule: ${pedagogicalRule}
</DOCUMENT_TYPE_DIRECTIVES>

<ADMIN_GENERATION_DIRECTIVES>
Focus Keywords: ${context.generationDirectives.focusKeywords?.join(', ') || 'Core concepts'}
Include Formulas: ${context.generationDirectives.includeFormulas ? 'YES' : 'NO'}
Include Worked Examples: ${context.generationDirectives.includeWorkedExamples ? 'YES' : 'NO'}
Include Common Traps: ${context.generationDirectives.includeTraps ? 'YES' : 'NO'}
Quick Checks Count: ${context.generationDirectives.quickCheckCount || 2}
Custom Admin Note: ${context.generationDirectives.customInstructions || 'Standard curriculum emphasis'}
</ADMIN_GENERATION_DIRECTIVES>

<OUTPUT_SCHEMA_INSTRUCTION>
Generate a complete JSON object adhering strictly to the LessonDocumentSpec contract:
${jsonSchemaString}
</OUTPUT_SCHEMA_INSTRUCTION>`;

    return {
      systemInstruction,
      userPrompt,
    };
  }

  private static getDocumentTypeDirectives(documentType: DocumentType): string {
    switch (documentType) {
      case 'FORMULA_SHORTCUT_SHEET':
        return '- Heavily prioritize formulaBlocks, speedShortcutTricks, variable definitions, and boundary conditions.\n- Include minimal narrative theory; emphasize rapid exam recall.';
      case 'COMMON_TRAPS_AND_MISTAKES':
        return '- Heavily prioritize cognitiveTraps and Warning callouts.\n- Clearly distinguish standard calculation slips, sign confusions, and distractor traps with step-by-step counter-examples.';
      case 'WORKED_EXAMPLES':
        return '- Include at least 3 comprehensive workedExamples with step-by-step breakdowns, exam shortcuts, and common mistakes to avoid.';
      case 'PYQ_DEEP_DIVE':
        return '- Link directly to authentic Question Bank references provided in the context.\n- Provide deep multi-tier solution walkthroughs with speed tricks.';
      case 'TOPIC_SUMMARY_REVISION':
        return '- Provide crisp bulleted revisionSummary key takeaways, speed rules, and high-yield formulas.';
      case 'CONCEPT_LESSON':
      default:
        return '- Provide balanced conceptual explanation, foundational derivations, visual callout boxes, formulas, worked examples, and quick checks.';
    }
  }
}
