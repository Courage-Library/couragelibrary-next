# 03 — PRODUCT ARCHITECTURE

> **DOCUMENTATION CLASSIFICATION:** Product Hierarchy & Domain Architecture  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Core Product Taxonomy  

---

## 1. What is it?
The **Product Architecture** defines the hierarchical taxonomy through which all educational content, examination patterns, tests, attempts, and learning analytics are structured within Courage Library.

## 2. Why does it exist?
Competitive examinations in India evolve annually (e.g., SSC CGL changed from a 100-question Tier 2 pattern in 2021 to a sectional module pattern in 2022). If a platform merges the concept of an "Exam" with its "Pattern", or merges a "Question" with its "Question Text", historical attempts break whenever commissions update their syllabus.

Courage Library enforces a strict 12-layer product hierarchy that ensures complete backwards compatibility, multi-tier exam support, and atomic blueprint isolation.

---

## 3. The 12-Layer Product Taxonomy

```
[ LAYER 01: PLATFORM ROOT ]
Courage Library Assessment Platform
   │
   ▼
[ LAYER 02: EXAM CATEGORY ]
SSC Exams | Banking Exams | Railway Exams | Defence Exams | State PSC Exams
   │
   ▼
[ LAYER 03: EXAM ]
SSC CGL | SSC CHSL | IBPS PO | SBI Clerk | RRB NTPC
   │
   ▼
[ LAYER 04: EXAM CYCLE / NOTIFICATION ]
SSC CGL 2024 | SSC CGL 2025 | IBPS PO XIV 2024
   │
   ▼
[ LAYER 05: EXAM PATTERN & TIER ]
Tier 1 (CBT Composite) | Tier 2 (Sectional Modules & Mandatory Qualifying)
   │
   ▼
[ LAYER 06: SECTIONAL STRUCTURE ]
Section 1: Mathematical Abilities | Section 2: Reasoning | Section 3: English | Section 4: GA
   │
   ▼
[ LAYER 07: TOPICS & SUB-TOPICS ]
Arithmetic -> Percentages -> Successive Discounts | Geometry -> Circles -> Tangents
   │
   ▼
[ LAYER 08: MASTER QUESTION REPOSITORY ]
Master Question -> Question Versions (v1, v2) -> Options (A, B, C, D) -> Answer Keys
   │
   ▼
[ LAYER 09: MOCK TEMPLATES & BLUEPRINTS ]
Full-Length Blueprint (100 Qs) | Sectional Blueprint (25 Qs) | Topic Generator Rules
   │
   ▼
[ LAYER 10: STANDARDIZED TEST INSTANCES ]
Daily Mock Occurrence | Curated Premium Test | Generated Dynamic Test | Live Contest Paper
   │
   ▼
[ LAYER 11: CANDIDATE ATTEMPTS & AUDIT ]
Candidate Attempt -> Section Audits -> Answer Timestamps -> Staged Responses
   │
   ▼
[ LAYER 12: RESULTS & LEARNING INTELLIGENCE ]
Scorecard -> Accuracy Matrix -> Mistake Vault -> Percentile -> CL Coins -> Certificates
```

---

## 4. Why Every Layer Exists & What Fails If Layers Are Merged

### 1. Merging Exam Category and Exam
- **Failure Mode**: SSC CGL and SSC CHSL share subjects (Math, Reasoning, English, GA) but have completely different difficulty depths and candidate cohorts. Merging them destroys category-level subscription bundling and syllabus taxonomy.

### 2. Merging Exam and Exam Cycle
- **Failure Mode**: The SSC CGL 2021 cycle featured 4 tiers with descriptive pen-and-paper writing; the SSC CGL 2024 cycle features a 2-tier purely computer-based test with computer proficiency modules. Merging Exam and Exam Cycle makes it impossible to preserve historical PYQ accuracy.

### 3. Merging Exam Pattern and Section
- **Failure Mode**: Banking prelims enforce strict 20-minute sectional countdowns with no inter-section switching, whereas SSC Tier 1 allows free switching across all 4 sections within 60 minutes. Merging pattern and section causes hardcoded player engines that cannot support cross-commission exam rules.

### 4. Merging Question and Question Version
- **Failure Mode**: An answer key errata changes Question #42 from Option B to Option C. If the question record itself is mutated, 10,000 candidates who took the test 6 months ago will have their past attempt review screens corrupted. Versioning guarantees that past attempts view Version 1, while future attempts view Version 2.

### 5. Merging Mock Template and Mock Test
- **Failure Mode**: A template is an abstract blueprint recipe (e.g., "Select 5 Percentages, 5 Algebra, 5 Trigonometry"). A Mock Test is an immutable resolved instance with exact question IDs. Merging them prevents dynamic test generation where one template spawns thousands of unique candidate-tailored papers.

---

## 5. Product Modality Comparison Matrix

```
+---------------------------------------------------------------------------------------------------------+
| DIMENSION         | DAILY MOCKS        | PREMIUM CURATED    | PREMIUM DYNAMIC    | LIVE COMPETITION     |
+-------------------+--------------------+--------------------+--------------------+----------------------+
| Access Model      | 100% Free          | Subscription Pass  | Subscription Pass  | Free / Registered    |
| Generation Type   | Curated Recurring  | Curated Static     | Dynamic Generator  | Admin Curated Frozen |
| Scheduling        | Calendar Day (IST) | On-Demand Anytime  | On-Demand Anytime  | Strict Time Window   |
| Attempt Limit     | 1 per Occurrence   | Unlimited / Quota  | 1 Quota per Start  | 1 Attempt per Seat   |
| Sectional Timing  | Exam Pattern-based | Exam Pattern-based | Optional / Custom  | Synchronized Server  |
| Leaderboard       | Daily Aggregate    | Static Benchmark   | Individual Drill   | All-India Live Merit |
| Downstream Reward | 10-25 CL Coins     | 10-25 CL Coins     | 10-25 CL Coins     | Podium Coins + Certs |
+---------------------------------------------------------------------------------------------------------+
```

---

## 6. Current Implementation Status
- **Taxonomy Entities (`exams`, `mock_templates`, `mock_tests`, etc.)**: `PRODUCTION` & `FROZEN`
- **Dynamic Generator Pipelines**: `PRODUCTION` & `FROZEN`
- **TCS iON Examination Mode Switching**: `PRODUCTION` & `FROZEN`
