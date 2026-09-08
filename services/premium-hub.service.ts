import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import {
  PremiumEntitlementService,
  QuotaItem,
} from "@/services/premium-entitlement.service";
import { AdminPremiumService } from "@/services/admin-premium.service";
import { MistakeService } from "@/services/mistake.service";

export interface PremiumHubExam {
  id: string;
  name: string;
  code: string;
  category?: string;
}

export interface PremiumHubSubject {
  id: string;
  name: string;
  code?: string;
  topics: Array<{
    id: string;
    name: string;
  }>;
}

export interface ActiveTestAttempt {
  attemptId: string;
  mockTestId: string;
  title: string;
  testType?: string;
  startedAt: string;
  durationMinutes: number;
}

export interface RecentPremiumAttempt {
  attemptId: string;
  mockTestId: string;
  title: string;
  testType?: string;
  isDynamic: boolean;
  startedAt: string;
  submittedAt: string;
  resultId?: string;
  score?: number;
  totalScore?: number;
  accuracyPercentage?: number;
  percentile?: number;
}

export interface CuratedMockTestItem {
  id: string;
  title: string;
  slug: string;
  examId?: string;
  examName?: string;
  testType: string;
  durationMinutes: number;
  totalMarks: number;
  totalQuestions: number;
  difficulty?: string;
  isFree: boolean;
  seriesTitle?: string;
  userAttemptStatus?: "not_started" | "in_progress" | "completed";
  latestAttemptId?: string;
  latestScore?: number;
}

export interface CandidateWeakTopic {
  topicId: string;
  topicName: string;
  subjectName?: string;
  mistakeCount: number;
  accuracyPercentage: number;
}

export interface PremiumHubData {
  user: {
    id: string;
    email?: string;
    fullName?: string;
  };
  globalStatus: {
    isPremiumEnabled: boolean;
    isMaintenanceMode: boolean;
    maintenanceNotice?: string;
  };
  entitlement: {
    hasAccess: boolean;
    status: "ACTIVE" | "QUOTA_EXHAUSTED" | "PREMIUM_REQUIRED" | "PREMIUM_EXPIRED" | "PREMIUM_NOT_STARTED";
    planName?: string;
    tier?: string;
    startsAt?: string;
    expiresAt?: string | null;
    daysRemaining?: number | null;
  };
  quotas: QuotaItem[];
  activeAttempt: ActiveTestAttempt | null;
  selectedExam: PremiumHubExam | null;
  availableExams: PremiumHubExam[];
  subjectsWithTopics: PremiumHubSubject[];
  weakTopics: CandidateWeakTopic[];
  mistakeVaultCount: number;
  curatedMocks: CuratedMockTestItem[];
  recentAttempts: RecentPremiumAttempt[];
  stats: {
    totalPremiumAttempts: number;
    completedTests: number;
    averageAccuracy: number;
    bestScore: number;
  };
}

export class PremiumHubService {
  /**
   * Fetches all aggregated data needed to render the Candidate Premium Hub.
   */
  static async getHubData(userId: string, targetExamId?: string): Promise<PremiumHubData> {
    const adminSb = createAdminServerSupabaseClient();

    // 1. Fetch Global Config
    let isPremiumEnabled = true;
    let isMaintenanceMode = false;
    let maintenanceNotice = "";

    try {
      const globalConfig = await AdminPremiumService.getGlobalConfig();
      isPremiumEnabled = globalConfig.is_premium_enabled;
      isMaintenanceMode = globalConfig.maintenance_mode;
      maintenanceNotice = globalConfig.maintenance_message || "";
    } catch {
      // Fallback
    }

    // 2. Fetch User Profile
    const { data: userAuthData } = await adminSb.auth.admin.getUserById(userId);
    const fullName =
      (userAuthData?.user?.user_metadata?.full_name as string) ||
      userAuthData?.user?.email?.split("@")[0] ||
      "Candidate";

    // 3. Fetch Available Exams
    const { data: examsData } = await adminSb
      .from("exams")
      .select("id, title, slug, category")
      .eq("is_active", true)
      .order("title", { ascending: true });

    const availableExams: PremiumHubExam[] = (examsData || []).map((e) => ({
      id: e.id,
      name: e.title,
      code: e.slug,
      category: e.category || undefined,
    }));

    // Determine selected exam
    let selectedExam: PremiumHubExam | null = null;
    if (targetExamId && availableExams.some((e) => e.id === targetExamId)) {
      selectedExam = availableExams.find((e) => e.id === targetExamId) || null;
    } else if (availableExams.length > 0) {
      selectedExam = availableExams[0];
    }

    const examId = selectedExam?.id;

    // 4. Fetch User Entitlement & Quotas
    const entitlementCheck = await PremiumEntitlementService.checkPremiumAccess(userId, examId);
    let quotas: QuotaItem[] = [];
    try {
      quotas = await PremiumEntitlementService.getQuotaBreakdown(userId, examId);
    } catch {
      quotas = [];
    }

    // Fetch active entitlement record
    const { data: activeEntitlementRow } = await adminSb
      .from("user_entitlements")
      .select("id, entitlement_type, starts_at, expires_at, is_active")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let daysRemaining: number | null = null;
    if (activeEntitlementRow?.expires_at) {
      const expDate = new Date(activeEntitlementRow.expires_at).getTime();
      const now = Date.now();
      daysRemaining = Math.max(0, Math.ceil((expDate - now) / (1000 * 60 * 60 * 24)));
    }

    // 5. Fetch Active In-Progress Attempt (if any)
    const { data: inProgAttemptData } = await adminSb
      .from("test_attempts")
      .select(`
        id,
        mock_test_id,
        started_at,
        mock_tests(
          id,
          title,
          duration_minutes,
          mock_templates(test_type)
        )
      `)
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .is("submitted_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let activeAttempt: ActiveTestAttempt | null = null;
    if (inProgAttemptData) {
      const mt = inProgAttemptData.mock_tests as unknown as {
        id: string;
        title: string;
        duration_minutes: number;
        mock_templates?: { test_type?: string } | null;
      } | null;

      if (mt) {
        activeAttempt = {
          attemptId: inProgAttemptData.id,
          mockTestId: inProgAttemptData.mock_test_id,
          title: mt.title,
          testType: mt.mock_templates?.test_type || "PRACTICE",
          startedAt: inProgAttemptData.started_at,
          durationMinutes: mt.duration_minutes || 60,
        };
      }
    }

    // 6. Fetch Subjects & Topics for selected Exam
    let subjectsWithTopics: PremiumHubSubject[] = [];
    if (examId) {
      subjectsWithTopics = await this.getExamTopics(examId);
    }

    // 7. Fetch Candidate Weak Topics & Mistake Count
    let weakTopics: CandidateWeakTopic[] = [];
    let mistakeVaultCount = 0;

    try {
      const vaultSummary = await MistakeService.getMistakeVaultSummary();
      if (vaultSummary) {
        mistakeVaultCount = (vaultSummary.unresolvedCount || 0) + (vaultSummary.revisitingCount || 0);
        if (Array.isArray(vaultSummary.weakTopics)) {
          weakTopics = vaultSummary.weakTopics.slice(0, 5).map((wt) => ({
            topicId: wt.topicId,
            topicName: wt.topicName,
            mistakeCount: wt.mistakeCount,
            accuracyPercentage: Math.max(10, Math.min(60, 100 - wt.mistakeCount * 10)),
          }));
        }
      }
    } catch {
      // Safe fallback
    }

    // 8. Fetch Curated Mock Tests
    let curatedMocks: CuratedMockTestItem[] = [];
    try {
      const { data: curatedData } = await adminSb
        .from("mock_tests")
        .select(`
          id,
          title,
          slug,
          duration_minutes,
          total_marks,
          total_questions,
          is_free,
          series_id,
          test_series(id, title, exam_id),
          mock_templates(id, exam_id, test_type, title)
        `)
        .eq("is_dynamic", false)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(20);

      if (curatedData) {
        const filtered = curatedData.filter((m) => {
          if (!examId) return true;
          const tpl = m.mock_templates as unknown as { exam_id?: string } | null;
          const s = m.test_series as unknown as { exam_id?: string } | null;
          return tpl?.exam_id === examId || s?.exam_id === examId;
        });

        const mockTestIds = filtered.map((m) => m.id);
        const { data: userAttempts } = await adminSb
          .from("test_attempts")
          .select("id, mock_test_id, status, test_results(score)")
          .eq("user_id", userId)
          .in("mock_test_id", mockTestIds);

        const attemptMap = new Map<string, { status: string; id: string; score?: number }>();
        (userAttempts || []).forEach((att) => {
          const res = Array.isArray(att.test_results) ? att.test_results[0] : att.test_results;
          attemptMap.set(att.mock_test_id, {
            status: att.status,
            id: att.id,
            score: res?.score != null ? Number(res.score) : undefined,
          });
        });

        curatedMocks = filtered.map((m) => {
          const userAtt = attemptMap.get(m.id);
          const series = m.test_series as unknown as { title?: string; exam_id?: string } | null;
          const tpl = m.mock_templates as unknown as { test_type?: string; exam_id?: string } | null;

          let attStatus: "not_started" | "in_progress" | "completed" = "not_started";
          if (userAtt) {
            if (userAtt.status === "in_progress") attStatus = "in_progress";
            else if (["submitted", "completed", "evaluated"].includes(userAtt.status)) attStatus = "completed";
          }

          return {
            id: m.id,
            title: m.title,
            slug: m.slug,
            examId: tpl?.exam_id || series?.exam_id,
            testType: tpl?.test_type || "FULL_LENGTH",
            durationMinutes: m.duration_minutes || 60,
            totalMarks: m.total_marks || 100,
            totalQuestions: m.total_questions || 50,
            difficulty: "medium",
            isFree: Boolean(m.is_free),
            seriesTitle: series?.title,
            userAttemptStatus: attStatus,
            latestAttemptId: userAtt?.id,
            latestScore: userAtt?.score,
          };
        });
      }
    } catch {
      curatedMocks = [];
    }

    // 9. Fetch Candidate Recent Attempts
    let recentAttempts: RecentPremiumAttempt[] = [];
    let totalScoreSum = 0;
    let accuracySum = 0;
    let completedCount = 0;
    let bestScore = 0;

    try {
      const { data: attemptsData } = await adminSb
        .from("test_attempts")
        .select(`
          id,
          mock_test_id,
          started_at,
          submitted_at,
          mock_tests(
            title,
            is_dynamic,
            mock_templates(test_type)
          ),
          test_results(
            id,
            score,
            total_score,
            accuracy_percentage,
            percentile
          )
        `)
        .eq("user_id", userId)
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(10);

      if (attemptsData) {
        recentAttempts = attemptsData.map((att) => {
          const mt = att.mock_tests as unknown as {
            title?: string;
            is_dynamic?: boolean;
            mock_templates?: { test_type?: string } | null;
          } | null;

          const res = Array.isArray(att.test_results)
            ? att.test_results[0]
            : (att.test_results as unknown as {
                id?: string;
                score?: number;
                total_score?: number;
                accuracy_percentage?: number;
                percentile?: number;
              } | null);

          const score = res?.score != null ? Number(res.score) : undefined;
          const totalScore = res?.total_score != null ? Number(res.total_score) : undefined;
          const accuracy = res?.accuracy_percentage != null ? Number(res.accuracy_percentage) : undefined;
          const percentile = res?.percentile != null ? Number(res.percentile) : undefined;

          if (score != null) {
            completedCount++;
            totalScoreSum += score;
            if (score > bestScore) bestScore = score;
          }
          if (accuracy != null) {
            accuracySum += accuracy;
          }

          return {
            attemptId: att.id,
            mockTestId: att.mock_test_id,
            title: mt?.title || "Practice Mock",
            testType: mt?.mock_templates?.test_type || "PRACTICE",
            isDynamic: Boolean(mt?.is_dynamic),
            startedAt: att.started_at,
            submittedAt: att.submitted_at!,
            resultId: res?.id,
            score,
            totalScore,
            accuracyPercentage: accuracy,
            percentile,
          };
        });
      }
    } catch {
      recentAttempts = [];
    }

    return {
      user: {
        id: userId,
        email: userAuthData?.user?.email,
        fullName,
      },
      globalStatus: {
        isPremiumEnabled,
        isMaintenanceMode,
        maintenanceNotice,
      },
      entitlement: {
        hasAccess: entitlementCheck.hasAccess,
        status: entitlementCheck.status,
        planName: activeEntitlementRow?.entitlement_type || "Premium Pass",
        tier: activeEntitlementRow?.entitlement_type || "pro",
        startsAt: activeEntitlementRow?.starts_at || entitlementCheck.startsAt,
        expiresAt: activeEntitlementRow?.expires_at || entitlementCheck.expiresAt,
        daysRemaining,
      },
      quotas,
      activeAttempt,
      selectedExam,
      availableExams,
      subjectsWithTopics,
      weakTopics,
      mistakeVaultCount,
      curatedMocks,
      recentAttempts,
      stats: {
        totalPremiumAttempts: recentAttempts.length,
        completedTests: completedCount,
        averageAccuracy: completedCount > 0 ? Math.round(accuracySum / completedCount) : 0,
        bestScore,
      },
    };
  }

  /**
   * Fetches subjects and topic tree for practice generation.
   */
  static async getExamTopics(examId: string): Promise<PremiumHubSubject[]> {
    const adminSb = createAdminServerSupabaseClient();

    try {
      const { data: subjectsData } = await adminSb
        .from("subjects")
        .select(`
          id,
          name,
          slug,
          topics(
            id,
            name
          )
        `)
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (!subjectsData) return [];

      return subjectsData.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.slug,
        topics: (s.topics || []).map((t: any) => ({
          id: t.id,
          name: t.name,
        })),
      }));
    } catch {
      return [];
    }
  }
}
