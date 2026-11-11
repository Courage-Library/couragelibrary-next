#!/usr/bin/env node
/**
 * LESSON-PROMPT-QUALITY-1 item 8 — REPORT ONLY: active TOPIC nodes with exactly one active SUBTOPIC, classified by
 * lib/syllabus/single-subtopic.ts (same_name / same_words / gloss = the subtopic just renames the topic; different =
 * listed for the owner, lower priority). Nothing is changed: the owner decides each row.
 * READ ONLY: one BEGIN READ ONLY transaction (LIVE-LOCK-SAFETY timeouts), always rolled back. Prints node names only
 * (taxonomy names, no ids, no personal data).
 * Usage: node scripts/content/single-subtopic-report.cjs [--out=<file.md>]
 */
require('../db/safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output (scripts/db/safe-net.cjs)
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..', '..');
const { pgClient } = require(path.join(ROOT, 'scripts/db/safe-net.cjs'));
const { safeBegin } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const OUT = (process.argv.find((a) => a.startsWith('--out=')) || '').slice('--out='.length) || null;

function classifier() {
  const src = fs.readFileSync(path.join(ROOT, 'lib/syllabus/single-subtopic.ts'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports);
  return m.exports;
}

const SQL = `
  select subj.name as subject, t.name as topic, min(c.name) as subtopic
  from public.canonical_taxonomy_nodes t
  join public.canonical_taxonomy_nodes subj on subj.id = t.parent_id
  join public.canonical_taxonomy_nodes c on c.parent_id = t.id and c.node_type = 'SUBTOPIC' and c.is_active
  where t.node_type = 'TOPIC' and t.is_active
  group by subj.name, t.id, t.name
  having count(*) = 1
  order by subj.name, t.name`;

(async () => {
  const { classifySingleSubtopic, isRename } = classifier();
  const c = pgClient();
  await c.connect();
  let rows;
  try {
    await safeBegin(c, { readOnly: true });
    rows = (await c.query(SQL)).rows;
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    await c.end().catch(() => {});
  }
  const all = rows.map((r) => ({ ...r, kind: classifySingleSubtopic(r.topic, r.subtopic) }));
  const renames = all.filter((r) => isRename(r.kind));
  const line = (r) => `| ${r.subject} | ${r.topic} | ${r.subtopic} | ${r.kind} |`;
  const md = [
    '# Single-subtopic topics (LESSON-PROMPT-QUALITY-1 item 8, report only)',
    '',
    `Active topics with exactly one active subtopic: ${all.length}. The subtopic just renames the topic: ${renames.length}.`,
    'Nothing was changed. The owner decides each row (merge, rename, or add the missing subtopics).',
    '',
    '## Renames (same_name / same_words / gloss)',
    '',
    '| Subject | Topic | Only subtopic | Kind |',
    '|---|---|---|---|',
    ...renames.map(line),
    '',
    '## Other single subtopics (different name, check)',
    '',
    '| Subject | Topic | Only subtopic | Kind |',
    '|---|---|---|---|',
    ...all.filter((r) => !isRename(r.kind)).map(line),
    '',
  ].join('\n');
  if (OUT) fs.writeFileSync(path.resolve(OUT), md);
  console.log(`SINGLE-SUBTOPIC: ${all.length} topic(s) with one subtopic, ${renames.length} rename(s)${OUT ? ` → ${OUT}` : ''}`);
  if (!OUT) console.log(md);
})().catch((e) => {
  console.log(`FAILED — ${String(e && e.message ? e.message : e).slice(0, 300)}`);
  process.exitCode = 1;
});
