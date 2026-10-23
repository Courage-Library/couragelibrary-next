# Cloudflare Turnstile on the auth forms (AUTH-1 2b-2)

Turnstile protects sign-in (email form **and** Google), sign-up and password reset. It is **behind a feature flag that is OFF by default**. With the flag off nothing changes: no Turnstile script, no widget and no request to Cloudflare.

## Architecture

1. **Supabase verifies the token, we never do.**
   - The owner enables Supabase → Authentication → Attack Protection → **CAPTCHA protection** → **Turnstile** and enters the Turnstile **secret** there.
   - Our server never needs the secret. It must never appear in the repo, env files, tests or logs; a gate fails on any Turnstile-secret-looking value in a tracked file.
2. **The widget** (`components/auth/turnstile-widget.tsx`):
   - script `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`, explicit render, no npm package (#44);
   - rendered only when the server page passes the public site key, on:
     - `/auth/login`: **one** widget shared by the email form and the Google button;
     - `/auth/signup`: only when the form is shown;
     - `/auth/forgot-password`, which is now a server page plus a client form.
3. **Token flow.** The widget puts the token in the hidden form field `captchaToken`. The Google button reads the page's current token when Google calls back and passes it as the third argument of `signInWithGoogleAction`.
4. **Server checks, before any Supabase call** (`lib/auth/captcha.ts` → `checkCaptchaToken`):

   | Flag | Token | Result |
   |---|---|---|
   | Off | anything | nothing required, nothing sent |
   | On | missing or empty | `captcha-required` |
   | On | not a string, or over 2048 characters | `captcha-failed` |
   | On | otherwise | passed as `options.captchaToken` to `signInWithPassword`, `signUp`, `resetPasswordForEmail` and `signInWithIdToken` |

   In the Google action the check runs after the flag and credential checks, and **before** the nonce is spent.
5. **Fixed messages only.** A Supabase captcha error (`captcha_failed` / "captcha protection …") becomes `captcha-failed`; the raw text is never shown.

   | Code | Message |
   |---|---|
   | `captcha-required` | Please complete the security check and try again. |
   | `captcha-failed` | The security check didn't work. Please try again. |

   Both codes are on the `?m=` allow-list too, because a failed Google attempt reloads the page.
6. **Tokens are single use.**
   - **Email forms:** after every submit result the widget is reset (`turnstile.reset`) and the spent token is cleared.
   - **Google:** any failure (except `google-disabled`) reloads `/auth/login?m=<code>` in full (2b-1a), which renders a fresh widget.
   - **Google clicked before the check finishes:** the result is `captcha-required`, followed by the same reload.
7. **No CSP.** The app sets no Content-Security-Policy, so no allow-list change was needed for `challenges.cloudflare.com`. If a CSP is added later, it must allow that host for `script-src` and `frame-src`.

## Flag

| Variable | Where | Value |
|---|---|---|
| `AUTH_CAPTCHA_ENABLED` | Vercel env (server) | `true` turns it on; anything else is off |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Vercel env | the Turnstile **site key** (public) |

The flag is ON only when both are set and the site key is well formed (letters, digits, `_`, `-`; at most 100 characters). The server reads both at runtime and passes the key to the page.

## Safe rollout order

The order matters. Supabase rejects requests without a token once CAPTCHA is enabled there, so the code must already be sending tokens.

1. **Cloudflare dashboard.** Turnstile → Add widget:
   - mode **Managed**;
   - hostnames: the production domain, plus `localhost` only if you test locally.

   Copy the **site key** and the **secret key**.
2. **Vercel** → Settings → Environment Variables (Production):
   - set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the site key;
   - set `AUTH_CAPTCHA_ENABLED` to `true`;
   - **redeploy**.

   Tokens are now sent, but Supabase ignores them, so nothing can break yet.
3. **Check the pages.** `/auth/login`, `/auth/forgot-password` (and `/auth/signup` once it is open) show the Turnstile check.
4. **Supabase dashboard** (project couragelibrary-next) → Authentication → Attack Protection:
   - enable **CAPTCHA protection**;
   - provider **Turnstile by Cloudflare**;
   - paste the **secret key** here only;
   - save.
5. **Verify.**
   - **Email login:** sign in with email and password on `/auth/login`. It should land on `/dashboard`.
   - **Google login:** sign in with Google on `/auth/login`. It should land on `/dashboard`.
   - **Forgot password:** request a reset on `/auth/forgot-password`. You should see "Check your email", and the email should arrive.
   - **Failure message:** a wrong password still says "Email or password is incorrect.", and a second attempt works (the widget was reset).

## Turning it off

The order is the reverse of the rollout:

1. **Supabase FIRST:** in Attack Protection, disable **CAPTCHA protection**.
2. **Then Vercel:** set `AUTH_CAPTCHA_ENABLED` to `false` (or remove it) and redeploy.

Reversing these steps would block every sign-in. With the flag off but Supabase still enforcing, no token is sent and Supabase rejects every request with `captcha-failed`.

**Files:**
- `lib/auth/captcha.ts`
- `components/auth/turnstile-widget.tsx`
- `types/turnstile.d.ts`
- `app/auth/actions.ts`
- `app/auth/google-actions.ts`
- `components/auth/google-signin-button.tsx`
- `app/auth/login/{page,login-form}.tsx`
- `app/auth/signup/{page,signup-form}.tsx`
- `app/auth/forgot-password/{page,forgot-password-form}.tsx`
- `lib/auth/messages.ts`
- `lib/auth/google-signin.ts`

**Gate:** `scripts/test_auth1_2b2.cjs`.
- Offline, it runs in the CI `offline` job.
- `--probe` runs the real-server HTML checks with the flag off and on, in the CI job `server-checks` (decision #69).
