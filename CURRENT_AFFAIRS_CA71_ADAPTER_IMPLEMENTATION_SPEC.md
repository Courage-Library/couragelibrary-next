# CURRENT AFFAIRS — CA-7.1: EXISTING IMPORT BOUNDARY VERIFICATION & ADAPTER IMPLEMENTATION SPECIFICATION
**Document Reference:** `CURRENT_AFFAIRS_CA71_ADAPTER_IMPLEMENTATION_SPEC.md`  
**Target Platform:** Courage Library (`couragelibrary-next` / `Courage Library`)  
**Scope:** Forensic Verification of the Existing Current Affairs Import System & Complete Engineering Specification for the External Feed Adapter  
**Authoritative Status:** SPECIFICATION & CONTRACT COMPLETE (FROZEN v1.2.0)  
**Execution Status:** DESIGN & VERIFICATION ONLY — NO CODE OR DATABASE IMPLEMENTATION PERFORMED  

---

## 1. Executive Summary

This specification completes Phase **CA-7.1**, conducting a deep forensic inspection of the existing Courage Library Current Affairs Import Boundary ([`app/api/admin/current-affairs/import/route.ts`](file:///e:/Courage%20Library/app/api/admin/current-affairs/import/route.ts), [`services/current-affairs-import.service.ts`](file:///e:/Courage%20Library/services/current-affairs-import.service.ts), and [`services/current-affairs-validation.service.ts`](file:///e:/Courage%20Library/services/current-affairs-validation.service.ts)) and defining the exact transformation and authentication contract required for the upcoming **Feed Adapter (Phase CA-7.2)**.

### Key Verification Findings:
1. **Domain Engine is 100% Sufficient:** The core domain logic (`CurrentAffairsImportService.importDraft`), the 5-Gate Validation Engine (`CurrentAffairsValidationService`), the AST Compiler (`CurrentAffairsCompilerService`), and database triggers are fully prepared to receive external payloads, validate them against strict rules, and quarantine them into `DRAFT` status.
2. **Small Import-Boundary Change Required (Conclusion B):** The existing HTTP endpoint [`app/api/admin/current-affairs/import/route.ts`](file:///e:/Courage%20Library/app/api/admin/current-affairs/import/route.ts) currently authenticates exclusively via browser session cookies (`AdminService.checkIsAdminOrStaff()`). To allow automated synchronization from GitHub Actions or background webhooks without a browser login, the endpoint requires a dual-authentication check supporting both session cookies and an `Authorization: Bearer <INGESTION_SERVICE_SECRET>` header.
3. **Zero Core Schema Changes Needed:** The database schema ([`supabase/migrations/20261001000061_phase4a_current_affairs_canonical_schema.sql`](file:///e:/Courage%20Library/supabase/migrations/20261001000061_phase4a_current_affairs_canonical_schema.sql)) and domain contracts ([`types/current-affairs.ts`](file:///e:/Courage%20Library/types/current-affairs.ts)) already provide all necessary fields, relationships, and immutability guards.

---

## 2. Forensic Inspection of Existing Import System

### A. HTTP Ingestion Route: `app/api/admin/current-affairs/import/route.ts`
- **Current Authorization:** Calls `AdminService.checkIsAdminOrStaff()`, which validates user cookies against `ADMIN_EMAILS` or `user.app_metadata.role === 'admin'`.
- **Payload Extraction:** Accepts JSON body (`req.json()`) with either `{ rawPayload: ... }` or direct payload object.
- **Service Invocation:** Calls `CurrentAffairsImportService.importDraft(rawPayload, authCheck.userId)`.
- **Error Propagation:** On validation failure, returns `400 Bad Request` with structured `gateReport`. On server exception, returns `500 Internal Error`.

### B. Import Service: `services/current-affairs-import.service.ts`
- **Method:** `importDraft(rawInput, authorUserId, db)`
- **Step 1 (Parsing):** `parseRawInput()` strips markdown code fences (```json ... ```) and parses raw string JSON.
- **Step 2 (5-Gate Validation):** Executes `CurrentAffairsValidationService.runAllGates(payload, db)`.
- **Step 3 (Atomic Persistence):**
  - Starts atomic SQL transaction (`BEGIN`).
  - Generates unique kebab-case slug; checks collision against `public.current_affairs_articles`.
  - Inserts master record into `public.current_affairs_articles` with `status = 'DRAFT'`.
  - Inserts Version 1 into `public.current_affairs_article_versions` with `status = 'DRAFT'`, `checksum_sha256`, and serialized `validation_flags`.
  - Inserts associated `current_affairs_sources` (Tier 1–4), `current_affairs_taxonomy_mappings`, and `current_affairs_exam_mappings`.
  - Commits transaction (`COMMIT`). On error, immediately rolls back (`ROLLBACK`).

### C. 5-Gate Validation Engine: `services/current-affairs-validation.service.ts`
1. **Gate 1 (Schema & Structure):** Enforces non-empty `headline` (10–300 chars), valid calendar `newsDate` (`YYYY-MM-DD`), 12 canonical `category` enums, valid `importanceTier`, `summaryMd` ($\ge 50$ chars), `keyTakeaways` ($\ge 1$ item $\ge 5$ chars), non-empty `sources[]`, and non-empty `taxonomyMappings[]`.
2. **Gate 2 (Security & Sanitization):** Scans Markdown with `MdxSecurityScanner` to reject unsafe tags/scripts; strips AI citation artifacts via `sanitizeAiCitationArtifacts()`.
3. **Gate 3 (Provenance & URLs):** Rejects invalid/HTTP URLs; bans placeholder domains (`localhost`, `example.com`); enforces at least one Tier 1, 2, or 3 source.
4. **Gate 4 (Taxonomy & Mappings):** Verifies foreign keys against `canonical_taxonomy_nodes`, `exams`, `questions`, and `learning_resources`.
5. **Gate 5 (Anti-Duplicate Checksum):** Computes deterministic SHA-256 hash `SHA256(newsDate :: category :: headline :: summaryMd :: takeaways)` and queries existing versions to prevent duplicates.

---

## 3. Comparison of Actual Input Contracts

| External Feed Field (`content/*.json`) | Current Affairs Target Field | Required? | Transformation Logic | Validation Engine Gate | Ingestion Risk & Mitigation |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `id` | Metadata / Secondary Ref | No | Preserved in citation context or audit log; not used as Postgres UUID. | Gate 1 (Ignored) | Low (External ID format varies; internal UUID generated). |
| `title` | `headline` | **Yes** | Trimmed, HTML entities unescaped, whitespace collapsed. | Gate 1 (Length 10–300 chars) | Low (Handled by standard trimming). |
| `summary` (`string[]`) | `summaryMd` & `keyTakeaways` | **Yes** | 1. First 2 bullets formatted as Markdown paragraphs for `summaryMd`.<br>2. All items mapped to `keyTakeaways[]`. | Gate 1 ($\ge 50$ chars summary, $\ge 1$ takeaway)<br>Gate 2 (MDX security & AI citation strip) | **Medium** (If bullets are $< 50$ chars total, Gate 1 will reject. Adapter must ensure coherent synthesis). |
| `image` | *(Deprecated)* | No | Dropped (Courage Library uses clean typography and SVG badges). | Ignored | None. |
| `link` | `sources[0].url` | **Yes** | Tracking query parameters (`utm_*`, `ref`, `fbclid`) stripped; validated for `https://`. | Gate 3 (Valid HTTPS URL, no placeholder domain) | Low (Adapter normalizes URL). |
| `source` | `sources[0].publisher` | **Yes** | Publisher brand name extracted (e.g. `"The Hindu"`, `"Times of India"`). | Gate 3 (Non-empty publisher string) | Low. |
| `feedName` | `sources[0].citationContext` | No | Staged in `citationContext` (e.g. `"Feed: TOI National"`). | Gate 3 (Optional string) | Low. |
| `primaryCategory` | `category` | **Yes** | Normalized via Category Dictionary (e.g. `"national"` $\to$ `'NATIONAL'`). | Gate 1 (Must match 12 Frozen Enums) | **Medium** (Unmapped categories fall back to `'NATIONAL'` and trigger review flag). |
| `secondaryCategories` | `taxonomyMappings` | **Yes** | Mapped to primary syllabus node in `canonical_taxonomy_nodes` by category. | Gate 1 & Gate 4 (Must have $\ge 1$ valid taxonomy node) | **High** (If taxonomy node is missing, Gate 4 fails. Adapter must attach default root category node). |
| `importance` (`0–10`) | `importanceTier` | **Yes** | $8\text{+} \to \text{'CRITICAL'}$, $6\text{–}7 \to \text{'HIGH'}$, $4\text{–}5 \to \text{'MEDIUM'}$, $<4 \to \text{'LOW'}$. | Gate 1 (Enum check) | Low (Deterministic mathematical mapping). |
| `examTags` (`string[]`) | `examMappings` | No | Matched to `public.exams` via slug aliases (`"UPSC"` $\to$ `upsc-cse`, `"SSC"` $\to$ `ssc-cgl`). | Gate 4 (If provided, exam UUID must exist) | Low (Unmatched tags are safely omitted). |
| `date` (ISO UTC) | `newsDate` (`YYYY-MM-DD`) | **Yes** | Parsed to Indian Standard Time (IST, UTC+05:30) calendar date string. | Gate 1 (Regex `^\d{4}-\d{2}-\d{2}$` and calendar check) | Low (Deterministic time zone conversion). |

---

## 4. Sufficiency Evaluation: Can an Adapter Work Without Core Changes?

### Conclusion: **B. Small Import-Boundary Changes Are Required**

#### Detailed Reasoning:
1. **Domain Engine & Database Core:** **100% Sufficient.** `CurrentAffairsImportService`, `CurrentAffairsValidationService`, and the database schema require **zero modifications**. They already accept external structured inputs, validate them through 5 gates, and persist them safely as quarantined `DRAFT` records.
2. **HTTP API Route Authorization Barrier:** The route [`app/api/admin/current-affairs/import/route.ts`](file:///e:/Courage%20Library/app/api/admin/current-affairs/import/route.ts) currently enforces `AdminService.checkIsAdminOrStaff()`, which requires an interactive Supabase session cookie. An automated external adapter (e.g. running in GitHub Actions) cannot easily provide user browser session cookies.
3. **Required Boundary Change (Phase CA-7.2):**
   - Update [`app/api/admin/current-affairs/import/route.ts`](file:///e:/Courage%20Library/app/api/admin/current-affairs/import/route.ts) to verify either:
     a) An interactive Admin/Staff session cookie, **OR**
     b) A secure Bearer token header (`Authorization: Bearer <INGESTION_SERVICE_SECRET>`) matching `process.env.CURRENT_AFFAIRS_INGESTION_KEY`.

---

## 5. Identity & Idempotency Audit

### Ingestion Idempotency Behavior Matrix:

| Ingestion Scenario | Ingestion Payload State | Gate 5 Behavior | Database Outcome | API Response |
| :--- | :--- | :--- | :--- | :--- |
| **1st Import** | First discovery of article | Checksum unique; no headline collision | Creates `current_affairs_articles` (`status = 'DRAFT'`) and Version 1 | `200 OK` (New draft created) |
| **2nd Import (Retry)** | Identical JSON sent again | Checksum collision detected on Version 1 | **No insert**; queries existing article ID | `409 Conflict` or `200 OK` with `isDuplicate: true` |
| **10th–100th Import** | Repeated retries from CI | Checksum collision detected | **No insert**; zero DB bloat | Idempotent duplicate acknowledgment |
| **Same URL + Changed Title** | Publisher updates title on wire | Checksum differs; new draft created | Creates separate Draft record or Revision | `200 OK` (Staged for editorial review) |
| **Same URL + Changed Summary**| Publisher updates body text | Checksum differs; new draft created | Creates separate Draft record | `200 OK` (Staged for editorial review) |
| **Same Event + Different Source**| TOI and The Hindu cover same event | Gate 5 detects matching headline on same date | Staged with duplicate headline flag | Handled as complementary source in Review Studio |
| **Different URL + Same Event** | Multiple syndications | Unique URL, same event | Staged as separate draft | Reviewer merges sources in Review Workbench |

---

## 6. Security & Access Control Audit

1. **Authentication:**
   - Interactive: Supabase Auth session with Admin/Staff role check.
   - Machine-to-Machine: `Authorization: Bearer <INGESTION_SERVICE_SECRET>` with constant-time string comparison (`crypto.timingSafeEqual`).
2. **Payload Protection:**
   - Body size limited to standard Next.js 4MB payload limits.
   - All string inputs sanitized against Prototype Pollution and JSON injection.
3. **AST Security Scanning (Gate 2):**
   - Summary Markdown is parsed with `MdxSecurityScanner`. Any inclusion of `<script>`, `<iframe>`, `javascript:`, `onload=`, or malicious HTML entities fails Gate 2 immediately.
4. **AI Sanitization (Gate 2):**
   - Residual citation strings from LLMs (e.g. `【14†source】`, `[cite: 1]`) are automatically stripped before computing checksums and saving.
5. **SSRF & URL Domain Validation (Gate 3):**
   - Only `https://` protocol accepted. Localhost, loopback (`127.0.0.1`), internal IP ranges (`10.0.0.0/8`, `192.168.0.0/16`), and test domains are rejected.

---

## 7. 5-Gate Compatibility Mapping

Every field from the existing feed JSON is routed through the validation gates:

```
[ Incoming Feed JSON ]
         │
         ├──► Gate 1 (Schema): Checks headline (10–300), newsDate (YYYY-MM-DD), category (12 enums), summaryMd (>=50)
         │
         ├──► Gate 2 (Security): MdxSecurityScanner scans summaryMd; ai-citation-sanitizer cleans takeaways
         │
         ├──► Gate 3 (Provenance): Validates link is HTTPS, classifies publisher as TIER_2 (National Media)
         │
         ├──► Gate 4 (Taxonomy): Validates category maps to active canonical_taxonomy_nodes; resolves exams
         │
         └──► Gate 5 (Anti-Duplicate): Calculates SHA-256 checksum; verifies no identical version or headline exists
```

---

## 8. Taxonomy Compatibility & Mapping Matrix

The internal schema requires every article to map to at least one `canonical_taxonomy_nodes` record:

| Feed `primaryCategory` | Canonical Category Enum | Default Root Taxonomy Slug | Fallback Node Name |
| :--- | :--- | :--- | :--- |
| `national`, `politics` | `NATIONAL` | `general-studies-national` | Indian Polity & National Affairs |
| `international`, `world` | `INTERNATIONAL` | `general-studies-international`| International Relations & Global Events |
| `economy`, `business` | `ECONOMY` | `general-studies-economy` | Indian Economy & Financial Systems |
| `defence`, `military` | `DEFENCE` | `general-studies-defence` | Defence, Security & Armed Forces |
| `science`, `tech` | `SCIENCE_TECH` | `general-studies-science` | Science, Technology & Space |
| `environment`, `ecology` | `ENVIRONMENT` | `general-studies-environment`| Ecology, Biodiversity & Climate Change |
| `schemes`, `yojana` | `GOVT_SCHEMES` | `general-studies-schemes` | Central & State Government Initiatives |
| `sports` | `SPORTS` | `general-studies-sports` | Sports, Championships & Records |
| `awards`, `honours` | `AWARDS_HONOURS` | `general-studies-awards` | National & International Awards |
| `person`, `appointment` | `PERSONS_IN_NEWS` | `general-studies-persons` | Appointments, Dignitaries & Personages |
| `days`, `anniversary` | `IMPORTANT_DAYS` | `general-studies-days` | Significant Days & Themes |
| `state`, `state-specific`| `STATE_SPECIFIC` | `general-studies-state` | State-Specific Governance & Events |

---

## 9. Exam Tag Compatibility Matrix

| Feed `examTags` String | Canonical `public.exams` Slug | Canonical Exam Title | Relevance Weight |
| :--- | :--- | :--- | :--- |
| `"UPSC"`, `"Civil Services"` | `upsc-cse` | UPSC Civil Services Examination | `HIGH` |
| `"SSC"`, `"SSC CGL"`, `"CHSL"` | `ssc-cgl` | SSC Combined Graduate Level | `HIGH` |
| `"State PCS"`, `"BPSC"`, `"UPPSC"` | `state-psc` | State Public Service Commission | `HIGH` |
| `"Banking"`, `"IBPS"`, `"SBI"` | `ibps-po` | IBPS / SBI Probationary Officer | `MEDIUM` |
| `"Railway"`, `"RRB NTPC"` | `rrb-ntpc` | Railway Recruitment Board NTPC | `MEDIUM` |
| `"Defence"`, `"CDS"`, `"NDA"` | `defence-services` | Combined Defence Services / NDA | `HIGH` |
| *Unrecognized Tag* | *(Omitted)* | *(None)* | Safely ignored; subject to manual review |

---

## 10. External AI Trust Boundary Verification

Inspection of the entire codebase confirms:
- **No Direct-to-Production Path Exists:** There is no mechanism in `CurrentAffairsImportService` to set `status = 'PUBLISHED'` on incoming payloads.
- **Enforced Draft Status:** All imported payloads are hardcoded to `status = 'DRAFT'`.
- **Public RLS Isolation:** The PostgreSQL Row Level Security policy `Public read published current affairs` prevents any candidate queries from viewing drafts.
- **Editorial Gatekeeping:** Only authenticated staff in the Admin Review Workbench (`/admin/current-affairs`) can advance an article from `DRAFT` $\to$ `IN_REVIEW` $\to$ `APPROVED` $\to$ `COMPILED` $\to$ `PUBLISHED`.

---

## 11. Summary & Content Transformation Pipeline

The Feed Adapter will transform incoming summaries as follows:

```typescript
// Input from Feed JSON:
// summary: ["Authority suspended internet...", "Measure enacted ahead of protest...", "Section 144 CrPC promulgated...", "Exam Relevance: Focus on Article 324."]

// 1. Generate Markdown Body (summaryMd):
const summaryMd = rawSummary.slice(0, 3).join('\n\n');

// 2. Generate Key Takeaways:
const keyTakeaways = rawSummary.map(s => s.trim()).filter(Boolean);

// 3. Extract Important Facts (if explicitly marked):
const importantFacts = rawSummary
  .filter(s => s.toLowerCase().startsWith('exam relevance:') || s.toLowerCase().startsWith('key fact:'))
  .map(s => s.replace(/^(exam relevance:|key fact:)\s*/i, ''));
```

---

## 12. Versioning & Mutation Prevention

1. **Published Version Immutability:** Protected by PostgreSQL trigger `trg_guard_ca_version_immutability`. Any attempt by an adapter or query to update headline, summary, or checksum on a `PUBLISHED` version raises exception `ERR_IMMUTABLE_PUBLISHED_VERSION`.
2. **Pointer Integrity:** Protected by trigger `trg_guard_ca_pointer_integrity`. A master article cannot point its `published_version_id` to an unpublished or cross-article version.
3. **Safe Ingestion:** If an existing article is already published, new incoming data for that event can only create a new Version $N+1$ in `status = 'DRAFT'`, preserving live candidate stability.

---

## 13. Historical Import Readiness

- **Feasibility:** Historical JSON files from `content/2026/MM/DD/*.json` can be piped through the Feed Adapter.
- **Behavior:**
  - Date timestamps are converted to IST `YYYY-MM-DD`.
  - Content is ingested into `status = 'DRAFT'`.
  - Historical items are safely quarantined in the Admin Studio for review.
  - Zero disruption to current live candidate feeds.

---

## 14. Proposed Feed Adapter Interface (Phase CA-7.2 Specification)

```typescript
/**
 * COURAGE LIBRARY — CURRENT AFFAIRS FEED ADAPTER INTERFACE
 * Target Implementation: Phase CA-7.2
 */

export interface ExternalNewsFeedJson {
  id: string;
  title: string;
  summary: string[];
  image?: string;
  link: string;
  primaryCategory: string;
  secondaryCategories?: string[];
  importance?: number;
  examTags?: string[];
  source: string;
  feedName?: string;
  date: string;
}

export interface AdapterTransformationResult {
  success: boolean;
  payload?: CurrentAffairsImportPayload;
  error?: string;
}

export class CurrentAffairsFeedAdapter {
  /**
   * Transforms raw external feed JSON into canonical CurrentAffairsImportPayload
   */
  static transform(input: ExternalNewsFeedJson, taxonomyNodeMap: Record<string, string>): AdapterTransformationResult;

  /**
   * Synchronizes an array of feed items to the Courage Library Import API
   */
  static syncBatch(items: ExternalNewsFeedJson[], apiEndpoint: string, secretKey: string): Promise<SyncReport>;
}
```

---

## 15. Proposed File-Level Implementation Plan for Phase CA-7.2

| File Path | Purpose | Change Type | Risk & Mitigation |
| :--- | :--- | :--- | :--- |
| `app/api/admin/current-affairs/import/route.ts` | Add Bearer service-token authorization check alongside session check. | Modification | Low (Backward compatible with admin UI). |
| `services/current-affairs-feed-adapter.service.ts`| Implement adapter transformation and batch sync client. | New File | Low (Pure transformation utility). |
| `scripts/sync_external_news_feed.cjs` | Standalone CLI / GitHub Actions synchronization runner script. | New File | Low (Isolated script runner). |
| `types/current-affairs.ts` | Add adapter DTOs (`ExternalNewsFeedJson`, `SyncReport`). | Modification | Low (Additive TypeScript interfaces). |

---

## 16. Implementation Sequence for Phase CA-7.2

```
Step 1: Update API Route Authorization (Support Bearer Secret)
    ↓
Step 2: Add Adapter Types to types/current-affairs.ts
    ↓
Step 3: Implement CurrentAffairsFeedAdapter (Unit test transformation rules)
    ↓
Step 4: Create Standalone Sync Runner Script (scripts/sync_external_news_feed.cjs)
    ↓
Step 5: Execute Staging Sync Verification on Sample Feeds
    ↓
Step 6: Verify 5-Gate Validation & Draft Creation in Admin Studio
    ↓
Step 7: Verify Idempotent Retries & Zero Duplicates
    ↓
Step 8: Deploy & Finalize Coexistence Monitoring
```

---

## 17. Comprehensive Test Plan for Phase CA-7.2

1. **Valid Feed Article Transformation:** Transform complete valid JSON $\to$ verify all 5 gates pass and DRAFT is created.
2. **Missing Headline:** Verify Gate 1 rejects with `Missing required field: headline`.
3. **Short Summary ($<50$ chars):** Verify Gate 1 rejects with `Summary is too brief`.
4. **Invalid / HTTP URL:** Verify Gate 3 rejects with `URL must use secure HTTPS protocol`.
5. **AI Citation Artifacts:** Verify Gate 2 sanitizes `【14†source】` and cleans text.
6. **Malicious HTML / Script Body:** Verify Gate 2 rejects with MDX security violation.
7. **Unrecognized Category:** Verify fallback to `NATIONAL` with valid root taxonomy node.
8. **Exam Tag Normalization:** Verify `"UPSC"` resolves to `upsc-cse` UUID.
9. **Idempotent Duplicate Import (1, 2, 10, 100 runs):** Verify only 1 draft created in DB.
10. **Bearer Token Authentication:** Verify valid secret succeeds (`200 OK`) and invalid secret returns `401/403`.
11. **Published Version Immutability:** Verify adapter cannot mutate a `PUBLISHED` version.
12. **Candidate UI Isolation:** Verify candidate Hub does not show newly imported drafts until published.

---

## 18. Hard Stop Verification

Before concluding Phase CA-7.1, the repository was audited:
- **Zero source-code modifications performed.**
- **Zero database modifications performed.**
- **Zero migrations created.**
- **Zero production data altered.**
- **Zero dependencies installed.**
- **Zero Worker or GitHub changes deployed.**

---
`CA-7.1 COMPLETE — IMPLEMENTATION SPECIFICATION READY`
