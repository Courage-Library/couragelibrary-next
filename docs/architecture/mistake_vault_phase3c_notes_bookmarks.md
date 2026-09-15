# COURAGE LIBRARY — MISTAKE VAULT
# PHASE 3C: CANDIDATE REVISION NOTES & BOOKMARKS ARCHITECTURE SPECIFICATION

**Status:** ARCHITECTURE & PRODUCT DESIGN GATE — CERTIFIED (`GO`)  
**Phase:** 3C — Candidate Revision Notes & Bookmarks  
**Subsystem:** Mistake Vault & Personal Revision Engine  
**Target Routes:** `/mistakes`, `/mistakes/[id]`  
**Database Changes / Migrations Required:** **NONE (0 Schema Changes, 100% Reuse of Existing Infrastructure)**  
**Security & Multi-Tenancy:** 100% Candidate-Isolated & RLS Compliant  

---

## 1. EXECUTIVE SUMMARY

Phase 3C defines the architecture for candidate-owned personal revision notes and question bookmarks within the Courage Library Mistake Vault.

The core product mission of the Mistake Vault is:
> **"MY PERSONAL REVISION ENGINE"**

Phase 3C enriches this engine with:
> **"My personal context around this mistake."**

Crucially, our comprehensive audit confirms that **all necessary database columns, tables, foreign keys, and RLS policies already exist in the production database**. No database migrations, schema alterations, or data mutations are required for Phase 3C. We achieve 100% reuse of existing infrastructure while strictly preserving the boundaries between **Mistake Evidence**, **Personal Notes**, **Bookmarks**, and **Drill Results**.

---

## 2. EXISTING INFRASTRUCTURE AUDIT

### 2.1 Existing Bookmark Infrastructure (`user_question_bookmarks`)
- **Table:** `public.user_question_bookmarks` (Introduced in `20260824000011_phase3g_revision_vault.sql`, hardened in `20260824000013_phase3g_closure_hardening.sql`)
- **Schema & Constraints:**
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
  - `question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE`
  - `question_version_id UUID NOT NULL`
  - `folder_id UUID REFERENCES public.user_bookmark_folders(id) ON DELETE SET NULL`
  - `tags_json JSONB NOT NULL DEFAULT '[]'::jsonb`
  - `personal_note TEXT CHECK (length(personal_note) <= 2000)`
  - `source_attempt_id UUID REFERENCES public.test_attempts(id) ON DELETE SET NULL`
  - `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ DEFAULT now()`
  - **Unique Constraint:** `CONSTRAINT uq_user_question_bookmark UNIQUE (user_id, question_id)`
  - **Composite Lineage FK:** `CONSTRAINT fk_uqb_question_version_pair FOREIGN KEY (question_version_id, question_id) REFERENCES public.question_versions(id, question_id) ON DELETE RESTRICT`
- **Row Level Security (RLS):**
  - Enabled. `CREATE POLICY "Users can CRUD own bookmarks" ON public.user_question_bookmarks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
- **Downstream Consumers:**
  - `custom_practice_sessions` (`session_mode = 'BOOKMARKED'`) via `fn_start_custom_practice_session` and `fn_generate_practice_questions`.
  - Candidate practice hub at `/practice`.
- **Audit Conclusion:** The existing bookmark infrastructure is fully production-ready and sufficient. **NO new bookmark table is needed.**

### 2.2 Existing Notes Infrastructure
- **Mistake Vault Table (`user_mistake_vault`):**
  - Column `user_custom_notes TEXT` is already present with check constraint `length(user_custom_notes) <= 2000` on `user_mistake_vault`.
  - Indexed uniquely on `(user_id, question_id)`.
  - Service methods: `MistakeService.getMistakeDetail()` already reads `user_custom_notes` and `MistakeService.updateMistakeOverride()` already writes `user_custom_notes`.
- **Lesson Notes Table (`user_lesson_notes`):**
  - Dedicated table for course/curriculum lessons (`user_id, lesson_id, note_md`).
- **Audit Conclusion:** `user_mistake_vault.user_custom_notes` is the exact, canonical column for candidate revision notes on mistakes. **NO new notes table is needed.**

---

## 3. DATA MODEL & ATTACHMENT DECISION

### 3.1 Attachment Candidate Analysis
| Candidate | Mechanism | Pros | Cons | Verdict |
| :--- | :--- | :--- | :--- | :---: |
| **A. `user_mistake_vault.id` / `(user_id, question_id)`** | Attach to mistake vault record (`user_custom_notes`) | Note survives new mistake occurrences; note stays with question across remediation lifecycle (`UNRESOLVED` -> `REVISITING` -> `MASTERED`); 0 new tables. | Only available once question is in Mistake Vault. | **SELECTED (PRIMARY FOR VAULT)** |
| **B. `user_question_bookmarks`** | Attach to bookmark record (`personal_note`) | Available for any question the candidate bookmarks; stores version pair. | Requires bookmarking the question to save a note. | **SELECTED (FOR BOOKMARKS)** |
| **C. `user_mistake_occurrences.id`** | Attach to specific error attempt | Version-exact. | **REJECTED**: Occurrences are immutable historical test evidence. Personal notes should not be tied to an ephemeral single attempt. | **REJECTED** |
| **D. Generic Notes Abstraction** | New polymorphic table | Universal. | Adds unnecessary relational overhead and violates zero-duplication constraint. | **REJECTED** |

### 3.2 Dual-Entity Synergy & Separation of Concerns
1. **Mistake Vault Note (`user_mistake_vault.user_custom_notes`):**
   - The candidate's cognitive takeaway specifically addressing *why they missed the question* and *how to avoid the trap next time*.
2. **Question Bookmark (`user_question_bookmarks`):**
   - The candidate's intentional bookmark flag indicating *"I want to revise/practice this question in custom practice sessions"*.
3. **Independence Invariant:**
   - A candidate can have a **Note without Bookmark**, **Bookmark without Note**, **Both**, or **Neither**. Neither state requires or forces the other.

---

## 4. VERSIONING & HISTORICAL REPRODUCIBILITY

Phase 2 established the strict immutability of test evidence (`question_versions`, `attempt_answers`, `user_mistake_occurrences`, test scoring).

**Phase 3C Invariants:**
- Personal notes and bookmarks are **candidate-owned metadata**.
- Writing, updating, or deleting a note **NEVER** mutates `question_versions`, `attempt_answers`, `user_mistake_occurrences`, or scoring.
- When a candidate writes: *"Remember: convert percentage to decimal first"*, this note reflects their personal understanding.
- If a newer question version (`v2`) is published, the candidate's existing note remains intact on their vault record.

---

## 5. CANDIDATE UX ARCHITECTURE

### 5.1 Detail Page UX (`/mistakes/[id]`)
The detail page presents a focused, light-mode revision cockpit:

```
+-------------------------------------------------------------------------------+
| <- Back to Mistake Notebook                                                   |
|                                                                               |
| [Status Badge] [Cognitive Type Badge] [Topic]              [ Bookmark Button ]|
|                                                                               |
| QUESTION PROMPT & OPTIONS                                                     |
| [A] Option 1                                                                  |
| [B] Option 2 (Correct)                                                        |
|                                                                               |
| EXPLANATION & WHY YOU MISSED IT                                               |
| ...                                                                           |
|                                                                               |
| ----------------------------------------------------------------------------- |
| MY REVISION NOTE                                                              |
| [                                                                           ] |
| [ "Shortcut: Apply ratio method. Beware of remaining vs total."            ] |
| [                                                                           ] |
| Status: Saved ✓                                        [Clear Note] [Save]    |
| ----------------------------------------------------------------------------- |
|                                                                               |
| MISTAKE OCCURRENCE HISTORY (Audit Trail)                                      |
|                                                                               |
| [ Start Remediation Drill CTA ]                                               |
+-------------------------------------------------------------------------------+
```

#### Note Editor Interactions:
- **Placeholder:** *"What do you want to remember about this question? (e.g., formula shortcut, trap to avoid...)"*
- **Character Counter:** `0 / 2,000` characters.
- **Autosave Engine:**
  - Debounced at 750ms after user stops typing.
  - State machine: `idle` -> `typing` -> `saving` -> `saved` (or `error`).
  - Visual status pill:
    - `Saving...` (Slate pulse)
    - `Saved ✓` (Emerald text)
    - `Unsaved changes` (Amber text)
    - `Failed to save (Retry)` (Red text with click-to-retry)
- **Explicit Controls:**
  - "Save Note" button (for explicit manual save & accessibility).
  - "Clear Note" button (clears note with confirm tooltip).

### 5.2 Bookmark Interactions:
- Located prominently in the page header of `/mistakes/[id]` and on each `MistakeCard` in `/mistakes`.
- **Active State:** Solid Indigo Bookmark icon + *"Bookmarked"* (or active tooltip on card).
- **Inactive State:** Outline Slate Bookmark icon + *"Bookmark"*.
- **Click Behavior:** Immediate optimistic UI toggle with background asynchronous RPC/Service call and reliable rollback on network failure.

### 5.3 List Page Integration (`/mistakes`)
- **Card Indicators:**
  - Small subtle note badge (`StickyNote` icon) appears on `MistakeCard` if `hasNote === true`. (No raw note text rendered on cards to prevent clutter).
  - Interactive bookmark toggle button on top right of `MistakeCard`.
- **Filter Bar Integration:**
  - Add "Bookmarked" toggle / filter pill in the segmented filter bar to filter by `bookmarked=true`.

---

## 6. NOTE FORMAT & SECURITY

### 6.1 Format & Sanitization
- **Format:** Enhanced Plain Text with newline/whitespace preservation (`whitespace-pre-wrap`).
- **Rationale:** Plain text provides zero latency, instant mobile keyboard responsiveness, no heavy WYSIWYG bundle overhead, and eliminates DOM-based XSS injection vectors.
- **Max Length:** Strictly enforced at **2,000 characters** (matching DB check constraints).
- **Sanitization:** All text rendered via React safe string interpolation (XSS-safe by default).

### 6.2 Security & Ownership Architecture
- **No Client Trust:** Client never passes `user_id`.
- **Server Identity Resolution:**
  ```
  Authenticated Session Cookie
          ↓
  createClient() (Supabase Server)
          ↓
  supabase.auth.getUser() -> user.id
          ↓
  WHERE user_id = user.id (Enforced by RLS & Service Queries)
  ```
- Candidate A cannot read, create, modify, or delete Candidate B's notes or bookmarks under any circumstances.

---

## 7. MISTAKE LIFECYCLE & ERRATA BEHAVIOR

| Event | Mistake Evidence | Personal Revision Note | Bookmark |
| :--- | :--- | :--- | :--- |
| **Mistake Created (UNRESOLVED)** | Active occurrence logged | Empty (or user adds note) | Optional |
| **Drill Correct 1 (REVISITING)** | Remediation incremented | **Preserved intact** | **Preserved intact** |
| **Drill Correct 2 (MASTERED)** | Status marked MASTERED | **Preserved intact** | **Preserved intact** |
| **New Test Failure (Re-lapse)** | Count incremented, status UNRESOLVED | **Preserved intact** | **Preserved intact** |
| **Errata Revocation (REVOKED_ERRATA)** | Occurrence marked revoked | **Preserved intact** | **Preserved intact** |
| **Candidate Clears Note** | Unchanged | Reset to `NULL` | Unchanged |
| **Candidate Removes Bookmark** | Unchanged | Unchanged | Deleted from `user_question_bookmarks` |

---

## 8. SERVICE & SERVER/CLIENT ARCHITECTURE

### 8.1 Service Methods (`services/mistake.service.ts` & `services/bookmark.service.ts`)

#### In `MistakeService`:
```typescript
// Update candidate revision note on mistake vault record
static async updateMistakeNote(vaultId: string, noteText: string | null): Promise<{ success: boolean; error?: string }>

// Get candidate revision note
static async getMistakeNote(vaultId: string): Promise<string | null>
```

#### In `BookmarkService` (`services/bookmark.service.ts`):
```typescript
// Toggle bookmark for question
static async toggleQuestionBookmark(
  questionId: string,
  questionVersionId: string,
  sourceAttemptId?: string
): Promise<{ isBookmarked: boolean; error?: string }>

// Batch check bookmark status for a list of question IDs (0 N+1 queries)
static async getBookmarkedQuestionIdMap(questionIds: string[]): Promise<Record<string, boolean>>
```

### 8.2 Server Actions (`app/actions/mistake-actions.ts` & `app/actions/bookmark-actions.ts`)
```typescript
'use server'

export async function saveMistakeNoteAction(vaultId: string, note: string): Promise<{ success: boolean; error?: string }>
export async function toggleBookmarkAction(questionId: string, questionVersionId: string): Promise<{ isBookmarked: boolean; error?: string }>
```

---

## 9. PERFORMANCE & ZERO N+1 STRATEGY

1. **Vault List View (`/mistakes`):**
   - `user_custom_notes` is selected in the single `user_mistake_vault` list query.
   - Bookmark flags are fetched in **one batch query**:
     ```typescript
     const { data } = await supabase
       .from('user_question_bookmarks')
       .select('question_id')
       .eq('user_id', user.id)
       .in('question_id', pageQuestionIds);
     ```
   - Combined in O(N) in-memory map. **Total SQL queries: 2.** (Zero N+1 queries).
2. **Detail View (`/mistakes/[id]`):**
   - Single query retrieves mistake record, custom notes, occurrence history, and bookmark status in parallel via `Promise.all()`.

---

## 10. TEST PLAN & VERIFICATION MATRIX (PHASE 3C)

| Test ID | Test Description | Category | Expected Result |
| :---: | :--- | :--- | :--- |
| **T01** | Create note on mistake detail page | Functional | Note persisted in `user_mistake_vault.user_custom_notes` |
| **T02** | Update note on mistake detail page | Functional | Note updated with new content and timestamp |
| **T03** | Clear note on mistake detail page | Functional | Note reset to `null` in DB |
| **T04** | Note persistence after page reload | Persistence | Saved note re-renders accurately on reload |
| **T05** | Note persistence across login sessions | Persistence | Note retrieved correctly for authenticated user |
| **T06** | Bookmark question from detail page | Functional | Record inserted in `user_question_bookmarks` |
| **T07** | Unbookmark question from detail page | Functional | Record deleted from `user_question_bookmarks` |
| **T08** | Bookmark toggle from list card | Functional | Optimistic UI updates and DB syncs |
| **T09** | Note + Bookmark active simultaneously | Synergy | Both records coexist independently |
| **T10** | Mastered mistake retains note | Lifecycle | Note preserved when `lifecycle_status` changes to `MASTERED` |
| **T11** | Repeated mistake retains note | Lifecycle | Note preserved when `total_mistakes_count` increments |
| **T12** | Errata-revoked occurrence retains note | Errata | Note preserved when occurrence marked `REVOKED_ERRATA` |
| **T13** | Candidate isolation on notes | Security | Candidate A cannot read/update Candidate B's notes |
| **T14** | Candidate isolation on bookmarks | Security | Candidate A cannot read/delete Candidate B's bookmarks |
| **T15** | Reject client-supplied `user_id` | Security | Server Action derives identity strictly from session |
| **T16** | XSS payload handling | Security | Scripts rendered as harmless plain text strings |
| **T17** | Character limit enforcement (>2000 chars) | Validation | Truncated or rejected with validation error |
| **T18** | Whitespace trimming | Validation | Empty/whitespace-only note handled cleanly |
| **T19** | Autosave debouncing (750ms) | UX | Single network call made after typing ceases |
| **T20** | Network failure during autosave | UX | Error state displayed with retry trigger |
| **T21** | List page hasNote indicator | UX | Note icon displayed on card if note exists |
| **T22** | List page Bookmarked filter | Filter | Filter by `bookmarked=true` returns only bookmarked mistakes |
| **T23** | Mobile viewport editor | Responsive | Full-width textarea with touch-friendly controls |
| **T24** | 0 N+1 Query Verification | Performance | List query completes in <= 2 database queries |
| **T25** | 14 Protected Baseline Tables intact | Regression | 0 baseline schema mutations |

---

## 11. EXPLICIT NON-GOALS (PHASE 3C)

The following capabilities are strictly out-of-scope for Phase 3C:
- **AI-generated notes / summaries** (Belongs to Phase 3F Mistake Intelligence).
- **Spaced repetition scheduling engine** (Belongs to Phase 4 / Algorithm Subsystem).
- **Public / Shared / Collaborative notes** (Mistake Vault is 100% private to candidate).
- **Rich-text WYSIWYG editor** (Plain text is standard for speed and safety).
- **New analytics/telemetry database tables** (Use existing logger if needed).

---

## 12. GO / BLOCKED READINESS ASSESSMENT

| Gate Criterion | Status | Assessment |
| :--- | :---: | :--- |
| **Existing Bookmarks Audited** | **PASS** | `user_question_bookmarks` fully audited & verified sufficient. |
| **Existing Notes Audited** | **PASS** | `user_mistake_vault.user_custom_notes` verified available & operational. |
| **Data Ownership Model Defined** | **PASS** | Strict `auth.uid() = user_id` session resolution established. |
| **Note Attachment Model Defined** | **PASS** | Attached to `user_mistake_vault` for candidate mistake notes. |
| **Lifecycle & Errata Invariants Defined** | **PASS** | Non-destructive behavior across all lifecycle and errata transitions. |
| **Security & RLS Verified** | **PASS** | Complete multi-tenant isolation verified. |
| **Performance Strategy Defined** | **PASS** | Batch query strategy eliminates N+1 queries. |
| **Zero Database Migrations Required** | **PASS** | 100% existing infrastructure reuse. |

### **IMPLEMENTATION READINESS: GO**

---

## 13. PHASE 3C IMPLEMENTATION PLAN (FOR NEXT PHASE)

When authorized to begin Phase 3C implementation:
1. **Service Layer:**
   - Add `BookmarkService` with `toggleQuestionBookmark()` and `getBookmarkedQuestionIdMap()`.
   - Add `updateMistakeNote()` to `MistakeService`.
2. **Server Actions:**
   - Create `app/actions/mistake-actions.ts` and `app/actions/bookmark-actions.ts`.
3. **UI Components:**
   - Create `components/mistakes/mistake-note-editor.tsx` (Autosave, debounced, light-mode).
   - Create `components/mistakes/mistake-bookmark-button.tsx` (Optimistic toggle).
   - Update `components/mistakes/mistake-card.tsx` with note indicator and bookmark toggle.
   - Update `app/mistakes/[id]/page.tsx` to embed note editor and bookmark controls.
   - Update `components/mistakes/mistake-filter-bar.tsx` with "Bookmarked" filter option.
4. **Validation & Production Certification:**
   - Execute 25-point automated test suite.
   - Run production runtime gate and verify 14 baseline tables.
