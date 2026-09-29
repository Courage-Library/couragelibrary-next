# Courage Library — Testing Strategy & Quality Assurance Framework

## 1. Quality Assurance Philosophy

Courage Library employs a **Multi-Tiered, Runtime-Verified Quality Assurance Strategy**. Because competitive examination platforms demand flawless accuracy in assessment timers, score calculations, content rendering, and mistake tracking, all features undergo rigorous end-to-end testing prior to production release.

```
+-------------------------------------------------------+
| Level 4: End-to-End Responsive & Browser Verification | (Playwright / Multi-viewport)
+-------------------------------------------------------+
                            |
+-------------------------------------------------------+
| Level 3: Runtime Integration & Schema Verification    | (Standalone Node/TS Test Harnesses)
+-------------------------------------------------------+
                            |
+-------------------------------------------------------+
| Level 2: Subsystem Unit & State Machine Tests         | (Jest / Vitest / Pure functions)
+-------------------------------------------------------+
                            |
+-------------------------------------------------------+
| Level 1: Static Type & Build Gates                    | (TypeScript Strict, Next.js Build)
+-------------------------------------------------------+
```

---

## 2. Testing Tiers & Scope

### Tier 1: Static Type & Lint Verification
- **Tooling**: `tsc --noEmit`, ESLint with Next.js core Web Vitals.
- **Coverage**: Type completeness across all database models, DTOs, React component props, and Server Action payloads.
- **Rule**: Zero type assertions (`as any`), zero untyped API boundaries.

### Tier 2: Isolated Unit Testing
- **Coverage**: Pure algorithmic calculations:
  - Markdown diff calculation algorithm.
  - Sectional time authority validation.
  - IRT (Item Response Theory) difficulty and discrimination calculations.
  - Mistake Vault mastery progression state machine transitions.
  - Zod schema validation rules and regex parsers.

### Tier 3: Standalone Runtime Integration Test Suites
- **Implementation**: Dedicated standalone CommonJS scripts executing against in-memory or fixture database states.
- **Execution**: Run via `node scripts/<test_script>.cjs`.
- **Coverage**:
  - Exam Knowledge Schema Validation (5 validation gates).
  - External AI Citation Artifact Sanitization & Gate 3 Security (16 runtime assertions covering multi-provider regex normalizers, Gate 3 blocking, compiler safety, and candidate renderer defense-in-depth).
  - Version History & Diff calculations (snapshot transitions, superseding logic).
  - AI Prompt Generation contracts (12 pillars, 16 sections, token budgets).
  - Assessment lifecycle (start attempt $\rightarrow$ answer items $\rightarrow$ timeout handling $\rightarrow$ submission $\rightarrow$ score computation).

### Tier 4: Multi-Viewport Responsive Browser Verification
- **Coverage**: UI layout integrity across standard responsive breakpoints:
  - Mobile Small ($320\text{px}$)
  - Mobile Standard ($375\text{px}, 390\text{px}$)
  - Tablet Portrait ($768\text{px}$)
  - Tablet Landscape ($1024\text{px}$)
  - Desktop Standard ($1280\text{px}, 1440\text{px}, 1920\text{px}$)
- **Verification Elements**: Overflow prevention, sticky navigation bars, split diff views, modal clipping, keyboard navigation.

---

## 3. Authoritative Evidence Classification Matrix

Courage Library classifies all system verification evidence into 6 formal categories:

| Classification | Meaning & Scope | Verification Method |
| :--- | :--- | :--- |
| **`RUNTIME VERIFIED`** | Code executed in runtime with deterministic assertions passing ($100\%$, exit code `0`). | Standalone `.cjs` test scripts in Node.js runtime. |
| **`STATICALLY VERIFIED`** | Compile-time correctness, schema type safety, zero untyped boundaries. | TypeScript strict compiler (`tsc --noEmit`), ESLint. |
| **`PROMPT CONTENT VERIFIED`** | Prompt generator deterministically outputs required 12 pillars, 16 sections, rules, and token bounds. | Unit tests asserting prompt substring/regex constraints. *(Note: Proves prompt contract, NOT that external AI factually researched future exams).* |
| **`MANUAL UI VERIFIED`** | Real browser rendering, interactive flows, touch handling, and responsive layout across 8 viewports. | Manual inspection across mobile/tablet/desktop breakpoints. |
| **`ARCHITECTURE VERIFIED`** | Invariant compliance (e.g. Control Plane vs Content Engine separation, $\Delta = 0$ database migration safety). | Architectural review and database constraint validation. |
| **`DOCUMENTATION VERIFIED`** | Documentation matches actual repository code, schemas, and accepted phase reports. | Cross-referencing against source code and active tests. |

---

## 4. Zero-Regression Invariant

No phase or refactor is considered complete unless:
1. **Existing Baseline Untouched**: All existing regression tests continue to pass with $100\%$ success rate.
2. **New Assertions Added**: New capabilities must provide dedicated assertions proving happy path, edge cases, and adversarial failure states.
3. **Zero Production Migration Drift**: New phases must not introduce uncommitted or conflicting database migrations.
4. **Deterministic Exit Codes**: All automated test scripts must exit with code `0` on success and non-zero on failure.
