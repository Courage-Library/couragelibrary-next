/**
 * COURAGE LIBRARY — EXAM KNOWLEDGE PROMPT BUILDER
 * Phase 3H.2 & Phase 3K.15: Research-First External AI Authoring Prompt Generator
 * 
 * Generates an authoritative, research-driven, deterministic master prompt
 * enforcing the complete RESEARCH → VERIFY → RESOLVE → AUTHOR → STRUCTURE → SELF-CHECK workflow.
 * 
 * 12 SACRED PILLARS:
 * 1. Research Mandate & Philosophy (CONTEXT ≠ TRUTH; Primary research required)
 * 2. 4-Tier Source Authority Hierarchy (Tier 1 Primary Official > Tier 2 Govt > Tier 3 Media > Tier 4 Blogs)
 * 3. Official URL & Provenance Rules (Zero fake generic URLs; real official domains only)
 * 4. Freshness & Current-Cycle Verification (Active cycle validation & corrigenda tracking)
 * 5. Conflict Resolution Protocol (Evaluate authority and freshness; resolve or flag)
 * 6. Anti-Lazy Placeholder Policy (Placeholders strictly prohibited unless genuinely unannounced)
 * 7. Module-Specific Deep Research Directives (Target-aware, exam-agnostic for all 24 modules)
 * 8. Revision & Human-Edit Preservation (Preserve verified content; address reviewer feedback)
 * 9. Canonical Taxonomy Lock (Courage owns taxonomy; zero invented IDs/subjects)
 * 10. Candidate-Facing Quality Standards (Comprehensive, clear, tabular, zero fluff/jargon)
 * 11. Mandatory Pre-Output Self-Checklist (14-point internal verification before JSON)
 * 12. Strict Structured Output Contract (Pure JSON matching ExamKnowledgeDocumentSpec v1.0.0)
 */

import {
  AuthoritativeExamContext,
  ExamPromptResult,
  EXAM_PROMPT_CONTRACT_VERSION,
} from '@/types/exam-knowledge';

export class ExamKnowledgePromptBuilder {
  public static readonly CONTRACT_VERSION = EXAM_PROMPT_CONTRACT_VERSION;

  /**
   * Builds the comprehensive, research-first deterministic prompt string.
   */
  static buildPrompt(context: AuthoritativeExamContext): ExamPromptResult {
    const fallback = 'Not provided in authoritative records.';
    const {
      target,
      exam,
      cycle,
      module,
      structuredFacts,
      canonicalCurriculum,
      questionBankContext,
      existingDocumentState,
      sourceContext,
      claimContext,
    } = context;

    // 1. Format Patterns & Structured Facts (Neutral, exam-agnostic formatting)
    const patternsList = structuredFacts.patterns.length > 0
      ? structuredFacts.patterns
          .map((p) => `- Pattern: "${p.name}" (Tier/Stage: ${p.tierName || 'N/A'}) | Duration: ${p.durationMinutes} min | Questions: ${p.totalQuestions} | Max Marks: ${p.totalMarks} | Negative Mark Penalty: -${p.negativeMarkValue}`)
          .join('\n')
      : fallback;

    const postsList = structuredFacts.posts.length > 0
      ? structuredFacts.posts
          .map((p) => `- Post: "${p.postName}" (${p.postCode || 'No Code'}) | Dept/Ministry: "${p.department || 'N/A'}" | Group: ${p.classificationGroup || 'Group B/C'} | Pay Level / Scale: Level ${p.payLevel}${p.gradePay ? ` (Grade Pay: ₹${p.gradePay})` : ''} | Gazetted: ${p.isGazetted ? 'YES' : 'NO'}`)
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
          .map((q) => `- PYQ Reference [Version ID: ${q.questionVersionId}]: Year ${q.year} (${q.tier}) — Topic: "${q.topicName}"`)
          .join('\n')
      : 'No specific individual PYQ references attached for this module.';

    // 4. Format Sources Context
    const sourcesList = sourceContext.length > 0
      ? sourceContext
          .map((s) => `- [Source ID: ${s.id}] "${s.title}" (${s.sourceType}) | Issuing Authority: "${s.issuingAuthority}" | URL: ${s.sourceUrl || 'URL Pending Verification'} | Published: ${s.publishedDate || 'N/A'} | Status: ${s.verificationStatus}`)
          .join('\n')
      : 'No verified official sources currently registered in Courage Library. AI assistant must independently research and register verified official sources from primary commission publications.';

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
      : 'No structured claims registered yet. Extract authoritative factual parameters into structuredData.claims with verified official citations.';

    // 6. Format Module-Specific Research Directives
    const moduleDirectivesList = (module.researchDirectives && module.researchDirectives.length > 0)
      ? module.researchDirectives.map((d, i) => `${i + 1}. ${d}`).join('\n')
      : '1. Research primary official notifications and gazette notices for this examination.\n2. Verify all factual statements against conducting authority releases.\n3. Provide complete, structured candidate intelligence.';

    // 7. Format Revision Directives
    const isRevision = existingDocumentState?.isRevision ?? false;
    const revisionDirectives = isRevision
      ? `REVISION MODE ACTIVE (INCREMENTAL RESEARCH & REVISION PROTOCOL):
- Document ID: ${existingDocumentState?.documentId}
- Current Version Number: ${existingDocumentState?.currentVersionNumber}
- Review Status: ${existingDocumentState?.reviewStatus}
- Published State: ${existingDocumentState?.isPublished ? 'PUBLISHED' : 'UNPUBLISHED DRAFT'}
${existingDocumentState?.publishedVersionNumber ? `- Baseline Published Version: v${existingDocumentState.publishedVersionNumber}` : ''}
${existingDocumentState?.reviewFeedback ? `- REVIEWER FEEDBACK TO ADDRESS: "${existingDocumentState.reviewFeedback}"` : '- Reviewer Feedback: None provided.'}

REVISION INSTRUCTIONS:
1. PRESERVE ACCURATE VERIFIED CONTENT: Treat previously approved or published sections as high-value verified assets. Do NOT needlessly rewrite stable text or introduce stylistic churn.
2. TARGETED FACT RE-VERIFICATION: Research claims and parameters that may have changed in newer notifications, corrigenda, or cycle announcements. Update only where primary evidence supports the change.
3. RESOLVE REVIEWER FEEDBACK: Address all reviewer comments or requested changes explicitly in the updated sections.
4. MAINTAIN PROVENANCE: Preserve valid existing source citations. Replace stale citations when underlying facts change.`
      : `NEW DOCUMENT CREATION MODE:
- Document ID: [NEW]
- INSTRUCTION: Author a comprehensive, high-yield, fully researched first version adhering strictly to the authoritative specifications below.`;

    // 8. Assemble Master Prompt Sections
    const promptSections = [
`================================================================================
COURAGE LIBRARY — RESEARCH-FIRST AUTHORITATIVE EXAM KNOWLEDGE PROMPT
Contract Version: ${EXAM_PROMPT_CONTRACT_VERSION}
Target Scope: ${exam.title}${cycle ? ` (Cycle ${cycle.cycleYear})` : ' (Timeless)'} — Module: ${module.displayName}
Context Hash: ${context.contextHash}
================================================================================`,

`<COURAGE_ROLE_AND_AUTHORITY>
1. MISSION: You are an expert examination research analyst and academic author for Courage Library.
   Your mandate is to execute the complete workflow:
   RESEARCH → VERIFY → RESOLVE → AUTHOR → STRUCTURE → SELF-CHECK.
2. AUTHORITY INVARIANT:
   ACADEMIC CURRICULUM AUTHORITY > HUMAN ACADEMIC REVIEW > AI AUTHORING > AI-GENERATED CONTENT
3. BOUNDARY OF OWNERSHIP:
   - Courage Library OWNS: Exam identity, conducting authority, cycle definitions, post structures, canonical curriculum taxonomy (subjects/topics), module definitions, schemas, validation gates, version history, human review, compilation, and candidate publication.
   - You (External AI) TEMPORARILY OWN: Independent research, primary source verification, factual conflict resolution, candidate-facing authoring, provenance attribution, and strict structured JSON generation.
4. PUBLICATION CONTROL: Your output is UNTRUSTED CANDIDATE INPUT. It will be validated by Courage's 5-Gate Ingestion Validator and subjected to mandatory Human Academic Review before compilation and publication. You cannot self-publish.
</COURAGE_ROLE_AND_AUTHORITY>`,

`<RESEARCH_MANDATE_AND_PHILOSOPHY>
1. CONTEXT ≠ TRUTH:
   - The supplied Courage context provides target identity, canonical boundaries, schema requirements, and current database state.
   - Do NOT blindly assume that every factual parameter in the context is complete, current, or infallible.
   - You MUST independently research and verify all material factual claims using authoritative primary sources.
2. RESEARCH BEFORE AUTHORING:
   - Never generate content from memory or search snippets alone.
   - Follow authoritative sources to their actual notices, gazette circulars, and official PDF releases.
   - Cross-check critical claims (dates, eligibility, age limits, pay, pattern, syllabus, vacancies).
   - If an underlying factual claim cannot be verified through authoritative research, state what is officially known and identify what remains unannounced.
3. NO FABRICATION OR SPECULATION:
   - Do NOT invent circular numbers, corrigendum references, exam dates, vacancy figures, or deep URLs.
   - Never extrapolate unannounced deadlines.
</RESEARCH_MANDATE_AND_PHILOSOPHY>`,

`<SOURCE_AUTHORITY_HIERARCHY>
When researching and attributing evidence, you MUST strictly enforce this 4-tier hierarchy:

TIER 1 — PRIMARY AUTHORITATIVE SOURCES (HIGHEST PRIORITY):
- Official recruiting authority portal and examination notices
- Official notification PDF / recruitment advertisement / gazette order
- Official statutory service rules and recruitment regulations
- Official application, admit card, and result portals

TIER 2 — OTHER OFFICIAL GOVERNMENT SOURCES:
- Sponsoring ministries, government departments, and statutory commissions
- Official government gazettes, press information bureaus, and legislative acts
- Official pay commissions and administrative reform department orders

TIER 3 — REPUTABLE SECONDARY SOURCES:
- Established educational publications, reputable national newspapers, and academic journals
- Permitted ONLY to provide context, historical trends, or explanatory analysis.
- Tier 3 sources must NEVER override Tier 1 primary official sources.

TIER 4 — BLOGS / COACHING SITES / COMMUNITY / SOCIAL MEDIA (PROHIBITED AS AUTHORITY):
- Commercial coaching blogs, social media posts, forum discussions, and unverified news aggregators.
- Permitted ONLY as discovery leads. You MUST locate the primary official source behind any secondary claim before citing it.
- NEVER cite coaching websites or SEO blogs as officialSources.
</SOURCE_AUTHORITY_HIERARCHY>`,

`<OFFICIAL_URL_AND_PROVENANCE_RULES>
1. NEVER INVENT OR HALLUCINATE OFFICIAL URLS:
   - Every URL in "officialSources.url" or "claims.sourceUrl" MUST be a real, verified absolute HTTP or HTTPS URL.
   - Never fabricate deep links, synthetic PDF paths, or unverified notice URLs.
2. VERIFYING CONTEXT URLS:
   - If Courage context provides a portal URL, verify that it actually belongs to the conducting authority.
   - If an exact notification deep link cannot be verified with certainty, cite the verified official base portal URL (e.g. "${exam.officialWebsite || `Official portal of ${exam.conductingOrgName}`}") and state the exact document title, notification number, and paragraph/clause in "sourceCitation".
3. PROHIBITED PLACEHOLDERS:
   - NEVER use placeholder strings (such as "SOURCE_REQUIRED", "TO_BE_ANNOUNCED", "UNKNOWN", "N/A") inside "url" or "sourceUrl" fields.
   - If a specific URL is unverified or unavailable, omit the "sourceUrl" field (or set it to null) and provide the textual citation in "sourceCitation".
</OFFICIAL_URL_AND_PROVENANCE_RULES>`,

`<FRESHNESS_AND_CURRENT_CYCLE_VERIFICATION>
1. TARGET CYCLE VERIFICATION:
   - For cycle-specific modules (e.g. Cycle ${cycle ? cycle.cycleYear : 'Active'}), research whether the official notification for the target year has been formally issued.
   - Check for recent official corrigenda, addenda, deadline extensions, or pattern modifications.
2. DISTINGUISH CONFIRMED VS TENTATIVE:
   - Clearly distinguish between dates/vacancies confirmed in official notifications versus tentative dates published in annual commission calendars.
   - If the commission has published an annual calendar but not the detailed notification, indicate the calendar reference and note that detailed terms are subject to the upcoming official notification.
</FRESHNESS_AND_CURRENT_CYCLE_VERIFICATION>`,

`<CONFLICT_RESOLUTION_PROTOCOL>
If you discover conflicting information between different sources or between supplied context and current official releases:
1. Identify the specific conflicting claims.
2. Weigh the sources using the Source Authority Hierarchy (Tier 1 > Tier 2 > Tier 3).
3. Evaluate freshness: Newer official corrigenda, addenda, or latest gazettes supersede older notices.
4. Resolve in favor of the highest-authority, most current official document.
5. If genuine ambiguity remains (e.g. conflicting interpretations pending court/commission clarification), explain the verified condition objectively in the text and flag the parameter for human academic review.
6. NEVER silently pick a secondary source claim over an authoritative primary source.
</CONFLICT_RESOLUTION_PROTOCOL>`,

`<ANTI_LAZY_PLACEHOLDER_POLICY>
1. RESEARCH FIRST:
   - Do NOT lazily use "TO_BE_ANNOUNCED", "TBD", "UNKNOWN", or "EXPECTED" simply because a parameter was null in the context.
   - If authoritative research yields the announced date, fee, vacancy, or rule, you MUST populate it with source citation.
2. STRICT PLACEHOLDER JUSTIFICATION:
   - Use "TO_BE_ANNOUNCED" ONLY when thorough authoritative research proves that the conducting body has genuinely not released or finalized the information yet.
   - When using a placeholder, provide a brief explanatory note in the section text explaining when the authority is scheduled to announce it.
</ANTI_LAZY_PLACEHOLDER_POLICY>`,

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
- Official Portal Website: ${exam.officialWebsite || 'Official conducting authority website'}
- Description: ${exam.description || 'National/State level recruitment examination.'}
- System Status: ${exam.isActive ? 'ACTIVE' : 'INACTIVE'}
</EXAM_CONTEXT>`,

`<EXAM_CYCLE_CONTEXT>
${cycle ? `- Cycle ID: ${cycle.id}
- Year: ${cycle.cycleYear}
- Label: ${cycle.cycleLabel}
- Status: ${cycle.status}
- Official Notification Date: ${cycle.notificationDate || 'Pending Research / Announcement'}
- Application Window: ${cycle.applicationStartDate || 'Pending Research'} to ${cycle.applicationEndDate || 'Pending Research'}
- Exam Window: ${cycle.examStartDate || 'Pending Research'} to ${cycle.examEndDate || 'Pending Research'}
- Total Vacancies: ${cycle.totalVacancies ? cycle.totalVacancies.toLocaleString() : 'Pending Research'}` : 'This is a TIMELESS exam knowledge module. It applies across all recruitment cycles and is not restricted to a single examination year.'}
</EXAM_CYCLE_CONTEXT>`,

`<MODULE_SPECIFIC_RESEARCH_DIRECTIVES>
- Module Key: ${module.key}
- Display Name: ${module.displayName}
- Purpose: ${module.purpose}
- Cycle Specificity: ${module.isCycleSpecific ? 'CYCLE-SPECIFIC' : 'TIMELESS'}
- Source Verification Required: ${module.requiresSources ? 'YES (Strict Official Evidence Required)' : 'NO (Canonical/Educational Guidance)'}
- Required Claim Types: ${module.requiredClaimTypes.length > 0 ? module.requiredClaimTypes.join(', ') : 'None specified'}
- Freshness Rule: ${module.freshnessRule}
- Output Guidance: ${module.outputGuidance}

MANDATORY RESEARCH DIRECTIVES FOR THIS MODULE:
${moduleDirectivesList}
</MODULE_SPECIFIC_RESEARCH_DIRECTIVES>`,

`<KNOWN_STRUCTURED_FACTS>
[A. Exam Patterns & Marking Scheme]
${patternsList}

[B. Recruitment Posts & Pay Levels]
${postsList}

[C. Milestone Dates in Database]
${datesList}

[D. Vacancy Counts in Database]
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

`<CANONICAL_TAXONOMY_PROTECTION>
1. COURAGE OWNS THE TAXONOMY:
   - You MUST preserve all canonical subject names, topic names, and exam IDs verbatim.
   - NEVER create arbitrary new subjects, rename canonical subjects, or invent fake topic IDs.
   - If researching syllabus or exam patterns reveals emerging subtopics not listed in the canonical curriculum, integrate them into the appropriate canonical subject section as descriptive sub-bullets without altering the canonical subject taxonomy.
</CANONICAL_TAXONOMY_PROTECTION>`,

`<CANDIDATE_FACING_QUALITY_STANDARDS>
1. WRITTEN FOR CANDIDATE SUCCESS:
   - Write clearly, authoritatively, and empathetically for prospective candidates and serious aspirants.
   - Provide concrete, actionable intelligence (eligibility checklists, calculation examples, preparation phases).
   - Use structured Markdown tables for multi-attribute data (e.g. post-wise pay, date milestones, marking schemes, qualifying cutoffs).
2. TONE & VOCABULARY:
   - Prohibit internal database jargon (e.g. do not say "in this DB record", "claimKey", "schemaVersion").
   - Prohibit marketing fluff, hyperbole, or SEO spam phrases.
   - Maintain objective, precise, academic clarity.
</CANDIDATE_FACING_QUALITY_STANDARDS>`,

`<REVISION_AND_HUMAN_EDIT_PRESERVATION>
${revisionDirectives}
</REVISION_AND_HUMAN_EDIT_PRESERVATION>`,

`<CONTENT_BOUNDARIES>
1. IN-SCOPE:
   - Provide exhaustive, candidate-actionable information strictly matching the module purpose: "${module.purpose}".
   - Tabulate complex data into clean markdown tables with clear column headers.
   - Address edge cases and high-frequency candidate doubts in the faqs section.
2. OUT-OF-SCOPE:
   - Do NOT duplicate content belonging to other modules (e.g. do not write detailed syllabus lessons inside an eligibility module).
   - Do NOT reference unofficial blogs, private coaching institutes, or unverified rumors.
3. CANONICAL SECTION TYPES (STRICT ENUM):
   - Every object in "contentSections" MUST have "sectionType" set to one of the following 4 canonical values ONLY:
     * "SUMMARY" : Executive overview, key highlights, or introductory takeaways.
     * "DETAILED_GUIDE" : In-depth breakdown of policies, structure, stages, authorities, subjects, and scopes.
     * "IMPORTANT_INSTRUCTIONS" : Vital rules, marking schemes, penalties, candidate advisories, and cautions.
     * "FAQS" : Section-level or topic-specific frequently asked questions.
   - STRICT PROHIBITION: NEVER use custom sectionType values (e.g. do NOT use "AUTHORITY", "EXAM_STRUCTURE", "SUBJECTS", "MARKING"). Map all subtopics into "DETAILED_GUIDE" or "IMPORTANT_INSTRUCTIONS" using descriptive "heading" titles.
</CONTENT_BOUNDARIES>`,

`<PRE_OUTPUT_SELF_CHECKLIST>
BEFORE GENERATING THE FINAL JSON, YOU MUST INTERNALLY VERIFY:
A. Did I research the requested subject using authoritative sources?
B. Did I prioritize Tier 1 / Tier 2 authoritative sources over secondary blogs?
C. Did I verify current-cycle parameters and latest corrigenda?
D. Did I independently evaluate supplied context rather than blindly copying?
E. Did I verify official URLs and avoid fabricating deep links?
F. Did I resolve source conflicts using the authority hierarchy?
G. Did I avoid unsupported or speculative factual claims?
H. Did I avoid lazy placeholders ("TO_BE_ANNOUNCED") where research yields facts?
I. Did I satisfy module completeness (thorough candidate guide with tables/details)?
J. Did I strictly preserve Courage canonical taxonomy and naming?
K. Did I preserve verified existing content and address reviewer feedback (if revision)?
L. Did I attach valid source citations and provenance?
M. Is the content written with high candidate-facing clarity and zero admin jargon?
N. Does the output strictly conform to ExamKnowledgeDocumentSpec v1.0.0?
</PRE_OUTPUT_SELF_CHECKLIST>`,

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
    "description": "Comprehensive authoritative guide and official parameters for ${module.displayName} in ${exam.title}.",
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
      { "claimKey": "PARAM_KEY", "statedValue": "Value", "sourceCitation": "Official Notification Para X.Y", "sourceUrl": "${exam.officialWebsite || 'https://verified.official.gov.in'}" }
    ]
  },
  "contentSections": [
    {
      "id": "section-1",
      "heading": "Section Heading",
      "sectionType": "SUMMARY",
      "bodyMarkdown": "Markdown body content with actionable candidate intelligence...",
      "calloutNotes": [
        { "variant": "INFO", "title": "Important Note", "body": "Callout body text..." }
      ]
    }
  ],
  "faqs": [
    { "question": "Frequently asked question?", "answer": "Authoritative answer based on official commission guidelines." }
  ],
  "officialSources": [
    {
      "sourceType": "OFFICIAL_NOTIFICATION",
      "title": "Official Notification Title",
      "url": "${exam.officialWebsite || 'https://verified.official.gov.in'}",
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
Do NOT include conversational preamble, apologies, or commentary outside the JSON code block.
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
