/**
 * COURAGE LIBRARY — QUESTION REFERENCE RESOLVER
 * Phase 3C: Controlled Content Compilation & Rendering Pipeline
 * GAP2-2b (Q5): validates against the real Question Bank and fails closed.
 *
 * Resolves authoritative Question Bank references for QuestionReference components.
 *
 * INVARIANTS:
 * 1. question_version_id is the authoritative primary reference.
 * 2. Only the CURRENT PUBLISHED version of a published question is accepted
 *    (question_versions.is_current AND lifecycle_status = 'PUBLISHED' AND questions.status = 'published').
 * 3. AI / content authors CANNOT override or fabricate canonical metadata.
 * 4. No catalog client, an unknown id, an unpublished/non-current version or a failed lookup is a
 *    compile ERROR naming the reference. There is no placeholder result.
 */

import { ResolvedQuestionReference, CompilationError } from '@/types/learning-compiler';

export interface QuestionBankClient {
  /** Returns null when the version does not exist; `status` is 'PUBLISHED' only when servable. */
  fetchQuestionVersion(questionVersionId: string): Promise<{
    id: string;
    question_id: string;
    version_number: number;
    question_text: string;
    question_type: string;
    status: string;
  } | null>;
}

const fail = (code: CompilationError['code'], path: string, message: string) => ({
  resolved: null,
  error: { code, severity: 'ERROR' as const, path, message },
});

export class QuestionReferenceService {
  /**
   * Resolves canonical question metadata for a given question_version_id.
   */
  static async resolve(
    questionVersionId: string,
    relevanceRationale: string,
    client?: QuestionBankClient
  ): Promise<{ resolved: ResolvedQuestionReference | null; error: CompilationError | null }> {
    if (!questionVersionId || typeof questionVersionId !== 'string') {
      return fail('INVALID_QUESTION_REFERENCE', 'questionVersionId', 'questionVersionId must be a non-empty string.');
    }
    if (!client) {
      return fail(
        'REFERENCE_CATALOG_UNAVAILABLE',
        questionVersionId,
        `Question reference "${questionVersionId}" could not be verified: the Question Bank catalog is unavailable.`
      );
    }

    let raw: Awaited<ReturnType<QuestionBankClient['fetchQuestionVersion']>>;
    try {
      raw = await client.fetchQuestionVersion(questionVersionId);
    } catch {
      return fail('INVALID_QUESTION_REFERENCE', questionVersionId, `Question reference "${questionVersionId}" could not be verified (Question Bank lookup failed).`);
    }
    if (!raw) {
      return fail('QUESTION_NOT_FOUND', questionVersionId, `Question version "${questionVersionId}" was not found in the Question Bank.`);
    }
    if (raw.status !== 'PUBLISHED') {
      return fail(
        'QUESTION_INACTIVE',
        questionVersionId,
        `Question version "${questionVersionId}" is not the current published version (${raw.status}) and cannot be embedded.`
      );
    }

    // Answer keys and options are never resolved here: the renderer loads them with its own access rules.
    return {
      resolved: {
        questionVersionId: raw.id,
        questionId: raw.question_id,
        versionNumber: raw.version_number,
        questionText: raw.question_text,
        questionType: raw.question_type,
        options: [],
        correctOptionId: '',
        explanation: null,
        examMetadata: { examTitle: null, examCode: null, year: null, shift: null, tier: null },
        relevanceRationale,
      },
      error: null,
    };
  }
}
