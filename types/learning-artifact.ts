/**
 * COURAGE LIBRARY — LEARNING ARTIFACT & ASSET TYPES
 * Phase 3B: Content Artifact & Asset Storage Foundation
 * 
 * Strict Invariants:
 * - Pure structural and storage reference metadata
 * - Zero content body or binary storage in relational database
 * - Provider-neutral storage contracts
 */

export type ArtifactType = 
  | 'LESSON_DOCUMENT_SPEC'
  | 'CONTROLLED_MDX'
  | 'COMPILED_IR'
  | 'SUMMARY_SHEET'
  | 'FORMULA_SHEET'
  | 'TRAP_SHEET'
  | 'WORKED_EXAMPLE_SET'
  | 'PYQ_BUNDLE';

export type ArtifactStatus = 
  | 'DRAFT'
  | 'VALIDATED'
  | 'PUBLISHED'
  | 'ARCHIVED'
  | 'DEPRECATED';

export type AssetType = 
  | 'DIAGRAM'
  | 'ILLUSTRATION'
  | 'PHOTO'
  | 'CHART'
  | 'TABLE_IMAGE'
  | 'MATH_FORMULA'
  | 'INFOGRAPHIC'
  | 'ICON';

export type AssetStatus = 
  | 'DRAFT'
  | 'VALIDATED'
  | 'PUBLISHED'
  | 'ARCHIVED';

export type StorageProviderType = 
  | 'SUPABASE_STORAGE'
  | 'AWS_S3'
  | 'CLOUDFLARE_R2'
  | 'LOCAL_STORAGE'
  | 'MEMORY';

export type AccessClass = 
  | 'FREE_PUBLIC'
  | 'FREE_AUTHENTICATED'
  | 'PREMIUM'
  | 'ADMIN_ONLY'
  | 'INTERNAL';

export type ArtifactMimeType = 
  | 'text/mdx'
  | 'application/json'
  | 'text/markdown'
  | 'application/octet-stream';

export type AssetMimeType = 
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/svg+xml'
  | 'image/gif';

export type AssetUsageContext = 
  | 'INLINE'
  | 'HERO'
  | 'SUMMARY'
  | 'SOLUTION_STEP'
  | 'DIAGRAM_BLOCK';

export interface LearningContentArtifact {
  id: string;
  learning_unit_id: string;
  content_version_id?: string | null;
  artifact_type: ArtifactType;
  storage_provider: StorageProviderType;
  storage_bucket: string;
  storage_key: string;
  mime_type: ArtifactMimeType | string;
  byte_size: number;
  sha256_hash: string;
  compiler_version: string;
  schema_version: string;
  language: string;
  access_class: AccessClass;
  is_source_artifact: boolean;
  is_renderable: boolean;
  status: ArtifactStatus;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearningAsset {
  id: string;
  asset_type: AssetType;
  storage_provider: StorageProviderType;
  storage_bucket: string;
  storage_key: string;
  original_filename?: string | null;
  mime_type: AssetMimeType | string;
  byte_size: number;
  width?: number | null;
  height?: number | null;
  aspect_ratio?: number | null;
  sha256_hash: string;
  alt_text: string;
  caption?: string | null;
  attribution?: string | null;
  language: string;
  access_class: AccessClass;
  is_sanitized_svg: boolean;
  status: AssetStatus;
  created_at: string;
  updated_at: string;
}

export interface LearningUnitAssetBinding {
  id: string;
  learning_unit_id: string;
  artifact_id?: string | null;
  asset_id: string;
  usage_context: AssetUsageContext;
  created_at: string;
  asset?: LearningAsset;
}

export interface StorageGetResult {
  data: Buffer;
  mimeType: string;
  byteSize: number;
  sha256Hash: string;
  lastModified?: Date;
}

export interface StoragePutResult {
  bucket: string;
  key: string;
  byteSize: number;
  sha256Hash: string;
  provider: StorageProviderType;
}

export interface StorageMetadata {
  byteSize: number;
  mimeType: string;
  sha256Hash?: string;
  lastModified?: Date;
}

export interface ControlledMdxValidationResult {
  valid: boolean;
  errors: string[];
  componentsFound: string[];
  invalidComponents: string[];
}

export interface UploadValidationResult {
  valid: boolean;
  errors: string[];
  detectedMimeType?: string;
  byteSize?: number;
  sha256Hash?: string;
}

export interface AuthContext {
  userId?: string | null;
  role: 'ANONYMOUS' | 'AUTHENTICATED' | 'PREMIUM' | 'ADMIN' | 'SERVICE_ROLE';
  entitlements?: string[];
}
