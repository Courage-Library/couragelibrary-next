/**
 * COURAGE LIBRARY — LEARNING ASSET SERVICE
 * Phase 3B: Content Artifact & Asset Storage Foundation
 * 
 * Manages media assets (diagrams, charts, illustrations), MIME validation,
 * SVG sanitization verification, hashing, storage, and relational bindings.
 * 
 * Invariants:
 * - ZERO binary image data stored in PostgreSQL.
 * - Strict MIME allowlist (PNG, JPEG, WebP, SVG, GIF).
 * - SVG sanitization check against active content / malicious vectors.
 * - Deterministic SHA-256 hashing.
 */

import crypto from 'crypto';
import { IStorageProvider } from './storage/storage-provider.interface';
import {
  LearningAsset,
  AssetType,
  AssetMimeType,
  AssetStatus,
  AssetUsageContext,
  AccessClass,
  LearningUnitAssetBinding,
  UploadValidationResult,
} from '@/types/learning-artifact';

export const ASSET_MIME_ALLOWLIST: AssetMimeType[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
];

export const MAX_ASSET_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB max per asset

export class LearningAssetService {
  /**
   * Computes deterministic SHA-256 hash.
   */
  static computeSha256(data: Buffer | string): string {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Generates deterministic storage key for an asset.
   */
  static generateStorageKey(params: {
    assetType: AssetType;
    sha256Hash: string;
    slug: string;
    extension: string;
  }): string {
    const hashPrefix = params.sha256Hash.slice(0, 8);
    const cleanSlug = params.slug.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const typeFolder = params.assetType.toLowerCase();

    return `learning/assets/${typeFolder}/${hashPrefix}_${cleanSlug}.${params.extension}`;
  }

  /**
   * Verifies that SVG content is clean and safe (no active scripts, onload, etc.).
   */
  static validateSvgSafety(svgContent: string): { safe: boolean; errors: string[] } {
    const errors: string[] = [];

    if (/<script[\s>]/i.test(svgContent)) {
      errors.push('SVG contains forbidden <script> element.');
    }
    if (/onload\s*=/i.test(svgContent)) {
      errors.push('SVG contains forbidden "onload" event handler.');
    }
    if (/onclick\s*=/i.test(svgContent)) {
      errors.push('SVG contains forbidden "onclick" event handler.');
    }
    if (/onerror\s*=/i.test(svgContent)) {
      errors.push('SVG contains forbidden "onerror" event handler.');
    }
    if (/javascript:/i.test(svgContent)) {
      errors.push('SVG contains forbidden "javascript:" URI.');
    }
    if (/<!ENTITY/i.test(svgContent) || /<!DOCTYPE[\s\S]*?SYSTEM/i.test(svgContent)) {
      errors.push('SVG contains forbidden external XML entity declarations (XXE).');
    }

    return {
      safe: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates asset upload buffer against allowlist, size limits, and security rules.
   */
  static validateAssetUpload(params: {
    data: Buffer | string;
    mimeType: AssetMimeType;
    assetType: AssetType;
  }): UploadValidationResult {
    const errors: string[] = [];
    const buffer = Buffer.isBuffer(params.data) ? params.data : Buffer.from(params.data, 'utf8');
    const byteSize = buffer.length;

    if (byteSize === 0) {
      errors.push('Asset data cannot be empty.');
    }
    if (byteSize > MAX_ASSET_SIZE_BYTES) {
      errors.push(`Asset exceeds maximum allowed size of ${MAX_ASSET_SIZE_BYTES / 1024 / 1024}MB.`);
    }

    if (!ASSET_MIME_ALLOWLIST.includes(params.mimeType)) {
      errors.push(`MIME type "${params.mimeType}" is not allowed. Must be one of: ${ASSET_MIME_ALLOWLIST.join(', ')}`);
    }

    if (params.mimeType === 'image/svg+xml') {
      const svgSafety = this.validateSvgSafety(buffer.toString('utf8'));
      if (!svgSafety.safe) {
        errors.push(...svgSafety.errors);
      }
    }

    const sha256Hash = this.computeSha256(buffer);

    return {
      valid: errors.length === 0,
      errors,
      byteSize,
      sha256Hash,
      detectedMimeType: params.mimeType,
    };
  }

  /**
   * Creates an asset in object storage and records metadata in database.
   */
  static async createAsset(
    params: {
      assetType: AssetType;
      mimeType: AssetMimeType;
      data: Buffer | string;
      slug: string;
      originalFilename?: string | null;
      altText: string;
      caption?: string | null;
      attribution?: string | null;
      width?: number | null;
      height?: number | null;
      language?: string;
      accessClass?: AccessClass;
    },
    storageProvider: IStorageProvider,
    supabaseClient: any
  ): Promise<LearningAsset> {
    const val = this.validateAssetUpload({
      data: params.data,
      mimeType: params.mimeType,
      assetType: params.assetType,
    });

    if (!val.valid) {
      throw new Error(`Asset validation failed: ${val.errors.join('; ')}`);
    }

    const extMap: Record<AssetMimeType, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/gif': 'gif',
    };
    const ext = extMap[params.mimeType] || 'bin';
    const bucket = 'learning-assets';
    const storageKey = this.generateStorageKey({
      assetType: params.assetType,
      sha256Hash: val.sha256Hash!,
      slug: params.slug,
      extension: ext,
    });

    // 1. Upload to storage
    await storageProvider.put(bucket, storageKey, params.data, params.mimeType);

    // 2. Compute aspect ratio if dimensions provided
    let aspectRatio: number | null = null;
    if (params.width && params.height && params.height > 0) {
      aspectRatio = Math.round((params.width / params.height) * 1000) / 1000;
    }

    // 3. Insert metadata record
    const assetRecord = {
      asset_type: params.assetType,
      storage_provider: storageProvider.providerType,
      storage_bucket: bucket,
      storage_key: storageKey,
      original_filename: params.originalFilename || null,
      mime_type: params.mimeType,
      byte_size: val.byteSize!,
      width: params.width || null,
      height: params.height || null,
      aspect_ratio: aspectRatio,
      sha256_hash: val.sha256Hash!,
      alt_text: params.altText,
      caption: params.caption || null,
      attribution: params.attribution || null,
      language: params.language || 'en',
      access_class: params.accessClass || 'FREE_PUBLIC',
      is_sanitized_svg: params.mimeType === 'image/svg+xml',
      status: 'PUBLISHED',
    };

    const { data, error } = await supabaseClient
      .from('learning_assets')
      .insert(assetRecord)
      .select()
      .single();

    if (error) {
      await storageProvider.delete(bucket, storageKey);
      throw new Error(`Failed to create asset metadata: ${error.message}`);
    }

    return data;
  }

  /**
   * Binds an asset to a learning unit.
   */
  static async bindAssetToUnit(
    params: {
      learningUnitId: string;
      assetId: string;
      artifactId?: string | null;
      usageContext?: AssetUsageContext;
    },
    supabaseClient: any
  ): Promise<LearningUnitAssetBinding> {
    const bindingRecord = {
      learning_unit_id: params.learningUnitId,
      asset_id: params.assetId,
      artifact_id: params.artifactId || null,
      usage_context: params.usageContext || 'INLINE',
    };

    const { data, error } = await supabaseClient
      .from('learning_unit_asset_bindings')
      .insert(bindingRecord)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to bind asset to learning unit: ${error.message}`);
    }

    return data;
  }

  /**
   * Retrieves all assets bound to a learning unit.
   */
  static async getUnitAssets(
    learningUnitId: string,
    supabaseClient: any
  ): Promise<LearningUnitAssetBinding[]> {
    const { data, error } = await supabaseClient
      .from('learning_unit_asset_bindings')
      .select('*, asset:learning_assets(*)')
      .eq('learning_unit_id', learningUnitId);

    if (error) {
      throw new Error(`Failed to fetch unit assets for ${learningUnitId}: ${error.message}`);
    }

    return data || [];
  }
}
