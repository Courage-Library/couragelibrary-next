# Courage Library — Platform Security Architecture

## 1. Security Principles & Defense-in-Depth

Courage Library processes high-stakes assessment data, intellectual property (curriculum, questions), and candidate performance analytics. The platform employs a **Multi-Layered Defense-in-Depth** security model designed to eliminate common web vulnerabilities, ensure absolute data isolation, and prevent unauthorized elevation of privilege.

```
+-------------------------------------------------------------+
| Layer 1: Edge & Network Security (Cloudflare / TLS 1.3 / DDOS)|
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
| Layer 2: Application Entry (Next.js Middleware & CSP Headers)|
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
| Layer 3: Server Action Guards & Session Validation (RBAC)    |
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
| Layer 4: Content Sanitization & AST Compilation Safety      |
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
| Layer 5: Database Row-Level Security (PostgreSQL RLS)       |
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
| Layer 6: Static Cryptographic & Time Authority Isolation    |
+-------------------------------------------------------------+
```

---

## 2. Core Security Invariants

1. **Zero-Trust Client Input**: All client inputs (form submissions, JSON payloads, search parameters, URL slugs) are validated against strict Zod runtime schemas before processing.
2. **Server-Authoritative Test Environment**: In mock test assessments, the candidate's browser has zero authority over timing, scoring, question eligibility, or response evaluation. The server maintains the sole source of truth.
3. **Database-Enforced Multi-Tenancy**: Authorization is not left to application code alone. Even if a bug existed in a server route, PostgreSQL RLS policies unconditionally block unauthorized data access.
4. **Untrusted AI Content Quarantine**: AI-generated responses are treated as untrusted strings until they pass through schema validation, 5-gate structural checks, XSS sanitization, and explicit human academic approval.
5. **No Dangerous Evaluation**: Zero usage of `eval()`, `dangerouslySetInnerHTML`, `new Function()`, or dynamic runtime script injection anywhere in the repository.

---

## 3. Security Boundary Architecture

### 3.1 Public Candidate Zone
- **Access**: Anonymous visitors and authenticated candidates.
- **Allowed Operations**:
  - Read published exam catalog and published knowledge modules.
  - Read published curriculum units.
  - Start, resume, and submit mock test attempts (authenticated only).
  - Read and manage personal Mistake Vault entries (authenticated only).
- **Security Boundary**: Candidates cannot access any drafts, unapproved versions, question answer keys during an active test, or other candidates' data.

### 3.2 Staff Authoring & Review Zone (`/staff`, `/admin`)
- **Access**: Verified staff members and academic reviewers (`STAFF`, `ACADEMIC_REVIEWER`).
- **Allowed Operations**:
  - Author, edit, and fork knowledge module drafts.
  - Run AI prompt generation.
  - Submit drafts to Academic Review.
  - Perform structured diff comparisons.
  - Execute 5-gate validation.
- **Security Boundary**: Staff cannot directly modify core platform roles or execute destructive database operations without Admin clearance.

### 3.3 Platform Administration Zone (`/admin`)
- **Access**: Global administrators (`ADMIN`).
- **Allowed Operations**:
  - User role assignment.
  - Conducting authority registry management.
  - Final publication approval and system configuration.

---

## 4. Web Application Security Configuration

### 4.1 Content Security Policy (CSP)
The platform enforces a strict Content Security Policy via Next.js response headers:

```http
Content-Security-Policy: 
    default-src 'self';
    script-src 'self' 'nonce-...' 'strict-dynamic';
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    font-src 'self' https://fonts.gstatic.com;
    img-src 'self' data: https://supabase.co https://*.supabase.co https://images.unsplash.com;
    connect-src 'self' https://*.supabase.co wss://*.supabase.co;
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self';
```

### 4.2 HTTP Security Headers
- `X-Frame-Options: DENY` (prevents clickjacking attacks).
- `X-Content-Type-Options: nosniff` (prevents MIME type sniffing).
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.

---

## 5. Vulnerability Classification & Mitigation Matrix

| Vulnerability Type | Risk Level | Courage Library Mitigation Strategy |
| :--- | :--- | :--- |
| **SQL Injection** | Critical | 100% Parameterized queries via Supabase JS SDK / PostgREST; no raw string concatenation in queries. |
| **Cross-Site Scripting (XSS)** | Critical | MDX sanitization pipeline, rehype-sanitize, zero `dangerouslySetInnerHTML`, strict CSP. |
| **Broken Access Control (IDOR)**| Critical | PostgreSQL Row-Level Security policies tied to `auth.uid()` on all user-owned tables. |
| **Client-Side Test Cheating** | High | Server-authoritative timer, obfuscated question delivery, server-side score calculation. |
| **CSRF Attacks** | Medium | Next.js Server Actions with automatic built-in origin validation and SameSite cookies. |
| **AI Prompt Injection / Poisoning**| Medium | Multi-gate JSON schema validation, structural regex filters, human reviewer in the loop. |
