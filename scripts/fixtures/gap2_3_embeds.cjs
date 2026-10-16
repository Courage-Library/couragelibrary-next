/**
 * GAP2-3: registry of every PostgREST embed of the taxonomy projection (subjects / topics / subtopics)
 * and its re-point to canonical_taxonomy_nodes. Single source for the codemod and for
 * scripts/test_gap2_3_fk_flips.cjs (pre-flip capture vs post-flip comparison).
 *
 *   select : the ORIGINAL full select (whitespace-insensitive), executed against `table`
 *   old    : the embed fragment in that select (and in `file`, near `line`)
 *   neu    : its replacement
 *   session: 'admin' | 'student' (the real qa identity whose RLS view is captured)
 *   preBroken: the original select already fails before the flip (missing column / relationship);
 *              the test then only asserts no NEW relationship error appears.
 *   allowDiff: embedded keys whose VALUES may differ (node-backed `*` mappings); keys stay identical.
 *   retired: the code site was removed later (GAP2-4b re-pointed syllabus readers to the canonical read model); the
 *            static presence check skips it, the DB embed comparison (historical FK-flip proof) still runs.
 */

// Node columns re-expressed in the shape of each projection table (keys identical to `*`).
const TOPIC_STAR = 'id, subject_id:root_subject_id, name, slug, description:metadata->>description, importance_level:metadata->>importance_level, display_order, is_active, created_at, updated_at';
const SUBJECT_STAR = 'id, name, slug, icon:metadata->>icon, display_order, is_active, created_at, updated_at';
const N = 'canonical_taxonomy_nodes';
// PostgREST resolves self-relationships on canonical_taxonomy_nodes by FK column (an FK-name hint fails, PGRST200).
const ROOT_SUBJ = "root_subject_id";
const fk = (table, col) => `${N}!${table}_${col}_node_fkey`;
const STAR_DIFF = ['importance_level', 'created_at', 'updated_at'];

module.exports = [
  // ---- academic taxonomy (admin) ----
  { id: 'AT-142', file: 'services/academic-taxonomy.service.ts', line: 142, table: 'topic_relationships', session: 'admin',
    select: '*, from_topic:topics!from_topic_id(*)', old: 'from_topic:topics!from_topic_id(*)', neu: `from_topic:${fk('topic_relationships', 'from_topic_id')}(${TOPIC_STAR})`, allowDiff: STAR_DIFF },
  { id: 'AT-153', file: 'services/academic-taxonomy.service.ts', line: 153, table: 'topic_relationships', session: 'admin',
    select: '*, to_topic:topics!to_topic_id(*)', old: 'to_topic:topics!to_topic_id(*)', neu: `to_topic:${fk('topic_relationships', 'to_topic_id')}(${TOPIC_STAR})`, allowDiff: STAR_DIFF },
  { id: 'AT-187', file: 'services/academic-taxonomy.service.ts', line: 187, table: 'topics', session: 'admin',
    select: '*, subject:subjects(*)', old: 'subject:subjects(*)', neu: `subject:${fk('topics', 'subject_id')}(${SUBJECT_STAR})`, allowDiff: STAR_DIFF },
  // ---- quarantined / admin intelligence ----
  { id: 'ADP-1225', file: 'services/admin-adaptive.service.ts', line: 1222, table: 'question_versions', session: 'admin', preBroken: true,
    select: 'id, difficulty, questions(question_text, canonical_topic_id, topics(name))', old: 'topics(name)', neu: `topics:${fk('questions', 'canonical_topic_id')}(name)` },
  { id: 'ACI-896', file: 'services/admin-competition-intelligence.service.ts', line: 896, table: 'mock_questions', session: 'admin', preBroken: true,
    select: 'id, question_id, questions(topic_id, topics(id, name, subject_id, subjects(id, name)))', old: 'topics(id, name, subject_id, subjects(id, name))',
    neu: `topics:${fk('questions', 'canonical_topic_id')}(id, name, subject_id:root_subject_id, subjects:${ROOT_SUBJ}(id, name))` },
  // ---- content studio / AI context (admin) ----
  { id: 'ACS-265', file: 'services/admin-content-studio.service.ts', line: 265, table: 'learning_units', session: 'admin',
    select: '*, topics(id, name, subjects(id, name))', old: 'topics(id, name, subjects(id, name))', neu: `topics:${fk('learning_units', 'topic_id')}(id, name, subjects:${ROOT_SUBJ}(id, name))` },
  { id: 'CCB-84', file: 'services/ai/curriculum-context-builder.service.ts', line: 84, all: true, table: 'topics', session: 'admin',
    select: '*, subject:subjects(*)', old: 'subject:subjects(*)', neu: `subject:${fk('topics', 'subject_id')}(${SUBJECT_STAR})`, allowDiff: STAR_DIFF },
  { id: 'CCB-231', file: 'services/ai/curriculum-context-builder.service.ts', line: 231, table: 'topic_relationships', session: 'admin',
    select: '*, to_topic:topics!topic_relationships_to_topic_id_fkey(*)', old: 'to_topic:topics!topic_relationships_to_topic_id_fkey(*)',
    neu: `to_topic:${fk('topic_relationships', 'to_topic_id')}(${TOPIC_STAR})`, allowDiff: STAR_DIFF },
  // ---- assessment / mock results (service role in code; captured as qa-admin) ----
  { id: 'ASM-1476', file: 'services/assessment.service.ts', line: 1476, table: 'questions', session: 'admin',
    select: 'id, canonical_topic_id, topics(subject_id), question_versions!inner(id, version_number, question_text, is_current, lifecycle_status)',
    old: 'topics(subject_id)', neu: `topics:${fk('questions', 'canonical_topic_id')}(subject_id:root_subject_id)` },
  { id: 'ASM-2277', file: 'services/assessment.service.ts', line: 2277, table: 'mock_questions', session: 'admin', order: 'id',
    select: 'id, question_order, mock_section_id, marks, negative_mark, mock_sections(id, section_name), question_versions(id, question_text, question_image_url, options_type, question_options(id, option_key, option_text, option_image_url, order_index), question_answers(correct_option_key, explanation_md), questions(canonical_topic_id, topics(name, slug)))',
    old: 'topics(name, slug)', neu: `topics:${fk('questions', 'canonical_topic_id')}(name, slug)` },
  { id: 'LTR-353', file: 'services/live-test-result.service.ts', line: 353, table: 'mock_questions', session: 'admin',
    select: 'id, question_order, mock_section_id, marks, negative_mark, mock_sections(section_name), question_versions(id, question_text, question_image_url, options_type, question_options(id, option_key, option_text, option_image_url, order_index), question_answers(correct_option_key, explanation_md), questions(canonical_topic_id, topics(name, slug)))',
    old: 'topics(name, slug)', neu: `topics:${fk('questions', 'canonical_topic_id')}(name, slug)` },
  // ---- battles / community (student) ----
  { id: 'BAT-177', file: 'services/battle.service.ts', line: 177, table: 'quiz_battle_rooms', session: 'student',
    select: 'id, room_code, battle_type, topic_id, created_by_user_id, is_private, access_tier, max_participants, total_rounds, time_per_question_seconds, status, current_round, round_started_at, round_ends_at, winner_user_id, topics(name)',
    old: 'topics(name)', neu: `topics:${fk('quiz_battle_rooms', 'topic_id')}(name)` },
  { id: 'COM-55', file: 'services/community.service.ts', line: 55, table: 'discussion_threads', session: 'student',
    select: 'id, context_type, title, status, is_pinned, accepted_answer_id, has_faculty_answer, message_count, upvote_count, view_count, last_activity_at, created_at, author_id, topic_id, topics(name)',
    old: 'topics(name)', neu: `topics:${fk('discussion_threads', 'topic_id')}(name)` },
  { id: 'COM-100', file: 'services/community.service.ts', line: 100, table: 'discussion_threads', session: 'student', preBroken: true, // ambiguous discussion_messages embed (PGRST201), unrelated
    select: '*, topics(name), discussion_messages(*)', old: 'topics(name)', neu: `topics:${fk('discussion_threads', 'topic_id')}(name)` },
  // ---- learning (student) ----
  { id: 'CS-206', file: 'services/content.service.ts', line: 206, table: 'topic_relationships', session: 'student',
    select: 'relationship_type, strength, to_topic_id, from_topic_id, topics!topic_relationships_to_topic_id_fkey(id, name, slug)',
    old: 'topics!topic_relationships_to_topic_id_fkey(id, name, slug)', neu: `topics:${fk('topic_relationships', 'to_topic_id')}(id, name, slug)` },
  { id: 'LR-64', file: 'services/learning/learning-resolver.service.ts', line: 64, table: 'learning_documents', session: 'student',
    select: 'id, canonical_slug, document_type, access_level, status, current_published_version_id, learning_units!inner(id, topic_id, title, estimated_minutes, is_active, topics(id, name, slug, subject_id, subjects(name))), current_version:document_versions!fk_learning_doc_current_published_version(id, is_published, review_status, published_at, compiled_artifact_storage_key)',
    old: 'topics(id, name, slug, subject_id, subjects(name))', neu: `topics:${fk('learning_units', 'topic_id')}(id, name, slug, subject_id:root_subject_id, subjects:${ROOT_SUBJ}(name))` },
  // ---- dashboards / intelligence ----
  { id: 'DSH-88', file: 'services/dashboard.service.ts', line: 88, table: 'user_topic_mastery', session: 'student', preBroken: true,
    select: 'id, topic_id, mastery_percentage, status, topics(name)', old: 'topics(name)', neu: `topics:${fk('user_topic_mastery', 'canonical_topic_id')}(name)` },
  { id: 'CI-539', file: 'services/candidate-intelligence.service.ts', line: 539, table: 'user_topic_mastery', session: 'student', preBroken: true,
    select: 'id, user_id, topic_id, mastery_score, stability, attempts_count, correct_count, last_attempted_at, topic:topics(id, name, subject:subjects(name))',
    old: 'topic:topics(id, name, subject:subjects(name))', neu: `topic:${fk('user_topic_mastery', 'canonical_topic_id')}(id, name, subject:${ROOT_SUBJ}(name))` },
  // ---- descriptive / flashcards (student) ----
  { id: 'DES-113', file: 'services/descriptive.service.ts', line: 113, table: 'descriptive_questions', session: 'student',
    select: 'id, slug, title, question_text, max_marks, word_limit_min, word_limit_max, time_limit_minutes, difficulty, exams(title), topics(name), subjects(name)',
    old: 'topics(name), subjects(name)', neu: `topics:${fk('descriptive_questions', 'topic_id')}(name), subjects:${fk('descriptive_questions', 'subject_id')}(name)` },
  { id: 'DES-157', file: 'services/descriptive.service.ts', line: 157, table: 'descriptive_questions', session: 'student',
    select: '*, exams(title), topics(name), subjects(name)',
    old: 'topics(name), subjects(name)', neu: `topics:${fk('descriptive_questions', 'topic_id')}(name), subjects:${fk('descriptive_questions', 'subject_id')}(name)` },
  { id: 'FC-87', file: 'services/flashcard.service.ts', line: 87, table: 'flashcard_decks', session: 'student',
    select: 'id, slug, title_en, description, access_tier, card_count, is_curated, topics(name), subjects(name), exams(title)',
    old: 'topics(name), subjects(name)', neu: `topics:${fk('flashcard_decks', 'topic_id')}(name), subjects:${fk('flashcard_decks', 'subject_id')}(name)` },
  { id: 'FC-132', file: 'services/flashcard.service.ts', line: 132, table: 'flashcard_decks', session: 'student',
    select: 'id, slug, title_en, description, access_tier, card_count, is_curated, topics(name, slug), subjects(name), exams(title)',
    old: 'topics(name, slug), subjects(name)', neu: `topics:${fk('flashcard_decks', 'topic_id')}(name, slug), subjects:${fk('flashcard_decks', 'subject_id')}(name)` },
  // ---- exam knowledge / syllabus (admin) ----
  { id: 'EKC-161', file: 'services/exam-knowledge/exam-knowledge-candidate.service.ts', line: 161, table: 'exam_topics', session: 'admin', retired: 'GAP2-4b',
    select: '*, topic:topics(*)', old: 'topic:topics(*)', neu: `topic:${fk('exam_topics', 'topic_id')}(${TOPIC_STAR})`, allowDiff: STAR_DIFF },
  { id: 'EKX-184', file: 'services/exam-knowledge/exam-knowledge-context-builder.service.ts', line: 184, table: 'topics', session: 'admin',
    select: '*, subject:subjects(name)', old: 'subject:subjects(name)', neu: `subject:${fk('topics', 'subject_id')}(name)` },
  { id: 'EKX-221', file: 'services/exam-knowledge/exam-knowledge-context-builder.service.ts', line: 221, table: 'questions', session: 'admin', preBroken: true, retired: 'GAP2-4b',
    select: 'id, topic_id, year, tier, topic:topics(name)', old: 'topic:topics(name)', neu: `topic:${fk('questions', 'canonical_topic_id')}(name)` },
  { id: 'ES-45', file: 'services/exam-syllabus.service.ts', line: 45, all: true, table: 'exam_topics', session: 'admin', retired: 'GAP2-4b',
    select: '*, topic:topics(*)', old: 'topic:topics(*)', neu: `topic:${fk('exam_topics', 'topic_id')}(${TOPIC_STAR})`, allowDiff: STAR_DIFF },
  // ---- mistake vault (student) ----
  { id: 'MLI-641', file: 'services/mistake-longitudinal-intelligence.service.ts', line: 641, table: 'user_mistake_vault', session: 'student',
    select: 'id, question_id, topic_id, subject_id, total_mistakes_count, consecutive_correct_in_remediation, lifecycle_status, primary_cognitive_type_id, first_mistake_at, last_mistake_at, mastered_at, topics(id, name, subject_id, subjects(id, name))',
    old: 'topics(id, name, subject_id, subjects(id, name))', neu: `topics:${fk('user_mistake_vault', 'topic_id')}(id, name, subject_id:root_subject_id, subjects:${ROOT_SUBJ}(id, name))` },
  { id: 'MS-814', file: 'services/mistake.service.ts', line: 814, table: 'questions', session: 'admin',
    select: 'id, canonical_topic_id, topics(subject_id)', old: 'topics(subject_id)', neu: `topics:${fk('questions', 'canonical_topic_id')}(subject_id:root_subject_id)` },
  { id: 'MS-913', file: 'services/mistake.service.ts', line: 913, table: 'user_mistake_vault', session: 'student',
    select: 'id, question_id, topic_id, total_mistakes_count, consecutive_correct_in_remediation, lifecycle_status, primary_cognitive_type_id, user_override_cognitive_type_id, topics(name), mistake_cognitive_types!primary_cognitive_type_id(id, name, description)',
    old: 'topics(name)', neu: `topics:${fk('user_mistake_vault', 'topic_id')}(name)` },
  { id: 'MS-1021', file: 'services/mistake.service.ts', line: 1021, table: 'user_mistake_vault', session: 'student',
    select: 'id, question_id, total_mistakes_count, consecutive_correct_in_remediation, lifecycle_status, primary_cognitive_type_id, user_override_cognitive_type_id, user_custom_notes, last_mistake_at, mastered_at, topic_id, subject_id, topics(id, name), subjects(id, name), mistake_cognitive_types!primary_cognitive_type_id(name), questions(question_versions(question_text))',
    old: 'topics(id, name), subjects(id, name)', neu: `topics:${fk('user_mistake_vault', 'topic_id')}(id, name), subjects:${fk('user_mistake_vault', 'subject_id')}(id, name)` },
  { id: 'MS-1189', file: 'services/mistake.service.ts', line: 1189, table: 'user_mistake_vault', session: 'student',
    select: '*, topics(name, slug), subjects(name), mistake_cognitive_types!primary_cognitive_type_id(name, description, remediation_guidance)',
    old: 'topics(name, slug), subjects(name)', neu: `topics:${fk('user_mistake_vault', 'topic_id')}(name, slug), subjects:${fk('user_mistake_vault', 'subject_id')}(name)` },
  { id: 'MS-1967', file: 'services/mistake.service.ts', line: 1960, table: 'user_mistake_vault', session: 'student',
    select: 'id, question_id, topic_id, subject_id, total_mistakes_count, consecutive_correct_in_remediation, lifecycle_status, primary_cognitive_type_id, user_override_cognitive_type_id, user_custom_notes, last_mistake_at, mastered_at, topics(id, name, slug), subjects(id, name), mistake_cognitive_types!primary_cognitive_type_id(name), questions(question_versions(question_text))',
    old: 'topics(id, name, slug), subjects(id, name)', neu: `topics:${fk('user_mistake_vault', 'topic_id')}(id, name, slug), subjects:${fk('user_mistake_vault', 'subject_id')}(id, name)` },
  // ---- premium (service role in code) ----
  { id: 'PG-630', file: 'services/premium-generator.service.ts', line: 630, table: 'exam_question_mappings', session: 'admin', order: 'question_id',
    select: 'question_id, questions!inner(id, canonical_topic_id, status, topics(id, subject_id))', old: 'topics(id, subject_id)', neu: `topics:${fk('questions', 'canonical_topic_id')}(id, subject_id:root_subject_id)` },
  { id: 'PG-679', file: 'services/premium-generator.service.ts', line: 679, table: 'question_versions', session: 'admin',
    select: 'id, question_id, version_number, question_text, difficulty, language, is_current, questions!inner(id, canonical_topic_id, topics(subject_id)), question_options(id, option_key, option_text, order_index), question_answers(correct_option_key, explanation_md)',
    old: 'topics(subject_id)', neu: `topics:${fk('questions', 'canonical_topic_id')}(subject_id:root_subject_id)` },
  { id: 'PG-783', file: 'services/premium-generator.service.ts', line: 783, table: 'user_topic_mastery', session: 'student', order: 'canonical_topic_id',
    select: 'canonical_topic_id, mastery_score, topics!inner(id, subject_id)', old: 'topics!inner(id, subject_id)', neu: `topics:${fk('user_topic_mastery', 'canonical_topic_id')}!inner(id, subject_id:root_subject_id)` },
  // ---- question factory (admin) ----
  { id: 'QF-207', file: 'services/question-factory/admin-question-factory.service.ts', line: 207, table: 'question_versions', session: 'admin',
    select: 'id, question_id, version_number, question_text, difficulty, language, lifecycle_status, created_at, questions!inner(canonical_topic_id, topics(name)), question_version_authoring!inner(origin, import_batch_id)',
    old: 'topics(name)', neu: `topics:${fk('questions', 'canonical_topic_id')}(name)` },
  { id: 'QF-278', file: 'services/question-factory/admin-question-factory.service.ts', line: 278, table: 'question_versions', session: 'admin',
    select: '*, questions!inner(canonical_topic_id, topics(name)), question_options(option_key, option_text, order_index), question_answers(correct_option_key, explanation_md), question_version_authoring(*)',
    old: 'topics(name)', neu: `topics:${fk('questions', 'canonical_topic_id')}(name)` },
  { id: 'QTR-94', file: 'services/question-factory/question-taxonomy-resolver.ts', line: 94, table: 'topics', session: 'admin',
    select: 'id, name, slug, description, is_active, subject_id, subjects(id, name, is_active)', old: 'subjects(id, name, is_active)', neu: `subjects:${fk('topics', 'subject_id')}(id, name, is_active)` },
];

// premium-hub: subjects → child topics is a projection-to-projection relationship (topics.subject_id), which the
// flip removes; the query moves to SUBJECT nodes with child TOPIC nodes via parent_id (code change, not a fragment swap).
module.exports.SPECIAL = [
  { id: 'PH-476', file: 'services/premium-hub.service.ts', session: 'admin',
    before: { table: 'subjects', select: 'id, name, slug, topics(id, name)', filters: 'is_active=eq.true&order=display_order.asc' },
    after: { table: "canonical_taxonomy_nodes", select: `id, name, slug, topics:${N}!parent_id(id, name)`, filters: 'node_type=eq.SUBJECT&is_active=eq.true&order=display_order.asc' } },
];
// Pre-existing broken and NOT taxonomy-flip related (root table has no taxonomy column). GAP2-4b removed both
// sites (EKC-155 re-pointed to the syllabus read model; ES-33's dead service deleted), so the list is empty.
module.exports.UNTOUCHED = [];
module.exports.TOPIC_STAR = TOPIC_STAR;
module.exports.SUBJECT_STAR = SUBJECT_STAR;
