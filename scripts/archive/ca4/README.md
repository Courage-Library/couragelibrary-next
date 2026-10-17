# Archived: CA-4 forensic suite (QB-KEY-1)

`test_ca4_forensic_suite.cjs` tested the phase CA-4 question-bank / daily-quiz integration.

- **Never run it.** It refuses to start (an exit guard at the top of the file), and it is excluded from every gate.
  - It connects to Postgres with **TLS verification disabled**: the HOTFIX-2 inventory, backlog TEST-CA.
  - It **inserts test questions straight into the live canonical tables** (`questions`, `question_versions`, `question_options`, `question_answers`) as published.
- **What it left behind:** its 2026-10-01 run left 8 PUBLISHED fixture questions (`SameDay-Q1…Q7`, plus the keyless `SameWeek-Q1`). QB-KEY-1 retired them (audited archive, migration 088) and added the publish guard (migration 087).
- **Rule (QB-KEY-1):** test data never goes into canonical content tables. Tests that need content use rolled-back transactions or the QA test exam.
- **Reports:** `docs/reports/qb/QB_KEY1_STAGE1_REPORT.md`, `docs/reports/qb/QB_KEY1_STAGE2_REPORT.md`.
