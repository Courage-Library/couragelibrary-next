# Sign in with Google (AUTH-1 2b-1, decision #66)

Google is the primary sign-in, with email + password as the fallback (#59 / #60). It is **behind a feature flag that is OFF by default**. With the flag off nothing changes: no Google script, no button and no request to Google.

## Architecture

1. **Button on our own origin.** Google Identity Services (`https://accounts.google.com/gsi/client`) renders the "Continue with Google" button on `/auth/login`.
   - Popup mode, FedCM where the browser supports it, ITP support.
   - **No One Tap** or automatic prompt.
   - We do **not** use the Supabase redirect OAuth flow, because its consent screen shows a supabase.co domain.
2. **Nonce, single use.** The middleware mints a random raw nonce for each render of `/auth/login`. Server Components cannot set cookies, which is why the middleware does it.
   - It stores the raw value in the httpOnly cookie `cl_g_nonce`: `SameSite=Lax`, `Path=/`, `Max-Age=600`, `Secure` in production.
   - The page passes **only SHA-256(raw)** (hex) to the browser, and Google puts that hash into the ID token.
   - An existing valid nonce cookie is **reused**, never replaced, so a router prefetch of `/auth/login` or a second tab cannot invalidate the hash an open page holds. Next.js strips its router headers before middleware runs, so prefetches cannot be detected there.
   - Single use still holds: the server action deletes the cookie, and the next page render mints a new one.
3. **Server-side exchange.** The button sends the ID token to the server action `signInWithGoogleAction` (`app/auth/google-actions.ts`). In order:
   1. The flag is checked **on the server**; off → `google-disabled`.
   2. The credential must be a string of at most 4096 characters with exactly 3 base64url segments; otherwise → `google-failed`, and Supabase is not called.
   3. The raw nonce is read **and deleted** from the cookie (single use); missing → `google-nonce`.
   4. `supabase.auth.signInWithIdToken({ provider: "google", token, nonce: raw })` runs through the 5 s auth timeout (#61).
   5. On success: insert-only `ensureProfile`, then a redirect through `lib/auth/safe-redirect.ts` (default `/dashboard`, #20).
4. **Roles never change.** Roles come only from `app_metadata` (#60). Nothing reads Google claims or `user_metadata` for roles.
5. **Fixed messages only.** No Google or Supabase error text is shown, and the server log records only code, status and error name.
6. **Retry after a failure (2b-1a).**
   - Every attempt spends the nonce. So after any error except `google-disabled`, the button reloads `/auth/login?m=<code>` **in full**, keeping `next` only if `lib/auth/safe-redirect.ts` accepts it.
   - The fresh page load mints or reuses a nonce and re-initialises Google; the message comes back through the `?m=` allow-list.
   - The middleware mints **only on GET**: a server-action POST never mints, so a stale retry fails at the action's missing-nonce check, before any Supabase call.

| Situation | Code | Message |
|---|---|---|
| Flag off | `google-disabled` | Google sign-in is not available right now. Please sign in with your email and password. |
| Bad / foreign token, provider off | `google-failed` | We couldn't sign you in with Google. Please try again, or use your email and password. |
| Nonce missing / mismatched | `google-nonce` | Your sign-in session expired. Please try again. |
| New Google user while sign-ups are off | `signup-closed` | Registrations are not open yet. |
| Supabase unreachable / timeout | `generic` | Something went wrong on our side. Please try again in a few minutes. |

**Files:**
- `lib/auth/google-flag.ts`
- `lib/auth/google-nonce-core.ts` (edge-safe)
- `lib/auth/google-nonce.ts` (server-only)
- `lib/auth/google-signin.ts`
- `app/auth/google-actions.ts`
- `components/auth/google-signin-button.tsx`
- `app/auth/login/page.tsx` + `login-form.tsx`
- `middleware.ts`
- `types/google-gsi.d.ts`

**Gate:** `scripts/test_auth1_2b1.cjs`, offline T-01…T-13; `--live` L-01/L-02 runs in CI.

## Flag

| Variable | Where | Value |
|---|---|---|
| `AUTH_GOOGLE_ENABLED` | Vercel env (server) | `true` turns it on; anything else is off |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Vercel env (public, inlined at build) | the Google **web** client id, ending in `.apps.googleusercontent.com` |

The flag is ON only when both are valid. The Google **client secret** never goes into the repo, env files, tests or logs; it is entered only in the Supabase dashboard. A gate fails if the client-secret prefix ever appears in a tracked file.

## Owner steps

1. **Google Cloud console** (OAuth client of type *Web application*):
   - Authorised JavaScript origins: the production origin, plus `http://localhost:3300` only if you want to test locally.
   - No redirect URI is needed: the popup flow and ID-token exchange use none.
   - Consent screen: app name **Courage Library** and your own domain.
2. **Supabase dashboard** (project couragelibrary-next): Authentication → Sign In / Providers → **Google**:
   - enable it;
   - Client IDs: the web client id;
   - Client Secret: enter it **here only**;
   - leave "Skip nonce check" **off**.
3. **Vercel** → Settings → Environment Variables (Production):
   - set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to the web client id;
   - set `AUTH_GOOGLE_ENABLED` to `true`;
   - then **redeploy**. The public id is inlined at build time.
4. **Manual test** with your own test Gmail account (an account that already exists on the platform):
   - open `/auth/login`, choose "Continue with Google", and complete the popup;
   - you should land on `/dashboard`;
   - a Google account with no Courage Library account gets "Registrations are not open yet." while public sign-up is off.
5. **Turn it off:** set `AUTH_GOOGLE_ENABLED` to `false` (or remove it) and redeploy. The button, the script and the server action are all disabled; the action answers `google-disabled` even if called directly.

**Not in this phase:** One Tap, a Google button on the sign-up page, account linking UI.
