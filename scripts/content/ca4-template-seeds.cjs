#!/usr/bin/env node
/**
 * CA-4: the prompt_templates v1 seeds of migration 119, generated from the TS constants (so the DB text is byte-identical
 * to lib/syllabus/intake-prompt.ts SYLLABUS_TEMPLATE_V1, lib/prompts/lesson-prompt.ts LESSON_TEMPLATE_V1 and
 * lib/prompts/translate-prompt.ts TRANSLATE_HI_TEMPLATE_V1). Offline; no DB.
 *   node scripts/content/ca4-template-seeds.cjs            → prints the SQL block
 *   node scripts/content/ca4-template-seeds.cjs --hashes   → prints type, sha256 of each body (JSON)
 *   node scripts/content/ca4-template-seeds.cjs --check     → exit 1 unless migration 119 holds exactly this block
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATION = 'supabase/migrations/20261028000119_ca4_templates_node_lessons_hindi.sql';
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};

function seeds() {
  return [
    ['SYLLABUS', require(path.join(ROOT, 'lib/syllabus/intake-prompt.ts')).SYLLABUS_TEMPLATE_V1, 'SYLLABUS-PROMPT-2: the owner-approved syllabus prompt (verbatim).'],
    ['LESSON', require(path.join(ROOT, 'lib/prompts/lesson-prompt.ts')).LESSON_TEMPLATE_V1, 'CA-4: node lesson prompt v1.'],
    ['TRANSLATE_HI', require(path.join(ROOT, 'lib/prompts/translate-prompt.ts')).TRANSLATE_HI_TEMPLATE_V1, 'CA-4: English to Hindi translation prompt v1.'],
  ];
}

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function sqlBlock() {
  const lines = ['-- @@SEEDS-BEGIN@@'];
  for (const [type, body, notes] of seeds()) {
    if (body.includes('$tpl$')) throw new Error(`${type}: the body contains the dollar-quote tag`);
    lines.push(
      `INSERT INTO public.prompt_templates (template_type, version, body, status, notes, created_by_email, activated_at, activated_by_email)`,
      `VALUES ('${type}', 1, $tpl$${body}$tpl$, 'ACTIVE', '${notes.replace(/'/g, "''")}', 'migration-119', now(), 'migration-119');`
    );
  }
  // the proof is a PL/pgSQL DO block (its BEGIN opens the block body, not a transaction)
  const checks = seeds().map(([type, body]) => `    IF (SELECT body_sha256 FROM public.prompt_templates WHERE template_type = '${type}' AND version = 1) IS DISTINCT FROM '${sha(body)}' THEN RAISE EXCEPTION 'CA4_PROOF: ${type} v1 seed hash'; END IF;`);
  lines.push(`DO $seedproof$\nBEGIN\n${checks.join('\n')}\nEND\n$seedproof$;`, '-- @@SEEDS-END@@');
  return lines.join('\n');
}

if (require.main === module) {
  const a = process.argv.slice(2);
  if (a.includes('--hashes')) console.log(JSON.stringify(Object.fromEntries(seeds().map(([t, b]) => [t, sha(b)])), null, 2));
  else if (a.includes('--check')) {
    const m = fs.readFileSync(path.join(ROOT, MIGRATION), 'utf8');
    const i = m.indexOf('-- @@SEEDS-BEGIN@@');
    const j = m.indexOf('-- @@SEEDS-END@@');
    const ok = i >= 0 && j > i && m.slice(i, j + '-- @@SEEDS-END@@'.length) === sqlBlock();
    console.log(ok ? 'seeds: migration 119 matches the TS constants' : 'seeds: migration 119 DIFFERS from the TS constants');
    process.exit(ok ? 0 : 1);
  } else console.log(sqlBlock());
}

module.exports = { seeds, sqlBlock, sha, MIGRATION };
