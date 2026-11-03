#!/usr/bin/env node
require('../db/safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output (scripts/db/safe-net.cjs)
/**
 * COURSE-UX-1 — UI gate on the LOCAL production build (refuses any other host). The course is not launched, so the
 * course screens are checked as the QA admin (staff PREVIEW); the student flow runs on the master lesson page as the QA
 * student. Writes only QA reading evidence / progress (removed at the end for the QA admin and staff here, and for the
 * QA student by scripts/e2e/cleanup-student.cjs with E2E_KEEP_USER=1).
 *   U-1 course home @390 / @1280: preview label; honest counts ("N lessons ready · x of y topics have lessons", equal
 *       to the server model); one solid primary; subject cards; no horizontal scroll; targets ≥ 48 px; axe 0; CLS < 0.01
 *   U-2 subject page: every syllabus topic; "Coming soon" is never inside a link; practice labels "Practice N
 *       question(s)" with N ≤ 10; axe 0; CLS < 0.01
 *   U-3 reader in the course: outline (desktop rail / phone sheet), previous / next, "On this page", minutes; the
 *       page source carries NO quick-check key ("correct": … / feedback); focus mode hides the rails and survives a reload;
 *       axe 0; CLS < 0.01
 *   U-4 student: every quick check answered on the server (status shown); "Mark complete" disabled until the end is on
 *       screen; an early click → "Keep reading"; after the server time → "Lesson completed" + practice label; a reload
 *       keeps it (server state); resume: the reader returns at the saved block
 *   U-5 visitor: a quick check is checked by the server; no "Mark complete"; a sign-in link
 *   U-6 coins switched off: no header balance, no "+N coins"
 * COURSE-POLISH-1 additions: honest plurals (never "1 lessons" / "1 topics"); a Current Affairs topic links to the CA hub
 * and lists no lesson; the reader eyebrow is "<Subject> · <Topic>" (no level word); previous / next show names; the
 * phone outline is a native popover; "On this page" marks the current section (aria-current=location); the completion
 * checklist drives the button (primary only when end + quick checks + time are met).
 * Run: node scripts/live/with-server.cjs -- "node scripts/live/test_course_ux1_ui.cjs http://localhost:3100 [--shots=<dir>]"
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { chromium } = require('playwright');
const { qaCookies } = require(path.join(ROOT, 'scripts/live/qa-session.cjs'));
const { pgClient } = require(path.join(ROOT, 'scripts/db/safe-net.cjs'));
const BASE = (process.argv.slice(2).find((a) => /^https?:/.test(a)) || 'http://localhost:3100').replace(/\/$/, '');
const SHOTS = (process.argv.find((a) => a.startsWith('--shots=')) || '').slice(8);
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) { console.error('refused: local build only'); process.exit(2); }
if (SHOTS && path.resolve(SHOTS).startsWith(ROOT)) { console.error('refused: screenshots never go inside the repository'); process.exit(2); }
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js', { paths: [ROOT] }), 'utf8');
const EXAM = 'ssc-cgl';
let ok = true;
const chk = (n, c, info) => { if (!c) ok = false; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${c ? '' : ' — ' + String(info).slice(0, 600)}`); };

const CLS_INIT = () => {
  window.__cls = 0;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
};
const smallTargets = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  return [...document.querySelectorAll('main a[href], main button, main summary, main input')]
    .filter(vis)
    .filter((e) => !e.closest('.sr-only') && !e.closest('[data-lesson-blocks] p, [data-lesson-blocks] li, [data-lesson-blocks] td'))
    .map((e) => { const b = (e.matches('input[type="radio"], input[type="checkbox"]') && e.closest('label') ? e.closest('label') : e).getBoundingClientRect(); return { t: `${e.tagName.toLowerCase()} "${(e.textContent || '').trim().slice(0, 30)}"`, w: Math.round(b.width), h: Math.round(b.height) }; })
    .filter((x) => x.h < 48 || x.w < 24);
};
async function audit(page) {
  await page.addScriptTag({ content: AXE });
  const axe = await page.evaluate(async () => (await window.axe.run(document.querySelector('main') || document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map((v) => `${v.id}×${v.nodes.length}`));
  return {
    axe,
    small: await page.evaluate(smallTargets),
    hscroll: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
    cls: await page.evaluate(() => Math.round((window.__cls || 0) * 1000) / 1000),
  };
}
async function open(page, url) {
  const res = await page.goto(BASE + url, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  return res;
}
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const db = pgClient();
  await db.connect();
  const ids = {};
  for (const k of ['student', 'staff', 'admin']) ids[k] = (await db.query(`select id from auth.users where email = $1`, [`qa-${k}@courage-library.test`])).rows[0]?.id;
  const adminCookies = await qaCookies('qa-admin@courage-library.test', BASE);
  const studentCookies = await qaCookies('qa-student@courage-library.test', BASE);
  const cookieList = (list) => list.map((c) => ({ name: c.name, value: c.value, domain: new URL(BASE).hostname, path: '/' }));
  let lessonHref = null;
  try {
    for (const width of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, isMobile: width < 500, hasTouch: width < 500, bypassCSP: true });
      await ctx.addInitScript(CLS_INIT);
      await ctx.addCookies(cookieList(adminCookies));
      const page = await ctx.newPage();

      // U-1 course home
      const r1 = await open(page, `/exams/${EXAM}/course`);
      const home = await page.evaluate(() => ({
        preview: /Preview — this course is not launched/.test(document.body.innerText),
        counts: document.querySelector('[data-testid="course-counts"]')?.textContent?.trim() || '',
        subjects: [...document.querySelectorAll('[data-testid="course-subject"]')].map((a) => a.getAttribute('href')),
        primaries: document.querySelectorAll('main .bg-brand').length,
        badPlural: /\b1 (lessons|topics)\b/.test(document.querySelector('main')?.innerText || ''),
      }));
      const a1 = await audit(page);
      await shot(page, `course-home-${width}`);
      chk(`U-1 course home @${width}: preview label; honest counts; subject cards; one primary; no h-scroll; targets ≥ 48 px; axe 0; CLS < 0.01`,
        r1.status() === 200 && home.preview && /^\d+ lessons? ready · \d+ of \d+ topics? (has|have) lessons$/.test(home.counts) && !home.badPlural && home.subjects.length > 0 && home.primaries === 1
          && !a1.hscroll && a1.small.length === 0 && a1.axe.length === 0 && a1.cls < 0.01,
        JSON.stringify({ status: r1.status(), home, a1 }));

      // U-2 subject page (the first subject that has lessons, else the first)
      if (home.subjects.length === 0) { chk(`U-2 subject page @${width}`, false, 'no subject cards'); await ctx.close(); continue; }
      let best = null;
      const caRows = [];
      for (const href of home.subjects) {
        await open(page, href);
        caRows.push(...(await page.evaluate(() => [...document.querySelectorAll('[data-state="current-affairs"]')].map((r) => ({
          hub: r.querySelector('[data-testid="go-current-affairs"]')?.getAttribute('href') || null,
          lessons: r.querySelectorAll('[data-testid="course-lesson"]').length,
        })))));
        if (!best && (await page.locator('[data-testid="course-lesson"]').count())) best = href;
      }
      best = best || home.subjects[0];
      chk(`U-2b Current Affairs @${width}: ${caRows.length} CA topic row(s) → the CA hub, no lesson listed`, caRows.every((r) => r.hub === '/current-affairs' && r.lessons === 0), JSON.stringify(caRows));
      await open(page, best);
      const subj = await page.evaluate(() => ({
        topics: document.querySelectorAll('[data-testid="course-topic"]').length,
        soonInLink: [...document.querySelectorAll('[data-testid="coming-soon"]')].some((e) => e.closest('a')),
        soon: document.querySelectorAll('[data-testid="coming-soon"]').length,
        practice: [...document.querySelectorAll('[data-testid="topic-practice"]')].map((a) => a.textContent.trim()),
        lesson: document.querySelector('[data-testid="course-lesson"]')?.getAttribute('href') || null,
        badPlural: /\b1 (lessons|topics)\b/.test(document.querySelector('main')?.innerText || ''),
      }));
      lessonHref = lessonHref || subj.lesson;
      const a2 = await audit(page);
      await shot(page, `course-subject-${width}`);
      chk(`U-2 subject page @${width}: ${subj.topics} topics (${subj.soon} coming soon, never a link); practice labels honest; axe 0; targets; CLS < 0.01`,
        subj.topics > 0 && !subj.soonInLink && !subj.badPlural && subj.practice.every((t) => /^Practice ([1-9]|10) questions?$/.test(t)) && !a2.hscroll && a2.small.length === 0 && a2.axe.length === 0 && a2.cls < 0.01,
        JSON.stringify({ subj, a2 }));

      // U-3 reader in the course
      if (!lessonHref) { chk(`U-3 reader @${width}`, false, 'no lesson link on the subject page'); await ctx.close(); continue; }
      const res3 = await open(page, lessonHref);
      const html = await res3.text();
      const reader = await page.evaluate(() => {
        const shown = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        return {
          outline: shown('aside [data-testid="course-outline"]'),
          bar: shown('[data-testid="lesson-bottom-bar"]'),
          otp: shown('[data-testid="on-this-page"]') || shown('[data-testid="on-this-page-phone"]') || document.querySelectorAll('[data-lesson-blocks] h2').length < 2,
          minutes: shown('[data-testid="lesson-minutes"]'),
          checks: document.querySelectorAll('[data-quick-check]').length,
          nav: document.querySelectorAll('[data-testid="lesson-next"], [data-testid="lesson-prev"]').length,
          navNames: [...document.querySelectorAll('[data-testid="lesson-next"], [data-testid="lesson-prev"]')].every((a) => a.innerText.replace(/^(Previous|Next)\s*/, '').trim().length > 0),
          eyebrow: document.querySelector('[data-article] header p')?.textContent?.trim() || '',
        };
      });
      const leak = /\\?"correct\\?":(true|false)|\\?"feedback\\?":/.test(html);
      let sheet = true;
      if (width < 500) {
        console.log('INFO reader @390', JSON.stringify(reader));
        await page.locator('[data-testid="lesson-bottom-bar"]').scrollIntoViewIfNeeded().catch(() => null);
        await page.click('[data-testid="outline-open"]', { timeout: 8000 }).catch((e) => console.log('INFO outline click', String(e.message).split(/\r?\n/).slice(0, 6).join(' | ')));
        await page.waitForTimeout(300);
        sheet = await page.evaluate(() => !!document.querySelector('#course-outline-sheet:popover-open [data-testid="course-outline"]'));
        await page.keyboard.press('Escape');
      }
      const a3 = await audit(page);
      await shot(page, `reader-${width}`);
      let spy = true;
      if (width >= 1024) {
        // scroll-spy: bring the second section heading near the top → its "On this page" link is current
        const target = await page.evaluate(() => { const h = document.querySelectorAll('[data-lesson-blocks] h2[id]')[1]; if (!h) return null; h.scrollIntoView({ block: 'start' }); return h.id; });
        await page.waitForTimeout(400);
        spy = target === null || (await page.evaluate((id) => document.querySelector(`[data-testid="on-this-page"] [data-otp="${id}"]`)?.getAttribute('aria-current') === 'location', target));
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      let focus = true;
      if (width >= 1024) {
        await page.click('[data-testid="focus-toggle"]');
        await page.waitForTimeout(200);
        const hidden1 = await page.evaluate(() => getComputedStyle(document.querySelector('aside')).display === 'none');
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(600);
        const hidden2 = await page.evaluate(() => getComputedStyle(document.querySelector('aside')).display === 'none');
        await shot(page, `reader-focus-${width}`);
        await page.click('[data-testid="focus-toggle"]');
        focus = hidden1 && hidden2;
      }
      chk(`U-3 reader @${width}: ${width < 500 ? 'outline popover + bottom bar' : 'outline rail; scroll-spy'}; eyebrow "<Subject> · <Topic>"; prev / next with names; On this page; minutes; NO quick-check key in the page source; ${width >= 1024 ? 'focus mode hides the rails + survives reload; ' : ''}axe 0; CLS < 0.01`,
        res3.status() === 200 && (width < 500 ? reader.bar && sheet : reader.outline) && reader.nav > 0 && reader.navNames && /^[^·]+ · [^·]+$/.test(reader.eyebrow) && !/Subtopic|Concept/.test(reader.eyebrow) && spy && reader.otp && reader.minutes && reader.checks > 0 && !leak && focus && !a3.hscroll && a3.axe.length === 0 && a3.small.length === 0 && a3.cls < 0.01,
        JSON.stringify({ status: res3.status(), reader, sheet, spy, leak, focus, a3 }));
      await ctx.close();
    }

    // U-4 student flow (the master lesson page; the course is not LIVE, so no course chrome for students)
    const plain = lessonHref.split('?')[0];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies(cookieList(studentCookies));
    const page = await ctx.newPage();
    await open(page, plain);
    const btn = page.locator('[data-testid="mark-complete"]');
    const state = () => page.evaluate(() => ({
      end: document.querySelector('[data-testid="check-end"]')?.getAttribute('data-done'),
      quick: document.querySelector('[data-testid="check-quick"]')?.getAttribute('data-done'),
      quickText: document.querySelector('[data-testid="check-quick"]')?.textContent?.trim(),
      time: document.querySelector('[data-testid="check-time"]')?.getAttribute('data-done'),
      ready: document.querySelector('[data-testid="mark-complete"]')?.getAttribute('data-ready'),
      primary: document.querySelector('[data-testid="mark-complete"]')?.classList.contains('bg-brand') || false,
      disabled: document.querySelector('[data-testid="mark-complete"]')?.disabled,
      checklistFirst: (() => { const c = document.querySelector('[data-testid="complete-checklist"]'); const b = document.querySelector('[data-testid="mark-complete"]'); return !!c && !!b && !!(c.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); })(),
    }));
    const s0 = await state();
    const qc = await page.locator('[data-quick-check]').count();
    for (let i = 0; i < qc; i++) {
      const box = page.locator('[data-quick-check]').nth(i);
      await box.scrollIntoViewIfNeeded();
      await box.locator('input[type="radio"]').first().check();
      await box.locator('[role="status"] p:not(:has-text("Checking"))').waitFor({ timeout: 10000 });
    }
    const results = await page.$$eval('[data-quick-check] [role="status"]', (els) => els.map((e) => e.textContent.trim()));
    await btn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const s1 = await state();
    const [{ m }] = (await db.query(`select public.fn_lesson__reading_minutes(dv.blocks) m from public.document_versions dv join public.learning_documents d on d.id = dv.document_id
       join public.canonical_taxonomy_nodes n on n.id = d.node_id where n.hierarchy_path = $1 and dv.language = 'en' and dv.is_current and dv.is_published`, [plain.replace(/^\/learn\//, '').split('/').join('.')])).rows;
    const [{ started }] = (await db.query(`select extract(epoch from now() - s.started_at)::int started from public.lesson_reading_sessions s join public.learning_documents d on d.id = s.document_id
       join public.canonical_taxonomy_nodes n on n.id = d.node_id where s.user_id = $1 and n.hierarchy_path = $2`, [ids.student, plain.replace(/^\/learn\//, '').split('/').join('.')])).rows;
    const waitS = Math.max(0, Math.max(60, Math.ceil(0.4 * m * 60)) - started + 7);
    console.log(`INFO waiting ${waitS} s for the server-side reading time (${m} min lesson)`);
    await page.waitForTimeout(waitS * 1000);
    const s2 = await state();
    await btn.click();
    const done = await page.locator('[data-testid="lesson-complete"] [role="status"]:has-text("Lesson completed")').waitFor({ timeout: 10000 }).then(() => true, () => false);
    const practice = await page.locator('[data-testid="lesson-practice"]').textContent().catch(() => null);
    const coins = await page.locator('[data-testid="coins-toast"]').count();
    await page.reload({ waitUntil: 'load' });
    const kept = await page.locator('[data-testid="lesson-complete"]:has-text("Lesson completed")').count();
    await shot(page, 'reader-completed-1280');
    chk('U-4 student: checklist above the button from server state; button disabled and not primary until end + every quick check + time; then primary → "Lesson completed" (kept after reload); quick checks checked by the server; practice label honest; no coins (off)',
      qc > 0 && results.every((t) => /^(Correct|Not quite)\./.test(t)) && s0.checklistFirst && s0.disabled && !s0.primary && s0.quick === 'false'
        && s1.end === 'true' && s1.quick === 'true' && s1.time === 'false' && s1.disabled && !s1.primary
        && s2.ready === 'true' && s2.primary && !s2.disabled && done && kept === 1 && (practice === null || /^Practice ([1-9]|10) questions?$/.test(practice.trim())) && coins === 0,
      JSON.stringify({ qc, resultsOk: results.map((t) => /^(Correct|Not quite)\./.test(t)), s0, s1, s2, waitS, done, kept, practice, coins }));

    // resume: another lesson, read to the middle, wait for the throttled save, come back
    const other = (await db.query(`select n.hierarchy_path p from public.fn_servable_node_lessons() s join public.canonical_taxonomy_nodes n on n.id = s.node_id
       where n.hierarchy_path <> $1 order by n.hierarchy_path limit 1`, [plain.replace(/^\/learn\//, '').split('/').join('.')])).rows[0];
    let resumed = null;
    if (other) {
      const url = `/learn/${other.p.split('.').join('/')}`;
      await open(page, url);
      await page.evaluate(() => { const b = [...document.querySelectorAll('[data-lesson-blocks] > [data-block-id]')]; b[Math.floor(b.length / 2)].scrollIntoView(); });
      await page.waitForTimeout(16500);
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await open(page, '/dashboard');
      await open(page, url);
      resumed = await page.evaluate(() => window.scrollY);
    }
    chk('U-4b resume: the reader returns at the server-saved block', resumed === null || resumed > 300, JSON.stringify({ resumed }));
    chk('U-6 coins off: no header balance', (await page.locator('[data-testid="header-coins"]').count()) === 0, 'header balance shown');
    await ctx.close();

    // U-5 visitor
    const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const ap = await anon.newPage();
    await open(ap, plain);
    const first = ap.locator('[data-quick-check]').first();
    await first.scrollIntoViewIfNeeded();
    await first.locator('input[type="radio"]').first().check();
    const answered = await first.locator('[role="status"] p:not(:has-text("Checking"))').waitFor({ timeout: 10000 }).then(async () => (await first.locator('[role="status"]').textContent()).trim(), () => '');
    const mark = await ap.locator('[data-testid="mark-complete"]').count();
    const signIn = await ap.locator('main a[href^="/auth/login"]').count();
    chk('U-5 visitor: the server checks a quick check (nothing recorded); no "Mark complete"; a sign-in link', /^(Correct|Not quite)\./.test(answered) && mark === 0 && signIn > 0, JSON.stringify({ answered, mark, signIn }));
    await anon.close();
  } catch (e) {
    chk('run', false, e.message);
  } finally {
    // the QA admin / staff previewed lessons: remove their reading records (QA identities only)
    for (const t of ['lesson_quick_check_attempts', 'lesson_reading_sessions', 'user_lesson_progress']) {
      await db.query(`delete from public.${t} where user_id = any($1::uuid[])`, [[ids.admin, ids.staff].filter(Boolean)]).catch(() => null);
    }
    await db.query(`delete from public.learning_activity_events where user_id = any($1::uuid[]) and event_type = 'ARTICLE_VIEWED'`, [[ids.admin, ids.staff].filter(Boolean)]).catch(() => null);
    await db.end().catch(() => {});
    await browser.close();
  }
  console.log(ok ? 'COURSE-UX-1 UI: ALL PASS' : 'COURSE-UX-1 UI: FAILURES');
  process.exit(ok ? 0 : 1);
})();
