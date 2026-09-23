/**
 * COURAGE LIBRARY — EXAM ONBOARDING VALIDATOR SERVICE
 * Phase 3K: Multi-Gate Untrusted AI Ingestion Validator & Conflict Detector
 */

import {
  ExamOnboardingSpec,
  ExamOnboardingValidationResult,
  OnboardingValidationIssue,
  OnboardingConflictItem,
} from '@/types/exam-onboarding';
import { createAdminServerSupabaseClient } from '@/lib/supabase/server';
import { ExamKnowledgeImporterService } from '@/services/exam-knowledge/exam-knowledge-importer.service';

export class ExamOnboardingValidatorService {
  /**
   * Validates raw external AI payload through all 6 security and integrity gates.
   */
  static async validatePayload(
    rawInput: string,
    options?: {
      targetExamName?: string;
      targetCycleYear?: number;
      expectedContextHash?: string;
      customSupabase?: any;
    }
  ): Promise<ExamOnboardingValidationResult> {
    const issues: OnboardingValidationIssue[] = [];
    const conflicts: OnboardingConflictItem[] = [];
    const supabase = options?.customSupabase || createAdminServerSupabaseClient();

    // -------------------------------------------------------------
    // GATE 1: SYNTAX & JSON EXTRACTION
    // -------------------------------------------------------------
    const cleanedJson = ExamKnowledgeImporterService.extractJsonFromRaw(rawInput);
    if (!cleanedJson) {
      issues.push({
        gate: "SYNTAX",
        severity: "BLOCKING",
        message: "Payload is empty or could not be parsed as JSON.",
      });
      return {
        isValid: false,
        canImportAsDraft: false,
        issues,
        blockingIssuesCount: 1,
        warningsCount: 0,
        conflicts: [],
      };
    }

    let parsedSpec: ExamOnboardingSpec;
    try {
      parsedSpec = JSON.parse(cleanedJson);
    } catch (e: any) {
      issues.push({
        gate: "SYNTAX",
        severity: "BLOCKING",
        message: `Malformed JSON structure: ${e.message}`,
      });
      return {
        isValid: false,
        canImportAsDraft: false,
        issues,
        blockingIssuesCount: 1,
        warningsCount: 0,
        conflicts: [],
      };
    }

    if (!parsedSpec.exam || !parsedSpec.exam.title) {
      issues.push({
        gate: "SYNTAX",
        severity: "BLOCKING",
        field: "exam.title",
        message: "Exam title is required in the parsed payload.",
      });
    }

    // -------------------------------------------------------------
    // GATE 2: TARGET & FRESHNESS VALIDATION
    // -------------------------------------------------------------
    if (options?.targetExamName) {
      const targetNorm = options.targetExamName.toLowerCase().replace(/[^a-z0-9]/g, "");
      const parsedNorm = (parsedSpec.target_exam_name || parsedSpec.exam?.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (parsedNorm && !parsedNorm.includes(targetNorm) && !targetNorm.includes(parsedNorm)) {
        issues.push({
          gate: "TARGET",
          severity: "BLOCKING",
          field: "target_exam_name",
          message: `Target exam mismatch. Expected "${options.targetExamName}", received "${parsedSpec.target_exam_name || parsedSpec.exam?.title}".`,
        });
      }
    }

    if (options?.targetCycleYear && parsedSpec.cycle?.cycle_year) {
      if (parsedSpec.cycle.cycle_year !== options.targetCycleYear) {
        issues.push({
          gate: "TARGET",
          severity: "WARNING",
          field: "cycle.cycle_year",
          message: `Cycle year mismatch. Target cycle was ${options.targetCycleYear}, payload specifies ${parsedSpec.cycle.cycle_year}.`,
        });
      }
    }

    if (options?.expectedContextHash && parsedSpec.context_hash) {
      if (options.expectedContextHash !== parsedSpec.context_hash) {
        issues.push({
          gate: "TARGET",
          severity: "WARNING",
          field: "context_hash",
          message: "Context hash mismatch. The prompt context may have been updated since this output was generated.",
        });
      }
    }

    // -------------------------------------------------------------
    // GATE 3: SECURITY & SANITIZATION VALIDATION
    // -------------------------------------------------------------
    const checkSecurity = (val: any, path: string) => {
      if (typeof val === "string") {
        if (/<script|javascript:|onerror=|onload=/i.test(val)) {
          issues.push({
            gate: "SECURITY",
            severity: "BLOCKING",
            field: path,
            message: `Potentially dangerous script or HTML injection detected in ${path}.`,
          });
        }
      } else if (Array.isArray(val)) {
        val.forEach((item, idx) => checkSecurity(item, `${path}[${idx}]`));
      } else if (val && typeof val === "object") {
        delete val.is_active;
        delete val.is_published;
        delete val.isAdmin;
        delete val.role;
        Object.keys(val).forEach((k) => checkSecurity(val[k], `${path}.${k}`));
      }
    };
    checkSecurity(parsedSpec, "root");

    // -------------------------------------------------------------
    // GATE 4: SOURCE & PROVENANCE VALIDATION
    // -------------------------------------------------------------
    const sources = parsedSpec.sources || [];
    if (sources.length === 0) {
      issues.push({
        gate: "PROVENANCE",
        severity: "WARNING",
        field: "sources",
        message: "No official or secondary sources were included in the research payload.",
      });
    } else {
      sources.forEach((s, idx) => {
        if (!s.url || !/^https?:\/\//i.test(s.url)) {
          issues.push({
            gate: "PROVENANCE",
            severity: "WARNING",
            field: `sources[${idx}].url`,
            message: `Source "${s.title || "Untitled"}" is missing a valid HTTP/HTTPS URL.`,
          });
        }
      });
    }

    // -------------------------------------------------------------
    // GATE 5 & 6: CANONICAL MATCHING & CONFLICT DETECTION
    // -------------------------------------------------------------
    if (parsedSpec.exam && parsedSpec.exam.title) {
      try {
        const examTitle = parsedSpec.exam.title.trim();
        const examSlug = (parsedSpec.exam.slug || examTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")).trim();

        const { data: existingExam } = await supabase
          .from("exams")
          .select("id, title, slug, org_id, description, category")
          .or(`slug.eq.${examSlug},title.ilike.${examTitle}`)
          .maybeSingle();

        if (existingExam) {
          if (existingExam.category && parsedSpec.exam.category && existingExam.category !== parsedSpec.exam.category) {
            conflicts.push({
              field: "category",
              label: "Examination Domain",
              existingValue: existingExam.category,
              importedValue: parsedSpec.exam.category,
              status: "CONFLICT",
            });
          }

          if (parsedSpec.cycle?.cycle_year) {
            const { data: existingCycle } = await supabase
              .from("exam_cycles")
              .select("id, cycle_year, notification_date, application_start_date, application_end_date")
              .eq("exam_id", existingExam.id)
              .eq("cycle_year", parsedSpec.cycle.cycle_year)
              .maybeSingle();

            if (existingCycle && parsedSpec.cycle.notification_date) {
              if (existingCycle.notification_date && existingCycle.notification_date !== parsedSpec.cycle.notification_date) {
                conflicts.push({
                  field: "notification_date",
                  label: "Notification Date",
                  existingValue: existingCycle.notification_date,
                  importedValue: parsedSpec.cycle.notification_date,
                  cycleYear: existingCycle.cycle_year,
                  status: "CONFLICT",
                });
              }
            }
          }
        }
      } catch (_) {}
    }

    const blockingIssuesCount = issues.filter((i) => i.severity === "BLOCKING").length;
    const warningsCount = issues.filter((i) => i.severity === "WARNING").length;

    return {
      isValid: blockingIssuesCount === 0,
      canImportAsDraft: blockingIssuesCount === 0,
      spec: parsedSpec,
      issues,
      blockingIssuesCount,
      warningsCount,
      conflicts,
    };
  }
}