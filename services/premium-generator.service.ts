import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { PremiumEntitlementService, PremiumQuotaKey, PremiumErrorCode } from "@/services/premium-entitlement.service";
import { MistakeService } from "@/services/mistake.service";

// ============================================================================
// GENERATOR ERROR TYPES & CODES
// ============================================================================

export type GeneratorErrorCode =
  | PremiumErrorCode
  | "INSUFFICIENT_QUESTION_POOL"
  | "PYQ_NOT_AVAILABLE"
  | "NO_MISTAKES_FOUND"
  | "NO_WEAK_AREAS_FOUND"
  | "BLUEPRINT_NOT_AVAILABLE"
  | "INVALID_GENERATION_PARAMS"
  | "GENERATION_VALIDATION_FAILED"
  | "TRANSACTION_FAILED"
  | "EXAM_NOT_FOUND";

export class GeneratorError extends Error {
  code: GeneratorErrorCode;
  details?: Record<string, unknown>;

  constructor(code: GeneratorErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "GeneratorError";
    this.code = code;
    this.details = details;
  }
}

// ============================================================================
// REQUEST & RESPONSE INTERFACES
// ============================================================================

export interface TopicTestRequest {
  userId: string;
  examId: string;
  subjectId?: string;
  topicIds: string[];
  questionCount: number;
  difficulty?: "easy" | "medium" | "hard" | "mixed";
  language?: "en" | "hi";
  title?: string;
}

export interface WeakAreaTestRequest {
  userId: string;
  examId: string;
  subjectId?: string;
  questionCount?: number;
  difficulty?: "easy" | "medium" | "hard" | "mixed";
  language?: "en" | "hi";
  title?: string;
}

export interface MistakeRevisionTestRequest {
  userId: string;
  examId: string;
  subjectId?: string;
  questionCount?: number;
  language?: "en" | "hi";
  title?: string;
}

export interface PersonalizedBlueprintConfig {
  weakAreasRatio?: number; // e.g. 0.6 (60% weak area, 40% syllabus balance)
  difficultyDistribution?: {
    easy?: number;
    medium?: number;
    hard?: number;
  };
}

export interface PersonalizedTestRequest {
  userId: string;
  examId: string;
  questionCount?: number;
  blueprintConfig?: PersonalizedBlueprintConfig;
  difficulty?: "easy" | "medium" | "hard" | "mixed";
  language?: "en" | "hi";
  title?: string;
}

export interface PyqSimulationRequest {
  userId: string;
  examId: string;
  year: number;
  shift?: string;
  paperCode?: string;
  examName?: string;
  language?: "en" | "hi";
  title?: string;
}

export interface GeneratedMockTestResult {
  success: boolean;
  mockTestId: string;
  slug: string;
  title: string;
  testType: string;
  quotaKey: PremiumQuotaKey;
  totalQuestions: number;
  totalMarks: number;
  durationMinutes: number;
  lifecycleStatus: "GENERATED";
  expiresAt: string;
  isDynamic: true;
  isFree: false;
  generationMetadata: Record<string, unknown>;
}

export interface EligibleQuestion {
  questionId: string;
  questionVersionId: string;
  topicId: string;
  subjectId: string | null;
  difficulty: "easy" | "medium" | "hard";
  language: "en" | "hi";
  versionNumber: number;
  questionText: string;
  options: Array<{ key: string; text: string }>;
  correctOptionKey: string;
  explanationMd?: string | null;
  questionNumber?: number | null;
}

export interface ExamBlueprint {
  templateId: string;
  patternId: string;
  marksPerQuestion: number;
  negativeMark: number;
  durationMinutes: number;
}

// ============================================================================
// AUTHORITATIVE PREMIUM QUESTION GENERATOR SERVICE
// ============================================================================

export class PremiumQuestionGeneratorService {
  private static GENERATOR_VERSION = "v1.1.0";
  private static DEFAULT_TTL_HOURS = 48;

  // --------------------------------------------------------------------------
  // 1. TOPIC TEST GENERATION
  // --------------------------------------------------------------------------
  static async generateTopicTest(req: TopicTestRequest): Promise<GeneratedMockTestResult> {
    this.validateBaseRequest(req.userId, req.examId);
    if (!req.topicIds || req.topicIds.length === 0) {
      throw new GeneratorError("INVALID_GENERATION_PARAMS", "At least one topicId is required for Topic Test.");
    }
    const targetCount = req.questionCount || 20;

    // 1. Authoritative entitlement check (Zero quota consumed at generation time)
    await this.verifyPremiumEntitlement(req.userId, req.examId, "TOPIC");

    // 2. Resolve authoritative blueprint from exam_patterns / mock_templates
    const blueprint = await this.resolveAuthoritativeBlueprint(req.examId, "topic_test", targetCount);

    // 3. Fetch eligible questions strictly mapped to exam_id
    const eligible = await this.fetchEligibleQuestions({
      examId: req.examId,
      topicIds: req.topicIds,
      subjectId: req.subjectId,
      difficulty: req.difficulty,
      language: req.language || "en",
    });

    if (eligible.length < targetCount) {
      throw new GeneratorError(
        "INSUFFICIENT_QUESTION_POOL",
        `Insufficient questions mapped to target exam. Found ${eligible.length}, required ${targetCount}.`,
        { found: eligible.length, required: targetCount, topicIds: req.topicIds, examId: req.examId }
      );
    }

    // 4. Select balanced questions
    const selected = await this.selectBalancedQuestions(eligible, targetCount, req.userId);

    // 5. Quality Validation
    this.validateQuestionBatch(selected, targetCount);

    // 6. Create Atomic Transactional Instance
    const title = req.title || `Topic Practice: ${selected.length} Questions`;
    return await this.createAtomicMockInstance({
      userId: req.userId,
      examId: req.examId,
      templateId: blueprint.templateId,
      title,
      testType: "topic_test",
      quotaKey: "TOPIC",
      durationMinutes: blueprint.durationMinutes,
      marksPerQuestion: blueprint.marksPerQuestion,
      negativeMark: blueprint.negativeMark,
      questions: selected,
      metadata: {
        generator_version: this.GENERATOR_VERSION,
        generation_type: "TOPIC",
        exam_id: req.examId,
        subject_id: req.subjectId || null,
        topic_ids: req.topicIds,
        requested_count: targetCount,
        difficulty: req.difficulty || "mixed",
        language: req.language || "en",
        pool_size: eligible.length,
      },
    });
  }

  // --------------------------------------------------------------------------
  // 2. WEAK AREA TEST GENERATION
  // --------------------------------------------------------------------------
  static async generateWeakAreaTest(req: WeakAreaTestRequest): Promise<GeneratedMockTestResult> {
    this.validateBaseRequest(req.userId, req.examId);
    const targetCount = req.questionCount || 20;

    await this.verifyPremiumEntitlement(req.userId, req.examId, "WEAK_AREA");
    const blueprint = await this.resolveAuthoritativeBlueprint(req.examId, "weak_area", targetCount);

    const weakTopicIds = await this.resolveCandidateWeakTopics(req.userId, req.examId, req.subjectId);

    if (weakTopicIds.length === 0) {
      throw new GeneratorError(
        "NO_WEAK_AREAS_FOUND",
        "No weak topics identified yet. Complete a few assessments or select a specific topic test."
      );
    }

    const eligible = await this.fetchEligibleQuestions({
      examId: req.examId,
      topicIds: weakTopicIds,
      subjectId: req.subjectId,
      difficulty: req.difficulty,
      language: req.language || "en",
    });

    if (eligible.length < targetCount) {
      throw new GeneratorError(
        "INSUFFICIENT_QUESTION_POOL",
        `Insufficient weak-area questions mapped to target exam. Found ${eligible.length}, required ${targetCount}.`,
        { found: eligible.length, required: targetCount, weakTopicIds, examId: req.examId }
      );
    }

    const selected = await this.selectBalancedQuestions(eligible, targetCount, req.userId);
    this.validateQuestionBatch(selected, targetCount);

    const title = req.title || `Targeted Weak Area Drill (${targetCount} Questions)`;
    return await this.createAtomicMockInstance({
      userId: req.userId,
      examId: req.examId,
      templateId: blueprint.templateId,
      title,
      testType: "weak_area",
      quotaKey: "WEAK_AREA",
      durationMinutes: blueprint.durationMinutes,
      marksPerQuestion: blueprint.marksPerQuestion,
      negativeMark: blueprint.negativeMark,
      questions: selected,
      metadata: {
        generator_version: this.GENERATOR_VERSION,
        generation_type: "WEAK_AREA",
        exam_id: req.examId,
        subject_id: req.subjectId || null,
        identified_weak_topics: weakTopicIds,
        requested_count: targetCount,
        pool_size: eligible.length,
      },
    });
  }

  // --------------------------------------------------------------------------
  // 3. MISTAKE REVISION TEST GENERATION
  // --------------------------------------------------------------------------
  static async generateMistakeRevisionTest(req: MistakeRevisionTestRequest): Promise<GeneratedMockTestResult> {
    this.validateBaseRequest(req.userId, req.examId);
    const targetCount = req.questionCount || 20;

    // Quota check is handled exclusively via Phase 3B entitlement logic
    await this.verifyPremiumEntitlement(req.userId, req.examId, "MISTAKE_REVISION");

    const mistakeQuestionIds = await this.fetchCandidateMistakeQuestionIds(req.userId, req.examId);

    if (mistakeQuestionIds.length === 0) {
      throw new GeneratorError(
        "NO_MISTAKES_FOUND",
        "No unresolved mistakes found in your Mistake Vault! Great job keeping your vault clean."
      );
    }

    const eligible = await this.fetchEligibleQuestionsByIds(mistakeQuestionIds, req.language || "en");

    if (eligible.length === 0) {
      throw new GeneratorError(
        "INSUFFICIENT_QUESTION_POOL",
        "Could not load valid question versions for identified mistakes."
      );
    }

    const actualCount = Math.min(targetCount, eligible.length);
    const selected = eligible.slice(0, actualCount);
    this.validateQuestionBatch(selected, actualCount);

    const blueprint = await this.resolveAuthoritativeBlueprint(req.examId, "mistake_revision", actualCount);

    const title = req.title || `Mistake Revision Drill (${actualCount} Questions)`;
    return await this.createAtomicMockInstance({
      userId: req.userId,
      examId: req.examId,
      templateId: blueprint.templateId,
      title,
      testType: "mistake_revision",
      quotaKey: "MISTAKE_REVISION",
      durationMinutes: blueprint.durationMinutes,
      marksPerQuestion: blueprint.marksPerQuestion,
      negativeMark: blueprint.negativeMark,
      questions: selected,
      metadata: {
        generator_version: this.GENERATOR_VERSION,
        generation_type: "MISTAKE_REVISION",
        exam_id: req.examId,
        vault_mistakes_count: mistakeQuestionIds.length,
        selected_count: actualCount,
        source: "user_mistake_vault",
      },
    });
  }

  // --------------------------------------------------------------------------
  // 4. PERSONALIZED DYNAMIC TEST GENERATION
  // --------------------------------------------------------------------------
  static async generatePersonalizedTest(req: PersonalizedTestRequest): Promise<GeneratedMockTestResult> {
    this.validateBaseRequest(req.userId, req.examId);
    const targetCount = req.questionCount || 25;
    const weakRatio = req.blueprintConfig?.weakAreasRatio !== undefined ? req.blueprintConfig.weakAreasRatio : 0.6;

    await this.verifyPremiumEntitlement(req.userId, req.examId, "PERSONALIZED");
    const blueprint = await this.resolveAuthoritativeBlueprint(req.examId, "personalized", targetCount);

    const weakTopicIds = await this.resolveCandidateWeakTopics(req.userId, req.examId);
    const mistakeQuestionIds = await this.fetchCandidateMistakeQuestionIds(req.userId, req.examId);

    const weakCount = Math.round(targetCount * weakRatio);

    let weakPool: EligibleQuestion[] = [];
    if (weakTopicIds.length > 0 || mistakeQuestionIds.length > 0) {
      weakPool = await this.fetchEligibleQuestions({
        examId: req.examId,
        topicIds: weakTopicIds.length > 0 ? weakTopicIds : undefined,
        language: req.language || "en",
        difficulty: req.difficulty,
      });
    }

    const generalPool = await this.fetchEligibleQuestions({
      examId: req.examId,
      language: req.language || "en",
      difficulty: req.difficulty,
    });

    if (generalPool.length < targetCount) {
      throw new GeneratorError(
        "INSUFFICIENT_QUESTION_POOL",
        `Insufficient questions mapped to target exam syllabus. Found ${generalPool.length}, required ${targetCount}.`
      );
    }

    const selectedWeak = weakPool.slice(0, Math.min(weakCount, weakPool.length));
    const selectedWeakIds = new Set(selectedWeak.map((q) => q.questionId));

    const remainingNeeded = targetCount - selectedWeak.length;
    const availableGeneral = generalPool.filter((q) => !selectedWeakIds.has(q.questionId));
    const selectedGeneral = availableGeneral.slice(0, remainingNeeded);

    const combined = [...selectedWeak, ...selectedGeneral];

    if (combined.length < targetCount) {
      throw new GeneratorError(
        "INSUFFICIENT_QUESTION_POOL",
        `Could not assemble complete personalized test. Found ${combined.length}/${targetCount} valid questions.`
      );
    }

    this.validateQuestionBatch(combined, targetCount);

    const title = req.title || `Personalized Adaptive Mock (${targetCount} Qs)`;
    return await this.createAtomicMockInstance({
      userId: req.userId,
      examId: req.examId,
      templateId: blueprint.templateId,
      title,
      testType: "personalized",
      quotaKey: "PERSONALIZED",
      durationMinutes: blueprint.durationMinutes,
      marksPerQuestion: blueprint.marksPerQuestion,
      negativeMark: blueprint.negativeMark,
      questions: combined,
      metadata: {
        generator_version: this.GENERATOR_VERSION,
        generation_type: "PERSONALIZED",
        exam_id: req.examId,
        weak_topics_used: weakTopicIds,
        weak_ratio_configured: weakRatio,
        weak_questions_count: selectedWeak.length,
        syllabus_balance_count: selectedGeneral.length,
        total_count: targetCount,
      },
    });
  }

  // --------------------------------------------------------------------------
  // 5. PYQ EXACT PAPER SIMULATION GENERATION
  // --------------------------------------------------------------------------
  static async generatePyqSimulation(req: PyqSimulationRequest): Promise<GeneratedMockTestResult> {
    this.validateBaseRequest(req.userId, req.examId);
    await this.verifyPremiumEntitlement(req.userId, req.examId, "PYQ");

    const adminSb = createAdminServerSupabaseClient();

    // Query question_sources matching exact year, shift, and paper_code
    let query = adminSb
      .from("question_sources")
      .select("id, question_id, exam_name, year, shift, paper_code, question_number, created_at")
      .eq("source_type", "PYQ")
      .eq("year", req.year);

    if (req.shift) query = query.eq("shift", req.shift);
    if (req.paperCode) query = query.eq("paper_code", req.paperCode);
    if (req.examName) query = query.ilike("exam_name", `%${req.examName}%`);

    const { data: sources, error } = await query;
    if (error || !sources || sources.length === 0) {
      throw new GeneratorError(
        "PYQ_NOT_AVAILABLE",
        `Previous Year Question paper not available for Year ${req.year}${req.shift ? ` (${req.shift})` : ""}.`
      );
    }

    // Verify all source records have valid question_number for exact official ordering
    const hasInvalidOrder = sources.some((s: any) => typeof s.question_number !== "number");
    if (hasInvalidOrder) {
      throw new GeneratorError(
        "PYQ_NOT_AVAILABLE",
        "Cannot reconstruct exact PYQ simulation: Missing original question_number sequencing in question_sources."
      );
    }

    // Sort strictly by official question_number ASC (never created_at)
    sources.sort((a: any, b: any) => (a.question_number || 0) - (b.question_number || 0));

    const questionIds = sources.map((s: any) => s.question_id);
    const eligibleMap = new Map<string, EligibleQuestion>();
    const eligibleList = await this.fetchEligibleQuestionsByIds(questionIds, req.language || "en");
    eligibleList.forEach((q) => eligibleMap.set(q.questionId, q));

    // Verify that every question from the official paper exists in the bank
    const orderedQuestions: EligibleQuestion[] = [];
    for (const src of sources as any[]) {
      const eq = eligibleMap.get(src.question_id);
      if (!eq) {
        throw new GeneratorError(
          "PYQ_NOT_AVAILABLE",
          `PYQ paper incomplete: Question #${src.question_number} is missing published version content.`
        );
      }
      orderedQuestions.push({
        ...eq,
        questionNumber: src.question_number,
      });
    }

    const blueprint = await this.resolveAuthoritativeBlueprint(req.examId, "pyq_shift", orderedQuestions.length);

    const title =
      req.title ||
      `${req.examName || "PYQ"} ${req.year}${req.shift ? ` Shift ${req.shift}` : ""} Official Simulation`;

    return await this.createAtomicMockInstance({
      userId: req.userId,
      examId: req.examId,
      templateId: blueprint.templateId,
      title,
      testType: "pyq_shift",
      quotaKey: "PYQ",
      durationMinutes: blueprint.durationMinutes,
      marksPerQuestion: blueprint.marksPerQuestion,
      negativeMark: blueprint.negativeMark,
      questions: orderedQuestions,
      metadata: {
        generator_version: this.GENERATOR_VERSION,
        generation_type: "PYQ",
        exam_id: req.examId,
        year: req.year,
        shift: req.shift || null,
        paper_code: req.paperCode || null,
        ordered_by: "question_sources.question_number",
        total_questions: orderedQuestions.length,
      },
    });
  }

  // ==========================================================================
  // AUTHORITATIVE BLUEPRINT RESOLUTION
  // ==========================================================================

  private static async resolveAuthoritativeBlueprint(
    examId: string,
    testType: string,
    questionCount: number
  ): Promise<ExamBlueprint> {
    const adminSb = createAdminServerSupabaseClient();

    // 1. Check existing mock_templates for exam
    const { data: template } = await adminSb
      .from("mock_templates")
      .select("id, pattern_id, exam_patterns(id, duration_minutes, total_questions, total_marks, negative_mark_value)")
      .eq("exam_id", examId)
      .limit(1)
      .maybeSingle();

    if (template && (template as any).exam_patterns) {
      const ep = (template as any).exam_patterns;
      const marksPerQ = ep.total_questions > 0 ? Number(ep.total_marks) / Number(ep.total_questions) : 2.0;
      const negMark = Number(ep.negative_mark_value) || 0.5;
      const durationPerQ = ep.total_questions > 0 ? Number(ep.duration_minutes) / Number(ep.total_questions) : 1.2;
      const computedDuration = Math.max(15, Math.ceil(questionCount * durationPerQ));

      return {
        templateId: template.id,
        patternId: ep.id,
        marksPerQuestion: Number(marksPerQ.toFixed(2)),
        negativeMark: Number(negMark.toFixed(2)),
        durationMinutes: computedDuration,
      };
    }

    // 2. Direct exam_patterns lookup via exam_cycles
    const { data: cycle } = await adminSb
      .from("exam_cycles")
      .select("id, exam_patterns(id, duration_minutes, total_questions, total_marks, negative_mark_value)")
      .eq("exam_id", examId)
      .limit(1)
      .maybeSingle();

    if (cycle && (cycle as any).exam_patterns?.[0]) {
      const ep = (cycle as any).exam_patterns[0];
      const marksPerQ = ep.total_questions > 0 ? Number(ep.total_marks) / Number(ep.total_questions) : 2.0;
      const negMark = Number(ep.negative_mark_value) || 0.5;
      const durationPerQ = ep.total_questions > 0 ? Number(ep.duration_minutes) / Number(ep.total_questions) : 1.2;
      const computedDuration = Math.max(15, Math.ceil(questionCount * durationPerQ));

      // Resolve or create template
      let tplId: string;
      const { data: newTpl } = await adminSb
        .from("mock_templates")
        .insert({
          exam_id: examId,
          exam_cycle_id: cycle.id,
          pattern_id: ep.id,
          title: `Dynamic Blueprint Template (${testType})`,
          slug: `tpl-dyn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          test_type: testType,
          is_free: false,
          is_active: true,
        } as any)
        .select("id")
        .single();

      tplId = newTpl?.id || "";
      if (!tplId) {
        throw new GeneratorError("BLUEPRINT_NOT_AVAILABLE", "Could not instantiate template for exam pattern.");
      }

      return {
        templateId: tplId,
        patternId: ep.id,
        marksPerQuestion: Number(marksPerQ.toFixed(2)),
        negativeMark: Number(negMark.toFixed(2)),
        durationMinutes: computedDuration,
      };
    }

    // If no exam pattern exists for this exam, do not fabricate universal defaults
    throw new GeneratorError(
      "BLUEPRINT_NOT_AVAILABLE",
      "No authoritative exam pattern or syllabus blueprint configured for this exam."
    );
  }

  // ==========================================================================
  // ELIGIBILITY & SELECTION
  // ==========================================================================

  private static validateBaseRequest(userId: string, examId: string): void {
    if (!userId || typeof userId !== "string") {
      throw new GeneratorError("INVALID_GENERATION_PARAMS", "Valid userId is required.");
    }
    if (!examId || typeof examId !== "string") {
      throw new GeneratorError("INVALID_GENERATION_PARAMS", "Valid examId is required.");
    }
  }

  private static async verifyPremiumEntitlement(
    userId: string,
    examId: string,
    quotaKey: PremiumQuotaKey
  ): Promise<void> {
    const access = await PremiumEntitlementService.checkPremiumAccess(userId, examId, quotaKey);
    if (!access.hasAccess && access.status !== "ACTIVE") {
      throw new GeneratorError(
        access.errorCode || "PREMIUM_REQUIRED",
        access.message || "Active Premium subscription is required to generate this mock test."
      );
    }
  }

  private static async fetchEligibleQuestions(options: {
    examId: string;
    topicIds?: string[];
    subjectId?: string;
    difficulty?: "easy" | "medium" | "hard" | "mixed";
    language: "en" | "hi";
  }): Promise<EligibleQuestion[]> {
    const adminSb = createAdminServerSupabaseClient();

    // Authoritative exam eligibility: questions MUST be mapped to target exam via exam_question_mappings
    let qQuery = adminSb
      .from("exam_question_mappings")
      .select("question_id, questions!inner(id, canonical_topic_id, status, topics(id, subject_id))")
      .eq("exam_id", options.examId)
      .eq("questions.status", "published");

    const { data: mappings, error: mapErr } = await qQuery;
    if (mapErr || !mappings) return [];

    let questionList = mappings.map((m: any) => ({
      id: m.questions.id,
      topicId: m.questions.canonical_topic_id,
      subjectId: m.questions.topics?.subject_id || null,
    }));

    // Secondary filter: topicIds
    if (options.topicIds && options.topicIds.length > 0) {
      const topicSet = new Set(options.topicIds);
      questionList = questionList.filter((q) => topicSet.has(q.topicId));
    }

    // Secondary filter: subjectId
    if (options.subjectId) {
      questionList = questionList.filter((q) => q.subjectId === options.subjectId);
    }

    if (questionList.length === 0) return [];

    const qIds = questionList.map((q) => q.id);
    return await this.fetchEligibleQuestionsByIds(qIds, options.language, options.difficulty);
  }

  private static async fetchEligibleQuestionsByIds(
    questionIds: string[],
    language: "en" | "hi" = "en",
    difficultyFilter?: "easy" | "medium" | "hard" | "mixed"
  ): Promise<EligibleQuestion[]> {
    if (questionIds.length === 0) return [];

    const adminSb = createAdminServerSupabaseClient();

    const { data: versions, error } = await adminSb
      .from("question_versions")
      .select(`
        id,
        question_id,
        version_number,
        question_text,
        difficulty,
        language,
        is_current,
        questions!inner(id, canonical_topic_id, topics(subject_id)),
        question_options(id, option_key, option_text, order_index),
        question_answers(correct_option_key, explanation_md)
      `)
      .in("question_id", questionIds)
      .eq("is_current", true)
      .eq("language", language);

    if (error || !versions) return [];

    const eligible: EligibleQuestion[] = [];

    for (const v of versions as any[]) {
      if (difficultyFilter && difficultyFilter !== "mixed" && v.difficulty !== difficultyFilter) {
        continue;
      }

      const options = (v.question_options || []).map((o: any) => ({
        key: o.option_key,
        text: o.option_text,
      }));
      if (options.length < 2) continue;

      const answer = v.question_answers;
      if (!answer || !answer.correct_option_key) continue;

      eligible.push({
        questionId: v.question_id,
        questionVersionId: v.id,
        topicId: v.questions.canonical_topic_id,
        subjectId: v.questions.topics?.subject_id || null,
        difficulty: v.difficulty,
        language: v.language,
        versionNumber: v.version_number,
        questionText: v.question_text,
        options,
        correctOptionKey: answer.correct_option_key,
        explanationMd: answer.explanation_md || null,
      });
    }

    return eligible;
  }

  private static async selectBalancedQuestions(
    pool: EligibleQuestion[],
    targetCount: number,
    userId: string
  ): Promise<EligibleQuestion[]> {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, targetCount);
  }

  private static validateQuestionBatch(questions: EligibleQuestion[], expectedCount: number): void {
    if (questions.length !== expectedCount) {
      throw new GeneratorError(
        "GENERATION_VALIDATION_FAILED",
        `Quality Validation Failed: Expected ${expectedCount} questions, got ${questions.length}.`
      );
    }

    const seenIds = new Set<string>();
    for (const q of questions) {
      if (seenIds.has(q.questionId)) {
        throw new GeneratorError(
          "GENERATION_VALIDATION_FAILED",
          `Quality Validation Failed: Duplicate question detected (ID: ${q.questionId}).`
        );
      }
      seenIds.add(q.questionId);

      if (!q.questionVersionId) {
        throw new GeneratorError(
          "GENERATION_VALIDATION_FAILED",
          `Quality Validation Failed: Missing question_version_id for question ${q.questionId}.`
        );
      }
      if (!q.options || q.options.length < 2) {
        throw new GeneratorError(
          "GENERATION_VALIDATION_FAILED",
          `Quality Validation Failed: Insufficient options for question ${q.questionId}.`
        );
      }
      if (!q.correctOptionKey) {
        throw new GeneratorError(
          "GENERATION_VALIDATION_FAILED",
          `Quality Validation Failed: Missing correct answer for question ${q.questionId}.`
        );
      }
    }
  }

  private static async resolveCandidateWeakTopics(
    userId: string,
    examId: string,
    subjectId?: string
  ): Promise<string[]> {
    const adminSb = createAdminServerSupabaseClient();

    let query = adminSb
      .from("user_topic_mastery")
      .select("canonical_topic_id, mastery_score, topics!inner(id, subject_id)")
      .eq("user_id", userId)
      .lt("mastery_score", 60)
      .order("mastery_score", { ascending: true })
      .limit(10);

    const { data: mastery } = await query;
    if (mastery && mastery.length > 0) {
      return mastery.map((m: any) => m.canonical_topic_id);
    }

    const { data: mistakes } = await adminSb
      .from("user_mistake_vault")
      .select("topic_id, total_mistakes_count")
      .eq("user_id", userId)
      .eq("lifecycle_status", "UNRESOLVED")
      .not("topic_id", "is", null)
      .order("total_mistakes_count", { ascending: false })
      .limit(5);

    if (mistakes && mistakes.length > 0) {
      return Array.from(new Set(mistakes.map((m: any) => m.topic_id).filter(Boolean)));
    }

    return [];
  }

  private static async fetchCandidateMistakeQuestionIds(userId: string, examId: string): Promise<string[]> {
    const adminSb = createAdminServerSupabaseClient();

    const { data: mistakes, error } = await adminSb
      .from("user_mistake_vault")
      .select("question_id, total_mistakes_count, last_mistake_at")
      .eq("user_id", userId)
      .in("lifecycle_status", ["UNRESOLVED", "REVISITING"])
      .order("total_mistakes_count", { ascending: false })
      .order("last_mistake_at", { ascending: false })
      .limit(50);

    if (error || !mistakes) return [];
    return mistakes.map((m: any) => m.question_id);
  }

  // --------------------------------------------------------------------------
  // ATOMIC DATABASE CREATION (TRUE TRANSACTION VIA RPC)
  // --------------------------------------------------------------------------
  private static async createAtomicMockInstance(params: {
    userId: string;
    examId: string;
    templateId: string;
    title: string;
    testType: string;
    quotaKey: PremiumQuotaKey;
    durationMinutes: number;
    marksPerQuestion: number;
    negativeMark: number;
    questions: EligibleQuestion[];
    metadata: Record<string, unknown>;
  }): Promise<GeneratedMockTestResult> {
    const adminSb = createAdminServerSupabaseClient();
    const uniqueSlug = `gen-${params.testType}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const questionPayloads = params.questions.map((q, idx) => ({
      question_version_id: q.questionVersionId,
      subject_id: q.subjectId || null,
      question_order: idx + 1,
      marks: params.marksPerQuestion,
      negative_mark: params.negativeMark,
    }));

    const rpcCall = adminSb.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>;

    const { data, error } = await rpcCall("fn_create_dynamic_mock_instance_atomic", {
      p_user_id: params.userId,
      p_exam_id: params.examId,
      p_template_id: params.templateId,
      p_title: params.title,
      p_slug: uniqueSlug,
      p_test_type: params.testType,
      p_quota_key: params.quotaKey,
      p_duration_minutes: params.durationMinutes,
      p_marks_per_question: params.marksPerQuestion,
      p_negative_mark: params.negativeMark,
      p_metadata: params.metadata,
      p_questions: questionPayloads,
      p_ttl_hours: this.DEFAULT_TTL_HOURS,
    });

    if (error || !data) {
      throw new GeneratorError("TRANSACTION_FAILED", `Atomic instance creation failed: ${error?.message || "Unknown error"}`);
    }

    const res = data as Record<string, unknown>;
    return {
      success: true,
      mockTestId: res.mock_test_id as string,
      slug: res.slug as string,
      title: res.title as string,
      testType: res.test_type as string,
      quotaKey: res.quota_key as PremiumQuotaKey,
      totalQuestions: res.total_questions as number,
      totalMarks: res.total_marks as number,
      durationMinutes: res.duration_minutes as number,
      lifecycleStatus: "GENERATED",
      expiresAt: res.expires_at as string,
      isDynamic: true,
      isFree: false,
      generationMetadata: params.metadata,
    };
  }
}
