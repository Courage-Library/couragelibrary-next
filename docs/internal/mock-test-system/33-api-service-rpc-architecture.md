# 33 — API, SERVICE & POSTGRESQL RPC ARCHITECTURE

> **DOCUMENTATION CLASSIFICATION:** Service Layer & RPC Contract Specification  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Application Service & RPC Topology  

---

## 1. What is it?
The **API, Service & PostgreSQL RPC Architecture** defines the clean separation of responsibilities between client UI components, Next.js Server Actions, stateless TypeScript domain services, and database-level `SECURITY DEFINER` stored procedures.

## 2. Layered Call Stack Architecture

```
[ LAYER 1: CLIENT REACT COMPONENTS ]
ExamPlayerClient, LiveTestPlayerClient, ResultViewClient
       │
       │ Next.js Server Action Invocation
       ▼
[ LAYER 2: SERVER ACTIONS (app/actions/) ]
* `daily-mock-actions.ts`: Validates session, extracts IST date, dispatches to AssessmentService.
* `live-test-actions.ts`: Validates registration ticket, dispatches to LiveTestRunnerService.
* `premium-actions.ts`: Validates quota, dispatches to PremiumGeneratorService.
       │
       │ Domain Service Invocation
       ▼
[ LAYER 3: DOMAIN SERVICES (services/) ]
* `AssessmentService`: Test assembly, classical statistics, local scoring calculations.
* `PsychometricsService`: Rasch calibration, point-biserial, Cronbach Alpha, Test SEM.
* `LiveTestRunnerService`: Live countdowns, real-time answer sync batches.
       │
       │ Supabase Client / RPC Invocation
       ▼
[ LAYER 4: POSTGRESQL SECURITY DEFINER RPCs (supabase/migrations/) ]
* `fn_start_daily_mock_attempt`: Atomic single-attempt verification & creation.
* `fn_consume_premium_quota_atomic`: Row-locked transactional quota decrement.
* `fn_submit_test_attempt`: Atomic submission lock and authoritative scoring execution.
* `fn_calculate_live_competition_rankings`: Standard competition merit ranking snapshot.
```

---

## 3. Why Critical Invariants Live in PostgreSQL RPCs
React Server Actions run on stateless serverless compute instances. If critical business invariants (such as seat reservation limits or quota decrements) were checked in TypeScript before writing to the database:
- 10 concurrent requests could all read `quota = 1`, all pass the check in TypeScript, and all write attempts—resulting in quota overselling.
- **Placing the invariant inside PostgreSQL RPCs with `FOR UPDATE` row locks guarantees ACID atomicity.**

---

## 4. What Must Never Happen
- A Server Action must **never** execute raw unparameterized SQL strings.
- Frontend components must **never** import `createAdminServerSupabaseClient` (reserved strictly for protected server contexts).
