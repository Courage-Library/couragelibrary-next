#!/usr/bin/env node
/**
 * CA1-TAXONOMY (CA-1, migration 115) — master tree rules AS THE REAL ROLES, every write inside a rolled-back
 * transaction (LIVE-LOCK-SAFETY via withLiveTransaction: lock 3s / statement 60s / idle 30s; one small object group per
 * chunk). service_role for every taxonomy write and RPC; anon, the QA student and the QA staff (aal2) for reads and
 * denials. QA nodes carry metadata.source = CA1_SMOKE and never survive a chunk.
 *   --pre   the migration is NOT applied yet: each chunk first runs the migration file inside its own transaction
 *           (then rolls everything back) — the pre-apply chunked smoke. Refuses if 115 is already in the ledger.
 *   (none)  the live gate after apply: refuses unless 115 is APPLIED.
 * Chunks: A grants / RLS / structure · B normalization = lib/taxonomy/normalize.ts · C tree rules (4 levels, per-parent
 * slugs, subject type / state code, sibling names) · D aliases · E move · F merge (re-point, fail-closed) · Z nothing left.
 * Run: node scripts/live/test_ca1_taxonomy.cjs [--pre]
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const FILE = '20261027000115_ca1_master_tree.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');

// the shared TS normalizer (transpiled in-process; no app imports)
const normMod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync(path.join(ROOT, 'lib/taxonomy/normalize.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(normMod, normMod.exports);
const { normalizeTaxonomyName, NORMALIZE_VECTORS } = normMod.exports;

let ok = true;
// results are buffered per chunk: a chunk re-run after a dropped connection reports once (assertions are never retried)
let pending = [];
const chk = (n, cond, info) => { pending.push({ cond, line: `${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}` }); };
const flush = () => { for (const r of pending) { if (!r.cond) ok = false; console.log(r.line); } pending = []; };
/** A connection-level failure (network / pooler), not a test result. */
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED'].includes(e.code)
  || /Connection terminated|connection error|not queryable/i.test(String(e.message)));
const ZERO = '00000000-0000-0000-0000-000000000000';

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  let c = new Client(target.pg); c.on('error', () => {}); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  try {
    const [led] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE]);
    if (PRE && led.n > 0) throw new Error(`--pre refused: ${FILE} is already APPLIED`);
    if (!PRE && led.n === 0) throw new Error(`${FILE} is not applied (use --pre for the pre-apply smoke)`);

    const ids = {};
    for (const [k, e] of [['staff', 'qa-staff@courage-library.test'], ['student', 'qa-student@courage-library.test']]) ids[k] = (await q(`select id from auth.users where email = $1`, [e]))[0]?.id;
    if (!ids.staff || !ids.student) throw new Error('QA staff / student users missing');
    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 160) }; }
    };
    const SVC = { role: 'service_role' };
    const STU = { sub: ids.student, role: 'authenticated', aal: 'aal1', app_metadata: {} };
    const STAFF = { sub: ids.staff, role: 'authenticated', aal: 'aal2', app_metadata: { role: 'staff' } };
    const svc = (sql, p) => as('service_role', SVC, sql, p);
    const rule = (r, re) => !r.ok && (re ? re.test(r.msg) : /TAXONOMY_RULE/.test(r.msg));
    const ACTOR = [null, 'ca1-smoke@courage-library.test'];
    const mk = async (parent, type, name, slug, x = {}) => {
      const r = await svc(`insert into public.canonical_taxonomy_nodes (parent_id, node_type, name, slug, name_hi, subject_type, state_code, metadata)
                           values ($1, $2, $3, $4, $5, $6, $7, '{"source":"CA1_SMOKE"}') returning id, node_depth, hierarchy_path`,
        [parent, type, name, slug, x.name_hi ?? null, x.subject_type ?? null, x.state_code ?? null]);
      return r.ok ? { ok: true, ...r.rows[0] } : r;
    };
    const node = async (id) => (await q(`select * from public.canonical_taxonomy_nodes where id = $1`, [id]))[0];
    const addAlias = async (nodeId, alias, lang = 'en') => {
      const r = await svc(`select public.fn_taxonomy_add_alias($1, $2, $3, 'OWNER', $4, $5) id`, [nodeId, alias, lang, ...ACTOR]);
      return r.ok ? { ok: true, id: r.rows[0].id } : r;
    };
    // one connection per chunk: a dropped pooled connection fails that chunk only (and the server rolls it back)
    // A dropped connection re-runs the WHOLE chunk once on a fresh connection (the server rolled the first try back);
    // a second drop aborts the run.
    const chunk = async (fn) => {
      for (let attempt = 1; ; attempt++) {
        pending = [];
        try {
          await c.end().catch(() => {});
          c = new Client(target.pg); c.on('error', () => {}); await c.connect();
          await withLiveTransaction(c, async () => { if (PRE) await c.query(MIGRATION_SQL); await fn(); });
          flush();
          return;
        } catch (e) {
          if (attempt === 1 && isConnectionError(e)) {
            console.log(`RETRY chunk after a dropped connection (${e.code || 'terminated'}) — partial results discarded`);
            continue;
          }
          throw e;
        }
      }
    };

    // ---------------- A: grants / RLS / structure
    await chunk(async () => {
      const [s] = await q(`select
          (select count(*)::int from information_schema.columns where table_schema='public' and table_name='canonical_taxonomy_nodes' and column_name in ('name_hi','subject_type','state_code')) cols,
          (select count(*)::int from pg_constraint where conrelid='public.canonical_taxonomy_nodes'::regclass and conname in ('chk_canonical_name_hi','chk_canonical_subject_type','chk_canonical_state_code')) chks,
          (select count(*)::int from pg_trigger where tgrelid='public.canonical_taxonomy_nodes'::regclass and tgname='trg_guard_master_tree') trg,
          (select indisunique from pg_index where indexrelid = to_regclass('public.uq_canonical_hierarchy_path')) path_unique,
          (select string_agg(conname, ',' order by conname) from pg_constraint where conrelid in ('public.topics'::regclass,'public.subtopics'::regclass) and contype='u') proj_uniques,
          (select relrowsecurity from pg_class where oid='public.taxonomy_node_aliases'::regclass) rls`);
      chk('A-1 structure: 3 new columns + checks, trg_guard_master_tree, unique hierarchy_path, aliases RLS on; projection slugs unique PER PARENT (global slug keys gone)',
        s.cols === 3 && s.chks === 3 && s.trg === 1 && s.path_unique === true && s.rls === true
        && s.proj_uniques === 'uq_subtopics_topic_name,uq_subtopics_topic_slug,uq_topics_subject_name,uq_topics_subject_slug', JSON.stringify(s));

      const calls = [
        `select public.fn_taxonomy_normalize('x')`,
        `select public.fn_taxonomy_add_alias('${ZERO}', 'x', 'en', 'OWNER', null, 'x@example.test')`,
        `select public.fn_taxonomy_remove_alias('${ZERO}', null, 'x@example.test')`,
        `select public.fn_taxonomy_move_node('${ZERO}', '${ZERO}', null, 'x@example.test', null)`,
        `select public.fn_taxonomy_merge_nodes('${ZERO}', '${ZERO}', null, 'x@example.test', 'reason')`,
        `select public.fn_taxonomy_scope_conflict(null, 'x', null)`,
      ];
      const denials = [];
      for (const [role, cl] of [['anon', { role: 'anon' }], ['authenticated', STU], ['authenticated', STAFF]]) {
        for (const sql of calls) { const r = await as(role, cl, sql); if (r.ok || r.code !== '42501') denials.push(`${cl.app_metadata?.role || role}: ${sql.slice(14, 50)} → ${r.ok ? 'ALLOWED' : r.code}`); }
      }
      chk('A-2 anon / student / staff: no EXECUTE on normalize / alias / move / merge / scope helpers (42501)', denials.length === 0, denials.join(' | '));

      const S = await mk(null, 'SUBJECT', 'CA1 QA Grants', 'ca1-qa-grants');
      const al = S.ok ? await addAlias(S.id, 'CA1 grants alias') : S;
      const anonSel = await as('anon', { role: 'anon' }, `select count(*)::int n from public.taxonomy_node_aliases`);
      const stuSel = await as('authenticated', STU, `select count(*)::int n from public.taxonomy_node_aliases`);
      const staffSel = await as('authenticated', STAFF, `select count(*)::int n from public.taxonomy_node_aliases where id = $1`, [al.id]);
      const stuIns = await as('authenticated', STU, `insert into public.taxonomy_node_aliases (node_id, alias, normalized_alias) values ($1, 'x', 'x')`, [S.id]);
      const staffIns = await as('authenticated', STAFF, `insert into public.taxonomy_node_aliases (node_id, alias, normalized_alias) values ($1, 'y', 'y')`, [S.id]);
      chk('A-3 aliases: anon no read (42501); student reads 0 rows (RLS); staff (aal2) reads them; student / staff cannot write (42501)',
        al.ok && !anonSel.ok && anonSel.code === '42501' && stuSel.ok && stuSel.rows[0].n === 0 && staffSel.ok && staffSel.rows[0].n === 1
        && stuIns.code === '42501' && staffIns.code === '42501', JSON.stringify({ al, anonSel, stuSel, staffSel, stuIns: stuIns.code, staffIns: staffIns.code }));

      const [f] = await q(`select count(*)::int n, count(*) filter (where prosecdef)::int secdef,
          count(*) filter (where proconfig::text like '%search_path=%')::int pinned
        from pg_proc where pronamespace = 'public'::regnamespace and proname in ('fn_taxonomy_normalize','fn_taxonomy_lock_scope','fn_taxonomy_scope_conflict',
          'fn_guard_master_tree','fn_guard_taxonomy_node_alias','fn_taxonomy_audit','fn_taxonomy_add_alias','fn_taxonomy_remove_alias',
          'fn_taxonomy_subtree_ids','fn_taxonomy_move_node','fn_taxonomy_merge_nodes')`);
      chk('A-4 the 11 new functions: none SECURITY DEFINER (SECDEF ratchet unchanged); all pin search_path', f.n === 11 && f.secdef === 0 && f.pinned === 11, JSON.stringify(f));
    });

    // ---------------- B: normalization parity (SQL = TS)
    await chunk(async () => {
      const bad = [];
      for (const v of NORMALIZE_VECTORS) {
        const r = await svc(`select public.fn_taxonomy_normalize($1) n`, [v]);
        const expect = normalizeTaxonomyName(v);
        if (!r.ok || r.rows[0].n !== expect) bad.push(`${JSON.stringify(v)}: sql=${JSON.stringify(r.ok ? r.rows[0].n : r.msg)} ts=${JSON.stringify(expect)}`);
      }
      chk(`B-1 fn_taxonomy_normalize = normalizeTaxonomyName for all ${NORMALIZE_VECTORS.length} vectors (NFKC, case, &, punctuation, whitespace, Hindi)`, bad.length === 0, bad.join(' | '));
      const spot = normalizeTaxonomyName('  Time, Speed & Distance ') === 'time speed and distance' && normalizeTaxonomyName('लाभ और हानि।') === 'लाभ और हानि';
      chk('B-2 spot values: "Time, Speed & Distance" → "time speed and distance"; danda folded', spot);
    });

    // ---------------- C: tree rules
    await chunk(async () => {
      const [realSlug] = await q(`select slug from public.topics order by slug limit 1`);
      const S = await mk(null, 'SUBJECT', 'CA1 QA Subject', 'ca1-qa-subject', { subject_type: 'APTITUDE' });
      const S2 = await mk(null, 'SUBJECT', 'CA1 QA Subject Two', 'ca1-qa-subject-two');
      const T = await mk(S.id, 'TOPIC', 'Percentage Smoke', realSlug.slug, { name_hi: 'प्रतिशत स्मोक' });
      const ST = await mk(T.id, 'SUBTOPIC', 'Basics', 'basics');
      const CO = await mk(ST.id, 'CONCEPT', 'Net change', 'net-change');
      chk('C-1 SUBJECT > TOPIC > SUBTOPIC > CONCEPT = depths 1-4 with the dotted path', S.ok && T.ok && ST.ok && CO.ok && CO.node_depth === 4 && CO.hierarchy_path === `ca1-qa-subject.${realSlug.slug}.basics.net-change`, JSON.stringify({ S, T, ST, CO }));
      const deep = await mk(CO.id, 'CONCEPT', 'Too deep', 'too-deep');
      const topicUnderTopic = await mk(T.id, 'TOPIC', 'Nested topic', 'nested-topic');
      const conceptUnderTopic = await mk(T.id, 'CONCEPT', 'Loose concept', 'loose-concept');
      const domain = await mk(S.id, 'DOMAIN', 'A domain', 'a-domain');
      const method = await mk(ST.id, 'METHOD', 'A method', 'a-method');
      chk('C-2 refused: a 5th level, TOPIC under TOPIC, CONCEPT under TOPIC, new DOMAIN / METHOD nodes',
        rule(deep) && rule(topicUnderTopic) && rule(conceptUnderTopic) && rule(domain, /not used in the master tree/) && rule(method, /not used in the master tree/),
        JSON.stringify({ deep, topicUnderTopic, conceptUnderTopic, domain, method }));
      const [proj] = await q(`select count(*)::int n from public.topics where slug = $1`, [realSlug.slug]);
      const dupSibling = await mk(S.id, 'TOPIC', 'Other name', realSlug.slug);
      const T2 = await mk(S2.id, 'TOPIC', 'Percentage Smoke', realSlug.slug);
      const ST2 = await mk(T2.id, 'SUBTOPIC', 'Basics', 'basics');
      chk('C-3 per-parent slugs: an existing topic slug is reused under a new subject (projection row written: 2+ topics share it); a sibling duplicate is refused; the same subtopic slug lives under two topics',
        proj.n >= 2 && !dupSibling.ok && dupSibling.code === '23505' && T2.ok && ST2.ok, JSON.stringify({ proj, dupSibling, T2, ST2 }));
      const typeOnTopic = await svc(`update public.canonical_taxonomy_nodes set subject_type = 'APTITUDE' where id = $1`, [T.id]);
      const badType = await svc(`update public.canonical_taxonomy_nodes set subject_type = 'SPORTS' where id = $1`, [S.id]);
      const stateOnApt = await svc(`update public.canonical_taxonomy_nodes set state_code = 'UP' where id = $1`, [T.id]);
      const S3 = await mk(null, 'SUBJECT', 'CA1 QA State GK', 'ca1-qa-state-gk', { subject_type: 'STATE_SPECIFIC' });
      const UP = await mk(S3.id, 'TOPIC', 'Uttar Pradesh', 'uttar-pradesh', { state_code: 'UP' });
      const badCode = await mk(S3.id, 'TOPIC', 'Bad code', 'bad-code', { state_code: 'Up1' });
      const flip = await svc(`update public.canonical_taxonomy_nodes set subject_type = 'GK_GA' where id = $1`, [S3.id]);
      chk('C-4 subject_type only on SUBJECT and only from the list; state codes only inside a STATE_SPECIFIC subject (format AA); the subject type cannot change under state codes',
        typeOnTopic.code === '23514' && badType.code === '23514' && rule(stateOnApt, /STATE_SPECIFIC/) && S3.ok && UP.ok && badCode.code === '23514' && rule(flip, /state codes/),
        JSON.stringify({ typeOnTopic: typeOnTopic.code, badType: badType.code, stateOnApt, S3, UP, badCode: badCode.code, flip }));
      const sameName = await mk(S.id, 'TOPIC', 'percentage   SMOKE!', 'percentage-smoke-2');
      const sameHindi = await mk(S.id, 'TOPIC', 'प्रतिशत स्मोक', 'pratishat');
      const off = await svc(`update public.canonical_taxonomy_nodes set is_active = false where id = $1`, [T.id]);
      // the projection keeps EXACT names unique per subject even when inactive (uq_topics_subject_name), so reuse a normalized-equal name
      const reuse = await mk(S.id, 'TOPIC', 'percentage smoke', 'percentage-smoke-3');
      const back = await svc(`update public.canonical_taxonomy_nodes set is_active = true where id = $1`, [T.id]);
      chk('C-5 names unique (normalized, EN + HI) among ACTIVE siblings: duplicates refused; a deactivated name is free (normalized); reactivating into a clash is refused',
        rule(sameName) && rule(sameHindi) && off.ok && reuse.ok && rule(back), JSON.stringify({ sameName, sameHindi, off, reuse, back }));
    });

    // ---------------- D: aliases
    await chunk(async () => {
      const S = await mk(null, 'SUBJECT', 'CA1 QA Alias', 'ca1-qa-alias');
      const S2 = await mk(null, 'SUBJECT', 'CA1 QA Alias Two', 'ca1-qa-alias-two');
      const T = await mk(S.id, 'TOPIC', 'Percentage Alias', 'percentage-alias');
      const T2 = await mk(S.id, 'TOPIC', 'Ratio Alias', 'ratio-alias');
      const T3 = await mk(S2.id, 'TOPIC', 'Elsewhere', 'elsewhere');
      const a1 = await addAlias(T.id, '  Percent!  ');
      const [row] = a1.ok ? await q(`select alias, normalized_alias, language, source from public.taxonomy_node_aliases where id = $1`, [a1.id]) : [null];
      const [au] = await q(`select count(*)::int n from public.admin_audit_logs where action_type = 'TAXONOMY_ALIAS_ADD' and target_id = $1`, [T.id]);
      chk('D-1 add alias via RPC: trimmed, normalized ("percent"), source OWNER, audited in the same transaction',
        a1.ok && row && row.alias === 'Percent!' && row.normalized_alias === 'percent' && row.source === 'OWNER' && au.n === 1, JSON.stringify({ a1, row, au }));
      const own = await addAlias(T.id, 'PERCENTAGE alias');
      const dup = await addAlias(T.id, 'percent');
      const sibName = await addAlias(T.id, 'ratio-alias');
      const sibAlias = await addAlias(T2.id, 'Percent');
      const other = await addAlias(T3.id, 'Percent');
      chk('D-2 refused: alias = own name, a duplicate on the node, a sibling name, a sibling alias; allowed: the same alias in another scope',
        rule(own, /own name/) && rule(dup, /already has/) && rule(sibName) && rule(sibAlias) && other.ok, JSON.stringify({ own, dup, sibName, sibAlias, other }));
      const ren = await svc(`update public.canonical_taxonomy_nodes set name = 'PERCENT' where id = $1`, [T2.id]);
      const hi = await addAlias(T.id, 'प्रतिशतता', 'hi');
      const fr = await addAlias(T.id, 'pourcentage', 'fr');
      const blank = await addAlias(T.id, ' ... ');
      chk('D-3 renaming a sibling onto an alias is refused; a Hindi alias is stored; language other than en / hi and an alias without letters are refused',
        rule(ren) && hi.ok && fr.code === '23514' && rule(blank, /letters or digits/), JSON.stringify({ ren, hi, fr: fr.code, blank }));
      const rm = await svc(`select public.fn_taxonomy_remove_alias($1, $2, $3)`, [a1.id, ...ACTOR]);
      const [after] = await q(`select (select count(*)::int from public.taxonomy_node_aliases where id = $1) n,
        (select count(*)::int from public.admin_audit_logs where action_type = 'TAXONOMY_ALIAS_REMOVE' and target_id = $2) au`, [a1.id, T.id]);
      const noActor = await svc(`select public.fn_taxonomy_add_alias($1, 'x alias', 'en', 'OWNER', null, '')`, [T.id]);
      chk('D-4 remove alias via RPC (audited); an RPC without an actor is refused', rm.ok && after.n === 0 && after.au === 1 && rule(noActor, /actor/), JSON.stringify({ rm, after, noActor }));
    });

    // ---------------- E: move (same level only)
    await chunk(async () => {
      const S = await mk(null, 'SUBJECT', 'CA1 QA Move', 'ca1-qa-move');
      const S2 = await mk(null, 'SUBJECT', 'CA1 QA Move Two', 'ca1-qa-move-two');
      const T1 = await mk(S.id, 'TOPIC', 'Move One', 'move-one');
      const T2 = await mk(S.id, 'TOPIC', 'Move Two', 'move-two');
      const ST = await mk(T1.id, 'SUBTOPIC', 'Basics', 'basics');
      const CO = await mk(ST.id, 'CONCEPT', 'Leaf', 'leaf');
      const mv = await svc(`select public.fn_taxonomy_move_node($1, $2, $3, $4, 'smoke move') r`, [ST.id, T2.id, ...ACTOR]);
      const [st, co] = [await node(ST.id), await node(CO.id)];
      const [pj] = await q(`select topic_id from public.subtopics where id = $1`, [ST.id]);
      const [au] = await q(`select count(*)::int n from public.admin_audit_logs where action_type = 'TAXONOMY_NODE_MOVE' and target_id = $1`, [ST.id]);
      chk('E-1 move SUBTOPIC to another TOPIC: path + descendants re-derived, projection follows, audited',
        mv.ok && st.parent_id === T2.id && st.hierarchy_path === 'ca1-qa-move.move-two.basics' && co.hierarchy_path === 'ca1-qa-move.move-two.basics.leaf' && pj.topic_id === T2.id && au.n === 1,
        JSON.stringify({ mv, path: st?.hierarchy_path, co: co?.hierarchy_path, pj, au }));
      const lvl = await svc(`select public.fn_taxonomy_move_node($1, $2, $3, $4)`, [ST.id, S.id, ...ACTOR]);
      const subj = await svc(`select public.fn_taxonomy_move_node($1, $2, $3, $4)`, [S.id, S2.id, ...ACTOR]);
      const same = await svc(`select public.fn_taxonomy_move_node($1, $2, $3, $4)`, [ST.id, T2.id, ...ACTOR]);
      const ST2 = await mk(T1.id, 'SUBTOPIC', 'Basics again', 'basics');
      const clash = await svc(`select public.fn_taxonomy_move_node($1, $2, $3, $4)`, [ST2.id, T2.id, ...ACTOR]);
      chk('E-2 refused: a different level, moving a subject, the same parent, a slug clash under the new parent',
        rule(lvl, /same level/) && rule(subj, /subject cannot be moved/) && rule(same) && rule(clash, /slug/), JSON.stringify({ lvl, subj, same, clash }));
      const cross = await svc(`select public.fn_taxonomy_move_node($1, $2, $3, $4) r`, [T1.id, S2.id, ...ACTOR]);
      const [tp] = await q(`select subject_id from public.topics where id = $1`, [T1.id]);
      const t1 = await node(T1.id);
      chk('E-3 an unreferenced topic moves to another subject: root + path + projection subject follow',
        cross.ok && tp.subject_id === S2.id && t1.root_subject_id === S2.id && t1.hierarchy_path === 'ca1-qa-move-two.move-one', JSON.stringify({ cross, tp, path: t1?.hierarchy_path }));
      const [real] = await q(`select v.topic_id id, n.root_subject_id s from public.user_mistake_vault v join public.canonical_taxonomy_nodes n on n.id = v.topic_id group by 1, 2 order by count(*) desc limit 1`);
      const [otherSubj] = await q(`select id from public.canonical_taxonomy_nodes where node_type = 'SUBJECT' and id <> $1 and coalesce(metadata->>'source','') <> 'CA1_SMOKE' order by id limit 1`, [real.s]);
      const blocked = await svc(`select public.fn_taxonomy_move_node($1, $2, $3, $4)`, [real.id, otherSubj.id, ...ACTOR]);
      const realAfter = await node(real.id);
      const N = await mk(S2.id, 'TOPIC', 'Name Clash', 'name-clash');
      const M = await mk(S.id, 'TOPIC', 'name clash!', 'name-clash-src');
      const nameClash = await svc(`select public.fn_taxonomy_move_node($1, $2, $3, $4)`, [M.id, S2.id, ...ACTOR]);
      chk('E-4 fail-closed: a real topic with Mistake Vault rows (subject stored beside it) cannot change subject — unchanged; a name clash in the new scope is refused',
        rule(blocked, /blocked/) && realAfter.root_subject_id === real.s && N.ok && rule(nameClash), JSON.stringify({ blocked, nameClash }));
    });

    // ---------------- F: merge (owner only, fail-closed)
    await chunk(async () => {
      const S = await mk(null, 'SUBJECT', 'CA1 QA Merge', 'ca1-qa-merge');
      const A = await mk(S.id, 'TOPIC', 'Alpha Topic', 'alpha-topic', { name_hi: 'अल्फा विषय' });
      const B = await mk(S.id, 'TOPIC', 'Beta Topic', 'beta-topic');
      const AS = await mk(A.id, 'SUBTOPIC', 'Alpha Sub', 'a-sub');
      const aA = await addAlias(A.id, 'Alpha');
      const aB = await addAlias(B.id, 'Bee');
      const qs = await q(`select id from public.questions where canonical_topic_id is not null order by id limit 3`);
      await q(`update public.questions set canonical_topic_id = $1 where id = any($2::uuid[])`, [A.id, qs.map((r) => r.id)]);
      const m = await svc(`select public.fn_taxonomy_merge_nodes($1, $2, $3, $4, 'CA-1 smoke merge') r`, [A.id, B.id, ...ACTOR]);
      const res = m.ok ? m.rows[0].r : null;
      const a = await node(A.id);
      const as2 = await node(AS.id);
      const aliases = (await q(`select alias, language from public.taxonomy_node_aliases where node_id = $1`, [B.id])).map((r) => `${r.alias}/${r.language}`).sort().join(',');
      const [cnt] = await q(`select (select count(*)::int from public.questions where canonical_topic_id = $1) at_a, (select count(*)::int from public.questions where canonical_topic_id = $2 and id = any($3::uuid[])) at_b,
          (select is_active from public.topics where id = $1) proj_a, (select topic_id from public.subtopics where id = $4) proj_sub,
          (select count(*)::int from public.admin_audit_logs where action_type = 'TAXONOMY_NODE_MERGE' and target_id = $1::text) au`, [A.id, B.id, qs.map((r) => r.id), AS.id]);
      // every app FK into the tree: nothing references the source any more
      const fks = await q(`select c.conrelid::regclass::text t, a.attname col from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
          where c.contype = 'f' and c.confrelid = 'public.canonical_taxonomy_nodes'::regclass and cl.relnamespace = 'public'::regnamespace and c.conrelid <> 'public.canonical_taxonomy_nodes'::regclass`);
      let left = 0;
      for (const f of fks) left += (await q(`select count(*)::int n from ${f.t} where ${JSON.stringify(f.col)} = $1`, [A.id]))[0].n;
      chk('F-1 merge A → B: children move, every app reference is re-pointed (3 questions; 0 references to A left), A inactive + merged_into, A\'s names + aliases become B\'s aliases (EN + HI), projection follows, audited',
        aA.ok && aB.ok && m.ok && res.children_moved === 1 && res.repointed['questions.canonical_topic_id'] === 3 && left === 0 && a.is_active === false && a.metadata.merged_into === B.id
        && as2.parent_id === B.id && aliases === ['Alpha/en', 'Alpha Topic/en', 'Bee/en', 'अल्फा विषय/hi'].sort().join(',') && cnt.at_a === 0 && cnt.at_b === 3 && cnt.proj_a === false && cnt.proj_sub === B.id && cnt.au === 1,
        JSON.stringify({ m, left, aliases, cnt }));

      const [locked] = await q(`select m.canonical_node_id id, n.root_subject_id s from public.exam_syllabus_canonical_mappings m join public.exam_syllabus_nodes sn on sn.id = m.syllabus_node_id
          join public.exam_syllabus_versions v on v.id = sn.syllabus_version_id join public.canonical_taxonomy_nodes n on n.id = m.canonical_node_id
          where v.status <> 'DRAFT' and n.node_type = 'TOPIC' order by 1 limit 1`);
      const L = await mk(locked.s, 'TOPIC', 'CA1 QA Merge Target', 'ca1-qa-merge-target');
      const lockedMerge = await svc(`select public.fn_taxonomy_merge_nodes($1, $2, $3, $4, 'CA-1 smoke locked')`, [locked.id, L.id, ...ACTOR]);
      const lockedAfter = await node(locked.id);
      chk('F-2 fail-closed: a real topic mapped in a published / archived syllabus cannot merge (SYLLABUS_IMMUTABLE) — still active, nothing changed',
        !lockedMerge.ok && /SYLLABUS_IMMUTABLE/.test(lockedMerge.msg) && lockedAfter.is_active === true && !lockedAfter.metadata?.merged_into, JSON.stringify({ lockedMerge }));

      const C = await mk(S.id, 'TOPIC', 'Gamma Topic', 'gamma-topic');
      const D = await mk(S.id, 'TOPIC', 'Delta Topic', 'delta-topic');
      await q(`insert into public.user_topic_mastery (user_id, canonical_topic_id) values ($1, $2), ($1, $3)`, [ids.student, C.id, D.id]);
      const uniq = await svc(`select public.fn_taxonomy_merge_nodes($1, $2, $3, $4, 'CA-1 smoke unique')`, [C.id, D.id, ...ACTOR]);
      const cAfter = await node(C.id);
      chk('F-3 fail-closed: a unique key holding rows for both nodes (user_topic_mastery) blocks the merge — source still active', rule(uniq, /holds rows for both/) && cAfter.is_active === true, JSON.stringify({ uniq }));

      const S2 = await mk(null, 'SUBJECT', 'CA1 QA Merge Two', 'ca1-qa-merge-two');
      const X = await mk(S2.id, 'TOPIC', 'Other Subject Topic', 'other-subject-topic');
      const E = await mk(S.id, 'TOPIC', 'Epsilon Topic', 'epsilon-topic');
      const F = await mk(S.id, 'TOPIC', 'Zeta Topic', 'zeta-topic');
      await mk(E.id, 'SUBTOPIC', 'Shared child', 'shared');
      await mk(F.id, 'SUBTOPIC', 'Shared child two', 'shared');
      const g = {
        type: await svc(`select public.fn_taxonomy_merge_nodes($1, $2, $3, $4, 'reason long')`, [C.id, S.id, ...ACTOR]),
        subject: await svc(`select public.fn_taxonomy_merge_nodes($1, $2, $3, $4, 'reason long')`, [C.id, X.id, ...ACTOR]),
        reason: await svc(`select public.fn_taxonomy_merge_nodes($1, $2, $3, $4, '  ')`, [C.id, D.id, ...ACTOR]),
        inactive: await svc(`select public.fn_taxonomy_merge_nodes($1, $2, $3, $4, 'reason long')`, [A.id, D.id, ...ACTOR]),
        self: await svc(`select public.fn_taxonomy_merge_nodes($1, $1, $2, $3, 'reason long')`, [C.id, ...ACTOR]),
        child: await svc(`select public.fn_taxonomy_merge_nodes($1, $2, $3, $4, 'reason long')`, [E.id, F.id, ...ACTOR]),
      };
      chk('F-4 refused: different levels, different subjects, no reason, an inactive source, the same node, clashing child slugs',
        rule(g.type, /same level/) && rule(g.subject, /one subject/) && rule(g.reason, /reason/) && rule(g.inactive, /active/) && rule(g.self) && rule(g.child, /children/), JSON.stringify(g));
    });

    // ---------------- Z: nothing left behind
    const [z] = await q(`select (select count(*)::int from public.canonical_taxonomy_nodes where metadata->>'source' = 'CA1_SMOKE') nodes,
        (select count(*)::int from public.admin_audit_logs where actor_email = 'ca1-smoke@courage-library.test') audit,
        to_regclass('public.taxonomy_node_aliases') is not null aliases_table`);
    chk(`Z-1 nothing persisted: 0 smoke nodes, 0 smoke audit rows${PRE ? ', the migration itself rolled back (no aliases table)' : ''}`,
      z.nodes === 0 && z.audit === 0 && z.aliases_table === !PRE, JSON.stringify(z));
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL CA1 smoke aborted — ${red(String(e.message)).slice(0, 200)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'CA1-TAXONOMY: ALL PASS' : 'CA1-TAXONOMY: FAILURES');
  process.exit(ok ? 0 : 1);
})();
