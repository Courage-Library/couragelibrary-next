import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface AdminOverviewStats {
  totalQuestions: number;
  totalMockTests: number;
  totalArticles: number;
  totalCourses: number;
  totalDescriptive: number;
  totalInstitutes: number;
  pendingFlagsCount: number;
  totalOrdersCount: number;
  totalInvoicesCount: number;
}

export class AdminService {
  /**
   * Server-side authorization check for admin/staff roles.
   */
  static async checkIsAdminOrStaff(): Promise<{ isAdmin: boolean; userEmail?: string }> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { isAdmin: false };
    }

    const appRole = user.app_metadata?.role;
    const userRole = user.user_metadata?.role;
    const email = user.email || "";

    const isStaff =
      appRole === "admin" ||
      appRole === "staff" ||
      userRole === "admin" ||
      userRole === "staff" ||
      email.endsWith("@couragelibrary.com") ||
      process.env.NODE_ENV === "development";

    return { isAdmin: isStaff, userEmail: email };
  }

  /**
   * Fetches high-level platform administration overview stats.
   */
  static async getAdminOverview(): Promise<AdminOverviewStats> {
    const supabase = await createServerSupabaseClient();

    const [
      qRes,
      mRes,
      artRes,
      cRes,
      descRes,
      instRes,
      flagRes,
      ordRes,
      invRes,
    ] = await Promise.all([
      supabase.from("questions").select("id", { count: "exact", head: true }),
      supabase.from("mock_tests").select("id", { count: "exact", head: true }),
      supabase.from("articles").select("id", { count: "exact", head: true }),
      supabase.from("courses").select("id", { count: "exact", head: true }),
      supabase.from("descriptive_questions").select("id", { count: "exact", head: true }),
      supabase.from("institutes").select("id", { count: "exact", head: true }),
      supabase.from("discussion_moderation_flags").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
      supabase.from("payment_orders").select("id", { count: "exact", head: true }),
      supabase.from("billing_invoices").select("id", { count: "exact", head: true }),
    ]);

    return {
      totalQuestions: qRes.count || 0,
      totalMockTests: mRes.count || 0,
      totalArticles: artRes.count || 0,
      totalCourses: cRes.count || 0,
      totalDescriptive: descRes.count || 0,
      totalInstitutes: instRes.count || 0,
      pendingFlagsCount: flagRes.count || 0,
      totalOrdersCount: ordRes.count || 0,
      totalInvoicesCount: invRes.count || 0,
    };
  }

  /**
   * Admin: Question Bank listing.
   */
  static async getAdminQuestions() {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("questions")
      .select("id, question_text, question_type, difficulty, marks, is_published, created_at, topics(name)")
      .order("created_at", { ascending: false })
      .limit(50);

    return (data || []).map((q: any) => ({
      id: q.id,
      text: q.question_text,
      type: q.question_type,
      difficulty: q.difficulty,
      marks: q.marks,
      isPublished: q.is_published,
      createdAt: q.created_at,
      topicName: q.topics?.name || "General",
    }));
  }

  /**
   * Admin: Mock Tests listing.
   */
  static async getAdminMockTests() {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("mock_tests")
      .select("id, title, duration_minutes, total_marks, is_published, created_at, exams(name)")
      .order("created_at", { ascending: false });

    return (data || []).map((m: any) => ({
      id: m.id,
      title: m.title,
      durationMinutes: m.duration_minutes,
      totalMarks: m.total_marks,
      isPublished: m.is_published,
      createdAt: m.created_at,
      examName: m.exams?.name || "Global Exam",
    }));
  }

  /**
   * Admin: Articles & Courses content listing.
   */
  static async getAdminContent() {
    const supabase = await createServerSupabaseClient();
    const [articlesRes, coursesRes] = await Promise.all([
      supabase.from("articles").select("id, title, slug, status, reading_time_minutes, access_level, created_at").order("created_at", { ascending: false }),
      supabase.from("courses").select("id, title, slug, is_published, access_tier, price_inr, created_at").order("created_at", { ascending: false }),
    ]);

    return {
      articles: (articlesRes.data || []).map((a: any) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        status: a.status,
        readingTime: a.reading_time_minutes,
        accessLevel: a.access_level,
        createdAt: a.created_at,
      })),
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
   * Admin: Descriptive Questions listing.
   */
  static async getAdminDescriptive() {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("descriptive_questions")
      .select("id, title, min_words, max_words, total_marks, is_active, created_at, exams(name)")
      .order("created_at", { ascending: false });

    return (data || []).map((d: any) => ({
      id: d.id,
      title: d.title,
      minWords: d.min_words,
      maxWords: d.max_words,
      totalMarks: d.total_marks,
      isActive: d.is_active,
      createdAt: d.created_at,
      examName: d.exams?.name || "UPSC Mains",
    }));
  }

  /**
   * Admin: Institutes listing.
   */
  static async getAdminInstitutes() {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("institutes")
      .select("id, name, slug, verification_status, created_at")
      .order("created_at", { ascending: false });

    return (data || []).map((i: any) => ({
      id: i.id,
      name: i.name,
      slug: i.slug,
      verificationStatus: i.verification_status,
      createdAt: i.created_at,
    }));
  }

  /**
   * Admin: Flagged Community Content.
   */
  static async getAdminCommunityFlags() {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("discussion_moderation_flags")
      .select("id, target_type, target_id, reason, details, status, created_at")
      .order("created_at", { ascending: false });

    return (data || []).map((f: any) => ({
      id: f.id,
      targetType: f.target_type,
      targetId: f.target_id,
      reason: f.reason,
      details: f.details,
      status: f.status,
      createdAt: f.created_at,
    }));
  }

  /**
   * Admin: Billing & Orders overview.
   */
  static async getAdminBilling() {
    const supabase = await createServerSupabaseClient();
    const [ordersRes, plansRes] = await Promise.all([
      supabase.from("payment_orders").select("id, order_type, total_payable_amount, gateway, status, created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("subscription_plans").select("id, name, duration_days, base_price_inr, is_active"),
    ]);

    return {
      orders: (ordersRes.data || []).map((o: any) => ({
        id: o.id,
        orderType: o.order_type,
        amount: Number(o.total_payable_amount),
        gateway: o.gateway,
        status: o.status,
        createdAt: o.created_at,
      })),
      plans: (plansRes.data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        durationDays: p.duration_days,
        priceInr: Number(p.base_price_inr),
        isActive: p.is_active,
      })),
    };
  }
}
