# AUTH-UX-1 — Sign-in / Sign-up Spec v1 (owner-approved 24 Nov 2026)

Visual reference: `docs/design/auth-ux-v1-reference.html` (desktop sign-in, phone sign-in, error + security check, create account; 10 numbered changes). Palette/logo/fonts per LANDING_V1_SPEC (cl-* tokens); visitor header + PublicFooter per NAV-1 / FOOTER-1 (no sign-up band on auth pages).

## 0. Non-negotiables
- **Presentation and flow wording only.** Supabase auth, Google sign-in mechanism, session handling, redirects, Cloudflare Turnstile server-side verification, rate limits, email verification and password rules stay as they are.
- **The eligibility rule must not get weaker, but no age number appears on any auth screen** (owner decision: it reads negatively). The rule lives in the Terms; sign-up requires one consent that references it. No account may be created without that consent — by email or by Google, from any page. Server-side recording/enforcement stays as today (report what is stored). If moving the checkbox off sign-in needs a backend/DB change, stop and report (separate phase).
- No secrets in client code; no new dependencies unless Step 0 shows none exist.
- No emoji. Errors never reveal whether an email exists ("Email or password is incorrect").

## 1. Pages in scope
Sign in · Create account · Forgot password · Reset password · (email-verification / check-your-inbox page if it exists). One shared auth layout.

## 2. Layout
- **Desktop ≥ 1024 px:** split 50/50 under the visitor header. Left: brand panel (band gradient #485BFF→#3973D6, logo mark watermark ≈ 12% white), tagline "Learn smarter. Prepare independently.", one sentence, 3 feature rows with white line icons, small note "Free during early access." (only while the paywall master switch is off). Right: form column, max width 400 px, vertically centred.
- **Feature claims are data-driven (don't oversell):** reuse the landing's claim gating. "Current affairs mapped to your exam" only if published CA exists; otherwise substitute a true feature (e.g. "Practice by topic"). "Daily free mock" only if the daily mock exists. Mistake Vault is real.
- **Phone/tablet < 1024 px:** no brand panel; form first, 20 px side padding; fields and buttons 48 px tall.

## 3. Sign in (numbers = reference)
2. Notices (e.g. "You've been signed out.") = small neutral notice (cl-cloud bg, slate text, green check icon), `role="status"`, auto-fades after ~5 s; errors never fade.
3. Heading "Welcome back" (Poppins, charcoal); sub "Sign in to continue your preparation."
4. Order: Google → divider "or sign in with email" → Email → Password → Sign in → Cloudflare line → "New here? Create a free account". **No age checkbox and no age sentence on sign-in.** Google button: keep the current mechanism; style it as a 48 px outlined full-width button ("Continue with Google", Google G logo per Google brand rules). If Google's rendered/personalised button is used today, configure its options (outline theme, rectangular, full width) instead of replacing the flow.
5. Password: show/hide eye button (aria-label "Show password"/"Hide password", aria-pressed); "Forgot password?" link right of the label; no red asterisks; `type="email"`, `autocomplete="email"` / `current-password`, `inputmode="email"`; focus ring cl-blue + tint.
6. Cloudflare: client widget in interaction-only appearance (visible only when Cloudflare needs interaction); a small line "Protected by Cloudflare" under the button. Server verification unchanged.
7. Errors: message under the relevant field (or form-level for credentials), coral text #C2401F + icon + border, `aria-describedby`, focus moves to the first error. Copy: "Email or password is incorrect. Try again or reset your password." Other existing cases (email not verified, too many attempts, Google failed, network) get plain-language messages.
8. Security check failed/expired: card "Quick security check — Cloudflare needs one more check. It usually finishes by itself." + **Retry** (re-renders the widget) + hint "Try turning off VPN or ad-blocker." Sign in button disabled until a token exists.

## 4. Create account
9. First element: one consent checkbox **"I agree to the Terms and Privacy Policy, and confirm I'm eligible to create an account."** (links open in new tab). It gates **both** "Sign up with Google" and the email form: if unticked, pressing either shows an inline error on the checkbox ("Please accept the Terms and Privacy Policy to continue.") and focuses it.
- **Google from the sign-in page with a new account:** must not create an account without age confirmation. Step 0 reports how this is enforced today; preferred behaviour: send the user to Create account with the Google option and the consent line (message "Accept the Terms and Privacy Policy to create your account"), using the existing mechanism.
- Fields: Full name (only if the current sign-up collects it), Email, Password.
10. Password: hint "At least 8 characters" (or the real current rule), 4-step strength bar (text label for screen readers), eye toggle. Button "Create account". Below: "Already have an account? Sign in".

## 5. Forgot / Reset password
Same layout. Forgot: email field + "Send reset link"; success message never reveals whether the email exists ("If an account exists for this email, we've sent a reset link."). Reset: new password + confirm (eye toggles, strength bar) + "Update password".

## 6. Copy (EN; these pages are English today)
Welcome back · Sign in to continue your preparation. · Continue with Google · or sign in with email · Email · Password · Forgot password? · Show password / Hide password · Sign in · Protected by Cloudflare · New here? Create a free account · Create your free account · Takes less than a minute. · I agree to the Terms and Privacy Policy, and confirm I'm eligible to create an account. · Sign up with Google · or with email · Full name · At least 8 characters · Create account · Already have an account? Sign in · Quick security check · Retry · You've been signed out. · Email or password is incorrect. Try again or reset your password. · Please accept the Terms and Privacy Policy to continue.

## 7. Accessibility & quality
One h1 per page; labels tied to inputs; visible focus; targets ≥ 48 px; errors announced (aria-live); reduced motion respected; no layout shift when the Cloudflare widget appears (reserve space only when shown, CLS < 0.1); works at 1366×768, 1920×1080, 768×1024, 390×844, 360×740; autofill and password managers work.

## 8. Terms check (report only)
Verify the Terms (and Privacy Policy) state the eligibility rule clearly (minimum age / parental-consent rule). If not, report — do not edit legal pages in this phase.

## 9. Out of scope
Magic link / OTP sign-in, social providers other than Google, Hindi auth pages, admin login, CNTS auth, DB/schema changes, changes to the age rule itself (13+ with parental consent is AGE-CONSENT-1).
