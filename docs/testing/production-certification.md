# Production Certification Standards & Release Gate Protocol

## 1. Production Certification Protocol

Before any branch or milestone in Courage Library is certified for production deployment, it must satisfy the **6-Point Release Gate Protocol**.

```
+-------------------------------------------------------------+
| 1. TypeScript Strict Type-Check (Zero errors / zero any)   |
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
| 2. Full Regression Suite (433+ runtime assertions passing)  |
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
| 3. Security & Anti-Injection Verification (30+ XSS vectors) |
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
| 4. Multi-Viewport Layout Integrity (320px to 1920px verified)|
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
| 5. Next.js Static Optimization & Standalone Production Build |
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
| 6. Zero Database Migration Conflict & Data Baseline Intact  |
+-------------------------------------------------------------+
```

---

## 2. Mandatory Release Gates

### Gate 1: TypeScript Strict Compilation
- **Command**: `npm run build` or `npx tsc --noEmit`
- **Standard**: $0$ errors, $0$ warnings. No `@ts-ignore` without explicit, reviewed architectural justification.

### Gate 2: Full Runtime Regression Execution
- **Standard**: All test harnesses (`scripts/test-*.ts`) must complete with exit code `0`. Total assertions evaluated must meet or exceed $433$.

### Gate 3: Security & MDX AST Sanitization
- **Standard**: All test vectors in the adversarial security suite must be successfully blocked. No unwhitelisted HTML tags or non-HTTPS external resources permitted in production documents.

### Gate 4: Visual & Responsive Layout Verification
- **Standard**: Key candidate and staff views must be verified across the 8 standard viewports:
  - No horizontal scrolling on mobile viewports ($320\text{px}, 375\text{px}, 390\text{px}$).
  - Modals, drawers, and sticky headers must remain usable with touch interactions.
  - Diff viewers and code split views must stack gracefully on narrow screens.

### Gate 5: Production Build & Asset Optimization
- **Command**: `npm run build`
- **Standard**: Standalone output generated in `.next/standalone`. All route segments compiled as static or dynamic per architectural specifications. Zero build-time memory leaks.

### Gate 6: Production Data Baseline & Migration Safety
- **Standard**:
  - Zero uncommitted or destructive schema migrations.
  - Active baseline documents (such as SSC CGL 2026 `EXAM_OVERVIEW` v1 `a51ea811-6ffd-48fc-bf84-1e47ffd9934c`) remain completely intact and functional.

---

## 3. Production Deployment Sign-Off Checklist

```markdown
- [ ] TypeScript typecheck passes (`npx tsc --noEmit`)
- [ ] Schema validation suite passes (`scripts/test-exam-knowledge-schema-validation.ts`)
- [ ] Version history & diff suite passes (`scripts/test-version-history-diff.ts`)
- [ ] AI prompt generator suite passes (`scripts/test-exam-prompt-generator.ts`)
- [ ] Mock engine suite passes (`scripts/test-mock-assessment-engine.ts`)
- [ ] Mistake vault suite passes (`scripts/test-mistake-vault-state-machine.ts`)
- [ ] Production build passes (`npm run build`)
- [ ] Visual verification completed on Mobile (390px) and Desktop (1440px)
- [ ] Production baseline document UUID verified intact
- [ ] Academic Reviewer / Release Lead Sign-Off
```
