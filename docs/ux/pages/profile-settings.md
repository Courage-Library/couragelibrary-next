# Profile and settings: `/settings/*`

**Purpose.** Let students view and change their candidate profile, preferences, notifications, subscription and account. It is the editable side of onboarding (#29).

**User and job-to-be-done.** A student whose plans changed (a new exam, more study time), or who needs account tasks. Their job: "Update my exam or language and have everything adapt."

## Pages
A settings layout with a left sub-nav on desktop and a list → detail flow on mobile.

| URL | Section | Fields / actions | Data |
|---|---|---|---|
| `/settings/profile` | Profile | Name, photo, phone (optional, with a reason: "for library / CNTS updates") | `user_profiles` (`full_name`, `avatar_url`, `phone`) ✔ |
| `/settings/exams` | My exams | Target exams (add / remove / reorder, max 3), target cycle or year per exam, daily study time, stage | `user_exam_goals` ✔ + **missing** `preparation_stage`, `target_year` (see onboarding) |
| `/settings/preferences` | Language and study | UI language (English / हिन्दी), exam medium, default test language | `user_profiles.language_preference` ✔ + **missing** `exam_medium` |
| `/settings/notifications` | Notifications | In-app, email, WhatsApp, push toggles; exam alerts, reminders, gamification, marketing (off by default); quiet hours | `user_notification_preferences` ✔ (all columns exist; no UI today) |
| `/settings/subscription` | Subscription (absorbs `/billing`) | Current plan, validity, invoices, payment orders, "Manage" (when Commerce exists) | `BillingService` (status fix pending: `B-BILLING-SUB-STATUS`) |
| `/settings/account` | Account | Email (read-only), change password (`/auth/update-password` flow), sign out of all devices, **delete account** (request flow, confirmation, explains data retention), download my data (later) | Supabase auth; deletion needs a defined process (privacy policy) |

**Components.** Sub-nav (Sidebar variant / list), Input, Select, Switch, Radio tiles, Exam card (compact, reorderable with keyboard-accessible up/down buttons, not drag-only), Button, Toast ("Saved"), Modal (destructive confirmation).

**States.**
- Each form saves per section with an explicit "Save". Leaving with unsaved changes prompts the student. Validation errors appear inline.
- Changing the primary exam shows a note: "Your dashboard and plan will update."

**Access tier.** Signed-in.

**SEO.** noindex.

**Analytics events.** `settings_viewed` (with section), `profile_updated`, `exam_goal_added`, `exam_goal_removed`, `language_changed`, `notification_pref_changed`, `account_delete_requested`.

**Mobile behaviour.** A list of sections → a detail page with a back chevron. The save bar is sticky at the bottom.

**Dependencies.**
- The profile schema additions (same as onboarding).
- Account deletion policy (owner / legal).
- Commerce for subscription management.

Build phase: UX-3, alongside onboarding.

**Security.** The delete and password flows reuse the canonical auth actions, and redirects use `sanitizeRedirectPath` (#19 / #20). No PII appears in URLs.
