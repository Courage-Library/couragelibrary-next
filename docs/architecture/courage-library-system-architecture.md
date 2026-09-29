# Courage Library — System Architecture Specification
**Authoritative Whole-Platform Technical Architecture Blueprint**

---

## 1. System Vision & Purpose

**Courage Library** is a production-grade, self-paced, examination-agnostic learning and assessment platform built for government competitive examinations in India (Central recruitment like SSC, UPSC, Railways, Banking, Defence, and State Public Service Commissions).

The platform bridges the gap between static reference material, cognitive mistake tracking, and high-stakes computerized assessment by integrating five tightly coupled, domain-isolated core engines:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       COURAGE LIBRARY PLATFORM                                         │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                        │
│   ┌────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                                 EXAMS & ONBOARDING CONTROL PLANE                               │   │
│   │         (Canonical Exam Registry, Recruitment Cycles, 14-Dimension Readiness Evaluator)        │   │
│   └────────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                 │                                             │                         │              │
│                 ▼                                             ▼                         ▼              │
│   ┌───────────────────────────┐                 ┌───────────────────────────┐    ┌─────────────────┐   │
│   │   EXAM KNOWLEDGE STUDIO   │                 │   CANONICAL CURRICULUM    │    │ QUESTION BANK   │   │
│   │  (24 Dynamic Modules,     │                 │   & CONTENT STUDIO        │    │ & MOCK ENGINE   │   │
│   │   Research AI Prompting,  │                 │  (Subjects, Topics,       │    │ (Adaptive CAT,  │   │
│   │   5-Gate Validation,      │                 │   Subtopics, Units,       │    │  Live All-India,│   │
│   │   Immutable Versioning,   │                 │   MDX Compilation,        │    │  Timer Authority│   │
│   │   Semantic Diff Engine)   │                 │   Learning Delivery)      │    │  Psychometrics) │   │
│   └───────────────────────────┘                 └───────────────────────────┘    └─────────────────┘   │
│                 │                                             │                         │              │
│                 └──────────────────────┬──────────────────────┴─────────────────────────┘              │
│                                        ▼                                                               │
│                         ┌─────────────────────────────┐                                                │
│                         │    MISTAKE VAULT ENGINE     │                                                │
│                         │  (Cognitive Error Taxonomy, │                                                │
│                         │   Longitudinal Intelligence,│                                                │
│                         │   Relapse Drills & Mastery) │                                                │
│                         └─────────────────────────────┘                                                │
│                                        │                                                               │
│                                        ▼                                                               │
│                         ┌─────────────────────────────┐                                                │
│                         │    CANDIDATE EXPERIENCE     │                                                │
│                         │  (Candidate Hub, Realtime   │                                                │
│                         │   Parity Reader, Drills,    │                                                │
│                         │   National Leaderboards)    │                                                │
│                         └─────────────────────────────┘                                                │
│                                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Philosophy & Non-Negotiable Invariants

1. **Strict Authority Hierarchy**:
   $$\text{ACADEMIC CURRICULUM AUTHORITY} > \text{HUMAN ACADEMIC REVIEW} > \text{AI AUTHORING} > \text{AI-GENERATED CONTENT}$$
   External AI is an authoring assistant and research agent; it possesses zero publication authority. No content can be published without passing automated security gates and human academic review.

2. **Control Plane vs. Content Engine Separation**:
   - `Exams & Onboarding` (`/admin/exams/onboarding`) is the **Control Plane** that registers exams, cycles, and evaluates readiness. It never authors knowledge documents or duplicates curriculum entities.
   - `Exam Knowledge Studio` (`/admin/exams/knowledge`) is the **Authoring & Publishing Engine** that owns the 24 detailed knowledge modules, research prompt generator, 5-gate validation pipeline, version snapshots, compilation, and candidate delivery.

3. **Context $\neq$ Truth (Research-First AI Mandate)**:
   Supplied context provides structural boundaries, taxonomy constraints, and known database parameters. Material factual claims must be independently investigated and cross-checked against Tier 1 primary official sources using the mandatory workflow:
   $$\text{RESEARCH} \rightarrow \text{VERIFY} \rightarrow \text{RESOLVE} \rightarrow \text{AUTHOR} \rightarrow \text{STRUCTURE} \rightarrow \text{SELF-CHECK}$$

4. **Immutable Snapshot Versioning**:
   - Published document versions are permanently immutable.
   - Corrections, revisions, or corrigenda create new draft versions (`v(N+1)`) or operate within review correction loops (`IN_REVIEW \rightarrow \text{REQUEST CHANGES} \rightarrow \text{DRAFT}`).
   - Candidate read models serve strictly the version referenced by `current_published_version_id`.

5. **Deterministic Candidate Parity**:
   The admin preview in Review Workbench and the public candidate view consume the **exact same compiled MDX artifact** through the single canonical renderer (`ExamMdxArticleRenderer` at `components/exams/exam-mdx-article-renderer.tsx`), guaranteeing 100% rendering parity.

6. **Zero Database Migrations for Presentation/Operational Layers**:
   Presentation states (such as `SUPERSEDED`) and diff calculations are computed dynamically in application memory. The database schema remains stable ($\Delta = 0$).

---

## 3. Technology Stack & Runtime Environment

| Layer | Technology | Purpose & Rationale |
| :--- | :--- | :--- |
| **Framework** | Next.js 15.5.23 (App Router) | Server Components, Server Actions, streaming, standalone production build |
| **Language** | TypeScript 5.8 | End-to-end type safety across domain models, schemas, and actions |
| **Database** | PostgreSQL 15+ via Supabase | Relational integrity, Row Level Security (RLS), JSONB storage, crypto hashing |
| **Styling** | Tailwind CSS v4 | Utility-first responsive design, dark/light theme support, custom typography |
| **UI Components** | Radix UI + Lucide Icons | Accessible, headless primitives (dialogs, tooltips, select, accordion, tabs) |
| **Content Engine** | Custom MDX / AST Parser | Safe markdown-to-AST parsing, GFM tables, interactive callouts, zero XSS leakage |
| **Security** | `MdxSecurityScanner` | Static analysis blocking script tags, raw HTML event handlers, and iframe injections |
| **Auth & RBAC** | Supabase Auth + AdminService | Secure session handling, role-based access control (Admin, Staff, Candidate) |

---

## 4. Subsystem Topology & Directory Structure

```
e:/Courage Library/
├── actions/                  # Server Actions (Mutations, auth guards, RBAC enforcement)
│   ├── admin-exam-knowledge.actions.ts
│   ├── exam-knowledge-prompt.actions.ts
│   ├── exam-knowledge-import.actions.ts
│   └── exam-onboarding.actions.ts
├── app/                      # Next.js App Router (Pages, layouts, API routes)
│   ├── (candidate)/          # Candidate-facing routes (/exams, /practice, /mistakes, /mock-tests)
│   ├── admin/                # Admin portal routes (/admin/exams, /admin/content-studio, /admin/curriculum)
│   └── api/                  # API endpoints (health, assessment, webhooks)
├── components/               # React Components
│   ├── admin/exam-knowledge/ # Exam Knowledge Studio UI, Review Workbench, Diff Workbench
│   ├── admin/onboarding/     # Onboarding Wizard, 14-Dimension Readiness Panel
│   ├── candidate/            # Candidate Hub, Exam Reader View, Mistake Cards
│   └── ui/                   # Reusable UI primitives (Badge, Button, Dialog, Card)
├── docs/                     # Authoritative Documentation Ecosystem
│   ├── architecture/         # System & subsystem architectural specifications
│   ├── product/              # Product specs, feature maps, candidate learning loop
│   ├── ai/                   # Master prompt specifications, AI safety boundaries
│   ├── database/             # Data models, schema contracts, immutability rules
│   ├── security/             # Threat model, RBAC, RLS policies, sanitization
│   ├── testing/              # Testing strategy, regression matrix, certification
│   ├── operations/           # Operational runbooks (onboarding, authoring, revisions)
│   └── audits/               # Historical phase forensic audit reports
├── lib/                      # Core libraries & utilities
│   ├── supabase/             # Supabase client factories (client, server, admin)
│   └── utils.ts              # Common helper functions
├── services/                 # Domain Services (Business logic, pure engines)
│   ├── exam-knowledge/       # Context builder, Prompt builder, Validator, Diff engine, Candidate read service
│   ├── exam-onboarding/      # Onboarding workflow service, 14-dimension readiness evaluator
│   ├── mistake-vault/        # Error taxonomy engine, longitudinal intelligence service
│   └── assessment/           # CAT adaptive testing engine, scoring engine, psychometrics
└── types/                    # Domain Data Contracts & TypeScript Definitions
    ├── exam-knowledge.ts     # Document specs, 5-gate validation types, diff contracts
    ├── exam-onboarding.ts    # Readiness evaluation types, onboarding wizard steps
    └── database.ts           # Database relational entity interfaces
```

---

## 5. End-to-End Information Flow

```
1. EXAM REGISTRATION (Exams & Onboarding Control Plane)
   Admin inputs Exam Title, Authority, Recruitment Cycle
   ↓
2. READINESS EVALUATION (14 Dimensions)
   System validates Identity, Dates, Posts, Syllabus mappings
   ↓
3. KNOWLEDGE AUTHORING (Exam Knowledge Studio)
   Admin selects Exam + Module → Courage builds Authoritative Context (SHA-256 Hash)
   ↓
4. MASTER PROMPT GENERATION (12-Pillar Research Mandate)
   Admin copies prompt to External AI (ChatGPT / Claude / Gemini / Perplexity)
   ↓
5. EXTERNAL AI RESEARCH & AUTHORING
   AI researches Tier 1 primary sources, resolves conflicts, formats JSON spec
   ↓
6. SANITIZATION & 5-GATE INGESTION VALIDATION (Five-Gate Validator)
   Sanitizes provider citation artifacts → Gate 1: Schema | Gate 2: Target/Hash | Gate 3: Security & Artifacts | Gate 4: Provenance | Gate 5: Domain
   ↓
7. HUMAN ACADEMIC REVIEW (Review Workbench)
   Academic Staff inspects AST, verifies official sources, checks diffs, requests changes or approves
   ↓
8. MDX COMPILATION & IMMUTABLE PUBLICATION
   Approved version compiled into verified MDX artifact (with re-sanitization) → Published atomically
   ↓
9. CANDIDATE HUB DELIVERY (Candidate Read Model)
   Candidates access live exam module with candidate-parity rendering, syllabus trees, and mocks
```

---

## 6. Key System Metrics & Scalability Profile

- **Supported Exam Domains**: Central Government (SSC, UPSC, Railways, Banking, Defence), State PSCs, Teaching.
- **Knowledge Modules per Exam**: 24 standardized canonical modules.
- **Validation Gates**: 5 independent automated ingestion gates.
- **Prompt Token Efficiency**: Context bounded to $\le 32,000$ characters; payload size bounded to $\le 64,000$ characters.
- **Test Suite Coverage**: 433+ automated runtime assertions across lifecycle, security, diffing, and candidate delivery.
- **Build Performance**: 100% clean Next.js standalone build with zero static generation errors.
