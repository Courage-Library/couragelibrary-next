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

  Then the person enrols again at `/admin/mfa`. Never share or store the TOTP key outside the authenticator app.
- No secret, key or recovery code is kept in this repository.

## What is checked

The gate is `scripts/test_admin_mfa.cjs` (CI offline `ADMIN-MFA`). It checks four things:

- With the flag off, everything behaves as it did before.
- With the flag on, an AAL1 admin is denied for actions and API routes, and redirected to `/admin/mfa` for pages.
- An AAL2 admin is allowed.
- Students are unaffected: still FORBIDDEN or not found, with no MFA prompt, and no MFA check runs.
