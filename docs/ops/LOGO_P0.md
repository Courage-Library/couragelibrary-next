# LOGO-P0 — /admin/exams "This page could not be loaded" (2026-10-31)

## Root cause (confirmed by the owner's Vercel log)

`Error: Body exceeded 1 MB limit … statusCode 413` on the logo upload **Server Action**. The page itself loaded; the
upload POST was rejected by Next's default `serverActions.bodySizeLimit` (1 MB) before our validation ran. The client
awaited the action inside `startTransition` without a try/catch, so the thrown error reached the admin route error
boundary and the whole page showed "This page could not be loaded".

Refuted on the way (kept as defence, not the cause):

- sharp native binary missing from the lockfile: the lockfile has `@img/sharp-linux-x64` + `@img/sharp-libvips-linux-x64`.
- file tracing dropping libvips: Next's bundled tracer has a sharp special case that emits sharp's installed `@img/*`
  packages; `scripts/ci/sharp-trace-check.cjs` proves the traced Linux set alone encodes (negative control included).
- Kept from LOGO-P0 (4b617b4): sharp loaded lazily, `/api/health/image` probe, SHARP-TRACE CI check.

## Fix (LOGO-P0b + LOGO-UX-1)

1. The browser resizes / pads the logo to 512 × 512 before upload (`lib/logos/logo-prepare.ts`) and refuses a payload
   over 1 MB — "File is X MB; maximum is 1 MB. Resize to 512×512 and try again." — nothing is sent.
2. `experimental.serverActions.bodySizeLimit = "2mb"` (the 1 MB file rule + multipart headroom). The server still
   enforces the 1 MB file rule, sniffs the bytes and re-encodes (trust boundary unchanged).
3. Every logo action call is wrapped (`guarded()` in `components/admin/logos/logo-drawer.tsx`): 413, network or server
   errors are an inline "nothing was saved", never the error boundary.

## What the 2 MB limit applies to

Next has ONE body limit for every Server Action (237 exported actions in 31 files). Review:

| Group | Actions | Own input limit |
|---|---|---|
| File uploads | `uploadOrgLogoAction`, `uploadExamLogoOverrideAction`, `createConductingOrgWithLogoAction` (admin) | 1 MB file rule + sniff + re-encode (unchanged) |
| File uploads | `uploadBulkImportImageAction` (staff + admin) | **had none** → now 1 MB + PNG / JPG / WebP / GIF only |
| File uploads | `uploadRewardImageAction` (admin) | claimed 10 MB (really the 1 MB framework limit) → now 1 MB |
| Student / anon free text | `createTicketAction` (validateTicket), `saveMistakeNoteAction` (≤ 2,000 chars), `reportQuestionAction` (note ≤ 500), `saveOnboardingAction` (validateAnswers), auth forms | capped in their validators / RPCs |
| Student structured | practice / memory-lock / live-test answers, goals, profile, drills, performance reads | ids, enums, booleans, numbers — no free-form payload |
| Admin / staff (guarded) | syllabus import (IMPORT_MAX_BYTES 256 KB, also in the DB), lesson / exam-note drafts (block validator + DB), prompt templates (20,000 chars), the rest | trusted roles behind `guardAdminAction`; the larger body is reachable only after the role check |

## Admin upload forms — could they hit the error boundary the same way?

| Form | Before | Now |
|---|---|---|
| Conducting bodies / exam logo (`conducting-bodies-panel`, `exam-logo-override`) | **yes** — transition, no try/catch | shared `LogoDrawer`, every call guarded |
| Syllabus "Import draft" (`syllabus/import-draft.tsx`) | **yes** — transition, no try/catch (file ≤ 256 KB, so no 413; network / server errors) | `.catch` → inline message |
| Question manager images (`admin-question-manager.tsx`) | no boundary (plain handler) but a throw left the spinner on forever | 1 MB pre-check + `.catch` |
| Bulk import studio images | already try/catch | unchanged (server now caps 1 MB) |
| Reward image (`reward-editor-modal.tsx`) | already try/catch, optimised in the browser | unchanged (server now caps 1 MB) |
| Lesson images | not uploaded through a Server Action | — |

Other admin screens still await actions inside transitions without a catch (non-upload); a shared `safeAction`
helper for them is in the backlog (ACTION-CATCH-1).
