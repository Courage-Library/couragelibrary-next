# 29 — ADMIN CONTROL PLANE & HUMAN GOVERNANCE

> **DOCUMENTATION CLASSIFICATION:** Administrative Operations & Governance Cockpit  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Administrative Control Plane  

---

## 1. What is it?
The **Admin Control Plane** is the administrative cockpit and governance layer that empowers subject matter experts, exam directors, and platform operations staff to manage test lifecycles, review psychometric quality flags, audit live competitions, resolve candidate errata disputes, and issue cryptographic certifications.

## 2. Admin Operational Cockpit Modules

```
+----------------------------------------------------------------------------------------------------+
|                               ADMIN CONTROL PLANE MODULE MATRIX                                    |
+----------------------------------------------------------------------------------------------------+

[ 1. LIVE EVENT CONTROLLER ]
* Create & Schedule All-India Contests -> Set Seat Limits -> Freeze Paper.
* Live Monitoring: Active Seats, Real-time Ingestion Rate, Network Health.
* Actions: [Grant Emergency Time Extension] [Trigger Evaluation] [Publish Leaderboard].

[ 2. PSYCHOMETRIC QUALITY QUEUE (`psychometric_review_queue`) ]
* Ingests statistical anomaly flags (Negative rpbis, High Missingness, Extreme Alpha).
* Triage Options: [Dismiss Flag with Reason] [Deprecate Question] [Author Errata v2].

[ 3. ERRATA & DISPUTE WORKBENCH ]
* Candidate dispute inbox -> Side-by-side question version comparison.
* One-click errata correction with automated +50 CL Coin bounty issuance.

[ 4. TEST SERIES & BLUEPRINT BUILDER ]
* Define Mock Templates, section counts, marks, time allocations, topic quotas.
* Set curated papers active or publish new test batches.

[ 5. AUDIT TRAIL & REPRODUCIBILITY EXPLORER ]
* Search attempts by UUID -> Inspect immutable SHA-256 evidence watermarks.
* Review historical vs current publication snapshots.
```

---

## 3. Human Review as Supreme Authority

```
====================================================================================================
                        THE HUMAN GOVERNANCE SUPREMACY INVARIANT
====================================================================================================
Psychometrics, algorithms, and AI recommendation engines in Courage Library are strictly DIAGNOSTIC.

The system will NEVER autonomously:
1. Delete or deactivate questions based on statistical flags.
2. Alter candidate marks or accuracy percentages.
3. Invalidate or void test attempts.
4. Modify live competition rankings or revoke certificates.
5. Deduct or alter candidate virtual coin balances.

Every destructive or score-altering action requires explicit human administrative authentication
and is recorded in immutable audit logs.
====================================================================================================
```

---

## 4. What Must Never Happen
- Non-admin staff or candidate roles must **never** access administrative control plane routes (enforced by RBAC middleware and Supabase RLS).
- Administrative actions must **never** bypass database triggers or audit logs.
