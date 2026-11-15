/**
 * PAY-1 B2b part 2 step 2 (migration 146, owner conditions 2026-11-15): the statement inventory of the student mock
 * journey (start → answer / autosave → resume → submit → result → Mistake Vault / explanations) and of the staff /
 * admin pages that read the four revoked tables — derived from the CODE, not hand-written.
 *
 *   scan(root)      every .from(...) / .rpc(...) in SCOPE, with its client resolved from the code (admin / session /
 *                   param / unknown), the operation (select / insert / update / upsert / delete / rpc) and file:line
 *   clientSide(s)   the statements that run as the CALLER (anything not provably the service-role admin client) — the
 *                   ones RLS / grants apply to, so the ones 146 can break
 *   stepFor(s)      the replay step that executes the same table + operation (or RPC) as the same role
 * scripts/test_pay1_b2b.cjs P3-13 fails if a client-side statement has no replay step (a statement in the app that
 * the replay does not cover); scripts/live/test_pay1_revoke.cjs runs the steps and prints statement → code → result.
 */
const fs = require('fs');
const path = require('path');

/** The journey + staff code (owner: start / answer / autosave / resume / submit / result / Mistake Vault /
 *  explanations + the staff / admin reads of these tables). Directories are walked. */
const SCOPE = [
  'services/assessment.service.ts',
  'lib/assessment',
  'app/(site)/mock-tests',
  'components/mock-tests',
  'services/mistake.service.ts',
  'services/mistake-longitudinal-intelligence.service.ts',
  'app/(site)/mistakes',
  'components/mistakes',
  'lib/questions',
  'lib/practice/report.ts',
  'services/bookmark.service.ts',
  'lib/mocks',
  // staff / admin readers of the four tables (step 1 moved their content reads to the admin client)
  'services/admin.service.ts',
  'services/admin-content-studio.service.ts',
  'app/(site)/admin/mock-tests',
  'app/(site)/admin/exams',
  'app/(site)/admin/questions',
];

const walk = (root, rel) => {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return /\.(ts|tsx)$/.test(rel) ? [rel] : [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((d) => walk(root, `${rel}/${d.name}`));
};

const ADMIN_RX = /createAdminServerSupabaseClient\s*\(/;
const SESSION_RX = /create(Public)?ServerSupabaseClient\s*\(|createBrowserSupabaseClient\s*\(|createBrowserClient\s*\(/;
const classifyExpr = (e) => (ADMIN_RX.test(e) && !SESSION_RX.test(e) ? 'admin' : SESSION_RX.test(e) ? 'session' : null);

/** Resolve the receiver of the call that starts at index k ('.from(' / '.rpc('). */
function receiver(src, k) {
  let i = k - 1;
  while (i >= 0 && /\s/.test(src[i])) i--;
  if (src[i] === ')') {
    // a call: find its callee
    let depth = 0;
    for (; i >= 0; i--) {
      if (src[i] === ')') depth++;
      else if (src[i] === '(') { depth--; if (depth === 0) break; }
    }
    const before = src.slice(Math.max(0, i - 60), i);
    const m = before.match(/([\w.]+)\s*$/);
    const callee = m ? m[1] : '';
    if (/createAdminServerSupabaseClient$/.test(callee)) return { client: 'admin', via: callee };
    if (/create(Public)?ServerSupabaseClient$|createBrowser\w*$/.test(callee)) return { client: 'session', via: callee };
    return { client: 'unknown', via: `${callee}(…)` };
  }
  const m = src.slice(Math.max(0, i - 80), i + 1).match(/([\w$.]+)$/);
  const ident = m ? m[1] : '';
  if (/^ctx\.|^this\./.test(ident)) return { client: 'unknown', via: ident };
  const head = src.slice(0, k);
  const fnStart = Math.max(head.lastIndexOf('static async '), head.lastIndexOf('async function '), head.lastIndexOf('export async function '), head.lastIndexOf('static '));
  return resolveIdent(head, ident.split('.').pop(), fnStart, ident, 0);
}

/** The nearest declaration / assignment of `name` inside the enclosing function (aliases followed). */
function resolveIdent(head, name, fnStart, shown, hops) {
  const decls = [...head.matchAll(new RegExp(`(?:const|let|var)\\s+(?:\\{[^}]*\\b${name}\\b[^}]*\\}|${name})\\s*(?::[^=]+)?=\\s*([^;\\n]+(?:\\n\\s+[^;\\n]+)?)`, 'g'))];
  const assigns = [...head.matchAll(new RegExp(`(?:^|[^\\w.])${name}\\s*=\\s*([^=;\\n][^;\\n]*)`, 'gm'))];
  const last = [...decls.map((d) => ({ at: d.index, rhs: d[1] })), ...assigns.map((a) => ({ at: a.index, rhs: a[1] }))].sort((a, b) => b.at - a.at)[0];
  if (last && last.at > fnStart) {
    const c = classifyExpr(last.rhs);
    if (c) return { client: c, via: `${shown} = ${last.rhs.trim().slice(0, 60)}` };
    // `x = param || createAdmin…()` → the caller's client, else admin
    if (/\|\|/.test(last.rhs)) return { client: 'param', via: `${shown} = ${last.rhs.trim().slice(0, 60)}` };
    const alias = last.rhs.trim().match(/^([\w$]+)\s*;?$/);
    if (alias && alias[1] !== name && hops < 5) return resolveIdent(head.slice(0, last.at), alias[1], fnStart, `${shown} → ${alias[1]}`, hops + 1);
  }
  // a parameter of the enclosing function (passed client)
  return { client: 'param', via: shown };
}

/** The end of the call chain that starts at k (first ';' at depth 0, or a blank line). */
function chainOp(src, k, kind) {
  if (kind === 'rpc') return 'rpc';
  let depth = 0;
  let j = k;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') { depth--; if (depth < 0) break; }
    else if ((ch === ';' || ch === ',') && depth === 0) break;
  }
  const chain = src.slice(k, j);
  const m = chain.match(/\.(insert|update|upsert|delete)\s*\(/);
  return m ? m[1] : 'select';
}

function scan(root) {
  const files = [...new Set(SCOPE.flatMap((s) => walk(root, s)))].sort();
  const out = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
    // comments out (keep offsets / line numbers)
    const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
    for (const m of code.matchAll(/\.(from|rpc)\(\s*["'`]([\w]+)["'`]/g)) {
      if (m[1] === 'from' && /\.storage\s*$/.test(code.slice(Math.max(0, m.index - 20), m.index))) continue; // storage buckets
      const r = receiver(code, m.index);
      out.push({ file: rel, line: code.slice(0, m.index).split('\n').length, kind: m[1], name: m[2], op: chainOp(code, m.index, m[1]), client: r.client, via: r.via });
    }
  }
  return out;
}

/**
 * Passed clients the scanner cannot follow, resolved by hand — each with a PROOF the offline gate checks against the
 * code (a resolution whose proof no longer holds fails P3-13). Anything not listed here counts as the caller's client.
 */
const PARAM_RESOLUTION = [
  {
    file: 'services/assessment.service.ts', via: /^adminSb$/, client: 'admin',
    why: 'private helpers realCohortStanding / accountFlags / examTrend take adminSb; every call passes the adminSb of createAdminServerSupabaseClient()',
    proof: (src) => {
      const calls = [...src.matchAll(/(?:this|AssessmentService)\.(realCohortStanding|accountFlags|examTrend)\(\s*([\w$]+)/g)];
      // every adminSb in the file is either assigned the admin client or a parameter of the three helpers
      const assigns = [...src.matchAll(/\badminSb\s*=\s*([^;\n]+)/g)].map((m) => m[1].trim());
      const params = [...src.matchAll(/static async (\w+)\([^)]*\badminSb\s*:/g)].map((m) => m[1]);
      return calls.length >= 3 && calls.every((c) => c[2] === 'adminSb') && assigns.length > 0 && assigns.every((a) => a === 'createAdminServerSupabaseClient()')
        && params.every((p) => ['realCohortStanding', 'accountFlags', 'examTrend'].includes(p));
    },
  },
  {
    file: 'services/mistake-longitudinal-intelligence.service.ts', via: /^contentClient$/, client: 'admin',
    why: 'getLongitudinalOverview(…, contentClient): both app callers pass createAdminServerSupabaseClient()',
    proof: (_src, read) => ['app/(site)/mistakes/actions.ts', 'app/(site)/mistakes/page.tsx'].every((f) => /getLongitudinalOverview\([\s\S]{0,300}?createAdminServerSupabaseClient\(\)\s*\)/.test(read(f))),
  },
  {
    file: 'app/(site)/admin/exams/logo-actions.ts', via: /^db$/, client: 'admin',
    why: 'rpcSet / rpcRemove take db: ReturnType<typeof createAdminServerSupabaseClient> (typed: only the admin client fits)',
    proof: (src) => (src.match(/db: ReturnType<typeof createAdminServerSupabaseClient>/g) || []).length >= 2,
  },
];
const resolved = (s) => PARAM_RESOLUTION.find((r) => r.file === s.file && s.client === 'param' && r.via.test(s.via));
const clientSide = (s) => s.client !== 'admin' && !(resolved(s) && resolved(s).client === 'admin');

/** The four tables 146 revokes: no client-side statement may read or write them. */
const REVOKED = ['question_versions', 'question_options', 'mock_questions', 'mock_tests'];
/** Write / RPC steps the replay implements (scripts/live/test_pay1_revoke.cjs); selects are replayed generically. */
const IMPLEMENTED = new Set([
  'student:attempt_answers:upsert', 'student:test_attempts:update', 'student:user_exam_goals:insert', 'student:user_exam_goals:update',
  'student:user_question_bookmarks:upsert', 'student:user_question_bookmarks:delete',
  'student:rpc:fn_report_question', 'student:rpc:fn_generate_mistake_drill', 'student:rpc:fn_submit_mistake_drill',
]);

/**
 * Replay coverage. A client-side statement is covered when the replay executes the same table + operation (or the same
 * RPC) as the same kind of caller. STUDENT steps run as the free QA student (authenticated); STAFF steps as the QA admin.
 * Tables whose policies do not touch the four tables are still replayed (a select / own-row write as that role) — the
 * owner asked for every statement of the journey, not only the ones 146 changes.
 */
const STAFF_FILES = /^(services\/admin\.service\.ts|services\/admin-content-studio\.service\.ts|app\/\(site\)\/admin\/)/;
const roleOf = (s) => (STAFF_FILES.test(s.file) ? 'staff' : 'student');
const stepFor = (s) => (s.kind === 'rpc' ? `${roleOf(s)}:rpc:${s.name}` : `${roleOf(s)}:${s.name}:${s.op}`);

/** P3-13: every client-side statement is covered by the replay; none touches a revoked table; resolutions hold. */
function crossCheck(root, statements = scan(root)) {
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
  const problems = [];
  for (const r of PARAM_RESOLUTION) if (!r.proof(read(r.file), read)) problems.push(`resolution no longer proven: ${r.file} ${r.via} (${r.why})`);
  for (const s of statements.filter(clientSide)) {
    const at = `${s.file}:${s.line}`;
    if (s.client === 'unknown') problems.push(`${at} ${s.kind} ${s.name}: client not resolvable (${s.via}) — add a PARAM_RESOLUTION with a proof`);
    if (s.kind === 'from' && REVOKED.includes(s.name)) problems.push(`${at} ${s.op} ${s.name} through the caller's client — revoked by 146`);
    const st = stepFor(s);
    if ((s.kind === 'rpc' || s.op !== 'select') && !IMPLEMENTED.has(st)) problems.push(`${at} ${st}: not replayed (add it to the replay + IMPLEMENTED)`);
  }
  return problems;
}

module.exports = { SCOPE, REVOKED, IMPLEMENTED, PARAM_RESOLUTION, scan, clientSide, stepFor, roleOf, crossCheck };

if (require.main === module) {
  const all = scan(path.resolve(__dirname, '..', '..'));
  const cs = all.filter(clientSide);
  for (const s of cs) console.log(`${s.file}:${s.line}  ${s.kind} ${s.name} ${s.op}  [${s.client}: ${s.via}]  → ${stepFor(s)}`);
  console.log(`\n${all.length} statements, ${cs.length} client-side, ${new Set(cs.map(stepFor)).size} replay steps`);
}
