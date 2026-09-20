# Courage Library — Learning / Courses Subsystem
## Phase 3A: Academic Taxonomy & Exam Syllabus Foundation — Technical Specification & Implementation Book

---

### Executive Summary
Phase 3A establishes the authoritative, canonical database and domain service foundation for the **Courage Library Learning / Courses Subsystem**. 

It decouples **pure academic knowledge** (subjects, topics, subtopics, discrete learning units, and knowledge graph relationships) from **exam-specific syllabus projections** (exam syllabi, topic importance, required depth, and unit sequencing). This enables 100% reusability of canonical knowledge across multiple competitive government exams (e.g., SSC CGL, UPSC CSAT, State PSC, Defence) without content duplication.

---

### Architectural Invariants & Boundary Rules

1. **Zero Content Bodies in Relational Database**:
   - The relational database schema stores only structural identity and metadata (IDs, titles, slugs, unit types, estimated minutes, display orders, status).
   - Absolutely zero `content_body TEXT`, Markdown, MDX, or HTML is stored in PostgreSQL tables.
2. **Immutable Reusability of Canonical Knowledge**:
   - Canonical subjects, topics, subtopics, and learning units exist independently of any specific examination.
   - Relationships (prerequisites, related topics, advanced applications) form a canonical knowledge graph across topics.
3. **Exam Syllabus as a Projection**:
   - An examination defines its syllabus by mapping canonical subjects and topics with exam-specific attributes: `importance_tier` (CORE, VERY_HIGH, HIGH, MEDIUM, LOW, OPTIONAL), `required_depth` (FOUNDATIONAL_ONLY, INTERMEDIATE_APPLICATION, ADVANCED_COMPETITIVE), and `is_mandatory`.
   - Learning units can be custom-sequenced per exam via `exam_unit_mappings`.
4. **Preservation of Core Systems**:
   - Question Bank remains authoritative for questions and PYQs.
   - Mistake Vault remains authoritative for candidate error remediation.
   - Mock/Practice engines remain authoritative for assessment execution.
   - 100% preservation of all 14 protected baseline database tables (350 mock questions, 103 question versions, 31 test attempts, etc.).

---

### Database Schema Architecture (Migration 53)

#### 1. Additive Enhancements to `exam_topics`
```sql
ALTER TABLE public.exam_topics 
ADD COLUMN required_depth TEXT NOT NULL DEFAULT 'INTERMEDIATE_APPLICATION';

ALTER TABLE public.exam_topics 
ADD COLUMN is_mandatory BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.exam_topics 
ADD COLUMN weightage_override NUMERIC;
```

#### 2. `topic_relationships` (Canonical Knowledge Graph)
```sql
CREATE TABLE public.topic_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    to_topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL CHECK (
        relationship_type IN ('PREREQUISITE', 'RELATED', 'ADVANCED_APPLICATION', 'COREQUISITE')
    ),
    strength TEXT NOT NULL DEFAULT 'STRONG' CHECK (
        strength IN ('CRITICAL', 'STRONG', 'RECOMMENDED', 'OPTIONAL')
    ),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_no_self_relationship CHECK (from_topic_id != to_topic_id),
    CONSTRAINT uq_topic_relationship UNIQUE (from_topic_id, to_topic_id, relationship_type)
);
```

#### 3. `learning_units` (Discrete Unit Identity & Metadata)
```sql
CREATE TABLE public.learning_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    subtopic_id UUID REFERENCES public.subtopics(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    unit_type TEXT NOT NULL CHECK (
        unit_type IN (
            'CONCEPT_LESSON',
            'WORKED_EXAMPLES',
            'FORMULA_SHORTCUT_SHEET',
            'COMMON_TRAPS_AND_MISTAKES',
            'PYQ_DEEP_DIVE',
            'TOPIC_SUMMARY_REVISION'
        )
    ),
    estimated_minutes INTEGER NOT NULL DEFAULT 10 CHECK (estimated_minutes > 0),
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_learning_unit_topic_slug UNIQUE (topic_id, slug)
);
```

#### 4. `exam_unit_mappings` (Exam-Specific Sequence & Core Flag)
```sql
CREATE TABLE public.exam_unit_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_topic_id UUID NOT NULL REFERENCES public.exam_topics(id) ON DELETE CASCADE,
    learning_unit_id UUID NOT NULL REFERENCES public.learning_units(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL DEFAULT 0,
    is_exam_core BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_exam_unit_mapping UNIQUE (exam_topic_id, learning_unit_id)
);
```

---

### Domain Types & TypeScript Services

#### 1. Domain Types (`types/learning-taxonomy.ts`)
- `CanonicalSubject`: ID, name, slug, code, display_order, is_active, created_at
- `CanonicalTopic`: ID, subject_id, name, slug, default_importance, display_order, is_active
- `CanonicalSubtopic`: ID, topic_id, name, slug, display_order, is_active
- `TopicRelationship`: ID, from_topic_id, to_topic_id, relationship_type, strength, notes
- `LearningUnit`: ID, topic_id, subtopic_id, title, slug, unit_type (6 canonical types), estimated_minutes, display_order
- `ExamSyllabusSubject`: ID, exam_id, subject_id, weightage_pct, expected_questions_count
- `ExamTopicMapping`: ID, exam_id, subject_id, topic_id, importance_tier, required_depth, is_mandatory
- `ExamUnitMapping`: ID, exam_topic_id, learning_unit_id, sequence_order, is_exam_core

#### 2. Academic Taxonomy Service (`services/academic-taxonomy.service.ts`)
- `getCanonicalSubjects(supabaseClient)`: Retrieves all active subjects ordered by display_order.
- `getCanonicalSubjectBySlug(slug, supabaseClient)`: Finds a subject by slug.
- `getSubjectTopics(subjectId, supabaseClient)`: Retrieves all topics under a subject.
- `getTopicSubtopics(topicId, supabaseClient)`: Retrieves subtopics for a topic.
- `getLearningUnitsForTopic(topicId, subtopicId, supabaseClient)`: Retrieves discrete learning units for a topic/subtopic.
- `getTopicRelationships(topicId, supabaseClient)`: Resolves prerequisites, related topics, and advanced applications.
- `getTopicHierarchy(topicId, supabaseClient)`: Assembles full academic topic tree with subtopics, units, and graph relationships.
- `validateAcademicHierarchy(subject, topic, unit)`: Validates model integrity and enforces zero-content-body invariant.
- `detectRelationshipCycles(relationships)`: Pure deterministic DFS cycle detection algorithm for prerequisite directed graphs.

#### 3. Exam Syllabus Service (`services/exam-syllabus.service.ts`)
- `getExamSyllabus(examId, supabaseClient)`: Assembles multi-subject syllabus tree for an exam.
- `getExamTopics(examId, subjectId, supabaseClient)`: Retrieves mapped exam topics with importance tier and required depth.
- `getExamTopicLearningUnits(examTopicId, supabaseClient)`: Retrieves exam-specific learning unit sequence.
- `calculateSyllabusCoverage(overview)`: Computes total topics, core vs. optional learning units, and estimated preparation hours.
- `compareExamSyllabi(syllabusA, syllabusB)`: Compares syllabus requirements between two examinations (identifies shared topics, unique topics, depth variances, and importance variances).

---

### Verification Matrix (60 Assertions)

| Track | Description | Assertions | Result |
|---|---|---|---|
| Track 1 | Migration 53 SQL Schema, Tables, Constraints, Indices & RLS | T01 – T12 | **PASS (100%)** |
| Track 2 | Canonical Academic Taxonomy Hierarchy & Zero Content Body | T13 – T22 | **PASS (100%)** |
| Track 3 | Knowledge Graph Relationships & Prerequisite Cycle Detection | T23 – T32 | **PASS (100%)** |
| Track 4 | Exam Syllabus Mapping, Multi-Exam Reuse & Comparator | T33 – T45 | **PASS (100%)** |
| Track 5 | Frozen Baseline Invariants & 14 Protected Tables Row Counts | T46 – T60 | **PASS (100%)** |

---

### Phase 3A Completion Status
- **Status**: **CERTIFIED & FROZEN**
- **Migration**: `supabase/migrations/20260915000053_phase3a_learning_taxonomy_foundation.sql`
- **Services**: `services/academic-taxonomy.service.ts`, `services/exam-syllabus.service.ts`
- **Types**: `types/learning-taxonomy.ts`
- **Test Suite**: `scripts/test_phase3a_academic_taxonomy.cjs`
