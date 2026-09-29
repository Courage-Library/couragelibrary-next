# 30 — SECURITY ARCHITECTURE & ZERO-TRUST THREAT MODEL

> **DOCUMENTATION CLASSIFICATION:** Security Architecture & Threat Mitigation Matrix  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Platform Security & Cryptographic Perimeter  

---

## 1. What is it?
The **Security Architecture & Zero-Trust Threat Model** specifies the layered defense-in-depth perimeter that guarantees answer key non-exposure, prevents timer tampering, enforces attempt data isolation, and secures digital credentials against academic dishonesty and client manipulation.

## 2. Threat Mitigation Matrix

```
+----------------------------------------------------------------------------------------------------+
| ATTACK VECTOR                     | SEVERITY | MITIGATION & DEFENSE MECHANISM                      |
+-----------------------------------+----------+-----------------------------------------------------+
| 1. Answer Key Extraction          | CRITICAL | Question options sent to client WITHOUT correct keys|
|    via Browser DevTools           |          | or explanation text during active attempts.         |
+-----------------------------------+----------+-----------------------------------------------------+
| 2. Client Clock Rewind            | HIGH     | Time authority calculated server-side in DB RPC;    |
|    (Manipulating PC Date/Time)    |          | client visual countdown is completely untrusted.    |
+-----------------------------------+----------+-----------------------------------------------------+
| 3. IDOR Attack on Other Attempts  | CRITICAL | Supabase Row Level Security (RLS) enforces          |
|    (Reading another candidate's Q)|          | `auth.uid() = user_id` on all attempt/answer tables.|
+-----------------------------------+----------+-----------------------------------------------------+
| 4. Concurrent Quota Race          | HIGH     | PostgreSQL `SELECT ... FOR UPDATE` row-level locks  |
|    (Opening 10 tabs to use quota) |          | guarantee atomic quota decrement.                   |
+-----------------------------------+----------+-----------------------------------------------------+
| 5. Double-Submission Exploit      | HIGH     | SQL status transition lock (`WHERE status = 'IN_PR'`) |
|    (Spamming submit button)       |          | returns idempotent success without double scoring.  |
+-----------------------------------+----------+-----------------------------------------------------+
| 6. Certificate Forgery            | CRITICAL | Cryptographic HMAC-SHA256 signature using server-    |
|    (Fabricating high rank/score)  |          | only secret key; verified on public verification API|
+-----------------------------------+----------+-----------------------------------------------------+
| 7. Question Text Scraping         | MEDIUM   | Semi-transparent rotating canvas watermark with     |
|    (Commercial test duplication)  |          | candidate UUID, IP hash, and copy-prevention CSS.   |
+-----------------------------------+----------+-----------------------------------------------------+
```

---

## 3. Defense-in-Depth Layered Architecture

```
[ LAYER 1: CLIENT EDGE GUARDS ]
React error boundaries, disabled clipboard copying, right-click suppression, canvas watermarking.
         │
         ▼
[ LAYER 2: NEXT.JS SERVER ACTIONS & MIDDLEWARE ]
JWT session verification, CSRF tokens, rate limiting, payload validation via Zod schemas.
         │
         ▼
[ LAYER 3: POSTGRESQL ROW LEVEL SECURITY (RLS) ]
Granular table-level security predicates denying cross-tenant data access.
         │
         ▼
[ LAYER 4: ATOMIC SECURITY DEFINER RPCs ]
Privileged transaction boundaries executing business invariants in isolated database functions.
         │
         ▼
[ LAYER 5: IMMUTABLE DATABASE TRIGGERS ]
PostgreSQL triggers preventing `UPDATE` or `DELETE` mutations on historical audit snapshots.
```

---

## 4. What Must Never Happen
- Service-role secret keys must **never** be transmitted to the browser bundle or exposed in public Next.js environment variables.
- Correct answer option keys must **never** be included in question payload JSON during an active attempt.
