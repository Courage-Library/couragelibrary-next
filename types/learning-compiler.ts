/**
 * COURAGE LIBRARY — LEARNING COMPILER & CONTENT VERSION TYPES
 * Phase 3C: Controlled Content Compilation & Rendering Pipeline
 * 
 * Defines authoritative domain contracts for:
 * 1. LessonDocumentSpec (Strict JSON authoring contract)
 * 2. Document & Version lifecycle entities
 * 3. Compiler pipeline artifacts, errors, and validation manifests
 * 4. Component props for the 10 approved learning components
 */

export type DocumentType =
  | 'CONCEPT_LESSON'
  | 'WORKED_EXAMPLES'
  | 'FORMULA_SHORTCUT_SHEET'
  | 'COMMON_TRAPS_AND_MISTAKES'
  | 'PYQ_DEEP_DIVE'
  | 'TOPIC_SUMMARY_REVISION';

export type ReviewStatus =
  | 'DRAFT'
  | 'AI_GENERATED'
  | 'STRUCTURALLY_VALID'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'COMPILED'
  | 'PUBLISHED'
  | 'REJECTED';

export type AuthorType = 'HUMAN' | 'AI_ASSISTED' | 'LEGACY_CONVERSION';

export type ContentLanguage = 'en' | 'hi' | 'bn' | 'te' | 'ta';

export type DifficultyTier = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export type SectionType = 'THEORY' | 'VISUAL_EXPLANATION' | 'DERIVATION' | 'APPLICATION';

export type CalloutVariant = 'TIP' | 'WARNING' | 'INFO' | 'MEMORY_HOOK';

export type TrapType =
  | 'CALCULATION_SLIP'
  | 'MISREAD_KEYWORD'
  | 'FORMULA_CONFUSION'
  | 'DISTRACTOR_TRAP';

/**
 * Authoritative Structured Lesson Document Specification
 */
export interface LessonDocumentSpec {
  schemaVersion: '1.0.0';
  documentId: string;
  unitSlug: string;
  language: ContentLanguage;
  metadata: {
    title: string;
    topicId: string;
    subjectId: string;
    targetExamCategories: string[];
    estimatedReadingMinutes: number;
    difficultyTier: DifficultyTier;
    authoritativeKeywords: string[];
  };
  learningObjectives: string[];
  prerequisites: Array<{
    topicId?: string;
    unitId?: string;
    conceptSummary: string;
  }>;
  sections: Array<{
    id: string;
    title: string;
    sectionType: SectionType;
    contentMarkdown: string;
    diagramAssetId?: string;
    calloutNotes?: Array<{
      variant: CalloutVariant;
      title: string;
      body: string;
    }>;
  }>;
  formulaBlocks: Array<{
    id: string;
    name: string;
    latexFormula: string;
    variableDefinitions: Array<{ symbol: string; meaning: string }>;
    applicableConditions: string[];
    speedShortcutTrick?: string;
  }>;
  workedExamples: Array<{
    id: string;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    problemText: string;
    stepByStepSolution: Array<{ stepNumber: number; explanation: string; mathSnippet?: string }>;
    shortcutMethod?: string;
    commonMistakeToAvoid?: string;
  }>;
  cognitiveTraps: Array<{
    trapType: TrapType;
    misconception: string;
    correctApproach: string;
  }>;
  authenticPyqReferences: Array<{
    questionVersionId: string; // Authoritative reference to Question Bank
    relevanceRationale: string;
  }>;
  quickChecks: Array<{
    id: string;
    prompt: string;
    options: Array<{ id: string; text: string; isCorrect: boolean; feedbackExplanation: string }>;
  }>;
  revisionSummary: {
    keyTakeaways: string[];
    coreFormulas: string[];
    speedRules: string[];
  };
  seo: {
    metaTitle: string;
    metaDescription: string;
    focusKeywords: string[];
  };
}

/**
 * Database Entity: Canonical Learning Document
 */
export interface LearningDocument {
  id: string;
  learning_unit_id: string;
  canonical_slug: string;
  document_type: DocumentType;
  current_published_version_id: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  created_at: string;
  updated_at: string;
}

/**
 * Database Entity: Immutable Document Version
 */
export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  schema_version: string;
  compiler_version: string;
  component_contract_version: string;
  source_spec_storage_key: string;
  source_spec_hash: string;
  compiled_artifact_storage_key: string;
  compiled_artifact_hash: string;
  author_type: AuthorType;
  review_status: ReviewStatus;
  approved_by_user_id: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Structured Compilation Error Codes
 */
export type CompilationErrorCode =
  | 'UNSUPPORTED_COMPONENT'
  | 'UNSAFE_HTML'
  | 'UNSAFE_URL'
  | 'IMPORT_NOT_ALLOWED'
  | 'EXPORT_NOT_ALLOWED'
  | 'DYNAMIC_IMPORT_NOT_ALLOWED'
  | 'REQUIRE_NOT_ALLOWED'
  | 'SCRIPT_TAG_NOT_ALLOWED'
  | 'EVENT_HANDLER_NOT_ALLOWED'
  | 'ARBITRARY_JSX_NOT_ALLOWED'
  | 'UNSAFE_EXPRESSION_NOT_ALLOWED'
  | 'PROCESS_ENV_NOT_ALLOWED'
  | 'FILESYSTEM_ACCESS_NOT_ALLOWED'
  | 'INVALID_QUESTION_REFERENCE'
  | 'QUESTION_NOT_FOUND'
  | 'QUESTION_INACTIVE'
  | 'INVALID_ASSET_REFERENCE'
  | 'ASSET_NOT_FOUND'
  | 'ASSET_INACTIVE'
  | 'ASSET_ACCESS_DENIED'
  | 'SCHEMA_INVALID'
  | 'MDX_PARSE_ERROR'
  | 'COMPILATION_ERROR'
  | 'DUPLICATE_IDENTITY'
  | 'IMMUTABLE_VERSION'
  | 'EMPTY_PAYLOAD';

export interface CompilationError {
  code: CompilationErrorCode;
  severity: 'FATAL' | 'ERROR' | 'WARNING';
  path: string;
  component?: string;
  field?: string;
  line?: number;
  column?: number;
  message: string;
}

export type ValidationStage = 'SCHEMA' | 'SECURITY' | 'REFERENTIAL' | 'COMPILATION';

/**
 * Compiled Content Artifact Payload
 */
export interface CompiledContentArtifact {
  compiledMdx: string;
  sourceSpecHash: string;
  compiledArtifactHash: string;
  compilerVersion: string;
  schemaVersion: string;
  componentContractVersion: string;
  componentsUsed: string[];
  questionVersionIds: string[];
  assetIds: string[];
  stats: {
    wordCount: number;
    readingTimeMinutes: number;
    formulaCount: number;
    exampleCount: number;
    trapCount: number;
    questionRefCount: number;
    assetCount: number;
    quickCheckCount: number;
  };
}

export interface CompilationResult {
  success: boolean;
  artifact?: CompiledContentArtifact;
  errors: CompilationError[];
  warnings: string[];
  validationStage: ValidationStage;
}

/**
 * Resolved Canonical Question Representation for Learning Embeds
 */
export interface ResolvedQuestionReference {
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
    examCode: string | null;
    year: number | null;
    shift: string | null;
    tier: string | null;
  };
  relevanceRationale: string;
}

/**
 * Resolved Asset Reference Representation
 */
export interface ResolvedAssetReference {
  assetId: string;
  slug: string;
  title: string;
  altText: string;
  mimeType: string;
  storageUri: string;
  width?: number;
  height?: number;
  aspectRatio?: number;
}

// ---------------------------------------------------------------------------
// Approved Component Props Contracts (The 10 Allowed Components)
// ---------------------------------------------------------------------------

export interface FormulaCardProps {
  id?: string;
  name: string;
  latexFormula: string;
  variableDefinitions?: Array<{ symbol: string; meaning: string }>;
  applicableConditions?: string[];
  speedShortcutTrick?: string;
}

export interface ExampleBoxProps {
  id?: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  problemText: string;
  stepByStepSolution: Array<{ stepNumber: number; explanation: string; mathSnippet?: string }>;
  shortcutMethod?: string;
  commonMistakeToAvoid?: string;
}

export interface WarningBoxProps {
  trapType: TrapType;
  misconception: string;
  correctApproach: string;
}

export interface ExamTipProps {
  variant: 'SPEED' | 'MEMORY' | 'TRAP' | 'HIGH_YIELD';
  title: string;
  content: string;
}

export interface QuestionReferenceProps {
  questionVersionId: string;
  relevanceRationale?: string;
  resolvedQuestion?: ResolvedQuestionReference;
}

export interface ComparisonTableProps {
  caption?: string;
  headers: string[];
  rows: string[][];
}

export interface QuickCheckProps {
  id: string;
  prompt: string;
  options: Array<{ id: string; text: string; isCorrect: boolean; feedbackExplanation: string }>;
}

export interface SummaryCardProps {
  title?: string;
  keyTakeaways: string[];
  coreFormulas?: string[];
  speedRules?: string[];
}

export interface DiagramBlockProps {
  assetId: string;
  caption?: string;
  altText?: string;
  resolvedAsset?: ResolvedAssetReference;
}

export interface CalloutProps {
  variant: CalloutVariant;
  title: string;
  body: string;
}
