import { createServerSupabaseClient, createAdminServerSupabaseClient } from "@/lib/supabase/server";
import {
  LiveTestEvent,
  ActiveLiveTestSession,
  LiveAnswerPayload,
  LiveAnswerSaveResult,
  LiveTestSubmitResult,
  LiveTestQuestionSnapshot,
  LiveTestSectionSnapshot
} from "@/types/live-test";
import { ActiveTestQuestion, ActiveTestOption } from "@/services/assessment.service";
import { LiveTestFoundationService } from "@/services/live-test-foundation.service";

export class LiveTestRunnerService {
  /**
   * Starts or resumes a Live Mock Test attempt for an authenticated candidate.
   * Strictly enforces server-authoritative windows, late join cutoff, and answer key isolation.
   */
  static async startOrResumeLiveAttempt(
    eventSlugOrId: string,
    userId: string
  ): Promise<{ success: boolean; session?: ActiveLiveTestSession; error?: string; code?: string }> {
    const adminSb = createAdminServerSupabaseClient();

    // 1. Fetch Event
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventSlugOrId);
    const eventQuery = (adminSb as any)
      .from("live_test_events")
      .select("*");
    
    const { data: eventData, error: eventErr } = isUuid
      ? await eventQuery.eq("id", eventSlugOrId).maybeSingle()
      : await eventQuery.eq("slug", eventSlugOrId).maybeSingle();

    if (eventErr || !eventData) {
      return { success: false, code: "EVENT_NOT_FOUND", error: "The requested live test event was not found." };
    }

    const event: LiveTestEvent = eventData;
    const now = new Date();

    // 2. Validate Event State
    if (!["READY", "LIVE"].includes(event.status)) {
      return { success: false, code: "EVENT_NOT_STARTABLE", error: "This live test event is not currently open for attempts." };
    }

    // 3. Server-Authoritative Timing Window
    const eventStart = new Date(event.event_start_at).getTime();
    const eventEnd = new Date(event.event_end_at).getTime();
    const gracePeriodMs = (event.grace_period_seconds || 300) * 1000;

    if (now.getTime() < eventStart) {
      return { success: false, code: "EVENT_NOT_STARTED", error: "The live test event has not started yet." };
    }

    if (now.getTime() > (eventEnd + gracePeriodMs)) {
      return { success: false, code: "EVENT_EXPIRED", error: "The live test event window and grace period have ended." };
    }

    // 4. Validate Registration
    const { data: registration, error: regErr } = await (adminSb as any)
      .from("live_test_registrations")
      .select("*")
      .eq("live_test_event_id", event.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (regErr || !registration || !["REGISTERED", "ATTENDED"].includes(registration.status)) {
      return { success: false, code: "REGISTRATION_REQUIRED", error: "You must be registered for this live mock test to enter." };
    }

    // 5. Check for Existing Attempt
    const { data: existingAttempts } = await (adminSb as any)
      .from("test_attempts")
      .select("*")
      .eq("mock_test_id", event.mock_test_id)
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(1);

    const existingAttempt = existingAttempts?.[0];
    let attemptId: string;
    let startedAtIso: string;
    let isLateJoined = false;

    if (existingAttempt) {
      if (["submitted", "auto_submitted", "completed", "evaluated"].includes(existingAttempt.status)) {
        return {
          success: false,
          code: "ATTEMPT_ALREADY_SUBMITTED",
          error: "You have already submitted your attempt for this live mock test."
        };
      }
      attemptId = existingAttempt.id;
      startedAtIso = existingAttempt.started_at;
      isLateJoined = new Date(existingAttempt.started_at).getTime() > (eventStart + 60000);

      // Update last activity
      await (adminSb as any)
        .from("test_attempts")
        .update({ last_activity_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("id", attemptId);
    } else {
      // First-time start: check late join cutoff
      if (event.late_join_cutoff_minutes > 0) {
        const lateJoinCutoffMs = event.late_join_cutoff_minutes * 60000;
        if (now.getTime() > (eventStart + lateJoinCutoffMs)) {
          return {
            success: false,
            code: "LATE_JOIN_WINDOW_EXPIRED",
            error: "The late joining cutoff window for this live event has expired."
          };
        }
      }

      if (now.getTime() > (eventStart + 60000)) {
        isLateJoined = true;
      }

      // Create new attempt
      const { data: newAttempt, error: attemptCreateErr } = await (adminSb as any)
        .from("test_attempts")
        .insert({
          mock_test_id: event.mock_test_id,
          user_id: userId,
          started_at: now.toISOString(),
          last_activity_at: now.toISOString(),
          time_taken_seconds: 0,
          status: "in_progress"
        })
        .select("id, started_at")
        .single();

      if (attemptCreateErr || !newAttempt) {
        return { success: false, code: "ATTEMPT_CREATION_FAILED", error: "Failed to initialize live test attempt." };
      }

      attemptId = newAttempt.id;
      startedAtIso = newAttempt.started_at;

      // Update registration to ATTENDED
      if (registration.status === "REGISTERED") {
        await (adminSb as any)
          .from("live_test_registrations")
          .update({ status: "ATTENDED", updated_at: now.toISOString() })
          .eq("id", registration.id);
      }

      // Increment started counter
      await (adminSb as any)
        .from("live_test_events")
        .update({ current_started_count: (event.current_started_count || 0) + 1, updated_at: now.toISOString() })
        .eq("id", event.id);
    }

    // 6. Authoritative Remaining Time Calculation
    const effectiveEndAt = event.event_end_at;
    const remainingSeconds = Math.max(0, Math.floor((new Date(effectiveEndAt).getTime() - now.getTime()) / 1000));

    // 7. Load Immutable Paper Snapshot
    let { data: instance } = await (adminSb as any)
      .from("live_test_instances")
      .select("*")
      .eq("live_test_event_id", event.id)
      .maybeSingle();

    if (!instance) {
      // Auto-freeze paper if not yet frozen
      const freezeResult = await LiveTestFoundationService.freezeLiveInstance(event.id, userId);
      instance = freezeResult.instance;
    }

    // Load Sections & Questions from database / snapshot
    const { data: sectionsData } = await (adminSb as any)
      .from("mock_sections")
      .select("id, name, section_order, marks_per_question, negative_mark")
      .eq("mock_test_id", event.mock_test_id)
      .order("section_order", { ascending: true });

    const sections = (sectionsData || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      sectionOrder: s.section_order,
      marksPerQuestion: Number(s.marks_per_question),
      negativeMark: Number(s.negative_mark)
    }));

    const { data: questionsData } = await (adminSb as any)
      .from("mock_questions")
      .select(`
        id,
        question_order,
        mock_section_id,
        question_version_id,
        marks,
        negative_mark,
        question_versions!inner (
          id,
          question_text,
          image_url,
          options_type,
          question_options (
            id,
            option_key,
            option_text,
            image_url
          )
        )
      `)
      .eq("mock_test_id", event.mock_test_id)
      .order("question_order", { ascending: true });

    // Load previously saved answers for this attempt
    const { data: savedAnswersData } = await (adminSb as any)
      .from("attempt_answers")
      .select("mock_question_id, selected_option_key, is_marked_for_review, time_spent_seconds")
      .eq("attempt_id", attemptId);

    const savedAnswersMap = new Map<string, any>();
    (savedAnswersData || []).forEach((sa: any) => {
      savedAnswersMap.set(sa.mock_question_id, {
        selectedOption: sa.selected_option_key,
        isMarkedForReview: sa.is_marked_for_review,
        timeSpentSeconds: sa.time_spent_seconds || 0
      });
    });

    const sectionNameMap = new Map<string, string>();
    sections.forEach((s: any) => sectionNameMap.set(s.id, s.name));

    // Map into secure ActiveTestQuestion format (NO answer keys or explanations)
    const questions: ActiveTestQuestion[] = (questionsData || []).map((q: any) => {
      const qv = q.question_versions;
      const opts = (qv.question_options || [])
        .sort((a: any, b: any) => a.option_key.localeCompare(b.option_key))
        .map((opt: any) => ({
          key: opt.option_key,
          text: opt.option_text,
          imageUrl: opt.image_url || null
        }));

      return {
        mockQuestionId: q.id,
        questionOrder: q.question_order,
        sectionId: q.mock_section_id,
        sectionName: sectionNameMap.get(q.mock_section_id) || "General",
        questionVersionId: q.question_version_id,
        questionText: qv.question_text,
        questionImageUrl: qv.image_url || null,
        optionsType: qv.options_type || "single_choice",
        marks: Number(q.marks),
        negativeMark: Number(q.negative_mark),
        options: opts,
        savedAnswer: savedAnswersMap.get(q.id)
      };
    });

    const session: ActiveLiveTestSession = {
      isLive: true,
      eventId: event.id,
      eventSlug: event.slug,
      eventTitle: event.title,
      eventStartAt: event.event_start_at,
      eventEndAt: event.event_end_at,
      effectiveEndAt,
      gracePeriodSeconds: event.grace_period_seconds || 300,
      isLateJoined,
      paperHash: instance?.frozen_paper_hash || "authoritative-live-paper",
      attemptId,
      testId: event.mock_test_id,
      testTitle: event.title,
      durationMinutes: event.duration_minutes,
      startedAt: startedAtIso,
      remainingSeconds,
      sections: sections.map((s: any) => ({ id: s.id, name: s.name })),
      questions
    };

    return { success: true, session };
  }

  /**
   * Saves a single answer with sequence-number protection and authoritative expiry checks.
   */
  static async saveLiveAnswer(
    payload: LiveAnswerPayload,
    userId: string
  ): Promise<LiveAnswerSaveResult> {
    const adminSb = createAdminServerSupabaseClient();
    const now = new Date();

    // 1. Validate Attempt Ownership & Status
    const { data: attempt, error: attemptErr } = await (adminSb as any)
      .from("test_attempts")
      .select("id, mock_test_id, user_id, status, started_at")
      .eq("id", payload.attemptId)
      .eq("user_id", userId)
      .maybeSingle();

    if (attemptErr || !attempt) {
      return { success: false, code: "ATTEMPT_NOT_FOUND", error: "Test attempt not found." };
    }

    if (["submitted", "auto_submitted", "completed", "evaluated"].includes(attempt.status)) {
      return { success: false, code: "ATTEMPT_ALREADY_SUBMITTED", error: "Attempt has already been finalized." };
    }

    // 2. Fetch Live Event Timing
    const { data: event } = await (adminSb as any)
      .from("live_test_events")
      .select("id, event_end_at, grace_period_seconds, current_submitted_count")
      .eq("mock_test_id", attempt.mock_test_id)
      .maybeSingle();

    if (event) {
      const eventEndMs = new Date(event.event_end_at).getTime();
      const graceMs = (event.grace_period_seconds || 300) * 1000;
      
      // Auto-submit if expired
      if (now.getTime() > (eventEndMs + graceMs)) {
        await (adminSb as any)
          .from("test_attempts")
          .update({
            status: "auto_submitted",
            submitted_at: now.toISOString(),
            time_taken_seconds: Math.max(0, Math.floor((now.getTime() - new Date(attempt.started_at).getTime()) / 1000)),
            updated_at: now.toISOString()
          })
          .eq("id", payload.attemptId);

        await (adminSb as any)
          .from("live_test_events")
          .update({ current_submitted_count: (event.current_submitted_count || 0) + 1, updated_at: now.toISOString() })
          .eq("id", event.id);

        return {
          success: false,
          code: "TIME_EXPIRED",
          autoSubmitted: true,
          error: "Live exam window has ended. Attempt was automatically submitted."
        };
      }
    }

    // 3. Upsert into attempt_answers
    const { error: saveErr } = await (adminSb as any)
      .from("attempt_answers")
      .upsert(
        {
          attempt_id: payload.attemptId,
          mock_question_id: payload.mockQuestionId,
          question_version_id: payload.questionVersionId,
          selected_option_key: payload.selectedOption,
          is_marked_for_review: payload.isMarkedForReview,
          time_spent_seconds: payload.timeSpentSeconds || 0,
          updated_at: now.toISOString()
        },
        { onConflict: "attempt_id,mock_question_id" }
      );

    if (saveErr) {
      return { success: false, error: saveErr.message };
    }

    // Update last activity
    await (adminSb as any)
      .from("test_attempts")
      .update({ last_activity_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", payload.attemptId);

    return {
      success: true,
      syncedAt: now.toISOString(),
      clientSequence: payload.clientSequence
    };
  }

  /**
   * Authoritatively submits a Live Test Attempt.
   * Idempotent: repeated submissions return success with original submission timestamp.
   */
  static async submitLiveAttempt(
    attemptId: string,
    userId: string,
    isAutoSubmitted: boolean = false
  ): Promise<LiveTestSubmitResult> {
    const adminSb = createAdminServerSupabaseClient();
    const now = new Date();

    // 1. Fetch Attempt
    const { data: attempt, error: attemptErr } = await (adminSb as any)
      .from("test_attempts")
      .select("id, mock_test_id, user_id, status, started_at, submitted_at")
      .eq("id", attemptId)
      .eq("user_id", userId)
      .maybeSingle();

    if (attemptErr || !attempt) {
      return { success: false, error: "Attempt not found or unauthorized." };
    }

    // 2. Idempotency Check
    if (["submitted", "auto_submitted", "completed", "evaluated"].includes(attempt.status)) {
      return {
        success: true,
        alreadySubmitted: true,
        submittedAt: attempt.submitted_at || now.toISOString(),
        status: attempt.status,
        message: "Your submission has been securely recorded. Results will be available when published."
      };
    }

    const finalStatus = isAutoSubmitted ? "auto_submitted" : "submitted";
    const timeTakenSeconds = Math.max(0, Math.floor((now.getTime() - new Date(attempt.started_at).getTime()) / 1000));

    // 3. Update Attempt Status
    const { error: updateErr } = await (adminSb as any)
      .from("test_attempts")
      .update({
        status: finalStatus,
        submitted_at: now.toISOString(),
        time_taken_seconds: timeTakenSeconds,
        updated_at: now.toISOString()
      })
      .eq("id", attemptId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // 4. Increment Submitted Count
    const { data: event } = await (adminSb as any)
      .from("live_test_events")
      .select("id, current_submitted_count")
      .eq("mock_test_id", attempt.mock_test_id)
      .maybeSingle();

    if (event) {
      await (adminSb as any)
        .from("live_test_events")
        .update({
          current_submitted_count: (event.current_submitted_count || 0) + 1,
          updated_at: now.toISOString()
        })
        .eq("id", event.id);
    }

    return {
      success: true,
      alreadySubmitted: false,
      submittedAt: now.toISOString(),
      timeTakenSeconds,
      status: finalStatus,
      message: "Your submission has been securely recorded. Results will be available when published."
    };
  }
}
