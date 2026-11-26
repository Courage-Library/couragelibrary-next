# ADMIN-MFA-UX-1 — Admin two-step verification UI (owner-approved 26 Nov 2026)

Visual reference: `docs/design/admin-mfa-ux-v1-reference.html` (pins 1–10). Layout, palette, fonts and components follow AUTH_UX_V1_SPEC (shared AuthShell: brand panel ≥1024 px, form column ≤ 420 px) and DESIGN_LANGUAGE.

## 0. Non-negotiables (security unchanged)
- **UI only.** Supabase MFA calls (enroll / challenge / verify / listFactors / unenroll if present), the AAL2 requirement, `requireAdminPage({allowAal1:true})` on the MFA page, the MF-06 loop fix (MFA page outside the guarded admin layout), redirects and the `next` handling stay functionally identical. No DB, RLS, env or flag change.
- Never log or persist the TOTP secret, QR data or codes; secret/QR shown only during enrolment, never cached, not in analytics.
- `next` stays validated by the existing safe-redirect helper.
- No emoji; our palette (charcoal, Space Blue #475BFF, coral #C2401F errors with icon + text).

## 1. Shared frame
1. Uses the AuthShell brand panel: shield icon, "**Admin studio** is protected." (setup) / "**One more step** to the admin studio." (return), plain-words reason, 3 reassurance points (setup only). Hidden on phones (form first, logo top bar).
2. **Account row:** "Signed in as j•••@domain" (masked: first letter + domain) + "Not you? Sign out" (existing sign-out action).
3. Two-tone Poppins heading; Space Blue primary button; 48 px targets.
6. Footer row: "Trouble? Get help" (support email) and "← Back to the site" (`/`). Remove the "← Admin studio" link.

## 2. First-time setup (no verified factor)
4. 3-step indicator: Install app → Scan code → Enter code; states done/current/upcoming in text + colour; `aria-current="step"`.
8. Step 1: app chips (Google Authenticator, Microsoft Authenticator, 1Password) + "I have an app — next". On phones, a line that a setup key will be shown to copy.
5. Step 2: QR (from enroll response, rendered as image/SVG with alt "QR code for your authenticator app") + setup key grouped in 4s in monospace with **Copy key** (clipboard; "Copied" confirmation via aria-live) + "I've scanned it — next". If an unverified factor already exists from an abandoned attempt, reuse or clean it up exactly as today's code does (report which).
9. Step 3: 6-box code input = one real `<input inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*">` with six visual boxes; paste fills all; auto-submit optional only after 6 digits (no submit on partial). Error: "That code didn't work. Codes change every 30 seconds — try the newest one." (coral + icon, aria-describedby, focus back to input). Rate-limit/expired messages in plain words. "← Back to scan".
10. Success: "You're protected" card + "Go to admin studio" (→ validated `next` or /admin) + backup tip.
- Steps are client UI over the existing single enrol flow; refresh mid-setup must not create duplicate factors (keep current behaviour; report).

## 3. Returning admin (verified factor exists)
7. One screen: "Enter your code" + 6-box input + "Verify and continue" + "Lost your phone? Contact support". No setup steps, no QR.

## 4. Accessibility & quality
One h1; labels; visible focus; 48 px targets; reduced motion; no layout shift when errors show (reserve space); works at 1366×768, 1920×1080, 768×1024, 390×844, 360×740; works with password-manager/SMS-style code autofill.

## 5. Tests (negative controls)
- MF-06 still green (no self-redirect; AAL1 → /admin redirects to /admin/mfa; AAL2 → /admin 200; student 404; signed-out → login).
- Rendered setup vs return states by factor status (fixtures/mocks only — no production sign-in, no real secrets).
- Secret/QR never in server logs or HTML of the return state; `next` open-redirect attempts rejected.
- Copy: no "← Admin studio" link; masked account shown; error copy present; no emoji.
- Screenshots: setup steps 1–3, error, success, return — desktop + phone.

## 6. Out of scope
Recovery codes, multiple factors management UI, WebAuthn/passkeys, staff onboarding flow, admin dashboard redesign.
