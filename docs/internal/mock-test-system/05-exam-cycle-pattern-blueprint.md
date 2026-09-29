# 05 — EXAM CYCLE, PATTERN & BLUEPRINT GENERATION

> **DOCUMENTATION CLASSIFICATION:** Blueprint Specification & Test Assembly Logic  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Test Construction & Pattern Synthesis  

---

## 1. What is it?
The **Exam Cycle, Pattern & Blueprint Generation Engine** translates official competitive examination syllabus requirements, question distributions, marking weights, and sectional timing models into executable blueprints (`mock_templates`) that assemble both curated static papers and dynamic on-demand practice tests.

## 2. Why does it exist?
Exam patterns in India vary across commissions:
- **SSC CGL Tier 1**: 100 questions (25 Reasoning, 25 GA, 25 Math, 25 English), 60 minutes composite, free section switching, +2 / -0.5.
- **SSC CGL Tier 2**: Section 1 Module 1 (Math: 30 Qs, +3 / -1.0) & Module 2 (Reasoning: 30 Qs, +3 / -1.0) with strict 60-minute window; Section 2 Module 1 (English: 45 Qs) & Module 2 (GA: 25 Qs) with separate 60-minute window; Section 3 (Computer Knowledge: 20 Qs, qualifying only).
- **Banking Prelims**: 100 questions (35 Math, 35 Reasoning, 30 English) with strictly locked 20 minutes per section.

A generic test structure cannot accommodate these shifting rules. The Blueprint Engine abstracts sectional sequencing, timing models, and topic weightings into declarative JSON configurations.

---

## 3. Blueprint Data Model (`mock_templates`)

```json
{
  "template_id": "cgl_tier1_standard_blueprint",
  "exam_code": "ssc_cgl",
  "tier": 1,
  "duration_mins": 60,
  "total_marks": 200.0,
  "marking_scheme": {
    "correct": 2.0,
    "incorrect": 0.5,
    "unanswered": 0.0
  },
  "sections": [
    {
      "section_id": "sec_reasoning",
      "name": "General Intelligence & Reasoning",
      "order_index": 1,
      "total_questions": 25,
      "duration_mins": null,
      "topic_distribution": {
        "analogies": 4,
        "series": 3,
        "coding_decoding": 3,
        "syllogism": 2,
        "blood_relations": 2,
        "miscellaneous": 11
      }
    },
    {
      "section_id": "sec_general_awareness",
      "name": "General Awareness",
      "order_index": 2,
      "total_questions": 25,
      "duration_mins": null,
      "topic_distribution": {
        "history": 4,
        "polity": 4,
        "geography": 3,
        "economy": 3,
        "science": 6,
        "current_affairs": 5
      }
    },
    {
      "section_id": "sec_quant",
      "name": "Quantitative Aptitude",
      "order_index": 3,
      "total_questions": 25,
      "duration_mins": null,
      "topic_distribution": {
        "arithmetic": 15,
        "algebra": 3,
        "geometry": 3,
        "trigonometry": 2,
        "data_interpretation": 2
      }
    },
    {
      "section_id": "sec_english",
      "name": "English Comprehension",
      "order_index": 4,
      "total_questions": 25,
      "duration_mins": null,
      "topic_distribution": {
        "comprehension": 5,
        "cloze_test": 5,
        "grammar_errors": 5,
        "vocabulary_syn_ant": 5,
        "idioms_phrases": 5
      }
    }
  ]
}
```

---

## 4. Dynamic Test Assembly Pipeline

```
+----------------------------------------------------------------------------------------------------+
|                               DYNAMIC TEST GENERATION PIPELINE                                     |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
[ STEP 1: CANDIDATE FILTER & ELIGIBILITY POOL ]
Query master `questions` matching requested `exam_id`, `subject_id`, and `topic_ids`.
Filter out inactive questions or items with active 'POSSIBLE_AMBIGUITY' flags.
                                                  |
                                                  v
[ STEP 2: BLUEPRINT TOPIC ALLOCATION ]
Iterate through blueprint section specifications.
Calculate required quota per topic (e.g., 5 Percentages, 3 Time & Work).
                                                  |
                                                  v
[ STEP 3: DIFFICULTY SAMPLING & RECENCY WEIGHTING ]
Sample questions according to difficulty distribution (e.g., 40% Easy, 40% Medium, 20% Hard).
Apply recency weighting to prioritize unattempted items for this specific candidate.
                                                  |
                                                  v
[ STEP 4: DUPLICATE CHECK & SEED HASHING ]
Ensure zero duplicate `question_id` entries across the entire paper.
Generate deterministic generation seed for audit tracking.
                                                  |
                                                  v
[ STEP 5: IMMUTABLE MOCK TEST INSTANCE PERSISTENCE ]
Write row to `mock_tests` (with `is_curated = false`).
Write rows to `mock_sections`.
Write rows to `mock_questions` linking latest active `question_version_id`s.
                                                  |
                                                  v
[ STEP 6: RETURN RESOLVED TEST INSTANCE ]
Return `mock_test_id` ready for candidate attempt creation.
```

---

## 5. What Must Never Happen
- A generated test must **never** contain the same question twice in different sections.
- Blueprint generation must **never** consume user quota during step 5; quota deduction occurs strictly when the attempt is created and started.
- A test instance must **never** link to `question_id` directly without referencing a specific immutable `question_version_id`.
