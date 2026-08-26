import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface InstituteItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  isVerified: boolean;
  activeBatchesCount?: number;
}

export interface InstituteBatchItem {
  id: string;
  instituteId: string;
  name: string;
  slug: string;
  description: string | null;
  targetExamTitle: string | null;
  maxCapacity: number;
  activeStudentsCount: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
  userRole?: string | null;
  isEnrolled?: boolean;
}

export interface BatchAssignmentItem {
  id: string;
  title: string;
  instructionsMd: string | null;
  assignmentType: "MOCK_TEST" | "COURSE" | "COURSE_LESSON" | "FLASHCARD_DECK" | "ARTICLE" | "MISTAKE_DRILL";
  mockTestId: string | null;
  courseId: string | null;
  courseLessonId: string | null;
  flashcardDeckId: string | null;
  articleId: string | null;
  topicId: string | null;
  isMandatory: boolean;
  dueAt: string | null;
  availableFrom: string;
  status: string;
  deepLinkUrl: string;
  completedStudents?: number;
  totalStudents?: number;
  completionRatePct?: number;
}

export interface BatchMemberItem {
  id: string;
  userId: string;
  role: "STUDENT" | "FACULTY" | "MENTOR" | "INSTITUTE_ADMIN";
  status: string;
  joinedAt: string;
  userEmail?: string;
}

export interface BatchDetail {
  id: string;
  instituteId: string;
  instituteName: string;
  instituteSlug: string;
  name: string;
  slug: string;
  description: string | null;
  targetExamTitle: string | null;
  maxCapacity: number;
  activeStudentsCount: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
  userRole: string | null;
  isEnrolled: boolean;
  hasFacultyAccess: boolean;
  assignments: BatchAssignmentItem[];
  members?: BatchMemberItem[];
}

export class InstituteService {
  /**
   * Fetches active & verified institutes directory.
   */
  static async getInstitutes(): Promise<InstituteItem[]> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("institutes")
      .select("id, name, slug, description, logo_url, website_url, is_verified, institute_batches(count)")
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false });

    if (error || !data) return [];

    return (data as any[]).map((inst) => ({
      id: inst.id,
      name: inst.name,
      slug: inst.slug,
      description: inst.description,
      logoUrl: inst.logo_url,
      websiteUrl: inst.website_url,
      isVerified: inst.is_verified,
      activeBatchesCount: inst.institute_batches?.[0]?.count || 0,
    }));
  }

  /**
   * Fetches institute details and its active batches.
   */
  static async getInstituteDetail(slug: string): Promise<{
    institute: InstituteItem;
    batches: InstituteBatchItem[];
    userRole: string | null;
  } | null> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: instData } = await supabase
      .from("institutes")
      .select("*, institute_batches(*, exams(title), batch_memberships(user_id, role, status))")
      .eq("slug", slug)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (!instData) return null;
    const inst = instData as any;

    let instituteUserRole: string | null = null;
    if (user && inst.owner_user_id === user.id) {
      instituteUserRole = "OWNER";
    }

    const batches: InstituteBatchItem[] = (inst.institute_batches || []).map((b: any) => {
      const memberships = b.batch_memberships || [];
      const userMembership = user ? memberships.find((m: any) => m.user_id === user.id && m.status === "ACTIVE") : null;
      const activeStudentsCount = memberships.filter((m: any) => m.role === "STUDENT" && m.status === "ACTIVE").length;

      return {
        id: b.id,
        instituteId: b.institute_id,
        name: b.name,
        slug: b.slug,
        description: b.description,
        targetExamTitle: b.exams?.title || null,
        maxCapacity: b.max_capacity,
        activeStudentsCount,
        status: b.status,
        startDate: b.start_date,
        endDate: b.end_date,
        userRole: userMembership?.role || null,
        isEnrolled: !!userMembership,
      };
    });

    return {
      institute: {
        id: inst.id,
        name: inst.name,
        slug: inst.slug,
        description: inst.description,
        logoUrl: inst.logo_url,
        websiteUrl: inst.website_url,
        isVerified: inst.is_verified,
      },
      batches,
      userRole: instituteUserRole,
    };
  }

  /**
   * Fetches batch details, assigned curriculum, and role-adapted views.
   */
  static async getBatchDetail(batchId: string): Promise<BatchDetail | null> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: batchData } = await supabase
      .from("institute_batches")
      .select("*, institutes(name, slug), exams(title), batch_curriculum_assignments(*), batch_memberships(*)")
      .eq("id", batchId)
      .maybeSingle();

    if (!batchData) return null;
    const b = batchData as any;

    let userRole: string | null = null;
    let isEnrolled = false;
    let hasFacultyAccess = false;

    if (user) {
      const userMem = (b.batch_memberships || []).find((m: any) => m.user_id === user.id && m.status === "ACTIVE");
      if (userMem) {
        userRole = userMem.role;
        isEnrolled = true;
      }

      const rpcCall = supabase.rpc as any;
      const { data: facCheck } = await rpcCall("fn_has_batch_faculty_access", {
        p_batch_id: batchId,
        p_user_id: user.id,
      });
      hasFacultyAccess = !!facCheck;
    }

    const activeStudentsCount = (b.batch_memberships || []).filter((m: any) => m.role === "STUDENT" && m.status === "ACTIVE").length;

    // Helper to generate deep link URL for assignments
    const getDeepLink = (a: any) => {
      if (a.mock_test_id) return `/mock-tests/${a.mock_test_id}`;
      if (a.flashcard_deck_id) return `/flashcards/${a.flashcard_deck_id}`;
      if (a.topic_id) return `/practice?topic=${a.topic_id}`;
      if (a.course_id) return `/practice`;
      return "/dashboard";
    };

    const assignments: BatchAssignmentItem[] = (b.batch_curriculum_assignments || [])
      .filter((a: any) => a.status === "PUBLISHED" || hasFacultyAccess)
      .map((a: any) => ({
        id: a.id,
        title: a.title,
        instructionsMd: a.instructions_md,
        assignmentType: a.assignment_type,
        mockTestId: a.mock_test_id,
        courseId: a.course_id,
        courseLessonId: a.course_lesson_id,
        flashcardDeckId: a.flashcard_deck_id,
        articleId: a.article_id,
        topicId: a.topic_id,
        isMandatory: a.is_mandatory,
        dueAt: a.due_at,
        availableFrom: a.available_from,
        status: a.status,
        deepLinkUrl: getDeepLink(a),
      }));

    const members: BatchMemberItem[] = hasFacultyAccess
      ? (b.batch_memberships || []).map((m: any) => ({
          id: m.id,
          userId: m.user_id,
          role: m.role,
          status: m.status,
          joinedAt: m.joined_at,
        }))
      : [];

    return {
      id: b.id,
      instituteId: b.institute_id,
      instituteName: b.institutes?.name || "Institute",
      instituteSlug: b.institutes?.slug || "institute",
      name: b.name,
      slug: b.slug,
      description: b.description,
      targetExamTitle: b.exams?.title || null,
      maxCapacity: b.max_capacity,
      activeStudentsCount,
      status: b.status,
      startDate: b.start_date,
      endDate: b.end_date,
      userRole,
      isEnrolled,
      hasFacultyAccess,
      assignments,
      members,
    };
  }

  /**
   * Enrolls authenticated student into a batch via fn_enroll_batch_student.
   */
  static async enrollStudent(batchId: string, studentUserId: string): Promise<{
    success: boolean;
    membership_id?: string;
    error?: string;
  }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as any;

    const { data, error } = await rpcCall("fn_enroll_batch_student", {
      p_batch_id: batchId,
      p_student_user_id: studentUserId,
      p_role: "STUDENT",
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to enroll in batch" };
    }

    return data;
  }

  /**
   * Creates a batch curriculum assignment via fn_create_batch_assignment.
   */
  static async createAssignment(payload: {
    batchId: string;
    title: string;
    assignmentType: string;
    contentId: string;
    dueAt?: string;
    instructionsMd?: string;
  }): Promise<{
    success: boolean;
    assignment_id?: string;
    error?: string;
  }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as any;

    const { data, error } = await rpcCall("fn_create_batch_assignment", {
      p_batch_id: payload.batchId,
      p_title: payload.title,
      p_assignment_type: payload.assignmentType,
      p_content_id: payload.contentId,
      p_due_at: payload.dueAt || null,
      p_instructions_md: payload.instructionsMd || null,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to create assignment" };
    }

    return data;
  }

  /**
   * Fetches assignment completion progress via fn_get_batch_assignment_progress.
   */
  static async getAssignmentProgress(assignmentId: string): Promise<{
    success: boolean;
    total_students?: number;
    completed_students?: number;
    completion_rate_pct?: number;
    error?: string;
  }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as any;

    const { data, error } = await rpcCall("fn_get_batch_assignment_progress", {
      p_assignment_id: assignmentId,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to fetch progress" };
    }

    return data;
  }
}
