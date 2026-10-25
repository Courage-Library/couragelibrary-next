-- Rollback for 20261025000095_f5_memory_lock.sql (F5 Memory Lock).
-- Run as ONE transaction by the operator (this file is not a migration; it may carry BEGIN / COMMIT).
-- Before running: set MEMORY_LOCK_ENABLED off.
-- WARNING (data): drops every Memory Lock schedule value (ml_* columns) and DELETES manual Memory Lock items
-- (ml_source = 'manual', total_mistakes_count = 0 — they are not mistakes and cannot exist without the new check).
-- Memory Lock answers in practice_answers are DELETED (mode MEMORY_LOCK has no pre-095 meaning); mistakes recorded from
-- Memory Lock stay in the vault and are re-labelled CUSTOM_PRACTICE (the nearest pre-095 source). Export first if needed.
BEGIN;

DROP FUNCTION IF EXISTS public.fn_memory_lock_answer(uuid, text, integer, uuid);
DROP FUNCTION IF EXISTS public.fn_memory_lock_add(uuid);
DROP TRIGGER IF EXISTS trg_umv_ml_schedule ON public.user_mistake_vault;
DROP FUNCTION IF EXISTS public.fn_ml_vault_schedule();
DROP FUNCTION IF EXISTS public.fn_ml_ist_today();
DROP FUNCTION IF EXISTS public.fn_ml_day_start(date);
DROP FUNCTION IF EXISTS public.fn_ml_next_step(integer);

DELETE FROM public.practice_answers WHERE mode = 'MEMORY_LOCK';
ALTER TABLE public.practice_answers DROP CONSTRAINT IF EXISTS practice_answers_mode_check;
ALTER TABLE public.practice_answers ADD CONSTRAINT practice_answers_mode_check CHECK (mode IN ('TOPIC', 'DIAGNOSTIC'));

UPDATE public.user_mistake_occurrences SET source_context = 'CUSTOM_PRACTICE' WHERE source_context = 'MEMORY_LOCK';
ALTER TABLE public.user_mistake_occurrences DROP CONSTRAINT IF EXISTS user_mistake_occurrences_source_context_check;
ALTER TABLE public.user_mistake_occurrences ADD CONSTRAINT user_mistake_occurrences_source_context_check CHECK (source_context = ANY (ARRAY[
    'MOCK_TEST', 'CUSTOM_PRACTICE', 'QUIZ_BATTLE', 'FLASHCARD_REVIEW', 'MISTAKE_DRILL', 'DIAGNOSTIC_ASSESSMENT']));

DELETE FROM public.user_mistake_vault WHERE ml_source = 'manual' AND total_mistakes_count = 0;
ALTER TABLE public.user_mistake_vault DROP CONSTRAINT IF EXISTS user_mistake_vault_total_mistakes_count_check;
ALTER TABLE public.user_mistake_vault ADD CONSTRAINT user_mistake_vault_total_mistakes_count_check CHECK (total_mistakes_count >= 1);

DROP INDEX IF EXISTS public.idx_umv_ml_due;
ALTER TABLE public.user_mistake_vault
    DROP CONSTRAINT IF EXISTS chk_umv_ml_source,
    DROP CONSTRAINT IF EXISTS chk_umv_ml_state,
    DROP CONSTRAINT IF EXISTS chk_umv_ml_interval,
    DROP CONSTRAINT IF EXISTS chk_umv_ml_counts,
    DROP CONSTRAINT IF EXISTS chk_umv_ml_last_result,
    DROP COLUMN IF EXISTS ml_source,
    DROP COLUMN IF EXISTS ml_state,
    DROP COLUMN IF EXISTS ml_due_at,
    DROP COLUMN IF EXISTS ml_interval_days,
    DROP COLUMN IF EXISTS ml_consecutive_correct_days,
    DROP COLUMN IF EXISTS ml_lapses,
    DROP COLUMN IF EXISTS ml_last_result,
    DROP COLUMN IF EXISTS ml_last_reviewed_at,
    DROP COLUMN IF EXISTS ml_last_advance_on;

COMMIT;
