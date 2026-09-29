# Role-Based Access Control (RBAC) & Authorization Model

## 1. Role Hierarchy & Persona Matrix

Courage Library implements a strict **Role-Based Access Control (RBAC)** architecture. System roles are stored in the `user_roles` database table and validated server-side on every request and Server Action execution.

```
       [ ADMIN ]  (Superuser: Platform Configuration, Role Management, Full Authority)
           |
       [ STAFF ]  (Content Creator, Exam Lead, Academic Reviewer, Errata Resolver)
           |
     [ CANDIDATE ] (Registered Learner, Test Taker, Mistake Vault Owner)
           |
     [ ANONYMOUS ] (Public Catalog Visitor, Unauthenticated Learner)
```

---

## 2. Granular Permissions Matrix

| Platform Action / Capability | Anonymous | Candidate | Staff / Reviewer | Admin |
| :--- | :---: | :---: | :---: | :---: |
| **Browse Exam Hub & Overview** | Yes | Yes | Yes | Yes |
| **Read Published Knowledge Modules** | Yes | Yes | Yes | Yes |
| **Browse Curriculum Taxonomy** | Yes | Yes | Yes | Yes |
| **Read Published Learning Units** | Yes | Yes | Yes | Yes |
| **Start / Resume Mock Test Attempt** | No | Yes | Yes | Yes |
| **Submit Test & View Results** | No | Yes | Yes | Yes |
| **Manage Personal Mistake Vault** | No | Yes | Yes | Yes |
| **Flag Question Errata** | No | Yes | Yes | Yes |
| **Access Staff Workbench (`/staff`)** | No | No | Yes | Yes |
| **Generate AI Authoring Prompts** | No | No | Yes | Yes |
| **Import & Edit Knowledge Drafts** | No | No | Yes | Yes |
| **Review & Request Changes on Drafts**| No | No | Yes | Yes |
| **Publish Knowledge Revisions** | No | No | Yes | Yes |
| **Manage Exam Registry & Cycles** | No | No | No | Yes |
| **Assign User Roles & Permissions** | No | No | No | Yes |

---

## 3. Server-Side Guard Implementations

All mutations in the platform use Next.js Server Actions or API routes protected by guard utilities located in `src/lib/auth/guards.ts`.

### 3.1 Role Verification Guard
```typescript
import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export type UserRole = 'ADMIN' | 'STAFF' | 'CANDIDATE';

export async function requireAuth() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/auth/login');
  }

  return user;
}

export async function requireRole(allowedRoles: UserRole[]) {
  const user = await requireAuth();
  const supabase = await createServerClient();

  const { data: roleRecord } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!roleRecord || !allowedRoles.includes(roleRecord.role as UserRole)) {
    throw new Error('FORBIDDEN_INSUFFICIENT_PERMISSIONS: Access denied to this resource.');
  }

  return { user, role: roleRecord.role as UserRole };
}
```

### 3.2 Protecting Server Actions
```typescript
'use server';

import { requireRole } from '@/lib/auth/guards';
import { publishKnowledgeVersion } from '@/lib/services/examKnowledgeService';

export async function handlePublishAction(versionId: string, documentId: string) {
  // Enforces that only STAFF or ADMIN can trigger publication
  const { user } = await requireRole(['ADMIN', 'STAFF']);
  
  return await publishKnowledgeVersion({
    versionId,
    documentId,
    publishedBy: user.id
  });
}
```

---

## 4. Route Middleware Enforcement

Next.js Middleware intercepts incoming requests at the edge:
- `/admin/*` $\rightarrow$ Requires authenticated session with `role = 'ADMIN'`.
- `/staff/*` $\rightarrow$ Requires authenticated session with `role IN ('ADMIN', 'STAFF')`.
- `/candidate/*` $\rightarrow$ Requires authenticated session (`role IN ('ADMIN', 'STAFF', 'CANDIDATE')`).
- Unauthenticated requests to protected paths are automatically redirected to `/auth/login?redirect=<target_url>`.
