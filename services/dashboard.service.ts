import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface DashboardData {
  user: {
    id: string;
    email?: string;
    fullName?: string;
  } | null;
  wallet: {
    current_balance: number;
    lifetime_earned: number;
  } | null;
  streak: {
    current_streak: number;
    longest_streak: number;
    freeze_active: boolean;
  } | null;
  readiness: {
    overall_score: number;
    target_score: number;
  } | null;
  topicMastery: Array<{
    id: string;
    topic_id: string;
    topic_name: string;
    mastery_percentage: number;
    status: string;
  }>;
  dailyRecommendations: Array<{
    id: string;
    task_title: string;
    task_type: string;
    estimated_minutes: number;
    priority: string;
    is_completed: boolean;
  }>;
  recentActivity: Array<{
    id: string;
    event_type: string;
    resource_slug: string | null;
    time_spent_seconds: number;
    occurred_at: string;
  }>;
  mistakesCount: number;
  enrolledBatches: Array<{
    id: string;
    batch_name: string;
    institute_name: string;
    role: string;
  }>;
}

export class DashboardService {
  static async getStudentDashboardData(): Promise<DashboardData> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return {
        user: null,
        wallet: null,
        streak: null,
        readiness: null,
        topicMastery: [],
        dailyRecommendations: [],
        recentActivity: [],
        mistakesCount: 0,
        enrolledBatches: [],
      };
    }

    const userId = user.id;

    // Parallel fetch from Phase 3A-3Q tables
    const [
      walletRes,
      streakRes,
      readinessRes,
      masteryRes,
      recRes,
      activityRes,
      mistakesRes,
      batchesRes,
    ] = await Promise.all([
      supabase.from("coin_wallets").select("current_balance, lifetime_earned").eq("user_id", userId).maybeSingle(),
      supabase.from("user_streaks").select("current_streak, longest_streak, freeze_active").eq("user_id", userId).maybeSingle(),
      supabase.from("user_exam_readiness").select("overall_readiness_pct, predicted_score").eq("user_id", userId).maybeSingle(),
      supabase.from("user_topic_mastery").select("id, topic_id, mastery_percentage, status, topics(name)").eq("user_id", userId).order("mastery_percentage", { ascending: false }).limit(6),
      supabase.from("daily_study_recommendations").select("id, recommendation_title, item_type, estimated_minutes, priority, is_completed").eq("user_id", userId).limit(5),
      supabase.from("learning_activity_events").select("id, event_type, resource_slug, time_spent_seconds, occurred_at").eq("user_id", userId).order("occurred_at", { ascending: false }).limit(5),
      supabase.from("user_mistake_vault").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "ACTIVE"),
      supabase.from("batch_memberships").select("id, role, institute_batches(name), institutes(name)").eq("user_id", userId).eq("status", "ACTIVE"),
    ]);

    const walletData = walletRes.data as { current_balance: number; lifetime_earned: number } | null;
    const streakData = streakRes.data as { current_streak: number; longest_streak: number; freeze_active: boolean } | null;
    const readinessData = readinessRes.data as { overall_readiness_pct: number; predicted_score: number } | null;

    const topicMastery = ((masteryRes.data as any[]) || []).map((m: any) => ({
      id: m.id,
      topic_id: m.topic_id,
      topic_name: m.topics?.name || "Topic",
      mastery_percentage: Number(m.mastery_percentage) || 0,
      status: m.status,
    }));

    const dailyRecommendations = ((recRes.data as any[]) || []).map((r: any) => ({
      id: r.id,
      task_title: r.recommendation_title || "Daily Task",
      task_type: r.item_type || "PRACTICE",
      estimated_minutes: r.estimated_minutes || 15,
      priority: r.priority || "MEDIUM",
      is_completed: r.is_completed || false,
    }));

    const enrolledBatches = ((batchesRes.data as any[]) || []).map((b: any) => ({
      id: b.id,
      batch_name: b.institute_batches?.name || "Batch",
      institute_name: b.institutes?.name || "Institute",
      role: b.role,
    }));

    const recentActivity = ((activityRes.data as any[]) || []).map((act: any) => ({
      id: act.id,
      event_type: act.event_type,
      resource_slug: act.resource_slug,
      time_spent_seconds: act.time_spent_seconds,
      occurred_at: act.occurred_at,
    }));

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.user_metadata?.full_name || user.email?.split("@")[0] || "Aspirant",
      },
      wallet: walletData ? {
        current_balance: walletData.current_balance,
        lifetime_earned: walletData.lifetime_earned,
      } : { current_balance: 0, lifetime_earned: 0 },
      streak: streakData ? {
        current_streak: streakData.current_streak,
        longest_streak: streakData.longest_streak,
        freeze_active: streakData.freeze_active,
      } : { current_streak: 0, longest_streak: 0, freeze_active: false },
      readiness: readinessData ? {
        overall_score: Number(readinessData.overall_readiness_pct) || 0,
        target_score: Number(readinessData.predicted_score) || 0,
      } : null,
      topicMastery,
      dailyRecommendations,
      recentActivity,
      mistakesCount: mistakesRes.count || 0,
      enrolledBatches,
    };
  }
}