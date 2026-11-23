#!/usr/bin/env node
/**
 * LIVE-GREEN-1 / NIGHTLY-ALERT-1 (owner, 2026-11-24): a red NIGHTLY live run must reach the owner.
 *
 * Runs as the last job of ci-gates on `schedule` ONLY (manual dispatches never touch the issue). It keeps ONE open issue
 * labelled `nightly-red`:
 *   nightly red   + no open issue → open it, assigned to the repository variable NIGHTLY_ALERT_ASSIGNEE
 *                                   (empty / not assignable → opened unassigned, and the body says so)
 *   nightly red   + open issue    → comment on it (the same body)
 *   nightly green + open issue    → comment "green" and close it
 *   anything else                 → nothing
 *
 * The repository is PUBLIC, so the issue text is ONLY: the run link, the commit and the gate SUMMARY lines of the failed
 * jobs, filtered line by line (filterSummaryLines): a line must have the exact run-quiet summary shape, and a line with
 * anything secret-looking in it is dropped, never redacted-and-kept. Plus, when needed, one fixed sentence about the
 * assignee. Nothing else from the logs, the environment or the API is ever written.
 *
 * Token: the job's GITHUB_TOKEN (permissions issues: write + actions: read on this job only). No new secrets.
 * Offline gate: scripts/ci/test_nightly_alert.cjs (NIGHTLY-ALERT in the offline list).
 */
'use strict';

const LABEL = 'nightly-red';
const TITLE = 'Nightly live run red';
const MAX_LINES = 60;

// run-quiet's summary line: `<ID> FAIL exit <n> — passed <x> · fail-lines <n> · warns <n>[ · failing [..]][ · diag ..]`
const SUMMARY = /^([A-Z0-9][A-Z0-9-]{1,60}) FAIL exit (\d{1,3}) — passed ([0-9]{1,4}(?:\/[0-9]{1,4}| line\(s\))) · fail-lines (\d{1,4}) · warns (\d{1,4})( · failing \[([A-Za-z0-9 ,/_.:-]{0,240})\])?( · diag ([A-Za-z0-9:/_.-]{0,80}))?$/;
// anything that looks like a credential, a URL, an address or a long opaque token → the whole line is dropped
const SECRETISH = [
  /[A-Za-z0-9_+=]{24,}/, // a long opaque run without hyphens (keys, hashes)
  /eyJ[A-Za-z0-9_-]{6,}/, // JWT header
  /\b(?:sk|pk|rk|ghp|gho|ghs|github_pat|xox[abp]|sb|sbp)_[A-Za-z0-9]/i,
  /:\/\//, // any URL / connection string
  /@/, // e-mail / user@host
  /\b(?:password|passwd|secret|token|apikey|api_key|bearer|authorization)\b/, // gate IDs are upper case
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/, // IPv4
];
/** a token of 16+ characters mixing lower case and digits is opaque (gate IDs are upper case + hyphens) */
const opaqueToken = (line) => line.split(/[\s,[\]·/]+/).some((t) => t.length >= 16 && /[a-z]/.test(t) && /[0-9]/.test(t));
const TS = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z /;

/** keep only FAIL summary lines of the exact shape, with nothing secret-looking; de-duplicated, capped */
function filterSummaryLines(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(TS, '').replace(/\u001b\[[0-9;]*m/g, '').trim();
    if (!SUMMARY.test(line)) continue;
    if (SECRETISH.some((re) => re.test(line)) || opaqueToken(line)) continue;
    if (!out.includes(line)) out.push(line);
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

/** red: any needed job failed / was cancelled; green: every needed job succeeded; otherwise neither */
function verdict(needs) {
  const results = Object.values(needs || {}).map((j) => (j && j.result) || 'unknown');
  if (results.length === 0) return 'none';
  if (results.some((r) => r === 'failure' || r === 'cancelled')) return 'red';
  if (results.every((r) => r === 'success')) return 'green';
  return 'none';
}

/** what to do with the one open issue */
function plan(state, openIssue) {
  if (state === 'red') return openIssue ? 'comment' : 'open';
  if (state === 'green') return openIssue ? 'close' : 'none';
  return 'none';
}

const ASSIGNEE_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const RUN_URL_RE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+$/;

function validAssignee(a) {
  return typeof a === 'string' && ASSIGNEE_RE.test(a.trim()) ? a.trim() : '';
}

/** the issue / comment text: run link, commit, filtered lines, and (if needed) one fixed assignee sentence */
function buildBody({ runUrl, sha, lines, assigneeNote }) {
  if (!RUN_URL_RE.test(runUrl)) throw new Error('bad run url');
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('bad sha');
  const parts = [
    'Nightly live run: **red**',
    '',
    `- Run: ${runUrl}`,
    `- Commit: ${sha}`,
    '',
    lines.length ? 'Failing gates (summary lines):' : 'No gate summary line was found in the failed jobs; open the run.',
  ];
  if (lines.length) parts.push('', '```', ...lines, '```');
  if (assigneeNote) parts.push('', assigneeNote);
  return parts.join('\n');
}

const NOTE_EMPTY = 'Unassigned: the repository variable NIGHTLY_ALERT_ASSIGNEE is empty.';
const NOTE_INVALID = 'Unassigned: the repository variable NIGHTLY_ALERT_ASSIGNEE is not a valid GitHub user name.';
const NOTE_REFUSED = 'Unassigned: GitHub refused the NIGHTLY_ALERT_ASSIGNEE user as an assignee of this repository.';

/**
 * The whole flow with injected I/O (gh = { get, post, patch, text }) so the offline gate can drive every path.
 * Returns { action, issue, assigned, lines } for the log (no body text is printed).
 */
async function run({ repo, runId, sha, needs, assignee, gh, serverUrl = 'https://github.com' }) {
  const state = verdict(needs);
  // found by its exact title (and author type Bot), NOT by the label: the label is optional and may be missing
  const issues = await gh.get(`/repos/${repo}/issues?state=open&per_page=100&sort=created&direction=desc`);
  const open = (issues || []).find((i) => !i.pull_request && i.title === TITLE && (!i.user || i.user.type === 'Bot')) || null;
  const action = plan(state, open);
  const runUrl = `${serverUrl}/${repo}/actions/runs/${runId}`;
  if (action === 'none') return { action, issue: open ? open.number : null, assigned: null, lines: 0 };

  if (action === 'close') {
    await gh.post(`/repos/${repo}/issues/${open.number}/comments`, { body: `Nightly live run green: ${runUrl} (commit ${sha}). Closing.` });
    await gh.patch(`/repos/${repo}/issues/${open.number}`, { state: 'closed', state_reason: 'completed' });
    return { action, issue: open.number, assigned: null, lines: 0 };
  }

  // red: the summary lines of the failed jobs only
  const jobs = await gh.get(`/repos/${repo}/actions/runs/${runId}/jobs?per_page=100`);
  const failed = ((jobs && jobs.jobs) || []).filter((j) => j.conclusion === 'failure');
  const lines = [];
  for (const j of failed) {
    let log = '';
    try { log = await gh.text(`/repos/${repo}/actions/jobs/${j.id}/logs`); } catch { log = ''; }
    for (const l of filterSummaryLines(log)) if (!lines.includes(l) && lines.length < MAX_LINES) lines.push(l);
  }

  if (action === 'comment') {
    await gh.post(`/repos/${repo}/issues/${open.number}/comments`, { body: buildBody({ runUrl, sha, lines }) });
    return { action, issue: open.number, assigned: null, lines: lines.length };
  }

  // open — the label is best effort: creating it may fail, and an issue the label is refused on opens without it
  const createIssue = async (payload) => {
    try {
      return await gh.post(`/repos/${repo}/issues`, payload);
    } catch (e) {
      if (!(e && e.status === 422) || !payload.labels) throw e;
      const rest = { ...payload };
      delete rest.labels;
      return gh.post(`/repos/${repo}/issues`, rest);
    }
  };
  try { await gh.post(`/repos/${repo}/labels`, { name: LABEL, color: 'b60205', description: 'NIGHTLY-ALERT-1: the nightly live run is red' }); } catch { /* exists */ }
  const raw = String(assignee || '').trim();
  const who = validAssignee(raw);
  let note = raw === '' ? NOTE_EMPTY : who ? '' : NOTE_INVALID;
  let created;
  if (who) {
    try {
      created = await createIssue({ title: TITLE, labels: [LABEL], assignees: [who], body: buildBody({ runUrl, sha, lines }) });
      if (!created || !(created.assignees || []).some((a) => a && a.login && a.login.toLowerCase() === who.toLowerCase())) {
        // GitHub silently drops an assignee without access → say so on the issue
        await gh.post(`/repos/${repo}/issues/${created.number}/comments`, { body: NOTE_REFUSED });
        return { action, issue: created.number, assigned: false, lines: lines.length };
      }
      return { action, issue: created.number, assigned: true, lines: lines.length };
    } catch (e) {
      if (!(e && e.status === 422)) throw e;
      note = NOTE_REFUSED; // invalid assignee → open it unassigned below
    }
  }
  created = await createIssue({ title: TITLE, labels: [LABEL], body: buildBody({ runUrl, sha, lines, assigneeNote: note }) });
  return { action, issue: created.number, assigned: false, lines: lines.length };
}

/** the real GitHub REST client (GITHUB_TOKEN); errors carry the HTTP status only */
function githubClient(token, apiUrl = 'https://api.github.com') {
  const req = async (method, p, body, asText) => {
    const r = await fetch(apiUrl + p, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ci-nightly-alert' },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'follow',
    });
    if (!r.ok) { const e = new Error(`GitHub API ${method} HTTP ${r.status}`); e.status = r.status; throw e; }
    return asText ? r.text() : r.status === 204 ? null : r.json();
  };
  return { get: (p) => req('GET', p), post: (p, b) => req('POST', p, b), patch: (p, b) => req('PATCH', p, b), text: (p) => req('GET', p, null, true) };
}

module.exports = { filterSummaryLines, verdict, plan, buildBody, validAssignee, run, LABEL, TITLE, NOTE_EMPTY, NOTE_INVALID, NOTE_REFUSED };

if (require.main === module) {
  (async () => {
    if (process.env.GITHUB_EVENT_NAME !== 'schedule') {
      console.log(`NIGHTLY-ALERT: event ${process.env.GITHUB_EVENT_NAME || 'none'} — only the nightly schedule touches the issue`);
      return;
    }
    const token = process.env.GH_TOKEN;
    if (!token) throw new Error('GH_TOKEN missing');
    const needs = JSON.parse(process.env.NEEDS_JSON || '{}');
    const r = await run({
      repo: process.env.GITHUB_REPOSITORY,
      runId: process.env.GITHUB_RUN_ID,
      sha: process.env.GITHUB_SHA,
      needs,
      assignee: process.env.NIGHTLY_ALERT_ASSIGNEE || '',
      gh: githubClient(token, process.env.GITHUB_API_URL || 'https://api.github.com'),
      serverUrl: process.env.GITHUB_SERVER_URL || 'https://github.com',
    });
    console.log(`NIGHTLY-ALERT: verdict ${verdict(needs)} → ${r.action}${r.issue ? ` issue #${r.issue}` : ''}${r.assigned === null ? '' : r.assigned ? ', assigned' : ', unassigned'}, ${r.lines} summary line(s)`);
  })().catch((e) => {
    console.error(`NIGHTLY-ALERT ERROR: ${String(e && e.message).replace(/[^\x20-\x7e]/g, '').slice(0, 120)}`);
    process.exit(1);
  });
}
