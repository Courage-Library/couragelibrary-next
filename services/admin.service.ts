import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UserProfileService } from "@/services/user-profile.service";

export interface AdminCategoryItem {
  id: string;
  title: string;
  slug: string;
  category: string;
  description: string | null;
  isActive: boolean;
  patternsCount: number;
  schedulesCount: number;
  mockTestsCount: number;
  questionsCount: number;
  createdAt: string;
}

export interface AdminPatternItem {
  id: string;
  name: string;
  tierName: string | null;
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  negativeMarkValue: number;
  isActive: boolean;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  sectionsCount: number;
  mockTestsCount: number;
  questionsCount: number;
  createdAt: string;
}

export interface AdminSectionItem {
  id: string;
  name: string;
  slug: string;
  categoryId?: string;
  categoryName?: string;
  categorySlug?: string;
  patternId?: string;
  patternName?: string;
  questionCount: number;
  questionsInBank: number;
  topicsCount: number;
  marksPerQuestion: number;
  totalMarks: number;
  negativeMark: number;
  isActive: boolean;
}

export interface AdminScheduleItem {
  id: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  cycleYear: number;
  notificationDate: string | null;
  applicationStartDate: string | null;
  applicationEndDate: string | null;
  examWindowStart: string | null;
  examWindowEnd: string | null;
  status: string;
  patternsCount: number;
  mockTestsCount: number;
  createdAt: string;
}

export interface AdminQuestionHierarchyItem {
  id: string;
  versionId: string;
  statement: string;
  difficulty: "easy" | "medium" | "hard";
  language: string;
  optionsType: "text" | "image" | "mixed";
  imageUrl: string | null;
  status: "published" | "draft" | "archived";
  createdAt: string;
  updatedAt: string;
  // Hierarchy
  categoryId: string | null;
  categoryName: string;
  categorySlug: string | null;
  patternId: string | null;
  patternName: string;
  sectionId: string | null;
  sectionName: string;
  topicId: string | null;
  topicName: string;
  // PYQ Metadata
  isPyq: boolean;
  pyqYear: number | null;
  pyqSource: string | null;
  // Options & Correct Answer
  options: Array<{
    id: string;
    key: string;
    text: string;
    imageUrl: string | null;
    orderIndex: number;
  }>;
  correctOptionKey: string;
  explanationMd: string;
  // Associations
  mockTestAssociations: Array<{
    mockTestId: string;
    mockTestTitle: string;
    sectionName: string;
    questionOrder: number;
  }>;
}

export interface AdminQuestionTaxonomy {
  exams: Array<{ id: string; title: string; slug: string; category: string }>;
  patterns: Array<{ id: string; examId: string | null; name: string; tierName: string }>;
  subjects: Array<{ id: string; name: string; slug: string }>;
  topics: Array<{ id: string; subjectId: string; name: string; slug: string }>;
  mockTests: Array<{ id: string; title: string; slug: string }>;
}

export interface AdminQuestionSummaryKPIs {
  totalQuestions: number;
  activeQuestions: number;
  pyqQuestions: number;
  imageQuestions: number;
  unassignedQuestions: number;
  totalExams: number;
  totalPatterns: number;
  totalSections: number;
  totalTopics: number;
}

export interface AdminQuestionsPageData {
  questions: AdminQuestionHierarchyItem[];
  taxonomy: AdminQuestionTaxonomy;
  kpis: AdminQuestionSummaryKPIs;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  fullName: string;
  role: string;
  languagePreference: string;
  isActive: boolean;
  hasProfile: boolean;
  profileStatus: "Synced" | "Profile Missing";
  createdAt: string;
  lastSignInAt: string | null;
}

export class AdminService {
  /**
   * Check if current user is admin/staff
   */
  static async checkIsAdminOrStaff(): Promise<{ isAdmin: boolean; userId?: string; userEmail?: string }> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { isAdmin: false };

    const adminEmails = (process.env.ADMIN_EMAILS || "jan810693@gmail.com,jan810694@gmail.com")
      .split(",")
      .map((e) => e.trim().toLowerCase());

    const isEmailAdmin = user.email ? adminEmails.includes(user.email.toLowerCase()) : false;
    const isMetaAdmin = user.app_metadata?.role === "admin" || user.user_metadata?.role === "admin" || user.user_metadata?.role === "staff";

    const isAuthorized = isEmailAdmin || isMetaAdmin;

    // Self-heal profile on admin access
    if (user) {
      await UserProfileService.ensureProfile(user);
    }

    return { isAdmin: isAuthorized, userId: user.id, userEmail: user.email };
  }

  /**
   * Admin Studio Overview KPIs
   */
  static async getAdminOverview() {
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const [
      usersCount,
      questionsCount,
      attemptsCount,
      articlesCount,
      coursesCount,
      mocksCount,
      patternsCount,
      categoriesCount,
      descriptiveCount,
      institutesCount,
      flagsCount,
      ordersCount,
    ] = await Promise.all([
      sb.from("user_profiles").select("*", { count: "exact", head: true }),
      sb.from("questions").select("*", { count: "exact", head: true }),
      sb.from("test_attempts").select("*", { count: "exact", head: true }),
      sb.from("articles").select("*", { count: "exact", head: true }),
      sb.from("courses").select("*", { count: "exact", head: true }),
      sb.from("mock_tests").select("*", { count: "exact", head: true }),
      sb.from("exam_patterns").select("*", { count: "exact", head: true }),
      sb.from("exams").select("*", { count: "exact", head: true }),
      sb.from("descriptive_prompts").select("*", { count: "exact", head: true }),
      sb.from("institutes").select("*", { count: "exact", head: true }),
      sb.from("community_moderation_flags").select("*", { count: "exact", head: true }),
      sb.from("payment_orders").select("*", { count: "exact", head: true }),
    ]);

    return {
      totalUsers: usersCount.count || 0,
      totalQuestions: questionsCount.count || 0,
      totalAttempts: attemptsCount.count || 0,
      totalArticles: articlesCount.count || 0,
      totalCourses: coursesCount.count || 0,
      totalMockTests: mocksCount.count || 0,
      totalPatterns: patternsCount.count || 0,
      totalCategories: categoriesCount.count || 0,
      totalDescriptive: descriptiveCount.count || 0,
      totalInstitutes: institutesCount.count || 0,
      pendingFlagsCount: flagsCount.count || 0,
      totalOrdersCount: ordersCount.count || 0,
    };
  }

  static async getOverviewMetrics() {
    return this.getAdminOverview();
  }

  /**
   * Admin: Categories (Exams) Listing with Child Entity Counts
   */
  static async getAdminCategories(): Promise<AdminCategoryItem[]> {
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const { data: exams } = await sb
      .from("exams")
      .select(`
        id,
        title,
        slug,
        category,
        description,
        is_active,
        created_at,
        exam_cycles (
          id,
          cycle_year,
          status,
          exam_patterns (
            id,
            name,
            total_questions
          )
        ),
        mock_templates (
          id,
          title,
          mock_tests (
            id,
            title,
            total_questions
          )
        )
      `)
      .order("title", { ascending: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (exams || []).map((e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cycles = e.exam_cycles || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patterns = cycles.flatMap((c: any) => c.exam_patterns || []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const templates = e.mock_templates || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockTests = templates.flatMap((t: any) => t.mock_tests || []);

      // Calculate questions count
      let qCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockTests.forEach((m: any) => {
        if (m.total_questions) qCount += m.total_questions;
      });

      return {
        id: e.id,
        title: e.title,
        slug: e.slug,
        category: e.category,
        description: e.description,
        isActive: e.is_active,
        patternsCount: patterns.length,
        schedulesCount: cycles.length,
        mockTestsCount: mockTests.length,
        questionsCount: qCount || patterns.reduce((acc: number, p: any) => acc + (p.total_questions || 0), 0),
        createdAt: e.created_at,
      };
    });
  }

  /**
   * Admin: Patterns Listing with Parent Category and Child Section Counts
   */
  static async getAdminPatterns(categoryFilter?: string): Promise<AdminPatternItem[]> {
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const [patternsRes, templatesRes, subjectsRes] = await Promise.all([
      sb.from("exam_patterns").select(`
        id,
        name,
        tier_name,
        duration_minutes,
        total_questions,
        total_marks,
        negative_mark_value,
        is_active,
        created_at,
        exam_cycles (
          id,
          cycle_year,
          status,
          exams (
            id,
            title,
            slug
          )
        )
      `).order("created_at", { ascending: false }),
      sb.from("mock_templates").select("id, pattern_id, mock_tests(id)"),
      sb.from("subjects").select("id", { count: "exact", head: true }),
    ]);

    const defaultSubjectCount = subjectsRes.count || 4;
    const templateList = templatesRes.data || [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let list: AdminPatternItem[] = (patternsRes.data || []).map((p: any) => {
      const exam = p.exam_cycles?.exams || {};
      const linkedTemplates = templateList.filter((t: any) => t.pattern_id === p.id);
      const mockCount = linkedTemplates.reduce((acc: number, t: any) => acc + (t.mock_tests?.length || 0), 0);

      return {
        id: p.id,
        name: p.name,
        tierName: p.tier_name,
        durationMinutes: p.duration_minutes || 60,
        totalQuestions: p.total_questions || 0,
        totalMarks: p.total_marks || 0,
        negativeMarkValue: p.negative_mark_value || 0,
        isActive: p.is_active,
        categoryId: exam.id || "",
        categoryName: exam.title || "General Exam",
        categorySlug: exam.slug || "general",
        sectionsCount: defaultSubjectCount,
        mockTestsCount: mockCount,
        questionsCount: p.total_questions || 0,
        createdAt: p.created_at,
      };
    });

    if (categoryFilter && categoryFilter !== "ALL") {
      const filterLower = categoryFilter.toLowerCase();
      list = list.filter((p) => p.categoryId === categoryFilter || p.categorySlug.toLowerCase() === filterLower || p.categoryName.toLowerCase() === filterLower);
    }

    return list;
  }

  /**
   * Admin: Sections Listing with Subject Taxonomy and Question Counts
   */
  static async getAdminSections(patternFilter?: string, categoryFilter?: string): Promise<AdminSectionItem[]> {
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const [patternSectionsRes, subjectsRes] = await Promise.all([
      sb.from("pattern_sections").select(`
        id,
        section_name,
        num_questions,
        marks_per_question,
        negative_mark,
        section_order,
        created_at,
        pattern_id,
        subject_id,
        exam_patterns (
          id,
          name,
          duration_minutes,
          exam_cycles (
            exams (
              id,
              title,
              slug
            )
          )
        ),
        subjects (
          id,
          name,
          slug,
          topics (
            id,
            name,
            questions (
              id
            )
          )
        )
      `).order("section_order", { ascending: true }),
      sb.from("subjects").select(`
        id,
        name,
        slug,
        is_active,
        topics (
          id,
          name,
          questions (
            id
          )
        )
      `).order("name", { ascending: true }),
    ]);

    const patternSections = patternSectionsRes.data || [];
    const subjects = subjectsRes.data || [];

    // Map existing pattern sections
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let list: AdminSectionItem[] = patternSections.map((ps: any) => {
      const pat = ps.exam_patterns || {};
      const exam = pat.exam_cycles?.exams || {};
      const subj = ps.subjects || {};
      const topics = subj.topics || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bankCount = topics.reduce((acc: number, t: any) => acc + (t.questions?.length || 0), 0);
      const reqCount = ps.num_questions || 25;
      const mpq = Number(ps.marks_per_question || 2.0);

      return {
        id: ps.id,
        name: ps.section_name || subj.name || "Section",
        slug: subj.slug || (ps.section_name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        categoryId: exam.id || "",
        categoryName: exam.title || "General Category",
        categorySlug: exam.slug || "general",
        patternId: ps.pattern_id || pat.id || "",
        patternName: pat.name || "General Pattern",
        questionCount: reqCount,
        questionsInBank: bankCount,
        topicsCount: topics.length,
        marksPerQuestion: mpq,
        totalMarks: Number((reqCount * mpq).toFixed(2)),
        negativeMark: Number(ps.negative_mark || 0.5),
        isActive: true,
      };
    });

    // Fallback: If no pattern_sections exist in database yet, map subjects across patterns
    if (list.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      list = subjects.map((s: any) => {
        const topics = s.topics || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bankCount = topics.reduce((acc: number, t: any) => acc + (t.questions?.length || 0), 0);
        return {
          id: s.id,
          name: s.name,
          slug: s.slug,
          categoryId: categoryFilter || "",
          categoryName: "All Categories",
          categorySlug: "general",
          patternId: patternFilter || "",
          patternName: "Standard Section",
          questionCount: 25,
          questionsInBank: bankCount,
          topicsCount: topics.length,
          marksPerQuestion: 2.0,
          totalMarks: 50,
          negativeMark: 0.5,
          isActive: s.is_active,
        };
      });
    }

    if (patternFilter && patternFilter !== "ALL") {
      list = list.filter((s) => s.patternId === patternFilter || s.patternName?.toLowerCase() === patternFilter.toLowerCase());
    }

    if (categoryFilter && categoryFilter !== "ALL") {
      const catLower = categoryFilter.toLowerCase();
      list = list.filter((s) => s.categoryId === categoryFilter || s.categorySlug?.toLowerCase() === catLower || s.categoryName?.toLowerCase() === catLower);
    }

    return list;
  }

  /**
   * Admin: Schedules (Exam Cycles) Listing
   */
  static async getAdminSchedules(categoryFilter?: string): Promise<AdminScheduleItem[]> {
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const { data: cycles } = await sb
      .from("exam_cycles")
      .select(`
        id,
        cycle_year,
        notification_date,
        application_start_date,
        application_end_date,
        exam_window_start,
        exam_window_end,
        status,
        created_at,
        exams (
          id,
          title,
          slug
        ),
        exam_patterns (
          id,
          name
        )
      `)
      .order("cycle_year", { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let list: AdminScheduleItem[] = (cycles || []).map((c: any) => {
      const exam = c.exams || {};
      const patterns = c.exam_patterns || [];
      return {
        id: c.id,
        categoryId: exam.id || "",
        categoryName: exam.title || "General Exam",
        categorySlug: exam.slug || "general",
        cycleYear: c.cycle_year,
        notificationDate: c.notification_date,
        applicationStartDate: c.application_start_date,
        applicationEndDate: c.application_end_date,
        examWindowStart: c.exam_window_start,
        examWindowEnd: c.exam_window_end,
        status: c.status || "active",
        patternsCount: patterns.length,
        mockTestsCount: 1,
        createdAt: c.created_at,
      };
    });

    if (categoryFilter && categoryFilter !== "ALL") {
      const filterLower = categoryFilter.toLowerCase();
      list = list.filter((s) => s.categoryId === categoryFilter || s.categorySlug.toLowerCase() === filterLower || s.categoryName.toLowerCase() === filterLower);
    }

    return list;
  }

  /**
   * Admin: Complete User & Profile Synchronization List
   */
  static async getAdminUsers(): Promise<{ users: AdminUserListItem[]; totalAuthUsers: number; totalProfiles: number; missingProfilesCount: number }> {
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const [{ data: authData }, { data: profileData }] = await Promise.all([
      sb.auth.admin.listUsers(),
      sb.from("user_profiles").select("*"),
    ]);

    const authUsers = authData?.users || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profiles = profileData || [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileMap = new Map<string, any>(profiles.map((p: any) => [p.id, p]));
    const adminEmails = (process.env.ADMIN_EMAILS || "jan810693@gmail.com,jan810694@gmail.com")
      .split(",")
      .map((e) => e.trim().toLowerCase());

    let missingCount = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userList: AdminUserListItem[] = authUsers.map((u: any) => {
      const profile = profileMap.get(u.id);
      const hasProfile = Boolean(profile);
      if (!hasProfile) missingCount++;

      const isStaff = u.email && adminEmails.includes(u.email.toLowerCase());
      const meta = u.user_metadata || u.raw_user_meta_data || {};

      return {
        id: u.id,
        email: u.email || "No Email",
        fullName: profile?.full_name || meta.full_name || meta.name || u.email?.split("@")[0] || "Student",
        role: isStaff ? "admin" : (meta.role || "student"),
        languagePreference: profile?.language_preference === "hi" ? "Hindi" : "English",
        isActive: profile ? profile.is_active : true,
        hasProfile,
        profileStatus: hasProfile ? "Synced" : "Profile Missing",
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at || null,
      };
    });

    return {
      users: userList,
      totalAuthUsers: authUsers.length,
      totalProfiles: profiles.length,
      missingProfilesCount: missingCount,
    };
  }

  /**
   * Admin: Complete Question Bank Hierarchy & Metadata
   */
  static async getAdminQuestionsWithHierarchy(): Promise<AdminQuestionsPageData> {
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    // 1. Fetch Questions with full relational hierarchy
    const [questionsRes, examsRes, patternsRes, subjectsRes, topicsRes, mockTestsRes, mockQuestionsRes] =
      await Promise.all([
        sb
          .from("questions")
          .select(`
            id,
            canonical_topic_id,
            status,
            created_at,
            updated_at,
            topics (
              id,
              name,
              slug,
              subject_id,
              subjects (
                id,
                name,
                slug
              )
            ),
            question_versions (
              id,
              version_number,
              question_text,
              difficulty,
              language,
              options_type,
              question_image_url,
              is_current,
              created_at,
              question_options (
                id,
                option_key,
                option_text,
                option_image_url,
                order_index
              ),
              question_answers (
                correct_option_key,
                explanation_md
              )
            ),
            question_sources (
              id,
              exam_name,
              year,
              source_type
            )
          `)
          .order("created_at", { ascending: false }),

        sb.from("exams").select("id, title, slug, category").order("title"),
        sb.from("exam_patterns").select("id, exam_cycle_id, name, tier_name, exam_cycles(exam_id)").order("name"),
        sb.from("subjects").select("id, name, slug").order("name"),
        sb.from("topics").select("id, subject_id, name, slug").order("name"),
        sb.from("mock_tests").select("id, title, slug, template_id, duration_minutes, total_questions, total_marks, status, mock_templates(exams(title, slug), exam_patterns(name))").order("title"),
        sb.from("mock_questions").select("mock_test_id, mock_section_id, question_version_id, question_order, mock_tests(id, title, template_id, mock_templates(exam_id, pattern_id, exams(id, title, slug), exam_patterns(id, name))), mock_sections(id, section_name)"),
      ]);

    const mockQuestionMap = new Map<string, Array<{ mockTestId: string; mockTestTitle: string; sectionName: string; questionOrder: number; examTitle?: string; examSlug?: string; patternName?: string }>>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockQuestionsRes.data || []).forEach((mq: any) => {
      const qvId = mq.question_version_id;
      if (!mockQuestionMap.has(qvId)) {
        mockQuestionMap.set(qvId, []);
      }
      mockQuestionMap.get(qvId)!.push({
        mockTestId: mq.mock_test_id,
        mockTestTitle: mq.mock_tests?.title || "Mock Test",
        sectionName: mq.mock_sections?.section_name || "General Section",
        questionOrder: mq.question_order,
        examTitle: mq.mock_tests?.mock_templates?.exams?.title,
        examSlug: mq.mock_tests?.mock_templates?.exams?.slug,
        patternName: mq.mock_tests?.mock_templates?.exam_patterns?.name,
      });
    });

    // 2. Map Question Items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const questions: AdminQuestionHierarchyItem[] = (questionsRes.data || []).map((q: any) => {
      const version = q.question_versions?.[0] || {};
      const options = version.question_options || [];
      const answers = version.question_answers;
      const source = q.question_sources?.[0];
      const topic = q.topics;
      const subject = topic?.subjects;
      const associations = mockQuestionMap.get(version.id) || [];

      // Determine Category / Exam & Pattern
      let categoryName = "Unassigned";
      let categorySlug: string | null = null;
      let categoryId: string | null = null;
      let patternName = "Unassigned";
      let patternId: string | null = null;

      if (associations.length > 0) {
        categoryName = associations[0].examTitle || "General Category";
        categorySlug = associations[0].examSlug || null;
        patternName = associations[0].patternName || "General Pattern";
      } else if (source?.exam_name) {
        categoryName = source.exam_name;
      } else if (subject?.name) {
        categoryName = "General Competitive";
      }

      // Check if topic is unassigned
      const isTopicUnassigned = !topic || !topic.name || topic.name === "General Topic";
      const isSectionUnassigned = !subject || !subject.name;

      const isPyq = Boolean(source?.year || source?.exam_name);

      return {
        id: q.id,
        versionId: version.id || q.id,
        statement: version.question_text || "No statement text provided",
        difficulty: (version.difficulty || "medium").toLowerCase() as "easy" | "medium" | "hard",
        language: version.language === "hi" ? "Hindi" : "English",
        optionsType: (version.options_type || "text") as "text" | "image" | "mixed",
        imageUrl: version.question_image_url || null,
        status: (q.status || "published") as "published" | "draft" | "archived",
        createdAt: q.created_at,
        updatedAt: q.updated_at || q.created_at,
        // Hierarchy
        categoryId,
        categoryName,
        categorySlug,
        patternId,
        patternName,
        sectionId: subject?.id || null,
        sectionName: isSectionUnassigned ? "Unassigned" : subject.name,
        topicId: topic?.id || null,
        topicName: isTopicUnassigned ? "Unassigned" : topic.name,
        // PYQ
        isPyq,
        pyqYear: source?.year || null,
        pyqSource: source?.exam_name || null,
        // Options & Answer
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        options: options.map((opt: any) => ({
          id: opt.id,
          key: opt.option_key,
          text: opt.option_text || "",
          imageUrl: opt.option_image_url || null,
          orderIndex: opt.order_index,
        })),
        correctOptionKey: answers?.correct_option_key || "A",
        explanationMd: answers?.explanation_md || "No detailed explanation provided.",
        mockTestAssociations: associations,
      };
    });

    // 3. Extract Taxonomy Collections
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taxonomy: AdminQuestionTaxonomy = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exams: (examsRes.data || []).map((e: any) => ({ id: e.id, title: e.title, slug: e.slug, category: e.category })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      patterns: (patternsRes.data || []).map((p: any) => ({
        id: p.id,
        examId: p.exam_cycles?.exam_id || null,
        name: p.name,
        tierName: p.tier_name,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subjects: (subjectsRes.data || []).map((s: any) => ({ id: s.id, name: s.name, slug: s.slug })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      topics: (topicsRes.data || []).map((t: any) => ({ id: t.id, subjectId: t.subject_id, name: t.name, slug: t.slug })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockTests: (mockTestsRes.data || []).map((m: any) => ({ id: m.id, title: m.title, slug: m.slug })),
    };

    // 4. Calculate KPIs
    const kpis: AdminQuestionSummaryKPIs = {
      totalQuestions: questions.length,
      activeQuestions: questions.filter((q) => q.status === "published").length,
      pyqQuestions: questions.filter((q) => q.isPyq).length,
      imageQuestions: questions.filter((q) => q.imageUrl !== null || q.optionsType === "image").length,
      unassignedQuestions: questions.filter((q) => q.sectionName === "Unassigned" || q.topicName === "Unassigned").length,
      totalExams: taxonomy.exams.length,
      totalPatterns: taxonomy.patterns.length,
      totalSections: taxonomy.subjects.length,
      totalTopics: taxonomy.topics.length,
    };

    return {
      questions,
      taxonomy,
      kpis,
    };
  }

  static async getQuestionsCount(): Promise<number> {
    const sb = await createServerSupabaseClient();
    const { count } = await sb.from("questions").select("*", { count: "exact", head: true });
    return count || 0;
  }

  static async getAdminQuestions() {
    const data = await this.getAdminQuestionsWithHierarchy();
    return data.questions.map((q) => ({
      id: q.id,
      text: q.statement,
      type: q.optionsType,
      difficulty: q.difficulty.toUpperCase(),
      marks: 2,
      isPublished: q.status === "published",
      createdAt: q.createdAt,
      topicName: q.topicName,
    }));
  }

  /**
   * Admin: Mock Tests listing with Parent Pattern & Category
   */
  static async getAdminMockTests(patternFilter?: string, categoryFilter?: string) {
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("mock_tests")
      .select("id, title, slug, duration_minutes, total_questions, total_marks, status, created_at, mock_templates(id, exam_id, pattern_id, exams(id, title, slug), exam_patterns(id, name))")
      .order("created_at", { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let list = (data || []).map((m: any) => {
      const template = m.mock_templates || {};
      const exam = template.exams || {};
      const pattern = template.exam_patterns || {};

      return {
        id: m.id,
        title: m.title,
        slug: m.slug,
        durationMinutes: m.duration_minutes,
        totalQuestions: m.total_questions || 20,
        totalMarks: m.total_marks,
        isPublished: m.status === "published",
        status: m.status || "published",
        createdAt: m.created_at,
        categoryId: exam.id || "",
        categoryName: exam.title || "Global Exam",
        categorySlug: exam.slug || "global",
        patternId: pattern.id || "",
        patternName: pattern.name || "Standard Pattern",
        sectionsCount: 1,
      };
    });

    if (categoryFilter && categoryFilter !== "ALL") {
      const catLower = categoryFilter.toLowerCase();
      list = list.filter((m: any) => m.categoryId === categoryFilter || m.categorySlug.toLowerCase() === catLower || m.categoryName.toLowerCase() === catLower);
    }

    if (patternFilter && patternFilter !== "ALL") {
      const patLower = patternFilter.toLowerCase();
      list = list.filter((m: any) => m.patternId === patternFilter || m.patternName.toLowerCase() === patLower);
    }

    return list;
  }

  /**
   * Admin: Articles & Courses content listing.
   */
  static async getAdminContent() {
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [articlesRes, coursesRes] = await Promise.all([
      sb.from("articles").select("id, title, slug, status, reading_time_minutes, access_level, created_at").order("created_at", { ascending: false }),
      sb.from("courses").select("id, title, slug, is_published, access_tier, price_inr, created_at").order("created_at", { ascending: false }),
    ]);

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      articles: (articlesRes.data || []).map((a: any) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        status: a.status,
        readingTime: a.reading_time_minutes,
        accessLevel: a.access_level,
        createdAt: a.created_at,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      courses: (coursesRes.data || []).map((c: any) => ({
        id: c.id,
        title: c.title,
        slug: c.slug,
        isPublished: c.is_published,
        accessTier: c.access_tier,
        priceInr: c.price_inr,
        createdAt: c.created_at,
      })),
    };
  }

  /**
   * Admin: Descriptive Prompts listing.
   */
  static async getAdminDescriptive() {
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("descriptive_prompts")
      .select("id, title, prompt_text, max_word_count, is_active, created_at")
      .order("created_at", { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((d: any) => ({
      id: d.id,
      title: d.title,
      promptText: d.prompt_text,
      maxWordCount: d.max_word_count,
      isActive: d.is_active,
      createdAt: d.created_at,
    }));
  }

  /**
   * Admin: Institutes listing.
   */
  static async getAdminInstitutes() {
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("institutes")
      .select("id, name, slug, city, is_verified, created_at")
      .order("created_at", { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((i: any) => ({
      id: i.id,
      name: i.name,
      slug: i.slug,
      city: i.city,
      isVerified: i.is_verified,
      createdAt: i.created_at,
    }));
  }

  /**
   * Admin: Billing & Subscription Plans listing.
   */
  static async getAdminBilling() {
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("subscription_plans")
      .select("id, name, code, price_inr, duration_days, is_active, created_at")
      .order("created_at", { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((b: any) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      priceInr: b.price_inr,
      durationDays: b.duration_days,
      isActive: b.is_active,
      createdAt: b.created_at,
    }));
  }

  /**
   * Admin: Community Moderation Flags.
   */
  static async getAdminCommunityFlags() {
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("community_moderation_flags")
      .select("id, reason, status, created_at, thread_id, reply_id, user_id")
      .order("created_at", { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((f: any) => ({
      id: f.id,
      reason: f.reason,
      status: f.status,
      createdAt: f.created_at,
      threadId: f.thread_id,
      replyId: f.reply_id,
      userId: f.user_id,
    }));
  }
}
