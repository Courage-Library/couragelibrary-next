# 13 — COMMON MOCK ENGINE & PLAYER ARCHITECTURE

> **DOCUMENTATION CLASSIFICATION:** Client Engine & Shared Assessment Runtime  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Front-End Assessment Runtime  

---

## 1. What is it?
The **Common Mock Engine** is the unified, high-performance client-side examination runtime that powers Daily Mocks, Premium Test Series, PYQ Papers, and Live All-India Competitions across desktop and mobile devices.

## 2. Why does it exist?
Building separate exam player engines for each test type leads to fragmented user experiences, divergent timer behaviors, and recurring bugs in answer submission. The Common Mock Engine abstracts:
1. Section switching and tab navigation.
2. Question palette color coding (TCS iON standard states).
3. Option selection, clearing, and review marking.
4. The mandatory **Manual Next Rule**.
5. Client-side offline buffering and background syncing.

---

## 3. The Sacred Non-Negotiable: Manual Next Rule

```
====================================================================================================
               THE SACRED NON-NEGOTIABLE: NO AUTOMATIC ADVANCEMENT
====================================================================================================

RULE DEFINITION:
When a candidate selects an option (A, B, C, or D), the player engine MUST NEVER automatically
advance to the next question.

WHY THIS RULE IS SACRED:
1. TCS iON Fidelity: Official Indian recruitment exams (SSC, Banking, Railways) require candidates
   to explicitly click "Save & Next" or "Mark for Review & Next". Auto-advancing disrupts muscle
   memory and causes accidental question skipping.
2. Option Deliberation: Candidates frequently change their selection between options before finalizing.
   Auto-advancing forces the candidate to navigate back to fix mistakes, causing immense frustration.
3. Review Discipline: Candidates must be able to select an option AND click "Mark for Review" to flag
   the item for second-pass reconsideration.
====================================================================================================
```

---

## 4. Question Palette State Matrix

```
+----------------------------------------------------------------------------------------------------+
| STATE COLOR        | PALETTE STATUS            | DEFINITION & CANDIDATE ACTION                     |
+--------------------+---------------------------+---------------------------------------------------+
| Grey (Outline)     | `NOT_VISITED`             | Question has not yet been viewed.                 |
| Red (Solid)        | `NOT_ANSWERED`            | Question viewed but no option selected.           |
| Green (Solid)      | `ANSWERED`                | Option selected and "Save & Next" clicked.        |
| Purple (Solid)     | `MARKED_FOR_REVIEW`       | No option selected, flagged for review.           |
| Purple + Green Dot | `ANS_MARKED_FOR_REVIEW`   | Option selected AND flagged for review.           |
+----------------------------------------------------------------------------------------------------+
```

---

## 5. Keyboard Navigation & Accessibility Bindings
- Keys `1`, `2`, `3`, `4` or `A`, `B`, `C`, `D`: Select corresponding option.
- Key `Enter` or `Ctrl+Right`: Save & Next.
- Key `Ctrl+Left`: Previous Question.
- Key `Ctrl+M`: Mark for Review & Next.
- Key `Ctrl+D`: Clear Response.

---

## 6. What Must Never Happen
- Option click must **never** trigger automatic advancement.
- Palette colors must **never** reveal answer correctness during an active attempt.
- The exam player must **never** crash or blank out if a KaTeX equation fails to parse; fallback LaTeX string rendering is required.
