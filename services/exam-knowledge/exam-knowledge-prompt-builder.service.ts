/**
 * COURAGE LIBRARY — EXAM KNOWLEDGE PROMPT BUILDER
 * Phase 3H.2: Exam Knowledge Context Builder & External AI Prompt Generator
 * 
 * Generates an authoritative, 16-section, self-contained, copyable prompt
 * adhering strictly to the CL-EXAM-AUTHOR-v1.0 prompt contract.
 * 
 * SACRED ARCHITECTURAL INVARIANTS:
 * 1. AI is an authoring assistant, NOT a source of truth for regulations, dates, or syllabus.
 * 2. Deterministic output for identical AuthoritativeExamContext inputs.
 * 3. Provider-neutral: Works identically across ChatGPT, Claude, Perplexity, Gemini, DeepSeek.
 * 4. Zero external API calls: Built for secure human-in-the-loop copy-paste workflows.
 * 5. Prompt injection defense: DB values and source texts are strictly isolated as DATA.
 */

import {
  AuthoritativeExamContext,
  ExamPromptResult,
  EXAM_PROMPT_CONTRACT_VERSION,
} from '@/types/exam-knowledge';

export class ExamKnowledgePromptBuilder {
  public static readonly CONTRACT_VERSION = EXAM_PROMPT_CONTRACT_VERSION;

  /**
   * Builds the 16-section deterministic prompt string.
   */
  static buildPrompt(context: AuthoritativeExamContext): ExamPromptResult {
    const fallback = 'Not provided in authoritative records.';
    const { target, exam, cycle, module, structuredFacts, canonicalCurriculum, questionBankContext, existingDocumentState, sourceContext, claimContext, authoringRequirements } = context;

    // 1. Format Patterns & Structured Facts
    const patternsList = structuredFacts.patterns.length > 0
      ? structuredFacts.patterns
          .map((p) => `- Pattern: "${p.name}" (Tier: ${p.tierName || 'N/A'}) | Duration: ${p.durationMinutes} min | Questions: ${p.totalQuestions} | Max Marks: ${p.totalMarks} | Negative Mark: -${p.negativeMarkValue}`)
          .join('\n')
      : fallback;

    const postsList = structuredFacts.posts.length > 0
      ? structuredFacts.posts
          .map((p) => `- Post: "${p.postName}" (${p.postCode || 'No Code'}) | Dept: "${p.department || 'N/A'}" | Group: ${p.classificationGroup || 'Group B/C'} | 7th CPC Pay Level: Level ${p.payLevel}${p.gradePay ? ` (Grade Pay: ₹${p.gradePay})` : ''} | Gazetted: ${p.isGazetted ? 'YES' : 'NO'}`)
          .join('\n')
      : fallback;

    const datesList = structuredFacts.dates.length > 0
      ? structuredFacts.dates
          .map((d) => `- ${d.label} [${d.eventKey}]: ${d.dateValue} (${d.isTentative ? 'TENTATIVE / UNCONFIRMED' : 'CONFIRMED OFFICIAL'})`)
          .join('\n')
      : fallback;

    const vacanciesList = structuredFacts.vacancies.length > 0
      ? structuredFacts.vacancies
          .map((v) => `- Category: ${v.category}${v.postName ? ` (Post: ${v.postName})` : ''} -> Vacancy Count: ${v.count}`)
          .join('\n')
      : fallback;

    // 2. Format Canonical Curriculum
    const subjectsList = canonicalCurriculum.subjects.length > 0
      ? canonicalCurriculum.subjects.map((s) => `- Subject: "${s.name}" (Slug: ${s.slug}, Canonical Topics: ${s.topicsCount})`).join('\n')
      : fallback;

    const topicsList = canonicalCurriculum.topics.length > 0
      ? canonicalCurriculum.topics.map((t) => `- Topic: "${t.name}" [Subject: ${t.subjectName}] (Required Depth: ${t.depth}${t.weightage ? `, Weightage: ${t.weightage}%` : ''})`).join('\n')
      : fallback;

    // 3. Format Question Bank References
    const questionsList = questionBankContext?.questionReferences && questionBankContext.questionReferences.length > 0
      ? questionBankContext.questionReferences
          .map((q) => `- PYQ Ref [Version ID: ${q.questionVersionId}]: Year ${q.year} (${q.tier}) — Topic: "${q.topicName}"`)
          .join('\n')
      : 'No specific individual PYQ references attached for this module.';

    // 4. Format Sources Context
    const sourcesList = sourceContext.length > 0
      ? sourceContext
          .map((s) => `- [Source ID: ${s.id}] "${s.title}" (${s.sourceType}) | Issuing Authority: "${s.issuingAuthority}" | URL: ${s.sourceUrl} | Published: ${s.publishedDate || 'N/A'} | Status: ${s.verificationStatus}`)
          .join('\n')
      : 'No verified official sources currently registered in Courage Library. AI assistant must identify required official sources from commission publications.';

    // 5. Format Claims Context
    const claimsList = claimContext.length > 0
      ? claimContext
          .map((c) => {
            const citations = c.citations.length > 0
              ? c.citations.map((cit) => `[Source: ${cit.sourceTitle}${cit.pageOrClause ? `, ${cit.pageOrClause}` : ''}]`).join(', ')
              : 'No citation attached';
            return `- [Claim Key: ${c.claimKey}] Stated Value: "${c.statedValue}" (${c.dataType}) | Status: ${c.verificationStatus} | Citations: ${citations}`;
          })
          .join('\n')
      : 'No structured claims registered yet. Extract key parameters into structuredData.claims.';

    // 6. Format Revision Directives
    const isRevision = existingDocumentState?.isRevision ?? false;
    const revisionDirectives = isRevision
      ? `REVISION MODE ACTIVE:
- Document ID: ${existingDocumentState?.documentId}
- Current Version Number: ${existingDocumentState?.currentVersionNumber}
- Review Status: ${existingDocumentState?.reviewStatus}
- Published State: ${existingDocumentState?.isPublished ? 'PUBLISHED' : 'UNPUBLISHED DRAFT'}
- INSTRUCTION: You are updating/revising an existing document. Preserve existing verified facts and terminology unless updated official corrigenda or cycle notifications supersede them.`
      : `NEW DOCUMENT CREATION MODE:
- Document ID: [NEW]
- INSTRUCTION: Author a comprehensive, high-yield first version adhering to the authoritative specifications below.`;

    // Assemble the 16 Sections
    const promptSections = [
`================================================================================
COURAGE LIBRARY — AUTHORITATIVE EXAM KNOWLEDGE AUTHORING PROMPT
Contract Version: ${EXAM_PROMPT_CONTRACT_VERSION}
Target Scope: ${exam.title}${cycle ? ` (Cycle ${cycle.cycleYear})` : ' (Timeless)'} — Module: ${module.displayName}
Context Hash: ${context.contextHash}
================================================================================`,

`<COURAGE_ROLE_AND_AUTHORITY>
1. ROLE: You are an expert government recruitment examination analyst and academic researcher for Courage Library.
2. AUTHORITY INVARIANT:
   ACADEMIC CURRICULUM AUTHORITY > HUMAN ACADEMIC REVIEW > AI AUTHORING > AI-GENERATED CONTENT
3. BOUNDARY: Courage Library is the SOLE authority for canonical curriculum taxonomy, exam identity, and verified factual parameters.
4. ASSISTANT ROLE: You are an authoring assistant. You do NOT possess authority to invent exam regulations, fabricate dates, create synthetic notification circular numbers, or alter official syllabus boundaries.
5. REVIEW PROTOCOL: Your output will be parsed into an AST and subjected to a strict 4-Gate Ingestion Validator followed by mandatory Human Academic Review before publication.
</COURAGE_ROLE_AND_AUTHORITY>`,

`<EXACT_TARGET_IDENTITY>
- Exam ID: "${target.examId}"
- Exam Slug: "${target.examSlug}"
- Exam Title: "${target.examName}"
- Conducting Authority: "${exam.conductingOrgName}"
- Target Cycle ID: ${target.examCycleId ? `"${target.examCycleId}"` : 'NULL (Timeless Exam Intelligence)'}
- Cycle Label: ${target.cycleLabel || 'Timeless'}
- Cycle Year: ${target.cycleYear || 'Timeless'}
- Module Key: "${target.moduleKey}"
- Module Display Name: "${module.displayName}"
- Language: "${target.language}"
- Prompt Contract Version: "${EXAM_PROMPT_CONTRACT_VERSION}"
- Context Hash: "${context.contextHash}"
</EXACT_TARGET_IDENTITY>`,

`<EXAM_CONTEXT>
- Title: ${exam.title}
- Slug: ${exam.slug}
- Category: ${exam.category}
- Conducting Organization: ${exam.conductingOrgName}
- Official Portal Base URL: ${exam.officialWebsite || 'https://official.portal.gov.in'}
- Description: ${exam.description || 'National/State level recruitment examination.'}
- System Status: ${exam.isActive ? 'ACTIVE' : 'INACTIVE'}
</EXAM_CONTEXT>`,

`<EXAM_CYCLE_CONTEXT>
${cycle ? `- Cycle ID: ${cycle.id}
- Year: ${cycle.cycleYear}
- Label: ${cycle.cycleLabel}
- Status: ${cycle.status}
- Official Notification Date: ${cycle.notificationDate || 'TO_BE_ANNOUNCED'}
- Application Window: ${cycle.applicationStartDate || 'TO_BE_ANNOUNCED'} to ${cycle.applicationEndDate || 'TO_BE_ANNOUNCED'}
- Exam Window: ${cycle.examStartDate || 'TO_BE_ANNOUNCED'} to ${cycle.examEndDate || 'TO_BE_ANNOUNCED'}
- Total Vacancies: ${cycle.totalVacancies ? cycle.totalVacancies.toLocaleString() : 'TO_BE_ANNOUNCED'}` : 'This is a TIMELESS exam knowledge module. It applies across all recruitment cycles and is not restricted to a single examination year.'}
</EXAM_CYCLE_CONTEXT>`,

`<MODULE_REQUIREMENTS>
- Module Key: ${module.key}
- Display Name: ${module.displayName}
- Purpose: ${module.purpose}
- Cycle Specificity: ${module.isCycleSpecific ? 'CYCLE-SPECIFIC' : 'TIMELESS'}
- Source Verification Required: ${module.requiresSources ? 'YES (Strict Official Evidence Required)' : 'NO (Uses Canonical/Educational Guidance)'}
- Required Claim Types: ${module.requiredClaimTypes.length > 0 ? module.requiredClaimTypes.join(', ') : 'None specified'}
- Freshness Rule: ${module.freshnessRule}
- Output Guidance: ${module.outputGuidance}
</MODULE_REQUIREMENTS>`,

`<KNOWN_STRUCTURED_FACTS>
[A. Exam Patterns & Marking Scheme]
${patternsList}

[B. Recruitment Posts & Pay Levels]
${postsList}

[C. Important Milestone Dates]
${datesList}

[D. Vacancy Counts]
${vacanciesList}

[E. Structural Parameters]
- Negative Marking Present: ${structuredFacts.parameters.hasNegativeMarking ? 'YES' : 'NO'}
- Total Examination Tiers: ${structuredFacts.parameters.totalTiersCount}
</KNOWN_STRUCTURED_FACTS>`,

`<CANONICAL_CURRICULUM_CONTEXT>
[A. Canonical Subjects]
${subjectsList}

[B. High-Yield Topics (Sample)]
${topicsList}

[C. Curriculum Depth Metrics]
- Total Subtopics in Knowledge Base: ${canonicalCurriculum.subtopicsCount}
- Total Pedagogical Learning Units: ${canonicalCurriculum.totalLearningUnits}
</CANONICAL_CURRICULUM_CONTEXT>`,

`<QUESTION_BANK_CONTEXT>
- Total Authentic Questions Available in Bank: ${questionBankContext?.totalQuestionsAvailable || 0}
- Referenced Questions:
${questionsList}
</QUESTION_BANK_CONTEXT>`,

`<EXISTING_SOURCES>
${sourcesList}
</EXISTING_SOURCES>`,

`<EXISTING_VERIFIED_CLAIMS>
${claimsList}
</EXISTING_VERIFIED_CLAIMS>`,

`<CONTENT_BOUNDARIES>
1. IN-SCOPE:
   - Provide exhaustive, candidate-actionable information strictly matching the module purpose: "${module.purpose}".
   - Tabulate complex data (dates, fees, pay scales, stages, posts) into clear markdown tables.
   - Address edge cases and common candidate doubts in the faqs section.
2. OUT-OF-SCOPE:
   - Do NOT duplicate content belonging to other modules (e.g. do not write detailed syllabus lessons inside an eligibility module).
   - Do NOT include promotional marketing language or generic fluff.
   - Do NOT reference unofficial blogs, private coaching institutes, or unverified rumors.
</CONTENT_BOUNDARIES>`,

`<SOURCE_REQUIREMENTS>
1. Every factual parameter (fees, age limits, dates, cutoffs, vacancies) must cite an official source.
2. If official data is not yet available, write "TO_BE_ANNOUNCED" and assign status "SOURCE_REQUIRED".
3. Provide full official URLs (e.g. commission domains like .gov.in, .nic.in).
</SOURCE_REQUIREMENTS>`,

`<ANTI_HALLUCINATION_RULES>
1. NEVER invent or extrapolate unannounced exam dates, application deadlines, or result dates.
2. NEVER invent vacancy numbers, category allocations, or post-wise distributions.
3. NEVER fabricate commission notification circular numbers, corrigendum references, or fake URLs.
4. If a value is unknown, use "TO_BE_ANNOUNCED" or "SOURCE_REQUIRED".
5. Preserve canonical subject and topic names verbatim.
</ANTI_HALLUCINATION_RULES>`,

`<REVISION_RULES>
${revisionDirectives}
</REVISION_RULES>`,

`<OUTPUT_JSON_SCHEMA>
You must return a single, valid, parseable JSON object matching ExamKnowledgeDocumentSpec v1.0.0:

{
  "schemaVersion": "1.0.0",
  "documentId": "${existingDocumentState?.documentId || target.examSlug + '-' + target.moduleKey.toLowerCase().replace(/_/g, '-')}",
  "examSlug": "${target.examSlug}",
  "cycleYear": ${target.cycleYear || 'null'},
  "moduleKey": "${target.moduleKey}",
  "language": "${target.language}",
  "metadata": {
    "title": "${module.displayName} | ${exam.title}${cycle ? ` ${cycle.cycleYear}` : ''}",
    "description": "Exhaustive guide and official parameters for ${module.displayName} in ${exam.title}.",
    "lastVerifiedDate": "YYYY-MM-DD",
    "targetExamCategory": "${exam.category}",
    "authoritativeKeywords": ["${exam.slug}", "${target.moduleKey.toLowerCase()}", "exam pattern", "syllabus"]
  },
  "structuredData": {
    "dates": [
      { "eventKey": "NOTIFICATION_DATE", "label": "Official Notification", "dateValue": "YYYY-MM-DD", "isTentative": false }
    ],
    "parameters": {
      "key": "value"
    },
    "tables": [
      { "tableId": "table-1", "title": "Table Title", "headers": ["Col 1", "Col 2"], "rows": [["Val 1", "Val 2"]] }
    ],
    "claims": [
      { "claimKey": "PARAM_KEY", "statedValue": "Value", "sourceCitation": "Official Notification Para X.Y", "sourceUrl": "https://official.portal.gov.in" }
    ]
  },
  "contentSections": [
    {
      "id": "section-1",
      "heading": "Section Heading",
      "sectionType": "SUMMARY",
      "bodyMarkdown": "Markdown body content...",
      "calloutNotes": [
        { "variant": "INFO", "title": "Important Note", "body": "Callout body text..." }
      ]
    }
  ],
  "faqs": [
    { "question": "Frequently asked question?", "answer": "Authoritative answer based on official guidelines." }
  ],
  "officialSources": [
    {
      "sourceType": "OFFICIAL_NOTIFICATION",
      "title": "Official Notification Title",
      "url": "https://official.portal.gov.in",
      "issuingAuthority": "${exam.conductingOrgName}",
      "publishedDate": "YYYY-MM-DD"
    }
  ],
  "seo": {
    "metaTitle": "${module.displayName} - ${exam.title} | Courage Library",
    "metaDescription": "Official details, rules, and guidelines for ${module.displayName} in ${exam.title}.",
    "focusKeywords": ["${exam.slug}", "${target.moduleKey.toLowerCase()}"],
    "canonicalUrlSlug": "${target.examSlug}-${target.moduleKey.toLowerCase().replace(/_/g, '-')}"
  }
}
</OUTPUT_JSON_SCHEMA>`,

`<FINAL_OUTPUT_INSTRUCTION>
IMPORTANT INSTRUCTION FOR EXTERNAL AI:
Return ONLY the single JSON object conforming to the schema above.
Do NOT include conversational preamble, apologies, or markdown explanation outside the JSON code block.
Wrap your response in a single \`\`\`json ... \`\`\` block.
</FINAL_OUTPUT_INSTRUCTION>`,
    ];

    const promptText = promptSections.join('\n\n');

    return {
      promptText,
      promptContractVersion: EXAM_PROMPT_CONTRACT_VERSION,
      schemaVersion: '1.0.0',
      contextHash: context.contextHash,
      target,
      generatedAt: context.generatedAt,
      characterCount: promptText.length,
      includedSourcesCount: sourceContext.length,
      includedClaimsCount: claimContext.length,
      includedTopicsCount: canonicalCurriculum.topics.length,
      existingDocumentState: existingDocumentState
        ? {
            isRevision: existingDocumentState.isRevision,
            documentId: existingDocumentState.documentId,
            versionNumber: existingDocumentState.currentVersionNumber,
          }
        : undefined,
      applicability: context.applicability,
      warnings: context.applicability.warnings,
    };
  }
}
