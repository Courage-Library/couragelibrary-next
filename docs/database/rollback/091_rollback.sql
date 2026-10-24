-- Rollback for 20261025000091_f0_onboarding.sql (F0 onboarding, decision #76).
-- Order: 091 → 090 → … . Run only after a backup. Hinglish preferences fall back to English ('en').
BEGIN;

DROP FUNCTION IF EXISTS public.fn_get_my_onboarding();
DROP FUNCTION IF EXISTS public.fn_save_onboarding(text, text, uuid[], date, text, integer);
DROP TABLE IF EXISTS public.user_onboarding;

-- user_exam_goals rows written by onboarding are ordinary goals (same shape as the follow-exam action) and stay.

UPDATE public.user_profiles SET language_preference = 'en' WHERE language_preference = 'hinglish';
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_language_preference_check;
ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_language_preference_check CHECK (language_preference IN ('en', 'hi'));

COMMIT;
