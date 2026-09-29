# 07 — TEST TEMPLATE VS TEST INSTANCE VS ATTEMPT

> **DOCUMENTATION CLASSIFICATION:** Structural Architecture & Instance Lifecycle  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Test Resolution Engine  

---

## 1. What is it?
The **Test Resolution Engine** governs the strict three-tier boundary separating an abstract test recipe (**Mock Template**), a frozen test paper (**Mock Test Instance**), and an individual candidate's examination session (**Test Attempt**).

## 2. Why does it exist?
Confusing a test template with a test instance or an attempt leads to catastrophic failure modes:
1. **Dynamic Test Collisions**: If two candidates generate a "Quantitative Aptitude Weak Area Drill" at the same time and the system stores questions on the template, Candidate A's question list overwrites Candidate B's.
2. **Result Invalidation**: If questions are resolved dynamically inside the attempt rather than the test instance, candidate attempts cannot be cross-benchmarked or aggregated into live leaderboards.
3. **Quota Billing Errors**: If quota is consumed when a template is browsed or an instance generated, candidates lose attempts on abandoned generation clicks.

Courage Library enforces a clean separation of concerns:

```
+----------------------------------------------------------------------------------------------------+
|                         TEMPLATE vs INSTANCE vs ATTEMPT RELATIONSHIP                               |
+----------------------------------------------------------------------------------------------------+

   [ 1. MOCK TEMPLATE ] (Abstract Blueprint)
   * Blueprint rules, section structure, duration, marking scheme.
   * Exists once per exam pattern. Zero candidate state.
          │
          │ Instantiated via Curated Admin or Dynamic Generator
          ▼
   [ 2. MOCK TEST INSTANCE ] (Frozen Question Paper)
   * Exact list of questions linked via `mock_sections` & `mock_questions`.
   * Immutable once published or assigned.
   * Reusable across candidates (Daily / Curated) or private to 1 candidate (Dynamic).
          │
          │ Initiated by Candidate (Consumes 1 Quota / Validates Schedule)
          ▼
   [ 3. TEST ATTEMPT ] (Candidate Execution Session)
   * Candidate UUID, `started_at`, `status = 'IN_PROGRESS'`, server timer.
   * Stores candidate option choices in `attempt_answers`.
```

---

## 3. Instance Resolution Comparison Matrix

```
+---------------------------------------------------------------------------------------------------------+
| DIMENSION         | MOCK TEMPLATE                     | MOCK TEST INSTANCE      | TEST ATTEMPT          |
+-------------------+-----------------------------------+-------------------------+-----------------------+
| Table             | `public.mock_templates`           | `public.mock_tests`     | `public.test_attempts`|
| Cardinality       | 1 per Exam Tier                   | N per Template          | M per Test Instance   |
| Mutability        | Editable by Admin                 | Strictly Immutable      | State Machine Driven  |
| Question Links    | Abstract Topic Counts             | Exact `question_version`| Staged User Choices   |
| Quota Impact      | None                              | 0 Quota on Generation   | -1 Quota on Start     |
| User Association  | Platform Global                   | Global or Private User  | Strictly 1 Candidate  |
+---------------------------------------------------------------------------------------------------------+
```

---

## 4. Lifecycle Transitions & Creation Rules

### Rule 1: Zero-Quota Instance Generation
When a candidate requests a dynamic test (e.g. "Create a 25-question Topic Test on Trigonometry"), the generator:
1. Validates the candidate's active subscription entitlement.
2. Generates the `mock_tests` and `mock_questions` records.
3. **Does NOT deduct quota.** If the candidate closes the browser without starting, no quota is lost.

### Rule 2: Atomic Attempt Creation & Quota Decrement
When the candidate clicks **"Start Test"**:
1. PostgreSQL RPC executes `BEGIN TRANSACTION`.
2. Verifies `quota_remaining > 0` with `FOR UPDATE` row lock on `candidate_quota_usages`.
3. Decrements quota count by 1.
4. Inserts row into `test_attempts` with `status = 'IN_PROGRESS'` and `started_at = NOW()`.
5. Commits transaction.

---

## 5. What Must Never Happen
- A candidate must **never** be able to modify the `mock_questions` of a test instance once an attempt has been created against it.
- An attempt must **never** be created without linking to an existing, valid `mock_test_id`.
- Quota must **never** be decremented before the attempt record is successfully committed to the database.
