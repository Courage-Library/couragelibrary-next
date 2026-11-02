/**
 * SAFE-NET (owner ruling 2026-11-02, structural masking): EVERY script that connects to the database or Supabase
 * requires this module FIRST. Requiring it is enough — it installs, once per process:
 *   - output masking on process.stdout / process.stderr: IPv4 / IPv6 addresses, Supabase / pooler / AWS hosts, the project
 *     ref, postgres URLs, e-mail addresses (except the fake test domains), JWTs and Supabase keys never reach a terminal,
 *     a CI log or a captured file — whatever the script prints, including errors
 *   - masked handlers for uncaught exceptions / unhandled rejections (Node's default crash print bypasses stdout)
 * It also exports mask() and the two connection helpers (pgClient for Postgres, supabaseAdmin for supabase-js).
 * Gate: scripts/test_safe_net.cjs fails any script that imports pg / supabase-js without requiring this file.
 * Runbook: docs/database/MIGRATION_RUNBOOK.md § "Script output masking (SAFE-NET)".
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FAKE_MAIL_DOMAINS = /@(courage-library\.test|example\.(test|com|org)|[a-z0-9-]+\.invalid)$/i;

function projectRef() {
  try {
    const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    const m = /NEXT_PUBLIC_SUPABASE_URL=\s*["']?https:\/\/([a-z0-9]+)\./.exec(env);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
const REF = process.env.NEXT_PUBLIC_SUPABASE_URL ? (/https:\/\/([a-z0-9]+)\./.exec(process.env.NEXT_PUBLIC_SUPABASE_URL) || [])[1] || projectRef() : projectRef();

/** Masks every network / identity detail in a string. Safe to call on anything. */
function mask(input) {
  let s = String(input);
  s = s.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]');
  s = s.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[jwt]');
  s = s.replace(/\bsb_(secret|publishable)_[A-Za-z0-9_-]{8,}/g, '[key]');
  s = s.replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:supabase\.(?:co|com|in|net)|pooler\.supabase\.com|amazonaws\.com|supabase\.red)\b/gi, '[host]');
  s = s.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]');
  s = s.replace(/\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b/gi, '[ip]');
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => (FAKE_MAIL_DOMAINS.test(m) ? m : '[email]'));
  if (REF) s = s.split(REF).join('[ref]');
  return s;
}

function install() {
  if (global.__SAFE_NET_INSTALLED__) return;
  global.__SAFE_NET_INSTALLED__ = true;
  for (const stream of [process.stdout, process.stderr]) {
    const write = stream.write.bind(stream);
    stream.write = (chunk, encoding, cb) => {
      if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) chunk = mask(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk);
      return write(chunk, encoding, cb);
    };
  }
  const crash = (label) => (err) => {
    process.stderr.write(`${label}: ${err && err.stack ? err.stack : String(err)}\n`); // masked by the stream patch
    process.exit(1);
  };
  process.on('uncaughtException', crash('Uncaught exception'));
  process.on('unhandledRejection', crash('Unhandled rejection'));
}
install();

/** A pg Client for the project database (target from scripts/db/_db-env.cjs); errors carry masked messages. */
function pgClient(overrides = {}) {
  const { Client } = require('pg');
  const { dbTarget } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
  const c = new Client({ ...dbTarget().pg, ...overrides });
  c.on('error', () => {});
  return c;
}

/** A supabase-js service-role client (server-side scripts only). */
function supabaseAdmin() {
  globalThis.WebSocket ??= class {}; // Node 20: supabase-js realtime needs a WebSocket stand-in (F1-a)
  const { createClient } = require('@supabase/supabase-js');
  const { readEnv } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
  const env = readEnv();
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
}

module.exports = { mask, pgClient, supabaseAdmin };
