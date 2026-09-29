# Mistake Vault Architecture Specification
**Authoritative Cognitive Error Taxonomy, Longitudinal Intelligence & Relapse Mastery Architecture**

---

## 1. Executive Summary & Purpose

The **Mistake Vault Subsystem** (`/mistakes`) transforms raw candidate test errors from passive score penalties into active, longitudinal learning opportunities.

Rather than merely displaying "Incorrect Answer", the Mistake Vault automatically ingests errors from mock tests, practice sessions, and live competitions, classifies them into a rigorous **Cognitive Error Taxonomy**, tracks error relapse patterns over time, and generates targeted spaced-repetition **Mistake Drills** until verified cognitive mastery is achieved.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     MISTAKE VAULT SUBSYSTEM                                            │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                        │
│   1. ERROR INGESTION                                                                                   │
│      Auto-captures incorrect / unattempted / over-time responses from mock attempts                    │
│      ↓                                                                                                 │
│   2. COGNITIVE CLASSIFICATION                                                                          │
│      Classifies into 5 core error categories: Conceptual, Calculation, Misread, Time Panic, Omission   │
│      ↓                                                                                                 │
│   3. LONGITUDINAL INTELLIGENCE ENGINE                                                                  │
│      Computes error frequency, topic relapse rate, cognitive vulnerability index                       │
│      ↓                                                                                                 │
│   4. SPACED REPETITION DRILLS (/mistakes/drill)                                                        │
│      Generates customized practice sets targeting high-relapse concepts                                │
│      ↓                                                                                                 │
│   5. MASTERY RESOLUTION STATE MACHINE                                                                  │
│      ACTIVE_MISTAKE ──[Drill Passed]──> IN_MASTERY ──[Relapse Prevented]──> MASTERED                   │
│                                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The 7-Category Cognitive Error Taxonomy

Every mistake record in `public.user_mistake_vault` is classified under one of the 7 canonical cognitive archetypes defined in `public.mistake_cognitive_types`:

1. **CONCEPTUAL GAP (`CONCEPTUAL_GAP`)**: Core underlying theoretical concept was not understood or applied incorrectly. Recommended remediation: Review topic foundational unit and conceptual notes before re-attempting.
2. **CALCULATION SLIP (`CALCULATION_SLIP`)**: Candidate understood the concept correctly but made an arithmetic, sign, or algebraic calculation slip during execution. Recommended remediation: Practice timed calculation drills with rough sheet discipline.
3. **MISREAD QUESTION (`MISREAD_QUESTION`)**: Overlooked negative qualifiers ("NOT true", "EXCEPT"), inverted variables, or misread unit conversions. Recommended remediation: Enforce active keyword underlining and question re-verification.
4. **TIME PANIC (`TIME_PANIC`)**: Rushed due to running out of time, making a hurried selection under severe time pressure. Recommended remediation: Implement strict sectional pacing and time-barrier strategies.
5. **FORMULA CONFUSION (`FORMULA_CONFUSION`)**: Mixed up isomorphic formulas or applied formula variant with incorrect parameter substitutions. Recommended remediation: Review formula flashcards and dimensional consistency checks.
6. **DISTRACTOR TRAP (`DISTRACTOR_TRAP`)**: Fell for an engineered cognitive trap or common distractor option specifically designed by examiners. Recommended remediation: Study distractor anatomy and trap recognition patterns.
7. **UNCLASSIFIED (`UNCLASSIFIED`)**: Unclassified or anomalous mistake requiring manual diagnosis or candidate self-tagging.

---

## 3. Relapse Tracking & Mastery State Machine

The Mistake Vault models each mistake as a lifecycle state machine:

- **`ACTIVE`**: Newly captured mistake awaiting candidate attention.
- **`UNDER_REVIEW`**: Candidate inspected the solution, read cognitive diagnostic notes, or attached a personal note.
- **`IN_DRILL`**: Mistake scheduled in an active spaced-repetition drill set.
- **`MASTERED`**: Candidate correctly answered the question (and isomorphic variations) across 2 consecutive spaced sessions without relapse.
- **`RELAPSED`**: Candidate made the same conceptual error on a subsequent test attempt, resetting mastery counters.

---

## 4. Longitudinal Intelligence & Predictive Analytics

The system aggregates mistake data to provide:
- **Cognitive Vulnerability Heatmaps**: Visual breakdown of error types across Subjects and Topics.
- **Relapse Probability Score**: Predictive indicator forecasting topics where the candidate is most likely to commit unforced errors on exam day.
- **Targeted Revision Queue**: Priority-ordered recommendation of learning units to revisit based on recent error clusters.
