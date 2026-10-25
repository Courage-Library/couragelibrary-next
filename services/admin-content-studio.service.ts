/**
 * COURAGE LIBRARY — ADMIN CONTENT STUDIO SERVICE
 * Phase 3D: Admin Authoring, Curriculum Management & Publishing Engine
 * 
 * Core Administrative Capabilities:
 * 1. Server-side RBAC & privilege enforcement
 * 2. Academic Taxonomy Explorer & multi-exam syllabus projection
 * 3. Learning Unit & Document management
 * 4. LessonDocumentSpec structured authoring & version lifecycle
 * 5. Real-time validation & controlled compilation pipeline
 * 6. Question Bank canonical search & PYQ reference integration
 * 7. Asset Catalog management, sanitization, and unit binding
 * 8. Server-authoritative atomic publishing with immutability locks
 * 9. Real curriculum coverage calculation
 * 10. Audit logging for all administrative actions
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import type { Json, TablesInsert } from '@/types/database';
import type { AppSupabaseClient } from '@/lib/supabase/types';
import { loadPublishedExamsForTopics, type PublishedTopicExam } from '@/lib/syllabus/published-topic-exams';
import { createServerSupabaseClient, createAdminServerSupabaseClient } from '@/lib/supabase/server';
import {
  LessonDocumentSpec,
  DocumentType,
  ReviewStatus,
  AuthorType,
  DocumentVersion,
  LearningDocument,
  CompilationResult,
} from '@/types/learning-compiler';
import { ContentSpecValidator } from '@/services/content-spec-validator';
import { ControlledContentCompiler } from '@/services/controlled-content-compiler.service';
import { createReferenceCatalogs } from '@/services/learning/reference-catalog';
import { LearningDocumentService } from '@/services/learning-document.service';
import { getLearningArtifactStorage } from '@/services/storage/learning-artifact-storage';

export const LEARNING_ACCESS_LEVELS = ['FREE', 'PRO'] as const;
export type LearningAccessLevel = (typeof LEARNING_ACCESS_LEVELS)[number];

export interface StudioDashboardStats {
  totalLearningUnits: number;
  unitsWithDocuments: number;
  totalDocuments: number;
  draftVersions: number;
  inReviewVersions: number;
  approvedVersions: number;
  compiledVersions: number;
  publishedVersions: number;
  totalAssets: number;
  totalAssetBindings: number;
  overallCoveragePct: number;
}

export interface AcademicExplorerNode {
  id: string;
  name: string;
  slug: string;
  type: 'EXAM' | 'SUBJECT' | 'TOPIC' | 'SUBTOPIC' | 'UNIT';
  children?: AcademicExplorerNode[];
  unitCount?: number;
  publishedCount?: number;
  mappedExams?: Array<{ examId: string; examTitle: string; requiredDepth?: string; isMandatory?: boolean }>;
}

export interface QuestionSearchResultItem {
  questionVersionId: string;
  questionId: string;
  versionNumber: number;
  questionText: string;
  questionType: string;
  options: Array<{ id: string; optionIndex: number; optionText: string }>;
  correctOptionId: string;
  explanation: string | null;
  examMetadata: {
    examTitle: string | null;
    year: number | null;
    shift: string | null;
    tier: string | null;
  };
}

export interface CurriculumCoverageReport {
  examId?: string;
  examTitle?: string;
  totalUnits: number;
  publishedUnits: number;
  coveragePct: number;
  subjectBreakdown: Array<{
    subjectId: string;
    subjectName: string;
    totalUnits: number;
    publishedUnits: number;
    coveragePct: number;
    topics: Array<{
      topicId: string;
      topicName: string;
      totalUnits: number;
      publishedUnits: number;
      coveragePct: number;
    }>;
  }>;
}

export class AdminContentStudioService {
  /**
   * Server-Side RBAC Guard: Ensures user has administrative staff privileges.
   */
  /**
   * SEC-1B: authorization always comes from the session via the canonical guard. The optional
   * `_callerSuppliedUserId` is accepted only for call-site compatibility and is IGNORED — it
   * previously skipped the admin check entirely (reachable from reviewVersionAction params).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async requireAdminAuth(actionName: string, _callerSuppliedUserId?: string): Promise<{ userId: string; userEmail: string }> {
    const ctx = await requireAdmin({ allowStaff: true });
    return { userId: ctx.userId, userEmail: ctx.userEmail || 'unknown' };
  }

  /**
   * Studio Dashboard Overview KPIs
   */
  static async getDashboardStats(): Promise<StudioDashboardStats> {
    await this.requireAdminAuth('getDashboardStats');
    const supabase = await createServerSupabaseClient();

    const [
      { count: totalUnits },
      { data: docData },
      { data: verData },
      { count: totalAssets },
      { count: totalAssetBindings },
    ] = await Promise.all([
      supabase.from('learning_units').select('*', { count: 'exact', head: true }),
      supabase.from('learning_documents').select('id, learning_unit_id, status'),
      supabase.from('document_versions').select('id, review_status, is_published'),
      supabase.from('learning_assets').select('*', { count: 'exact', head: true }),
      supabase.from('learning_unit_asset_bindings').select('*', { count: 'exact', head: true }),
    ]);

    const uCount = totalUnits || 0;
    const documents = docData || [];
    const versions = verData || [];

    const uniqueUnitsWithDocs = new Set(documents.map((d: any) => d.learning_unit_id)).size;

    let draftCount = 0;
    let inReviewCount = 0;
    let approvedCount = 0;
    let compiledCount = 0;
    let publishedCount = 0;

    versions.forEach((v: any) => {
      if (v.is_published) {
        publishedCount++;
      } else if (v.review_status === 'DRAFT' || v.review_status === 'AI_GENERATED') {
        draftCount++;
      } else if (v.review_status === 'IN_REVIEW' || v.review_status === 'STRUCTURALLY_VALID') {
        inReviewCount++;
      } else if (v.review_status === 'APPROVED') {
        approvedCount++;
      } else if (v.review_status === 'COMPILED') {
        compiledCount++;
      }
    });

    const overallCoveragePct = uCount > 0 ? Math.round((uniqueUnitsWithDocs / uCount) * 100) : 0;

    return {
      totalLearningUnits: uCount,
      unitsWithDocuments: uniqueUnitsWithDocs,
      totalDocuments: documents.length,
      draftVersions: draftCount,
      inReviewVersions: inReviewCount,
      approvedVersions: approvedCount,
      compiledVersions: compiledCount,
      publishedVersions: publishedCount,
      totalAssets: totalAssets || 0,
      totalAssetBindings: totalAssetBindings || 0,
      overallCoveragePct,
    };
  }

  /**
   * Academic Taxonomy Explorer Tree
   */
  static async getAcademicHierarchy(examId?: string): Promise<AcademicExplorerNode[]> {
    await this.requireAdminAuth('getAcademicHierarchy');
    const supabase = await createServerSupabaseClient();

    const [
      { data: subjects },
      { data: topics },
      { data: subtopics },
      { data: units },
      { data: documents },
    ] = await Promise.all([
      supabase.from('subjects').select('id, name, slug').order('display_order', { ascending: true }),
      supabase.from('topics').select('id, subject_id, name, slug').order('display_order', { ascending: true }),
      supabase.from('subtopics').select('id, topic_id, name, slug').order('display_order', { ascending: true }),
      supabase.from('learning_units').select('id, topic_id, subtopic_id, title, slug, unit_type, is_active').order('display_order', { ascending: true }),
      supabase.from('learning_documents').select('id, learning_unit_id, status'),
    ]);

    const subList = subjects || [];
    const topList = topics || [];
    const subTopList = subtopics || [];
    const unitList = units || [];
    const docList = documents || [];

    const unitsWithDocs = new Set(docList.map((d: any) => d.learning_unit_id));

    return subList.map((sub: any) => {
      const subTopics = topList.filter((t: any) => t.subject_id === sub.id);
      
      const topicNodes: AcademicExplorerNode[] = subTopics.map((top: any) => {
        const topUnits = unitList.filter((u: any) => u.topic_id === top.id);

        const unitNodes: AcademicExplorerNode[] = topUnits.map((u: any) => ({
          id: u.id,
          name: u.title,
          slug: u.slug,
          type: 'UNIT',
          publishedCount: unitsWithDocs.has(u.id) ? 1 : 0,
        }));

        return {
          id: top.id,
          name: top.name,
          slug: top.slug,
          type: 'TOPIC',
          unitCount: topUnits.length,
          publishedCount: topUnits.filter((u: any) => unitsWithDocs.has(u.id)).length,
          children: unitNodes,
        };
      });

      const totalUnits = topicNodes.reduce((acc, t) => acc + (t.unitCount || 0), 0);
      const totalPublished = topicNodes.reduce((acc, t) => acc + (t.publishedCount || 0), 0);

      return {
        id: sub.id,
        name: sub.name,
        slug: sub.slug,
        type: 'SUBJECT',
        unitCount: totalUnits,
        publishedCount: totalPublished,
        children: topicNodes,
      };
    });
  }

  /**
   * Learning Unit Detail with attached documents, mapped exams, and version lineage
   */
  static async getLearningUnitDetail(unitId: string): Promise<any | null> {
    await this.requireAdminAuth('getLearningUnitDetail');
    const supabase = await createServerSupabaseClient();

    const [
      { data: unit },
      { data: documents },
      { data: bindings },
    ] = await Promise.all([
      supabase.from('learning_units').select('*, topics:canonical_taxonomy_nodes!learning_units_topic_id_node_fkey(id, name, subjects:root_subject_id(id, name))').eq('id', unitId).single(),
      supabase.from('learning_documents').select('*, document_versions!document_versions_document_id_fkey(*)').eq('learning_unit_id', unitId), // TYPES-1 B4 (Class B): two FKs → PGRST201 without the hint
      supabase.from('learning_unit_asset_bindings').select('*, learning_assets(*)').eq('learning_unit_id', unitId),
    ]);

    if (!unit) return null;

    // GAP2-4b: exams come from PUBLISHED syllabus versions that map the unit's topic (empty when none is published).
    const examsByTopic = unit.topic_id ? await loadPublishedExamsForTopics(supabase, [unit.topic_id]) : null;
    const mappedExams: PublishedTopicExam[] = (unit.topic_id && examsByTopic?.get(unit.topic_id)) || [];

    return {
      unit,
      documents: documents || [],
      assets: bindings || [],
      mappedExams,
    };
  }

  /**
   * Create a new canonical Learning Document bound to a Learning Unit
   */
  static async createDocument(params: {
    learningUnitId: string;
    canonicalSlug: string;
    documentType: DocumentType;
    accessLevel?: LearningAccessLevel;
  }): Promise<LearningDocument> {
    const admin = await this.requireAdminAuth('createDocument');
    const supabase = createAdminServerSupabaseClient();
    const accessLevel = params.accessLevel ?? 'FREE';
    if (!LEARNING_ACCESS_LEVELS.includes(accessLevel)) {
      throw new Error(`Invalid access level "${String(accessLevel)}".`);
    }

    const { data: existing } = await supabase
      .from('learning_documents')
      .select('id')
      .eq('canonical_slug', params.canonicalSlug)
      .maybeSingle();

    if (existing) {
      throw new Error(`A document with canonical slug "${params.canonicalSlug}" already exists.`);
    }

    const { data, error } = await supabase
      .from('learning_documents')
      .insert({
        learning_unit_id: params.learningUnitId,
        canonical_slug: params.canonicalSlug,
        document_type: params.documentType,
        access_level: accessLevel,
        status: 'DRAFT',
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create learning document: ${error?.message}`);
    }

    await this.audit(admin, 'LEARNING_DOCUMENT_CREATE', 'learning_document', data.id, null, {
      canonical_slug: params.canonicalSlug,
      document_type: params.documentType,
      access_level: accessLevel,
      learning_unit_id: params.learningUnitId,
    });
    return data as LearningDocument;
  }

  /**
   * GAP2-2a: Create a Learning Unit under an existing TOPIC (the unit binds documents to the taxonomy).
   */
  static async createLearningUnit(params: {
    topicId: string;
    title: string;
    slug: string;
    unitType: DocumentType;
    estimatedMinutes?: number;
  }): Promise<{ id: string; topic_id: string; title: string; slug: string }> {
    const admin = await this.requireAdminAuth('createLearningUnit');
    const supabase = createAdminServerSupabaseClient();
    const title = (params.title || '').trim();
    if (!title) throw new Error('Unit title is required.');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.slug || '')) throw new Error('Unit slug must be lowercase letters, digits and hyphens.');

    // F6: validate against the canonical taxonomy (learning_units.topic_id references canonical TOPIC nodes since GAP2-3)
    if (!(await this.isActiveCanonicalTopic(supabase, params.topicId))) throw new Error('Topic not found. Pick an existing topic from the taxonomy.');

    const { data, error } = await supabase
      .from('learning_units')
      .insert({
        topic_id: params.topicId,
        title,
        slug: params.slug,
        unit_type: params.unitType,
        estimated_minutes: Math.max(1, Math.trunc(params.estimatedMinutes || 10)),
        is_active: true,
      })
      .select('id, topic_id, title, slug')
      .single();
    if (error || !data) throw new Error(`Failed to create learning unit: ${error?.message}`);

    await this.audit(admin, 'LEARNING_UNIT_CREATE', 'learning_unit', data.id, null, { ...data, unit_type: params.unitType });
    return data;
  }

  private static async isActiveCanonicalTopic(supabase: AppSupabaseClient, topicId: string): Promise<boolean> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(topicId))) return false;
    const { data } = await supabase.from('canonical_taxonomy_nodes').select('id').eq('id', topicId).eq('node_type', 'TOPIC').eq('is_active', true).maybeSingle();
    return Boolean(data);
  }

  /**
   * F6: topics ↔ study notes. Every active canonical TOPIC (with its section) and the learning units (study notes)
   * linked to it, with each unit's document count and published count. Admin / staff only.
   */
  static async getTopicLinks(): Promise<Array<{ id: string; name: string; sectionName: string | null; units: Array<{ id: string; title: string; slug: string; isActive: boolean; documents: number; published: number }> }>> {
    await this.requireAdminAuth('getTopicLinks');
    const supabase = createAdminServerSupabaseClient();
    const [{ data: topics }, { data: units }] = await Promise.all([
      supabase.from('canonical_taxonomy_nodes').select('id, name, parent_id, display_order').eq('node_type', 'TOPIC').eq('is_active', true).order('display_order', { ascending: true }).limit(2000),
      supabase.from('learning_units').select('id, topic_id, title, slug, is_active, learning_documents(id, status)').limit(5000),
    ]);
    const parentIds = [...new Set((topics ?? []).map((t) => t.parent_id).filter((x): x is string => Boolean(x)))];
    const { data: parents } = parentIds.length ? await supabase.from('canonical_taxonomy_nodes').select('id, name').in('id', parentIds) : { data: [] as Array<{ id: string; name: string }> };
    const parentName = new Map((parents ?? []).map((x) => [x.id, x.name]));
    return (topics ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      sectionName: t.parent_id ? parentName.get(t.parent_id) ?? null : null,
      units: (units ?? [])
        .filter((u) => u.topic_id === t.id)
        .map((u) => {
          const docs = Array.isArray(u.learning_documents) ? u.learning_documents : u.learning_documents ? [u.learning_documents] : [];
          return { id: u.id, title: u.title, slug: u.slug, isActive: u.is_active !== false, documents: docs.length, published: docs.filter((d) => d.status === 'PUBLISHED').length };
        }),
    }));
  }

  /**
   * F6: move a learning unit (and so its articles) to another canonical topic. Admin / staff only, audited. The
   * per-topic slug stays unique (UNIQUE (topic_id, slug)); nothing is copied (no duplicate content).
   */
  static async relinkLearningUnitTopic(unitId: string, topicId: string): Promise<{ id: string; topic_id: string }> {
    const admin = await this.requireAdminAuth('relinkLearningUnitTopic');
    const supabase = createAdminServerSupabaseClient();
    if (!(await this.isActiveCanonicalTopic(supabase, topicId))) throw new Error('Topic not found. Pick an existing topic from the taxonomy.');
    const { data: before } = await supabase.from('learning_units').select('id, topic_id, slug').eq('id', unitId).maybeSingle();
    if (!before) throw new Error('Study unit not found.');
    if (before.topic_id === topicId) return { id: before.id, topic_id: before.topic_id };
    const { data, error } = await supabase.from('learning_units').update({ topic_id: topicId, updated_at: new Date().toISOString() }).eq('id', unitId).select('id, topic_id').single();
    if (error?.code === '23505') throw new Error('That topic already has a study unit with the same slug. Rename one of them first.');
    if (error || !data) throw new Error('Failed to move the study unit.');
    await this.audit(admin, 'LEARNING_UNIT_RELINK', 'learning_unit', unitId, { topic_id: before.topic_id }, { topic_id: data.topic_id });
    return data;
  }

  /**
   * GAP2-2a: Set a document's access level (FREE / PRO). Admin only, audited.
   */
  static async setDocumentAccessLevel(documentId: string, accessLevel: LearningAccessLevel): Promise<LearningDocument> {
    const admin = await this.requireAdminAuth('setDocumentAccessLevel');
    if (!LEARNING_ACCESS_LEVELS.includes(accessLevel)) throw new Error(`Invalid access level "${String(accessLevel)}".`);
    const supabase = createAdminServerSupabaseClient();
    const { data: before } = await supabase.from('learning_documents').select('id, access_level').eq('id', documentId).maybeSingle();
    if (!before) throw new Error('Document not found.');
    const { data, error } = await supabase
      .from('learning_documents')
      .update({ access_level: accessLevel, updated_at: new Date().toISOString() })
      .eq('id', documentId)
      .select()
      .single();
    if (error || !data) throw new Error(`Failed to update access level: ${error?.message}`);
    await this.audit(admin, 'LEARNING_DOCUMENT_ACCESS_LEVEL', 'learning_document', documentId, { access_level: before.access_level }, { access_level: accessLevel });
    return data as LearningDocument;
  }

  /**
   * GAP2-2a: Archive a document (status ARCHIVED). Published versions stay immutable and
   * preserved; the document simply stops being served to candidates.
   */
  static async archiveDocument(documentId: string): Promise<LearningDocument> {
    const admin = await this.requireAdminAuth('archiveDocument');
    const supabase = createAdminServerSupabaseClient();
    const { data: before } = await supabase.from('learning_documents').select('id, status').eq('id', documentId).maybeSingle();
    if (!before) throw new Error('Document not found.');
    const { data, error } = await supabase
      .from('learning_documents')
      .update({ status: 'ARCHIVED', updated_at: new Date().toISOString() })
      .eq('id', documentId)
      .select()
      .single();
    if (error || !data) throw new Error(`Failed to archive document: ${error?.message}`);
    await this.audit(admin, 'LEARNING_DOCUMENT_ARCHIVE', 'learning_document', documentId, { status: before.status }, { status: 'ARCHIVED' });
    return data as LearningDocument;
  }

  private static async audit(
    admin: { userId: string; userEmail: string },
    actionType: string,
    targetEntity: string,
    targetId: string,
    oldValue: Record<string, unknown> | null,
    newValue: Record<string, unknown> | null
  ): Promise<void> {
    const supabase = createAdminServerSupabaseClient();
    const { error } = await supabase.from('admin_audit_logs').insert({
      actor_id: /^[0-9a-f-]{36}$/i.test(admin.userId) ? admin.userId : null,
      actor_email: admin.userEmail,
      action_type: actionType,
      target_entity: targetEntity,
      target_id: targetId,
      // audit payloads are plain JSON-serialisable objects built in this service
      old_value: oldValue as Json | null,
      new_value: newValue as Json | null,
      reason: null,
    });
    if (error) console.warn(`[AdminContentStudioService] audit log insert failed for ${actionType}: ${error.code || 'unknown'}`);
  }

  /**
   * Create a new Draft Version for a Learning Document
   */
  static async createDraftVersion(params: {
    documentId: string;
    spec: LessonDocumentSpec;
    authorType?: AuthorType;
  }): Promise<DocumentVersion> {
    await this.requireAdminAuth('createDraftVersion');
    const supabase = createAdminServerSupabaseClient();

    const { data: latestVer } = await supabase
      .from('document_versions')
      .select('version_number')
      .eq('document_id', params.documentId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersionNumber = (latestVer?.version_number || 0) + 1;

    const validationResult = ContentSpecValidator.validate(params.spec);
    const initialStatus: ReviewStatus = validationResult.isValid ? 'STRUCTURALLY_VALID' : 'DRAFT';

    const storageProvider = getLearningArtifactStorage();
    const storageBucket = 'learning-artifacts';

    const compileStore = await LearningDocumentService.compileAndStoreVersion({
      documentId: params.documentId,
      versionNumber: nextVersionNumber,
      spec: params.spec,
      storageProvider,
      storageBucket,
      authorType: params.authorType || 'HUMAN',
      referenceCatalogs: createReferenceCatalogs(supabase, storageProvider),
    });

    const { data, error } = await supabase
      .from('document_versions')
      .insert({
        // compileAndStoreVersion always sets every required column (incl. compiled_artifact_hash)
        ...(compileStore.version as TablesInsert<'document_versions'>),
        review_status: initialStatus,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to insert document version: ${error?.message}`);
    }

    return data as DocumentVersion;
  }

  /**
   * Fetch Version Spec and Compiled MDX from storage
   */
  static async getVersionSpec(versionId: string): Promise<{
    success: boolean;
    spec: LessonDocumentSpec | null;
    compiledMdx: string | null;
    version: DocumentVersion | null;
  }> {
    await this.requireAdminAuth('getVersionSpec');
    const supabase = await createServerSupabaseClient();

    const { data: version } = await supabase
      .from('document_versions')
      .select('*')
      .eq('id', versionId)
      .maybeSingle();

    if (!version) {
      // SEC-1B: no in-memory cache fallback.
      return { success: false, spec: null, compiledMdx: null, version: null };
    }

    const storageProvider = getLearningArtifactStorage();
    let spec: LessonDocumentSpec | null = null;
    let compiledMdx: string | null = null;

    if (version.source_spec_storage_key) {
      const specRes = await storageProvider.get('learning-artifacts', version.source_spec_storage_key);
      if (specRes?.data) {
        try {
          spec = JSON.parse(specRes.data.toString('utf8'));
        } catch {
          // ignore parse error
        }
      }
    }

    if (version.compiled_artifact_storage_key) {
      const mdxRes = await storageProvider.get('learning-artifacts', version.compiled_artifact_storage_key);
      if (mdxRes?.data) {
        compiledMdx = mdxRes.data.toString('utf8');
      }
    }

    return {
      success: true,
      spec,
      compiledMdx,
      version: version as DocumentVersion,
    };
  }

  /**
   * Create a new Revision Draft (vN+1) from an existing or published version
   */
  static async createRevision(params: {
    documentId: string;
    baseVersionId?: string;
    authorType?: AuthorType;
  }): Promise<DocumentVersion> {
    await this.requireAdminAuth('createRevision');
    const supabase = createAdminServerSupabaseClient();

    let baseSpec: LessonDocumentSpec | null = null;

    if (params.baseVersionId) {
      const specRes = await this.getVersionSpec(params.baseVersionId);
      if (specRes.success && specRes.spec) {
        baseSpec = specRes.spec;
      }
    }

    if (!baseSpec) {
      const { data: latestVer } = await supabase
        .from('document_versions')
        .select('*')
        .eq('document_id', params.documentId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestVer?.source_spec_storage_key) {
        const specRes = await this.getVersionSpec(latestVer.id);
        if (specRes.success && specRes.spec) {
          baseSpec = specRes.spec;
        }
      }
    }

    if (!baseSpec) {
      throw new Error(`Cannot create revision: Base version spec could not be resolved for document ${params.documentId}.`);
    }

    return await this.createDraftVersion({
      documentId: params.documentId,
      spec: baseSpec,
      authorType: params.authorType || 'HUMAN',
    });
  }

  /**
   * Save / Update Draft Spec
   */
  static async saveDraftSpec(params: {
    versionId: string;
    spec: LessonDocumentSpec;
  }): Promise<{ success: boolean; validation: ReturnType<typeof ContentSpecValidator.validate> }> {
    await this.requireAdminAuth('saveDraftSpec');
    const supabase = createAdminServerSupabaseClient();

    const { data: version } = await supabase
      .from('document_versions')
      .select('*')
      .eq('id', params.versionId)
      .single();

    if (!version) {
      throw new Error(`Document version ${params.versionId} not found.`);
    }

    LearningDocumentService.assertMutable(version as DocumentVersion);

    const valResult = ContentSpecValidator.validate(params.spec);
    const updatedStatus: ReviewStatus = valResult.isValid ? 'STRUCTURALLY_VALID' : 'DRAFT';

    const storageProvider = getLearningArtifactStorage();
    const storageBucket = 'learning-artifacts';

    const compileStore = await LearningDocumentService.compileAndStoreVersion({
      documentId: version.document_id,
      versionNumber: version.version_number,
      spec: params.spec,
      storageProvider,
      storageBucket,
      authorType: version.author_type as 'HUMAN' | 'AI_ASSISTED' | 'LEGACY_CONVERSION',
      referenceCatalogs: createReferenceCatalogs(supabase, storageProvider),
    });

    const { error: updateError } = await supabase
      .from('document_versions')
      .update({
        // compileAndStoreVersion always sets every required column (incl. compiled_artifact_hash)
        ...(compileStore.version as TablesInsert<'document_versions'>),
        review_status: updatedStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.versionId);

    if (updateError) {
      throw new Error(`Failed to save draft spec: ${updateError.message}`);
    }

    return { success: true, validation: valResult };
  }

  /**
   * Submit Version for Review
   */
  static async submitForReview(versionId: string, supabaseClient?: AppSupabaseClient, adminUserId?: string): Promise<DocumentVersion> {
    await this.requireAdminAuth('submitForReview', adminUserId);
    const supabase = supabaseClient || (createAdminServerSupabaseClient());

    const { data: version } = await supabase.from('document_versions').select('*').eq('id', versionId).single();
    if (!version) throw new Error(`Version ${versionId} not found.`);

    LearningDocumentService.assertMutable(version as DocumentVersion);

    if (version.review_status === 'IN_REVIEW' || version.review_status === 'APPROVED' || version.review_status === 'PUBLISHED') {
      throw new Error(`Cannot submit for review: version is already in "${version.review_status}" status.`);
    }

    const { data, error } = await supabase
      .from('document_versions')
      .update({ review_status: 'IN_REVIEW', updated_at: new Date().toISOString() })
      .eq('id', versionId)
      .select()
      .single();

    if (error) throw new Error(`Failed to submit for review: ${error.message}`);
    return data as DocumentVersion;
  }

  /**
   * Review Version (Approve or Reject).
   * SEC-1B: no in-memory fallback — a failed read or write throws (surfaced as DB_ERROR).
   */
  static async reviewVersion(params: {
    versionId: string;
    decision: 'APPROVED' | 'REJECTED';
    feedback?: string;
    adminUserId?: string;
  }, supabaseClient?: AppSupabaseClient): Promise<DocumentVersion> {
    const { userId } = await this.requireAdminAuth('reviewVersion');
    const supabase = supabaseClient || (createAdminServerSupabaseClient());

    const { data: version, error: readErr } = await supabase.from('document_versions').select('*').eq('id', params.versionId).maybeSingle();
    if (readErr) throw readErr;
    if (!version) throw new Error(`Version ${params.versionId} not found.`);

    LearningDocumentService.assertMutable(version as DocumentVersion);

    if (version.review_status !== 'IN_REVIEW' && version.review_status !== 'AI_GENERATED' && version.review_status !== 'STRUCTURALLY_VALID' && version.review_status !== 'DRAFT') {
      throw new Error(`Cannot review version in status "${version.review_status}". Only versions pending review can be approved or rejected.`);
    }

    const targetStatus: ReviewStatus = params.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    const { data, error } = await supabase
      .from('document_versions')
      .update({
        review_status: targetStatus,
        approved_by_user_id: params.decision === 'APPROVED' ? userId : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.versionId)
      .select()
      .single();
    if (error || !data) throw error || new Error('Review update returned no row.');
    return data as DocumentVersion;
  }

  /**
   * Compile Version.
   * SEC-1B: no in-memory fallback — read, storage and update failures throw.
   */
  static async compileVersion(versionId: string, supabaseClient?: AppSupabaseClient): Promise<{ success: boolean; result: CompilationResult; compiled_mdx?: string }> {
    await this.requireAdminAuth('compileVersion');
    const supabase = supabaseClient || (createAdminServerSupabaseClient());

    const { data: version, error: readErr } = await supabase.from('document_versions').select('*').eq('id', versionId).maybeSingle();
    if (readErr) throw readErr;
    if (!version) throw new Error(`Version ${versionId} not found.`);

    LearningDocumentService.assertMutable(version as DocumentVersion);

    const storageProvider = getLearningArtifactStorage();
    const specRes = await storageProvider.get('learning-artifacts', version.source_spec_storage_key);
    if (!specRes) throw new Error(`Source spec file not found in storage.`);

    const spec: LessonDocumentSpec = JSON.parse(specRes.data.toString('utf8'));
    const compResult = await ControlledContentCompiler.compile(spec, createReferenceCatalogs(supabase, storageProvider));

    if (!compResult.success || !compResult.artifact) {
      return { success: false, result: compResult };
    }

    await storageProvider.put(
      'learning-artifacts',
      version.compiled_artifact_storage_key,
      Buffer.from(compResult.artifact.compiledMdx, 'utf8'),
      'text/mdx'
    );

    const { error } = await supabase
      .from('document_versions')
      .update({
        review_status: 'COMPILED',
        compiled_artifact_hash: compResult.artifact.compiledArtifactHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', versionId);
    if (error) throw error;

    return { success: true, result: compResult, compiled_mdx: compResult.artifact.compiledMdx };
  }

  /**
   * Server-Authoritative Publishing with Immutability Lock.
   * SEC-1B: no in-memory fallback — a failed version or document update throws; the result is
   * always the persisted rows.
   */
  static async publishVersion(versionId: string, supabaseClient?: AppSupabaseClient): Promise<{ document: LearningDocument; version: DocumentVersion }> {
    const { userId } = await this.requireAdminAuth('publishVersion');
    const supabase = supabaseClient || (createAdminServerSupabaseClient());

    const { data: version, error: readErr } = await supabase.from('document_versions').select('*').eq('id', versionId).maybeSingle();
    if (readErr) throw readErr;
    if (!version) throw new Error(`Version ${versionId} not found.`);
    if (version.is_published) throw new Error(`Version ${versionId} is already published.`);

    if (version.review_status !== 'COMPILED' && version.review_status !== 'APPROVED') {
      throw new Error(
        `[INVALID_TRANSITION] Version must be in COMPILED or APPROVED status before publishing. Current status: "${version.review_status}". Compile the version first.`
      );
    }

    const storageProvider = getLearningArtifactStorage();
    const exists = await storageProvider.exists('learning-artifacts', version.compiled_artifact_storage_key);
    if (!exists) {
      throw new Error(`Compiled artifact does not exist in storage.`);
    }

    // GAP2-2b (Q5): references are re-verified against the real catalogs at publish time — a
    // version with any unresolved question/asset reference cannot be published.
    const specRes = await storageProvider.get('learning-artifacts', version.source_spec_storage_key);
    if (!specRes) throw new Error('[UNRESOLVED_REFERENCES] Source spec file not found in storage; the version cannot be published.');
    const publishSpec: LessonDocumentSpec = JSON.parse(specRes.data.toString('utf8'));
    const refCheck = await ControlledContentCompiler.verifyReferences(publishSpec, createReferenceCatalogs(supabase, storageProvider));
    if (refCheck.errors.length > 0) {
      throw new Error(`[UNRESOLVED_REFERENCES] ${refCheck.errors.map((e) => e.message).join(' ')}`);
    }

    const nowIso = new Date().toISOString();
    const { data: publishedVer, error: verErr } = await supabase
      .from('document_versions')
      .update({
        is_published: true,
        review_status: 'PUBLISHED',
        published_at: nowIso,
        approved_by_user_id: version.approved_by_user_id || userId,
        updated_at: nowIso,
      })
      .eq('id', versionId)
      .select()
      .single();
    if (verErr || !publishedVer) throw verErr || new Error('Publish update returned no version row.');

    const { data: updatedDoc, error: docErr } = await supabase
      .from('learning_documents')
      .update({
        current_published_version_id: versionId,
        status: 'PUBLISHED',
        updated_at: nowIso,
      })
      .eq('id', version.document_id)
      .select()
      .single();
    if (docErr || !updatedDoc) throw docErr || new Error('Publish update returned no document row.');

    return {
      document: updatedDoc as LearningDocument,
      version: publishedVer as DocumentVersion,
    };
  }

  /**
   * Search Canonical Question Bank
   */
  static async searchQuestionBank(query: string, filters?: { subjectId?: string; topicId?: string }): Promise<QuestionSearchResultItem[]> {
    await this.requireAdminAuth('searchQuestionBank');
    const supabase = await createServerSupabaseClient();

    let q = supabase
      .from('question_versions')
      // TYPES-1 B4 (Class B): question_type / explanation never existed on question_versions (42703) — the picker always
      // returned nothing. All bank items are single-choice; explanations live in question_answers (not loaded here).
      .select('id, question_id, version_number, question_text, questions(id, status)')
      .limit(20);

    if (query && query.trim()) {
      q = q.ilike('question_text', `%${query.trim()}%`);
    }

    const { data, error } = await q;
    if (error || !data) return [];

    return data.map((row) => ({
      questionVersionId: row.id,
      questionId: row.question_id,
      versionNumber: row.version_number,
      questionText: row.question_text || '',
      questionType: 'SINGLE_CHOICE',
      options: [],
      correctOptionId: '',
      explanation: null,
      examMetadata: {
        examTitle: 'Canonical PYQ',
        year: 2024,
        shift: null,
        tier: null,
      },
    }));
  }

  /**
   * Search Phase 3B Media Assets Catalog
   */
  static async searchAssets(query?: string, assetType?: string): Promise<any[]> {
    await this.requireAdminAuth('searchAssets');
    const supabase = await createServerSupabaseClient();

    let q = supabase.from('learning_assets').select('*').order('created_at', { ascending: false }).limit(30);

    if (query && query.trim()) {
      q = q.or(`title.ilike.%${query.trim()}%,alt_text.ilike.%${query.trim()}%,slug.ilike.%${query.trim()}%`);
    }

    if (assetType && assetType !== 'ALL') {
      q = q.eq('asset_type', assetType);
    }

    const { data, error } = await q;
    if (error || !data) return [];
    return data;
  }

  /**
   * Curriculum Coverage Calculation
   */
  static async getCurriculumCoverage(examId?: string): Promise<CurriculumCoverageReport> {
    await this.requireAdminAuth('getCurriculumCoverage');
    const supabase = await createServerSupabaseClient();

    const [
      { data: subjects },
      { data: topics },
      { data: units },
      { data: documents },
    ] = await Promise.all([
      supabase.from('subjects').select('id, name').order('display_order', { ascending: true }),
      supabase.from('topics').select('id, subject_id, name').order('display_order', { ascending: true }),
      supabase.from('learning_units').select('id, topic_id, is_active'),
      supabase.from('learning_documents').select('id, learning_unit_id, status').eq('status', 'PUBLISHED'),
    ]);

    const subList = subjects || [];
    const topList = topics || [];
    const unitList = units || [];
    const docList = documents || [];

    const publishedUnitsSet = new Set(docList.map((d: any) => d.learning_unit_id));

    let totalUnits = 0;
    let publishedUnits = 0;

    const subjectBreakdown = subList.map((sub: any) => {
      const subTopics = topList.filter((t: any) => t.subject_id === sub.id);

      let subTotalUnits = 0;
      let subPublishedUnits = 0;

      const topicBreakdown = subTopics.map((top: any) => {
        const tUnits = unitList.filter((u: any) => u.topic_id === top.id);
        const tTotal = tUnits.length;
        const tPublished = tUnits.filter((u: any) => publishedUnitsSet.has(u.id)).length;
        const tPct = tTotal > 0 ? Math.round((tPublished / tTotal) * 100) : 0;

        subTotalUnits += tTotal;
        subPublishedUnits += tPublished;

        return {
          topicId: top.id,
          topicName: top.name,
          totalUnits: tTotal,
          publishedUnits: tPublished,
          coveragePct: tPct,
        };
      });

      const subPct = subTotalUnits > 0 ? Math.round((subPublishedUnits / subTotalUnits) * 100) : 0;
      totalUnits += subTotalUnits;
      publishedUnits += subPublishedUnits;

      return {
        subjectId: sub.id,
        subjectName: sub.name,
        totalUnits: subTotalUnits,
        publishedUnits: subPublishedUnits,
        coveragePct: subPct,
        topics: topicBreakdown,
      };
    });

    const overallPct = totalUnits > 0 ? Math.round((publishedUnits / totalUnits) * 100) : 0;

    return {
      examId,
      examTitle: examId ? 'Selected Exam Syllabus' : 'Universal Canonical Curriculum',
      totalUnits,
      publishedUnits,
      coveragePct: overallPct,
      subjectBreakdown,
    };
  }
}
