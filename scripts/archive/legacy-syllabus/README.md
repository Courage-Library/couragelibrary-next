# Archived: phase-3R syllabus reconciliation suites (TEST-LEGACY-SYLLABUS)

These suites tested the phase-3R syllabus import / reconciliation workbench (`/admin/syllabus-reconciliation`, its
API routes and services). GAP2-4c retired that workbench and moved its tables (`taxonomy_aliases`) and the legacy
syllabus tables (`exam_syllabi`, `exam_topics`, `exam_unit_mappings`) to schema `retired` (migration 084).

- **Never run them.** They import deleted modules and write to tables that no longer exist in `public`. They are kept
  only as history and are excluded from every gate (`docs/testing/PERMANENT_GATES.md`).
- **Their replacements:** `scripts/test_gap2_4a_syllabus.cjs` (canonical syllabus schema, RPCs, read model),
  `scripts/test_gap2_4b_editor.cjs` (editor, including "Suggest topics") and `scripts/test_gap2_4b_readers.cjs`
  (readers, retired tables).
- **Report:** `docs/reports/gap2/GAP2_4C_REPORT.md`.
