/**
 * COURAGE LIBRARY — CONTENT STUDIO REFERENCE CATALOGS (GAP2-2b, backlog Q5)
 *
 * Real catalog clients for the controlled content compiler:
 * - Questions: question_versions joined to questions; servable only when the version is current,
 *   lifecycle_status = 'PUBLISHED' and the question is 'published'.
 * - Assets: learning_assets rows with status 'PUBLISHED' in the private learning-artifacts bucket
 *   whose storage object exists.
 * Callers pass the server-side Supabase client they already use (Content Studio: service role,
 * after the canonical admin guard).
 */

import type { QuestionBankClient } from '@/services/question-reference.service';
import type { AssetCatalogClient } from '@/services/asset-reference.service';
import type { IStorageProvider } from '@/services/storage/storage-provider.interface';
import { LEARNING_ARTIFACT_BUCKET } from '@/services/storage/learning-artifact-storage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createQuestionBankClient(supabase: any): QuestionBankClient {
  return {
    async fetchQuestionVersion(id: string) {
      if (!UUID_RE.test(id)) return null;
      const { data, error } = await supabase
        .from('question_versions')
        .select('id, question_id, version_number, question_text, options_type, lifecycle_status, is_current, questions!inner(status)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const q = Array.isArray(data.questions) ? data.questions[0] : data.questions;
      const servable = data.is_current === true && data.lifecycle_status === 'PUBLISHED' && q?.status === 'published';
      return {
        id: data.id,
        question_id: data.question_id,
        version_number: data.version_number,
        question_text: data.question_text,
        question_type: data.options_type,
        status: servable ? 'PUBLISHED' : !data.is_current ? 'NOT_CURRENT' : q?.status !== 'published' ? `QUESTION_${String(q?.status || 'unknown').toUpperCase()}` : data.lifecycle_status,
      };
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAssetCatalogClient(supabase: any, storage: IStorageProvider): AssetCatalogClient {
  return {
    async fetchAsset(id: string) {
      if (!UUID_RE.test(id)) return null;
      const { data, error } = await supabase
        .from('learning_assets')
        .select('id, status, storage_bucket, storage_key, mime_type, alt_text, caption, original_filename, width, height, aspect_ratio')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      let status: string = data.status;
      if (status === 'PUBLISHED') {
        if (data.storage_bucket !== LEARNING_ARTIFACT_BUCKET || !data.storage_key) status = 'NOT_IN_PRIVATE_BUCKET';
        else if (!(await storage.exists(LEARNING_ARTIFACT_BUCKET, data.storage_key))) status = 'STORAGE_OBJECT_MISSING';
      }
      return {
        id: data.id,
        status,
        storage_key: data.storage_key,
        mime_type: data.mime_type,
        alt_text: data.alt_text ?? null,
        caption: data.caption ?? null,
        original_filename: data.original_filename ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
        aspect_ratio: data.aspect_ratio != null ? Number(data.aspect_ratio) : null,
      };
    },
  };
}

/** Both clients for one compile/publish call. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createReferenceCatalogs(supabase: any, storage: IStorageProvider) {
  return { questionBankClient: createQuestionBankClient(supabase), assetCatalogClient: createAssetCatalogClient(supabase, storage) };
}
