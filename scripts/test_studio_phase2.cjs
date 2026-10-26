#!/usr/bin/env node
/**
 * Courage Studio phase 2 (decision #84) — offline gate: Today v2 numbers, Focus review, auto checks, settings.
 * Non-writing: pure modules + static reads only (no DB, no server).
 *   SP-01 auto checks: the 6 checks, reasons, Hindi = warning (not blocking), blockingFailures
 *   SP-02 review stats: IST day, avg (gaps > 15 min ignored), streak, minutes left never invented, 14-day counts
 *   SP-03 settings: defaults, bounds, disabled rows ignored, source; the settings module never writes
 *   SP-04 service: approve runs the server auto checks after the checklist and BEFORE the transition RPC;
 *         Q4 second-reviewer rule before the publish RPC + QF_SELF_APPROVED_PUBLISH audit (behaviour: QF-1 Q4-1..3)
 *   SP-05 focus page: guard first (staff + admin, like Question drafts); only version ids reach the client; the client
 *         imports only the guarded QF actions; approve sends the existing 6-item checklist only after "I checked all 6"
 *         and no blocking failure; reject needs a reason; edit = request changes → edit → resubmit (existing actions)
 *   SP-06 focus a11y (static): keys A / R / E / J / K / Esc never fire while typing; native <dialog>s; live region;
 *         visible focus; ≥ 44 px targets; motion only under motion-safe; surround remembered with try/catch storage
 *   SP-07 colours: dark surround = the focus-surround token, the card white; mission text ≥ 4.5:1 at the worst point
 *   SP-08 settings page: admin only, read only; Focus review sidebar badge = a count only, never breaks the layout
 *   SP-09 the new read action: guard first, sanitized (same pattern as every QF action)
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
  return 'Hindi warning (ruling pending)';
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
  const src = code(read('lib/admin/studio-settings.ts'));
  assert(!/\.(insert|update|upsert|delete|rpc)\(/.test(src) && /\.eq\("config_domain", "GLOBAL"\)/.test(src), 'read only, GLOBAL domain');
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
  assert(/<FocusReview queue=\{ids\} goal=\{settings\.dailyReviewGoal\} doneBefore=\{stats\?\.doneToday \?\? null\} \/>/.test(body), 'props: ids + numbers only');
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
  const m = css.match(/\.mission-gradient \{[\s\S]*?\}/);
  assert(m, '.mission-gradient');
  const pcts = [...m[0].matchAll(/var\(--color-focus-surround\) (\d+)%/g)].map((x) => Number(x[1]));
  assert(pcts.length >= 2, 'navy scrim stops');
  const min = Math.min(...pcts) / 100;
  const S = hex(surround);
  const worst = Math.min(...['gradient-start', 'gradient-mid', 'gradient-end'].map((n) => contrast([255, 255, 255], hex(token(n)).map((v, i) => S[i] * min + v * (1 - min)))));
  assert(worst >= 4.5, `white on the mission card: ${worst.toFixed(2)}`);
  return `worst ${worst.toFixed(2)}:1 (scrim ≥ ${Math.round(min * 100)}%)`;
});

test('SP-08 settings page admin-only + read-only; sidebar badge is a count that never breaks the layout', () => {
  const p = code(read('app/admin/settings/page.tsx'));
  assert(/await requireAdminPage\(\{ path: "\/admin\/settings" \}\);/.test(p) && !/allowStaff/.test(p), 'admin only');
  assert(!/"use server"|<form|action=|\.(insert|update|upsert|delete)\(/.test(p), 'read only');
  const t = code(read('lib/admin/today.ts'));
  const f = t.slice(t.indexOf('export async function getFocusQueueCount('));
  assert(/try \{[\s\S]*?\} catch \{[\s\S]*?return null;/.test(f.slice(0, 600)) && /head: true/.test(f.slice(0, 600)), 'count only (head), never throws');
  const l = code(read('app/admin/layout.tsx'));
  assert(l.indexOf('await requireAdminPage') < l.indexOf('await getFocusQueueCount()') && /<AdminSidebar nav=\{nav\} badges=\{\{ inReview \}\} \/>/.test(l), 'badge read after the guard');
  const s = read('components/admin/admin-sidebar.tsx');
  assert(/Courage Studio/.test(s) && /Admin workspace/.test(s) && /studio-sidebar/.test(s) && /<span className="sr-only"> waiting<\/span>/.test(s), 'brand tile, glow, badge text for AT');
});

test('SP-09 qfGetFocusItemAction: guard first, sanitized', () => {
  const a = code(read('actions/question-factory.actions.ts'));
  const fn = a.slice(a.indexOf('export async function qfGetFocusItemAction('));
  assert(/const __auth = await guardAdminAction\(\{ allowStaff: true \}\);\s*if \(!__auth\.ok\) return __auth;\s*return sanitizeActionResult\("qfGetFocusItemAction"/.test(fn), 'guard first + sanitized');
});

console.log(`\nCourage Studio phase 2: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
