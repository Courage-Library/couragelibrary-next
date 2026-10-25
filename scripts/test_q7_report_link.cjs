#!/usr/bin/env node
/**
 * Q7 (decision #79 stands): question reports stay ADMIN-ONLY; the report detail gets an "Open question" link.
 *   QR-01 the report detail links to /admin/questions?question=<questionId> (encoded), only when a question id exists
 *   QR-02 the admin question page passes ?question= through and the manager opens that question's edit dialog once
 *   QR-03 access unchanged: the reports page and the status route stay admin-only (no allowStaff), and the reports are
 *         read with the service role only (the table grants no client role anything)
 * Run: node scripts/test_q7_report_link.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 600)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

test('QR-01 report detail → "Open question" link (only with a question id)', () => {
  const M = code(read('components/admin/admin-question-reports-manager.tsx'));
  assert(/\{activeReport\.questionId && \(\s*<Link\s+href=\{`\/admin\/questions\?question=\$\{encodeURIComponent\(activeReport\.questionId\)\}`\}/.test(M), 'link to /admin/questions?question=<encoded id>, guarded by questionId');
  assert(/>\s*Open question\s*<\/Link>/.test(M), 'visible label "Open question"');
});

test('QR-02 ?question= opens that question once', () => {
  const page = code(read('app/admin/questions/page.tsx'));
  assert(/question\?: string;/.test(page) && /initialQuestionId=\{params\.question\}/.test(page), 'page passes ?question= to the manager');
  const M = code(read('components/admin/admin-question-manager.tsx'));
  assert(/if \(openedFromLink\.current \|\| !initialQuestionId\) return;\s*openedFromLink\.current = true;\s*const target = questions\.find\(\(x\) => x\.id === initialQuestionId\);\s*if \(target\) openEditModal\(target\);/.test(M), 'opens the matching question once; unknown id opens nothing');
});

test('QR-03 access unchanged: admin-only (decision #79)', () => {
  const page = code(read('app/admin/question-reports/page.tsx'));
  assert(/await requireAdminPage\(\{ path: "\/admin\/question-reports" \}\);/.test(page) && !/allowStaff/.test(page), 'reports page admin-only');
  const route = code(read('app/api/admin/reports/update-status/route.ts'));
  assert(/const authCheck = await guardAdminRoute\(\);/.test(route) && !/allowStaff/.test(route), 'status route admin-only');
  const svc = code(read('services/admin.service.ts'));
  const fn = svc.slice(svc.indexOf('static async getQuestionReports('), svc.indexOf('static async updateQuestionReportStatus('));
  assert(fn.length > 0 && /createAdminServerSupabaseClient\(\)/.test(fn) && !/createServerSupabaseClient\(\)/.test(fn), 'reports read with the service role only');
});

console.log(`\nQ7-REPORT-LINK: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
