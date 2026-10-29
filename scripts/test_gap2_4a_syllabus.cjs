/**
 * GAP2-4a — canonical syllabus schema, role-checked RPCs, published read model, seeded DRAFTs.
 *
 * DB suite, couragelibrary-next only (ref guard + verified TLS via scripts/db/_db-env.cjs). Every scenario runs
 * inside BEGIN … ROLLBACK; nothing is persisted. JWT subjects for staff / admin are the permanent QA identities
 * (looked up by e-mail, ids never printed) so created_by / published_by / audit actor foreign keys hold.
 *
 *   G-01 catalog: columns, CHECKs, partial unique index, TOPIC-only composite FK, triggers; every RPC SECURITY
 *        DEFINER with search_path ''; EXECUTE grants (write RPCs: authenticated only; core + seed: owner only;
 *        read model: anon + authenticated)
 *   G-02 role matrix on every RPC: anon cannot execute; student → 42501; staff edits DRAFTs but cannot publish /
 *        archive; admin can publish and archive
 *   G-03 audit: every successful write RPC writes exactly one audit row (actor = JWT subject) in the same
 *        transaction; denied calls write none
 *   G-04 same-version parent; node cannot change version; cycle prevention
 *   G-05 mappings: TOPIC only (RPC and composite FK), UNIT only, distinct, active; weights (0,1] summing to 1
 *   G-06 fn_syllabus_validate issue list (every error code + warnings) on a deliberately broken draft
 *   G-07 publish: VALIDATION_FAILED leaves no change and no audit; success archives the previous PUBLISHED of the
 *        same exam + cycle; ≤ 1 PUBLISHED per exam + cycle (unique index); a failure mid-publish rolls back
 *        everything (previous stays PUBLISHED)
 *   G-08 immutability (owner / service-role path): PUBLISHED / ARCHIVED versions, nodes and mappings reject
 *        every write except PUBLISHED → ARCHIVED; versions are inserted as DRAFT only
 *   G-09 create_draft from a PUBLISHED version deep-copies the tree and mappings (supersedes set)
 *   G-10 read model: SSC CGL agrees with the DB (PUBLISHED ⇔ AVAILABLE; QB-KEY-1 round 2 amendment, was pinned to
 *        NO_SYLLABUS); NO_SYLLABUS for a DRAFT-only exam (anon); AVAILABLE on a published TEST version with
 *        counts equal to independent queries (published questions per topic; servable documents per topic with
 *        the LearningResolverService rule); subtree counts; no fabricated values
 *   G-11 (GAP2-4A-SCOPE amendment of GATE-HYGIENE-1): the draft-shape contract on the suite's own QA fixture (exact
 *        tree vs its spec, valid, deterministic); the seeds re-run as a no-op whatever the seeded version's status; the
 *        GD legacy shape (4 SECTION / 18 UNIT / 18 mappings, valid, delete + re-seed identical) and the CGL skeleton shape
 *        only while that version is a DRAFT; ≤ 1 PUBLISHED per exam + cycle; the QA exam never PUBLISHED. Every fixture
 *        draft in G-02..G-10 lives on the QA exam, never on a real exam
 *   G-13 negative controls (rolled back): a stray unit / dropped mapping / deleted unit in the fixture FAILS G-11; a
 *        QA version left PUBLISHED FAILS; the owner publishing then archiving the GD seed draft PASSES
 *   G-12 legacy tables preserved in schema retired (exam_syllabi 1, exam_topics 18, exam_unit_mappings 0,
 *        taxonomy_aliases 0; none left in public; GAP2-4c migration 084); the reconciliation workbench is removed
 *
 * Run: node scripts/test_gap2_4a_syllabus.cjs
 */
const { safeBegin } = require('./db/live-safety.cjs'); // LIVE-LOCK-SWEEP: the one safe BEGIN (timeouts + rollback on stop)
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { dbTarget } = require('./db/_db-env.cjs');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 3000)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const WRITE_RPCS = {
  fn_syllabus_create_draft: 'uuid, uuid, uuid, text',
  fn_syllabus_upsert_node: 'uuid, jsonb',
  fn_syllabus_move_node: 'uuid, uuid, integer',
  fn_syllabus_delete_node: 'uuid',
  fn_syllabus_set_unit_mappings: 'uuid, uuid[], numeric[]',
  fn_syllabus_validate: 'uuid',
  fn_syllabus_publish: 'uuid, text', // 125: + p_confirm (default NULL)
  fn_syllabus_archive_version: 'uuid',
};
const QA = 'qa-syllabus-test'; // GAP2-4A-SCOPE: every fixture draft lives on the QA test exam (never left PUBLISHED)
const CORE = ['fn_syllabus__assert_role', 'fn_syllabus__audit', 'fn_syllabus__slugify', 'fn_syllabus__lock_version', 'fn_syllabus__require_draft',
  'fn_syllabus__create_version', 'fn_syllabus__insert_node', 'fn_syllabus__validate', 'fn_syllabus_seed_legacy_gd_draft', 'fn_syllabus_seed_cgl_pattern_skeleton'];

(async () => {
  console.log('GAP2-4a syllabus suite');
  const c = new Client({ ...dbTarget().pg, port: 6543 });
  c.on('error', () => {});
  await c.connect();
  const q = async (sql, p) => (await c.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  let spN = 0;
  /** runs fn in a savepoint; returns { ok, value } or { ok:false, code, message } and always restores the role */
  const attempt = async (fn) => {
    const sp = `sp_${++spN}`;
    await c.query(`SAVEPOINT ${sp}`);
    try {
      const value = await fn();
      await c.query(`RELEASE SAVEPOINT ${sp}`);
      return { ok: true, value };
    } catch (e) {
      await c.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      return { ok: false, code: e.code, message: String(e.message) };
    } finally {
      await c.query('RESET ROLE').catch(() => {});
    }
  };
  const as = async (who) => {
    if (who === 'owner') {
      await c.query('RESET ROLE');
      return;
    }
    await c.query(`SET LOCAL ROLE ${who === 'anon' ? 'anon' : 'authenticated'}`);
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(CLAIMS[who] || {})]);
  };
  const rpc = async (who, fnName, args) => {
    await as(who);
    const ph = args.map((_, i) => `$${i + 1}`).join(', ');
    const r = await one(`SELECT public.${fnName}(${ph}) AS r`, args);
    await c.query('RESET ROLE');
    return r.r;
  };
  const tx = async (fn) => {
    await safeBegin(c);
    try {
      return await fn();
    } finally {
      await c.query('ROLLBACK');
    }
  };

  // identities and fixtures (read once)
  await safeBegin(c, { readOnly: true });
  const ids = Object.fromEntries((await q(`SELECT email, id FROM auth.users WHERE email IN ('qa-staff@courage-library.test','qa-admin@courage-library.test')`)).map((r) => [r.email, r.id]));
  const exams = Object.fromEntries((await q(`SELECT slug, id FROM public.exams WHERE slug IN ('ssc-gd','ssc-cgl',$1)`, [QA])).map((r) => [r.slug, r.id]));
  const topics = await q(`SELECT t.id, t.name, (SELECT count(*)::int FROM public.questions x WHERE x.canonical_topic_id = t.id AND x.status = 'published') AS qn
                            FROM public.canonical_taxonomy_nodes t WHERE t.node_type = 'TOPIC' AND t.is_active ORDER BY qn DESC, t.name LIMIT 4`);
  const subject = await one(`SELECT id FROM public.canonical_taxonomy_nodes WHERE node_type = 'SUBJECT' AND is_active LIMIT 1`);
  await c.query('ROLLBACK');
  assert(ids['qa-staff@courage-library.test'] && ids['qa-admin@courage-library.test'], 'QA staff / admin identities missing');
  const CLAIMS = {
    student: { sub: '00000000-0000-4000-8000-0000000000d4', role: 'authenticated', app_metadata: {} },
    staff: { sub: ids['qa-staff@courage-library.test'], role: 'authenticated', email: 'qa-staff@courage-library.test', app_metadata: { role: 'staff' } },
    admin: { sub: ids['qa-admin@courage-library.test'], role: 'authenticated', email: 'qa-admin@courage-library.test', app_metadata: { role: 'admin' } },
    ghostAdmin: { sub: '00000000-0000-4000-8000-0000000000e5', role: 'authenticated', app_metadata: { role: 'admin' } },
  };
  const [T1, T2, T3, T4] = topics.map((t) => t.id);

  /** a small valid draft (SECTION → 2 UNITs) for the given exam; returns ids */
  const buildValidDraft = async (examSlug, who = 'staff') => {
    const d = await rpc(who, 'fn_syllabus_create_draft', [exams[examSlug], null, null, null]);
    const sec = (await rpc(who, 'fn_syllabus_upsert_node', [d.version_id, { kind: 'SECTION', title: 'Test section' }])).node_id;
    const u1 = (await rpc(who, 'fn_syllabus_upsert_node', [d.version_id, { kind: 'UNIT', title: 'Unit one', parent_id: sec, weightage_tier: 'CORE', expected_questions_min: 2, expected_questions_max: 4 }])).node_id;
    const u2 = (await rpc(who, 'fn_syllabus_upsert_node', [d.version_id, { kind: 'UNIT', title: 'Unit two', parent_id: sec }])).node_id;
    await rpc(who, 'fn_syllabus_set_unit_mappings', [u1, [T1, T2], [0.75, 0.25]]);
    await rpc(who, 'fn_syllabus_set_unit_mappings', [u2, [T3], null]);
    return { version: d.version_id, number: d.version_number, sec, u1, u2 };
  };

  // GAP2-4A-SCOPE: the suite's own draft-shape fixture on the QA exam (built inside a rolled-back transaction), so the
  // shape contract no longer depends on real drafts the owner may publish / archive during intake
  const fixtureSpec = () => [
    { title: 'Fixture section A', units: [{ title: 'Fixture unit A1', topics: [T1, T2] }, { title: 'Fixture unit A2', topics: [T3] }] },
    { title: 'Fixture section B', units: [{ title: 'Fixture unit B1', topics: [T4] }] },
  ];
  const buildFromSpec = async (spec) => {
    const d = await rpc('staff', 'fn_syllabus_create_draft', [exams[QA], null, null, null]);
    for (const s of spec) {
      const sec = (await rpc('staff', 'fn_syllabus_upsert_node', [d.version_id, { kind: 'SECTION', title: s.title }])).node_id;
      for (const u of s.units) {
        const unit = (await rpc('staff', 'fn_syllabus_upsert_node', [d.version_id, { kind: 'UNIT', title: u.title, parent_id: sec }])).node_id;
        await rpc('staff', 'fn_syllabus_set_unit_mappings', [unit, u.topics, u.topics.length > 1 ? u.topics.map(() => 1 / u.topics.length) : null]);
      }
    }
    return d.version_id;
  };
  /** kind | title | parent title | mapped canonical ids, in tree order (no ids of the version's own rows) */
  const fixtureRows = async (versionId) =>
    (await q(`SELECT n.node_kind, n.raw_title, p.raw_title parent,
                     (SELECT string_agg(m.canonical_node_id::text, ',' ORDER BY m.canonical_node_id) FROM public.exam_syllabus_canonical_mappings m WHERE m.syllabus_node_id = n.id) maps
                FROM public.exam_syllabus_nodes n LEFT JOIN public.exam_syllabus_nodes p ON p.id = n.parent_node_id
               WHERE n.syllabus_version_id = $1 ORDER BY n.node_depth, p.display_order NULLS FIRST, n.display_order, n.raw_title`, [versionId]))
      .map((n) => `${n.node_kind}|${n.raw_title}|${n.parent || '-'}|${n.maps || '-'}`);
  /** every difference between a draft's rows and the spec (empty = exactly the spec's shape) */
  const shapeProblems = (rows, spec) => {
    const want = [];
    for (const s of spec) {
      want.push(`SECTION|${s.title}|-|-`);
      for (const u of s.units) want.push(`UNIT|${u.title}|${s.title}|${[...u.topics].sort().join(',')}`);
    }
    const missing = want.filter((w) => !rows.includes(w)).map((w) => `missing ${w.split('|').slice(0, 2).join(' ')}`);
    const extra = rows.filter((r) => !want.includes(r)).map((r) => `unexpected ${r.split('|').slice(0, 2).join(' ')}`);
    return [...missing, ...extra, ...(rows.length !== want.length ? [`${rows.length} rows, want ${want.length}`] : [])];
  };
  const seedTree = async (id) => (await q(`SELECT n.node_kind, n.raw_title, n.raw_slug, n.display_order, n.weightage_tier, n.is_mandatory, p.raw_slug parent,
        (SELECT string_agg(m.canonical_node_id::text || '/' || m.match_method, ',') FROM public.exam_syllabus_canonical_mappings m WHERE m.syllabus_node_id = n.id) maps
      FROM public.exam_syllabus_nodes n LEFT JOIN public.exam_syllabus_nodes p ON p.id = n.parent_node_id WHERE n.syllabus_version_id = $1
     ORDER BY n.node_depth, p.raw_slug NULLS FIRST, n.display_order, n.raw_title`, [id]));

  /**
   * G-11 body (runs inside the caller's transaction). Real-data invariants: ≤ 1 PUBLISHED per exam + cycle; the QA test
   * exam never PUBLISHED. Shape contract: the QA fixture equals its spec exactly, validates, and builds deterministically.
   * Seeds: re-running a seed is a no-op whatever the seeded version's status; the GD / CGL seed shapes are asserted only
   * while that seeded version is still a DRAFT. opts.afterBuild (negative controls only) mutates the first fixture.
   */
  const g11 = async (opts = {}) => {
    const vers = await q(`SELECT e.slug, v.id, v.status, v.source_kind, v.version_tag, v.raw_payload_hash h, v.exam_cycle_id::text cy FROM public.exam_syllabus_versions v JOIN public.exams e ON e.id = v.exam_id`);
    const qaPublished = vers.filter((v) => v.slug === QA && v.status === 'PUBLISHED');
    assert(qaPublished.length === 0, `the QA test exam has ${qaPublished.length} PUBLISHED version(s)`);
    const perScope = {};
    for (const v of vers.filter((x) => x.status === 'PUBLISHED')) perScope[`${v.slug}/${v.cy || '-'}`] = (perScope[`${v.slug}/${v.cy || '-'}`] || 0) + 1;
    const multi = Object.entries(perScope).filter(([, n]) => n > 1);
    assert(multi.length === 0, `more than one PUBLISHED version: ${multi.map(([k, n]) => `${k.split('/')[0]}×${n}`)}`);

    // the shape contract, on the suite's own fixture
    assert(new Set([T1, T2, T3, T4].filter(Boolean)).size === 4, 'four distinct active topics are needed for the fixture');
    const spec = fixtureSpec();
    const f1 = await buildFromSpec(spec);
    if (opts.afterBuild) await opts.afterBuild(f1);
    const rows1 = await fixtureRows(f1);
    const problems = shapeProblems(rows1, spec);
    assert(problems.length === 0, `fixture shape: ${problems.join('; ')}`);
    const fv = await rpc('staff', 'fn_syllabus_validate', [f1]);
    assert(fv.ok, `fixture draft invalid: ${fv.errors.map((e) => e.code)}`);
    const f2 = await buildFromSpec(spec);
    assert(JSON.stringify(await fixtureRows(f2)) === JSON.stringify(rows1), 'the same spec built twice gives different trees');

    // seeds: idempotent in any status (the seed functions match their tag, not the status)
    const gd = vers.find((v) => v.slug === 'ssc-gd' && v.version_tag === 'legacy-official-2026');
    const cgl = vers.find((v) => v.slug === 'ssc-cgl' && v.version_tag === 'pattern-skeleton-2026');
    const notes = [];
    for (const [label, fn, row] of [['GD', 'fn_syllabus_seed_legacy_gd_draft', gd], ['CGL', 'fn_syllabus_seed_cgl_pattern_skeleton', cgl]]) {
      if (!row) {
        notes.push(`${label} seed absent (not re-run)`);
        continue;
      }
      const before = JSON.stringify(await seedTree(row.id));
      const r = (await one(`SELECT public.${fn}() r`)).r;
      assert(r.created === false && JSON.stringify(await seedTree(row.id)) === before, `${label} seed re-run (${row.status}): ${JSON.stringify(r)}`);
    }

    // seed-specific shapes: only while the seeded version is still a DRAFT
    if (gd && gd.status === 'DRAFT') {
      const gdTree = await seedTree(gd.id);
      const kinds = gdTree.reduce((a, n) => ({ ...a, [n.node_kind]: (a[n.node_kind] || 0) + 1 }), {});
      const maps = gdTree.filter((n) => n.maps).length;
      assert(gd.source_kind === 'LEGACY_MIGRATION' && kinds.SECTION === 4 && kinds.UNIT === 18 && maps === 18 && gdTree.every((n) => !n.maps || /LEGACY_MIGRATION/.test(n.maps)), `GD tree ${JSON.stringify(kinds)} maps ${maps}`);
      // GAP2-4c (084): the legacy rows live in schema retired (owner connection)
      const legacyMatch = await one(`SELECT count(*)::int n FROM retired.exam_topics t JOIN retired.exam_syllabi s ON s.id = t.syllabus_id
          JOIN public.exam_syllabus_canonical_mappings m ON m.canonical_node_id = t.topic_id
          JOIN public.exam_syllabus_nodes n ON n.id = m.syllabus_node_id AND n.syllabus_version_id = $1`, [gd.id]);
      assert(legacyMatch.n === 18, `${legacyMatch.n}/18 legacy topics mapped`);
      const gdVal = await rpc('staff', 'fn_syllabus_validate', [gd.id]);
      assert(gdVal.ok, `GD draft invalid: ${gdVal.errors.map((e) => e.code)}`);
      // deterministic: delete the GD draft and seed again → identical tree and hash
      await c.query(`DELETE FROM public.exam_syllabus_versions WHERE id = $1`, [gd.id]);
      const r3 = (await one(`SELECT public.fn_syllabus_seed_legacy_gd_draft() r`)).r;
      assert(r3.created === true && r3.sections === 4 && r3.units === 18, `re-seed ${JSON.stringify(r3)}`);
      const again = await one(`SELECT raw_payload_hash h FROM public.exam_syllabus_versions WHERE id = $1`, [r3.version_id]);
      assert(again.h === gd.h && JSON.stringify(await seedTree(r3.version_id)) === JSON.stringify(gdTree), 're-seed is not identical');
      const r4 = (await one(`SELECT public.fn_syllabus_seed_legacy_gd_draft() r`)).r;
      assert(r4.created === false, 'second seed in a row created again');
      notes.push('GD DRAFT 4/18/18 valid, re-seed identical');
    } else notes.push(`GD seed ${gd ? gd.status : 'absent'}: shape not asserted (only while DRAFT)`);
    if (cgl && cgl.status === 'DRAFT') {
      const cglTree = await seedTree(cgl.id);
      const sections = await q(`SELECT ps.section_name FROM public.pattern_sections ps JOIN public.exam_patterns p ON p.id = ps.pattern_id
          JOIN public.exam_cycles cy ON cy.id = p.exam_cycle_id WHERE cy.exam_id = $1 AND p.is_active ORDER BY ps.section_order`, [exams['ssc-cgl']]);
      assert(sections.length > 0, 'no active CGL pattern sections to compare with');
      assert(cglTree.length === 4 && cglTree.every((n) => n.node_kind === 'SECTION' && !n.parent && !n.maps), `CGL tree ${JSON.stringify(cglTree).slice(0, 200)}`);
      assert(JSON.stringify(cglTree.map((n) => n.raw_title)) === JSON.stringify(sections.map((s) => s.section_name)), 'CGL sections differ from the pattern');
      notes.push('CGL DRAFT 4 sections');
    } else notes.push(`CGL seed ${cgl ? cgl.status : 'absent'}: shape not asserted (only while DRAFT)`);
    return `fixture ${rows1.length} rows exact + valid + deterministic; seeds re-run no-op; ${notes.join('; ')}; PUBLISHED scopes ${Object.keys(perScope).length} (≤ 1 each)`;
  };

  try {
    await test('G-01 catalog: schema, guards, SECURITY DEFINER + search_path, EXECUTE grants', async () => {
      await safeBegin(c, { readOnly: true });
      try {
        const bad = [];
        const cols = (await q(`SELECT table_name || '.' || column_name AS c FROM information_schema.columns WHERE table_schema = 'public'
                                 AND table_name IN ('exam_syllabus_versions','exam_syllabus_nodes','exam_syllabus_canonical_mappings')`)).map((r) => r.c);
        for (const col of ['exam_syllabus_versions.version_number', 'exam_syllabus_versions.supersedes_version_id', 'exam_syllabus_versions.source_kind',
          'exam_syllabus_versions.created_by', 'exam_syllabus_versions.published_at', 'exam_syllabus_versions.published_by', 'exam_syllabus_versions.archived_at',
          'exam_syllabus_nodes.node_kind', 'exam_syllabus_nodes.description', 'exam_syllabus_canonical_mappings.canonical_node_type',
          'exam_syllabus_canonical_mappings.mapping_weight']) if (!cols.includes(col)) bad.push(`missing column ${col}`);
        const cons = (await q(`SELECT conname, pg_get_constraintdef(oid) d FROM pg_constraint WHERE conrelid IN
                                ('public.exam_syllabus_versions'::regclass, 'public.exam_syllabus_nodes'::regclass, 'public.exam_syllabus_canonical_mappings'::regclass)`));
        const def = (n) => (cons.find((x) => x.conname === n) || {}).d || '';
        if (/RECONCILED/.test(def('exam_syllabus_versions_status_check')) || !/ARCHIVED/.test(def('exam_syllabus_versions_status_check'))) bad.push('status CHECK');
        if (!/FOREIGN KEY \(canonical_node_id, canonical_node_type\) REFERENCES canonical_taxonomy_nodes\(id, node_type\)/.test(def('exam_syllabus_canonical_mappings_topic_fkey'))) bad.push('TOPIC composite FK');
        if (cons.some((x) => x.conname === 'uq_exam_syllabus_canonical_mapping_node')) bad.push('UNIQUE(syllabus_node_id) still present');
        // CA-2 (116, M2): canonical_node_type is set by trigger from the mapped node, limited to TOPIC / SUBTOPIC / CONCEPT
        // (was the generated 'TOPIC'); the composite FK above still ties it to the node's real type
        if (!/canonical_node_type = ANY \(ARRAY\['TOPIC'::text, 'SUBTOPIC'::text, 'CONCEPT'::text\]\)/.test(def('chk_syllabus_mapping_node_type'))) bad.push('mapping node-type CHECK (TOPIC / SUBTOPIC / CONCEPT)');
        const mtrg = await one(`SELECT count(*)::int n FROM pg_trigger WHERE tgrelid = 'public.exam_syllabus_canonical_mappings'::regclass AND tgname = 'trg_a_syllabus_mapping_node_fields'`);
        if (mtrg.n !== 1) bad.push('trg_a_syllabus_mapping_node_fields missing');
        const idx = (await q(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename LIKE 'exam_syllabus%'`));
        const one_pub = (idx.find((i) => i.indexname === 'uq_exam_syllabus_one_published') || {}).indexdef || '';
        if (!/UNIQUE/.test(one_pub) || !/WHERE \(\(status = 'PUBLISHED'::text\) AND is_active\)/.test(one_pub)) bad.push(`one-published index: ${one_pub}`);
        if (!idx.some((i) => i.indexname === 'uq_syllabus_node_topic')) bad.push('UNIQUE(node, topic) missing');
        if (!idx.some((i) => i.indexname === 'uq_exam_syllabus_version_number')) bad.push('UNIQUE(exam, version_number) missing');
        const trg = (await q(`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN
                               ('public.exam_syllabus_versions'::regclass, 'public.exam_syllabus_nodes'::regclass, 'public.exam_syllabus_canonical_mappings'::regclass)`)).map((r) => r.tgname);
        for (const t of ['trg_guard_exam_syllabus_version_lifecycle', 'trg_guard_exam_syllabus_nodes_draft_only', 'trg_guard_exam_syllabus_mappings_draft_only',
          'trg_guard_exam_syllabus_node_same_version', 'trg_guard_exam_syllabus_node_cycles']) if (!trg.includes(t)) bad.push(`missing trigger ${t}`);
        const fns = await q(`SELECT p.proname, p.prosecdef, array_to_string(p.proconfig, ',') cfg, pg_get_function_identity_arguments(p.oid) args,
                                    has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') u
                               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND (p.proname LIKE 'fn_syllabus%' OR p.proname = 'fn_exam_syllabus_read_model')`);
        const fn = (n) => fns.find((f) => f.proname === n);
        for (const [n, args] of Object.entries(WRITE_RPCS)) {
          const f = fn(n);
          if (!f) { bad.push(`missing ${n}`); continue; }
          if (f.args.replace(/p_\w+ /g, '') !== args) bad.push(`${n} args ${f.args}`);
          if (!f.prosecdef || f.cfg !== 'search_path=""') bad.push(`${n}: definer ${f.prosecdef} cfg ${f.cfg}`);
          if (f.a || !f.u) bad.push(`${n}: anon ${f.a} authenticated ${f.u}`);
        }
        for (const n of CORE) {
          const f = fn(n);
          if (!f) { bad.push(`missing ${n}`); continue; }
          if (f.a || f.u) bad.push(`${n}: must be owner-only (anon ${f.a}, authenticated ${f.u})`);
        }
        const rm = fn('fn_exam_syllabus_read_model');
        if (!rm || !rm.prosecdef || rm.cfg !== 'search_path=""' || !rm.a || !rm.u) bad.push(`read model: ${JSON.stringify(rm)}`);
        assert(bad.length === 0, bad.join('\n        '));
        return `${Object.keys(WRITE_RPCS).length} write RPCs, ${CORE.length} owner-only helpers, read model public`;
      } finally {
        await c.query('ROLLBACK');
      }
    });

    await test('G-02 role matrix: anon no EXECUTE; student 42501; staff edits DRAFT but cannot publish / archive; admin can', async () =>
      tx(async () => {
        const d = await buildValidDraft(QA);
        const calls = {
          fn_syllabus_create_draft: [exams[QA], null, null, null],
          fn_syllabus_upsert_node: [d.version, { kind: 'UNIT', title: 'Matrix unit', parent_id: d.sec }],
          fn_syllabus_move_node: [d.u2, d.sec, 9],
          fn_syllabus_delete_node: [d.u2],
          fn_syllabus_set_unit_mappings: [d.u1, [T1], null],
          fn_syllabus_validate: [d.version],
          fn_syllabus_publish: [d.version],
          fn_syllabus_archive_version: [d.version],
        };
        const seen = {};
        for (const [fnName, args] of Object.entries(calls)) {
          const row = {};
          for (const who of ['anon', 'student', 'staff']) {
            const r = await attempt(() => rpc(who, fnName, args));
            row[who] = r.ok ? 'OK' : r.code;
          }
          seen[fnName] = row;
        }
        const bad = [];
        for (const [fnName, row] of Object.entries(seen)) {
          if (row.anon !== '42501') bad.push(`${fnName}: anon ${row.anon}`);
          if (row.student !== '42501') bad.push(`${fnName}: student ${row.student}`);
          const adminOnly = fnName === 'fn_syllabus_publish' || fnName === 'fn_syllabus_archive_version';
          if (adminOnly && row.staff !== '42501') bad.push(`${fnName}: staff ${row.staff} (must be denied)`);
          if (!adminOnly && row.staff !== 'OK') bad.push(`${fnName}: staff ${row.staff} (must succeed)`);
        }
        const fresh = await buildValidDraft(QA);
        const pub = await attempt(() => rpc('admin', 'fn_syllabus_publish', [fresh.version]));
        if (!pub.ok || !pub.value.success) bad.push(`admin publish: ${JSON.stringify(pub).slice(0, 300)}`);
        const arc = await attempt(() => rpc('admin', 'fn_syllabus_archive_version', [fresh.version]));
        if (!arc.ok || !arc.value.success) bad.push(`admin archive: ${JSON.stringify(arc)}`);
        assert(bad.length === 0, bad.join('\n        '));
        return '8 RPCs × anon / student / staff + admin publish / archive';
      }));

    await test('G-03 audit: one row per successful write in the same transaction (actor = JWT subject); denied calls write none', async () =>
      tx(async () => {
        const count = async () => Number((await one(`SELECT count(*) n FROM public.admin_audit_logs WHERE action_type LIKE 'SYLLABUS_%'`)).n);
        const base = await count();
        const d = await buildValidDraft(QA); // create + 3 upserts + 2 mapping sets = 6
        assert((await count()) === base + 6, `expected 6 audit rows, got ${(await count()) - base}`);
        const actors = await q(`SELECT DISTINCT actor_id::text a, actor_email e FROM public.admin_audit_logs WHERE action_type LIKE 'SYLLABUS_%' AND created_at = now()`);
        assert(actors.length === 1 && actors[0].a === CLAIMS.staff.sub && actors[0].e === CLAIMS.staff.email, 'audit actor is not the JWT subject');
        const before = await count();
        await attempt(() => rpc('student', 'fn_syllabus_delete_node', [d.u2]));
        await attempt(() => rpc('staff', 'fn_syllabus_publish', [d.version]));
        assert((await count()) === before, 'a denied call wrote an audit row');
        await rpc('admin', 'fn_syllabus_publish', [d.version]);
        const pubRow = await one(`SELECT new_value FROM public.admin_audit_logs WHERE action_type = 'SYLLABUS_PUBLISH' AND target_id = $1`, [d.version]);
        assert(pubRow && pubRow.new_value.counts && pubRow.new_value.counts.units === 2, 'publish audit lacks the counts snapshot');
        return 'create / upsert / mappings / publish audited';
      }));

    await test('G-04 same-version parent; node cannot change version; cycle prevention', async () =>
      tx(async () => {
        const a = await buildValidDraft(QA);
        const b = await rpc('staff', 'fn_syllabus_create_draft', [exams[QA], null, null, null]);
        const cross = await attempt(() => rpc('staff', 'fn_syllabus_upsert_node', [b.version_id, { kind: 'UNIT', title: 'x', parent_id: a.sec }]));
        assert(!cross.ok && /SYLLABUS_PARENT_OTHER_VERSION/.test(cross.message), `cross-version parent: ${JSON.stringify(cross)}`);
        const moveCross = await attempt(() => rpc('staff', 'fn_syllabus_move_node', [a.u1, null, null]).then(async () => {
          const bsec = (await rpc('staff', 'fn_syllabus_upsert_node', [b.version_id, { kind: 'SECTION', title: 'B' }])).node_id;
          return rpc('staff', 'fn_syllabus_move_node', [a.u1, bsec, null]);
        }));
        assert(!moveCross.ok && /SYLLABUS_PARENT_OTHER_VERSION/.test(moveCross.message), `move across versions: ${JSON.stringify(moveCross)}`);
        const reversion = await attempt(() => c.query(`UPDATE public.exam_syllabus_nodes SET syllabus_version_id = $1 WHERE id = $2`, [b.version_id, a.u2]));
        assert(!reversion.ok && /SYLLABUS_NODE_VERSION_LOCKED/.test(reversion.message), `version change: ${JSON.stringify(reversion)}`);
        const cyc = await attempt(() => rpc('staff', 'fn_syllabus_move_node', [a.sec, a.u1, null]));
        assert(!cyc.ok && /Circular parent/i.test(cyc.message), `cycle: ${JSON.stringify(cyc)}`);
        const self = await attempt(() => rpc('staff', 'fn_syllabus_move_node', [a.sec, a.sec, null]));
        assert(!self.ok, 'self-parent accepted');
        const depth = await one(`SELECT node_depth d FROM public.exam_syllabus_nodes WHERE id = $1`, [a.u1]);
        assert(depth.d === 2, `unit depth ${depth.d}`);
      }));

    await test('G-05 mappings: TOPIC / SUBTOPIC / CONCEPT only, never a SUBJECT (RPC + node-type trigger + composite FK), UNIT only, distinct / active; weights in (0,1] summing to 1', async () =>
      tx(async () => {
        const d = await buildValidDraft(QA);
        const cases = {
          subjectViaRpc: await attempt(() => rpc('staff', 'fn_syllabus_set_unit_mappings', [d.u1, [subject.id], null])),
          subjectDirectFk: await attempt(() => c.query(`INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status) VALUES ($1, $2, 'MANUALLY_MAPPED')`, [d.u2, subject.id])),
          onSection: await attempt(() => rpc('staff', 'fn_syllabus_set_unit_mappings', [d.sec, [T1], null])),
          duplicate: await attempt(() => rpc('staff', 'fn_syllabus_set_unit_mappings', [d.u1, [T1, T1], null])),
          sumNot1: await attempt(() => rpc('staff', 'fn_syllabus_set_unit_mappings', [d.u1, [T1, T2], [0.5, 0.4]])),
          lengthMismatch: await attempt(() => rpc('staff', 'fn_syllabus_set_unit_mappings', [d.u1, [T1, T2], [1]])),
          over1: await attempt(() => rpc('staff', 'fn_syllabus_set_unit_mappings', [d.u1, [T1], [1.5]])),
          zero: await attempt(() => rpc('staff', 'fn_syllabus_set_unit_mappings', [d.u1, [T1, T2], [0, 1]])),
          directWeightOver1: await attempt(() => c.query(`UPDATE public.exam_syllabus_canonical_mappings SET mapping_weight = 1.2 WHERE syllabus_node_id = $1`, [d.u1])),
        };
        await c.query(`UPDATE public.canonical_taxonomy_nodes SET is_active = false WHERE id = $1`, [T4]);
        cases.inactive = await attempt(() => rpc('staff', 'fn_syllabus_set_unit_mappings', [d.u1, [T4], null]));
        const valid = await attempt(() => rpc('staff', 'fn_syllabus_set_unit_mappings', [d.u1, [T1, T2, T3], [0.5, 0.3, 0.2]]));
        const expect = {
          subjectViaRpc: /SYLLABUS_TOPICS_INVALID/, subjectDirectFk: /SYLLABUS_MAPPING_NODE_TYPE|exam_syllabus_canonical_mappings_topic_fkey/, // CA-2: the node-type trigger refuses first; the composite FK stays (G-01) onSection: /SYLLABUS_MAPPING_NOT_UNIT/,
          duplicate: /SYLLABUS_TOPICS_INVALID/, sumNot1: /SYLLABUS_WEIGHTS_INVALID/, lengthMismatch: /SYLLABUS_WEIGHTS_INVALID/, over1: /SYLLABUS_WEIGHTS_INVALID/,
          zero: /SYLLABUS_WEIGHTS_INVALID/, directWeightOver1: /mapping_weight_check|check constraint/, inactive: /SYLLABUS_TOPICS_INVALID/,
        };
        const bad = Object.entries(expect).filter(([k, rx]) => cases[k].ok || !rx.test(cases[k].message)).map(([k]) => `${k}: ${JSON.stringify(cases[k]).slice(0, 200)}`);
        if (!valid.ok || valid.value.mappings !== 3) bad.push(`valid weights rejected: ${JSON.stringify(valid)}`);
        assert(bad.length === 0, bad.join('\n        '));
        return `${Object.keys(expect).length} rejections + valid weighted set`;
      }));

    await test('G-06 fn_syllabus_validate: structured errors and warnings on a broken draft; clean draft ok', async () =>
      tx(async () => {
        const good = await buildValidDraft(QA);
        const gr = await rpc('staff', 'fn_syllabus_validate', [good.version]);
        assert(gr.ok === true && gr.error_count === 0 && gr.counts.units === 2 && gr.counts.topics === 3, `clean draft: ${JSON.stringify(gr).slice(0, 300)}`);
        const empty = await rpc('staff', 'fn_syllabus_create_draft', [exams[QA], null, null, null]);
        const er = await rpc('staff', 'fn_syllabus_validate', [empty.version_id]);
        assert(!er.ok && er.errors.some((e) => e.code === 'NO_NODES'), 'NO_NODES missing');

        const b = await buildValidDraft(QA);
        const emptySec = (await rpc('staff', 'fn_syllabus_upsert_node', [b.version, { kind: 'SECTION', title: 'Empty section' }])).node_id;
        await rpc('staff', 'fn_syllabus_upsert_node', [b.version, { kind: 'UNIT', title: 'Unmapped unit', parent_id: b.sec }]);
        await rpc('staff', 'fn_syllabus_upsert_node', [b.version, { kind: 'PAPER', title: 'Paper under section', parent_id: emptySec }]);
        await rpc('staff', 'fn_syllabus_upsert_node', [b.version, { kind: 'UNIT', title: 'Child of unit', parent_id: b.u2 }]);
        await rpc('staff', 'fn_syllabus_set_unit_mappings', [b.u2, [T1], null]); // T1 also in u1 → duplicate in the same section
        // owner-path rows the RPCs would refuse: mapping on a SECTION, partial weights
        await c.query(`INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status) VALUES ($1, $2, 'MANUALLY_MAPPED')`, [b.sec, T3]);
        await c.query(`UPDATE public.exam_syllabus_canonical_mappings SET mapping_weight = NULL WHERE syllabus_node_id = $1 AND canonical_node_id = $2`, [b.u1, T2]);
        await c.query(`UPDATE public.canonical_taxonomy_nodes SET is_active = false WHERE id = $1`, [T3]);
        const r = await rpc('staff', 'fn_syllabus_validate', [b.version]);
        const codes = new Set(r.errors.map((e) => e.code));
        const want = ['EMPTY_SECTION', 'UNIT_UNMAPPED', 'PAPER_NOT_ROOT', 'UNIT_HAS_CHILDREN', 'DUPLICATE_TOPIC_IN_SECTION', 'MAPPING_ON_NON_UNIT', 'WEIGHTS_INVALID', 'TOPIC_INACTIVE'];
        const missing = want.filter((w) => !codes.has(w));
        assert(!r.ok && missing.length === 0, `missing error codes: ${missing.join(', ')} (got ${[...codes].join(', ')})`);
        assert(r.errors.every((e) => e.message && 'node_id' in e && 'topic_id' in e), 'issue shape');
        assert(r.warnings.every((w) => /^TOPIC_/.test(w.code)), `unexpected warning codes ${r.warnings.map((w) => w.code)}`);
        return `${want.length} error codes + ${r.warning_count} warnings`;
      }));

    await test('G-07 publish: fails closed on validation; archives the previous; ≤ 1 PUBLISHED per exam + cycle; mid-publish failure rolls back', async () =>
      tx(async () => {
        const bad = [];
        const auditN = async () => Number((await one(`SELECT count(*) n FROM public.admin_audit_logs WHERE action_type = 'SYLLABUS_PUBLISH'`)).n);
        const invalid = await rpc('staff', 'fn_syllabus_create_draft', [exams[QA], null, null, null]);
        const a0 = await auditN();
        const vf = await rpc('admin', 'fn_syllabus_publish', [invalid.version_id]);
        const st0 = await one(`SELECT status FROM public.exam_syllabus_versions WHERE id = $1`, [invalid.version_id]);
        if (vf.success !== false || vf.code !== 'VALIDATION_FAILED' || st0.status !== 'DRAFT' || (await auditN()) !== a0) bad.push(`invalid publish: ${JSON.stringify(vf).slice(0, 200)} ${st0.status}`);

        const d1 = await buildValidDraft(QA);
        const p1 = await rpc('admin', 'fn_syllabus_publish', [d1.version]);
        if (!p1.success || p1.archived_previous_version_id !== null) bad.push(`first publish ${JSON.stringify(p1).slice(0, 200)}`);
        const d2 = await buildValidDraft(QA);
        const p2 = await rpc('admin', 'fn_syllabus_publish', [d2.version]);
        const s1 = await one(`SELECT status, is_active, archived_at FROM public.exam_syllabus_versions WHERE id = $1`, [d1.version]);
        if (!p2.success || p2.archived_previous_version_id !== d1.version || s1.status !== 'ARCHIVED' || s1.is_active || !s1.archived_at) bad.push(`second publish did not archive the first: ${JSON.stringify(p2).slice(0, 160)} ${JSON.stringify(s1)}`);
        const pubCount = Number((await one(`SELECT count(*) n FROM public.exam_syllabus_versions WHERE exam_id = $1 AND status = 'PUBLISHED' AND is_active`, [exams[QA]])).n);
        if (pubCount !== 1) bad.push(`${pubCount} PUBLISHED versions`);

        // owner path: a second PUBLISHED for the same exam + cycle violates the partial unique index
        const d3 = await buildValidDraft(QA);
        const dup = await attempt(() => c.query(`UPDATE public.exam_syllabus_versions SET status = 'PUBLISHED', published_at = now() WHERE id = $1`, [d3.version]));
        if (dup.ok || dup.code !== '23505') bad.push(`second PUBLISHED accepted: ${JSON.stringify(dup).slice(0, 160)}`);

        // mid-publish failure: published_by references a user that does not exist → FK error after the archive step
        const ghost = await attempt(() => rpc('ghostAdmin', 'fn_syllabus_publish', [d3.version]));
        const after2 = await one(`SELECT status FROM public.exam_syllabus_versions WHERE id = $1`, [d2.version]);
        const after3 = await one(`SELECT status FROM public.exam_syllabus_versions WHERE id = $1`, [d3.version]);
        if (ghost.ok || after2.status !== 'PUBLISHED' || after3.status !== 'DRAFT') bad.push(`partial publish: ${JSON.stringify(ghost).slice(0, 160)} prev ${after2.status} new ${after3.status}`);
        assert(bad.length === 0, bad.join('\n        '));
        return 'VALIDATION_FAILED no-op; archive-previous; unique PUBLISHED; atomic rollback';
      }));

    await test('G-08 immutability (owner / service-role path): PUBLISHED / ARCHIVED read-only except PUBLISHED → ARCHIVED', async () =>
      tx(async () => {
        const d = await buildValidDraft(QA);
        await rpc('admin', 'fn_syllabus_publish', [d.version]);
        const probes = {
          nodeUpdate: () => c.query(`UPDATE public.exam_syllabus_nodes SET raw_title = 'x' WHERE id = $1`, [d.u1]),
          nodeInsert: () => c.query(`INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, node_kind) VALUES ($1, $2, 'x', 'x', 1, 'UNIT')`, [d.version, d.sec]),
          nodeDelete: () => c.query(`DELETE FROM public.exam_syllabus_nodes WHERE id = $1`, [d.u2]),
          mappingDelete: () => c.query(`DELETE FROM public.exam_syllabus_canonical_mappings WHERE syllabus_node_id = $1`, [d.u1]),
          mappingInsert: () => c.query(`INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status) VALUES ($1, $2, 'MANUALLY_MAPPED')`, [d.u2, T4]),
          versionEdit: () => c.query(`UPDATE public.exam_syllabus_versions SET version_tag = 'x' WHERE id = $1`, [d.version]),
          versionDelete: () => c.query(`DELETE FROM public.exam_syllabus_versions WHERE id = $1`, [d.version]),
          backToDraft: () => c.query(`UPDATE public.exam_syllabus_versions SET status = 'DRAFT' WHERE id = $1`, [d.version]),
          rpcUpsert: () => rpc('staff', 'fn_syllabus_upsert_node', [d.version, { kind: 'UNIT', title: 'y', parent_id: d.sec }]),
          insertPublished: () => c.query(`INSERT INTO public.exam_syllabus_versions (exam_id, version_tag, version_number, status, published_at) VALUES ($1, 'zz', 999, 'PUBLISHED', now())`, [exams[QA]]),
        };
        const bad = [];
        for (const [k, fn] of Object.entries(probes)) {
          const r = await attempt(fn);
          if (r.ok || !/SYLLABUS_IMMUTABLE|SYLLABUS_NOT_DRAFT|SYLLABUS_INSERT_NOT_DRAFT/.test(r.message)) bad.push(`${k}: ${JSON.stringify(r).slice(0, 160)}`);
        }
        const arch = await attempt(() => c.query(`UPDATE public.exam_syllabus_versions SET status = 'ARCHIVED', is_active = false, archived_at = now() WHERE id = $1`, [d.version]));
        if (!arch.ok) bad.push(`PUBLISHED → ARCHIVED refused: ${arch.message}`);
        const revive = await attempt(() => c.query(`UPDATE public.exam_syllabus_versions SET status = 'PUBLISHED' WHERE id = $1`, [d.version]));
        if (revive.ok || !/SYLLABUS_IMMUTABLE/.test(revive.message)) bad.push(`ARCHIVED changed: ${JSON.stringify(revive).slice(0, 160)}`);
        const archNode = await attempt(() => c.query(`UPDATE public.exam_syllabus_nodes SET raw_title = 'x' WHERE id = $1`, [d.u1]));
        if (archNode.ok) bad.push('node of an ARCHIVED version changed');
        assert(bad.length === 0, bad.join('\n        '));
        return `${Object.keys(probes).length + 2} write probes rejected; PUBLISHED → ARCHIVED allowed`;
      }));

    await test('G-09 create_draft from a PUBLISHED version deep-copies nodes and mappings (supersedes set); DRAFT source refused', async () =>
      tx(async () => {
        const d = await buildValidDraft(QA);
        const fromDraft = await attempt(() => rpc('staff', 'fn_syllabus_create_draft', [exams[QA], null, d.version, null]));
        assert(!fromDraft.ok && /SYLLABUS_SOURCE_NOT_PUBLISHED/.test(fromDraft.message), 'copy from a DRAFT accepted');
        await rpc('admin', 'fn_syllabus_publish', [d.version]);
        const copy = await rpc('staff', 'fn_syllabus_create_draft', [exams[QA], null, d.version, null]);
        const shape = async (v) => (await q(`SELECT n.node_kind, n.raw_title, n.node_depth, n.display_order, n.weightage_tier, n.expected_questions_min, n.expected_questions_max,
                 (SELECT string_agg(m.canonical_node_id::text || ':' || COALESCE(m.mapping_weight::text, '-'), ',' ORDER BY m.canonical_node_id) FROM public.exam_syllabus_canonical_mappings m WHERE m.syllabus_node_id = n.id) maps
            FROM public.exam_syllabus_nodes n WHERE n.syllabus_version_id = $1 ORDER BY n.node_depth, n.display_order, n.raw_title`, [v]));
        assert(JSON.stringify(await shape(copy.version_id)) === JSON.stringify(await shape(d.version)), 'copied tree differs');
        const meta = await one(`SELECT status, supersedes_version_id::text s, version_number FROM public.exam_syllabus_versions WHERE id = $1`, [copy.version_id]);
        assert(meta.status === 'DRAFT' && meta.s === d.version && meta.version_number === d.number + 1, JSON.stringify(meta));
        return `${copy.nodes_copied} nodes, ${copy.mappings_copied} mappings copied`;
      }));

    await test('G-10 read model: NO_SYLLABUS (anon) without a published version; AVAILABLE with live derived counts', async () =>
      tx(async () => {
        // QB-KEY-1 round 2 (audited amendment; was pinned: CGL → NO_SYLLABUS): the read model agrees with the DB —
        // CGL has a PUBLISHED version ⇔ AVAILABLE with exactly that version and a non-empty tree; none ⇔ NO_SYLLABUS
        const cglPublished = (await q(`SELECT id::text FROM public.exam_syllabus_versions WHERE exam_id = $1 AND status = 'PUBLISHED'`, [exams['ssc-cgl']])).map((r) => r.id);
        const cgl = await rpc('anon', 'fn_exam_syllabus_read_model', [exams['ssc-cgl'], null]);
        if (cglPublished.length) assert(cglPublished.length === 1 && cgl.state === 'AVAILABLE' && cgl.version && cgl.version.id === cglPublished[0] && cgl.nodes.length > 0, `CGL: ${cgl.state} vs ${cglPublished.length} PUBLISHED`);
        else assert(cgl.state === 'NO_SYLLABUS' && cgl.version === null && cgl.nodes.length === 0, `CGL: ${JSON.stringify(cgl).slice(0, 200)}`);
        await buildValidDraft(QA); // GAP2-4A-SCOPE: a DRAFT-only exam is the QA exam with a fixture DRAFT
        const draftOnly = await rpc('anon', 'fn_exam_syllabus_read_model', [exams[QA], null]);
        assert(draftOnly.state === 'NO_SYLLABUS', 'a DRAFT leaked into the read model');

        const d = await buildValidDraft(QA);
        await rpc('admin', 'fn_syllabus_publish', [d.version]);
        // fixtures (rolled back): one SERVABLE document on T1 and one approved-but-unpublished document (not servable)
        const hex = 'a'.repeat(64);
        const unit = (await one(`INSERT INTO public.learning_units (topic_id, title, slug, unit_type, estimated_minutes, display_order, is_active)
                                  VALUES ($1, 'GAP2-4a test unit', 'gap2-4a-test-unit', 'CONCEPT_LESSON', 10, 999, true) RETURNING id`, [T1])).id;
        const mkDoc = async (slug, review, published) => {
          const doc = (await one(`INSERT INTO public.learning_documents (learning_unit_id, canonical_slug, document_type, status, access_level)
                                   VALUES ($1, $2, 'CONCEPT_LESSON', 'DRAFT', 'FREE') RETURNING id`, [unit, slug])).id;
          // CA-3: a DB lesson (BLOCKS; the MDX path is retired — migration 118 refuses new legacy versions)
          const ver = (await one(`INSERT INTO public.document_versions (document_id, version_number, schema_version, compiler_version, component_contract_version,
                                    author_type, review_status, is_published, published_at, content_format, language, lesson_meta, blocks, blocks_hash, blocks_schema_version, is_current)
                                   VALUES ($1, 1, '2.0.0', 'blocks-2', 'blocks-2', 'HUMAN', $3, $4, CASE WHEN $4 THEN now() END, 'BLOCKS', 'en',
                                           '{"title":"GAP2-4a test lesson"}'::jsonb, '[{"id":"a","type":"paragraph","text":"Test lesson."}]'::jsonb, $2, '2.0.0', $4) RETURNING id`, [doc, hex, review, published])).id;
          if (published) await c.query(`UPDATE public.learning_documents SET status = 'PUBLISHED', current_published_version_id = $2 WHERE id = $1`, [doc, ver]);
        };
        await mkDoc('gap2-4a-test-servable', 'PUBLISHED', true);
        await mkDoc('gap2-4a-test-not-servable', 'APPROVED', false);
        const rm = await rpc('anon', 'fn_exam_syllabus_read_model', [exams[QA], null]);
        assert(rm.state === 'AVAILABLE' && rm.version.id === d.version, `state ${rm.state}`);
        const indep = Object.fromEntries((await q(`SELECT t.id::text id,
              (SELECT count(*)::int FROM public.questions x WHERE x.canonical_topic_id = t.id AND x.status = 'published') qn,
              (SELECT count(*)::int FROM public.learning_documents ld JOIN public.learning_units u ON u.id = ld.learning_unit_id
                 JOIN public.document_versions dv ON dv.id = ld.current_published_version_id
                WHERE u.topic_id = t.id AND u.is_active AND ld.status = 'PUBLISHED' AND dv.is_published AND dv.review_status = 'PUBLISHED') dn
            FROM public.canonical_taxonomy_nodes t WHERE t.id = ANY($1)`, [[T1, T2, T3]])).map((r) => [r.id, r]));
        const bad = [];
        const unit1 = rm.nodes.find((n) => n.id === d.u1);
        const sec = rm.nodes.find((n) => n.id === d.sec);
        if (!unit1 || unit1.kind !== 'UNIT' || unit1.weightage_tier !== 'CORE' || unit1.expected_questions_min !== 2 || unit1.expected_questions_max !== 4) bad.push(`unit fields ${JSON.stringify(unit1).slice(0, 200)}`);
        for (const t of unit1.topics) {
          const i = indep[t.topic_id];
          if (!i || t.published_questions !== i.qn || t.servable_documents !== i.dn) bad.push(`topic ${t.name}: rm q${t.published_questions}/d${t.servable_documents} vs q${i && i.qn}/d${i && i.dn}`);
        }
        if (unit1.topics.find((t) => t.topic_id === T1).weight !== 0.75) bad.push('weight not returned');
        if (indep[T1].dn < 1) bad.push('fixture document not servable by the independent rule');
        const u2 = rm.nodes.find((n) => n.id === d.u2);
        if (u2.expected_questions_min !== null || u2.weightage_tier !== null) bad.push('unset fields must stay null (no fabricated values)');
        const sumQ = [T1, T2, T3].reduce((a, id) => a + indep[id].qn, 0);
        const sumD = [T1, T2, T3].reduce((a, id) => a + indep[id].dn, 0);
        if (sec.counts.topics !== 3 || sec.counts.published_questions !== sumQ || sec.counts.servable_documents !== sumD) bad.push(`section subtree counts ${JSON.stringify(sec.counts)} vs q${sumQ} d${sumD}`);
        if (rm.totals.topics !== 3 || rm.totals.published_questions !== sumQ || rm.totals.nodes !== 3) bad.push(`totals ${JSON.stringify(rm.totals)}`);
        if (sec.kind !== 'SECTION' || sec.depth !== 1 || unit1.depth !== 2 || unit1.parent_id !== d.sec) bad.push('tree shape');
        assert(bad.length === 0, bad.join('\n        '));
        return `topics q=${sumQ} docs=${sumD} match independent queries`;
      }));

    // GAP2-4A-SCOPE (architect 2026-10-28; amends GATE-HYGIENE-1, which amended the original "real exams hold only
    // DRAFTs"): the owner publishes / archives real syllabus drafts during intake, so the draft-shape contract is now
    // asserted on the suite's own QA fixture; the seeded GD / CGL shapes only while they are DRAFTs; the real-data
    // invariants (≤ 1 PUBLISHED per exam + cycle, QA exam never PUBLISHED) are unchanged. G-13 holds the negative controls.
    await test('G-11 draft shape on the QA fixture (exact, valid, deterministic); seeds re-run no-op in any status; seed shapes only while DRAFT; ≤ 1 PUBLISHED per exam + cycle', async () => tx(() => g11()));

    await test('G-13 negative controls (rolled back): a broken fixture shape FAILS G-11; a PUBLISHED QA version FAILS; the owner publishing / archiving a seeded draft PASSES', async () =>
      tx(async () => {
        const out = [];
        const mustFail = async (label, opts, re) => {
          const r = await attempt(() => g11(opts));
          assert(!r.ok && re.test(r.message), `${label}: G-11 did not fail as expected (${r.ok ? 'passed' : r.message.slice(0, 200)})`);
          out.push(`${label} FAILS`);
        };
        const firstSection = async (v) => (await one(`SELECT id FROM public.exam_syllabus_nodes WHERE syllabus_version_id = $1 AND node_kind = 'SECTION' ORDER BY display_order LIMIT 1`, [v])).id;
        const unitNamed = async (v, t) => (await one(`SELECT id FROM public.exam_syllabus_nodes WHERE syllabus_version_id = $1 AND raw_title = $2`, [v, t])).id;
        await mustFail('stray unit', { afterBuild: async (v) => rpc('staff', 'fn_syllabus_upsert_node', [v, { kind: 'UNIT', title: 'Stray unit', parent_id: await firstSection(v) }]) }, /fixture shape: unexpected UNIT Stray unit/);
        await mustFail('mapping dropped', { afterBuild: async (v) => rpc('staff', 'fn_syllabus_set_unit_mappings', [await unitNamed(v, 'Fixture unit A1'), [T1], null]) }, /fixture shape: missing UNIT Fixture unit A1/);
        await mustFail('unit deleted', { afterBuild: async (v) => rpc('staff', 'fn_syllabus_delete_node', [await unitNamed(v, 'Fixture unit B1')]) }, /fixture shape: missing UNIT Fixture unit B1/);
        const qaPub = await attempt(async () => {
          const d = await buildValidDraft(QA);
          await rpc('admin', 'fn_syllabus_publish', [d.version]);
          return g11();
        });
        assert(!qaPub.ok && /the QA test exam has 1 PUBLISHED/.test(qaPub.message), `QA version left PUBLISHED: ${qaPub.ok ? 'passed' : qaPub.message.slice(0, 200)}`);
        out.push('QA version left PUBLISHED FAILS');

        // the owner's legitimate change: publish (then archive) the seeded GD draft → G-11 still passes
        const gd = await one(`SELECT v.id, v.status FROM public.exam_syllabus_versions v JOIN public.exams e ON e.id = v.exam_id WHERE e.slug = 'ssc-gd' AND v.version_tag = 'legacy-official-2026'`);
        if (gd && gd.status === 'DRAFT') {
          const p = await rpc('admin', 'fn_syllabus_publish', [gd.id]);
          assert(p.success, `publishing the GD seed: ${JSON.stringify(p).slice(0, 200)}`);
          const r1 = await attempt(() => g11());
          assert(r1.ok, `G-11 failed after the owner published the GD seed: ${r1.message}`);
          await rpc('admin', 'fn_syllabus_archive_version', [gd.id]);
          const r2 = await attempt(() => g11());
          assert(r2.ok, `G-11 failed after the owner archived the GD seed: ${r2.message}`);
          out.push('GD seed published PASSES', 'GD seed archived PASSES');
        } else {
          const r = await attempt(() => g11());
          assert(r.ok, r.message);
          out.push(`GD seed already ${gd ? gd.status : 'absent'} PASSES`);
        }
        return out.join(' · ');
      }));

    await test('G-12 legacy tables preserved in schema retired (GAP2-4c, 084); reconciliation workbench removed', async () => {
      await safeBegin(c, { readOnly: true });
      try {
        const r = await one(`SELECT (SELECT count(*)::int FROM retired.exam_syllabi) s, (SELECT count(*)::int FROM retired.exam_topics) t,
                                    (SELECT count(*)::int FROM retired.exam_unit_mappings) u, (SELECT count(*)::int FROM retired.taxonomy_aliases) a,
                                    (SELECT count(*)::int FROM pg_class WHERE relnamespace = 'public'::regnamespace
                                      AND relname IN ('exam_syllabi','exam_topics','exam_unit_mappings','taxonomy_aliases')) pub`);
        assert(r.s === 1 && r.t === 18 && r.u === 0 && r.a === 0 && r.pub === 0, JSON.stringify(r));
      } finally {
        await c.query('ROLLBACK');
      }
      for (const f of ['services/operational-syllabus-reconciliation.service.ts', 'services/exam-syllabus-resolution.service.ts', 'app/api/admin/syllabus-reconciliation']) {
        assert(!fs.existsSync(path.join(__dirname, '..', f)), `${f} still present`);
      }
      return 'retired: exam_syllabi 1, exam_topics 18, exam_unit_mappings 0, taxonomy_aliases 0; none in public; workbench gone';
    });
  } finally {
    await c.end();
  }
  console.log(`\nGAP2-4a syllabus: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('SUITE ERROR', String(e && e.message).replace(/postgres(ql)?:\/\/\S+/g, '[url]').slice(0, 300));
  process.exit(1);
});
