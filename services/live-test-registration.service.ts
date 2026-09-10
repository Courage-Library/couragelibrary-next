import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { LiveTestEvent, LiveTestRegistration, LiveEventCardData } from "@/types/live-test";
import { LiveTestFoundationService } from "@/services/live-test-foundation.service";
import { formatIstDateTime } from "@/lib/assessment/timing";

export type { LiveEventCardData };

export class LiveTestRegistrationService {
  /**
   * Fetches all live events (upcoming, registration open, active, completed) with candidate registration status.
   */
  static async getLiveEventsDirectory(userId?: string | null): Promise<LiveEventCardData[]> {
    const adminSb = createAdminServerSupabaseClient();
    const now = new Date().toISOString();

    const { data: events, error } = await (adminSb as any)
      .from("live_test_events")
      .select(`
        *,
        exams (id, title),
        mock_tests (id, total_questions, total_marks)
      `)
      .in("status", [
        "SCHEDULED",
        "REGISTRATION_OPEN",
        "REGISTRATION_CLOSED",
        "READY",
        "LIVE",
        "GRACE_PERIOD",
        "PROCESSING",
        "RESULTS_READY",
        "PUBLISHED"
      ])
      .order("event_start_at", { ascending: true });

    if (error || !events) return [];

    // Fetch user registrations if logged in
    const userRegsMap = new Map<string, any>();
    if (userId) {
      const { data: userRegs } = await (adminSb as any)
        .from("live_test_registrations")
        .select("*")
        .eq("user_id", userId);

      (userRegs || []).forEach((r: any) => userRegsMap.set(r.live_test_event_id, r));
    }

    return events.map((e: any) => {
      const userReg = userRegsMap.get(e.id);
      const isRegistered = userReg && userReg.status === "REGISTERED";
      const startMs = new Date(e.event_start_at).getTime();
      const nowMs = Date.now();
      const timeRemaining = Math.max(0, Math.floor((startMs - nowMs) / 1000));
      const canRegister =
        e.status === "REGISTRATION_OPEN" &&
        new Date(e.registration_start_at).getTime() <= nowMs &&
        new Date(e.registration_end_at).getTime() >= nowMs &&
        (!e.max_participants || e.current_registered_count < e.max_participants);

      return {
        id: e.id,
        title: e.title,
        slug: e.slug,
        examTitle: e.exams?.title || "National Competitive Exam",
        description: e.description,
        bannerUrl: e.banner_url,
        status: e.status,
        durationMinutes: e.duration_minutes,
        totalQuestions: e.mock_tests?.total_questions || 0,
        totalMarks: Number(e.mock_tests?.total_marks || 0),
        registrationStartAt: e.registration_start_at,
        registrationEndAt: e.registration_end_at,
        eventStartAt: e.event_start_at,
        eventEndAt: e.event_end_at,
        resultPublishAt: e.result_publish_at,
        formattedStartAt: formatIstDateTime(e.event_start_at),
        formattedEndAt: formatIstDateTime(e.event_end_at),
        formattedRegEndAt: formatIstDateTime(e.registration_end_at),
        isPremiumOnly: e.is_premium_only,
        maxParticipants: e.max_participants,
        registeredCount: e.current_registered_count || 0,
        isRegistered: Boolean(isRegistered),
        registrationStatus: userReg?.status || null,
        timeRemainingSeconds: timeRemaining,
        canRegister,
      };
    });
  }

  /**
   * Fetches detailed information for a single live test event by slug or ID.
   */
  static async getLiveEventDetails(slugOrId: string, userId?: string | null): Promise<LiveEventCardData | null> {
    const adminSb = createAdminServerSupabaseClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);

    const query = (adminSb as any).from("live_test_events").select(`
      *,
      exams (id, title),
      mock_tests (id, total_questions, total_marks, duration_minutes)
    `);

    if (isUuid) {
      query.eq("id", slugOrId);
    } else {
      query.eq("slug", slugOrId);
    }

    const { data: event, error } = await query.maybeSingle();
    if (error || !event) return null;

    let userReg = null;
    if (userId) {
      const { data: reg } = await (adminSb as any)
        .from("live_test_registrations")
        .select("*")
        .eq("live_test_event_id", event.id)
        .eq("user_id", userId)
        .maybeSingle();

      userReg = reg;
    }

    const isRegistered = userReg && userReg.status === "REGISTERED";
    const startMs = new Date(event.event_start_at).getTime();
    const nowMs = Date.now();
    const timeRemaining = Math.max(0, Math.floor((startMs - nowMs) / 1000));
    const canRegister =
      event.status === "REGISTRATION_OPEN" &&
      new Date(event.registration_start_at).getTime() <= nowMs &&
      new Date(event.registration_end_at).getTime() >= nowMs &&
      (!event.max_participants || event.current_registered_count < event.max_participants);

    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      examTitle: event.exams?.title || "National Competitive Exam",
      description: event.description,
      bannerUrl: event.banner_url,
      status: event.status,
      durationMinutes: event.duration_minutes,
      totalQuestions: event.mock_tests?.total_questions || 0,
      totalMarks: Number(event.mock_tests?.total_marks || 0),
      registrationStartAt: event.registration_start_at,
      registrationEndAt: event.registration_end_at,
      eventStartAt: event.event_start_at,
      eventEndAt: event.event_end_at,
      resultPublishAt: event.result_publish_at,
      formattedStartAt: formatIstDateTime(event.event_start_at),
      formattedEndAt: formatIstDateTime(event.event_end_at),
      formattedRegEndAt: formatIstDateTime(event.registration_end_at),
      isPremiumOnly: event.is_premium_only,
      maxParticipants: event.max_participants,
      registeredCount: event.current_registered_count || 0,
      isRegistered: Boolean(isRegistered),
      registrationStatus: userReg?.status || null,
      timeRemainingSeconds: timeRemaining,
      canRegister,
    };
  }

  /**
   * Registers a candidate for a Live Test Event atomically via database RPC fn_register_live_test.
   */
  static async registerCandidate(
    eventId: string,
    userId: string
  ): Promise<{ success: boolean; data?: any; error?: string; code?: string }> {
    const adminSb = createAdminServerSupabaseClient();

    // Call atomic RPC
    const { data: rpcRes, error } = await (adminSb as any).rpc("fn_register_live_test", {
      p_event_id: eventId,
      p_user_id: userId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const res = typeof rpcRes === "string" ? JSON.parse(rpcRes) : rpcRes;
    if (!res || !res.success) {
      return { success: false, error: res?.message || "Registration failed.", code: res?.code };
    }

    return { success: true, data: res };
  }

  /**
   * Cancels a candidate's registration before event enters preparation window via RPC fn_cancel_live_test_registration.
   */
  static async cancelRegistration(
    eventId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    const adminSb = createAdminServerSupabaseClient();

    const { data: rpcRes, error } = await (adminSb as any).rpc("fn_cancel_live_test_registration", {
      p_event_id: eventId,
      p_user_id: userId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const res = typeof rpcRes === "string" ? JSON.parse(rpcRes) : rpcRes;
    if (!res || !res.success) {
      return { success: false, error: res?.message || "Cancellation failed." };
    }

    return { success: true };
  }

  /**
   * Admin scheduling update with mandatory audit logging.
   */
  static async updateEventSchedule(
    eventId: string,
    updates: {
      registration_start_at?: string;
      registration_end_at?: string;
      event_start_at?: string;
      event_end_at?: string;
      result_publish_at?: string;
    },
    actorId: string,
    reason: string
  ): Promise<{ success: boolean; data?: LiveTestEvent; error?: string }> {
    if (!reason || reason.trim().length < 5) {
      return { success: false, error: "A valid reason (minimum 5 characters) is required for schedule updates." };
    }

    const adminSb = createAdminServerSupabaseClient();
    const { data: currentEvent } = await (adminSb as any).from("live_test_events").select("*").eq("id", eventId).maybeSingle();

    if (!currentEvent) {
      return { success: false, error: "Event not found" };
    }

    const { data: updated, error } = await (adminSb as any)
      .from("live_test_events")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    await LiveTestFoundationService.recordAuditLog(
      eventId,
      "UPDATE_SCHEDULE",
      actorId,
      currentEvent,
      updated,
      reason
    );

    return { success: true, data: updated };
  }
}
