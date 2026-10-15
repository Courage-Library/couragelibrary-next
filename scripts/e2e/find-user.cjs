/**
 * Pure auth-user lookup by e-mail (no env, no network of its own; the caller passes the admin client).
 * HOTFIX-1: findUser() previously ignored its argument and always looked up E2E_STUDENT_EMAIL, which produced
 * a false "does not exist" check. The e-mail is required and compared case-insensitively.
 */
const PER_PAGE = 200;
const MAX_PAGES = 50;

async function findUserByEmail(admin, email) {
  const want = String(email || '').trim().toLowerCase();
  if (!want) throw new Error('findUserByEmail: e-mail required');
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw error;
    const users = (data && data.users) || [];
    const u = users.find((x) => String(x.email || '').toLowerCase() === want);
    if (u) return u;
    if (users.length < PER_PAGE) return null;
  }
  throw new Error('findUserByEmail: user list exceeded the page limit — refusing to answer "not found"');
}

module.exports = { findUserByEmail };
