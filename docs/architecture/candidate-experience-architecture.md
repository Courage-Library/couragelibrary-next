# Candidate Experience & Reader Architecture Specification
**Authoritative Candidate Hub, Candidate-Parity Article Reader & Multi-Viewport Layout Architecture**

---

## 1. Executive Summary & Purpose

The **Candidate Experience Subsystem** is the public-facing delivery plane of Courage Library. It provides aspirants with an intuitive, unified, distraction-free environment to explore examination roadmaps, read verified knowledge modules, study curriculum units, take mock tests, and resolve cognitive mistakes.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CANDIDATE EXPERIENCE TOPOLOGY                                        │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                        │
│   1. EXAMINATION EXPLORATION HUB (/exams)                                                              │
│      Browse by Domain (Central, State, Banking, Defence) with search, filter, and active cycle badges  │
│      ↓                                                                                                 │
│   2. EXAM DASHBOARD & KNOWLEDGE HUB (/exams/[slug] or /exams/[slug]/cycle/[year])                      │
│      Hero metadata, 24-module navigation matrix, syllabus tree, cutoff trends, and mock links          │
│      ↓                                                                                                 │
│   3. CANONICAL ARTICLE READER (/exams/[slug]/[moduleSlug])                                             │
│      Single canonical MDX AST renderer with responsive typography, callouts, tables, FAQs, sources     │
│      ↓                                                                                                 │
│   4. INTEGRATED LEARNING & ASSESSMENT SHORTCUTS                                                        │
│      Direct transitions into /courses/[slug]/learn, /mock-tests/[id]/take, and /mistakes               │
│                                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The Single Canonical Article Renderer (`ExamMdxArticleRenderer`)

To guarantee absolute **Candidate Parity**, both the public candidate view and the internal admin preview execute the exact same AST renderer component (`components/exams/exam-mdx-article-renderer.tsx`):

### Supported Structural Elements:
1. **Typography & Structure**: Monospace section type badges, semantic H2 and H3 section headings with anchored links, styled paragraphs, and ordered/unordered lists.
2. **Interactive Callouts**: Distinctly styled alert boxes:
   - `INFO` (Blue): Key takeaways, background context, official notes.
   - `WARNING` (Amber): Tentative dates, eligibility cautions, fee deadlines.
   - `CRITICAL` (Rose): Negative marking penalties, disqualification criteria, strict photo/signature rejections.
3. **GFM Tables**: Responsive tables with sticky headers, alternate row striping, horizontal scroll wrappers, and mobile padding.
4. **FAQ Accordions**: Expandable question/answer cards with accessible keyboard navigation and chevron indicators.
5. **Verified Official Source Cards**: Card-based source links displaying document title, issuing authority, publication date, and secured external links (`target="_blank"` with `rel="noopener noreferrer"`).

---

## 3. Responsive Multi-Viewport Invariants

The Candidate UI is verified and hardened across all 8 standard device viewports:

| Viewport Width | Target Device Class | Layout Adaptation & Invariants |
| :--- | :--- | :--- |
| **320px** | Ultra-compact (iPhone SE 1st Gen) | Single-column cards, wrapped badge tags, zero horizontal overflow (`break-words`) |
| **360px** | Android Compact | Single-column, full-width button tap targets ($\ge 44\text{px}$) |
| **375px** | iPhone Mini / SE | Single-column, natural line wrapping, padding optimized to 16px |
| **390px** | Standard Modern Mobile (iPhone 14/15) | Single-column, inline metadata chips, full typography hierarchy |
| **414px** | Large Mobile (Plus / Max) | Single-column, balanced card margins |
| **768px** | Tablet Portrait (iPad) | 2-column grid for sources and quick links; side-by-side metadata |
| **1024px** | Tablet Landscape / Laptop | Multi-column dashboard layout with sticky side navigation |
| **1280px+** | Desktop Monitor | Max-width centered reading container (65-75 characters per line for optimal reading ergonomics) |
