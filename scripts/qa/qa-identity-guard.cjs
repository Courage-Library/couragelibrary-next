/**
 * HOTFIX-1: hard guard for the permanent QA identities (docs/testing/QA_IDENTITIES.md).
 *
 * The source of truth is the identities document itself: every e-mail address written in backticks
 * there is protected (qa-admin, qa-staff, qa-student and the W2 reviewer residue). No cleanup or teardown
 * script may delete one of these auth users or its profile. Data-only cleanup (E2E_KEEP_USER=1) stays allowed.
 *
 * Every auth-user deletion in scripts/ must go through guardedDeleteUser() (enforced by
 * scripts/test_qa_identity_guard.cjs). Pure module: no network unless guardedDeleteUser is called.
 */
const fs = require('fs');
const path = require('path');

const IDENTITIES_DOC = path.resolve(__dirname, '../../docs/testing/QA_IDENTITIES.md');
const norm = (e) => String(e || '').trim().toLowerCase();

/** Protected e-mail addresses, parsed from the identities document (fails closed if it is missing or empty). */
function permanentIdentityEmails(doc = IDENTITIES_DOC) {
  const text = fs.readFileSync(doc, 'utf8');
  const emails = [...text.matchAll(/`([^`\s@]+@[^`\s@]+\.[a-z]{2,})`/gi)].map((m) => norm(m[1]));
  const unique = [...new Set(emails)];
  if (unique.length === 0) throw new Error('QA_IDENTITY_GUARD: no identities parsed from QA_IDENTITIES.md — refusing');
  return unique;
}

function isPermanentIdentity(email) {
  return permanentIdentityEmails().includes(norm(email));
}

/** Throws when the e-mail belongs to a permanent QA identity. An unknown e-mail (null) also refuses. */
function assertDeletable(email) {
  if (!email) throw new Error('QA_IDENTITY_GUARD: refusing to delete a user whose e-mail is unknown');
  if (isPermanentIdentity(email)) {
    throw new Error('QA_IDENTITY_GUARD: refusing to delete a permanent QA identity (docs/testing/QA_IDENTITIES.md); use E2E_KEEP_USER=1 for data-only cleanup');
  }
  return true;
}

/**
 * The only allowed way to delete an auth user from scripts. The e-mail is always re-read from Auth by id
 * (never trusted from the caller), so a protected identity cannot be deleted by passing its id alone.
 */
async function guardedDeleteUser(admin, userId) {
  if (!userId) throw new Error('QA_IDENTITY_GUARD: user id required');
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data || !data.user) throw new Error('QA_IDENTITY_GUARD: cannot verify the user before deletion — refusing');
  assertDeletable(data.user.email);
  return admin.auth.admin.deleteUser(userId);
}

module.exports = { IDENTITIES_DOC, permanentIdentityEmails, isPermanentIdentity, assertDeletable, guardedDeleteUser };
