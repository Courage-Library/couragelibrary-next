# 21 — QUESTION REPORTING, DISPUTES & ERRATA RECALCULATION

> **DOCUMENTATION CLASSIFICATION:** Content Quality Control & Errata Lifecycle  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Errata & Dispute Resolution Workflow  

---

## 1. What is it?
The **Question Reporting & Errata Recalculation Engine** governs the candidate-facing dispute reporting system, administrative review workbench, answer key corrections, historical versioning lineages, and post-errata score recalculation protocols.

## 2. Why does it exist?
Even in official government examinations, roughly 1–3% of questions face candidate disputes regarding typographical ambiguities, multiple correct options, or translation errors.
- If a dispute is resolved by simply editing the existing question row, past candidate records become inconsistent and un-auditable.
- Courage Library provides an end-to-end errata resolution pipeline that preserves historical integrity while offering transparent score recalculations.

---

## 3. The 5-Stage Question Dispute Lifecycle

```
[ STAGE 01: CANDIDATE REPORT INGESTION ]
Candidate flags Question #14 from result review -> Selects issue category: [Wrong Answer Key] [Typo] [Ambiguous].
Provides written explanation & screenshot reference.
         │
         ▼
[ STAGE 02: ADMIN QUALITY TRIAGE ]
Appears in `psychometric_review_queue` and admin dispute cockpit.
Admin inspects question text, official PYQ source, and candidate evidence.
         │
         ▼
[ STAGE 03: VERIFICATION & ERRATA RESOLUTION ]
If valid: Admin initiates Errata Correction RPC:
* Creates `question_versions` row (v2) with corrected text / answer key.
* Marks dispute ticket as 'RESOLVED_NEW_VERSION'.
* Awards +50 CL Coin bounty to the reporting candidate.
         │
         ▼
[ STAGE 04: IMMUTABLE HISTORICAL PRESERVATION ]
Attempts recorded against v1 remain untouched.
New test generations automatically bind to v2.
         │
         ▼
[ STAGE 05: OPTIONAL TEST-LEVEL RE-EVALUATION ]
If the errata affects a published Live Competition:
* Admin triggers re-evaluation under `EVAL_V2_ERRATA`.
* Generates a new immutable publication snapshot without deleting snapshot v1.
```

---

## 4. Why Psychometrics Cannot Automatically Invalidate Questions
While automated psychometric monitors detect anomalous statistics (e.g., negative discrimination $r_{pbis} < 0.0$), the system **never automatically deactivates or modifies question keys**:
1. **Curriculum Alignment**: A difficult question on an obscure historical fact may have low facility $p$ and negative discrimination if high scorers overthought it, but the question is factually correct.
2. **Pedagogical Authority**: Mathematical algorithms detect statistical symptoms; only human subject matter experts can make authoritative editorial determinations.

---

## 5. What Must Never Happen
- A candidate dispute must **never** be silently deleted without an administrative resolution reason.
- An errata correction must **never** mutate historical database rows for `question_versions` or `question_answers`.
