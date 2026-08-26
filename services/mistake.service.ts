import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface MistakeVaultSummary {
  totalMistakes: number;
  unresolvedCount: number;
  revisitingCount: number;
  masteredCount: number;
  cognitiveBreakdown: Array<{
    id: string;
    name: string;
    count: number;
    description: string;
  }>;
  weakTopics: Array<{
    topicId: string;
    topicName: string;
    mistakeCount: number;
  }>;
}

export interface MistakeListItem {
  vaultId: string;
  questionId: string;
  questionText: string;
  topicName: string | null;
  subjectName: string | null;
  totalMistakesCount: number;
  consecutiveCorrect: number;
  lifecycleStatus: "UNRESOLVED" | "REVISITING" | "MASTERED";
  primaryCognitiveTypeId: string;
  primaryCognitiveName: string;
  userOverrideCognitiveTypeId: string | null;
  lastMistakeAt: string;
  masteredAt: string | null;
}

export interface MistakeDetail {
  vaultId: string;
  questionId: string;
  questionText: string;
  options: Array<{
    id: string;
    key: string;
    text: string;
    isCorrect?: boolean;
  }>;
  correctOptionKey: string;
  explanation: string | null;
  topicName: string | null;
  topicSlug: string | null;
  subjectName: string | null;
  totalMistakesCount: number;
  consecutiveCorrect: number;
  lifecycleStatus: "UNRESOLVED" | "REVISITING" | "MASTERED";
  primaryCognitiveTypeId: string;
  primaryCognitiveName: string;
  cognitiveDescription: string;
  remediationGuidance: string;
  userOverrideCognitiveTypeId: string | null;
  userCustomNotes: string | null;
  firstMistakeAt: string;
  lastMistakeAt: string;
  occurrences: Array<{
    id: string;
    sourceContext: string;
    responseTimeSeconds: number | null;
    inferredCognitiveTypeId: string;
    heuristicConfidencePct: number;
    occurredAt: string;
  }>;
}

export interface DrillQuestion {
  question_id: string;
  question_text: string;
  topic_id: string | null;
  options: Array<{
    id: string;
    option_key: string;
    option_text: string;
    order_index: number;
  }>;
}

export interface DrillSessionPayload {
  success: boolean;
  drill_id?: string;
  total_questions?: number;
  questions?: DrillQuestion[];
  error?: string;
}

export interface DrillSubmitResult {
  success: boolean;
  drill_id?: string;
  total_questions?: number;
  correct_count?: number;
  mistakes_resolved_count?: number;
  coins_awarded?: number;
  error?: string;
}

export class MistakeService {
  /**
   * Fetches aggregate statistics for the student's mistake notebook.
   */
  static async getMistakeVaultSummary(): Promise<MistakeVaultSummary> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return {
        totalMistakes: 0,
        unresolvedCount: 0,
        revisitingCount: 0,
        masteredCount: 0,
        cognitiveBreakdown: [],
        weakTopics: [],
      };
    }

    const [vaultRes, cognitiveTypesRes] = await Promise.all([
      supabase.from("user_mistake_vault").select("id, lifecycle_status, primary_cognitive_type_id, user_override_cognitive_type_id, topic_id, topics(name)").eq("user_id", user.id),
      supabase.from("mistake_cognitive_types").select("id, name, description").order("display_order"),
    ]);

    const vaultRows = (vaultRes.data as any[]) || [];
    const cognitiveTypes = (cognitiveTypesRes.data as any[]) || [];

    let unresolvedCount = 0;
    let revisitingCount = 0;
    let masteredCount = 0;

    const cognitiveCounts = new Map<string, number>();
    const topicCounts = new Map<string, { topicName: string; count: number }>();

    vaultRows.forEach((r) => {
      if (r.lifecycle_status === "UNRESOLVED") unresolvedCount++;
      else if (r.lifecycle_status === "REVISITING") revisitingCount++;
      else if (r.lifecycle_status === "MASTERED") masteredCount++;

      const activeCognitive = r.user_override_cognitive_type_id || r.primary_cognitive_type_id || "UNCLASSIFIED";
      cognitiveCounts.set(activeCognitive, (cognitiveCounts.get(activeCognitive) || 0) + 1);

      if (r.topic_id && r.topics?.name) {
        const existing = topicCounts.get(r.topic_id) || { topicName: r.topics.name, count: 0 };
        existing.count++;
        topicCounts.set(r.topic_id, existing);
      }
    });

    const cognitiveBreakdown = cognitiveTypes.map((ct) => ({
      id: ct.id,
      name: ct.name,
      count: cognitiveCounts.get(ct.id) || 0,
      description: ct.description,
    }));

    const weakTopics = Array.from(topicCounts.entries())
      .map(([topicId, val]) => ({
        topicId,
        topicName: val.topicName,
        mistakeCount: val.count,
      }))
      .sort((a, b) => b.mistakeCount - a.mistakeCount)
      .slice(0, 5);

    return {
      totalMistakes: vaultRows.length,
      unresolvedCount,
      revisitingCount,
      masteredCount,
      cognitiveBreakdown,
      weakTopics,
    };
  }

  /**
   * Fetches user's list of mistakes with filters.
   */
  static async getMistakesList(filters?: {
    status?: string;
    cognitiveType?: string;
  }): Promise<MistakeListItem[]> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return [];

    let query = supabase
      .from("user_mistake_vault")
      .select("id, question_id, total_mistakes_count, consecutive_correct_in_remediation, lifecycle_status, primary_cognitive_type_id, user_override_cognitive_type_id, last_mistake_at, mastered_at, topics(name), subjects(name), mistake_cognitive_types!primary_cognitive_type_id(name), questions(question_versions(question_text))")
      .eq("user_id", user.id)
      .order("last_mistake_at", { ascending: false });

    if (filters?.status && filters.status !== "ALL") {
      query = query.eq("lifecycle_status", filters.status);
    }
    if (filters?.cognitiveType && filters.cognitiveType !== "ALL") {
      query = query.eq("primary_cognitive_type_id", filters.cognitiveType);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return (data as any[]).map((r) => {
      const qText = r.questions?.question_versions?.[0]?.question_text || "Question prompt unavailable";
      return {
        vaultId: r.id,
        questionId: r.question_id,
        questionText: qText,
        topicName: r.topics?.name || null,
        subjectName: r.subjects?.name || null,
        totalMistakesCount: r.total_mistakes_count,
        consecutiveCorrect: r.consecutive_correct_in_remediation,
        lifecycleStatus: r.lifecycle_status,
        primaryCognitiveTypeId: r.primary_cognitive_type_id,
        primaryCognitiveName: r.mistake_cognitive_types?.name || r.primary_cognitive_type_id,
        userOverrideCognitiveTypeId: r.user_override_cognitive_type_id,
        lastMistakeAt: r.last_mistake_at,
        masteredAt: r.mastered_at,
      };
    });
  }

  /**
   * Fetches comprehensive details of an individual mistake.
   */
  static async getMistakeDetail(vaultId: string): Promise<MistakeDetail | null> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: vaultRow } = await supabase
      .from("user_mistake_vault")
      .select("*, topics(name, slug), subjects(name), mistake_cognitive_types!primary_cognitive_type_id(name, description, remediation_guidance)")
      .eq("id", vaultId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!vaultRow) return null;
    const v = vaultRow as any;

    const [occurrencesRes, questionRes] = await Promise.all([
      supabase.from("user_mistake_occurrences").select("id, source_context, response_time_seconds, inferred_cognitive_type_id, heuristic_confidence_pct, occurred_at").eq("vault_id", vaultId).order("occurred_at", { ascending: false }),
      supabase.from("questions").select("id, question_versions(id, question_text, question_options(id, option_key, content_text, option_order), question_answers(correct_option_key, solution_explanation_md))").eq("id", v.question_id).single(),
    ]);

    const qData = questionRes.data as any;
    const qv = qData?.question_versions?.[0];

    const options = (qv?.question_options || [])
      .sort((a: any, b: any) => (a.option_order || 0) - (b.option_order || 0))
      .map((o: any) => ({
        id: o.id,
        key: o.option_key,
        text: o.content_text,
      }));

    return {
      vaultId: v.id,
      questionId: v.question_id,
      questionText: qv?.question_text || "",
      options,
      correctOptionKey: qv?.question_answers?.[0]?.correct_option_key || "A",
      explanation: qv?.question_answers?.[0]?.solution_explanation_md || null,
      topicName: v.topics?.name || null,
      topicSlug: v.topics?.slug || null,
      subjectName: v.subjects?.name || null,
      totalMistakesCount: v.total_mistakes_count,
      consecutiveCorrect: v.consecutive_correct_in_remediation,
      lifecycleStatus: v.lifecycle_status,
      primaryCognitiveTypeId: v.primary_cognitive_type_id,
      primaryCognitiveName: v.mistake_cognitive_types?.name || v.primary_cognitive_type_id,
      cognitiveDescription: v.mistake_cognitive_types?.description || "",
      remediationGuidance: v.mistake_cognitive_types?.remediation_guidance || "",
      userOverrideCognitiveTypeId: v.user_override_cognitive_type_id,
      userCustomNotes: v.user_custom_notes,
      firstMistakeAt: v.first_mistake_at,
      lastMistakeAt: v.last_mistake_at,
      occurrences: (occurrencesRes.data as any[]) || [],
    };
  }

  /**
   * Updates student's custom notes or classification override.
   */
  static async updateMistakeOverride(
    vaultId: string,
    overrideCognitiveTypeId: string | null,
    customNotes?: string
  ): Promise<boolean> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return false;

    const { error } = await (supabase.from("user_mistake_vault") as any).update({
      user_override_cognitive_type_id: overrideCognitiveTypeId,
      user_custom_notes: customNotes,
      updated_at: new Date().toISOString(),
    }).eq("id", vaultId).eq("user_id", user.id);

    return !error;
  }

  /**
   * Generates a focused mistake remediation drill via Phase 3O fn_generate_mistake_drill.
   */
  static async generateMistakeDrill(
    topicId?: string,
    cognitiveTypeId?: string,
    limit: number = 10
  ): Promise<DrillSessionPayload> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as any;

    const { data, error } = await rpcCall("fn_generate_mistake_drill", {
      p_topic_id: topicId || null,
      p_cognitive_type_id: cognitiveTypeId || null,
      p_limit: limit,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to generate drill" };
    }

    return data as DrillSessionPayload;
  }

  /**
   * Evaluates remediation drill answers via Phase 3O fn_submit_mistake_drill.
   */
  static async submitMistakeDrill(
    drillId: string,
    answers: Array<{ question_id: string; selected_option_id: string; time_spent_seconds: number }>
  ): Promise<DrillSubmitResult> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as any;

    const { data, error } = await rpcCall("fn_submit_mistake_drill", {
      p_drill_id: drillId,
      p_answers: answers,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to submit drill" };
    }

    return data as DrillSubmitResult;
  }
}