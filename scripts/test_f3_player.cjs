#!/usr/bin/env node
/**
 * F3 — mock player fixes (docs/reports/ux/F3_PLAYER_AUDIT.md; rules R4–R8, R10). Offline gate: TS transpile + module
 * mocks + fake timers / fetch / localStorage — no network, no DB, no server.
 * P0
 *   P0-1 save honesty: the route never answers 200 for a failed write (409 closed / 503 failed / 400 invalid); the
 *        engine shows "saved" ONLY on { success: true }, retries with backoff ("retrying"), stops on 409 ("closed"),
 *        keeps per-question debounces independent; the offline queue dequeues only confirmed saves
 *   P0-2 submit errors are always visible: a failed manual submit reopens the summary dialog with the error; a failed
 *        auto-submit keeps a non-dismissible dialog with "Try submitting again"
 *   P0-3 timer: deadline anchored once, recomputed from the clock, fires ONCE; parent re-renders cannot restart it
 *   P0-4 calm: no sound, no pulse / flash; one quiet final-minutes state
 *   P0-5 options are a real radio group (role radio, aria-checked, roving tab stop, ≥ 48 px), no div-onClick
 *   P0-6 resume: unconfirmed answers kept on the device are merged on load and sent again
 * P1 (structural)
 *   P1-07 resume position + visited set restored (this device); P1-08 CBT controls (Save & Next clears the mark, Mark for
 *   Review & Next, no deselect on re-click, one-click Clear Response with undo); P1-09 palette shapes / icons + legend;
 *   P1-10 one primary action; P1-11 quiet security notices; P1-12 48 px targets; P1-13 accessible dialogs;
 *   P1-14 distinct "Not saved — retrying" state
 * Run: node scripts/test_f3_player.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1500)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

// ---------- TS loader + mocks ----------
const ts = require('typescript');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
const transpile = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = transpile;
require.extensions['.tsx'] = transpile;
let saveResult = 'ok';
const MOCKS = {
  'server-only': {},
  '@/services/assessment.service': { AssessmentService: { saveAnswer: async () => { if (saveResult === 'throw') throw new Error('secret db text'); return saveResult; } } },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;

/** deterministic fake timers */
function clock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimer: (id) => timers.delete(id),
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        for (let i = 0; i < 10; i++) await Promise.resolve();
      }
      now = end;
    },
  };
}
const flushMicro = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

const S = require(path.join(ROOT, 'lib/assessment/answer-sync.ts'));
const T = require(path.join(ROOT, 'lib/assessment/timer.ts'));
const PLAYER = 'app/mock-tests/[id]/take/player-client.tsx';
const P = code(read(PLAYER));

(async () => {
  console.log('F3 mock player');

  await test('P0-1a save route: never a 200 for a failed write (409 closed · 503 failed · 400 invalid), fixed codes only', async () => {
    const { POST } = require(path.join(ROOT, 'app/api/assessment/save-answer/route.ts'));
    const req = (body) => ({ json: async () => body });
    const good = { attemptId: 'a', mockQuestionId: 'q', selectedOption: 'B', isMarkedForReview: false, timeSpentSeconds: 3 };
    const out = {};
    for (const r of ['ok', 'closed', 'error', 'throw']) {
      saveResult = r;
      const res = await POST(req(good));
      out[r] = [res.status, await res.json()];
    }
    assert(out.ok[0] === 200 && out.ok[1].success === true, JSON.stringify(out.ok));
    assert(out.closed[0] === 409 && out.closed[1].code === 'ATTEMPT_CLOSED', JSON.stringify(out.closed));
    assert(out.error[0] === 503 && out.throw[0] === 503 && !JSON.stringify(out.throw).includes('secret'), 'failure must be 503 without error text');
    const bad = await POST(req({ ...good, selectedOption: 'Z' }));
    assert(bad.status === 400, `invalid option → ${bad.status}`);
    for (const [k, [status, body]] of Object.entries(out)) assert(!(status === 200 && body.success !== true), `${k}: 200 with success:false`);
    return '200 ok · 409 · 503 · 400';
  });

  await test('P0-1b engine: "saved" only on server confirmation; failures → "retrying" with backoff; 409 → "closed"', async () => {
    const c = clock();
    const statuses = [];
    const posts = [];
    let reply = { status: 200, body: { success: false } }; // the old bug: 200 + success:false
    const kept = new Map();
    const sync = S.createAnswerSync('att', {
      post: async (b) => { posts.push(b); const r = reply; return { status: r.status, json: async () => r.body }; },
      setTimer: c.setTimer, clearTimer: c.clearTimer, isOnline: () => true,
      keep: (id, a) => kept.set(id, a), forget: (id) => kept.delete(id),
      onStatus: (s) => statuses.push(s),
    });
    sync.save('q1', { selectedOption: 'A', isMarkedForReview: false, timeSpentSeconds: 1 });
    assert(statuses.at(-1) === 'saving' && kept.has('q1'), 'kept on device + saving');
    await c.advance(S.DEBOUNCE_MS);
    await flushMicro();
    assert(statuses.at(-1) === 'retrying' && !statuses.includes('saved') && kept.has('q1'), `200+success:false must NOT be saved: ${statuses}`);
    reply = { status: 503, body: { success: false } };
    await c.advance(S.backoffMs(1));
    await flushMicro();
    assert(statuses.at(-1) === 'retrying' && posts.length === 2, `retry after backoff (${posts.length})`);
    assert(S.backoffMs(1) === 1000 && S.backoffMs(2) === 2000 && S.backoffMs(3) === 4000 && S.backoffMs(20) === 30000, 'backoff 1/2/4 s, cap 30 s');
    reply = { status: 200, body: { success: true } };
    await c.advance(S.backoffMs(2));
    await flushMicro();
    assert(statuses.at(-1) === 'saved' && !kept.has('q1') && sync.pendingCount() === 0, `confirmed → saved: ${statuses.at(-1)}`);
    // closed
    reply = { status: 409, body: { success: false, code: 'ATTEMPT_CLOSED' } };
    sync.save('q2', { selectedOption: 'C', isMarkedForReview: false, timeSpentSeconds: 2 });
    await c.advance(S.DEBOUNCE_MS);
    await flushMicro();
    const n = posts.length;
    await c.advance(60_000);
    assert(statuses.at(-1) === 'closed' && posts.length === n, '409 must stop retrying');
    return 'retrying → saved only on success:true; closed stops';
  });

  await test('P0-1c engine: per-question debounce is independent; offline keeps on the device; a newer edit in flight is re-sent', async () => {
    const c = clock();
    const posts = [];
    let online = true;
    const st = [];
    const sync = S.createAnswerSync('att', {
      post: async (b) => { posts.push(`${b.mockQuestionId}:${b.selectedOption}`); return { status: 200, json: async () => ({ success: true }) }; },
      setTimer: c.setTimer, clearTimer: c.clearTimer, isOnline: () => online, keep: () => {}, forget: () => {}, onStatus: (s) => st.push(s),
    });
    sync.save('A', { selectedOption: 'A', isMarkedForReview: false, timeSpentSeconds: 0 });
    sync.save('B', { selectedOption: 'B', isMarkedForReview: false, timeSpentSeconds: 0 });
    await c.advance(S.DEBOUNCE_MS);
    await flushMicro();
    assert(posts.includes('A:A') && posts.includes('B:B'), `B cancelled A: ${posts}`);
    online = false;
    sync.save('C', { selectedOption: 'D', isMarkedForReview: false, timeSpentSeconds: 0 });
    await c.advance(S.DEBOUNCE_MS);
    await flushMicro();
    assert(st.at(-1) === 'offline' && !posts.includes('C:D'), 'offline: kept, not sent');
    online = true;
    sync.flushAll();
    await c.advance(1);
    await flushMicro();
    assert(posts.includes('C:D') && st.at(-1) === 'saved', `back online → sent: ${st.at(-1)}`);
    return 'independent debounces · offline → sync on reconnect';
  });

  await test('P0-1d offline queue: dequeues ONLY confirmed saves (success:true); 409 dropped; failures stay', async () => {
    const store = new Map();
    global.window = {};
    global.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    const { OfflineAnswerQueue } = require(path.join(ROOT, 'lib/assessment/offline-queue.ts'));
    OfflineAnswerQueue.enqueue('att', 'q1', 'A', false, 1);
    OfflineAnswerQueue.enqueue('att', 'q2', 'B', false, 1);
    OfflineAnswerQueue.enqueue('att', 'q3', 'C', false, 1);
    const replies = { q1: [200, { success: false }], q2: [409, { success: false }], q3: [200, { success: true }] };
    global.fetch = async (_u, o) => { const id = JSON.parse(o.body).mockQuestionId; const [status, body] = replies[id]; return { ok: status < 300, status, json: async () => body }; };
    const synced = await OfflineAnswerQueue.flush('att');
    const left = OfflineAnswerQueue.getPending('att').map((p) => p.mockQuestionId);
    assert(synced === 1 && JSON.stringify(left) === '["q1"]', `synced ${synced}, left ${left}`);
    delete global.window; delete global.localStorage; delete global.fetch;
    return 'q1 kept · q2 dropped (closed) · q3 synced';
  });

  await test('P0-2 submit errors are visible: manual → the summary reopens with the error; auto → retry dialog', () => {
    assert(/setSubmissionError\("Your answers are kept\. Please try again\."\);\s*if \(!isAutoSubmit\) setIsSubmitOpen\(true\);/.test(P), 'manual failure must reopen the dialog');
    assert((P.match(/if \(!isAutoSubmit\) setIsSubmitOpen\(true\);/g) || []).length === 2, 'both failure paths (response + network) reopen it');
    assert(/\(submissionState === "error" && lastSubmitAutoRef\.current\)/.test(P) && /data-retry-submit=""/.test(P) && /onClick=\{\(\) => handleSubmitAttempt\(true\)\}/.test(P), 'auto failure keeps a retry dialog');
    assert(/if \(res\.ok && data\.success && data\.resultId\)/.test(P), 'success needs res.ok + success + resultId');
    const { SubmitDialog } = require(path.join(ROOT, 'components/assessment/submit-dialog.tsx'));
    const html = renderToStaticMarkup(h(SubmitDialog, { isOpen: true, answeredCount: 3, unansweredCount: 2, markedCount: 1, sectionsSummary: [], onConfirm() {}, onCancel() {}, submissionError: 'Your answers are kept. Please try again.' }));
    assert(/Your test was not submitted/.test(html) && /Your answers are kept/.test(html) && /Try submitting again/.test(html), 'dialog error not rendered');
    assert(/<dialog\b/.test(html) && !/amber|accent/.test(html), 'native dialog, no amber');
    return 'reopen + retry';
  });

  await test('P0-3 timer: anchored deadline, clock-based ticks, fires once; re-renders cannot restart it', () => {
    assert(T.remainingSecondsAt(10_000, 0) === 10 && T.remainingSecondsAt(10_000, 9_001) === 1 && T.remainingSecondsAt(10_000, 10_000) === 0 && T.remainingSecondsAt(10_000, 99_999) === 0, 'remaining');
    assert(T.timerPhase(301) === 'normal' && T.timerPhase(300) === 'final' && T.timerPhase(1) === 'final' && T.timerPhase(0) === 'over', 'phases');
    const src = code(read('components/assessment/assessment-timer.tsx'));
    assert(/if \(deadlineRef\.current === null\) deadlineRef\.current = Date\.now\(\) \+/.test(src), 'deadline anchored once');
    assert(/onExpiredRef\.current = onTimeExpired;/.test(src) && /if \(left <= 0 && !firedRef\.current\) \{\s*firedRef\.current = true;\s*onExpiredRef\.current\(\);/.test(src), 'fires once via ref');
    assert(/\}, \[\]\);/.test(src) && !/\[seconds, onTimeExpired\]/.test(src), 'interval effect must not depend on seconds / the callback');
    assert(/remainingSecondsAt\(deadlineRef\.current as number, Date\.now\(\)\)/.test(src), 'ticks recompute from the clock');
    return 'anchored · once · stable';
  });

  await test('P0-4 calm: no sound, no pulse / flash; one quiet final-minutes state', () => {
    const files = ['components/assessment/assessment-timer.tsx', PLAYER, 'components/assessment/adaptive-progress-badge.tsx', 'app/mock-tests/[id]/result/page.tsx', 'components/assessment/submit-dialog.tsx'];
    for (const f of files) {
      const s = code(read(f));
      assert(!/audio-alerts|MockAudio|new Audio|AudioContext|\.play\(/.test(s), `${f}: sound`);
      assert(!/animate-(pulse|ping|bounce)|slide-in-from/.test(s), `${f}: flashing / sliding`);
      assert(!/window\.(alert|confirm)\(/.test(s), `${f}: alert / confirm`);
    }
    assert(!fs.existsSync(path.join(ROOT, 'lib/assessment/audio-alerts.ts')), 'audio module still present');
    const timer = code(read('components/assessment/assessment-timer.tsx'));
    assert(/phase === "final" \? "bg-accent-50 border-accent-300 text-fg" : "bg-canvas border-line text-fg"/.test(timer) && /5 min left/.test(timer) && /aria-live="polite"/.test(timer), 'one quiet final state with text + polite announcement');
    return `${files.length} files calm`;
  });

  await test('P0-5 options: a real radio group with roving focus and ≥ 48 px targets', () => {
    const { QuestionOptions } = require(path.join(ROOT, 'components/assessment/question-options.tsx'));
    const opts = ['A', 'B', 'C', 'D'].map((k) => ({ key: k, text: `opt ${k}` }));
    const html = renderToStaticMarkup(h(QuestionOptions, { options: opts, selectedOption: 'C', onSelectOption() {}, label: 'Answer options for question 3' }));
    assert(/role="radiogroup"/.test(html) && /aria-label="Answer options for question 3"/.test(html), 'radiogroup');
    const radios = html.match(/<button[^>]*role="radio"[^>]*>/g) || [];
    assert(radios.length === 4, `radios ${radios.length}`);
    assert(radios.filter((r) => /aria-checked="true"/.test(r)).length === 1 && radios.filter((r) => /tabindex="0"/i.test(r)).length === 1, 'one checked + one tab stop');
    assert(radios.every((r) => /min-h-12/.test(r) && /focus-ring/.test(r)), '48 px + focus ring');
    const none = renderToStaticMarkup(h(QuestionOptions, { options: opts, selectedOption: null, onSelectOption() {} }));
    assert(((none.match(/tabindex="0"/gi) || []).length === 1), 'unanswered: first option is the tab stop');
    assert(!/<div[^>]*onClick/.test(read('components/assessment/question-options.tsx')), 'div onClick');
    return '4 radios · aria-checked · roving';
  });

  await test('P0-6 resume: unconfirmed answers on the device are merged on load (they win) and sent again', () => {
    const server = { q1: { selectedOption: 'A', isMarkedForReview: false, timeSpentSeconds: 30 }, q2: { selectedOption: null, isMarkedForReview: true, timeSpentSeconds: 5 } };
    const local = [{ mockQuestionId: 'q1', selectedOption: 'C', isMarkedForReview: false, timeSpentSeconds: 12 }, { mockQuestionId: 'q3', selectedOption: 'B', isMarkedForReview: false, timeSpentSeconds: 4 }, { mockQuestionId: 'zz', selectedOption: 'D', isMarkedForReview: false, timeSpentSeconds: 1 }];
    const m = S.mergePending(server, local, new Set(['q1', 'q2', 'q3']));
    assert(m.q1.selectedOption === 'C' && m.q1.timeSpentSeconds === 30 && m.q2.isMarkedForReview === true && m.q3.selectedOption === 'B' && !('zz' in m), JSON.stringify(m));
    assert(/const pending = OfflineAnswerQueue\.getPending\(session\.attemptId\)\.filter\(\(p\) => known\.has\(p\.mockQuestionId\)\);/.test(P) && /pending\.forEach\(\(p\) => getSync\(\)\.save\(p\.mockQuestionId, merged\[p\.mockQuestionId\]\)\);/.test(P), 'player merges + re-sends on load');
    return 'local wins · unknown ignored · re-sent';
  });

  await test('P1 structure: resume position, CBT controls, palette, one primary, quiet notices, 48 px, dialogs, status', () => {
    // P1-07 resume
    assert(/cl_mock_progress_\$\{session\.attemptId\}/.test(P) && /setCurrentIndex\(saved\.index as number\)/.test(P) && /visited: \[\.\.\.visitedQuestions\]/.test(P), 'resume position / visited');
    // P1-08 CBT controls
    assert(/const newSelected = optionKey;/.test(P) && !/currentAnswer\.selectedOption === optionKey \? null/.test(P), 'no deselect on re-click');
    assert(/const handleSaveAndNext = useCallback\(\(\) => \{\s*if \(isAdaptive\) return;\s*setMark\(false\);/.test(P) && /const handleMarkAndNext = useCallback\(\(\) => \{\s*if \(isAdaptive\) return;\s*setMark\(true\);/.test(P), 'Save & Next clears the mark / Mark & Next sets it');
    assert(/Save &amp; Next|"Save & Next"/.test(P) && /Mark for Review &amp; Next/.test(P) && /Clear Response/.test(P), 'CBT labels');
    assert(!/isClearConfirmOpen|Clear Selected Response\?/.test(P) && /onClick=\{executeClearResponse\}/.test(P), 'one-click clear (no confirm modal)');
    assert(!/e\.key === "c" \|\| e\.key === "C"\) \{\s*handleClear/.test(P), 'c no longer clears');
    // P1-09 palette
    const pal = code(read('components/assessment/question-palette.tsx'));
    assert(/marked: "rounded-full bg-cat-violet-700/.test(pal) && /answered: "rounded-md bg-success-700/.test(pal) && /not_answered: "rounded-md bg-danger-700/.test(pal) && /<Check className=\{icon\}/.test(pal) && /<Minus className=\{icon\}/.test(pal), 'shapes + icons per state');
    assert(/PALETTE_STATES\.map/.test(pal) && /aria-label="Legend"/.test(pal) && /PALETTE_STATES/.test(read('components/assessment/instructions-modal.tsx')), 'legend from the same states (palette + instructions)');
    assert(/"focus-ring relative flex size-12/.test(pal) && !/amber|text-\[1[01]px\]/.test(pal), 'cells 48 px, no amber, ≥ 12 px text');
    // P1-10 one primary
    assert(!/bg-emerald-600|bg-amber-|bg-accent-/.test(P), 'filled emerald / amber buttons in the player');
    assert(/variant="outline"\s+disabled=\{isSubmitting \|\| isStepTransitioning\}\s+className="hidden min-h-12 font-semibold md:inline-flex"/.test(P), 'header Submit is quiet (outline)');
    // P1-11 quiet notices
    assert(!/Exam Window Changed|Fullscreen Mode Exited|ShieldAlert/.test(P) && /data-security-notice=""/.test(P), 'security notices are inline, non-blocking');
    // honesty: events are not stored server-side yet (PROCTOR-LOG-1) — the copy must not claim they are
    assert(!/recorded with your attempt|is (being )?(recorded|logged|monitored)/i.test(P), 'player claims security events are recorded (they are not: PROCTOR-LOG-1)');
    // P1-12 48 px
    const smallTarget = /<Button[^>]*\bsize="sm"|<button[^>]*className=[{"`][^>]*\b(h-(6|7|8|9)|p-0\.5|p-1|py-1)\b/;
    assert(!smallTarget.test(P), `small targets remain in the player: ${(P.match(smallTarget) || [''])[0].slice(0, 80)}`);
    assert((P.match(/<(Button|button)\b/g) || []).length >= 20 && (P.match(/min-h-12|size-12/g) || []).length >= 20, 'player controls carry 48 px classes');
    // P1-13 dialogs
    assert(/<Dialog open=\{isMobilePaletteOpen\}/.test(P) && /dismissible=\{false\}/.test(P) && /from "@\/components\/ui\/dialog"/.test(read('components/assessment/submit-dialog.tsx')) && /from "@\/components\/ui\/dialog"/.test(read('components/assessment/instructions-modal.tsx')), 'accessible dialogs');
    // P1-14 status
    assert(/retrying: \{[^}]*text: "Not saved — retrying"/.test(P) && /offline: \{[^}]*text: "Offline — kept on this device"/.test(P), 'distinct not-saved / offline states');
    return '07–14';
  });

  // F3-polish (owner follow-up B): one static check per item, no screenshots
  await test('F3-polish: watermark density + contrast, submit terms, tabs, palette filters, header labels, quiet report', () => {
    const P = code(read('app/mock-tests/[id]/take/player-client.tsx'));
    // B1 watermark: ≤ 1 mark per 400×300 px; question text ≥ 4.5:1 against the watermarked surface (measured)
    const W = read('components/assessment/candidate-security-watermark.tsx');
    const num = (name) => Number((W.match(new RegExp(`export const ${name} = ([0-9.]+)`)) || [])[1]);
    const tile = W.match(/WATERMARK_TILE = \{ width: (\d+), height: (\d+) \}/);
    const inkTok = (W.match(/WATERMARK_INK = BRAND_PALETTE\["([a-z0-9-]+)"\]/) || [])[1];
    assert(tile && Number(tile[1]) * Number(tile[2]) >= 400 * 300 && Number(tile[1]) >= 400 && Number(tile[2]) >= 300, 'watermark tile smaller than 400×300');
    assert(num('WATERMARK_MARKS_PER_TILE') === 1 && (W.match(/<text /g) || []).length === 2, 'watermark: exactly one two-line mark per tile');
    assert(/data-watermark=""/.test(W) && /<CandidateSecurityWatermark/.test(P), 'watermark still present in the player (anti-leak)');
    const css = read('app/globals.css');
    const tok = (n) => (css.match(new RegExp(`--color-${n}: (#[0-9a-f]{6})`, 'i')) || [])[1];
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const worst = Math.max(num('WATERMARK_OPACITY'), num('WATERMARK_OPACITY_LIGHTER'));
    const ink = tok(inkTok);
    const bg = rgb('#ffffff').map((v, i) => v * (1 - worst) + rgb(ink)[i] * worst); // surface under a watermark glyph
    const contrasts = ['ink-900', 'ink-600'].map((t) => ratio(rgb(tok(t)), bg));
    assert(contrasts.every((c) => c >= 4.5), `text contrast on watermark ${contrasts.map((c) => c.toFixed(2)).join(' / ')} < 4.5`);
    // B2 submit dialog = palette terms (5 counts) + section table kept
    const SD = read('components/assessment/submit-dialog.tsx');
    assert(/PALETTE_STATES\.map\(\(s\) => \(\{ key: s\.status, label: s\.label/.test(SD) && /stateCounts=\{stateCounts\}/.test(P) && /By section/.test(SD), 'submit dialog does not use the five palette states / section table');
    // B3 section tabs: wrap (no horizontal scroll) at ≥ 1024 px; mobile scrolls with no visible scrollbar
    assert(/data-section-tabs="" className="\[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden [^"]*overflow-x-auto[^"]*lg:flex-wrap lg:overflow-visible"/.test(P) && /lg:whitespace-normal/.test(P), 'section tabs scroll on desktop');
    // B4 palette filters: no truncation / scroll
    const PAL = read('components/assessment/question-palette.tsx');
    const filt = PAL.slice(PAL.indexOf('const pill ='), PAL.indexOf('return (', PAL.indexOf('const pill ='))) + PAL.slice(PAL.indexOf('data-palette-filters'), PAL.indexOf('</div>', PAL.indexOf('data-palette-filters')));
    assert(/data-palette-filters="" className="grid grid-cols-2/.test(filt) && !/truncate|whitespace-nowrap|overflow-x-auto/.test(filt), 'palette filter labels can truncate / scroll');
    // B5 header: visible labels at ≥ 1024 px, tooltip + aria-label below
    assert(/<Tooltip content="Instructions"[^>]*className="lg:hidden">/.test(P) && /aria-label="Instructions"[^>]*data-header-label="instructions"/.test(P) && /className="hidden lg:inline">Instructions</.test(P), 'Instructions label');
    assert(/<Tooltip content="Full screen"[^>]*className="lg:hidden">/.test(P) && /aria-label="Full screen"/.test(P) && /className="hidden lg:inline">Full screen</.test(P), 'Full screen label');
    // B6 report: once, a quiet link under the options — not in the control row / palette sheet
    const footStart = P.indexOf('data-cbt="mark-next"');
    const footer = P.slice(footStart, P.indexOf('</main>'));
    assert((P.match(/<ReportQuestionButton/g) || []).length === 1 && /data-report-slot=""[\s\S]{0,80}<ReportQuestionButton/.test(P) && !/ReportQuestionButton/.test(footer) && footStart > 0 && P.indexOf('<ReportQuestionButton') < footStart, 'report button still in the control row');
    return `contrast ${contrasts.map((c) => c.toFixed(1)).join(' / ')}:1 at opacity ${worst}`;
  });

  console.log(`\nF3 player: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
