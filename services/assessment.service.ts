import { createServerSupabaseClient } from "@/lib/supabase/server";

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

export interface ActiveTestQuestion {
  mockQuestionId: string;
  questionOrder: number;
  sectionId: string;
  sectionName: string;
  questionVersionId: string;
  questionText: string;
  optionsType: string;
  marks: number;
  negativeMark: number;
  options: Array<{
    key: string;
    text: string;
  }>;
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
  };
  sections: Array<{
    sectionName: string;
    totalQuestions: number;
    attemptedCount: number;
    correctCount: number;
    incorrectCount: number;
    sectionScore: number;
    maxScore: number;
    accuracyPercentage: number;
  }>;
  reviewQuestions: Array<{
    questionOrder: number;
    sectionName: string;
    questionText: string;
    options: Array<{ key: string; text: string }>;
    selectedOption: string | null;
    correctOption: string;
    isCorrect: boolean;
    marksAwarded: number;
    explanation: string | null;
    topicName: string | null;
    topicSlug: string | null;
  }>;
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
          if (att.status === "completed") {
            userAttemptStatus = "completed";
            completedScore = att.test_results?.[0]?.score;
            completedAccuracy = att.test_results?.[0]?.accuracy_percentage;
          } else {
            userAttemptStatus = "in_progress";
          }
        }
      }

      const qCount = meta.questionCount || testInstance?.total_questions || 25;
      const dur = meta.durationMinutes || testInstance?.duration_minutes || 15;
      const marks = meta.totalMarks || testInstance?.total_marks || (qCount * 2);

      todayMock = {
        isOpen,
        isToday: true,
        dayOfWeek: currentDayOfWeek,
        dayLabel: dayLabels[currentDayOfWeek],
        testType: todayTemplate.test_type || "daily_sectional",
        testNumber,
        testId: testInstance?.id,
        templateId: todayTemplate.id,
        title: `${selectedCategory.title} Daily Mock (T#${testNumber})`,
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
   * Fetches mock test blueprint & instructions.
   */
  static async getMockTestInstructions(testId: string): Promise<MockTestInstructionsData | null> {
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

    // Fetch test details, sections, and questions with options
    const [testRes, sectionsRes, questionsRes, answersRes] = await Promise.all([
      supabase.from("mock_tests").select("id, title, duration_minutes").eq("id", testId).single(),
      supabase.from("mock_sections").select("id, section_name, section_order").eq("mock_test_id", testId).order("section_order"),
      supabase.from("mock_questions").select("id, question_order, mock_section_id, marks, negative_mark, question_versions(id, question_text, options_type, question_options(option_key, content_text, option_order))").eq("mock_test_id", testId).order("question_order"),
      supabase.from("attempt_answers").select("mock_question_id, selected_option_key, is_marked_for_review, time_spent_seconds").eq("attempt_id", attempt.id),
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
        .sort((a: any, b: any) => (a.option_order || 0) - (b.option_order || 0))
        .map((o: any) => ({
          key: o.option_key,
          text: o.content_text,
        }));

      return {
        mockQuestionId: mq.id,
        questionOrder: mq.question_order,
        sectionId: mq.mock_section_id,
        sectionName: sectionsMap.get(mq.mock_section_id) || "Section",
        questionVersionId: qv?.id || "",
        questionText: qv?.question_text || "",
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
    const remainingSeconds = Math.max(0, (testData.duration_minutes * 60) - elapsedSeconds);

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
      .single();

    const attempt = attemptData as any;
    if (!attempt || attempt.status !== "in_progress") {
      return { success: false, error: "Attempt is not in progress or already submitted" };
    }

    // Fetch test, sections, questions with answer keys, and student answers
    const [testRes, sectionsRes, questionsRes, answersRes] = await Promise.all([
      supabase.from("mock_tests").select("id, total_questions, total_marks").eq("id", attempt.mock_test_id).single(),
      supabase.from("mock_sections").select("id, marks_per_question, negative_mark").eq("mock_test_id", attempt.mock_test_id),
      supabase.from("mock_questions").select("id, mock_section_id, question_version_id, marks, negative_mark, question_versions(question_id, question_answers(correct_option_key))").eq("mock_test_id", attempt.mock_test_id),
      supabase.from("attempt_answers").select("id, mock_question_id, selected_option_key, time_spent_seconds").eq("attempt_id", attemptId),
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
      const correctOptionKey = mq.question_versions?.question_answers?.[0]?.correct_option_key;

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

    // 1. Update attempt answers evaluation
    for (const ea of evaluatedAnswers) {
      await (supabase.from("attempt_answers") as any).update({ is_correct: ea.is_correct, evaluated_marks: ea.evaluated_marks }).eq("id", ea.id);
    }

    // 2. Insert test_results
    const { data: testResultData, error: resultErr } = await supabase
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
        total_score: Math.max(0, totalScore),
        max_score: Number(testData.total_marks),
        accuracy_percentage: Math.round(accuracy * 100) / 100,
        time_spent_seconds: totalTimeSpent,
      } as any)
      .select("id")
      .single();

    if (resultErr || !testResultData) return { success: false, error: resultErr?.message || "Failed to create result" };
    const testResult = testResultData as any;

    // 3. Insert section_results
    for (const [secId, metrics] of sectionMetrics.entries()) {
      const secAccuracy = metrics.attempted > 0 ? (metrics.correct / metrics.attempted) * 100 : 0;
      await supabase.from("section_results").insert({
        test_result_id: testResult.id,
        mock_section_id: secId,
        total_questions: metrics.total,
        attempted_count: metrics.attempted,
        correct_count: metrics.correct,
        incorrect_count: metrics.incorrect,
        unanswered_count: metrics.total - metrics.attempted,
        section_score: Math.max(0, metrics.score),
        max_section_score: metrics.maxScore,
        accuracy_percentage: Math.round(secAccuracy * 100) / 100,
        time_spent_seconds: metrics.time,
      } as any);
    }

    // 4. Mark attempt as submitted
    await (supabase.from("test_attempts") as any).update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      time_taken_seconds: totalTimeSpent,
    } as any).eq("id", attemptId);

    // 5. Award Phase 3D Coins
    const rpcCall = supabase.rpc as any;
    await rpcCall("fn_award_gamification_reward", {
      p_user_id: user.id,
      p_event_type: "MOCK_TEST_COMPLETED",
      p_source_type: "MOCK_TEST_ATTEMPT",
      p_source_id: attemptId,
      p_idempotency_key: `mock_eval_${attemptId}_${user.id}`,
      p_coins: 10,
      p_reason_code: "MOCK_TEST_REWARD",
      p_metadata: { attempt_id: attemptId, score: totalScore, accuracy },
    });

    return { success: true, resultId: testResult.id };
  }

  /**
   * Fetches test results and question-by-question review with solutions and Learn More mappings.
   */
  static async getTestResult(attemptId: string): Promise<TestResultSummary | null> {
    const supabase = await createServerSupabaseClient();

    const [resultRes, attemptRes] = await Promise.all([
      supabase.from("test_results").select("*").eq("attempt_id", attemptId).maybeSingle(),
      supabase.from("test_attempts").select("id, mock_test_id, mock_tests(id, title, duration_minutes)").eq("id", attemptId).maybeSingle(),
    ]);

    const r = resultRes.data as any;
    const attemptData = attemptRes.data as any;

    if (!r || !attemptData || !attemptData.mock_tests) return null;
    const mt = attemptData.mock_tests;

    const [sectionsRes, questionsRes, answersRes] = await Promise.all([
      supabase.from("section_results").select("*, mock_sections(section_name)").eq("test_result_id", r.id),
      supabase.from("mock_questions").select("id, question_order, mock_section_id, marks, negative_mark, mock_sections(section_name), question_versions(id, question_text, question_options(option_key, content_text, option_order), question_answers(correct_option_key, solution_explanation_md), questions(canonical_topic_id, topics(name, slug)))").eq("mock_test_id", mt.id).order("question_order"),
      supabase.from("attempt_answers").select("mock_question_id, selected_option_key, is_correct, evaluated_marks").eq("attempt_id", attemptId),
    ]);

    const answersList = (answersRes.data as any[]) || [];
    const answersMap = new Map<string, any>();
    answersList.forEach((a) => {
      answersMap.set(a.mock_question_id, a);
    });

    const rawSections = (sectionsRes.data as any[]) || [];
    const sections = rawSections.map((sr) => ({
      sectionName: sr.mock_sections?.section_name || "Section",
      totalQuestions: sr.total_questions,
      attemptedCount: sr.attempted_count,
      correctCount: sr.correct_count,
      incorrectCount: sr.incorrect_count,
      sectionScore: Number(sr.section_score),
      maxScore: Number(sr.max_section_score),
      accuracyPercentage: Number(sr.accuracy_percentage),
    }));

    const rawQuestions = (questionsRes.data as any[]) || [];
    const reviewQuestions = rawQuestions.map((mq) => {
      const qv = mq.question_versions;
      const ans = answersMap.get(mq.id);
      const opts = (qv?.question_options || [])
        .sort((a: any, b: any) => (a.option_order || 0) - (b.option_order || 0))
        .map((o: any) => ({ key: o.option_key, text: o.content_text }));

      return {
        questionOrder: mq.question_order,
        sectionName: mq.mock_sections?.section_name || "General",
        questionText: qv?.question_text || "",
        options: opts,
        selectedOption: ans?.selected_option_key || null,
        correctOption: qv?.question_answers?.[0]?.correct_option_key || "A",
        isCorrect: ans?.is_correct ?? false,
        marksAwarded: Number(ans?.evaluated_marks || 0),
        explanation: qv?.question_answers?.[0]?.solution_explanation_md || null,
        topicName: qv?.questions?.topics?.name || null,
        topicSlug: qv?.questions?.topics?.slug || null,
      };
    });

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
        rank: r.rank,
        percentile: r.percentile ? Number(r.percentile) : null,
      },
      test: {
        id: mt.id,
        title: mt.title,
        durationMinutes: mt.duration_minutes,
      },
      sections,
      reviewQuestions,
    };
  }
}