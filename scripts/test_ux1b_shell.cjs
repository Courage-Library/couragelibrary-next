/**
 * UX-1b app shell, static suite (offline; reads source files only).
 *
 *   U-1 no internal / dev labels in student-facing UI: app/ + components/ (admin and api excluded), comments
 *       stripped. Forbidden: "Phase 3J", "Pilot", "Command Center", "authoritative", "deterministic",
 *       "telemetry", "SRS", "SM-2", "UUID", "canonical Question Bank / curriculum", "taxonomies", "debug",
 *       visible "Supabase"
 *   U-2 no dead links in the shell: every href in components/shell resolves to an app/ route (page.tsx);
 *       U-2b the same for the admin sidebar (GAP2-4c)
 *   U-3 shell structure: skip link → #main-content; one <main id="main-content">; header / nav / footer
 *       landmarks; the mobile menu and account sheet use the native-dialog Dialog; the bottom nav hides in
 *       admin and the test console and reserves its height (no layout shift)
 *   U-4 the old layout (components/layout/*) is gone and nothing imports it; root layout renders AppShell
 *   U-5 no database queries in the shell (session from the JWT only)
 *   U-6 English only in the admin Bulk Import Studio (decision #35): no Hindi generation option
 *
 * Run: node scripts/test_ux1b_shell.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
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
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(tsx?|jsx?)$/.test(e.name) ? [p] : [];
  });
}
/** Removes // and /* *\/ comments (incl. JSX {/* *\/}) without touching strings that contain "//" (URLs). */
function stripComments(src) {
  let out = '';
  let i = 0;
  let q = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (q) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 2;
        continue;
      }
      if (c === q) q = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      q = c;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && n === '/' && src[i - 1] !== ':') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && n === '*') {
      i = src.indexOf('*/', i + 2);
      i = i < 0 ? src.length : i + 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const STUDENT_FILES = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))]
  .map(rel)
  .filter((r) => !r.startsWith('app/(site)/admin/') && !r.startsWith('components/admin/') && !r.startsWith('app/api/'));

const DEV_LABELS = [
  [/\bPhase\s?\d+[A-Za-z]?\b/, 'Phase N'],
  [/\bPilot\b/i, 'Pilot'],
  [/Command Center/i, 'Command Center'],
  [/\bauthoritative\b/i, 'authoritative'],
  [/\bdeterministic\b/i, 'deterministic'],
  [/\btelemetry\b/i, 'telemetry'],
  [/\bSRS\b/, 'SRS'],
  [/\bSM-2\b/, 'SM-2'],
  [/\bUUID\b/, 'UUID'],
  [/canonical (Question Bank|curriculum)/i, 'canonical …'],
  [/\btaxonomies\b/i, 'taxonomies'],
  [/\bdebug\b/i, 'debug'],
  [/>[^<{]*\bSupabase\b[^<{]*</, 'visible Supabase'],
];

console.log('UX-1b shell (static)');

test('U-1 no internal / dev labels in student-facing UI (comments excluded)', () => {
  assert(STUDENT_FILES.length >= 200, `student-facing files scanned ${STUDENT_FILES.length} (min 200)`); // GATE-HYGIENE-1
  const bad = [];
  for (const f of STUDENT_FILES) {
    const src = stripComments(read(f)).replace(/^\s*import .*$/gm, '');
    for (const [rx, name] of DEV_LABELS) {
      const m = rx.exec(src);
      if (m) {
        const line = src.slice(0, m.index).split('\n').length;
        bad.push(`${f}:~${line} ${name}: "${src.slice(Math.max(0, m.index - 20), m.index + 40).replace(/\s+/g, ' ').trim()}"`);
      }
    }
  }
  assert(bad.length === 0, bad.join('\n        '));
  return `${STUDENT_FILES.length} files`;
});

test('U-2 no dead links: every shell href resolves to an existing app route', () => {
  const routes = new Set(
    walk(path.join(ROOT, 'app'))
      .map(rel)
      .filter((r) => /\/page\.tsx$/.test(r))
      .map((r) => ('/' + r.replace(/^app\/?/, '').replace(/\/?page\.tsx$/, '')).replace(/\/\([^/]+\)/g, '') || '/'), // route groups (PERF-HOME-1) add no URL segment
  );
  routes.add('/');
  const hrefs = new Set();
  // NAV-1: the header / sidebar / bottom-bar links live in components/nav + lib/nav (route constants included)
  for (const f of [...walk(path.join(ROOT, 'components/shell')), ...walk(path.join(ROOT, 'components/nav')), ...walk(path.join(ROOT, 'lib/nav'))].map(rel)) {
    const s = read(f);
    for (const m of s.matchAll(/href(?:=|: )"([^"#?]+)"/g)) hrefs.add(m[1]);
    if (f.startsWith('lib/nav/')) for (const m of s.matchAll(/\b[a-zA-Z]+: "(\/[^"#?]*)"/g)) hrefs.add(m[1]);
    if (f.startsWith('lib/nav/')) for (const m of s.matchAll(/export const [A-Z_]+(?:: string(?: \| null)?)? = "(\/[^"#?]*)";/g)) hrefs.add(m[1]);
  }
  // NAV-1: "/learn" is the future Learn index — rendered only once LEARN_INDEX_READY is true (gated in NAV-1 N-4)
  if (/export const LEARN_INDEX_READY = false;/.test(read('lib/nav/visitor-nav.ts'))) hrefs.delete('/learn');
  const bad = [...hrefs].filter((h) => !routes.has(h.replace(/\/$/, '') || '/'));
  assert(hrefs.size >= 15, `only ${hrefs.size} hrefs found`);
  assert(bad.length === 0, `no route for: ${bad.join(', ')}`);
  return `${hrefs.size} hrefs, all routed`;
});

test('U-2b no dead links in the admin sidebar (GAP2-4c: retired workbench link removed)', () => {
  const routes = new Set(
    walk(path.join(ROOT, 'app'))
      .map(rel)
      .filter((r) => /\/page\.tsx$/.test(r))
      .map((r) => ('/' + r.replace(/^app\/?/, '').replace(/\/?page\.tsx$/, '')).replace(/\/\([^/]+\)/g, '') || '/'), // route groups (PERF-HOME-1) add no URL segment
  );
  // ADMIN-UX-1 phase B: the admin sidebar renders lib/admin/nav.ts (its only link source); the sidebar file has no hrefs
  const s = read('lib/admin/nav.ts') + read('components/admin/admin-sidebar.tsx');
  const hrefs = new Set([...s.matchAll(/href(?:=|: )"([^"#?]+)"/g)].map((m) => m[1]));
  const bad = [...hrefs].filter((h) => !routes.has(h.replace(/\/$/, '') || '/'));
  assert(hrefs.size >= 20, `only ${hrefs.size} hrefs found`);
  assert(bad.length === 0, `no route for: ${bad.join(', ')}`);
  return `${hrefs.size} admin hrefs, all routed`;
});

test('U-3 shell structure: skip link, one main, landmarks, dialog-based menus, safe bottom nav', () => {
  const shell = stripComments(read('components/shell/app-shell.tsx'));
  assert(/href="#main-content"[\s\S]*Skip to content/.test(shell), 'skip link missing');
  // NAV-1 (re-pointed, rules kept): three exclusive branches — exam focus (only <main>), THE student shell (its own one
  // <main>), the visitor branch (one <main>); each renders exactly one <main id="main-content" tabIndex={-1}>
  const student = stripComments(read('components/nav/student-shell.tsx'));
  assert((shell.match(/<main id="main-content" tabIndex=\{-1\}/g) || []).length === 2 && (student.match(/<main id="main-content" tabIndex=\{-1\}/g) || []).length === 1 && /if \(isExamFocus\(pathname\)\) \{\s*return \(\s*<main/.test(shell), 'one <main id="main-content" tabIndex={-1}> per branch required');
  assert(shell.indexOf('const skip = (') < shell.indexOf('<StudentShell') && /\{skip\}\s*<StudentShell/.test(shell) && /\{skip\}\s*(?:\{\}\s*)?\{!account/.test(shell), 'skip link must come first');
  const vh = read('components/nav/visitor-header.tsx');
  assert(/<header className="cl-vh"/.test(vh) && /<nav className="cl-vh__nav" aria-label=\{t\.mainNav\}>/.test(vh) && /<header className="cl-ss__top"/.test(student) && /<aside className="cl-ss__side" aria-label=\{t\.studentNav\}>/.test(student), 'header / nav landmarks');
  // menus: native <details> (work without JS) + the enhancers' focus trap / Esc (replaces the Dialog sheets)
  assert(/<details className="cl-vh__drawer"/.test(vh) && /<details className="cl-ss__acct"/.test(student) && /e\.key === "Tab"/.test(read('components/nav/visitor-nav-enhancer.tsx')) && /e\.key === "Tab"/.test(read('components/nav/student-nav-enhancer.tsx')), 'menus must trap focus (native <details> + enhancer)');
  assert(/!account && !pathname\.startsWith\("\/admin"\) && <SignedOutHeader/.test(shell) && /if \(account && !pathname\.startsWith\("\/admin"\)\)/.test(shell), 'no visitor header / student shell in admin');
  assert(/<nav className="cl-ss__bar" aria-label=\{t\.studentNav\}/.test(student) && /aria-current=\{current \? "page" : undefined\}/.test(student), 'bottom nav landmark + aria-current');
  const css = read('app/nav-student.css');
  assert(/height: calc\(68px \+ env\(safe-area-inset-bottom, 0px\)\);/.test(css) && /\.cl-ss__col \{\s+padding-bottom: calc\(68px \+ env\(safe-area-inset-bottom, 0px\)\);/.test(css), 'safe-area padding and content cleared above the bar');
  assert(/export const EXAM_FOCUS_ROUTES/.test(read('lib/nav/student-nav.ts')), 'the bar must hide in the console (exam focus)');
  // FOOTER-1 (re-pointed, rule kept): THE public footer and THE student line each render a <footer> landmark
  assert(/<footer className="cl-ft"/.test(read('components/footer/public-footer.tsx')) && /<footer className="cl-sf"/.test(read('components/footer/student-footer.tsx')), 'footer landmark');
  assert(/viewportFit: "cover"/.test(read('app/layout.tsx')), 'viewport-fit=cover needed for safe-area insets');
});

test('U-4 old layout removed; the session pages render AppShell (app/(site)), the cached public pages PublicShell (PERF-HOME-1)', () => {
  assert(!fs.existsSync(path.join(ROOT, 'components/layout')), 'components/layout still exists');
  const users = STUDENT_FILES.filter((f) => /components\/layout\//.test(read(f)));
  assert(users.length === 0, `imports of components/layout: ${users.join(', ')}`);
  const layout = read('app/(site)/layout.tsx');
  assert(/<AppShell>\{children\}<\/AppShell>/.test(layout), 'app/(site)/layout.tsx must render <AppShell>');
  assert(/<PublicShell>\{children\}<\/PublicShell>/.test(read('app/(public)/layout.tsx')), 'app/(public)/layout.tsx must render <PublicShell>');
  assert(!/<AppShell|<PublicShell/.test(read('app/layout.tsx')), 'the root layout renders no shell (each group has its own)');
});

test('U-5 the shell makes no database queries (session only)', () => {
  const shellFiles = walk(path.join(ROOT, 'components/shell'));
  assert(shellFiles.length >= 3, `shell files scanned ${shellFiles.length} (min 3)`); // GATE-HYGIENE-1
  const bad = shellFiles
    .map(rel)
    .filter((f) => /\.from\(|\.rpc\(|createAdminServerSupabaseClient|AdminService/.test(read(f)));
  assert(bad.length === 0, bad.join(', '));
  assert(/auth\.getUser\(\)/.test(read('components/shell/app-shell.tsx')), 'AppShell must read the session with auth.getUser()');
});

test('U-6 English only: the Bulk Import Studio has no Hindi generation option (decision #35)', () => {
  const s = read('components/admin/admin-bulk-import-studio.tsx');
  assert(!/setLanguage\(|Devanagari|हिंदी|Hindi Batch/.test(s), 'Hindi option still present');
  assert(/const language = "english";/.test(s), 'language must be fixed to english');
});

test('U-7 nothing under the mobile tab bar (BRAND-3 fix 4): spacer = bar height + safe area; toasts and the player clear it', () => {
  // NAV-1 Stage B (re-pointed, rule kept): THE student bottom bar is 68 px + the safe area (border-box: the 1 px border is
  // inside), and the column holding the page AND the footer is padded by exactly that, so nothing ends under the bar
  const css = read('app/nav-student.css');
  const barH = (css.match(/\.cl-ss__bar \{[^}]*height: calc\((\d+)px \+ env\(safe-area-inset-bottom, 0px\)\);/) || [])[1];
  const padH = (css.match(/\.cl-ss__col \{\s+padding-bottom: calc\((\d+)px \+ env\(safe-area-inset-bottom, 0px\)\);/) || [])[1];
  assert(barH && barH === padH && /\.cl-ss \*,\s+\.cl-ss \*::before,\s+\.cl-ss \*::after \{\s+box-sizing: border-box;/.test(css), `bar height (${barH}) ≠ the column padding (${padH})`);
  const student = read('components/nav/student-shell.tsx');
  assert(student.indexOf('{footer}') > student.indexOf('<main id="main-content"') && student.indexOf('{footer}') < student.indexOf('<nav className="cl-ss__bar"'), 'the footer must sit inside the padded column (page content + footer end above the bar)');
  // toasts: 4rem + 1px + 1rem (81 px) + safe area ≥ the 68 px bar + safe area, below lg (= the bar's < 1024 px)
  assert(/bottom-\[calc\(4rem\+1px\+env\(safe-area-inset-bottom\)\+1rem\)\][^"]*lg:bottom-4/.test(read('components/ui/toast.tsx')) && Number(barH) + 12 <= 81, 'toasts sit above the tab bar on phones');
  // EXAM-UX-1 (re-pointed, rule kept + stronger): the player is a full-height column — the question scroll area and the
  // action bar are SIBLINGS, so content can never end under the bar (no padding guess); the bar carries the safe area and
  // the undo toast sits above it (76 px ≥ 64 px phone bar + 12; 84 px ≥ 68 px desktop bar + 16). The page check
  // scripts/live/test_exam_ux1_pages.cjs measures it at six viewports.
  const PL = read('app/(site)/mock-tests/[id]/take/player-client.tsx');
  const iRoot = PL.indexOf('data-exam-layout="v1"'), iScroll = PL.indexOf('data-question-scroll=""'), iBar = PL.indexOf('data-action-bar=""');
  assert(iRoot > 0 && iScroll > iRoot && iBar > iScroll, 'player layout: root → question scroll → action bar order');
  assert(/className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden [^"]*" data-player="" data-exam-layout="v1"/.test(PL), 'player root is not a full-height, non-scrolling column');
  assert(/className="relative min-h-0 flex-1 overflow-y-auto [^"]*" data-question-scroll=""/.test(PL), 'only the question panel scrolls');
  assert(/className="shrink-0 [^"]*pb-\[env\(safe-area-inset-bottom\)\][^"]*" data-action-bar=""/.test(PL), 'action bar does not keep its height / safe area');
  assert(/fixed bottom-\[calc\(76px\+env\(safe-area-inset-bottom\)\)\][^"]*lg:bottom-\[84px\]/.test(PL), 'the undo toast does not clear the action bar');
});

console.log(`\nUX-1b shell: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
