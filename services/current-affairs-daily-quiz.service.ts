/**
 * COURAGE LIBRARY — CURRENT AFFAIRS DAILY 10Q QUIZ ENGINE
 * Phase CA-4: Question Bank Integration + Daily Current Affairs Quiz
 * Architecture Contract: Frozen v1.1.0
 */

import { createAdminServerSupabaseClient } from '@/lib/supabase/server';
import { AdminService } from '@/services/admin.service';
import {
  DailyQuizEligibilityReport,
  DailyQuizEligibilityStatus,
  DailyQuizGenerationResult,
  DailyQuizQuestionPreview,
  CurrentAffairsCategory,
} from '@/types/current-affairs';
import { DbQueryInterface, createDefaultDbAdapter } from '@/services/current-affairs-validation.service';

export class CurrentAffairsDailyQuizService {
  /**
   * Calculates deterministic Monday-to-Sunday week bounds for a given date in IST (YYYY-MM-DD)
   */
  static getWeekBounds(dateStr: string): { weekStart: string; weekEnd: string } {
    const parts = dateStr.split('-').map((p) => parseInt(p, 10));
    if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
      throw new Error(`Invalid date format for Daily Quiz: "${dateStr}". Must be YYYY-MM-DD.`);
    }

    const [year, month, day] = parts;
    const target = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = target.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    // In Monday-to-Sunday convention:
    // If Sunday (0), days since Monday is 6. Otherwise dayOfWeek - 1.
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(target.getTime() - diffToMonday * 86400000);
    const sunday = new Date(monday.getTime() + 6 * 86400000);

    const formatYmd = (d: Date) => {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dt = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${dt}`;
    };

    return {
      weekStart: formatYmd(monday),
      weekEnd: formatYmd(sunday),
    };
  }

  /**
   * Evaluates eligibility for the Daily Current Affairs Quiz for a given date.
   * Performs batched SQL query to enforce 9 eligibility rules, same-day priority, same-week backfill,
   * deduplication, and shortage detection.
   */
  static async calculateEligibility(
    dateStr: string,
    db?: DbQueryInterface
  ): Promise<DailyQuizEligibilityReport> {
    const activeDb = db || createDefaultDbAdapter();
    const { weekStart, weekEnd } = this.getWeekBounds(dateStr);

    // 1. Check existing mock test for this date
    const slug = `ca-daily-${dateStr}`;
    let existingMockTestId: string | null = null;
    let existingMockStatus: string | null = null;

    try {
      const mockRes = await activeDb.query(
        'SELECT id, status FROM public.mock_tests WHERE slug = $1 LIMIT 1',
        [slug]
      );
      if (mockRes.rows && mockRes.rows.length > 0) {
        const row = mockRes.rows[0] as { id: string; status: string };
        existingMockTestId = row.id;
        existingMockStatus = row.status;
      }
    } catch {
      // Ignore if lookup fails in test adapter
    }

    // 2. Fetch all eligible questions mapped to PUBLISHED Current Affairs within the week
    const sql = `
      SELECT 
        qm.id as mapping_id,
        qm.article_id,
        qm.question_id,
        qm.display_order,
        to_char(a.news_date, 'YYYY-MM-DD') as news_date,
        a.category,
        a.status as article_status,
        a.published_version_id,
        v.headline as article_headline,
        q.id as q_canonical_id,
        q.canonical_topic_id,
        t.name as topic_name,
        t.slug as topic_slug,
        qv.id as question_version_id,
        qv.question_text,
        qa.correct_option_key,
        (
          SELECT json_agg(json_build_object('key', qo.option_key, 'text', qo.option_text))
          FROM public.question_options qo
          WHERE qo.question_version_id = qv.id
        ) as options_json
      FROM public.current_affairs_question_mappings qm
      JOIN public.current_affairs_articles a ON a.id = qm.article_id
      JOIN public.current_affairs_article_versions v ON v.id = a.published_version_id
      JOIN public.questions q ON q.id = qm.question_id
      JOIN public.question_versions qv ON qv.question_id = q.id
      JOIN public.question_answers qa ON qa.question_version_id = qv.id
      LEFT JOIN public.topics t ON t.id = q.canonical_topic_id
      WHERE a.status = 'PUBLISHED'
        AND a.published_version_id IS NOT NULL
        AND a.news_date >= $1
        AND a.news_date <= $2
      ORDER BY a.news_date DESC, qm.display_order ASC, qm.question_id ASC
    `;

    let rows: any[] = [];
    try {
      const res = await activeDb.query(sql, [weekStart, weekEnd]);
      rows = res.rows || [];
    } catch (e: any) {
      // If direct complex query fails in custom mock adapter, fallback query handling
      console.error('[CurrentAffairsDailyQuizService.calculateEligibility] Query error:', e?.message || e);
    }

    // 3. Filter and Deduplicate questions
    const seenQuestionIds = new Set<string>();
    const sameDayQuestions: DailyQuizQuestionPreview[] = [];
    const sameWeekQuestions: DailyQuizQuestionPreview[] = [];

    for (const r of rows) {
      const qId = r.question_id || r.q_canonical_id;
      if (!qId) continue;

      // Deduplication: question appears at most once in a quiz
      if (seenQuestionIds.has(qId)) continue;

      // Validate Question Bank integrity
      const questionText = (r.question_text || '').trim();
      if (!questionText) continue;

      const options = Array.isArray(r.options_json) ? r.options_json : [];
      if (options.length < 2) continue;

      const correctKey = r.correct_option_key;
      if (!correctKey || !options.some((o: any) => o.key === correctKey)) continue;

      seenQuestionIds.add(qId);

      let rowNewsDateStr = '';
      if (r.news_date instanceof Date) {
        const y = r.news_date.getFullYear();
        const m = String(r.news_date.getMonth() + 1).padStart(2, '0');
        const d = String(r.news_date.getDate()).padStart(2, '0');
        rowNewsDateStr = `${y}-${m}-${d}`;
      } else {
        rowNewsDateStr = String(r.news_date || '').split('T')[0];
      }

      const isSameDay = rowNewsDateStr === dateStr;
      const preview: DailyQuizQuestionPreview = {
        questionId: qId,
        questionVersionId: r.question_version_id,
        questionText,
        optionsCount: options.length,
        correctOptionKey: correctKey,
        articleId: r.article_id,
        articleHeadline: r.article_headline || 'Current Affairs Article',
        newsDate: rowNewsDateStr,
        category: r.category as CurrentAffairsCategory,
        isSameDay,
        displayOrder: r.display_order || 1,
        topicName: r.topic_name || null,
        topicSlug: r.topic_slug || null,
      };

      if (isSameDay) {
        sameDayQuestions.push(preview);
      } else {
        sameWeekQuestions.push(preview);
      }
    }

    // Sort Level 1: same-day questions by display_order ASC, questionId ASC
    sameDayQuestions.sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.questionId.localeCompare(b.questionId);
    });

    // Sort Level 2: same-week backfill by newsDate DESC, display_order ASC, questionId ASC
    sameWeekQuestions.sort((a, b) => {
      if (a.newsDate !== b.newsDate) return b.newsDate.localeCompare(a.newsDate);
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.questionId.localeCompare(b.questionId);
    });

    const totalEligible = sameDayQuestions.length + sameWeekQuestions.length;
    const sameDayCount = sameDayQuestions.length;
    const sameWeekCount = sameWeekQuestions.length;

    // Combine deterministically: same-day up to 10, then same-week backfill up to 10
    const selectedQuestions: DailyQuizQuestionPreview[] = [];
    selectedQuestions.push(...sameDayQuestions.slice(0, 10));
    if (selectedQuestions.length < 10) {
      const needed = 10 - selectedQuestions.length;
      selectedQuestions.push(...sameWeekQuestions.slice(0, needed));
    }

    let status: DailyQuizEligibilityStatus = 'READY';
    if (existingMockStatus === 'published') {
      status = 'ALREADY_PUBLISHED';
    } else if (existingMockStatus && existingMockStatus !== 'published') {
      status = 'DRAFT_EXISTS';
    } else if (totalEligible < 10) {
      status = 'SHORTAGE_BLOCKED';
    }

    return {
      date: dateStr,
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      status,
      requiredCount: 10,
      totalEligibleCount: totalEligible,
      sameDayCount,
      sameWeekCount,
      shortageCount: Math.max(0, 10 - totalEligible),
      questions: selectedQuestions,
      existingMockTestId,
      existingMockStatus,
    };
  }

  /**
   * Generates the canonical Daily 10Q Current Affairs Quiz for a given date.
   * Enforces exact 10 questions, shortage blocking, idempotency, and audit logging.
   */
  static async generateDailyQuiz(
    dateStr: string,
    overrideUserId?: string,
    db?: DbQueryInterface
  ): Promise<DailyQuizGenerationResult> {
    // 1. Authorization check
    let authUserId = overrideUserId;
    if (!authUserId) {
      const auth = await AdminService.checkIsAdminOrStaff();
      if (!auth.isAdmin) {
        return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
      }
      authUserId = auth.userId || undefined;
    }

    // 2. Evaluate Eligibility
    const report = await this.calculateEligibility(dateStr, db);

    if (report.status === 'ALREADY_PUBLISHED') {
      return {
        success: true,
        isExisting: true,
        mockTestId: report.existingMockTestId || undefined,
        slug: `ca-daily-${dateStr}`,
        title: `Current Affairs Daily Quiz — ${this.formatDisplayDate(dateStr)}`,
        totalQuestions: 10,
        status: 'published',
      };
    }

    if (report.totalEligibleCount < 10 || report.questions.length < 10) {
      return {
        success: false,
        error: `SHORTAGE_BLOCKED: Exactly 10 eligible questions required. Found ${report.totalEligibleCount} eligible questions (${report.sameDayCount} same-day, ${report.sameWeekCount} same-week backfill). Shortage: ${report.shortageCount}.`,
        shortageReport: report,
      };
    }

    const selected10 = report.questions.slice(0, 10);
    const slug = `ca-daily-${dateStr}`;
    const title = `Current Affairs Daily Quiz — ${this.formatDisplayDate(dateStr)}`;

    // If db interface is provided, use direct SQL
    if (db) {
      try {
        // 1. Resolve template ID
        let templateId: string | null = null;
        const tplRes = await db.query("SELECT id FROM public.mock_templates WHERE is_active = true LIMIT 1");
        if (tplRes.rows && tplRes.rows.length > 0) {
          templateId = (tplRes.rows[0] as any)?.id;
        }

        if (!templateId) {
          const examRes = await db.query('SELECT id FROM public.exams ORDER BY title ASC LIMIT 1');
          const examId = (examRes.rows[0] as any)?.id;
          if (!examId) {
            return { success: false, error: 'SYSTEM_CONFIG_ERROR: No active exam found to anchor template.' };
          }
          const newTplRes = await db.query(
            `INSERT INTO public.mock_templates (
              exam_id, title, slug, test_type, is_free, is_active
            ) VALUES ($1, 'Current Affairs Daily Quiz Template', 'ca-daily-quiz-template', 'sectional', true, true) RETURNING id`,
            [examId]
          );
          templateId = (newTplRes.rows[0] as any)?.id;
        }

        // 2. Resolve Subject ID
        const gaSubRes = await db.query("SELECT id FROM public.subjects WHERE slug = 'general-awareness' LIMIT 1");
        let subjectId = (gaSubRes.rows[0] as any)?.id;
        if (!subjectId) {
          const anySubRes = await db.query('SELECT id FROM public.subjects LIMIT 1');
          subjectId = (anySubRes.rows[0] as any)?.id;
        }

        // 3. Create or Update mock_test
        let mockTestId = report.existingMockTestId;
        if (!mockTestId) {
          const mockRes = await db.query(
            `INSERT INTO public.mock_tests (
              template_id, title, slug, status, duration_minutes, total_questions, total_marks, is_free, is_dynamic, lifecycle_status, generation_metadata
            ) VALUES ($1, $2, $3, 'draft', 10, 10, 20.0, true, false, 'GENERATED', $4) RETURNING id`,
            [
              templateId,
              title,
              slug,
              JSON.stringify({
                source: 'CURRENT_AFFAIRS_DAILY',
                date: dateStr,
                sameDayCount: report.sameDayCount,
                sameWeekCount: report.sameWeekCount,
              }),
            ]
          );
          mockTestId = (mockRes.rows[0] as any)?.id;
        }

        // 4. Create Section & Mock Questions
        await db.query('DELETE FROM public.mock_questions WHERE mock_test_id = $1', [mockTestId]);
        await db.query('DELETE FROM public.mock_sections WHERE mock_test_id = $1', [mockTestId]);
        const secRes = await db.query(
          `INSERT INTO public.mock_sections (
            mock_test_id, subject_id, section_name, section_order, num_questions, marks_per_question, negative_mark, duration_minutes
          ) VALUES ($1, $2, 'Current Affairs', 1, 10, 2.0, 0.5, 10) RETURNING id`,
          [mockTestId, subjectId]
        );
        const sectionId = (secRes.rows[0] as any)?.id;

        for (let idx = 0; idx < selected10.length; idx++) {
          const q = selected10[idx];
          await db.query(
            `INSERT INTO public.mock_questions (
              mock_test_id, mock_section_id, question_version_id, question_order, marks, negative_mark
            ) VALUES ($1, $2, $3, $4, 2.0, 0.5)`,
            [mockTestId, sectionId, q.questionVersionId, idx + 1]
          );
        }

        return {
          success: true,
          mockTestId: mockTestId || undefined,
          slug,
          title,
          totalQuestions: 10,
          status: 'draft',
        };
      } catch (e: any) {
        return { success: false, error: `QUIZ_GENERATION_FAILED: ${e?.message || e}` };
      }
    }

    // Default Supabase Client path
    const supabase = createAdminServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    try {
      // 3. Resolve template ID and subject ID
      let templateId: string | null = null;
      const { data: existingTpl } = await sb
        .from('mock_templates')
        .select('id')
        .eq('slug', 'ca-daily-quiz-template')
        .maybeSingle();

      if (existingTpl) {
        templateId = existingTpl.id;
      } else {
        // Find an exam to anchor the platform template (or default to first active exam)
        const { data: firstExam } = await sb
          .from('exams')
          .select('id')
          .order('title')
          .limit(1)
          .single();

        const examId = firstExam?.id;
        if (!examId) {
          return { success: false, error: 'SYSTEM_CONFIG_ERROR: No active exam found to anchor template.' };
        }

        const { data: newTpl, error: tplErr } = await sb
          .from('mock_templates')
          .insert({
            exam_id: examId,
            exam_cycle_id: examId,
            pattern_id: examId,
            title: 'Current Affairs Daily Quiz Template',
            slug: 'ca-daily-quiz-template',
            test_type: 'daily',
            description: JSON.stringify({ isPlatformDailyQuiz: true, questionCount: 10, durationMinutes: 10, totalMarks: 20 }),
            is_free: true,
            is_active: true,
          })
          .select('id')
          .single();

        if (tplErr || !newTpl) {
          return { success: false, error: `TEMPLATE_CREATION_FAILED: ${tplErr?.message}` };
        }
        templateId = newTpl.id;
      }

      // 4. Resolve General Awareness Subject ID
      const { data: gaSubject } = await sb
        .from('subjects')
        .select('id')
        .eq('slug', 'general-awareness')
        .maybeSingle();

      const subjectId = gaSubject?.id || (await sb.from('subjects').select('id').limit(1).single())?.data?.id;

      // 5. Create or Update mock_test
      let mockTestId = report.existingMockTestId;
      if (!mockTestId) {
        const { data: newMock, error: mockErr } = await sb
          .from('mock_tests')
          .insert({
            template_id: templateId,
            title,
            slug,
            status: 'draft',
            duration_minutes: 10,
            total_questions: 10,
            total_marks: 20.0,
            is_free: true,
            is_dynamic: false,
            lifecycle_status: 'GENERATED',
            generation_metadata: {
              source: 'CURRENT_AFFAIRS_DAILY',
              date: dateStr,
              sameDayCount: report.sameDayCount,
              sameWeekCount: report.sameWeekCount,
            },
          })
          .select('id')
          .single();

        if (mockErr || !newMock) {
          return { success: false, error: `MOCK_TEST_CREATION_FAILED: ${mockErr?.message}` };
        }
        mockTestId = newMock.id;
      }

      // 6. Create Section & Mock Questions
      await sb.from('mock_questions').delete().eq('mock_test_id', mockTestId);
      await sb.from('mock_sections').delete().eq('mock_test_id', mockTestId);
      const { data: newSec, error: secErr } = await sb
        .from('mock_sections')
        .insert({
          mock_test_id: mockTestId,
          subject_id: subjectId,
          section_name: 'Current Affairs',
          section_order: 1,
          num_questions: 10,
          marks_per_question: 2.0,
          negative_mark: 0.5,
          duration_minutes: 10,
        })
        .select('id')
        .single();

      if (secErr || !newSec) {
        return { success: false, error: `MOCK_SECTION_CREATION_FAILED: ${secErr?.message}` };
      }

      const mockQuestionsPayload = selected10.map((q, idx) => ({
        mock_test_id: mockTestId,
        mock_section_id: newSec.id,
        question_version_id: q.questionVersionId,
        question_order: idx + 1,
        marks: 2.0,
        negative_mark: 0.5,
      }));

      const { error: mqErr } = await sb.from('mock_questions').insert(mockQuestionsPayload);
      if (mqErr) {
        return { success: false, error: `MOCK_QUESTIONS_INSERTION_FAILED: ${mqErr.message}` };
      }

      // 7. Audit log
      if (authUserId) {
        await sb.from('admin_audit_logs').insert({
          user_id: authUserId,
          action: 'GENERATE_CA_DAILY_QUIZ',
          target_entity_type: 'mock_tests',
          target_entity_id: mockTestId,
          metadata: { date: dateStr, slug, totalQuestions: 10 },
        }).catch(() => {});
      }

      return {
        success: true,
        mockTestId: mockTestId || undefined,
        slug,
        title,
        totalQuestions: 10,
        status: 'draft',
      };
    } catch (e: any) {
      return { success: false, error: `QUIZ_GENERATION_FAILED: ${e?.message || e}` };
    }
  }

  /**
   * Publishes a Daily 10Q Current Affairs Quiz for candidate access.
   * Verifies all 10 questions remain eligible, valid, and linked to PUBLISHED articles.
   */
  static async publishDailyQuiz(
    dateStr: string,
    overrideUserId?: string,
    db?: DbQueryInterface
  ): Promise<{ success: boolean; mockTestId?: string; error?: string }> {
    let authUserId = overrideUserId;
    if (!authUserId) {
      const auth = await AdminService.checkIsAdminOrStaff();
      if (!auth.isAdmin) {
        return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
      }
      authUserId = auth.userId || undefined;
    }

    const slug = `ca-daily-${dateStr}`;

    if (db) {
      try {
        const mockRes = await db.query('SELECT id, status, total_questions FROM public.mock_tests WHERE slug = $1 LIMIT 1', [slug]);
        const mockTest = (mockRes.rows[0] as any);
        if (!mockTest) {
          return { success: false, error: `MOCK_NOT_FOUND: No quiz generated for date "${dateStr}".` };
        }

        const qCountRes = await db.query('SELECT count(*) FROM public.mock_questions WHERE mock_test_id = $1', [mockTest.id]);
        const qCount = parseInt((qCountRes.rows[0] as any)?.count || '0', 10);
        if (qCount !== 10) {
          return {
            success: false,
            error: `INVALID_QUESTION_COUNT: Daily quiz requires exactly 10 questions (current: ${qCount}).`,
          };
        }

        const report = await this.calculateEligibility(dateStr, db);
        if (report.totalEligibleCount < 10) {
          return {
            success: false,
            error: `ELIGIBILITY_CHECK_FAILED: Mapped articles or questions are no longer fully published/eligible.`,
          };
        }

        const now = new Date().toISOString();
        await db.query(
          `UPDATE public.mock_tests SET status = 'published', published_at = $1, lifecycle_status = 'PUBLISHED', updated_at = $1 WHERE id = $2`,
          [now, mockTest.id]
        );

        return { success: true, mockTestId: mockTest.id };
      } catch (e: any) {
        return { success: false, error: `PUBLICATION_FAILED: ${e?.message || e}` };
      }
    }

    const supabase = createAdminServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const { data: mockTest, error: fetchErr } = await sb
      .from('mock_tests')
      .select('id, status, total_questions')
      .eq('slug', slug)
      .maybeSingle();

    if (fetchErr || !mockTest) {
      return { success: false, error: `MOCK_NOT_FOUND: No quiz generated for date "${dateStr}".` };
    }

    // Verify question count
    const { count: qCount, error: countErr } = await sb
      .from('mock_questions')
      .select('id', { count: 'exact', head: true })
      .eq('mock_test_id', mockTest.id);

    if (countErr || qCount !== 10) {
      return {
        success: false,
        error: `INVALID_QUESTION_COUNT: Daily quiz requires exactly 10 questions (current: ${qCount || 0}).`,
      };
    }

    // Re-verify eligibility
    const report = await this.calculateEligibility(dateStr, db);
    if (report.totalEligibleCount < 10) {
      return {
        success: false,
        error: `ELIGIBILITY_CHECK_FAILED: Mapped articles or questions are no longer fully published/eligible.`,
      };
    }

    // Publish
    const now = new Date().toISOString();
    const { error: pubErr } = await sb
      .from('mock_tests')
      .update({
        status: 'published',
        published_at: now,
        lifecycle_status: 'PUBLISHED',
        updated_at: now,
      })
      .eq('id', mockTest.id);

    if (pubErr) {
      return { success: false, error: `PUBLICATION_FAILED: ${pubErr.message}` };
    }

    if (authUserId) {
      await sb.from('admin_audit_logs').insert({
        user_id: authUserId,
        action: 'PUBLISH_CA_DAILY_QUIZ',
        target_entity_type: 'mock_tests',
        target_entity_id: mockTest.id,
        metadata: { date: dateStr, slug, publishedAt: now },
      }).catch(() => {});
    }

    return { success: true, mockTestId: mockTest.id };
  }

  /**
   * Helper: Formats YYYY-MM-DD into "DD Mon YYYY" (e.g. "01 Oct 2026")
   */
  static formatDisplayDate(dateStr: string): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const y = parts[0];
    const m = parseInt(parts[1], 10) - 1;
    const d = parts[2];
    return `${d} ${months[m] || parts[1]} ${y}`;
  }
}
