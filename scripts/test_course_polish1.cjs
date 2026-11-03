#!/usr/bin/env node
/**
 * COURSE-POLISH-1 (owner review of the staff preview, 2026-11-03) — offline gate.
 *   P-1 Current Affairs: a unit mapped only under …/current-affairs is CURRENT_AFFAIRS — no lessons in it, never in the
 *       course order (so never "next lesson" / continue), not counted as lessons; its row links to the CA hub
 *   P-2 outline = subject → topic name → lessons; lesson names are the published lesson titles (not node labels)
 *   P-3 reader eyebrow "<Subject> · <Topic>"; no "Subtopic" / "Concept" / "Topic" level word on student pages
 *   P-4 plurals: every count on the course pages goes through plural / completedText ("1 lesson", "1 topic")
 *   P-5 completion: a checklist (end · quick checks x/y · time) from server state, above the button; the button is the
 *       primary only when all are met (disabled before); the server still decides
 *   P-6 previous / next show the lesson names
 *   P-7 exam notes: "<Exam> exam note" only from PUBLISHED exam notes; "How exams ask this" gone
 *   P-8 On this page: links carry data-otp; the scroll pass sets aria-current="location"; current style present;
 *       the phone outline is a native popover (no client sheet)
 * --self-test: NEGATIVE CONTROLS — one mutation per rule must fail.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const F = {
  structure: 'lib/learning/course-structure.ts',
  service: 'services/learning/course.service.ts',
  master: 'services/learning/master-lesson.service.ts',
  reader: 'components/learning/master-lesson-page.tsx',
  client: 'components/learning/lesson-reader-client.tsx',
  complete: 'components/learning/lesson-complete.tsx',
  courseUi: 'components/learning/course-ui.tsx',
  home: 'app/(site)/exams/[slug]/course/page.tsx',
  subject: 'app/(site)/exams/[slug]/course/[subject]/page.tsx',
};
function loadTs(src) {
  const ts = require('typescript');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', out)((id) => (id.startsWith('@/') ? {} : require(id)), mod, mod.exports);
  return mod.exports;
}

function check(over = {}) {
  const f = Object.fromEntries(Object.entries(F).map(([k, p]) => [k, k in over ? over[k] : read(p)]));
  const fails = [];
  const t = (id, cond, msg) => { if (!cond) fails.push(`${id}: ${msg}`); };

  // P-1 Current Affairs (pure)
  let S = null;
  try { S = loadTs(f.structure); } catch { /* reported below */ }
  if (S && S.buildCourseStructure) {
    const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const nodes = [
      { id: U(1), parentId: null, kind: 'SECTION', title: 'General Awareness', slug: 'ga', order: 1, weightageTier: null, mapped: [] },
      { id: U(2), parentId: U(1), kind: 'UNIT', title: 'Current Affairs', slug: 'ca', order: 1, weightageTier: 'HIGH_YIELD', mapped: [{ nodeId: U(20), topicId: U(200) }] },
      { id: U(3), parentId: U(1), kind: 'UNIT', title: 'History', slug: 'history', order: 2, weightageTier: null, mapped: [{ nodeId: U(30), topicId: U(300) }] },
    ];
    const lesson = (n, nodeId, name) => ({ documentId: U(n), nodeId, name, nodeType: 'SUBTOPIC', position: 1, href: `/learn/x/${n}`, hiAvailable: false, access: 'FREE', locked: false, status: 'NOT_STARTED', minutes: 3 });
    const cs = S.buildCourseStructure({
      nodes,
      lessons: [lesson(11, U(21), 'International CA'), lesson(12, U(30), 'Ancient India')],
      paths: { [U(20)]: 'general-awareness.current-affairs', [U(21)]: 'general-awareness.current-affairs.international', [U(30)]: 'general-awareness.history' },
      practice: new Map([[U(200), 4]]),
    });
    const ca = cs.subjects[0].topics[0];
    t('P-1a', ca.state === 'CURRENT_AFFAIRS' && ca.lessons.length === 0 && ca.practice && ca.practice.label === 'Practice 4 questions', `CA topic: no lessons, practice kept (${JSON.stringify({ state: ca.state, n: ca.lessons.length })})`);
    t('P-1b', cs.order.map((l) => l.name).join() === 'Ancient India' && cs.totals.lessons === 1 && S.continueLesson(cs.order, []).name === 'Ancient India', 'a CA lesson is never in the course order / counts / continue');
    t('P-1c', S.isCurrentAffairsPath('general-awareness.current-affairs.x') && !S.isCurrentAffairsPath('general-awareness.history') && !S.isCurrentAffairsPath('current-affairs'), 'CA path rule (second segment)');
    t('P-4a', S.plural(1, 'lesson') === '1 lesson' && S.plural(2, 'lesson') === '2 lessons' && S.completedText(0, 1) === '0 of 1 lesson completed' && S.topicsReadyText(1, 1) === '1 of 1 topic ready' && S.lessonsReadyText(1) === '1 lesson ready', 'plural helpers');
  } else t('P-1', false, 'course-structure not loadable');
  t('P-1d', /topic\.state === "CURRENT_AFFAIRS" \? \(\s*<ButtonLink href=\{CURRENT_AFFAIRS_HREF\}/.test(f.courseUi) && /Go to Current Affairs/.test(f.courseUi) && /CURRENT_AFFAIRS_HREF = "\/current-affairs"/.test(f.structure), 'CA row → "Go to Current Affairs" (hub)');

  // P-2 outline + titles
  t('P-2', /\.filter\(\(t\) => t\.lessons\.length > 0\)\s*\.map\(\(t\) => \(\s*<li key=\{t\.unitId\}>\s*<p className="[^"]*">\{t\.title\}<\/p>/.test(f.reader) && /name: titles\.get\(l\.documentId\) \?\? l\.name/.test(f.service) && /select\("document_id, blocks, lesson_meta"\)/.test(f.service),
    'outline: topic name with its lessons; lesson names = published titles');

  // P-3 eyebrow, no level words
  const studentText = [f.reader, f.courseUi, f.home, f.subject].join('\n');
  t('P-3', /\[data\.node\.subjectName, data\.node\.topicName\]\.filter\(Boolean\)\.join\(" · "\)/.test(f.reader) && !/"Subtopic"|"Concept"|SUBTOPIC: "|LEVEL\[/.test(studentText), 'eyebrow "<Subject> · <Topic>"; no level words');

  // P-4 no hand-made counts on the course pages
  t('P-4b', !/\$\{(?![^}]*\b(?:has|have)\b)[^}]*\}\s+(lessons|topics)\b|\}\s+(lessons|topics) (completed|ready|have)|of \{[^}]+\} lessons completed/.test([f.courseUi, f.home, f.subject, f.reader].join('\n')), 'no "N lessons" / "N topics" outside the plural helpers');

  // P-5 completion checklist
  t('P-5', /data-testid="complete-checklist"/.test(f.complete) && /testId="check-end"/.test(f.complete) && /testId="check-quick"/.test(f.complete) && /testId="check-time"/.test(f.complete)
    && /const ready = atEnd && checksOk && timeOk;/.test(f.complete) && /disabled=\{!ready \|\| pending\}/.test(f.complete) && /className=\{ready \? PRIMARY : WAITING\}/.test(f.complete)
    && f.complete.indexOf('complete-checklist') < f.complete.indexOf('data-testid="mark-complete"') && /completeLessonAction/.test(f.complete)
    && /evidence =\s*progress && progress !== "COMPLETED"/.test(f.master) && /from\("lesson_reading_sessions"\)/.test(f.master), 'checklist from server state above the button; primary only when ready; server decides');

  // P-6 previous / next names
  t('P-6', (f.reader.match(/<span className="truncate text-body-sm font-semibold">\{lesson\.name\}<\/span>/g) || []).length === 2, 'previous / next show the lesson names');

  // P-7 exam notes
  t('P-7', !/How exams ask this/.test(f.reader) && /\{n\.examTitle\} exam note/.test(f.reader) && /from\("exam_node_notes"\)[\s\S]{0,200}\.eq\("status", "PUBLISHED"\)/.test(f.master), 'exam notes from PUBLISHED notes only; old heading gone');

  // P-8 scroll-spy + popover
  t('P-8', /data-otp=\{headingAnchor\(h\.id\)\}/.test(f.reader) && /aria-\[current=location\]:/.test(f.reader) && /setAttribute\("aria-current", "location"\)/.test(f.client) && /popover="auto"/.test(f.reader) && /popoverTarget="course-outline-sheet"/.test(f.reader)
    && !/OutlineSheet/.test(f.client + f.reader), 'On this page scroll-spy (aria-current=location); native popover outline');
  return fails;
}

const fails = check();
if (process.argv.includes('--self-test')) {
  const mut = (k, from, to) => { const s = read(F[k]); if (!s.includes(from)) throw new Error(`control anchor missing in ${k}: ${from.slice(0, 50)}`); return { [k]: s.replace(from, to) }; };
  const controls = [
    ['P-1 CA kept in course', mut('structure', '    if (currentAffairs) lessons.length = 0;', '    if (false) lessons.length = 0;')],
    ['P-1d CA row without hub link', mut('courseUi', 'Go to Current Affairs', 'Read more')],
    ['P-2 node label instead of title', mut('service', 'name: titles.get(l.documentId) ?? l.name, ', '')],
    ['P-3 level word back', mut('reader', '{[data.node.subjectName, data.node.topicName].filter(Boolean).join(" · ") || "Lesson"}', '{"Subtopic"}')],
    ['P-4 plural bug', mut('structure', '`${n} ${n === 1 ? one : many}`', '`${n} ${many}`')],
    ['P-5 button always primary', mut('complete', 'className={ready ? PRIMARY : WAITING}', 'className={PRIMARY}')],
    ['P-6 names hidden', mut('reader', '<span className="truncate text-body-sm font-semibold">{lesson.name}</span>', '<span className="sr-only">{lesson.name}</span>')],
    ['P-7 notes not from published', mut('master', '.in("node_id", noteNodes.map((n) => n.id))\n    .eq("status", "PUBLISHED");', '.in("node_id", noteNodes.map((n) => n.id));')],
    ['P-8 no scroll-spy', mut('client', 'a.setAttribute("aria-current", "location")', 'a.setAttribute("data-x", "1")')],
  ];
  let bad = 0;
  for (const [name, over] of controls) {
    const caught = check(over).length > fails.length;
    if (!caught) bad++;
    console.log(`  ${caught ? 'PASS' : 'FAIL'}  negative control: ${name} ${caught ? 'is caught' : 'is NOT caught'}`);
  }
  if (bad) { console.log(`COURSE-POLISH-1 self-test: ${bad} control(s) not caught`); process.exit(1); }
}
for (const x of fails) console.log(`  FAIL  ${x}`);
console.log(fails.length ? `COURSE-POLISH-1 offline: ${fails.length} FAILURE(S)` : 'COURSE-POLISH-1 offline: ALL PASS');
process.exit(fails.length ? 1 : 0);
