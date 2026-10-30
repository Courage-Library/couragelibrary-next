/**
 * GATE-SCOPE-SWEEP (architect 2026-10-29) — self-owned QA course fixtures for the live gates. Every helper runs INSIDE the
 * caller's open, rolled-back live transaction (safeBegin / withLiveTransaction); nothing here commits. The owner publishes
 * real lessons, questions and syllabi in the same database, so a gate never picks "a real published topic / lesson /
 * course": it builds its own and asserts on exactly that.
 *   qaTopic(q, qaTopicId, slug, name)          → a TOPIC under the QA lesson topic's SUBJECT (metadata.source = QA_FIXTURE)
 *   publishNodeLesson(svc, node, example, by)  → a node lesson document with a PUBLISHED English version
 *   publishQaSyllabus(q, examId, topicIds, tag, { tier, draft })
 *                                              → a PUBLISHED (or, with draft: true, a DRAFT) syllabus version of the QA exam
 *                                                 mapping exactly those topics (one SECTION → one UNIT per topic, MANUALLY_MAPPED)
 *   publishQaQuestion(q, topicId, actorId, tag) → a QA question PUBLISHED through the official path (import draft →
 *                                                 IN_REVIEW → APPROVED with the review checklist → fn_publish_question_version)
 *   qaExamLogo(q, examId)                       → EXAM-LOGO-1 (126): the QA exam gets a logo OVERRIDE (a launch needs a
 *                                                 logo) — never the real conducting body's logo
 * `q(sql, params)` returns rows (postgres connection); `svc(sql, params)` returns { ok, rows | msg } as service_role.
 */
async function qaTopic(q, qaTopicId, slug, name) {
  const [t] = await q(`insert into public.canonical_taxonomy_nodes (parent_id, node_type, name, slug, metadata)
      select root_subject_id, 'TOPIC', $2, $3, '{"source":"QA_FIXTURE"}'::jsonb from public.canonical_taxonomy_nodes where id = $1
      returning id`, [qaTopicId, name, slug]);
  if (!t) throw new Error('QA fixture: the QA lesson topic is missing');
  return t.id;
}

async function publishNodeLesson(svc, node, example, by) {
  const d = await svc(`select public.fn_lesson_create_node_document($1, 'FREE', null, $2) r`, [node, by]);
  if (!d.ok) throw new Error(`QA fixture node document: ${d.msg}`);
  const s = await svc(`select public.fn_lesson_save_draft($1, 'en', $2::jsonb, $3::jsonb, 'AI_ASSISTED', null, $4) r`,
    [d.rows[0].r.document_id, JSON.stringify(example.meta), JSON.stringify(example.blocks), by]);
  if (!s.ok) throw new Error(`QA fixture draft: ${s.msg}`);
  const p = await svc(`select public.fn_lesson_publish($1, null, $2)`, [s.rows[0].r.version_id, by]);
  if (!p.ok) throw new Error(`QA fixture publish: ${p.msg}`);
  return d.rows[0].r.document_id;
}

async function publishQaSyllabus(q, examId, topicIds, tag = 'qa-fixture', { tier = null, draft = false } = {}) {
  const [v] = await q(`insert into public.exam_syllabus_versions (exam_id, version_tag, version_number, status, tier)
      values ($1, $2, (select coalesce(max(version_number), 0) + 1 from public.exam_syllabus_versions where exam_id = $1), 'DRAFT', $3) returning id`, [examId, tag, tier]);
  const [sec] = await q(`select public.fn_syllabus__insert_node($1, null, 'SECTION', 'QA fixture section', null, 1, null, null, null, null, true) id`, [v.id]);
  let order = 1;
  for (const topic of topicIds) {
    const [unit] = await q(`select public.fn_syllabus__insert_node($1, $2, 'UNIT', $3, null, $4, null, null, null, null, true) id`, [v.id, sec.id, `QA fixture unit ${order}`, order]);
    await q(`insert into public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method)
        values ($1, $2, 'MANUALLY_MAPPED', 1.00, 'MANUAL')`, [unit.id, topic]);
    order++;
  }
  if (!draft) await q(`update public.exam_syllabus_versions set status = 'PUBLISHED', is_active = true, published_at = now() where id = $1`, [v.id]);
  return v.id;
}

const REVIEW_CHECKLIST = JSON.stringify({ correct_key_verified: true, explanation_correct: true, no_ambiguity: true, topic_correct: true, difficulty_sensible: true, provenance_verified: true });
async function publishQaQuestion(q, topicId, actorId, tag) {
  const [{ r }] = await q(`select public.fn_import_question_drafts($1::jsonb, $2::uuid) r`, [JSON.stringify({
    origin: 'AI_EXTERNAL', contract_version: 'CL-QUESTION-AUTHOR-v1.0', context_hash: 'f'.repeat(64), target_topic_id: topicId,
    items: [{ client_ref: 'qa1', stem: `${tag} QA fixture question stem for the live gate`, difficulty: 'medium', language: 'en',
      options: [{ key: 'A', text: 'alpha' }, { key: 'B', text: 'beta' }, { key: 'C', text: 'gamma' }, { key: 'D', text: 'delta' }],
      correct_key: 'B', explanation_md: 'Option B is correct by the fixture rule; option A is the trap.', source_type: 'ORIGINAL',
      authoring_metadata: { clientRef: 'qa1', sourceType: 'ORIGINAL', distractorRationale: { A: 'trap' } } }],
  }), actorId]);
  const v = r.items[0].version_id;
  await q(`select public.fn_transition_question_version($1, 'IN_REVIEW', $2, null, null)`, [v, actorId]);
  await q(`select public.fn_transition_question_version($1, 'APPROVED', $2, null, $3::jsonb)`, [v, actorId, REVIEW_CHECKLIST]);
  await q(`select public.fn_publish_question_version($1, $2)`, [v, actorId]);
  return r.items[0].question_id;
}

async function qaExamLogo(q, examId) {
  await q(`update public.exams set logo_override_sha256 = repeat('a', 64), logo_override_alt = 'QA fixture exam logo' where id = $1`, [examId]);
}

module.exports = { qaTopic, publishNodeLesson, publishQaSyllabus, publishQaQuestion, qaExamLogo };
