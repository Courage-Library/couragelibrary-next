# Candidate Data Isolation & Privacy Architecture

## 1. Candidate Isolation Overview

In a competitive examination ecosystem, candidate performance data, test attempts, diagnostic readiness scores, and mistake histories represent sensitive private data.

Courage Library enforces **Strict Multi-Tenant Candidate Data Isolation** across four distinct domains:
1. **Mock Test Attempts & Live State**: Unsubmitted answers and ongoing attempt timers are visible only to the candidate taking the test.
2. **Mistake Vault Records**: Erroneous responses, personal revision notes, and spaced-repetition schedules are completely private.
3. **Diagnostic & Readiness Profiles**: Candidate-specific 14-dimension readiness scores and weak-area heatmaps are restricted to the candidate.
4. **Errata Reports & Feedback**: User submissions and error reports are anonymized or isolated from peer candidate views.

---

## 2. Row-Level Security (RLS) Isolation Enforcements

The PostgreSQL database enforces isolation at the storage level using Supabase's authenticated user ID context (`auth.uid()`).

### 2.1 Mock Attempts Isolation Policy
```sql
ALTER TABLE mock_attempts ENABLE ROW LEVEL SECURITY;

-- Select policy: Candidates can only query their own test attempts
CREATE POLICY "Candidate can view own attempts"
ON mock_attempts
FOR SELECT
USING (auth.uid() = user_id);

-- Insert policy: Candidates can only create attempts for themselves
CREATE POLICY "Candidate can insert own attempts"
ON mock_attempts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Update policy: Candidates can only update their own attempts
CREATE POLICY "Candidate can update own attempts"
ON mock_attempts
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

### 2.2 Mistake Vault Privacy Policy
```sql
ALTER TABLE mistake_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mistake entries are private to owner"
ON mistake_entries
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

ALTER TABLE mistake_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mistake reviews are private to owner"
ON mistake_reviews
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM mistake_entries
    WHERE mistake_entries.id = mistake_reviews.mistake_id
    AND mistake_entries.user_id = auth.uid()
  )
);
```

---

## 3. Server-Side Session Validation

In addition to database RLS, all Next.js Server Actions enforce session ownership checks prior to executing operations.

```typescript
export async function updateMistakeMasteryAction(mistakeId: string, newState: MistakeMasteryState) {
  const user = await requireAuth();
  const supabase = await createServerClient();

  // Verify ownership before attempting update
  const { data: mistake, error: fetchError } = await supabase
    .from('mistake_entries')
    .select('id, user_id')
    .eq('id', mistakeId)
    .single();

  if (fetchError || !mistake || mistake.user_id !== user.id) {
    throw new Error('UNAUTHORIZED_ACCESS: You do not own this mistake vault record.');
  }

  // Execute update
  const { error: updateError } = await supabase
    .from('mistake_entries')
    .update({ mastery_state: newState, updated_at: new Date().toISOString() })
    .eq('id', mistakeId);

  if (updateError) throw updateError;
  return { success: true };
}
```

---

## 4. Assessment Integrity & Answer Concealment

During an active mock test attempt:
- **Server Response Filtering**: The API payload sent to the candidate's browser during an active test contains only the question stem and option text. The correct option ID, full explanation, and statistical difficulty are stripped on the server.
- **Client Storage Security**: Test state is stored in temporary encrypted memory/session storage; answer keys are never stored in localStorage or exposed in DOM data attributes.
- **Post-Submission Unlocking**: Only after the server marks the attempt as `SUBMITTED` or `TIMED_OUT` and records the final timestamp does the server release the complete answer key and explanations.
