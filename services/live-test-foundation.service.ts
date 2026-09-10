import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import {
  LiveEventStatus,
  LiveTestEvent,
  LiveTestInstance,
  LiveTestRegistration,
  LiveTestAuditLog,
  CreateLiveEventDTO,
  LiveTestQuestionSnapshot,
  LiveTestSectionSnapshot,
} from "@/types/live-test";
import crypto from "crypto";

export class LiveTestFoundationService {
  /**
   * Validates state transitions across the 12-state Live Event Lifecycle.
   */
  static validateStateTransition(current: LiveEventStatus, next: LiveEventStatus): boolean {
    const allowedMap: Record<LiveEventStatus, LiveEventStatus[]> = {
      DRAFT: ["SCHEDULED", "ARCHIVED", "CANCELLED"],
      SCHEDULED: ["REGISTRATION_OPEN", "DRAFT", "CANCELLED"],
      REGISTRATION_OPEN: ["REGISTRATION_CLOSED", "CANCELLED"],
      REGISTRATION_CLOSED: ["READY", "REGISTRATION_OPEN", "CANCELLED"],
      READY: ["LIVE", "CANCELLED"],
      LIVE: ["GRACE_PERIOD", "CANCELLED"],
      GRACE_PERIOD: ["PROCESSING", "LIVE"], // "LIVE" for emergency extension
      PROCESSING: ["RESULTS_READY", "CANCELLED"],
      RESULTS_READY: ["PUBLISHED", "PROCESSING"], // "PROCESSING" for re-run
      PUBLISHED: ["ARCHIVED"],
      ARCHIVED: [],
      CANCELLED: ["DRAFT"],
    };

    const allowed = allowedMap[current] || [];
    return allowed.includes(next);
  }

  /**
   * Computes deterministic SHA-256 hash of the frozen question snapshot to guarantee paper immutability.
   */
  static computePaperHash(
    mockTestId: string,
    questions: LiveTestQuestionSnapshot[],
    sections: LiveTestSectionSnapshot[]
  ): string {
    const serialized = JSON.stringify({
      mockTestId,
      questions: [...questions].sort((a, b) => a.sequence_order - b.sequence_order),
      sections: [...sections].sort((a, b) => a.sequence_order - b.sequence_order),
    });
    return crypto.createHash("sha256").update(serialized).digest("hex");
  }

  /**
   * Creates a new Live Test Event in DRAFT or SCHEDULED state.
   */
  static async createLiveEvent(
    dto: CreateLiveEventDTO,
    actorId: string
  ): Promise<{ success: boolean; data?: LiveTestEvent; error?: string }> {
    const adminSb = createAdminServerSupabaseClient();

    // 1. Validate dates
    const regStart = new Date(dto.registration_start_at).getTime();
    const regEnd = new Date(dto.registration_end_at).getTime();
    const evStart = new Date(dto.event_start_at).getTime();
    const evEnd = new Date(dto.event_end_at).getTime();

    if (regStart > regEnd) {
      return { success: false, error: "Registration start must be before registration end." };
    }
    if (evStart >= evEnd) {
      return { success: false, error: "Event start must be before event end." };
    }

    const initialStatus: LiveEventStatus = "DRAFT";

    const { data, error } = await (adminSb as any)
      .from("live_test_events")
      .insert({
        exam_id: dto.exam_id,
        mock_test_id: dto.mock_test_id,
        title: dto.title,
        slug: dto.slug,
        description: dto.description || null,
        banner_url: dto.banner_url || null,
        status: initialStatus,
        registration_start_at: dto.registration_start_at,
        registration_end_at: dto.registration_end_at,
        event_start_at: dto.event_start_at,
        event_end_at: dto.event_end_at,
        late_join_cutoff_minutes: dto.late_join_cutoff_minutes ?? 15,
        grace_period_seconds: dto.grace_period_seconds ?? 300,
        result_publish_at: dto.result_publish_at || null,
        duration_minutes: dto.duration_minutes,
        max_participants: dto.max_participants || null,
        is_premium_only: dto.is_premium_only ?? false,
        cl_coin_entry_fee: dto.cl_coin_entry_fee ?? 0,
        cl_coin_reward_pool: dto.cl_coin_reward_pool ?? 0,
      })
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // Record audit log
    await this.recordAuditLog(data.id, "CREATE_EVENT", actorId, null, data, "Initial event creation");

    return { success: true, data };
  }

  /**
   * Retrieves a live test event by ID or slug.
   */
  static async getLiveEvent(idOrSlug: string): Promise<LiveTestEvent | null> {
    const adminSb = createAdminServerSupabaseClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

    const query = (adminSb as any).from("live_test_events").select("*");
    if (isUuid) {
      query.eq("id", idOrSlug);
    } else {
      query.eq("slug", idOrSlug);
    }

    const { data } = await query.maybeSingle();
    return data || null;
  }

  /**
   * Transitions an event to a new status with mandatory state validation and audit logging.
   */
  static async transitionEventStatus(
    eventId: string,
    nextStatus: LiveEventStatus,
    actorId: string,
    reason: string
  ): Promise<{ success: boolean; data?: LiveTestEvent; error?: string }> {
    if (!reason || reason.trim().length < 5) {
      return { success: false, error: "A valid reason (minimum 5 characters) is required for status transition." };
    }

    const adminSb = createAdminServerSupabaseClient();

    const { data: currentEvent } = await (adminSb as any)
      .from("live_test_events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();

    if (!currentEvent) {
      return { success: false, error: "Event not found." };
    }

    const isValid = this.validateStateTransition(currentEvent.status, nextStatus);
    if (!isValid) {
      return {
        success: false,
        error: `Invalid transition from ${currentEvent.status} to ${nextStatus}.`,
      };
    }

    const { data: updatedEvent, error } = await (adminSb as any)
      .from("live_test_events")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", eventId)
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    await this.recordAuditLog(eventId, "TRANSITION_STATUS", actorId, currentEvent, updatedEvent, reason);

    return { success: true, data: updatedEvent };
  }

  /**
   * Generates and freezes immutable Live Test Instance (READY state paper freeze).
   */
  static async freezeLiveInstance(
    eventId: string,
    actorId: string
  ): Promise<{ success: boolean; instance?: LiveTestInstance; error?: string }> {
    const adminSb = createAdminServerSupabaseClient();

    const event = await this.getLiveEvent(eventId);
    if (!event) return { success: false, error: "Event not found" };

    // Fetch mock test structure
    const { data: testData } = await (adminSb as any)
      .from("mock_tests")
      .select("id, duration_minutes, total_questions, total_marks")
      .eq("id", event.mock_test_id)
      .maybeSingle();

    if (!testData) return null as any;

    const { data: sections } = await (adminSb as any)
      .from("mock_sections")
      .select("id, name, sequence_order, total_questions, total_marks")
      .eq("mock_test_id", event.mock_test_id)
      .order("sequence_order", { ascending: true });

    const sectionSnapshots: LiveTestSectionSnapshot[] = (sections || []).map((s: any) => ({
      section_id: s.id,
      name: s.name,
      sequence_order: s.sequence_order,
      total_questions: s.total_questions,
      total_marks: Number(s.total_marks),
    }));

    const { data: questions } = await (adminSb as any)
      .from("mock_questions")
      .select("id, current_version_id, mock_section_id, sequence_order, marks, negative_marks")
      .in("mock_section_id", sectionSnapshots.map((s) => s.section_id))
      .order("sequence_order", { ascending: true });

    const questionSnapshots: LiveTestQuestionSnapshot[] = (questions || []).map((q: any) => ({
      mock_question_id: q.id,
      question_version_id: q.current_version_id,
      section_id: q.mock_section_id,
      sequence_order: q.sequence_order,
      marks: Number(q.marks),
      negative_marks: Number(q.negative_marks),
    }));

    const paperHash = this.computePaperHash(event.mock_test_id, questionSnapshots, sectionSnapshots);

    const { data: instance, error } = await (adminSb as any)
      .from("live_test_instances")
      .upsert(
        {
          live_test_event_id: eventId,
          mock_test_id: event.mock_test_id,
          frozen_paper_hash: paperHash,
          total_questions: testData.total_questions,
          total_marks: testData.total_marks,
          duration_minutes: testData.duration_minutes,
          question_snapshots: questionSnapshots,
          section_snapshots: sectionSnapshots,
          status: "FROZEN",
          frozen_at: new Date().toISOString(),
        },
        { onConflict: "live_test_event_id" }
      )
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    await this.recordAuditLog(eventId, "FREEZE_INSTANCE", actorId, null, instance, "Paper instance frozen with SHA-256 hash");

    return { success: true, instance };
  }

  /**
   * Records immutable administrative audit trail entry.
   */
  static async recordAuditLog(
    eventId: string | null,
    action: string,
    actorId: string,
    oldState: any,
    newState: any,
    reason: string
  ): Promise<void> {
    try {
      const adminSb = createAdminServerSupabaseClient();
      await (adminSb as any).from("live_test_audit_logs").insert({
        live_test_event_id: eventId,
        action,
        actor_id: actorId,
        old_state: oldState || null,
        new_state: newState || null,
        reason,
      });
    } catch (err) {
      console.error("Failed to record Live Test audit log:", err);
    }
  }
}
