# Supabase email templates (AUTH-1 2b-2)

These are the branded templates for the Supabase auth emails of project **couragelibrary-next**.

- **Sender:** `no-reply@couragelibrary.in`, via the ZeptoMail SMTP the owner has already configured. Do not change the SMTP settings.
- **Design:** BRAND-2 Royal Blue + Amber (decision #71): 600px max, system fonts only (email clients cannot load web fonts reliably), a blue #1D4ED8 header bar with the text wordmark and a small amber dot, white card on the light page colour, one blue button (≥ 44px, white text) with a plain-text link under it, a hidden preheader and a short "You received this because…" footer. Colours are the design tokens; inline CSS only.
- **Kept out on purpose:** images, tracking pixels and external assets.
- **Plain-text friendly:** each email also shows the link as text.

## Link format

Every link uses our existing cross-device `/auth/confirm` route (decision #60), never `{{ .ConfirmationURL }}`:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>&next=<path>
```

The route (`app/auth/confirm/route.ts`) works like this:
- It accepts the types `signup`, `email`, `recovery`, `email_change` and `invite`, and calls `verifyOtp({ type, token_hash })`.
- It rejects a token hash longer than 512 characters.
- `next` goes through the safe-redirect sanitiser (#20).
- `recovery` always lands on `/auth/update-password`.
- Any failure goes to `/auth/login?m=link-expired`.

| File | Supabase field (Authentication → Emails → Templates) | Subject | `type` | `next` |
|---|---|---|---|---|
| `email-templates/confirm-signup.html` | **Confirm signup** | Confirm your email for Courage Library | `email` | `/dashboard` |
| `email-templates/invite.html` | **Invite user** | You're invited to Courage Library | `invite` | `/auth/update-password` (the invited user then chooses a password) |
| `email-templates/magic-link.html` | **Magic Link** | Your Courage Library sign-in link | `email` | `/dashboard` |
| `email-templates/change-email.html` | **Change Email Address** | Confirm your email change for Courage Library | `email_change` | `/dashboard` |
| `email-templates/reset-password.html` | **Reset Password** | Reset your Courage Library password | `recovery` | `/auth/update-password` |

**Why `type=email` for sign-up and magic link:** Supabase recommends `email` for token-hash verification of both. The route also still accepts `signup`.

**Not covered here:** the **Reauthentication** template, which sends a code (`{{ .Token }}`), not a link. The app does not use it yet.

## Owner steps

1. **Check the site URL.** In Supabase → Authentication → URL Configuration, **Site URL** must be the production origin (`https://…`), because every link starts with `{{ .SiteURL }}`.
2. **Paste the templates.** In Supabase → Authentication → Emails → Templates, for each row above:
   - set the **Subject**;
   - paste the whole file into **Message body** (source view);
   - press **Save**.
3. **Test** with your own account:
   - "Forgot password?" on `/auth/login`: the email arrives from `no-reply@couragelibrary.in`;
   - the button opens `/auth/confirm…` and then lands on `/auth/update-password`;
   - the link also works when opened on a different device.
4. **Leave alone:** the SMTP settings and the sender.

**Gate:** `scripts/test_auth1_2b2.cjs` checks each template:
- it contains `{{ .TokenHash }}` and points to `/auth/confirm`;
- its `type` is accepted by the route;
- it has no `http://` links, no `<img>` and no `{{ .ConfirmationURL }}`.
