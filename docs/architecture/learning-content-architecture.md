# Learning & Content Architecture Specification
**Authoritative Curriculum Taxonomy, Pedagogical Units & MDX Content Compilation Architecture**

---

## 1. Executive Summary & Core Taxonomy Concepts

The **Learning & Content Subsystem** powers Courage Library's structured curriculum delivery. The platform strictly delineates between three separate architectural concepts:

1. **Canonical Academic Taxonomy**: Universal subject knowledge organized hierarchically:
   $$\text{SUBJECT} \rightarrow \text{TOPIC} \rightarrow \text{SUBTOPIC} \rightarrow \text{LEARNING UNIT}$$
   This taxonomy is examination-agnostic, persistent, and shared across all competitive exam domains.

2. **Exam-Specific Syllabus Projection / Mapping (`exam_sections` & `exam_topics`)**: 
   The control plane maps canonical topics to specific competitive exams with exam-specific attributes (`weightage_level`, `required_depth`, `priority`, `expected_questions`) without duplicating or polluting the canonical taxonomy.

3. **Learning Content Artifacts (`learning_documents` & `document_versions`)**:
   Rich learning lessons, theory breakdowns, formula sheets, and practice units compiled into secure MDX AST artifacts.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  ACADEMIC TAXONOMY & PROJECTION ARCHITECTURE                           │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                        │
│   [ CANONICAL ACADEMIC TAXONOMY ]                                                                      │
│   1. Canonical Subjects (public.subjects)                                                              │
│      - Global subjects (Quantitative Aptitude, Reasoning, English, General Awareness)                  │
│      ↓                                                                                                 │
│   2. High-Yield Topics (public.topics)                                                                 │
│      - Core subject topics (Percentages, Syllogism, Reading Comprehension, Indian Polity)              │
│      ↓                                                                                                 │
│   3. Pedagogical Subtopics (public.subtopics)                                                          │
│      - Micro-concepts (Successive Percentage, Either-Or Cases, Error Spotting Rules, Fundamental Rights│
│      ↓                                                                                                 │
│   4. Learning Units (public.learning_units)                                                            │
│      - Granular study units (15-30 min study duration) with learning objectives                        │
│                                                                                                        │
│   [ EXAM-SPECIFIC SYLLABUS PROJECTION ] (Zero Taxonomy Duplication)                                   │
│   - public.exam_sections & public.exam_topics: Projects Canonical Topics -> Specific Exams        │
│     (Stores weightage, required depth, priority, without modifying canonical taxonomy)                 │
│                                                                                                        │
│   [ LEARNING CONTENT ARTIFACTS ]                                                                       │
│   - public.learning_documents & public.document_versions                                               │
│     (Markdown source payload, compiled MDX artifact, SHA-256 checksum, published state)               │
│                                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Relational Data Model

### 2.1 Canonical Subjects (`public.subjects`)
- **Fields**: `id`, `name`, `slug` (unique), `description`, `icon_name`, `display_order`, `is_active`.
- **Protected Baseline**: The 4 global subjects (`Quantitative Aptitude`, `Reasoning Ability`, `English Language & Comprehension`, `General Awareness`) serve as the canonical foundation for all examinations.

### 2.2 Canonical Topics (`public.topics`)
- **Fields**: `id`, `subject_id`, `name`, `slug`, `description`, `required_depth`, `weightage`, `display_order`, `is_active`.
- **Depth Enums**: `FOUNDATIONAL`, `APPLICATION`, `ADVANCED`, `MASTERY`.

### 2.3 Subtopics (`public.subtopics`)
- **Fields**: `id`, `topic_id`, `name`, `slug`, `concept_summary`, `difficulty_tier`, `display_order`.

### 2.4 Learning Units (`public.learning_units`)
- **Fields**: `id`, `subtopic_id`, `title`, `unit_type` (`THEORY`, `SOLVED_EXAMPLES`, `MNEMONIC`, `FORMULA_CARD`), `estimated_read_minutes`, `display_order`.

### 2.5 Learning Documents & Versions (`public.learning_documents` & `public.document_versions`)
- **`learning_documents`**: `id`, `learning_unit_id`, `slug`, `current_version_id`, `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`).
- **`document_versions`**: `id`, `document_id`, `version_number`, `source_markdown`, `compiled_mdx`, `mdx_checksum`, `is_published`, `published_at`, `created_by`.

---

## 3. Content Studio & Authoring Pipeline

The administrative **Content Studio** (`/admin/content-studio`) provides a unified editorial workbench:
1. **Curriculum Navigator**: Tree-view browsing across Subjects, Topics, Subtopics, and Units.
2. **Draft Markdown Editor**: Real-time syntax-highlighted markdown editor with live side-by-side preview.
3. **AST Compilation Gate**: Compiles raw markdown into sanitized, executable MDX components while executing static security scans (`MdxSecurityScanner`).
4. **Publishing Control**: Atomic transition updating `current_version_id` and setting `is_published = true`.

---

## 4. Candidate Course Reader Experience

Candidate course consumption (`/courses/[slug]/learn`) features:
- **Progress Tracking**: Automatic lesson completion recording (`/api/courses/complete-lesson`) and playback heartbeat.
- **Interactive Widgets**: Mathematical formula callouts, mnemonic highlight cards, inline question checkpoints, and concept bookmarking.
- **Candidate Parity**: Uses the same AST rendering engine as the admin studio preview, preventing formatting drift.
