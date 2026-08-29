import { createServerSupabaseClient, createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { GamificationService } from "@/services/gamification.service";

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
  userAttemptStatus: "not_started" | "in_progress" | "completed";
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
  status: "available" | "in_progress" | "completed" | "upcoming" | "expired" | "limit_reached";
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
  user: {
    id: string;
    email?: string;
    fullName?: string;
  } | null;
  activeExamGoals: MockDashboardExamGoal[];
  allExams: Array<{ id: string; title: string; slug: string; category?: string }>;
  selectedExamSlug: string;
  nextMockAction: {
    type: "resume" | "start_today" | "view_result" | "browse_full" | "none";
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
}

export interface TestLeaderboardItem {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  score: number;
  maxScore: number;
  accuracyPercentage: number;
  timeSpentSeconds: number;
  submittedAt: string;
  isCurrentUser: boolean;
}

export interface TestStandingInfo {
  rank: number;
  totalParticipants: number;
  percentile: number;
  candidateScore: number;
  averageScore: number;
  topScore: number;
}

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
  standing: TestStandingInfo;
  security: TestCandidateSecurityInfo;
  rewards: TestRewardSummary;
  insights: {
    strongestSection?: string | null;
    weakestSection?: string | null;
    accuracyLevel: string;
    speedSecondsPerQuestion: number;
    reviewCount: number;
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
  }>;
  reviewQuestions: Array<{
    mockQuestionId: string;
    questionOrder: number;
    sectionName: string;
    questionText: string;
    questionImageUrl?: string | null;
    optionsType?: string;
    options: Array<{ key: string; text: string; imageUrl?: string | null }>;
    selectedOption: string | null;
    correctOption: string;
    isCorrect: boolean;
    marksAwarded: number;
    explanation: string | null;
    topicName: string | null;
    topicSlug: string | null;
  }>;
}

export interface TestLeaderboardData {
  test: {
    id: string;
    title: string;
    durationMinutes: number;
    totalMarks: number;
    totalQuestions: number;
  };
  userStanding?: TestLeaderboardItem | null;
  topScore: number;
  averageScore: number;
  totalParticipants: number;
  podium: TestLeaderboardItem[];
  leaderboard: TestLeaderboardItem[];
}

export class AssessmentService {
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
      supabase.from("subjects").select("id, name, code").order("name"),
    ]);

    const mockTests: any[] = [];
    const templates = (mockTemplatesRes.data as any[]) || [];

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

    const subjects = (subjectsRes.data as any[]) || [];

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
        code: s.code,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

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
        .select("id, title, slug, test_type, is_active, description, pattern_id, mock_tests(id, slug, duration_minutes, total_questions, total_marks, status)")
        .eq("exam_id", selectedCategory.id),
      sb.from("exam_patterns")
        .select("id, name, duration_minutes, total_questions, total_marks, negative_mark_value"),
    ]);

    const allPublishedTests = (mockTestsRes.data as any[]) || [];
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

    const templates = (templatesRes.data as any[]) || [];
    const patterns = (patternsRes.data as any[]) || [];

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
      let userAttemptStatus: "not_started" | "in_progress" | "completed" = "not_started";
      let completedScore: number | undefined;
      let completedAccuracy: number | undefined;
      let attemptId: string | undefined;

      if (userId && testInstance?.id) {
        const todayStart = new Date(istDate);
        todayStart.setHours(0, 0, 0, 0);

        const { data: userAttempts } = await sb
          .from("test_attempts")
          .select("id, status, started_at, test_results(score, accuracy_percentage)")
          .eq("mock_test_id", testInstance.id)
          .eq("user_id", userId)
          .gte("started_at", todayStart.toISOString())
          .order("started_at", { ascending: false })
        .limit(1);

        if (userAttempts && userAttempts.length > 0) {
          const att = userAttempts[0];
          attemptId = att.id;
          const isDone = att.status === "completed" || att.status === "submitted" || att.status === "evaluated" || att.submitted_at !== null;
          if (isDone) {
            userAttemptStatus = "completed";
            completedScore = att.test_results?.[0]?.total_score ?? att.test_results?.[0]?.score;
            completedAccuracy = att.test_results?.[0]?.accuracy_percentage;
          } else {
            const dur = testInstance?.duration_minutes || meta.durationMinutes || 25;
            const elapsedSec = (Date.now() - new Date(att.started_at).getTime()) / 1000;
            if (elapsedSec > dur * 60) {
              userAttemptStatus = "completed";
            } else {
              userAttemptStatus = "in_progress";
            }
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
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    // 1. Fetch user (if not provided)
    let userObj: { id: string; email?: string; fullName?: string } | null = null;
    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        resolvedUserId = authData.user.id;
        userObj = {
          id: authData.user.id,
          email: authData.user.email,
          fullName: authData.user.user_metadata?.full_name || authData.user.email?.split("@")[0] || "Aspirant",
        };
      }
    } else {
      const { data: profile } = await sb.from("user_profiles").select("full_name").eq("id", resolvedUserId).maybeSingle();
      userObj = {
        id: resolvedUserId,
        fullName: profile?.full_name || "Aspirant",
      };
    }

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

    const allExams = (allExamsRes.data as any[]) || [];
    const rawUserGoals = (userGoalsRes.data as any[]) || [];
    const templates = (templatesRes.data as any[]) || [];
    const publishedTests = (publishedTestsRes.data as any[]) || [];
    const patterns = (patternsRes.data as any[]) || [];
    const attempts = (attemptsRes.data as any[]) || [];
    const streakRecord = streaksRes.data as any;
    const walletRecord = walletRes.data as any;
    const allBadges = (badgesRes.data as any[]) || [];
    const userBadges = (userBadgesRes.data as any[]) || [];

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
    let resumableMock: MockDashboardResumableMock | undefined;
    const inProgressAttempt = attempts.find((a: any) => {
      if (a.status !== "in_progress" || a.submitted_at !== null) return false;
      const dur = a.mock_tests?.duration_minutes || 25;
      const elapsedSec = (Date.now() - new Date(a.started_at).getTime()) / 1000;
      return elapsedSec <= dur * 60;
    });

    if (inProgressAttempt) {
      const mt = inProgressAttempt.mock_tests;
      const examTitle = mt?.mock_templates?.exams?.title || "Exam";
      const examSlug = mt?.mock_templates?.exams?.slug || "exam";
      const answeredCount = inProgressAttempt.test_results?.[0]?.attempted_count || 0;
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

        // Check if user attempted today
        let itemStatus: MockDashboardTodayItem["status"] = isOpen ? "available" : "upcoming";
        let attemptId: string | undefined;
        let completedScore: number | undefined;
        let completedAccuracy: number | undefined;

        if (testInstance?.id) {
          const userTodayAttempt = attempts.find((a: any) =>
            a.mock_test_id === testInstance.id
          );

          if (userTodayAttempt) {
            attemptId = userTodayAttempt.id;
            const isDone = userTodayAttempt.status === "completed" || userTodayAttempt.status === "submitted" || userTodayAttempt.status === "evaluated" || userTodayAttempt.submitted_at !== null;
            if (isDone) {
              itemStatus = "completed";
              const tr = Array.isArray(userTodayAttempt.test_results)
                ? userTodayAttempt.test_results[0]
                : userTodayAttempt.test_results;
              if (tr && (tr.total_score !== undefined || tr.score !== undefined)) {
                completedScore = Number(tr.total_score ?? tr.score);
                completedAccuracy = tr.accuracy_percentage !== undefined ? Number(tr.accuracy_percentage) : undefined;
              }
            } else {
              const dur = testInstance?.duration_minutes || meta.durationMinutes || 25;
              const elapsedSec = (Date.now() - new Date(userTodayAttempt.started_at).getTime()) / 1000;
              if (elapsedSec > dur * 60) {
                itemStatus = "completed";
              } else {
                itemStatus = "in_progress";
              }
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

    // Direct authoritative fetch fallback for any completed todayMock with missing result
    for (const m of todayMocks) {
      if (m.status === "completed" && m.completedScore === undefined && m.attemptId) {
        const adminSb = createAdminServerSupabaseClient();
        const { data: directRes } = await (adminSb as any)
          .from("test_results")
          .select("total_score, accuracy_percentage")
          .eq("attempt_id", m.attemptId)
          .maybeSingle();

        if (directRes && directRes.total_score !== undefined && directRes.total_score !== null) {
          m.completedScore = Number(directRes.total_score);
          m.completedAccuracy = directRes.accuracy_percentage !== undefined ? Number(directRes.accuracy_percentage) : undefined;
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
      const eAccSum = examAttempts.reduce((acc: number, a: any) => acc + Number(a.test_results[0]?.accuracy_percentage || 0), 0);
      const eBest = examAttempts.reduce((b: number, a: any) => {
        const s = Number(a.test_results[0]?.total_score ?? a.test_results[0]?.score ?? 0);
        return s > b ? s : b;
      }, 0);
      const eQs = examAttempts.reduce((acc: number, a: any) => acc + (a.test_results[0]?.attempted_count || 0), 0);

      return {
        examId,
        examTitle: exam.title,
        examSlug: exam.slug,
        totalMocksAttempted: eCount,
        averageAccuracy: eCount > 0 ? Math.round(eAccSum / eCount) : 0,
        bestScore: eBest,
        maxScore: 200,
        questionsSolved: eQs,
        recentScore: examAttempts[0] ? Number(examAttempts[0].test_results[0]?.total_score ?? examAttempts[0].test_results[0]?.score ?? 0) : undefined,
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

    if (resumableMock) {
      nextMockAction = { type: "resume", resumable: resumableMock };
    } else {
      const activeTodayMock = todayMocks.find((m) => m.status === "available");
      const completedTodayMock = todayMocks.find((m) => m.status === "completed");

      if (activeTodayMock) {
        nextMockAction = { type: "start_today", todayMock: activeTodayMock };
      } else if (completedTodayMock) {
        nextMockAction = { type: "view_result", todayMock: completedTodayMock };
      } else if (fullMockTests.length > 0) {
        nextMockAction = { type: "browse_full" };
      }
    }

    return {
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
        .select("id, canonical_topic_id, topics(subject_id), question_versions(id, version_number, question_text)")
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

    const t = testRes.data as any;
    if (!t) return null;

    const sections = (sectionsRes.data as any[]) || [];

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
  static async startOrResumeAttempt(testId: string): Promise<ActiveAttemptSession | null> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

    // Non-retakeable weekly examination cycle enforcement:
    // Every test in the 7-day program has exactly one attempt per student.
    const { data: alreadyCompleted } = await supabase
      .from("test_attempts")
      .select("id, status, started_at")
      .eq("mock_test_id", testId)
      .eq("user_id", user.id)
      .in("status", ["submitted", "completed", "evaluated"])
      .maybeSingle();

    if (alreadyCompleted) {
      // Retake does not exist — test already completed
      return null;
    }

    // Check for existing in_progress attempt
    const { data: existingAttempt } = await supabase
      .from("test_attempts")
      .select("id, started_at, status")
      .eq("mock_test_id", testId)
      .eq("user_id", user.id)
      .eq("status", "in_progress")
      .maybeSingle();

    let attempt = existingAttempt as any;

    if (!attempt) {
      const { data: newAttempt, error } = await supabase
        .from("test_attempts")
        .insert({
          mock_test_id: testId,
          user_id: user.id,
          status: "in_progress",
          started_at: new Date().toISOString(),
        } as any)
        .select("id, started_at")
        .single();

      if (error || !newAttempt) return null;
      attempt = newAttempt as any;
    }

    // Ensure mock questions and sections exist
    await AssessmentService.ensureMockTestQuestions(testId);

    const adminSb = createAdminServerSupabaseClient();

    // Fetch test details, sections, and questions with options
    const [testRes, sectionsRes, questionsRes, answersRes] = await Promise.all([
      adminSb.from("mock_tests").select("id, title, duration_minutes").eq("id", testId).single(),
      adminSb.from("mock_sections").select("id, section_name, section_order").eq("mock_test_id", testId).order("section_order"),
      adminSb.from("mock_questions").select("id, question_order, mock_section_id, marks, negative_mark, question_versions(id, question_text, question_image_url, options_type, question_options(id, option_key, option_text, option_image_url, order_index))").eq("mock_test_id", testId).order("question_order"),
      adminSb.from("attempt_answers").select("mock_question_id, selected_option_key, is_marked_for_review, time_spent_seconds").eq("attempt_id", attempt.id),
    ]);

    const testData = testRes.data as any;
    if (!testData) return null;

    const savedAnswers = (answersRes.data as any[]) || [];
    const savedAnswersMap = new Map<string, { selectedOption: string | null; isMarkedForReview: boolean; timeSpentSeconds: number }>();
    savedAnswers.forEach((a) => {
      savedAnswersMap.set(a.mock_question_id, {
        selectedOption: a.selected_option_key,
        isMarkedForReview: a.is_marked_for_review,
        timeSpentSeconds: a.time_spent_seconds,
      });
    });

    const sectionsData = (sectionsRes.data as any[]) || [];
    const sectionsMap = new Map<string, string>();
    sectionsData.forEach((s) => {
      sectionsMap.set(s.id, s.section_name);
    });

    const rawQuestions = (questionsRes.data as any[]) || [];
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

    // If attempt has already expired in the background, auto-finalize it
    if (remainingSeconds <= 0) {
      await AssessmentService.submitTestAttempt(attempt.id);
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
    };
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
  ): Promise<boolean> {
    const supabase = await createServerSupabaseClient();

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

    return !error;
  }

  /**
   * Evaluates attempt against authoritative answer keys, populates test_results,
   * section_results, awards Phase 3D coins, logs Phase 3C activity, and logs Phase 3O mistakes.
   */
  static async submitTestAttempt(attemptId: string): Promise<{ success: boolean; resultId?: string; error?: string }> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const { data: attemptData } = await supabase
      .from("test_attempts")
      .select("id, mock_test_id, user_id, started_at, status")
      .eq("id", attemptId)
      .eq("user_id", user.id)
      .maybeSingle();

    const attempt = attemptData as any;
    if (!attempt) {
      return { success: false, error: "Attempt not found." };
    }

    const adminSb = createAdminServerSupabaseClient();

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

    // Fetch test, sections, questions with answer keys, and student answers
    const [testRes, sectionsRes, questionsRes, answersRes] = await Promise.all([
      adminSb.from("mock_tests").select("id, total_questions, total_marks, mock_templates(id, title, test_type)").eq("id", attempt.mock_test_id).single(),
      adminSb.from("mock_sections").select("id, marks_per_question, negative_mark").eq("mock_test_id", attempt.mock_test_id),
      adminSb.from("mock_questions").select("id, mock_section_id, question_version_id, marks, negative_mark, question_versions(question_id, question_answers(correct_option_key))").eq("mock_test_id", attempt.mock_test_id),
      adminSb.from("attempt_answers").select("id, mock_question_id, selected_option_key, time_spent_seconds").eq("attempt_id", attemptId),
    ]);

    const testData = testRes.data as any;
    if (!testData) return { success: false, error: "Test metadata missing" };

    const answersList = (answersRes.data as any[]) || [];
    const answersMap = new Map<string, any>();
    answersList.forEach((a) => {
      answersMap.set(a.mock_question_id, a);
    });

    let totalScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let attemptedCount = 0;
    let totalTimeSpent = 0;

    const sectionsList = (sectionsRes.data as any[]) || [];
    const sectionMetrics = new Map<string, { total: number; attempted: number; correct: number; incorrect: number; score: number; maxScore: number; time: number }>();
    sectionsList.forEach((s) => {
      sectionMetrics.set(s.id, { total: 0, attempted: 0, correct: 0, incorrect: 0, score: 0, maxScore: 0, time: 0 });
    });

    const evaluatedAnswers: Array<{ id: string; is_correct: boolean; evaluated_marks: number }> = [];
    const questionsList = (questionsRes.data as any[]) || [];

    questionsList.forEach((mq) => {
      const sec = sectionMetrics.get(mq.mock_section_id);
      const marks = Number(mq.marks);
      const negMark = Number(mq.negative_mark);

      if (sec) {
        sec.total += 1;
        sec.maxScore += marks;
      }

      const ans = answersMap.get(mq.id);
      const qa = Array.isArray(mq.question_versions?.question_answers)
        ? mq.question_versions?.question_answers[0]
        : mq.question_versions?.question_answers;
      const correctOptionKey = qa?.correct_option_key;

      if (ans && ans.selected_option_key) {
        attemptedCount += 1;
        totalTimeSpent += (ans.time_spent_seconds || 0);
        if (sec) sec.attempted += 1;

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
        }
      }
    });

    const unansweredCount = testData.total_questions - attemptedCount;
    const accuracy = attemptedCount > 0 ? (correctCount / attemptedCount) * 100 : 0;

    try {
      // 1. Update attempt answers evaluation using adminSb
      for (const ea of evaluatedAnswers) {
        await (adminSb.from("attempt_answers") as any).update({ is_correct: ea.is_correct, evaluated_marks: ea.evaluated_marks }).eq("id", ea.id);
      }

      // 2. Insert test_results using adminSb
      const { data: testResultData, error: resultErr } = await adminSb
        .from("test_results")
        .insert({
          attempt_id: attemptId,
          user_id: user.id,
          mock_test_id: attempt.mock_test_id,
          total_questions: testData.total_questions,
          attempted_count: attemptedCount,
          correct_count: correctCount,
          incorrect_count: incorrectCount,
          unanswered_count: unansweredCount,
          total_score: totalScore,
          max_score: Number(testData.total_marks),
          accuracy_percentage: Math.round(accuracy * 100) / 100,
          time_spent_seconds: totalTimeSpent,
        } as any)
        .select("id")
        .single();

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

      // 4. Mark attempt as submitted using adminSb
      await (adminSb.from("test_attempts") as any).update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
        time_taken_seconds: totalTimeSpent,
      } as any).eq("id", attemptId);

      // 5. Award Server-Authoritative CL Coins via GamificationService
      const canonicalTestType = (testData.mock_templates as any)?.test_type || "sectional";
      await GamificationService.awardMockCompletionReward({
        userId: user.id,
        attemptId,
        testId: attempt.mock_test_id,
        canonicalTestType,
        totalQuestions: testData.total_questions,
        attemptedCount,
        correctCount,
        incorrectCount,
        unansweredCount,
        timeSpentSeconds: totalTimeSpent,
      }).catch((e) => console.error("[submitTestAttempt] Gamification reward notice:", e));

      // 6. Invalidate dashboard and test cache paths
      try {
        revalidatePath("/mock-tests");
        revalidatePath("/dashboard");
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
   * Fetches test results and question-by-question review with solutions, dynamic standing, and performance insights.
   */
  static async getTestResult(attemptId: string): Promise<TestResultSummary | null> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    const sb = supabase as any;

    let resolvedAttemptId = attemptId;
    let [resultRes, attemptRes] = await Promise.all([
      sb.from("test_results").select("*").eq("attempt_id", resolvedAttemptId).maybeSingle(),
      sb.from("test_attempts").select("id, mock_test_id, user_id, started_at, submitted_at, mock_tests(id, title, duration_minutes, total_questions, total_marks)").eq("id", resolvedAttemptId).maybeSingle(),
    ]);

    // Fallback 1: If not found by attempt_id, check if attemptId is actually a test_results.id
    if (!resultRes?.data && !attemptRes?.data) {
      const { data: resById } = await sb.from("test_results").select("*").eq("id", attemptId).maybeSingle();
      if (resById) {
        resolvedAttemptId = (resById as any).attempt_id;
        [resultRes, attemptRes] = await Promise.all([
          Promise.resolve({ data: resById }),
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
        resolvedAttemptId = (latestAttempt as any).id;
        [resultRes, attemptRes] = await Promise.all([
          sb.from("test_results").select("*").eq("attempt_id", resolvedAttemptId).maybeSingle(),
          sb.from("test_attempts").select("id, mock_test_id, user_id, started_at, submitted_at, mock_tests(id, title, duration_minutes, total_questions, total_marks)").eq("id", resolvedAttemptId).maybeSingle(),
        ]);
      }
    }

    const r = resultRes?.data as any;
    const attemptData = attemptRes?.data as any;

    if (!r || !attemptData || !attemptData.mock_tests) return null;
    const mt = attemptData.mock_tests;

    const adminSb = createAdminServerSupabaseClient();

    // Fetch section results, questions with answers & topics, user answers, and standing across same mock test
    const [sectionsRes, questionsRes, answersRes, allTestResultsRes] = await Promise.all([
      adminSb.from("section_results").select("*, mock_sections(id, section_name)").eq("test_result_id", r.id),
      adminSb.from("mock_questions").select("id, question_order, mock_section_id, marks, negative_mark, mock_sections(id, section_name), question_versions(id, question_text, question_image_url, options_type, question_options(id, option_key, option_text, option_image_url, order_index), question_answers(correct_option_key, explanation_md), questions(canonical_topic_id, topics(name, slug)))").eq("mock_test_id", mt.id).order("question_order"),
      adminSb.from("attempt_answers").select("mock_question_id, selected_option_key, is_correct, evaluated_marks").eq("attempt_id", resolvedAttemptId),
      adminSb.from("test_results").select("id, user_id, total_score, max_score, accuracy_percentage, time_spent_seconds, created_at").eq("mock_test_id", mt.id).order("total_score", { ascending: false }).order("accuracy_percentage", { ascending: false }).order("time_spent_seconds", { ascending: true }),
    ]);

    const answersList = (answersRes.data as any[]) || [];
    const answersMap = new Map<string, any>();
    answersList.forEach((a) => {
      answersMap.set(a.mock_question_id, a);
    });

    const rawSections = (sectionsRes.data as any[]) || [];
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
    }));

    const rawQuestions = (questionsRes.data as any[]) || [];
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
      const correctOption = qa?.correct_option_key || "A";
      const explanation = qa?.explanation_md || null;

      return {
        mockQuestionId: mq.id,
        questionOrder: mq.question_order,
        sectionName: mq.mock_sections?.section_name || "General",
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
        topicSlug: qv?.questions?.topics?.slug || null,
      };
    });

    // Compute Dynamic Standing & Percentile
    const allResults = (allTestResultsRes.data as any[]) || [];
    const bestUserAttempts = new Map<string, any>();
    allResults.forEach((tr) => {
      if (!bestUserAttempts.has(tr.user_id)) {
        bestUserAttempts.set(tr.user_id, tr);
      }
    });

    const rankedCandidates = Array.from(bestUserAttempts.values());
    const totalParticipants = Math.max(1, rankedCandidates.length);
    const topScore = rankedCandidates.length > 0 ? Number(rankedCandidates[0].total_score) : Number(r.total_score);
    const totalSum = rankedCandidates.reduce((acc, c) => acc + Number(c.total_score), 0);
    const averageScore = Math.round((totalSum / totalParticipants) * 10) / 10;

    // Find candidate's rank
    const candidateUserId = attemptData.user_id;
    let candidateRank = rankedCandidates.findIndex((c) => c.user_id === candidateUserId) + 1;
    if (candidateRank <= 0) candidateRank = 1;

    // Percentile = ((Total - Rank) / (Total - 1)) * 100
    const percentile = totalParticipants > 1
      ? Math.round(((totalParticipants - candidateRank) / (totalParticipants - 1)) * 1000) / 10
      : 100.0;

    // Identify strongest / weakest sections
    const sortedSections = [...sections].sort((a, b) => b.accuracyPercentage - a.accuracyPercentage);
    const strongestSection = sortedSections.length > 0 ? sortedSections[0].sectionName : null;
    const weakestSection = sortedSections.length > 1 ? sortedSections[sortedSections.length - 1].sectionName : null;

    const totalSeconds = Number(r.time_spent_seconds || 0);
    const speedSecondsPerQuestion = r.attempted_count > 0 ? Math.round(totalSeconds / r.attempted_count) : 0;

    const accuracyLevel =
      r.accuracy_percentage >= 85
        ? "Excellent Accuracy"
        : r.accuracy_percentage >= 70
        ? "Good Accuracy"
        : r.accuracy_percentage >= 50
        ? "Moderate Accuracy"
        : "Needs Improvement";

    const candidateIdShort = (candidateUserId || "CANDIDATE").slice(0, 4).toUpperCase();
    const maskedId = `CL••••${candidateIdShort}`;
    const attemptIdShort = attemptId.slice(0, 6).toUpperCase();
    const formattedTimestamp = new Date(attemptData.submitted_at || Date.now()).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

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
      .or(`idempotency_key.eq.mock_reward_${mt.id}_${candidateUserId},idempotency_key.eq.mock_eval_${resolvedAttemptId}_${candidateUserId}`)
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
        timeSpentSeconds: r.time_spent_seconds,
        rank: candidateRank,
        percentile,
      },
      test: {
        id: mt.id,
        title: mt.title,
        durationMinutes: mt.duration_minutes,
        totalQuestions: mt.total_questions || r.total_questions,
        totalMarks: Number(mt.total_marks || r.max_score),
      },
      standing: {
        rank: candidateRank,
        totalParticipants,
        percentile,
        candidateScore: Number(r.total_score),
        averageScore,
        topScore,
      },
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
      sections,
      reviewQuestions,
    };
  }

  /**
   * Fetches official assessment leaderboard for a specific mock test with masked privacy protection.
   */
  static async getTestLeaderboard(testId: string, currentUserId?: string | null): Promise<TestLeaderboardData | null> {
    const adminSb = createAdminServerSupabaseClient();

    // 1. Fetch test details
    const { data: testData } = await adminSb
      .from("mock_tests")
      .select("id, title, duration_minutes, total_questions, total_marks")
      .eq("id", testId)
      .maybeSingle();

    if (!testData) return null;

    // 2. Fetch all submitted results for this test
    const { data: resultsData } = await adminSb
      .from("test_results")
      .select("id, user_id, total_score, max_score, accuracy_percentage, time_spent_seconds, created_at")
      .eq("mock_test_id", testId)
      .order("total_score", { ascending: false })
      .order("accuracy_percentage", { ascending: false })
      .order("time_spent_seconds", { ascending: true })
      .order("created_at", { ascending: true });

    const allResults = (resultsData as any[]) || [];

    // 3. Deduplicate best attempt per user
    const bestUserAttempts = new Map<string, any>();
    allResults.forEach((tr) => {
      if (!bestUserAttempts.has(tr.user_id)) {
        bestUserAttempts.set(tr.user_id, tr);
      }
    });

    const rankedCandidates = Array.from(bestUserAttempts.values());
    const totalParticipants = Math.max(1, rankedCandidates.length);
    const topScore = rankedCandidates.length > 0 ? Number(rankedCandidates[0].total_score) : 0;
    const totalSum = rankedCandidates.reduce((acc, c) => acc + Number(c.total_score), 0);
    const averageScore = Math.round((totalSum / totalParticipants) * 10) / 10;

    // 4. Fetch profiles for masked names and avatars
    const userIds = rankedCandidates.map((c) => c.user_id);
    const profilesMap = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: profs } = await adminSb
        .from("user_profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);

      (profs || []).forEach((p) => profilesMap.set(p.id, p));
    }

    const leaderboard: TestLeaderboardItem[] = rankedCandidates.map((c, idx) => {
      const prof = profilesMap.get(c.user_id);
      const isCurrentUser = Boolean(currentUserId && c.user_id === currentUserId);
      const displayName = isCurrentUser
        ? (prof?.full_name ? `${prof.full_name} (You)` : "You")
        : AssessmentService.maskCandidateName(prof?.full_name || `Candidate #${c.user_id.slice(0, 4).toUpperCase()}`);

      return {
        rank: idx + 1,
        userId: c.user_id,
        displayName,
        avatarUrl: prof?.avatar_url || null,
        score: Number(c.total_score),
        maxScore: Number(c.max_score),
        accuracyPercentage: Number(c.accuracy_percentage),
        timeSpentSeconds: Number(c.time_spent_seconds),
        submittedAt: c.created_at,
        isCurrentUser,
      };
    });

    const userStanding = currentUserId ? leaderboard.find((l) => l.userId === currentUserId) || null : null;
    const podium = leaderboard.slice(0, 3);

    return {
      test: {
        id: testData.id,
        title: testData.title,
        durationMinutes: testData.duration_minutes,
        totalMarks: Number(testData.total_marks || 0),
        totalQuestions: testData.total_questions || 0,
      },
      userStanding,
      topScore,
      averageScore,
      totalParticipants,
      podium,
      leaderboard,
    };
  }
}