# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 27: SERVER/CLIENT BOUNDARIES & ACTION LIFECYCLES

---

## 1. Architectural Boundary Separation

Courage Library enforces a clean, secure separation between Server Components, Server Actions, and Client Components across the Mistake Vault:

```
┌────────────────────────────────────────────────────────────────────────┐
│ SERVER ENVIRONMENT (Next.js Node Runtime / Edge)                       │
├────────────────────────────────────────────────────────────────────────┤
│  1. Server Component: app/mistakes/page.tsx                            │
│     - Authenticates user session via Supabase Server Client            │
│     - Fetches initial Mistake Vault data & Longitudinal Overview       │
│     - Server-renders skeleton layout for zero layout shift (CLS)       │
│                                                                        │
│  2. Server Actions: app/mistakes/actions.ts                            │
│     - "use server" boundary protection                                 │
│     - Authenticated mutations: createDrill, submitDrill, updateNotes   │
│     - Direct database queries via service layer with RLS verification  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Serialized Props / Action Invocations
┌──────────────────────────────────▼─────────────────────────────────────┐
│ CLIENT ENVIRONMENT (Browser / React DOM)                               │
├────────────────────────────────────────────────────────────────────────┤
│  3. Interactive UI Components: components/mistakes/*                   │
│     - "use client" interactive state (filters, search, modals, drills) │
│     - Local optimistic UI updates during drill submission              │
│     - Responsive tabs (All, Due, Improving, Mastered)                  │
│     - Zero database secrets or raw SQL exposed to browser              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Server Action Error Handling Contract

All Server Actions return a standardized response interface to eliminate client-side uncaught exception crashes:

```typescript
export interface ServerActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
```
