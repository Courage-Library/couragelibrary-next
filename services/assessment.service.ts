import { createServerSupabaseClient, createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { validAnswerKey } from "@/lib/questions/answer-key";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { revalidatePath } from "next/cache";
import { GamificationService } from "@/services/gamification.service";
import { MistakeService } from "@/services/mistake.service";
import { PremiumEntitlementService } from "@/services/premium-entitlement.service";
import { ContentService } from "@/services/content.service";
import { formatIstDateTime, calculateExamDuration, getIstDateString } from "@/lib/assessment/timing";
import type { AttemptPosition } from "@/lib/assessment/position";
import { WRITE_FAILURE_TAG, errorCode, reportWriteFailure } from "@/lib/ops/write-failure";
import { SAVE_GRACE_SECONDS, attemptDeadline, isFinalizeEnabled, isPastDeadline, staleOutcome, type AttemptLike } from "@/lib/assessment/finalize";
import { RANK_MIN_COHORT } from "@/lib/assessment/display-rules";
import { buildTakeaways, buildTrend, cohortStanding, isTestAccountEmail, negativeMarksLost, type CohortRow, type Standing, type Takeaway, type TrendPoint } from "@/lib/assessment/result-analysis";
import { leaderboardView, type LeaderboardEntry } from "@/lib/assessment/leaderboard";
import { isPracticeEnabled } from "@/lib/practice/flag";
import { isMemoryLockEnabled } from "@/lib/memory-lock/flag";

/** TYPES-1 B1: PostgREST returns a one-to-one embed (e.g. test_attempts → test_results) as an object or null. */
function oneToOne<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export interface ExamDirectoryItem {
  id: string;
  title: string;
  slug: string;
  category: string;
  description: string | null;
  conductingOrg: string;
  mockTestsCount: number;
}

export interface ExamDetail {
  id: string;
  title: string;
  slug: string;
  category: string;
  description: string | null;
  conductingOrg: string;
  patterns: Array<{
    id: string;
    tierName: string;
    durationMinutes: number;
    totalQuestions: number;
    totalMarks: number;
  }>;
  subjects: Array<{
    id: string;
    name: string;
    code: string;
    topicsCount: number;
  }>;
  mockTests: Array<{
    id: string;
    title: string;
    slug: string;
    durationMinutes: number;
    totalQuestions: number;
    totalMarks: number;
    isFree: boolean;
  }>;
}

export interface MockTestItem {
  id: string;
  title: string;
  slug: string;
  examTitle: string;
  category: string;
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  isFree: boolean;
  publishedAt: string | null;
}

export interface TodayDailyMockData {
  isOpen: boolean;
  isToday: boolean;
  dayOfWeek: string;
  dayLabel: string;
  testType: string;
  testNumber: number;
  testId?: string;
  templateId?: string;
  title: string;
  categoryTitle: string;
  categorySlug: string;
  patternName: string;
  sectionName?: string;
  questionCount: number;
  durationMinutes: number;
  totalMarks: number;
  negativeMark: number;
  language: string;
  userAttemptStatus: "not_started" | "in_progress" | "completed" | "evaluation_pending";
  completedScore?: number;
  completedAccuracy?: number;
  attemptId?: string;
}

export interface DailyMockHubData {
  todayMock: TodayDailyMockData | null;
  weeklySchedule: Array<{
    dayOfWeek: string;
    dayLabel: string;
    testType: string;
    patternName: string;
    sectionName?: string;
    questionCount: number;
    durationMinutes: number;
    totalMarks: number;
    isActive: boolean;
  }>;
  categories: Array<{ id: string; title: string; slug: string }>;
  selectedCategorySlug: string;
  fullMockTests: MockTestItem[];
}

export interface MockDashboardExamGoal {
  id: string;
  examId: string;
  title: string;
  slug: string;
  category?: string;
  priorityRank: number;
  isActive: boolean;
  targetScore?: number | null;
}

export interface MockDashboardTodayItem {
  testId: string;
  templateId: string;
  examId: string;
  examTitle: string;
  examSlug: string;
  dayLabel: string;
  dayOfWeek: string;
  testNumber: number;
  title: string;
  testType: string;
  sectionName?: string;
  questionCount: number;
  durationMinutes: number;
  totalMarks: number;
  negativeMark: number;
  isOpen: boolean;
  status: "available" | "in_progress" | "completed" | "evaluation_pending" | "upcoming" | "expired" | "limit_reached";
  attemptId?: string;
  completedScore?: number;
  completedAccuracy?: number;
  answeredCount?: number;
}

export interface MockDashboardResumableMock {
  attemptId: string;
  testId: string;
  title: string;
  examTitle: string;
  examSlug: string;
  testType: string;
  startedAt: string;
  answeredCount: number;
  totalQuestions: number;
  progressPercentage: number;
  durationMinutes: number;
  totalMarks: number;
}

export interface MockDashboardExamPrepSummary {
  examId: string;
  examTitle: string;
  examSlug: string;
  totalMocksAttempted: number;
  averageAccuracy: number;
  bestScore: number;
  maxScore: number;
  questionsSolved: number;
  recentScore?: number;
}

export interface MockDashboardScheduleDay {
  dayOfWeek: string;
  dayLabel: string;
  testType: string;
  patternName: string;
  sectionName?: string;
  questionCount: number;
  durationMinutes: number;
  totalMarks: number;
  isActive: boolean;
  status: "completed" | "available" | "upcoming" | "missed";
  isToday: boolean;
  testId?: string;
  score?: number;
}

export interface MockDashboardFullMockItem {
  id: string;
  title: string;
  slug: string;
  examTitle: string;
  examSlug: string;
  category: string;
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  isFree: boolean;
  publishedAt?: string;
  userAttemptStatus?: "not_started" | "in_progress" | "completed";
  bestScore?: number;
  lastScore?: number;
  attemptId?: string;
}

export interface MockDashboardRecentAttempt {
  attemptId: string;
  testId: string;
  title: string;
  examTitle: string;
  examSlug: string;
  testType: string;
  submittedAt: string;
  relativeTime: string;
  score: number;
  maxScore: number;
  accuracyPercentage: number;
  correctCount: number;
  incorrectCount: number;
  timeSpentSeconds: number;
}

export interface MockDashboardPerformance {
  totalMocksAttempted: number;
  averageAccuracy: number;
  bestScore: number;
  questionsSolved: number;
  improvementTrend?: {
    text: string;
    percentage: number;
    isPositive: boolean;
  };
  examBreakdown: MockDashboardExamPrepSummary[];
}

export interface MockDashboardStreak {
  currentStreak: number;
  longestStreak: number;
  isFrozen: boolean;
  isTodayAttempted: boolean;
  milestones: Array<{
    days: number;
    achieved: boolean;
  }>;
}

export interface MockDashboardRewards {
  currentCoins: number;
  lifetimeEarned: number;
  levelTitle: string;
  levelProgressPct: number;
  badges: Array<{
    id: string;
    code: string;
    title: string;
    tier: string;
    iconUrl?: string;
    unlocked: boolean;
  }>;
  nextRewardThreshold: number;
}

export interface MockTestDashboardData {
  isAuthenticated: boolean;
  user: {
    id: string;
    email?: string;
    fullName?: string;
  } | null;
  activeExamGoals: MockDashboardExamGoal[];
  allExams: Array<{ id: string; title: string; slug: string; category?: string }>;
  selectedExamSlug: string;
  nextMockAction: {
    type: "resume" | "start_today" | "view_result" | "evaluation_pending" | "browse_full" | "auth_required" | "none";
    resumable?: MockDashboardResumableMock;
    todayMock?: MockDashboardTodayItem;
  };
  todayMocks: MockDashboardTodayItem[];
  examPrepSummaries: MockDashboardExamPrepSummary[];
  weeklySchedule: MockDashboardScheduleDay[];
  fullMockTests: MockDashboardFullMockItem[];
  recentAttempts: MockDashboardRecentAttempt[];
  performance: MockDashboardPerformance;
  streak: MockDashboardStreak;
  rewards: MockDashboardRewards;
}

export interface MockTestInstructionsData {
  test: {
    id: string;
    title: string;
    slug: string;
    durationMinutes: number;
    totalQuestions: number;
    totalMarks: number;
    isFree: boolean;
  };
  exam: {
    title: string;
    category: string;
  };
  sections: Array<{
    id: string;
    name: string;
    numQuestions: number;
    marksPerQuestion: number;
    negativeMark: number;
  }>;
  existingAttemptId?: string;
}

export interface ActiveTestOption {
  key: string;
  text: string;
  imageUrl?: string | null;
}

export interface ActiveTestQuestion {
  mockQuestionId: string;
  questionOrder: number;
  sectionId: string;
  sectionName: string;
  questionVersionId: string;
  /** F3: canonical question id ("Report this question" in the player) */
  questionId?: string | null;
  questionText: string;
  questionImageUrl?: string | null;
  optionsType: string;
  marks: number;
  negativeMark: number;
  options: ActiveTestOption[];
  savedAnswer?: {
    selectedOption: string | null;
    isMarkedForReview: boolean;
    timeSpentSeconds: number;
  };
}

export interface ActiveAttemptSession {
  attemptId: string;
  testId: string;
  testTitle: string;
  durationMinutes: number;
  startedAt: string;
  remainingSeconds: number;
  sections: Array<{ id: string; name: string }>;
  questions: ActiveTestQuestion[];
  /** Q6 part B (099): the server-kept resume position — the question order last shown and the orders visited */
  resumeOrder?: number | null;
  visitedOrders?: number[];
}

export interface TestLeaderboardItem {
  rank: number;
  displayName: string;
  score: number;
  maxScore: number;
  accuracyPercentage: number;
  timeSpentSeconds: number;
  isCurrentUser: boolean;
}

/** F4 (R12): rank / percentile among n real students' first attempts — present only when n ≥ RANK_MIN_COHORT. */
export type TestStandingInfo = Standing;

export interface TestCandidateSecurityInfo {
  candidateId: string;
  maskedId: string;
  attemptIdShort: string;
  examTitle: string;
  timestamp: string;
}

export interface TestRewardSummary {
  isRetake?: boolean;
  completionCoins: number;
  completionReason: string;
  isAccuracyEligible: boolean;
  minAttemptRequired: number;
  accuracyPercentage: number;
  accuracyBonusCoins: number;
  accuracyReason: string;
  streakCoins: number;
  streakReason: string;
  currentStreak: number;
  badgeUnlocked?: {
    code: string;
    title: string;
    coins: number;
  } | null;
  totalCoinsEarned: number;
}

export interface TestResultSummary {
  result: {
    id: string;
    attemptId: string;
    totalQuestions: number;
    attemptedCount: number;
    correctCount: number;
    incorrectCount: number;
    unansweredCount: number;
    totalScore: number;
    maxScore: number;
    accuracyPercentage: number;
    timeSpentSeconds: number;
    rank: number | null;
    percentile: number | null;
  };
  test: {
    id: string;
    title: string;
    durationMinutes: number;
    totalQuestions: number;
    totalMarks: number;
  };
  /** null = fewer than RANK_MIN_COHORT real students: the page omits rank / percentile entirely */
  standing: TestStandingInfo | null;
  security: TestCandidateSecurityInfo;
  rewards: TestRewardSummary;
  insights: {
    strongestSection?: string | null;
    weakestSection?: string | null;
    accuracyLevel: string;
    speedSecondsPerQuestion: number;
    reviewCount: number;
  };
  /** F4 analysis (server values only) */
  analysis: {
    negativeMarksLost: number;
    takeaways: Takeaway[];
    trend: TrendPoint[] | null;
    examSlug: string | null;
    /** F5: show "Add to Memory Lock" on reviewed questions */
    memoryLockEnabled: boolean;
  };
  sections: Array<{
    id?: string;
    sectionName: string;
    totalQuestions: number;
    attemptedCount: number;
    correctCount: number;
    incorrectCount: number;
    unansweredCount: number;
    sectionScore: number;
    maxScore: number;
    accuracyPercentage: number;
    timeSpentSeconds?: number;
  }>;
  reviewQuestions: Array<{
    mockQuestionId: string;
    /** F2: for "Report this question" */
    questionId: string | null;
    questionVersionId: string | null;
    questionOrder: number;
    sectionName: string;
    /** F4: canonical topic node (practice link) and full marks of the question */
    topicId: string | null;
    marks: number;
    isMarked: boolean;
    questionText: string;
    questionImageUrl?: string | null;
    optionsType?: string;
    options: Array<{ key: string; text: string; imageUrl?: string | null }>;
    selectedOption: string | null;
    /** null = no valid answer key (QB-KEY-1): not scored, no option marked correct */
    correctOption: string | null;
    isCorrect: boolean;
    marksAwarded: number;
    explanation: string | null;
    topicName: string | null;
    topicSlug: string | null;
    timeSpentSeconds?: number;
    learningSlug?: string | null;
    learningDocTitle?: string | null;
    hasPublishedLearning?: boolean;
  }>;
}

/** LEADERBOARD-GATE-1: ranks only from >= RANK_MIN_COHORT real students; public rows only for opted-in students. */
export interface TestLeaderboardData {
  test: {
    id: string;
    title: string;
    durationMinutes: number;
    totalMarks: number;
    totalQuestions: number;
  };
  view: { state: "not_enough" } | { state: "ranked"; n: number; entries: TestLeaderboardItem[]; viewer: (TestLeaderboardItem & { optedIn: boolean }) | null };
  /** the signed-in viewer's opt-in (null = signed out) */
  viewerOptedIn: boolean | null;
}

export class AssessmentService {
  private static attemptCreationLocks = new Map<string, Promise<any>>();

  /**
   * Fetches published competitive exams grouped by category.
   */
  static async getExamDirectory(): Promise<ExamDirectoryItem[]> {
    const supabase = await createServerSupabaseClient();

    const { data: exams, error } = await supabase
      .from("exams")
      .select("id, title, slug, category, description, conducting_orgs(name)")
      .eq("is_active", true)
      .order("title");

    if (error || !exams) return [];

    return (exams as any[]).map((e) => ({
      id: e.id,
      title: e.title,
      slug: e.slug,
      category: e.category || "General",
      description: e.description,
      conductingOrg: e.conducting_orgs?.name || "Exam Authority",
      mockTestsCount: 0,
    }));
  }

  /**
   * Fetches comprehensive exam details by slug.
   */
  static async getExamDetail(slug: string): Promise<ExamDetail | null> {
    const supabase = await createServerSupabaseClient();

    const { data: examData } = await supabase
      .from("exams")
      .select("id, title, slug, category, description, conducting_orgs(name)")
      .eq("slug", slug)
      .maybeSingle();

    if (!examData) return null;
    const exam = examData as any;

    const [mockTemplatesRes, subjectsRes] = await Promise.all([
      supabase.from("mock_templates").select("id, title, slug, mock_tests(id, title, slug, duration_minutes, total_questions, total_marks, is_free, status)").eq("exam_id", exam.id),
      supabase.from("subjects").select("id, name, slug").order("name"), // TYPES-1 B1 (Class B): subjects has no code column
    ]);

    const mockTests: any[] = [];
    const templates = mockTemplatesRes.data || [];

    templates.forEach((t) => {
      (t.mock_tests || []).forEach((mt: any) => {
        if (mt.status === "published") {
          mockTests.push({
            id: mt.id,
            title: mt.title,
            slug: mt.slug,
            durationMinutes: mt.duration_minutes,
            totalQuestions: mt.total_questions,
            totalMarks: Number(mt.total_marks),
            isFree: mt.is_free,
          });
        }
      });
    });

    const subjects = subjectsRes.data || [];

    return {
      id: exam.id,
      title: exam.title,
      slug: exam.slug,
      category: exam.category || "General",
      description: exam.description,
      conductingOrg: exam.conducting_orgs?.name || "Exam Authority",
      patterns: [],
      subjects: subjects.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.slug,
        topicsCount: 0,
      })),
      mockTests,
    };
  }

  /**
   * Resolves Student Daily Mock Test & Weekly Program for Hub Display
   */
  static async getDailyMockHubData(categorySlug?: string, userId?: string): Promise<DailyMockHubData> {
    const supabase = await createServerSupabaseClient();
    const sb = supabase;

    // 1. Fetch categories
    const { data: categoriesData } = await sb
      .from("exams")
      .select("id, title, slug")
      .order("title", { ascending: true });

    const categories = (categoriesData as any[]) || [];
    if (categories.length === 0) {
      return {
        todayMock: null,
        weeklySchedule: [],
        categories: [],
        selectedCategorySlug: "",
        fullMockTests: [],
      };
    }

    const selectedCategory = categorySlug
      ? categories.find((c) => c.slug === categorySlug || c.id === categorySlug) || categories[0]
      : categories[0];

    // 2. Fetch full mock tests and daily mock templates for this category
    const [mockTestsRes, templatesRes, patternsRes] = await Promise.all([
      sb.from("mock_tests")
        .select("id, title, slug, duration_minutes, total_questions, total_marks, is_free, published_at, mock_templates(title, exam_id, test_type, exams(title, category))")
        .eq("status", "published")
        .order("created_at", { ascending: false }),
      sb.from("mock_templates")
        .select("id, title, slug, test_type, is_active, description, pattern_id, mock_tests(id, title, slug, duration_minutes, total_questions, total_marks, status)")
        .eq("exam_id", selectedCategory.id),
      sb.from("exam_patterns")
        .select("id, name, duration_minutes, total_questions, total_marks, negative_mark_value"),
    ]);

    const allPublishedTests = mockTestsRes.data || [];
    const fullMockTests: MockTestItem[] = allPublishedTests
      .filter((mt) => {
        const tExamId = mt.mock_templates?.exam_id;
        const testType = mt.mock_templates?.test_type;
        return tExamId === selectedCategory.id && testType !== "daily_sectional";
      })
      .map((mt) => ({
        id: mt.id,
        title: mt.title,
        slug: mt.slug,
        examTitle: mt.mock_templates?.exams?.title || selectedCategory.title,
        category: mt.mock_templates?.exams?.category || "General",
        durationMinutes: mt.duration_minutes,
        totalQuestions: mt.total_questions,
        totalMarks: Number(mt.total_marks),
        isFree: mt.is_free,
        publishedAt: mt.published_at,
      }));

    const templates = templatesRes.data || [];
    const patterns = patternsRes.data || [];

    // 3. Determine current IST date and day
    const now = new Date();
    const istDateString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const istDate = new Date(istDateString);
    const istHour = istDate.getHours();
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const dayLabels: Record<string, string> = {
      sunday: "Sunday",
      monday: "Monday",
      tuesday: "Tuesday",
      wednesday: "Wednesday",
      thursday: "Thursday",
      friday: "Friday",
      saturday: "Saturday",
    };

    const currentDayOfWeek = dayNames[istDate.getDay()];
    const isOpen = istHour >= 5 && istHour <= 23; // Available 5:00 AM to 11:59 PM

    // 4. Map Weekly Schedule
    const daysOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const weeklySchedule = daysOrder.map((day) => {
      const t = templates.find((tmp) => tmp.slug === `${selectedCategory.slug}-daily-${day}` || tmp.slug?.endsWith(`-daily-${day}`));
      let meta: any = {};
      if (t?.description) {
        try {
          meta = JSON.parse(t.description);
        } catch {}
      }

      const pattern = patterns.find((p) => p.id === t?.pattern_id);
      const testType = t?.test_type || "daily_sectional";
      const qCount = meta.questionCount || (testType === "daily_sectional" ? 25 : testType === "mixed" ? 40 : 100);
      const dur = meta.durationMinutes || (testType === "daily_sectional" ? 15 : testType === "mixed" ? 25 : 60);
      const marks = meta.totalMarks || (qCount * 2);

      return {
        dayOfWeek: day,
        dayLabel: dayLabels[day],
        testType,
        patternName: pattern?.name || "Standard Exam Pattern",
        sectionName: meta.activeSectionName || (testType === "mixed" ? "Mixed Subjects" : "All Sections"),
        questionCount: qCount,
        durationMinutes: dur,
        totalMarks: marks,
        isActive: t ? t.is_active !== false : true,
      };
    });

    // 5. Resolve Today's Daily Mock
    const todayTemplate = templates.find(
      (tmp) => tmp.slug === `${selectedCategory.slug}-daily-${currentDayOfWeek}` || tmp.slug?.endsWith(`-daily-${currentDayOfWeek}`)
    );

    let todayMock: TodayDailyMockData | null = null;
    if (todayTemplate) {
      let meta: any = {};
      if (todayTemplate.description) {
        try {
          meta = JSON.parse(todayTemplate.description);
        } catch {}
      }

      const pattern = patterns.find((p) => p.id === todayTemplate.pattern_id);
      const testInstance = (todayTemplate.mock_tests && todayTemplate.mock_tests[0]) || null;

      // Compute relative mock number (T#1, T#2...)
      const launchDate = meta.launchDate ? new Date(meta.launchDate) : new Date("2026-03-01");
      const diffDays = Math.max(0, Math.floor((istDate.getTime() - launchDate.getTime()) / 86400000));
      const testNumber = Math.floor(diffDays / 7) + 1;

      // Check User Attempt for today
      let userAttemptStatus: TodayDailyMockData["userAttemptStatus"] = "not_started";
      let completedScore: number | undefined;
      let completedAccuracy: number | undefined;
      let attemptId: string | undefined;

      if (userId && testInstance?.id) {
        const todayStart = new Date(istDate);
        todayStart.setHours(0, 0, 0, 0);

        const { data: userAttempts } = await sb
          .from("test_attempts")
          .select("id, status, started_at, submitted_at, test_results(total_score, accuracy_percentage)") // TYPES-1 B2 (Class B, B1 carry-over): no `score` column
          .eq("mock_test_id", testInstance.id)
          .eq("user_id", userId)
          .order("started_at", { ascending: false });

        const currentIstDateStr = getIstDateString(istDate);
        const attemptsList = (userAttempts || []).filter((a: any) => getIstDateString(a.started_at) === currentIstDateStr);

        // Priority 1: Submitted attempt
        const submittedAttempts = attemptsList.filter((a: any) =>
          a.submitted_at !== null || ["submitted", "completed", "evaluated"].includes(a.status)
        );

        if (submittedAttempts.length > 0) {
          // Sort valid result first, then latest submitted
          submittedAttempts.sort((a: any, b: any) => {
            const trA = Array.isArray(a.test_results) ? a.test_results[0] : a.test_results;
            const trB = Array.isArray(b.test_results) ? b.test_results[0] : b.test_results;
            const hasValidA = trA && ((trA.total_score !== undefined && trA.total_score !== null) || (trA.score !== undefined && trA.score !== null)) ? 1 : 0;
            const hasValidB = trB && ((trB.total_score !== undefined && trB.total_score !== null) || (trB.score !== undefined && trB.score !== null)) ? 1 : 0;
            if (hasValidA !== hasValidB) return hasValidB - hasValidA;
            const timeA = new Date(a.submitted_at || a.started_at).getTime();
            const timeB = new Date(b.submitted_at || b.started_at).getTime();
            if (timeA !== timeB) return timeB - timeA;
            return String(b.id).localeCompare(String(a.id));
          });

          const authAtt = submittedAttempts[0];
          attemptId = authAtt.id;
          const tr = Array.isArray(authAtt.test_results) ? authAtt.test_results[0] : authAtt.test_results;
          const hasValidResult =
            tr &&
            ((tr.total_score !== undefined && tr.total_score !== null) ||
              (tr.score !== undefined && tr.score !== null));

          if (hasValidResult) {
            userAttemptStatus = "completed";
            completedScore = tr?.total_score ?? tr?.score;
            completedAccuracy = tr?.accuracy_percentage;
          } else {
            userAttemptStatus = "evaluation_pending";
          }
        } else {
          // Priority 2: In progress
          const inProgAtt = attemptsList.find((a: any) => a.status === "in_progress" && a.submitted_at === null);
          if (inProgAtt) {
            attemptId = inProgAtt.id;
            userAttemptStatus = "in_progress";
          }
        }
      }

      const qCount = testInstance?.total_questions || meta.questionCount || 25;
      const dur = testInstance?.duration_minutes || meta.durationMinutes || 15;
      const marks = Number(testInstance?.total_marks || meta.totalMarks || (qCount * 2));

      todayMock = {
        isOpen,
        isToday: true,
        dayOfWeek: currentDayOfWeek,
        dayLabel: dayLabels[currentDayOfWeek],
        testType: todayTemplate.test_type || "daily_sectional",
        testNumber,
        testId: testInstance?.id,
        templateId: todayTemplate.id,
        title: testInstance?.title || `${selectedCategory.title} Daily Mock (T#${testNumber})`,
        categoryTitle: selectedCategory.title,
        categorySlug: selectedCategory.slug,
        patternName: pattern?.name || "Standard Pattern",
        sectionName: meta.activeSectionName || "General Section",
        questionCount: qCount,
        durationMinutes: dur,
        totalMarks: marks,
        negativeMark: meta.negativeMark ?? (pattern?.negative_mark_value || 0.5),
        language: meta.language || "both",
        userAttemptStatus,
        completedScore,
        completedAccuracy,
        attemptId,
      };
    }

    return {
      todayMock,
      weeklySchedule,
      categories,
      selectedCategorySlug: selectedCategory.slug,
      fullMockTests,
    };
  }

  /**
   * Comprehensive Multi-Exam Mock Test Dashboard Data Aggregator
   */
  static async getStudentMockDashboardData(
    examSlugFilter?: string,
    userId?: string
  ): Promise<MockTestDashboardData> {
    let supabase: SupabaseClient<Database>;
    try {
      supabase = await createServerSupabaseClient();
    } catch {
      supabase = createAdminServerSupabaseClient();
    }
    const sb = supabase;

    // 1. Fetch user (if not provided)
    let userObj: { id: string; email?: string; fullName?: string } | null = null;
    let resolvedUserId = userId;
    if (!resolvedUserId) {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user) {
          resolvedUserId = authData.user.id;
          userObj = {
            id: authData.user.id,
            email: authData.user.email,
            fullName: authData.user.user_metadata?.full_name || authData.user.email?.split("@")[0] || "Aspirant",
          };
        }
      } catch {}
    } else {
      const { data: profile } = await sb.from("user_profiles").select("full_name").eq("id", resolvedUserId).maybeSingle();
      userObj = {
        id: resolvedUserId,
        fullName: profile?.full_name || "Aspirant",
      };
    }

    // EXAM-FINALIZE-1 (finalize-on-read): the mock list never shows an expired attempt as resumable
    if (resolvedUserId) await AssessmentService.finalizeExpiredAttempts({ userId: resolvedUserId, limit: 20 });

    // 2. Fetch all exams, user goals, templates, mock_tests, patterns in parallel
    const [
      allExamsRes,
      userGoalsRes,
      templatesRes,
      publishedTestsRes,
      patternsRes,
      attemptsRes,
      streaksRes,
      walletRes,
      badgesRes,
      userBadgesRes,
    ] = await Promise.all([
      sb.from("exams").select("id, title, slug, category, is_active").eq("is_active", true).order("title", { ascending: true }),
      resolvedUserId
        ? sb.from("user_exam_goals").select("id, exam_id, priority_rank, is_active, target_score, exams(id, title, slug, category)").eq("user_id", resolvedUserId).eq("is_active", true).order("priority_rank", { ascending: true })
        : Promise.resolve({ data: [] }),
      sb.from("mock_templates").select("id, title, slug, test_type, is_active, description, exam_id, pattern_id, exams(id, title, slug, category), mock_tests(id, title, slug, duration_minutes, total_questions, total_marks, status, is_free)").eq("is_active", true),
      sb.from("mock_tests").select("id, title, slug, duration_minutes, total_questions, total_marks, is_free, published_at, template_id, mock_templates(id, title, exam_id, test_type, exams(id, title, slug, category))").eq("status", "published").order("created_at", { ascending: false }),
      sb.from("exam_patterns").select("id, name, duration_minutes, total_questions, total_marks, negative_mark_value, pattern_sections(id, section_name, num_questions, marks_per_question, negative_mark)"),
      resolvedUserId
        ? sb.from("test_attempts").select("id, user_id, mock_test_id, started_at, submitted_at, status, time_taken_seconds, mock_tests(id, title, slug, duration_minutes, total_questions, total_marks, mock_templates(id, title, exam_id, test_type, exams(id, title, slug, category))), test_results(id, total_score, max_score, accuracy_percentage, attempted_count, correct_count, incorrect_count, rank, percentile)").eq("user_id", resolvedUserId).order("started_at", { ascending: false }).limit(30)
        : Promise.resolve({ data: [] }),
      resolvedUserId
        ? sb.from("user_streaks").select("current_streak, longest_streak, is_frozen, last_qualifying_date").eq("user_id", resolvedUserId).maybeSingle()
        : Promise.resolve({ data: null }),
      resolvedUserId
        ? sb.from("coin_wallets").select("current_balance, lifetime_earned").eq("user_id", resolvedUserId).maybeSingle()
        : Promise.resolve({ data: null }),
      sb.from("badges").select("id, code, title, tier, icon_url, display_order").eq("is_active", true).order("display_order", { ascending: true }),
      resolvedUserId
        ? sb.from("user_badges").select("badge_id").eq("user_id", resolvedUserId)
        : Promise.resolve({ data: [] }),
    ]);

    const allExams = allExamsRes.data || [];
    const rawUserGoals = userGoalsRes.data || [];
    const templates = templatesRes.data || [];
    const publishedTests = publishedTestsRes.data || [];
    const patterns = patternsRes.data || [];
    const attempts = attemptsRes.data || [];
    const streakRecord = streaksRes.data;
    const walletRecord = walletRes.data;
    const allBadges = badgesRes.data || [];
    const userBadges = userBadgesRes.data || [];

    // 3. Resolve active exam goals
    let activeExamGoals: MockDashboardExamGoal[] = rawUserGoals.map((g: any, i: number) => ({
      id: g.id,
      examId: g.exam_id,
      title: g.exams?.title || "Exam",
      slug: g.exams?.slug || "exam",
      category: g.exams?.category || "General",
      priorityRank: g.priority_rank ?? i + 1,
      isActive: g.is_active !== false,
      targetScore: g.target_score,
    }));

    // If student has no goals set in database, use all active exams
    if (activeExamGoals.length === 0) {
      activeExamGoals = allExams.map((e, i) => ({
        id: e.id,
        examId: e.id,
        title: e.title,
        slug: e.slug,
        category: e.category,
        priorityRank: i + 1,
        isActive: true,
        targetScore: null,
      }));
    }

    // Resolve active selection: "all" or specific exam slug
    const normalizedFilter = examSlugFilter?.toLowerCase();
    const hasSpecificSelection = normalizedFilter && normalizedFilter !== "all";
    const selectedExamGoal = hasSpecificSelection
      ? activeExamGoals.find((g) => g.slug.toLowerCase() === normalizedFilter) ||
        allExams.find((e) => e.slug.toLowerCase() === normalizedFilter)
      : null;

    const selectedExamSlug = hasSpecificSelection && selectedExamGoal ? selectedExamGoal.slug : "all";

    // Target exams in scope for the active view
    const targetExams = selectedExamSlug === "all"
      ? activeExamGoals
      : [selectedExamGoal!];

    // 4. Compute IST Time & Day Info
    const now = new Date();
    const istDateString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const istDate = new Date(istDateString);
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const currentDayOfWeek = dayNames[istDate.getDay()];
    const istHour = istDate.getHours();
    const isOpen = istHour >= 5 && istHour <= 23; // Available 5:00 AM to 11:59 PM
    const todayStart = new Date(istDate);
    todayStart.setHours(0, 0, 0, 0);

    // 5. Incomplete / Resumable Attempt Resolution
    // Strict invariant: An in-progress attempt is ONLY valid/resumable if the candidate has NO submitted attempt for that mock test
    let resumableMock: MockDashboardResumableMock | undefined;
    const inProgressAttempt = attempts.find((a: any) => {
      if (a.status !== "in_progress" || a.submitted_at !== null) return false;
      const targetMtId = a.mock_test_id || a.mock_tests?.id;
      
      const hasSubmitted = attempts.some((other: any) => {
        const otherMtId = other.mock_test_id || other.mock_tests?.id;
        return (
          otherMtId === targetMtId &&
          (other.submitted_at !== null || ["submitted", "completed", "evaluated"].includes(other.status))
        );
      });
      if (hasSubmitted) return false; // Superseded by submitted attempt

      const dur = a.mock_tests?.duration_minutes || 25;
      const elapsedSec = (Date.now() - new Date(a.started_at).getTime()) / 1000;
      return elapsedSec <= dur * 60;
    });

    if (inProgressAttempt) {
      const mt = inProgressAttempt.mock_tests;
      const examTitle = mt?.mock_templates?.exams?.title || "Exam";
      const examSlug = mt?.mock_templates?.exams?.slug || "exam";
      const answeredCount = oneToOne(inProgressAttempt.test_results)?.attempted_count || 0; // TYPES-1 B1 (Class B)
      const totalQ = mt?.total_questions || 25;
      resumableMock = {
        attemptId: inProgressAttempt.id,
        testId: mt?.id || inProgressAttempt.mock_test_id,
        title: mt?.title || "In-Progress Mock Test",
        examTitle,
        examSlug,
        testType: mt?.mock_templates?.test_type || "daily_sectional",
        startedAt: inProgressAttempt.started_at,
        answeredCount,
        totalQuestions: totalQ,
        progressPercentage: Math.min(100, Math.round((answeredCount / (totalQ || 1)) * 100)),
        durationMinutes: mt?.duration_minutes || 15,
        totalMarks: Number(mt?.total_marks || (totalQ * 2)),
      };
    }

    // 6. Today's Available Mocks across target exams
    const todayMocks: MockDashboardTodayItem[] = [];
    for (const exam of targetExams) {
      const examId = (exam as any).examId || exam.id;
      const tpl = templates.find((t: any) => {
        if (t.exam_id !== examId) return false;
        if (t.slug === `${exam.slug}-daily-${currentDayOfWeek}`) return true;
        if (t.slug?.endsWith(`-daily-${currentDayOfWeek}`)) return true;
        return false;
      });

      if (tpl) {
        let meta: any = {};
        try { meta = JSON.parse(tpl.description || "{}"); } catch {}
        const testInstance = tpl.mock_tests?.[0];
        const pattern = patterns.find((p: any) => p.id === tpl.pattern_id);

        const launchDate = meta.launchDate ? new Date(meta.launchDate) : new Date("2026-03-01");
        const diffDays = Math.max(0, Math.floor((istDate.getTime() - launchDate.getTime()) / 86400000));
        const testNumber = Math.floor(diffDays / 7) + 1;

        // Explicit 3-Tier Attempt Priority Resolver (Strict IST calendar date)
        let itemStatus: MockDashboardTodayItem["status"] = isOpen ? "available" : "upcoming";
        let attemptId: string | undefined;
        let completedScore: number | undefined;
        let completedAccuracy: number | undefined;

        if (testInstance?.id && resolvedUserId) {
          const isDaily =
            tpl?.test_type === "daily" ||
            tpl?.test_type === "daily_sectional" ||
            tpl?.test_type === "sectional" ||
            tpl?.slug?.includes("-daily-") ||
            tpl?.slug?.startsWith("ssc-cgl-daily");

          const currentIstDateStr = getIstDateString(istDate);
          // Match candidate attempts for this scheduled occurrence
          const matchedAttempts = attempts.filter((a: any) => {
            if (a.mock_test_id !== testInstance.id) return false;
            if (!isDaily) return true;
            return getIstDateString(a.started_at) === currentIstDateStr;
          });

          // PRIORITY 1: Submitted attempt strictly dominates any other attempt state
          const submittedAttempts = matchedAttempts.filter((a: any) =>
            a.submitted_at !== null || ["submitted", "completed", "evaluated"].includes(a.status)
          );

          if (submittedAttempts.length > 0) {
            // Anomaly logging if multiple submitted attempts exist historically
            if (submittedAttempts.length > 1) {
              console.warn(
                `[ANOMALY] Multiple submitted attempts detected for user ${resolvedUserId} on mock_test ${testInstance.id}:`,
                submittedAttempts.map((a: any) => a.id)
              );
            }

            // Deterministic authoritative selection:
            // 1. Attempts with valid test_results first
            // 2. Latest submitted_at / started_at
            // 3. Deterministic ID tie-breaker
            submittedAttempts.sort((a: any, b: any) => {
              const trA = Array.isArray(a.test_results) ? a.test_results[0] : a.test_results;
              const trB = Array.isArray(b.test_results) ? b.test_results[0] : b.test_results;
              const hasValidA = trA && ((trA.total_score !== undefined && trA.total_score !== null) || (trA.score !== undefined && trA.score !== null)) ? 1 : 0;
              const hasValidB = trB && ((trB.total_score !== undefined && trB.total_score !== null) || (trB.score !== undefined && trB.score !== null)) ? 1 : 0;
              if (hasValidA !== hasValidB) return hasValidB - hasValidA;

              const timeA = new Date(a.submitted_at || a.started_at).getTime();
              const timeB = new Date(b.submitted_at || b.started_at).getTime();
              if (timeA !== timeB) return timeB - timeA;

              return String(b.id).localeCompare(String(a.id));
            });

            const authAttempt = submittedAttempts[0];
            attemptId = authAttempt.id;
            const tr = Array.isArray(authAttempt.test_results)
              ? authAttempt.test_results[0]
              : authAttempt.test_results;

            const hasValidResult =
              tr &&
              ((tr.total_score !== undefined && tr.total_score !== null) ||
                (tr.score !== undefined && tr.score !== null));

            if (hasValidResult) {
              itemStatus = "completed";
              completedScore = Number(tr.total_score ?? tr.score);
              completedAccuracy =
                tr.accuracy_percentage !== undefined ? Number(tr.accuracy_percentage) : undefined;
            } else {
              itemStatus = "evaluation_pending";
            }
          } else {
            // PRIORITY 2: Only when NO submitted attempt exists, check for in-progress attempt
            const inProgAttempt = matchedAttempts.find(
              (a: any) => a.status === "in_progress" && a.submitted_at === null
            );
            if (inProgAttempt) {
              itemStatus = "in_progress";
              attemptId = inProgAttempt.id;
            } else {
              // PRIORITY 3: No attempts found for today
              itemStatus = isOpen ? "available" : "upcoming";
            }
          }
        }

        const qCount = testInstance?.total_questions || meta.questionCount || (tpl.test_type === "daily_sectional" ? 25 : 50);
        const dur = testInstance?.duration_minutes || meta.durationMinutes || (tpl.test_type === "daily_sectional" ? 15 : 25);
        const marks = Number(testInstance?.total_marks || meta.totalMarks || (qCount * 2));

        todayMocks.push({
          testId: testInstance?.id || tpl.id,
          templateId: tpl.id,
          examId,
          examTitle: exam.title,
          examSlug: exam.slug,
          dayLabel: currentDayOfWeek.charAt(0).toUpperCase() + currentDayOfWeek.slice(1),
          dayOfWeek: currentDayOfWeek,
          testNumber,
          title: testInstance?.title || `${exam.title} Daily Mock (T#${testNumber})`,
          testType: tpl.test_type || "daily_sectional",
          sectionName: meta.activeSectionName || "General Section",
          questionCount: qCount,
          durationMinutes: dur,
          totalMarks: marks,
          negativeMark: meta.negativeMark ?? (pattern?.negative_mark_value || 0.5),
          isOpen,
          status: itemStatus,
          attemptId,
          completedScore,
          completedAccuracy,
          answeredCount: 0,
        });
      }
    }

    // Direct authoritative fetch fallback for any completed or evaluation_pending todayMock
    for (const m of todayMocks) {
      if ((m.status === "completed" || m.status === "evaluation_pending") && m.completedScore === undefined && m.attemptId) {
        const adminSb = createAdminServerSupabaseClient();
        const { data: directRes } = await adminSb
          .from("test_results")
          .select("total_score, accuracy_percentage")
          .eq("attempt_id", m.attemptId)
          .maybeSingle();

        if (directRes && directRes.total_score !== undefined && directRes.total_score !== null) {
          m.status = "completed";
          m.completedScore = Number(directRes.total_score);
          m.completedAccuracy = directRes.accuracy_percentage !== undefined ? Number(directRes.accuracy_percentage) : undefined;
        } else if (m.status === "completed") {
          // If submitted attempt has no result row yet, preserve as evaluation_pending (NEVER reset to available!)
          m.status = "evaluation_pending";
        }
      }
    }

    // 7. Weekly Mock Schedule (Mon - Sun)
    const weeklySchedule: MockDashboardScheduleDay[] = dayNames.map((day) => {
      const isCurrent = day === currentDayOfWeek;
      const targetExamIds = targetExams.map((e: any) => e.examId || e.id);
      const tpl = templates.find((t: any) => {
        if (targetExamIds.length > 0 && !targetExamIds.includes(t.exam_id)) return false;
        return t.slug?.endsWith(`-daily-${day}`);
      });

      let meta: any = {};
      try { meta = JSON.parse(tpl?.description || "{}"); } catch {}
      const pattern = patterns.find((p: any) => p.id === tpl?.pattern_id);

      let dayStatus: MockDashboardScheduleDay["status"] = "upcoming";
      if (isCurrent) {
        dayStatus = isOpen ? "available" : "upcoming";
      }

      const qCount = tpl?.mock_tests?.[0]?.total_questions || meta.questionCount || 25;
      const dur = tpl?.mock_tests?.[0]?.duration_minutes || meta.durationMinutes || 15;
      const marks = Number(tpl?.mock_tests?.[0]?.total_marks || meta.totalMarks || 50);

      return {
        dayOfWeek: day,
        dayLabel: day.charAt(0).toUpperCase() + day.slice(1),
        testType: tpl?.test_type || "daily_sectional",
        patternName: pattern?.name || "Standard Exam Pattern",
        sectionName: meta.activeSectionName || (tpl?.test_type === "mixed" ? "Mixed Subjects" : "All Sections"),
        questionCount: qCount,
        durationMinutes: dur,
        totalMarks: marks,
        isActive: tpl?.is_active !== false,
        status: dayStatus,
        isToday: isCurrent,
        testId: tpl?.mock_tests?.[0]?.id,
      };
    });

    // 8. Full-Length Mock Tests
    const targetExamIds = targetExams.map((e: any) => e.examId || e.id);
    const fullMockTests: MockDashboardFullMockItem[] = publishedTests
      .filter((mt: any) => {
        const examId = mt.mock_templates?.exam_id;
        const testType = mt.mock_templates?.test_type;
        return targetExamIds.includes(examId) && testType !== "daily_sectional";
      })
      .map((mt: any) => {
        const userAttempt = attempts.find((a: any) => a.mock_test_id === mt.id && (a.status === "completed" || a.status === "submitted" || a.status === "evaluated"));
        const res = Array.isArray(userAttempt?.test_results) ? userAttempt.test_results[0] : userAttempt?.test_results;
        return {
          id: mt.id,
          title: mt.title,
          slug: mt.slug,
          examTitle: mt.mock_templates?.exams?.title || "Exam",
          examSlug: mt.mock_templates?.exams?.slug || "exam",
          category: mt.mock_templates?.exams?.category || "National Level",
          durationMinutes: mt.duration_minutes,
          totalQuestions: mt.total_questions,
          totalMarks: Number(mt.total_marks),
          isFree: mt.is_free,
          publishedAt: mt.published_at,
          userAttemptStatus: userAttempt ? "completed" : "not_started",
          bestScore: res && (res.total_score !== undefined || res.score !== undefined) ? Number(res.total_score ?? res.score) : undefined,
          attemptId: userAttempt?.id,
        };
      });

    // 9. Recent Completed Attempts
    const recentAttempts: MockDashboardRecentAttempt[] = attempts
      .filter((a: any) => (a.status === "completed" || a.status === "submitted" || a.status === "evaluated"))
      .slice(0, 5)
      .map((a: any) => {
        const res = Array.isArray(a.test_results) ? a.test_results[0] : a.test_results;
        const mt = a.mock_tests;
        const submitted = new Date(a.submitted_at || a.started_at);
        const diffHours = Math.floor((now.getTime() - submitted.getTime()) / 3600000);
        let relativeTime = "Today";
        if (diffHours >= 24 && diffHours < 48) relativeTime = "Yesterday";
        else if (diffHours >= 48) relativeTime = `${Math.floor(diffHours / 24)} days ago`;
        else if (diffHours > 0) relativeTime = `${diffHours}h ago`;
        else relativeTime = "Just now";

        return {
          attemptId: a.id,
          testId: mt?.id || a.mock_test_id,
          title: mt?.title || "Mock Test Attempt",
          examTitle: mt?.mock_templates?.exams?.title || "General Mock",
          examSlug: mt?.mock_templates?.exams?.slug || "mock",
          testType: mt?.mock_templates?.test_type || "mock",
          submittedAt: a.submitted_at || a.started_at,
          relativeTime,
          score: res && (res.total_score !== undefined || res.score !== undefined) ? Number(res.total_score ?? res.score) : 0,
          maxScore: Number(res?.max_score ?? mt?.total_marks ?? 100),
          accuracyPercentage: Number(res?.accuracy_percentage ?? 0),
          correctCount: res?.correct_count ?? 0,
          incorrectCount: res?.incorrect_count ?? 0,
          timeSpentSeconds: a.time_taken_seconds || res?.time_spent_seconds || 0,
        };
      });

    // 10. Performance Statistics (Overall + Exam-Wise)
    const completedAttempts = attempts.filter((a: any) => (a.status === "completed" || a.status === "submitted" || a.status === "evaluated"));
    const totalMocksAttempted = completedAttempts.length;
    const totalAccuracy = completedAttempts.reduce((acc: number, a: any) => {
      const res = Array.isArray(a.test_results) ? a.test_results[0] : a.test_results;
      return acc + Number(res?.accuracy_percentage || 0);
    }, 0);
    const averageAccuracy = totalMocksAttempted > 0 ? Math.round(totalAccuracy / totalMocksAttempted) : 0;
    const bestScore = completedAttempts.reduce((best: number, a: any) => {
      const res = Array.isArray(a.test_results) ? a.test_results[0] : a.test_results;
      const score = Number(res?.total_score ?? res?.score ?? 0);
      return score > best ? score : best;
    }, 0);
    const questionsSolved = completedAttempts.reduce((acc: number, a: any) => {
      const res = Array.isArray(a.test_results) ? a.test_results[0] : a.test_results;
      return acc + (res?.attempted_count || res?.correct_count || 0);
    }, 0);

    // Exam-wise preparation summary
    const examPrepSummaries: MockDashboardExamPrepSummary[] = targetExams.map((exam: any) => {
      const examId = exam.examId || exam.id;
      const examAttempts = completedAttempts.filter((a: any) => a.mock_tests?.mock_templates?.exam_id === examId);
      const eCount = examAttempts.length;
      const eAccSum = examAttempts.reduce((acc: number, a: any) => {
        const res = Array.isArray(a.test_results) ? a.test_results[0] : a.test_results;
        return acc + Number(res?.accuracy_percentage || 0);
      }, 0);
      const eBest = examAttempts.reduce((b: number, a: any) => {
        const res = Array.isArray(a.test_results) ? a.test_results[0] : a.test_results;
        const s = Number(res?.total_score ?? res?.score ?? 0);
        return s > b ? s : b;
      }, 0);
      const eQs = examAttempts.reduce((acc: number, a: any) => {
        const res = Array.isArray(a.test_results) ? a.test_results[0] : a.test_results;
        return acc + (res?.attempted_count || 0);
      }, 0);

      const firstAttemptRes = examAttempts[0]
        ? (Array.isArray(examAttempts[0].test_results) ? examAttempts[0].test_results[0] : examAttempts[0].test_results)
        : null;

      return {
        examId,
        examTitle: exam.title,
        examSlug: exam.slug,
        totalMocksAttempted: eCount,
        averageAccuracy: eCount > 0 ? Math.round(eAccSum / eCount) : 0,
        bestScore: eBest,
        maxScore: 200,
        questionsSolved: eQs,
        recentScore: firstAttemptRes ? Number(firstAttemptRes.total_score ?? firstAttemptRes.score ?? 0) : undefined,
      };
    });

    // 11. Streak & Gamification Progress
    const isTodayAttempted = todayMocks.some((m) => m.status === "completed");
    const currentStreakVal = streakRecord?.current_streak ?? (isTodayAttempted ? 1 : 0);
    const longestStreakVal = streakRecord?.longest_streak ?? currentStreakVal;

    const streak: MockDashboardStreak = {
      currentStreak: currentStreakVal,
      longestStreak: longestStreakVal,
      isFrozen: Boolean(streakRecord?.is_frozen),
      isTodayAttempted,
      milestones: [
        { days: 7, achieved: currentStreakVal >= 7 },
        { days: 14, achieved: currentStreakVal >= 14 },
        { days: 30, achieved: currentStreakVal >= 30 },
        { days: 50, achieved: currentStreakVal >= 50 },
      ],
    };

    const unlockedBadgeIds = userBadges.map((b: any) => b.badge_id);
    const rewards: MockDashboardRewards = {
      currentCoins: walletRecord?.current_balance ?? 0,
      lifetimeEarned: walletRecord?.lifetime_earned ?? 0,
      levelTitle: totalMocksAttempted >= 20 ? "Master Scholar" : totalMocksAttempted >= 10 ? "Scholar II" : totalMocksAttempted >= 3 ? "Scholar I" : "Aspirant Novice",
      levelProgressPct: Math.min(100, Math.round(((totalMocksAttempted % 10) / 10) * 100)),
      badges: allBadges.map((b: any) => ({
        id: b.id,
        code: b.code,
        title: b.title,
        tier: b.tier || "bronze",
        iconUrl: b.icon_url,
        unlocked: unlockedBadgeIds.includes(b.id) || (b.code === "first_mock" && totalMocksAttempted >= 1),
      })),
      nextRewardThreshold: 1000,
    };

    // 12. Next Mock Action Resolution (Priority Engine)
    let nextMockAction: MockTestDashboardData["nextMockAction"] = { type: "none" };

    if (!resolvedUserId) {
      nextMockAction = { type: "auth_required" };
    } else {
      const completedTodayMock = todayMocks.find(
        (m) => m.status === "completed" && m.attemptId && m.completedScore !== undefined
      );
      const pendingTodayMock = todayMocks.find((m) => m.status === "evaluation_pending" && m.attemptId);
      const inProgressTodayMock = todayMocks.find((m) => m.status === "in_progress" && m.testId);
      const activeTodayMock = todayMocks.find((m) => m.status === "available");

      // 1. If today's mock is completed, show View Result with canonical attempt
      if (completedTodayMock) {
        nextMockAction = { type: "view_result", todayMock: completedTodayMock };
      } else if (pendingTodayMock) {
        nextMockAction = { type: "evaluation_pending", todayMock: pendingTodayMock };
      } else if (inProgressTodayMock) {
        const matchedAttempt = attempts.find(
          (a: any) =>
            a.mock_test_id === inProgressTodayMock.testId &&
            a.status === "in_progress" &&
            a.submitted_at === null
        );
        if (matchedAttempt) {
          const totalQ = inProgressTodayMock.questionCount || 25;
          const answeredCount = oneToOne(matchedAttempt.test_results)?.attempted_count || 0; // TYPES-1 B1 (Class B)
          nextMockAction = {
            type: "resume",
            resumable: {
              attemptId: matchedAttempt.id,
              testId: inProgressTodayMock.testId,
              title: inProgressTodayMock.title,
              examTitle: inProgressTodayMock.examTitle,
              examSlug: inProgressTodayMock.examSlug,
              testType: inProgressTodayMock.testType,
              startedAt: matchedAttempt.started_at,
              answeredCount,
              totalQuestions: totalQ,
              progressPercentage: Math.min(100, Math.round((answeredCount / (totalQ || 1)) * 100)),
              durationMinutes: inProgressTodayMock.durationMinutes,
              totalMarks: inProgressTodayMock.totalMarks,
            },
          };
        } else {
          nextMockAction = { type: "start_today", todayMock: inProgressTodayMock };
        }
      } else if (resumableMock) {
        nextMockAction = { type: "resume", resumable: resumableMock };
      } else if (activeTodayMock) {
        nextMockAction = { type: "start_today", todayMock: activeTodayMock };
      } else if (fullMockTests.length > 0) {
        nextMockAction = { type: "browse_full" };
      }
    }

    return {
      isAuthenticated: Boolean(resolvedUserId),
      user: userObj,
      activeExamGoals,
      allExams: allExams.map((e) => ({ id: e.id, title: e.title, slug: e.slug, category: e.category })),
      selectedExamSlug,
      nextMockAction,
      todayMocks,
      examPrepSummaries,
      weeklySchedule,
      fullMockTests,
      recentAttempts,
      performance: {
        totalMocksAttempted,
        averageAccuracy,
        bestScore,
        questionsSolved,
        examBreakdown: examPrepSummaries,
      },
      streak,
      rewards,
    };
  }

  /**
   * Fetches all published mock tests.
   */
  static async getMockTestsDirectory(): Promise<MockTestItem[]> {
    const supabase = await createServerSupabaseClient();

    const { data: mockTests, error } = await supabase
      .from("mock_tests")
      .select("id, title, slug, duration_minutes, total_questions, total_marks, is_free, published_at, mock_templates(title, exams(title, category))")
      .eq("status", "published")
      .order("created_at", { ascending: false });

    if (error || !mockTests) return [];

    return (mockTests as any[]).map((mt) => ({
      id: mt.id,
      title: mt.title,
      slug: mt.slug,
      examTitle: mt.mock_templates?.exams?.title || "National Exam",
      category: mt.mock_templates?.exams?.category || "General",
      durationMinutes: mt.duration_minutes,
      totalQuestions: mt.total_questions,
      totalMarks: Number(mt.total_marks),
      isFree: mt.is_free,
      publishedAt: mt.published_at,
    }));
  }

  /**
   * Ensures mock test has populated mock_sections and mock_questions from question bank.
   */
  static async ensureMockTestQuestions(testId: string): Promise<void> {
    try {
      const adminSb = createAdminServerSupabaseClient();

      const { count } = await adminSb
        .from("mock_questions")
        .select("id", { count: "exact", head: true })
        .eq("mock_test_id", testId);

      if (count && count > 0) return;

      const { data: test } = await adminSb
        .from("mock_tests")
        .select("id, title, slug, template_id, mock_templates(id, title, slug, test_type, pattern_id, exam_id, description)")
        .eq("id", testId)
        .single();

      if (!test) return;

      const tpl = (test as any).mock_templates;
      let meta: any = {};
      try { meta = JSON.parse(tpl?.description || "{}"); } catch {}

      const { data: patternSections } = await adminSb
        .from("pattern_sections")
        .select("id, pattern_id, subject_id, section_name, num_questions, marks_per_question, negative_mark, section_order")
        .order("section_order", { ascending: true });

      const allPatternSecs = (patternSections as any[]) || [];

      const { data: rawQuestions } = await adminSb
        .from("questions")
        .select("id, canonical_topic_id, topics:canonical_taxonomy_nodes!questions_canonical_topic_id_node_fkey(subject_id:root_subject_id), question_versions!inner(id, version_number, question_text, is_current, lifecycle_status)")
        // QF-1: only the current PUBLISHED version of a published question may enter a test.
        .eq("status", "published")
        .eq("question_versions.is_current", true)
        .eq("question_versions.lifecycle_status", "PUBLISHED")
        .order("created_at", { ascending: true });

      const questionsBySubject: Record<string, Array<{ questionId: string; questionVersionId: string }>> = {};
      ((rawQuestions as any[]) || []).forEach((q: any) => {
        const subId = q.topics?.subject_id;
        if (subId) {
          if (!questionsBySubject[subId]) questionsBySubject[subId] = [];
          const qv = q.question_versions?.[0];
          if (qv) {
            questionsBySubject[subId].push({
              questionId: q.id,
              questionVersionId: qv.id,
            });
          }
        }
      });

      let targetSections: any[] = [];
      if (tpl?.test_type === "sectional" || tpl?.test_type === "daily_sectional") {
        if (meta.activeSectionId) {
          targetSections = allPatternSecs.filter(
            (ps) => ps.id === meta.activeSectionId || ps.subject_id === meta.activeSectionId
          );
        }
        if (targetSections.length === 0) {
          if (test.slug.includes("monday")) targetSections = allPatternSecs.filter((ps) => ps.section_order === 1);
          else if (test.slug.includes("tuesday")) targetSections = allPatternSecs.filter((ps) => ps.section_order === 2);
          else if (test.slug.includes("wednesday")) targetSections = allPatternSecs.filter((ps) => ps.section_order === 3);
          else if (test.slug.includes("thursday")) targetSections = allPatternSecs.filter((ps) => ps.section_order === 4);
          else targetSections = [allPatternSecs[0]];
        }
      } else if (tpl?.test_type === "mixed") {
        if (test.slug.includes("friday")) {
          targetSections = allPatternSecs.filter((ps) => ps.section_order === 1 || ps.section_order === 2);
        } else if (test.slug.includes("saturday")) {
          targetSections = allPatternSecs.filter((ps) => ps.section_order === 3 || ps.section_order === 4);
        } else {
          targetSections = allPatternSecs.slice(0, 2);
        }
      } else {
        targetSections = allPatternSecs;
      }

      let globalQOrder = 1;
      for (let sIdx = 0; sIdx < targetSections.length; sIdx++) {
        const ps = targetSections[sIdx];
        const limit = meta.questionCount && targetSections.length === 1 ? meta.questionCount : ps.num_questions || 25;

        const { data: newSec } = await adminSb
          .from("mock_sections")
          .insert({
            mock_test_id: test.id,
            subject_id: ps.subject_id,
            section_name: ps.section_name,
            section_order: sIdx + 1,
            num_questions: limit,
            marks_per_question: ps.marks_per_question || 2.0,
            negative_mark: ps.negative_mark || 0.5,
          } as any)
          .select("id")
          .single();

        if (!newSec) continue;

        const availableQs = questionsBySubject[ps.subject_id] || [];
        const selectedQs = availableQs.slice(0, limit);

        const mqPayloads = selectedQs.map((q) => ({
          mock_test_id: test.id,
          mock_section_id: newSec.id,
          question_version_id: q.questionVersionId,
          question_order: globalQOrder++,
          marks: ps.marks_per_question || 2.0,
          negative_mark: ps.negative_mark || 0.5,
        }));

        if (mqPayloads.length > 0) {
          await adminSb.from("mock_questions").insert(mqPayloads as any);
        }
      }
    } catch {
      // Safe fallback if questions assembly encountered issue
    }
  }

  /**
   * Fetches mock test blueprint & instructions.
   */
  static async getMockTestInstructions(testId: string): Promise<MockTestInstructionsData | null> {
    await AssessmentService.ensureMockTestQuestions(testId);
    const supabase = await createServerSupabaseClient();

    const [testRes, sectionsRes] = await Promise.all([
      supabase.from("mock_tests").select("id, title, slug, duration_minutes, total_questions, total_marks, is_free, mock_templates(exams(title, category))").eq("id", testId).maybeSingle(),
      supabase.from("mock_sections").select("id, section_name, num_questions, marks_per_question, negative_mark, section_order").eq("mock_test_id", testId).order("section_order"),
    ]);

    const t = testRes.data;
    if (!t) return null;

    const sections = sectionsRes.data || [];

    return {
      test: {
        id: t.id,
        title: t.title,
        slug: t.slug,
        durationMinutes: t.duration_minutes,
        totalQuestions: t.total_questions,
        totalMarks: Number(t.total_marks),
        isFree: t.is_free,
      },
      exam: {
        title: t.mock_templates?.exams?.title || "National Exam",
        category: t.mock_templates?.exams?.category || "General",
      },
      sections: sections.map((s) => ({
        id: s.id,
        name: s.section_name,
        numQuestions: s.num_questions,
        marksPerQuestion: Number(s.marks_per_question),
        negativeMark: Number(s.negative_mark),
      })),
    };
  }

  /**
   * Initializes or resumes a test attempt, loading sanitized questions with ZERO answer key leakage.
   */
  static async startOrResumeAttempt(testId: string, overrideUserId?: string): Promise<ActiveAttemptSession | null> {
    let resolvedUserId = overrideUserId;
    if (!resolvedUserId) {
      try {
        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        resolvedUserId = user?.id;
      } catch {
        // Fallback
      }
    }

    if (!resolvedUserId) return null;

    const adminSb = createAdminServerSupabaseClient();

    // 1. Check if testId is directly an attempt ID
    const { data: directAttempt } = await adminSb
      .from("test_attempts")
      .select("id, mock_test_id, user_id, status, started_at, submitted_at")
      .eq("id", testId)
      .maybeSingle();

    let targetMockTestId = testId;
    let attempt: any = null;

    if (directAttempt) {
      if (directAttempt.user_id !== resolvedUserId) return null; // Security barrier
      if (directAttempt.submitted_at !== null || ["submitted", "completed", "evaluated"].includes(directAttempt.status)) {
        return null; // Completed, take page will route to result
      }
      targetMockTestId = directAttempt.mock_test_id;
      attempt = directAttempt;
    }

    // 2. If attempt not directly resolved, fetch mock test details to determine daily vs full type
    const { data: mockTestData } = await adminSb
      .from("mock_tests")
      .select("id, title, slug, duration_minutes, is_free, template_id, mock_templates(id, title, test_type, slug)")
      .eq("id", targetMockTestId)
      .maybeSingle();

    if (!mockTestData) return null;

    const tpl = mockTestData.mock_templates as any;
    const isDaily =
      tpl?.test_type === "daily" ||
      tpl?.test_type === "daily_sectional" ||
      tpl?.test_type === "sectional" ||
      tpl?.slug?.includes("-daily-") ||
      mockTestData.slug?.includes("-daily-");

    const currentIstDateStr = getIstDateString();

    // Concurrency lock: serialize simultaneous requests for the same user, mock test, and occurrence
    const lockKey = isDaily
      ? `${resolvedUserId}__${targetMockTestId}__${currentIstDateStr}`
      : `${resolvedUserId}__${targetMockTestId}`;

    while (AssessmentService.attemptCreationLocks.has(lockKey)) {
      try {
        await AssessmentService.attemptCreationLocks.get(lockKey);
      } catch {}
    }

    let releaseLock: (() => void) | null = null;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    AssessmentService.attemptCreationLocks.set(lockKey, lockPromise);

    try {
      // Fetch user's existing attempts for this mock test
      const { data: userAttempts } = await adminSb
        .from("test_attempts")
        .select("id, status, started_at, submitted_at")
        .eq("mock_test_id", targetMockTestId)
        .eq("user_id", resolvedUserId)
        .order("started_at", { ascending: true });

      const allAttempts = userAttempts || [];
      const attemptsList = isDaily
        ? allAttempts.filter((a: any) => getIstDateString(a.started_at) === currentIstDateStr)
        : allAttempts;

      // Priority 1: If any submitted attempt exists for this scheduled occurrence, block new attempt creation
      const submittedAttempt = attemptsList.find(
        (a) => a.submitted_at !== null || ["submitted", "completed", "evaluated"].includes(a.status)
      );
      if (submittedAttempt) {
        return null; // Already submitted for this scheduled occurrence
      }

      // Priority 2: If an in-progress attempt exists for this occurrence, resume it (earliest started)
      const inProgAttempt = attemptsList.find(
        (a) => a.status === "in_progress" && a.submitted_at === null
      );
      if (inProgAttempt) {
        attempt = inProgAttempt;
      }

      // 3. If no active attempt exists for this session, create a fresh in_progress attempt atomically
      if (!attempt) {
        if (mockTestData.is_free === false) {
          // Premium mock test: enforce authoritative entitlement resolution & concurrency-safe quota locking
          const authRes = await PremiumEntitlementService.authorizeAndStartAttempt(
            resolvedUserId,
            targetMockTestId
          );

          if (!authRes.success || !authRes.attemptId) {
            return null; // Premium access denied or quota exhausted
          }

          const { data: createdAttempt } = await adminSb
            .from("test_attempts")
            .select("id, status, started_at, submitted_at")
            .eq("id", authRes.attemptId)
            .single();

          attempt = createdAttempt;
        } else {
          // Free mock test (e.g. Daily Mock): standard atomic insertion governed by trg_enforce_mock_attempt_lifecycle
          try {
            const { data: newAttempt, error } = await adminSb
              .from("test_attempts")
              .insert({
                mock_test_id: targetMockTestId,
                user_id: resolvedUserId,
                status: "in_progress",
                started_at: new Date().toISOString(),
              } as any)
              .select("id, started_at")
              .single();

            if (error || !newAttempt) {
              // Concurrency recovery: check if a simultaneous request created the attempt
              const { data: recoveredAttempts } = await adminSb
                .from("test_attempts")
                .select("id, status, started_at, submitted_at")
                .eq("mock_test_id", targetMockTestId)
                .eq("user_id", resolvedUserId)
                .order("started_at", { ascending: true });

              const recoveredList = isDaily
                ? (recoveredAttempts || []).filter((a: any) => getIstDateString(a.started_at) === currentIstDateStr)
                : (recoveredAttempts || []);

              const recoveredActive = recoveredList.find(
                (a: any) => a.status === "in_progress" && a.submitted_at === null
              );

              if (recoveredActive) {
                attempt = recoveredActive;
              } else {
                return null;
              }
            } else {
              // Canonical check: fetch earliest in_progress attempt for this occurrence in case of competing insert
              const { data: activeAttempts } = await adminSb
                .from("test_attempts")
                .select("id, status, started_at, submitted_at")
                .eq("mock_test_id", targetMockTestId)
                .eq("user_id", resolvedUserId)
                .eq("status", "in_progress")
                .is("submitted_at", null)
                .order("started_at", { ascending: true });

              const activeForOccurrence = isDaily
                ? (activeAttempts || []).filter((a: any) => getIstDateString(a.started_at) === currentIstDateStr)
                : (activeAttempts || []);

              attempt = activeForOccurrence[0] || (newAttempt as any);
            }
          } catch {
            const { data: recoveredAttempts } = await adminSb
              .from("test_attempts")
              .select("id, status, started_at, submitted_at")
              .eq("mock_test_id", targetMockTestId)
              .eq("user_id", resolvedUserId)
              .order("started_at", { ascending: true });

            const recoveredList = isDaily
              ? (recoveredAttempts || []).filter((a: any) => getIstDateString(a.started_at) === currentIstDateStr)
              : (recoveredAttempts || []);

            const recoveredActive = recoveredList.find(
              (a: any) => a.status === "in_progress" && a.submitted_at === null
            );

            if (recoveredActive) {
              attempt = recoveredActive;
            } else {
              return null;
            }
          }
        }
      }
    } finally {
      AssessmentService.attemptCreationLocks.delete(lockKey);
      if (releaseLock) (releaseLock as () => void)();
    }

    // Ensure mock questions and sections exist
    await AssessmentService.ensureMockTestQuestions(targetMockTestId);

    // Fetch test details, sections, and questions with options
    const [testRes, sectionsRes, questionsRes, answersRes, positionRes] = await Promise.all([
      adminSb.from("mock_tests").select("id, title, duration_minutes").eq("id", targetMockTestId).single(),
      adminSb.from("mock_sections").select("id, section_name, section_order").eq("mock_test_id", targetMockTestId).order("section_order"),
      adminSb.from("mock_questions").select("id, question_order, mock_section_id, marks, negative_mark, question_versions(id, question_id, question_text, question_image_url, options_type, question_options(id, option_key, option_text, option_image_url, order_index))").eq("mock_test_id", targetMockTestId).order("question_order"),
      adminSb.from("attempt_answers").select("mock_question_id, selected_option_key, is_marked_for_review, time_spent_seconds").eq("attempt_id", attempt.id),
      adminSb.from("test_attempts").select("last_question_order, visited_orders").eq("id", attempt.id).maybeSingle(),
    ]);

    const testData = testRes.data;
    if (!testData) return null;

    const savedAnswers = answersRes.data || [];
    const savedAnswersMap = new Map<string, { selectedOption: string | null; isMarkedForReview: boolean; timeSpentSeconds: number }>();
    savedAnswers.forEach((a) => {
      savedAnswersMap.set(a.mock_question_id, {
        selectedOption: a.selected_option_key,
        isMarkedForReview: a.is_marked_for_review,
        timeSpentSeconds: a.time_spent_seconds,
      });
    });

    const sectionsData = sectionsRes.data || [];
    const sectionsMap = new Map<string, string>();
    sectionsData.forEach((s) => {
      sectionsMap.set(s.id, s.section_name);
    });

    const rawQuestions = questionsRes.data || [];
    const questions: ActiveTestQuestion[] = rawQuestions.map((mq) => {
      const qv = mq.question_versions;
      const opts = (qv?.question_options || [])
        .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
        .map((o: any) => ({
          key: o.option_key,
          text: o.option_text || o.content_text || "",
          imageUrl: o.option_image_url || null,
        }));

      return {
        mockQuestionId: mq.id,
        questionOrder: mq.question_order,
        sectionId: mq.mock_section_id,
        sectionName: sectionsMap.get(mq.mock_section_id) || "Section",
        questionVersionId: qv?.id || "",
        questionId: qv?.question_id ?? null,
        questionText: qv?.question_text || "",
        questionImageUrl: qv?.question_image_url || null,
        optionsType: qv?.options_type || "text",
        marks: Number(mq.marks),
        negativeMark: Number(mq.negative_mark),
        options: opts,
        savedAnswer: savedAnswersMap.get(mq.id),
      };
    });

    // Calculate server-authoritative remaining time
    const startTimeMs = new Date(attempt.started_at).getTime();
    const nowMs = Date.now();
    const elapsedSeconds = Math.floor((nowMs - startTimeMs) / 1000);
    const totalAllowedSeconds = testData.duration_minutes * 60;
    const remainingSeconds = Math.max(0, totalAllowedSeconds - elapsedSeconds);

    // If attempt has already expired in the background, finalize it exactly as the timer would (EXAM-FINALIZE-1):
    // submitted_at = the server deadline, scored from the saved answers by the one submit path
    if (remainingSeconds <= 0) {
      if (isFinalizeEnabled()) await AssessmentService.finalizeExpiredAttempts({ userId: attempt.user_id, limit: 20 });
      else await AssessmentService.submitTestAttempt(attempt.id, attempt.user_id, { submittedAt: new Date(startTimeMs + totalAllowedSeconds * 1000).toISOString() });
      return null;
    }

    return {
      attemptId: attempt.id,
      testId: testData.id,
      testTitle: testData.title,
      durationMinutes: testData.duration_minutes,
      startedAt: attempt.started_at,
      remainingSeconds,
      sections: sectionsData.map((s) => ({ id: s.id, name: s.section_name })),
      questions,
      // Q6 part B: the resume position comes from the server (localStorage is only a cache)
      resumeOrder: positionRes.data?.last_question_order ?? null,
      visitedOrders: positionRes.data?.visited_orders ?? [],
    };
  }

  /**
   * Q6 part B (099): keeps the resume position on the server. The student's own client may update only
   * last_activity_at / last_question_order / visited_orders (column grants), and RLS limits it to their own in-progress
   * attempt — a closed or foreign attempt changes nothing and returns "closed".
   */
  static async saveAttemptPosition(attemptId: string, position: AttemptPosition): Promise<"ok" | "closed" | "error"> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("test_attempts")
      .update({ last_question_order: position.order, visited_orders: position.visited, last_activity_at: new Date().toISOString() })
      .eq("id", attemptId)
      .eq("status", "in_progress")
      .select("id");
    if (error) return "error";
    return data && data.length > 0 ? "ok" : "closed";
  }

  /**
   * Saves student answer selection securely.
   */
  static async saveAnswer(
    attemptId: string,
    mockQuestionId: string,
    selectedOption: string | null,
    isMarkedForReview: boolean,
    timeSpentSeconds: number
  ): Promise<"ok" | "closed" | "error"> {
    const supabase = await createServerSupabaseClient();

    // Q6: the server's clock decides. A save after the server deadline (+ SAVE_GRACE_SECONDS for answers in flight)
    // is refused as "closed", whatever time the device shows.
    const { data: att } = await supabase.from("test_attempts").select("status, started_at, mock_tests(duration_minutes)").eq("id", attemptId).maybeSingle();
    if (!att || att.status !== "in_progress") return "closed";
    const duration = Number(oneToOne(att.mock_tests)?.duration_minutes);
    if (!Number.isFinite(duration) || duration <= 0) return "error";
    if (Date.now() > attemptDeadline(att.started_at, duration).getTime() + SAVE_GRACE_SECONDS * 1000) return "closed";

    const { error } = await supabase
      .from("attempt_answers")
      .upsert({
        attempt_id: attemptId,
        mock_question_id: mockQuestionId,
        selected_option_key: selectedOption,
        is_marked_for_review: isMarkedForReview,
        time_spent_seconds: timeSpentSeconds,
        updated_at: new Date().toISOString(),
      } as any, {
        onConflict: "attempt_id,mock_question_id",
      });

    // F3 (R7): the client shows "Saved" only on a confirmed write. RLS lets a student write answers only to their own
    // IN-PROGRESS attempt, so a policy refusal (42501) means the attempt is closed (submitted / time over): stop retrying.
    if (!error) return "ok";
    return (error as { code?: string }).code === "42501" ? "closed" : "error";
  }

  /**
   * Evaluates attempt against authoritative answer keys, populates test_results,
   * section_results, awards Phase 3D coins, logs Phase 3C activity, and logs Phase 3O mistakes.
   */
  /**
   * EXAM-FINALIZE-1: finalize the in-progress attempts whose server deadline (started_at + duration) has passed —
   * finalize-on-read (player, result, mock list, exam page; userId given) and the daily sweep (no userId; bounded).
   * Superseded ones (a SUBMITTED attempt of the same mock started later) and ones with ZERO saved answers become
 * "abandoned": never scored or shown. Only attempts with ≥ 1 saved answer are scored (submitted_at = deadline).
   * Idempotent; returns counts only (never ids or user data).
   */
  static async finalizeExpiredAttempts(opts: { userId?: string; limit?: number } = {}): Promise<{ finalized: number; abandoned: number; failed: number }> {
    const counts = { finalized: 0, abandoned: 0, failed: 0 };
    if (!isFinalizeEnabled()) return counts; // off until the architect's go (EXAM_FINALIZE_ENABLED)
    const limit = Math.min(Math.max(1, opts.limit ?? 200), 500);
    try {
      const adminSb = createAdminServerSupabaseClient();
      let q = adminSb
        .from("test_attempts")
        .select("id, user_id, mock_test_id, status, started_at, submitted_at, mock_tests(duration_minutes)")
        .eq("status", "in_progress")
        .is("submitted_at", null)
        .order("started_at", { ascending: true })
        .limit(limit * 4);
      if (opts.userId) q = q.eq("user_id", opts.userId);
      const { data: rows } = await q;
      const now = new Date();
      const expired = (rows ?? [])
        .map((r) => ({ r, duration: Number(oneToOne(r.mock_tests)?.duration_minutes) }))
        .filter(({ r, duration }) => Number.isFinite(duration) && duration > 0 && isPastDeadline(r.started_at, duration, now))
        .slice(0, limit);
      for (const { r, duration } of expired) {
        const { data: sibs } = await adminSb
          .from("test_attempts")
          .select("id, user_id, mock_test_id, status, started_at, submitted_at")
          .eq("user_id", r.user_id)
          .eq("mock_test_id", r.mock_test_id);
        type Row = { id: string; user_id: string; mock_test_id: string; status: string; started_at: string; submitted_at: string | null };
        const toLike = (x: Row): AttemptLike => ({ id: x.id, userId: x.user_id, mockTestId: x.mock_test_id, status: x.status, startedAt: x.started_at, submittedAt: x.submitted_at });
        // saved answers = answered rows (a "marked for review" row without a choice is not an answer)
        const { count: saved } = await adminSb
          .from("attempt_answers")
          .select("id", { count: "exact", head: true })
          .eq("attempt_id", r.id)
          .not("selected_option_key", "is", null);
        const outcome = staleOutcome(toLike(r), duration, (sibs ?? []).map(toLike), now, saved ?? 0);
        if (outcome === "abandon") {
          // conditional: only a still-in-progress row changes (a concurrent finalize / submit wins cleanly)
          const { error } = await adminSb.from("test_attempts").update({ status: "abandoned" }).eq("id", r.id).eq("status", "in_progress");
          if (error) counts.failed++;
          else counts.abandoned++;
        } else if (outcome === "finalize") {
          const res = await AssessmentService.submitTestAttempt(r.id, r.user_id, { submittedAt: attemptDeadline(r.started_at, duration).toISOString() });
          if (res.success) counts.finalized++;
          else counts.failed++;
        }
      }
    } catch {
      counts.failed++;
    }
    return counts;
  }

  /**
   * The ONE submit / scoring path. EXAM-FINALIZE-1: `opts.submittedAt` = the server deadline when an expired attempt is
   * finalized (timer expiry, finalize-on-read, daily sweep) — scored from saved answers only, exactly like a submit.
   * Concurrency: test_results.attempt_id is UNIQUE; a parallel submit that loses the insert returns the winner's result.
   */
  static async submitTestAttempt(attemptId: string, overrideUserId?: string, opts?: { submittedAt?: string }): Promise<{ success: boolean; resultId?: string; error?: string }> {
    let userId = overrideUserId;
    if (!userId) {
      try {
        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id;
      } catch {
        // Outside request scope
      }
    }

    if (!userId) return { success: false, error: "Unauthorized" };

    const adminSb = createAdminServerSupabaseClient();
    const { data: attemptData } = await adminSb
      .from("test_attempts")
      .select("id, mock_test_id, user_id, started_at, status")
      .eq("id", attemptId)
      .eq("user_id", userId)
      .maybeSingle();

    const attempt = attemptData as any;
    if (!attempt) {
      return { success: false, error: "Attempt not found." };
    }

    // Idempotency: If attempt was already submitted, return existing result without duplicate inserts
    if (attempt.status === "submitted" || attempt.status === "completed") {
      const { data: existingResult } = await adminSb
        .from("test_results")
        .select("id")
        .eq("attempt_id", attemptId)
        .maybeSingle();

      if (existingResult) {
        return { success: true, resultId: (existingResult as any).id };
      }
    }

    if (attempt.status !== "in_progress") {
      return { success: false, error: "This attempt is no longer active." };
    }

    // Fetch test, sections, questions with answer keys, options, and student answers
    const [testRes, sectionsRes, questionsRes, answersRes] = await Promise.all([
      adminSb.from("mock_tests").select("id, total_questions, total_marks, duration_minutes, mock_templates(id, title, test_type)").eq("id", attempt.mock_test_id).single(),
      adminSb.from("mock_sections").select("id, marks_per_question, negative_mark").eq("mock_test_id", attempt.mock_test_id),
      adminSb.from("mock_questions").select("id, mock_section_id, question_version_id, marks, negative_mark, question_versions(id, question_id, question_answers(correct_option_key), question_options(id, option_key))").eq("mock_test_id", attempt.mock_test_id),
      adminSb.from("attempt_answers").select("id, mock_question_id, selected_option_key, time_spent_seconds").eq("attempt_id", attemptId),
    ]);

    const testData = testRes.data;
    if (!testData) return { success: false, error: "Test metadata missing" };

    const answersList = answersRes.data || [];
    const answersMap = new Map<string, any>();
    answersList.forEach((a) => {
      answersMap.set(a.mock_question_id, a);
    });

    let totalScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let attemptedCount = 0;
    let totalTimeSpent = 0;

    const sectionsList = sectionsRes.data || [];
    const sectionMetrics = new Map<string, { total: number; attempted: number; correct: number; incorrect: number; score: number; maxScore: number; time: number }>();
    sectionsList.forEach((s) => {
      sectionMetrics.set(s.id, { total: 0, attempted: 0, correct: 0, incorrect: 0, score: 0, maxScore: 0, time: 0 });
    });

    const evaluatedAnswers: Array<{ id: string; is_correct: boolean; evaluated_marks: number }> = [];
    const wrongAnswersForVault: Array<{
      questionId: string;
      questionVersionId?: string | null;
      attemptAnswerId?: string | null;
      selectedOptionId?: string | null;
      responseTimeSeconds?: number;
      cognitiveTypeId?: string;
    }> = [];
    const questionsList = questionsRes.data || [];
    // QB-KEY-1: a question without a valid answer key is excluded from score AND max score — never marked
    // incorrect, never negatively marked, never sent to the Mistake Vault — and logged as a data error (no PII).
    let excludedCount = 0;
    let excludedMarks = 0;
    const keylessVersionIds: string[] = [];

    questionsList.forEach((mq) => {
      const sec = sectionMetrics.get(mq.mock_section_id);
      const marks = Number(mq.marks);
      const negMark = Number(mq.negative_mark);
      const qv = mq.question_versions;
      const correctOptionKey = validAnswerKey(qv?.question_answers, qv?.question_options);
      if (!correctOptionKey) {
        excludedCount += 1;
        excludedMarks += Number.isFinite(marks) ? marks : 0;
        keylessVersionIds.push(String(qv?.id ?? mq.question_version_id ?? mq.id));
        return;
      }

      if (sec) {
        sec.total += 1;
        sec.maxScore += marks;
      }

      const ans = answersMap.get(mq.id);

      if (ans && ans.selected_option_key) {
        attemptedCount += 1;
        const qTime = Number(ans.time_spent_seconds || 0);
        totalTimeSpent += qTime;
        if (sec) {
          sec.attempted += 1;
          sec.time += qTime;
        }

        if (ans.selected_option_key === correctOptionKey) {
          correctCount += 1;
          totalScore += marks;
          if (sec) {
            sec.correct += 1;
            sec.score += marks;
          }
          evaluatedAnswers.push({ id: ans.id, is_correct: true, evaluated_marks: marks });
        } else {
          incorrectCount += 1;
          totalScore -= negMark;
          if (sec) {
            sec.incorrect += 1;
            sec.score -= negMark;
          }
          evaluatedAnswers.push({ id: ans.id, is_correct: false, evaluated_marks: -negMark });

          const canonicalQuestionId = qv?.question_id;
          if (canonicalQuestionId) {
            const selectedOpt = (qv?.question_options || []).find(
              (o: any) => o.option_key === ans.selected_option_key
            );
            wrongAnswersForVault.push({
              questionId: canonicalQuestionId,
              questionVersionId: qv?.id || null,
              attemptAnswerId: ans.id || null,
              selectedOptionId: selectedOpt?.id || null,
              responseTimeSeconds: qTime,
            });
          }
        }
      }
    });

    if (keylessVersionIds.length > 0) {
      console.warn(`[AssessmentService.submitTestAttempt] DATA_ERROR: ${keylessVersionIds.length} question version(s) without a valid answer key excluded from scoring (mock ${attempt.mock_test_id}; versions ${keylessVersionIds.join(", ")})`);
    }
    const scoredQuestions = Math.max(0, Number(testData.total_questions) - excludedCount);
    const unansweredCount = scoredQuestions - attemptedCount;
    const accuracy = attemptedCount > 0 ? (correctCount / attemptedCount) * 100 : 0;

    // Q6: a submit that arrives after the server deadline is stamped AT the deadline (never later)
    const serverDeadline = attemptDeadline(attempt.started_at, Number(testData.duration_minutes) || 0);
    const submittedAtIso = opts?.submittedAt ?? (Date.now() > serverDeadline.getTime() ? serverDeadline.toISOString() : new Date().toISOString());
    const authoritativeWallClockSeconds = calculateExamDuration(attempt.started_at, submittedAtIso);
    const finalDurationSeconds = Math.max(authoritativeWallClockSeconds, totalTimeSpent);

    try {
      // 1. Update attempt answers evaluation using adminSb (SILENT-FAIL-1: a failed row is logged, the submit continues)
      for (const ea of evaluatedAnswers) {
        const { error: evalError } = await (adminSb.from("attempt_answers") as any).update({ is_correct: ea.is_correct, evaluated_marks: ea.evaluated_marks }).eq("id", ea.id);
        if (evalError) reportWriteFailure({ fn: "AssessmentService.submitTestAttempt", table: "attempt_answers", op: "update", code: errorCode(evalError), ids: { attemptId, answerId: ea.id } });
      }

      // 2. Insert test_results using adminSb
      const { data: testResultData, error: resultErr } = await adminSb
        .from("test_results")
        .insert({
          attempt_id: attemptId,
          user_id: userId,
          mock_test_id: attempt.mock_test_id,
          total_questions: scoredQuestions,
          attempted_count: attemptedCount,
          correct_count: correctCount,
          incorrect_count: incorrectCount,
          unanswered_count: unansweredCount,
          total_score: totalScore,
          max_score: Math.max(0, Number(testData.total_marks) - excludedMarks),
          accuracy_percentage: Math.round(accuracy * 100) / 100,
          time_spent_seconds: finalDurationSeconds,
        } as any)
        .select("id")
        .single();

      if (resultErr && (resultErr as { code?: string }).code === "23505") {
        // a concurrent submit / finalize of the same attempt won the UNIQUE(attempt_id) race: one result, same answer
        const { data: winner } = await adminSb.from("test_results").select("id").eq("attempt_id", attemptId).maybeSingle();
        if (winner) return { success: true, resultId: (winner as any).id };
      }
      if (resultErr || !testResultData) {
        console.error("[AssessmentService.submitTestAttempt] Error inserting test_results:", resultErr);
        return { success: false, error: "We couldn't complete your submission. Your responses are preserved. Please try again." };
      }
      const testResult = testResultData as any;

      // 3. Insert section_results using adminSb
      for (const [secId, metrics] of sectionMetrics.entries()) {
        const secAccuracy = metrics.attempted > 0 ? (metrics.correct / metrics.attempted) * 100 : 0;
        await adminSb.from("section_results").insert({
          test_result_id: testResult.id,
          mock_section_id: secId,
          total_questions: metrics.total,
          attempted_count: metrics.attempted,
          correct_count: metrics.correct,
          incorrect_count: metrics.incorrect,
          unanswered_count: metrics.total - metrics.attempted,
          section_score: metrics.score,
          max_section_score: metrics.maxScore,
          accuracy_percentage: Math.round(secAccuracy * 100) / 100,
          time_spent_seconds: metrics.time,
        } as any);
      }

      // 4. Mark attempt as submitted with authoritative completion timestamp using adminSb
      const { error: statusError } = await (adminSb.from("test_attempts") as any).update({
        status: "submitted",
        submitted_at: submittedAtIso,
        time_taken_seconds: finalDurationSeconds,
      } as any).eq("id", attemptId);
      if (statusError) reportWriteFailure({ fn: "AssessmentService.submitTestAttempt", table: "test_attempts", op: "update", code: errorCode(statusError), ids: { attemptId } });

      // 5. Connect to Mistake Vault: Record all wrong answers. SILENT-FAIL-1: the student still gets the result, but
      // every failure is logged (ops.write_failure) and the nightly VAULT-HEALTH check catches missing rows.
      if (wrongAnswersForVault.length > 0) {
        try {
          const vault = await MistakeService.recordExamMistakes({ userId: userId, attemptId, mistakes: wrongAnswersForVault });
          if (vault.failedCount > 0) console.error(JSON.stringify({ tag: WRITE_FAILURE_TAG, fn: "AssessmentService.submitTestAttempt", summary: "mistake_vault_partial", ids: { attemptId }, failed: vault.failedCount, recorded: vault.recordedCount }));
        } catch (err) {
          reportWriteFailure({ fn: "AssessmentService.submitTestAttempt", table: "user_mistake_vault", op: "insert", code: errorCode(err), ids: { attemptId } });
        }
      }

      // 6. Award Server-Authoritative CL Coins via GamificationService
      const canonicalTestType = (testData.mock_templates as any)?.test_type || "sectional";
      await GamificationService.awardMockCompletionReward({
        userId: userId,
        attemptId,
        testId: attempt.mock_test_id,
        canonicalTestType,
        totalQuestions: testData.total_questions,
        attemptedCount,
        correctCount,
        incorrectCount,
        unansweredCount,
        timeSpentSeconds: finalDurationSeconds,
      }).catch((e) => console.error("[submitTestAttempt] Gamification reward notice:", e));

      // 7. Invalidate dashboard and test cache paths
      try {
        revalidatePath("/mock-tests");
        revalidatePath("/dashboard");
        revalidatePath("/mistakes");
        revalidatePath(`/mock-tests/${attempt.mock_test_id}`);
        revalidatePath(`/mock-tests/${attempt.mock_test_id}/leaderboard`);
      } catch (revErr) {
        console.warn("[submitTestAttempt] Revalidation notice:", revErr);
      }

      return { success: true, resultId: testResult.id };
    } catch (dbErr) {
      console.error("[AssessmentService.submitTestAttempt] Submission error:", dbErr);
      return { success: false, error: "We couldn't complete your submission. Your responses are preserved. Please try again." };
    }
  }

  /**
   * Helper to mask full names for public leaderboard privacy (e.g. "Rahul Sharma" -> "R*** S*****")
   */
  static maskCandidateName(name: string | null | undefined): string {
    if (!name || name.trim() === "") return "Candidate";
    const parts = name.trim().split(/\s+/);
    return parts
      .map((p) => {
        if (p.length <= 1) return p + "*";
        return p[0] + "*".repeat(Math.min(5, p.length - 1));
      })
      .join(" ");
  }

  /**
   * Retrieves the raw submission state of an attempt to provide accurate feedback when evaluation is pending.
   */
  static async getAttemptSubmissionStatus(attemptId: string): Promise<{ exists: boolean; isSubmitted: boolean; status?: string } | null> {
    const adminSb = createAdminServerSupabaseClient();
    const { data: attempt } = await adminSb
      .from("test_attempts")
      .select("id, status, submitted_at")
      .eq("id", attemptId)
      .maybeSingle();

    if (!attempt) return null;

    const isSubmitted = !!attempt.submitted_at || ["submitted", "completed", "evaluated"].includes(attempt.status);
    return {
      exists: true,
      isSubmitted,
      status: attempt.status,
    };
  }

  /**
   * Fetches test results and question-by-question review with solutions, dynamic standing, and performance insights.
   */
  static async getTestResult(attemptId: string): Promise<TestResultSummary | null> {
    let sb: SupabaseClient<Database>;
    let user: any = null;
    try {
      const supabase = await createServerSupabaseClient();
      const userRes = await supabase.auth.getUser();
      user = userRes.data?.user;
      sb = supabase;
    } catch {
      sb = createAdminServerSupabaseClient();
    }

    // EXAM-FINALIZE-1 (finalize-on-read): an expired in-progress attempt of this user is scored before the result read
    if (user?.id) await AssessmentService.finalizeExpiredAttempts({ userId: user.id, limit: 20 });

    let resolvedAttemptId = attemptId;
    let [resultRes, attemptRes] = await Promise.all([
      sb.from("test_results").select("*").eq("attempt_id", resolvedAttemptId).maybeSingle(),
      sb.from("test_attempts").select("id, mock_test_id, user_id, started_at, submitted_at, mock_tests(id, title, duration_minutes, total_questions, total_marks)").eq("id", resolvedAttemptId).maybeSingle(),
    ]);

    // Fallback 1: If not found by attempt_id, check if attemptId is actually a test_results.id
    if (!resultRes?.data && !attemptRes?.data) {
      const { data: resById } = await sb.from("test_results").select("*").eq("id", attemptId).maybeSingle();
      if (resById) {
        resolvedAttemptId = resById.attempt_id;
        [resultRes, attemptRes] = await Promise.all([
          sb.from("test_results").select("*").eq("attempt_id", resolvedAttemptId).maybeSingle(),
          sb.from("test_attempts").select("id, mock_test_id, user_id, started_at, submitted_at, mock_tests(id, title, duration_minutes, total_questions, total_marks)").eq("id", resolvedAttemptId).maybeSingle(),
        ]);
      }
    }

    // Fallback 2: If still not found and user is logged in, check if attemptId is a mock_test_id
    if ((!resultRes?.data || !attemptRes?.data) && user) {
      const { data: latestAttempt } = await sb
        .from("test_attempts")
        .select("id")
        .eq("mock_test_id", attemptId)
        .eq("user_id", user.id)
        .in("status", ["submitted", "completed", "evaluated"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestAttempt) {
        resolvedAttemptId = latestAttempt.id;
        [resultRes, attemptRes] = await Promise.all([
          sb.from("test_results").select("*").eq("attempt_id", resolvedAttemptId).maybeSingle(),
          sb.from("test_attempts").select("id, mock_test_id, user_id, started_at, submitted_at, mock_tests(id, title, duration_minutes, total_questions, total_marks)").eq("id", resolvedAttemptId).maybeSingle(),
        ]);
      }
    }

    const r = resultRes?.data;
    const attemptData = attemptRes?.data;

    if (!r || !attemptData || !attemptData.mock_tests) return null;
    const mt = attemptData.mock_tests;

    const adminSb = createAdminServerSupabaseClient();

    // Fetch section results, questions with answers & topics, user answers, and standing across same mock test
    const [sectionsRes, questionsRes, answersRes, allTestResultsRes] = await Promise.all([
      adminSb.from("section_results").select("*, mock_sections(id, section_name)").eq("test_result_id", r.id),
      adminSb.from("mock_questions").select("id, question_order, mock_section_id, marks, negative_mark, mock_sections(id, section_name), question_versions(id, question_id, question_text, question_image_url, options_type, question_options(id, option_key, option_text, option_image_url, order_index), question_answers(correct_option_key, explanation_md), questions(canonical_topic_id, topics:canonical_taxonomy_nodes!questions_canonical_topic_id_node_fkey(name, slug)))").eq("mock_test_id", mt.id).order("question_order"),
      adminSb.from("attempt_answers").select("mock_question_id, selected_option_key, is_marked_for_review, is_correct, evaluated_marks, time_spent_seconds").eq("attempt_id", resolvedAttemptId),
      // F4 cohort: every scored result of this mock (only submitted attempts have a test_results row)
      adminSb.from("test_results").select("user_id, total_score, created_at").eq("mock_test_id", mt.id).order("created_at", { ascending: true }),
    ]);

    const answersList = answersRes.data || [];
    const answersMap = new Map<string, any>();
    answersList.forEach((a) => {
      answersMap.set(a.mock_question_id, a);
    });

    const rawSections = sectionsRes.data || [];
    const sections = rawSections.map((sr) => ({
      id: sr.mock_sections?.id || sr.mock_section_id,
      sectionName: sr.mock_sections?.section_name || "Section",
      totalQuestions: sr.total_questions,
      attemptedCount: sr.attempted_count,
      correctCount: sr.correct_count,
      incorrectCount: sr.incorrect_count,
      unansweredCount: sr.unanswered_count,
      sectionScore: Number(sr.section_score),
      maxScore: Number(sr.max_section_score),
      accuracyPercentage: Number(sr.accuracy_percentage),
      timeSpentSeconds: sr.time_spent_seconds ? Number(sr.time_spent_seconds) : undefined,
    }));

    const rawQuestions = questionsRes.data || [];

    // GAP2-2a: batch learning resolution by topic id (LearningResolverService via ContentService)
    const topicKeys: string[] = [];
    rawQuestions.forEach((mq) => {
      const q = mq.question_versions?.questions;
      if (q?.canonical_topic_id) topicKeys.push(q.canonical_topic_id);
    });

    const topicLearningMap = await ContentService.resolveLearningResourcesForTopics(topicKeys);

    const reviewQuestions = rawQuestions.map((mq) => {
      const qv = mq.question_versions;
      const ans = answersMap.get(mq.id);
      const opts = (qv?.question_options || [])
        .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
        .map((o: any) => ({
          key: o.option_key,
          text: o.option_text || o.content_text || "",
          imageUrl: o.option_image_url || null,
        }));

      const qa = Array.isArray(qv?.question_answers)
        ? qv?.question_answers[0]
        : qv?.question_answers;
      const correctOption = validAnswerKey(qv?.question_answers, qv?.question_options);
      const explanation = qa?.explanation_md || null;
      const topicId = qv?.questions?.canonical_topic_id;
      const topicSlug = qv?.questions?.topics?.slug;
      const learningRes = topicId ? topicLearningMap.get(topicId) : undefined;

      return {
        mockQuestionId: mq.id,
        questionId: qv?.question_id ?? null,
        questionVersionId: qv?.id ?? null,
        questionOrder: mq.question_order,
        sectionName: mq.mock_sections?.section_name || "General",
        topicId: topicId ?? null,
        marks: Number(mq.marks || 0),
        isMarked: ans?.is_marked_for_review === true,
        questionText: qv?.question_text || "",
        questionImageUrl: qv?.question_image_url || null,
        optionsType: qv?.options_type || "text",
        options: opts,
        selectedOption: ans?.selected_option_key || null,
        correctOption,
        isCorrect: ans?.is_correct ?? false,
        marksAwarded: Number(ans?.evaluated_marks || 0),
        explanation,
        topicName: qv?.questions?.topics?.name || null,
        topicSlug: topicSlug || null,
        timeSpentSeconds: ans?.time_spent_seconds ? Number(ans.time_spent_seconds) : undefined,
        learningSlug: learningRes?.learningSlug || null,
        learningDocTitle: learningRes?.learningTitle || null,
        hasPublishedLearning: Boolean(learningRes?.hasPublishedLearning),
      };
    });

    // F4 (R12): rank / percentile only from >= RANK_MIN_COHORT real students' first submitted attempts; never estimated
    const candidateUserId = attemptData.user_id;
    const cohortRows: CohortRow[] = (allTestResultsRes.data || []).map((tr) => ({ userId: tr.user_id, score: Number(tr.total_score), createdAt: String(tr.created_at ?? ""), isTestAccount: false }));
    const standing = await AssessmentService.realCohortStanding(adminSb, cohortRows, candidateUserId, Number(r.total_score));

    // Identify strongest / weakest sections
    const sortedSections = [...sections].sort((a, b) => b.accuracyPercentage - a.accuracyPercentage);
    const strongestSection = sortedSections.length > 0 ? sortedSections[0].sectionName : null;
    const weakestSection = sortedSections.length > 1 ? sortedSections[sortedSections.length - 1].sectionName : null;

    let totalSeconds = Number(r.time_spent_seconds || 0);
    if (totalSeconds <= 0 && attemptData.started_at && attemptData.submitted_at) {
      totalSeconds = calculateExamDuration(attemptData.started_at, attemptData.submitted_at);
    }
    const speedSecondsPerQuestion = r.attempted_count > 0 ? Math.round(totalSeconds / r.attempted_count) : 0;

    const accuracyLevel =
      r.accuracy_percentage >= 85
        ? "Excellent Accuracy"
        : r.accuracy_percentage >= 70
        ? "Good Accuracy"
        : r.accuracy_percentage >= 50
        ? "Moderate Accuracy"
        : "Needs Improvement";

    // F4: exam of this mock (practice links + trend over the same exam)
    const { data: mockMeta } = await adminSb.from("mock_tests").select("mock_templates(exam_id, exams(slug))").eq("id", mt.id).maybeSingle();
    const tmpl = oneToOne(mockMeta?.mock_templates);
    const examId: string | null = tmpl?.exam_id ?? null;
    const examSlug: string | null = oneToOne(tmpl?.exams)?.slug ?? null;
    const trend = examId ? await AssessmentService.examTrend(adminSb, candidateUserId, examId, resolvedAttemptId) : null;

    const wrongTopicIds = [...new Set(reviewQuestions.filter((q) => q.selectedOption !== null && q.correctOption !== null && !q.isCorrect).map((q) => q.topicId).filter((t): t is string => Boolean(t)))];
    const practiceTopicIds = new Set<string>();
    if (isPracticeEnabled() && wrongTopicIds.length > 0) {
      const { servableTopicCounts } = await import("@/lib/practice/server"); // server-only module, loaded on use
      const counts = await servableTopicCounts(sb, wrongTopicIds);
      counts.forEach((n, t) => {
        if (n > 0) practiceTopicIds.add(t);
      });
    }
    const takeaways = buildTakeaways({
      questions: reviewQuestions,
      maxScore: Number(r.max_score),
      accuracyPercentage: Number(r.accuracy_percentage),
      timeUsedSeconds: totalSeconds,
      durationMinutes: Number(mt.duration_minutes) || 0,
      examSlug,
      practiceTopicIds,
    });

    const candidateIdShort = (candidateUserId || "CANDIDATE").slice(0, 4).toUpperCase();
    const maskedId = `CL••••${candidateIdShort}`;
    const attemptIdShort = attemptId.slice(0, 6).toUpperCase();
    const formattedTimestamp = formatIstDateTime(attemptData.submitted_at || r.created_at || new Date());

    // Check if this attempt is a retake (prior submitted attempt exists for same mock test)
    const { data: priorAttempt } = await adminSb
      .from("test_attempts")
      .select("id")
      .eq("mock_test_id", mt.id)
      .eq("user_id", candidateUserId)
      .in("status", ["submitted", "completed", "evaluated"])
      .lt("started_at", attemptData.started_at || new Date().toISOString())
      .neq("id", resolvedAttemptId)
      .limit(1)
      .maybeSingle();

    const isRetake = Boolean(priorAttempt);

    // Fetch reward event breakdown or compute server-authoritative calculation
    const { data: eventData } = await adminSb
      .from("gamification_events")
      .select("actual_coins_awarded, metadata")
      .or(`idempotency_key.eq.mock_reward_${mt.id}_${candidateUserId},idempotency_key.eq.mock_eval_${resolvedAttemptId}_${candidateUserId},and(source_id.eq.${mt.id},user_id.eq.${candidateUserId})`)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let rewards: TestRewardSummary;
    if (isRetake) {
      rewards = {
        isRetake: true,
        completionCoins: 0,
        completionReason: "Retake (Reward only on first completed attempt)",
        isAccuracyEligible: false,
        minAttemptRequired: Math.ceil(r.total_questions * 0.5),
        accuracyPercentage: Number(r.accuracy_percentage || 0),
        accuracyBonusCoins: 0,
        accuracyReason: "Retake (No additional accuracy bonus)",
        streakCoins: 0,
        streakReason: "Retake",
        currentStreak: 1,
        totalCoinsEarned: 0,
      };
    } else if (eventData && (eventData as any).metadata) {
      const meta = (eventData as any).metadata;
      rewards = {
        isRetake: false,
        completionCoins: meta.completion_coins ?? 10,
        completionReason: meta.completion_reason ?? "Test Completed",
        isAccuracyEligible: meta.is_accuracy_eligible ?? (r.attempted_count >= Math.ceil(r.total_questions * 0.5)),
        minAttemptRequired: meta.min_attempt_required ?? Math.ceil(r.total_questions * 0.5),
        accuracyPercentage: meta.accuracy_percentage ?? Number(r.accuracy_percentage || 0),
        accuracyBonusCoins: meta.accuracy_bonus_coins ?? 0,
        accuracyReason: meta.accuracy_reason ?? "Accuracy Evaluated",
        streakCoins: meta.streak_coins ?? 0,
        streakReason: meta.streak_reason ?? "Consistency Streak",
        currentStreak: meta.current_streak ?? 1,
        badgeUnlocked: meta.badge_unlocked || null,
        totalCoinsEarned: Number((eventData as any).actual_coins_awarded || 0),
      };
    } else {
      // IF EVENT IS NOT FOUND: Attempt server-authoritative reconciliation ONCE via GamificationService
      const canonicalType = (mt as any)?.mock_templates?.test_type || "sectional";
      const awarded = await GamificationService.awardMockCompletionReward({
        userId: candidateUserId,
        attemptId: resolvedAttemptId,
        testId: mt.id,
        canonicalTestType: canonicalType,
        totalQuestions: r.total_questions,
        attemptedCount: r.attempted_count,
        correctCount: r.correct_count,
        incorrectCount: r.incorrect_count,
        unansweredCount: r.unanswered_count,
        timeSpentSeconds: r.time_spent_seconds,
      });

      if (awarded.isRewardEligible && awarded.totalCoinsEarned > 0) {
        rewards = {
          isRetake: false,
          completionCoins: awarded.completionCoins,
          completionReason: awarded.completionReason,
          isAccuracyEligible: awarded.isAccuracyEligible,
          minAttemptRequired: awarded.minAttemptRequired,
          accuracyPercentage: awarded.accuracyPercentage,
          accuracyBonusCoins: awarded.accuracyBonusCoins,
          accuracyReason: awarded.accuracyReason,
          streakCoins: awarded.streakCoins,
          streakReason: awarded.streakReason,
          currentStreak: awarded.currentStreak,
          badgeUnlocked: awarded.badgeUnlocked,
          totalCoinsEarned: awarded.totalCoinsEarned,
        };
      } else {
        // If reward failed or is not eligible, accurately show 0 coins earned — NEVER LIE
        rewards = {
          isRetake: awarded.isRetake,
          completionCoins: 0,
          completionReason: awarded.completionReason || "Reward verification pending",
          isAccuracyEligible: false,
          minAttemptRequired: Math.ceil(r.total_questions * 0.5),
          accuracyPercentage: Number(r.accuracy_percentage || 0),
          accuracyBonusCoins: 0,
          accuracyReason: "Reward verification pending",
          streakCoins: 0,
          streakReason: "Daily Activity",
          currentStreak: 1,
          totalCoinsEarned: 0,
        };
      }
    }

    return {
      result: {
        id: r.id,
        attemptId: r.attempt_id,
        totalQuestions: r.total_questions,
        attemptedCount: r.attempted_count,
        correctCount: r.correct_count,
        incorrectCount: r.incorrect_count,
        unansweredCount: r.unanswered_count,
        totalScore: Number(r.total_score),
        maxScore: Number(r.max_score),
        accuracyPercentage: Number(r.accuracy_percentage),
        timeSpentSeconds: totalSeconds,
        rank: standing?.rank ?? null,
        percentile: standing?.percentile ?? null,
      },
      test: {
        id: mt.id,
        title: mt.title,
        durationMinutes: mt.duration_minutes,
        totalQuestions: mt.total_questions || r.total_questions,
        totalMarks: Number(mt.total_marks || r.max_score),
      },
      standing,
      security: {
        candidateId: candidateUserId,
        maskedId,
        attemptIdShort,
        examTitle: mt.title,
        timestamp: formattedTimestamp,
      },
      rewards,
      insights: {
        strongestSection,
        weakestSection,
        accuracyLevel,
        speedSecondsPerQuestion,
        reviewCount: r.incorrect_count,
      },
      analysis: {
        negativeMarksLost: negativeMarksLost(reviewQuestions),
        takeaways,
        trend,
        examSlug,
        memoryLockEnabled: isMemoryLockEnabled(),
      },
      sections,
      reviewQuestions,
    };
  }

  /**
   * F4 (R12): standing among REAL students; test / QA accounts (reserved .test domain) never count. The account
   * lookup runs only when the cohort could reach RANK_MIN_COHORT; if it fails, the standing is omitted (fail closed).
   */
  private static async realCohortStanding(adminSb: SupabaseClient<Database>, rows: CohortRow[], viewerId: string, score: number): Promise<Standing | null> {
    const users = new Set(rows.map((r) => r.userId));
    if (users.size < RANK_MIN_COHORT) return null;
    const flags = await AssessmentService.accountFlags(adminSb);
    if (!flags) return null;
    return cohortStanding(rows.map((r) => ({ ...r, isTestAccount: flags.get(r.userId)?.isTest ?? false })), viewerId, score);
  }

  /**
   * Per account: test account (reserved .test domain); the leaderboard opt-in is read separately (leaderboardOptIns). null when the
   * accounts cannot all be read — callers then omit rank data (fail closed).
   */
  private static async accountFlags(adminSb: SupabaseClient<Database>): Promise<Map<string, { isTest: boolean }> | null> {
    const out = new Map<string, { isTest: boolean }>();
    try {
      for (let page = 1; ; page++) {
        if (page > 20) return null; // more accounts than we check: omit rather than guess
        const { data, error } = await adminSb.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return null;
        for (const u of data.users) out.set(u.id, { isTest: isTestAccountEmail(u.email) }); // user_metadata is never read (#60)
        if (data.users.length < 1000) break;
      }
    } catch {
      return null;
    }
    return out;
  }

  /** F4: this user's scored attempts of mocks of the same exam (abandoned attempts excluded) as trend points. */
  private static async examTrend(adminSb: SupabaseClient<Database>, userId: string, examId: string, currentAttemptId: string): Promise<TrendPoint[] | null> {
    const { data: mocks } = await adminSb.from("mock_tests").select("id, title, mock_templates!inner(exam_id)").eq("mock_templates.exam_id", examId).limit(500);
    const titles = new Map((mocks ?? []).map((m) => [m.id, m.title]));
    if (titles.size === 0) return null;
    const { data: results } = await adminSb
      .from("test_results")
      .select("attempt_id, mock_test_id, total_score, max_score, accuracy_percentage, created_at")
      .eq("user_id", userId)
      .in("mock_test_id", [...titles.keys()])
      .order("created_at", { ascending: true })
      .limit(200);
    const rows = results ?? [];
    if (rows.length < 2) return null;
    const { data: attempts } = await adminSb.from("test_attempts").select("id, status, submitted_at").in("id", rows.map((x) => x.attempt_id));
    const att = new Map((attempts ?? []).map((a) => [a.id, a]));
    return buildTrend(
      rows.map((x) => ({
        attemptId: x.attempt_id,
        status: att.get(x.attempt_id)?.status ?? "abandoned", // unknown attempt: never shown
        mockTitle: titles.get(x.mock_test_id) ?? "Mock test",
        submittedAt: String(att.get(x.attempt_id)?.submitted_at ?? x.created_at ?? ""),
        score: Number(x.total_score),
        maxScore: Number(x.max_score),
        accuracy: Number(x.accuracy_percentage),
      })),
      currentAttemptId,
    );
  }

  /**
   * Leaderboard opt-ins — ONLY from user_profiles.leaderboard_opt_in (migration 096, written by fn_set_leaderboard_opt_in;
   * under-18 cannot opt in; a CHECK also requires the 18+ confirmation). Never auth user_metadata (#60).
   */
  private static async leaderboardOptIns(): Promise<Set<string>> {
    const { data } = await createAdminServerSupabaseClient()
      .from("user_profiles")
      .select("id")
      .eq("leaderboard_opt_in", true)
      .not("adult_confirmed_at", "is", null)
      .limit(10000);
    return new Set((data ?? []).map((r) => r.id));
  }

  /**
   * LEADERBOARD-GATE-1 (R12): ranks only when >= RANK_MIN_COHORT real students (test accounts excluded) have a scored
   * first attempt of this mock; public rows only for students who opted in (masked names); the viewer sees their own
   * rank privately. Fewer students, or accounts that cannot be read: "not_enough" — no ranks, no counts.
   */
  static async getTestLeaderboard(testId: string, currentUserId?: string | null, viewerOptedIn: boolean | null = null): Promise<TestLeaderboardData | null> {
    const adminSb = createAdminServerSupabaseClient();
    const { data: testData } = await adminSb.from("mock_tests").select("id, title, duration_minutes, total_questions, total_marks").eq("id", testId).maybeSingle();
    if (!testData) return null;
    const test = {
      id: testData.id,
      title: testData.title,
      durationMinutes: testData.duration_minutes,
      totalMarks: Number(testData.total_marks || 0),
      totalQuestions: testData.total_questions || 0,
    };
    const notEnough: TestLeaderboardData = { test, view: { state: "not_enough" }, viewerOptedIn };

    const { data: resultsData } = await adminSb
      .from("test_results")
      .select("user_id, total_score, max_score, accuracy_percentage, time_spent_seconds, created_at")
      .eq("mock_test_id", testId)
      .order("created_at", { ascending: true });
    const results = resultsData ?? [];
    if (new Set(results.map((r) => r.user_id)).size < RANK_MIN_COHORT) return notEnough;
    const flags = await AssessmentService.accountFlags(adminSb);
    if (!flags) return notEnough;
    const optIns = await AssessmentService.leaderboardOptIns();

    const maxScore = new Map(results.map((r) => [r.user_id, Number(r.max_score)]));
    const view = leaderboardView(
      results.map((r) => ({
        userId: r.user_id,
        score: Number(r.total_score),
        accuracy: Number(r.accuracy_percentage),
        timeSeconds: Number(r.time_spent_seconds),
        createdAt: String(r.created_at ?? ""),
        isTestAccount: flags.get(r.user_id)?.isTest ?? false,
        optedIn: optIns.has(r.user_id),
      })),
      currentUserId ?? null,
    );
    if (view.state === "not_enough") return notEnough;

    const ids = [...new Set([...view.entries.map((e) => e.userId), ...(view.viewer ? [view.viewer.userId] : [])])];
    const { data: profs } = ids.length ? await adminSb.from("user_profiles").select("id, full_name").in("id", ids) : { data: [] as Array<{ id: string; full_name: string | null }> };
    const names = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
    const item = (e: LeaderboardEntry): TestLeaderboardItem => {
      const isCurrentUser = Boolean(currentUserId && e.userId === currentUserId);
      return {
        rank: e.rank,
        displayName: isCurrentUser ? "You" : AssessmentService.maskCandidateName(names.get(e.userId) || "Candidate"),
        score: e.score,
        maxScore: maxScore.get(e.userId) ?? test.totalMarks,
        accuracyPercentage: e.accuracy,
        timeSpentSeconds: e.timeSeconds,
        isCurrentUser,
      };
    };
    return {
      test,
      view: { state: "ranked", n: view.n, entries: view.entries.map(item), viewer: view.viewer ? { ...item(view.viewer), optedIn: view.viewer.optedIn } : null },
      viewerOptedIn,
    };
  }

}