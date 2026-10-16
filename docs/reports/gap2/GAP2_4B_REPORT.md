# GAP2-4b: admin syllabus editor, admin English-only, canonical syllabus readers

> **Two batches.** Each has its own full gates and pre-authorised commit (hard-stop rule).
> - **Batch 1:** admin syllabus editor + admin English-only cleanup.
> - **Batch 2:** re-point the syllabus readers to the canonical read model.
>
> **Architect notes recorded at 4a acceptance:**
> - terminating a DB session is allowed only for the suite's own orphan, and must be recorded;
> - backlog TEST-HARNESS-TXN;
> - SSC GD stays DRAFT.

## Batch 1: admin syllabus editor + English-only

### 1.1 Pages (admin and staff; SEC-1C guards; design system; zero on the ratchet)

| Route | Content |
|---|---|
| `/admin/syllabus` | Exam picker (all exams, including inactive ones; read-only lookup with the service role after the page guard, because the session client sees only active exams). Version list per exam: version, status (Draft / Published (live) / Archived), source, cycle, published date and publisher (from the `SYLLABUS_PUBLISH` audit row). Actions: **New empty draft**, **New draft from published** (enabled only when a published version exists for the chosen cycle), **Open editor / View**, **Archive** (admin only, confirm dialog). |
| `/admin/syllabus/[id]` | Editor for a DRAFT; read-only view for PUBLISHED / ARCHIVED |

**The editor (`components/admin/syllabus/syllabus-editor.tsx`):**
- **Tree:**
  - WAI-ARIA tree view: `role="tree"` / `treeitem` / `group`, `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded`, `aria-selected`, roving tabindex.
  - Keyboard: ↑ ↓ move, → opens or enters, ← closes or goes to the parent, Home / End, Enter / Space select.
  - Each item shows its kind badge, title, the topic count on UNIT nodes, and a "Fix" badge on nodes with validation errors.
- **Structure actions:**
  - add section / paper (top level);
  - add unit / sub-section inside;
  - move up / down (swaps order);
  - move under another node (PAPER / SECTION parents only, never the node's own subtree);
  - delete with a confirm dialog that states how many nested nodes go with it.
- **Details:**
  - title, kind, weightage tier ("Not set" allowed), expected questions min / max, description, mandatory switch;
  - **empty expected range = unknown (NULL), never 0**;
  - range validated in the form and again in the RPC.
- **Topic picker (UNIT only):**
  - searches active TOPIC nodes by name or subject, with a subject filter;
  - multi-select checkboxes;
  - optional weights with a **live sum check**: each weight above 0 and at most 1, and they must add up to 1.
- **Validation panel:** the `fn_syllabus_validate` report.
  - Errors block publishing, each with **Go to node**, which expands the ancestors and focuses the node.
  - Warnings are shown in a disclosure and never block.
  - **Validate now** re-runs the check.
- **Publish:**
  - **Admin only.** The button is disabled while errors exist.
  - The confirm dialog states what will be archived ("Students will see this version instead of version N, which will be archived", or that nothing is published yet).
  - The result message states the archived version and that an audit record was written.
  - **Staff see the button disabled** with "Only an admin can publish. Ask an admin to review this draft."
  - No admin audit page exists, so the publisher and time appear in the version list instead of an audit link.
- **Read-only** PUBLISHED / ARCHIVED views show the tree and details without edit controls.

### 1.2 Server actions (`app/admin/syllabus/actions.ts`)

| Action | Guard | RPC |
|---|---|---|
| `createSyllabusDraftAction` | staff / admin | `fn_syllabus_create_draft` |
| `upsertSyllabusNodeAction` | staff / admin | `fn_syllabus_upsert_node` |
| `moveSyllabusNodeAction` | staff / admin | `fn_syllabus_move_node` |
| `deleteSyllabusNodeAction` | staff / admin | `fn_syllabus_delete_node` |
| `setUnitMappingsAction` | staff / admin | `fn_syllabus_set_unit_mappings` |
| `validateSyllabusVersionAction` | staff / admin | `fn_syllabus_validate` |
| `publishSyllabusVersionAction` | **admin** | `fn_syllabus_publish` |
| `archiveSyllabusVersionAction` | **admin** | `fn_syllabus_archive_version` |

- **Order of work:** `guardAdminAction` comes first; then input checks (uuids, kinds, tiers, integer ranges, weights length); then the **RPC on the caller's session client**, so the database re-checks the JWT role and audits in the same transaction.
- **Never used:** no table writes, no service role.
- **Errors** go through `lib/syllabus/syllabus-errors.ts`:
  - 42501 → FORBIDDEN;
  - `SYLLABUS_*` codes, cycle and duplicate-slug conditions → curated VALIDATION text;
  - everything else → generic DB_ERROR.
  - **No database text or ids reach the UI.**
- **Publish validation failure** returns the report, and nothing is written.
- **SEC-1B:** the actions are auto-included, with publish and archive in the admin-only set.

### 1.3 QA test exam (migration 081)

- **What:** `qa-syllabus-test`, "QA Syllabus Test (internal)", **inactive**, idempotent. It is a permanent fixture like the QA identities.
- **Why:** the editor's end-to-end test publishes and archives through the real UI, which must never touch a real exam. Published rows are student-visible, and published / archived versions are immutable, so they can't be cleaned up.
- **Students never see it:** the exam hub, `/exams` and the sitemap skip inactive exams.
- **Test history:** archived TEST versions remain on this exam only; drafts left over by an aborted run are archived by the test.
- **Migration discipline:** backup `pre-081-gap2-4b-…`, dry-run → apply → ledger.

### 1.4 Admin English-only (decision #35; no schema change)

| Location | Change |
|---|---|
| Question manager | Hindi removed from the two form selects and the language filter; the conditional "Hindi" badge removed; "bilingual support" copy removed |
| Schedules manager | Medium is **English only** in the program form, the day form and the summary card (Bilingual / Hindi options and the "Students can switch language" copy removed) |
| Bulk Import Studio | Shows "English", or "Not English (English only)" for a pasted non-English row (the generation option was already removed in UX-1b) |

**Permanent static test E-04:** no admin UI file offers a Hindi or bilingual `<option>`, label or Devanagari text.

### 1.5 Found during the batch-1 build

- **Bug, fixed:** the editor reset unsaved form edits and the topic selection on *every* `router.refresh()`, because the reset was keyed on object identity. It is now keyed on a signature of the node's saved data. E-05 has a regression check: a late refresh must not clear a ticked topic.
- **Bug, fixed (robustness):** every edit used to wait for `router.refresh()` inside the transition, so one failed refresh left the editor pending forever.
  - Editing actions now return the fresh editor state (nodes + validation report, read with the caller's session through the shared `lib/syllabus/editor-state.ts`), and the editor applies it immediately.
  - The page refresh is a background sync outside the transition.
  - A successful publish switches the view to read-only at once.
- **Fixed:** the tree's mouse-only expand chevron is now a decorative span, not a nameless button (keyboard users use the arrow keys).
- **Environment:**
  - **The problem.** Intermittent DNS failures for the Supabase pooler / auth hosts made some `router.refresh()` calls fail in the middleware's `auth.getUser()` ("fetch failed", visible in the server log) while the RPC itself had succeeded (audit rows present).
  - **The handling.** The live test waits for stable DNS before running. Each attempt restarts the server, and a failing attempt is reported with its server-log "fetch failed" count.

### 1.6 Batch 1 gates

Run on a local production build.

| Gate | Result |
|---|---|
| tsc / lint / build / `db:types:check` | 0 / 0 / OK / OK |
| **GAP2-4b editor** offline (E-01 … E-04) | **4/4** |
| **GAP2-4b editor live** (E-05 staff draft → section → unit → topic → validate, staff publish disabled, keyboard tree, labelled controls; E-06 admin publish → read model AVAILABLE → archive → NO_SYLLABUS; E-07 seeded drafts untouched, no QA draft left) | **7/7** (server log: 0 fetch failures) |
| GAP2-4a syllabus | 12/12 (see the G-11 note) |
| RLS suite | 8/8 |
| test_types1 / test_types1_close / test_no_runtime_db | 8/8 · 3/3 · 4/4 |
| SEC-1B / 1C / 1D | 26/26 (publish / archive in the admin-only set) · 22/22 (inventory 37) · 14/14 |
| Design ratchet / UX-1b shell / QA guard | 7/7 (the admin syllabus editor is held to zero) · 6/6 · 8/8 |
| Signed-in smokes `admin-pages` (incl. `/admin/syllabus`), `staff-content` (`/admin/content` + `/admin/syllabus`) | all passed |

**Notes:**
- **GAP2-4a G-11** checked that *no* version anywhere was non-DRAFT. The QA test exam now (correctly) holds ARCHIVED TEST versions, so the check is scoped: real exams hold only DRAFTs, and the QA exam must never stay PUBLISHED. Re-run: 12/12.
- **Earlier live attempts** failed only on network: DNS outages / "fetch failed", or a run my own overlapping retry loop interrupted. The design changes in 1.5 removed the editor's dependence on page refreshes. The recorded run passed on its first attempt.

## Batch 2: re-point readers to the canonical read model

BATCH2
