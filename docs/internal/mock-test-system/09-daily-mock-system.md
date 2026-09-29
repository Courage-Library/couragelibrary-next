# 09 — DAILY MOCK SYSTEM & RECURRING CALENDAR MATRIX

> **DOCUMENTATION CLASSIFICATION:** Product Specification & Calendar Resolution Engine  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Free Tier Assessment Pipeline  

---

## 1. What is it?
The **Daily Mock System** provides free, habit-forming daily mock tests to all Courage Library aspirants across India. It operates on an automated weekly recurring calendar matrix with strict Indian Standard Time (IST: UTC+5:30) date resolution and single-attempt occurrence locks.

## 2. Why does it exist?
Aspirants require daily discipline to build examination stamina and time management. 
- Traditional platforms publish static daily tests that require manual daily admin assembly.
- Courage Library uses a **deterministic weekly recurring schedule**: 7 standardized blueprints mapped to Monday through Sunday, dynamically resolving the correct test for today's IST calendar date.
- Crucially, it enforces the **One-Attempt-Per-Occurrence Invariant**: a candidate can take today's scheduled occurrence exactly once, but the platform can reuse the underlying curated test definitions across recurring calendar cycles without database schema explosion.

---

## 3. Weekly Recurring Calendar Schedule

```
+-----------------------------------------------------------------------------------------------+
| DAY OF WEEK | TEST MODALITY      | SUBJECT FOCUS                      | DURATION & MARKS     |
+-------------+--------------------+------------------------------------+----------------------+
| MONDAY      | Sectional Drill    | General Intelligence & Reasoning   | 25 Qs | 15 Mins | 50M|
| TUESDAY     | Sectional Drill    | Quantitative Aptitude (Math)       | 25 Qs | 20 Mins | 50M|
| WEDNESDAY   | Sectional Drill    | English Comprehension              | 25 Qs | 15 Mins | 50M|
| THURSDAY    | Sectional Drill    | General Awareness & Current Affairs| 25 Qs | 10 Mins | 50M|
| FRIDAY      | Mixed Module       | Math + Reasoning Speed Drill       | 50 Qs | 30 Mins |100M|
| SATURDAY    | Mixed Module       | English + GA Core Knowledge Drill  | 50 Qs | 25 Mins |100M|
| SUNDAY      | Full-Length Mock   | All 4 Sections Combined            | 100 Qs| 60 Mins |200M|
+-----------------------------------------------------------------------------------------------+
```

---

## 4. Indian Standard Time (IST) Resolution Algorithm

```typescript
// IST Date Resolution (UTC + 5 hours 30 minutes)
export function getScheduledOccurrenceDateIST(date: Date = new Date()): string {
  const utcTime = date.getTime();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(utcTime + istOffsetMs);
  
  const yyyy = istDate.getUTCFullYear();
  const mm = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(istDate.getUTCDate()).padStart(2, '0');
  
  return `${yyyy}-${mm}-${dd}`; // Canonical IST Date: '2024-09-10'
}
```

---

## 5. Attempt Uniqueness & Single-Attempt Invariant

```
====================================================================================================
                        ONE CANDIDATE + ONE OCCURRENCE = ONE ATTEMPT EVER
====================================================================================================

Database Unique Constraint:
   CONSTRAINT uq_user_daily_mock_occurrence 
   UNIQUE (user_id, mock_test_id, scheduled_date_ist)

Scenario Walkthrough:
1. Candidate logs in on Tuesday, September 10, 2024.
2. System resolves today's IST date: '2024-09-10' (Tuesday -> Quantitative Aptitude Sectional).
3. Candidate clicks "Start Daily Mock".
4. Database inserts row: { user_id: 'u1', mock_test_id: 'mock_quant_02', scheduled_date_ist: '2024-09-10' }.
5. Candidate completes the test and receives score + 10 CL Coins.
6. Candidate refreshes page or clicks "Start Daily Mock" again.
7. System detects existing attempt for '2024-09-10' -> UI renders "View Result" button instead of "Start".
8. Next Tuesday (September 17, 2024), candidate can attempt 'mock_quant_02' again because `scheduled_date_ist` will be '2024-09-17'.
====================================================================================================
```

---

## 6. Daily Mock Reward Structure
- **Sectional Completion (Mon–Thu)**: +10 CL Coins
- **Mixed Module Completion (Fri–Sat)**: +15 CL Coins
- **Full-Length Mock Completion (Sun)**: +25 CL Coins
- **Accuracy Bonus**: +5 CL Coins if accuracy $\ge 90\%$.

---

## 7. What Must Never Happen
- A candidate must **never** be permitted to attempt the same scheduled daily mock occurrence twice on the same calendar day.
- System must **never** use the user's device clock to determine the active Daily Mock; all date calculations must be executed in UTC with canonical IST (+5:30) transformation.
