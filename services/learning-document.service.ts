/**
 * COURAGE LIBRARY — LEARNING DOCUMENT LIFECYCLE SERVICE
 * Phase 3C: Controlled Content Compilation & Rendering Pipeline
 * 
 * Manages document entities, immutable versions, compilation workflows, and publishing gates.
 * 
 * LIFECYCLE STATE MACHINE:
 * DRAFT -> AI_GENERATED -> STRUCTURALLY_VALID -> IN_REVIEW -> APPROVED -> COMPILED -> PUBLISHED
 * 
 * IMMUTABILITY GUARANTEE:
 * Once status = 'PUBLISHED', the version is permanently immutable.
 * Changes require creating a new version (version_number + 1).
 */

import {
  DocumentVersion,
  LessonDocumentSpec,
} from '@/types/learning-compiler';
import { ControlledContentCompiler } from './controlled-content-compiler.service';
import { IStorageProvider } from './storage/storage-provider.interface';

export class LearningDocumentService {
  /**
   * Evaluates if a given version is immutable.
   */
  static isImmutable(version: DocumentVersion): boolean {
    return version.is_published === true || version.review_status === 'PUBLISHED';
  }

  /**
   * Enforces immutability guard before any update.
   */
  static assertMutable(version: DocumentVersion): void {
    if (this.isImmutable(version)) {
      throw new Error(
        `DocumentVersion ${version.id} (v${version.version_number}) is PUBLISHED and immutable. Create a new version to apply changes.`
      );
    }
  }

  /**
   * Compiles and packages a document version from its LessonDocumentSpec.
   */
  static async compileAndStoreVersion(params: {
    documentId: string;
    versionNumber: number;
    spec: LessonDocumentSpec;
    storageProvider: IStorageProvider;
    storageBucket: string;
    authorType?: 'HUMAN' | 'AI_ASSISTED' | 'LEGACY_CONVERSION';
  }): Promise<{
    version: Partial<DocumentVersion>;
    compiledMdx: string;
  }> {
    // 1. Compile through controlled pipeline
    const compilationResult = await ControlledContentCompiler.compile(params.spec);
    if (!compilationResult.success || !compilationResult.artifact) {
      const firstError = compilationResult.errors[0]?.message || 'Compilation failed';
      throw new Error(`Compilation Error: ${firstError}`);
    }

    const { artifact } = compilationResult;

    // 2. Storage Keys
    const hashPrefix = artifact.compiledArtifactHash.slice(0, 8);
    const specStorageKey = `learning/docs/${params.documentId}/specs/v${params.versionNumber}_${hashPrefix}.json`;
    const mdxStorageKey = `learning/docs/${params.documentId}/artifacts/v${params.versionNumber}_${hashPrefix}.mdx`;

    // 3. Persist to storage provider
    const specBuffer = Buffer.from(JSON.stringify(params.spec), 'utf8');
    const mdxBuffer = Buffer.from(artifact.compiledMdx, 'utf8');

    await params.storageProvider.put(
      params.storageBucket,
      specStorageKey,
      specBuffer,
      'application/json'
    );

    await params.storageProvider.put(
      params.storageBucket,
      mdxStorageKey,
      mdxBuffer,
      'text/mdx'
    );

    const versionData: Partial<DocumentVersion> = {
      id: `ver-${params.documentId}-v${params.versionNumber}`,
      document_id: params.documentId,
      version_number: params.versionNumber,
      schema_version: artifact.schemaVersion,
      compiler_version: artifact.compilerVersion,
      component_contract_version: artifact.componentContractVersion,
      source_spec_storage_key: specStorageKey,
      source_spec_hash: artifact.sourceSpecHash,
      compiled_artifact_storage_key: mdxStorageKey,
      compiled_artifact_hash: artifact.compiledArtifactHash,
      author_type: params.authorType || 'HUMAN',
      review_status: 'COMPILED',
      is_published: false,
      published_at: null,
    };

    LearningDocumentService.cacheVersion(versionData as DocumentVersion);

    return {
      version: versionData,
      compiledMdx: artifact.compiledMdx,
    };
  }

  private static versionCache: Map<string, DocumentVersion> = new Map();

  static cacheVersion(version: DocumentVersion): void {
    if (version?.id) {
      this.versionCache.set(version.id, { ...version });
    }
  }

  static getCachedVersion(id: string): DocumentVersion | null {
    const v = this.versionCache.get(id);
    return v ? { ...v } : null;
  }

  static updateCachedVersion(id: string, updates: Partial<DocumentVersion>): DocumentVersion | null {
    const existing = this.versionCache.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    this.versionCache.set(id, updated);
    return { ...updated };
  }
}
