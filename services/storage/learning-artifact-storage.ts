/**
 * COURAGE LIBRARY — LEARNING ARTIFACT STORAGE (server-only)
 * Phase GAP2-2a.
 *
 * Durable store for learning-document specs and compiled bodies: the private Supabase
 * Storage bucket 'learning-artifacts' (migration 072), accessed with the service role.
 * There are no storage policies on the bucket, so bodies (including PRO bodies) are never
 * reachable from the browser; readers must go through server code that checks access.
 *
 * Replaces StorageFactory.getProvider()'s in-process MEMORY default for this pipeline, which
 * lost every artifact on restart and was invisible to other server instances.
 */

import { createAdminServerSupabaseClient } from '@/lib/supabase/server';
import { IStorageProvider } from './storage-provider.interface';
import { SupabaseStorageProvider } from './supabase-storage.provider';

export const LEARNING_ARTIFACT_BUCKET = 'learning-artifacts';

let override: IStorageProvider | null = null;

export function getLearningArtifactStorage(): IStorageProvider {
  return override || new SupabaseStorageProvider(createAdminServerSupabaseClient());
}

/** Test hook: replace the provider (offline suites). */
export function setLearningArtifactStorageForTests(provider: IStorageProvider | null): void {
  override = provider;
}
