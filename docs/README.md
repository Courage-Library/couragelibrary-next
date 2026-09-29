# Courage Library — Documentation Knowledge Base & Index

Welcome to the authoritative technical and product documentation ecosystem for **Courage Library**, a next-generation, high-concurrency competitive examination learning, assessment, and knowledge platform.

---

## 📚 Documentation Ecosystem Directory

```
docs/
├── README.md                                  ← [You are here] Documentation Map & Navigation
│
├── architecture/                              ← Core Architecture Specifications
│   ├── courage-library-system-architecture.md ← Whole-Platform Micro-Monolith Topology & Tech Stack
│   ├── exam-platform-architecture.md          ← Exam Domain Hierarchy & Multi-Exam Control Plane
│   ├── exam-knowledge-system.md               ← 24-Module Engine, 5-Gate Validator & AST Compiler
│   ├── learning-content-architecture.md       ← Canonical Curriculum Taxonomy & MDX Lesson Engine
│   ├── question-bank-architecture.md          ← Question Taxonomy, Errata Reporting & Psychometrics
│   ├── mock-engine-architecture.md            ← Assessment Engine, Time Authority & Attempt Lifecycle
│   ├── mistake-vault-architecture.md          ← 7-Category Cognitive Error Taxonomy & Mastery Engine
│   ├── ai-authoring-architecture.md           ← 12-Pillar Research-First External AI Pipeline
│   └── candidate-experience-architecture.md   ← Candidate Hub, 8-Viewport Matrix & Parity Rendering
│
├── product/                                   ← Product Strategy, Vision & Functional Specs
│   ├── platform-overview.md                   ← Product Vision, Target Exam Domains & User Personas
│   ├── feature-map.md                         ← Full Functional Matrix across 6 Subsystems
│   ├── exam-knowledge-product-spec.md         ← Functional Spec for Exam Knowledge Studio
│   ├── learning-product-spec.md               ← Functional Spec for Learning & Courses
│   └── candidate-learning-loop.md             ← 6-Stage Continuous Learning & Mastery Loop
│
├── ai/                                        ← AI Authoring Contracts & Prompt Engineering
│   ├── ai-authoring-system.md                 ← AI System Overview & Contract Versions
│   ├── exam-knowledge-master-prompt.md        ← 16-Section Master Prompt & 12 Research Pillars
│   ├── external-ai-workflow.md                ← Provider-Neutral Human-in-the-Loop Execution Guide
│   └── ai-safety-and-publication-boundary.md  ← Untrusted Input Quarantine & Publication Gates
│
├── database/                                  ← Database Architecture & Persistence
│   ├── database-architecture.md               ← PostgreSQL/Supabase Topology, Tables & RLS Policies
│   ├── exam-knowledge-data-model.md           ← Relational Schema & Claim-to-Source Grounding
│   └── versioning-and-immutability.md         ← Snapshot Versioning, Pointer Swaps & Audit Trails
│
├── security/                                  ← Security, RBAC & Protection
│   ├── security-architecture.md               ← Defense-in-Depth, Security Layers & Invariants
│   ├── authorization-model.md                 ← RBAC Matrix, Server Action Guards & Middleware
│   ├── candidate-data-isolation.md            ← Multi-Tenant Candidate Isolation & Test Integrity
│   └── content-security.md                    ← MDX Sanitization, Protocol Whitelists & XSS Prevention
│
├── testing/                                   ← Testing Strategy & Certification
│   ├── testing-strategy.md                    ← 4-Tier QA Framework & Testing Philosophy
│   ├── regression-matrix.md                   ← 433+ Runtime Assertions & Test Suite Catalog
│   └── production-certification.md            ← 6-Point Release Gate Protocol & Deployment Checklist
│
├── operations/                                ← Operational Runbooks & Standard Operating Procedures
│   ├── content-publication-lifecycle.md       ← 7-Stage Editorial Lifecycle & Governance
│   ├── exam-onboarding-runbook.md             ← Step-by-Step New Examination Onboarding SOP
│   ├── exam-knowledge-authoring-runbook.md    ← AI-Assisted Authoring & Import Runbook
│   └── revision-and-update-runbook.md         ← Corrigenda, Revisions & Diff Inspection SOP
│
└── internal/                                  ← Historical In-Depth Subsystem References
    ├── mock-test-system/                      ← In-Depth 48-Chapter Mock Engine Reference
    └── mistake-vault-system/                  ← In-Depth 44-Chapter Mistake Vault Reference
```

---

## 🎯 Quick Navigation by Role

### For Software Engineers & System Architects
1. Read the **[System Architecture](architecture/courage-library-system-architecture.md)** to understand the overall platform design and data flows.
2. Review **[Database Architecture](database/database-architecture.md)** and **[Security Architecture](security/security-architecture.md)** before designing new schema or server actions.
3. Consult the **[Regression Matrix](testing/regression-matrix.md)** and execute test suites before submitting pull requests.

### For Academic Staff, Authors & Reviewers
1. Follow the **[Exam Knowledge Authoring Runbook](operations/exam-knowledge-authoring-runbook.md)** to create new modules using external AI.
2. Read the **[16-Section Master Prompt Specification](ai/exam-knowledge-master-prompt.md)** to understand research and verification standards.
3. Consult the **[Revision Runbook](operations/revision-and-update-runbook.md)** when handling official corrigenda.

### For Product Managers & QA Leads
1. Review the **[Feature Map](product/feature-map.md)** and **[Candidate Learning Loop](product/candidate-learning-loop.md)**.
2. Check the **[Production Certification Protocol](testing/production-certification.md)** to verify release readiness.
