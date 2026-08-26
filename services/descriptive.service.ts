import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface DescriptiveQuestionItem {
  id: string;
  slug: string;
  title: string;
  questionText: string;
  maxMarks: number;
  wordLimitMin: number | null;
  wordLimitMax: number;
  timeLimitMinutes: number | null;
  difficulty: "easy" | "medium" | "hard";
  examTitle: string | null;
  topicName: string | null;
  subjectName: string | null;
}

export interface DescriptiveQuestionDetail extends DescriptiveQuestionItem {
  modelAnswerMd: string | null;
  evaluationGuidelinesMd: string | null;
  userSubmission: {
    id: string;
    attemptNumber: number;
    status: string;
    submittedAt: string;
    scoreAwarded?: number;
  } | null;
}

export interface DescriptiveSubmissionItem {
  id: string;
  questionId: string;
  questionTitle: string;
  examTitle: string | null;
  attemptNumber: number;
  submissionType: "TYPED_TEXT" | "ATTACHED_SCRIPT_PDF" | "HYBRID";
  wordCount: number;
  status: "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "EVALUATED" | "RETURNED_FOR_REVISION" | "ARCHIVED";
  submittedAt: string;
  totalScoreAwarded?: number;
  maxMarks?: number;
  percentageScore?: number;
  evaluatorType?: string;
}

export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  maxPoints: number;
}

export interface SubmissionEvaluationDetail {
  submission: {
    id: string;
    questionId: string;
    questionTitle: string;
    questionText: string;
    maxMarks: number;
    answerText: string | null;
    attachmentUrl: string | null;
    submissionType: string;
    wordCount: number;
    attemptNumber: number;
    status: string;
    submittedAt: string;
    batchId: string | null;
    modelAnswerMd?: string | null;
  };
  rubric: {
    id: string;
    title: string;
    criteria: RubricCriterion[];
    maxTotalScore: number;
  } | null;
  evaluation: {
    id: string;
    evaluatorUserId: string | null;
    evaluatorType: string;
    rubricSnapshot: any;
    rubricScores: Array<{
      criterionId: string;
      criterionName: string;
      scoreAwarded: number;
      maxPoints: number;
      feedback?: string;
    }>;
    totalScoreAwarded: number;
    percentageScore: number;
    strengthsFeedback: string | null;
    weaknessesFeedback: string | null;
    improvementSuggestions: string | null;
    modelAnswerComparisonMd: string | null;
    evaluationStatus: string;
    completedAt: string;
  } | null;
  canEvaluate: boolean;
}

export class DescriptiveService {
  /**
   * Fetches published descriptive Mains questions.
   */
  static async getDescriptiveQuestions(filters?: {
    examId?: string;
    topicId?: string;
    difficulty?: string;
  }): Promise<DescriptiveQuestionItem[]> {
    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from("descriptive_questions")
      .select("id, slug, title, question_text, max_marks, word_limit_min, word_limit_max, time_limit_minutes, difficulty, exams(title), topics(name), subjects(name)")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (filters?.examId && filters.examId !== "ALL") {
      query = query.eq("exam_id", filters.examId);
    }
    if (filters?.topicId && filters.topicId !== "ALL") {
      query = query.eq("topic_id", filters.topicId);
    }
    if (filters?.difficulty && filters.difficulty !== "ALL") {
      query = query.eq("difficulty", filters.difficulty);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return (data as any[]).map((q) => ({
      id: q.id,
      slug: q.slug,
      title: q.title,
      questionText: q.question_text,
      maxMarks: Number(q.max_marks || 15),
      wordLimitMin: q.word_limit_min,
      wordLimitMax: q.word_limit_max || 250,
      timeLimitMinutes: q.time_limit_minutes,
      difficulty: q.difficulty,
      examTitle: q.exams?.title || null,
      topicName: q.topics?.name || null,
      subjectName: q.subjects?.name || null,
    }));
  }

  /**
   * Fetches details of a specific descriptive question.
   * Model answer is hidden unless evaluated submission exists for current user.
   */
  static async getDescriptiveQuestionDetail(idOrSlug: string): Promise<DescriptiveQuestionDetail | null> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    let query = supabase
      .from("descriptive_questions")
      .select("*, exams(title), topics(name), subjects(name)")
      .eq("is_published", true);

    if (isUuid) {
      query = query.eq("id", idOrSlug);
    } else {
      query = query.eq("slug", idOrSlug);
    }

    const { data: qData } = await query.maybeSingle();
    if (!qData) return null;
    const q = qData as any;

    let userSubmission: any = null;
    let isEvaluated = false;

    if (user) {
      const { data: subData } = await supabase
        .from("user_descriptive_submissions")
        .select("id, attempt_number, status, submitted_at")
        .eq("question_id", q.id)
        .eq("user_id", user.id)
        .order("attempt_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      const sub = subData as any;
      if (sub) {
        userSubmission = {
          id: sub.id,
          attemptNumber: sub.attempt_number,
          status: sub.status,
          submittedAt: sub.submitted_at,
        };
        isEvaluated = sub.status === "EVALUATED";
      }
    }

    return {
      id: q.id,
      slug: q.slug,
      title: q.title,
      questionText: q.question_text,
      maxMarks: Number(q.max_marks || 15),
      wordLimitMin: q.word_limit_min,
      wordLimitMax: q.word_limit_max || 250,
      timeLimitMinutes: q.time_limit_minutes,
      difficulty: q.difficulty,
      examTitle: q.exams?.title || null,
      topicName: q.topics?.name || null,
      subjectName: q.subjects?.name || null,
      // Hide model answer until evaluated
      modelAnswerMd: isEvaluated ? q.model_answer_md : null,
      evaluationGuidelinesMd: q.evaluation_guidelines_md || null,
      userSubmission,
    };
  }

  /**
   * Submits student descriptive answer via fn_submit_descriptive_answer.
   */
  static async submitDescriptiveAnswer(payload: {
    questionId: string;
    answerText?: string;
    attachmentUrl?: string;
    submissionType?: string;
    batchId?: string;
    assignmentId?: string;
  }): Promise<{
    success: boolean;
    submission_id?: string;
    attempt_number?: number;
    word_count?: number;
    status?: string;
    error?: string;
  }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as any;

    const { data, error } = await rpcCall("fn_submit_descriptive_answer", {
      p_question_id: payload.questionId,
      p_answer_text: payload.answerText || null,
      p_attachment_url: payload.attachmentUrl || null,
      p_submission_type: payload.submissionType || "TYPED_TEXT",
      p_batch_id: payload.batchId || null,
      p_assignment_id: payload.assignmentId || null,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to submit descriptive answer" };
    }

    return data;
  }

  /**
   * Fetches user's list of descriptive submissions.
   */
  static async getUserSubmissions(): Promise<DescriptiveSubmissionItem[]> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return [];

    const { data } = await supabase
      .from("user_descriptive_submissions")
      .select("id, question_id, attempt_number, submission_type, word_count, status, submitted_at, descriptive_questions(title, max_marks, exams(title)), submission_evaluations(total_score_awarded, percentage_score, evaluator_type)")
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false });

    if (!data) return [];

    return (data as any[]).map((s) => {
      const q = s.descriptive_questions;
      const ev = s.submission_evaluations?.[0] || s.submission_evaluations;

      return {
        id: s.id,
        questionId: s.question_id,
        questionTitle: q?.title || "Descriptive Question",
        examTitle: q?.exams?.title || null,
        attemptNumber: s.attempt_number,
        submissionType: s.submission_type,
        wordCount: s.word_count,
        status: s.status,
        submittedAt: s.submitted_at,
        totalScoreAwarded: ev?.total_score_awarded !== undefined ? Number(ev.total_score_awarded) : undefined,
        maxMarks: q?.max_marks ? Number(q.max_marks) : undefined,
        percentageScore: ev?.percentage_score !== undefined ? Number(ev.percentage_score) : undefined,
        evaluatorType: ev?.evaluator_type || undefined,
      };
    });
  }

  /**
   * Fetches comprehensive details for a single submission and its evaluation.
   */
  static async getSubmissionDetail(submissionId: string): Promise<SubmissionEvaluationDetail | null> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: subData } = await supabase
      .from("user_descriptive_submissions")
      .select("*, descriptive_questions(*), submission_evaluations(*), evaluation_rubrics(*)")
      .eq("id", submissionId)
      .maybeSingle();

    if (!subData) return null;
    const s = subData as any;
    const q = s.descriptive_questions;
    const ev = s.submission_evaluations?.[0] || s.submission_evaluations;
    const rub = s.evaluation_rubrics;

    let canEvaluate = false;
    if (user) {
      const rpcCall = supabase.rpc as any;
      const { data: canEval } = await rpcCall("fn_can_evaluate_submission", {
        p_submission_id: submissionId,
        p_user_id: user.id,
      });
      canEvaluate = !!canEval;
    }

    const isEvaluated = s.status === "EVALUATED";

    return {
      submission: {
        id: s.id,
        questionId: s.question_id,
        questionTitle: q?.title || "Descriptive Question",
        questionText: q?.question_text || "",
        maxMarks: Number(q?.max_marks || 15),
        answerText: s.answer_text,
        attachmentUrl: s.attachment_url,
        submissionType: s.submission_type,
        wordCount: s.word_count,
        attemptNumber: s.attempt_number,
        status: s.status,
        submittedAt: s.submitted_at,
        batchId: s.batch_id,
        modelAnswerMd: isEvaluated ? q?.model_answer_md : null,
      },
      rubric: rub
        ? {
            id: rub.id,
            title: rub.title,
            criteria: rub.criteria || [],
            maxTotalScore: Number(rub.max_total_score || 100),
          }
        : null,
      evaluation: ev
        ? {
            id: ev.id,
            evaluatorUserId: ev.evaluator_user_id,
            evaluatorType: ev.evaluator_type,
            rubricSnapshot: ev.rubric_snapshot,
            rubricScores: ev.rubric_scores || [],
            totalScoreAwarded: Number(ev.total_score_awarded),
            percentageScore: Number(ev.percentage_score),
            strengthsFeedback: ev.strengths_feedback,
            weaknessesFeedback: ev.weaknesses_feedback,
            improvementSuggestions: ev.improvement_suggestions,
            modelAnswerComparisonMd: ev.model_answer_comparison_md,
            evaluationStatus: ev.evaluation_status,
            completedAt: ev.completed_at,
          }
        : null,
      canEvaluate,
    };
  }

  /**
   * Fetches faculty queue of pending submissions for evaluation.
   */
  static async getFacultyEvaluationQueue(): Promise<DescriptiveSubmissionItem[]> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return [];

    const { data } = await supabase
      .from("user_descriptive_submissions")
      .select("id, question_id, attempt_number, submission_type, word_count, status, submitted_at, descriptive_questions(title, max_marks, exams(title))")
      .in("status", ["SUBMITTED", "IN_REVIEW"])
      .order("submitted_at", { ascending: true });

    if (!data) return [];

    return (data as any[]).map((s) => ({
      id: s.id,
      questionId: s.question_id,
      questionTitle: s.descriptive_questions?.title || "Descriptive Question",
      examTitle: s.descriptive_questions?.exams?.title || null,
      attemptNumber: s.attempt_number,
      submissionType: s.submission_type,
      wordCount: s.word_count,
      status: s.status,
      submittedAt: s.submitted_at,
      maxMarks: s.descriptive_questions?.max_marks ? Number(s.descriptive_questions.max_marks) : undefined,
    }));
  }

  /**
   * Submits faculty evaluation via fn_evaluate_descriptive_submission.
   */
  static async submitFacultyEvaluation(payload: {
    submissionId: string;
    rubricScores: any[];
    totalScore: number;
    strengths?: string;
    weaknesses?: string;
    suggestions?: string;
    modelComparison?: string;
    evaluatorType?: string;
  }): Promise<{
    success: boolean;
    evaluation_id?: string;
    submission_id?: string;
    total_score_awarded?: number;
    percentage_score?: number;
    status?: string;
    error?: string;
  }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as any;

    const { data, error } = await rpcCall("fn_evaluate_descriptive_submission", {
      p_submission_id: payload.submissionId,
      p_rubric_scores: payload.rubricScores,
      p_total_score: payload.totalScore,
      p_strengths: payload.strengths || null,
      p_weaknesses: payload.weaknesses || null,
      p_suggestions: payload.suggestions || null,
      p_model_comparison: payload.modelComparison || null,
      p_evaluator_type: payload.evaluatorType || "HUMAN_FACULTY",
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to submit faculty evaluation" };
    }

    return data;
  }
}
