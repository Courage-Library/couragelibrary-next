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
  .filter((r) => !r.startsWith('app/admin/') && !r.startsWith('components/admin/') && !r.startsWith('app/api/'));

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
      .map((r) => '/' + r.replace(/^app\/?/, '').replace(/\/?page\.tsx$/, '')),
  );
  routes.add('/');
  const hrefs = new Set();
  for (const f of walk(path.join(ROOT, 'components/shell')).map(rel)) {
    const s = read(f);
    for (const m of s.matchAll(/href(?:=|: )"([^"#?]+)"/g)) hrefs.add(m[1]);
  }
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
      .map((r) => '/' + r.replace(/^app\/?/, '').replace(/\/?page\.tsx$/, '')),
  );
  const s = read('components/admin/admin-sidebar.tsx');
  const hrefs = new Set([...s.matchAll(/href(?:=|: )"([^"#?]+)"/g)].map((m) => m[1]));
  const bad = [...hrefs].filter((h) => !routes.has(h.replace(/\/$/, '') || '/'));
  assert(hrefs.size >= 20, `only ${hrefs.size} hrefs found`);
  assert(bad.length === 0, `no route for: ${bad.join(', ')}`);
  return `${hrefs.size} admin hrefs, all routed`;
});

test('U-3 shell structure: skip link, one main, landmarks, dialog-based menus, safe bottom nav', () => {
  const shell = stripComments(read('components/shell/app-shell.tsx'));
  assert(/href="#main-content"[\s\S]*Skip to content/.test(shell), 'skip link missing');
  assert((shell.match(/<main /g) || []).length === 1 && /<main id="main-content" tabIndex=\{-1\}/.test(shell), 'one <main id="main-content" tabIndex={-1}> required');
  assert(shell.indexOf('Skip to content') < shell.indexOf('<HeaderBar'), 'skip link must come first');
  const header = read('components/shell/header-bar.tsx');
  assert(/<header /.test(header) && /<nav aria-label="Main"/.test(header), 'header / main nav landmarks');
  assert(/<Dialog open=\{menuOpen\}[^>]*variant="sheet"/.test(header) && /aria-label="Open menu"/.test(header), 'mobile menu must be the Dialog sheet');
  assert(/pathname\.startsWith\("\/admin"\)\) return null/.test(header), 'header must hide in admin');
  const bottom = read('components/shell/bottom-nav.tsx');
  assert(/<nav\s+aria-label="Student"/.test(bottom) && /aria-current=\{active \? "page" : undefined\}/.test(bottom), 'bottom nav landmark + aria-current');
  assert(/env\(safe-area-inset-bottom\)/.test(bottom) && /aria-hidden="true" className="h-\[calc\(4rem\+1px\+env\(safe-area-inset-bottom\)\)\] lg:hidden"/.test(bottom), 'safe-area padding and an in-flow spacer');
  assert(/CONSOLE_ROUTES\.some/.test(bottom) && /startsWith\("\/admin"\)/.test(bottom), 'bottom nav must hide in admin and the console');
  assert(/<Dialog open=\{accountOpen\}/.test(bottom), 'account sheet must be the Dialog');
  assert(/<footer /.test(read('components/shell/site-footer.tsx')), 'footer landmark');
  assert(/viewportFit: "cover"/.test(read('app/layout.tsx')), 'viewport-fit=cover needed for safe-area insets');
});

test('U-4 old layout removed; root layout renders AppShell', () => {
  assert(!fs.existsSync(path.join(ROOT, 'components/layout')), 'components/layout still exists');
  const users = STUDENT_FILES.filter((f) => /components\/layout\//.test(read(f)));
  assert(users.length === 0, `imports of components/layout: ${users.join(', ')}`);
  const layout = read('app/layout.tsx');
  assert(/<AppShell>\{children\}<\/AppShell>/.test(layout), 'root layout must render <AppShell>');
});

test('U-5 the shell makes no database queries (session only)', () => {
  const bad = walk(path.join(ROOT, 'components/shell'))
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

console.log(`\nUX-1b shell: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
