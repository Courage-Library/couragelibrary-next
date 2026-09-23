/**
 * COURAGE LIBRARY — EXAM ONBOARDING PROMPT SERVICE
 * Phase 3K: AI-Assisted Exam Onboarding Master & Step-Specific Prompt Generator
 */

import { ONBOARDING_PROMPT_CONTRACT_VERSION, OnboardingContextSnapshot } from '@/types/exam-onboarding';

export class ExamOnboardingPromptService {
  public static readonly CONTRACT_VERSION = ONBOARDING_PROMPT_CONTRACT_VERSION;

  /**
   * Generates the Master Research & Structured Ingestion Prompt.
   */
  static generateMasterPrompt(
    context: OnboardingContextSnapshot,
    additionalInstructions?: string
  ): {
    promptText: string;
    promptVersion: string;
    contextHash: string;
    generatedAt: string;
  } {
    const {
      targetExamName,
      examSlug,
      category,
      conductingOrgName,
      cycleYear,
      existingPosts,
      availableCanonicalSubjects,
      registeredKnowledgeModules,
      contextHash,
    } = context;

    const subjectsSummary = availableCanonicalSubjects
      .map((s) => `- Subject: "${s.name}" (Slug: ${s.slug}, Canonical Topics: ${s.topics.map((t) => t.name).slice(0, 8).join(", ")}${s.topics.length > 8 ? "..." : ""})`)
      .join("\n");

    const modulesSummary = registeredKnowledgeModules
      .map((m) => `- [${m.key}] ${m.displayName}: ${m.purpose} (${m.isCycleSpecific ? "Cycle-Specific" : "Timeless"})`)
      .join("\n");

    const knownFactsList = [
      `- Target Examination: "${targetExamName}"`,
      examSlug ? `- Suggested Exam Slug: "${examSlug}"` : null,
      category ? `- Examination Domain: "${category}"` : null,
      conductingOrgName ? `- Known Conducting Organization: "${conductingOrgName}"` : null,
      cycleYear ? `- Target Recruitment Year / Cycle: ${cycleYear}` : null,
      existingPosts.length > 0
        ? `- Established Post Profiles: ${existingPosts.map((p) => p.postName).join(", ")}`
        : null,
    ].filter(Boolean).join("\n");

    const promptText = [
      "================================================================================",
      "COURAGE LIBRARY — MASTER MULTI-EXAM RESEARCH & ONBOARDING PROMPT",
      `Contract Version: ${ONBOARDING_PROMPT_CONTRACT_VERSION}`,
      `Target Scope: ${targetExamName}${cycleYear ? ` (Cycle ${cycleYear})` : " (Latest Official Cycle)"}`,
      `Context Hash: ${contextHash}`,
      "================================================================================",
      "",
      "<COURAGE_ROLE_AND_AUTHORITY>",
      "1. ROLE: You are an expert government examination analyst, regulatory researcher, and curriculum compiler for Courage Library.",
      "2. AUTHORITY INVARIANT:",
      "   COURAGE CANONICAL AUTHORITY > HUMAN ADMIN REVIEW > EXTERNAL AI RESEARCH > RAW AI OUTPUT",
      "3. ASSISTANT ROLE: You are an authoring/research assistant. You do NOT possess authority to invent recruitment regulations, fabricate dates, create fake gazette circular numbers, or alter official syllabus boundaries.",
      "4. UNTRUSTED PROPOSAL: Your output is a structured research package. It will be validated by a 6-Gate Ingestion Validator and reviewed by a human administrator before draft creation and readiness evaluation.",
      "5. NO DATABASE IDENTIFIERS: Never fabricate database primary keys or UUIDs. Provide semantic names, slugs, codes, and text values.",
      "</COURAGE_ROLE_AND_AUTHORITY>",
      "",
      "<CURRENT_KNOWN_FACTS>",
      knownFactsList,
      "NOTE: Use the established facts above as verified baseline context. Do not invent contradictory parameters unless citing a superseding official notification.",
      "</CURRENT_KNOWN_FACTS>",
      "",
      "<MANDATORY_SOURCE_HIERARCHY_AND_PROVENANCE>",
      "When researching and extracting information, prioritize sources strictly in this order:",
      "1. Official Recruitment Notification / Gazette Notification (Highest Authority)",
      "2. Official Conducting Organization Website / Official Recruitment Portal",
      "3. Official Corrigendum / Addendum / Examination Notices",
      "4. Other Authoritative Government Orders / Service Rules",
      "5. Reputable Secondary Academic Sources (Supplementary reference only)",
      "6. Private coaching websites or blogs are NOT official sources.",
      "",
      "ANTI-FABRICATION RULE:",
      "- If a factual field (e.g. application dates, vacancies, specific pay level) is not officially notified or available, set the value to null or use status: \"UNKNOWN\", \"NOT_FOUND\", \"NOT_APPLICABLE\", or \"UNVERIFIED\" inside unresolved_items.",
      "- Never guess or extrapolate tentative dates as confirmed.",
      "- If two authoritative notices conflict, mark as \"CONFLICTING\" and provide both sources in claims.",
      "</MANDATORY_SOURCE_HIERARCHY_AND_PROVENANCE>",
      "",
      "<CANONICAL_TAXONOMY_ALIGNMENT_GUIDANCE>",
      "Courage Library maintains a global canonical syllabus taxonomy. Whenever possible, map the target exam's syllabus to these existing canonical subjects:",
      subjectsSummary,
      "",
      "If the target examination requires a genuinely distinct subject or topic not present in the canonical catalog above:",
      "- Set is_new_canonical_candidate: true for that topic.",
      "- Do NOT fabricate an existing canonical ID.",
      "</CANONICAL_TAXONOMY_ALIGNMENT_GUIDANCE>",
      "",
      "<DYNAMIC_KNOWLEDGE_MODULES_TO_POPULATE>",
      "Courage Library dynamically registers the following knowledge modules. Provide structured high-yield summaries for as many applicable modules as possible:",
      modulesSummary,
      "</DYNAMIC_KNOWLEDGE_MODULES_TO_POPULATE>",
      "",
      "<OUTPUT_FORMAT_INSTRUCTIONS>",
      "You must return ONE strict, valid, well-formed JSON object enclosed in a ```json code fence.",
      "Do not include any conversational preamble, commentary, or text outside the JSON code block.",
      "",
      "Required Top-Level JSON Structure:",
      "```json",
      JSON.stringify({
        schema_version: ONBOARDING_PROMPT_CONTRACT_VERSION,
        prompt_version: ONBOARDING_PROMPT_CONTRACT_VERSION,
        context_hash: contextHash,
        generated_at: new Date().toISOString(),
        target_exam_name: targetExamName,
        target_cycle_year: cycleYear || new Date().getFullYear(),
        exam: {
          title: targetExamName,
          short_name: "Short/Acronym Name",
          slug: examSlug || "url-friendly-slug",
          category: category || "National Recruitment",
          description: "Comprehensive overview of the examination.",
          official_website: "https://official.website.gov.in",
          portal_url: "https://apply.official.gov.in"
        },
        organization: {
          name: conductingOrgName || "Official Conducting Commission",
          short_name: "Org Acronym",
          slug: "org-slug",
          official_website: "https://official.website.gov.in",
          org_type: "CENTRAL_COMMISSION"
        },
        cycle: {
          cycle_year: cycleYear || new Date().getFullYear(),
          cycle_name: `${targetExamName} ${cycleYear || new Date().getFullYear()}`,
          notification_date: "YYYY-MM-DD or null",
          application_start_date: "YYYY-MM-DD or null",
          application_end_date: "YYYY-MM-DD or null",
          correction_window_end_date: "YYYY-MM-DD or null",
          admit_card_date: "YYYY-MM-DD or null",
          exam_start_date: "YYYY-MM-DD or null",
          exam_end_date: "YYYY-MM-DD or null",
          result_date: "YYYY-MM-DD or null",
          status: "upcoming"
        },
        posts: [
          {
            post_name: "Name of Post / Cadre",
            post_code: "Optional post code",
            department: "Department name",
            ministry: "Ministry name",
            classification_group: "Group B / Group C / Officer",
            is_gazetted: false,
            pay_level: 7,
            grade_pay: null,
            cpc_basic_pay_min: null,
            cpc_basic_pay_max: null,
            pay_scale_description: "Generic pay scale text if non-CPC",
            vacancies_count: null,
            age_min: 18,
            age_max: 30,
            qualification_summary: "Bachelor Degree in any discipline"
          }
        ],
        eligibility: {
          nationality: ["Citizen of India"],
          age_min: 18,
          age_max: 30,
          age_reference_date: "YYYY-MM-DD or null",
          age_relaxations: [
            { category: "OBC", relaxation_years: 3, notes: "Non-creamy layer" },
            { category: "SC/ST", relaxation_years: 5, notes: "Valid certificate" }
          ],
          educational_qualifications: [
            { degree: "Graduation", stream: "Any", mandatory: true }
          ],
          experience_requirements: "None required unless specialist post",
          physical_standards: {}
        },
        selection_process: {
          stages: [
            { stage_number: 1, stage_name: "Preliminary Examination", stage_type: "WRITTEN_OBJECTIVE", is_qualifying: true, counts_for_merit: false },
            { stage_number: 2, stage_name: "Main Examination", stage_type: "WRITTEN_DESCRIPTIVE", is_qualifying: false, counts_for_merit: true }
          ],
          interview_marks: null,
          total_merit_marks: null,
          normalization_applied: true
        },
        exam_pattern: {
          tiers_or_stages: [
            {
              stage_name: "Tier 1 / Prelims",
              mode: "ONLINE_CBT",
              duration_minutes: 60,
              total_questions: 100,
              total_marks: 100,
              negative_marking_per_question: 0.25,
              sectional_timing_minutes: 20,
              sections: [
                { section_name: "Quantitative Aptitude", subject_name: "Quantitative Aptitude", questions_count: 25, marks_count: 25, negative_marks: 0.25, timing_minutes: 20 }
              ]
            }
          ]
        },
        syllabus: {
          subjects: [
            {
              subject_name: "Quantitative Aptitude",
              display_order: 1,
              topics: [
                { topic_name: "Percentages", subtopics: ["Concept", "Applications"], weightage_level: "high", priority: 1, expected_questions: 3, is_new_canonical_candidate: false }
              ]
            }
          ]
        },
        knowledge_modules: [
          {
            module_key: "EXAM_OVERVIEW",
            title: "Comprehensive Examination Overview",
            summary_markdown: "High-yield executive summary...",
            detailed_markdown: "Full detailed guide...",
            key_points: ["Point 1", "Point 2"],
            faqs: [{ question: "What is this exam?", answer: "Official explanation." }]
          }
        ],
        sources: [
          {
            source_type: "OFFICIAL_NOTIFICATION",
            title: "Official Notification Circular",
            url: "https://official.website.gov.in/notice.pdf",
            issuing_authority: "Conducting Authority Name",
            published_date: "YYYY-MM-DD",
            is_official: true,
            claims_supported: ["age_limit", "exam_dates", "syllabus"]
          }
        ],
        claims: [
          {
            claim_key: "age_limit_general",
            stated_value: "18 to 30 years as on reference date",
            data_type: "STRING",
            source_url: "https://official.website.gov.in/notice.pdf",
            page_or_clause: "Clause 4.1",
            verification_status: "UNVERIFIED"
          }
        ],
        seo: {
          meta_title: `${targetExamName} 2026: Notification, Dates, Syllabus & Pattern`,
          meta_description: `Comprehensive guide for ${targetExamName} including eligibility, syllabus, and exam pattern.`,
          focus_keywords: [targetExamName, `${targetExamName} Syllabus`, `${targetExamName} Notification`],
          canonical_slug: examSlug || "url-friendly-slug"
        },
        validation_notes: ["Any caveats regarding ongoing court orders or pending corrigenda."],
        unresolved_items: []
      }, null, 2),
      "```",
      additionalInstructions ? `\n<SPECIAL_ADMIN_DIRECTIVES>\n${additionalInstructions}\n</SPECIAL_ADMIN_DIRECTIVES>` : "",
    ].join("\n");

    return {
      promptText,
      promptVersion: ONBOARDING_PROMPT_CONTRACT_VERSION,
      contextHash,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generates a context-aware per-step prompt focusing on missing fields.
   */
  static generateStepPrompt(
    stepNumber: 1 | 2 | 3 | 4 | 5 | 6,
    context: OnboardingContextSnapshot
  ): {
    promptText: string;
    promptVersion: string;
    contextHash: string;
    stepName: string;
  } {
    const { targetExamName, conductingOrgName, cycleYear, contextHash } = context;

    const stepNames: Record<number, string> = {
      1: "Identity & Authority",
      2: "Recruitment Cycles & Dates",
      3: "Posts, Cadres & Eligibility",
      4: "Canonical Syllabus Projection",
      5: "Knowledge Modules",
      6: "Readiness & Audit Inspection",
    };

    const stepInstructions: Record<number, string> = {
      1: `FOCUS AREA: STEP 1 — IDENTITY & CONDUCTING AUTHORITY\nResearch and return the official conducting commission/authority, official portal URL, recruitment category/domain, and standard short name/slug for "${targetExamName}".`,
      2: `FOCUS AREA: STEP 2 — RECRUITMENT CYCLE & IMPORTANT DATES\nResearch confirmed or latest notification circular dates (Notification release, application window start/end, correction window, admit card release, exam window) for "${targetExamName}" (Target Cycle: ${cycleYear || "Latest"}). If dates are unannounced, mark as UNKNOWN.`,
      3: `FOCUS AREA: STEP 3 — POSTS, CADRES, PAY SCALES & ELIGIBILITY\nResearch all notified posts/cadres, qualification rules, age limits (min/max), age relaxations, and compensation/pay scales. Maintain exam-agnostic pay scales.`,
      4: `FOCUS AREA: STEP 4 — CANONICAL SYLLABUS PROJECTION\nResearch the detailed subject and topic syllabus with weightages and expected questions. Map to existing canonical subjects where possible; otherwise mark as is_new_canonical_candidate: true.`,
      5: `FOCUS AREA: STEP 5 — DYNAMIC KNOWLEDGE MODULES\nProvide high-yield markdown content for registered modules (EXAM_OVERVIEW, ELIGIBILITY, EXAM_PATTERN, SELECTION_PROCESS, etc.) with FAQs and official source citations.`,
      6: `FOCUS AREA: STEP 6 — READINESS & UNRESOLVED AUDIT\nConduct an authoritative audit of any pending corrigenda, conflicting notifications, or unverified claims for "${targetExamName}".`,
    };

    const promptText = [
      "================================================================================",
      `COURAGE LIBRARY — CONTEXT-AWARE STEP ${stepNumber} RESEARCH PROMPT`,
      `Contract Version: ${ONBOARDING_PROMPT_CONTRACT_VERSION}`,
      `Scope: ${stepNames[stepNumber]} — ${targetExamName}`,
      `Context Hash: ${contextHash}`,
      "================================================================================",
      "",
      "<VERIFIED_CONTEXT>",
      `- Target Exam: "${targetExamName}"`,
      conductingOrgName ? `- Conducting Authority: "${conductingOrgName}"` : "",
      cycleYear ? `- Cycle Year: ${cycleYear}` : "",
      "</VERIFIED_CONTEXT>",
      "",
      "<DIRECTIVE>",
      stepInstructions[stepNumber],
      "</DIRECTIVE>",
      "",
      "<RULES>",
      "1. Do not re-research already established parameters outside this step.",
      "2. Provide source provenance (URL, issuing authority, published date) for all factual claims.",
      "3. Return output as a valid JSON object matching the CL-EXAM-ONBOARDING-v1.0 specification.",
      "4. Do not invent missing facts; use UNKNOWN or NOT_FOUND where unconfirmed.",
      "</RULES>",
    ].filter(Boolean).join("\n");

    return {
      promptText,
      promptVersion: ONBOARDING_PROMPT_CONTRACT_VERSION,
      contextHash,
      stepName: stepNames[stepNumber],
    };
  }
}