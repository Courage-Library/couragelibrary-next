# General Topics catch-alls: remap proposal (CA-7, owner item 2)

**Status: PROPOSAL. Nothing below has been executed.** The four nodes are marked INTERNAL (migration 122 flag, audited `TAXONOMY_NODE_INTERNAL`, 2026-10-28). They stay usable for question mapping. They are excluded from:

- the lesson generator;
- courses;
- the coverage matrix;
- `/learn` and exam-topic pages;
- the sitemap and JSON-LD.

## What points at them (read-only count, 2026-10-28)

Every foreign key into `canonical_taxonomy_nodes` was checked, single-column and composite.

| Node | Questions | Syllabus mappings | Other references |
|---|---|---|---|
| English Comprehension General Topics | 0 | 2: SSC CGL (published), SSC GD (draft) | 0 (its own `legacy_topic_id`) |
| General Awareness General Topics | 0 | 2: SSC CGL (published), SSC GD (draft) | 0 |
| General Intelligence and Reasoning General Topics | 0 | 2: SSC CGL (published), SSC GD (draft) | 0 |
| Quantitative Aptitude General Topics | 0 | 1: SSC CGL (published) | 0 |

No question, lesson, alias, current-affairs mapping, progress row or intake item points at them. Only the syllabus "general" lines do.

## Proposed remap, after the syllabus intake

1. **Re-import each exam's syllabus** through `/admin/syllabus/intake` (SYLLABUS-PROMPT-2, contract v3). The intake lists the real topics that the "General …" line stands for. The review screen maps them to existing nodes, or proposes new nodes through the normal approve flow.
2. **SSC CGL (published syllabus).** Publish the new version, mapped to the real topics. Published versions are immutable, so this is a new version, not an edit. The old version is archived with the new publish, and its catch-all mappings go with it.
3. **SSC GD (draft).** Remap the draft's two "general" units in the review screen before publishing, or replace the draft with the new intake.
4. **Questions.** None to move today. Any question that is mapped to a catch-all later stays valid, because INTERNAL keeps question mapping.
5. **Finish.** Once no published syllabus maps a catch-all, deactivate it (`Deactivate` in the drawer). Do not merge it: a merge would turn its name into an alias of a real topic, which is wrong for a catch-all.

## Owner decisions needed

- Run the intake per exam first (recommended), or remap the units by hand in the syllabus editor?
- Keep the catch-alls INTERNAL indefinitely (cheap, harmless), or deactivate them once the published syllabi no longer map them? Recommended: deactivate.
