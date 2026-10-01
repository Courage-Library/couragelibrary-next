import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { createAdminServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const authCheck = await AdminService.checkIsAdminOrStaff();
    if (!authCheck.isAdmin || !authCheck.userId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have administrative permissions to access this endpoint.',
          },
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'all'; // 'taxonomy' | 'exams' | 'learning' | 'questions' | 'all'
    const query = searchParams.get('q') || '';

    const supabase = createAdminServerSupabaseClient();
    const results: Record<string, any[]> = {};

    if (type === 'taxonomy' || type === 'all') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let taxQuery = (supabase as any)
        .from('canonical_taxonomy_nodes')
        .select('id, name, slug, node_type, code')
        .limit(20);
      if (query.trim()) {
        taxQuery = taxQuery.ilike('name', `%${query.trim()}%`);
      }
      const { data } = await taxQuery;
      results.taxonomy = data || [];
    }

    if (type === 'exams' || type === 'all') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let examQuery = (supabase as any)
        .from('exams')
        .select('id, title, slug, code')
        .limit(20);
      if (query.trim()) {
        examQuery = examQuery.ilike('title', `%${query.trim()}%`);
      }
      const { data } = await examQuery;
      results.exams = data || [];
    }

    if (type === 'learning' || type === 'all') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let learnQuery = (supabase as any)
        .from('learning_resources')
        .select('id, title, slug, resource_type')
        .limit(20);
      if (query.trim()) {
        learnQuery = learnQuery.ilike('title', `%${query.trim()}%`);
      }
      const { data } = await learnQuery;
      results.learning = data || [];
    }

    if (type === 'questions' || type === 'all') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const qQuery = (supabase as any)
        .from('questions')
        .select(`
          id,
          question_versions (
            content_body
          )
        `)
        .limit(20);
      const { data } = await qQuery;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      results.questions = (data || []).map((q: any) => ({
        id: q.id,
        contentBody: q.question_versions?.[0]?.content_body || 'Question #' + q.id.slice(0, 8),
      }));
    }

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Failed to lookup entities',
        },
      },
      { status: 500 }
    );
  }
}
