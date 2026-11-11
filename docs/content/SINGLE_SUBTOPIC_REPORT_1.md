# Single-subtopic topics (LESSON-PROMPT-QUALITY-1 item 8, report only)

Active topics with exactly one active subtopic: 9. The subtopic just renames the topic: 9.
Nothing was changed. The owner decides each row (merge, rename, or add the missing subtopics).

## Renames (same_name / same_words / gloss)

| Subject | Topic | Only subtopic | Kind |
|---|---|---|---|
| English Comprehension | Active Passive | Voice Transformation | gloss |
| English Comprehension | Antonyms | Opposite Word Meaning | gloss |
| English Comprehension | Cloze Test | Contextual Passage Completion | gloss |
| English Comprehension | Direct and Indirect Speech | Reported Speech Transformation | same_words |
| English Comprehension | Idioms & Phrases | Idiomatic Meaning | same_words |
| English Comprehension | Phrasal Verbs | Meaning and Usage | filler_only |
| English Comprehension | Reading Comprehension | Passage Understanding | gloss |
| English Comprehension | Spelling | Spelling Identification | same_name |
| English Comprehension | Synonyms | Similar Word Meaning | gloss |

## Other single subtopics (different name, check)

| Subject | Topic | Only subtopic | Kind |
|---|---|---|---|
## Published lessons and their public URLs (ruling 2026-11-11, report only)

No tree change. Checked 2026-11-11: the DB was read with a read-only transaction that was rolled back, and production was
checked anonymously. 5 of the 9 topics have a published lesson, and every one sits on the rename subtopic:

| Topic | Lesson URL (master) | Exam-topic URL | Exam-topic `<title>` |
|---|---|---|---|
| Antonyms | `/learn/english-comprehension/antonyms/opposite-word-meaning` | `/exams/ssc-cgl/english-comprehension/antonyms/opposite-word-meaning` | Opposite Word Meaning for SSC CGL: … |
| Synonyms | `/learn/english-comprehension/synonyms/similar-word-meaning` | `/exams/ssc-cgl/…/synonyms/similar-word-meaning` | Similar Word Meaning for SSC CGL: … |
| Cloze Test | `/learn/english-comprehension/cloze-test/contextual-passage-completion` | `/exams/ssc-cgl/…/cloze-test/contextual-passage-completion` | Contextual Passage Completion for SSC CGL: … |
| Idioms & Phrases | `/learn/english-comprehension/idioms-phrases/idiomatic-meaning` | `/exams/ssc-cgl/…/idioms-phrases/idiomatic-meaning` | Idiomatic Meaning for SSC CGL: … |
| Reading Comprehension | `/learn/english-comprehension/reading-comprehension/passage-understanding` | `/exams/ssc-cgl/…/reading-comprehension/passage-understanding` | Passage Understanding for SSC CGL: … |

No lesson yet: Active Passive, Direct and Indirect Speech, Phrasal Verbs, Spelling.

**Finding.** Each URL ends in the rename slug. The topic word is still in the path, but the last segment and the exam-topic
`<title>` / H1 use the rename ("Opposite Word Meaning for SSC CGL"), which is not what students search for ("antonyms for
SSC CGL"). The topic URL (`/learn/english-comprehension/antonyms`, `/exams/ssc-cgl/english-comprehension/antonyms`) also
returns 200 and is self-canonical, so two URLs compete for the same topic. Only the subtopic URLs are in the sitemap.

**Proposed SEO fix (needs a GO; app code only, no tree change).** It applies when a topic has exactly one active subtopic
and the classifier calls it a rename (`lib/syllabus/single-subtopic.ts`):
1. **Canonical = the topic URL.** The topic page serves that subtopic's lesson. Its `<title>` / H1 use the topic name
   ("Antonyms for SSC CGL: Rules, Examples & Practice"), and the master lesson keeps its own title.
2. **308 redirect** from the subtopic URL to the topic URL (`/learn/…` and `/exams/<exam>/…`), so existing links and
   indexed URLs keep working.
3. **Sitemap** lists the topic URL instead of the subtopic URL.
4. Gate: for each published rename lesson, the subtopic URL returns 308 to the topic URL, the topic URL is 200 and
   self-canonical, and the sitemap has no subtopic URL.
The rule is generic, so a future rename lesson (the 4 topics above) follows it without extra work.
