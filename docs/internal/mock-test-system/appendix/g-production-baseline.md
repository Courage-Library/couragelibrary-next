# Appendix G — Protected Production Baseline & Freeze Inventory

This document certifies the **14 Protected Baseline Tables** of the Courage Library Assessment System. These tables represent certified production state; any automated script or migration altering these rows without explicit authorization is strictly prohibited.

---

## 1. Protected Tables Master Inventory

| # | Table Name | Certified Baseline Row Count | Primary Purpose | Freeze & Invariant Policy |
|---|---|---|---|---|
| 1 | `mock_tests` | **8** | Concrete test instances | Immutable baseline; new tests use additive inserts. |
| 2 | `mock_sections` | **14** | Section divisions within baseline mocks | Immutable baseline mappings. |
| 3 | `mock_questions` | **350** | Question paper composition | Immutable version mappings; position sequence preserved. |
| 4 | `mock_templates` | **8** | Exam cycle blueprint templates | Certified blueprints for standard exams. |
| 5 | `test_attempts` | **31** | Historical candidate attempts | Historical execution logs; never truncated or deleted. |
| 6 | `test_results` | **10** | Evaluated scorecards | WORM (Write-Once-Read-Many) baseline. |
| 7 | `attempt_answers` | **200** | Response ledger | Monotonic response history. |
| 8 | `questions` | **103** | Question bank root containers | Root taxonomy containers. |
| 9 | `question_versions` | **103** | Immutable question content | Certified question text and KaTeX markup. |
| 10 | `question_options` | **412** | Question option choices | 4 options per question ($103 \times 4 = 412$). |
| 11 | `question_answers` | **103** | Authoritative answer keys | Certified answer keys. |
| 12 | `subscription_plans` | **1** | Pro tier plan definition | Active subscription catalog. |
| 13 | `coin_wallets` | **5** | User virtual currency wallets | Ledger anchor wallets. |
| 14 | `coin_ledger` | **8** | Gamification transactions | Immutable financial audit ledger. |

---

## 2. Baseline Audit & Verification Script

To verify that the database baseline remains 100% intact, execute the following audit query:

```sql
SELECT 
    'mock_tests' AS table_name, count(*) AS actual_count, 8 AS expected_count FROM mock_tests
UNION ALL SELECT 'mock_sections', count(*), 14 FROM mock_sections
UNION ALL SELECT 'mock_questions', count(*), 350 FROM mock_questions
UNION ALL SELECT 'mock_templates', count(*), 8 FROM mock_templates
UNION ALL SELECT 'test_attempts', count(*), 31 FROM test_attempts
UNION ALL SELECT 'test_results', count(*), 10 FROM test_results
UNION ALL SELECT 'attempt_answers', count(*), 200 FROM attempt_answers
UNION ALL SELECT 'questions', count(*), 103 FROM questions
UNION ALL SELECT 'question_versions', count(*), 103 FROM question_versions
UNION ALL SELECT 'question_options', count(*), 412 FROM question_options
UNION ALL SELECT 'question_answers', count(*), 103 FROM question_answers
UNION ALL SELECT 'subscription_plans', count(*), 1 FROM subscription_plans
UNION ALL SELECT 'coin_wallets', count(*), 5 FROM coin_wallets
UNION ALL SELECT 'coin_ledger', count(*), 8 FROM coin_ledger;
```

### Integrity Rule:
If `actual_count != expected_count` for any of the 14 baseline tables, the runtime gate fails and rejects deployment.

---

## 3. Certification Sign-Off

- **Architectural Certification Date**: September 2026
- **System Authority**: Courage Library Core Assessment Platform
- **Status**: **PRODUCTION CERTIFIED & FROZEN**
