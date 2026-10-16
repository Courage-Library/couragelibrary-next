# Syllabus draft import contract — `contract_version: 1`

SYL-IMPORT-1. This is the JSON format accepted by **/admin/syllabus → "Import draft from JSON"**. An import creates **one DRAFT
version** of an exam's canonical syllabus: PAPER → SECTION → UNIT nodes plus UNIT → taxonomy-topic mappings. It never
creates topics, never publishes and never changes a PUBLISHED or ARCHIVED version. An admin reviews the draft and publishes
it through the normal editor flow.

| Layer | Where | Role |
|---|---|---|
| Validator (UX) | `lib/syllabus/import-contract.ts` | The one TypeScript implementation, used by the server actions and the tests. It returns every error with a JSON path. |
| Authority | `fn_syllabus_import_draft(p_exam_id uuid, p_payload jsonb)` (migration 086) | Re-validates everything and resolves topics. It writes the version, nodes, mappings and an audit row in one transaction, or nothing at all. |

Example: `data/syllabus-drafts/ssc-cgl-tier1.v1.json`.

## 1. Shape

```json
{
  "contract_version": 1,
  "exam": "ssc-cgl",
  "cycle_year": 2026,
  "version_tag": "tier1-ek-draft-v1",
  "source_note": "Where the content comes from (plain text).",
  "papers": [
    {
      "code": "tier-1", "title": "Tier 1", "description": null, "order": 1, "is_mandatory": true,
      "expected_questions_min": 100, "expected_questions_max": 100,
      "sections": [
        {
          "code": "tier1-qa", "title": "Section III: Quantitative Aptitude", "weightage_tier": null,
          "expected_questions_min": 25, "expected_questions_max": 25,
          "units": [
            {
              "code": "qa-percentage", "title": "Percentage", "description": "Percentage change, …",
              "weightage_tier": "HIGH_YIELD", "required_cognitive_depth": "APPLICATION",
              "expected_questions_min": null, "expected_questions_max": null,
              "topics": [{ "topic": "quantitative-aptitude.percentage", "weight": null }]
            }
          ]
        }
      ]
    }
  ]
}
```

## 2. Fields

Every key not listed in this section is rejected (`UNKNOWN_KEY`) at every level. Optional fields may be omitted or set to `null`.
A value the source does not provide must stay `null`; it is never required.

**Root**

| Key | Required | Rule |
|---|---|---|
| `contract_version` | yes | Exactly `1`. Checked first: any other value stops validation (`UNSUPPORTED_CONTRACT_VERSION`). |
| `exam` | yes | The exam slug. It must equal the exam selected in the UI (`EXAM_MISMATCH`). |
| `cycle_year` | no | A year from 2000 to 2100, or `null` for "all cycles (exam-wide)". The exam must have that cycle (`CYCLE_NOT_FOUND`). |
| `version_tag` | no | Lower-case letters, digits, `-` and `.`, at most 80 characters. Defaults to `v<number>`. |
| `source_note` | no | Plain text, at most 500 characters. Stored in the version's `metadata.import.source_note`. |
| `papers` | yes | A non-empty list of PAPER objects. |

**Node fields** (PAPER, SECTION, UNIT)

| Key | Required | Rule |
|---|---|---|
| `code` | yes | Pattern `^[a-z0-9]+(-[a-z0-9]+)*$`, at most 80 characters, unique across the whole payload. It becomes the node slug. |
| `title` | yes | Plain text, 1–200 characters. |
| `description` | no | Plain text, at most 2000 characters. |
| `order` | no | If given, it must equal the node's 1-based position in its list (`ORDER_NOT_CONTIGUOUS`). Order always comes from list position. |
| `is_mandatory` | no | Boolean; default `true`. |
| `expected_questions_min` / `expected_questions_max` | no | Whole numbers from 0 to 1000; `min ≤ max` (`RANGE_INVALID`). |
| `weightage_tier` | no | SECTION and UNIT only. One of `HIGH_YIELD`, `CORE`, `MODERATE`, `LOW`, `OPTIONAL`. |
| `required_cognitive_depth` | no | UNIT only. One of `RECALL`, `UNDERSTANDING`, `APPLICATION`, `ANALYSIS`, `COMPLEX_PROBLEM_SOLVING`. |
| `sections` / `units` | yes | A non-empty list of children: a PAPER holds `sections`, a SECTION holds `units`. |
| `topics` | no | UNIT only. At most 20 topic references. |

**Topic reference** `{ "topic": "<subject-slug>.<topic-slug>", "weight": null }`

| Key | Rule |
|---|---|
| `topic` | The taxonomy TOPIC's `hierarchy_path`: its stable identifier, as shown in /admin/taxonomy. |
| `weight` | Optional. Either set every topic of the unit or none. Each weight is in (0, 1], stored as `numeric(5,4)`, and the weights add up to 1 (± 0.0001). |

A topic may appear only once per unit (`DUPLICATE_TOPIC`) and only once per section (`DUPLICATE_TOPIC_IN_SECTION`).

## 3. Topic resolution

Each `topic` is looked up by exact `hierarchy_path` among TOPIC nodes:

- A path that is not found gives **`MISSING_TOPIC`** with the requested identifier.
- A path that is found but inactive gives **`TOPIC_INACTIVE`**.
- Topics are **never created and never fuzzy-matched**.

The preview shows similar existing topic names for a missing path as a hint only. A hint is never applied or mapped. "Create draft" stays disabled while any topic is missing; create the topic in /admin/taxonomy (admin) first.

## 4. Plain text

Titles, descriptions and `source_note` must be plain text. They are trimmed, and these are rejected (`NOT_PLAIN_TEXT`):

- `<`, `>` or a backtick;
- markdown links `](`;
- `**` or `__`;
- a line starting with `#` or `>`;
- `javascript:`;
- control characters other than a newline.

Characters such as `&`, `/`, `%`, `(`, `-` and `;` are fine. Lengths are counted in characters.

## 5. Limits and order of checks

1. Payload ≤ 256 KB (UTF-8 bytes), checked before JSON parsing (`PAYLOAD_TOO_LARGE`). The RPC checks the size of the jsonb text.
2. The root must be a plain JSON object; `contract_version === 1`.
3. At most 500 nodes (papers + sections + units), counted shallowly before the deep pass (`TOO_MANY_NODES`).
4. Deep pass. The depth is fixed: PAPER → SECTION → UNIT. A child list under the wrong level is `BAD_DEPTH`, and `topics` on a PAPER or SECTION is `MAPPING_NOT_UNIT`.
5. Errors are collected, not reported only one at a time. The list is capped at 200; when the cap is hit, the last entry is `TOO_MANY_ERRORS`. The RPC raises the first error it finds.

## 6. Error codes

Each error is `{ code, path, message }`, with a path such as `$.papers[0].sections[2].units[1].title`.

| Code | Meaning |
|---|---|
| `INVALID_JSON` | The text is not JSON. |
| `PAYLOAD_TOO_LARGE` | The payload is over 256 KB. |
| `TOO_MANY_NODES` | There are more than 500 nodes. |
| `UNSUPPORTED_CONTRACT_VERSION` | `contract_version` is not 1. |
| `INVALID_TYPE` | A value has the wrong JSON type (for example an object where a list belongs). |
| `UNKNOWN_KEY` | A key is not in this contract. |
| `REQUIRED` | A required key is missing or empty. |
| `INVALID_VALUE` | A value is outside its enumeration or range. |
| `TOO_LONG` | A text is over its length limit. |
| `NOT_PLAIN_TEXT` | HTML, markdown or script appears in a text. |
| `INVALID_CODE` | A code breaks the code pattern. |
| `DUPLICATE_CODE` | A code is used twice. |
| `ORDER_NOT_CONTIGUOUS` | An `order` does not match its list position. |
| `EMPTY_LIST` | A `papers`, `sections` or `units` list is empty. |
| `BAD_DEPTH` | Children appear under the wrong level. |
| `MAPPING_NOT_UNIT` | `topics` appears on a PAPER or SECTION. |
| `RANGE_INVALID` | `expected_questions_min` > `expected_questions_max`. |
| `DUPLICATE_TOPIC` | The same topic appears twice in a unit. |
| `DUPLICATE_TOPIC_IN_SECTION` | The same topic appears in two units of one section. |
| `WEIGHTS_INVALID` | Weights are partial, out of (0, 1], or do not add up to 1. |
| `MISSING_TOPIC` | No TOPIC has this `hierarchy_path`. |
| `TOPIC_INACTIVE` | The topic exists but is inactive. |
| `EXAM_MISMATCH` | `exam` is not the selected exam. |
| `CYCLE_NOT_FOUND` | The exam has no cycle for `cycle_year` (preview + RPC). |
| `DRAFT_EXISTS` | The exam already has a DRAFT for that cycle (RPC; the preview warns too). Publish, archive or delete the draft first. |
| `TOO_MANY_ERRORS` | More than 199 errors were found; the list is truncated. |

The RPC raises `SYLLABUS_IMPORT_INVALID: <CODE> at <path>: <message>` (SQLSTATE 22023; `DRAFT_EXISTS` uses P0001). The server action passes only the code and the JSON path to the UI, together with a curated message.

## 7. What the import writes

Everything below happens in ONE transaction; any error means nothing is written.

- **Role check:** staff or admin (`fn_syllabus__assert_role(false)`), the same check as "New empty draft".
- **Version:** created through `fn_syllabus__create_version`, with:
  - status `DRAFT`;
  - `source_kind = 'IMPORT'`;
  - `raw_payload_hash` = sha256 (hex) of the payload's jsonb text;
  - `metadata.import = { contract_version, payload_sha256, source_note, nodes, mappings }`;
  - `created_by` = the importer.
- **Nodes:** inserted through `fn_syllabus__insert_node`, so the existing triggers (depth, cycles, same version, draft-only) stay authoritative. `required_cognitive_depth` is set on UNITs.
- **Mappings:** `MANUALLY_MAPPED`, confidence 1.00, method `MANUAL`, weight as given (or null), reviewed by the importer.
- **Audit:** one `admin_audit_logs` row, `SYLLABUS_DRAFT_IMPORT`, recording payload sha256, papers / sections / units / nodes / mappings counts, version number and tag.
- **Permissions:** EXECUTE for `authenticated` only (revoked from PUBLIC and anon).

After the import the draft opens in the editor. Validation, editing and publishing (admin only) work exactly as for any other draft.
