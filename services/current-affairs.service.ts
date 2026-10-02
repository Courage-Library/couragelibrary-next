/**
 * COURAGE LIBRARY — CANDIDATE CURRENT AFFAIRS READ SERVICE
 * Phase CA-2 / CA-5: Candidate Read Service & Feed Intelligence
 * Architecture Contract: Frozen v1.1.0
 */

import { createPublicServerSupabaseClient, createAdminServerSupabaseClient } from '@/lib/supabase/server';
import {
  CurrentAffairsCategory,
  CurrentAffairsDetail,
  DailyCurrentAffairsFeed,
  CurrentAffairsFeedItem,
  CurrentAffairsImportanceTier,
  CurrentAffairsSourceTier,
  CurrentAffairsStatus,
  CurrentAffairsHubData,
  ALL_CURRENT_AFFAIRS_CATEGORIES,
} from '@/types/current-affairs';
import { DbQueryInterface } from '@/services/current-affairs-validation.service';
import { CurrentAffairsDailyQuizService } from '@/services/current-affairs-daily-quiz.service';

export class CurrentAffairsService {
  /**
   * Helper to get IST (UTC+05:30) date string in YYYY-MM-DD
   */
  static getTodayDateStr(): string {
    const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
    return istNow.toISOString().split('T')[0];
  }

  /**
   * Fetches today's feed in IST (UTC+05:30)
   */
  static async getTodayFeed(examId?: string, db?: DbQueryInterface): Promise<DailyCurrentAffairsFeed> {
    const todayDateStr = this.getTodayDateStr();
    return this.getByDate(todayDateStr, examId, db);
  }

  /**
   * Fetches feed for a specific calendar date (YYYY-MM-DD)
   */
  static async getByDate(
    dateStr: string,
    examId?: string,
    db?: DbQueryInterface
  ): Promise<DailyCurrentAffairsFeed> {
    if (db) {
      try {
        let sql = `
          SELECT 
            a.id,
            a.slug,
            to_char(a.news_date, 'YYYY-MM-DD') as news_date,
            a.category,
            a.importance_tier,
            a.published_at,
            a.daily_quiz_mock_id,
            v.headline,
            v.summary_md,
            v.key_takeaways,
            (SELECT count(*) FROM public.current_affairs_sources s WHERE s.version_id = v.id) as sources_count,
            (SELECT count(*) FROM public.current_affairs_question_mappings qm WHERE qm.article_id = a.id) as questions_count,
            (SELECT count(*) FROM public.current_affairs_learning_mappings lm WHERE lm.article_id = a.id) as learning_count
          FROM public.current_affairs_articles a
          JOIN public.current_affairs_article_versions v ON v.id = a.published_version_id
        `;

        const params: unknown[] = [dateStr];
        if (examId) {
          sql += `
            JOIN public.current_affairs_exam_mappings em ON em.article_id = a.id
            WHERE a.news_date = $1
              AND a.status = 'PUBLISHED'
              AND a.published_version_id IS NOT NULL
              AND em.exam_id = $2
          `;
          params.push(examId);
        } else {
          sql += `
            WHERE a.news_date = $1
              AND a.status = 'PUBLISHED'
              AND a.published_version_id IS NOT NULL
          `;
        }

        sql += ` ORDER BY a.importance_tier ASC, a.created_at DESC`;

        const res = await db.query(sql, params);
        const rows = res.rows || [];

        // Check if there is a daily quiz for this date
        const mockRes = await db.query(
          "SELECT id, status FROM public.mock_tests WHERE slug = $1 AND status = 'published' LIMIT 1",
          [`ca-daily-${dateStr}`]
        );
        const dailyQuizMockId = mockRes.rows?.[0] ? (mockRes.rows[0] as any).id : null;

        const articles: CurrentAffairsFeedItem[] = rows.map((r: any) => ({
          id: r.id,
          slug: r.slug,
          newsDate: r.news_date,
          category: r.category as CurrentAffairsCategory,
          importanceTier: r.importance_tier as CurrentAffairsImportanceTier,
          headline: r.headline,
          summaryMd: r.summary_md,
          keyTakeaways: Array.isArray(r.key_takeaways)
            ? r.key_takeaways
            : typeof r.key_takeaways === 'string'
            ? JSON.parse(r.key_takeaways)
            : [],
          publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
          sourcesCount: parseInt(r.sources_count || '0', 10),
          mappedQuestionsCount: parseInt(r.questions_count || '0', 10),
          mappedLearningUnitsCount: parseInt(r.learning_count || '0', 10),
        }));

        return {
          date: dateStr,
          totalArticles: articles.length,
          articles,
          hasDailyQuiz: Boolean(dailyQuizMockId),
          dailyQuizMockId,
        };
      } catch (e: any) {
        console.error('[CurrentAffairsService.getByDate] DB error:', e?.message || e);
      }
    }

    // Supabase client fallback
    try {
      const supabase = createPublicServerSupabaseClient();

      let query = supabase
        .from('current_affairs_articles')
        .select(`
          id,
          slug,
          news_date,
          category,
          importance_tier,
          published_at,
          daily_quiz_mock_id,
          current_affairs_article_versions!fk_ca_articles_published_version (
            id,
            headline,
            summary_md,
            key_takeaways,
            current_affairs_sources (
              id,
              publisher,
              url,
              tier,
              citation_context
            )
          ),
          current_affairs_question_mappings:current_affairs_question_mappings(count),
          current_affairs_learning_mappings:current_affairs_learning_mappings(count),
          current_affairs_exam_mappings:current_affairs_exam_mappings(exam_id, is_high_yield, relevance_weight)
        `)
        .eq('news_date', dateStr)
        .eq('status', 'PUBLISHED')
        .not('published_version_id', 'is', null)
        .order('importance_tier', { ascending: true });

      if (examId) {
        query = query.filter('current_affairs_exam_mappings.exam_id', 'eq', examId);
      }

      const { data, error } = await query;

      if (error || !data) {
        return {
          date: dateStr,
          totalArticles: 0,
          articles: [],
          hasDailyQuiz: false,
        };
      }

      let dailyQuizMockId: string | null = null;
      const articles: CurrentAffairsFeedItem[] = [];

      data.forEach((row: any) => {
        if (row.daily_quiz_mock_id && !dailyQuizMockId) {
          dailyQuizMockId = row.daily_quiz_mock_id;
        }

        const version = row.current_affairs_article_versions;
        if (!version) return;

        articles.push({
          id: row.id,
          slug: row.slug,
          newsDate: row.news_date,
          category: row.category as CurrentAffairsCategory,
          importanceTier: row.importance_tier as CurrentAffairsImportanceTier,
          headline: version.headline,
          summaryMd: version.summary_md,
          keyTakeaways: Array.isArray(version.key_takeaways) ? version.key_takeaways : [],
          publishedAt: row.published_at,
          sourcesCount: version.current_affairs_sources?.length || 0,
          mappedQuestionsCount: row.current_affairs_question_mappings?.[0]?.count || 0,
          mappedLearningUnitsCount: row.current_affairs_learning_mappings?.[0]?.count || 0,
        });
      });

      // Also check mock_tests for published daily quiz
      if (!dailyQuizMockId) {
        const { data: mockData } = await supabase
          .from('mock_tests')
          .select('id')
          .eq('slug', `ca-daily-${dateStr}`)
          .eq('status', 'published')
          .maybeSingle();
        if (mockData?.id) {
          dailyQuizMockId = mockData.id;
        }
      }

      return {
        date: dateStr,
        totalArticles: articles.length,
        articles,
        hasDailyQuiz: Boolean(dailyQuizMockId),
        dailyQuizMockId,
      };
    } catch {
      return {
        date: dateStr,
        totalArticles: 0,
        articles: [],
        hasDailyQuiz: false,
      };
    }
  }

  /**
   * Fetches full detail of a published Current Affairs article by slug
   */
  static async getBySlug(slug: string, db?: DbQueryInterface): Promise<CurrentAffairsDetail | null> {
    if (db) {
      try {
        const sql = `
          SELECT 
            a.id,
            a.slug,
            to_char(a.news_date, 'YYYY-MM-DD') as news_date,
            a.category,
            a.importance_tier,
            a.status,
            a.published_at,
            v.id as version_id,
            v.version_number,
            v.headline,
            v.summary_md,
            v.key_takeaways,
            v.important_facts,
            v.exam_relevance_notes,
            v.compiled_ast_json,
            v.checksum_sha256
          FROM public.current_affairs_articles a
          JOIN public.current_affairs_article_versions v ON v.id = a.published_version_id
          WHERE a.slug = $1
            AND a.status = 'PUBLISHED'
            AND a.published_version_id IS NOT NULL
          LIMIT 1
        `;

        const res = await db.query(sql, [slug]);
        const row = res.rows?.[0] as any;
        if (!row) return null;

        // Fetch sources
        const sourcesRes = await db.query(
          `SELECT id, title, publisher, url, tier, citation_context FROM public.current_affairs_sources WHERE version_id = $1 ORDER BY tier ASC, created_at ASC`,
          [row.version_id]
        );

        // Fetch taxonomy mappings
        const taxRes = await db.query(
          `SELECT tm.taxonomy_node_id, tm.is_primary, tm.relevance_score, tn.name as node_name, tn.slug as node_slug
           FROM public.current_affairs_taxonomy_mappings tm
           LEFT JOIN public.canonical_taxonomy_nodes tn ON tn.id = tm.taxonomy_node_id
           WHERE tm.article_id = $1`,
          [row.id]
        );

        // Fetch exam mappings
        const examRes = await db.query(
          `SELECT em.exam_id, em.relevance_weight, em.is_high_yield, e.title as exam_title, e.slug as exam_slug
           FROM public.current_affairs_exam_mappings em
           LEFT JOIN public.exams e ON e.id = em.exam_id
           WHERE em.article_id = $1`,
          [row.id]
        );

        // Fetch question mappings
        const qRes = await db.query(
          `SELECT qm.question_id, qm.display_order, qv.question_text
           FROM public.current_affairs_question_mappings qm
           JOIN public.questions q ON q.id = qm.question_id
           LEFT JOIN public.question_versions qv ON qv.question_id = q.id
           WHERE qm.article_id = $1
           ORDER BY qm.display_order ASC`,
          [row.id]
        );

        // Fetch learning mappings
        const learnRes = await db.query(
          `SELECT lm.learning_resource_id, lr.title, lr.slug
           FROM public.current_affairs_learning_mappings lm
           LEFT JOIN public.learning_resources lr ON lr.id = lm.learning_resource_id
           WHERE lm.article_id = $1`,
          [row.id]
        );

        // Fetch related articles
        const relatedArticles = await this.getRelatedArticles(row.category, row.id, 4, db);

        return {
          id: row.id,
          slug: row.slug,
          newsDate: row.news_date,
          category: row.category as CurrentAffairsCategory,
          importanceTier: row.importance_tier as CurrentAffairsImportanceTier,
          status: row.status,
          publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
          versionNumber: row.version_number,
          headline: row.headline,
          summaryMd: row.summary_md,
          keyTakeaways: Array.isArray(row.key_takeaways)
            ? row.key_takeaways
            : typeof row.key_takeaways === 'string'
            ? JSON.parse(row.key_takeaways)
            : [],
          importantFacts: Array.isArray(row.important_facts)
            ? row.important_facts
            : typeof row.important_facts === 'string'
            ? JSON.parse(row.important_facts)
            : [],
          examRelevanceNotes: typeof row.exam_relevance_notes === 'object' && row.exam_relevance_notes
            ? row.exam_relevance_notes
            : typeof row.exam_relevance_notes === 'string'
            ? JSON.parse(row.exam_relevance_notes)
            : {},
          compiledAstJson: typeof row.compiled_ast_json === 'object' && row.compiled_ast_json
            ? row.compiled_ast_json
            : typeof row.compiled_ast_json === 'string'
            ? JSON.parse(row.compiled_ast_json)
            : null,
          checksumSha256: row.checksum_sha256,
          sources: (sourcesRes.rows || []).map((s: any) => ({
            id: s.id,
            title: s.title,
            publisher: s.publisher,
            url: s.url,
            tier: s.tier as CurrentAffairsSourceTier,
            citationContext: s.citation_context,
          })),
          taxonomyMappings: (taxRes.rows || []).map((tm: any) => ({
            taxonomyNodeId: tm.taxonomy_node_id,
            nodeName: tm.node_name || '',
            nodeSlug: tm.node_slug || '',
            isPrimary: tm.is_primary,
            relevanceScore: tm.relevance_score,
          })),
          examMappings: (examRes.rows || []).map((em: any) => ({
            examId: em.exam_id,
            examTitle: em.exam_title || '',
            examSlug: em.exam_slug || '',
            relevanceWeight: em.relevance_weight,
            isHighYield: em.is_high_yield,
          })),
          relatedLearningUnits: (learnRes.rows || []).map((lm: any) => ({
            learningResourceId: lm.learning_resource_id,
            title: lm.title || '',
            slug: lm.slug || '',
          })),
          relatedQuestions: (qRes.rows || []).map((qm: any) => ({
            questionId: qm.question_id,
            questionText: qm.question_text || '',
            displayOrder: qm.display_order,
          })),
          relatedArticles,
        };
      } catch (e: any) {
        console.error('[CurrentAffairsService.getBySlug] DB error:', e?.message || e);
      }
    }

    // Supabase fallback
    try {
      const supabase = createPublicServerSupabaseClient();

      const { data, error } = await supabase
        .from('current_affairs_articles')
        .select(`
          id,
          slug,
          news_date,
          category,
          importance_tier,
          status,
          published_at,
          current_affairs_article_versions!fk_ca_articles_published_version (
            id,
            version_number,
            headline,
            summary_md,
            key_takeaways,
            important_facts,
            exam_relevance_notes,
            compiled_ast_json,
            checksum_sha256
          )
        `)
        .eq('slug', slug)
        .eq('status', 'PUBLISHED')
        .not('published_version_id', 'is', null)
        .maybeSingle();

      if (error || !data || !data.current_affairs_article_versions) {
        return null;
      }

      const version = data.current_affairs_article_versions as any;

      const [sourcesRes, taxRes, examRes, qRes, learnRes] = await Promise.all([
        supabase
          .from('current_affairs_sources')
          .select('id, title, publisher, url, tier, citation_context')
          .eq('version_id', version.id),
        supabase
          .from('current_affairs_taxonomy_mappings')
          .select(`
            taxonomy_node_id,
            is_primary,
            relevance_score,
            canonical_taxonomy_nodes (name, slug)
          `)
          .eq('article_id', data.id),
        supabase
          .from('current_affairs_exam_mappings')
          .select(`
            exam_id,
            relevance_weight,
            is_high_yield,
            exams (title, slug)
          `)
          .eq('article_id', data.id),
        supabase
          .from('current_affairs_question_mappings')
          .select(`
            question_id,
            display_order,
            questions (
              id,
              question_versions (
                question_text
              )
            )
          `)
          .eq('article_id', data.id)
          .order('display_order', { ascending: true }),
        supabase
          .from('current_affairs_learning_mappings')
          .select(`
            learning_resource_id,
            learning_resources (title, slug)
          `)
          .eq('article_id', data.id),
      ]);

      const relatedArticles = await this.getRelatedArticles(data.category as CurrentAffairsCategory, data.id, 4);

      return {
        id: data.id,
        slug: data.slug,
        newsDate: data.news_date,
        category: data.category as CurrentAffairsCategory,
        importanceTier: data.importance_tier as CurrentAffairsImportanceTier,
        status: data.status as CurrentAffairsStatus,
        publishedAt: data.published_at,
        versionNumber: version.version_number,
        headline: version.headline,
        summaryMd: version.summary_md,
        keyTakeaways: Array.isArray(version.key_takeaways) ? version.key_takeaways : [],
        importantFacts: Array.isArray(version.important_facts) ? version.important_facts : [],
        examRelevanceNotes: (version.exam_relevance_notes as Record<string, { focus?: string; weight?: string }>) || {},
        compiledAstJson: (version.compiled_ast_json as Record<string, unknown>) || null,
        checksumSha256: version.checksum_sha256,
        sources: (sourcesRes.data || []).map((s: any) => ({
          id: s.id,
          title: s.title,
          publisher: s.publisher,
          url: s.url,
          tier: s.tier as CurrentAffairsSourceTier,
          citationContext: s.citation_context,
        })),
        taxonomyMappings: (taxRes.data || []).map((tm: any) => ({
          taxonomyNodeId: tm.taxonomy_node_id,
          nodeName: tm.canonical_taxonomy_nodes?.name || '',
          nodeSlug: tm.canonical_taxonomy_nodes?.slug || '',
          isPrimary: tm.is_primary,
          relevanceScore: tm.relevance_score,
        })),
        examMappings: (examRes.data || []).map((em: any) => ({
          examId: em.exam_id,
          examTitle: em.exams?.title || '',
          examSlug: em.exams?.slug || '',
          relevanceWeight: em.relevance_weight,
          isHighYield: em.is_high_yield,
        })),
        relatedLearningUnits: (learnRes.data || []).map((lm: any) => ({
          learningResourceId: lm.learning_resource_id,
          title: lm.learning_resources?.title || '',
          slug: lm.learning_resources?.slug || '',
        })),
        relatedQuestions: (qRes.data || []).map((qm: any) => ({
          questionId: qm.question_id,
          questionText: qm.questions?.question_versions?.[0]?.question_text || '',
          displayOrder: qm.display_order,
        })),
        relatedArticles,
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetches published related articles in the same category
   */
  static async getRelatedArticles(
    category: CurrentAffairsCategory,
    excludeId: string,
    limit = 4,
    db?: DbQueryInterface
  ): Promise<Array<{ id: string; slug: string; headline: string; newsDate: string; category: CurrentAffairsCategory; importanceTier: CurrentAffairsImportanceTier }>> {
    if (db) {
      try {
        const sql = `
          SELECT 
            a.id,
            a.slug,
            to_char(a.news_date, 'YYYY-MM-DD') as news_date,
            a.category,
            a.importance_tier,
            v.headline
          FROM public.current_affairs_articles a
          JOIN public.current_affairs_article_versions v ON v.id = a.published_version_id
          WHERE a.category = $1
            AND a.id != $2
            AND a.status = 'PUBLISHED'
            AND a.published_version_id IS NOT NULL
          ORDER BY a.news_date DESC, a.importance_tier ASC
          LIMIT $3
        `;
        const res = await db.query(sql, [category, excludeId, limit]);
        return (res.rows || []).map((r: any) => ({
          id: r.id,
          slug: r.slug,
          headline: r.headline,
          newsDate: r.news_date,
          category: r.category as CurrentAffairsCategory,
          importanceTier: r.importance_tier as CurrentAffairsImportanceTier,
        }));
      } catch {
        return [];
      }
    }

    try {
      const supabase = createPublicServerSupabaseClient();

      const { data } = await supabase
        .from('current_affairs_articles')
        .select(`
          id,
          slug,
          news_date,
          category,
          importance_tier,
          current_affairs_article_versions!fk_ca_articles_published_version (
            headline
          )
        `)
        .eq('category', category)
        .neq('id', excludeId)
        .eq('status', 'PUBLISHED')
        .not('published_version_id', 'is', null)
        .order('news_date', { ascending: false })
        .limit(limit);

      return (data || []).map((r: any) => ({
        id: r.id,
        slug: r.slug,
        headline: r.current_affairs_article_versions?.headline || '',
        newsDate: r.news_date,
        category: r.category as CurrentAffairsCategory,
        importanceTier: r.importance_tier as CurrentAffairsImportanceTier,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Fetches data required for the Candidate Current Affairs Hub (/current-affairs)
   */
  static async getHubData(examId?: string, db?: DbQueryInterface): Promise<CurrentAffairsHubData> {
    const todayDate = this.getTodayDateStr();

    // 1. Fetch today's feed
    const todayFeed = await this.getByDate(todayDate, examId, db);

    // 2. Fetch recent published articles (up to 12)
    let recentArticles: CurrentAffairsFeedItem[] = [];
    const categoryCounts: Record<CurrentAffairsCategory, number> = {} as any;
    ALL_CURRENT_AFFAIRS_CATEGORIES.forEach((cat) => {
      categoryCounts[cat] = 0;
    });

    if (db) {
      try {
        // Recent articles
        const recentRes = await db.query(
          `SELECT 
            a.id,
            a.slug,
            to_char(a.news_date, 'YYYY-MM-DD') as news_date,
            a.category,
            a.importance_tier,
            a.published_at,
            v.headline,
            v.summary_md,
            v.key_takeaways,
            (SELECT count(*) FROM public.current_affairs_sources s WHERE s.version_id = v.id) as sources_count,
            (SELECT count(*) FROM public.current_affairs_question_mappings qm WHERE qm.article_id = a.id) as questions_count,
            (SELECT count(*) FROM public.current_affairs_learning_mappings lm WHERE lm.article_id = a.id) as learning_count
          FROM public.current_affairs_articles a
          JOIN public.current_affairs_article_versions v ON v.id = a.published_version_id
          WHERE a.status = 'PUBLISHED'
            AND a.published_version_id IS NOT NULL
          ORDER BY a.news_date DESC, a.importance_tier ASC, a.created_at DESC
          LIMIT 12`
        );

        recentArticles = (recentRes.rows || []).map((r: any) => ({
          id: r.id,
          slug: r.slug,
          newsDate: r.news_date,
          category: r.category as CurrentAffairsCategory,
          importanceTier: r.importance_tier as CurrentAffairsImportanceTier,
          headline: r.headline,
          summaryMd: r.summary_md,
          keyTakeaways: Array.isArray(r.key_takeaways)
            ? r.key_takeaways
            : typeof r.key_takeaways === 'string'
            ? JSON.parse(r.key_takeaways)
            : [],
          publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
          sourcesCount: parseInt(r.sources_count || '0', 10),
          mappedQuestionsCount: parseInt(r.questions_count || '0', 10),
          mappedLearningUnitsCount: parseInt(r.learning_count || '0', 10),
        }));

        // Category counts
        const catRes = await db.query(
          `SELECT category, count(*) as cnt 
           FROM public.current_affairs_articles 
           WHERE status = 'PUBLISHED' AND published_version_id IS NOT NULL 
           GROUP BY category`
        );
        (catRes.rows || []).forEach((r: any) => {
          if (r.category && categoryCounts[r.category as CurrentAffairsCategory] !== undefined) {
            categoryCounts[r.category as CurrentAffairsCategory] = parseInt(r.cnt || '0', 10);
          }
        });
      } catch (e: any) {
        console.error('[CurrentAffairsService.getHubData] DB error:', e?.message || e);
      }
    } else {
      try {
        const supabase = createPublicServerSupabaseClient();

        const { data: recentData } = await supabase
          .from('current_affairs_articles')
          .select(`
            id,
            slug,
            news_date,
            category,
            importance_tier,
            published_at,
            current_affairs_article_versions!fk_ca_articles_published_version (
              headline,
              summary_md,
              key_takeaways,
              current_affairs_sources (
                id
              )
            ),
            current_affairs_question_mappings:current_affairs_question_mappings(count),
            current_affairs_learning_mappings:current_affairs_learning_mappings(count)
          `)
          .eq('status', 'PUBLISHED')
          .not('published_version_id', 'is', null)
          .order('news_date', { ascending: false })
          .limit(12);

        if (recentData) {
          recentArticles = recentData
            .filter((row: any) => Boolean(row.current_affairs_article_versions))
            .map((row: any) => {
              const version = row.current_affairs_article_versions;
              return {
                id: row.id,
                slug: row.slug,
                newsDate: row.news_date,
                category: row.category as CurrentAffairsCategory,
                importanceTier: row.importance_tier as CurrentAffairsImportanceTier,
                headline: version?.headline || '',
                summaryMd: version?.summary_md || '',
                keyTakeaways: Array.isArray(version?.key_takeaways) ? version.key_takeaways : [],
                publishedAt: row.published_at,
                sourcesCount: version?.current_affairs_sources?.length || 0,
                mappedQuestionsCount: row.current_affairs_question_mappings?.[0]?.count || 0,
                mappedLearningUnitsCount: row.current_affairs_learning_mappings?.[0]?.count || 0,
              };
            });
        }

        const { data: allCats } = await supabase
          .from('current_affairs_articles')
          .select('category')
          .eq('status', 'PUBLISHED')
          .not('published_version_id', 'is', null);

        (allCats || []).forEach((r: any) => {
          if (r.category && categoryCounts[r.category as CurrentAffairsCategory] !== undefined) {
            categoryCounts[r.category as CurrentAffairsCategory]++;
          }
        });
      } catch {
        // Suppress
      }
    }

    // 3. Calculate Daily Quiz state
    let dailyQuizReport;
    try {
      dailyQuizReport = await CurrentAffairsDailyQuizService.calculateEligibility(todayDate, db);
    } catch {
      dailyQuizReport = {
        status: 'SHORTAGE_BLOCKED' as const,
        totalEligibleCount: 0,
        requiredCount: 10,
        shortageCount: 10,
        existingMockTestId: null,
      };
    }

    return {
      todayDate,
      todayFeed,
      recentArticles,
      categoryCounts,
      dailyQuiz: {
        status: dailyQuizReport.status,
        totalEligibleCount: dailyQuizReport.totalEligibleCount,
        requiredCount: dailyQuizReport.requiredCount,
        shortageCount: dailyQuizReport.shortageCount,
        mockTestSlug: `ca-daily-${todayDate}`,
        mockTestId: dailyQuizReport.existingMockTestId,
      },
    };
  }

  /**
   * Fetches monthly historical Current Affairs feed and category breakdown
   */
  static async getMonthlyFeed(
    year: number,
    month: number,
    category?: CurrentAffairsCategory,
    db?: DbQueryInterface
  ): Promise<{
    year: number;
    month: number;
    totalArticles: number;
    categoryBreakdown: Record<string, number>;
    articles: CurrentAffairsFeedItem[];
  }> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    if (db) {
      try {
        let sql = `
          SELECT 
            a.id,
            a.slug,
            to_char(a.news_date, 'YYYY-MM-DD') as news_date,
            a.category,
            a.importance_tier,
            a.published_at,
            v.headline,
            v.summary_md,
            v.key_takeaways,
            (SELECT count(*) FROM public.current_affairs_sources s WHERE s.version_id = v.id) as sources_count,
            (SELECT count(*) FROM public.current_affairs_question_mappings qm WHERE qm.article_id = a.id) as questions_count,
            (SELECT count(*) FROM public.current_affairs_learning_mappings lm WHERE lm.article_id = a.id) as learning_count
          FROM public.current_affairs_articles a
          JOIN public.current_affairs_article_versions v ON v.id = a.published_version_id
          WHERE a.status = 'PUBLISHED'
            AND a.published_version_id IS NOT NULL
            AND a.news_date >= $1
            AND a.news_date <= $2
        `;

        const params: unknown[] = [startDate, endDate];
        if (category) {
          sql += ` AND a.category = $3`;
          params.push(category);
        }

        sql += ` ORDER BY a.news_date DESC, a.importance_tier ASC, a.created_at DESC`;

        const res = await db.query(sql, params);
        const rows = res.rows || [];

        const categoryBreakdown: Record<string, number> = {};
        const articles: CurrentAffairsFeedItem[] = rows.map((r: any) => {
          categoryBreakdown[r.category] = (categoryBreakdown[r.category] || 0) + 1;
          return {
            id: r.id,
            slug: r.slug,
            newsDate: r.news_date,
            category: r.category as CurrentAffairsCategory,
            importanceTier: r.importance_tier as CurrentAffairsImportanceTier,
            headline: r.headline,
            summaryMd: r.summary_md,
            keyTakeaways: Array.isArray(r.key_takeaways)
              ? r.key_takeaways
              : typeof r.key_takeaways === 'string'
              ? JSON.parse(r.key_takeaways)
              : [],
            publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
            sourcesCount: parseInt(r.sources_count || '0', 10),
            mappedQuestionsCount: parseInt(r.questions_count || '0', 10),
            mappedLearningUnitsCount: parseInt(r.learning_count || '0', 10),
          };
        });

        return {
          year,
          month,
          totalArticles: articles.length,
          categoryBreakdown,
          articles,
        };
      } catch (e: any) {
        console.error('[CurrentAffairsService.getMonthlyFeed] DB error:', e?.message || e);
      }
    }

    try {
      const supabase = createPublicServerSupabaseClient();

      let query = supabase
        .from('current_affairs_articles')
        .select(`
          id,
          slug,
          news_date,
          category,
          importance_tier,
          published_at,
          current_affairs_article_versions!fk_ca_articles_published_version (
            headline,
            summary_md,
            key_takeaways,
            current_affairs_sources (
              id
            )
          ),
          current_affairs_question_mappings:current_affairs_question_mappings(count),
          current_affairs_learning_mappings:current_affairs_learning_mappings(count)
        `)
        .gte('news_date', startDate)
        .lte('news_date', endDate)
        .eq('status', 'PUBLISHED')
        .not('published_version_id', 'is', null)
        .order('news_date', { ascending: false });

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error || !data) {
        return {
          year,
          month,
          totalArticles: 0,
          categoryBreakdown: {},
          articles: [],
        };
      }

      const categoryBreakdown: Record<string, number> = {};
      const articles: CurrentAffairsFeedItem[] = data
        .filter((row: any) => Boolean(row.current_affairs_article_versions))
        .map((row: any) => {
          categoryBreakdown[row.category] = (categoryBreakdown[row.category] || 0) + 1;
          const version = row.current_affairs_article_versions;
          return {
            id: row.id,
            slug: row.slug,
            newsDate: row.news_date,
            category: row.category as CurrentAffairsCategory,
            importanceTier: row.importance_tier as CurrentAffairsImportanceTier,
            headline: version?.headline || '',
            summaryMd: version?.summary_md || '',
            keyTakeaways: Array.isArray(version?.key_takeaways) ? version.key_takeaways : [],
            publishedAt: row.published_at,
            sourcesCount: version?.current_affairs_sources?.length || 0,
            mappedQuestionsCount: row.current_affairs_question_mappings?.[0]?.count || 0,
            mappedLearningUnitsCount: row.current_affairs_learning_mappings?.[0]?.count || 0,
          };
        });

      return {
        year,
        month,
        totalArticles: articles.length,
        categoryBreakdown,
        articles,
      };
    } catch {
      return {
        year,
        month,
        totalArticles: 0,
        categoryBreakdown: {},
        articles: [],
      };
    }
  }

  /**
   * Fetches monthly summary digest counts and categories
   */
  static async getMonthlySummary(year: number, month: number, db?: DbQueryInterface) {
    const feed = await this.getMonthlyFeed(year, month, undefined, db);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    return {
      year,
      month,
      startDate,
      endDate,
      totalArticles: feed.totalArticles,
      categoryBreakdown: feed.categoryBreakdown,
    };
  }
}
