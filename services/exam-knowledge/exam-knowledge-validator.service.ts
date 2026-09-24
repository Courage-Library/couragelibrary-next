/**
 * COURAGE LIBRARY — EXAM KNOWLEDGE FIVE-GATE VALIDATOR SERVICE
 * Phase 3H.3: Structured External AI Import & Five-Gate Validation Pipeline
 * 
 * Implements strict, independent five-gate validation for imported external-AI
 * Exam Knowledge responses (conforming to ExamKnowledgeDocumentSpec v1.0.0 and CL-EXAM-AUTHOR-v1.0).
 * 
 * THE FIVE GATES:
 * - GATE 1: Schema / Structure (JSON parse, structural types, mandatory fields, size)
 * - GATE 2: Target + Stale Context (Exam slug, cycle, module match, context hash verification)
 * - GATE 3: Security & Content Sanitization (XSS, script tags, event handlers, prompt injection)
 * - GATE 4: Source & Claim Provenance (Valid sources, unverified state, claim citation, conflict detection)
 * - GATE 5: Domain / Academic Integrity (Module applicability, Question Bank validation, canonical taxonomy, posts)
 * 
 * SACRED INVARIANT:
 * External AI output is UNTRUSTED CANDIDATE INPUT.
 * All five gates must pass before content can be ingested as an AI_GENERATED draft.
 */

import { MdxSecurityScanner } from '@/services/mdx-security-scanner';
import {
  ExamKnowledgeDocumentSpec,
  ExamKnowledgeTarget,
  ExamFiveGateValidationResult,
  SingleGateResult,
  ClaimConflict,
  ExamModuleKey,
  ExamKnowledgeSectionType,
  EXAM_KNOWLEDGE_SECTION_TYPES,
} from '@/types/exam-knowledge';
import { ExamModuleRegistry } from './exam-module-registry';

const MAX_PAYLOAD_SIZE = 64000;

export interface ValidationContextOptions {
  expectedTarget: ExamKnowledgeTarget;
  expectedContextHash: string;
  serverCalculatedContextHash?: string;
  verifiedClaims?: Array<{ claim_key: string; stated_value: string; verification_status: string }>;
  verifiedSources?: Array<{ id: string; title: string; source_url: string; verification_status: string }>;
  questionsAllowlist?: string[];
  canonicalSubjects?: Array<{ id: string; name: string; slug: string }>;
  canonicalTopics?: Array<{ id: string; name: string }>;
  canonicalPosts?: Array<{ id: string; post_name: string }>;
}

export class ExamKnowledgeValidatorService {
  /**
   * Runs all 5 validation gates against an parsed ExamKnowledgeDocumentSpec or raw JSON.
   */
  static validate(
    spec: ExamKnowledgeDocumentSpec,
    options: ValidationContextOptions,
    rawPayloadString?: string
  ): ExamFiveGateValidationResult {
    const gate1 = this.validateGate1Schema(spec, rawPayloadString);
    const gate2 = this.validateGate2Target(spec, options);
    const gate3 = this.validateGate3Security(spec);
    const { gateResult: gate4, conflicts } = this.validateGate4Provenance(spec, options);
    const gate5 = this.validateGate5Domain(spec, options);

    const allGates = [gate1, gate2, gate3, gate4, gate5];
    const blockedGates = allGates.filter((g) => g.status === 'FAIL').map((g) => g.name);
    const allErrors = allGates.flatMap((g) => g.errors);
    const allWarnings = allGates.flatMap((g) => g.warnings);

    let overallOutcome: 'PASS' | 'WARNING' | 'BLOCK' = 'PASS';
    if (blockedGates.length > 0) {
      overallOutcome = 'BLOCK';
    } else if (allWarnings.length > 0) {
      overallOutcome = 'WARNING';
    }

    return {
      overallOutcome,
      canImportAsDraft: overallOutcome !== 'BLOCK',
      gates: {
        gate1_schema: gate1,
        gate2_target: gate2,
        gate3_security: gate3,
        gate4_provenance: gate4,
        gate5_domain: gate5,
      },
      conflicts,
      summary: {
        totalErrors: allErrors.length,
        totalWarnings: allWarnings.length,
        blockedGates,
      },
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  /**
   * GATE 1: Schema / Structure Gate
   */
  static validateGate1Schema(spec: any, rawPayloadString?: string): SingleGateResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (rawPayloadString && rawPayloadString.length > MAX_PAYLOAD_SIZE) {
      errors.push(`Payload size (${rawPayloadString.length} chars) exceeds maximum allowed ceiling (${MAX_PAYLOAD_SIZE} chars).`);
    }

    if (!spec || typeof spec !== 'object') {
      errors.push('Parsed payload is not a valid JSON object.');
      return { name: 'GATE_1_SCHEMA', gateNumber: 1, status: 'FAIL', errors, warnings };
    }

    // Schema version
    if (spec.schemaVersion !== '1.0.0') {
      errors.push(`Invalid schemaVersion "${spec.schemaVersion}". Expected exact "1.0.0".`);
    }

    // Mandatory top-level string fields
    if (!spec.documentId || typeof spec.documentId !== 'string') {
      errors.push('Missing or invalid required field: "documentId" (must be non-empty string).');
    }
    if (!spec.examSlug || typeof spec.examSlug !== 'string') {
      errors.push('Missing or invalid required field: "examSlug" (must be non-empty string).');
    }
    if (!spec.moduleKey || typeof spec.moduleKey !== 'string') {
      errors.push('Missing or invalid required field: "moduleKey" (must be non-empty string).');
    }
    if (!spec.language || typeof spec.language !== 'string') {
      errors.push('Missing or invalid required field: "language" (must be non-empty string).');
    }

    // Metadata object
    if (!spec.metadata || typeof spec.metadata !== 'object') {
      errors.push('Missing or invalid "metadata" object.');
    } else {
      if (!spec.metadata.title || typeof spec.metadata.title !== 'string') {
        errors.push('Missing or invalid "metadata.title" string.');
      }
      if (!spec.metadata.description || typeof spec.metadata.description !== 'string') {
        errors.push('Missing or invalid "metadata.description" string.');
      }
      if (!spec.metadata.lastVerifiedDate || typeof spec.metadata.lastVerifiedDate !== 'string') {
        warnings.push('"metadata.lastVerifiedDate" is missing or unformatted.');
      }
      if (!Array.isArray(spec.metadata.authoritativeKeywords)) {
        errors.push('"metadata.authoritativeKeywords" must be an array of strings.');
      }
    }

    // Structured Data object
    if (!spec.structuredData || typeof spec.structuredData !== 'object') {
      errors.push('Missing or invalid "structuredData" object.');
    }

    // Content Sections array
    if (!Array.isArray(spec.contentSections) || spec.contentSections.length === 0) {
      errors.push('"contentSections" must be a non-empty array of section objects.');
    } else {
      spec.contentSections.forEach((sec: any, idx: number) => {
        if (!sec.id || typeof sec.id !== 'string') {
          errors.push(`Section at index ${idx} is missing required "id".`);
        }
        if (!sec.heading || typeof sec.heading !== 'string') {
          errors.push(`Section at index ${idx} is missing required "heading".`);
        }
        if (!EXAM_KNOWLEDGE_SECTION_TYPES.includes(sec.sectionType)) {
          errors.push(`Section "${sec.id || idx}" has invalid sectionType "${sec.sectionType}". Allowed values: ${EXAM_KNOWLEDGE_SECTION_TYPES.join(', ')}.`);
        }
        if (typeof sec.bodyMarkdown !== 'string' || sec.bodyMarkdown.trim().length === 0) {
          errors.push(`Section "${sec.id || idx}" has empty or invalid "bodyMarkdown".`);
        }
      });
    }

    // Official Sources array
    if (!Array.isArray(spec.officialSources)) {
      errors.push('"officialSources" must be an array.');
    }

    // SEO object
    if (!spec.seo || typeof spec.seo !== 'object') {
      errors.push('Missing or invalid "seo" metadata object.');
    } else {
      if (!spec.seo.metaTitle || typeof spec.seo.metaTitle !== 'string') {
        errors.push('Missing required "seo.metaTitle".');
      }
      if (!spec.seo.metaDescription || typeof spec.seo.metaDescription !== 'string') {
        errors.push('Missing required "seo.metaDescription".');
      }
      if (!spec.seo.canonicalUrlSlug || typeof spec.seo.canonicalUrlSlug !== 'string') {
        errors.push('Missing required "seo.canonicalUrlSlug".');
      }
    }

    return {
      name: 'GATE_1_SCHEMA',
      gateNumber: 1,
      status: errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARNING' : 'PASS',
      errors,
      warnings,
    };
  }

  /**
   * GATE 2: Target + Stale Context Gate
   */
  static validateGate2Target(spec: ExamKnowledgeDocumentSpec, options: ValidationContextOptions): SingleGateResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const { expectedTarget, expectedContextHash, serverCalculatedContextHash } = options;

    // 1. Exam Slug Target Verification
    if (spec.examSlug !== expectedTarget.examSlug) {
      errors.push(`TARGET_MISMATCH: Payload examSlug "${spec.examSlug}" does not match target examSlug "${expectedTarget.examSlug}".`);
    }

    // 2. Module Key Target Verification
    if (spec.moduleKey !== expectedTarget.moduleKey) {
      errors.push(`TARGET_MISMATCH: Payload moduleKey "${spec.moduleKey}" does not match target moduleKey "${expectedTarget.moduleKey}".`);
    }

    // 3. Cycle Target Verification
    if (expectedTarget.cycleYear) {
      if (spec.cycleYear !== expectedTarget.cycleYear) {
        errors.push(`TARGET_MISMATCH: Payload cycleYear "${spec.cycleYear}" does not match target cycleYear "${expectedTarget.cycleYear}".`);
      }
    } else if (spec.cycleYear !== undefined && spec.cycleYear !== null) {
      warnings.push(`Payload specified cycleYear "${spec.cycleYear}" for a timeless module.`);
    }

    // 4. Stale Context Hash Verification
    if (serverCalculatedContextHash && expectedContextHash && serverCalculatedContextHash !== expectedContextHash) {
      errors.push(`STALE_CONTEXT: The curriculum context has changed since prompt generation. Expected hash "${expectedContextHash}", server computed "${serverCalculatedContextHash}".`);
    }

    return {
      name: 'GATE_2_TARGET',
      gateNumber: 2,
      status: errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARNING' : 'PASS',
      errors,
      warnings,
    };
  }

  /**
   * GATE 3: Security & Content Sanitization Gate
   */
  static validateGate3Security(spec: ExamKnowledgeDocumentSpec): SingleGateResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Scan all markdown sections using MdxSecurityScanner
    if (Array.isArray(spec.contentSections)) {
      spec.contentSections.forEach((sec) => {
        const scan = MdxSecurityScanner.scan(sec.bodyMarkdown || '');
        if (!scan.isSafe) {
          scan.errors.forEach((err) => {
            errors.push(`Security violation in section "${sec.id}": ${err.message}`);
          });
        }
        scan.warnings.forEach((warn) => warnings.push(warn));

        // Callout notes scanning
        if (Array.isArray(sec.calloutNotes)) {
          sec.calloutNotes.forEach((callout, cIdx) => {
            const cScan = MdxSecurityScanner.scan(callout.body || '');
            if (!cScan.isSafe) {
              cScan.errors.forEach((err) => errors.push(`Security violation in callout note #${cIdx} of section "${sec.id}": ${err.message}`));
            }
          });
        }
      });
    }

    // Scan FAQs
    if (Array.isArray(spec.faqs)) {
      spec.faqs.forEach((faq, fIdx) => {
        const qScan = MdxSecurityScanner.scan(faq.question || '');
        const aScan = MdxSecurityScanner.scan(faq.answer || '');
        if (!qScan.isSafe || !aScan.isSafe) {
          errors.push(`Security violation in FAQ item #${fIdx}.`);
        }
      });
    }

    // Scan Metadata Title & Description
    const metaTitleScan = MdxSecurityScanner.scan(spec.metadata?.title || '');
    const metaDescScan = MdxSecurityScanner.scan(spec.metadata?.description || '');
    if (!metaTitleScan.isSafe || !metaDescScan.isSafe) {
      errors.push('Security violation detected in document metadata.');
    }

    return {
      name: 'GATE_3_SECURITY',
      gateNumber: 3,
      status: errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARNING' : 'PASS',
      errors,
      warnings,
    };
  }

  /**
   * GATE 4: Source & Claim Provenance Gate
   */
  static validateGate4Provenance(
    spec: ExamKnowledgeDocumentSpec,
    options: ValidationContextOptions
  ): { gateResult: SingleGateResult; conflicts: ClaimConflict[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts: ClaimConflict[] = [];

    const moduleDef = ExamModuleRegistry.getModuleDefinition(spec.moduleKey as ExamModuleKey);

    // 1. Validate Sources
    if (Array.isArray(spec.officialSources)) {
      spec.officialSources.forEach((src, idx) => {
        if (!src.title || src.title.trim().length === 0) {
          errors.push(`Official source at index ${idx} is missing required title.`);
        }
        if (!src.url || (!src.url.startsWith('https://') && !src.url.startsWith('http://'))) {
          errors.push(`Official source "${src.title || idx}" has invalid URL scheme: "${src.url}". Must use HTTP/HTTPS (placeholders like "SOURCE_REQUIRED" are prohibited).`);
        }
        if (!src.issuingAuthority || src.issuingAuthority.trim().length === 0) {
          errors.push(`Official source "${src.title || idx}" is missing issuingAuthority.`);
        }
      });
    }

    if (moduleDef.requiresSources && (!spec.officialSources || spec.officialSources.length === 0)) {
      warnings.push(`Module "${moduleDef.displayName}" requires official source citations, but none were provided.`);
    }

    // 2. Validate Claims
    const claims = spec.structuredData?.claims || [];
    claims.forEach((claim, idx) => {
      if (!claim.claimKey || typeof claim.claimKey !== 'string') {
        errors.push(`Claim at index ${idx} is missing valid "claimKey".`);
      }
      if (typeof claim.statedValue !== 'string' || claim.statedValue.trim().length === 0) {
        errors.push(`Claim "${claim.claimKey || idx}" has empty or invalid statedValue.`);
      }
      if (claim.sourceUrl && !claim.sourceUrl.startsWith('https://') && !claim.sourceUrl.startsWith('http://')) {
        errors.push(`Claim "${claim.claimKey || idx}" has invalid sourceUrl: "${claim.sourceUrl}". Must use HTTP/HTTPS or be omitted (placeholders like "SOURCE_REQUIRED" are prohibited).`);
      }

      // Check conflict with existing verified claims
      if (options.verifiedClaims && options.verifiedClaims.length > 0) {
        const matchingVerified = options.verifiedClaims.find(
          (vc) => vc.claim_key === claim.claimKey && vc.verification_status === 'VERIFIED'
        );
        if (matchingVerified && matchingVerified.stated_value !== claim.statedValue) {
          conflicts.push({
            claimKey: claim.claimKey,
            verifiedValue: matchingVerified.stated_value,
            importedValue: claim.statedValue,
            status: 'CONFLICT_REQUIRES_REVIEW',
          });
          warnings.push(
            `Claim conflict on "${claim.claimKey}": Existing verified value "${matchingVerified.stated_value}" vs imported value "${claim.statedValue}". Human review required.`
          );
        }
      }
    });

    return {
      gateResult: {
        name: 'GATE_4_PROVENANCE',
        gateNumber: 4,
        status: errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARNING' : 'PASS',
        errors,
        warnings,
      },
      conflicts,
    };
  }

  /**
   * GATE 5: Domain & Academic Integrity Gate
   */
  static validateGate5Domain(spec: ExamKnowledgeDocumentSpec, options: ValidationContextOptions): SingleGateResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Question Bank Reference Validation
    const rawContentString = JSON.stringify(spec);
    const qRefRegex = /question-([a-f0-9-]{36})/gi;
    let match: RegExpExecArray | null;
    const referencedQuestionIds: string[] = [];

    while ((match = qRefRegex.exec(rawContentString)) !== null) {
      referencedQuestionIds.push(match[0]);
    }

    if (referencedQuestionIds.length > 0 && options.questionsAllowlist) {
      const allowlistSet = new Set(options.questionsAllowlist);
      for (const qId of referencedQuestionIds) {
        if (!allowlistSet.has(qId)) {
          errors.push(`INVALID_QUESTION_REFERENCE: Referenced question ID "${qId}" does not exist in Question Bank allowlist.`);
        }
      }
    }

    // 2. Canonical Curriculum References Validation
    if (options.canonicalSubjects && options.canonicalSubjects.length > 0) {
      const canonicalSubjectNames = new Set(options.canonicalSubjects.map((s) => s.name.toLowerCase()));
      // If syllabus module, ensure subject headings reference canonical subjects
      if (spec.moduleKey === 'SYLLABUS' || spec.moduleKey === 'SYLLABUS_OVERVIEW') {
        const foundAnyCanonical = spec.contentSections.some((sec) =>
          options.canonicalSubjects?.some((cs) => sec.heading.toLowerCase().includes(cs.name.toLowerCase()))
        );
        if (!foundAnyCanonical) {
          warnings.push('Syllabus sections do not appear to match canonical subject titles.');
        }
      }
    }

    // 3. Canonical Post References Validation
    if (options.canonicalPosts && options.canonicalPosts.length > 0 && spec.moduleKey === 'POSTS') {
      const knownPostNames = new Set(options.canonicalPosts.map((p) => p.post_name.toLowerCase()));
      const claims = spec.structuredData?.claims || [];
      claims.forEach((c) => {
        if (c.claimKey.startsWith('POST_') && !knownPostNames.has(c.statedValue.toLowerCase())) {
          warnings.push(`Referenced post "${c.statedValue}" was not found in registered exam posts.`);
        }
      });
    }

    return {
      name: 'GATE_5_DOMAIN',
      gateNumber: 5,
      status: errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARNING' : 'PASS',
      errors,
      warnings,
    };
  }
}
