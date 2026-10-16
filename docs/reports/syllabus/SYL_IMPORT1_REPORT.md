# SYL-IMPORT-1 — Syllabus draft importer + SSC CGL Tier-1 draft file

Phase brief (architect): build a safe "Import draft from JSON" path for the canonical syllabus. The path is a JSON contract → validator → preview → ONE atomic, role-checked RPC that creates a DRAFT only. Also produce the SSC CGL Tier-1 syllabus as an import file with source notes. The SSC CGL file is **not** imported by this phase; the owner imports, reviews and publishes it.

Date: 2026-10-16 · DB: couragelibrary-next · Migration: 086 · Baseline commit: `b864978`.

## 1. Forensics

| Question | Finding | Hard stop? |
|---|---|---|
| Can an admin create a taxonomy topic? | Yes: /admin/taxonomy `createTaxonomyNodeAction` (admin only, `guardAdminAction` → `TaxonomyService.createNode`, audited). | no |
| Does an atomic import need new tables / columns? | No. The 079 owner-only helpers (`fn_syllabus__assert_role`, `__create_version`, `__insert_node`, `__audit`) already create versions and nodes under the existing triggers. `source_kind` already allows `IMPORT`, `raw_payload_hash` and `metadata` exist, and `sha256()` is built in. **086 = functions + grants only.** | no |
| Do the EK docs hold a usable SSC CGL Tier-1 syllabus? | Yes, in two PUBLISHED documents, both with `lastVerifiedDate` 2026-10-01 and both citing the official notice (`Notice_of_adv_cgl_2026.pdf`, SOURCE_VERIFIED). **SYLLABUS v1** sections 2–5 give per-subject topic tables (depth, High-Yield) plus "Topic Boundaries". **EXAM_PATTERN v1** section 2 gives the Tier-1 section table (I–IV, 25 questions / 50 marks each, 100 / 200 in total), plus the duration and negative-marking claims. | no |
| Does anything need to publish / archive / touch a PUBLISHED version? | No. The import creates a DRAFT only. Publishing stays in the existing admin flow. | no |
| Validation library? | None in `package.json` (ajv is only a transitive dependency). Asked the architect. Ruling: **hand-written TS validator, no new dependency** (§2). | — |
| State of the target exam | `ssc-cgl` (active, 2026 cycle) has one DRAFT, `pattern-skeleton-2026` (version 1, 2026 cycle). The import refuses while a DRAFT exists for the cycle, so the owner must archive or delete that draft first (§10). | — |
| QA exam | `qa-syllabus-test` (inactive, no cycles; 20 ARCHIVED test versions from earlier suites). All live import tests ran on it only. | — |
| Taxonomy | 4 SUBJECT + 36 TOPIC nodes, all active. Their names match the EK topic rows 1:1. Stable topic identifier: `hierarchy_path` (unique, derived from `parent_id` + `slug`). | — |

## 2. Contract and design

**No validation library — hand-written validator by architect ruling; standing no-new-dependency rule kept.**

- **Contract** (`docs/syllabus/IMPORT_CONTRACT.md`, `contract_version: 1`):
  - Root: `exam` (slug), `cycle_year` (int | null) and the optional `version_tag` / `source_note`.
  - Tree: `papers` → `sections` → `units`, carrying only existing node columns: title, code (→ slug), description, order, `is_mandatory`, `expected_questions_min/max`, `weightage_tier`, `required_cognitive_depth` (UNIT). All are nullable except code and title.
  - Mappings: UNIT `topics[]` = `{ topic: hierarchy_path, weight? }`.
  - Limits: ≤ 256 KB, ≤ 500 nodes, plain text only, unique codes, contiguous order, fixed depth, unknown keys rejected at every level.
- **The validator** (`lib/syllabus/import-contract.ts`) is a pure module with no imports. It meets the architect's conditions:
  1. It is the single implementation, used by `previewSyllabusImportAction`, `importSyllabusDraftAction` and the tests. S-1 asserts that no second validator exists in `app/`, `lib/`, `components/` or `services/`.
  2. Input is `unknown`, narrowed with explicit guards. There is no `any` and no `as` cast other than `as const`; S-1 checks this statically. The TYPES-1 ratchet is unchanged (§7).
  3. It is strict: unknown keys are rejected per level, with `BAD_DEPTH` for a child list under the wrong level and `MAPPING_NOT_UNIT` for `topics` above UNIT. Non-plain objects and arrays are rejected. `contract_version === 1` is checked first.
  4. Errors are typed `{ code, path, message }` with JSON paths. They are collected and capped at 200 (the last entry is then `TOO_MANY_ERRORS`).
  5. Size (UTF-8 bytes, before `JSON.parse`) and node count (a shallow count) are checked before the deep pass. Depth is fixed.
  6. The RPC re-validates everything (§4); it is the authority.
  7. There are offline cases for every error code: 26 codes, one passing and one failing fixture each. U-0 asserts that the code union in the source equals the covered set.
- **Topic resolution:** `resolveImportTopics` does an exact `hierarchy_path` lookup. Unknown paths give `MISSING_TOPIC` with the identifier; inactive ones give `TOPIC_INACTIVE`. Topics are never created and never fuzzy-matched. The preview shows `suggestTopics` names as text hints only, with no checkbox and no mapping.
- **Server actions** (`app/admin/syllabus/actions.ts`): both start with `guardAdminAction({ allowStaff: true })`, so the action is guarded and not only the layout. Neither uses a service-role client.
  - Preview: validator + the session-client taxonomy read in `lib/syllabus/import-catalog.ts`. The editor gate forbids table reads in `actions.ts`, so the read lives there, like `editor-state.ts`. The exam slug and cycle years come from the server-rendered page and only drive the `EXAM_MISMATCH` / `CYCLE_NOT_FOUND` hints; the RPC re-checks both.
  - Import: validator → `fn_syllabus_import_draft` on the caller's session, sending the normalised JSON (`importPayloadToJson`). RPC errors are parsed by `parseImportRpcError`: only the known code and the JSON path are taken from the database text, and the message is curated.
- **UI** (`components/admin/syllabus/import-draft.tsx`, shown in the /admin/syllabus version list):
  1. Upload a `.json` file or paste the JSON.
  2. **Validate** shows a preview: counts, errors (code, path, message), missing topics with hints, and the tree with the mapped topic names.
  3. **Create draft** is disabled while there are errors or missing topics, while a DRAFT exists for the cycle, or when the text changed after validation.
  4. On success it redirects to the editor.
  - Built with `components/ui` only (Alert, Badge, Button, Field, Textarea) and token classes. English only.

## 3. Files

| File | Change |
|---|---|
| `lib/syllabus/import-contract.ts` | new — contract types, the validator, topic resolver, JSON normaliser, RPC error parser |
| `lib/syllabus/import-catalog.ts` | new — taxonomy TOPIC catalog read (session client) |
| `app/admin/syllabus/actions.ts` | + `previewSyllabusImportAction`, `importSyllabusDraftAction` |
| `components/admin/syllabus/import-draft.tsx` | new — import panel |
| `components/admin/syllabus/version-list.tsx`, `app/admin/syllabus/page.tsx` | panel wired in; exam slug passed |
| `supabase/migrations/20261016000086_syl_import1_import_draft.sql` | new — `fn_syllabus_import_draft` + 6 owner-only helpers |
| `docs/database/rollback/086_rollback.sql` | new |
| `types/database.ts` | regenerated (`npm run db:types`) |
| `docs/syllabus/IMPORT_CONTRACT.md` | new — the contract |
| `data/syllabus-drafts/ssc-cgl-tier1.v1.json` | new — SSC CGL Tier-1 draft (not imported) |
| `docs/syllabus/SSC_CGL_TIER1_DRAFT_NOTES.md` | new — per-node sources, confidence, missing topics, owner checklist |
| `scripts/test_syl_import1.cjs` | new — the phase gate |
| `scripts/test_gap2_4b_editor.cjs` | E-01 / E-03 extended to the two new actions (§7) |
| `docs/testing/PERMANENT_GATES.md` | + SYL-IMPORT-1 row |
| `docs/reports/syllabus/SYL_IMPORT1_REPORT.md` | this report |

## 4. Migration, rollback, dry-run

**Migration 086** (`20261016000086_syl_import1_import_draft.sql`, LF) has functions and grants only.

`fn_syllabus_import_draft(p_exam_id uuid, p_payload jsonb)` is SECURITY DEFINER with `SET search_path = ''` and fully qualified names. Its steps:

1. `fn_syllabus__assert_role(false)` — the same check as `fn_syllabus_create_draft`.
2. Exam lookup.
3. Cheap checks: object, ≤ 262144 bytes of jsonb text, contract 1, ≤ 500 nodes.
4. A full validation pass with nothing written. It covers keys per level, codes, order, text (plain, lengths), ranges, enums, depth, UNIT-only mappings, duplicate topics, weights (rounded to `numeric(5,4)`), exam slug and cycle, and resolves every topic by `hierarchy_path` among active TOPICs.
5. The advisory lock (shared with version numbering), then a refusal if a DRAFT exists for the exam + cycle.
6. `fn_syllabus__create_version(…, 'IMPORT', NULL, sha256 hex, metadata)`.
7. Nodes through `fn_syllabus__insert_node` (the existing triggers stay authoritative), then the UNIT cognitive depth.
8. Mappings: `MANUALLY_MAPPED` / 1.00 / `MANUAL`.
9. `fn_syllabus__audit('SYLLABUS_DRAFT_IMPORT', …)` with the sha256 and the counts.

Errors use the form `SYLLABUS_IMPORT_INVALID: <CODE> at <path>: …` (22023; P0001 for `DRAFT_EXISTS`).

- **Helpers:** `fn_syllabus__import_fail` / `_is_plain` / `_text` / `_count` / `_check_node` / `_list` — invoker rights, `search_path ''`, EXECUTE revoked from PUBLIC / anon / authenticated.
- **Grants:** RPC EXECUTE to `authenticated` only (live ACL: `postgres`, `authenticated`).
- **P-9:** green (§7). The pending list is still empty and `SECDEF_PUBLIC_OK` is unchanged.

**Rollback:** `docs/database/rollback/086_rollback.sql` drops the 7 functions. Imported DRAFTs stay as ordinary drafts. Order: 086 → 085 → 084 → …

**Workflow:**
1. **Backup:** `pre-086-syl-import1-2026-10-16T14-22-07` (public dump 1,875,811 bytes, 129 tables; auth data dump) in `E:\CourageLibrary-Backups`.
2. **Dry-run:** 086 + a staff import smoke + bad-payload probes + rollback, in one rolled-back transaction.
   - The import gave 4 nodes / 3 mappings, the hash matched, the audit row was written and validation returned no errors.
   - The re-import was refused with DRAFT_EXISTS.
   - Each of the 7 bad payloads was refused with the expected code and path.
   - The rollback restored the pre-086 function catalogue exactly (sig + md5(prosrc) + ACL + config: `true`).
   - No CR in either file.
3. **Runner dry-run** (`apply-migration.cjs --dry-run`): OK.
4. **Apply:** the first attempt hit a TLS-connect timeout and was refused before connecting. After 3 consecutive good connects, the retry gave **APPLIED + ledger row** (sha256 `2071cb617b48d744…`).
5. **Verify:** counts identical after the apply (§5).
6. **Types:** `npm run db:types` → `types/database.ts` (+34 lines: the RPC and the helpers).

Bugs found and fixed by the dry-run, before the apply:
- A `CASE … THEN` inside a PL/pgSQL `IF` condition cut the condition short (syntax error). It is now parenthesised.
- The bisect script found the exact statement.

## 5. Baselines

Counts and md5 are read-only snapshots. `non_qa_*` are syllabus rows of every exam except the QA test exam.

| Table | Before 086 | After apply | After all suites + UI check |
|---|---|---|---|
| exam_syllabus_versions | 22 / `3a119b8dfcf4` | 22 / `3a119b8dfcf4` | **26** / `1dacf905e5d9` (+4, see note) |
| exam_syllabus_nodes | 55 / `11c196803ed7` | 55 / `11c196803ed7` | **59** / `9be885fcc1b7` (+4, see note) |
| exam_syllabus_canonical_mappings | 23 / `3758629708f2` | 23 / `3758629708f2` | 23 / `3758629708f2` |
| canonical_taxonomy_nodes | 40 / `2adc88902c58` | 40 / `2adc88902c58` | 40 / `2adc88902c58` |
| questions | 113 / `7c8d2aebbfa5` | 113 / `7c8d2aebbfa5` | 113 / `7c8d2aebbfa5` |
| mock_tests | 8 / `025df61b9d6e` | 8 / `025df61b9d6e` | 8 / `025df61b9d6e` |
| test_attempts | 31 / `5aaaa647a354` | 31 / `5aaaa647a354` | 31 / `5aaaa647a354` |
| test_results | 10 / `79b392585fbf` | 10 / `79b392585fbf` | 10 / `79b392585fbf` |
| user_mistake_vault | 12 / `e9c23d7605f0` | 12 / `e9c23d7605f0` | 12 / `e9c23d7605f0` |
| exams / exam_cycles | 5 / 4 | 5 / 4 | 5 / 4 |
| non-QA versions / nodes | 2 / `7855e74567f0` · 26 / `717e18728a0a` | identical | identical (md5) |
| `SYLLABUS_DRAFT_IMPORT` audit rows | 0 | 0 | 3 (suite I1 × 2 runs + UI check; append-only trail) |

**Note on the +4:** all four are QA-exam versions v21–v24, `MANUAL`, **ARCHIVED**, left by the GAP2-4b editor live suite. Its E-05 creates a draft, and its own E-07 archives any leftover. That is the established GAP2-4b precedent; one of the four came from the baseline-worktree run (§7). **No `IMPORT` version remains:** the import suite and the UI check delete their own tagged DRAFTs. All non-QA syllabus rows, the taxonomy, questions, mock tests, attempts, results and the vault are byte-identical (md5). The E2E journey's student rows were removed by cleanup-student (`E2E_KEEP_USER=1`).

## 6. Tests — `scripts/test_syl_import1.cjs`

**45/45 live; 32/32 offline.** Run twice standalone and once in the regression batch.

| ID | Result |
|---|---|
| U-0 | all 26 error codes declared == covered |
| U-* (26) | one passing + one failing fixture each, with the exact JSON path |
| U-1 / U-2 | collected (3 independent errors → 3), capped at 200 with `TOO_MANY_ERRORS`; order: contract → size (before parse) → node count (shallow) → deep; root / paper must be plain objects; the normalised payload re-validates |
| S-1 | one validator (both actions call `validateImportText(rawText)`; no second implementation in app / lib / components / services); 0 casts, no `any`, `unknown` input, pure module; guard first |
| I1 | qa-staff (real session via PostgREST) → DRAFT v21: `IMPORT`, `created_by` = staff, sha256 = `raw_payload_hash` = sha256 of the jsonb text, 6 nodes (kind / depth / order / tier / cognitive depth / ranges as sent), 4 mappings (`MANUALLY_MAPPED`, weights 0.5000 / null), 1 audit row `SYLLABUS_DRAFT_IMPORT` (actor staff, sha256, nodes 6, mappings 4), validates ok |
| I2 | re-import → `P0001 DRAFT_EXISTS`, rows unchanged |
| I3 | student → 403 / 42501 `SYLLABUS_FORBIDDEN`; anon → 401 / 42501; rows unchanged |
| I4 | validator: `MISSING_TOPIC` (exact id, not fuzzy-resolved); RPC: 22023 `MISSING_TOPIC at $.papers[0]…topics[0].topic` naming the id; nothing written, no topic created |
| I5 | RPC: topics on SECTION / PAPER → `MAPPING_NOT_UNIT`; units under PAPER / UNIT, sections under SECTION → `BAD_DEPTH` (5 cases) |
| I6 | RPC + validator: 0.4 + 0.4, partial, out of range, string weight → `WEIGHTS_INVALID` (4) |
| I7 | RPC + validator: script, HTML, markdown link / bold / heading, code span, `javascript:` → `NOT_PLAIN_TEXT` (7) |
| I8 | RPC: > 256 KB, 501 nodes, unknown keys (root / unit / topic), contract 2, exam mismatch, unknown cycle, order gap, duplicate code, range, empty list, duplicate topic in section (13) — no rows in any case |
| I9 | a temporary trigger raising on the 6th (last) node, inside a rolled-back transaction → the forced failure fires; version, 5 nodes, mappings and audit row all rolled back (0 tagged versions); trigger / function gone afterwards |
| I10 | static (migration, actions, UI) + live deployed body: no taxonomy write, no publish / archive; SECURITY DEFINER, `search_path ""`; ACL authenticated only, anon cannot execute; the imported version is a DRAFT; taxonomy md5 unchanged |
| I11 | staff publish / archive of the imported DRAFT → 42501; admin `fn_syllabus_publish` (existing flow, rolled back) → success / PUBLISHED; still DRAFT afterwards |
| I12 | offline: CGL file valid (1 / 4 / 36 = 41 nodes, 36 mappings), no Tier-2 content, numeric values only paper 100 + sections 25, units null; dropping a topic from the catalog → `MISSING_TOPIC` reported. Live: 36/36 topics resolve; the RPC accepts the full file on the QA exam (rolled back: 41 / 36, validate ok, 40 warnings = topics without published questions / documents) |
| CLEANUP | QA-exam rows back to the baseline (20 / 29 / 5); non-QA syllabus + taxonomy md5 identical |

**UI check** (local build, qa-staff, QA exam; scratch script, not a gate). Results:
- unknown key → error list, Create disabled;
- missing topic → listed (with hint), Create disabled;
- valid → preview tree + counts, Create enabled;
- editing the text afterwards → Create disabled until re-validated;
- Create → redirect to the editor showing the imported units;
- back on the list → "A draft already exists for this cycle", Create disabled.

The own DRAFT was deleted afterwards.

## 7. Regression (local production build, `next start -p 3100`)

| Gate | Result |
|---|---|
| tsc / lint / build | 0 errors / 0 errors (warnings only in files this phase does not touch) / OK |
| RLS P-1 … P-9 | **9/9** (P-9: pending list empty, `SECDEF_PUBLIC_OK` unchanged; `fn_syllabus_import_draft` authenticated-only, `search_path ""`) — see flakes |
| GAP2-4a / GAP2-4b readers (`--base`) / GAP2-3 (`--db`) | **12/12** (re-run) · 8/8 · 15/15 |
| GAP2-4b editor | offline **5/5** (E-01 / E-03 extended to the 2 new actions); live **6/8** — E-05 / E-06 fail **identically on `b864978`** (see below) |
| SYL-IMPORT-1 | 45/45 |
| E2E journey → DRILL-1 → student-drill → cleanup (`E2E_KEEP_USER=1`) | 13/13 · 11/11 · 4/4 · OK |
| SEC-1B / 1C / 1D | 26/26 · 22/22 · 14/14 (SEC-1B auto-discovered the 2 new actions: staff allowed, anon / student denied) |
| no_runtime_db / design ratchet / UX-1b shell | 4/4 · 7/7 · 7/7 |
| TYPES-1 / close / B1 / B2 | 8/8 · 3/3 · 8/8 · 6/6 (ratchet not raised) |
| QA identity guard / HOTFIX-2 / QF-1 offline | 8/8 · 6/6 · 73/73 |
| Signed-in smoke (local build) admin-pages / staff-content | all passed / all passed |

**GAP2-4b editor live E-05 / E-06 — pre-existing (proven):**
- On this phase's code (3 runs), E-05 times out with "Save details" stuck `aria-busy`, and E-06 times out on "Publish". One run instead failed at "no editor after New empty draft".
- The same suite on a worktree of `b864978` (separate build, port 3101) gave the **identical failure set {E-05, E-06}** with identical locators ("Save details", "Publish").
- Both servers logged Supabase `fetch failed` (ECONNRESET, connect timeouts) from middleware and server actions during the runs. The cause is this machine's network to Supabase, not code. The editor pages are unchanged by this phase.
- The worktree was removed: env copy deleted, junction removed, `git worktree remove`.
- E-07 archived each run's leftover QA draft.
- Recommendation: re-run `--live` on a stable network.
- Note: the live editor suite was last run in GAP2-4b/4c; DRILL-1 ran it offline only.

**Flakes recorded:**
- In the batch, the RLS suite failed P-9 (twice) and GAP2-4a G-08 … G-12 with "Client has encountered a connection error".
- Re-runs: GAP2-4a 12/12. RLS 9/9 (an instrumented copy and the original script).
- No orphaned session or advisory lock was found.
- The migration apply hit one TLS-connect timeout and was refused before connecting; the retry succeeded (§4).
- One UI-check DNS failure (`ENOTFOUND` pooler) cleared on retry.

## 8. Production probes

| Probe | Result |
|---|---|
| `wait-for-deploy` `2c6f91b` | deployed (200) |
| anon `POST rpc/fn_syllabus_import_draft` | **401 / 42501** |
| anon `POST rpc/fn_delete_exam_controlled` / `fn_award_gamification_reward` (082 / 083) | 401 / 42501 · 401 / 42501 |
| anon drill RPCs + direct `user_mistake_drills` write (085) | 401 / 42501 ×3 |
| anon `GET /rest/v1/exam_topics` (084, retired) | 404 PGRST205 |
| `/exams/ssc-cgl` | 200, "Syllabus coming soon" (nothing published) |
| Rest of the anonymous smoke (home page labels, `/api/health`, `/admin` redirect, flag-off pages) | all passed |

Signed-in production smokes: owner (§10).

## 9. SSC CGL Tier-1 draft — summary

`data/syllabus-drafts/ssc-cgl-tier1.v1.json` is `contract_version` 1, `exam: ssc-cgl`, `cycle_year: 2026`, `version_tag: tier1-ek-draft-v1`. Details per node are in `docs/syllabus/SSC_CGL_TIER1_DRAFT_NOTES.md`.

- **Nodes:** 1 PAPER "Tier 1 (Computer Based Examination)" + 4 SECTIONs (I General Intelligence and Reasoning · II General Awareness · III Quantitative Aptitude · IV English Comprehension, in the EK table's order) + 36 UNITs (8 · 7 · 11 · 10) = **41**. **Mappings: 36**, one existing topic per unit, no weights.
- **Numeric values:** only where an EK document states them.
  - Paper: 100 questions, with 200 marks / 60 min (80 PwBD) / −0.50 in its description.
  - Each section: 25 questions, 50 marks.
  - Every unit's question range is **null**.
  - Cited: EK EXAM_PATTERN v1 section-2 table and the TIER1_* claims.
- **Tiers:** `HIGH_YIELD` for the 31 "High-Yield: Yes" rows; **null** for the 5 "Supporting" rows (Sports + the four "General Topics").
- **Depth:** `APPLICATION` for all units (EK: "All topics are tested at the APPLICATION depth").
- **Descriptions:** the EK "Topic Boundaries", verbatim and plain.
- **Confidence:**
  - **HIGH 5** — paper + 4 sections (exam-pattern table citing the notice).
  - **MEDIUM 32** — EK topic rows; the EK list is "indicative" and not Tier-1-specific.
  - **LOW 4** — the "General Topics" catch-all units.
- **Missing topics: none.** All 36 paths resolve against the live taxonomy (I12 live), and the RPC accepts the full file (QA exam, rolled back: 41 nodes / 36 mappings, validate ok). Nothing has to be created before the import.
- **Tier 2 / Paper-II / Paper-III content: none.** I12 asserts this.
- **Validation:** the file passes the validator offline (I12) and in the UI preview.

## 10. OWNER TO RUN

**Production smokes (signed-in; owner only):**
```bash
node scripts/smoke/signed-in-smoke.cjs admin-pages https://couragelibrary-next.vercel.app
```
```bash
node scripts/smoke/signed-in-smoke.cjs staff-content https://couragelibrary-next.vercel.app
```

The DRILL-1 `student-mistake` production smoke (DRILL1_REPORT §9) is also still pending.

**Owner steps for the SSC CGL Tier-1 syllabus:**
1. **Topics.** No missing topics: all 36 already exist. If the step-4 review adds units for official items that the EK tables do not list, create those topics first in /admin/taxonomy (admin), under the matching subject.
2. **Free the cycle.** In /admin/syllabus → SSC CGL, archive (admin) or delete the existing DRAFT `v1 · pattern-skeleton-2026` (2026 cycle). The import refuses with "A draft already exists for this cycle" while it exists.
3. **Import.** /admin/syllabus → SSC CGL → "Import draft from JSON":
   1. Upload `data/syllabus-drafts/ssc-cgl-tier1.v1.json`.
   2. Click **Validate**. Expect: Valid · 1 paper · 4 sections · 36 units · 36 topic mappings · 0 missing topics.
   3. Click **Create draft**. This opens the editor.
4. **Review** the draft against the official SSC CGL 2026 notification. Use the checklist "OWNER MUST VERIFY" in `docs/syllabus/SSC_CGL_TIER1_DRAFT_NOTES.md` and correct the draft in the editor.
5. **Publish** (admin) through the editor's existing Publish flow. Validation must show 0 errors.

## 11. Deviations and notes

- **QA-exam cleanup.** The suite's own QA-exam DRAFT (tag `syl-import1-*`) is **deleted** as owner at the end, rather than archived the way the GAP2-4b editor suite does it.
  - DRAFT rows are deletable by design (lifecycle trigger), and the suite only deletes its own tagged DRAFT on the QA exam.
  - This returns the QA-exam syllabus rows exactly to the baseline instead of adding an ARCHIVED version per run.
  - The suite's `SYLLABUS_DRAFT_IMPORT` audit rows stay in `admin_audit_logs` (an append-only trail).
- **`test_gap2_4b_editor.cjs` updated.** E-01 / E-03 now include the two new actions.
  - The import action must call an `fn_syllabus_*` RPC.
  - The read-only preview must call none, and it must still put the guard first. Its taxonomy read lives in `lib/syllabus/import-catalog.ts`, so the "no table access in actions.ts" rule is unchanged.
  - No assertion was weakened.
- **Exam / cycle context for the preview hints** comes from the server-rendered page. Reading inactive exams needs the service role, which syllabus actions must not use (E-01; SEC-1E backlog). The RPC re-checks the exam and cycle authoritatively.
- **RPC vs validator differences:**
  - The RPC raises the first error; the validator lists all of them.
  - The RPC measures size on the jsonb text; the validator measures the raw UTF-8 text.
  - Lengths: the RPC counts characters; JS counts UTF-16 code units. These differ only for astral-plane characters.
  - Both enforce the same rules (fixtures in I5–I8 run against both).
- **The SHA-256 covers the normalised payload** that the server action sends: trimmed, defaults filled, `order` dropped since it equals the position. Direct RPC callers hash exactly what they send.

SYL-IMPORT-1 status: CLOSED
