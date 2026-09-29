# 14 — EXAM PLAYER UI & ANTI-TAMPER INTEGRATION

> **DOCUMENTATION CLASSIFICATION:** UI/UX Architecture & Client Security  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Front-End Presentation & Security Shell  

---

## 1. What is it?
The **Exam Player UI** is the visual and interactive container that renders question text, LaTeX/KaTeX mathematical formulas, bilingual language switchers, fullscreen security locks, dynamic candidate hardware watermarking, and responsive sectional viewports.

## 2. Desktop vs Mobile Layout Architecture

```
+----------------------------------------------------------------------------------------------------+
|                                    DESKTOP EXAM PLAYER LAYOUT                                      |
+----------------------------------------------------------------------------------------------------+
| [Brand & Logo] | Test Title | Attempt UUID | Language: [EN/HI] | [ TIMER: 00:42:15 ] | [SUBMIT TEST]|
+----------------------------------------------------------------------------------------------------+
| [ SECTION TABS: (1) Reasoning | (2) General Awareness | (3) Math | (4) English ]                   |
+------------------------------------------------------------------------------------+---------------+
| QUESTION AREA (70% Width)                                                          | PALETTE (30%) |
|                                                                                    |               |
| Question No. 14                                             Marks: +2.0 / -0.5     | [Section 1]   |
| ---------------------------------------------------------------------------------- | (1) (2) (3)   |
| If $x + \frac{1}{x} = 5$, find the value of $x^3 + \frac{1}{x^3}$.                  | (4) (5) (6)   |
|                                                                                    | (7) (8) (9)   |
| (A) 110                                                                            | (10)(11)(12)  |
| (B) 115                                                                            | (13)(14)(15)  |
| (C) 125                                                                            |               |
| (D) 140                                                                            | [Summary]     |
|                                                                                    | Ans: 8        |
| ---------------------------------------------------------------------------------- | Not Ans: 4    |
| [Mark for Review & Next]  [Clear Response]               [Save & Next]             | Review: 2     |
+------------------------------------------------------------------------------------+---------------+
```

---

## 3. Dynamic Hardware & Candidate Watermarking

To prevent content theft, screen recording, or unauthorized distribution of proprietary mock questions:
1. **Dynamic Canvas Watermark**: Renders semi-transparent, rotating watermark text across the question container.
2. **Payload**: `Candidate Name | Candidate UUID | Attempt ID | Current Timestamp | IP Hash`.
3. **Anti-Inspection Protection**: Disables right-click context menu, text selection (`user-select: none`), and clipboard copy events during active attempts.

---

## 4. Mathematical Equation Rendering (KaTeX Integration)

- All equations are authored in standard LaTeX enclosed in single dollar signs for inline math (`$...$`) or double dollar signs for display math (`$$...$$`).
- **Render Engine**: Client-side KaTeX parser with strict error boundary protection.
- **Fail-Safe**: If an equation contains invalid LaTeX syntax, KaTeX catches the error and outputs the raw code string rather than crashing the React DOM tree.

---

## 5. What Must Never Happen
- The UI must **never** render the question's explanation or correct option key in hidden DOM elements, HTML data attributes, or React props.
- Watermark rendering must **never** obstruct readability of question text or diagrams.
