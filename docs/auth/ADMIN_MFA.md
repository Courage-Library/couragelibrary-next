# Admin MFA (AUTH-1 2b-3)

Admin and staff accounts use a TOTP authenticator app in addition to their password. Students are never affected.

## Switches

| Switch | Where | Default | Effect when on |
|---|---|---|---|
| `ADMIN_MFA_REQUIRED` | Vercel environment variable | off | Admin / staff need an **AAL2** session (password + a verified authenticator code this session). Applies to every admin page, server action and admin API route. An AAL1 admin session is sent to `/admin/mfa`. |
| `security_settings.admin_mfa_required` | Database, migration 098 (held for the architect's go) | false | The shared database predicate `fn_jwt_is_admin_or_staff()` also requires `aal2`. That covers the 46 RLS policies and 4 functions that use it. |

## Turning it on (lockout-safe order)

1. **Enrol first, with the flag off.** Each admin / staff member signs in and opens `/admin/mfa`, then:
   1. chooses "Set up authenticator app";
   2. scans the QR code, or types the key;
   3. enters a code.

   The page should then say "Two-step verification is active for this session".
2. **Add a second factor (recommended).** Enrol the same account on a second device. A second authenticator app is the backup factor if a phone is lost.
3. **Test.** Sign out and sign in again. Open `/admin/mfa`, enter a code, then open an admin page.
4. **Switch on.** Set `ADMIN_MFA_REQUIRED=true` in Vercel and redeploy. After migration 098 is applied, also set the database flag in the same change window, as described in the migration header.
5. **Check.** Open `/admin` while signed in without a code this session. It must send you to `/admin/mfa`.

## Recovery (lost authenticator)

- **Emergency off:**
  1. Set `ADMIN_MFA_REQUIRED=false` in Vercel and redeploy.
  2. If 098 is applied, also turn the database flag off.

  This restores password-only admin access, exactly as before.
- **Remove a lost factor.** An operator with project access opens the Supabase dashboard → Authentication → Users → the account → **MFA factors** and deletes the lost factor. The service-role admin API offers the same: `auth.admin.mfa.deleteFactor`.

  Then the person enrols again at `/admin/mfa`. Never share or store the TOTP key outside the authenticator app. The one
  exception is the two CI QA accounts (next section).
- No secret, key or recovery code is kept in this repository.

## CI QA accounts (AUTH-HARDEN-1, owner decision 2026-11-14: no exemptions)

The CI identities `qa-admin@courage-library.test` and `qa-staff@courage-library.test` get MFA like every other admin
and staff account:
- **Where the keys live:** their TOTP keys are stored only as GitHub Actions secrets (environment `ci-live`) and in the
  local `.env.local`, as `QA_ADMIN_TOTP_SECRET` and `QA_STAFF_TOTP_SECRET`.
- **How the gates use them:** the live gates mint their sessions through `scripts/live/qa-session.cjs`. Once a key is
  configured, the helper generates the 6-digit code at runtime (`scripts/lib/totp.cjs`, RFC 6238) and raises the
  session to AAL2.
- **Never exposed:** the keys and codes are never printed, logged, cached or committed. CI's log-scan treats both
  variables as secrets.
- **Before a key is configured:** the session stays AAL1, as today.

### Owner steps: enrol the two QA accounts (once)

Do this for `qa-admin@…` first, then for `qa-staff@…`:

1. **Sign in as the QA account.** Open `https://couragelibrary-next.vercel.app/auth/login` in a private window and sign
   in with that QA account's e-mail and password (from your `.env.local`: `QA_ADMIN_PASSWORD` / `QA_STAFF_PASSWORD`).
2. **Start enrolment.** Open `/admin/mfa` and choose **"Set up authenticator app"**.
3. **Scan and copy.** Scan the QR code with your authenticator app (it then shows the QA account's codes; you need
   them for step 6, and to sign in as the QA account by hand later). Under the QR code, **"Can't scan? Enter this key
   by hand"** shows the key: copy it exactly (letters and digits).
4. **Store it in GitHub.** Go to GitHub → `Courage-Library/couragelibrary-next` → Settings → Environments → **ci-live** →
   Environment secrets → **Add environment secret**:
   - name `QA_ADMIN_TOTP_SECRET` (or `QA_STAFF_TOTP_SECRET` for staff);
   - value: the key;
   - **Add secret**.
5. **Store it locally.** Add the same line to `E:\Courage Library\.env.local`: `QA_ADMIN_TOTP_SECRET=<the key>` (or the
   staff one). Never paste it in a chat, an issue or a commit.
6. **Finish enrolment.** Back on `/admin/mfa`, enter the 6-digit code your authenticator app shows for this account.
   The page then says "Two-step verification is active for this session". Sign out.
7. **Tell the engineer.** They then run `node scripts/live/qa-session.cjs --probe` locally. It must show
   `PASS Q-03 qa-admin: AAL2 session` (and the same for qa-staff). It prints no key and no code.

### Switching admin MFA on in production (in this order)

1. **Your own admin account:** enrol (steps in "Turning it on" above), including a second device.
2. **Both CI QA accounts:** enrolled (steps above), and the local probe shows Q-03 PASS for both.
3. **One CI run with MFA on:** the engineer runs one `workflow_dispatch` with `live: true` and **`admin_mfa: true`**.
   The live jobs' server then runs with `ADMIN_MFA_REQUIRED=true`. It must be green.
4. **Only then** set `ADMIN_MFA_REQUIRED=true` in Vercel (Production) and **Redeploy**.
5. **Check:** open `/admin` in a fresh sign-in. It must send you to `/admin/mfa` before any admin page.
6. **Afterwards (engineer):** make `ADMIN_MFA_REQUIRED=true` the CI default, so the nightly run matches production.
   The database flag `security_settings.admin_mfa_required` (098) stays a separate, later step.

## What is checked

The gate is `scripts/test_admin_mfa.cjs` (CI offline `ADMIN-MFA`). It checks four things:

- With the flag off, everything behaves as it did before.
- With the flag on, an AAL1 admin is denied for actions and API routes, and redirected to `/admin/mfa` for pages.
- An AAL2 admin is allowed.
- Students are unaffected: still FORBIDDEN or not found, with no MFA prompt, and no MFA check runs.
