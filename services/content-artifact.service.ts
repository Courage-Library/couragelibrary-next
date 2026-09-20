/**
 * COURAGE LIBRARY — CONTENT ARTIFACT SERVICE
 * Phase 3B: Content Artifact & Asset Storage Foundation
 * 
 * Manages creation, integrity validation, storage routing, and authorization
 * for structured lesson artifacts and controlled MDX sources.
 * 
 * Invariants:
 * - ZERO lesson content stored in PostgreSQL (storage metadata and hashes only).
 * - Deterministic SHA-256 hash calculation over canonical payload bytes.
 * - Strict controlled MDX component allowlist.
 * - Published artifacts are immutable.
 * - Direct storage-key access is guarded behind authorization.
 */

import crypto from 'crypto';
import { IStorageProvider } from './storage/storage-provider.interface';
import {
  LearningContentArtifact,
  ArtifactType,
  ArtifactStatus,
  AccessClass,
  AuthContext,
  ControlledMdxValidationResult,
  UploadValidationResult,
} from '@/types/learning-artifact';

export const CONTROLLED_MDX_ALLOWLIST = [
  'FormulaCard',
  'ExampleBox',
  'WarningBox',
  'ExamTip',
  'QuestionReference',
  'ComparisonTable',
  'QuickCheck',
  'SummaryCard',
  'DiagramBlock',
  'Callout',
] as const;

export const MAX_ARTIFACT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB max per artifact

export class ContentArtifactService {
  /**
   * Generates deterministic storage key for an artifact.
   */
  static generateStorageKey(params: {
    learningUnitId: string;
    artifactType: ArtifactType;
    sha256Hash: string;
    slug: string;
    extension?: string;
  }): string {
    const hashPrefix = params.sha256Hash.slice(0, 8);
    const cleanSlug = params.slug.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const ext = params.extension || 'mdx';
    const typeFolder = params.artifactType.toLowerCase();

    return `learning/units/${params.learningUnitId}/artifacts/${typeFolder}/${hashPrefix}_${cleanSlug}.${ext}`;
  }

  /**
   * Computes deterministic SHA-256 hash from raw content string or Buffer.
   */
  static computeSha256(content: string | Buffer): string {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Validates Controlled MDX source content against security allowlist.
   */
  static validateControlledMdx(mdxContent: string): ControlledMdxValidationResult {
    const errors: string[] = [];
    const componentsFound: string[] = [];
    const invalidComponents: string[] = [];

    // 1. Forbid import / export statements (arbitrary JS execution)
    if (/^\s*import\s+/m.test(mdxContent)) {
      errors.push('MDX contains forbidden "import" statement. All components must be resolved from allowlist.');
    }
    if (/^\s*export\s+/m.test(mdxContent)) {
      errors.push('MDX contains forbidden "export" statement.');
    }

    // 2. Forbid script tags / inline JS execution
    if (/<script[\s>]/i.test(mdxContent)) {
      errors.push('MDX contains forbidden <script> tag.');
    }
    if (/javascript:/i.test(mdxContent)) {
      errors.push('MDX contains forbidden "javascript:" URI scheme.');
    }

    // 3. Extract JSX components: <Component ... /> or <Component>
    const tagMatches = mdxContent.matchAll(/<([A-Z][a-zA-Z0-9]+)[\s>/]/g);
    for (const match of tagMatches) {
      const compName = match[1];
      if (!componentsFound.includes(compName)) {
        componentsFound.push(compName);
      }
      if (!(CONTROLLED_MDX_ALLOWLIST as readonly string[]).includes(compName)) {
        if (!invalidComponents.includes(compName)) {
          invalidComponents.push(compName);
          errors.push(`Component <${compName}> is not in the approved Phase 2 allowlist.`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      componentsFound,
      invalidComponents,
    };
  }

  /**
   * Validates raw artifact upload parameters (MIME, size, structure).
   */
  static validateArtifactUpload(params: {
    content: string | Buffer;
    artifactType: ArtifactType;
    mimeType?: string;
  }): UploadValidationResult {
    const errors: string[] = [];
    const buffer = Buffer.isBuffer(params.content) ? params.content : Buffer.from(params.content, 'utf8');
    const byteSize = buffer.length;

    if (byteSize === 0) {
      errors.push('Artifact payload cannot be empty.');
    }
    if (byteSize > MAX_ARTIFACT_SIZE_BYTES) {
      errors.push(`Artifact exceeds maximum allowed size of ${MAX_ARTIFACT_SIZE_BYTES / 1024 / 1024}MB.`);
    }

    const sha256Hash = this.computeSha256(buffer);

    if (params.artifactType === 'CONTROLLED_MDX') {
      const mdxVal = this.validateControlledMdx(buffer.toString('utf8'));
      if (!mdxVal.valid) {
        errors.push(...mdxVal.errors);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      byteSize,
      sha256Hash,
      detectedMimeType: params.mimeType || 'text/mdx',
    };
  }

  /**
   * Stores artifact in object storage and creates relational metadata record.
   */
  static async createArtifact(
    params: {
      learningUnitId: string;
      contentVersionId?: string | null;
      artifactType: ArtifactType;
      content: string | Buffer;
      slug: string;
      language?: string;
      accessClass?: AccessClass;
      isSourceArtifact?: boolean;
      isRenderable?: boolean;
      compilerVersion?: string;
      schemaVersion?: string;
    },
    storageProvider: IStorageProvider,
    supabaseClient: any
  ): Promise<LearningContentArtifact> {
    // 1. Validation
    const val = this.validateArtifactUpload({
      content: params.content,
      artifactType: params.artifactType,
    });
    if (!val.valid) {
      throw new Error(`Artifact validation failed: ${val.errors.join('; ')}`);
    }

    const bucket = 'learning-artifacts';
    const storageKey = this.generateStorageKey({
      learningUnitId: params.learningUnitId,
      artifactType: params.artifactType,
      sha256Hash: val.sha256Hash!,
      slug: params.slug,
    });

    // 2. Put into storage first
    await storageProvider.put(
      bucket,
      storageKey,
      params.content,
      val.detectedMimeType || 'text/mdx'
    );

    // 3. Create metadata record in DB
    const artifactRecord = {
      learning_unit_id: params.learningUnitId,
      content_version_id: params.contentVersionId || null,
      artifact_type: params.artifactType,
      storage_provider: storageProvider.providerType,
      storage_bucket: bucket,
      storage_key: storageKey,
      mime_type: val.detectedMimeType || 'text/mdx',
      byte_size: val.byteSize!,
      sha256_hash: val.sha256Hash!,
      compiler_version: params.compilerVersion || 'v1.0.0',
      schema_version: params.schemaVersion || 'v1',
      language: params.language || 'en',
      access_class: params.accessClass || 'FREE_AUTHENTICATED',
      is_source_artifact: params.isSourceArtifact !== undefined ? params.isSourceArtifact : true,
      is_renderable: params.isRenderable !== undefined ? params.isRenderable : true,
      status: 'DRAFT',
    };

    const { data, error } = await supabaseClient
      .from('learning_content_artifacts')
      .insert(artifactRecord)
      .select()
      .single();

    if (error) {
      // Rollback storage on DB failure
      await storageProvider.delete(bucket, storageKey);
      throw new Error(`Failed to create artifact metadata: ${error.message}`);
    }

    return data;
  }

  /**
   * Evaluates authorization before granting access to an artifact.
   */
  static evaluateAccess(artifact: LearningContentArtifact, authContext: AuthContext): {
    allowed: boolean;
    reason?: string;
  } {
    // Admin / Service Role always allowed
    if (authContext.role === 'ADMIN' || authContext.role === 'SERVICE_ROLE') {
      return { allowed: true };
    }

    // Draft / Archived / Deprecated requires Admin
    if (artifact.status !== 'PUBLISHED') {
      return {
        allowed: false,
        reason: 'Artifact is not published and requires administrative privileges.',
      };
    }

    // Access class evaluation
    switch (artifact.access_class) {
      case 'FREE_PUBLIC':
        return { allowed: true };
      case 'FREE_AUTHENTICATED':
        if (authContext.role === 'ANONYMOUS') {
          return { allowed: false, reason: 'Authentication required for this learning resource.' };
        }
        return { allowed: true };
      case 'PREMIUM':
        if (authContext.role !== 'PREMIUM') {
          return { allowed: false, reason: 'Premium subscription required to access this resource.' };
        }
        return { allowed: true };
      case 'ADMIN_ONLY':
      case 'INTERNAL':
        return { allowed: false, reason: 'Restricted administrative content.' };
      default:
        return { allowed: false, reason: 'Access denied by policy.' };
    }
  }

  /**
   * Retrieves artifact content after evaluating authorization and checking integrity.
   */
  static async getArtifactContent(
    artifactId: string,
    authContext: AuthContext,
    storageProvider: IStorageProvider,
    supabaseClient: any
  ): Promise<{ artifact: LearningContentArtifact; content: string }> {
    const { data: artifact, error } = await supabaseClient
      .from('learning_content_artifacts')
      .select('*')
      .eq('id', artifactId)
      .single();

    if (error || !artifact) {
      throw new Error(`Artifact ${artifactId} not found.`);
    }

    // 1. Authorization check
    const authDecision = this.evaluateAccess(artifact, authContext);
    if (!authDecision.allowed) {
      throw new Error(`Access Denied: ${authDecision.reason}`);
    }

    // 2. Fetch from storage
    const storageItem = await storageProvider.get(artifact.storage_bucket, artifact.storage_key);
    if (!storageItem) {
      throw new Error(`Artifact payload missing from storage: ${artifact.storage_key}`);
    }

    // 3. Cryptographic integrity check
    const actualHash = this.computeSha256(storageItem.data);
    if (actualHash.toLowerCase() !== artifact.sha256_hash.toLowerCase()) {
      throw new Error(
        `FATAL: Artifact integrity mismatch! Expected SHA-256 ${artifact.sha256_hash}, found ${actualHash}.`
      );
    }

    return {
      artifact,
      content: storageItem.data.toString('utf8'),
    };
  }

  /**
   * Publishes an artifact, sealing its state as immutable.
   */
  static async publishArtifact(artifactId: string, supabaseClient: any): Promise<LearningContentArtifact> {
    const { data: existing, error: fetchErr } = await supabaseClient
      .from('learning_content_artifacts')
      .select('*')
      .eq('id', artifactId)
      .single();

    if (fetchErr || !existing) {
      throw new Error(`Artifact ${artifactId} not found.`);
    }

    if (existing.status === 'PUBLISHED') {
      return existing; // Idempotent
    }

    const { data, error } = await supabaseClient
      .from('learning_content_artifacts')
      .update({
        status: 'PUBLISHED',
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', artifactId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to publish artifact ${artifactId}: ${error.message}`);
    }

    return data;
  }
}
