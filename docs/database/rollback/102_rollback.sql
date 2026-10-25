-- Rollback for 20261025000102_mfa_db_2_role_checks.sql: restores the 43 policies and 13 functions exactly as they
-- were (generated from the live definitions). WARNING: this also restores the NULL-BYPASS-1 bug. Run as ONE transaction.
BEGIN;

ALTER POLICY "p_bca_manage_faculty" ON public."batch_curriculum_assignments"
    USING ((fn_has_batch_faculty_access(batch_id, auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((fn_has_batch_faculty_access(batch_id, auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_bca_select" ON public."batch_curriculum_assignments"
    USING ((((status = 'PUBLISHED'::text) AND fn_is_batch_member(batch_id, auth.uid())) OR fn_has_batch_faculty_access(batch_id, auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_bm_manage_faculty" ON public."batch_memberships"
    USING ((fn_has_batch_faculty_access(batch_id, auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((fn_has_batch_faculty_access(batch_id, auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_bm_select" ON public."batch_memberships"
    USING (((user_id = auth.uid()) OR fn_is_batch_member(batch_id, auth.uid()) OR fn_is_institute_member(institute_id, auth.uid(), ARRAY['INSTITUTE_ADMIN'::text]) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "Staff can manage descriptive questions" ON public."descriptive_questions"
    USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_messages_staff_all" ON public."discussion_messages"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_messages_update_staff" ON public."discussion_messages"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_mod_flags_staff_all" ON public."discussion_moderation_flags"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_threads_read_public" ON public."discussion_threads"
    USING (((status <> 'ARCHIVED'::text) AND ((lesson_id IS NULL) OR (EXISTS ( SELECT 1
   FROM ((course_lessons cl
     JOIN course_modules cm ON ((cm.id = cl.module_id)))
     JOIN courses c ON ((c.id = cm.course_id)))
  WHERE ((cl.id = discussion_threads.lesson_id) AND ((cl.is_free_preview = true) OR (c.access_tier = 'FREE'::text) OR ((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM user_entitlements ue
          WHERE ((ue.user_id = auth.uid()) AND (ue.is_active = true) AND ((ue.expires_at IS NULL) OR (ue.expires_at > now())))))) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text])))))))));

ALTER POLICY "p_threads_staff_all" ON public."discussion_threads"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_threads_update_staff" ON public."discussion_threads"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_votes_staff_all" ON public."discussion_votes"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "Staff can manage evaluation rubrics" ON public."evaluation_rubrics"
    USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_fdecks_manage_staff" ON public."flashcard_decks"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_fdecks_select" ON public."flashcard_decks"
    USING (((is_published = true) AND ((is_curated = true) OR (author_id = auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text])))));

ALTER POLICY "p_fcards_manage_staff" ON public."flashcards"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_fcards_select" ON public."flashcards"
    USING (((is_active = true) AND (EXISTS ( SELECT 1
   FROM flashcard_decks fd
  WHERE ((fd.id = flashcards.deck_id) AND (fd.is_published = true) AND ((fd.author_id = auth.uid()) OR ((fd.is_curated = true) AND ((fd.access_tier = 'FREE'::text) OR (flashcards.card_order <= 3) OR ((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM user_entitlements ue
          WHERE ((ue.user_id = auth.uid()) AND (ue.is_active = true) AND ((ue.expires_at IS NULL) OR (ue.expires_at > now())))))) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))))))));

ALTER POLICY "p_batches_manage_faculty" ON public."institute_batches"
    USING ((fn_has_batch_faculty_access(id, auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((fn_has_batch_faculty_access(id, auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_batches_select" ON public."institute_batches"
    USING ((fn_is_batch_member(id, auth.uid()) OR fn_is_institute_member(institute_id, auth.uid(), ARRAY['INSTITUTE_ADMIN'::text]) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_institutes_manage_owner" ON public."institutes"
    USING (((owner_user_id = auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK (((owner_user_id = auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_institutes_select" ON public."institutes"
    USING (((is_verified = true) OR (owner_user_id = auth.uid()) OR fn_is_institute_member(id, auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_mct_manage_staff" ON public."mistake_cognitive_types"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_popular_search_terms_staff_all" ON public."popular_search_terms"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_qbp_manage_staff" ON public."quiz_battle_participants"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_qbp_select" ON public."quiz_battle_participants"
    USING (((user_id = auth.uid()) OR fn_is_battle_participant(room_id, auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_qbr_manage_staff" ON public."quiz_battle_rooms"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_qbr_select" ON public."quiz_battle_rooms"
    USING (((status = ANY (ARRAY['WAITING'::text, 'READY'::text, 'COUNTDOWN'::text, 'ACTIVE'::text, 'COMPLETED'::text])) AND ((is_private = false) OR (created_by_user_id = auth.uid()) OR fn_is_battle_participant(id, auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text])))));

ALTER POLICY "p_qbra_manage_staff" ON public."quiz_battle_round_answers"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_qbra_select" ON public."quiz_battle_round_answers"
    USING (((user_id = auth.uid()) OR ((EXISTS ( SELECT 1
   FROM quiz_battle_rooms qbr
  WHERE ((qbr.id = quiz_battle_round_answers.room_id) AND (qbr.status = 'COMPLETED'::text)))) AND fn_is_battle_participant(room_id, auth.uid())) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_search_indexes_read_auth" ON public."search_indexes"
    USING (((is_published = true) AND ((access_tier = 'FREE'::text) OR (EXISTS ( SELECT 1
   FROM user_entitlements
  WHERE ((user_entitlements.user_id = auth.uid()) AND (user_entitlements.entitlement_type = 'SUBSCRIPTION'::text) AND (user_entitlements.is_active = true) AND ((user_entitlements.expires_at IS NULL) OR (user_entitlements.expires_at > now()))))) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text])))));

ALTER POLICY "p_search_indexes_staff_all" ON public."search_indexes"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_search_query_logs_staff" ON public."search_query_logs"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "Staff can manage all evaluations" ON public."submission_evaluations"
    USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_ubs_manage_staff" ON public."user_battle_stats"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_uf_progress_manage_staff" ON public."user_deck_progress"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "Staff can manage all submissions" ON public."user_descriptive_submissions"
    USING (((COALESCE((auth.jwt() ->> 'role'::text), ''::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_uf_reviews_manage_staff" ON public."user_flashcard_reviews"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_umd_manage_staff" ON public."user_mistake_drills"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_umd_select" ON public."user_mistake_drills"
    USING (((user_id = auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_umo_manage_staff" ON public."user_mistake_occurrences"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_umo_select" ON public."user_mistake_occurrences"
    USING (((user_id = auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_umv_manage_staff" ON public."user_mistake_vault"
    USING ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))))
    WITH CHECK ((((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

ALTER POLICY "p_umv_select" ON public."user_mistake_vault"
    USING (((user_id = auth.uid()) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text])) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'staff'::text]))));

CREATE OR REPLACE FUNCTION public.fn_can_evaluate_submission(p_submission_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_sub RECORD;
BEGIN
    IF p_submission_id IS NULL OR p_user_id IS NULL THEN RETURN false; END IF;

    SELECT * INTO v_sub FROM public.user_descriptive_submissions WHERE id = p_submission_id;
    IF NOT FOUND THEN RETURN false; END IF;

    -- Global staff/admin can always evaluate
    IF (COALESCE(auth.jwt()->>'role', '') IN ('admin', 'staff', 'service_role') OR
        COALESCE(auth.jwt()->'app_metadata'->>'role', '') IN ('admin', 'staff')) THEN
        RETURN true;
    END IF;

    -- If institutional batch submission, verify faculty access in that batch via Phase 3P
    IF v_sub.batch_id IS NOT NULL THEN
        RETURN public.fn_has_batch_faculty_access(v_sub.batch_id, p_user_id);
    END IF;

    -- If institute level submission without batch, verify institute admin/owner
    IF v_sub.institute_id IS NOT NULL THEN
        RETURN public.fn_is_institute_member(v_sub.institute_id, p_user_id, ARRAY['INSTITUTE_ADMIN']);
    END IF;

    RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_create_batch_assignment(p_batch_id uuid, p_title text, p_assignment_type text, p_content_id uuid, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_instructions_md text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_caller_id UUID := auth.uid();
    v_inst_id UUID;
    v_assignment_id UUID;
    v_mock_id UUID;
    v_course_id UUID;
    v_lesson_id UUID;
    v_deck_id UUID;
    v_document_id UUID;
    v_topic_id UUID;
BEGIN
    IF v_caller_id IS NOT NULL AND
       NOT public.fn_has_batch_faculty_access(p_batch_id, v_caller_id) AND
       NOT (
            COALESCE(auth.jwt()->>'role', '') IN ('admin', 'staff', 'service_role') OR
            (COALESCE(auth.jwt()->'app_metadata'->>'role', '') IN ('admin', 'staff'))
       ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
    END IF;

    SELECT institute_id INTO v_inst_id FROM public.institute_batches WHERE id = p_batch_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Batch not found'); END IF;

    -- Map explicit typed content FK
    IF p_assignment_type = 'MOCK_TEST' THEN v_mock_id := p_content_id;
    ELSIF p_assignment_type = 'COURSE' THEN v_course_id := p_content_id;
    ELSIF p_assignment_type = 'COURSE_LESSON' THEN v_lesson_id := p_content_id;
    ELSIF p_assignment_type = 'FLASHCARD_DECK' THEN v_deck_id := p_content_id;
    ELSIF p_assignment_type = 'ARTICLE' THEN v_document_id := p_content_id; -- GAP2-2b: learning_documents
    ELSIF p_assignment_type = 'MISTAKE_DRILL' THEN v_topic_id := p_content_id;
    ELSE RETURN jsonb_build_object('success', false, 'error', 'Invalid assignment type');
    END IF;

    INSERT INTO public.batch_curriculum_assignments (
        batch_id, institute_id, title, instructions_md, assignment_type,
        mock_test_id, course_id, course_lesson_id, flashcard_deck_id, learning_document_id, topic_id,
        due_at, assigned_by_user_id
    ) VALUES (
        p_batch_id, v_inst_id, p_title, p_instructions_md, p_assignment_type,
        v_mock_id, v_course_id, v_lesson_id, v_deck_id, v_document_id, v_topic_id,
        p_due_at, v_caller_id
    ) RETURNING id INTO v_assignment_id;

    RETURN jsonb_build_object('success', true, 'assignment_id', v_assignment_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_edit_discussion_message(p_message_id uuid, p_content_markdown text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_author_id UUID;
    v_is_deleted BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF p_content_markdown IS NULL OR length(trim(p_content_markdown)) < 2 OR length(p_content_markdown) > 10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message content must be between 2 and 10000 characters');
    END IF;

    SELECT author_id, is_deleted INTO v_author_id, v_is_deleted
    FROM public.discussion_messages
    WHERE id = p_message_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message not found');
    END IF;

    IF v_is_deleted THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot edit a deleted message');
    END IF;

    IF v_author_id != v_user_id AND NOT (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You can only edit your own messages');
    END IF;

    UPDATE public.discussion_messages
    SET content_markdown = trim(p_content_markdown),
        updated_at = now()
    WHERE id = p_message_id;

    RETURN jsonb_build_object(
        'success', true,
        'message_id', p_message_id,
        'updated_at', now()
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_enroll_batch_student(p_batch_id uuid, p_student_user_id uuid, p_role text DEFAULT 'STUDENT'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_caller_id UUID := auth.uid();
    v_inst_id UUID;
    v_max_cap INTEGER;
    v_cur_count INTEGER;
    v_membership_id UUID;
BEGIN
    IF v_caller_id IS NOT NULL AND
       NOT public.fn_has_batch_faculty_access(p_batch_id, v_caller_id) AND
       NOT (
            COALESCE(auth.jwt()->>'role', '') IN ('admin', 'staff', 'service_role') OR
            (COALESCE(auth.jwt()->'app_metadata'->>'role', '') IN ('admin', 'staff'))
       ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
    END IF;

    -- Concurrency Lock: Lock batch row before evaluating capacity
    SELECT institute_id, max_capacity
    INTO v_inst_id, v_max_cap
    FROM public.institute_batches
    WHERE id = p_batch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Batch not found');
    END IF;

    -- Count active students
    SELECT count(*) INTO v_cur_count
    FROM public.batch_memberships
    WHERE batch_id = p_batch_id AND role = 'STUDENT' AND status = 'ACTIVE';

    IF p_role = 'STUDENT' AND v_cur_count >= v_max_cap THEN
        RETURN jsonb_build_object('success', false, 'error', 'Batch has reached maximum capacity (' || v_max_cap || ')');
    END IF;

    -- Upsert membership
    INSERT INTO public.batch_memberships (
        batch_id, institute_id, user_id, role, status, invited_by_user_id, joined_at
    ) VALUES (
        p_batch_id, v_inst_id, p_student_user_id, COALESCE(p_role, 'STUDENT'), 'ACTIVE', v_caller_id, now()
    )
    ON CONFLICT (batch_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = 'ACTIVE',
        left_at = NULL,
        updated_at = now()
    RETURNING id INTO v_membership_id;

    RETURN jsonb_build_object(
        'success', true,
        'membership_id', v_membership_id,
        'batch_id', p_batch_id,
        'user_id', p_student_user_id,
        'role', COALESCE(p_role, 'STUDENT'),
        'current_active_count', v_cur_count + 1
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_evaluate_descriptive_submission(p_submission_id uuid, p_rubric_scores jsonb, p_total_score numeric, p_strengths text DEFAULT NULL::text, p_weaknesses text DEFAULT NULL::text, p_suggestions text DEFAULT NULL::text, p_model_comparison text DEFAULT NULL::text, p_evaluator_type text DEFAULT 'HUMAN_FACULTY'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_caller_id UUID := auth.uid();
    v_sub RECORD;
    v_q RECORD;
    v_rubric_snapshot JSONB := '{}'::jsonb;
    v_eval_id UUID;
    v_percentage NUMERIC(5,2);
    v_reward_res JSONB;
BEGIN
    IF v_caller_id IS NOT NULL AND
       NOT public.fn_can_evaluate_submission(p_submission_id, v_caller_id) AND
       NOT (
            COALESCE(auth.jwt()->>'role', '') IN ('admin', 'staff', 'service_role') OR
            COALESCE(auth.jwt()->'app_metadata'->>'role', '') IN ('admin', 'staff')
       ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
    END IF;

    -- Concurrency Lock: Lock submission row before evaluating
    SELECT * INTO v_sub FROM public.user_descriptive_submissions WHERE id = p_submission_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Submission not found');
    END IF;

    IF v_sub.status NOT IN ('SUBMITTED', 'IN_REVIEW', 'RETURNED_FOR_REVISION') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Submission is already evaluated or archived');
    END IF;

    SELECT * INTO v_q FROM public.descriptive_questions WHERE id = v_sub.question_id;

    -- Snapshot rubric criteria if rubric assigned
    IF v_sub.rubric_id IS NOT NULL THEN
        SELECT criteria INTO v_rubric_snapshot FROM public.evaluation_rubrics WHERE id = v_sub.rubric_id;
    END IF;

    -- Calculate percentage
    IF v_q.max_marks > 0 THEN
        v_percentage := round(LEAST(100.00, GREATEST(0.00, (p_total_score / v_q.max_marks) * 100.00)), 2);
    ELSE
        v_percentage := 0.00;
    END IF;

    -- Insert or update canonical evaluation scorecard
    INSERT INTO public.submission_evaluations (
        submission_id, evaluator_user_id, evaluator_type, rubric_id,
        rubric_snapshot, rubric_scores, total_score_awarded, percentage_score,
        strengths_feedback, weaknesses_feedback, improvement_suggestions,
        model_answer_comparison_md, evaluation_status, completed_at
    ) VALUES (
        p_submission_id, v_caller_id, COALESCE(p_evaluator_type, 'HUMAN_FACULTY'), v_sub.rubric_id,
        v_rubric_snapshot, p_rubric_scores, p_total_score, v_percentage,
        p_strengths, p_weaknesses, p_suggestions,
        p_model_comparison, 'COMPLETED', now()
    )
    ON CONFLICT (submission_id) DO UPDATE
    SET evaluator_user_id = EXCLUDED.evaluator_user_id,
        evaluator_type = EXCLUDED.evaluator_type,
        rubric_snapshot = EXCLUDED.rubric_snapshot,
        rubric_scores = EXCLUDED.rubric_scores,
        total_score_awarded = EXCLUDED.total_score_awarded,
        percentage_score = EXCLUDED.percentage_score,
        strengths_feedback = EXCLUDED.strengths_feedback,
        weaknesses_feedback = EXCLUDED.weaknesses_feedback,
        improvement_suggestions = EXCLUDED.improvement_suggestions,
        model_answer_comparison_md = EXCLUDED.model_answer_comparison_md,
        evaluation_status = 'COMPLETED',
        completed_at = now(),
        updated_at = now()
    RETURNING id INTO v_eval_id;

    -- Update submission status
    UPDATE public.user_descriptive_submissions
    SET status = 'EVALUATED', updated_at = now()
    WHERE id = p_submission_id;

    -- Phase 3D Gamification Reward: 10 coins for completed evaluation
    v_reward_res := public.fn_award_gamification_reward(
        v_sub.user_id,
        'DESCRIPTIVE_EVALUATION_COMPLETED',
        'DESCRIPTIVE_SUBMISSION',
        p_submission_id,
        'descriptive_eval_' || p_submission_id || '_' || v_sub.user_id,
        10,
        'DESCRIPTIVE_EVALUATION_REWARD',
        jsonb_build_object('submission_id', p_submission_id, 'score', p_total_score, 'percentage', v_percentage)
    );

    -- Phase 3C Activity Logging
    IF v_q.topic_id IS NOT NULL THEN
        INSERT INTO public.learning_activity_events (
            user_id, topic_id, resource_slug, event_type, time_spent_seconds, metadata, occurred_at
        ) VALUES (
            v_sub.user_id, v_q.topic_id, 'descriptive-' || v_q.slug, 'TOPIC_LEARNING_ACTIVITY',
            COALESCE(v_sub.time_spent_seconds, 600),
            jsonb_build_object('activity_type', 'DESCRIPTIVE_ESSAY', 'submission_id', p_submission_id, 'percentage', v_percentage),
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'evaluation_id', v_eval_id,
        'submission_id', p_submission_id,
        'total_score_awarded', p_total_score,
        'percentage_score', v_percentage,
        'status', 'EVALUATED'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_get_batch_assignment_progress(p_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_caller_id UUID := auth.uid();
    v_assignment RECORD;
    v_student_count INTEGER;
    v_completed_count INTEGER := 0;
BEGIN
    SELECT * INTO v_assignment FROM public.batch_curriculum_assignments WHERE id = p_assignment_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Assignment not found'); END IF;

    -- Verify caller is faculty/admin for batch or global staff
    IF v_caller_id IS NOT NULL AND
       NOT public.fn_has_batch_faculty_access(v_assignment.batch_id, v_caller_id) AND
       NOT (
            COALESCE(auth.jwt()->>'role', '') IN ('admin', 'staff', 'service_role') OR
            COALESCE(auth.jwt()->'app_metadata'->>'role', '') IN ('admin', 'staff')
       ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
    END IF;

    SELECT count(*) INTO v_student_count
    FROM public.batch_memberships
    WHERE batch_id = v_assignment.batch_id AND role = 'STUDENT' AND status = 'ACTIVE';

    -- Derive completion by assignment type from existing Phase 3B/3F/3M/3O tables
    IF v_assignment.assignment_type = 'MOCK_TEST' THEN
        SELECT count(DISTINCT ta.user_id) INTO v_completed_count
        FROM public.test_attempts ta
        JOIN public.batch_memberships bm ON ta.user_id = bm.user_id
        WHERE bm.batch_id = v_assignment.batch_id
          AND bm.status = 'ACTIVE'
          AND ta.mock_test_id = v_assignment.mock_test_id
          AND ta.status = 'completed'
          AND ta.started_at >= v_assignment.available_from;
    ELSIF v_assignment.assignment_type = 'FLASHCARD_DECK' THEN
        SELECT count(DISTINCT udp.user_id) INTO v_completed_count
        FROM public.user_deck_progress udp
        JOIN public.batch_memberships bm ON udp.user_id = bm.user_id
        WHERE bm.batch_id = v_assignment.batch_id
          AND bm.status = 'ACTIVE'
          AND udp.deck_id = v_assignment.flashcard_deck_id
          AND udp.total_cards_mastered >= 5;
    ELSIF v_assignment.assignment_type = 'COURSE_LESSON' THEN
        SELECT count(DISTINCT ulc.user_id) INTO v_completed_count
        FROM public.user_lesson_completions ulc
        JOIN public.batch_memberships bm ON ulc.user_id = bm.user_id
        WHERE bm.batch_id = v_assignment.batch_id
          AND bm.status = 'ACTIVE'
          AND ulc.lesson_id = v_assignment.course_lesson_id;
    ELSIF v_assignment.assignment_type = 'MISTAKE_DRILL' THEN
        SELECT count(DISTINCT umd.user_id) INTO v_completed_count
        FROM public.user_mistake_drills umd
        JOIN public.batch_memberships bm ON umd.user_id = bm.user_id
        WHERE bm.batch_id = v_assignment.batch_id
          AND bm.status = 'ACTIVE'
          AND umd.status = 'COMPLETED'
          AND umd.started_at >= v_assignment.available_from;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'assignment_id', p_assignment_id,
        'total_students', v_student_count,
        'completed_students', v_completed_count,
        'completion_rate_pct', CASE WHEN v_student_count > 0 THEN round((v_completed_count::numeric / v_student_count::numeric) * 100, 1) ELSE 0 END
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_get_due_flashcards(p_deck_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(card_id uuid, deck_id uuid, card_order integer, front_markdown_en text, front_markdown_hi text, back_markdown_en text, back_markdown_hi text, mnemonic_en text, mnemonic_hi text, latex_formulas text[], hint text, explanation text, repetition_level integer, interval_days integer, ease_factor numeric, next_review_due_at timestamp with time zone, is_new boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_has_pro BOOLEAN := false;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.user_entitlements ue
        WHERE ue.user_id = v_user_id
          AND ue.is_active = true
          AND (ue.expires_at IS NULL OR ue.expires_at > now())
    ) INTO v_has_pro;

    RETURN QUERY
    SELECT 
        fc.id AS card_id,
        fc.deck_id,
        fc.card_order,
        fc.front_markdown_en,
        fc.front_markdown_hi,
        fc.back_markdown_en,
        fc.back_markdown_hi,
        fc.mnemonic_en,
        fc.mnemonic_hi,
        fc.latex_formulas,
        fc.hint,
        fc.explanation,
        COALESCE(ufr.repetition_level, 0) AS repetition_level,
        COALESCE(ufr.interval_days, 1) AS interval_days,
        COALESCE(ufr.ease_factor, 2.50) AS ease_factor,
        ufr.next_review_due_at,
        (ufr.id IS NULL) AS is_new
    FROM public.flashcards fc
    JOIN public.flashcard_decks fd ON fd.id = fc.deck_id
    LEFT JOIN public.user_flashcard_reviews ufr ON ufr.card_id = fc.id AND ufr.user_id = v_user_id
    WHERE fc.is_active = true
      AND fd.is_published = true
      AND (p_deck_id IS NULL OR fc.deck_id = p_deck_id)
      AND (
          fd.author_id = v_user_id OR
          (fd.is_curated = true AND (
              fd.access_tier = 'FREE' OR
              fc.card_order <= 3 OR
              v_has_pro OR
              auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
              (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
          ))
      )
      AND (ufr.next_review_due_at IS NULL OR ufr.next_review_due_at <= now())
    ORDER BY 
        CASE WHEN ufr.next_review_due_at IS NOT NULL THEN 0 ELSE 1 END,
        ufr.next_review_due_at ASC,
        fc.card_order ASC
    LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_jwt_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$function$;

CREATE OR REPLACE FUNCTION public.fn_mark_accepted_answer(p_thread_id uuid, p_message_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_author_id UUID;
    v_msg_author_id UUID;
    v_msg_thread_id UUID;
    v_is_staff BOOLEAN;
    v_event_key TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    v_is_staff := (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

    SELECT author_id INTO v_author_id
    FROM public.discussion_threads
    WHERE id = p_thread_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Thread not found');
    END IF;

    IF v_author_id != v_user_id AND NOT v_is_staff THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only thread author or staff can mark accepted answer');
    END IF;

    SELECT thread_id, author_id INTO v_msg_thread_id, v_msg_author_id
    FROM public.discussion_messages
    WHERE id = p_message_id;

    IF NOT FOUND OR v_msg_thread_id != p_thread_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message does not belong to this thread');
    END IF;

    UPDATE public.discussion_threads
    SET accepted_answer_id = p_message_id,
        status = 'RESOLVED',
        updated_at = now()
    WHERE id = p_thread_id;

    -- Phase 3D Gamification Event: Award 25 coins for accepted answer
    v_event_key := 'disc_accepted_' || p_thread_id || '_' || p_message_id;
    INSERT INTO public.gamification_events (
        user_id, event_type, source_type, source_id, idempotency_key,
        verification_status, reward_status, calculated_coins, actual_coins_awarded,
        metadata, occurred_at
    ) VALUES (
        v_msg_author_id, 'ACCEPTED_ANSWER_BONUS', 'DISCUSSION_MESSAGE', p_message_id, v_event_key,
        'VERIFIED', 'REWARDED', 25, 25,
        jsonb_build_object('thread_id', p_thread_id, 'message_id', p_message_id),
        now()
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    -- Phase 3H Notification to Answer Author
    IF v_msg_author_id != v_user_id THEN
        INSERT INTO public.user_notifications (
            user_id, category, priority, title, body, action_url,
            metadata_json, idempotency_key, created_at
        ) VALUES (
            v_msg_author_id, 'ACADEMIC', 'HIGH',
            'Your answer was accepted!',
            'Your solution was marked as the accepted answer (+25 coins bonus).',
            '/discussions/' || p_thread_id,
            jsonb_build_object('thread_id', p_thread_id, 'message_id', p_message_id),
            'disc_notif_accepted_' || p_message_id,
            now()
        ) ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'thread_id', p_thread_id,
        'accepted_answer_id', p_message_id,
        'status', 'RESOLVED'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_moderate_flagged_content(p_flag_id uuid, p_resolution_action text, p_moderator_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_staff BOOLEAN;
    v_target_type TEXT;
    v_target_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    v_is_staff := (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

    IF NOT v_is_staff THEN
        RETURN jsonb_build_object('success', false, 'error', 'Staff authorization required');
    END IF;

    IF p_resolution_action NOT IN ('DISMISSED', 'CONTENT_REMOVED', 'USER_WARNED', 'USER_MUTED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid resolution action');
    END IF;

    SELECT target_type, target_id INTO v_target_type, v_target_id
    FROM public.discussion_moderation_flags
    WHERE id = p_flag_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Moderation flag record not found');
    END IF;

    UPDATE public.discussion_moderation_flags
    SET status = CASE WHEN p_resolution_action = 'DISMISSED' THEN 'RESOLVED_DISMISSED' ELSE 'RESOLVED_REMOVED' END,
        resolution_action = p_resolution_action,
        moderated_by_user_id = v_user_id,
        moderation_note = trim(p_moderator_note),
        moderated_at = now()
    WHERE id = p_flag_id;

    -- If content removed, apply soft delete / lock
    IF p_resolution_action = 'CONTENT_REMOVED' THEN
        IF v_target_type = 'MESSAGE' THEN
            UPDATE public.discussion_messages
            SET is_deleted = true,
                deleted_at = now()
            WHERE id = v_target_id;
        ELSIF v_target_type = 'THREAD' THEN
            UPDATE public.discussion_threads
            SET status = 'LOCKED',
                updated_at = now()
            WHERE id = v_target_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'flag_id', p_flag_id,
        'resolution_action', p_resolution_action
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_reconcile_search_indexes()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_count INTEGER := 0;
BEGIN
    IF auth.role() != 'service_role' AND NOT (
        auth.jwt()->>'role' IN ('admin', 'staff') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- 1+2. Learning documents (GAP2-2b; replaces the retired legacy stack). Only servable
    -- documents are indexed: PUBLISHED, current version published (review_status PUBLISHED),
    -- active unit. DRAFT / unpublished / archived documents are never indexed.
    INSERT INTO public.search_indexes (
        entity_type, source_id, canonical_url, title_en, title_hi,
        body_snippet_en, body_snippet_hi, normalized_keywords,
        subject_id, topic_id, category, access_tier, is_published, quality_rank, source_updated_at
    )
    SELECT
        'ARTICLE', d.id, '/articles/' || d.canonical_slug, u.title, null,
        replace(lower(d.document_type::text), '_', ' ') || COALESCE(' for ' || t.name, ''), null,
        lower(u.title || ' ' || COALESCE(t.name, '')),
        t.subject_id, u.topic_id, 'ARTICLE', CASE WHEN d.access_level = 'PRO' THEN 'PRO' ELSE 'FREE' END,
        true, 200, GREATEST(d.updated_at, v.updated_at)
    FROM public.learning_documents d
    JOIN public.learning_units u ON u.id = d.learning_unit_id AND u.is_active = true
    JOIN public.document_versions v ON v.id = d.current_published_version_id
         AND v.is_published = true AND v.review_status = 'PUBLISHED'
    LEFT JOIN public.topics t ON t.id = u.topic_id
    WHERE d.status = 'PUBLISHED'
    ON CONFLICT (entity_type, source_id) DO UPDATE
        SET canonical_url = EXCLUDED.canonical_url,
            title_en = EXCLUDED.title_en,
            body_snippet_en = EXCLUDED.body_snippet_en,
            normalized_keywords = EXCLUDED.normalized_keywords,
            subject_id = EXCLUDED.subject_id,
            topic_id = EXCLUDED.topic_id,
            access_tier = EXCLUDED.access_tier,
            is_published = EXCLUDED.is_published,
            source_updated_at = EXCLUDED.source_updated_at,
            indexed_at = now();

    -- Entries that are no longer servable (or came from the retired stack) are unpublished.
    UPDATE public.search_indexes si
    SET is_published = false, indexed_at = now()
    WHERE si.is_published = true
      AND (
        si.entity_type = 'RESOURCE'
        OR (si.entity_type = 'ARTICLE' AND NOT EXISTS (
            SELECT 1
            FROM public.learning_documents d
            JOIN public.learning_units u ON u.id = d.learning_unit_id AND u.is_active = true
            JOIN public.document_versions v ON v.id = d.current_published_version_id
                 AND v.is_published = true AND v.review_status = 'PUBLISHED'
            WHERE d.id = si.source_id AND d.status = 'PUBLISHED'))
      );

    -- 3. Courses
    INSERT INTO public.search_indexes (
        entity_type, source_id, canonical_url, title_en, title_hi,
        body_snippet_en, body_snippet_hi, normalized_keywords,
        category, access_tier, is_published, quality_rank, source_updated_at
    )
    SELECT
        'COURSE', c.id, '/courses/' || c.slug, c.title, null,
        c.description, null, lower(c.title || ' ' || COALESCE(c.description, '')),
        'COURSE', CASE WHEN c.access_tier = 'PRO' THEN 'PRO' ELSE 'FREE' END,
        c.is_published, 500, c.updated_at
    FROM public.courses c
    WHERE c.is_published = true
    ON CONFLICT (entity_type, source_id) DO UPDATE
        SET canonical_url = EXCLUDED.canonical_url,
            title_en = EXCLUDED.title_en,
            body_snippet_en = EXCLUDED.body_snippet_en,
            normalized_keywords = EXCLUDED.normalized_keywords,
            is_published = EXCLUDED.is_published,
            source_updated_at = EXCLUDED.source_updated_at,
            indexed_at = now();

    -- 4. Exam Announcements
    INSERT INTO public.search_indexes (
        entity_type, source_id, canonical_url, title_en, title_hi,
        body_snippet_en, body_snippet_hi, normalized_keywords,
        exam_id, category, access_tier, is_published, quality_rank, source_updated_at
    )
    SELECT
        'ANNOUNCEMENT', ea.id, '/exams/announcements/' || ea.id, ea.title, null,
        ea.summary, null, lower(ea.title || ' ' || COALESCE(ea.summary, '')),
        ea.exam_id, 'ANNOUNCEMENT', 'FREE', ea.is_published, 150, ea.updated_at
    FROM public.exam_announcements ea
    WHERE ea.is_published = true
    ON CONFLICT (entity_type, source_id) DO UPDATE
        SET canonical_url = EXCLUDED.canonical_url,
            title_en = EXCLUDED.title_en,
            body_snippet_en = EXCLUDED.body_snippet_en,
            normalized_keywords = EXCLUDED.normalized_keywords,
            is_published = EXCLUDED.is_published,
            source_updated_at = EXCLUDED.source_updated_at,
            indexed_at = now();

    -- 5. Public Resolved Discussion Threads
    INSERT INTO public.search_indexes (
        entity_type, source_id, canonical_url, title_en, title_hi,
        body_snippet_en, body_snippet_hi, normalized_keywords,
        topic_id, category, access_tier, is_published, quality_rank, source_updated_at
    )
    SELECT
        'DISCUSSION', dt.id, '/discussions/' || dt.id, dt.title, null,
        COALESCE(dm.content_markdown, dt.title), null,
        lower(dt.title || ' ' || COALESCE(dm.content_markdown, '')),
        dt.topic_id, 'COMMUNITY', 'FREE', (dt.status IN ('OPEN', 'RESOLVED')), 180, dt.updated_at
    FROM public.discussion_threads dt
    LEFT JOIN public.discussion_messages dm ON dm.id = dt.accepted_answer_id
    WHERE dt.status IN ('OPEN', 'RESOLVED')
    ON CONFLICT (entity_type, source_id) DO UPDATE
        SET canonical_url = EXCLUDED.canonical_url,
            title_en = EXCLUDED.title_en,
            body_snippet_en = EXCLUDED.body_snippet_en,
            normalized_keywords = EXCLUDED.normalized_keywords,
            is_published = EXCLUDED.is_published,
            source_updated_at = EXCLUDED.source_updated_at,
            indexed_at = now();

    SELECT count(*) INTO v_count FROM public.search_indexes WHERE is_published = true;

    RETURN jsonb_build_object(
        'success', true,
        'published_index_count', v_count,
        'reconciled_at', now()
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_submit_flashcard_review(p_card_id uuid, p_rating integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_deck_id UUID;
    v_topic_id UUID;
    v_access_tier TEXT;
    v_card_order INTEGER;
    v_is_curated BOOLEAN;
    v_author_id UUID;
    v_has_pro BOOLEAN := false;
    
    v_prev_rep INTEGER := 0;
    v_prev_interval INTEGER := 1;
    v_prev_ef NUMERIC(4,2) := 2.50;
    v_prev_correct INTEGER := 0;
    v_prev_total INTEGER := 0;
    
    v_new_rep INTEGER;
    v_new_interval INTEGER;
    v_new_ef NUMERIC(4,2);
    v_new_correct INTEGER;
    v_next_due TIMESTAMPTZ;
    
    v_total_cards INTEGER;
    v_mastered_cards INTEGER;
    v_learning_cards INTEGER;
    v_new_cards INTEGER;
    v_mastery_pct NUMERIC(5,2);
    v_gamification_key TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF p_rating NOT BETWEEN 1 AND 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Rating must be an integer between 1 and 4 (1=AGAIN, 2=HARD, 3=GOOD, 4=EASY)');
    END IF;

    -- Validate card and parent deck
    SELECT fc.deck_id, fc.card_order, fd.topic_id, fd.access_tier, fd.is_curated, fd.author_id
    INTO v_deck_id, v_card_order, v_topic_id, v_access_tier, v_is_curated, v_author_id
    FROM public.flashcards fc
    JOIN public.flashcard_decks fd ON fd.id = fc.deck_id
    WHERE fc.id = p_card_id AND fc.is_active = true AND fd.is_published = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Flashcard not found or inactive');
    END IF;

    -- Private deck check
    IF NOT v_is_curated AND v_author_id != v_user_id AND NOT (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied to private deck');
    END IF;

    -- Entitlement verification for PRO curated decks
    IF v_is_curated AND v_access_tier = 'PRO' AND v_card_order > 3 THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements ue
            WHERE ue.user_id = v_user_id
              AND ue.is_active = true
              AND (ue.expires_at IS NULL OR ue.expires_at > now())
        ) INTO v_has_pro;

        IF NOT v_has_pro AND NOT (
            auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
            (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'PRO subscription required to review full deck');
        END IF;
    END IF;

    -- Fetch current card review state if exists
    SELECT repetition_level, interval_days, ease_factor, consecutive_correct, total_reviews
    INTO v_prev_rep, v_prev_interval, v_prev_ef, v_prev_correct, v_prev_total
    FROM public.user_flashcard_reviews
    WHERE user_id = v_user_id AND card_id = p_card_id
    FOR UPDATE;

    IF NOT FOUND THEN
        v_prev_rep := 0;
        v_prev_interval := 1;
        v_prev_ef := 2.50;
        v_prev_correct := 0;
        v_prev_total := 0;
    END IF;

    -- SM-2 Mathematical Interval Scaling
    IF p_rating = 1 THEN -- AGAIN (Fail / Reset)
        v_new_rep := 0;
        v_new_interval := 1;
        v_new_correct := 0;
        v_new_ef := GREATEST(1.30, v_prev_ef - 0.20);
    ELSIF p_rating = 2 THEN -- HARD (Struggled)
        v_new_rep := v_prev_rep + 1;
        v_new_interval := GREATEST(1, floor(v_prev_interval * 1.20)::integer);
        v_new_correct := v_prev_correct + 1;
        v_new_ef := GREATEST(1.30, v_prev_ef - 0.15);
    ELSIF p_rating = 3 THEN -- GOOD (Standard Recall)
        v_new_rep := v_prev_rep + 1;
        IF v_prev_rep = 0 THEN
            v_new_interval := 1;
        ELSIF v_prev_rep = 1 THEN
            v_new_interval := 6;
        ELSE
            v_new_interval := floor(v_prev_interval * v_prev_ef)::integer;
        END IF;
        v_new_correct := v_prev_correct + 1;
        v_new_ef := v_prev_ef;
    ELSE -- EASY (Effortless Recall)
        v_new_rep := v_prev_rep + 1;
        IF v_prev_rep = 0 THEN
            v_new_interval := 4;
        ELSE
            v_new_interval := floor(v_prev_interval * v_prev_ef * 1.30)::integer;
        END IF;
        v_new_correct := v_prev_correct + 1;
        v_new_ef := LEAST(3.50, v_prev_ef + 0.15);
    END IF;

    -- Bound interval between 1 and 365 days
    v_new_interval := LEAST(365, GREATEST(1, v_new_interval));
    v_next_due := now() + (v_new_interval * INTERVAL '1 day');

    -- Upsert card review state
    INSERT INTO public.user_flashcard_reviews (
        user_id, card_id, deck_id, repetition_level, interval_days,
        ease_factor, last_rating, last_reviewed_at, next_review_due_at,
        total_reviews, consecutive_correct, updated_at
    ) VALUES (
        v_user_id, p_card_id, v_deck_id, v_new_rep, v_new_interval,
        v_new_ef, p_rating, now(), v_next_due,
        v_prev_total + 1, v_new_correct, now()
    )
    ON CONFLICT (user_id, card_id) DO UPDATE
        SET repetition_level = EXCLUDED.repetition_level,
            interval_days = EXCLUDED.interval_days,
            ease_factor = EXCLUDED.ease_factor,
            last_rating = EXCLUDED.last_rating,
            last_reviewed_at = EXCLUDED.last_reviewed_at,
            next_review_due_at = EXCLUDED.next_review_due_at,
            total_reviews = EXCLUDED.total_reviews,
            consecutive_correct = EXCLUDED.consecutive_correct,
            updated_at = now();

    -- Recalculate deck progress projection
    SELECT count(*) INTO v_total_cards
    FROM public.flashcards WHERE deck_id = v_deck_id AND is_active = true;

    SELECT 
        COUNT(CASE WHEN ufr.repetition_level >= 3 THEN 1 END),
        COUNT(CASE WHEN ufr.repetition_level BETWEEN 1 AND 2 THEN 1 END)
    INTO v_mastered_cards, v_learning_cards
    FROM public.user_flashcard_reviews ufr
    WHERE ufr.user_id = v_user_id AND ufr.deck_id = v_deck_id;

    v_new_cards := GREATEST(0, v_total_cards - (v_mastered_cards + v_learning_cards));
    IF v_total_cards > 0 THEN
        v_mastery_pct := ROUND(((v_mastered_cards::numeric / v_total_cards::numeric) * 100.0), 2);
    ELSE
        v_mastery_pct := 0.00;
    END IF;

    INSERT INTO public.user_deck_progress (
        user_id, deck_id, total_cards_mastered, total_cards_learning,
        total_cards_new, mastery_percentage, last_reviewed_at, updated_at
    ) VALUES (
        v_user_id, v_deck_id, v_mastered_cards, v_learning_cards,
        v_new_cards, v_mastery_pct, now(), now()
    )
    ON CONFLICT (user_id, deck_id) DO UPDATE
        SET total_cards_mastered = EXCLUDED.total_cards_mastered,
            total_cards_learning = EXCLUDED.total_cards_learning,
            total_cards_new = EXCLUDED.total_cards_new,
            mastery_percentage = EXCLUDED.mastery_percentage,
            last_reviewed_at = EXCLUDED.last_reviewed_at,
            updated_at = now();

    -- Phase 3C Learning Activity Event
    INSERT INTO public.learning_activity_events (
        user_id, topic_id, event_type, metadata, occurred_at
    ) VALUES (
        v_user_id, v_topic_id, 'FLASHCARD_CARD_REVIEWED',
        jsonb_build_object('deck_id', v_deck_id, 'card_id', p_card_id, 'rating', p_rating, 'interval_days', v_new_interval),
        now()
    );

    -- Phase 3D Gamification Reward (1 coin per card per day)
    v_gamification_key := 'fdeck_card_' || p_card_id || '_' || v_user_id || '_' || to_char(now(), 'YYYY-MM-DD');
    INSERT INTO public.gamification_events (
        user_id, event_type, source_type, source_id, idempotency_key,
        verification_status, reward_status, calculated_coins, actual_coins_awarded,
        metadata, occurred_at
    ) VALUES (
        v_user_id, 'FLASHCARD_CARD_REVIEWED', 'FLASHCARD', p_card_id, v_gamification_key,
        'VERIFIED', 'REWARDED', 1, 1,
        jsonb_build_object('deck_id', v_deck_id, 'card_id', p_card_id, 'rating', p_rating),
        now()
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'card_id', p_card_id,
        'deck_id', v_deck_id,
        'rating', p_rating,
        'repetition_level', v_new_rep,
        'interval_days', v_new_interval,
        'ease_factor', v_new_ef,
        'next_review_due_at', v_next_due,
        'mastery_percentage', v_mastery_pct
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_verify_faculty_answer(p_message_id uuid, p_is_verified boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_thread_id UUID;
    v_is_staff BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    v_is_staff := (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff', 'faculty')
    );

    IF NOT v_is_staff THEN
        RETURN jsonb_build_object('success', false, 'error', 'Staff/Faculty authorization required');
    END IF;

    SELECT thread_id INTO v_thread_id
    FROM public.discussion_messages
    WHERE id = p_message_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message not found');
    END IF;

    IF p_is_verified THEN
        UPDATE public.discussion_messages
        SET is_faculty_verified = true,
            verified_by_user_id = v_user_id,
            verified_at = now(),
            updated_at = now()
        WHERE id = p_message_id;

        UPDATE public.discussion_threads
        SET has_faculty_answer = true,
            updated_at = now()
        WHERE id = v_thread_id;
    ELSE
        UPDATE public.discussion_messages
        SET is_faculty_verified = false,
            verified_by_user_id = NULL,
            verified_at = NULL,
            updated_at = now()
        WHERE id = p_message_id;

        -- Check if any other message in thread is faculty verified
        UPDATE public.discussion_threads
        SET has_faculty_answer = EXISTS (
            SELECT 1 FROM public.discussion_messages
            WHERE thread_id = v_thread_id AND is_faculty_verified = true
        ),
        updated_at = now()
        WHERE id = v_thread_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message_id', p_message_id,
        'is_faculty_verified', p_is_verified
    );
END;
$function$;

COMMIT;
