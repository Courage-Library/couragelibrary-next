#!/usr/bin/env node
/**
 * Courage Studio phase 2 (decision #84) — offline gate: Today v2 numbers, Focus review, auto checks, settings.
 * Non-writing: pure modules + static reads only (no DB, no server).
 *   SP-01 auto checks: the 6 checks, reasons, Hindi = warning unless the exam is in EXAM_REQUIRES_BILINGUAL
 *   SP-02 review stats: IST day, avg (gaps > 15 min ignored), streak, minutes left never invented, 14-day counts
 *   SP-03 settings: defaults, bounds, disabled rows ignored, source; the settings module never writes
 *   SP-04 service: approve runs the server auto checks after the checklist and BEFORE the transition RPC;
 *         Q4 second-reviewer rule before the publish RPC + QF_SELF_APPROVED_PUBLISH audit (behaviour: QF-1 Q4-1..3)
 *   SP-05 focus page: guard first (staff + admin, like Question drafts); only version ids reach the client; the client
 *         imports only the guarded QF actions; approve sends the existing 6-item checklist only after "I checked all 6"
 *         and no blocking failure; reject needs a reason; edit = request changes → edit → resubmit (existing actions)
 *   SP-06 focus a11y (static): keys A / R / E / J / K / Esc never fire while typing; native <dialog>s; live region;
 *         visible focus; ≥ 44 px targets; motion only under motion-safe; surround remembered with try/catch storage
 *   SP-07 colours: dark surround = the focus-surround token, the card white; the mission card = the concept gradient
 *         (no navy scrim), cyan glow right of the text column, white small text ≥ 4.5:1 at the worst point
 *   SP-08 settings page: admin only, read only; Focus review sidebar badge = a count only, never breaks the layout
 *   SP-09 the new read action: guard first, sanitized (same pattern as every QF action)
 *   SP-10 content health: a question counts for an exam only via mapping / past-paper source / mock membership (topic
 *         overlap = a hint, never counted); rows = exams with ≥ 1 linked question (inactive = "not live"); published + in review
 * Run: node scripts/test_studio_phase2.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  module._compile(out.outputText, filename);
};
// studio-settings imports the server client; nothing here may reach a database
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@/lib/supabase/server') return { createAdminServerSupabaseClient: () => { throw new Error('no DB in this gate'); } };
  return originalLoad.call(this, request, parent, isMain);
};
const AC = require(path.join(ROOT, 'lib/question-factory/auto-checks.ts'));
const RS = require(path.join(ROOT, 'lib/admin/review-stats-core.ts'));
const SS = require(path.join(ROOT, 'lib/admin/studio-settings.ts'));
const CH = require(path.join(ROOT, 'lib/admin/content-health-core.ts'));

test('SP-01 auto checks: six checks, reasons, Hindi is a warning, blocking failures', () => {
  const good = { correctKey: 'A', optionKeys: ['A', 'B', 'C', 'D'], explanationMd: 'Because 12 × 3 = 36, only A fits.', topicId: 't', topicName: 'Arithmetic', difficulty: 'medium', language: 'en', hasOtherLanguage: false, duplicateCount: 0 };
  const c = AC.computeAutoChecks(good);
  assert(JSON.stringify(c.map((x) => x.id)) === '["answer_key","explanation","topic_mapped","hindi_linked","no_duplicate","difficulty_set"]', 'the six checks in order');
  assert(AC.blockingFailures(c).length === 0 && c.find((x) => x.id === 'hindi_linked').ok === false && c.find((x) => x.id === 'hindi_linked').blocking === false, 'English-only passes; Hindi missing = warning');
  const fail = (patch, id) => {
    const f = AC.blockingFailures(AC.computeAutoChecks({ ...good, ...patch }));
    assert(f.length === 1 && f[0].id === id && f[0].reason.length > 10, `${id}: ${JSON.stringify(f.map((x) => x.id))}`);
  };
  fail({ correctKey: null }, 'answer_key');
  fail({ correctKey: 'E' }, 'answer_key');
  fail({ explanationMd: '  short ' }, 'explanation');
  fail({ explanationMd: null }, 'explanation');
  fail({ topicId: null }, 'topic_mapped');
  fail({ duplicateCount: 2 }, 'no_duplicate');
  fail({ difficulty: 'tricky' }, 'difficulty_set');
  assert(AC.computeAutoChecks({ ...good, language: 'hi', hasOtherLanguage: true }).find((x) => x.id === 'hindi_linked').label === 'English version linked', 'a Hindi version checks for its English twin');
  // ruling 2026-10-27: an exam in EXAM_REQUIRES_BILINGUAL makes the other-language check BLOCK
  fail({ bilingualRequired: true }, 'hindi_linked');
  assert(AC.blockingFailures(AC.computeAutoChecks({ ...good, bilingualRequired: true, hasOtherLanguage: true })).length === 0, 'bilingual exam + both languages passes');
  return 'Hindi = warning; blocks for EXAM_REQUIRES_BILINGUAL exams';
});

test('SP-02 review stats from real audit times (IST)', () => {
  const now = new Date('2026-10-26T10:00:00Z'); // 15:30 IST
  const t = (iso) => new Date(iso).toISOString();
  const ev = [t('2026-10-26T09:00:00Z'), t('2026-10-26T09:01:00Z'), t('2026-10-26T09:03:00Z'), t('2026-10-26T09:40:00Z'), t('2026-10-25T05:00:00Z'), t('2026-10-24T05:00:00Z'), t('2026-10-22T05:00:00Z')];
  const s = RS.computeReviewStats(ev, 20, now);
  assert(s.doneToday === 4 && s.avgSeconds === 90 && s.streakDays === 3, JSON.stringify(s));
  assert(s.minutesLeft === Math.ceil((16 * 90) / 60), 'minutes left = remaining × avg');
  const ist = RS.computeReviewStats([t('2026-10-25T19:00:00Z')], 20, now); // 00:30 IST on the 26th
  assert(ist.doneToday === 1 && ist.avgSeconds === null && ist.minutesLeft === null, 'IST day boundary; no average → no estimate');
  const y = RS.computeReviewStats([t('2026-10-25T05:00:00Z'), t('2026-10-24T05:00:00Z')], 20, now);
  assert(y.doneToday === 0 && y.streakDays === 2, 'a streak may still end yesterday');
  assert(RS.computeReviewStats([], 20, now).streakDays === 0, 'empty');
  const d = RS.dailyCounts(ev, 14, now);
  assert(d.length === 14 && d[13] === 4 && d[12] === 1 && d.reduce((a, b) => a + b, 0) === 7, JSON.stringify(d));
  assert(RS.greeting(new Date('2026-10-26T02:00:00Z')) === 'Good morning' && RS.greeting(now) === 'Good afternoon' && RS.greeting(new Date('2026-10-26T14:00:00Z')) === 'Good evening', 'greeting by IST hour');
  // STUDIO-P2-POLISH: recent activity groups identical consecutive actions, max 5 rows, the newest time kept
  const ev2 = ['A', 'A', 'A', 'B', 'A', 'C', 'D', 'E', 'F'].map((a, i) => ({ action: a, entity: 'x', at: `2026-10-26T1${9 - Math.min(i, 9)}:00:00Z` }));
  const g = RS.groupRecent(ev2, 5);
  assert(JSON.stringify(g.map((x) => `${x.action}${x.count}`)) === '["A3","B1","A1","C1","D1"]' && g[0].at === ev2[0].at, JSON.stringify(g));
  // a group that runs to the end of a FULL page is a lower bound ("×60+"); a short page is exact
  const full = Array.from({ length: 60 }, () => ({ action: 'Q', entity: 'x', at: '2026-10-27T05:00:00Z' }));
  assert(RS.groupRecent(full, 5, 60)[0].more === true && RS.groupRecent(full.slice(0, 10), 5, 60)[0].more === false && g.every((x) => x.more === false), 'lower-bound flag');
  assert(JSON.stringify(RS.REVIEW_ACTIONS) === '["QF_TRANSITION_APPROVED","QF_TRANSITION_REJECTED","QF_TRANSITION_CHANGES_REQUESTED"]', 'review actions');
});

test('SP-03 settings: defaults, bounds, source; the module never writes', () => {
  const P = SS.parseStudioSettings;
  const d = P([]);
  assert(d.dailyReviewGoal === 20 && d.requireSecondReviewer === false && d.source.dailyReviewGoal === 'default' && d.source.requireSecondReviewer === 'default', 'defaults');
  const row = (k, v, on = true) => ({ config_key: k, config_value: { value: v }, is_enabled: on });
  assert(P([row('ADMIN_DAILY_REVIEW_GOAL', 35), row('ADMIN_REQUIRE_SECOND_REVIEWER', true)]).dailyReviewGoal === 35, 'goal from a row');
  assert(P([row('ADMIN_REQUIRE_SECOND_REVIEWER', true)]).requireSecondReviewer === true && P([row('ADMIN_REQUIRE_SECOND_REVIEWER', 'true')]).requireSecondReviewer === false, 'only a real true turns it on');
  for (const bad of [0, 201, '20', 2.5, null]) assert(P([row('ADMIN_DAILY_REVIEW_GOAL', bad)]).dailyReviewGoal === 20, `bad goal ${bad}`);
  assert(P([row('ADMIN_DAILY_REVIEW_GOAL', 50, false)]).dailyReviewGoal === 20, 'disabled row ignored');
  const E1 = '11111111-1111-4111-8111-111111111111';
  const bil = (v, on = true) => P([{ config_key: 'EXAM_REQUIRES_BILINGUAL', config_value: v, is_enabled: on }]);
  assert(d.bilingualExamIds.length === 0 && d.source.bilingualExamIds === 'default', 'bilingual default: none');
  assert(JSON.stringify(bil({ exam_ids: [E1, E1] }).bilingualExamIds) === JSON.stringify([E1]) && bil({ exam_ids: [E1] }).source.bilingualExamIds === 'setting', 'bilingual exam ids');
  for (const badIds of [{ exam_ids: ['ssc-gd'] }, { exam_ids: E1 }, { value: [E1] }]) assert(bil(badIds).bilingualExamIds.length === 0, `bad bilingual ${JSON.stringify(badIds)}`);
  assert(bil({ exam_ids: [E1] }, false).bilingualExamIds.length === 0, 'disabled bilingual row ignored');
  const src = code(read('lib/admin/studio-settings.ts'));
  assert(!/\.(insert|update|upsert|delete|rpc)\(/.test(src) && /\.in\("config_domain", \["GLOBAL", "EXAM"\]\)/.test(src), 'read only, GLOBAL + EXAM domains');
  assert(/if \(error\) return parseStudioSettings\(\[\]\);/.test(src), 'a failed read = defaults (second reviewer off = today\'s behaviour)');
  assert(!/^import "server-only"/m.test(src), 'loadable by offline gates');
});

test('SP-04 service: auto checks before the transition RPC; Q4 before the publish RPC', () => {
  const s = code(read('services/question-factory/admin-question-factory.service.ts'));
  const tr = s.slice(s.indexOf('private static async transition('));
  const iChecklist = tr.indexOf("fail('QF_CHECKLIST_REQUIRED'");
  const iAuto = tr.indexOf("fail('QF_AUTO_CHECK_FAILED'");
  const iRpc = tr.indexOf("rpc('fn_transition_question_version'");
  assert(iChecklist > 0 && iAuto > iChecklist && iRpc > iAuto, 'checklist → auto checks → RPC');
  assert(/blockingFailures\(await this\.computeChecks\(ctx, detail\)\)/.test(tr), 'server-computed checks');
  assert(/bilingualRequired: await this\.bilingualRequired\(ctx, detail\.topicId\)/.test(s) && /loadPublishedExamsForTopics\(ctx\.supabase, \[topicId\]\)/.test(s) && /if \(!map\) throw new QuestionFactoryError\('LOOKUP_FAILED'/.test(s), 'bilingual exam via the canonical syllabus read model; fails closed');
  const pub = s.slice(s.indexOf('static async publish('));
  const iQ4 = pub.indexOf("fail('QF_SECOND_REVIEWER_REQUIRED'");
  const iPub = pub.indexOf("rpc('fn_publish_question_version'");
  assert(iQ4 > 0 && iPub > iQ4 && /approver === ctx\.userId/.test(pub) && /requireSecondReviewer/.test(pub), 'Q4 refused before the RPC');
  assert(pub.indexOf("'QF_SELF_APPROVED_PUBLISH'") > iPub, 'self-approve + publish audited after the publish');
  const fi = s.slice(s.indexOf('static async getFocusItem('));
  assert(/return this\.guard\(async \(ctx\) =>/.test(fi.slice(0, 400)), 'getFocusItem inside the service guard');
});

test('SP-05 focus review: guard first, ids only, existing guarded actions, Q3 confirmation', () => {
  const p = code(read('app/admin/review/focus/page.tsx'));
  const body = p.slice(p.indexOf('export default async function FocusReviewPage('));
  assert(/await requireAdminPage\(\{ allowStaff: true, path: "\/admin\/review\/focus" \}\)/.test(body) && body.indexOf('await requireAdminPage') === body.indexOf('await '), 'guard first (staff + admin)');
  assert(/listReviewQueue\(\{ lifecycleStatus: "IN_REVIEW", limit: 200 \}\)/.test(body) && /\.map\(\(q\) => q\.versionId\)/.test(body), 'IN_REVIEW queue; only version ids passed');
  assert(/<FocusReview queue=\{ids\} total=\{total\} goal=\{settings\.dailyReviewGoal\} doneBefore=\{stats\?\.doneToday \?\? null\} \/>/.test(body) && /getFocusQueueCount\(\)/.test(body), 'props: ids + numbers only (total = the head count)');
  const c = read('components/admin/studio/focus-review.tsx');
  assert(/^"use client";/.test(c), 'client component');
  const imports = [...c.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
  assert(imports.every((m) => /^(next\/link|react|lucide-react|@\/components\/ui\/cn|@\/components\/admin\/question-factory\/review-queue-tab|@\/actions\/question-factory\.actions|@\/types\/question-factory|@\/lib\/question-factory\/auto-checks)$/.test(m)), `imports: ${imports.join(', ')}`);
  assert(!/supabase|SERVICE_ROLE|services\//.test(c), 'no DB / service access from the client');
  const cc = code(c);
  assert(/const ALL_CHECKED = Object\.fromEntries\(QF_REVIEW_CHECKLIST_ITEMS\.map/.test(cc) && /qfApproveAction\(id, ALL_CHECKED\)/.test(cc), 'approve sends the existing 6-item checklist');
  assert(/const canApprove = !!item && confirmed && blocking\.length === 0 && !isPending;/.test(cc) && /if \(!item \|\| !currentId \|\| !canApprove\) return;/.test(cc) && /disabled=\{!canApprove\}/.test(cc), 'approve only after "I checked all 6" and no blocking failure');
  assert(/I checked all 6/.test(cc) && /QF_REVIEW_CHECKLIST_ITEMS\.map\(\(i\) => \(\s*<li key=\{i\.id\}>\{i\.label\}<\/li>/.test(cc), 'one confirmation, the 6 items visible');
  assert(/Approve is blocked: \{blocking\.map\(\(b\) => b\.reason\)/.test(cc), 'blocking reason shown');
  assert(/if \(!currentId \|\| !rejectReason\.trim\(\)\) return;/.test(cc) && /qfRejectAction\(id, rejectReason\.trim\(\)\)/.test(cc) && /disabled=\{!rejectReason\.trim\(\) \|\| isPending\}/.test(cc), 'reject needs a reason');
  const iRc = cc.indexOf('qfRequestChangesAction(id'), iEd = cc.indexOf('qfEditDraftAction(id'), iSub = cc.indexOf('qfSubmitForReviewAction(id');
  assert(iRc > 0 && iEd > iRc && iSub > iEd && /if \(!currentId \|\| !editNotes\.trim\(\)\) return;/.test(cc), 'edit = request changes (note) → edit → resubmit');
  assert(/const next = q\.filter\(\(x\) => x !== id\);/.test(cc), 'a decided item leaves the queue; the next one auto-opens');
  assert(/qfGetFocusItemAction\(currentId\)/.test(cc), 'checks come from the server');
  return 'K = previous, J = next / skip (one key per action)';
});

test('SP-06 focus a11y (static): keys, typing guard, dialogs, live region, focus, targets, motion', () => {
  const c = code(read('components/admin/studio/focus-review.tsx'));
  assert(/const typing = !!t && \(t\.isContentEditable \|\| \/\^\(INPUT\|TEXTAREA\|SELECT\)\$\/\.test\(t\.tagName\)\);/.test(c) && /if \(typing \|\| dialog\) return;/.test(c), 'shortcuts never fire while typing or in a dialog');
  assert(/if \(e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey\) return;/.test(c), 'no modifier hijack');
  for (const k of ['"a"', '"r"', '"e"', '"j"', '"k"']) assert(c.includes(`k === ${k}`), `key ${k}`);
  assert(/e\.key === "Escape"/.test(c) && /window\.location\.assign\("\/admin"\)/.test(c), 'Esc exits (after a dialog closes)');
  assert((c.match(/<dialog\b/g) || []).length === 2 && /showModal\(\)/.test(c) && /aria-labelledby="reject-title"/.test(c) && /aria-labelledby="edit-title"/.test(c), 'native modal dialogs, labelled');
  assert(/aria-live="polite"/.test(c) && /headingRef\.current\?\.focus\(\)/.test(c), 'announcements + focus moves to the new question');
  assert((c.match(/focus-ring/g) || []).length >= 8 && !/outline-none(?![^"]*focus)/.test(c.replace(/id="focus-q"[^>]*outline-none/, '')), 'visible focus');
  assert(!/min-h-(?:[0-9]|10)\b/.test(c) && /min-h-12/.test(c), 'targets ≥ 44 px');
  assert(!/\banimate-/.test(c) && !/(?<!motion-safe:)transition-/.test(c), 'motion only under motion-safe (prefers-reduced-motion respected)');
  assert(/try \{\s*setLight\(window\.localStorage\.getItem\(SURROUND_KEY\) === "light"\);\s*\} catch/.test(c) && /try \{\s*window\.localStorage\.setItem\(SURROUND_KEY/.test(c) && /aria-pressed=\{light\}/.test(c), 'surround toggle remembered per browser (storage may fail)');
  const sc = code(read('components/admin/studio/focus-shortcut.tsx'));
  assert(/e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey/.test(sc) && /INPUT\|TEXTAREA\|SELECT/.test(sc), 'F on Today: no modifiers, never while typing');
});

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => {
  const [r, g, b] = c.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test('SP-07 colours: dark surround token, white card, mission text ≥ 4.5:1 at its worst point', () => {
  const css = read('app/globals.css');
  const token = (name) => {
    let v = (css.match(new RegExp(`--color-${name}:\\s*([^;]+);`)) || [])[1];
    for (let i = 0; i < 4 && v && /^var\(/.test(v); i++) v = (css.match(new RegExp(`--color-${v.slice(12, -1)}:\\s*([^;]+);`)) || [])[1];
    return v && v.trim();
  };
  const surround = token('focus-surround');
  assert(surround && surround.toLowerCase() === '#0a1230', `focus surround ${surround}`);
  const c = read('components/admin/studio/focus-review.tsx');
  assert(/onDark \? "bg-focus-surround text-fg-inverse" : "bg-ink-100 text-fg"/.test(c) && /rounded-panel bg-surface p-5 text-fg/.test(c), 'dark surround, white card');
  // STUDIO-P2-POLISH: the concept gradient 115deg primary-700 0% → primary-500 45% → violet 100%, no navy scrim; white
  // text only in the left text column over a primary-700 tint. Worst point checked along the WHOLE gradient line.
  const blocks = [...css.matchAll(/\.mission-gradient \{[\s\S]*?\n {2,4}\}/g)].map((x) => x[0]);
  assert(blocks.length === 2, `.mission-gradient blocks ${blocks.length} (base + ≥ 640 px)`);
  for (const b of blocks) {
    assert(/linear-gradient\(115deg, var\(--color-primary-700\) 0%, var\(--color-primary-500\) 45%, var\(--color-brand-violet\) 100%\)/.test(b), 'the concept gradient');
    assert(!/focus-surround|ink-9/.test(b), 'no navy scrim');
  }
  assert(!/accent-300/.test(blocks[0]) && /radial-gradient\(circle at 100% 0%, color-mix\(in srgb, var\(--color-accent-300\)/.test(blocks[1]), 'cyan glow top-right, only ≥ 640 px');
  const tint = (b) => [...b.matchAll(/var\(--color-primary-700\) (\d+)%, transparent\) (\d+)%/g)].map((x) => ({ a: Number(x[1]) / 100, at: Number(x[2]) }));
  const wide = tint(blocks[1]);
  const col = Number((read('app/admin/page.tsx').match(/<div className="relative flex flex-1 flex-col sm:max-w-\[(\d+)%\]">/) || [])[1]);
  assert(col > 0 && wide.length === 2 && wide[0].at === 0 && wide[1].at >= col, `tint (${JSON.stringify(wide)}) covers the whole text column (0–${col} %)`);
  const glow = Number((blocks[1].match(/var\(--color-accent-300\) 60%, transparent\) 0, transparent (\d+)%\)/) || [])[1]);
  assert(glow > 0 && glow <= 100 - col, `the glow (radius ${glow} %) stays right of the text column`);
  const stops = [[0, hex(token('primary-700'))], [0.45, hex(token('primary-500'))], [1, hex(token('brand-violet'))]];
  const at = (t) => {
    for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const f = (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]); return stops[i - 1][1].map((v, k) => v * (1 - f) + stops[i][1][k] * f); }
    return stops[2][1];
  };
  const T = hex(token('primary-700'));
  const a = Math.min(...[...tint(blocks[0]), ...wide].map((x) => x.a));
  let worst = 99;
  for (let t = 0; t <= 1.0001; t += 0.01) worst = Math.min(worst, contrast([255, 255, 255], at(t).map((v, k) => v * (1 - a) + T[k] * a)));
  assert(worst >= 4.5, `white small text on the mission card: ${worst.toFixed(2)}`);
  return `worst ${worst.toFixed(2)}:1 (blue-700 tint ${Math.round(a * 100)}% under the text column)`;
});

test('SP-08 settings page admin-only + read-only; sidebar badge is a count that never breaks the layout', () => {
  const p = code(read('app/admin/settings/page.tsx'));
  assert(/await requireAdminPage\(\{ path: "\/admin\/settings" \}\);/.test(p) && !/allowStaff/.test(p), 'admin only');
  assert(!/"use server"|<form|action=|\.(insert|update|upsert|delete)\(/.test(p), 'read only');
  const t = code(read('lib/admin/today.ts'));
  const f = t.slice(t.indexOf('export async function getFocusQueueCount('));
  assert(/try \{[\s\S]*?\} catch \{[\s\S]*?return null;/.test(f.slice(0, 600)) && /head: true/.test(f.slice(0, 600)), 'count only (head), never throws');
  const l = code(read('app/admin/layout.tsx'));
  assert(l.indexOf('await requireAdminPage') < l.indexOf('getFocusQueueCount()') && /await Promise\.all\(\[getFocusQueueCount\(\), getAdminFirstName\(userId\)\]\)/.test(l) && /<AdminSidebar nav=\{nav\} badges=\{\{ inReview \}\} \/>/.test(l), 'badge + first name read after the guard');
  const s = read('components/admin/admin-sidebar.tsx');
  assert(/Courage Studio/.test(s) && /Admin workspace/.test(s) && /studio-sidebar/.test(s) && /<span className="sr-only"> waiting<\/span>/.test(s), 'brand tile, glow, badge text for AT');
});

test('SP-10 content health: explicit links only (mapping / past-paper source / mock membership); topic overlap = hint only', () => {
  const T1 = 't1', T2 = 't2', S1 = 's1', S2 = 's2';
  const g = CH.buildContentHealth({
    questions: [
      { id: 'q1', topicId: T1, published: true, inReview: false },   // CGL mock member (explicit)
      { id: 'q2', topicId: T1, published: false, inReview: true },   // GD past paper (explicit); shares a CGL topic → hint only
      { id: 'q3', topicId: T2, published: false, inReview: false },  // a draft only, GD via mapping
      { id: 'q4', topicId: null, published: false, inReview: true }, // no topic → no cell, exam still listed
      { id: 'q5', topicId: T1, published: true, inReview: false },   // on a CGL topic, linked to NOTHING → counted nowhere
    ],
    subjectOfTopic: new Map([[T1, S1], [T2, S2]]),
    topicExams: new Map([[T1, ['cgl']]]),
    explicitExams: new Map([['q1', ['cgl']], ['q2', ['gd']], ['q3', ['gd']], ['q4', ['mts']]]),
    exams: [{ id: 'cgl', title: 'SSC CGL', isActive: true }, { id: 'gd', title: 'SSC GD Constable', isActive: false }, { id: 'mts', title: 'SSC MTS', isActive: false }, { id: 'chsl', title: 'SSC CHSL', isActive: false }],
    subjects: [{ id: S1, name: 'Quantitative Aptitude' }, { id: S2, name: 'General Awareness' }, { id: 's3', name: 'Unused' }],
  });
  assert(JSON.stringify(g.exams) === JSON.stringify([{ id: 'cgl', title: 'SSC CGL', live: true, sharedTopics: 2 }, { id: 'gd', title: 'SSC GD Constable', live: false, sharedTopics: 0 }, { id: 'mts', title: 'SSC MTS', live: false, sharedTopics: 0 }]), `rows ${JSON.stringify(g.exams)}`);
  assert(JSON.stringify(g.cells['cgl:s1']) === '{"published":1,"inReview":0}' && JSON.stringify(g.cells['gd:s1']) === '{"published":0,"inReview":1}' && JSON.stringify(g.cells['gd:s2']) === '{"published":0,"inReview":0}', `topic overlap must not count: ${JSON.stringify(g.cells)}`);
  assert(JSON.stringify(g.subjects.map((x) => x.id)) === '["s1","s2"]', 'only subjects that have linked questions');
  assert(g.lowestExamId === 'gd' || g.lowestExamId === 'mts', `lowest ${g.lowestExamId}`);
  const t = code(read('lib/admin/today.ts'));
  assert(/from\("exam_question_mappings"\)/.test(t) && /from\("question_sources"\)/.test(t) && /from\("mock_questions"\)\.select\("question_versions!inner\(question_id\), mock_tests!inner\(mock_templates!inner\(exam_id\)\)"\)/.test(t), 'the three explicit links are read');
  const p = code(read('app/admin/page.tsx'));
  assert(/\{!e\.live && <span[^>]*>not live<\/span>\}/.test(p) && /\{c\.inReview > 0 && <span[^>]*>\+\{c\.inReview\} in review<\/span>\}/.test(p) && /cellClass\(c\.published, max\)/.test(p) && /\{e\.sharedTopics\} more share its topics/.test(p), 'not-live label; published count; "+N in review"; shared-topics hint');
});

test('SP-09 qfGetFocusItemAction: guard first, sanitized', () => {
  const a = code(read('actions/question-factory.actions.ts'));
  const fn = a.slice(a.indexOf('export async function qfGetFocusItemAction('));
  assert(/const __auth = await guardAdminAction\(\{ allowStaff: true \}\);\s*if \(!__auth\.ok\) return __auth;\s*return sanitizeActionResult\("qfGetFocusItemAction"/.test(fn), 'guard first + sanitized');
});

console.log(`\nCourage Studio phase 2: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
