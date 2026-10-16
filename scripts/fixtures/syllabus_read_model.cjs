/**
 * GAP2-4b: builds fn_exam_syllabus_read_model payloads (the exact shape of types/syllabus.ts SyllabusReadModel) for
 * offline suites that run the candidate service in prefetched mode. Counts are summed the way the RPC sums them.
 *
 *   availableSyllabus('exam-1', [{ title, tier, units: [{ title, tier, min, max, topics: [{ id, name, slug, q, d }] }] }])
 *   noSyllabus('exam-1')
 */
function counts(topics) {
  return {
    topics: topics.length,
    published_questions: topics.reduce((a, t) => a + t.published_questions, 0),
    servable_documents: topics.reduce((a, t) => a + t.servable_documents, 0),
    topics_with_questions: topics.filter((t) => t.published_questions > 0).length,
    topics_with_documents: topics.filter((t) => t.servable_documents > 0).length,
  };
}

function availableSyllabus(examId, sections) {
  const nodes = [];
  const all = [];
  sections.forEach((s, i) => {
    const secId = `sec-${i + 1}`;
    const sec = {
      id: secId, parent_id: null, kind: 'SECTION', title: s.title, slug: s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: null, order: i + 1, depth: 1, weightage_tier: s.tier ?? null, expected_questions_min: s.min ?? null,
      expected_questions_max: s.max ?? null, is_mandatory: true, topics: [], counts: null,
    };
    nodes.push(sec);
    const secTopics = [];
    (s.units || []).forEach((u, j) => {
      const topics = (u.topics || []).map((t) => ({ topic_id: t.id, name: t.name, slug: t.slug, subject_id: t.subjectId ?? null, weight: t.weight ?? null, published_questions: t.q ?? 0, servable_documents: t.d ?? 0 }));
      nodes.push({
        id: `${secId}-unit-${j + 1}`, parent_id: secId, kind: 'UNIT', title: u.title, slug: u.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: null, order: j + 1, depth: 2, weightage_tier: u.tier ?? null, expected_questions_min: u.min ?? null,
        expected_questions_max: u.max ?? null, is_mandatory: u.mandatory ?? true, topics, counts: counts(topics),
      });
      secTopics.push(...topics);
    });
    sec.counts = counts(secTopics);
    all.push(...secTopics);
  });
  const c = counts(all);
  return {
    state: 'AVAILABLE',
    exam_id: examId,
    version: { id: 'syllabus-version-1', version_number: 1, version_tag: 'test-1', exam_cycle_id: null, published_at: '2026-10-01T00:00:00Z' },
    nodes,
    totals: { nodes: nodes.length, topics: c.topics, published_questions: c.published_questions, servable_documents: c.servable_documents },
  };
}

const noSyllabus = (examId) => ({ state: 'NO_SYLLABUS', exam_id: examId, version: null, nodes: [], totals: null });

module.exports = { availableSyllabus, noSyllabus };
