# Courage Library 📚🏛️

> **Next-Generation Competitive Examination Learning, Assessment, and Knowledge Platform.**

Courage Library is an enterprise-grade digital education and assessment ecosystem built for serious aspirants targeting national and state-level competitive examinations (Civil Services, SSC, Banking, Railways, Engineering, and Management).

The platform bridges official government notifications, canonical academic curricula, adaptive computer-based testing, and cognitive mistake remediation into a unified, high-performance experience.

---

## 🚀 Core Platform Subsystems

```
                                  [ COURAGE LIBRARY PLATFORM ]
                                               │
    ┌──────────────────────┬───────────────────┼───────────────────┬──────────────────────┐
    ▼                      ▼                   ▼                   ▼                      ▼
[ Exams & Control ]  [ Exam Knowledge ]  [ Learning & Courses ]  [ Question Bank & Mock ] [ Mistake Vault ]
• Canonical Registry • 24 Research Mods  • Canonical Taxonomy    • Adaptive CAT Engine   • 7 Error Types
• Cycles & Tiers     • 5-Gate Validator  • Exam Projections      • Time Authority        • Mastery State
• 14-Dim Readiness   • AST Compiler      • MDX Lesson Engine     • Psychometrics (IRT)   • Spaced Review
```

1. **Exams & Onboarding (Control Plane)**: Canonical conducting authorities, multi-year exam cycles, tier/stage blueprints, syllabus section mapping, and the 14-Dimension Readiness Evaluator.
2. **Exam Knowledge Engine (Content Engine)**: 24 modular knowledge documents per exam, Research-First External AI authoring pipeline (`CL-EXAM-AUTHOR-v1.0`), automated 5-Gate validation, snapshot versioning, visual diff workbench, and candidate parity rendering.
3. **Learning & Courses Engine**: Canonical academic taxonomy (`SUBJECT` $\rightarrow$ `TOPIC` $\rightarrow$ `SUBTOPIC` $\rightarrow$ `UNIT`), exam-specific syllabus projections, rich interactive MDX lesson articles, and cross-exam curriculum reuse.
4. **Question Bank & Mock Engine**: Cognitive item categorization, server-authoritative sectional timer, auto-submission safety, and Item Response Theory (IRT) analytics.
5. **Mistake Vault Subsystem**: 7-category cognitive error classification (`CONCEPTUAL_GAP`, `CALCULATION_SLIP`, `MISREAD_QUESTION`, `TIME_PANIC`, `FORMULA_CONFUSION`, `DISTRACTOR_TRAP`, `UNCLASSIFIED`), relapse detection, and automated spaced-repetition mastery progression.

---

## 🛠️ Technology Stack

| Domain | Technologies |
| :--- | :--- |
| **Framework & Core** | [Next.js 14+ (App Router)](https://nextjs.org), [React 18/19](https://react.dev), [TypeScript 5+](https://www.typescriptlang.org) (Strict Mode) |
| **Styling & Design System** | [Tailwind CSS 3.4+](https://tailwindcss.com), [Lucide React](https://lucide.dev), [Framer Motion](https://www.framer.com/motion) |
| **Database & Auth** | [PostgreSQL 15+](https://www.postgresql.org), [Supabase](https://supabase.com) (Auth, PostgREST, RLS, Storage) |
| **Markdown & AST Compiler** | Unified, Remark, Rehype, Rehype-Sanitize, KaTeX (Math), Custom MDX Component Registry |
| **State & Data Fetching** | Server Actions, React Server Components (RSC), TanStack Query / SWR |
| **Testing & Quality** | Standalone Node/TS Test Harnesses (433+ Runtime Assertions), Playwright, Vitest |

---

## 📂 Repository Directory Topology

```text
├── docs/                     # Authoritative Documentation Knowledge Base
│   ├── architecture/         # 9 Core Subsystem Architecture Specifications
│   ├── product/              # 5 Product Vision & Functional Specifications
│   ├── ai/                   # 4 AI Authoring Contracts & Prompt Specifications
│   ├── database/             # 3 Database Schemas & Data Model Specifications
│   ├── security/             # 4 Security, RBAC & Data Isolation Specifications
│   ├── testing/              # 3 Testing Strategy & Regression Matrices
│   ├── operations/           # 4 Operational Standard Operating Procedures
│   └── internal/             # Historical 48-chapter mock & 44-chapter mistake vault refs
│
├── src/
│   ├── app/                  # Next.js App Router (Candidate Hub, Staff Studio, Admin)
│   │   ├── (auth)/           # Authentication flows (Login, Register, Callback)
│   │   ├── (candidate)/      # Candidate Portal (Exams, Learning, Mocks, Mistake Vault)
│   │   ├── (staff)/          # Staff Authoring Workbench & Exam Knowledge Studio
│   │   ├── admin/            # Platform Administration & Authority Management
│   │   └── api/              # Secure Edge & Webhook Route Handlers
│   │
│   ├── components/           # Reusable UI & Domain Components
│   │   ├── mdx/              # Safe MDX Components (Callouts, StatCards, Timelines)
│   │   ├── ui/               # Core Design System (Buttons, Inputs, Modals, Badges)
│   │   └── ...               # Subsystem-specific components
│   │
│   └── lib/                  # Business Logic, Database Clients & Utilities
│       ├── auth/             # Session & RBAC Guard Utilities
│       ├── services/         # Domain Services (ExamKnowledge, Mocks, Mistakes)
│       ├── supabase/         # Supabase Server & Client Connectors
│       └── validators/       # Zod Schemas & 5-Gate Validation Logic
│
├── scripts/                  # Standalone Runtime Test Harnesses (433+ Assertions)
├── public/                   # Static Assets, Logos, and Global Icons
└── package.json              # Project Dependencies & Build Scripts
```

---

## ⚡ Quick Start & Development Setup

### 1. Prerequisites
- **Node.js**: `v20.x` or higher
- **Package Manager**: `npm`
- **Database**: Active Supabase instance with PostgreSQL 15+

### 2. Environment Configuration
Create a `.env.local` file in the root directory:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 3. Installation & Run
```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Open http://localhost:3000 in your browser
```

---

## 🧪 Testing & Quality Certification

Courage Library maintains **433+ Runtime Assertions** across its standalone test harnesses:

```bash
# Run the 5-Gate Schema Validation Suite
node scripts/test_phase3h1_exam_knowledge_schema.cjs

# Run the AI Prompt Generator Suite
node scripts/test_phase3h2_exam_prompt_generator.cjs

# Run the Exam Knowledge Importer Suite
node scripts/test_phase3h3_exam_knowledge_importer.cjs

# Run the Production Boundary & Baseline Safety Verification
node scripts/verify_phase3j1_production_boundaries.cjs

# Run Candidate Hub Parity Certification
node scripts/test_phase3h5_3_candidate_hub_certification.cjs

# Execute full production typecheck and build
npm run build
```

---

## 📖 Authoritative Documentation

For complete technical specifications, architectural diagrams, data models, and operational runbooks, consult the **[`docs/`](docs/README.md)** directory:

- 🏛️ **[System Architecture](docs/architecture/courage-library-system-architecture.md)**
- 📝 **[Exam Knowledge System](docs/architecture/exam-knowledge-system.md)**
- 🤖 **[AI Authoring Contracts](docs/ai/ai-authoring-system.md)**
- 🗄️ **[Database Architecture](docs/database/database-architecture.md)**
- 🛡️ **[Security Architecture](docs/security/security-architecture.md)**
- 🧪 **[Regression Test Matrix](docs/testing/regression-matrix.md)**
- 📋 **[Exam Onboarding Runbook](docs/operations/exam-onboarding-runbook.md)**

---

## 📄 License & Intellectual Property

Copyright © 2026 Courage Library. All rights reserved.
Proprietary software for authorized educational use.
