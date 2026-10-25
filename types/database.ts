// GENERATED — DO NOT EDIT — regenerate with `npm run db:types` (TYPES-1; schema: public)
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action_type: string
          actor_email: string
          actor_id: string | null
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          target_entity: string
          target_id: string | null
        }
        Insert: {
          action_type: string
          actor_email: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          target_entity: string
          target_id?: string | null
        }
        Update: {
          action_type?: string
          actor_email?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          target_entity?: string
          target_id?: string | null
        }
        Relationships: []
      }
      algorithm_configs: {
        Row: {
          algorithm_name: string
          created_at: string
          description: string | null
          effective_from: string
          id: string
          is_active: boolean
          parameters: Json
          version_tag: string
        }
        Insert: {
          algorithm_name: string
          created_at?: string
          description?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean
          parameters?: Json
          version_tag: string
        }
        Update: {
          algorithm_name?: string
          created_at?: string
          description?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean
          parameters?: Json
          version_tag?: string
        }
        Relationships: []
      }
      attempt_answers: {
        Row: {
          attempt_id: string
          created_at: string
          evaluated_marks: number | null
          id: string
          is_correct: boolean | null
          is_marked_for_review: boolean
          mock_question_id: string
          question_version_id: string
          selected_option_key: string | null
          time_spent_seconds: number
          updated_at: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          evaluated_marks?: number | null
          id?: string
          is_correct?: boolean | null
          is_marked_for_review?: boolean
          mock_question_id: string
          question_version_id: string
          selected_option_key?: string | null
          time_spent_seconds?: number
          updated_at?: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          evaluated_marks?: number | null
          id?: string
          is_correct?: boolean | null
          is_marked_for_review?: boolean
          mock_question_id?: string
          question_version_id?: string
          selected_option_key?: string | null
          time_spent_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempt_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "test_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_answers_mock_question_id_fkey"
            columns: ["mock_question_id"]
            isOneToOne: false
            referencedRelation: "mock_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_answers_question_version_id_fkey"
            columns: ["question_version_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      attempt_proctor_events: {
        Row: {
          attempt_id: string
          client_seq: number
          event_type: Database["public"]["Enums"]["proctor_event_type"]
          id: number
          occurred_at: string
          user_id: string
        }
        Insert: {
          attempt_id: string
          client_seq: number
          event_type: Database["public"]["Enums"]["proctor_event_type"]
          id?: never
          occurred_at?: string
          user_id: string
        }
        Update: {
          attempt_id?: string
          client_seq?: number
          event_type?: Database["public"]["Enums"]["proctor_event_type"]
          id?: never
          occurred_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempt_proctor_events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "test_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          category: string
          code: string
          coin_reward: number
          created_at: string
          criteria_json: Json
          description: string
          display_order: number
          icon_url: string | null
          id: string
          is_active: boolean
          tier: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          code: string
          coin_reward?: number
          created_at?: string
          criteria_json?: Json
          description: string
          display_order?: number
          icon_url?: string | null
          id?: string
          is_active?: boolean
          tier: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          coin_reward?: number
          created_at?: string
          criteria_json?: Json
          description?: string
          display_order?: number
          icon_url?: string | null
          id?: string
          is_active?: boolean
          tier?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      batch_curriculum_assignments: {
        Row: {
          assigned_by_user_id: string | null
          assignment_type: string
          available_from: string
          batch_id: string
          course_id: string | null
          course_lesson_id: string | null
          created_at: string
          display_order: number
          due_at: string | null
          flashcard_deck_id: string | null
          id: string
          institute_id: string
          instructions_md: string | null
          is_mandatory: boolean
          learning_document_id: string | null
          mock_test_id: string | null
          status: string
          title: string
          topic_id: string | null
          topic_id_node_type: string | null
          updated_at: string
        }
        Insert: {
          assigned_by_user_id?: string | null
          assignment_type: string
          available_from?: string
          batch_id: string
          course_id?: string | null
          course_lesson_id?: string | null
          created_at?: string
          display_order?: number
          due_at?: string | null
          flashcard_deck_id?: string | null
          id?: string
          institute_id: string
          instructions_md?: string | null
          is_mandatory?: boolean
          learning_document_id?: string | null
          mock_test_id?: string | null
          status?: string
          title: string
          topic_id?: string | null
          topic_id_node_type?: string | null
          updated_at?: string
        }
        Update: {
          assigned_by_user_id?: string | null
          assignment_type?: string
          available_from?: string
          batch_id?: string
          course_id?: string | null
          course_lesson_id?: string | null
          created_at?: string
          display_order?: number
          due_at?: string | null
          flashcard_deck_id?: string | null
          id?: string
          institute_id?: string
          instructions_md?: string | null
          is_mandatory?: boolean
          learning_document_id?: string | null
          mock_test_id?: string | null
          status?: string
          title?: string
          topic_id?: string | null
          topic_id_node_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_curriculum_assignments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "institute_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_curriculum_assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_curriculum_assignments_course_lesson_id_fkey"
            columns: ["course_lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_curriculum_assignments_flashcard_deck_id_fkey"
            columns: ["flashcard_deck_id"]
            isOneToOne: false
            referencedRelation: "flashcard_decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_curriculum_assignments_institute_id_fkey"
            columns: ["institute_id"]
            isOneToOne: false
            referencedRelation: "institutes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_curriculum_assignments_learning_document_id_fkey"
            columns: ["learning_document_id"]
            isOneToOne: false
            referencedRelation: "learning_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_curriculum_assignments_mock_test_id_fkey"
            columns: ["mock_test_id"]
            isOneToOne: false
            referencedRelation: "mock_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_curriculum_assignments_topic_id_node_fkey"
            columns: ["topic_id", "topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      batch_memberships: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          institute_id: string
          invited_by_user_id: string | null
          joined_at: string
          left_at: string | null
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          institute_id: string
          invited_by_user_id?: string | null
          joined_at?: string
          left_at?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          institute_id?: string
          invited_by_user_id?: string | null
          joined_at?: string
          left_at?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_memberships_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "institute_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_memberships_institute_id_fkey"
            columns: ["institute_id"]
            isOneToOne: false
            referencedRelation: "institutes"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoices: {
        Row: {
          billing_address: string | null
          billing_name: string
          billing_state: string
          cgst_amount: number
          created_at: string
          currency: string
          gstin: string | null
          id: string
          igst_amount: number
          invoice_date: string
          invoice_number: string
          order_id: string
          place_of_supply: string
          sgst_amount: number
          status: string
          tax_rate_pct: number
          taxable_amount: number
          total_amount: number
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          billing_address?: string | null
          billing_name: string
          billing_state?: string
          cgst_amount?: number
          created_at?: string
          currency?: string
          gstin?: string | null
          id?: string
          igst_amount?: number
          invoice_date?: string
          invoice_number: string
          order_id: string
          place_of_supply?: string
          sgst_amount?: number
          status?: string
          tax_rate_pct?: number
          taxable_amount: number
          total_amount: number
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          billing_address?: string | null
          billing_name?: string
          billing_state?: string
          cgst_amount?: number
          created_at?: string
          currency?: string
          gstin?: string | null
          id?: string
          igst_amount?: number
          invoice_date?: string
          invoice_number?: string
          order_id?: string
          place_of_supply?: string
          sgst_amount?: number
          status?: string
          tax_rate_pct?: number
          taxable_amount?: number
          total_amount?: number
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "payment_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_invoices_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_taxonomy_nodes: {
        Row: {
          created_at: string
          display_order: number
          hierarchy_path: string
          id: string
          is_active: boolean
          legacy_subject_id: string | null
          legacy_subject_id_node_type: string | null
          legacy_subtopic_id: string | null
          legacy_subtopic_id_node_type: string | null
          legacy_topic_id: string | null
          legacy_topic_id_node_type: string | null
          metadata: Json
          name: string
          node_depth: number
          node_type: string
          parent_id: string | null
          root_subject_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          hierarchy_path: string
          id?: string
          is_active?: boolean
          legacy_subject_id?: string | null
          legacy_subject_id_node_type?: string | null
          legacy_subtopic_id?: string | null
          legacy_subtopic_id_node_type?: string | null
          legacy_topic_id?: string | null
          legacy_topic_id_node_type?: string | null
          metadata?: Json
          name: string
          node_depth: number
          node_type?: string
          parent_id?: string | null
          root_subject_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          hierarchy_path?: string
          id?: string
          is_active?: boolean
          legacy_subject_id?: string | null
          legacy_subject_id_node_type?: string | null
          legacy_subtopic_id?: string | null
          legacy_subtopic_id_node_type?: string | null
          legacy_topic_id?: string | null
          legacy_topic_id_node_type?: string | null
          metadata?: Json
          name?: string
          node_depth?: number
          node_type?: string
          parent_id?: string | null
          root_subject_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_taxonomy_nodes_legacy_subject_id_node_fkey"
            columns: ["legacy_subject_id", "legacy_subject_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
          {
            foreignKeyName: "canonical_taxonomy_nodes_legacy_subtopic_id_node_fkey"
            columns: ["legacy_subtopic_id", "legacy_subtopic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
          {
            foreignKeyName: "canonical_taxonomy_nodes_legacy_topic_id_node_fkey"
            columns: ["legacy_topic_id", "legacy_topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
          {
            foreignKeyName: "canonical_taxonomy_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_taxonomy_nodes_root_subject_id_fkey"
            columns: ["root_subject_id"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      coin_ledger: {
        Row: {
          admin_user_id: string | null
          amount: number
          balance_after: number
          created_at: string
          direction: string
          id: string
          idempotency_key: string
          metadata: Json | null
          reason_code: string
          reversal_of_ledger_id: string | null
          source_event_id: string | null
          source_id: string | null
          source_type: string
          transaction_type: string
          user_id: string
        }
        Insert: {
          admin_user_id?: string | null
          amount: number
          balance_after: number
          created_at?: string
          direction: string
          id?: string
          idempotency_key: string
          metadata?: Json | null
          reason_code: string
          reversal_of_ledger_id?: string | null
          source_event_id?: string | null
          source_id?: string | null
          source_type: string
          transaction_type: string
          user_id: string
        }
        Update: {
          admin_user_id?: string | null
          amount?: number
          balance_after?: number
          created_at?: string
          direction?: string
          id?: string
          idempotency_key?: string
          metadata?: Json | null
          reason_code?: string
          reversal_of_ledger_id?: string | null
          source_event_id?: string | null
          source_id?: string | null
          source_type?: string
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coin_ledger_reversal_of_ledger_id_fkey"
            columns: ["reversal_of_ledger_id"]
            isOneToOne: false
            referencedRelation: "coin_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coin_ledger_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "gamification_events"
            referencedColumns: ["id"]
          },
        ]
      }
      coin_wallets: {
        Row: {
          created_at: string
          current_balance: number
          freezes_held: number
          is_locked: boolean
          last_transaction_at: string | null
          lifetime_earned: number
          lifetime_spent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_balance?: number
          freezes_held?: number
          is_locked?: boolean
          last_transaction_at?: string | null
          lifetime_earned?: number
          lifetime_spent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_balance?: number
          freezes_held?: number
          is_locked?: boolean
          last_transaction_at?: string | null
          lifetime_earned?: number
          lifetime_spent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conducting_orgs: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          official_website: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          official_website?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          official_website?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          committed_at: string | null
          coupon_id: string
          created_at: string
          discount_amount: number
          id: string
          order_id: string
          released_at: string | null
          reserved_at: string
          status: string
          user_id: string
        }
        Insert: {
          committed_at?: string | null
          coupon_id: string
          created_at?: string
          discount_amount: number
          id?: string
          order_id: string
          released_at?: string | null
          reserved_at?: string
          status?: string
          user_id: string
        }
        Update: {
          committed_at?: string | null
          coupon_id?: string
          created_at?: string
          discount_amount?: number
          id?: string
          order_id?: string
          released_at?: string | null
          reserved_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "discount_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "payment_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      course_lessons: {
        Row: {
          created_at: string
          display_order: number
          duration_seconds: number
          id: string
          is_free_preview: boolean
          is_published: boolean
          learning_document_id: string | null
          lesson_type: string
          module_id: string
          slug: string
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          duration_seconds?: number
          id?: string
          is_free_preview?: boolean
          is_published?: boolean
          learning_document_id?: string | null
          lesson_type?: string
          module_id: string
          slug: string
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          duration_seconds?: number
          id?: string
          is_free_preview?: boolean
          is_published?: boolean
          learning_document_id?: string | null
          lesson_type?: string
          module_id?: string
          slug?: string
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_lessons_learning_document_id_fkey"
            columns: ["learning_document_id"]
            isOneToOne: false
            referencedRelation: "learning_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      course_modules: {
        Row: {
          course_id: string
          created_at: string
          display_order: number
          id: string
          is_published: boolean
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          display_order?: number
          id?: string
          is_published?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_published?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          access_tier: string
          author_id: string | null
          created_at: string
          description: string | null
          id: string
          is_published: boolean
          price_inr: number
          slug: string
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          access_tier?: string
          author_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          price_inr?: number
          slug: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          access_tier?: string
          author_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          price_inr?: number
          slug?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      current_affairs_article_versions: {
        Row: {
          article_id: string
          checksum_sha256: string
          compiled_ast_json: Json | null
          created_at: string
          created_by: string | null
          exam_relevance_notes: Json | null
          headline: string
          id: string
          important_facts: Json
          key_takeaways: Json
          provenance_sources: Json
          published_at: string | null
          reviewed_by: string | null
          status: string
          summary_md: string
          updated_at: string
          validation_flags: Json
          version_number: number
        }
        Insert: {
          article_id: string
          checksum_sha256: string
          compiled_ast_json?: Json | null
          created_at?: string
          created_by?: string | null
          exam_relevance_notes?: Json | null
          headline: string
          id?: string
          important_facts?: Json
          key_takeaways?: Json
          provenance_sources?: Json
          published_at?: string | null
          reviewed_by?: string | null
          status?: string
          summary_md: string
          updated_at?: string
          validation_flags?: Json
          version_number: number
        }
        Update: {
          article_id?: string
          checksum_sha256?: string
          compiled_ast_json?: Json | null
          created_at?: string
          created_by?: string | null
          exam_relevance_notes?: Json | null
          headline?: string
          id?: string
          important_facts?: Json
          key_takeaways?: Json
          provenance_sources?: Json
          published_at?: string | null
          reviewed_by?: string | null
          status?: string
          summary_md?: string
          updated_at?: string
          validation_flags?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "current_affairs_article_versions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "current_affairs_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      current_affairs_articles: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          daily_quiz_mock_id: string | null
          id: string
          importance_tier: string
          news_date: string
          published_at: string | null
          published_version_id: string | null
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          daily_quiz_mock_id?: string | null
          id?: string
          importance_tier?: string
          news_date: string
          published_at?: string | null
          published_version_id?: string | null
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          daily_quiz_mock_id?: string | null
          id?: string
          importance_tier?: string
          news_date?: string
          published_at?: string | null
          published_version_id?: string | null
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "current_affairs_articles_daily_quiz_mock_id_fkey"
            columns: ["daily_quiz_mock_id"]
            isOneToOne: false
            referencedRelation: "mock_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ca_articles_published_version"
            columns: ["published_version_id"]
            isOneToOne: false
            referencedRelation: "current_affairs_article_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      current_affairs_exam_mappings: {
        Row: {
          article_id: string
          created_at: string
          display_priority: number
          exam_id: string
          id: string
          is_high_yield: boolean
          relevance_weight: string
        }
        Insert: {
          article_id: string
          created_at?: string
          display_priority?: number
          exam_id: string
          id?: string
          is_high_yield?: boolean
          relevance_weight?: string
        }
        Update: {
          article_id?: string
          created_at?: string
          display_priority?: number
          exam_id?: string
          id?: string
          is_high_yield?: boolean
          relevance_weight?: string
        }
        Relationships: [
          {
            foreignKeyName: "current_affairs_exam_mappings_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "current_affairs_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "current_affairs_exam_mappings_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      current_affairs_learning_mappings: {
        Row: {
          article_id: string
          created_at: string
          display_order: number
          id: string
          learning_document_id: string
        }
        Insert: {
          article_id: string
          created_at?: string
          display_order?: number
          id?: string
          learning_document_id: string
        }
        Update: {
          article_id?: string
          created_at?: string
          display_order?: number
          id?: string
          learning_document_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "current_affairs_learning_mappings_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "current_affairs_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "current_affairs_learning_mappings_learning_document_id_fkey"
            columns: ["learning_document_id"]
            isOneToOne: false
            referencedRelation: "learning_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      current_affairs_question_mappings: {
        Row: {
          article_id: string
          created_at: string
          display_order: number
          id: string
          question_id: string
        }
        Insert: {
          article_id: string
          created_at?: string
          display_order?: number
          id?: string
          question_id: string
        }
        Update: {
          article_id?: string
          created_at?: string
          display_order?: number
          id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "current_affairs_question_mappings_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "current_affairs_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "current_affairs_question_mappings_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      current_affairs_sources: {
        Row: {
          citation_context: string | null
          created_at: string
          id: string
          publisher: string
          retrieved_at: string
          tier: string
          title: string
          url: string
          version_id: string
        }
        Insert: {
          citation_context?: string | null
          created_at?: string
          id?: string
          publisher: string
          retrieved_at?: string
          tier: string
          title: string
          url: string
          version_id: string
        }
        Update: {
          citation_context?: string | null
          created_at?: string
          id?: string
          publisher?: string
          retrieved_at?: string
          tier?: string
          title?: string
          url?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "current_affairs_sources_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "current_affairs_article_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      current_affairs_taxonomy_mappings: {
        Row: {
          article_id: string
          created_at: string
          id: string
          is_primary: boolean
          relevance_score: number
          taxonomy_node_id: string
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          relevance_score?: number
          taxonomy_node_id: string
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          relevance_score?: number
          taxonomy_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "current_affairs_taxonomy_mappings_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "current_affairs_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "current_affairs_taxonomy_mappings_taxonomy_node_id_fkey"
            columns: ["taxonomy_node_id"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_practice_sessions: {
        Row: {
          accuracy_pct: number | null
          completed_at: string | null
          created_at: string
          id: string
          question_version_ids_json: Json
          score: number | null
          session_mode: string
          status: string
          target_topic_ids_json: Json
          test_attempt_id: string | null
          title: string
          total_questions: number
          user_id: string
        }
        Insert: {
          accuracy_pct?: number | null
          completed_at?: string | null
          created_at?: string
          id?: string
          question_version_ids_json: Json
          score?: number | null
          session_mode: string
          status?: string
          target_topic_ids_json?: Json
          test_attempt_id?: string | null
          title: string
          total_questions: number
          user_id: string
        }
        Update: {
          accuracy_pct?: number | null
          completed_at?: string | null
          created_at?: string
          id?: string
          question_version_ids_json?: Json
          score?: number | null
          session_mode?: string
          status?: string
          target_topic_ids_json?: Json
          test_attempt_id?: string | null
          title?: string
          total_questions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_practice_sessions_test_attempt_id_fkey"
            columns: ["test_attempt_id"]
            isOneToOne: true
            referencedRelation: "test_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_study_recommendations: {
        Row: {
          action_type: string
          completed_at: string | null
          course_lesson_id: string | null
          created_at: string
          custom_practice_id: string | null
          engine_version: string
          generated_at: string
          id: string
          learning_document_id: string | null
          priority_rank: number
          priority_score: number
          reason_code: string
          reason_text_snapshot: string
          recommendation_date: string
          signal_snapshot_json: Json
          status: string
          topic_id: string | null
          topic_id_node_type: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          completed_at?: string | null
          course_lesson_id?: string | null
          created_at?: string
          custom_practice_id?: string | null
          engine_version?: string
          generated_at?: string
          id?: string
          learning_document_id?: string | null
          priority_rank: number
          priority_score: number
          reason_code: string
          reason_text_snapshot: string
          recommendation_date?: string
          signal_snapshot_json?: Json
          status?: string
          topic_id?: string | null
          topic_id_node_type?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          completed_at?: string | null
          course_lesson_id?: string | null
          created_at?: string
          custom_practice_id?: string | null
          engine_version?: string
          generated_at?: string
          id?: string
          learning_document_id?: string | null
          priority_rank?: number
          priority_score?: number
          reason_code?: string
          reason_text_snapshot?: string
          recommendation_date?: string
          signal_snapshot_json?: Json
          status?: string
          topic_id?: string | null
          topic_id_node_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_study_recommendations_course_lesson_id_fkey"
            columns: ["course_lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_study_recommendations_custom_practice_id_fkey"
            columns: ["custom_practice_id"]
            isOneToOne: false
            referencedRelation: "custom_practice_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_study_recommendations_learning_document_id_fkey"
            columns: ["learning_document_id"]
            isOneToOne: false
            referencedRelation: "learning_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_study_recommendations_topic_id_node_fkey"
            columns: ["topic_id", "topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      descriptive_questions: {
        Row: {
          created_at: string
          difficulty: string
          evaluation_guidelines_md: string | null
          exam_id: string | null
          id: string
          is_published: boolean
          max_marks: number
          model_answer_md: string | null
          question_text: string
          slug: string
          subject_id: string | null
          subject_id_node_type: string | null
          time_limit_minutes: number | null
          title: string
          topic_id: string | null
          topic_id_node_type: string | null
          updated_at: string
          word_limit_max: number
          word_limit_min: number | null
        }
        Insert: {
          created_at?: string
          difficulty?: string
          evaluation_guidelines_md?: string | null
          exam_id?: string | null
          id?: string
          is_published?: boolean
          max_marks?: number
          model_answer_md?: string | null
          question_text: string
          slug: string
          subject_id?: string | null
          subject_id_node_type?: string | null
          time_limit_minutes?: number | null
          title: string
          topic_id?: string | null
          topic_id_node_type?: string | null
          updated_at?: string
          word_limit_max?: number
          word_limit_min?: number | null
        }
        Update: {
          created_at?: string
          difficulty?: string
          evaluation_guidelines_md?: string | null
          exam_id?: string | null
          id?: string
          is_published?: boolean
          max_marks?: number
          model_answer_md?: string | null
          question_text?: string
          slug?: string
          subject_id?: string | null
          subject_id_node_type?: string | null
          time_limit_minutes?: number | null
          title?: string
          topic_id?: string | null
          topic_id_node_type?: string | null
          updated_at?: string
          word_limit_max?: number
          word_limit_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "descriptive_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descriptive_questions_subject_id_node_fkey"
            columns: ["subject_id", "subject_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
          {
            foreignKeyName: "descriptive_questions_topic_id_node_fkey"
            columns: ["topic_id", "topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      diagnostic_assessments: {
        Row: {
          created_at: string
          description: string | null
          exam_id: string
          id: string
          is_active: boolean
          mock_template_id: string
          target_duration_minutes: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          exam_id: string
          id?: string
          is_active?: boolean
          mock_template_id: string
          target_duration_minutes?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          exam_id?: string
          id?: string
          is_active?: boolean
          mock_template_id?: string
          target_duration_minutes?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_assessments_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_assessments_mock_template_id_fkey"
            columns: ["mock_template_id"]
            isOneToOne: false
            referencedRelation: "mock_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_coupons: {
        Row: {
          applicability_scope: string
          coupon_code: string
          created_at: string
          current_usage_count: number
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_discount_inr: number | null
          max_total_usage: number | null
          max_usage_per_user: number
          min_order_inr: number
          starts_at: string
          updated_at: string
        }
        Insert: {
          applicability_scope?: string
          coupon_code: string
          created_at?: string
          current_usage_count?: number
          discount_type: string
          discount_value: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_discount_inr?: number | null
          max_total_usage?: number | null
          max_usage_per_user?: number
          min_order_inr?: number
          starts_at?: string
          updated_at?: string
        }
        Update: {
          applicability_scope?: string
          coupon_code?: string
          created_at?: string
          current_usage_count?: number
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_discount_inr?: number | null
          max_total_usage?: number | null
          max_usage_per_user?: number
          min_order_inr?: number
          starts_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      discussion_messages: {
        Row: {
          author_id: string
          content_markdown: string
          created_at: string
          deleted_at: string | null
          id: string
          is_deleted: boolean
          is_faculty_verified: boolean
          parent_message_id: string | null
          thread_id: string
          updated_at: string
          upvote_count: number
          verified_at: string | null
          verified_by_user_id: string | null
        }
        Insert: {
          author_id: string
          content_markdown: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean
          is_faculty_verified?: boolean
          parent_message_id?: string | null
          thread_id: string
          updated_at?: string
          upvote_count?: number
          verified_at?: string | null
          verified_by_user_id?: string | null
        }
        Update: {
          author_id?: string
          content_markdown?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean
          is_faculty_verified?: boolean
          parent_message_id?: string | null
          thread_id?: string
          updated_at?: string
          upvote_count?: number
          verified_at?: string | null
          verified_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discussion_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "discussion_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "discussion_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      discussion_moderation_flags: {
        Row: {
          created_at: string
          details: string | null
          id: string
          moderated_at: string | null
          moderated_by_user_id: string | null
          moderation_note: string | null
          reason: string
          reported_by_user_id: string
          resolution_action: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          moderated_at?: string | null
          moderated_by_user_id?: string | null
          moderation_note?: string | null
          reason: string
          reported_by_user_id: string
          resolution_action?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          moderated_at?: string | null
          moderated_by_user_id?: string | null
          moderation_note?: string | null
          reason?: string
          reported_by_user_id?: string
          resolution_action?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      discussion_threads: {
        Row: {
          accepted_answer_id: string | null
          author_id: string
          context_type: string
          created_at: string
          has_faculty_answer: boolean
          id: string
          is_pinned: boolean
          last_activity_at: string
          learning_document_id: string | null
          lesson_id: string | null
          message_count: number
          question_id: string | null
          status: string
          title: string
          topic_id: string | null
          topic_id_node_type: string | null
          updated_at: string
          upvote_count: number
          view_count: number
        }
        Insert: {
          accepted_answer_id?: string | null
          author_id: string
          context_type: string
          created_at?: string
          has_faculty_answer?: boolean
          id?: string
          is_pinned?: boolean
          last_activity_at?: string
          learning_document_id?: string | null
          lesson_id?: string | null
          message_count?: number
          question_id?: string | null
          status?: string
          title: string
          topic_id?: string | null
          topic_id_node_type?: string | null
          updated_at?: string
          upvote_count?: number
          view_count?: number
        }
        Update: {
          accepted_answer_id?: string | null
          author_id?: string
          context_type?: string
          created_at?: string
          has_faculty_answer?: boolean
          id?: string
          is_pinned?: boolean
          last_activity_at?: string
          learning_document_id?: string | null
          lesson_id?: string | null
          message_count?: number
          question_id?: string | null
          status?: string
          title?: string
          topic_id?: string | null
          topic_id_node_type?: string | null
          updated_at?: string
          upvote_count?: number
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "discussion_threads_learning_document_id_fkey"
            columns: ["learning_document_id"]
            isOneToOne: false
            referencedRelation: "learning_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_threads_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_threads_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_threads_topic_id_node_fkey"
            columns: ["topic_id", "topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
          {
            foreignKeyName: "fk_thread_accepted_answer"
            columns: ["accepted_answer_id"]
            isOneToOne: false
            referencedRelation: "discussion_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      discussion_votes: {
        Row: {
          created_at: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discussion_votes_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "discussion_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          approved_by_user_id: string | null
          author_type: string
          compiled_artifact_hash: string
          compiled_artifact_storage_key: string
          compiler_version: string
          component_contract_version: string
          created_at: string
          document_id: string
          id: string
          is_published: boolean
          published_at: string | null
          review_status: string
          schema_version: string
          source_spec_hash: string
          source_spec_storage_key: string
          updated_at: string
          version_number: number
        }
        Insert: {
          approved_by_user_id?: string | null
          author_type?: string
          compiled_artifact_hash: string
          compiled_artifact_storage_key: string
          compiler_version?: string
          component_contract_version?: string
          created_at?: string
          document_id: string
          id?: string
          is_published?: boolean
          published_at?: string | null
          review_status?: string
          schema_version?: string
          source_spec_hash: string
          source_spec_storage_key: string
          updated_at?: string
          version_number: number
        }
        Update: {
          approved_by_user_id?: string | null
          author_type?: string
          compiled_artifact_hash?: string
          compiled_artifact_storage_key?: string
          compiler_version?: string
          component_contract_version?: string
          created_at?: string
          document_id?: string
          id?: string
          is_published?: boolean
          published_at?: string | null
          review_status?: string
          schema_version?: string
          source_spec_hash?: string
          source_spec_storage_key?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "learning_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_rubrics: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          criteria: Json
          description: string | null
          exam_id: string | null
          id: string
          is_active: boolean
          max_total_score: number
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          criteria?: Json
          description?: string | null
          exam_id?: string | null
          id?: string
          is_active?: boolean
          max_total_score?: number
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          criteria?: Json
          description?: string | null
          exam_id?: string | null
          id?: string
          is_active?: boolean
          max_total_score?: number
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_rubrics_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_announcements: {
        Row: {
          announcement_type: string
          created_at: string
          created_by_user_id: string | null
          exam_cycle_id: string | null
          exam_id: string
          id: string
          is_published: boolean
          official_source_url: string | null
          priority: string
          published_at: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          announcement_type: string
          created_at?: string
          created_by_user_id?: string | null
          exam_cycle_id?: string | null
          exam_id: string
          id?: string
          is_published?: boolean
          official_source_url?: string | null
          priority?: string
          published_at?: string
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          announcement_type?: string
          created_at?: string
          created_by_user_id?: string | null
          exam_cycle_id?: string | null
          exam_id?: string
          id?: string
          is_published?: boolean
          official_source_url?: string | null
          priority?: string
          published_at?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_announcements_exam_cycle_id_fkey"
            columns: ["exam_cycle_id"]
            isOneToOne: false
            referencedRelation: "exam_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_announcements_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_claim_sources: {
        Row: {
          claim_id: string
          created_at: string
          page_or_clause_reference: string | null
          source_id: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          page_or_clause_reference?: string | null
          source_id: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          page_or_clause_reference?: string | null
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_claim_sources_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "exam_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_claim_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "exam_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_claims: {
        Row: {
          claim_key: string
          created_at: string
          doc_version_id: string | null
          effective_end_date: string | null
          effective_start_date: string | null
          exam_cycle_id: string | null
          exam_id: string
          id: string
          stated_value: string
          updated_at: string
          value_data_type: string
          verification_status: string
        }
        Insert: {
          claim_key: string
          created_at?: string
          doc_version_id?: string | null
          effective_end_date?: string | null
          effective_start_date?: string | null
          exam_cycle_id?: string | null
          exam_id: string
          id?: string
          stated_value: string
          updated_at?: string
          value_data_type?: string
          verification_status?: string
        }
        Update: {
          claim_key?: string
          created_at?: string
          doc_version_id?: string | null
          effective_end_date?: string | null
          effective_start_date?: string | null
          exam_cycle_id?: string | null
          exam_id?: string
          id?: string
          stated_value?: string
          updated_at?: string
          value_data_type?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_claims_doc_version_id_fkey"
            columns: ["doc_version_id"]
            isOneToOne: false
            referencedRelation: "exam_doc_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_claims_exam_cycle_id_fkey"
            columns: ["exam_cycle_id"]
            isOneToOne: false
            referencedRelation: "exam_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_claims_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_cutoff_benchmarks: {
        Row: {
          category: string
          created_at: string
          cutoff_marks: number
          cutoff_pct: number | null
          exam_cycle_id: string
          exam_id: string
          id: string
          provenance_notes: string | null
          stage: string
          total_marks: number
          year: number
        }
        Insert: {
          category: string
          created_at?: string
          cutoff_marks: number
          cutoff_pct?: number | null
          exam_cycle_id: string
          exam_id: string
          id?: string
          provenance_notes?: string | null
          stage?: string
          total_marks: number
          year: number
        }
        Update: {
          category?: string
          created_at?: string
          cutoff_marks?: number
          cutoff_pct?: number | null
          exam_cycle_id?: string
          exam_id?: string
          id?: string
          provenance_notes?: string | null
          stage?: string
          total_marks?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_cutoff_benchmarks_exam_cycle_id_fkey"
            columns: ["exam_cycle_id"]
            isOneToOne: false
            referencedRelation: "exam_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_cutoff_benchmarks_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_cycles: {
        Row: {
          application_end_date: string | null
          application_start_date: string | null
          created_at: string
          cycle_year: number
          exam_id: string
          exam_window_end: string | null
          exam_window_start: string | null
          id: string
          notification_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          application_end_date?: string | null
          application_start_date?: string | null
          created_at?: string
          cycle_year: number
          exam_id: string
          exam_window_end?: string | null
          exam_window_start?: string | null
          id?: string
          notification_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          application_end_date?: string | null
          application_start_date?: string | null
          created_at?: string
          cycle_year?: number
          exam_id?: string
          exam_window_end?: string | null
          exam_window_start?: string | null
          id?: string
          notification_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_cycles_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_doc_versions: {
        Row: {
          approved_by_user_id: string | null
          author_type: string
          compiled_artifact_hash: string | null
          compiled_artifact_storage_key: string | null
          compiled_mdx: string | null
          created_at: string
          document_id: string
          id: string
          is_published: boolean
          published_at: string | null
          review_feedback: string | null
          review_status: string
          reviewed_at: string | null
          schema_version: string
          source_spec_hash: string | null
          source_spec_storage_key: string | null
          structured_payload: Json
          updated_at: string
          version_number: number
        }
        Insert: {
          approved_by_user_id?: string | null
          author_type?: string
          compiled_artifact_hash?: string | null
          compiled_artifact_storage_key?: string | null
          compiled_mdx?: string | null
          created_at?: string
          document_id: string
          id?: string
          is_published?: boolean
          published_at?: string | null
          review_feedback?: string | null
          review_status?: string
          reviewed_at?: string | null
          schema_version?: string
          source_spec_hash?: string | null
          source_spec_storage_key?: string | null
          structured_payload?: Json
          updated_at?: string
          version_number?: number
        }
        Update: {
          approved_by_user_id?: string | null
          author_type?: string
          compiled_artifact_hash?: string | null
          compiled_artifact_storage_key?: string | null
          compiled_mdx?: string | null
          created_at?: string
          document_id?: string
          id?: string
          is_published?: boolean
          published_at?: string | null
          review_feedback?: string | null
          review_status?: string
          reviewed_at?: string | null
          schema_version?: string
          source_spec_hash?: string | null
          source_spec_storage_key?: string | null
          structured_payload?: Json
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_doc_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "exam_knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_knowledge_documents: {
        Row: {
          canonical_slug: string
          created_at: string
          current_published_version_id: string | null
          exam_cycle_id: string | null
          exam_id: string
          id: string
          language: string
          module_key: string
          status: string
          updated_at: string
        }
        Insert: {
          canonical_slug: string
          created_at?: string
          current_published_version_id?: string | null
          exam_cycle_id?: string | null
          exam_id: string
          id?: string
          language?: string
          module_key: string
          status?: string
          updated_at?: string
        }
        Update: {
          canonical_slug?: string
          created_at?: string
          current_published_version_id?: string | null
          exam_cycle_id?: string | null
          exam_id?: string
          id?: string
          language?: string
          module_key?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_knowledge_documents_exam_cycle_id_fkey"
            columns: ["exam_cycle_id"]
            isOneToOne: false
            referencedRelation: "exam_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_knowledge_documents_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_exam_docs_current_pub_version"
            columns: ["current_published_version_id"]
            isOneToOne: false
            referencedRelation: "exam_doc_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_patterns: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number
          exam_cycle_id: string
          id: string
          is_active: boolean
          name: string
          negative_mark_value: number
          negative_marking_type: string
          passing_marks: number | null
          tier_name: string
          total_marks: number
          total_questions: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes: number
          exam_cycle_id: string
          id?: string
          is_active?: boolean
          name: string
          negative_mark_value?: number
          negative_marking_type?: string
          passing_marks?: number | null
          tier_name?: string
          total_marks: number
          total_questions: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number
          exam_cycle_id?: string
          id?: string
          is_active?: boolean
          name?: string
          negative_mark_value?: number
          negative_marking_type?: string
          passing_marks?: number | null
          tier_name?: string
          total_marks?: number
          total_questions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_patterns_exam_cycle_id_fkey"
            columns: ["exam_cycle_id"]
            isOneToOne: false
            referencedRelation: "exam_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_posts: {
        Row: {
          classification_group: string | null
          cpc_basic_pay_max: number | null
          cpc_basic_pay_min: number | null
          created_at: string
          department: string | null
          display_order: number
          exam_id: string
          grade_pay: number | null
          id: string
          is_active: boolean
          is_gazetted: boolean
          ministry: string | null
          pay_level: number
          post_code: string | null
          post_name: string
          updated_at: string
        }
        Insert: {
          classification_group?: string | null
          cpc_basic_pay_max?: number | null
          cpc_basic_pay_min?: number | null
          created_at?: string
          department?: string | null
          display_order?: number
          exam_id: string
          grade_pay?: number | null
          id?: string
          is_active?: boolean
          is_gazetted?: boolean
          ministry?: string | null
          pay_level?: number
          post_code?: string | null
          post_name: string
          updated_at?: string
        }
        Update: {
          classification_group?: string | null
          cpc_basic_pay_max?: number | null
          cpc_basic_pay_min?: number | null
          created_at?: string
          department?: string | null
          display_order?: number
          exam_id?: string
          grade_pay?: number | null
          id?: string
          is_active?: boolean
          is_gazetted?: boolean
          ministry?: string | null
          pay_level?: number
          post_code?: string | null
          post_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_posts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_question_mappings: {
        Row: {
          created_at: string
          exam_id: string
          id: string
          question_id: string
          relevance_score: number | null
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          question_id: string
          relevance_score?: number | null
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          question_id?: string
          relevance_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_question_mappings_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_question_mappings_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_sources: {
        Row: {
          created_at: string
          document_checksum: string | null
          effective_date: string | null
          exam_cycle_id: string | null
          exam_id: string
          id: string
          issuing_authority: string
          notes: string | null
          published_date: string | null
          source_type: string
          source_url: string
          title: string
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          document_checksum?: string | null
          effective_date?: string | null
          exam_cycle_id?: string | null
          exam_id: string
          id?: string
          issuing_authority: string
          notes?: string | null
          published_date?: string | null
          source_type: string
          source_url: string
          title: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          document_checksum?: string | null
          effective_date?: string | null
          exam_cycle_id?: string | null
          exam_id?: string
          id?: string
          issuing_authority?: string
          notes?: string | null
          published_date?: string | null
          source_type?: string
          source_url?: string
          title?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_sources_exam_cycle_id_fkey"
            columns: ["exam_cycle_id"]
            isOneToOne: false
            referencedRelation: "exam_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sources_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_syllabus_canonical_mappings: {
        Row: {
          candidate_matches: Json | null
          canonical_node_id: string | null
          canonical_node_type: string | null
          created_at: string
          id: string
          mapping_weight: number | null
          match_confidence: number
          match_method: string | null
          match_notes: string | null
          match_status: string
          reconciliation_metadata: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          syllabus_node_id: string
          updated_at: string
        }
        Insert: {
          candidate_matches?: Json | null
          canonical_node_id?: string | null
          canonical_node_type?: string | null
          created_at?: string
          id?: string
          mapping_weight?: number | null
          match_confidence?: number
          match_method?: string | null
          match_notes?: string | null
          match_status: string
          reconciliation_metadata?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          syllabus_node_id: string
          updated_at?: string
        }
        Update: {
          candidate_matches?: Json | null
          canonical_node_id?: string | null
          canonical_node_type?: string | null
          created_at?: string
          id?: string
          mapping_weight?: number | null
          match_confidence?: number
          match_method?: string | null
          match_notes?: string | null
          match_status?: string
          reconciliation_metadata?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          syllabus_node_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_syllabus_canonical_mappings_syllabus_node_id_fkey"
            columns: ["syllabus_node_id"]
            isOneToOne: false
            referencedRelation: "exam_syllabus_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_syllabus_canonical_mappings_topic_fkey"
            columns: ["canonical_node_id", "canonical_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      exam_syllabus_nodes: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          expected_questions_max: number | null
          expected_questions_min: number | null
          id: string
          is_mandatory: boolean
          node_depth: number
          node_kind: string
          parent_node_id: string | null
          raw_slug: string
          raw_title: string
          required_cognitive_depth: string | null
          syllabus_version_id: string
          updated_at: string
          weightage_tier: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          expected_questions_max?: number | null
          expected_questions_min?: number | null
          id?: string
          is_mandatory?: boolean
          node_depth: number
          node_kind?: string
          parent_node_id?: string | null
          raw_slug: string
          raw_title: string
          required_cognitive_depth?: string | null
          syllabus_version_id: string
          updated_at?: string
          weightage_tier?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          expected_questions_max?: number | null
          expected_questions_min?: number | null
          id?: string
          is_mandatory?: boolean
          node_depth?: number
          node_kind?: string
          parent_node_id?: string | null
          raw_slug?: string
          raw_title?: string
          required_cognitive_depth?: string | null
          syllabus_version_id?: string
          updated_at?: string
          weightage_tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_syllabus_nodes_parent_node_id_fkey"
            columns: ["parent_node_id"]
            isOneToOne: false
            referencedRelation: "exam_syllabus_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_syllabus_nodes_syllabus_version_id_fkey"
            columns: ["syllabus_version_id"]
            isOneToOne: false
            referencedRelation: "exam_syllabus_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_syllabus_versions: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          exam_cycle_id: string | null
          exam_id: string
          id: string
          is_active: boolean
          metadata: Json
          published_at: string | null
          published_by: string | null
          raw_payload_hash: string | null
          source_document_id: string | null
          source_kind: string
          status: string
          supersedes_version_id: string | null
          updated_at: string
          version_number: number
          version_tag: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          exam_cycle_id?: string | null
          exam_id: string
          id?: string
          is_active?: boolean
          metadata?: Json
          published_at?: string | null
          published_by?: string | null
          raw_payload_hash?: string | null
          source_document_id?: string | null
          source_kind?: string
          status?: string
          supersedes_version_id?: string | null
          updated_at?: string
          version_number: number
          version_tag: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          exam_cycle_id?: string | null
          exam_id?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          published_at?: string | null
          published_by?: string | null
          raw_payload_hash?: string | null
          source_document_id?: string | null
          source_kind?: string
          status?: string
          supersedes_version_id?: string | null
          updated_at?: string
          version_number?: number
          version_tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_syllabus_versions_exam_cycle_id_fkey"
            columns: ["exam_cycle_id"]
            isOneToOne: false
            referencedRelation: "exam_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_syllabus_versions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_syllabus_versions_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "exam_knowledge_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_syllabus_versions_supersedes_version_id_fkey"
            columns: ["supersedes_version_id"]
            isOneToOne: false
            referencedRelation: "exam_syllabus_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          org_id: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          org_id: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          org_id?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "conducting_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_decks: {
        Row: {
          access_tier: string
          author_id: string | null
          card_count: number
          created_at: string
          description: string | null
          exam_id: string | null
          id: string
          is_curated: boolean
          is_published: boolean
          slug: string
          subject_id: string | null
          subject_id_node_type: string | null
          title_en: string
          title_hi: string | null
          topic_id: string | null
          topic_id_node_type: string | null
          updated_at: string
        }
        Insert: {
          access_tier?: string
          author_id?: string | null
          card_count?: number
          created_at?: string
          description?: string | null
          exam_id?: string | null
          id?: string
          is_curated?: boolean
          is_published?: boolean
          slug: string
          subject_id?: string | null
          subject_id_node_type?: string | null
          title_en: string
          title_hi?: string | null
          topic_id?: string | null
          topic_id_node_type?: string | null
          updated_at?: string
        }
        Update: {
          access_tier?: string
          author_id?: string | null
          card_count?: number
          created_at?: string
          description?: string | null
          exam_id?: string | null
          id?: string
          is_curated?: boolean
          is_published?: boolean
          slug?: string
          subject_id?: string | null
          subject_id_node_type?: string | null
          title_en?: string
          title_hi?: string | null
          topic_id?: string | null
          topic_id_node_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_decks_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_decks_subject_id_node_fkey"
            columns: ["subject_id", "subject_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
          {
            foreignKeyName: "flashcard_decks_topic_id_node_fkey"
            columns: ["topic_id", "topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      flashcards: {
        Row: {
          back_markdown_en: string
          back_markdown_hi: string | null
          card_order: number
          created_at: string
          deck_id: string
          explanation: string | null
          front_markdown_en: string
          front_markdown_hi: string | null
          hint: string | null
          id: string
          is_active: boolean
          latex_formulas: string[] | null
          mnemonic_en: string | null
          mnemonic_hi: string | null
          updated_at: string
        }
        Insert: {
          back_markdown_en: string
          back_markdown_hi?: string | null
          card_order?: number
          created_at?: string
          deck_id: string
          explanation?: string | null
          front_markdown_en: string
          front_markdown_hi?: string | null
          hint?: string | null
          id?: string
          is_active?: boolean
          latex_formulas?: string[] | null
          mnemonic_en?: string | null
          mnemonic_hi?: string | null
          updated_at?: string
        }
        Update: {
          back_markdown_en?: string
          back_markdown_hi?: string | null
          card_order?: number
          created_at?: string
          deck_id?: string
          explanation?: string | null
          front_markdown_en?: string
          front_markdown_hi?: string | null
          hint?: string | null
          id?: string
          is_active?: boolean
          latex_formulas?: string[] | null
          mnemonic_en?: string | null
          mnemonic_hi?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "flashcard_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_events: {
        Row: {
          actual_coins_awarded: number
          calculated_coins: number
          event_type: string
          id: string
          idempotency_key: string
          metadata: Json | null
          occurred_at: string
          policy_version: string
          processed_at: string | null
          reason_code: string
          reward_status: string
          source_id: string | null
          source_type: string
          user_id: string
          verification_status: string
        }
        Insert: {
          actual_coins_awarded?: number
          calculated_coins?: number
          event_type: string
          id?: string
          idempotency_key: string
          metadata?: Json | null
          occurred_at?: string
          policy_version?: string
          processed_at?: string | null
          reason_code?: string
          reward_status?: string
          source_id?: string | null
          source_type: string
          user_id: string
          verification_status?: string
        }
        Update: {
          actual_coins_awarded?: number
          calculated_coins?: number
          event_type?: string
          id?: string
          idempotency_key?: string
          metadata?: Json | null
          occurred_at?: string
          policy_version?: string
          processed_at?: string | null
          reason_code?: string
          reward_status?: string
          source_id?: string | null
          source_type?: string
          user_id?: string
          verification_status?: string
        }
        Relationships: []
      }
      institute_batches: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          description: string | null
          end_date: string | null
          id: string
          institute_id: string
          max_capacity: number
          name: string
          settings: Json
          slug: string
          start_date: string | null
          status: string
          target_exam_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          institute_id: string
          max_capacity?: number
          name: string
          settings?: Json
          slug: string
          start_date?: string | null
          status?: string
          target_exam_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          institute_id?: string
          max_capacity?: number
          name?: string
          settings?: Json
          slug?: string
          start_date?: string | null
          status?: string
          target_exam_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "institute_batches_institute_id_fkey"
            columns: ["institute_id"]
            isOneToOne: false
            referencedRelation: "institutes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institute_batches_target_exam_id_fkey"
            columns: ["target_exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      institutes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_verified: boolean
          logo_url: string | null
          name: string
          owner_user_id: string
          settings: Json
          slug: string
          status: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_verified?: boolean
          logo_url?: string | null
          name: string
          owner_user_id: string
          settings?: Json
          slug: string
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_verified?: boolean
          logo_url?: string | null
          name?: string
          owner_user_id?: string
          settings?: Json
          slug?: string
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      leaderboard_weekly_snapshots: {
        Row: {
          accuracy_pct: number | null
          exam_id: string | null
          id: string
          leaderboard_type: string
          questions_attempted_count: number
          rank: number
          score_value: number
          snapshot_generated_at: string
          study_minutes: number
          tasks_completed_count: number
          user_id: string
          week_start_date: string
        }
        Insert: {
          accuracy_pct?: number | null
          exam_id?: string | null
          id?: string
          leaderboard_type: string
          questions_attempted_count?: number
          rank: number
          score_value?: number
          snapshot_generated_at?: string
          study_minutes?: number
          tasks_completed_count?: number
          user_id: string
          week_start_date: string
        }
        Update: {
          accuracy_pct?: number | null
          exam_id?: string | null
          id?: string
          leaderboard_type?: string
          questions_attempted_count?: number
          rank?: number
          score_value?: number
          snapshot_generated_at?: string
          study_minutes?: number
          tasks_completed_count?: number
          user_id?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_weekly_snapshots_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_activity_events: {
        Row: {
          event_type: string
          id: string
          metadata: Json | null
          occurred_at: string
          resource_slug: string
          time_spent_seconds: number
          topic_id: string
          topic_id_node_type: string | null
          user_id: string
        }
        Insert: {
          event_type: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          resource_slug: string
          time_spent_seconds?: number
          topic_id: string
          topic_id_node_type?: string | null
          user_id: string
        }
        Update: {
          event_type?: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          resource_slug?: string
          time_spent_seconds?: number
          topic_id?: string
          topic_id_node_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_activity_events_topic_id_node_fkey"
            columns: ["topic_id", "topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      learning_assets: {
        Row: {
          access_class: string
          alt_text: string
          aspect_ratio: number | null
          asset_type: string
          attribution: string | null
          byte_size: number
          caption: string | null
          created_at: string
          height: number | null
          id: string
          is_sanitized_svg: boolean
          language: string
          mime_type: string
          original_filename: string | null
          sha256_hash: string
          status: string
          storage_bucket: string
          storage_key: string
          storage_provider: string
          updated_at: string
          width: number | null
        }
        Insert: {
          access_class?: string
          alt_text: string
          aspect_ratio?: number | null
          asset_type: string
          attribution?: string | null
          byte_size: number
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          is_sanitized_svg?: boolean
          language?: string
          mime_type: string
          original_filename?: string | null
          sha256_hash: string
          status?: string
          storage_bucket?: string
          storage_key: string
          storage_provider?: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          access_class?: string
          alt_text?: string
          aspect_ratio?: number | null
          asset_type?: string
          attribution?: string | null
          byte_size?: number
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          is_sanitized_svg?: boolean
          language?: string
          mime_type?: string
          original_filename?: string | null
          sha256_hash?: string
          status?: string
          storage_bucket?: string
          storage_key?: string
          storage_provider?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: []
      }
      learning_content_artifacts: {
        Row: {
          access_class: string
          artifact_type: string
          byte_size: number
          compiler_version: string
          content_version_id: string | null
          created_at: string
          id: string
          is_renderable: boolean
          is_source_artifact: boolean
          language: string
          learning_unit_id: string
          mime_type: string
          published_at: string | null
          schema_version: string
          sha256_hash: string
          status: string
          storage_bucket: string
          storage_key: string
          storage_provider: string
          updated_at: string
        }
        Insert: {
          access_class?: string
          artifact_type: string
          byte_size: number
          compiler_version?: string
          content_version_id?: string | null
          created_at?: string
          id?: string
          is_renderable?: boolean
          is_source_artifact?: boolean
          language?: string
          learning_unit_id: string
          mime_type?: string
          published_at?: string | null
          schema_version?: string
          sha256_hash: string
          status?: string
          storage_bucket?: string
          storage_key: string
          storage_provider?: string
          updated_at?: string
        }
        Update: {
          access_class?: string
          artifact_type?: string
          byte_size?: number
          compiler_version?: string
          content_version_id?: string | null
          created_at?: string
          id?: string
          is_renderable?: boolean
          is_source_artifact?: boolean
          language?: string
          learning_unit_id?: string
          mime_type?: string
          published_at?: string | null
          schema_version?: string
          sha256_hash?: string
          status?: string
          storage_bucket?: string
          storage_key?: string
          storage_provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_content_artifacts_learning_unit_id_fkey"
            columns: ["learning_unit_id"]
            isOneToOne: false
            referencedRelation: "learning_units"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_documents: {
        Row: {
          access_level: string
          canonical_slug: string
          created_at: string
          current_published_version_id: string | null
          document_type: string
          id: string
          learning_unit_id: string
          status: string
          updated_at: string
        }
        Insert: {
          access_level?: string
          canonical_slug: string
          created_at?: string
          current_published_version_id?: string | null
          document_type: string
          id?: string
          learning_unit_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          access_level?: string
          canonical_slug?: string
          created_at?: string
          current_published_version_id?: string | null
          document_type?: string
          id?: string
          learning_unit_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_learning_doc_current_published_version"
            columns: ["current_published_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_documents_learning_unit_id_fkey"
            columns: ["learning_unit_id"]
            isOneToOne: false
            referencedRelation: "learning_units"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_unit_asset_bindings: {
        Row: {
          artifact_id: string | null
          asset_id: string
          created_at: string
          id: string
          learning_unit_id: string
          usage_context: string
        }
        Insert: {
          artifact_id?: string | null
          asset_id: string
          created_at?: string
          id?: string
          learning_unit_id: string
          usage_context?: string
        }
        Update: {
          artifact_id?: string | null
          asset_id?: string
          created_at?: string
          id?: string
          learning_unit_id?: string
          usage_context?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_unit_asset_bindings_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "learning_content_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_unit_asset_bindings_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "learning_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_unit_asset_bindings_learning_unit_id_fkey"
            columns: ["learning_unit_id"]
            isOneToOne: false
            referencedRelation: "learning_units"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_units: {
        Row: {
          created_at: string
          display_order: number
          estimated_minutes: number
          id: string
          is_active: boolean
          slug: string
          subtopic_id: string | null
          subtopic_id_node_type: string | null
          title: string
          topic_id: string
          topic_id_node_type: string | null
          unit_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          estimated_minutes?: number
          id?: string
          is_active?: boolean
          slug: string
          subtopic_id?: string | null
          subtopic_id_node_type?: string | null
          title: string
          topic_id: string
          topic_id_node_type?: string | null
          unit_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          estimated_minutes?: number
          id?: string
          is_active?: boolean
          slug?: string
          subtopic_id?: string | null
          subtopic_id_node_type?: string | null
          title?: string
          topic_id?: string
          topic_id_node_type?: string | null
          unit_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_units_subtopic_id_node_fkey"
            columns: ["subtopic_id", "subtopic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
          {
            foreignKeyName: "learning_units_topic_id_node_fkey"
            columns: ["topic_id", "topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      mistake_cognitive_types: {
        Row: {
          created_at: string
          default_remediation_action: string
          description: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          remediation_guidance: string
        }
        Insert: {
          created_at?: string
          default_remediation_action: string
          description: string
          display_order?: number
          id: string
          is_active?: boolean
          name: string
          remediation_guidance: string
        }
        Update: {
          created_at?: string
          default_remediation_action?: string
          description?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          remediation_guidance?: string
        }
        Relationships: []
      }
      mock_questions: {
        Row: {
          created_at: string
          id: string
          marks: number
          mock_section_id: string
          mock_test_id: string
          negative_mark: number
          question_order: number
          question_version_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          marks?: number
          mock_section_id: string
          mock_test_id: string
          negative_mark?: number
          question_order: number
          question_version_id: string
        }
        Update: {
          created_at?: string
          id?: string
          marks?: number
          mock_section_id?: string
          mock_test_id?: string
          negative_mark?: number
          question_order?: number
          question_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_mock_questions_section_test"
            columns: ["mock_section_id", "mock_test_id"]
            isOneToOne: false
            referencedRelation: "mock_sections"
            referencedColumns: ["id", "mock_test_id"]
          },
          {
            foreignKeyName: "mock_questions_mock_test_id_fkey"
            columns: ["mock_test_id"]
            isOneToOne: false
            referencedRelation: "mock_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_questions_question_version_id_fkey"
            columns: ["question_version_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_sections: {
        Row: {
          created_at: string
          duration_minutes: number | null
          id: string
          marks_per_question: number
          mock_test_id: string
          negative_mark: number
          num_questions: number
          section_name: string
          section_order: number
          subject_id: string
          subject_id_node_type: string | null
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          marks_per_question?: number
          mock_test_id: string
          negative_mark?: number
          num_questions: number
          section_name: string
          section_order?: number
          subject_id: string
          subject_id_node_type?: string | null
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          marks_per_question?: number
          mock_test_id?: string
          negative_mark?: number
          num_questions?: number
          section_name?: string
          section_order?: number
          subject_id?: string
          subject_id_node_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mock_sections_mock_test_id_fkey"
            columns: ["mock_test_id"]
            isOneToOne: false
            referencedRelation: "mock_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_sections_subject_id_node_fkey"
            columns: ["subject_id", "subject_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      mock_templates: {
        Row: {
          created_at: string
          description: string | null
          exam_cycle_id: string
          exam_id: string
          id: string
          is_active: boolean
          is_free: boolean
          pattern_id: string
          slug: string
          test_type: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          exam_cycle_id: string
          exam_id: string
          id?: string
          is_active?: boolean
          is_free?: boolean
          pattern_id: string
          slug: string
          test_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          exam_cycle_id?: string
          exam_id?: string
          id?: string
          is_active?: boolean
          is_free?: boolean
          pattern_id?: string
          slug?: string
          test_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mock_templates_exam_cycle_id_fkey"
            columns: ["exam_cycle_id"]
            isOneToOne: false
            referencedRelation: "exam_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_templates_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_templates_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "exam_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_tests: {
        Row: {
          created_at: string
          created_for_user_id: string | null
          duration_minutes: number
          expires_at: string | null
          generation_metadata: Json
          id: string
          is_dynamic: boolean
          is_free: boolean
          lifecycle_status: string
          published_at: string | null
          scheduled_for: string | null
          series_id: string | null
          slug: string
          status: string
          template_id: string
          title: string
          total_marks: number
          total_questions: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_for_user_id?: string | null
          duration_minutes: number
          expires_at?: string | null
          generation_metadata?: Json
          id?: string
          is_dynamic?: boolean
          is_free?: boolean
          lifecycle_status?: string
          published_at?: string | null
          scheduled_for?: string | null
          series_id?: string | null
          slug: string
          status?: string
          template_id: string
          title: string
          total_marks: number
          total_questions: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_for_user_id?: string | null
          duration_minutes?: number
          expires_at?: string | null
          generation_metadata?: Json
          id?: string
          is_dynamic?: boolean
          is_free?: boolean
          lifecycle_status?: string
          published_at?: string | null
          scheduled_for?: string | null
          series_id?: string | null
          slug?: string
          status?: string
          template_id?: string
          title?: string
          total_marks?: number
          total_questions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mock_tests_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "test_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_tests_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "mock_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          action_url_template: string | null
          body_template: string
          category: string
          channel: string
          created_at: string
          icon_name: string | null
          id: string
          is_active: boolean
          priority: string
          template_code: string
          title_template: string
          updated_at: string
        }
        Insert: {
          action_url_template?: string | null
          body_template: string
          category: string
          channel?: string
          created_at?: string
          icon_name?: string | null
          id?: string
          is_active?: boolean
          priority?: string
          template_code: string
          title_template: string
          updated_at?: string
        }
        Update: {
          action_url_template?: string | null
          body_template?: string
          category?: string
          channel?: string
          created_at?: string
          icon_name?: string | null
          id?: string
          is_active?: boolean
          priority?: string
          template_code?: string
          title_template?: string
          updated_at?: string
        }
        Relationships: []
      }
      pattern_sections: {
        Row: {
          created_at: string
          id: string
          instructions: string | null
          is_optional: boolean
          marks_per_question: number
          negative_mark: number
          num_questions: number
          pattern_id: string
          section_duration_minutes: number | null
          section_name: string
          section_order: number
          subject_id: string
          subject_id_node_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructions?: string | null
          is_optional?: boolean
          marks_per_question?: number
          negative_mark?: number
          num_questions: number
          pattern_id: string
          section_duration_minutes?: number | null
          section_name: string
          section_order?: number
          subject_id: string
          subject_id_node_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string | null
          is_optional?: boolean
          marks_per_question?: number
          negative_mark?: number
          num_questions?: number
          pattern_id?: string
          section_duration_minutes?: number | null
          section_name?: string
          section_order?: number
          subject_id?: string
          subject_id_node_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pattern_sections_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "exam_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pattern_sections_subject_id_node_fkey"
            columns: ["subject_id", "subject_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      payment_orders: {
        Row: {
          base_amount: number
          course_id: string | null
          created_at: string
          currency: string
          discount_amount: number
          expires_at: string
          gateway: string
          gateway_order_id: string | null
          id: string
          idempotency_key: string | null
          order_type: string
          plan_id: string | null
          status: string
          tax_amount: number
          tax_rate_pct: number
          taxable_amount: number
          total_payable_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          base_amount: number
          course_id?: string | null
          created_at?: string
          currency?: string
          discount_amount?: number
          expires_at?: string
          gateway?: string
          gateway_order_id?: string | null
          id?: string
          idempotency_key?: string | null
          order_type: string
          plan_id?: string | null
          status?: string
          tax_amount?: number
          tax_rate_pct?: number
          taxable_amount: number
          total_payable_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          base_amount?: number
          course_id?: string | null
          created_at?: string
          currency?: string
          discount_amount?: number
          expires_at?: string
          gateway?: string
          gateway_order_id?: string | null
          id?: string
          idempotency_key?: string | null
          order_type?: string
          plan_id?: string | null
          status?: string
          tax_amount?: number
          tax_rate_pct?: number
          taxable_amount?: number
          total_payable_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_orders_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          captured_at: string | null
          created_at: string
          currency: string
          gateway: string
          gateway_payment_id: string | null
          gateway_response_json: Json | null
          gateway_signature: string | null
          id: string
          order_id: string
          payment_method: string | null
          refund_amount: number | null
          refund_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          captured_at?: string | null
          created_at?: string
          currency?: string
          gateway: string
          gateway_payment_id?: string | null
          gateway_response_json?: Json | null
          gateway_signature?: string | null
          id?: string
          order_id: string
          payment_method?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          amount?: number
          captured_at?: string | null
          created_at?: string
          currency?: string
          gateway?: string
          gateway_payment_id?: string | null
          gateway_response_json?: Json | null
          gateway_signature?: string | null
          id?: string
          order_id?: string
          payment_method?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "payment_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_events: {
        Row: {
          event_type: string
          gateway: string
          gateway_event_id: string
          id: string
          processed_at: string | null
          processing_error: string | null
          processing_status: string
          raw_payload: Json
          received_at: string
          signature_verified: boolean
        }
        Insert: {
          event_type: string
          gateway: string
          gateway_event_id: string
          id?: string
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string
          raw_payload: Json
          received_at?: string
          signature_verified?: boolean
        }
        Update: {
          event_type?: string
          gateway?: string
          gateway_event_id?: string
          id?: string
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string
          raw_payload?: Json
          received_at?: string
          signature_verified?: boolean
        }
        Relationships: []
      }
      popular_search_terms: {
        Row: {
          category: string | null
          display_title_en: string
          display_title_hi: string | null
          id: string
          is_blocked: boolean
          is_promoted: boolean
          normalized_query: string
          search_count: number
          trend_score: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          display_title_en: string
          display_title_hi?: string | null
          id?: string
          is_blocked?: boolean
          is_promoted?: boolean
          normalized_query: string
          search_count?: number
          trend_score?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          display_title_en?: string
          display_title_hi?: string | null
          id?: string
          is_blocked?: boolean
          is_promoted?: boolean
          normalized_query?: string
          search_count?: number
          trend_score?: number
          updated_at?: string
        }
        Relationships: []
      }
      practice_answers: {
        Row: {
          answered_at: string
          id: string
          is_correct: boolean
          language: string
          mode: string
          question_id: string
          question_version_id: string
          selected_option_key: string | null
          set_id: string
          time_taken_ms: number | null
          user_id: string
        }
        Insert: {
          answered_at?: string
          id?: string
          is_correct: boolean
          language: string
          mode: string
          question_id: string
          question_version_id: string
          selected_option_key?: string | null
          set_id: string
          time_taken_ms?: number | null
          user_id: string
        }
        Update: {
          answered_at?: string
          id?: string
          is_correct?: boolean
          language?: string
          mode?: string
          question_id?: string
          question_version_id?: string
          selected_option_key?: string | null
          set_id?: string
          time_taken_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_answers_question_version_id_fkey"
            columns: ["question_version_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      premium_system_configs: {
        Row: {
          config_domain: string
          config_key: string
          config_value: Json
          id: string
          is_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config_domain: string
          config_key: string
          config_value?: Json
          id?: string
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config_domain?: string
          config_key?: string
          config_value?: Json
          id?: string
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      question_answers: {
        Row: {
          correct_option_key: string
          created_at: string
          explanation_md: string | null
          question_version_id: string
          updated_at: string
        }
        Insert: {
          correct_option_key: string
          created_at?: string
          explanation_md?: string | null
          question_version_id: string
          updated_at?: string
        }
        Update: {
          correct_option_key?: string
          created_at?: string
          explanation_md?: string | null
          question_version_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_answers_question_version_id_fkey"
            columns: ["question_version_id"]
            isOneToOne: true
            referencedRelation: "question_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_errata_reports: {
        Row: {
          created_at: string
          description: string
          gamification_event_id: string | null
          id: string
          issue_type: string
          question_id: string
          question_version_id: string
          reporter_user_id: string
          resolution_notes: string | null
          reviewer_user_id: string | null
          reward_coins_granted: number
          status: string
          suggested_fix: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          gamification_event_id?: string | null
          id?: string
          issue_type: string
          question_id: string
          question_version_id: string
          reporter_user_id: string
          resolution_notes?: string | null
          reviewer_user_id?: string | null
          reward_coins_granted?: number
          status?: string
          suggested_fix?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          gamification_event_id?: string | null
          id?: string
          issue_type?: string
          question_id?: string
          question_version_id?: string
          reporter_user_id?: string
          resolution_notes?: string | null
          reviewer_user_id?: string | null
          reward_coins_granted?: number
          status?: string
          suggested_fix?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_qer_question_version_pair"
            columns: ["question_version_id", "question_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id", "question_id"]
          },
          {
            foreignKeyName: "question_errata_reports_gamification_event_id_fkey"
            columns: ["gamification_event_id"]
            isOneToOne: false
            referencedRelation: "gamification_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_errata_reports_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_import_batches: {
        Row: {
          accepted_count: number
          context_hash: string | null
          contract_version: string | null
          created_at: string
          created_by: string | null
          gate_report: Json
          id: string
          origin: string
          rejected_count: number
          submitted_count: number
          target_exam_id: string | null
          target_topic_id: string
          target_topic_id_node_type: string | null
        }
        Insert: {
          accepted_count?: number
          context_hash?: string | null
          contract_version?: string | null
          created_at?: string
          created_by?: string | null
          gate_report?: Json
          id?: string
          origin: string
          rejected_count?: number
          submitted_count?: number
          target_exam_id?: string | null
          target_topic_id: string
          target_topic_id_node_type?: string | null
        }
        Update: {
          accepted_count?: number
          context_hash?: string | null
          contract_version?: string | null
          created_at?: string
          created_by?: string | null
          gate_report?: Json
          id?: string
          origin?: string
          rejected_count?: number
          submitted_count?: number
          target_exam_id?: string | null
          target_topic_id?: string
          target_topic_id_node_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_import_batches_target_exam_id_fkey"
            columns: ["target_exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_import_batches_target_topic_id_node_fkey"
            columns: ["target_topic_id", "target_topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      question_options: {
        Row: {
          id: string
          option_image_url: string | null
          option_key: string
          option_text: string
          order_index: number
          question_version_id: string
        }
        Insert: {
          id?: string
          option_image_url?: string | null
          option_key: string
          option_text: string
          order_index?: number
          question_version_id: string
        }
        Update: {
          id?: string
          option_image_url?: string | null
          option_key?: string
          option_text?: string
          order_index?: number
          question_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_version_id_fkey"
            columns: ["question_version_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_sources: {
        Row: {
          created_at: string
          exam_cycle_id: string | null
          exam_name: string
          id: string
          paper_code: string | null
          question_id: string
          question_number: number | null
          shift: string | null
          source_type: string
          source_url: string | null
          tier_stage: string | null
          year: number
        }
        Insert: {
          created_at?: string
          exam_cycle_id?: string | null
          exam_name: string
          id?: string
          paper_code?: string | null
          question_id: string
          question_number?: number | null
          shift?: string | null
          source_type?: string
          source_url?: string | null
          tier_stage?: string | null
          year: number
        }
        Update: {
          created_at?: string
          exam_cycle_id?: string | null
          exam_name?: string
          id?: string
          paper_code?: string | null
          question_id?: string
          question_number?: number | null
          shift?: string | null
          source_type?: string
          source_url?: string | null
          tier_stage?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_sources_exam_cycle_id_fkey"
            columns: ["exam_cycle_id"]
            isOneToOne: false
            referencedRelation: "exam_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_sources_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_version_authoring: {
        Row: {
          authoring_metadata: Json
          context_hash: string | null
          contract_version: string | null
          created_at: string
          created_by: string | null
          import_batch_id: string | null
          origin: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
          version_id: string
        }
        Insert: {
          authoring_metadata?: Json
          context_hash?: string | null
          contract_version?: string | null
          created_at?: string
          created_by?: string | null
          import_batch_id?: string | null
          origin?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          version_id: string
        }
        Update: {
          authoring_metadata?: Json
          context_hash?: string | null
          contract_version?: string | null
          created_at?: string
          created_by?: string | null
          import_batch_id?: string | null
          origin?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_version_authoring_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "question_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_version_authoring_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
            referencedRelation: "question_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_versions: {
        Row: {
          content_checksum: string | null
          created_at: string
          difficulty: string
          id: string
          is_current: boolean
          language: string
          lifecycle_status: string
          options_type: string
          published_at: string | null
          question_id: string
          question_image_url: string | null
          question_text: string
          version_number: number
        }
        Insert: {
          content_checksum?: string | null
          created_at?: string
          difficulty?: string
          id?: string
          is_current?: boolean
          language?: string
          lifecycle_status?: string
          options_type?: string
          published_at?: string | null
          question_id: string
          question_image_url?: string | null
          question_text: string
          version_number?: number
        }
        Update: {
          content_checksum?: string | null
          created_at?: string
          difficulty?: string
          id?: string
          is_current?: boolean
          language?: string
          lifecycle_status?: string
          options_type?: string
          published_at?: string | null
          question_id?: string
          question_image_url?: string | null
          question_text?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_versions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          canonical_topic_id: string
          canonical_topic_id_node_type: string | null
          created_at: string
          id: string
          status: string
          subtopic_id: string | null
          subtopic_id_node_type: string | null
          updated_at: string
        }
        Insert: {
          canonical_topic_id: string
          canonical_topic_id_node_type?: string | null
          created_at?: string
          id?: string
          status?: string
          subtopic_id?: string | null
          subtopic_id_node_type?: string | null
          updated_at?: string
        }
        Update: {
          canonical_topic_id?: string
          canonical_topic_id_node_type?: string | null
          created_at?: string
          id?: string
          status?: string
          subtopic_id?: string | null
          subtopic_id_node_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_canonical_topic_id_node_fkey"
            columns: ["canonical_topic_id", "canonical_topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
          {
            foreignKeyName: "questions_subtopic_id_node_fkey"
            columns: ["subtopic_id", "subtopic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      quiz_battle_participants: {
        Row: {
          coins_awarded: number
          created_at: string
          elo_delta: number
          final_score: number
          id: string
          is_ready: boolean
          is_winner: boolean
          joined_at: string
          rank: number | null
          room_id: string
          total_time_ms: number
          updated_at: string
          user_id: string
        }
        Insert: {
          coins_awarded?: number
          created_at?: string
          elo_delta?: number
          final_score?: number
          id?: string
          is_ready?: boolean
          is_winner?: boolean
          joined_at?: string
          rank?: number | null
          room_id: string
          total_time_ms?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          coins_awarded?: number
          created_at?: string
          elo_delta?: number
          final_score?: number
          id?: string
          is_ready?: boolean
          is_winner?: boolean
          joined_at?: string
          rank?: number | null
          room_id?: string
          total_time_ms?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_battle_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "quiz_battle_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_battle_rooms: {
        Row: {
          access_tier: string
          battle_type: string
          created_at: string
          created_by_user_id: string | null
          current_round: number
          exam_id: string | null
          id: string
          is_private: boolean
          max_participants: number
          question_ids: string[]
          room_code: string
          round_ends_at: string | null
          round_started_at: string | null
          status: string
          time_per_question_seconds: number
          topic_id: string | null
          topic_id_node_type: string | null
          total_rounds: number
          updated_at: string
          winner_user_id: string | null
        }
        Insert: {
          access_tier?: string
          battle_type?: string
          created_at?: string
          created_by_user_id?: string | null
          current_round?: number
          exam_id?: string | null
          id?: string
          is_private?: boolean
          max_participants?: number
          question_ids: string[]
          room_code: string
          round_ends_at?: string | null
          round_started_at?: string | null
          status?: string
          time_per_question_seconds?: number
          topic_id?: string | null
          topic_id_node_type?: string | null
          total_rounds?: number
          updated_at?: string
          winner_user_id?: string | null
        }
        Update: {
          access_tier?: string
          battle_type?: string
          created_at?: string
          created_by_user_id?: string | null
          current_round?: number
          exam_id?: string | null
          id?: string
          is_private?: boolean
          max_participants?: number
          question_ids?: string[]
          room_code?: string
          round_ends_at?: string | null
          round_started_at?: string | null
          status?: string
          time_per_question_seconds?: number
          topic_id?: string | null
          topic_id_node_type?: string | null
          total_rounds?: number
          updated_at?: string
          winner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_battle_rooms_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_battle_rooms_topic_id_node_fkey"
            columns: ["topic_id", "topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      quiz_battle_round_answers: {
        Row: {
          id: string
          is_correct: boolean
          latency_ms: number
          question_id: string
          received_at: string
          room_id: string
          round_number: number
          score_points: number
          selected_option_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          is_correct?: boolean
          latency_ms?: number
          question_id: string
          received_at?: string
          room_id: string
          round_number: number
          score_points?: number
          selected_option_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          is_correct?: boolean
          latency_ms?: number
          question_id?: string
          received_at?: string
          room_id?: string
          round_number?: number
          score_points?: number
          selected_option_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_battle_round_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_battle_round_answers_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "quiz_battle_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_battle_round_answers_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          },
        ]
      }
      redirect_routes: {
        Row: {
          created_at: string
          destination_path: string
          id: string
          is_active: boolean
          source_path: string
          status_code: number
        }
        Insert: {
          created_at?: string
          destination_path: string
          id?: string
          is_active?: boolean
          source_path: string
          status_code?: number
        }
        Update: {
          created_at?: string
          destination_path?: string
          id?: string
          is_active?: boolean
          source_path?: string
          status_code?: number
        }
        Relationships: []
      }
      reward_catalog: {
        Row: {
          coin_cost: number
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          metadata: Json | null
          reward_type: string
          slug: string
          stock_quantity: number
          title: string
          updated_at: string
        }
        Insert: {
          coin_cost: number
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          metadata?: Json | null
          reward_type: string
          slug: string
          stock_quantity?: number
          title: string
          updated_at?: string
        }
        Update: {
          coin_cost?: number
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          metadata?: Json | null
          reward_type?: string
          slug?: string
          stock_quantity?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      reward_claims: {
        Row: {
          admin_notes: string | null
          coins_spent: number
          created_at: string
          fulfilled_at: string | null
          id: string
          ledger_transaction_id: string | null
          reversal_ledger_id: string | null
          reward_id: string
          shipping_address: string | null
          shipping_city: string | null
          shipping_full_name: string | null
          shipping_phone: string | null
          shipping_pincode: string | null
          shipping_state: string | null
          status: string
          tracking_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          coins_spent: number
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          ledger_transaction_id?: string | null
          reversal_ledger_id?: string | null
          reward_id: string
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_full_name?: string | null
          shipping_phone?: string | null
          shipping_pincode?: string | null
          shipping_state?: string | null
          status?: string
          tracking_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          coins_spent?: number
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          ledger_transaction_id?: string | null
          reversal_ledger_id?: string | null
          reward_id?: string
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_full_name?: string | null
          shipping_phone?: string | null
          shipping_pincode?: string | null
          shipping_state?: string | null
          status?: string
          tracking_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_claims_ledger_transaction_id_fkey"
            columns: ["ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "coin_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_claims_reversal_ledger_id_fkey"
            columns: ["reversal_ledger_id"]
            isOneToOne: false
            referencedRelation: "coin_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_claims_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "reward_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_policies: {
        Row: {
          base_coins: number
          consistency_bonus_coins: number
          cooldown_seconds: number | null
          created_at: string
          daily_limit_count: number | null
          effective_from: string
          eligibility_rules: Json
          event_type: string
          id: string
          improvement_bonus_coins: number
          is_active: boolean
          min_duration_seconds: number | null
          performance_bonus_coins: number
          policy_code: string
          policy_version: string
          updated_at: string
        }
        Insert: {
          base_coins?: number
          consistency_bonus_coins?: number
          cooldown_seconds?: number | null
          created_at?: string
          daily_limit_count?: number | null
          effective_from?: string
          eligibility_rules?: Json
          event_type: string
          id?: string
          improvement_bonus_coins?: number
          is_active?: boolean
          min_duration_seconds?: number | null
          performance_bonus_coins?: number
          policy_code: string
          policy_version?: string
          updated_at?: string
        }
        Update: {
          base_coins?: number
          consistency_bonus_coins?: number
          cooldown_seconds?: number | null
          created_at?: string
          daily_limit_count?: number | null
          effective_from?: string
          eligibility_rules?: Json
          event_type?: string
          id?: string
          improvement_bonus_coins?: number
          is_active?: boolean
          min_duration_seconds?: number | null
          performance_bonus_coins?: number
          policy_code?: string
          policy_version?: string
          updated_at?: string
        }
        Relationships: []
      }
      schema_migration_ledger: {
        Row: {
          applied_at: string | null
          applied_by_tool: string | null
          checksum_sha256: string
          filename: string
          notes: string | null
          recorded_at: string
          status: string
          superseded_by: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_by_tool?: string | null
          checksum_sha256: string
          filename: string
          notes?: string | null
          recorded_at?: string
          status: string
          superseded_by?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_by_tool?: string | null
          checksum_sha256?: string
          filename?: string
          notes?: string | null
          recorded_at?: string
          status?: string
          superseded_by?: string | null
        }
        Relationships: []
      }
      search_indexes: {
        Row: {
          access_tier: string
          body_snippet_en: string | null
          body_snippet_hi: string | null
          canonical_url: string
          category: string | null
          entity_type: string
          exam_id: string | null
          id: string
          indexed_at: string
          is_published: boolean
          normalized_keywords: string
          quality_rank: number
          search_vector_en: unknown
          search_vector_hi: unknown
          source_id: string
          source_updated_at: string
          subject_id: string | null
          subject_id_node_type: string | null
          title_en: string | null
          title_hi: string | null
          topic_id: string | null
          topic_id_node_type: string | null
          year: number | null
        }
        Insert: {
          access_tier?: string
          body_snippet_en?: string | null
          body_snippet_hi?: string | null
          canonical_url: string
          category?: string | null
          entity_type: string
          exam_id?: string | null
          id?: string
          indexed_at?: string
          is_published?: boolean
          normalized_keywords?: string
          quality_rank?: number
          search_vector_en?: unknown
          search_vector_hi?: unknown
          source_id: string
          source_updated_at?: string
          subject_id?: string | null
          subject_id_node_type?: string | null
          title_en?: string | null
          title_hi?: string | null
          topic_id?: string | null
          topic_id_node_type?: string | null
          year?: number | null
        }
        Update: {
          access_tier?: string
          body_snippet_en?: string | null
          body_snippet_hi?: string | null
          canonical_url?: string
          category?: string | null
          entity_type?: string
          exam_id?: string | null
          id?: string
          indexed_at?: string
          is_published?: boolean
          normalized_keywords?: string
          quality_rank?: number
          search_vector_en?: unknown
          search_vector_hi?: unknown
          source_id?: string
          source_updated_at?: string
          subject_id?: string | null
          subject_id_node_type?: string | null
          title_en?: string | null
          title_hi?: string | null
          topic_id?: string | null
          topic_id_node_type?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "search_indexes_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_indexes_subject_id_node_fkey"
            columns: ["subject_id", "subject_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
          {
            foreignKeyName: "search_indexes_topic_id_node_fkey"
            columns: ["topic_id", "topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      search_query_logs: {
        Row: {
          created_at: string
          execution_latency_ms: number
          id: string
          is_zero_result: boolean
          language_detected: string
          query_hash: string
          result_count: number
          sanitized_query: string
        }
        Insert: {
          created_at?: string
          execution_latency_ms?: number
          id?: string
          is_zero_result?: boolean
          language_detected?: string
          query_hash: string
          result_count?: number
          sanitized_query: string
        }
        Update: {
          created_at?: string
          execution_latency_ms?: number
          id?: string
          is_zero_result?: boolean
          language_detected?: string
          query_hash?: string
          result_count?: number
          sanitized_query?: string
        }
        Relationships: []
      }
      section_results: {
        Row: {
          accuracy_percentage: number
          attempted_count: number
          correct_count: number
          created_at: string
          id: string
          incorrect_count: number
          max_section_score: number
          mock_section_id: string
          section_score: number
          test_result_id: string
          time_spent_seconds: number
          total_questions: number
          unanswered_count: number
        }
        Insert: {
          accuracy_percentage: number
          attempted_count: number
          correct_count: number
          created_at?: string
          id?: string
          incorrect_count: number
          max_section_score: number
          mock_section_id: string
          section_score: number
          test_result_id: string
          time_spent_seconds?: number
          total_questions: number
          unanswered_count: number
        }
        Update: {
          accuracy_percentage?: number
          attempted_count?: number
          correct_count?: number
          created_at?: string
          id?: string
          incorrect_count?: number
          max_section_score?: number
          mock_section_id?: string
          section_score?: number
          test_result_id?: string
          time_spent_seconds?: number
          total_questions?: number
          unanswered_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "section_results_mock_section_id_fkey"
            columns: ["mock_section_id"]
            isOneToOne: false
            referencedRelation: "mock_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_results_test_result_id_fkey"
            columns: ["test_result_id"]
            isOneToOne: false
            referencedRelation: "test_results"
            referencedColumns: ["id"]
          },
        ]
      }
      spaced_repetition_schedules: {
        Row: {
          created_at: string
          ease_factor: number
          id: string
          interval_days: number
          last_reviewed_at: string
          next_review_at: string
          question_id: string | null
          repetition_level: number
          review_count: number
          topic_id: string | null
          topic_id_node_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ease_factor?: number
          id?: string
          interval_days?: number
          last_reviewed_at?: string
          next_review_at?: string
          question_id?: string | null
          repetition_level?: number
          review_count?: number
          topic_id?: string | null
          topic_id_node_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ease_factor?: number
          id?: string
          interval_days?: number
          last_reviewed_at?: string
          next_review_at?: string
          question_id?: string | null
          repetition_level?: number
          review_count?: number
          topic_id?: string | null
          topic_id_node_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaced_repetition_schedules_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spaced_repetition_schedules_topic_id_node_fkey"
            columns: ["topic_id", "topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      streak_activity_logs: {
        Row: {
          activity_date: string
          created_at: string
          duration_seconds: number
          id: string
          metadata: Json | null
          qualifying_action_type: string
          source_id: string | null
          timezone: string
          user_id: string
        }
        Insert: {
          activity_date: string
          created_at?: string
          duration_seconds?: number
          id?: string
          metadata?: Json | null
          qualifying_action_type: string
          source_id?: string | null
          timezone?: string
          user_id: string
        }
        Update: {
          activity_date?: string
          created_at?: string
          duration_seconds?: number
          id?: string
          metadata?: Json | null
          qualifying_action_type?: string
          source_id?: string | null
          timezone?: string
          user_id?: string
        }
        Relationships: []
      }
      study_plan_items: {
        Row: {
          completed_at: string | null
          created_at: string
          estimated_duration_minutes: number
          id: string
          is_user_modified: boolean
          mock_test_id: string | null
          override_type: string | null
          priority_score: number
          reason_code: string
          reason_text: string
          scheduled_order: number
          status: string
          study_plan_id: string
          task_type: string
          topic_id: string | null
          topic_id_node_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          estimated_duration_minutes?: number
          id?: string
          is_user_modified?: boolean
          mock_test_id?: string | null
          override_type?: string | null
          priority_score?: number
          reason_code?: string
          reason_text: string
          scheduled_order?: number
          status?: string
          study_plan_id: string
          task_type: string
          topic_id?: string | null
          topic_id_node_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          estimated_duration_minutes?: number
          id?: string
          is_user_modified?: boolean
          mock_test_id?: string | null
          override_type?: string | null
          priority_score?: number
          reason_code?: string
          reason_text?: string
          scheduled_order?: number
          status?: string
          study_plan_id?: string
          task_type?: string
          topic_id?: string | null
          topic_id_node_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_plan_items_mock_test_id_fkey"
            columns: ["mock_test_id"]
            isOneToOne: false
            referencedRelation: "mock_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_plan_items_study_plan_id_fkey"
            columns: ["study_plan_id"]
            isOneToOne: false
            referencedRelation: "user_study_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_plan_items_topic_id_node_fkey"
            columns: ["topic_id", "topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      subjects: {
        Row: {
          created_at: string
          display_order: number
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      submission_evaluations: {
        Row: {
          completed_at: string
          created_at: string
          evaluation_status: string
          evaluator_type: string
          evaluator_user_id: string | null
          id: string
          improvement_suggestions: string | null
          model_answer_comparison_md: string | null
          percentage_score: number
          rubric_id: string | null
          rubric_scores: Json
          rubric_snapshot: Json
          strengths_feedback: string | null
          submission_id: string
          total_score_awarded: number
          updated_at: string
          weaknesses_feedback: string | null
        }
        Insert: {
          completed_at?: string
          created_at?: string
          evaluation_status?: string
          evaluator_type?: string
          evaluator_user_id?: string | null
          id?: string
          improvement_suggestions?: string | null
          model_answer_comparison_md?: string | null
          percentage_score: number
          rubric_id?: string | null
          rubric_scores?: Json
          rubric_snapshot?: Json
          strengths_feedback?: string | null
          submission_id: string
          total_score_awarded: number
          updated_at?: string
          weaknesses_feedback?: string | null
        }
        Update: {
          completed_at?: string
          created_at?: string
          evaluation_status?: string
          evaluator_type?: string
          evaluator_user_id?: string | null
          id?: string
          improvement_suggestions?: string | null
          model_answer_comparison_md?: string | null
          percentage_score?: number
          rubric_id?: string | null
          rubric_scores?: Json
          rubric_snapshot?: Json
          strengths_feedback?: string | null
          submission_id?: string
          total_score_awarded?: number
          updated_at?: string
          weaknesses_feedback?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submission_evaluations_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "evaluation_rubrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_evaluations_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "user_descriptive_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          base_price_inr: number
          created_at: string
          currency: string
          description: string | null
          display_order: number
          duration_days: number
          feature_flags: Json
          id: string
          is_active: boolean
          name: string
          plan_code: string
          tax_rate_pct: number
          updated_at: string
        }
        Insert: {
          base_price_inr: number
          created_at?: string
          currency?: string
          description?: string | null
          display_order?: number
          duration_days: number
          feature_flags?: Json
          id?: string
          is_active?: boolean
          name: string
          plan_code: string
          tax_rate_pct?: number
          updated_at?: string
        }
        Update: {
          base_price_inr?: number
          created_at?: string
          currency?: string
          description?: string | null
          display_order?: number
          duration_days?: number
          feature_flags?: Json
          id?: string
          is_active?: boolean
          name?: string
          plan_code?: string
          tax_rate_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      subtopics: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          slug: string
          topic_id: string
          topic_id_node_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          slug: string
          topic_id: string
          topic_id_node_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          topic_id?: string
          topic_id_node_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtopics_topic_id_node_fkey"
            columns: ["topic_id", "topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          ref: string
          resolved_at: string | null
          staff_reply: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          message: string
          ref: string
          resolved_at?: string | null
          staff_reply?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          ref?: string
          resolved_at?: string | null
          staff_reply?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      taxonomy_fk_flip_log: {
        Row: {
          column_name: string
          expected_node_type: string
          flipped_at: string
          id: string
          new_constraint: string
          old_constraint: string
          old_definition: string
          old_target: string
          table_name: string
        }
        Insert: {
          column_name: string
          expected_node_type: string
          flipped_at?: string
          id?: string
          new_constraint: string
          old_constraint: string
          old_definition: string
          old_target: string
          table_name: string
        }
        Update: {
          column_name?: string
          expected_node_type?: string
          flipped_at?: string
          id?: string
          new_constraint?: string
          old_constraint?: string
          old_definition?: string
          old_target?: string
          table_name?: string
        }
        Relationships: []
      }
      test_attempts: {
        Row: {
          client_ip: string | null
          created_at: string
          id: string
          last_activity_at: string
          last_question_order: number | null
          mock_test_id: string
          started_at: string
          status: string
          submitted_at: string | null
          time_taken_seconds: number
          updated_at: string
          user_id: string
          visited_orders: number[] | null
        }
        Insert: {
          client_ip?: string | null
          created_at?: string
          id?: string
          last_activity_at?: string
          last_question_order?: number | null
          mock_test_id: string
          started_at?: string
          status?: string
          submitted_at?: string | null
          time_taken_seconds?: number
          updated_at?: string
          user_id: string
          visited_orders?: number[] | null
        }
        Update: {
          client_ip?: string | null
          created_at?: string
          id?: string
          last_activity_at?: string
          last_question_order?: number | null
          mock_test_id?: string
          started_at?: string
          status?: string
          submitted_at?: string | null
          time_taken_seconds?: number
          updated_at?: string
          user_id?: string
          visited_orders?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "test_attempts_mock_test_id_fkey"
            columns: ["mock_test_id"]
            isOneToOne: false
            referencedRelation: "mock_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      test_results: {
        Row: {
          accuracy_percentage: number
          attempt_id: string
          attempted_count: number
          correct_count: number
          created_at: string
          evaluated_at: string
          id: string
          incorrect_count: number
          max_score: number
          mock_test_id: string
          percentile: number | null
          rank: number | null
          time_spent_seconds: number
          total_questions: number
          total_score: number
          unanswered_count: number
          user_id: string
        }
        Insert: {
          accuracy_percentage: number
          attempt_id: string
          attempted_count: number
          correct_count: number
          created_at?: string
          evaluated_at?: string
          id?: string
          incorrect_count: number
          max_score: number
          mock_test_id: string
          percentile?: number | null
          rank?: number | null
          time_spent_seconds: number
          total_questions: number
          total_score: number
          unanswered_count: number
          user_id: string
        }
        Update: {
          accuracy_percentage?: number
          attempt_id?: string
          attempted_count?: number
          correct_count?: number
          created_at?: string
          evaluated_at?: string
          id?: string
          incorrect_count?: number
          max_score?: number
          mock_test_id?: string
          percentile?: number | null
          rank?: number | null
          time_spent_seconds?: number
          total_questions?: number
          total_score?: number
          unanswered_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_results_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "test_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_results_mock_test_id_fkey"
            columns: ["mock_test_id"]
            isOneToOne: false
            referencedRelation: "mock_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      test_series: {
        Row: {
          created_at: string
          display_order: number
          exam_id: string
          id: string
          is_active: boolean
          is_premium: boolean
          metadata: Json
          series_type: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          exam_id: string
          id?: string
          is_active?: boolean
          is_premium?: boolean
          metadata?: Json
          series_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          exam_id?: string
          id?: string
          is_active?: boolean
          is_premium?: boolean
          metadata?: Json
          series_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_series_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_relationships: {
        Row: {
          created_at: string
          from_topic_id: string
          from_topic_id_node_type: string | null
          id: string
          is_active: boolean
          notes: string | null
          relationship_type: string
          strength: string
          to_topic_id: string
          to_topic_id_node_type: string | null
        }
        Insert: {
          created_at?: string
          from_topic_id: string
          from_topic_id_node_type?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          relationship_type: string
          strength?: string
          to_topic_id: string
          to_topic_id_node_type?: string | null
        }
        Update: {
          created_at?: string
          from_topic_id?: string
          from_topic_id_node_type?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          relationship_type?: string
          strength?: string
          to_topic_id?: string
          to_topic_id_node_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topic_relationships_from_topic_id_node_fkey"
            columns: ["from_topic_id", "from_topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
          {
            foreignKeyName: "topic_relationships_to_topic_id_node_fkey"
            columns: ["to_topic_id", "to_topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      topics: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          importance_level: string
          is_active: boolean
          name: string
          slug: string
          subject_id: string
          subject_id_node_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          importance_level?: string
          is_active?: boolean
          name: string
          slug: string
          subject_id: string
          subject_id_node_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          importance_level?: string
          is_active?: boolean
          name?: string
          slug?: string
          subject_id?: string
          subject_id_node_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topics_subject_id_node_fkey"
            columns: ["subject_id", "subject_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_id: string
          coins_awarded: number
          earned_at: string
          id: string
          source_event_id: string | null
          user_id: string
        }
        Insert: {
          badge_id: string
          coins_awarded?: number
          earned_at?: string
          id?: string
          source_event_id?: string | null
          user_id: string
        }
        Update: {
          badge_id?: string
          coins_awarded?: number
          earned_at?: string
          id?: string
          source_event_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "gamification_events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_battle_stats: {
        Row: {
          average_latency_ms: number
          created_at: string
          current_win_streak: number
          draws: number
          elo_rating: number
          highest_win_streak: number
          last_battle_at: string | null
          losses: number
          total_battles: number
          total_correct_answers: number
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          average_latency_ms?: number
          created_at?: string
          current_win_streak?: number
          draws?: number
          elo_rating?: number
          highest_win_streak?: number
          last_battle_at?: string | null
          losses?: number
          total_battles?: number
          total_correct_answers?: number
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          average_latency_ms?: number
          created_at?: string
          current_win_streak?: number
          draws?: number
          elo_rating?: number
          highest_win_streak?: number
          last_battle_at?: string | null
          losses?: number
          total_battles?: number
          total_correct_answers?: number
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: []
      }
      user_bookmark_folders: {
        Row: {
          color_hex: string
          created_at: string
          display_order: number
          icon_name: string | null
          id: string
          name: string
          slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color_hex?: string
          created_at?: string
          display_order?: number
          icon_name?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color_hex?: string
          created_at?: string
          display_order?: number
          icon_name?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_course_progress: {
        Row: {
          completed_at: string | null
          completed_lessons: number
          course_id: string
          created_at: string
          id: string
          is_completed: boolean
          last_accessed_at: string
          last_lesson_id: string | null
          progress_pct: number
          total_lessons: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_lessons?: number
          course_id: string
          created_at?: string
          id?: string
          is_completed?: boolean
          last_accessed_at?: string
          last_lesson_id?: string | null
          progress_pct?: number
          total_lessons?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_lessons?: number
          course_id?: string
          created_at?: string
          id?: string
          is_completed?: boolean
          last_accessed_at?: string
          last_lesson_id?: string | null
          progress_pct?: number
          total_lessons?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_course_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_course_progress_last_lesson_id_fkey"
            columns: ["last_lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_deck_progress: {
        Row: {
          created_at: string
          deck_id: string
          id: string
          is_favorite: boolean
          last_reviewed_at: string | null
          mastery_percentage: number
          total_cards_learning: number
          total_cards_mastered: number
          total_cards_new: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deck_id: string
          id?: string
          is_favorite?: boolean
          last_reviewed_at?: string | null
          mastery_percentage?: number
          total_cards_learning?: number
          total_cards_mastered?: number
          total_cards_new?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deck_id?: string
          id?: string
          is_favorite?: boolean
          last_reviewed_at?: string | null
          mastery_percentage?: number
          total_cards_learning?: number
          total_cards_mastered?: number
          total_cards_new?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_deck_progress_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "flashcard_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_descriptive_submissions: {
        Row: {
          answer_text: string | null
          assignment_id: string | null
          attachment_page_count: number | null
          attachment_url: string | null
          attempt_number: number
          batch_id: string | null
          created_at: string
          id: string
          institute_id: string | null
          question_id: string
          rubric_id: string | null
          status: string
          submission_type: string
          submitted_at: string
          time_spent_seconds: number | null
          updated_at: string
          user_id: string
          word_count: number
        }
        Insert: {
          answer_text?: string | null
          assignment_id?: string | null
          attachment_page_count?: number | null
          attachment_url?: string | null
          attempt_number?: number
          batch_id?: string | null
          created_at?: string
          id?: string
          institute_id?: string | null
          question_id: string
          rubric_id?: string | null
          status?: string
          submission_type?: string
          submitted_at?: string
          time_spent_seconds?: number | null
          updated_at?: string
          user_id: string
          word_count?: number
        }
        Update: {
          answer_text?: string | null
          assignment_id?: string | null
          attachment_page_count?: number | null
          attachment_url?: string | null
          attempt_number?: number
          batch_id?: string | null
          created_at?: string
          id?: string
          institute_id?: string | null
          question_id?: string
          rubric_id?: string | null
          status?: string
          submission_type?: string
          submitted_at?: string
          time_spent_seconds?: number | null
          updated_at?: string
          user_id?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_descriptive_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "batch_curriculum_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_descriptive_submissions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "institute_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_descriptive_submissions_institute_id_fkey"
            columns: ["institute_id"]
            isOneToOne: false
            referencedRelation: "institutes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_descriptive_submissions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "descriptive_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_descriptive_submissions_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "evaluation_rubrics"
            referencedColumns: ["id"]
          },
        ]
      }
      user_diagnostic_results: {
        Row: {
          accuracy_pct: number
          attempt_id: string
          baseline_readiness_pct: number
          completed_at: string
          diagnostic_assessment_id: string
          id: string
          overall_score: number
          strong_topic_ids: string[]
          user_id: string
          weak_topic_ids: string[]
        }
        Insert: {
          accuracy_pct: number
          attempt_id: string
          baseline_readiness_pct?: number
          completed_at?: string
          diagnostic_assessment_id: string
          id?: string
          overall_score: number
          strong_topic_ids?: string[]
          user_id: string
          weak_topic_ids?: string[]
        }
        Update: {
          accuracy_pct?: number
          attempt_id?: string
          baseline_readiness_pct?: number
          completed_at?: string
          diagnostic_assessment_id?: string
          id?: string
          overall_score?: number
          strong_topic_ids?: string[]
          user_id?: string
          weak_topic_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "user_diagnostic_results_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "test_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_diagnostic_results_diagnostic_assessment_id_fkey"
            columns: ["diagnostic_assessment_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_entitlements: {
        Row: {
          course_id: string | null
          created_at: string
          custom_limits: Json
          entitlement_type: string
          exam_id: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          plan_id: string | null
          starts_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          custom_limits?: Json
          entitlement_type: string
          exam_id?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          plan_id?: string | null
          starts_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          custom_limits?: Json
          entitlement_type?: string
          exam_id?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          plan_id?: string | null
          starts_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_entitlements_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_entitlements_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_exam_goals: {
        Row: {
          created_at: string
          daily_study_minutes: number
          exam_cycle_id: string
          exam_id: string
          id: string
          is_active: boolean
          priority_rank: number
          target_score: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_study_minutes?: number
          exam_cycle_id: string
          exam_id: string
          id?: string
          is_active?: boolean
          priority_rank?: number
          target_score?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_study_minutes?: number
          exam_cycle_id?: string
          exam_id?: string
          id?: string
          is_active?: boolean
          priority_rank?: number
          target_score?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_exam_goals_exam_cycle_id_fkey"
            columns: ["exam_cycle_id"]
            isOneToOne: false
            referencedRelation: "exam_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_exam_goals_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      user_exam_readiness: {
        Row: {
          algorithm_version: string
          created_at: string
          exam_cycle_id: string
          exam_id: string
          id: string
          last_evaluated_at: string
          mock_benchmark_pct: number
          readiness_index: number
          retention_freshness_pct: number
          syllabus_coverage_pct: number
          updated_at: string
          user_id: string
          weighted_mastery_pct: number
        }
        Insert: {
          algorithm_version?: string
          created_at?: string
          exam_cycle_id: string
          exam_id: string
          id?: string
          last_evaluated_at?: string
          mock_benchmark_pct?: number
          readiness_index?: number
          retention_freshness_pct?: number
          syllabus_coverage_pct?: number
          updated_at?: string
          user_id: string
          weighted_mastery_pct?: number
        }
        Update: {
          algorithm_version?: string
          created_at?: string
          exam_cycle_id?: string
          exam_id?: string
          id?: string
          last_evaluated_at?: string
          mock_benchmark_pct?: number
          readiness_index?: number
          retention_freshness_pct?: number
          syllabus_coverage_pct?: number
          updated_at?: string
          user_id?: string
          weighted_mastery_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_exam_readiness_exam_cycle_id_fkey"
            columns: ["exam_cycle_id"]
            isOneToOne: false
            referencedRelation: "exam_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_exam_readiness_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      user_flashcard_reviews: {
        Row: {
          card_id: string
          consecutive_correct: number
          created_at: string
          deck_id: string
          ease_factor: number
          id: string
          interval_days: number
          last_rating: number | null
          last_reviewed_at: string
          next_review_due_at: string
          repetition_level: number
          total_reviews: number
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          consecutive_correct?: number
          created_at?: string
          deck_id: string
          ease_factor?: number
          id?: string
          interval_days?: number
          last_rating?: number | null
          last_reviewed_at?: string
          next_review_due_at?: string
          repetition_level?: number
          total_reviews?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          consecutive_correct?: number
          created_at?: string
          deck_id?: string
          ease_factor?: number
          id?: string
          interval_days?: number
          last_rating?: number | null
          last_reviewed_at?: string
          next_review_due_at?: string
          repetition_level?: number
          total_reviews?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_flashcard_reviews_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "flashcards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_flashcard_reviews_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "flashcard_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_lesson_completions: {
        Row: {
          completed_at: string | null
          course_id: string
          created_at: string
          id: string
          is_completed: boolean
          last_interaction_at: string
          lesson_id: string
          max_watched_seconds: number
          playback_position_seconds: number
          session_attempt_count: number
          updated_at: string
          user_id: string
          verified_seconds_spent: number
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          created_at?: string
          id?: string
          is_completed?: boolean
          last_interaction_at?: string
          lesson_id: string
          max_watched_seconds?: number
          playback_position_seconds?: number
          session_attempt_count?: number
          updated_at?: string
          user_id: string
          verified_seconds_spent?: number
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          created_at?: string
          id?: string
          is_completed?: boolean
          last_interaction_at?: string
          lesson_id?: string
          max_watched_seconds?: number
          playback_position_seconds?: number
          session_attempt_count?: number
          updated_at?: string
          user_id?: string
          verified_seconds_spent?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_lesson_completions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_lesson_completions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_lesson_notes: {
        Row: {
          created_at: string
          id: string
          lesson_id: string
          note_md: string
          timestamp_seconds: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_id: string
          note_md: string
          timestamp_seconds?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_id?: string
          note_md?: string
          timestamp_seconds?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_lesson_notes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_mastery_history: {
        Row: {
          algorithm_version: string
          canonical_topic_id: string
          canonical_topic_id_node_type: string | null
          confidence_factor: number
          coverage_factor: number
          created_at: string
          id: string
          mastery_score: number
          recency_factor: number
          snapshot_date: string
          total_exposure_count: number
          user_id: string
        }
        Insert: {
          algorithm_version?: string
          canonical_topic_id: string
          canonical_topic_id_node_type?: string | null
          confidence_factor: number
          coverage_factor: number
          created_at?: string
          id?: string
          mastery_score: number
          recency_factor: number
          snapshot_date?: string
          total_exposure_count: number
          user_id: string
        }
        Update: {
          algorithm_version?: string
          canonical_topic_id?: string
          canonical_topic_id_node_type?: string | null
          confidence_factor?: number
          coverage_factor?: number
          created_at?: string
          id?: string
          mastery_score?: number
          recency_factor?: number
          snapshot_date?: string
          total_exposure_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_mastery_history_canonical_topic_id_node_fkey"
            columns: ["canonical_topic_id", "canonical_topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      user_mistake_drills: {
        Row: {
          cognitive_type_id: string | null
          coins_awarded: number
          completed_at: string | null
          correct_count: number
          created_at: string
          id: string
          mistakes_resolved_count: number
          questions_data: Json
          started_at: string
          status: string
          topic_id: string | null
          topic_id_node_type: string | null
          total_questions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cognitive_type_id?: string | null
          coins_awarded?: number
          completed_at?: string | null
          correct_count?: number
          created_at?: string
          id?: string
          mistakes_resolved_count?: number
          questions_data?: Json
          started_at?: string
          status?: string
          topic_id?: string | null
          topic_id_node_type?: string | null
          total_questions: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cognitive_type_id?: string | null
          coins_awarded?: number
          completed_at?: string | null
          correct_count?: number
          created_at?: string
          id?: string
          mistakes_resolved_count?: number
          questions_data?: Json
          started_at?: string
          status?: string
          topic_id?: string | null
          topic_id_node_type?: string | null
          total_questions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_mistake_drills_cognitive_type_id_fkey"
            columns: ["cognitive_type_id"]
            isOneToOne: false
            referencedRelation: "mistake_cognitive_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mistake_drills_topic_id_node_fkey"
            columns: ["topic_id", "topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      user_mistake_occurrences: {
        Row: {
          attempt_answer_id: string | null
          heuristic_confidence_pct: number
          id: string
          inferred_cognitive_type_id: string
          occurred_at: string
          occurrence_status: string
          question_id: string
          question_version_id: string | null
          response_time_seconds: number | null
          revocation_reason: string | null
          revoked_at: string | null
          selected_option_id: string | null
          source_context: string
          source_reference_id: string | null
          user_id: string
          vault_id: string
        }
        Insert: {
          attempt_answer_id?: string | null
          heuristic_confidence_pct?: number
          id?: string
          inferred_cognitive_type_id?: string
          occurred_at?: string
          occurrence_status?: string
          question_id: string
          question_version_id?: string | null
          response_time_seconds?: number | null
          revocation_reason?: string | null
          revoked_at?: string | null
          selected_option_id?: string | null
          source_context: string
          source_reference_id?: string | null
          user_id: string
          vault_id: string
        }
        Update: {
          attempt_answer_id?: string | null
          heuristic_confidence_pct?: number
          id?: string
          inferred_cognitive_type_id?: string
          occurred_at?: string
          occurrence_status?: string
          question_id?: string
          question_version_id?: string | null
          response_time_seconds?: number | null
          revocation_reason?: string | null
          revoked_at?: string | null
          selected_option_id?: string | null
          source_context?: string
          source_reference_id?: string | null
          user_id?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_mistake_occurrences_inferred_cognitive_type_id_fkey"
            columns: ["inferred_cognitive_type_id"]
            isOneToOne: false
            referencedRelation: "mistake_cognitive_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mistake_occurrences_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mistake_occurrences_question_version_id_fkey"
            columns: ["question_version_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mistake_occurrences_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mistake_occurrences_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "user_mistake_vault"
            referencedColumns: ["id"]
          },
        ]
      }
      user_mistake_vault: {
        Row: {
          consecutive_correct_in_remediation: number
          created_at: string
          first_mistake_at: string
          id: string
          last_mistake_at: string
          last_practiced_at: string | null
          lifecycle_status: string
          mastered_at: string | null
          ml_consecutive_correct_days: number
          ml_due_at: string
          ml_interval_days: number
          ml_lapses: number
          ml_last_advance_on: string | null
          ml_last_result: string | null
          ml_last_reviewed_at: string | null
          ml_source: string
          ml_state: string
          primary_cognitive_type_id: string
          question_id: string
          subject_id: string | null
          subject_id_node_type: string | null
          topic_id: string | null
          topic_id_node_type: string | null
          total_mistakes_count: number
          updated_at: string
          user_custom_notes: string | null
          user_id: string
          user_override_cognitive_type_id: string | null
        }
        Insert: {
          consecutive_correct_in_remediation?: number
          created_at?: string
          first_mistake_at?: string
          id?: string
          last_mistake_at?: string
          last_practiced_at?: string | null
          lifecycle_status?: string
          mastered_at?: string | null
          ml_consecutive_correct_days?: number
          ml_due_at?: string
          ml_interval_days?: number
          ml_lapses?: number
          ml_last_advance_on?: string | null
          ml_last_result?: string | null
          ml_last_reviewed_at?: string | null
          ml_source?: string
          ml_state?: string
          primary_cognitive_type_id?: string
          question_id: string
          subject_id?: string | null
          subject_id_node_type?: string | null
          topic_id?: string | null
          topic_id_node_type?: string | null
          total_mistakes_count?: number
          updated_at?: string
          user_custom_notes?: string | null
          user_id: string
          user_override_cognitive_type_id?: string | null
        }
        Update: {
          consecutive_correct_in_remediation?: number
          created_at?: string
          first_mistake_at?: string
          id?: string
          last_mistake_at?: string
          last_practiced_at?: string | null
          lifecycle_status?: string
          mastered_at?: string | null
          ml_consecutive_correct_days?: number
          ml_due_at?: string
          ml_interval_days?: number
          ml_lapses?: number
          ml_last_advance_on?: string | null
          ml_last_result?: string | null
          ml_last_reviewed_at?: string | null
          ml_source?: string
          ml_state?: string
          primary_cognitive_type_id?: string
          question_id?: string
          subject_id?: string | null
          subject_id_node_type?: string | null
          topic_id?: string | null
          topic_id_node_type?: string | null
          total_mistakes_count?: number
          updated_at?: string
          user_custom_notes?: string | null
          user_id?: string
          user_override_cognitive_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_mistake_vault_primary_cognitive_type_id_fkey"
            columns: ["primary_cognitive_type_id"]
            isOneToOne: false
            referencedRelation: "mistake_cognitive_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mistake_vault_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mistake_vault_subject_id_node_fkey"
            columns: ["subject_id", "subject_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
          {
            foreignKeyName: "user_mistake_vault_topic_id_node_fkey"
            columns: ["topic_id", "topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
          {
            foreignKeyName: "user_mistake_vault_user_override_cognitive_type_id_fkey"
            columns: ["user_override_cognitive_type_id"]
            isOneToOne: false
            referencedRelation: "mistake_cognitive_types"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          academic_reminders_enabled: boolean
          created_at: string
          email_enabled: boolean
          exam_alerts_enabled: boolean
          gamification_alerts_enabled: boolean
          id: string
          in_app_enabled: boolean
          marketing_enabled: boolean
          push_enabled: boolean
          quiet_hours_end_time: string
          quiet_hours_start_time: string
          updated_at: string
          user_id: string
          whatsapp_enabled: boolean
        }
        Insert: {
          academic_reminders_enabled?: boolean
          created_at?: string
          email_enabled?: boolean
          exam_alerts_enabled?: boolean
          gamification_alerts_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          marketing_enabled?: boolean
          push_enabled?: boolean
          quiet_hours_end_time?: string
          quiet_hours_start_time?: string
          updated_at?: string
          user_id: string
          whatsapp_enabled?: boolean
        }
        Update: {
          academic_reminders_enabled?: boolean
          created_at?: string
          email_enabled?: boolean
          exam_alerts_enabled?: boolean
          gamification_alerts_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          marketing_enabled?: boolean
          push_enabled?: boolean
          quiet_hours_end_time?: string
          quiet_hours_start_time?: string
          updated_at?: string
          user_id?: string
          whatsapp_enabled?: boolean
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          action_url: string | null
          body: string
          category: string
          created_at: string
          expires_at: string | null
          id: string
          idempotency_key: string | null
          is_read: boolean
          metadata_json: Json
          priority: string
          read_at: string | null
          template_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body: string
          category: string
          created_at?: string
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          is_read?: boolean
          metadata_json?: Json
          priority?: string
          read_at?: string | null
          template_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string
          category?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          is_read?: boolean
          metadata_json?: Json
          priority?: string
          read_at?: string | null
          template_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_onboarding: {
        Row: {
          attempt_band: string | null
          completed_at: string | null
          created_at: string
          daily_minutes: number | null
          exam_date: string | null
          skipped_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_band?: string | null
          completed_at?: string | null
          created_at?: string
          daily_minutes?: number | null
          exam_date?: string | null
          skipped_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_band?: string | null
          completed_at?: string | null
          created_at?: string
          daily_minutes?: number | null
          exam_date?: string | null
          skipped_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          adult_confirmed_at: string | null
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          language_preference: string
          leaderboard_opt_in: boolean
          phone: string | null
          profile_public: boolean
          updated_at: string
          username: string | null
          username_changed_at: string | null
        }
        Insert: {
          adult_confirmed_at?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          language_preference?: string
          leaderboard_opt_in?: boolean
          phone?: string | null
          profile_public?: boolean
          updated_at?: string
          username?: string | null
          username_changed_at?: string | null
        }
        Update: {
          adult_confirmed_at?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          language_preference?: string
          leaderboard_opt_in?: boolean
          phone?: string | null
          profile_public?: boolean
          updated_at?: string
          username?: string | null
          username_changed_at?: string | null
        }
        Relationships: []
      }
      user_question_bookmarks: {
        Row: {
          created_at: string
          folder_id: string | null
          id: string
          personal_note: string | null
          question_id: string
          question_version_id: string
          source_attempt_id: string | null
          tags_json: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          folder_id?: string | null
          id?: string
          personal_note?: string | null
          question_id: string
          question_version_id: string
          source_attempt_id?: string | null
          tags_json?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          folder_id?: string | null
          id?: string
          personal_note?: string | null
          question_id?: string
          question_version_id?: string
          source_attempt_id?: string | null
          tags_json?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_uqb_question_version_pair"
            columns: ["question_version_id", "question_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id", "question_id"]
          },
          {
            foreignKeyName: "user_question_bookmarks_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "user_bookmark_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_question_bookmarks_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_question_bookmarks_source_attempt_id_fkey"
            columns: ["source_attempt_id"]
            isOneToOne: false
            referencedRelation: "test_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_search_history: {
        Row: {
          clicked_entity_type: string | null
          clicked_source_id: string | null
          id: string
          query_text: string
          result_count: number
          searched_at: string
          user_id: string
        }
        Insert: {
          clicked_entity_type?: string | null
          clicked_source_id?: string | null
          id?: string
          query_text: string
          result_count?: number
          searched_at?: string
          user_id: string
        }
        Update: {
          clicked_entity_type?: string | null
          clicked_source_id?: string | null
          id?: string
          query_text?: string
          result_count?: number
          searched_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_streaks: {
        Row: {
          created_at: string
          current_streak: number
          freezes_consumed_count: number
          is_frozen: boolean
          last_freeze_used_date: string | null
          last_qualifying_date: string | null
          longest_streak: number
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_streak?: number
          freezes_consumed_count?: number
          is_frozen?: boolean
          last_freeze_used_date?: string | null
          last_qualifying_date?: string | null
          longest_streak?: number
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_streak?: number
          freezes_consumed_count?: number
          is_frozen?: boolean
          last_freeze_used_date?: string | null
          last_qualifying_date?: string | null
          longest_streak?: number
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_study_plans: {
        Row: {
          allocated_minutes: number
          completed_minutes: number
          created_at: string
          id: string
          is_auto_generated: boolean
          notes: string | null
          plan_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allocated_minutes?: number
          completed_minutes?: number
          created_at?: string
          id?: string
          is_auto_generated?: boolean
          notes?: string | null
          plan_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allocated_minutes?: number
          completed_minutes?: number
          created_at?: string
          id?: string
          is_auto_generated?: boolean
          notes?: string | null
          plan_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_topic_mastery: {
        Row: {
          algorithm_version: string
          canonical_topic_id: string
          canonical_topic_id_node_type: string | null
          confidence_factor: number
          coverage_factor: number
          created_at: string
          id: string
          last_practiced_at: string | null
          last_recalculated_at: string
          mastery_score: number
          memory_stability_days: number
          recency_factor: number
          total_correct_count: number
          total_exposure_count: number
          total_incorrect_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          algorithm_version?: string
          canonical_topic_id: string
          canonical_topic_id_node_type?: string | null
          confidence_factor?: number
          coverage_factor?: number
          created_at?: string
          id?: string
          last_practiced_at?: string | null
          last_recalculated_at?: string
          mastery_score?: number
          memory_stability_days?: number
          recency_factor?: number
          total_correct_count?: number
          total_exposure_count?: number
          total_incorrect_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          algorithm_version?: string
          canonical_topic_id?: string
          canonical_topic_id_node_type?: string | null
          confidence_factor?: number
          coverage_factor?: number
          created_at?: string
          id?: string
          last_practiced_at?: string | null
          last_recalculated_at?: string
          mastery_score?: number
          memory_stability_days?: number
          recency_factor?: number
          total_correct_count?: number
          total_exposure_count?: number
          total_incorrect_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_topic_mastery_canonical_topic_id_node_fkey"
            columns: ["canonical_topic_id", "canonical_topic_id_node_type"]
            isOneToOne: false
            referencedRelation: "canonical_taxonomy_nodes"
            referencedColumns: ["id", "node_type"]
          },
        ]
      }
      username_blocklist: {
        Row: {
          kind: string
          term: string
        }
        Insert: {
          kind: string
          term: string
        }
        Update: {
          kind?: string
          term?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fn_authorize_and_start_test_attempt: {
        Args: { p_mock_test_id: string; p_user_id: string }
        Returns: Json
      }
      fn_award_gamification_reward: {
        Args: {
          p_calculated_coins: number
          p_event_type: string
          p_idempotency_key: string
          p_metadata?: Json
          p_reason_code?: string
          p_source_id: string
          p_source_type: string
          p_user_id: string
        }
        Returns: Json
      }
      fn_can_evaluate_submission: {
        Args: { p_submission_id: string; p_user_id: string }
        Returns: boolean
      }
      fn_check_practice_answer: {
        Args: {
          p_mode: string
          p_question_version_id: string
          p_selected_option_key: string
          p_set_id: string
          p_time_taken_ms: number
        }
        Returns: Json
      }
      fn_check_premium_access_and_quota: {
        Args: { p_exam_id?: string; p_test_type?: string; p_user_id: string }
        Returns: Json
      }
      fn_claim_reward_item: {
        Args: {
          p_idempotency_key: string
          p_reward_id: string
          p_shipping_address?: string
          p_shipping_city?: string
          p_shipping_name?: string
          p_shipping_phone?: string
          p_shipping_pincode?: string
          p_shipping_state?: string
          p_user_id: string
        }
        Returns: Json
      }
      fn_clear_user_search_history: { Args: never; Returns: Json }
      fn_complete_course_lesson: {
        Args: { p_lesson_id: string }
        Returns: Json
      }
      fn_complete_deck_review_session: {
        Args: { p_deck_id: string }
        Returns: Json
      }
      fn_complete_diagnostic_assessment: {
        Args: { p_attempt_id: string }
        Returns: Json
      }
      fn_create_batch_assignment: {
        Args: {
          p_assignment_type: string
          p_batch_id: string
          p_content_id: string
          p_due_at?: string
          p_instructions_md?: string
          p_title: string
        }
        Returns: Json
      }
      fn_create_custom_flashcard_deck: {
        Args: {
          p_cards?: Json
          p_description?: string
          p_title: string
          p_topic_id?: string
        }
        Returns: Json
      }
      fn_create_discussion_thread: {
        Args: {
          p_context_id: string
          p_context_type: string
          p_initial_content: string
          p_title: string
        }
        Returns: Json
      }
      fn_create_dynamic_mock_instance_atomic: {
        Args: {
          p_duration_minutes: number
          p_exam_id: string
          p_marks_per_question: number
          p_metadata: Json
          p_negative_mark: number
          p_questions: Json
          p_quota_key: string
          p_slug: string
          p_template_id: string
          p_test_type: string
          p_title: string
          p_ttl_hours?: number
          p_user_id: string
        }
        Returns: Json
      }
      fn_create_payment_order: {
        Args: {
          p_coupon_code?: string
          p_course_id?: string
          p_gateway?: string
          p_idempotency_key?: string
          p_order_type: string
          p_plan_id?: string
        }
        Returns: Json
      }
      fn_create_question_revision: {
        Args: { p_actor: string; p_payload: Json; p_question_id: string }
        Returns: Json
      }
      fn_create_support_ticket: {
        Args: { p_category: string; p_message: string; p_subject: string }
        Returns: Json
      }
      fn_delete_exam_controlled: {
        Args: {
          p_actor_email?: string
          p_actor_id?: string
          p_exam_id: string
          p_reason?: string
          p_slug: string
        }
        Returns: Json
      }
      fn_edit_discussion_message: {
        Args: { p_content_markdown: string; p_message_id: string }
        Returns: Json
      }
      fn_enroll_batch_student: {
        Args: { p_batch_id: string; p_role?: string; p_student_user_id: string }
        Returns: Json
      }
      fn_evaluate_descriptive_submission: {
        Args: {
          p_evaluator_type?: string
          p_model_comparison?: string
          p_rubric_scores: Json
          p_strengths?: string
          p_submission_id: string
          p_suggestions?: string
          p_total_score: number
          p_weaknesses?: string
        }
        Returns: Json
      }
      fn_exam_syllabus_read_model: {
        Args: { p_exam_cycle_id?: string; p_exam_id: string }
        Returns: Json
      }
      fn_finalize_battle_room: { Args: { p_room_id: string }; Returns: Json }
      fn_find_or_create_battle_room:
        | {
            Args: { p_is_private?: boolean; p_topic_id?: string }
            Returns: Json
          }
        | {
            Args: {
              p_access_tier?: string
              p_is_private?: boolean
              p_topic_id?: string
            }
            Returns: Json
          }
      fn_flag_discussion_content: {
        Args: {
          p_details?: string
          p_reason: string
          p_target_id: string
          p_target_type: string
        }
        Returns: Json
      }
      fn_generate_custom_practice_session: {
        Args: {
          p_manual_question_ids?: string[]
          p_question_count?: number
          p_session_mode: string
          p_title: string
          p_topic_ids?: string[]
        }
        Returns: Json
      }
      fn_generate_daily_recommendations: {
        Args: { p_date?: string; p_engine_version?: string; p_user_id?: string }
        Returns: Json
      }
      fn_generate_mistake_drill: {
        Args: {
          p_cognitive_type_id?: string
          p_topic_id?: string
          p_vault_ids: string[]
        }
        Returns: Json
      }
      fn_get_active_battle_round: { Args: { p_room_id: string }; Returns: Json }
      fn_get_batch_assignment_progress: {
        Args: { p_assignment_id: string }
        Returns: Json
      }
      fn_get_due_flashcards: {
        Args: { p_deck_id?: string; p_limit?: number }
        Returns: {
          back_markdown_en: string
          back_markdown_hi: string
          card_id: string
          card_order: number
          deck_id: string
          ease_factor: number
          explanation: string
          front_markdown_en: string
          front_markdown_hi: string
          hint: string
          interval_days: number
          is_new: boolean
          latex_formulas: string[]
          mnemonic_en: string
          mnemonic_hi: string
          next_review_due_at: string
          repetition_level: number
        }[]
      }
      fn_get_my_onboarding: { Args: never; Returns: Json }
      fn_has_batch_faculty_access: {
        Args: { p_batch_id: string; p_user_id: string }
        Returns: boolean
      }
      fn_import_question_drafts: {
        Args: { p_actor: string; p_batch: Json }
        Returns: Json
      }
      fn_is_batch_member: {
        Args: { p_batch_id: string; p_roles?: string[]; p_user_id: string }
        Returns: boolean
      }
      fn_is_battle_participant: {
        Args: { p_room_id: string; p_user_id: string }
        Returns: boolean
      }
      fn_is_institute_member: {
        Args: { p_institute_id: string; p_roles?: string[]; p_user_id: string }
        Returns: boolean
      }
      fn_join_battle_by_code: { Args: { p_room_code: string }; Returns: Json }
      fn_jwt_is_admin: { Args: never; Returns: boolean }
      fn_jwt_is_admin_or_staff: { Args: never; Returns: boolean }
      fn_log_user_search: {
        Args: {
          p_clicked_entity_type?: string
          p_clicked_source_id?: string
          p_is_zero_result?: boolean
          p_latency_ms?: number
          p_query: string
          p_result_count?: number
        }
        Returns: Json
      }
      fn_mark_accepted_answer: {
        Args: { p_message_id: string; p_thread_id: string }
        Returns: Json
      }
      fn_mark_notification_as_read: {
        Args: { p_notification_id: string }
        Returns: Json
      }
      fn_memory_lock_add: { Args: { p_question_id: string }; Returns: Json }
      fn_memory_lock_answer: {
        Args: {
          p_question_version_id: string
          p_selected_option_key: string
          p_session_id: string
          p_time_taken_ms: number
        }
        Returns: Json
      }
      fn_ml_day_start: { Args: { p_day: string }; Returns: string }
      fn_ml_ist_today: { Args: never; Returns: string }
      fn_ml_next_step: { Args: { p_interval: number }; Returns: number }
      fn_moderate_flagged_content: {
        Args: {
          p_flag_id: string
          p_moderator_note?: string
          p_resolution_action: string
        }
        Returns: Json
      }
      fn_override_mistake_cognitive_type: {
        Args: { p_user_override_type_id: string; p_vault_id: string }
        Returns: Json
      }
      fn_post_discussion_message: {
        Args: {
          p_content_markdown: string
          p_parent_message_id?: string
          p_thread_id: string
        }
        Returns: Json
      }
      fn_process_payment_webhook: {
        Args: {
          p_event_type: string
          p_gateway: string
          p_gateway_event_id: string
          p_payload: Json
          p_signature_verified: boolean
        }
        Returns: Json
      }
      fn_publish_exam_announcement: {
        Args: {
          p_announcement_type: string
          p_exam_cycle_id: string
          p_exam_id: string
          p_priority?: string
          p_source_url?: string
          p_summary: string
          p_title: string
        }
        Returns: Json
      }
      fn_publish_question_version: {
        Args: { p_actor: string; p_version_id: string }
        Returns: Json
      }
      fn_qf_assert_item_shape: {
        Args: { p_item: Json; p_label: string }
        Returns: undefined
      }
      fn_qf_assert_version_publishable: {
        Args: { p_version_id: string }
        Returns: undefined
      }
      fn_qf_find_exact_duplicates: {
        Args: {
          p_exclude_question_id?: string
          p_stems: string[]
          p_topic_id: string
        }
        Returns: Json
      }
      fn_qf_version_is_servable: {
        Args: { p_version_id: string }
        Returns: boolean
      }
      fn_qf_version_key_problem: {
        Args: { p_version_id: string }
        Returns: string
      }
      fn_question_stem_checksum: { Args: { p_stem: string }; Returns: string }
      fn_recompute_mistake_profile: {
        Args: { p_question_id: string; p_user_id: string }
        Returns: Json
      }
      fn_reconcile_search_indexes: { Args: never; Returns: Json }
      fn_record_mistake_occurrence: {
        Args: {
          p_attempt_answer_id?: string
          p_cognitive_type_id?: string
          p_confidence_pct?: number
          p_question_id: string
          p_question_version_id?: string
          p_response_time_seconds?: number
          p_selected_option_id?: string
          p_source_context: string
          p_source_reference_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      fn_record_proctor_event: {
        Args: {
          p_attempt_id: string
          p_client_seq: number
          p_event_type: string
        }
        Returns: Json
      }
      fn_record_qualifying_streak_activity: {
        Args: {
          p_action_type: string
          p_duration_seconds?: number
          p_source_id: string
          p_timezone?: string
          p_user_id: string
        }
        Returns: Json
      }
      fn_report_question: {
        Args: {
          p_note: string
          p_question_id: string
          p_question_version_id: string
          p_reason: string
        }
        Returns: Json
      }
      fn_resolve_errata_report: {
        Args: {
          p_bounty_coins?: number
          p_report_id: string
          p_resolution_notes?: string
          p_resolution_status: string
        }
        Returns: Json
      }
      fn_resolve_quota_key: { Args: { p_test_type: string }; Returns: string }
      fn_reverse_reward_claim: {
        Args: { p_admin_id: string; p_claim_id: string; p_reason?: string }
        Returns: Json
      }
      fn_revoke_mistakes_by_errata: {
        Args: {
          p_actor_id?: string
          p_corrected_option_id: string
          p_question_version_id: string
          p_reason: string
        }
        Returns: Json
      }
      fn_save_onboarding: {
        Args: {
          p_action: string
          p_attempt?: string
          p_daily_minutes?: number
          p_exam_date?: string
          p_exam_ids?: string[]
          p_language?: string
          p_remove_exam_ids?: string[]
        }
        Returns: Json
      }
      fn_send_user_notification: {
        Args: {
          p_action_url?: string
          p_body?: string
          p_category?: string
          p_idempotency_key?: string
          p_metadata?: Json
          p_priority?: string
          p_template_code?: string
          p_title?: string
          p_user_id: string
          p_variables?: Json
        }
        Returns: Json
      }
      fn_set_leaderboard_opt_in: { Args: { p_opt_in: boolean }; Returns: Json }
      fn_set_profile_visibility: {
        Args: { p_confirm_adult: boolean; p_public: boolean }
        Returns: Json
      }
      fn_set_username: { Args: { p_username: string }; Returns: Json }
      fn_start_custom_practice_session: {
        Args: { p_session_id: string }
        Returns: Json
      }
      fn_submit_battle_round_answer: {
        Args: {
          p_room_id: string
          p_round_number: number
          p_selected_option_id: string
        }
        Returns: Json
      }
      fn_submit_descriptive_answer: {
        Args: {
          p_answer_text?: string
          p_assignment_id?: string
          p_attachment_url?: string
          p_batch_id?: string
          p_question_id: string
          p_submission_type?: string
        }
        Returns: Json
      }
      fn_submit_flashcard_review: {
        Args: { p_card_id: string; p_rating: number }
        Returns: Json
      }
      fn_submit_mistake_drill: {
        Args: { p_answers: Json; p_drill_id: string }
        Returns: Json
      }
      fn_syllabus__assert_role: {
        Args: { p_admin_only: boolean }
        Returns: undefined
      }
      fn_syllabus__audit: {
        Args: {
          p_action: string
          p_entity: string
          p_new: Json
          p_old: Json
          p_target: string
        }
        Returns: undefined
      }
      fn_syllabus__create_version: {
        Args: {
          p_exam_cycle_id: string
          p_exam_id: string
          p_metadata: Json
          p_payload_hash: string
          p_source_kind: string
          p_supersedes: string
          p_version_tag: string
        }
        Returns: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          exam_cycle_id: string | null
          exam_id: string
          id: string
          is_active: boolean
          metadata: Json
          published_at: string | null
          published_by: string | null
          raw_payload_hash: string | null
          source_document_id: string | null
          source_kind: string
          status: string
          supersedes_version_id: string | null
          updated_at: string
          version_number: number
          version_tag: string
        }
        SetofOptions: {
          from: "*"
          to: "exam_syllabus_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_syllabus__import_check_node: {
        Args: { p_index: number; p_level: string; p_obj: Json; p_path: string }
        Returns: string
      }
      fn_syllabus__import_count: {
        Args: { p_key: string; p_obj: Json; p_path: string }
        Returns: number
      }
      fn_syllabus__import_fail: {
        Args: { p_code: string; p_message: string; p_path: string }
        Returns: undefined
      }
      fn_syllabus__import_is_plain: {
        Args: { p_text: string }
        Returns: boolean
      }
      fn_syllabus__import_list: {
        Args: { p_key: string; p_obj: Json; p_path: string }
        Returns: Json
      }
      fn_syllabus__import_text: {
        Args: {
          p_key: string
          p_max: number
          p_obj: Json
          p_path: string
          p_required: boolean
        }
        Returns: string
      }
      fn_syllabus__insert_node: {
        Args: {
          p_description: string
          p_kind: string
          p_mandatory: boolean
          p_max: number
          p_min: number
          p_order: number
          p_parent: string
          p_slug: string
          p_tier: string
          p_title: string
          p_version_id: string
        }
        Returns: string
      }
      fn_syllabus__lock_version: {
        Args: { p_version_id: string }
        Returns: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          exam_cycle_id: string | null
          exam_id: string
          id: string
          is_active: boolean
          metadata: Json
          published_at: string | null
          published_by: string | null
          raw_payload_hash: string | null
          source_document_id: string | null
          source_kind: string
          status: string
          supersedes_version_id: string | null
          updated_at: string
          version_number: number
          version_tag: string
        }
        SetofOptions: {
          from: "*"
          to: "exam_syllabus_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_syllabus__require_draft: {
        Args: { p_version_id: string }
        Returns: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          exam_cycle_id: string | null
          exam_id: string
          id: string
          is_active: boolean
          metadata: Json
          published_at: string | null
          published_by: string | null
          raw_payload_hash: string | null
          source_document_id: string | null
          source_kind: string
          status: string
          supersedes_version_id: string | null
          updated_at: string
          version_number: number
          version_tag: string
        }
        SetofOptions: {
          from: "*"
          to: "exam_syllabus_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_syllabus__slugify: { Args: { p_text: string }; Returns: string }
      fn_syllabus__validate: { Args: { p_version_id: string }; Returns: Json }
      fn_syllabus_archive_version: {
        Args: { p_version_id: string }
        Returns: Json
      }
      fn_syllabus_create_draft: {
        Args: {
          p_exam_cycle_id?: string
          p_exam_id: string
          p_from_version_id?: string
          p_version_tag?: string
        }
        Returns: Json
      }
      fn_syllabus_delete_node: { Args: { p_node_id: string }; Returns: Json }
      fn_syllabus_import_draft: {
        Args: { p_exam_id: string; p_payload: Json }
        Returns: Json
      }
      fn_syllabus_move_node: {
        Args: {
          p_display_order?: number
          p_new_parent_id: string
          p_node_id: string
        }
        Returns: Json
      }
      fn_syllabus_publish: { Args: { p_version_id: string }; Returns: Json }
      fn_syllabus_seed_cgl_pattern_skeleton: { Args: never; Returns: Json }
      fn_syllabus_seed_legacy_gd_draft: { Args: never; Returns: Json }
      fn_syllabus_set_unit_mappings: {
        Args: { p_node_id: string; p_topic_ids: string[]; p_weights?: number[] }
        Returns: Json
      }
      fn_syllabus_upsert_node: {
        Args: { p_node: Json; p_version_id: string }
        Returns: Json
      }
      fn_syllabus_validate: { Args: { p_version_id: string }; Returns: Json }
      fn_transition_question_version: {
        Args: {
          p_actor: string
          p_checklist?: Json
          p_notes?: string
          p_to: string
          p_version_id: string
        }
        Returns: Json
      }
      fn_universal_search: {
        Args: {
          p_access_tier?: string
          p_entity_types?: string[]
          p_exam_id?: string
          p_limit?: number
          p_offset?: number
          p_query: string
          p_topic_id?: string
        }
        Returns: Json
      }
      fn_update_daily_recommendation_status: {
        Args: { p_recommendation_id: string; p_status: string }
        Returns: Json
      }
      fn_update_lesson_playback_position: {
        Args: {
          p_elapsed_real_seconds?: number
          p_lesson_id: string
          p_position_seconds: number
        }
        Returns: Json
      }
      fn_update_question_draft: {
        Args: { p_actor: string; p_payload: Json; p_version_id: string }
        Returns: Json
      }
      fn_update_spaced_repetition_review: {
        Args: {
          p_quality?: number
          p_question_id?: string
          p_topic_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      fn_verify_and_fulfill_payment: {
        Args: {
          p_amount?: number
          p_billing_address?: string
          p_billing_name?: string
          p_billing_state?: string
          p_gateway_payment_id: string
          p_gateway_signature: string
          p_order_id: string
          p_payment_method?: string
        }
        Returns: Json
      }
      fn_verify_faculty_answer: {
        Args: { p_is_verified: boolean; p_message_id: string }
        Returns: Json
      }
      fn_vote_discussion_message: {
        Args: { p_message_id: string; p_vote_action: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      proctor_event_type:
        | "tab_hidden"
        | "tab_visible"
        | "fullscreen_exit"
        | "fullscreen_enter"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      proctor_event_type: [
        "tab_hidden",
        "tab_visible",
        "fullscreen_exit",
        "fullscreen_enter",
      ],
    },
  },
} as const
