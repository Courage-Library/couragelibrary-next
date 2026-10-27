/**
 * COURAGE LIBRARY — LESSON BLOCKS ADMIN SERVICE (CA-3)
 *
 * The authoring path for DB lessons (LessonBlocksSpec v2) after the MDX path was retired: list documents, load the
 * current / draft lesson, save a DRAFT (fn_lesson_save_draft), publish (fn_lesson_publish). CA-4 adds the prompt,
 * templates and the Hindi flow on top of this.
 *
 * INVARIANTS:
 * - Server-only; the service-role client after the canonical admin guard (ADMIN ONLY).
 * - The pure validator (lib/lessons/blocks.ts) runs first; the database validates again (fn_lesson_blocks_errors),
 *   computes the hash and audits in the same transaction. Published versions are immutable.
 */
import { guardAdminAction } from '@/lib/auth/require-admin';
import { createAdminServerSupabaseClient } from '@/lib/supabase/server';
import type { Json } from '@/types/database';
import { validateLesson, type BlockError } from '@/lib/lessons/blocks';
import type { LessonDocumentRow, LessonEditorData } from '@/lib/lessons/admin-types';

export type { LessonDocumentRow, LessonEditorData };

export type LessonResult<T> = { success: true; data: T } | { success: false; code: string; error: string; errors?: BlockError[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = <T>(code: string, error: string, errors?: BlockError[]): LessonResult<T> => ({ success: false, code, error, ...(errors ? { errors } : {}) });

export function mapLessonDbError(error: { code?: string; message?: string } | null | undefined): { code: string; error: string } {
  const msg = error?.message || '';
  for (const prefix of ['LESSON_BLOCKS_INVALID:', 'LESSON:']) {
    if (msg.includes(prefix)) return { code: prefix === 'LESSON:' ? 'LESSON_RULE' : 'INVALID', error: msg.slice(msg.indexOf(prefix) + prefix.length).trim().replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '…') };
  }
  if (/Cannot mutate published/.test(msg)) return { code: 'IMMUTABLE', error: 'A published version cannot change; save a new draft instead.' };
  return { code: 'DB_ERROR', error: 'The lesson change could not be saved.' };
}

async function ctx() {
  const auth = await guardAdminAction();
  if (!auth.ok) return null;
  return { userId: auth.userId || null, userEmail: auth.userEmail || 'unknown', supabase: createAdminServerSupabaseClient() };
}

export class LessonAdminService {
  static async listDocuments(): Promise<LessonResult<LessonDocumentRow[]>> {
    const c = await ctx();
    if (!c) return fail('UNAUTHORIZED', 'Unauthorized.');
    const [docs, versions] = await Promise.all([
      c.supabase.from('learning_documents').select('id, canonical_slug, document_type, status, access_level, current_published_version_id, learning_units(title)').order('canonical_slug'),
      c.supabase.from('document_versions').select('id, document_id, version_number, content_format, review_status, is_published, language'),
    ]);
    if (docs.error || versions.error) return fail('DB_ERROR', 'Could not load the lessons.');
    const vs = versions.data || [];
    return {
      success: true,
      data: (docs.data || []).map((d) => {
        const cur = vs.find((v) => v.id === d.current_published_version_id);
        const unit = Array.isArray(d.learning_units) ? d.learning_units[0] : d.learning_units;
        return {
          id: d.id,
          slug: d.canonical_slug,
          title: unit?.title || d.canonical_slug,
          documentType: d.document_type,
          status: d.status,
          accessLevel: d.access_level,
          currentFormat: cur?.content_format ?? null,
          currentVersion: cur?.version_number ?? null,
          hasDraft: vs.some((v) => v.document_id === d.id && v.content_format === 'BLOCKS' && !v.is_published && v.review_status === 'DRAFT'),
        };
      }),
    };
  }

  static async getEditor(documentId: string, language: 'en' | 'hi'): Promise<LessonResult<LessonEditorData>> {
    const c = await ctx();
    if (!c) return fail('UNAUTHORIZED', 'Unauthorized.');
    if (!UUID_RE.test(documentId) || (language !== 'en' && language !== 'hi')) return fail('NOT_FOUND', 'Lesson not found.');
    const list = await this.listDocuments();
    if (!list.success) return list;
    const document = list.data.find((d) => d.id === documentId);
    if (!document) return fail('NOT_FOUND', 'Lesson not found.');
    const { data, error } = await c.supabase
      .from('document_versions')
      .select('id, version_number, review_status, is_published, is_current, lesson_meta, blocks')
      .eq('document_id', documentId)
      .eq('language', language)
      .eq('content_format', 'BLOCKS')
      .order('version_number', { ascending: false });
    if (error) return fail('DB_ERROR', 'Could not load the lesson.');
    const draft = (data || []).find((v) => !v.is_published && v.review_status === 'DRAFT');
    const current = (data || []).find((v) => v.is_current);
    const pick = draft || current || null;
    const v = pick ? validateLesson(pick.lesson_meta, pick.blocks) : null;
    return {
      success: true,
      data: {
        document,
        language,
        source: draft ? 'DRAFT' : current ? 'PUBLISHED' : 'NONE',
        versionId: pick?.id ?? null,
        versionNumber: pick?.version_number ?? null,
        meta: v && v.ok ? v.meta : null,
        blocks: v && v.ok ? v.blocks : null,
      },
    };
  }

  /** Saves the draft of (document, language) from the editor's JSON ({ meta, blocks }). */
  static async saveDraft(documentId: string, language: 'en' | 'hi', json: string): Promise<LessonResult<{ versionId: string; versionNumber: number }>> {
    const c = await ctx();
    if (!c) return fail('UNAUTHORIZED', 'Unauthorized.');
    if (!UUID_RE.test(documentId) || (language !== 'en' && language !== 'hi')) return fail('VALIDATION', 'Invalid lesson.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return fail('VALIDATION', 'This is not valid JSON.');
    }
    const o = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as { meta?: unknown; blocks?: unknown }) : {};
    const v = validateLesson(o.meta, o.blocks);
    if (!v.ok) return fail('VALIDATION', 'The lesson has problems.', v.errors);
    const { data, error } = await c.supabase.rpc('fn_lesson_save_draft', {
      p_document_id: documentId,
      p_language: language,
      p_meta: JSON.parse(JSON.stringify(v.meta)) as Json, // plain JSON (validated)
      p_blocks: JSON.parse(JSON.stringify(v.blocks)) as Json,
      p_author_type: 'HUMAN',
      p_actor_id: c.userId as string,
      p_actor_email: c.userEmail,
    });
    if (error || !data) {
      const m = mapLessonDbError(error);
      return fail(m.code, m.error);
    }
    const r = data as { version_id?: string; version_number?: number };
    return { success: true, data: { versionId: String(r.version_id), versionNumber: Number(r.version_number) } };
  }

  static async publish(versionId: string): Promise<LessonResult<{ versionId: string }>> {
    const c = await ctx();
    if (!c) return fail('UNAUTHORIZED', 'Unauthorized.');
    if (!UUID_RE.test(versionId)) return fail('VALIDATION', 'Invalid version.');
    const { error } = await c.supabase.rpc('fn_lesson_publish', { p_version_id: versionId, p_actor_id: c.userId as string, p_actor_email: c.userEmail });
    if (error) {
      const m = mapLessonDbError(error);
      return fail(m.code, m.error);
    }
    return { success: true, data: { versionId } };
  }
}
