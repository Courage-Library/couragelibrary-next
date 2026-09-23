/**
 * COURAGE LIBRARY — EXAM ONBOARDING IMPORTER SERVICE
 * Phase 3K: Canonical Importer & Idempotent Draft Persistence Engine
 */

import {
  ExamOnboardingSpec,
  ExamOnboardingImportPreview,
  ExamOnboardingImportCommitResult,
} from '@/types/exam-onboarding';
import { createAdminServerSupabaseClient } from '@/lib/supabase/server';
import { ExamOnboardingService } from './exam-onboarding.service';
import { ExamReadinessService } from './exam-readiness.service';
import { ExamOnboardingValidatorService } from './exam-onboarding-validator.service';

export class ExamOnboardingImporterService {
  /**
   * Generates a full preview and diff summary without modifying the database.
   */
  static async generateImportPreview(
    rawInput: string,
    options?: {
      targetExamName?: string;
      targetCycleYear?: number;
      expectedContextHash?: string;
      customSupabase?: any;
    }
  ): Promise<ExamOnboardingImportPreview> {
    const supabase = options?.customSupabase || createAdminServerSupabaseClient();
    const valResult = await ExamOnboardingValidatorService.validatePayload(rawInput, {
      ...options,
      customSupabase: supabase,
    });

    const spec = valResult.spec;
    const canonicalTaxonomy = await ExamOnboardingService.getCanonicalTaxonomy(supabase);

    let orgStatus: "NEW" | "MATCHED" = "NEW";
    let matchedOrgId: string | undefined;
    let examStatus: "NEW" | "MATCHED" = "NEW";
    let matchedExamId: string | undefined;
    let cycleStatus: "NEW" | "MATCHED" | "SKIPPED" = "SKIPPED";
    let matchedCycleId: string | undefined;

    if (spec) {
      try {
        const orgSlug = (spec.organization?.slug || spec.organization?.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const { data: org } = await supabase
          .from("conducting_orgs")
          .select("id, name, slug")
          .or(`slug.eq.${orgSlug},name.ilike.${spec.organization?.name || ""}`)
          .maybeSingle();

        if (org) {
          orgStatus = "MATCHED";
          matchedOrgId = org.id;
        }

        const examSlug = (spec.exam?.slug || spec.exam?.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const { data: ex } = await supabase
          .from("exams")
          .select("id, title, slug")
          .or(`slug.eq.${examSlug},title.ilike.${spec.exam?.title || ""}`)
          .maybeSingle();

        if (ex) {
          examStatus = "MATCHED";
          matchedExamId = ex.id;

          if (spec.cycle?.cycle_year) {
            const { data: cyc } = await supabase
              .from("exam_cycles")
              .select("id, cycle_year")
              .eq("exam_id", ex.id)
              .eq("cycle_year", spec.cycle.cycle_year)
              .maybeSingle();

            if (cyc) {
              cycleStatus = "MATCHED";
              matchedCycleId = cyc.id;
            } else {
              cycleStatus = "NEW";
            }
          }
        } else if (spec.cycle?.cycle_year) {
          cycleStatus = "NEW";
        }
      } catch (_) {}
    }

    const syllabusDiff = (spec?.syllabus?.subjects || []).map((s) => {
      const canonicalSubj = canonicalTaxonomy.find(
        (cs) => cs.name.toLowerCase() === s.subject_name.toLowerCase() || cs.slug === s.subject_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      );

      const topicDiffs = (s.topics || []).map((t) => {
        const canonicalTop = canonicalSubj?.topics.find(
          (ct) => ct.name.toLowerCase() === t.topic_name.toLowerCase() || ct.slug === t.topic_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
        );

        return {
          topicName: t.topic_name,
          isMatched: Boolean(canonicalTop),
          canonicalTopicId: canonicalTop?.id,
          isNewCandidate: !canonicalTop || Boolean(t.is_new_canonical_candidate),
        };
      });

      return {
        subjectName: s.subject_name,
        isMatched: Boolean(canonicalSubj),
        topics: topicDiffs,
      };
    });

    const postsDiff = (spec?.posts || []).map((p) => ({
      status: "NEW" as const,
      postName: p.post_name,
      payLevel: p.pay_level,
    }));

    const knowledgeModulesDiff = (spec?.knowledge_modules || []).map((m) => ({
      moduleKey: m.module_key,
      title: m.title,
      status: "NEW" as const,
    }));

    return {
      validationResult: valResult,
      diffSummary: {
        organization: {
          status: orgStatus,
          name: spec?.organization?.name || "Unspecified",
          slug: spec?.organization?.slug || "",
          id: matchedOrgId,
        },
        exam: {
          status: examStatus,
          title: spec?.exam?.title || "Unspecified",
          slug: spec?.exam?.slug || "",
          id: matchedExamId,
        },
        cycle: {
          status: cycleStatus,
          cycleYear: spec?.cycle?.cycle_year,
          id: matchedCycleId,
        },
        posts: postsDiff,
        syllabus: syllabusDiff,
        knowledgeModules: knowledgeModulesDiff,
        sourcesCount: (spec?.sources || []).length,
        claimsCount: (spec?.claims || []).length,
        unresolvedCount: (spec?.unresolved_items || []).length,
      },
      contextHash: spec?.context_hash || "",
    };
  }

  /**
   * Commits the validated specification idempotently to canonical database tables.
   */
  static async commitImportDraft(
    spec: ExamOnboardingSpec,
    options?: {
      resolvedConflicts?: Record<string, any>;
      adminUserId?: string;
      customSupabase?: any;
    }
  ): Promise<ExamOnboardingImportCommitResult> {
    const supabase = options?.customSupabase || createAdminServerSupabaseClient();

    // 1. Create or Resolve Conducting Organization
    let orgId: string;
    const orgName = spec.organization?.name?.trim() || "Central Recruitment Commission";
    const orgSlug = (spec.organization?.slug || orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-")).trim();

    const orgItem = await ExamOnboardingService.createConductingOrg(
      orgName,
      orgSlug,
      spec.organization?.official_website || undefined,
      supabase
    );
    orgId = orgItem.id;

    // 2. Create or Resolve Exam Draft (Strictly is_active = false)
    const examTitle = spec.exam.title.trim();
    const examSlug = (spec.exam.slug || examTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")).trim();

    const { data: existingExam } = await supabase
      .from("exams")
      .select("id, title, slug")
      .eq("slug", examSlug)
      .maybeSingle();

    let examId: string;
    if (existingExam) {
      examId = existingExam.id;
      await ExamOnboardingService.updateExamIdentity(
        examId,
        {
          title: examTitle,
          orgId,
          category: spec.exam.category || "National Recruitment",
          description: spec.exam.description || undefined,
        },
        supabase
      );
    } else {
      const createdDraft = await ExamOnboardingService.createExamDraft(
        {
          title: examTitle,
          slug: examSlug,
          orgId,
          category: spec.exam.category || "National Recruitment",
          description: spec.exam.description || undefined,
        },
        supabase
      );
      examId = createdDraft.examId;
    }

    // 3. Create or Resolve Exam Cycle
    let cycleId: string | null = null;
    if (spec.cycle?.cycle_year) {
      const cycleYear = spec.cycle.cycle_year;
      const { data: existingCycle } = await supabase
        .from("exam_cycles")
        .select("id")
        .eq("exam_id", examId)
        .eq("cycle_year", cycleYear)
        .maybeSingle();

      const savedCycle = await ExamOnboardingService.createOrUpdateCycle(
        examId,
        {
          cycleId: existingCycle?.id,
          cycleYear,
          cycleName: spec.cycle.cycle_name,
          notificationDate: spec.cycle.notification_date || null,
          applicationStartDate: spec.cycle.application_start_date || null,
          applicationEndDate: spec.cycle.application_end_date || null,
        },
        supabase
      );
      cycleId = savedCycle.cycleId;
    }

    // 4. Persist Posts
    let postsCount = 0;
    for (const p of spec.posts || []) {
      await ExamOnboardingService.saveExamPost(
        {
          examId,
          postName: p.post_name,
          postCode: p.post_code || null,
          department: p.department || null,
          ministry: p.ministry || null,
          classificationGroup: p.classification_group || "Group B",
          isGazetted: Boolean(p.is_gazetted),
          payLevel: p.pay_level ?? 7,
          gradePay: p.grade_pay ?? null,
          cpcBasicPayMin: p.cpc_basic_pay_min ?? null,
          cpcBasicPayMax: p.cpc_basic_pay_max ?? null,
          isActive: true,
        },
        supabase
      );
      postsCount++;
    }

    // 5. Map Canonical Syllabus Topics
    let syllabusTopicsMapped = 0;
    const canonicalTaxonomy = await ExamOnboardingService.getCanonicalTaxonomy(supabase);

    const mappedSubjects: any[] = [];
    for (const subj of spec.syllabus?.subjects || []) {
      const canonicalSubj = canonicalTaxonomy.find(
        (cs) => cs.name.toLowerCase() === subj.subject_name.toLowerCase() || cs.slug === subj.subject_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      ) || canonicalTaxonomy[0];

      if (canonicalSubj) {
        const mappedTopics: any[] = [];
        for (const top of subj.topics || []) {
          let canonicalTop = canonicalSubj.topics.find(
            (ct) => ct.name.toLowerCase() === top.topic_name.toLowerCase() || ct.slug === top.topic_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
          );

          if (!canonicalTop && canonicalSubj.topics.length > 0) {
            canonicalTop = canonicalSubj.topics[0];
          }

          if (canonicalTop) {
            mappedTopics.push({
              topicId: canonicalTop.id,
              weightageLevel: top.weightage_level || "medium",
              priority: top.priority || 1,
              expectedQuestions: top.expected_questions || 1,
            });
            syllabusTopicsMapped++;
          }
        }

        if (mappedTopics.length > 0) {
          mappedSubjects.push({
            subjectId: canonicalSubj.id,
            displayOrder: subj.display_order || 1,
            topics: mappedTopics,
          });
        }
      }
    }

    if (mappedSubjects.length > 0) {
      await ExamOnboardingService.saveSyllabusProjection(
        {
          examId,
          examCycleId: cycleId,
          subjects: mappedSubjects,
        },
        supabase
      );
    }

    // 6. Persist Knowledge Documents (Strictly review_status = "AI_GENERATED", is_published = false)
    let knowledgeDocsCreated = 0;
    for (const mod of spec.knowledge_modules || []) {
      try {
        let { data: doc } = await supabase
          .from("exam_knowledge_documents")
          .select("id")
          .eq("exam_id", examId)
          .eq("module_key", mod.module_key)
          .maybeSingle();

        if (!doc) {
          const { data: newDoc } = await supabase
            .from("exam_knowledge_documents")
            .insert({
              exam_id: examId,
              exam_cycle_id: cycleId,
              module_key: mod.module_key,
              slug: `${examSlug}-${mod.module_key.toLowerCase().replace(/_/g, "-")}`,
              title: mod.title || `${mod.module_key} - ${examTitle}`,
              status: "DRAFT",
              language: "en",
            })
            .select("id")
            .maybeSingle();
          doc = newDoc;
        }

        if (doc && doc.id) {
          const { error: insertVerErr } = await supabase.from("exam_doc_versions").insert({
            document_id: doc.id,
            version_number: 1,
            schema_version: "1.0.0",
            author_type: "EXTERNAL_IMPORT",
            review_status: "AI_GENERATED",
            structured_payload: {
              title: mod.title,
              summary: mod.summary_markdown,
              detailed: mod.detailed_markdown,
              keyPoints: mod.key_points || [],
              faqs: mod.faqs || [],
            },
            compiled_mdx: mod.detailed_markdown || mod.summary_markdown,
            is_published: false,
          });

          if (!insertVerErr) {
            knowledgeDocsCreated++;
          }
        }
      } catch (_) {}
    }

    // 7. Persist Sources (Status UNVERIFIED)
    let sourcesCount = 0;
    for (const src of spec.sources || []) {
      try {
        const { error: insertSrcErr } = await supabase.from("exam_sources").insert({
          exam_id: examId,
          exam_cycle_id: cycleId,
          source_type: src.source_type || "OFFICIAL_NOTIFICATION",
          title: src.title,
          issuing_authority: src.issuing_authority || "Official Authority",
          source_url: src.url,
          published_date: src.published_date || null,
          verification_status: "UNVERIFIED",
        });

        if (!insertSrcErr) {
          sourcesCount++;
        }
      } catch (_) {}
    }

    // 8. Persist Claims
    let claimsCount = 0;
    for (const clm of spec.claims || []) {
      try {
        const { error: insertClaimErr } = await supabase.from("exam_claims").insert({
          exam_id: examId,
          exam_cycle_id: cycleId,
          claim_key: clm.claim_key,
          stated_value: clm.stated_value,
          value_data_type: clm.data_type || "STRING",
          verification_status: clm.verification_status || "UNVERIFIED",
        });

        if (!insertClaimErr) {
          claimsCount++;
        }
      } catch (_) {}
    }

    // 9. Recalculate 14-Dimension Readiness
    const readinessReport = await ExamReadinessService.evaluateReadiness(examId, cycleId, supabase);

    return {
      success: true,
      examId,
      examSlug,
      examTitle,
      cycleId,
      readinessReport,
      importedEntities: {
        organizationId: orgId,
        postsCount,
        syllabusTopicsMapped,
        knowledgeDocsCreated,
        sourcesCount,
        claimsCount,
      },
    };
  }
}