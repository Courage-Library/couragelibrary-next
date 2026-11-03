#!/usr/bin/env node
/**
 * COURSE-UX-1 phase B — offline gate (no network). Owner answers 2026-11-03.
 *   M-1 migrations 135–137: no BEGIN / COMMIT; preflights; 135 key (user_id, document_id) + merge; SECURITY DEFINER only
 *       on fn_lesson_quick_check_answer / fn_lesson_complete / fn_lesson_progress_save (search_path '', auth.uid(),
 *       anon revoked); the reading-minutes and award helpers are INVOKER with no client grant (award: not even
 *       service_role); no client write on the evidence tables; the generic award is not touched (stays frozen); lesson
 *       coins ship OFF (no COINS_LESSON_EARN row); policy 10 / +5 / cap 100 / Asia/Kolkata; one award per user + lesson
 *   M-2 rollbacks restore the exact previous bodies (135 → 122 progress RPC, 136 → 135, 137 → 136 completion)
 *   M-3 allow-list: +2 class A (authenticated) for the two new RPCs, max total / client / A raised by exactly 2 + rule
 *   R-1 reading time: the TS field list = the SQL jsonpath list; 200 wpm, at least 1 minute; feedback not counted;
 *       required = max(60 s, 40 % of the minutes)
 *   C-1 course structure (pure): every syllabus unit listed in syllabus order under its SECTION; a unit without a lesson
 *       is COMING_SOON with no lessons; lessons go to the first unit whose mapped node is the lesson node or an ancestor;
 *       counts only what exists; practice label: 0 → none, 3 → "Practice 3 questions", 25 → "Practice 10 questions";
 *       next skips locked lessons; continue = newest READING else first open; duplicate subject slugs made unique
 *   U-1 student UI: the browser never gets the quick-check key (no `correct` / feedback props on the client component;
 *       the server action checks); a coming-soon topic is not a link; course files carry no fake counts ("150+"),
 *       quotes, year labels or "Reference:" lines; actions use the session client for the RPCs (no service role, no
 *       user id from the caller); coin UI only behind COINS_LESSON_EARN; progress read without a language filter
 * --self-test: NEGATIVE CONTROLS — one mutation per rule must fail.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function loadTs(src, stubs = {}) {
  const ts = require('typescript');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', out)((id) => (id in stubs ? stubs[id] : id.startsWith('@/') ? {} : require(id)), mod, mod.exports);
  return mod.exports;
}

const F = {
  m135: 'supabase/migrations/20261103000135_course_progress_per_lesson.sql',
  m136: 'supabase/migrations/20261103000136_lesson_completion_evidence.sql',
  m137: 'supabase/migrations/20261103000137_lesson_coins_earn.sql',
  m122: 'supabase/migrations/20261028000122_ca7_launch_notes_internal.sql',
  rb135: 'docs/database/rollback/135_rollback.sql',
  rb136: 'docs/database/rollback/136_rollback.sql',
  rb137: 'docs/database/rollback/137_rollback.sql',
  allow: 'scripts/secdef/allowlist.json',
  rt: 'lib/lessons/reading-time.ts',
  qc: 'components/learning/lesson-quick-check.tsx',
  renderer: 'components/learning/lesson-blocks-renderer.tsx',
  courseUi: 'components/learning/course-ui.tsx',
  home: 'app/(site)/exams/[slug]/course/page.tsx',
  subject: 'app/(site)/exams/[slug]/course/[subject]/page.tsx',
  reader: 'components/learning/master-lesson-page.tsx',
  actions: 'app/(site)/learn/actions.tsx',
  complete: 'components/learning/lesson-complete.tsx',
  service: 'services/learning/course.service.ts',
  master: 'services/learning/master-lesson.service.ts',
  shell: 'components/shell/app-shell.tsx',
  wallet: 'app/(site)/wallet/page.tsx',
  header: 'components/shell/header-bar.tsx',
  balance: 'app/api/coins/balance/route.ts',
  structure: 'lib/learning/course-structure.ts',
};

const fnBody = (sql, name) => {
  const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  return i < 0 ? '' : sql.slice(i, sql.indexOf('$fn$;', i) + 5);
};

function check(over = {}) {
  const f = Object.fromEntries(Object.entries(F).map(([k, p]) => [k, k in over ? over[k] : read(p)]));
  const fails = [];
  const t = (id, cond, msg) => { if (!cond) fails.push(`${id}: ${msg}`); };
  const migs = [f.m135, f.m136, f.m137];

  // ---------------- M-1
  t('M-1a', migs.every((m) => !/^\s*(BEGIN|COMMIT)\s*;/im.test(m) && /DO \$pre\$/.test(m) && /DO \$proof\$/.test(m)), 'migrations: no BEGIN / COMMIT; a preflight and a proof each');
  t('M-1b', /ADD CONSTRAINT user_lesson_progress_pkey PRIMARY KEY \(user_id, document_id\);/.test(f.m135) && /ON CONFLICT \(user_id, document_id\) DO UPDATE/.test(fnBody(f.m135, 'fn_lesson_progress_save'))
    && /bool_or\(status = 'COMPLETED'\)/.test(f.m135) && /min\(started_at\)/.test(f.m135), '135: new key, merge (COMPLETED wins, earliest start), RPC on the new key');
  const secdef = (m) => [...m.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?\$fn\$/g)].filter((x) => /SECURITY DEFINER/.test(x[0])).map((x) => x[1]).sort();
  t('M-1c', JSON.stringify(secdef(f.m136)) === '["fn_lesson_complete","fn_lesson_progress_save","fn_lesson_quick_check_answer"]' && JSON.stringify(secdef(f.m137)) === '["fn_lesson_complete"]'
    && JSON.stringify(secdef(f.m135)) === '["fn_lesson_progress_save"]', `SECURITY DEFINER only on the reviewed RPCs (136 ${secdef(f.m136)}, 137 ${secdef(f.m137)})`);
  for (const [m, n] of [[f.m136, 'fn_lesson_quick_check_answer'], [f.m136, 'fn_lesson_complete'], [f.m136, 'fn_lesson_progress_save'], [f.m137, 'fn_lesson_complete']]) {
    const b = fnBody(m, n);
    t('M-1d', /SET search_path = ''/.test(b) && /:= auth\.uid\(\)/.test(b) && /USING ERRCODE = '42501'/.test(b), `${n}: search_path '', auth.uid(), 42501 when signed out`);
  }
  t('M-1e', /REVOKE ALL ON FUNCTION public\.fn_lesson_quick_check_answer\(uuid, text, text, text\) FROM PUBLIC, anon;/.test(f.m136) && /REVOKE ALL ON FUNCTION public\.fn_lesson_complete\(uuid, text\) FROM PUBLIC, anon;/.test(f.m136)
    && /REVOKE ALL ON FUNCTION public\.fn_lesson__reading_minutes\(jsonb\) FROM PUBLIC, anon, authenticated;/.test(f.m136) && !/SECURITY DEFINER/.test(fnBody(f.m136, 'fn_lesson__reading_minutes'))
    && /REVOKE ALL ON FUNCTION public\.fn_lesson__award_coins\(uuid, uuid, boolean\) FROM PUBLIC, anon, authenticated, service_role;/.test(f.m137) && !/SECURITY DEFINER/.test(fnBody(f.m137, 'fn_lesson__award_coins'))
    && !/GRANT EXECUTE ON FUNCTION public\.fn_lesson__award_coins/.test(f.m137), 'grants: RPCs not anon; helpers INVOKER, no client grant; the award helper not even service_role');
  const evGrants = [...f.m136.matchAll(/GRANT ([^;]*) ON TABLE public\.(lesson_reading_sessions|lesson_quick_check_attempts) TO ([^;]*);/g)].filter((g) => /anon|authenticated/.test(g[3])).map((g) => g[1].trim());
  t('M-1f', evGrants.length === 2 && evGrants.every((g) => g === 'SELECT') && f.m136.includes('FOR SELECT TO authenticated USING (user_id = auth.uid())')
    && /ENABLE ROW LEVEL SECURITY/.test(f.m136), 'evidence tables: RLS, own rows readable, no client write');
  const complete = fnBody(f.m137, 'fn_lesson_complete');
  t('M-1g', /'END'/.test(complete) && /'QUICK_CHECKS'/.test(complete) && /'TIME'/.test(complete) && /greatest\(60, ceil\(0\.4 \* v_minutes \* 60\)\)/.test(complete) && /FOR UPDATE/.test(complete)
    && /now\(\) - v_session\.started_at/.test(complete) && complete.indexOf('fn_lesson__award_coins') > complete.indexOf("SET status = 'COMPLETED'"), 'completion: end + checks + time max(60, 40 %), server clock, row lock, award after the transition');
  t('M-1h', !/FUNCTION public\.fn_award_gamification_reward\(/.test(f.m137.replace(/'public\.fn_award_gamification_reward\([^']*'/g, '')) && !/INSERT INTO public\.premium_system_configs/.test(f.m137)
    && /'LESSON_COMPLETED', 'LESSON_COMPLETED', 10, 5/.test(f.m137) && /"daily_coin_cap": 100/.test(f.m137) && /Asia\/Kolkata/.test(fnBody(f.m137, 'fn_lesson__award_coins'))
    && /'lesson_completed:' \|\| p_user_id::text \|\| ':' \|\| p_document_id::text/.test(f.m137) && /'ledger_' \|\| v_key/.test(f.m137) && /FOR UPDATE/.test(fnBody(f.m137, 'fn_lesson__award_coins'))
    && /config_key = 'COINS_LESSON_EARN'/.test(f.m137), 'coins: generic award untouched; ships OFF; 10 / +5 / cap 100 India day; one key per user + lesson; wallet lock; DB switch');

  // ---------------- M-2 rollbacks
  t('M-2', f.rb135.includes(fnBody(f.m122, 'fn_lesson_progress_save')) && /PRIMARY KEY \(user_id, document_id, language\)/.test(f.rb135)
    && f.rb136.includes(fnBody(f.m135, 'fn_lesson_progress_save')) && /DROP TABLE IF EXISTS public\.lesson_reading_sessions/.test(f.rb136)
    && f.rb137.includes(fnBody(f.m136, 'fn_lesson_complete')) && /DROP FUNCTION IF EXISTS public\.fn_lesson__award_coins/.test(f.rb137), 'rollbacks restore the exact previous bodies');

  // ---------------- M-3 allow-list
  const al = JSON.parse(f.allow);
  const e1 = al.functions && al.functions['fn_lesson_quick_check_answer(p_document_id uuid, p_language text, p_block_id text, p_option_id text)'];
  const e2 = al.functions && al.functions['fn_lesson_complete(p_document_id uuid, p_language text)'];
  t('M-3', e1 && e2 && e1.class === 'A' && e2.class === 'A' && JSON.stringify(e1.client) === '["authenticated"]' && JSON.stringify(e2.client) === '["authenticated"]'
    && al.max.total === 120 && al.max.client_executable_callable === 51 && al.max.A === 51 && al.rules.some((r) => /^COURSE-UX-1 .*raised by exactly 2/.test(r)), 'allow-list: +2 class A authenticated entries, max +2, rule');

  // ---------------- R-1 reading time
  const RT = (() => { try { return loadTs(f.rt); } catch { return null; } })();
  const sqlPaths = [...(f.m136.match(/ARRAY\[([\s\S]*?)\]::jsonpath\[\]/) || ['', ''])[1].matchAll(/'lax \$\[\*\]\.([^']+)'/g)].map((m) => m[1]);
  const tsPaths = [...(f.rt.match(/READING_FIELD_PATHS = \[([\s\S]*?)\] as const/) || ['', ''])[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  t('R-1a', sqlPaths.length > 10 && JSON.stringify(sqlPaths) === JSON.stringify(tsPaths) && !tsPaths.includes('options[*].feedback') && !tsPaths.includes('feedback'), `field lists equal and without feedback (sql ${sqlPaths.length}, ts ${tsPaths.length})`);
  if (RT && RT.readingMinutes) {
    const words = (n) => Array.from({ length: n }, () => 'w').join(' ');
    t('R-1b', RT.readingMinutes([{ id: 'a', type: 'paragraph', text: 'one two three' }]) === 1 && RT.readingMinutes([{ id: 'a', type: 'paragraph', text: words(401) }]) === 3
      && RT.readingMinutes([{ id: 'q', type: 'quick_check', prompt: 'p', options: [{ id: 'a', text: 'x', correct: true, feedback: words(1000) }] }]) === 1
      && RT.readingMinutes([{ id: 't', type: 'table', headers: ['a b'], rows: [[words(199), 'c d']] }]) === 2 && RT.requiredReadingSeconds(1) === 60 && RT.requiredReadingSeconds(10) === 240,
      'reading minutes: 200 wpm, min 1, feedback excluded, nested rows; required max(60, 40 %)');
  } else t('R-1b', false, 'reading-time module not loadable');

  // ---------------- C-1 course structure
  const S = (() => { try { return loadTs(f.structure); } catch { return null; } })();
  if (S && S.buildCourseStructure) {
    const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const nodes = [
      { id: U(1), parentId: null, kind: 'PAPER', title: 'Tier 1', slug: 'tier-1', order: 1, weightageTier: null, mapped: [] },
      { id: U(2), parentId: U(1), kind: 'SECTION', title: 'English', slug: 'english', order: 2, weightageTier: null, mapped: [] },
      { id: U(3), parentId: U(1), kind: 'SECTION', title: 'Reasoning', slug: 'reasoning', order: 1, weightageTier: null, mapped: [] },
      { id: U(4), parentId: U(2), kind: 'UNIT', title: 'Antonyms', slug: 'antonyms', order: 1, weightageTier: 'HIGH_YIELD', mapped: [{ nodeId: U(40), topicId: U(400) }] },
      { id: U(5), parentId: U(2), kind: 'UNIT', title: 'Idioms', slug: 'idioms', order: 2, weightageTier: 'CORE', mapped: [{ nodeId: U(50), topicId: U(500) }] },
      { id: U(6), parentId: U(3), kind: 'UNIT', title: 'Series', slug: 'series', order: 1, weightageTier: null, mapped: [{ nodeId: U(60), topicId: U(600) }] },
      { id: U(7), parentId: U(1), kind: 'SECTION', title: 'English', slug: 'english', order: 3, weightageTier: null, mapped: [] },
      { id: U(8), parentId: U(7), kind: 'UNIT', title: 'Grammar', slug: 'grammar', order: 1, weightageTier: null, mapped: [] },
      { id: U(9), parentId: U(1), kind: 'SECTION', title: 'Empty', slug: 'empty', order: 4, weightageTier: null, mapped: [] },
    ];
    const lesson = (n, nodeId, extra = {}) => ({ documentId: U(n), nodeId, name: `L${n}`, nodeType: 'SUBTOPIC', position: 1, href: `/learn/x/${n}`, hiAvailable: false, access: 'FREE', locked: false, status: 'NOT_STARTED', minutes: 3, ...extra });
    const paths = { [U(40)]: 'english.antonyms', [U(41)]: 'english.antonyms.pairs', [U(42)]: 'english.antonyms-extra', [U(50)]: 'english.idioms', [U(60)]: 'reasoning.series' };
    const cs = S.buildCourseStructure({
      nodes,
      lessons: [lesson(11, U(41)), lesson(12, U(40), { status: 'COMPLETED' }), lesson(13, U(42)), lesson(14, U(60), { locked: true, access: 'PRO' })],
      paths,
      practice: new Map([[U(400), 25], [U(500), 3]]),
      status: new Map([[U(11), 'READING']]),
    });
    const titles = cs.subjects.map((x) => `${x.slug}:${x.topics.map((tp) => `${tp.title}/${tp.state}/${tp.lessons.map((l) => l.name).join('+')}`).join(',')}`).join(' | ');
    t('C-1a', titles === 'reasoning:Series/READY/L14 | english:Antonyms/READY/L11+L12,Idioms/COMING_SOON/ | english-2:Grammar/COMING_SOON/' && cs.totals.topics === 4 && cs.totals.readyTopics === 2
      && cs.totals.lessons === 3 && cs.totals.completed === 1, `units in syllabus order under their section; prefix match only (english.antonyms-extra not in Antonyms); coming soon has no lessons; counts real (${titles}; ${JSON.stringify(cs.totals)})`);
    const ant = cs.subjects[1].topics[0];
    const idi = cs.subjects[1].topics[1];
    t('C-1b', ant.practice && ant.practice.label === 'Practice 10 questions' && ant.practice.count === 10 && /topic=0{8}-0{4}-4000-8000-000000000400/.test(ant.practice.href)
      && idi.practice && idi.practice.label === 'Practice 3 questions' && cs.subjects[0].topics[0].practice === null && S.practiceAction(U(1), 1).label === 'Practice 1 question' && S.practiceAction(U(1), 0) === null,
      'practice: real count (≥ 10 → 10, 3 → 3, 1 → "question"), none at 0');
    const nb = S.neighbours(cs.order, U(11));
    const nbEnd = S.neighbours(cs.order, U(12));
    const cont = S.continueLesson(cs.order, [{ documentId: U(11), updatedAt: '2026-11-01' }]);
    t('C-1c', cs.order.map((l) => l.name).join() === 'L14,L11,L12' && nb.prev && nb.prev.name === 'L14' && nb.next && nb.next.name === 'L12' && nbEnd.next === null && cont && cont.name === 'L11'
      && S.continueLesson(cs.order, []).name === 'L11', 'course order; previous / next (locked skipped for next); continue = newest READING else first open');
    t('C-1d', S.lessonsReadyText(17) === '17 lessons ready' && S.lessonsReadyText(1) === '1 lesson ready' && S.topicsReadyText(11, 59) === '11 of 59 topics ready', 'honest count texts');
  } else t('C-1', false, 'course-structure module not loadable');

  // ---------------- U-1 student UI
  t('U-1a', !/correct\s*[:?]/.test(f.qc.replace(/correctOptionId|setResult\(\{ correct|result\.correct|r\.correct|correct: answered|answered\.correct|correct: boolean/g, '')) && !/feedback\s*:\s*React\.ReactNode \| null \}\[\]/.test(f.qc)
    && /answerQuickCheckAction/.test(f.qc) && !/correct: o\.correct/.test(f.renderer) && /options=\{b\.options\.map\(\(o\) => \(\{ id: o\.id, text:/.test(f.renderer)
    && /preview && o\.correct/.test(f.renderer), 'quick checks: no key or feedback props to the client; the server action checks; only the admin preview shows the key');
  // COURSE-POLISH-1: the not-READY branch (coming soon / Current Affairs) — its header text is never inside a link
  const csStart = f.courseUi.indexOf('if (topic.state !== "READY")');
  const comingSoon = csStart < 0 ? '' : f.courseUi.slice(csStart, f.courseUi.indexOf('\n  }\n', csStart));
  t('U-1b', comingSoon.length > 0 && !/<Link|href=/.test(comingSoon) && /Coming soon/.test(f.courseUi) && !/<Link[^>]*>\s*Coming soon/.test(f.courseUi), 'a coming-soon topic is text, never a link');
  const courseFiles = [f.courseUi, f.home, f.subject, f.reader, f.structure].join('\n');
  t('U-1c', !/\d+\+\s*(Topics|Lessons|Questions|Students|Chapters)/i.test(courseFiles) && !/Reference:|Lucent|NCERT/.test(courseFiles) && !/\b(19|20)\d{2}\b/.test(courseFiles.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')) && !/[“"][^"”]{20,}[”"]\s*[—–-]\s*[A-Z]/.test(courseFiles),
    'course pages: no fake counts, reference lines, year labels or quotes');
  t('U-1d', !/createAdminServerSupabaseClient\(\)\.rpc|admin\.rpc/.test(f.actions) && /supabase\.rpc\("fn_lesson_complete"/.test(f.actions) && /supabase\.rpc\("fn_lesson_quick_check_answer"/.test(f.actions)
    && !/p_user|userId|user_id/.test(f.actions) && /isLessonCoinsEarnEnabled\(\)/.test(f.actions), 'actions: session client RPCs, no user id from the caller, coins shown only behind the flag');
  t('U-1e', /lessonCoins: isLessonCoinsEarnEnabled\(\)/.test(f.shell) && !/from\("coin_wallets"\)/.test(f.shell) && /<CoinBalance enabled=\{account\.lessonCoins\} \/>/.test(f.header)
    && /if \(!enabled \|\| n === null\) return null;/.test(f.header) && /if \(!isLessonCoinsEarnEnabled\(\)\) return NextResponse\.json\(\{ error: "Not found" \}, \{ status: 404/.test(f.balance)
    && !/createAdmin|service_role/.test(f.balance) &&/isLessonCoinsEarnEnabled\(\) \? <LessonCoinsWallet \/> : <CoinsPaused \/>/.test(f.wallet) && /result\.coins !== null && result\.coins > 0/.test(f.complete),
    'coin UI (header balance, wallet, toast) only behind COINS_LESSON_EARN');
  t('U-1f', !/from\("user_lesson_progress"\)(?:(?!from\()[^;])*\.eq\("language"/.test(f.service + f.master), 'progress read without a language filter (one record per lesson)');
  // found by the UI gate on a dropped connection: a session that could not be read must not answer as a visitor
  // (unrecorded → the completion stays blocked); a failed course read is an error, never a cached / shown "not found"
  t('U-1g', f.actions.includes('if (session.state !== "none") return { ok: false, code: "FAILED" };') && f.actions.indexOf('if (session.state !== "none")') < f.actions.indexOf('publishedQuickCheck(input.documentId')
    && !/revalidate: 900 \}\)\(\)\.catch/.test(f.service) && f.service.includes('throw new Error("COURSE_DATA_UNAVAILABLE")'), 'session errors are not visitors; a failed course read is not a 404');
  return fails;
}

const fails = check();
if (process.argv.includes('--self-test')) {
  const mut = (k, from, to) => ({ [k]: read(F[k]).replace(from, to) });
  const controls = [
    // the planted transaction opener is built at runtime (LIVE-LOCK-SWEEP reads a literal one as this script's own)
    ['M-1a BEGIN', mut('m136', '-- 1. evidence tables', ['BEG', 'IN;'].join('') + '\n-- 1. evidence tables')],
    ['M-1c extra SECDEF', mut('m136', "RETURNS integer\nLANGUAGE sql\nIMMUTABLE", "RETURNS integer\nLANGUAGE sql\nIMMUTABLE\nSECURITY DEFINER")],
    ['M-1e award granted', mut('m137', 'REVOKE ALL ON FUNCTION public.fn_lesson__award_coins(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;', 'GRANT EXECUTE ON FUNCTION public.fn_lesson__award_coins(uuid, uuid, boolean) TO authenticated;')],
    ['M-1f client write', mut('m136', 'GRANT SELECT ON TABLE public.lesson_reading_sessions TO authenticated;', 'GRANT SELECT, INSERT ON TABLE public.lesson_reading_sessions TO authenticated;')],
    ['M-1g no time rule', mut('m137', "IF v_elapsed < v_required THEN v_missing := array_append(v_missing, 'TIME'); END IF;", '')],
    ['M-1h ships ON', mut('m137', '-- 4. completion awards', "INSERT INTO public.premium_system_configs (config_domain, config_key) VALUES ('GLOBAL', 'COINS_LESSON_EARN');\n-- 4. completion awards")],
    ['M-2 rollback drift', mut('rb136', 'language      = EXCLUDED.language,', 'language      = p.language,')],
    ['R-1a field drift', mut('rt', '"alt",', '"alt", "feedback",')],
    ['C-1 prefix bug', mut('structure', 'p === m || p.startsWith(`${m}.`)', 'p.startsWith(m)')],
    ['C-1 practice 0', mut('structure', 'count <= 0) return null', 'count < 0) return null')],
    ['U-1a key to client', mut('renderer', 'options={b.options.map((o) => ({ id: o.id, text:', 'options={b.options.map((o) => ({ id: o.id, correct: o.correct, text:')],
    ['U-1b coming-soon link', mut('courseUi', 'data-state={topic.state === "CURRENT_AFFAIRS" ? "current-affairs" : "coming-soon"}>', 'data-state="coming-soon"><Link href="/x">x</Link>')],
    ['U-1c fake count', mut('home', 'Subjects\n', 'Subjects 150+ Topics\n')],
    ['U-1d service role', mut('actions', 'supabase.rpc("fn_lesson_complete"', 'createAdminServerSupabaseClient().rpc("fn_lesson_complete"')],
    ['U-1e balance without flag', mut('balance', 'if (!isLessonCoinsEarnEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });', '')],
    ['U-1g session error as visitor', mut('actions', '  if (session.state !== "none") return { ok: false, code: "FAILED" };\n', '')],
    ['U-1f language filter',mut('service', '.in("document_id", ids);', '.in("document_id", ids).eq("language", language);')],
  ];
  let bad = 0;
  for (const [name, over] of controls) {
    const f2 = check(over);
    const caught = f2.length > fails.length;
    if (!caught) bad++;
    console.log(`  ${caught ? 'PASS' : 'FAIL'}  negative control: ${name} ${caught ? 'is caught' : 'is NOT caught'}`);
  }
  if (bad) { console.log(`COURSE-UX-1 self-test: ${bad} control(s) not caught`); process.exit(1); }
}
for (const x of fails) console.log(`  FAIL  ${x}`);
console.log(fails.length ? `COURSE-UX-1 offline: ${fails.length} FAILURE(S)` : 'COURSE-UX-1 offline: ALL PASS');
process.exit(fails.length ? 1 : 0);
