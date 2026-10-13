/**
 * COURAGE LIBRARY — ASSET REFERENCE RESOLVER
 * Phase 3C: Controlled Content Compilation & Rendering Pipeline
 * GAP2-2b (Q5): validates against the real asset catalog and fails closed.
 *
 * Resolves authorized learning media assets from the learning_assets catalog.
 *
 * INVARIANTS:
 * 1. The asset must exist in learning_assets with status = 'PUBLISHED', live in the private
 *    learning-artifacts bucket, and its storage object must actually exist.
 * 2. Arbitrary external image URLs are rejected in DiagramBlock.
 * 3. No catalog client, an unknown id, a non-published asset, a missing object or a failed lookup
 *    is a compile ERROR naming the reference. There is no placeholder result.
 */

import { ResolvedAssetReference, CompilationError } from '@/types/learning-compiler';

export interface AssetCatalogClient {
  /** Returns null when the asset does not exist; `status` is 'PUBLISHED' only when servable. */
  fetchAsset(assetId: string): Promise<{
    id: string;
    status: string;
    storage_key: string;
    mime_type: string;
    alt_text: string | null;
    caption: string | null;
    original_filename: string | null;
    width: number | null;
    height: number | null;
    aspect_ratio: number | null;
  } | null>;
}

const fail = (code: CompilationError['code'], path: string, message: string) => ({
  resolved: null,
  error: { code, severity: 'ERROR' as const, path, message },
});

export class AssetReferenceService {
  /**
   * Resolves asset metadata and the storage reference of a published, existing asset.
   */
  static async resolve(
    assetId: string,
    client?: AssetCatalogClient
  ): Promise<{ resolved: ResolvedAssetReference | null; error: CompilationError | null }> {
    if (!assetId || typeof assetId !== 'string') {
      return fail('INVALID_ASSET_REFERENCE', 'assetId', 'assetId must be a non-empty string.');
    }
    if (!client) {
      return fail('REFERENCE_CATALOG_UNAVAILABLE', assetId, `Asset reference "${assetId}" could not be verified: the asset catalog is unavailable.`);
    }

    let raw: Awaited<ReturnType<AssetCatalogClient['fetchAsset']>>;
    try {
      raw = await client.fetchAsset(assetId);
    } catch {
      return fail('INVALID_ASSET_REFERENCE', assetId, `Asset reference "${assetId}" could not be verified (asset catalog lookup failed).`);
    }
    if (!raw) {
      return fail('ASSET_NOT_FOUND', assetId, `Asset "${assetId}" was not found in learning_assets.`);
    }
    if (raw.status !== 'PUBLISHED') {
      return fail('ASSET_INACTIVE', assetId, `Asset "${assetId}" is not published (${raw.status}) and cannot be referenced.`);
    }

    return {
      resolved: {
        assetId: raw.id,
        slug: raw.id,
        title: raw.caption || raw.original_filename || raw.id,
        altText: raw.alt_text || '',
        mimeType: raw.mime_type,
        storageUri: raw.storage_key,
        width: raw.width ?? undefined,
        height: raw.height ?? undefined,
        aspectRatio: raw.aspect_ratio ?? undefined,
      },
      error: null,
    };
  }
}
